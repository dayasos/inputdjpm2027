# Rencana: "Cek Rumah Ibadah" — cari rumah ibadah & lihat pengurusnya (khusus Admin Utama)

Tanggal: 2026-10-28 · Status: **RENCANA — belum ada kode** · Keputusan K1, K2, K5 sudah dijawab (bagian 7)
Pemilik keputusan: Admin Utama (Dedi) · Dasar: penautan `rumah_ibadah_id` (LIVE 2026-10-27, lihat `plan-penautan-rumah-ibadah-id.md`).

---

## 1. Masalah

Pimpinan bertanya: *"Rumah ibadah A pengurusnya sudah ada? Atas nama siapa?"* Sekarang jawabannya hanya bisa didapat dengan **membuka layanan satu per satu** lalu mencari nama rumah ibadah secara manual.

**Akar masalah (dari membaca kode):**

| Temuan | Lokasi |
|---|---|
| Kotak cari Lihat Data hanya cocok ke Nama / NIK / No.HP; filter: Kecamatan, Kelurahan, Layanan, Status | `index.html` ±1148-1200, `saringDanTampilkanTabel` |
| Baris Lihat Data **sudah membawa** `tempat_tugas` (indeks 8) dan `alamat_tugas` (9) ke browser, tapi tidak dipakai mencari | `penerima.ts` ±217-250 |
| Modal Data Detail **tidak punya pencarian/filter**, hanya tabel 20 kolom | `index.html` ±1644-1700 |
| Pertanyaannya arahnya dari rumah ibadah ke orang; daftar yang ada arahnya dari orang ke rumah ibadah. Rumah ibadah yang **belum punya** pengurus tidak punya baris sama sekali | desain |

Poin terakhir menentukan solusinya: memperluas kotak cari hanya menjawab "ada", tidak bisa menjawab "belum ada".

---

## 2. Tujuan dan batasan

**Tujuan**
- T1. Ketik nama rumah ibadah → tahu: **ada pengurus atau belum**, siapa namanya, layanannya apa, status verifikasinya.
- T2. Saring **semua rumah ibadah yang belum ada pengurus** per kecamatan/kelurahan/jenis (bahan laporan ke pimpinan).
- T3. Panel baru **khusus role UTAMA** (keputusan 2026-10-28). Role lain tidak melihat tombolnya dan server menolak panggilan langsung. Perluasan pencarian Fase 1 di Lihat Data/Data Detail tetap berlaku untuk semua role karena hanya mencari di data yang memang sudah boleh mereka lihat.
- T4. Tidak menambah beban database (paket free; lihat memori koneksi DB).

**Bukan tujuan**
- N1. NIK, No.HP, rekening tidak pernah ditampilkan di panel ini.
- N2. Tidak menyentuh data 2026 (keputusan K5: hanya 2027).
- N3. Tidak mengubah aturan input/penautan yang sudah LIVE.
- N4. Hanya membaca, tidak ada penulisan data.

---

## 3. Pilihan solusi

| Opsi | Isi | "Ada?" | "Belum ada?" | Risiko | Usaha |
|---|---|---|---|---|---|
| **A. Perluas pencarian** | Kotak cari Lihat Data ikut cocok ke tempat/alamat tugas; Data Detail diberi kotak cari & filter | Ya | **Tidak** | Sangat rendah (frontend) | Kecil |
| **B. Panel "Cek Rumah Ibadah"** | Daftar dari sisi rumah ibadah (2.874 baris) digabung penerima tertaut; filter "Belum ada pengurus" | Ya | **Ya** | Rendah (fungsi baca baru) | Sedang |
| C. Kolom rumah ibadah di tabel utama | Tambah kolom di Lihat Data | Ya | Tidak | Sedang (tabel sudah lebar) | Sedang |

**Rekomendasi: A (Fase 1, cepat) lalu B (Fase 2-4, jawaban utama). C tidak dikerjakan.**

---

## 4. Rancangan Fase 2 (inti)

### 4.1 Tampilan
- Tombol **"Cari Rumah Ibadah"** di header Lihat Data, sebelah tombol Data Detail. Tampil **hanya untuk UTAMA** (pola sama dengan `btn-verifikasi-massal`: `classList.toggle('hidden', role !== "UTAMA")`).
- Modal (pola sama dengan modal Data Detail, termasuk a11y `modal-a11y.js`).
- Filter: kotak cari (nama/alamat rumah ibadah), Jenis (Masjid, Musholla, Gereja, PGK, Vihara/Klenteng/Kuil), Kecamatan → Kelurahan, **Status pengurus**: Semua / Sudah ada / Belum ada.
- Kartu ringkas: *"2.874 rumah ibadah · N sudah ada pengurus · M belum"* (mengikuti filter aktif).
- Tabel hasil, paginasi di server (25 baris/halaman): Jenis · Nama · Alamat · Kecamatan · Kelurahan · **Status** (badge) · **Pengurus** (nama + layanan + status verifikasi; bila banyak: "3 orang", klik untuk rincian).
- Di HP baris menjadi kartu, bukan tabel lebar.

### 4.2 Backend (fungsi baru, read-only)
`cariRumahIbadahPengurus(token, { cari, jenis, kecamatan, kelurahan, status, page, limit })` di `domains/master.ts`, didaftarkan di `index.ts` dan `api-bridge.js` (TTL ±60 detik, domain `penerima` agar cache ikut terbuang saat data berubah).

Alur:
1. `wajibSesi`; **tolak bila `sesi.role !== "UTAMA"`** (pola sama dengan `ambilDaftarRumahIbadahAdmin`). Utama melihat semua, jadi tidak ada penyaringan wilayah/GSM.
2. **Satu kueri SQL terpaginasi**: `rumah_ibadah` LEFT JOIN agregat penerima tahun aktif per `rumah_ibadah_id` (indeks `idx_penerima_rumah_ibadah_id` sudah ada). Menghasilkan `jumlah_pengurus`, total untuk kartu ringkas, dan filter Sudah/Belum ada.
3. Untuk ≤ `limit` rumah ibadah di halaman itu saja, ambil penerima tertaut (id, nama, layanan, status_verifikasi) sebagai daftar pengurus. NIK/HP/rekening tidak diambil.

Satu-satunya penjaga akses adalah pemeriksaan role di langkah 1, jadi wajib ada uji penolakan untuk tiap role lain.

### 4.3 Hak akses
| Role | Hasil |
|---|---|
| UTAMA | semua rumah ibadah; nama + layanan + status verifikasi pengurus |
| KECAMATAN, KEMENAG, MUI, BIMAS KATOLIK/KRISTEN | tombol tersembunyi; panggilan langsung ke API ditolak ("Akses ditolak: khusus Admin Utama") |

### 4.4 Definisi "pengurus" (K1 — diputuskan)
Pengurus = **setiap penerima 2027 dengan layanan apa pun yang tertaut (`rumah_ibadah_id`) ke rumah ibadah itu**; layanannya ditampilkan di samping nama. Tidak ada daftar layanan per jenis.
Catatan: yang pasti tertaut hanya 12 layanan wajib-daftar (+ ±170 data lain yang kebetulan cocok). Bilal Jenazah, Penggali Kubur, dan Guru Maghrib Mengaji bertempat "RUMAH" tidak tertaut sehingga tidak terhitung; panel diberi catatan kecil soal ini.

---

## 5. Tahapan kerja

| Fase | Isi | Berkas | Risiko / pemulihan |
|---|---|---|---|
| **F0 Ukur** | Hitung (baca saja): rumah ibadah ber-penerima vs kosong per jenis/kecamatan; jumlah penerima layanan wajib tanpa `rumah_ibadah_id`; kecepatan kueri gabungan | `execute_sql` SELECT | Nol |
| **F1 Perluas pencarian (Opsi A)** | Kotak cari Lihat Data ikut cocok ke tempat/alamat tugas (placeholder diperbarui). Data Detail: kotak cari + filter Kecamatan/Kelurahan/Layanan (di browser, data sudah ada) | `app-core.js`, `app-transaksi.js`, `index.html`; bila ada kelas Tailwind baru: `npm run build:css` + commit CSS, cek `npm run check-css` | Rendah; mundur = revert frontend |
| **F2 Fungsi baca baru** | `cariRumahIbadahPengurus` + uji lokal: UTAMA berhasil, setiap role lain ditolak; uji filter Sudah/Belum ada dan paginasi | `master.ts`, `index.ts`, `api-bridge.js`, `scripts/uji/` | Fungsi baru terpisah; mundur = deploy versi api sebelumnya |
| **F3 Panel & modal** | Tombol (tersembunyi selain UTAMA), modal, filter, kartu ringkas, tampilan HP, skeleton, keadaan kosong & galat | `index.html`, berkas baru `app-cek-rumah-ibadah.js` (pola `app-kelola-ibadah.js`), `sw.js` (daftar berkas, naikkan versi cache) | Rendah |
| **F4 Uji & tayang** | Uji akun Utama + satu akun non-Utama (harus ditolak), uji HP, ukur beban; push; pantau log 1-2 hari | | |
| ~~F5 Ekspor~~ | **Dibatalkan** (K4, 2026-10-28): fitur hanya untuk menjawab pertanyaan pimpinan | | |

Kriteria selesai F1: mengetik nama rumah ibadah di Lihat Data menampilkan penerima yang bertugas di sana. F4: "rumah ibadah A ada pengurusnya?" terjawab < 10 detik oleh Admin Utama, dan akun non-Utama tidak bisa mengaksesnya.

---

## 6. Risiko dan penjagaan

| Risiko | Penjagaan |
|---|---|
| Role non-Utama memanggil API langsung | Pemeriksaan role di server + uji penolakan tiap role; tombol hanya kosmetik |
| Beban DB (paket free, riwayat 5xx koneksi penuh) | Satu kueri terpaginasi + satu kueri ≤ 25 id per halaman, cache 60 dtk, tanpa kueri paralel; tidak memuat 2.874 baris sekaligus |
| Salah paham "belum ada" padahal petugas bertempat tugas bebas | Catatan di panel (4.4) |
| Rumah ibadah kembar nama | Penautan berbasis ID sudah menyelesaikannya; alamat & kelurahan tampil di tiap baris |
| Penerima belum tertaut (input baru gagal tertaut) | F0 mengukur jumlahnya; bila > 0, fungsi memakai cadangan cocok nama+alamat |
| Data pribadi | Tanpa NIK/HP/rekening; hanya nama, layanan, status |

---

## 7. Keputusan

| # | Keputusan | Status |
|---|---|---|
| K1 | Pengurus = layanan apa pun yang tertaut ke rumah ibadah itu | **Diputuskan 2026-10-28** |
| K2 | Panel baru khusus UTAMA (usulan semua role dibatalkan) | **Diputuskan 2026-10-28** |
| K5 | Hanya data 2027 | **Diputuskan 2026-10-28** |
| K3 | Urutan kerja; cakupan: "perluas pencarian dari semua sisi" (bagian 9) | Cakupan diputuskan 2026-10-28; menunggu "mulai" |
| K4 | Ekspor Excel/PDF | **Dibatalkan 2026-10-28** (tidak dikerjakan) |

---

## 8. Yang tidak berubah
Aturan input, penautan ID, verifikasi, Data Detail untuk Pembayaran, cover PDF, ekspor, Cek Status publik.

---

## 9. Cakupan "perluas pencarian dari semua sisi" (keputusan 2026-10-28)

Tujuan: pertanyaan apa pun dari pimpinan bisa dijawab dari salah satu pintu, tanpa membuka layanan satu per satu.

| Pintu | Pencarian sekarang | Pencarian sesudah |
|---|---|---|
| **Lihat Data** (semua role, sisi browser) | Nama, NIK, No.HP | + **Tempat tugas, alamat tugas** (cari nama rumah ibadah → penerimanya), + alamat penerima |
| **Data Detail** (semua role, sisi browser) | tidak ada | Kotak cari di semua kolom teks (nama, NIK, layanan, tempat/alamat tugas, kecamatan, kelurahan, rekening) + filter Kecamatan, Kelurahan, Layanan |
| **Cek Rumah Ibadah** (Utama) | belum ada | Cari **dari rumah ibadah** (nama/alamat) **dan dari orang** (nama pengurus → rumah ibadahnya); filter Jenis, Kecamatan, Kelurahan, Status pengurus (Semua/Sudah/Belum) |

Catatan pelaksanaan:
- Pencarian teks dibuat tidak peka huruf besar/kecil dan mengabaikan spasi ganda (data tempat tugas sudah dirapikan `rapikanTeks`).
- Pencarian di Lihat Data/Data Detail hanya mencari di baris yang sudah dikirim server sesuai hak akses role itu, jadi tidak membuka data baru.
- Pencarian nama pengurus di panel Cek Rumah Ibadah dikerjakan di server (kueri yang sama, tambahan kondisi `exists` pada penerima tertaut), tetap terpaginasi.
- Ekspor tidak dikerjakan.

---

## 10. Catatan pelaksanaan (2026-10-28)

**F0 selesai (baca saja):** 2.874 rumah ibadah → **859 sudah ada pengurus, 2.015 belum** (tahun 2027). Semua penerima 12 layanan wajib-daftar tertaut ID (0 tanpa ID). Layanan bertempat tugas bebas hampir seluruhnya tak tertaut (Bilal 1.386/1.402, Penggali Kubur 427/429, GMM 579/696).

**F1 selesai LOKAL (belum di-commit, belum di-push):**
- Temuan: pencarian Lihat Data ternyata *sudah* mencocokkan tempat tugas; hanya labelnya ("Nama / NIK / No.HP") yang menyesatkan. Sekarang mencari juga alamat penerima dan alamat tugas, dan label diperbarui ("Cari Nama / NIK / HP / Tempat Tugas").
- Pencarian per kata (semua kata harus ada, urutan bebas, spasi ganda diabaikan), dipakai Lihat Data, ekspor Lihat Data (agar "yang tampil = yang diekspor"), dan Data Detail.
- Data Detail: kotak cari (semua kolom teks) + filter Kecamatan/Kelurahan/Layanan, "Ditemukan N dari M Baris"; filter dikosongkan tiap modal dibuka, dipertahankan saat muat ulang realtime.
- Berkas: `index.html`, `public/js/app-transaksi.js` (`?v=20271042`). CSS Tailwind tak berubah (`npm run check-css` OK). Uji: sintaks OK, uji logika pencarian & filter dengan DOM tiruan lulus. **Belum diuji klik di browser sungguhan.**
- Backend tidak berubah.

**Berikutnya:** user uji lokal/tayang F1 → lanjut F2 (fungsi baca `cariRumahIbadahPengurus`, khusus UTAMA).

**F2 selesai LOKAL (2026-10-28, belum commit/deploy):**
- `cariRumahIbadahPengurus` di `supabase/functions/api/domains/master.ts`; didaftarkan di `index.ts` dan `public/js/api-bridge.js` (TTL 60 dtk, domain `penerima`). Khusus UTAMA (peran lain ditolak sebelum kueri data), hanya membaca, tanpa NIK/HP/rekening.
- Tepat 3 kueri per panggilan (ringkasan Sudah/Belum, satu halaman 5-100 baris, pengurus untuk baris halaman itu). Filter: cari per kata (rumah ibadah ATAU nama/layanan pengurus), jenis (termasuk gabungan), kecamatan, kelurahan, status Semua/Ada/Belum. Semua nilai lewat parameter `$n` (`sql.unsafe`).
- Uji: `npm run uji:cek-rumah-ibadah` → 14/14 lulus (akses 6 peran, data pribadi, anti-injeksi, paginasi, beban, galat). Uji lama tetap lulus: rumah-ibadah-id 24/24, tautan-ri 16/16, gerbang-aksi 6/6.
- Kueri dicoba ke database sungguhan (SELECT saja): sintaks benar, ±35 ms untuk pencarian terberat (pindai 2.874 rumah ibadah + 4.026 penerima).
- Fungsi api BELUM di-deploy (menunggu F3/F4 agar sekali tayang bersama tampilan).

---

## 11. Tinjauan kode F1+F2 (2026-10-28, sangat hati-hati) — hasil dan perbaikan

Temuan yang DIPERBAIKI (semua lokal, belum commit):
1. **[Serius, F1] Cover berkas ikut tersaring.** `app-cover-berkas.js` membaca `_ddRows`; setelah F1 variabel itu berisi hasil kotak cari/filter, sehingga "Unduh Cover" bisa diam-diam hanya memuat penerima yang sedang tersaring. Diperbaiki: cover membaca `_ddSemua` (seluruh data, perilaku sama seperti sebelum F1). Skrip itu dimuat malas dengan `?v=` milik `app-pesan-periode.js`, maka versinya dinaikkan ke `20271044`.
2. **[Sedang, F1] Mengetik saat Data Detail masih memuat** menimpa kerangka loading/pesan galat dengan "Belum ada data Memenuhi Syarat". Diperbaiki: pencarian diabaikan sampai data tiba; teks yang sudah diketik langsung dipakai begitu data datang.
3. **[Kecil, F1] Opsi dropdown sisa** dari pembukaan sebelumnya (mis. akun lain di perangkat yang sama) bertahan selama loading. Diperbaiki: dikosongkan tiap modal dibuka.
4. **[Risiko, F2] Parameter array JS di `sql.unsafe`** tidak dijamin ditangani driver (tak ada contoh serupa di kode lain; uji tiruan tidak bisa membuktikannya). Diganti string literal array Postgres + `::text[]`; diverifikasi di database sungguhan (pola `%` dan `_` tetap harfiah). Nomor halaman juga dibatasi 100.000.

Diperiksa dan AMAN: cache SWR (hash dari teks asli, tambahan `_cari` pada objek tidak memicu muat ulang berulang / tidak ikut tersimpan), ekspor Lihat Data (tiga penyaring sama), kolom Lihat Data (indeks 6/8/9/15 benar), tidak ada daftar aksi lain yang perlu diubah (Worker/gerbang), SQL tanpa gabungan teks pengguna, rencana kueri memakai indeks (6,9 ms difilter jenis+kecamatan; 22 ms tanpa filter; 35 ms pencarian teks terberat), uji lama tetap lulus (rumah-ibadah-id 24, tautan-ri 16, gerbang-aksi 6, sinkron-detail 10, cover 14).

Uji baru: `npm run uji:pencarian` (10) dan `npm run uji:cek-rumah-ibadah` (14). Uji mutasi: penjaga pemuatan, penyaring cover, pemeriksaan role UTAMA, dan parameter array — masing-masing ditangkap uji (satu kelemahan uji cover ditemukan lewat mutasi lalu diperkuat).

Catatan/keterbatasan yang SENGAJA tidak diubah:
- Pencarian Lihat Data kini juga mencocokkan alamat penerima dan alamat tugas, jadi kata pendek (mis. "ali") bisa menemukan baris karena nama jalan, bukan nama orang. Konsekuensi dari permintaan "perluas pencarian dari semua sisi".
- Mode tahun arsip (mis. 2026) tetap mencari nama + NIK saja (kolomnya memang tidak ada tempat tugas), sehingga label kotak cari di mode itu lebih luas dari kenyataannya.
- Modal Data Detail di HP kehilangan sedikit tinggi tabel karena baris filter; belum dicoba di perangkat nyata.
- Tidak ada `deno check` (Deno tidak terpasang); jenis-jenis TypeScript ditinjau manual.

---

## 12. F3 selesai LOKAL (2026-10-28, belum commit/deploy)

- **Tombol** "Cek Rumah Ibadah" di header Lihat Data (`index.html`), tersembunyi kecuali UTAMA (`inisialisasiMenuLihatData`, `app-transaksi.js`); bila skrip belum termuat tombol menampilkan toast (pola sama dengan Verifikasi Massal).
- **Modul** `public/js/app-cek-rumah-ibadah.js`, dimuat malas hanya untuk UTAMA lewat `SKRIP_PER_PERAN` di `app-pesan-periode.js`. Modal: 3 kartu ringkasan (Semua / Sudah ada / Belum ada; kartu = filter status), kotak cari (rumah ibadah, alamat, atau nama pengurus; debounce 350 ms), filter Jenis (termasuk gabungan), Kecamatan → Kelurahan (dari tabel wilayah), Reset Filter, daftar 20 baris/halaman dengan paginasi, kartu bertumpuk di HP. Jawaban server yang basi diabaikan (nomor permintaan); sinyal realtime (domain `penerima`/`rumah_ibadah`) memuat ulang pelan-pelan (digabung 1,5 dtk) selagi terbuka; semua teks server di-escape.
- **Versi skrip dinaikkan**: `app-transaksi.js` 20271043, `app-pesan-periode.js` 20271045 (juga membuang cache skrip yang dimuat malas), `api-bridge.js` 20271046 (konfigurasi cache aksi baru; sebelumnya LUPA dinaikkan di F2). `tailwind.css` dibangun ulang dan akan di-commit (`check-css` OK).
- **Uji layar Chrome sungguhan** (server tiruan): `node scripts/uji/layar/cek-rumah-ibadah.mjs` (butuh `npx vite --port 3123 --strictPort`) → 38 pemeriksaan LULUS: tombol hanya UTAMA, debounce, cari dari sisi rumah ibadah & orang, XSS, jawaban basi, kartu status, paginasi, filter wilayah, reset, galat + coba lagi, sinyal realtime, HP 390 px, tutup (tombol/ESC/klik luar), peran lain ditolak. Uji layar cover lama (`cover-dialog-kelurahan.mjs`) tetap 100% lulus; diperiksa juga: setelah Data Detail disaring, dialog "Unduh Cover" tetap memuat semua data (120 dari 120).
- Catatan uji: permintaan identik dalam 60 dtk dilayani dari cache SWR (sesuai rancangan), jadi uji memeriksa tampilan, bukan jumlah panggilan jaringan.

**Urutan tayang yang aman (F4):** deploy fungsi `api` DULU (aksi baru), lalu push frontend. Jika frontend tayang lebih dulu, hanya Admin Utama yang melihat tombolnya dan mendapat pesan galat "Aksi tidak diizinkan" (tanpa efek ke data/role lain).

---

## 13. Tinjauan mendalam F1-F3 (2026-10-28, putaran ke-2) — hasil dan perbaikan

Koreksi atas §11/§12: aksi `cariRumahIbadahPengurus` kini **tanpa cache SWR** (bukan TTL 60 dtk di domain `penerima`); sebagai aksi baca murni ia tetap ada di daftar yang boleh diulang otomatis (`AKSI_BACA_AMAN_DIRETRY`, `api-bridge.js`).

Temuan dan perbaikan (semua lokal, belum commit):
1. **[Serius] Data basi lewat cache.** Jawaban lama yang tiba SESUDAH sinyal "data berubah" mengisi ulang cache SWR dengan data basi, lalu muat ulang otomatis menampilkannya. Untuk pertanyaan "sudah ada pengurusnya?" itu tidak boleh. Diperbaiki: tanpa cache (selalu ke server).
2. **[Sedang] Permintaan membawa kata kunci lama.** Mengubah filter sebelum jeda ketik (350 ms) habis mengirim kata kunci lama dulu (terbukti oleh mutasi uji: `cari:""`), lalu permintaan kedua. Diperbaiki: kata kunci dibaca dari kotak cari saat memuat; tepat 1 permintaan.
3. **[Sedang] Sinyal perubahan saat sedang memuat dibuang.** Diperbaiki: ditandai, lalu dimuat ulang sekali setelah jawaban tiba.
4. **[Sedang] Jawaban server rusak/lama** (tanpa `daftar`, atau `pengurus` hilang) bisa membuat tampilan macet di "Memuat". Diperbaiki: bentuk jawaban dinormalkan. Pesan teknis "Aksi tidak diizinkan" (frontend tayang sebelum fungsi) diganti kalimat ramah.
5. **[Kecil] Fokus papan ketik hilang** setelah kartu/paginasi digambar ulang; di halaman terakhir/pertama fokus kini pindah ke tombol pasangannya (diperbaiki, termasuk kasus tombol nonaktif).
6. **[Kecil] Data pengurus tetap di memori** setelah modal ditutup. Diperbaiki: dibersihkan saat ditutup; dibuka lagi = dimuat segar. (Logout memuat ulang halaman, jadi tak ada kebocoran antar akun.)
7. **[Kecil] `addEventListener` tombol tanpa pengaman null** di `app-transaksi.js` (bila elemen hilang, sisa berkas gagal jalan). Diberi pengaman.

Terbukti dengan sumber (bukan dugaan): pustaka `postgres@3.4.4` — `arraySerializer` meneruskan string apa adanya dan kueri berparameter tanpa prepared statement selalu bertanya tipe parameter ke server (`describeFirst`), jadi literal array `'{"a","b"}'` + `::text[]` di F2 benar (cara yang sama dipakai `escape` array bawaan). Kode sumber diunduh ke folder sementara, hanya dibaca, lalu dihapus.

Verifikasi: uji layar Chrome kini **44 pemeriksaan LULUS** (+6: server lama, jawaban rusak, filter cepat setelah mengetik, fokus ×2, sinyal saat memuat, data dibersihkan). Uji mutasi: 4 perbaikan di atas dimatikan satu per satu, masing-masing tertangkap uji. Regresi: uji node 8 suite lulus (pencarian 10, cek-rumah-ibadah 14, rumah-ibadah-id 24, tautan-ri 16, gerbang-aksi 6, sinkron-detail 10, cover 14, db-koneksi 32), uji layar cover / ibadah-konfirmasi-tautan / kelola-data-validasi lulus, `check-css` OK, semua `public/js/*.js` lolos cek sintaks.

Belum bisa diverifikasi di sini: jalannya fungsi `api` terhadap database sungguhan lewat Edge Function (hanya kueri SQL-nya yang sudah dicoba langsung), dan `deno check` (Deno tidak terpasang).
