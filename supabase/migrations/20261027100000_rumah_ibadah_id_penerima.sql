-- Penautan penerima ke rumah ibadah lewat ID (plan: plans/plan-penautan-rumah-ibadah-id.md, F1).
--
-- LATAR BELAKANG: penerima.tempat_tugas/alamat_tugas hanyalah SALINAN TEKS nama/alamat rumah ibadah, tanpa rujukan ID. Akibatnya
-- mengubah nama/alamat di Manajemen Data Rumah Ibadah tidak menyebar ke penerima, dan menyebarkannya berdasarkan kecocokan nama
-- berisiko menyentuh rumah ibadah lain yang namanya sama. Kolom ini menyimpan ID rumah_ibadah supaya perubahan bisa tepat sasaran.
--
-- ATURAN: kolom BOLEH KOSONG. Tempat tugas bebas (RUMAH / LAINNYA / Bilal Jenazah / Penggali Kubur) memang tidak punya rumah ibadah
-- terdaftar. Teks salinan TETAP dipertahankan (tampilan, cover PDF, ekspor, dan rekap membaca teks itu).
--
-- AMAN & IDEMPOTEN:
--  * `add column if not exists` nullable tanpa nilai bawaan -> perubahan metadata saja (tidak menulis ulang tabel). `penerima` dan
--    `data_detail` adalah tabel induk berpartisi; penambahan di induk otomatis menurun ke semua partisi (2026 & 2027).
--  * Tidak ada FK pada tahap ini (FK ON DELETE RESTRICT = fase akhir opsional; penolakan hapus dijaga di aplikasi lebih dulu).
--  * Tabel log baru (create table if not exists), akses hanya lewat Edge Function (peran postgres): RLS aktif tanpa policy + hak
--    anon/authenticated dicabut (pola yang sama dengan log_verifikasi_massal / pesan_admin).
--  * Trigger realtime pada penerima/data_detail bersifat FOR EACH STATEMENT: satu pernyataan UPDATE = satu sinyal (penting utk F2).
--
-- ROLLBACK: drop index idx_penerima_rumah_ibadah_id, idx_data_detail_rumah_ibadah_id; alter table ... drop column rumah_ibadah_id;
--           drop table log_perubahan_rumah_ibadah. Tidak ada data lama yang diubah oleh berkas ini.

-- Batas tunggu kunci: bila ada query panjang yang memegang tabel, ADD COLUMN akan ANTRE dan menahan query lain di belakangnya.
-- Dengan batas 5 detik, migrasi GAGAL CEPAT (aman diulang) dan tidak menahan aplikasi.
set lock_timeout = '5s';

alter table penerima
  add column if not exists rumah_ibadah_id bigint;

alter table data_detail
  add column if not exists rumah_ibadah_id bigint;

-- Indeks parsial: hanya baris yang tertaut (sebagian besar pencarian "penerima milik rumah ibadah X").
create index if not exists idx_penerima_rumah_ibadah_id
  on penerima (rumah_ibadah_id) where rumah_ibadah_id is not null;

create index if not exists idx_data_detail_rumah_ibadah_id
  on data_detail (rumah_ibadah_id) where rumah_ibadah_id is not null;

reset lock_timeout;

-- Catatan setiap perubahan rumah ibadah yang menyebar ke penerima (dan pemulihannya).
create table if not exists public.log_perubahan_rumah_ibadah (
  id               bigint generated always as identity primary key,
  waktu            timestamptz not null default now(),
  username         text        not null,
  rumah_ibadah_id  bigint      not null,
  aksi             text        not null default 'UBAH',      -- UBAH | PULIH
  nama_lama        text        not null default '',
  alamat_lama      text        not null default '',
  nama_baru        text        not null default '',
  alamat_baru      text        not null default '',
  tahun            integer     not null,
  jumlah           integer     not null,                      -- jumlah penerima yang ikut diperbarui
  ids              jsonb       not null default '[]'::jsonb,  -- daftar id penerima (dasar pemulihan)
  status           text        not null default 'SELESAI'     -- SELESAI | DIPULIHKAN
);

create index if not exists idx_log_perubahan_rumah_ibadah_waktu on public.log_perubahan_rumah_ibadah (waktu desc);
create index if not exists idx_log_perubahan_rumah_ibadah_ri on public.log_perubahan_rumah_ibadah (rumah_ibadah_id);

alter table public.log_perubahan_rumah_ibadah enable row level security;

revoke all on table public.log_perubahan_rumah_ibadah from anon, authenticated;
revoke all on sequence public.log_perubahan_rumah_ibadah_id_seq from anon, authenticated;
