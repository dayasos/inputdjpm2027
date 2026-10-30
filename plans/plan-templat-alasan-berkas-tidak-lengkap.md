# Plan: Templat "Alasan Cepat" untuk Keterangan Verifikasi (+ layar Kelola Templat)

> Versi **2.1** (2026-10-30) · Status: **P0–P5 SELESAI di lokal; migrasi P1 SUDAH DITERAPKAN di produksi (izin user). BELUM di-commit/push/deploy (P6 menunggu izin setelah review user).** Lihat "Catatan realisasi" di akhir.
> v2.0 menggantikan v1.0 setelah jawaban user: chip klik (K1), templat di kode **dan** layar tambah-sendiri (K2), berlaku juga untuk
> Tidak Memenuhi Syarat (K4), tanpa kalimat favorit tambahan (K5), format nomor `1. …` per baris (K6). K3 tidak perlu lagi (lihat §3c).
> Prinsip proyek: bertahap, mudah dibatalkan, uji lokal dulu, migrasi/push/deploy hanya atas izin.
> Pengguna: **Admin Utama** (satu-satunya yang melihat form "Verifikasi Admin Utama").

## 1. Permintaan dan keputusan user

> "Kolom keterangan jika ada berkas yang kurang saya ketik di kotak keterangan. Kekurangannya bisa 1 dan bisa lebih. Jika lebih maka
> saya membuat nomor urut. Bahasa yang saya ketik selalu sama. Bisakah dibuat template supaya tidak perlu mengetik bahasa yang sama?"

| # | Keputusan |
|---|---|
| K1 | Bentuk bebas, yang paling efektif dan menarik perhatian → **chip berwarna yang diklik** (dipilih saya; alasannya §3a) |
| K2 | Kalimat awal **dibuatkan** (saya isi dari data nyata) **dan** ada **layar Kelola Templat** untuk menambah/mengubah sendiri |
| K4 | Berlaku juga untuk **Tidak Memenuhi Syarat** (belum terpakai sekarang; baru setelah hasil verifikasi eksternal Disdukcapil & Dinas Pendidikan, sesudah penginputan selesai) → daftar templatnya **kosong dulu**, Anda isi lewat layar Kelola saat waktunya |
| K5 | Tidak ada kalimat favorit tambahan → katalog awal dari data nyata saja |
| K6 | Format banyak alasan: `1. …` ⏎ `2. …` (baris baru per alasan), persis kebiasaan sekarang |

## 2. Temuan (data produksi 2026-10-30, 66 data berstatus Berkas Tidak Lengkap)

- Semua berketerangan; rata-rata 116 huruf, terpanjang 222. Hanya **4** bernomor; sisanya satu alasan tanpa nomor.
- Kalimat berpola tetap, hanya nama layanan / sumber surat yang berganti (contoh nyata):
  `BERKAS PENDUKUNG SALAH, LAMPIRKAN BUKTI DUKUNG DARI BKM YANG MENYEBUTKAN BAHWA YBS ADALAH NAZIR MUSHOLLA` ·
  `UNGGAH DOMISILI RUMAH IBADAH SALAH, LAMPIRKAN SURAT KETERANGAN DOMISILI RUMAH IBADAH DARI KELURAHAN` ·
  `DOMISILI KELURAHAN SALAH, LAMPIRKAN SURAT KETERANGAN DOMISILI YANG BERSANGKUTAN DARI KELURAHAN` ·
  `REKOMENDASI BKM MASIH SALAH, LAMPIRKAN REKOMENDASI BKM KARENA YBS MENGAJAR MENGAJI DI MASJID` ·
  `NAMA TEMPAT TUGAS DAN ALAMAT TUGAS BERBEDA DENGAN BERKAS YANG DIUPLOAD PADA REKOMENDASI RUMAH IBADAH DAN BERKAS PENDUKUNG` ·
  `KOORDINAT SALAH, KARENA YANG MASUK KE DATA KAMI ADALAH <angka/tautan>`.
- Keterangan **disimpan HURUF BESAR** (klien `toUpperCase()`, [app-transaksi.js:2718](../public/js/app-transaksi.js#L2718)); server hanya `trim`
  dan mewajibkan terisi untuk Berkas Tidak Lengkap ([verifikasi.ts:53-54](../supabase/functions/api/domains/verifikasi.ts#L53-L54)).
  **Jalur simpan keterangan tidak diubah** — templat hanya mengisi kotak yang sama.
- Daftar berkas wajib per layanan sudah ada: `getBerkasSesuaiLayanan` ([app-transaksi.js:2499](../public/js/app-transaksi.js#L2499)).
- 17 layanan di `layanan_master` (11 Kecamatan + 6 Kemenag). Tabel pendukung di proyek memakai pola: RLS aktif **tanpa kebijakan**,
  diakses hanya lewat fungsi `api` (mis. `log_verifikasi_massal`, `kuota`, `layanan_master`) → tabel baru mengikuti pola ini.
- Tombol "Salin Catatan MUI" menambah satu baris berawalan `[CATATAN REKOMENDASI MUI]:` ke kotak yang sama → penomoran harus
  **mengabaikan** baris ini.
- **Temuan sampingan:** kotak "Keterangan" di Detail memakai `<span>` biasa, sehingga baris baru diratakan menjadi satu baris
  (alasan bernomor tampil menyambung "1. … 2. …" bagi petugas). Kelas `whitespace-pre-line` sudah ada di CSS → perbaikan kecil (P0).

## 3. Rancangan

### 3a. Tampilan "⚡ Alasan Cepat" (di bawah kotak keterangan, hanya Admin Utama)

```
VERIFIKASI ADMIN UTAMA
┌──────────────────────────────────────────────────────────────┐
│ 1. BERKAS PENDUKUNG SALAH, LAMPIRKAN BUKTI DUKUNG DARI BKM … │   <- kotak lama, tetap bisa diketik/diedit
│ 2. UNGGAH DOMISILI RUMAH IBADAH SALAH, LAMPIRKAN SURAT …     │
└──────────────────────────────────────────────────────────────┘
⚡ ALASAN CEPAT — klik untuk menambahkan                [⚙ Kelola]  [Bersihkan]
 (+ Berkas Pendukung salah)  (✓ Unggah Domisili RI salah)  (+ Domisili Kelurahan salah)
 (+ Tempat tugas beda dgn berkas)  (+ Koordinat salah)
 Berkas lain:  [ pilih berkas ▾ ]  [ pilih masalah ▾ ]  [+ Tambah]
```

**Mengapa chip (bukan dropdown):** semua pilihan terlihat sekaligus, satu klik per alasan (dropdown = dua klik + menggulir), dan chip yang
sudah dipakai berubah menjadi **✓ abu-abu** sehingga langsung terlihat mana yang sudah masuk. Warna chip mengikuti status:
**kuning** (Berkas Tidak Lengkap) dan **merah muda** (Tidak Memenuhi Syarat), sama dengan warna kotak status di Detail.
Pada layar HP chip membungkus ke baris berikutnya.

- Chip **hanya yang berlaku untuk layanan penerima itu** (§3c). Chip untuk status yang sedang dipilih tombolnya (Berkas Tidak Lengkap /
  Tidak Memenuhi Syarat) — kotak keterangan dipakai bersama, sehingga chip ditampilkan **menurut status yang akan ditandai**; usulan:
  dua baris chip berlabel jelas ("Untuk Berkas Tidak Lengkap" / "Untuk Tidak Memenuhi Syarat"), baris kedua disembunyikan bila belum ada templat.
- **Berkas lain** (bawaan, tanpa perlu diatur): *berkas* dari `getBerkasSesuaiLayanan` (KTP, Buku Rekening, dst. sesuai layanan) +
  *masalah*: `Belum diunggah` · `Buram / tidak terbaca` · `Salah / tidak sesuai`. Hasil contoh:
  `KTP BURAM / TIDAK TERBACA, MOHON UNGGAH ULANG KTP YANG JELAS`. Hanya untuk Berkas Tidak Lengkap.
- Kotak keterangan tetap bisa diketik bebas; tidak ada yang dikunci.

### 3b. Penomoran otomatis (kebiasaan Anda)

- Kotak kosong + 1 chip → satu baris **tanpa nomor**.
- Chip kedua → baris pertama otomatis jadi `1.`, baris baru `2.`, dst.
- Alasan yang sama tidak digandakan (toast "Alasan ini sudah ada").
- Baris `[CATATAN REKOMENDASI MUI]: …` tidak dinomori dan tidak dihitung.
- Kalimat ketikan manual yang sudah ada menjadi `1.` saat chip pertama ditambahkan; teks manual tidak diubah.
- **Bersihkan** mengosongkan kotak (konfirmasi bila ada isi).

### 3c. Mengapa tidak perlu pertanyaan K3 lagi

Maksud pertanyaan K3 saya: kalimat "…BUKTI DARI **BKM**…" benar untuk masjid, tetapi untuk gereja harus "…dari **GEREJA**". Daripada saya menebak
tabelnya, setiap templat kini punya pengaturan **"Berlaku untuk layanan"** (pilih salah satu, beberapa, atau semua). Jadi untuk satu
masalah yang sama boleh ada beberapa templat dengan kalimat berbeda per kelompok layanan, dan **Anda sendiri yang bisa mengubahnya di layar Kelola**.
Katalog awal saya isi **hanya dari yang sudah terbukti di data** (di bawah), kelompok layanan yang belum pernah muncul diberi kalimat netral.

Satu-satunya variabel: **`{LAYANAN}`** (diganti nama layanan penerima, mis. NAZIR MUSHOLLA).

**Katalog awal (Berkas Tidak Lengkap)** — semua dapat Anda ubah/hapus di layar Kelola:

| # | Judul chip | Kalimat | Berlaku untuk |
|---|---|---|---|
| 1 | Berkas Pendukung salah (BKM) | `BERKAS PENDUKUNG SALAH, LAMPIRKAN BUKTI DUKUNG DARI BKM YANG MENYEBUTKAN BAHWA YBS ADALAH {LAYANAN}` | Imam Masjid, Khatib Jumat, Nazir Masjid, Nazir Musholla |
| 2 | Berkas Pendukung salah (Gereja) | `BERKAS PENDUKUNG SALAH, LAMPIRKAN BUKTI DUKUNG DARI GEREJA YANG MENYEBUTKAN BAHWA YBS ADALAH {LAYANAN}` | Pengurus Gereja, Petugas Gereja Katolik, Penatua Gereja |
| 3 | Berkas Pendukung salah (umum) | `BERKAS PENDUKUNG SALAH, LAMPIRKAN BUKTI DUKUNG YANG MENYEBUTKAN BAHWA YBS ADALAH {LAYANAN}` | Bilal Jenazah, Penggali Kubur, Pengurus Vihara/Klenteng/Kuil, Guru Sekolah Buddha/Hindu/Kong Hu Chu/Minggu |
| 4 | Unggah Domisili Rumah Ibadah salah | `UNGGAH DOMISILI RUMAH IBADAH SALAH, LAMPIRKAN SURAT KETERANGAN DOMISILI RUMAH IBADAH DARI KELURAHAN` | Imam Masjid, Nazir Masjid, Nazir Musholla, Pengurus Gereja, Pengurus Vihara/Klenteng/Kuil |
| 5 | Domisili Kelurahan salah | `DOMISILI KELURAHAN SALAH, LAMPIRKAN SURAT KETERANGAN DOMISILI YANG BERSANGKUTAN DARI KELURAHAN` | Semua |
| 6 | Rekomendasi BKM salah | `REKOMENDASI BKM MASIH SALAH, LAMPIRKAN REKOMENDASI BKM KARENA YBS MENGAJAR MENGAJI DI MASJID` | Guru Maghrib Mengaji |
| 7 | Rekomendasi Rumah Ibadah salah | `REKOMENDASI RUMAH IBADAH SALAH, LAMPIRKAN REKOMENDASI DARI PENGURUS RUMAH IBADAH TEMPAT YBS BERTUGAS` | Guru Sekolah Minggu/Buddha/Hindu/Kong Hu Chu, Penatua Gereja |
| 8 | Tempat tugas beda dengan berkas | `NAMA TEMPAT TUGAS DAN ALAMAT TUGAS BERBEDA DENGAN BERKAS YANG DIUPLOAD PADA REKOMENDASI RUMAH IBADAH DAN BERKAS PENDUKUNG` | Semua |
| 9 | Koordinat salah | `KOORDINAT SALAH, MOHON PERBAIKI KOORDINAT LOKASI MENGAJAR` | Guru Maghrib Mengaji |

Catatan: #3, #7, #9 saya susun dari pola data yang ada (kalimat #7 dan #9 disesuaikan karena kalimat aslinya memuat isi khusus); saya minta Anda cek
isinya di layar Kelola setelah jadi. Daftar **Tidak Memenuhi Syarat: kosong** sampai Anda mengisinya.

### 3d. Layar "Kelola Templat Alasan" (Admin Utama)

Tombol **⚙ Kelola** di samping Alasan Cepat membuka jendela:
- Dua tab: **Berkas Tidak Lengkap** | **Tidak Memenuhi Syarat**.
- Daftar templat: judul chip, kalimat (pratinjau dengan contoh layanan), "Berlaku untuk" (Semua / 3 layanan), tombol aktif/nonaktif, ubah, hapus, geser urutan ▲▼.
- **Tambah / Ubah:** judul (≤ 40 huruf), kalimat (≤ 400 huruf, otomatis huruf besar; tombol sisip `{LAYANAN}`), "Berlaku untuk layanan" (kotak centang
  dikelompokkan Layanan Kecamatan / Layanan Kemenag + "Semua layanan"), **pratinjau langsung** hasil kalimat untuk satu layanan contoh.
- Validasi: judul & kalimat wajib; variabel selain `{LAYANAN}` ditolak; judul kembar pada status yang sama ditolak; hapus meminta konfirmasi
  (templat yang sudah dipakai di keterangan lama **tidak terpengaruh**, karena keterangan tersimpan sebagai teks).

### 3e. Bagian teknis

| Lapisan | Perubahan |
|---|---|
| **Database** (migrasi baru, bisa dibatalkan dengan `drop table`) | Tabel `templat_alasan`: `id`, `status_berlaku` (Berkas Tidak Lengkap / Tidak Memenuhi Syarat), `judul`, `isi`, `layanan text[]` (kosong = semua), `urutan`, `aktif`, `dibuat_oleh/pada`, `diubah_oleh/pada`. RLS aktif tanpa kebijakan (pola proyek). Isi awal = katalog §3c. **Tabel `penerima` tidak disentuh.** |
| **Fungsi `api`** (domain baru `templatAlasan.ts`, **butuh deploy v102**) | `getTemplatAlasan`, `simpanTemplatAlasan`, `hapusTemplatAlasan`, `urutkanTemplatAlasan` — semuanya **khusus UTAMA** (sesi dicek server, pesan galat seragam). Keterangan verifikasi **tidak** lewat sini; jalur simpan lama tidak berubah. |
| **Frontend** | `public/js/app-templat-alasan.js` (chip + penomoran, dimuat malas khusus UTAMA lewat `SKRIP_PER_PERAN.UTAMA`) dan `public/js/app-templat-kelola.js` (layar Kelola, dimuat saat tombol ⚙ diklik). `app-transaksi.js` hanya mendapat **satu baris kait** di bawah textarea (pola `window.djpmWajibLapor`) — file itu sudah melewati batas 3.500 baris. Daftar templat di-cache singkat dan disegarkan setelah simpan di layar Kelola. |
| **Ketahanan** | Bila templat gagal dimuat: muncul tulisan "Templat gagal dimuat, silakan ketik manual" — **verifikasi tidak pernah terhalang**; kotak keterangan tetap bekerja. |
| **Keamanan** | Hanya UTAMA bisa membaca/mengubah; teks dirender dengan `esc()` (anti-XSS); panjang dibatasi di server; judul/kalimat dibersihkan (`trim`, spasi ganda). |

## 4. Tahap kerja

| Tahap | Isi | Menyentuh produksi? |
|---|---|---|
| **P0** | Kotak "Keterangan" di Detail: baris baru tampil per baris (`whitespace-pre-line`) | Hanya setelah push |
| **P1** | Migrasi tabel `templat_alasan` + isi katalog §3c | **Ya (DB)** — izin dulu; hanya menambah tabel baru, aman |
| **P2** | Domain `templatAlasan.ts` + pendaftaran di `index.ts` & `api-bridge.js`; uji tiruan (esbuild) seperti `uji-server` | Lokal |
| **P3** | `app-templat-alasan.js`: chip, filter layanan, penomoran, berkas lain; kait satu baris | Lokal |
| **P4** | `app-templat-kelola.js`: layar Kelola | Lokal |
| **P5** | Uji otomatis (jsdom): tiap layanan, 1 vs banyak alasan, duplikat, baris MUI, ketikan manual, huruf besar, gagal-muat, hak akses (peran lain tak melihat apa pun); render dengan CSS asli dan dilihat sebagai gambar; review mendalam | Lokal |
| **P6** | Commit + push, lalu deploy `api` v102 — **hanya atas perintah**; uji klik Anda di data nyata | Ya |

Urutan push & deploy: **deploy `api` dulu** (agar layar tidak memanggil fungsi yang belum ada), baru push frontend; atau push frontend dengan chip
yang otomatis menampilkan "gagal dimuat" bila fungsi belum ada (aman dua arah).

**Pemulihan:** frontend → `git revert`; fungsi `api` → deploy ulang v101 (kode commit sebelumnya); DB → `drop table templat_alasan` (tidak ada data lain yang bergantung).

## 5. Risiko dan penangkalnya

| Risiko | Penangkal |
|---|---|
| Kalimat katalog awal kurang tepat untuk suatu kelompok layanan | Tabel §3c dicek Anda; bisa diubah di layar Kelola tanpa saya |
| Penomoran merusak ketikan manual / baris catatan MUI | Aturan §3b + uji khusus |
| Chip untuk status yang salah (BTL vs TMS) | Dua baris chip berlabel; filter menurut status |
| Layar Kelola dipakai peran lain | Dicek server (khusus UTAMA); skrip hanya dimuat untuk UTAMA; uji hak akses seperti `uji-hak` |
| Kalimat tersimpan berisi markup/skrip | `esc()` saat dirender; server membersihkan |
| Layanan baru ditambahkan nanti | "Berlaku untuk" membaca `layanan_master` apa adanya; templat "Semua" otomatis berlaku |
| Cache skrip lama | Naikkan `?v=` (`app-pesan-periode.js`, `app-transaksi.js`, `api-bridge.js`) |

## 6. Di luar cakupan (kecuali Anda minta)

- Mengubah keterangan lama yang sudah tersimpan.
- Mengirim alasan otomatis ke petugas lewat WhatsApp (daftar WA "Berkas Tidak Lengkap" yang ada sudah memuat alasan).
- Verifikasi massal (tidak memakai kotak keterangan ini).

## 7. Yang perlu Anda putuskan sekarang

Tidak ada pertanyaan wajib. Cukup ketik **"mulai"** untuk P0–P5 (lokal), dan saya akan **meminta izin lagi** sebelum menyentuh produksi (P1 migrasi, lalu push + deploy di P6).
Bila ingin mengubah katalog §3c (judul/kalimat/kelompok layanan) sebelum dibuat, sebutkan nomor barisnya.

## 8. Catatan realisasi (2026-10-30)

**Sudah di produksi (atas izin user):** tabel `templat_alasan` (migrasi `20261030100000_templat_alasan.sql`, tercatat lewat `apply_migration`): RLS aktif tanpa kebijakan,
anon/authenticated tidak bisa membaca, 9 templat awal (§3c) terisi, tabel `penerima` tidak disentuh (4.944 baris tetap). Pemulihan: `drop table public.templat_alasan;`.

**Lokal, belum commit/push/deploy:**
- Server: `supabase/functions/api/domains/templatAlasan.ts` (5 aksi, semuanya khusus UTAMA) + pendaftaran di `index.ts` → **butuh deploy `api` (v102)**.
- Frontend: `app-templat-alasan.js` (chip), `app-templat-kelola.js` (layar Kelola), 3 baris kait di `app-transaksi.js` (P0 `whitespace-pre-line` + dua kait), `api-bridge.js`
  (cache domain `templat_alasan` + pembuangan saat simpan/ubah/hapus/urut), `app-pesan-periode.js` (muat malas UTAMA), `?v=20271057` untuk ketiganya di `index.html`.
- Tidak ada kelas Tailwind baru yang perlu dibangun (CSS chip/Kelola disuntik sendiri; `npm run check-css` OK).

**Keputusan rancangan yang diambil saat membangun:**
- Baris "Berkas lain" dipasang tepat di bawah chip Berkas Tidak Lengkap (sebelum bagian Tidak Memenuhi Syarat), dan hanya untuk Berkas Tidak Lengkap.
- Tinggi kotak keterangan mengikuti isi (termasuk baris terbungkus), maksimal ±12 baris.
- Layar Kelola dimuat saat tombol ⚙ diklik (bukan ikut login). Esc menutup layar Kelola (tidak ikut menutup Detail); klik latar menutup.
- Bila simpan ditolak server (mis. judul kembar), form **tidak** digambar ulang sehingga isian tidak hilang (bug ini ditemukan uji dan sudah diperbaiki).
- Pengurutan mengirim daftar id sebagai literal array teks (pola `master.ts`), id harus bilangan bulat > 0.

**Pengujian (lokal):** server tiruan 50 (logika + hak akses semua aksi), SQL asli di database produksi dalam blok yang dibatalkan (insert/urutan/judul kembar tak peka huruf besar-kecil/pengurutan ulang),
chip 66 (jsdom), layar Kelola 48, regresi lama (uji 56, filter 27, hak 14, rekom 38, server kuota 24), uji bawaan proyek (gerbang-aksi, server-penerima 23), dan render Chrome dengan CSS asli
(desktop & HP, tanpa galat konsol). Belum ada: `deno check` (Deno tidak terpasang) dan uji klik di akun Admin Utama nyata.

**Sisa:** review user → izin P6 → commit + push + deploy `api` v102 → uji klik user di data nyata (chip, penomoran, Kelola, kotak Keterangan multi-baris).

### Hasil review mendalam (2026-10-30, sebelum P6)

Ditemukan dan **diperbaiki** (semuanya lolos uji ulang):
1. **BUG SERIUS (server):** `sql.array([])` (layanan kosong = "Semua layanan") dikirim library `postgres` sebagai TEKS KOSONG, bukan `{}` → Postgres menolak
   ("malformed array literal"), sehingga **menyimpan templat "Semua layanan" akan selalu gagal**. Terbukti dengan mesin penyusun parameter library asli. Perbaikan: `literalArrayTeks()`
   (literal `{...}` sebagai satu parameter + `::text[]`, pola `master.ts`); literal diuji di database produksi (kosong, nama berkarakter khusus, bolak-balik). Mock saja tidak bisa menangkap ini.
2. **Bentrok `modal-a11y.js`:** layar Kelola belum dikenali sebagai modal sehingga Tab melempar fokus kembali ke Detail. Kini overlay memakai `fixed inset-0 z-[100]` + id + `data-esc-sendiri`
   (role/aria-modal/focus trap/kunci scroll/pengembalian fokus ditangani modul itu; `aria-labelledby` ke judul beridentitas tetap). Diuji dengan `modal-a11y.js` ASLI.
3. **Isian hilang tanpa konfirmasi:** Esc / klik latar / × / Batal / ganti tab pada form yang sudah diisi kini meminta konfirmasi "Buang isian?" (form bersih: langsung).
4. **Server macet:** semua permintaan chip/Kelola kini punya batas waktu (30 dtk / 45 dtk) → pesan galat + tombol "Coba lagi", tidak "Memuat…" selamanya.
5. **Kait di Detail tidak boleh merusak form verifikasi:** `html()` dan `pasang()` dibungkus `try/catch` (galat → chip tidak tampil, form tetap utuh).
6. **Cadangan pengurai larik:** `daftarDariPg()` — bila driver mengembalikan kolom `layanan` sebagai teks, templat khusus layanan tertentu tidak diam-diam menjadi "semua layanan".
7. `id` pengurutan harus bilangan bulat > 0 (pecahan ditolak); kelas lapisan 60 tidak ada di CSS yang sudah dibangun → memakai kelas lapisan 100 yang sudah ada (`npm run check-css` OK, tanpa build ulang).

Diperiksa dan **aman:** nama layanan di 9 templat awal cocok persis dengan `layanan_master` dan dengan isi kolom `penerima.layanan` (tanpa selisih huruf/spasi); kolom `keterangan_verifikasi` bertipe `text`
(tanpa batas panjang; terpanjang saat ini 222); modal Detail tidak memakai `data-jaga-isian`; USTADZ/USTADZAH tidak punya templat khusus (hanya yang "Semua layanan" + "Berkas lain"; catatan MUI memakai tombol Salin).
Pengujian akhir: server tiruan 62, chip 66, Kelola 48, ketahanan + modal-a11y asli 29, regresi lama (56/27/14/38/24), uji bawaan proyek 23, SQL di produksi (dibatalkan), render Chrome.
**Risiko yang tersisa:** belum ada `deno check` (Deno tak terpasang) dan belum diuji dengan sesi Admin Utama nyata terhadap fungsi yang sudah di-deploy; kegagalan akan tampil sebagai pesan galat yang jelas (bukan data rusak).

### Review ke-2 (2026-10-30, sebelum P6) — hasil uji di APLIKASI SUNGGUHAN
Uji `uji-app-nyata.mjs` (Vite dev + Chrome headless + server tiruan lewat CDP, login sebagai Admin Utama, tombol-tombol ASLI, Tab/Esc sungguhan): Detail → chip sesuai layanan → klik chip & Berkas lain
(penomoran) → "Tandai Berkas Tidak Lengkap" (argumen `verifikasiSatuData` benar: keterangan HURUF BESAR multi-baris) → kotak Keterangan multi-baris tampil per baris & gelap → form digambar ulang → ⚙ Kelola
(di atas Detail, focus trap Tab/Shift+Tab, Esc menutup Kelola saja, scroll terkunci lalu dilepas) → tambah templat "Semua layanan" → chip baru langsung tampil → peran Kecamatan tidak melihat apa pun; tanpa galat konsol.
Pemeriksaan tambahan: tipe TypeScript mode ketat (`tsc`) untuk `templatAlasan.ts` OK; seluruh fungsi `api` terakit (esbuild) dan 5 aksi terdaftar; potongan ASLI `renderBaca` dijalankan (kait + P0); `api-bridge.js` ASLI
(cache SWR, header `x-session-token`, pembuangan cache saat simpan, pesan galat server apa adanya); 305 uji unit bawaan proyek lulus.
Ditemukan & diperbaiki: **regresi kecil dari perubahan warna `0174bea` yang SUDAH di produksi** — teks "Batas waktu perbaikan: 25-12-2026" kehilangan spasi setelah titik dua ("perbaikan:25-12-2026"; spasi di ujung
teks ikut terhapus saat penyuntingan). Diperbaiki di perubahan ini + pemeriksaan penjagaan di uji. Catatan: pemindai Tailwind (`check-css`) ikut membaca berkas `plans/*.md`, jadi jangan menulis nama kelas yang belum dibangun di sana.
