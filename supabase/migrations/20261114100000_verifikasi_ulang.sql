-- Verifikasi ulang data yang sudah terverifikasi (plans/plan-verifikasi-ulang.md, tahap T1).
--
-- Tabel BARU (tidak menyentuh tabel lama dan tidak mengubah data apa pun):
--   batch_verifikasi_ulang      satu kali pembagian tugas oleh Admin Utama ("paket tugas"); menyimpan benih acak, kriteria, daftar pemeriksa
--   tugas_verifikasi_ulang      satu data untuk satu pemeriksa; hasil SESUAI / DIKOREKSI; waktu selesai = waktu SERVER
--   pembatalan_koreksi_ulang    log pembatalan koreksi oleh Admin Utama
-- Riwayat memakai tabel yang sudah ada: riwayat_verifikasi dengan sumber = 'ULANG' (kolom sumber teks bebas, tanpa perubahan skema).
-- Aturan 1 data = 1 hitungan: unique (batch_id, penerima_id) dan hasil hanya boleh ditulis sekali per tugas (pemicu di bawah).
--
-- AMAN & IDEMPOTEN: create ... if not exists. Akses hanya lewat Edge Function (peran postgres):
-- RLS aktif tanpa policy + hak anon/authenticated dicabut (pola yang sama dengan riwayat_verifikasi).

create table if not exists public.batch_verifikasi_ulang (
  id             bigint generated always as identity primary key,
  nama           text        not null,
  dibuat_oleh    text        not null,
  dibuat_pada    timestamptz not null default now(),
  benih          text        not null,                         -- benih acak (dicatat agar pembagian dapat direproduksi/diaudit)
  kriteria       jsonb       not null,                         -- layanan, status, rentang tanggal, sertakan yang pernah diperiksa ulang
  pemeriksa      jsonb       not null,                         -- daftar username pemeriksa data MS (snapshot)
  pengecualian   jsonb       not null default '[]'::jsonb,     -- akun yang tidak boleh menerima tugas (snapshot; ditegakkan SERVER)
  akun_khusus    text,                                         -- pemeriksa khusus data BTL/TMS (verif_uga_deba); null bila tidak ada
  jumlah_tugas   int         not null default 0,
  batas_selesai  date,
  status         text        not null default 'AKTIF' check (status in ('AKTIF', 'SELESAI', 'DIBATALKAN')),
  catatan        text        not null default ''
);

create table if not exists public.tugas_verifikasi_ulang (
  id               bigint generated always as identity primary key,
  batch_id         bigint      not null references public.batch_verifikasi_ulang(id),
  penerima_id      bigint      not null,
  tahun            integer     not null,
  akun_id          uuid        not null references public.akun(id),          -- pemeriksa
  status_saat_dibagi text      not null default '',                          -- status data ketika dibagikan
  layanan          text        not null default '',                          -- snapshot (untuk cek ulang pembagian)
  pemverifikasi_awal text[]    not null default '{}',                         -- snapshot: siapa yang pernah memverifikasi data ini (dasar aturan V1)
  ditugaskan_pada  timestamptz not null default now(),
  dibuka_pada      timestamptz,                                              -- diisi SERVER saat pemeriksa pertama kali membuka detail
  berkas_dibuka    jsonb       not null default '[]'::jsonb,                 -- berkas yang SUDAH diklik pemeriksa (dicatat server)
  berkas_url       jsonb       not null default '{}'::jsonb,                 -- tautan setiap berkas SAAT diklik; klik tidak sah bila berkas diganti sesudahnya
  selesai_pada     timestamptz,                                              -- diisi SERVER saat hasil disimpan
  hasil            text check (hasil in ('SESUAI', 'DIKOREKSI')),
  status_sebelum   text,
  status_sesudah   text,                                                     -- pada DIKOREKSI; diterapkan server dalam transaksi yang sama
  alasan           text        not null default '',
  daftar_periksa   jsonb       not null default '{}'::jsonb,                 -- tanda per berkas: sesuai | bermasalah | tidak_ada
  ditarik_pada     timestamptz,                                              -- tugas ditarik otomatis (data berubah/dihapus sebelum diperiksa)
  ditarik_alasan   text,
  unique (batch_id, penerima_id)
);
create index if not exists idx_tugas_ulang_akun     on public.tugas_verifikasi_ulang (akun_id, selesai_pada);
create index if not exists idx_tugas_ulang_penerima on public.tugas_verifikasi_ulang (penerima_id, tahun);
create index if not exists idx_tugas_ulang_selesai  on public.tugas_verifikasi_ulang (selesai_pada) where selesai_pada is not null;

create table if not exists public.pembatalan_koreksi_ulang (
  tugas_id        bigint      primary key references public.tugas_verifikasi_ulang(id),
  dibatalkan_oleh text        not null,
  dibatalkan_pada timestamptz not null default now(),
  alasan          text        not null
);

-- Pagar: tugas yang sudah SELESAI tidak boleh diubah lagi atau dihapus (1 data = 1 hitungan; waktu selesai tidak bisa digeser).
-- Penarikan tugas (kolom ditarik_*) hanya untuk tugas yang BELUM selesai.
create or replace function public.tugas_verifikasi_ulang_jaga() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.selesai_pada is not null then
      raise exception 'tugas verifikasi ulang yang sudah selesai tidak boleh dihapus';
    end if;
    return old;
  end if;
  if old.selesai_pada is not null then
    raise exception 'tugas verifikasi ulang yang sudah selesai tidak boleh diubah';
  end if;
  if new.batch_id <> old.batch_id or new.penerima_id <> old.penerima_id or new.tahun <> old.tahun or new.akun_id <> old.akun_id then
    raise exception 'batch, data, dan pemeriksa suatu tugas tidak boleh diganti';
  end if;
  return new;
end;
$$;
drop trigger if exists tugas_verifikasi_ulang_jaga on public.tugas_verifikasi_ulang;
create trigger tugas_verifikasi_ulang_jaga
  before update or delete on public.tugas_verifikasi_ulang
  for each row execute function public.tugas_verifikasi_ulang_jaga();

alter table public.batch_verifikasi_ulang   enable row level security;
alter table public.tugas_verifikasi_ulang   enable row level security;
alter table public.pembatalan_koreksi_ulang enable row level security;
revoke all on table public.batch_verifikasi_ulang, public.tugas_verifikasi_ulang, public.pembatalan_koreksi_ulang from anon, authenticated;
revoke all on sequence public.batch_verifikasi_ulang_id_seq, public.tugas_verifikasi_ulang_id_seq from anon, authenticated;
