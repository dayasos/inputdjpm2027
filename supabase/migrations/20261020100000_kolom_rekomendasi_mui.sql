-- Kolom verifikasi "Rekomendasi MUI" pada penerima (Ustadz/Ustadzah).
--
-- LATAR BELAKANG: keenam kolom ini SUDAH ADA di database produksi (ditambahkan langsung lewat SQL ketika fitur
-- verifikasi rekomendasi MUI dibuat) tetapi TIDAK pernah dicatat sebagai migrasi, sehingga database yang dibangun
-- ulang dari folder ini (pemulihan bencana, cabang uji, lingkungan lokal) kehilangan kolom-kolom itu dan seluruh
-- daftar "Lihat Data" gagal dimuat (penerima.ts memilihnya pada setiap query). Ditemukan 2026-10-20 saat membandingkan
-- skema produksi dengan hasil semua migrasi: hanya 6 kolom ini yang berbeda (tabel, indeks, fungsi, dan tipe lain sama).
--
-- AMAN & IDEMPOTEN: `add column if not exists` -> di produksi TIDAK mengubah apa pun (kolom sudah ada); di database
-- baru membuat kolom persis seperti di produksi. Pada tabel berpartisi, penambahan di induk otomatis menurun ke
-- semua partisi (penerima_2026, penerima_2027, dst.).
--
-- Tipe & nilai bawaan disalin dari produksi (information_schema.columns, 2026-10-20):
--   status_rekomendasi_mui   character varying  default 'BELUM_DIPERIKSA'  (nullable)
--   catatan_rekomendasi_mui  text                                          (nullable)
--   tgl_rekomendasi_mui      timestamptz                                   (nullable)
--   petugas_rekomendasi_mui  character varying                             (nullable)
--   respon_admin_mui         text                                          (nullable)
--   tgl_respon_admin_mui     timestamptz                                   (nullable)

alter table penerima
  add column if not exists status_rekomendasi_mui  varchar default 'BELUM_DIPERIKSA',
  add column if not exists catatan_rekomendasi_mui text,
  add column if not exists tgl_rekomendasi_mui     timestamptz,
  add column if not exists petugas_rekomendasi_mui varchar,
  add column if not exists respon_admin_mui        text,
  add column if not exists tgl_respon_admin_mui    timestamptz;
