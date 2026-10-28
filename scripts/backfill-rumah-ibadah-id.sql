-- Pengisian awal penerima.rumah_ibadah_id (plan: plans/plan-penautan-rumah-ibadah-id.md, F2).
-- Jalankan BAGIAN demi BAGIAN, JANGAN sekaligus. Berlaku untuk tahun 2027 saja (2026 = arsip, tidak disentuh).
--
-- ATURAN TAUTAN (HARUS SAMA dengan pilihRumahIbadahId di supabase/functions/api/_shared/wilayahTugas.ts):
--   * Cari rumah ibadah dengan nama + alamat tempat tugas yang sama persis (dinormalisasi seperti rapikanTeks di server:
--     huruf besar + spasi ganda dirapikan).
--   * Tepat 1 kecocokan                  -> tautkan.
--   * Lebih dari 1 kecocokan             -> dipersempit dengan kecamatan + kelurahan penerima; hanya bila tersisa tepat 1 -> tautkan.
--   * Tidak ada kecocokan / tetap ambigu -> BIARKAN KOSONG (tempat tugas bebas: RUMAH, LAINNYA, Bilal Jenazah, Penggali Kubur, dst.).
--
-- URUTAN WAJIB: migrasi 20261027100000 diterapkan DULU, baru bagian B. Setelah kode F3 ter-deploy, jalankan B1-B2 SEKALI LAGI
-- (idempoten) untuk menangkap penerima yang masuk di antara pengisian awal dan deploy.
--
-- Trigger realtime penerima/data_detail = FOR EACH STATEMENT -> tiap UPDATE di bawah mengirim SATU sinyal saja.
-- Koneksi database pernah penuh di jam sibuk: jalankan di luar jam ramai, satu pernyataan per kali.

-- =====================================================================================================================
-- BAGIAN A -- PRATINJAU (baca saja; tidak butuh kolom baru; aman dijalankan kapan saja)
-- Harapan (diukur 2026-10-27): akan_ditautkan ≈ 1.339 dari 3.511, ambigu_dikosongkan = 0.
-- =====================================================================================================================
with r as (
  select id,
         upper(btrim(regexp_replace(nama, '\s+', ' ', 'g')))                  n,
         upper(btrim(regexp_replace(coalesce(alamat, ''), '\s+', ' ', 'g')))   a,
         upper(btrim(regexp_replace(kecamatan, '\s+', ' ', 'g')))              kec,
         upper(btrim(regexp_replace(kelurahan, '\s+', ' ', 'g')))              kel
  from rumah_ibadah
), cand as (
  select p.id pid, r.id rid,
         (r.kec = upper(btrim(regexp_replace(coalesce(p.kecamatan, ''), '\s+', ' ', 'g')))
          and r.kel = upper(btrim(regexp_replace(coalesce(p.kelurahan, ''), '\s+', ' ', 'g')))) wilayah_sama
  from penerima p
  join r on r.n = upper(btrim(regexp_replace(coalesce(p.tempat_tugas, ''), '\s+', ' ', 'g')))
        and r.a = upper(btrim(regexp_replace(coalesce(p.alamat_tugas, ''), '\s+', ' ', 'g')))
  where p.tahun = 2027
), pilih as (
  select pid,
         case when count(*) = 1 then min(rid)
              when count(*) filter (where wilayah_sama) = 1 then min(rid) filter (where wilayah_sama)
         end as rid,
         count(*) as jumlah_cocok
  from cand group by pid
)
select (select count(*) from penerima where tahun = 2027)           as total_penerima,
       count(*) filter (where rid is not null)                      as akan_ditautkan,
       count(*) filter (where rid is null and jumlah_cocok > 1)     as ambigu_dikosongkan
from pilih;

-- =====================================================================================================================
-- BAGIAN B -- EKSEKUSI (butuh migrasi 20261027100000 sudah diterapkan). Jalankan B1 lalu B2, satu per satu.
-- Idempoten: hanya mengisi baris yang masih NULL.
-- =====================================================================================================================

-- B1. penerima
with r as (
  select id,
         upper(btrim(regexp_replace(nama, '\s+', ' ', 'g')))                  n,
         upper(btrim(regexp_replace(coalesce(alamat, ''), '\s+', ' ', 'g')))   a,
         upper(btrim(regexp_replace(kecamatan, '\s+', ' ', 'g')))              kec,
         upper(btrim(regexp_replace(kelurahan, '\s+', ' ', 'g')))              kel
  from rumah_ibadah
), cand as (
  select p.id pid, r.id rid,
         (r.kec = upper(btrim(regexp_replace(coalesce(p.kecamatan, ''), '\s+', ' ', 'g')))
          and r.kel = upper(btrim(regexp_replace(coalesce(p.kelurahan, ''), '\s+', ' ', 'g')))) wilayah_sama
  from penerima p
  join r on r.n = upper(btrim(regexp_replace(coalesce(p.tempat_tugas, ''), '\s+', ' ', 'g')))
        and r.a = upper(btrim(regexp_replace(coalesce(p.alamat_tugas, ''), '\s+', ' ', 'g')))
  where p.tahun = 2027 and p.rumah_ibadah_id is null
), pilih as (
  select pid,
         case when count(*) = 1 then min(rid)
              when count(*) filter (where wilayah_sama) = 1 then min(rid) filter (where wilayah_sama)
         end as rid
  from cand group by pid
)
update penerima p set rumah_ibadah_id = pilih.rid
from pilih
where pilih.rid is not null and p.id = pilih.pid and p.tahun = 2027 and p.rumah_ibadah_id is null;

-- B2. data_detail: salin dari penerima induk (kunci penerima_id + tahun)
update data_detail d set rumah_ibadah_id = p.rumah_ibadah_id
from penerima p
where d.tahun = 2027 and p.tahun = 2027 and d.penerima_id = p.id
  and d.rumah_ibadah_id is null and p.rumah_ibadah_id is not null;

-- =====================================================================================================================
-- BAGIAN C -- VERIFIKASI (baca saja). Semua kolom "harus_0" WAJIB 0.
-- =====================================================================================================================
-- C1. jumlah tertaut per layanan (layanan wajib-daftar harus 100% tertaut)
select layanan, count(*) total, count(rumah_ibadah_id) tertaut, count(*) - count(rumah_ibadah_id) belum_tertaut
from penerima where tahun = 2027 group by layanan order by total desc;

-- C2. tautan yang teks tempat tugasnya BERBEDA dari rumah ibadahnya (harus_0)
select count(*) as harus_0_teks_menyimpang
from penerima p join rumah_ibadah r on r.id = p.rumah_ibadah_id
where p.tahun = 2027
  and (upper(btrim(regexp_replace(coalesce(p.tempat_tugas, ''), '\s+', ' ', 'g'))) <> upper(btrim(regexp_replace(r.nama, '\s+', ' ', 'g')))
    or upper(btrim(regexp_replace(coalesce(p.alamat_tugas, ''), '\s+', ' ', 'g'))) <> upper(btrim(regexp_replace(coalesce(r.alamat, ''), '\s+', ' ', 'g'))));

-- C3. tautan ke ID yang sudah tidak ada (harus_0)
select count(*) as harus_0_tautan_yatim
from penerima p where p.tahun = 2027 and p.rumah_ibadah_id is not null
  and not exists (select 1 from rumah_ibadah r where r.id = p.rumah_ibadah_id);

-- C4. data_detail yang ID-nya berbeda dari penerima induknya (harus_0)
select count(*) as harus_0_detail_beda
from data_detail d join penerima p on p.id = d.penerima_id and p.tahun = d.tahun
where d.tahun = 2027 and d.rumah_ibadah_id is distinct from p.rumah_ibadah_id;

-- =====================================================================================================================
-- BAGIAN D -- REKONSILIASI (penyembuh drift). Jalankan HANYA bila C2 > 0 (teks penerima tertaut berbeda dari rumah ibadahnya).
-- Penyebab yang mungkin: balapan sangat langka (penerima disimpan tepat saat rumah ibadahnya diganti nama) atau suntingan SQL manual.
-- Sumber kebenaran = rumah_ibadah: teks penerima/data_detail yang TERTAUT disamakan dengannya. Atomik: bila ada bentrok indeks unik
-- tempat tugas, pernyataan gagal seluruhnya (tidak ada yang berubah). Jalankan D1 lalu D2, lalu ulangi C2 & C4 (harus 0).
-- =====================================================================================================================
-- D1. penerima
update penerima p
set tempat_tugas = upper(btrim(regexp_replace(r.nama, '\s+', ' ', 'g'))),
    alamat_tugas = upper(btrim(regexp_replace(coalesce(r.alamat, ''), '\s+', ' ', 'g'))),
    diperbarui_at = now()
from rumah_ibadah r
where p.tahun = 2027 and p.rumah_ibadah_id = r.id
  and (p.tempat_tugas is distinct from upper(btrim(regexp_replace(r.nama, '\s+', ' ', 'g')))
    or p.alamat_tugas is distinct from upper(btrim(regexp_replace(coalesce(r.alamat, ''), '\s+', ' ', 'g'))));

-- D2. data_detail (mengikuti rumah ibadah yang tertaut pada barisnya sendiri)
update data_detail d
set tempat_tugas = upper(btrim(regexp_replace(r.nama, '\s+', ' ', 'g'))),
    alamat_tugas = upper(btrim(regexp_replace(coalesce(r.alamat, ''), '\s+', ' ', 'g'))),
    diperbarui_at = now()
from rumah_ibadah r
where d.tahun = 2027 and d.rumah_ibadah_id = r.id
  and (d.tempat_tugas is distinct from upper(btrim(regexp_replace(r.nama, '\s+', ' ', 'g')))
    or d.alamat_tugas is distinct from upper(btrim(regexp_replace(coalesce(r.alamat, ''), '\s+', ' ', 'g'))));

-- =====================================================================================================================
-- ROLLBACK pengisian awal (teks tidak pernah diubah): kembalikan ke NULL
--   update data_detail set rumah_ibadah_id = null where tahun = 2027;
--   update penerima    set rumah_ibadah_id = null where tahun = 2027;
-- =====================================================================================================================
