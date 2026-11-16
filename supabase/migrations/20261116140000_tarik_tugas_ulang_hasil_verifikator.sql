-- Tarik tugas verifikasi ulang (Tahap 1) yang datanya HASIL VERIFIKASI PETUGAS VERIFIKATOR (2026-11-16).
--
-- Aturan V12: verifikasi ulang hanya untuk data yang BUKAN hasil verifikasi petugas verifikator (yaitu hasil Admin, termasuk verifikasi massal sebelum tim ada).
-- Tahap 1 dibuat 14 Nov sebelum aturan ini ada, sehingga memuat data hasil verifikator. Perubahan data SUDAH diterapkan ke produksi (salinan agar repo sama dengan database):
-- 385 tugas yang BELUM selesai dan BELUM pernah dibuka petugas ditandai ditarik (tidak dihapus; tercatat alasan). Tugas selesai tidak disentuh.
--
-- Data hasil verifikator = pemverifikasi terakhir (kolom diverifikasi_oleh) berawalan VERIF_  ATAU pernah ada hasil pertama (riwayat_verifikasi sumber SATU) oleh akun VERIF_.
-- AMAN & IDEMPOTEN: hanya menyentuh tugas yang belum selesai, belum ditarik, dan belum dibuka; dijalankan ulang tidak berefek.
-- Membatalkan (hanya untuk yang ditarik karena alasan ini):
--   update public.tugas_verifikasi_ulang set ditarik_pada = null, ditarik_alasan = null
--   where selesai_pada is null and ditarik_alasan like 'Data hasil verifikasi petugas verifikator%';

update public.tugas_verifikasi_ulang t
set ditarik_pada = now(), ditarik_alasan = 'Data hasil verifikasi petugas verifikator (verifikasi ulang hanya untuk data hasil Admin)'
from public.penerima p
where p.id = t.penerima_id and p.tahun = t.tahun
  and t.selesai_pada is null and t.ditarik_pada is null and t.dibuka_pada is null
  and (upper(coalesce(p.diverifikasi_oleh, '')) like 'VERIF\_%'
       or exists (select 1 from public.riwayat_verifikasi r
                  where r.penerima_id = p.id and r.tahun = p.tahun and r.sumber = 'SATU' and upper(r.oleh) like 'VERIF\_%'));
