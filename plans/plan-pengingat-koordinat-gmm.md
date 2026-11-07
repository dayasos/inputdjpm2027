# Rencana: Pengingat Koordinat Lokasi untuk Petugas Guru Maghrib Mengaji (GMM)

> Versi **3** (2026-11-08) · Status: **LIVE sejak 2026-11-08 (commit a12dce3)**; perubahan **banner menempel saat digulir** (permintaan user 2026-11-08) selesai di lokal pada cabang `feat/banner-lengket-gmm`, belum commit/push. User menjawab "setuju" (K1-K4 memakai usulan bawaan: "dapat berdampak", banner ikut gulir, gerak sedang yang bisa dijeda, UTAMA tidak melihat). Tidak ada perubahan data, server, atau CSS.
>
> Keputusan user 2026-11-07: dari empat pilihan penanganan koordinat, user memilih **pilihan 1 (imbauan saja)**, yaitu tidak mengubah status data apa pun. Imbauan disampaikan lewat (a) pesan di formulir input dan (b) **banner berjalan permanen** untuk data yang sudah diinput.
>
> Prinsip: hanya tampilan (frontend), tanpa migrasi database, tanpa mengubah fungsi `api`, tanpa mengubah status penerima. Mudah dibatalkan. Commit, push, dan deploy hanya atas perintah eksplisit user.

## Daftar isi
1. Ringkasan
2. Keputusan yang masih perlu dijawab
3. Latar belakang dan temuan data
4. Temuan kode
5. Rancangan
6. Kasus tepi dan ketahanan
7. Tahapan kerja
8. Daftar uji
9. Risiko dan mitigasi
10. Jalan balik
11. Kriteria selesai
12. Di luar lingkup

---

## 1. Ringkasan

| Hal | Rancangan |
|---|---|
| Tujuan | Mengingatkan petugas GMM agar koordinat lokasi guru **benar dan menunjuk alamat tugas guru**, karena koordinat dipakai aplikasi monitoring kegiatan GMM |
| Alasan bisnis (dari user) | Pada monitoring sebelumnya banyak alamat tidak ditemukan. Guru yang tidak ditemukan dianggap tidak ada di lokasi dan masuk data monev (seperti data monev tahun 2026). Karena itu koordinat diambil dari **foto plank** |
| Pesan 1 (formulir input) | Kotak peringatan tetap di bagian foto plank/koordinat pada formulir GMM |
| Pesan 2 (data yang sudah diinput) | **Banner berjalan permanen** (teks bergerak, tidak bisa ditutup) di bawah header, hanya untuk akun GMM |
| Siapa yang melihat | Hanya akun berperan `GURU MAGHRIB MENGAJI` (24 akun aktif). Admin Utama, Kecamatan, MUI, dan layanan Kemenag lain **tidak** melihatnya |
| Cara pasang | Satu berkas JavaScript baru yang dimuat malas khusus peran GMM. Gaya animasi disuntik oleh skrip itu sendiri, jadi **tidak perlu membangun ulang CSS Tailwind** |
| Dampak data | **Nol.** Tidak ada status, koordinat, atau berkas yang berubah |

## 2. Keputusan yang masih perlu dijawab

| # | Butir | Usulan bawaan |
|---|---|---|
| K1 | **Teks pesan 1** yang user tulis memuat "dapat akan berdampak". Bentuk mana yang dipakai? | **"dapat berdampak pada pembayaran Dana Jasa"** (lebih tepat, karena dampaknya belum pasti). Alternatif: "akan berdampak" (tegas) |
| K2 | Posisi banner berjalan | **Di bawah header, ikut bergulir** (tidak menempel), supaya layar HP tidak tertutup. Alternatif: menempel di bawah header selalu terlihat (lebih menonjol tetapi memakan tinggi layar) |
| K3 | Kecepatan dan perilaku gerak | Gerak sedang (sekitar 20 detik per putaran), **berhenti saat disentuh/ditunjuk kursor**, dan **tidak bergerak** bagi pengguna yang memilih mengurangi animasi di perangkatnya (teks tampil diam dan terlipat rapi) |
| K4 | Apakah Admin Utama perlu bisa melihat banner untuk pengecekan tampilan? | **Tidak**. Pengecekan dilakukan lewat uji otomatis dan akun GMM |

### Teks final yang dipakai (menunggu K1)

**Pesan 1, kotak di formulir input GMM:**
> **PENTING: Koordinat Lokasi.** Koordinat dipakai Tim Monitoring untuk menemukan lokasi guru. Koordinat yang salah atau hanya perkiraan membuat guru dianggap tidak ditemukan saat monitoring dan dapat berdampak pada pembayaran Dana Jasa yang bersangkutan.

**Pesan 2, banner berjalan permanen (persis kalimat user):**
> Cek dan Pastikan kembali Koordinat terhadap data yang SUDAH diinput adalah BENAR dan menunjukkan alamat tugas Guru Maghrib Mengaji.

## 3. Latar belakang dan temuan data (dicek 2026-11-07, hanya baca)

- Dari **2.149 penerima Guru** (data 2027), 629 koordinat terbaca langsung dan 1.512 berupa tautan pendek Google Maps yang isinya belum terbaca.
- **91 koordinat bulat ke menit** (presisi sekitar 1-2 km, tidak menunjuk rumah/lokasi tertentu): 56 Memenuhi Syarat dan 35 Proses Verifikasi. Satu titik bisa dipakai 17 penerima beralamat berbeda. Terkonsentrasi di Marelan (42), Labuhan (27), Johor (8), Helvetia (7).
- Tidak satu pun dari 91 data itu sudah masuk pembayaran.
- **Seluruh data GMM (1.445) diinput oleh akun berperan `GURU MAGHRIB MENGAJI`**; akun ini berjumlah 24 (21 per kecamatan dan akun tingkat kota). Karena itu sasaran pesan cukup satu peran.
- Daftar kerja untuk petugas sudah dibuat: `D:\DJPM\DJPM 2027\Aplikasi DJPM2027\Input 2027\laporan\koordinat-perlu-dicek-2027-11-07.csv` (100 baris).

## 4. Temuan kode

- **Banner yang sudah ada** (`index.html`): banner sakelar tutup, banner draf tersimpan, banner periode ditutup, dan banner hitung mundur (`app-pesan-periode.js`). Semuanya berupa kotak statis; **belum ada banner berjalan (teks bergerak)**.
- **Pengingat alamat GMM** (`public/js/pengingat-alamat-rumah.js`): kalimat "Pastikan alamat tugas sudah benar karena akan berpengaruh ketika Tim Verifikasi ... monitoring" untuk tempat tugas "RUMAH". Pesan baru tidak menggantikannya dan tidak bentrok: pengingat itu berada di kolom alamat, pesan baru di bagian foto plank/koordinat.
- **Bagian koordinat di formulir:** `wrapper-foto-plank` (`index.html` sekitar baris 837) hanya tampil untuk layanan GMM. Pesan 1 cukup disisipkan ke wadah ini lewat JavaScript, tanpa menambah baris `index.html`.
- **Batas baris:** `index.html` (3.570 baris) dan `app-transaksi.js` (3.760 baris) sudah melebihi batas 3.500 sejak sebelum rencana ini. Seluruh logika ditaruh di berkas baru supaya tidak menambah beban keduanya; `index.html` hanya naik nomor versi.
- **Pemuat malas per peran:** `SKRIP_PER_PERAN` di `app-pesan-periode.js` saat ini hanya UTAMA dan MUI. Ditambah satu entri untuk peran `GURU MAGHRIB MENGAJI`. Peran lain tetap tidak mengunduh apa pun.
- **Logout tidak memuat ulang halaman** (`app-transaksi.js` sekitar 3423). Elemen yang disuntik skrip harus dibuang atau disembunyikan ketika akun berganti. Pelajaran ini sama dengan fitur Capaian Input (`selaraskanHakAkses`).
- **CSS:** gaya animasi dan warna banner ditulis dalam skrip (pola yang sama dengan fitur Capaian Input), sehingga `public/css/tailwind.css` tidak berubah dan tidak ada risiko kelas yang tidak terbangun di produksi.

## 5. Rancangan

### 5.1 Berkas baru
`public/js/app-pengingat-koordinat-gmm.js` (IIFE, dimuat malas hanya untuk peran GMM). Isinya:
- konstanta kedua teks pesan (satu sumber kebenaran, bisa diuji);
- `sasaranGmm()`: benar bila `dataPengguna.role` (dinormalisasi huruf besar) sama dengan `GURU MAGHRIB MENGAJI`;
- `pasangBanner()` dan `bersihkan()` untuk banner berjalan;
- `pasangKotakFormulir()` untuk pesan 1;
- penyelaras hak akses: dijalankan ulang saat sesi/akun berganti, membuang semua elemen bila peran bukan GMM;
- penyuntik gaya (`<style id="pk-gaya">`) berisi aturan animasi dan `@media (prefers-reduced-motion: reduce)`.

### 5.2 Banner berjalan permanen (pesan 2)
- Elemen `<div id="pk-banner" role="note" aria-label="Pengingat koordinat lokasi">` disisipkan **tepat di bawah header** aplikasi.
- Tampilan: latar kuning-amber lembut (selaras dengan banner peringatan lain), ikon peringatan, teks berjalan dari kanan ke kiri, berulang tanpa henti.
- **Permanen:** tidak ada tombol tutup, tidak disimpan di penyimpanan peramban, muncul lagi setiap halaman dimuat dan setiap login.
- Terlihat di **semua tab** (Input, Lihat Data, Data Detail, dst.) selama akun GMM masuk, karena diletakkan di luar panel-panel tab.
- Aksesibilitas: gerak **berhenti** saat kursor di atas banner atau saat disentuh/difokus; pengguna dengan pengaturan "kurangi gerakan" melihat teks **diam** dan terlipat ke beberapa baris (bukan terpotong); teks tetap dapat dibaca pembaca layar; kontras warna memenuhi batas bacaan.
- Tidak menangkap klik (tidak menutupi tombol di bawahnya) dan tinggi tetap kecil (satu baris) agar tidak menggeser tata letak berlebihan di layar HP 360 px.

### 5.3 Kotak peringatan di formulir (pesan 1)
- Disisipkan sebagai elemen pertama di dalam `wrapper-foto-plank`, jadi otomatis hanya terlihat saat layanan GMM dipilih (wadah itu memang tersembunyi untuk layanan lain).
- Gaya: kotak amber dengan judul tebal "PENTING: Koordinat Lokasi." dan isi pesan. Tetap/statis (tidak berjalan), karena ini pesan yang harus dibaca saat mengisi.
- Tidak memblokir apa pun: hanya tampilan; tombol Simpan dan aturan koordinat yang sudah ada tidak berubah.

### 5.4 Pemasangan
1. Tambah `'/js/app-pengingat-koordinat-gmm.js'` ke daftar peran GMM di `app-pesan-periode.js`.
2. Naikkan nomor `?v=` pada `app-pesan-periode.js` di `index.html` (dan skrip yang "dinaikkan bersama" bila diwajibkan uji versi).
3. Tidak ada perubahan di server, database, CSS Tailwind, atau `app-transaksi.js`.

## 6. Kasus tepi dan ketahanan

| Kasus | Penanganan |
|---|---|
| Akun GMM keluar lalu akun lain masuk tanpa muat ulang | Penyelaras hak akses membuang banner dan kotak |
| Admin Utama atau peran lain masuk | Skrip tidak diunduh sama sekali (pemuat per peran), dan tetap diperiksa lagi di dalam skrip |
| Skrip gagal dimuat (jaringan) | Pemuat mencoba lagi pada pemicu berikutnya; aplikasi tetap normal tanpa banner |
| Layar sangat sempit (360 px) | Tinggi satu baris, tidak ada gulir horizontal pada halaman |
| Peramban lama (Chrome <111) | Animasi memakai `transform` dan `@keyframes` biasa, tanpa fitur CSS baru; diuji pada emulasi Chrome lama |
| Pengguna memilih "kurangi gerakan" | Teks diam dan terlipat (bukan animasi) |
| Banner menutupi menu bawah/atas | Tidak: posisi normal (tidak melayang), tidak menangkap klik |
| Pesan 1 muncul ganda | Penyisipan idempoten (cek keberadaan elemen sebelum menyisipkan) |
| Formulir di-reset realtime (sinyal setelan) | Kotak berada di dalam wadah foto plank yang sudah ada; diuji bahwa tidak terhapus saat formulir disetel ulang |
| Jangan menimbulkan kekeliruan | Teks hanya mengingatkan; tidak menyatakan bahwa koordinat bulat "ditolak" karena aplikasi memang belum menolaknya |

## 7. Tahapan kerja

| Tahap | Isi | Keluaran |
|---|---|---|
| P0 | Jawaban K1-K4 dan perintah "mulai" | Rencana final |
| P1 | Baca ulang pemuat per peran, struktur header, dan `wrapper-foto-plank`; putuskan titik sisip final | Catatan teknis |
| P2 | Tulis `app-pengingat-koordinat-gmm.js` (banner berjalan, kotak formulir, penyelaras akses, gaya) | Berkas baru |
| P3 | Sambungkan pemuat peran GMM di `app-pesan-periode.js`, naikkan `?v=` | Terpasang lokal |
| P4 | Uji (bagian 8), tinjauan menyeluruh, perbaikan temuan | Laporan uji |
| P5 | **Menunggu perintah Anda:** commit dan push (frontend saja; tidak ada langkah Supabase) | Tayang |
| P6 | Uji klik oleh user memakai satu akun GMM; setelah tayang, pantau 1-2 hari | Konfirmasi |

### Pekerjaan pendamping (bukan kode)
- **Penyebaran daftar kerja:** daftar 100 koordinat dipecah per kecamatan (Marelan, Labuhan, Johor, Helvetia, Barat, Amplas, Maimun) agar tiap petugas hanya menerima datanya sendiri. Saya buatkan bila diminta.
- **Pesan WhatsApp** ke petugas (nomor 2 pada draf sebelumnya) dikirim oleh user.
- **Pemantauan kemajuan:** setelah masa imbauan (misalnya 14 hari, ditentukan user), saya jalankan ulang pemeriksaan baca-saja untuk melaporkan berapa koordinat bulat yang sudah diperbaiki. Pemeriksaan ini tidak mengubah data.

## 8. Daftar uji

1. **Unit (Node):** kedua teks pesan persis sama dengan yang disetujui; `sasaranGmm()` benar untuk `GURU MAGHRIB MENGAJI` (huruf besar/kecil dan spasi tambahan) dan salah untuk UTAMA, KECAMATAN, MUI, layanan Kemenag lain, kosong.
2. **Layar (Chrome sungguhan, server tiruan):**
   - akun GMM: banner terlihat di tab Input, Lihat Data, dan tab lain; tidak ada tombol tutup; tetap muncul setelah muat ulang;
   - peran lain (UTAMA, KECAMATAN, MUI, Imam/Khatib, dll.): tidak ada banner dan tidak ada kotak;
   - kotak pesan 1 terlihat hanya saat layanan GMM dipilih;
   - ganti akun tanpa muat ulang: elemen hilang;
   - banner tidak menutupi klik; tidak ada gulir horizontal pada 360 px; tinggi satu baris;
   - gerak berhenti saat ditunjuk/disentuh/difokus; bergerak lagi setelah dilepas;
   - pengaturan "kurangi gerakan": teks diam dan terlipat;
   - formulir di-reset realtime: kotak tidak hilang.
3. **Peramban lama:** emulasi Chrome lama (animasi tetap jalan).
4. **Regresi:** uji layar yang ada (form input, pengingat alamat, kelola data), `npm run check-lines`, `npm run check-css` (CSS tidak berubah), uji versi, `vite build`.
5. **Uji perusakan (mutasi):** pemeriksaan peran dimatikan, tombol tutup ditambahkan, animasi `prefers-reduced-motion` dimatikan, penyelaras logout dimatikan, penyisipan ganda diizinkan; semuanya harus tertangkap.

## 9. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Banner terlalu mengganggu di HP | Satu baris, bisa dijeda, tidak lengket (K2), dan tidak menangkap klik |
| Teks berjalan sulit dibaca | Kecepatan sedang, berhenti saat disentuh, serta mode diam untuk pengguna yang memilih kurangi gerakan |
| Petugas menganggap pesan hanya hiasan | Kalimat singkat, kata kunci huruf besar (SUDAH, BENAR), dan imbauan lewat WhatsApp serta daftar per kecamatan sebagai pelengkap |
| Pesan menyebut akibat yang tidak benar | Teks mengikuti penjelasan user; kata "dapat berdampak" (K1) agar tidak menjanjikan akibat pasti |
| Menyentuh berkas yang mepet batas baris | Semua logika di berkas baru; `index.html` hanya naik `?v=` |
| Konflik dengan pengingat alamat | Posisi berbeda dan tidak saling mengubah; diuji bersamaan |

## 10. Jalan balik
Frontend saja: `git revert` satu commit. Tidak ada migrasi, tidak ada perubahan data, tidak ada deploy fungsi `api`, sehingga tidak ada tindakan di Supabase.

## 11. Kriteria selesai
- Akun GMM melihat banner berjalan permanen dengan kalimat yang disetujui, di semua tab, tanpa bisa menutupnya.
- Formulir input GMM menampilkan kotak "PENTING: Koordinat Lokasi" di bagian foto plank/koordinat.
- Peran lain tidak melihat apa pun dan tidak mengunduh skripnya.
- Semua uji bagian 8 lulus, termasuk mutasi.
- User sudah mengujinya dengan akun GMM nyata.

## 12. Di luar lingkup (bisa menjadi permintaan terpisah)
- **Perketat validasi koordinat** (menolak koordinat bulat ke menit saat input baru; pilihan C sebelumnya).
- **Membaca 1.512 tautan pendek** Google Maps untuk mengecek koordinat aslinya (pilihan D).
- **Menandai data bermasalah** sebagai Berkas Tidak Lengkap (pilihan 2 dan 3), sengaja tidak dipilih user.
- **Pengecekan jarak 500 meter** antara alamat tugas dan koordinat (butuh layanan geocoding; belum diputuskan).

---

## 13. Realisasi (2026-11-07)

- **Berkas baru:** `public/js/app-pengingat-koordinat-gmm.js` (196 baris). **Diubah:** `app-pesan-periode.js` (satu entri pemuat peran GMM) dan `index.html` (hanya `?v=` app-pesan-periode menjadi 20271067), `package.json` (skrip `uji:pengingat-koordinat`). `app-transaksi.js` dan CSS Tailwind tidak disentuh.
- **Uji:** unit `npm run uji:pengingat-koordinat` 6/6; layar Chrome `scripts/uji/layar/pengingat-koordinat-gmm.mjs` 27 pemeriksaan lulus (banner permanen tanpa tombol tutup, di semua tab, jeda saat ditunjuk/disentuh/difokus, mode kurangi gerakan, HP 360 px tanpa gulir horizontal, pergantian akun tanpa muat ulang, kotak formulir hanya untuk layanan GMM, pemulihan otomatis, peran lain tidak mengunduh skrip); regresi 11 suite server + 3 uji layar lain hijau; 14 mutan perusakan semuanya tertangkap; `vite build` berhasil.
- **Catatan uji:** memilih layanan di formulir membuka pop-up pemilih tempat tugas yang menutupi layar; uji layar menutupnya sendiri.
- **Tinjauan ulang teliti (2026-11-07, permintaan user) menemukan dan memperbaiki 1 cacat nyata pada banner:** hanya 2 salinan teks dengan geseran -50%, sehingga pada layar lebih lebar dari satu salinan (±940 px: hampir semua laptop/desktop) ujung kanan banner KOSONG pada sebagian siklus (terukur: 1366 px kosong hingga 386 px; 1920 px hingga ±950 px). Uji 360 px dan 1100 px sebelumnya tidak menangkapnya. Perbaikan: jumlah salinan = ceil(lebar jendela / lebar satu salinan) + 1, geseran = tepat satu salinan (px, diukur skrip), disusun ulang saat ukuran berubah/halaman baru tampil/kembali dari mode kurangi gerakan. Aturan CSS jeda dipisah per pemicu agar peramban lama yang tak mengenal :focus-within tidak membatalkan jeda lain.
- **Uji sesudah perbaikan:** unit 6/6; layar Chrome 41 pemeriksaan (termasuk cakupan jalur pada 1366/1920/2560 px di 6 fase siklus, ubah ukuran jendela 7 kali saat berjalan, kembali dari mode kurangi gerakan, dipasang saat tak terukur), stabil 6 putaran berturut-turut; 17 mutan perusakan tertangkap (3 mutan sempat lolos -> celah uji ditutup -> tertangkap); regresi 13 suite + 4 uji layar lain hijau; `vite build` OK.
- **Tidak teruji:** Chrome lama (<111) sungguhan (hanya Chrome terbaru); pembaca layar; HP nyata.
- **Belum:** commit/push (menunggu perintah user), uji klik user dengan satu akun GMM nyata.

## 14. Perubahan 2026-11-08: banner MENEMPEL saat halaman digulir (permintaan user)

- **Perilaku:** banner tetap terlihat tepat di bawah header yang menempel (K2 berubah dari "ikut gulir" menjadi "menempel"). Caranya `position:sticky` dengan `top` diisi skrip sesuai tinggi header (header bisa 1 baris di desktop dan beberapa baris di HP), z-index 45 (di atas konten, di bawah header 50 dan semua pop-up >=100), menyelip 1 px di bawah header agar tidak ada celah pembulatan. Tinggi header diikuti lewat `ResizeObserver` (border-box) + pemeriksaan berkala 2 dtk + resize + huruf selesai dimuat.
- **Temuan uji:** `ResizeObserver` bawaan hanya mengamati ukuran ISI sehingga perubahan tinggi header lewat padding tidak terdeteksi (banner tertinggal hingga 2 dtk); diperbaiki dengan `box: border-box`.
- **Uji:** layar Chrome 48 pemeriksaan (digulir 0/600/maks pada 1100 px dan 360 px: banner tepat di bawah header, di atas konten, header di atas banner; header +60 px lalu kembali), stabil 3 putaran; 5 mutan tertangkap (sticky dihapus, z-index di atas header, top tak disesuaikan, pengamat hanya isi, celah 1 px); regresi hijau. `?v=` app-pesan-periode dinaikkan ke 20271068 agar peramban mengambil modul baru.
- **Catatan:** di HP header yang menempel sudah memakai sekitar 245 px (layar 360 px); banner menambah sekitar 31 px. Pada mode "kurangi gerakan" teks terlipat beberapa baris sehingga banner lebih tinggi.
