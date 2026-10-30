-- Templat "Alasan Cepat" untuk keterangan verifikasi (plan: plans/plan-templat-alasan-berkas-tidak-lengkap.md, v2.0).
--
-- Satu baris = satu kalimat siap pakai yang tampil sebagai chip di form "Verifikasi Admin Utama". Admin Utama dapat menambah,
-- mengubah, menonaktifkan, menghapus, dan mengurutkan lewat layar "Kelola Templat". Variabel yang dikenal hanya {LAYANAN}.
--
-- AMAN & IDEMPOTEN: tabel baru (create table if not exists); tabel lama (penerima dsb.) TIDAK disentuh. Keterangan yang sudah
-- tersimpan di penerima.keterangan_verifikasi adalah teks biasa, jadi mengubah/menghapus templat tidak mempengaruhinya.
-- Akses hanya lewat Edge Function (peran postgres): RLS aktif tanpa policy + hak anon/authenticated dicabut
-- (pola yang sama dengan log_verifikasi_massal).
--
-- PEMULIHAN: drop table public.templat_alasan;

create table if not exists public.templat_alasan (
  id             bigint generated always as identity primary key,
  status_berlaku text        not null check (status_berlaku in ('Berkas Tidak Lengkap', 'Tidak Memenuhi Syarat')),
  judul          text        not null check (char_length(judul) between 1 and 40),
  isi            text        not null check (char_length(isi) between 1 and 400),
  layanan        text[]      not null default '{}',   -- nama layanan (HURUF BESAR); kosong = berlaku untuk semua layanan
  urutan         integer     not null default 0,
  aktif          boolean     not null default true,
  dibuat_oleh    text        not null default '',
  dibuat_pada    timestamptz not null default now(),
  diubah_oleh    text        not null default '',
  diubah_pada    timestamptz not null default now()
);

create unique index if not exists uq_templat_alasan_status_judul on public.templat_alasan (status_berlaku, upper(judul));
create index if not exists idx_templat_alasan_status_urutan on public.templat_alasan (status_berlaku, urutan, id);

alter table public.templat_alasan enable row level security;

revoke all on table public.templat_alasan from anon, authenticated;
revoke all on sequence public.templat_alasan_id_seq from anon, authenticated;

-- Katalog awal: HANYA dari pola yang terbukti di data produksi (66 data Berkas Tidak Lengkap, 2026-10-30). Dapat diubah di layar Kelola.
insert into public.templat_alasan (status_berlaku, judul, isi, layanan, urutan, dibuat_oleh, diubah_oleh)
values
  ('Berkas Tidak Lengkap', 'Berkas Pendukung salah (BKM)',
   'BERKAS PENDUKUNG SALAH, LAMPIRKAN BUKTI DUKUNG DARI BKM YANG MENYEBUTKAN BAHWA YBS ADALAH {LAYANAN}',
   array['IMAM MASJID','KHATIB JUMAT','NAZIR MASJID','NAZIR MUSHOLLA'], 1, 'SISTEM', 'SISTEM'),
  ('Berkas Tidak Lengkap', 'Berkas Pendukung salah (Gereja)',
   'BERKAS PENDUKUNG SALAH, LAMPIRKAN BUKTI DUKUNG DARI GEREJA YANG MENYEBUTKAN BAHWA YBS ADALAH {LAYANAN}',
   array['PENGURUS GEREJA','PETUGAS GEREJA KATOLIK','PENATUA GEREJA'], 2, 'SISTEM', 'SISTEM'),
  ('Berkas Tidak Lengkap', 'Berkas Pendukung salah (umum)',
   'BERKAS PENDUKUNG SALAH, LAMPIRKAN BUKTI DUKUNG YANG MENYEBUTKAN BAHWA YBS ADALAH {LAYANAN}',
   array['BILAL JENAZAH','PENGGALI KUBUR','PENGURUS VIHARA/KLENTENG/KUIL','GURU SEKOLAH BUDDHA','GURU SEKOLAH HINDU','GURU SEKOLAH KONG HU CHU','GURU SEKOLAH MINGGU'], 3, 'SISTEM', 'SISTEM'),
  ('Berkas Tidak Lengkap', 'Unggah Domisili Rumah Ibadah salah',
   'UNGGAH DOMISILI RUMAH IBADAH SALAH, LAMPIRKAN SURAT KETERANGAN DOMISILI RUMAH IBADAH DARI KELURAHAN',
   array['IMAM MASJID','NAZIR MASJID','NAZIR MUSHOLLA','PENGURUS GEREJA','PENGURUS VIHARA/KLENTENG/KUIL'], 4, 'SISTEM', 'SISTEM'),
  ('Berkas Tidak Lengkap', 'Domisili Kelurahan salah',
   'DOMISILI KELURAHAN SALAH, LAMPIRKAN SURAT KETERANGAN DOMISILI YANG BERSANGKUTAN DARI KELURAHAN',
   '{}', 5, 'SISTEM', 'SISTEM'),
  ('Berkas Tidak Lengkap', 'Rekomendasi BKM salah',
   'REKOMENDASI BKM MASIH SALAH, LAMPIRKAN REKOMENDASI BKM KARENA YBS MENGAJAR MENGAJI DI MASJID',
   array['GURU MAGHRIB MENGAJI'], 6, 'SISTEM', 'SISTEM'),
  ('Berkas Tidak Lengkap', 'Rekomendasi Rumah Ibadah salah',
   'REKOMENDASI RUMAH IBADAH SALAH, LAMPIRKAN REKOMENDASI DARI PENGURUS RUMAH IBADAH TEMPAT YBS BERTUGAS',
   array['GURU SEKOLAH MINGGU','GURU SEKOLAH BUDDHA','GURU SEKOLAH HINDU','GURU SEKOLAH KONG HU CHU','PENATUA GEREJA'], 7, 'SISTEM', 'SISTEM'),
  ('Berkas Tidak Lengkap', 'Tempat tugas beda dengan berkas',
   'NAMA TEMPAT TUGAS DAN ALAMAT TUGAS BERBEDA DENGAN BERKAS YANG DIUPLOAD PADA REKOMENDASI RUMAH IBADAH DAN BERKAS PENDUKUNG',
   '{}', 8, 'SISTEM', 'SISTEM'),
  ('Berkas Tidak Lengkap', 'Koordinat salah',
   'KOORDINAT SALAH, MOHON PERBAIKI KOORDINAT LOKASI MENGAJAR',
   array['GURU MAGHRIB MENGAJI'], 9, 'SISTEM', 'SISTEM')
on conflict do nothing;
