# Plan: Cover Berkas Penerima (PDF) + Tempat Pas Foto 4x6

> Versi **2** (2026-10-25) · Status: **SELESAI DI LOKAL, BELUM commit/push.** Semua keputusan K1-K9 disetujui ("setuju"), K2 = satu per satu + keseluruhan, logo Pemko Medan ditambahkan atas permintaan. Menunggu perintah commit/push dari user, lalu uji klik user dengan akun nyata (P7).
>
> **Catatan realisasi (2026-10-25):**
> - Berkas: `public/js/app-cover-berkas.js` (baru, inti penggambar murni + bagian layar), 22 baris ditambah di `public/js/app-pesan-periode.js` (pemuat malas saat Data Detail dibuka; peran MUI tidak memuat), `index.html` hanya naik `?v=20271036` pada app-pesan-periode, `public/css/tailwind.css` dibangun ulang (satu aturan `hover:bg-sky-200`). `app-transaksi.js` TIDAK disentuh.
> - **Penyimpangan dari §5.2 (disengaja):** sumber data = baris tabel Data Detail yang sedang tampil (`_ddRows`, dibaca dengan penjaga `typeof`), BUKAN panggilan server baru. Alasan: tampilan = unduhan (jumlah di dialog sama dengan "Total Data"), tanpa unduhan ulang ±1 MB, tanpa menumpuk entri cache bridge di sessionStorage, dan tabel sudah disegarkan otomatis lewat realtime. Bila tabel belum dimuat/kosong, muncul pesan, bukan PDF kosong.
> - Urutan cover mengikuti urutan tabel (Layanan, Kecamatan, Kelurahan, Nama), bukan Kecamatan-Layanan-Nama seperti tertulis di §5.2.
> - **Review mendalam (2026-10-25) menemukan & memperbaiki 5 hal:** (1) tombol "Cover" di AKHIR sel Nama tergeser keluar sel (lebar maks 240 px, teks terpotong) sehingga TIDAK bisa diklik pada nama panjang, dipindah ke AWAL sel; (2) dialog belum dianggap modal teratas oleh `modal-a11y.js` (z-index inline, bukan kelas), Tab bisa lompat ke modal di belakang, diberi kelas `z-[120]`; (3) NIK dibaca dari posisi kolom tabel, ditambah pengaman nama baris harus sama dengan nama data (cegah cover orang yang salah bila kolom berubah); (4) fokus tidak kembali ke tombol pemicu setelah dialog ditutup; (5) nama/alamat panjang terpotong padahal halaman masih lega, batas baris dinaikkan (nama 3, alamat 6, tempat tugas 3, alamat tugas 4, nama rekening 3, kantor cabang 3). Peringatan izin "unduh beberapa berkas" ditambahkan di dialog.
> - Uji akhir: 46 uji layar (termasuk Tab/Escape/fokus, klik mouse nyata, keterklikan semua tombol, layar 360 px), 31 pemeriksaan isi PDF, uji acak 800 data + kapasitas teks, regresi koordinat 67 / wajib lapor 92 / verifikasi massal 42, perusakan 15 + 5 mutan (semua tertangkap; satu mutan klik-ganda lolos karena redundansi bawaan peramban).
> - Uji awal: 37 uji layar di Chrome sungguhan (pemuatan malas, tombol per baris termasuk setelah gulir/pindah halaman/muat ulang, dialog, pemecahan 150+20, pembatalan, sesi berakhir, pustaka/logo gagal, tabel kosong, peran KECAMATAN dan MUI); 31 pemeriksaan isi PDF dengan pdf.js (A4, judul, kotak foto tepat 4x6 cm, label lengkap, NIK tidak ganda, tanpa "tanda tangan"); uji acak 800 data ekstrem (tidak ada teks keluar halaman, menabrak kotak foto, atau menimpa kaki halaman); uji perusakan 15 mutan (hanya mutan "penjaga klik ganda" lolos karena peramban sendiri tidak mengirim klik ke tombol yang sudah `disabled`, jadi itu lapisan pengaman rangkap, bukan celah).
> Prinsip: murni frontend (tanpa migrasi DB, tanpa deploy fungsi `api`), memakai pola PDF yang sudah terbukti di Laporan Progres (jsPDF vektor), data dari endpoint yang sudah ada, setiap langkah mudah dibatalkan. Commit/push/deploy hanya atas perintah eksplisit.

## Daftar isi
1. Ringkasan
2. Keputusan yang perlu dijawab
3. Kondisi kode sekarang (temuan)
4. Tata letak cover
5. Rancangan teknis
6. Hak akses & privasi
7. Kasus tepi & ketahanan
8. Tahapan kerja
9. Daftar uji
10. Risiko & mitigasi
11. Jalan balik
12. Kriteria selesai
13. Di luar lingkup

---

## 1. Ringkasan

| Hal | Rancangan (usulan, dapat dikoreksi di §2) |
|---|---|
| Apa | Halaman **cover** per penerima: judul resmi di atas, **data penerima** di bawahnya, **kotak pas foto 4x6** (tanpa tanda tangan) |
| Judul | **PROFIL DATA PENERIMA DANA JASA PELAYANAN KEPADA WARGA PELAYAN MASYARAKAT KOTA MEDAN TAHUN ANGGARAN 2027** (tahun mengikuti tahun data yang dibuka, bukan angka mati) |
| Satuan | **1 penerima = 1 halaman A4 portrait** |
| Sumber data | Daftar **Data Detail** (penerima Memenuhi Syarat) yang sudah dibatasi hak akses per peran. **Tanpa perubahan backend** |
| Cara unduh | (a) tombol **per baris** di tabel Data Detail = cover 1 orang; (b) tombol **"Unduh Cover PDF"** di footer modal = banyak penerima sekaligus (dipilih per Kecamatan/Layanan), satu PDF berisi banyak halaman |
| Format | PDF digambar langsung dengan jsPDF (sudah ada di `public/js/vendor`), vektor, ringan, teks bisa dicari |
| Berkas baru | `public/js/app-cover-berkas.js` (dimuat malas). `index.html`, `app-transaksi.js` tidak ditambah baris (keduanya mepet batas 3.500) |
| Dampak DB / fungsi `api` | **Tidak ada** |

---

## 2. Keputusan yang perlu dijawab

Setiap butir punya **usulan bawaan**; cukup jawab "setuju" atau tulis koreksinya.

| # | Pertanyaan | Usulan bawaan | Alasan |
|---|---|---|---|
| K1 | Cover untuk **siapa saja**: hanya penerima **Memenuhi Syarat** (isi Data Detail), atau semua status? | **Memenuhi Syarat saja** | Berkas fisik yang dikirim untuk pembayaran hanya milik yang sudah lolos; sumbernya sudah ada dan sudah dibatasi hak akses. Semua status berarti harus memakai Lihat Data dan berpotensi mencetak cover untuk yang akhirnya ditolak |
| K2 | **Satuan unduhan**: 1 orang, atau banyak sekaligus? | **SUDAH DIJAWAB (2026-10-25): satu per satu, dan juga keseluruhan.** Tombol per baris + tombol "Unduh Semua"; di dialog "Unduh Semua" pilihan bawaan = **seluruh penerima yang boleh dilihat peran itu**, dengan opsi mempersempit per Kecamatan/Layanan | Berkas besar otomatis dipecah (lihat §7) |
| K3 | **Siapa yang boleh** mengunduh? | **Semua peran yang sudah bisa membuka Data Detail**, hanya untuk data yang sudah boleh mereka lihat | Tidak ada data baru yang terbuka; hak akses ditegakkan server di `ambilDataDetail` |
| K4 | **Isi data** di cover | Nama, NIK, Jenis Kelamin, Tempat/Tanggal Lahir (+umur), Alamat, Layanan, Tempat Tugas, Alamat Tugas, Kecamatan, Kelurahan, No. Kontak, Status BPJS TK, Nama Rekening, Nomor Rekening, Kantor Cabang | Semua kolom Data Detail kecuali Status/Tgl Status (urusan internal) |
| K5 | **NIK dan nomor rekening** ditampilkan **utuh** atau disamarkan? | **Utuh** | Cover ditempel pada berkas fisik yang memang berisi KTP dan buku rekening; NIK disamarkan justru menyulitkan pencocokan. Kalau ingin disamarkan, bilang |
| K6 | **Ukuran pas foto**: "4x6" = 4 cm x 6 cm (lebar x tinggi, potret)? | **4 cm lebar x 6 cm tinggi**, bingkai tipis + tulisan kecil "Pas Foto 4x6" di dalamnya | Ukuran lazim "4x6" cm; kotak dibuat tepat ukuran itu agar foto yang dicetak bisa langsung ditempel |
| K7 | Posisi kotak foto | **Kanan atas, di bawah judul, sejajar blok data** | Data di kiri, foto di kanan: halaman seimbang. Alternatif: kiri atas |
| K8 | **Logo / kop / nomor halaman / pencetak** | Judul saja, **tanpa logo dan kop**; kaki halaman kecil "Dicetak dari Aplikasi DJPM 2027 oleh {username} - {tanggal}" | Selaras dengan Laporan Progres. Logo Pemko Medan (`public/logo-medan.png`) bisa ditambahkan bila diminta |
| K9 | **Nama berkas** unduhan | `Cover-Berkas_{NAMA-ORANG}_{NIK}.pdf` (satu orang); `Cover-Berkas_{KECAMATAN}_{LAYANAN atau SEMUA}_{YYYY-MM-DD}.pdf` (massal) | Mudah dicari dan tidak tabrakan |

---

## 3. Kondisi kode sekarang (temuan)

- **Pola PDF sudah ada**: `public/js/app-laporan-progres.js` menggambar PDF dengan jsPDF 4.2.1 (MIT, disimpan lokal di `public/js/vendor/jspdf.umd.min.js`, dimuat malas saat tombol diklik, timeout 30 detik, bisa dicoba ulang). Fungsi `muatJsPdf`, `latin`, `rgb`, dan kebiasaan `isi()` sebelum setiap bentuk (warna isi dan warna teks berbagi operator PDF) dipakai ulang secara **salinan pola**, bukan impor, supaya dua modul tetap mandiri.
- **Judul resmi sudah ada** sebagai `NAMA_PROGRAM` di modul itu ("...Kota Medan Tahun 2027"). Cover memakai kalimat yang sama dengan "Tahun **Anggaran**" sesuai permintaan.
- **Sumber data siap pakai**: `ambilDataDetail(token, tahun)` (`supabase/functions/api/domains/dataDetail.ts`) mengembalikan semua kolom yang dibutuhkan (nama, nik, jenisKelamin, tempatLahir, tanggalLahir `dd-mm-yyyy`, alamat, layanan, tempatTugas, alamatTugas, kecamatan, kelurahan, namaRekening, nomorRekening, kantorCabang, noKontak, statusBpjsTk, umur), sudah disaring hak akses per peran (kecamatan, kelurahan terkunci, sub-filter GSM, layanan Kemenag). Hasilnya juga sudah di-cache klien (`api-bridge.js`, TTL 3 menit). **Tidak butuh endpoint baru.**
- **Tidak ada fitur pas foto** di aplikasi (foto yang ada: plank rumah ibadah, lokasi ibadah, kegiatan belajar, KTP). Jadi kotak pas foto hanya **bingkai kosong** untuk ditempel foto cetak. Menarik foto dari Google Drive tidak termasuk lingkup (lihat §13).
- **Batas baris**: `index.html` 3.491/3.500 dan `app-transaksi.js` 3.481/3.500 (pemeriksa `npm run check-lines`). Maka tombol **tidak ditulis di HTML statis**: modul baru menyisipkannya lewat DOM ke footer modal Data Detail dan ke tiap baris tabel.
- **Pemuat per peran**: `SKRIP_PER_PERAN` di `app-pesan-periode.js` saat ini hanya UTAMA dan MUI. Peran lain (admin kecamatan, Kemenag, dst.) belum punya pemuat modul malas, jadi butuh jalur muat baru yang aman (lihat §5.4).
- **CSS**: kelas Tailwind baru wajib `npm run build:css` lalu CSS di-commit (`feedback_css_tailwind_dicommit`). Usulan: tombol baru memakai **kelas yang sudah ada** di CSS atau gaya inline, sehingga CSS tidak perlu dibangun ulang; kalau tidak bisa, bangun ulang dan jalankan `npm run check-css`.

---

## 4. Tata letak cover (A4 portrait, 595 x 842 pt, margin 40 pt)

```
+----------------------------------------------------------+
|                    PROFIL DATA PENERIMA                  |
|        DANA JASA PELAYANAN KEPADA WARGA PELAYAN          |
|              MASYARAKAT KOTA MEDAN                       |
|                 TAHUN ANGGARAN 2027                      |
|  ======================================================  |
|                                                          |
|  IDENTITAS                              +-----------+    |
|  Nama          : ....................   |           |    |
|  NIK           : ....................   |  PAS FOTO |    |
|  Jenis Kelamin : ....................   |    4x6    |    |
|  Tempat/Tgl Lhr: ..................     |   (4 cm   |    |
|  Umur          : ....                   |  x 6 cm)  |    |
|  Alamat        : ..................     |           |    |
|                  ..................     +-----------+    |
|  TUGAS                                                   |
|  Layanan       : ....................                    |
|  Tempat Tugas  : ....................                    |
|  Alamat Tugas  : ....................                    |
|  Kecamatan     : ........  Kelurahan: ........           |
|                                                          |
|  KONTAK & REKENING                                       |
|  No. Kontak    : ....................                    |
|  Status BPJS TK: ....................                    |
|  Nama Rekening : ....................                    |
|  No. Rekening  : ....................                    |
|  Kantor Cabang : ....................                    |
|                                                          |
|  (ruang kosong; tanpa tanda tangan)                      |
|  Dicetak dari Aplikasi DJPM 2027 oleh {user} - {tanggal} |
+----------------------------------------------------------+
```

- Kotak foto **tepat 4 cm x 6 cm** = 113,39 x 170,08 pt, bingkai 0,75 pt abu-abu gelap, tulisan "PAS FOTO 4x6" kecil abu-abu di tengah (tidak ikut tercetak tebal supaya tidak mengganggu foto yang ditempel).
- Blok data di kiri dengan label rata kiri, tanda ":" sejajar. Teks panjang (alamat) dibungkus (`splitTextToSize`) dengan batas lebar sampai tepi kiri kotak foto selama masih sejajar foto, lalu melebar penuh di bawahnya.
- Judul 4 baris terpusat, tebal; garis tebal pemisah di bawah judul (gaya sama dengan Laporan Progres).
- Seluruh isi **dipastikan muat 1 halaman** (lihat §7 batas panjang).

---

## 5. Rancangan teknis

### 5.1 Modul
`public/js/app-cover-berkas.js` (IIFE, pola sama dengan `app-laporan-progres.js`):
- `muatJsPdf()` salinan pola (lokal, timeout, bisa coba ulang).
- `bersihkanTeks(v)`: pengganti `latin()` yang lebih cerdas. Helvetica standar PDF hanya mengenal Latin-1, jadi karakter umum yang dipakai orang (tanda kutip melengkung, tanda pisah panjang/pendek, elipsis, spasi tak terlihat) **diganti padanan ASCII** dulu, baru sisanya dibuang. Tujuannya nama/alamat tidak kehilangan huruf diam-diam. Semua karakter di file dibangun dengan `String.fromCharCode` / escape (pelajaran: tool Write mengubah `\u`).
- `gambarCover(doc, penerima, tahun, pencetak, waktu)`: menggambar **satu halaman** untuk satu penerima. Dipakai ulang oleh unduh satuan dan massal.
- `bangunPdf(daftar, tahun, ...)`: loop `doc.addPage()` per penerima, memberi kesempatan UI bernapas (yield per ~10 halaman) dan mengirim progres ("Menyusun 37 dari 120").
- `unduh(blob/nama)`: `doc.save(nama)`; nama dibersihkan (`[^A-Za-z0-9._-]` jadi `-`).

### 5.2 Alur data (aman terhadap sesi dan data basi)
1. Klik tombol, lalu cek sesi (`dataPengguna.token`) dan tahun yang sedang dibuka di modal Data Detail (`_tahunUntukDataDetail()`).
2. Ambil data **segar** lewat `ambilDataDetail(token, tahun)` dengan argumen penanda unik (pola `lp<waktu>` di Laporan Progres) supaya melewati cache, jadi cover memakai data terbaru, bukan cache 3 menit.
3. Cek sesi lagi sebelum menyimpan (sesi bisa berganti selama penyusunan).
4. Saring sesuai pilihan (per baris: satu orang dicocokkan dengan **NIK**; massal: Kecamatan/Layanan), urut **Kecamatan, Layanan, Nama**.

### 5.3 UI
- **Per baris**: ikon kecil "Cover" di sel aksi tabel Data Detail (disisipkan modul setelah tabel dirender). Tabel dirender ulang saat gulir/paginasi (`_gambarHalamanDataDetail`), jadi memakai **delegasi klik** pada `#body-tabel-data-detail` plus pengamat `MutationObserver` ringan atau satu kolom sel yang disuntik per render; dipilih yang tidak mengubah `app-transaksi.js` (batas baris).
- **Massal**: tombol "Unduh Cover PDF" di footer modal. Klik membuka dialog kecil (memakai `konfirmasiAksi`-gaya modal yang sudah ada): pilih **Kecamatan** (hanya yang boleh dilihat peran itu), pilih **Layanan** (atau Semua), menampilkan "N penerima akan dibuat", tombol Unduh. Peran yang hanya punya satu kecamatan melihat pilihan terkunci.
- Selama menyusun: tombol dinonaktifkan, indikator "Menyusun cover 37/120...", tombol Batal. Selesai: toast "N cover diunduh".

### 5.4 Pemuatan modul untuk semua peran
Tambah jalur muat malas sendiri (bukan menambah ke `SKRIP_PER_PERAN` yang khusus admin): modul dimuat **saat Data Detail dibuka pertama kali** (`tampilkanDataDetail`), lewat satu pembungkus kecil yang sudah dipakai pola lain, atau lewat pendengar klik pada tombol `#btn-data-detail` yang disuntik dari `app-pesan-periode.js`. Pilihan teknis final ditetapkan di P1 setelah membaca pemuat itu; syaratnya: tidak menyentuh `app-transaksi.js`/`index.html` selain naik `?v=`.

### 5.5 Cache, versi
Skrip baru diberi `?v=` mengikuti penomoran yang ada (`20271036` dst.); `sw.js` sudah network-first untuk `/js/`.

---

## 6. Hak akses & privasi

- Tidak ada hak akses baru: cover hanya dibuat dari baris yang **sudah dikembalikan server** untuk peran itu. Tidak ada celah lintas kecamatan/denominasi (ingat bug lama Data Detail GSM; pemfilteran tetap dilakukan server, klien hanya menyaring lagi untuk cakupan yang dipilih).
- PDF dibuat **di peramban** dan tidak diunggah ke mana pun. Tidak ada arsip di server.
- Cover memuat NIK dan nomor rekening (K5). Kaki halaman mencatat username pencetak dan waktu, sebagai jejak bila lembar tercecer.
- Opsional (K5 bila memilih samar): tampilkan 4 digit terakhir NIK dan rekening.

---

## 7. Kasus tepi & ketahanan

| Kasus | Penanganan |
|---|---|
| Alamat/Tempat Tugas sangat panjang | Dibungkus maksimal N baris per kolom (usulan: alamat 4 baris, lainnya 2); lewat batas dipotong dengan "..." dan **teks lengkap tidak hilang diam-diam**: ukuran huruf turun otomatis satu tingkat (9 pt lalu 8 pt) sebelum dipotong |
| Karakter di luar Latin-1 (nama dengan tanda kutip melengkung, dsb.) | Dipadankan ke ASCII lalu sisanya dibuang; diuji dengan data nyata bercampur |
| Field kosong (mis. BPJS, kantor cabang) | Tampil "-" (bukan baris hilang) agar tata letak tetap seragam |
| Tanggal lahir kosong/format aneh | Tampil apa adanya dari server, tanpa menebak |
| Massal sangat banyak (mis. 500+) | Batas per PDF **150 halaman**; lebih dari itu otomatis dipecah jadi beberapa berkas `...-bagian-1.pdf`, `-2.pdf` agar peramban HP tidak kehabisan memori. Yield per 10 halaman agar layar tidak membeku |
| Tidak ada data sesuai pilihan | Pesan "Tidak ada penerima untuk pilihan ini", tidak membuat PDF kosong |
| Gagal jaringan / sesi habis | Pesan galat yang jelas, tombol aktif kembali, tidak ada PDF setengah jadi |
| Pustaka PDF gagal dimuat | Pesan "Pustaka PDF gagal dimuat. Periksa koneksi, lalu coba lagi." (pola yang sama) |
| Dua klik cepat | Penjaga `sedangMenyiapkan` seperti di Laporan Progres |
| Tahun arsip (mis. 2026) dibuka | Judul memakai tahun itu ("Tahun Anggaran 2026") karena diturunkan dari `res.tahun` |
| HP Android / Chrome lama | `doc.save` memakai unduhan standar; diuji di emulasi Chrome lama seperti uji sebelumnya |
| Dua penerima nama sama | Per baris diidentifikasi dengan **NIK** (unik per tahun), bukan nama |

---

## 8. Tahapan kerja

| Tahap | Isi | Keluaran |
|---|---|---|
| P0 | Jawaban K1-K9 dari Anda | Plan final v2 |
| P1 | Baca pemuat modul per peran dan render tabel Data Detail; putuskan titik pasang tombol tanpa menyentuh berkas mepet batas | Catatan teknis di plan |
| P2 | Tulis `app-cover-berkas.js`: fungsi gambar 1 halaman, unduh satuan | Cover 1 orang bisa diunduh |
| P3 | Dialog massal + progres + pemecahan berkas + Batal | Unduh massal |
| P4 | Uji otomatis (§9) + uji visual: render PDF ke gambar dan diperiksa mata | Laporan uji |
| P5 | Review mendalam (hak akses, data basi, karakter, memori) | Perbaikan temuan |
| P6 | **Menunggu perintah Anda**: commit, push, Vercel. Tidak ada tahap Supabase | Live |
| P7 | Uji klik oleh Anda dengan akun nyata (satu orang + satu kecamatan) | Konfirmasi |

---

## 9. Daftar uji

1. **Isi PDF**: dibaca ulang dengan pdf.js (pola uji sebelumnya): judul tepat, tahun benar, semua label dan nilai ada, kotak foto berukuran 113,39 x 170,08 pt (toleransi 0,5), tidak ada kata "tanda tangan".
2. **Tata letak 1 halaman per orang**, termasuk alamat sangat panjang, nama panjang, semua field kosong, dan data campuran karakter aneh.
3. **Hak akses**: tiap peran (UTAMA, admin kecamatan, kelurahan terkunci, GSM Katolik/Kristen, Kemenag per layanan) hanya mendapat baris yang diizinkan server; massal tidak bisa memilih kecamatan di luar haknya.
4. **Data segar**: ubah data lalu unduh lagi, cover mengikuti data baru (tidak memakai cache 3 menit).
5. **Ketahanan**: gagal jaringan, sesi berganti di tengah, klik ganda, pustaka gagal dimuat, 0 data, 151+ data (dipecah), pembatalan di tengah.
6. **Pemeriksa proyek**: `npm run check-lines`, `npm run check-css`, regresi UI lama (92/99/104), build.
7. **Uji perusakan (mutasi)**: ukuran kotak foto diubah, label dihapus, pembungkus dimatikan, filter hak akses dimatikan, penanda segar dimatikan; semuanya harus tertangkap.
8. **Browser nyata**: Chrome terbaru dan emulasi Chrome lama; PDF dirender ke gambar untuk pemeriksaan visual.
9. **Cetak ke kertas** (oleh Anda, P7): kotak foto benar-benar 4x6 cm diukur dengan penggaris. Saya tidak bisa menguji ini dari sini; pada P7 mohon dicek, dan pengaturan cetak harus "Skala 100% / Ukuran sebenarnya", bukan "Muat ke halaman".

---

## 10. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Ukuran kotak foto tidak 4x6 cm saat dicetak (karena skala printer/PDF viewer) | Gambar dengan satuan fisik tepat; beri catatan di dialog: "Cetak dengan skala 100%"; verifikasi penggaris di P7 |
| Tombol per baris hilang saat tabel dirender ulang | Delegasi klik + pengamat DOM, diuji dengan gulir dan ganti halaman |
| Menyentuh berkas yang mepet batas baris | Seluruh logika di berkas baru; `index.html` hanya naik `?v=` |
| Data pribadi tercetak berlebihan | Hanya peran berhak; kaki halaman mencatat pencetak; opsi samar (K5) |
| Teks hilang karena karakter non-Latin-1 | Padanan ASCII dahulu, uji dengan data produksi nyata (kolom alamat/nama) |
| PDF besar membuat HP macet | Batas 150 halaman per berkas, yield per 10 halaman, indikator progres |
| Konflik dengan peran yang tidak punya Data Detail | Modul dimuat hanya saat modal Data Detail dibuka; tidak ada tombol di tempat lain |

---

## 11. Jalan balik

Murni berkas baru. Rollback = `git revert` satu commit (hapus modul + kembalikan `?v=`). Tidak ada migrasi, tidak ada data tersentuh, tidak ada fungsi `api` yang berubah, jadi tidak perlu tindakan di Supabase.

---

## 12. Kriteria selesai

- Satu klik pada baris menghasilkan PDF 1 halaman berjudul benar, data lengkap, kotak 4x6 cm, tanpa tanda tangan.
- Unduh massal per Kecamatan/Layanan menghasilkan PDF berhalaman = jumlah penerima (dipecah bila banyak).
- Hanya data yang berhak dilihat peran itu yang muncul; data selalu segar.
- Semua uji §9 lulus, termasuk mutasi; Anda sudah mencetak satu contoh dan ukuran fotonya sesuai.

---

## 13. Di luar lingkup (bisa jadi permintaan terpisah)

- Menarik foto penerima dari Google Drive atau unggah pas foto ke aplikasi dan mencetaknya di kotak (butuh penyimpanan, izin, dan ukuran berkas).
- Cover untuk status selain Memenuhi Syarat (bila K1 dijawab lain, plan direvisi: sumber memakai Lihat Data).
- Tanda tangan, nomor surat, kop dan logo (belum diminta).
- Penggabungan cover dengan berkas Drive (KTP, buku rekening) menjadi satu PDF utuh.
- Arsip PDF di server.
