# Plan: Dropdown Kelurahan pada Unduh Cover PDF

> Dibuat 2026-10-26, **dipersempit pada hari yang sama**. User mengonfirmasi bahwa unduh cover **tidak bermasalah**; yang diminta hanya **menambahkan Kelurahan**.
> **STATUS: RENCANA. Belum ada kode.** Murni frontend (tanpa server, tanpa database, tanpa CSS baru).
> Fitur terkait: Cover Berkas Penerima (`public/js/app-cover-berkas.js`, LIVE sejak 2026-10-25).

## Daftar isi
1. Permintaan dan lingkup
2. Fakta yang relevan (hasil penelusuran)
3. Desain
4. Berkas yang berubah
5. Tahapan
6. Rencana uji
7. Risiko dan mitigasi
8. Keputusan terbuka
9. Opsi yang ditunda
10. Catatan realisasi

---

## 1. Permintaan dan lingkup
**Diminta:** pada dialog "Unduh Cover Berkas Penerima" (tombol **Unduh Cover PDF** di Data Detail) tambahkan dropdown **Kelurahan**, di samping Kecamatan dan Layanan yang sudah ada.
**Dalam lingkup:** dropdown Kelurahan (berantai dengan Kecamatan), penyaringan 3 kunci, nama berkas ikut memuat kelurahan, ringkasan jumlah mengikuti pilihan, pengujian.
**Di luar lingkup (sengaja tidak diubah):** mekanisme unduh (PDF per 150 halaman, unduhan berurutan), isi dan tata letak cover, tombol "Cover" per baris, urutan isi, server/database, filter tabel Data Detail itu sendiri.

## 2. Fakta yang relevan
- Sumber data dialog = `_ddRows` (`app-transaksi.js`): **seluruh** data Data Detail yang boleh dilihat akun itu (server sudah membatasi hak akses; tabel hanya menampilkan 50 baris per halaman, tetapi `_ddRows` memuat semuanya). Setiap baris sudah memuat `kecamatan` dan `kelurahan`.
- Dialog sekarang: dua dropdown (Kecamatan, Layanan), fungsi `nilaiUnik` dan `saring(daftar, kec, lay)`, dan nama berkas `Cover-Berkas_<KEC>_<LAYANAN>_<tanggal>`.
- Akun yang dikunci ke satu kecamatan sudah mendapat Kecamatan terpilih otomatis (`daftarKec.length === 1`).
- **Data nyata (2026-10-26, "Memenuhi Syarat" 2027):** 2.722 penerima, 21 kecamatan, **129 kelurahan**, kelurahan terbesar 168 penerima, dan **1 nama kelurahan muncul di lebih dari satu kecamatan** (kembar antar kecamatan).
- Uji Chrome (server tiruan) memastikan unduh cover yang ada berfungsi: 400 penerima menjadi 3 berkas dengan 150, 150, 100 halaman.

## 3. Desain
**3.1 Dropdown Kelurahan berantai**
- Urutan di dialog: **Kecamatan, Kelurahan, Layanan**. Pilihan pertama "Semua kelurahan".
- Daftar Kelurahan = kelurahan yang benar-benar ada pada data, **dibatasi kecamatan terpilih**. Bila Kecamatan = "Semua kecamatan", daftar memuat seluruh kelurahan.
- **Kunci pencocokan = pasangan (kecamatan, kelurahan)**, bukan nama saja. Nilai opsi berbentuk `KECAMATAN||KELURAHAN`. Ini mencegah kelurahan bernama sama di dua kecamatan tercampur (ada 1 kasus pada data nyata).
- Label: nama kelurahan saja; bila nama itu muncul di lebih dari satu kecamatan pada daftar yang tampil (hanya mungkin saat Kecamatan = "Semua"), label menjadi `KELURAHAN (KECAMATAN)`.
- Mengganti Kecamatan mengembalikan Kelurahan ke "Semua kelurahan" (sama dengan filter Lihat Data). Memilih kelurahan saat Kecamatan = "Semua" tidak mengubah Kecamatan; penyaringan memakai pasangan.
- Akun dengan hanya satu kelurahan pada datanya (mis. akun kelurahan): Kelurahan terpilih otomatis, seperti Kecamatan.
- Penyaringan: `saring(daftar, kec, kel, lay)`; pilihan Layanan tetap seperti sekarang (daftar layanan seluruh data).
- Ringkasan jumlah ("N penerima akan dibuatkan cover (dipecah menjadi X berkas...)") diperbarui saat Kelurahan berubah.
**3.2 Nama berkas:** `Cover-Berkas_<KEC|SEMUA-KECAMATAN>_<KEL|SEMUA-KELURAHAN>_<LAYANAN|SEMUA-LAYANAN>_<YYYY-MM-DD>[_bagian-n-dari-N].pdf` (pembersih `namaAman` yang sama; kelurahan dipotong maksimal 30 karakter seperti kecamatan).
**3.3 Aksesibilitas:** label terhubung ke dropdown (pola yang sudah ada), urutan Tab logis, tidak ada kelas CSS baru (memakai kelas dropdown yang sama dengan Kecamatan/Layanan).
**3.4 Kasus tepi:** kelurahan kosong pada data dikelompokkan ke pilihan "(TANPA KELURAHAN)" agar tidak hilang dari hasil "Semua"; daftar kosong (tidak ada data) tetap ditangani oleh pengecekan yang sudah ada.

## 4. Berkas yang berubah
| Berkas | Perubahan |
|---|---|
| `public/js/app-cover-berkas.js` | dropdown Kelurahan, penyaringan 3 kunci, nama berkas, ringkasan |
| `index.html` | naikkan `?v=` pada `app-pesan-periode.js` (pemuat malas memakai versi ini untuk memuat berkas cover) |
| `scripts/uji/` | uji Node untuk penyaringan/pasangan; skrip uji Chrome dialog (server tiruan) |
| `plans/` | dokumen ini (catatan realisasi) |
Tidak berubah: server, database, `tailwind.css` (tetap diperiksa dengan `npm run check-css`).

## 5. Tahapan
Aturan: lokal dulu, reversibel; commit/push hanya atas perintah user.
| Tahap | Isi | Produksi? |
|---|---|---|
| **L1** | Implementasi dropdown + penyaringan + nama berkas (bagian logika dibuat murni agar bisa diuji di Node) | tidak |
| **L2** | Uji: Node (penyaringan, pasangan, kembar), Chrome dengan server tiruan (data berskala nyata: 129 kelurahan, 1 nama kembar), viewport HP, regresi tombol "Cover" per baris dan isi cover, uji perusakan, `check-css` | tidak |
| **L3** | Commit, push, naikkan `?v=`, uji tampilan di situs live (tanpa data), catatan realisasi | ya (rendah risiko) |
**Jalan balik:** `git revert <commit>` lalu push. Tidak ada perubahan data atau server.

## 6. Rencana uji
**Unit (Node, data karangan)**
- Penyaringan kombinasi Kecamatan x Kelurahan x Layanan, termasuk "Semua" pada tiap kunci.
- **Kelurahan kembar antar kecamatan tidak tercampur** (memilih satu pasangan hanya mengembalikan baris kecamatan itu).
- Daftar kelurahan mengikuti kecamatan terpilih; label berkecamatan hanya untuk nama kembar; kelurahan kosong menjadi "(TANPA KELURAHAN)".
- Nama berkas: karakter berbahaya dibersihkan, panjang dibatasi.
**Chrome sungguhan (server tiruan; jaringan dicegat)**
- Dialog menampilkan Kecamatan, Kelurahan, Layanan; Kelurahan mengikuti Kecamatan dan kembali ke "Semua" saat Kecamatan diganti.
- Memilih satu kelurahan: ringkasan = jumlah baris kelurahan itu; unduhan = 1 PDF dengan jumlah halaman yang sama; nama berkas memuat kelurahan.
- Dua kelurahan sebanding nama di dua kecamatan: hasil tidak tercampur.
- Akun satu kecamatan / satu kelurahan: dropdown terpilih otomatis.
- Viewport 390 px: dialog muat dan dapat digulir.
**Regresi:** tombol "Cover" per baris dan isi PDF satu penerima identik dengan sebelum perubahan; unduh "Semua" tetap menghasilkan jumlah berkas dan halaman yang sama seperti sekarang.
**Uji perusakan:** pencocokan hanya nama (tanpa pasangan), lupa mereset Kelurahan saat Kecamatan berganti, nama berkas tanpa kelurahan: tiap perusakan harus membuat uji gagal.

## 7. Risiko dan mitigasi
| Risiko | Mitigasi |
|---|---|
| Kelurahan kembar tercampur | Kunci pasangan `kec||kel` + uji khusus |
| Cache browser memuat versi lama | Naikkan `?v=` dan uji di situs live |
| Dialog terlalu panjang di HP | Uji viewport 390 px; dropdown memakai kelas yang sama |
| Regresi pada unduh yang sudah baik | Bagian unduh/PDF tidak diubah; uji regresi membandingkan keluaran |

## 8. Keputusan terbuka
Tidak ada yang menghalangi. Dua hal kecil memakai usulan bawaan bila tidak ditolak:
- **K1:** pilihan Kelurahan menampilkan nama saja (label `KELURAHAN (KECAMATAN)` hanya untuk nama kembar). Alternatif: selalu tampilkan jumlah penerima, mis. "TANJUNG SARI (120)".
- **K2:** nama berkas memuat kelurahan (`..._TANJUNG-SARI_...`).

## 9. Opsi yang ditunda (bukan bagian pekerjaan ini)
Dipertimbangkan lalu ditunda karena unduh yang ada tidak bermasalah. Dapat dikerjakan bila nanti ada keluhan:
- Membungkus unduhan multi-berkas menjadi satu ZIP (menghindari izin "unduh beberapa berkas" di Chrome).
- Opsi "pisah per kelurahan" dalam satu ZIP, batas halaman per PDF 300, pengurutan isi cover per Kecamatan/Kelurahan.
- Logo ringan khusus cover.
Ukuran terukur untuk pertimbangan nanti: 150 halaman ≈ 1 dtk dan 0,3 MB; 600 halaman ≈ 3,8 dtk dan 0,9 MB; "Semua" saat ini = 19 berkas.

## 10. Catatan realisasi
### L1 dan L2 — selesai LOKAL (2026-10-26); belum commit/push (L3 menunggu perintah user)
**Dibuat/diubah**
- `public/js/app-cover-berkas.js`: bagian inti (tanpa DOM) kini memuat `daftarKelurahan`, `saringCover` (3 kunci), `kunciKelurahan`, `uraiKunciKelurahan`, `uraiPilihanCover`, `namaDasarBerkas`, dan `namaAman` (dipindah dari bagian layar); dialog menambah dropdown Kelurahan (berantai dengan Kecamatan; nilai = pasangan `KEC||KEL`; label berkecamatan hanya untuk nama kembar; kelurahan kosong = "(TANPA KELURAHAN)"; satu-satunya pilihan terpilih otomatis; mengganti Kecamatan mereset Kelurahan); nama berkas memuat kelurahan (`SEMUA-KELURAHAN` bila tidak dipilih). Fungsi lama `saring()` dihapus (digantikan `saringCover`).
- `index.html`: `app-pesan-periode.js?v=20271037` -> `20271043` (pemuat malas memakai versi ini untuk memuat berkas cover).
- `package.json`: skrip `npm run uji:cover`.
- Uji baru: `scripts/uji/cover-kelurahan.test.mjs` (14 uji logika), `scripts/uji/layar/cover-dialog-kelurahan.mjs` (uji Chrome manual, server tiruan).
**Hasil uji**
- 14 uji Node lulus; **11/11 uji perusakan tertangkap** (satu mutan awal lolos, yaitu spasi liar pada baris pertama; ditutup dengan uji urutan data).
- Regresi: PDF 40 cover versi lama (git HEAD) vs baru **identik** (selain tanggal pembuatan). Unduh "Semua" tetap 3 berkas 150 + 150 + 107 pada data tiruan 407 baris.
- Chrome sungguhan (server tiruan, 407 baris, 6 kelompok kecamatan/kelurahan termasuk 2 kelurahan bernama sama di kecamatan berbeda dan 1 kelurahan kosong): dialog Kecamatan, Kelurahan, Layanan berurutan; berantai dan reset; **kembar tidak tercampur** (100 vs 50 halaman, nama berkas memakai kecamatan dari pasangan); kelurahan + layanan; kelurahan kosong; tombol "Cover" per baris tetap 1 PDF/1 halaman; akun satu kecamatan/satu kelurahan terpilih otomatis; viewport HP 390x800, 360x560, 640x360. Stabil pada 5 lari berturut-turut.
- 75 uji validasi sebelumnya tetap lulus; `npm run check-css` lolos (tidak ada kelas CSS baru).
**Temuan dan perbaikan selama pengujian**
1. **Dialog tidak terjangkau pada HP dimiringkan (640x360)**: dengan tiga dropdown, judul 36 px di atas layar dan tombol Unduh 36 px di bawah layar, tanpa gulir. Diperbaiki: kotak dialog diberi `max-h-[90vh] max-h-[90dvh] overflow-y-auto` (kelas yang sudah ada). Terbukti gagal sebelum dan lulus sesudah perbaikan.
2. Tiga "gagal" awal ternyata kesalahan uji (kecamatan dengan satu kelurahan memang terpilih otomatis; cache data di sessionStorage; Chrome menulis `downloads.htm` ke folder unduhan; tombol ditekan sebelum data tiruan selesai dimuat); ujinya diperbaiki, fiturnya tidak berubah.
**Keterbatasan (belum terbukti)**
- Belum diuji di Chrome lama (< 111), HP asli, atau dengan data produksi sungguhan (data tiruan; sebaran nyata: 2.722 penerima, 129 kelurahan).
- Unduhan massal beruntun (> 150 cover) tetap seperti sebelumnya (tidak diubah, sesuai lingkup).
**Sisa:** L3 (commit, push, uji tampilan di situs live) menunggu perintah user.
