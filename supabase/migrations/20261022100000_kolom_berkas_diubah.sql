-- Penanda "berkas diganti oleh user" pada data berstatus Berkas Tidak Lengkap (plan wajib lapor perbaikan, 2026-10-22).
--
-- LATAR BELAKANG: user (Kecamatan/Kemenag/MUI) bisa mengganti berkas lewat Edit Data lalu menutup Detail tanpa menekan
-- "Laporkan Sudah Diperbaiki", sehingga Admin Utama tidak tahu berkasnya sudah diperbaiki (bahkan pekerjaan otomatis
-- batas waktu bisa menolak data itu padahal berkasnya sudah benar). Server kini mencatat SENDIRI kapan berkas terakhir
-- diganti oleh non-admin pada data Berkas Tidak Lengkap (editDataPenerima). Status "perlu lapor" dihitung dari kolom ini:
--   tanggal_berkas_diubah is not null AND (tanggal_lapor_perbaikan is null OR tanggal_berkas_diubah > tanggal_lapor_perbaikan)
-- Kolom dikosongkan setiap admin menetapkan status (verifikasiSatuData), saat Tandai Sudah Diperbaiki, dan oleh pekerjaan
-- otomatis batas waktu -- jadi hanya bermakna selama satu putaran perbaikan.
--
-- AMAN & IDEMPOTEN: `add column if not exists`, nullable tanpa nilai bawaan -> perubahan metadata saja (tidak menulis ulang
-- tabel, tanpa kunci panjang). Pada tabel berpartisi, penambahan di induk otomatis menurun ke semua partisi.

-- Batas tunggu kunci: ADD COLUMN butuh kunci singkat pada tabel; bila ada query panjang yang sedang memegang tabel, perintah ini akan
-- ANTRE dan seluruh query lain di belakangnya ikut menunggu (antrean kunci). Dengan batas 5 detik, migrasi GAGAL CEPAT (aman diulang) dan
-- tidak menahan aplikasi.
set lock_timeout = '5s';

alter table penerima
  add column if not exists tanggal_berkas_diubah timestamptz;

reset lock_timeout;
