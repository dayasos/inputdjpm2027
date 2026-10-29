# Plan: Badge "Rekom MUI Salah" + kalimat rujukan otomatis saat "Salin Catatan MUI"

> Versi **1.1** (2026-10-29) · Status: **RENCANA, belum ada kode.** Menunggu jawaban K1–K4 (§3).
> v1.1 menggantikan v1: kalimat rujukan **hanya** ditambahkan saat tombol *Salin Catatan MUI ke Alasan Verifikasi* diklik (koreksi user), bukan ditampilkan di kotak-kotak catatan.
> Prinsip proyek: bertahap, mudah dibatalkan, uji lokal dulu, deploy/push hanya setelah izin.
>
> **P1+P2 SELESAI di lokal (2026-10-29, belum commit-push/deploy):** semua usulan dipakai (K1 hanya status Rekom MUI Salah; K2 ejaan persis + titik; K3 satu baris menyambung; K4 klik ganda dicegah; K5 semua label L1-L7 + judul kotak merah petugas kecamatan "⚠️ Catatan MUI: Rekom MUI Salah"; K6 string server diganti, **menunggu izin deploy `api` v101**). Perubahan: `app-transaksi.js` (+16 baris; fungsi `teksSalinCatatanMui`, handler Salin, label), `index.html` (tulisan opsi filter, nilai TIDAK diubah; `?v=` app-transaksi 20271054, app-pesan-periode 20271054), `app-verifikasi-massal.js`, `penerima.ts` (satu string). Uji: `uji-rekom` 30 lulus (menjalankan KODE ASLI hasil ekstraksi dari berkas: fungsi, handler Salin dgn kolom kosong/terisi/klik ganda/status Sesuai/HTML di catatan, badge, nilai filter lama tetap, pesan server); visual Chrome badge; `deno check` 9 galat lama (tak bertambah); `verify-html` lulus. Catatan: `app-transaksi.js` 3.702 baris (sudah >3.500 sebelumnya, utang teknis lama).
>
> **REVIEW MENDALAM (2026-10-29):** ditemukan & diperbaiki — (1) kalimat verifikasi massal janggal "rekomendasi MUI-nya Salah (Rekom MUI Salah)" -> "yang berstatus Rekom MUI Salah"; (2) catatan berakhir koma/titik dua/titik koma menghasilkan ",. Silahkan" -> tanda baca di ujung dibuang HANYA pada status Rekom MUI Salah (status lain disalin apa adanya). Diperiksa dan aman: tak ada sisa teks "Perlu Koreksi" selain kunci internal (nilai opsi filter + kode status); tak ada bentrok nama konstanta antar-skrip; kolom Keterangan Verifikasi kosong saat dibuka (tak ada alasan lama yang bisa bentrok dgn pengecekan duplikat); jenis toast "info" valid. Uji `uji-rekom` kini 38 lulus. **Belum terbukti:** alur penuh modal Detail di data nyata (handler diuji lewat kode aslinya hasil ekstraksi, bukan lewat modal utuh karena `renderBaca` berada dalam closure besar) -> perlu uji klik user.

## 1. Permintaan

1. Badge **"MUI: Perlu Koreksi"** diganti menjadi **"Rekom MUI Salah"**.
2. **Apa pun** catatan Verifikator MUI, **sistem menambahkan di belakangnya** kalimat *"Silahkan ke MUI Kota Medan untuk penerbitan Rekomendasi MUI"* — **terjadi setelah Admin Utama menekan "Salin Catatan MUI ke Alasan Verifikasi"** (kalimat masuk ke isi kolom Alasan/Keterangan Verifikasi).

## 2. Temuan di kode

Status di database/API tetap kode **`PERLU_KOREKSI`** (kontrak API, filter, verifikasi massal, kolom DB bergantung padanya). Yang berubah hanya **teks yang dilihat orang**. Tanpa migrasi database.

### 2a. Label status (diganti menjadi "Rekom MUI Salah")

| # | Lokasi | Teks sekarang | Dilihat oleh |
|---|---|---|---|
| L1 | `public/js/app-transaksi.js:2116` (`badgeRekomendasiMui`) | `⚠️ MUI: Perlu Koreksi` | **badge di tabel Lihat Data** (tangkapan layar user) |
| L2 | `app-transaksi.js:2624` | `⚠️ Perlu Koreksi MUI` | badge modal Detail, Admin Utama |
| L3 | `app-transaksi.js:2585` | `⚠️ Perlu Koreksi / Tidak Sesuai` | badge modal Detail, akun MUI |
| L4 | `index.html:1201` | `⚠️ MUI: Perlu Koreksi` | opsi filter Verifikasi (nilai `value="MUI: Perlu Koreksi"` dipakai logika di `app-transaksi.js:2040`/`:3273` → **nilai TIDAK diubah, hanya tulisan**) |
| L5 | `app-transaksi.js:2609` | `Perlu Koreksi (Salah / Tidak Terdaftar / Buram / Palsu)` | pilihan status akun MUI |
| L6 | `app-transaksi.js:2882` (toast) dan `supabase/functions/api/domains/penerima.ts:1305` (pesan server) | `…wajib diisi jika status Perlu Koreksi.` | akun MUI/Admin |
| L7 | `public/js/app-verifikasi-massal.js:119`, `:150` | `…rekomendasi MUI-nya Perlu Koreksi…` | Admin Utama |

### 2b. Tombol Salin (tempat kalimat rujukan ditambahkan)

`app-transaksi.js:2917-2928`: klik **Salin Catatan MUI ke Alasan Verifikasi** menambahkan `"[CATATAN REKOMENDASI MUI]: " + catatan` ke kolom **Keterangan Verifikasi** (`#input-keterangan-verifikasi`); bila kolom sudah terisi, ditambahkan di baris baru. Kolom ini yang kelak tersimpan sebagai alasan verifikasi dan dibaca petugas kecamatan.

Kotak catatan MUI di layar (Admin Utama, petugas kecamatan, akun MUI) **tidak diubah**.

## 3. Keputusan yang perlu dijawab (dengan usulan)

| # | Pertanyaan | Usulan |
|---|---|---|
| **K1** | Kalimat ditambahkan **hanya bila status "Rekom MUI Salah"**, atau juga bila status lain tetapi ada catatan? (tombol Salin muncul untuk catatan berstatus apa pun) | **Hanya bila status Rekom MUI Salah**; status lain menyalin catatan apa adanya. Alasan: pada status Sesuai kalimat "Silahkan ke MUI… penerbitan Rekomendasi" menyesatkan. *(Bila Anda ingin benar-benar "apa pun", jawab: semua status.)* |
| **K2** | Ejaan: **"Silahkan"** (baku: *Silakan*) dan tanda baca penutup | **Persis tulisan Anda + titik di akhir**: `Silahkan ke MUI Kota Medan untuk penerbitan Rekomendasi MUI.` |
| **K3** | Susunan hasil salinan | `[CATATAN REKOMENDASI MUI]: <catatan>. Silahkan ke MUI Kota Medan untuk penerbitan Rekomendasi MUI.` — satu baris, kalimat menyambung di belakang catatan. Bila catatan sudah berakhiran `.` `!` `?`, tidak ditambah titik lagi |
| **K4** | Tombol Salin yang diklik **dua kali** sekarang menambah baris yang sama dua kali (perilaku lama). Dicegah? | **Dicegah**: bila isi kolom sudah memuat teks salinan yang sama persis, tidak ditambah lagi (cukup toast "Catatan MUI sudah ada di Keterangan Verifikasi."). Hanya dua baris kode; boleh ditolak bila ingin perilaku lama |
| **K5** | Penggantian label: hanya badge tabel (L1) atau semua label status L1–L7 agar seragam? | **Semua (L1–L7)**: badge tabel & detail "Rekom MUI Salah"; filter "⚠️ Rekom MUI Salah"; pilihan akun MUI "Rekom MUI Salah (Tidak Terdaftar / Buram / Palsu)"; toast, pesan, dan kotak "Lewati" verifikasi massal ikut istilah baru |
| **K6** | Pesan server L6 (`penerima.ts`) ikut diganti? Butuh **deploy fungsi `api` v101**; bila tidak, pekerjaan 100% frontend (cukup push) | **Ikut diganti bila Anda mengizinkan deploy**; pesan itu jarang tampil (hanya bila pemeriksaan di browser terlewati), jadi boleh ditunda tanpa dampak |

## 4. Rancangan teknis

Hanya **frontend** (+ satu string server bila K6).

1. Konstanta dan fungsi kecil dekat `badgeRekomendasiMui` di `app-transaksi.js`:
   ```js
   const KALIMAT_RUJUKAN_MUI = 'Silahkan ke MUI Kota Medan untuk penerbitan Rekomendasi MUI.';
   function teksSalinCatatanMui(catatan, statusMui) // -> "[CATATAN REKOMENDASI MUI]: <catatan>[. ]Silahkan …"  (kalimat hanya bila statusMui === 'PERLU_KOREKSI', K1)
   ```
   Catatan di-`trim`; titik hanya ditambah bila belum ada `.`/`!`/`?` di akhir; bila catatan sudah memuat kalimat rujukan, tidak ditambah lagi.
2. Handler tombol Salin (`:2917`) memakai fungsi itu. Teks ditulis ke `textarea.value` (bukan HTML → tanpa celah XSS). `statusMui` sudah tersedia di lingkup yang sama.
3. K4: sebelum menambah, periksa apakah `taKet.value` sudah memuat teks yang sama → tampilkan toast dan berhenti.
4. Label L1–L5, L7 diganti sesuai K5; `value` opsi filter L4 **tidak diubah**.
5. `app-transaksi.js` sudah **3.686 baris (> batas 3.500, sudah begitu sebelumnya)**; penambahan ±10 baris, tidak membuat berkas baru (fungsi dipakai hanya di berkas itu). Dicatat sebagai utang teknis yang sudah ada.
6. Bila K6: ganti satu string di `penerima.ts:1305` + deploy `api` v101.
7. Naikkan `?v=` di `index.html` (`app-transaksi.js`; `app-verifikasi-massal.js` ikut lewat `app-pesan-periode.js`).

## 5. Tahapan kerja

| Tahap | Isi | Sifat |
|---|---|---|
| **P0** | Jawaban K1–K6 | keputusan |
| **P1** | Ganti label L1–L7; fungsi `teksSalinCatatanMui` + handler Salin; uji jsdom | lokal |
| **P2** | Uji visual Chrome: badge di tabel, filter, modal Detail Admin Utama (klik Salin → isi Alasan Verifikasi), modal akun MUI, kotak "Lewati" verifikasi massal | lokal |
| **P3** | `?v=`, commit; (K6) deploy `api` v101; push; uji klik user | produksi, **izin dulu** |

## 6. Daftar uji

- Badge tabel Ustadz/Ustadzah berstatus Salah → "Rekom MUI Salah"; status Sah/Belum diperiksa tidak berubah.
- Filter "Rekom MUI Salah" menyaring data yang sama (jumlah baris sebelum = sesudah ganti nama).
- Klik Salin pada status Salah, catatan `rekomendasi harus dari mui kota medan` → kolom berisi `[CATATAN REKOMENDASI MUI]: rekomendasi harus dari mui kota medan. Silahkan ke MUI Kota Medan untuk penerbitan Rekomendasi MUI.`
- Catatan berakhiran `.`/`!`/`?` tidak diberi titik tambahan; catatan yang sudah memuat kalimat rujukan tidak digandakan.
- Kolom sudah berisi teks lain → salinan ditambahkan di **baris baru** (perilaku lama terjaga).
- Klik Salin dua kali → tidak menggandakan (K4).
- Status Sesuai dengan catatan opsional → salinan tanpa kalimat rujukan (K1).
- Catatan berisi `<b>`/tanda kutip → masuk apa adanya sebagai teks (tidak menjadi HTML).
- Kotak catatan di layar (Admin, petugas kecamatan, akun MUI) **tidak berubah**.
- Regresi: verifikasi massal (jumlah "Lewati" sama), `check-lines` (pre-existing), `verify-html`; pencarian teks "Perlu Koreksi" tinggal menyisakan kode `PERLU_KOREKSI`/komentar.

## 7. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Kalimat rujukan ikut tersalin pada rekomendasi yang Sah | K1: hanya status Salah |
| Kalimat ganda bila verifikator sudah menulisnya sendiri atau Salin diklik dua kali | Dedup (K4 + cek kalimat sudah ada) |
| Nama baru tidak seragam di sebagian layar | Inventaris L1–L7 + pencarian teks sebelum selesai |
| Salah ubah `value` filter → filter rusak | Nilai opsi L4 tidak diubah; ada uji jumlah baris |

## 8. Jalan balik

Frontend: `git revert` commit fitur. Fungsi `api`: bila K6 dipakai, deploy ulang kode v100 (hanya satu string berbeda). Tanpa migrasi database; tidak ada data yang diubah.

## 9. Di luar lingkup

Mengubah kode status di database (`PERLU_KOREKSI`), mengubah isi catatan lama di database, menampilkan kalimat rujukan di kotak-kotak catatan (tidak diminta), mengubah alur verifikasi MUI.
