-- Catatan verifikasi massal per layanan (plan: plans/plan-verifikasi-massal-per-layanan.md, K5).
--
-- Satu baris per eksekusi "Verifikasi Massal" (Admin Utama): siapa, kapan, layanan apa, berapa data, dan DAFTAR id penerima
-- yang diubah. Aksi massal tidak bisa dibatalkan per baris lewat aplikasi; daftar id ini adalah dasar pemulihan manual
-- (mis. mengembalikan ke 'Proses Verifikasi') bila admin salah memilih layanan.
--
-- AMAN & IDEMPOTEN: tabel baru (create table if not exists), tidak menyentuh tabel lama. Akses hanya lewat Edge Function
-- (peran postgres), jadi RLS aktif tanpa policy + hak anon/authenticated dicabut (pola yang sama dengan pesan_admin).

create table if not exists public.log_verifikasi_massal (
  id          bigint generated always as identity primary key,
  waktu       timestamptz not null default now(),
  username    text        not null,
  tahun       integer     not null,
  layanan     text        not null default '',   -- '' = semua layanan
  jumlah      integer     not null,
  ids         jsonb       not null default '[]'::jsonb
);

create index if not exists idx_log_verifikasi_massal_waktu on public.log_verifikasi_massal (waktu desc);

alter table public.log_verifikasi_massal enable row level security;

revoke all on table public.log_verifikasi_massal from anon, authenticated;
revoke all on sequence public.log_verifikasi_massal_id_seq from anon, authenticated;
