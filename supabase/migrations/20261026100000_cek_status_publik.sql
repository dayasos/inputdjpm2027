-- Cek Status Penerima untuk warga (NIK + tanggal lahir). Plan: plans/plan-cek-status-penerima-publik.md (bagian 7).
--
-- DUA tabel baru, tidak menyentuh tabel lama. AMAN & IDEMPOTEN (create ... if not exists / on conflict do nothing).
-- Akses hanya lewat Edge Function (peran postgres): RLS aktif tanpa policy + hak anon/authenticated dicabut,
-- pola yang sama dengan log_verifikasi_massal dan pesan_admin.
--
-- 1. cek_status_pengaturan : saklar on/off, SATU baris, BAWAAN MATI.
--    Sengaja BUKAN di tabel `setelan`: tabel itu punya trigger (trg_event_setelan) yang menyiarkan sinyal realtime ke
--    SEMUA browser petugas setiap ada perubahan, sehingga menghidupkan/mematikan saklar akan mengganggu petugas.
--    Cara menghidupkan (oleh pemelihara, lewat SQL Editor):
--      update public.cek_status_pengaturan set aktif = true,  diubah_at = now(), diubah_oleh = '<nama>';
--    Cara mematikan seketika:
--      update public.cek_status_pengaturan set aktif = false, diubah_at = now(), diubah_oleh = '<nama>';
--
-- 2. cek_status_percobaan : hitungan gagal per NIK. Kuncinya adalah HASH (sha256 dengan garam rahasia) dari NIK,
--    BUKAN NIK mentah, dan dicatat juga untuk NIK yang tidak ada (supaya penguncian tidak membocorkan keberadaan NIK).

create table if not exists public.cek_status_pengaturan (
  id          boolean     primary key default true check (id),   -- hanya boleh satu baris (id selalu true)
  aktif       boolean     not null default false,
  diubah_at   timestamptz not null default now(),
  diubah_oleh text        not null default ''
);

insert into public.cek_status_pengaturan (id, aktif) values (true, false) on conflict (id) do nothing;

create table if not exists public.cek_status_percobaan (
  kunci           text        primary key,                 -- 'nik:' || hex(sha256(garam || nik))
  jumlah_gagal    integer     not null default 0,
  jendela_mulai   timestamptz not null default now(),
  terkunci_sampai timestamptz
);

alter table public.cek_status_pengaturan enable row level security;
alter table public.cek_status_percobaan  enable row level security;

revoke all on table public.cek_status_pengaturan from anon, authenticated;
revoke all on table public.cek_status_percobaan  from anon, authenticated;

-- Pembersihan harian (pola sama dengan 'bersihkan-login-percobaan-gagal-lama'): baris yang jendelanya lebih dari 1 hari.
select
  cron.schedule(
    'bersihkan-cek-status-percobaan-lama',
    '30 * * * *',               -- tiap jam, menit ke-30
    $$ delete from public.cek_status_percobaan where jendela_mulai < now() - interval '1 day'; $$
  )
where not exists (
  select 1 from cron.job where jobname = 'bersihkan-cek-status-percobaan-lama'
);
