# Runbook T6: Penerapan Timer Tutup Periode + Pesan Admin Utama ke Produksi

> Dibuat 2026-10-19 · Berlaku untuk branch `feat/timer-tutup-periode` · Rencana induk: [plan-timer-tutup-periode-input.md](plan-timer-tutup-periode-input.md)
> Prinsip: **satu lapisan per langkah, verifikasi dulu baru lanjut, setiap lapisan bisa dibatalkan**. Jangan menjalankan lapisan berikutnya bila verifikasi lapisan sebelumnya belum lolos.

## 0. Fakta yang sudah diverifikasi (2026-10-19)

| Fakta | Bukti | Artinya |
|---|---|---|
| Kode fungsi `api` di produksi (v75) **identik** dengan `origin/main` | fungsi diunduh lalu dibandingkan: 0 selisih | Deploy dari branch ini hanya menambah fitur timer/pesan; tidak ada kode lain yang tertimpa |
| `origin/main` belum maju dari dasar branch (0 commit baru) | `git rev-list HEAD..origin/main` = 0 | Tidak perlu rebase |
| Satu-satunya migrasi yang belum diterapkan: `20261019100000` | `supabase migration list --linked` | Tidak ada tunggakan migrasi lain |
| `verify_jwt` fungsi `api` = **false** dan tidak diatur di `config.toml` | `functions list` | Deploy WAJIB memakai `--no-verify-jwt` |
| Database Input di **Tokyo** (`ap-northeast-1`); proyek `wwqxbscumaakvziwzwjx` | `projects list` | Perhatikan latensi saat uji beban |
| Frontend: GitHub `dayasos/input` → Vercel (`inputdjpm2027`); tiap branch punya URL **Preview** yang memakai database & fungsi PRODUKSI yang sama | `vercel ls` | Frontend bisa diuji lewat Preview sebelum digabung ke `main` |

## 1. Dampak yang harus Anda ketahui sebelum menguji di produksi

1. **Tombol/penutupan bersifat GLOBAL.** Menutup periode (lewat timer maupun tombol) mengunci **semua** admin Kecamatan dan Kemenag, bukan hanya akun uji. Uji penutupan hanya di **jam sepi** (saran: 21.00–22.30 WIB) dan **umumkan dulu** di grup admin.
2. **Jadwal tutup yang jatuh dalam 3 hari ke depan langsung memunculkan banner hitung mundur ke SEMUA pengguna.** Jadi jangan membuat jadwal "iseng" untuk mencoba; buat sesingkat mungkin lalu batalkan atau biarkan berjalan.
3. **Pengecualian akun** (Kelola Akses per User → BUKA) tidak terpengaruh penutupan timer. Bila ada akun yang harus tetap bisa bekerja selama uji, beri pengecualian BUKA lebih dulu.
4. **Jangan menyimpan data penerima sungguhan** saat uji (kuota akan terpakai). Uji hanya login, banner, pesan, dan penolakan simpan.
5. Pastikan Anda siap menekan **BUKA PERIODE INPUT** sewaktu-waktu. Itu jalan balik tercepat dan tidak bergantung pada fitur baru.

## 2. Prasyarat (sebelum menyentuh produksi)

- [ ] Semua perubahan sudah di-commit di branch `feat/timer-tutup-periode` (belum di-commit saat runbook ini dibuat). Pembagian commit yang disarankan:
  1. `feat(db): timer periode input, pesan admin utama, penanda unggah (migrasi 20261019100000)`
  2. `feat(api): jadwal otomatis, pesan admin utama, gerbang izin input + masa tenggang`
  3. `feat(ui): modal Jadwal & Pesan (admin) dan banner hitung mundur + pesan (pengguna)`
  4. `docs(plans): rencana dan runbook timer periode`
- [ ] Catat versi fungsi saat ini: **`api` v75** (untuk rollback).
- [ ] Siapkan 2 akun uji: satu **Kecamatan** dan satu **MUI** (tanpa data penting), plus akun UTAMA Anda.
- [ ] Siapkan jendela waktu 45 menit di jam sepi dan pengumuman ke grup admin (teks di Lampiran B).
- [ ] Buka dua jendela: Supabase Dashboard (Logs + SQL Editor) dan Vercel (Deployments).

## 3. Fase A: Uji coba migrasi tanpa menyimpan apa pun (dry-run transaksional)

Tujuan: membuktikan migrasi berjalan di Postgres + pg_cron **sungguhan**. Semua uji otomatis sebelumnya memakai PGlite (mesin Postgres dalam proses) dan belum pernah menyentuh Supabase asli.

Di **Supabase Dashboard → SQL Editor**, tempel isi file `supabase/migrations/20261019100000_timer_periode_dan_pesan_admin.sql` **diapit** seperti ini, lalu jalankan:

```sql
begin;
-- ⬇ tempel seluruh isi file migrasi di sini ⬇

-- ⬇ pemeriksaan di dalam transaksi (hasilnya muncul sebelum dibatalkan) ⬇
select
  (select count(*) from cron.job where jobname in ('terapkan-jadwal-periode','bersihkan-log-jadwal-periode')) as job_cron,
  (select count(*) from pg_indexes where indexname = 'idx_riwayat_setelan_key_waktu') as indeks,
  (select count(*) from information_schema.tables where table_schema='public'
     and table_name in ('jadwal_periode_input','pesan_admin','pesan_admin_dibaca','upload_berkas_dimulai')) as tabel_baru,
  public.terapkan_jadwal_periode() as jadwal_dijalankan;
rollback;   -- SEMUA perubahan dibatalkan, termasuk job cron
```

**Lolos bila:** tidak ada galat, dan hasil `job_cron = 2`, `indeks = 1`, `tabel_baru = 4`, `jadwal_dijalankan = 0`.
Setelah itu pastikan benar-benar bersih: `select count(*) from cron.job where jobname like '%jadwal-periode%';` harus **0**.

> Bila ada galat (mis. `pg_cron` tidak terpasang, izin, atau konflik nama): **berhenti**, kirim pesan galatnya ke saya. Jangan lanjut ke Fase B.

## 4. Fase B: Terapkan migrasi (aditif, aman dibatalkan)

```bash
cd "Input 2027/Input 2027"
npx supabase migration list --linked        # harapan: hanya 20261019100000 yang remote-nya kosong
npx supabase db push --linked               # catatan: --include-all TIDAK diperlukan (tidak ada tunggakan)
```

**Verifikasi (SQL Editor):**

```sql
-- 1) objek ada
select tablename, rowsecurity from pg_tables where schemaname='public'
  and tablename in ('jadwal_periode_input','pesan_admin','pesan_admin_dibaca','upload_berkas_dimulai');   -- 4 baris, rowsecurity = true
-- 2) job aktif
select jobname, schedule, active from cron.job where jobname like '%jadwal-periode%';                    -- 2 baris, active = true
-- 3) tunggu 2-3 menit, job per menit harus sukses
select status, return_message, start_time from cron.job_run_details d join cron.job j using (jobid)
 where j.jobname = 'terapkan-jadwal-periode' order by start_time desc limit 3;                           -- status = succeeded
-- 4) hak akses tercabut
select has_table_privilege('anon','public.pesan_admin','select') as anon_bisa;                           -- false
```

Lalu **Dashboard → Advisors → Security**: tidak boleh ada peringatan **baru** selain `rls_enabled_no_policy` (INFO, disengaja, sama seperti tabel Retur).

**Dampak ke pengguna:** nol. Belum ada kode yang memakai tabel baru, dan fungsi `fn_broadcast_realtime_event` hanya ditambah pemetaan dua tabel baru.

**Jalan balik Fase B:** `select cron.unschedule('terapkan-jadwal-periode'); select cron.unschedule('bersihkan-log-jadwal-periode');` lalu skrip `drop` di kepala file migrasi.

## 5. Fase C: Deploy fungsi `api`

```bash
npx supabase functions deploy api --project-ref wwqxbscumaakvziwzwjx --no-verify-jwt
npx supabase functions list --project-ref wwqxbscumaakvziwzwjx     # harapan: api v76, ACTIVE, verify_jwt:false
```

**Verifikasi (dengan frontend LAMA yang masih tayang di produksi):**
- [ ] Login Kecamatan akun uji berhasil, menu Lihat Data memuat.
- [ ] Menu Input Data terbuka (periode masih terbuka) dan formulir tampil.
- [ ] Supabase **Logs → Edge Functions**: tidak ada galat baru selama 5 menit.
- [ ] (Opsional) di akun UTAMA, tombol BUKA/TUTUP lama masih berfungsi (dua kali tekan: TUTUP lalu BUKA, di jam sepi).

Frontend lama tetap kompatibel: field baru hanya **ditambahkan**, dan frontend lama tidak memanggil aksi baru.

**Jalan balik Fase C:** deploy ulang dari `origin/main` (kode identik dengan v75):
```bash
git worktree add ../rollback-api origin/main
cd ../rollback-api/"Input 2027/Input 2027" 2>/dev/null || cd ../rollback-api
npx supabase functions deploy api --project-ref wwqxbscumaakvziwzwjx --no-verify-jwt
```

## 6. Fase D: Frontend lewat Preview Vercel (belum menyentuh pengguna)

1. `git push -u origin feat/timer-tutup-periode` → Vercel membuat **Preview** otomatis (lihat Deployments). Buka URL Preview-nya.
2. **Perhatian:** Preview memakai database & fungsi **produksi**. Login dengan akun uji.
3. Uji tanpa mengubah data:
   - [ ] UTAMA: profil → "Jadwal & Pesan Penutupan" membuka modal; tab Jadwal/Pesan/Status Baca tampil; tombol **X** menutup.
   - [ ] UTAMA: tulis pesan → **Simpan sebagai Draf** (jangan terbitkan dulu); lihat di Riwayat; **Tarik** agar bersih.
   - [ ] Kecamatan uji: login normal, tidak ada banner (belum ada jadwal), Lihat Data/Input tampil.
   - [ ] Konsol browser (F12): tidak ada galat merah saat login.
   - [ ] Tab Network: untuk Kecamatan **tidak ada** permintaan ke `app-jadwal-pesan.js`; untuk UTAMA ada, dengan `?v=` yang sama.

## 7. Fase E: Skenario uji produksi (jam sepi, ±30 menit)

Gunakan URL Preview (frontend baru) atau, bila sudah digabung ke `main`, URL utama. Siapkan tiga jendela: **UTAMA**, **Kecamatan uji**, **MUI uji**.

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| E1 | UTAMA: tab Pesan → tulis pesan jenis **Penutupan** (pakai template), **Simpan sebagai Draf** | Muncul di Riwayat berstatus *Draf* |
| E2 | UTAMA: tab Jadwal → Tutup otomatis **+20 menit**, pilih pesan tadi, **Simpan Jadwal Tutup** | Kartu "Jadwal aktif" + hitung mundur berjalan; pesan berstatus *Terjadwal* |
| E3 | Kecamatan uji: muat ulang halaman | Banner **merah** (≤1 jam) "Periode input ditutup dalam …" + cuplikan pesan; toast "kurang dari 1 jam" |
| E4 | MUI uji: muat ulang | **Tidak** ada banner hitung mundur |
| E5 | UTAMA: **+1 jam** lalu cek kartu; lalu batalkan geser dengan membuat ulang jadwal **+5 menit** dari sekarang | Jam tutup berubah; hitung mundur menyesuaikan di Kecamatan dalam ≤ 1,5 detik berikutnya |
| E6 | Tunggu hitung mundur Kecamatan mencapai 00:00 | Layar **terkunci sendiri** tanpa refresh; modal "Periode Input Telah Ditutup" tampil memuat kotak **Pesan dari Admin Utama**; tab Input hilang |
| E7 | Kecamatan uji: klik **X**, tunggu 1 menit | Modal tidak muncul lagi (selama sesi). Klik "Baca lagi" di banner: modal kembali |
| E8 | Kecamatan uji: klik **Mengerti** | Tertutup; di UTAMA tab **Status Baca** muncul "1 dari N akun sudah membaca" |
| E9 | MUI uji: muat ulang | Modal pesan tampil, **Mengerti** tercatat |
| E10 | SQL Editor: `select * from riwayat_setelan order by id desc limit 3;` | Baris `INPUT_KECAMATAN_KEMENAG` atas nama **SISTEM (TIMER)**, keterangan `jadwal #… oleh <admin>` |
| E11 | SQL: `select id,jenis,status,dijalankan_pada from jadwal_periode_input order by id desc limit 2;` | Status **DIJALANKAN** |
| E12 | UTAMA: tombol **BUKA PERIODE INPUT** → dialog baru (pilihan pesan + X) → konfirmasi | Periode terbuka; layar Kecamatan terbuka sendiri dalam beberapa detik |
| E13 | Kecamatan uji (opsional, hanya bila ada akun uji dengan data uji): mulai unggah, lalu tutup lewat timer; simpan <5 menit setelah tenggat | Tersimpan (masa tenggang); >5 menit ditolak dengan pesan "Periode input telah berakhir pada …" |
| E14 | Bersihkan: **Tarik** pesan uji bila tidak diperlukan; pastikan tidak ada jadwal menunggu: `select * from jadwal_periode_input where status='MENUNGGU';` | 0 baris |

**Penghentian darurat kapan saja:** UTAMA tekan **BUKA PERIODE INPUT**, atau SQL `select public.set_master_periode('BUKA','darurat','');` dan `update jadwal_periode_input set status='DIBATALKAN' where status='MENUNGGU';`.

## 8. Fase F: Gabung ke `main` (frontend resmi)

Hanya bila Fase E lolos penuh.
1. Buat Pull Request `feat/timer-tutup-periode` → `main`, tinjau diff sekali lagi, gabungkan.
2. Vercel men-deploy produksi otomatis. Pantau Deployments sampai **Ready**.
3. Muat ulang dengan *hard refresh* (Ctrl+F5) di akun uji; pengguna lain mendapat versi baru lewat toast pembaruan PWA.
4. Ulangi pemeriksaan singkat: login Kecamatan, login UTAMA, tombol baru ada.

**Jalan balik Fase F:** Vercel → Deployments → pilih deploy sebelumnya → **Promote to Production** (hitungan detik). Fungsi dan database tetap kompatibel dengan frontend lama.

## 9. Pemantauan 24 jam pertama

- [ ] Supabase **Logs → Edge Functions**: tidak ada lonjakan 5xx/timeout pada aksi `ambilStatusPeriode`, `tandaiPesanDibaca`, `mulaiUnggahBerkas`.
- [ ] `select status, count(*) from cron.job_run_details d join cron.job j using(jobid) where j.jobname='terapkan-jadwal-periode' and start_time > now() - interval '1 day' group by 1;` → seluruhnya `succeeded` (≈1.440).
- [ ] Hari berikutnya: job pembersih berjalan (`bersihkan-log-jadwal-periode`) tanpa galat.
- [ ] Pantau **koneksi database** saat jam sibuk input (Dashboard → Database → Reports). Fitur ini menambah ±1 kueri ringan per pengguna per 5 menit.
- [ ] Tidak ada laporan "layar terkunci padahal periode dibuka" dari pengguna.

## 10. Kriteria selesai

Semua kotak Fase A–E tercentang, PR tergabung, pemantauan 24 jam bersih, dan Admin Utama sudah menerima panduan singkat (Lampiran A). Setelah itu fitur dianggap **live**, dan pekerjaan Cloudflare dilanjutkan.

---

## Lampiran A: Panduan singkat untuk Admin Utama

**Menjadwalkan penutupan:** Profil → *Jadwal & Pesan Penutupan* → tab **Jadwal Otomatis** → isi tanggal & jam (WIB) di kartu *Tutup Otomatis* → pilih pesan yang akan terbit (opsional) → **Simpan Jadwal Tutup**.
**Menulis pesan:** tab **Pesan Admin Utama** → pilih template → ubah isi → **Simpan sebagai Draf** (lalu pilih di jadwal) atau **Terbitkan Sekarang**.
**Memperpanjang:** pada kartu jadwal, tombol **+1 jam / +1 hari / +3 hari**. Hanya untuk jadwal yang belum berjalan; setelah berjalan, gunakan **BUKA PERIODE INPUT**.
**Memperpanjang untuk satu kecamatan saja:** Kelola Akses per User → set akun itu **BUKA** (pengecualian tetap berlaku walau periode ditutup).
**Memastikan semua membaca:** tab **Status Baca** → *Lihat … akun yang belum membaca* → **Salin pengingat** / **Buka WA**.
**Mengubah pesan yang sudah terbit:** **Ubah (versi baru)**. Versi lama tetap tampil sampai versi baru diterbitkan, dan semua pengguna akan melihat pesan lagi.
**Membatalkan:** tombol **Batalkan jadwal** atau **Tarik pesan**.

## Lampiran B: Teks pengumuman (siap tempel)

> *Pengumuman uji sistem DJPM 2027*
> Hari ini pukul [JAM]–[JAM] WIB kami menguji fitur baru **hitung mundur penutupan periode input dan pesan Admin Utama**. Selama waktu itu, input data bisa **terkunci sementara**. Mohon **tidak menginput data** pada jam tersebut. Kami akan memberi kabar setelah selesai. Terima kasih. — Admin Utama Dinas Sosial Kota Medan

> *Pengumuman fitur baru (setelah live)*
> Mulai sekarang aplikasi menampilkan **hitung mundur penutupan periode input** (banner di bagian atas) beserta **pesan resmi dari Admin Utama**. Saat periode ditutup, layar terkunci otomatis dan pesan penutupan muncul. Mohon klik **Mengerti** setelah membaca. Pastikan data selesai dikirim sebelum waktu habis; kiriman yang berkasnya sudah mulai diunggah masih diterima maksimal 5 menit setelah tenggat.

## Lampiran C: Risiko yang diketahui dan mitigasinya

| Risiko | Mitigasi |
|---|---|
| Migrasi belum pernah dicoba di Postgres Supabase asli | Fase A (dry-run + ROLLBACK) sebelum Fase B |
| Penutupan uji mengunci admin sungguhan | Jam sepi, pengumuman, pengecualian BUKA, tombol BUKA siap |
| Frontend dan fungsi tidak seragam sesaat | Fungsi dideploy **lebih dulu**; frontend baru toleran terhadap fungsi lama (galat teknis tidak memblokir unggah) |
| Unggah ke Drive berjalan browser → GAS, tidak bisa dikunci server | Dikunci di sisi aplikasi lewat `mulaiUnggahBerkas`; berkas yatim dari frontend lama diterima (sedikit); penguncian di GAS opsional, butuh deploy GAS |
| Kebuntuan antar-transaksi | Urutan kunci seragam (jadwal lalu pesan) dan diuji dengan 400 klik serentak |
