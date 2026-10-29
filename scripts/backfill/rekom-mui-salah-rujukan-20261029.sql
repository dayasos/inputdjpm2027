-- *** SUDAH DIJALANKAN di produksi 2026-10-29 (atas persetujuan user): 31 baris terubah; verifikasi: 31/31 berformat benar, kalimat tepat satu kali,
-- *** tanpa tanda baca janggal, total baris ber-kalimat = 32 (31 + id 32482898 yang sudah ada). Sidik jari (md5) isi LAMA 31 id = fa842ee7fc5b7a9e9f8f9122f699a63c;
-- *** hasil jalan-balik terhitung identik dengan sidik jari itu. JANGAN dijalankan ulang (penjaga "not ilike" membuatnya no-op dan melempar exception).
-- Susulan fitur "Rekom MUI Salah" (plans/plan-rekom-mui-salah.md), 2026-10-29.
-- Menambahkan kalimat rujukan ke ALASAN VERIFIKASI lama: data Ustadz/Ustadzah yang sudah diverifikasi Admin Utama
-- (Berkas Tidak Lengkap / Tidak Memenuhi Syarat) dan alasannya hasil tombol "Salin Catatan MUI" sebelum fitur baru ada.
--
-- Hasil = sama persis dengan yang dibuat tombol Salin versi baru (tersimpan HURUF BESAR, seperti data lain):
--   [CATATAN REKOMENDASI MUI]: <CATATAN>. SILAHKAN KE MUI KOTA MEDAN UNTUK PENERBITAN REKOMENDASI MUI.
--
-- Pratinjau 2026-10-29: 31 baris sasaran (id di bawah), semua berbentuk "[CATATAN REKOMENDASI MUI]: <catatan>" tanpa baris baru
-- dan tanpa tanda baca di ujung. Satu data lain (id 32482898) sudah memuat kalimat itu dan TIDAK disentuh.
-- Hanya kolom keterangan_verifikasi pada penerima (tidak ada salinan di data_detail). Satu-satunya pemicu: sinyal realtime.
--
-- Pengaman: hanya id yang terdaftar + semua syarat diulang di WHERE + transaksi dibatalkan bila jumlah baris terubah != 31.

do $$
declare
  v_ids bigint[] := array[
    32293874,32293943,32356515,32381869,32381872,32394345,32394351,32394377,32394382,32394396,32394401,32394541,
    32419611,32444565,32444583,32444592,32444652,32444784,32444807,32444865,32444870,32457358,32457364,32457408,
    32457420,32457434,32457491,32457605,32457612,32457617,32482917
  ];
  v_n integer;
begin
  update penerima p
     set keterangan_verifikasi =
           regexp_replace(p.keterangan_verifikasi, '[,;:\s]+$', '')
           || case when regexp_replace(p.keterangan_verifikasi, '[,;:\s]+$', '') ~ '[.!?]$' then ' ' else '. ' end
           || 'SILAHKAN KE MUI KOTA MEDAN UNTUK PENERBITAN REKOMENDASI MUI.'
   where p.tahun = 2027
     and p.id = any (v_ids)
     and upper(trim(p.layanan)) in ('USTADZ', 'USTADZAH')
     and p.status_rekomendasi_mui = 'PERLU_KOREKSI'
     and p.status_verifikasi in ('Berkas Tidak Lengkap', 'Tidak Memenuhi Syarat')
     and p.keterangan_verifikasi like '[CATATAN REKOMENDASI MUI]:%'
     and p.keterangan_verifikasi not ilike '%Silahkan ke MUI Kota Medan%';
  get diagnostics v_n = row_count;
  if v_n <> 31 then
    raise exception 'Dibatalkan: diharapkan 31 baris terubah, hasil %', v_n;
  end if;
end $$;

-- ===== JALAN BALIK (hanya bila perlu): menghapus kalimat yang ditambahkan, khusus 31 id di atas. =====
-- Semua nilai lama berakhir tanpa titik, jadi sufiks yang ditambahkan selalu ". SILAHKAN ... MUI." (id 32482898 tidak ikut).
-- do $$
-- declare v_n integer;
-- begin
--   update penerima p
--      set keterangan_verifikasi = left(p.keterangan_verifikasi, length(p.keterangan_verifikasi) - length('. SILAHKAN KE MUI KOTA MEDAN UNTUK PENERBITAN REKOMENDASI MUI.'))
--    where p.tahun = 2027
--      and p.id = any (array[32293874,32293943,32356515,32381869,32381872,32394345,32394351,32394377,32394382,32394396,32394401,32394541,
--                            32419611,32444565,32444583,32444592,32444652,32444784,32444807,32444865,32444870,32457358,32457364,32457408,
--                            32457420,32457434,32457491,32457605,32457612,32457617,32482917]::bigint[])
--      and p.keterangan_verifikasi like '%. SILAHKAN KE MUI KOTA MEDAN UNTUK PENERBITAN REKOMENDASI MUI.';
--   get diagnostics v_n = row_count;
--   if v_n <> 31 then raise exception 'Dibatalkan: diharapkan 31, hasil %', v_n; end if;
-- end $$;
