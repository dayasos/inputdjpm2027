-- Agregat hasil kerja verifikator (plans/plan-agregat-verifikator.md, tahap T1).
--
-- Tabel BARU (tidak menyentuh tabel lama dan tidak mengubah data apa pun):
--   tim_verifikator        satu baris per akun verifikator: tim (I-IV) dan apakah koordinator tim
--   jam_kerja_verifikasi   jam kerja per hari (isodow 1=Senin..7=Minggu); hari tanpa baris = luar jam kerja
--   hari_libur_verifikasi  tanggal merah / cuti bersama: seluruh hari dihitung luar jam kerja
-- Pagar: riwayat_verifikasi dijadikan HANYA-TAMBAH (pemicu menolak UPDATE/DELETE), karena menjadi dasar hitungan lembur.
--   Untuk pemeliharaan sengaja:  alter table public.riwayat_verifikasi disable trigger riwayat_verifikasi_hanya_tambah;  (lalu aktifkan lagi)
--
-- AMAN & IDEMPOTEN: create ... if not exists, isi awal dengan "on conflict do nothing".
-- Akses hanya lewat Edge Function (peran postgres): RLS aktif tanpa policy + hak anon/authenticated dicabut (pola yang sama dengan riwayat_verifikasi).

create table if not exists public.tim_verifikator (
  akun_id     uuid primary key references public.akun(id) on delete cascade,   -- akun dihapus -> keanggotaan tim ikut hilang (jejak tetap di riwayat_verifikasi)
  tim         text not null check (tim in ('I', 'II', 'III', 'IV')),
  koordinator boolean not null default false
);
-- Satu koordinator per tim
create unique index if not exists tim_verifikator_satu_koordinator on public.tim_verifikator (tim) where koordinator;

create table if not exists public.jam_kerja_verifikasi (
  isodow  smallint primary key check (isodow between 1 and 7),
  mulai   time not null,
  selesai time not null          -- batas atas TIDAK termasuk: selesai 16:30 -> 16:29:59 masih jam kerja
);

create table if not exists public.hari_libur_verifikasi (
  tanggal    date primary key,
  keterangan text not null default ''
);

alter table public.tim_verifikator       enable row level security;
alter table public.jam_kerja_verifikasi  enable row level security;
alter table public.hari_libur_verifikasi enable row level security;
revoke all on table public.tim_verifikator, public.jam_kerja_verifikasi, public.hari_libur_verifikasi from anon, authenticated;

-- Jam kerja (WIB): Senin-Kamis 08.00-16.30, Jumat 08.00-17.00
insert into public.jam_kerja_verifikasi (isodow, mulai, selesai) values
  (1, '08:00', '16:30'), (2, '08:00', '16:30'), (3, '08:00', '16:30'), (4, '08:00', '16:30'), (5, '08:00', '17:00')
on conflict (isodow) do nothing;

-- Tanggal merah / cuti bersama yang diketahui untuk sisa 2026 dan awal 2027. LENGKAPI/KOREKSI bila perlu (tabel ini dapat diubah tanpa deploy).
insert into public.hari_libur_verifikasi (tanggal, keterangan) values
  ('2026-12-24', 'Cuti Bersama Natal'),
  ('2026-12-25', 'Hari Raya Natal'),
  ('2027-01-01', 'Tahun Baru Masehi')
on conflict (tanggal) do nothing;

-- Tim dan koordinator (sumber: daftar Anda 2026-11-12; verif_ade_sandrya ditambahkan kemudian ke Tim I)
insert into public.tim_verifikator (akun_id, tim, koordinator)
select a.id, v.tim, v.koordinator
from (values
  ('verif_ronald_fredy', 'I', true), ('verif_herna_hutapea', 'I', false), ('verif_sugito_iskandar', 'I', false), ('verif_muthia_ulfa', 'I', false),
  ('verif_elsa_darwita', 'I', false), ('verif_sri_deviana', 'I', false), ('verif_rizky_putri', 'I', false), ('verif_siti_mudrika', 'I', false),
  ('verif_ade_sandrya', 'I', false),
  ('verif_fery_suhery', 'II', false), ('verif_bungamin_surbakti', 'II', true), ('verif_elvfrida_mega', 'II', false), ('verif_helda_melani', 'II', false),
  ('verif_raja_rizki', 'II', false), ('verif_rostinawati_sembiring', 'II', false), ('verif_regina_margi', 'II', false),
  ('verif_reynold_sianturi', 'III', true), ('verif_netty_abdiati', 'III', false), ('verif_rosmawati_sipayung', 'III', false), ('verif_muhammad_efta', 'III', false),
  ('verif_liana_rizky', 'III', false), ('verif_sondang_nauli', 'III', false), ('verif_titis_oktivani', 'III', false), ('verif_eva_sefti', 'III', false),
  ('verif_khoiruddin', 'IV', false), ('verif_amy_pratiwi', 'IV', false), ('verif_uga_deba', 'IV', false), ('verif_evi_prasanti', 'IV', true),
  ('verif_putri_miranda', 'IV', false), ('verif_rika_wulan', 'IV', false), ('verif_ananda_fitria', 'IV', false), ('verif_ronald_alberto', 'IV', false)
) as v(u, tim, koordinator)
join public.akun a on lower(a.username) = lower(v.u) and a.role = 'VERIFIKATOR'
on conflict (akun_id) do nothing;

-- riwayat_verifikasi: hanya-tambah
create or replace function public.riwayat_verifikasi_tolak_ubah() returns trigger
language plpgsql as $$
begin
  raise exception 'riwayat_verifikasi bersifat hanya-tambah (tidak boleh diubah atau dihapus)';
end;
$$;
drop trigger if exists riwayat_verifikasi_hanya_tambah on public.riwayat_verifikasi;
create trigger riwayat_verifikasi_hanya_tambah
  before update or delete on public.riwayat_verifikasi
  for each row execute function public.riwayat_verifikasi_tolak_ubah();
