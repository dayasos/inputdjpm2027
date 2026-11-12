-- Riwayat verifikasi per data penerima (plan: plans/plan-tim-verifikator.md, tahap T5).
--
-- Satu baris setiap kali status verifikasi sebuah data BERUBAH: siapa (username akun), kapan, dari status apa ke status apa, dan
-- keterangannya. Kolom penerima.diverifikasi_oleh hanya menyimpan pemverifikasi TERAKHIR; tabel ini menjaga jejak pemverifikasi sebelumnya
-- (mis. Memenuhi Syarat lalu diubah menjadi Berkas Tidak Lengkap) dan menjadi dasar rekap per verifikator.
--
-- AMAN & IDEMPOTEN: tabel baru (create table if not exists), tidak menyentuh tabel lama dan tidak mengubah data apa pun.
-- Tanpa foreign key ke penerima (penerima dipartisi per tahun; kunci utamanya majemuk). Akses hanya lewat Edge Function
-- (peran postgres), jadi RLS aktif tanpa policy + hak anon/authenticated dicabut (pola yang sama dengan log_verifikasi_massal).
--
-- Kode menulis ke tabel ini secara NON-BLOCKING (kegagalan hanya dicatat di log fungsi, verifikasi tetap berhasil), sehingga urutan
-- deploy migrasi dan fungsi tidak berisiko. Disarankan: migrasi dulu, lalu deploy fungsi.

create table if not exists public.riwayat_verifikasi (
  id          bigint generated always as identity primary key,
  waktu       timestamptz not null default now(),
  penerima_id bigint      not null,
  tahun       integer     not null,
  status_lama text        not null default '',
  status_baru text        not null,
  keterangan  text        not null default '',
  oleh        text        not null,                 -- username akun (huruf besar), atau 'SISTEM (OTOMATIS)'
  sumber      text        not null default 'SATU'   -- SATU | DIPERBAIKI | MASSAL | OTOMATIS
);

create index if not exists idx_riwayat_verifikasi_penerima on public.riwayat_verifikasi (penerima_id, waktu desc);
create index if not exists idx_riwayat_verifikasi_oleh     on public.riwayat_verifikasi (oleh, waktu desc);
create index if not exists idx_riwayat_verifikasi_waktu    on public.riwayat_verifikasi (waktu desc);

alter table public.riwayat_verifikasi enable row level security;

revoke all on table public.riwayat_verifikasi from anon, authenticated;
revoke all on sequence public.riwayat_verifikasi_id_seq from anon, authenticated;
