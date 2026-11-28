-- Batas waktu perbaikan "Berkas Tidak Lengkap" diundur dari 2026-11-30 ke 2026-12-11 (2026-11-28, atas permintaan Admin Utama).
-- Berlaku sampai 11 Desember 2026 pukul 23.59 WIB (kolom bertipe date; penolakan otomatis mulai 01.00 WIB 12 Desember, lihat cekBatasWaktuVerifikasi).
--
-- Menyamakan DATA YANG SUDAH ADA dengan konstanta BATAS_PERBAIKAN_SERAGAM (config.ts) yang kini "2026-12-11". SUDAH diterapkan ke produksi
-- 2026-11-28; berkas ini = salinan untuk repo. Hanya menyentuh baris berstatus BTL yang batasnya masih tepat 2026-11-30; idempotent.
-- Data yang diverifikasi BTL SESUDAH deploy kode baru sudah otomatis berbatas 2026-12-11. Bila ada yang masih 2026-11-30 (diverifikasi saat
-- server lama masih tayang), jalankan ulang berkas ini.
-- Mengembalikan:  update public.penerima set batas_waktu_perbaikan = date '2026-11-30' where tahun = 2027 and status_verifikasi = 'Berkas Tidak Lengkap' and batas_waktu_perbaikan = date '2026-12-11';

update public.penerima
set batas_waktu_perbaikan = date '2026-12-11'
where tahun = 2027 and status_verifikasi = 'Berkas Tidak Lengkap' and batas_waktu_perbaikan = date '2026-11-30';
