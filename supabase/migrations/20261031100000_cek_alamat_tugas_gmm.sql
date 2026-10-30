-- Cek Alamat Tugas Guru Maghrib Mengaji (plan: plans/plan-cek-alamat-tugas-gmm.md).
--
-- Admin Utama membuka permintaan cek alamat tugas untuk GMM yang bertempat tugas "RUMAH"; akun peran GURU MAGHRIB MENGAJI
-- (per kecamatan; yang tanpa kecamatan = se-Kota) menjawab; keduanya berkomunikasi lewat utas pendek pada tiap data.
-- Bukan chat bebas (chat dihapus 2026-09-12).
--
-- AMAN & IDEMPOTEN: hanya tabel baru (create ... if not exists); tabel lama (penerima dsb.) TIDAK disentuh.
-- Sengaja TANPA foreign key ke penerima: sinkron/hapus data penerima tidak boleh gagal karena tabel ini (pola yang sama dengan tabel Retur).
-- Nama, alamat, dan kecamatan TIDAK disalin ke sini (hanya alamat_tugas_awal sebagai bukti); tampilannya selalu lewat join ke penerima.
-- Akses hanya lewat Edge Function (peran postgres): RLS aktif tanpa policy + hak anon/authenticated dicabut
-- (pola yang sama dengan templat_alasan dan log_verifikasi_massal).
--
-- PEMULIHAN:
--   drop table public.cek_alamat_tugas_pesan, public.cek_alamat_tugas_kecamatan, public.cek_alamat_tugas;
--   drop function public.cek_alamat_tugas_pesan_tolak_ubah();

-- ── Satu baris = satu guru yang diminta dicek (satu per tahun) ──────────────────────────────────────────────
create table if not exists public.cek_alamat_tugas (
  id                bigint generated always as identity primary key,
  tahun             integer     not null,
  penerima_id       bigint      not null,
  alamat_tugas_awal text        not null default '',          -- salinan saat permintaan dibuka (bukti perubahan)
  sama_alamat_rumah boolean     not null default false,       -- saat dibuka: alamat tugas = alamat rumah (prioritas pengecekan)
  status            text        not null default 'BELUM'
                    check (status in ('BELUM', 'SUDAH_BENAR', 'DIPERBAIKI', 'TIDAK_PASTI', 'DIKEMBALIKAN', 'SELESAI')),
  menunggu          text        check (menunggu in ('GMM', 'UTAMA')),   -- siapa yang harus bertindak; NULL = selesai
  dibuka_oleh       text        not null,
  dibuka_pada       timestamptz not null default now(),
  dijawab_oleh      text,
  dijawab_pada      timestamptz,
  diperbarui_pada   timestamptz not null default now(),
  constraint uq_cek_alamat_tugas_penerima unique (tahun, penerima_id),
  -- Selesai berarti tidak ada yang ditunggu; selain itu selalu ada pihak yang ditunggu.
  constraint ck_cek_alamat_tugas_menunggu check ((status = 'SELESAI') = (menunggu is null))
);
create index if not exists idx_cek_alamat_tugas_menunggu on public.cek_alamat_tugas (menunggu) where menunggu is not null;
create index if not exists idx_cek_alamat_tugas_status on public.cek_alamat_tugas (tahun, status);

-- ── Utas: hanya-tambah (tidak boleh diubah/dihapus; koreksi = menambah baris) ───────────────────────────────
create table if not exists public.cek_alamat_tugas_pesan (
  id                bigint generated always as identity primary key,
  cek_id            bigint      not null references public.cek_alamat_tugas (id) on delete restrict,
  pengirim_username text        not null,
  pengirim_role     text        not null,
  jenis             text        not null check (jenis in ('BUKA', 'JAWAB', 'BALAS', 'KEMBALIKAN', 'SELESAI')),
  status_sesudah    text        not null,
  isi               text        not null default '' check (char_length(isi) <= 500),
  alamat_sesudah    text,                                      -- hanya untuk perbaikan alamat
  dibuat_pada       timestamptz not null default now()
);
create index if not exists idx_cek_alamat_tugas_pesan_cek on public.cek_alamat_tugas_pesan (cek_id, id);

create or replace function public.cek_alamat_tugas_pesan_tolak_ubah() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'cek_alamat_tugas_pesan bersifat hanya-tambah: % tidak diizinkan', tg_op;
end $$;
drop trigger if exists trg_cek_alamat_tugas_pesan_hanya_tambah on public.cek_alamat_tugas_pesan;
create trigger trg_cek_alamat_tugas_pesan_hanya_tambah
  before update or delete on public.cek_alamat_tugas_pesan
  for each row execute function public.cek_alamat_tugas_pesan_tolak_ubah();

-- ── Pantauan untuk Admin Utama: kecamatan mana yang sudah membuka panel ─────────────────────────────────────
create table if not exists public.cek_alamat_tugas_kecamatan (
  kecamatan             text        primary key,
  pertama_dilihat_pada  timestamptz not null default now(),
  terakhir_dilihat_pada timestamptz not null default now(),
  dilihat_oleh          text        not null
);

alter table public.cek_alamat_tugas           enable row level security;
alter table public.cek_alamat_tugas_pesan     enable row level security;
alter table public.cek_alamat_tugas_kecamatan enable row level security;

revoke all on table public.cek_alamat_tugas           from anon, authenticated;
revoke all on table public.cek_alamat_tugas_pesan     from anon, authenticated;
revoke all on table public.cek_alamat_tugas_kecamatan from anon, authenticated;
revoke all on sequence public.cek_alamat_tugas_id_seq       from anon, authenticated;
revoke all on sequence public.cek_alamat_tugas_pesan_id_seq from anon, authenticated;
