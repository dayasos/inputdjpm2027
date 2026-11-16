-- Verifikasi Awal dibagi rata otomatis (plans/plan-verifikasi-awal-bagi-rata.md, tahap T1).
--
-- Tabel BARU (tidak menyentuh tabel lama dan tidak mengubah data apa pun):
--   tugas_verifikasi_awal     satu data untuk satu verifikator; status AKTIF -> SELESAI (hasil diberikan verifikator) atau DITUTUP (data keluar dari
--                             "Proses Verifikasi" lewat jalur lain, mis. Admin). Tidak ada pengembalian/pengalihan (keputusan user 2026-11-16).
--   sapuan_pembagian_awal     log setiap penyisiran pembagian (waktu, jenis, benih, jumlah, ringkasan per akun)
--   pembagian_awal_akun       titik awal jumlah per akun (jumlah Verifikasi Awal historis saat fitur dinyalakan; akun baru mulai dari yang terkecil)
-- Saklar: setelan.verif_awal_aktif ('0' = MATI, bawaan; '1' = NYALA). Mati = verifikator memilih sendiri seperti sebelumnya.
-- Jadwal: pg_cron tiap 10 menit memanggil aksi jalur _secret `jalankanPembagianAwalOtomatis` (rahasia dari Vault, pola sinkron 2026).
--         Saat saklar MATI aksi itu langsung berhenti (satu pembacaan setelan).
--
-- AMAN & IDEMPOTEN: create ... if not exists. Akses hanya lewat Edge Function (peran postgres):
-- RLS aktif tanpa policy + hak anon/authenticated dicabut (pola yang sama dengan tugas_verifikasi_ulang).
-- Membatalkan: update setelan set value = '0' where key = 'verif_awal_aktif';  (dan, bila perlu, select cron.unschedule('bagi-verifikasi-awal');)

create table if not exists public.sapuan_pembagian_awal (
  id          bigint generated always as identity primary key,
  waktu       timestamptz not null default now(),
  jenis       text        not null check (jenis in ('OTOMATIS', 'MANUAL', 'MULAI', 'MATI')),
  oleh        text        not null default '',
  benih       text        not null default '',
  dibagi      int         not null default 0,
  ditutup     int         not null default 0,
  ringkasan   jsonb       not null default '{}'::jsonb      -- per akun: {username: jumlah baru}; diisi dengan trx.json (bukan JSON.stringify::jsonb)
);

create table if not exists public.tugas_verifikasi_awal (
  id               bigint generated always as identity primary key,
  penerima_id      bigint      not null,
  tahun            integer     not null,
  akun_id          uuid        not null references public.akun(id),
  layanan          text        not null default '',
  ditugaskan_pada  timestamptz not null default now(),
  status           text        not null default 'AKTIF' check (status in ('AKTIF', 'SELESAI', 'DITUTUP')),
  selesai_pada     timestamptz,
  hasil_status     text,                                          -- status yang diberikan verifikator (bila SELESAI)
  alasan_tutup     text,                                          -- bila DITUTUP
  sapuan_id        bigint references public.sapuan_pembagian_awal(id)
);
-- Satu tugas AKTIF per data (penjaga konkurensi pembagian)
create unique index if not exists tugas_verifikasi_awal_satu_aktif on public.tugas_verifikasi_awal (penerima_id, tahun) where status = 'AKTIF';
create index if not exists tugas_verifikasi_awal_akun on public.tugas_verifikasi_awal (akun_id, status);

create table if not exists public.pembagian_awal_akun (
  akun_id   uuid primary key references public.akun(id),
  dasar     int         not null default 0,
  dicatat   timestamptz not null default now(),
  keterangan text       not null default ''
);

-- Pagar: tugas yang sudah SELESAI/DITUTUP tidak boleh diubah atau dihapus; tugas AKTIF hanya boleh menjadi SELESAI/DITUTUP; data dan pemilik tak boleh diganti.
create or replace function public.tugas_verifikasi_awal_jaga() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'AKTIF' then
      raise exception 'tugas verifikasi awal yang sudah selesai/ditutup tidak boleh dihapus';
    end if;
    return old;
  end if;
  if old.status <> 'AKTIF' then
    raise exception 'tugas verifikasi awal yang sudah selesai/ditutup tidak boleh diubah';
  end if;
  if new.penerima_id <> old.penerima_id or new.tahun <> old.tahun or new.akun_id <> old.akun_id then
    raise exception 'data dan pemilik suatu tugas verifikasi awal tidak boleh diganti';
  end if;
  return new;
end;
$$;
drop trigger if exists tugas_verifikasi_awal_jaga on public.tugas_verifikasi_awal;
create trigger tugas_verifikasi_awal_jaga
  before update or delete on public.tugas_verifikasi_awal
  for each row execute function public.tugas_verifikasi_awal_jaga();

alter table public.sapuan_pembagian_awal enable row level security;
alter table public.tugas_verifikasi_awal enable row level security;
alter table public.pembagian_awal_akun   enable row level security;
revoke all on table public.sapuan_pembagian_awal, public.tugas_verifikasi_awal, public.pembagian_awal_akun from anon, authenticated;

-- Saklar bawaan MATI
insert into public.setelan (key, value) values ('verif_awal_aktif', '0') on conflict (key) do nothing;

-- Jadwal tiap 10 menit (zona pg_cron = UTC; tidak berpengaruh). Rahasia dari Vault.
do $$
begin
  perform cron.unschedule('bagi-verifikasi-awal');
exception when others then null;
end $$;

select
  cron.schedule(
    'bagi-verifikasi-awal',
    '*/10 * * * *',
    $$
    select net.http_post(
      url := 'https://wwqxbscumaakvziwzwjx.supabase.co/functions/v1/api',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'action', 'jalankanPembagianAwalOtomatis',
        '_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_worker_secret' limit 1),
        'args', jsonb_build_array()
      ),
      timeout_milliseconds := 30000
    );
    $$
  );
