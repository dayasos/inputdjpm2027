-- Pemeriksa koordinat lokasi mengajar Guru Maghrib Mengaji (Tahap A: tabel hasil + jadwal; belum ada penolakan).
--
-- Tabel BARU (tidak menyentuh tabel lama dan tidak mengubah data apa pun):
--   cek_koordinat   satu baris per penerima: hasil penilaian tautan koordinat (VALID / TIDAK_VALID / BELUM_DICEK), kode alasan, alamat tujuan tautan pendek.
--                   Kolom `tautan` menyimpan tautan yang dinilai; bila tautan penerima berubah, hasil lama dianggap basi dan dinilai ulang.
-- Jadwal: pg_cron tiap 5 menit memanggil aksi jalur _secret `jalankanCekKoordinatOtomatis` (rahasia dari Vault, pola sinkron 2026 dan pembagian awal).
--         Pekerjaan hanya berjalan bila ada data yang belum dinilai/basi; bila tidak ada, aksi selesai dengan satu kueri ringan.
--
-- AMAN & IDEMPOTEN: create ... if not exists. Akses hanya lewat Edge Function (peran postgres): RLS aktif tanpa policy + hak anon/authenticated dicabut.
-- Membatalkan: select cron.unschedule('cek-koordinat-gmm');  (tabel boleh dibiarkan; tidak dipakai bila fungsi lama dipasang kembali)

create table if not exists public.cek_koordinat (
  penerima_id bigint           not null,
  tahun       integer          not null,
  tautan      text             not null,
  hasil       text             not null check (hasil in ('VALID', 'TIDAK_VALID', 'BELUM_DICEK')),
  alasan      text             not null default '',
  tujuan      text             not null default '',
  lat         double precision,
  lng         double precision,
  dicek_pada  timestamptz      not null default now(),
  primary key (penerima_id, tahun)
);
create index if not exists cek_koordinat_tautan on public.cek_koordinat (tautan);
create index if not exists cek_koordinat_hasil on public.cek_koordinat (tahun, hasil);

alter table public.cek_koordinat enable row level security;
revoke all on table public.cek_koordinat from anon, authenticated;

do $$
begin
  perform cron.unschedule('cek-koordinat-gmm');
exception when others then null;
end $$;

select
  cron.schedule(
    'cek-koordinat-gmm',
    '*/5 * * * *',
    $$
    select net.http_post(
      url := 'https://wwqxbscumaakvziwzwjx.supabase.co/functions/v1/api',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'action', 'jalankanCekKoordinatOtomatis',
        '_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_worker_secret' limit 1),
        'args', jsonb_build_array()
      ),
      timeout_milliseconds := 55000
    );
    $$
  );
