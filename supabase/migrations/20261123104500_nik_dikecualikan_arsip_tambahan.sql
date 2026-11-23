-- Pengecualian NIK arsip 2026: tambahan (2026-11-23). Mekanisme dan alasan: lihat 20261118140000_nik_dikecualikan_arsip.sql.
--
-- NIK 1271095106870006 (WULANDARI S, GMM, Medan Amplas; status 2026 "HASIL MONEV TAHUN 2026") boleh diinput di tahun aktif atas permintaan
-- Admin Utama. Status data 2026 TIDAK diubah (data 2026 bersumber dari sheet db_2026 dan menyangkut pembayaran 2026).
-- SUDAH diterapkan ke produksi 2026-11-23 (satu baris); berkas ini = salinan untuk repo. Idempotent. Tidak perlu deploy (kode sudah tayang).
-- Mencabut:  delete from public.nik_dikecualikan_arsip where nik = '1271095106870006';

insert into public.nik_dikecualikan_arsip (nik, tahun_arsip, alasan, dibuat_oleh) values
  ('1271095106870006', 2026, 'Atas permintaan Admin Utama 2026-11-23: boleh diinput 2027; status 2026 tidak diubah (menyangkut pembayaran 2026)', 'ADMIN UTAMA')
on conflict (nik, tahun_arsip) do nothing;
