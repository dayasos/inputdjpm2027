-- Tarik SELURUH tugas Tahap 1 verifikasi ulang dan batalkan paketnya (2026-11-16), atas permintaan Admin: verifikasi ulang belum dimulai.
--
-- Perubahan data SUDAH diterapkan ke produksi (salinan agar repo sama dengan database).
-- Yang terjadi: 4.697 tugas yang belum selesai ditandai DITARIK (tidak dihapus; alasan tercatat), paket Tahap 1 berstatus DIBATALKAN.
-- 9 tugas yang sudah SELESAI tidak disentuh (pagar basis data melarang mengubahnya) dan tetap tercatat sebagai hasil verifikasi ulang.
-- Verifikator tidak lagi melihat tugas ulang; seluruh data yang dibebaskan kembali menjadi kolam paket berikutnya (kecuali yang sudah diperiksa ulang).
--
-- AMAN & IDEMPOTEN: hanya menyentuh tugas paket 1 yang belum selesai dan belum ditarik.
-- Membatalkan (mengaktifkan lagi Tahap 1; hanya untuk yang ditarik karena alasan ini):
--   update public.batch_verifikasi_ulang set status = 'AKTIF', catatan = '' where id = 1;
--   update public.tugas_verifikasi_ulang set ditarik_pada = null, ditarik_alasan = null
--   where batch_id = 1 and selesai_pada is null and ditarik_alasan = 'Tahap 1 ditarik seluruhnya atas permintaan Admin (verifikasi ulang belum dimulai)';

with tarik as (
  update public.tugas_verifikasi_ulang
  set ditarik_pada = now(), ditarik_alasan = 'Tahap 1 ditarik seluruhnya atas permintaan Admin (verifikasi ulang belum dimulai)'
  where batch_id = 1 and selesai_pada is null and ditarik_pada is null
  returning id),
bt as (
  update public.batch_verifikasi_ulang
  set status = 'DIBATALKAN', catatan = 'Ditarik seluruhnya atas permintaan Admin 2026-11-16: verifikasi ulang belum dimulai'
  where id = 1 and status = 'AKTIF'
  returning id)
select (select count(*) from tarik) as tugas_ditarik, (select count(*) from bt) as paket_dibatalkan;
