-- Pengecualian NIK arsip tahun lalu (2026-11-18).
--
-- Latar: aplikasi menolak input 2027 untuk NIK yang di arsip tahun lalu berstatus selain AKTIF (HASIL MONEV, dll.; _shared/cekNik.ts).
-- Data 2026 bersumber dari sheet db_2026 (disinkronkan tiap 10 menit, menimpa status) dan menyangkut pembayaran 2026, jadi statusnya
-- TIDAK diubah. Untuk kasus tertentu yang sah, NIK didaftarkan di sini: ia boleh diinput di tahun aktif, sedangkan data 2026-nya tetap.
--
-- Pengecualian berlaku per (NIK, tahun arsip): hanya menghapus penolakan "status arsip bukan AKTIF". Pemeriksaan lain (Capil / domisili
-- luar Kota Medan, NIK ganda di tahun aktif, dst.) tetap berlaku. Menambah/mencabut cukup lewat SQL, tanpa deploy.
--
-- AMAN & IDEMPOTEN. Tabel baru; tidak menyentuh tabel lain. RLS aktif tanpa policy + hak anon/authenticated dicabut (pola tabel lain).
-- URUTAN RILIS: terapkan migrasi ini SEBELUM men-deploy Edge Function (kode memeriksa tabel ini; bila tabel belum ada, pengecualian
-- dianggap tidak ada, sehingga aman, hanya NIK itu masih ditolak).
-- Mencabut:  delete from public.nik_dikecualikan_arsip where nik = '<nik>';

create table if not exists public.nik_dikecualikan_arsip (
  nik         text    not null,
  tahun_arsip integer not null,
  alasan      text    not null default '',
  dibuat_oleh text    not null default '',
  dibuat_pada timestamptz not null default now(),
  primary key (nik, tahun_arsip)
);

alter table public.nik_dikecualikan_arsip enable row level security;
revoke all on table public.nik_dikecualikan_arsip from anon, authenticated;

insert into public.nik_dikecualikan_arsip (nik, tahun_arsip, alasan, dibuat_oleh) values
  ('1271064911860002', 2026, 'Atas permintaan Admin Utama 2026-11-18: boleh diinput 2027; status 2026 tidak diubah (menyangkut pembayaran 2026)', 'ADMIN UTAMA'),
  ('1271166812770001', 2026, 'Atas permintaan Admin Utama 2026-11-18: boleh diinput 2027; status 2026 tidak diubah (menyangkut pembayaran 2026)', 'ADMIN UTAMA')
on conflict (nik, tahun_arsip) do nothing;
