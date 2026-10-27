-- Foreign key penerima.rumah_ibadah_id -> rumah_ibadah.id, ON DELETE RESTRICT (plan: plans/plan-penautan-rumah-ibadah-id.md, D7).
--
-- TUJUAN: pengaman TERAKHIR di tingkat database. Aplikasi sudah menolak menghapus rumah ibadah yang masih dipakai (hapusRumahIbadah:
-- satu pernyataan "delete ... where not exists"), tetapi dua permintaan yang berpapasan tepat di milidetik yang sama (penerima baru
-- tertaut saat rumah ibadahnya dihapus) hanya bisa dicegah mutlak oleh database. Dengan FK, tautan yatim (ID yang menunjuk rumah
-- ibadah yang sudah tidak ada) menjadi mustahil.
--
-- PRASYARAT KERAS: migrasi 20261027100000 (kolom rumah_ibadah_id) sudah diterapkan -- berkas ini bergantung padanya dan akan gagal tanpanya.
-- URUTAN YANG DISARANKAN: terapkan SETELAH pengisian awal (scripts/backfill-rumah-ibadah-id.sql B1-B2) dan verifikasi C3 (tautan yatim) = 0.
-- (Menerapkannya lebih awal pun aman: semua kolom masih NULL dan NULL diizinkan.) Bila ada tautan yatim, ADD CONSTRAINT di bawah GAGAL
-- SELURUHNYA (aman, tidak ada yang berubah) dan baris yatim itu harus dibereskan dulu.
-- !!! BELUM DIUJI di database (percobaan uji pada tabel tiruan tidak dijalankan). Perilaku yang diharapkan sudah baku di PostgreSQL
-- (FK pada tabel induk berpartisi didukung; database ini sudah memakainya: data_detail -> penerima). Terapkan di luar jam ramai.
--
-- CATATAN: ADD CONSTRAINT memvalidasi seluruh baris dan memegang kunci SHARE ROW EXCLUSIVE sesaat pada penerima, data_detail, dan
-- rumah_ibadah (tabel kecil, ±3 ribu baris -> milidetik). lock_timeout 5 dtk membuatnya GAGAL CEPAT bila ada query panjang, bukan menahan aplikasi.
--
-- IDEMPOTEN: dibungkus pemeriksaan pg_constraint (ADD CONSTRAINT tidak punya IF NOT EXISTS).
-- ROLLBACK: alter table penerima drop constraint fk_penerima_rumah_ibadah; alter table data_detail drop constraint fk_data_detail_rumah_ibadah;

set lock_timeout = '5s';

do $fk$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_penerima_rumah_ibadah' and conrelid = 'public.penerima'::regclass) then
    alter table public.penerima
      add constraint fk_penerima_rumah_ibadah foreign key (rumah_ibadah_id) references public.rumah_ibadah (id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_data_detail_rumah_ibadah' and conrelid = 'public.data_detail'::regclass) then
    alter table public.data_detail
      add constraint fk_data_detail_rumah_ibadah foreign key (rumah_ibadah_id) references public.rumah_ibadah (id) on delete restrict;
  end if;
end
$fk$;

reset lock_timeout;
