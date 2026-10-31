-- Hapus 8 tabel modul Retur terintegrasi (retur_*), fungsi trigger riwayatnya, dan domain bulan_retur.
-- Alasan: Retur memakai aplikasi terpisah (tombol "Retur & Kematian"); modul di dalam Input dilepas (frontend: commit 0ce4269, 6e388e6;
-- server: domains/retur.ts & returAdmin.ts dihapus). Isi tabel adalah data uji 2026 dan, saat migrasi ini ditulis, SEMUA kosong (0 baris).
--
-- TIDAK disentuh: status_penerima_laporan dan ref_status_laporan (dipakai domains/statusPenerima.ts: laporan meninggal/tidak aktif
-- dan Aktivasi Kembali), ref_jenis_perbaikan (tabel referensi kecil, sekarang tanpa pemakai; boleh dihapus belakangan).
--
-- PENGAMAN: migrasi berhenti bila salah satu tabel berisi baris. Tanpa CASCADE: bila ada objek lain yang masih bergantung,
-- perintah gagal (dan seluruh migrasi dibatalkan) -- tidak ada penghapusan diam-diam.
--
-- PEMULIHAN (struktur): jalankan ulang 20261011100000_retur_terintegrasi.sql lalu 20261012110000_retur_riwayat_search_path.sql
-- (keduanya idempoten: create ... if not exists). Isi tabel tidak bisa dipulihkan dari berkas ini, tapi saat dihapus memang kosong.

do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array[
    'retur_bendahara_baris', 'retur_bendahara_batch', 'retur_rek_tidak_ditemukan', 'retur_daftar',
    'retur_impor', 'retur_riwayat', 'retur_proses', 'retur_laporan'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then
        raise exception 'Dibatalkan: tabel % berisi % baris. Periksa dulu sebelum menghapus.', t, n;
      end if;
    end if;
  end loop;
end $$;

-- Urutan mengikuti kunci asing: anak dulu, induk belakangan.
drop table if exists public.retur_bendahara_baris;
drop table if exists public.retur_bendahara_batch;
drop table if exists public.retur_rek_tidak_ditemukan;
drop table if exists public.retur_daftar;
drop table if exists public.retur_impor;
drop table if exists public.retur_riwayat;   -- trigger trg_retur_riwayat_append_only ikut terhapus bersama tabelnya
drop table if exists public.retur_proses;
drop table if exists public.retur_laporan;

drop function if exists public.retur_riwayat_tolak_ubah();

-- Domain bulan_retur hanya dipakai kolom `bulan` pada tabel di atas (diperiksa 2026-10-31); tanpa CASCADE, gagal bila masih ada pemakai.
drop domain if exists public.bulan_retur;
