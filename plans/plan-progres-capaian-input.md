# Plan: Progres Capaian Input (matriks Kecamatan/Kelurahan + Kemenag) + Unduh PDF

> Versi **1.2** (2026-10-29) · Status: **RENCANA DISETUJUI BENTUKNYA, belum ada kode.** Menunggu "mulai" untuk P1.
> **P1 SELESAI di lokal (2026-10-29, belum commit/deploy):** `getCapaianInput` ada di `supabase/functions/api/domains/kuota.ts`, terdaftar di `api/index.ts` dan `public/js/api-bridge.js` (cache 5 mnt, domain kuota). Sintaks lolos (esbuild); Deno tidak terpasang di mesin ini sehingga logika diuji dengan SQL baca-saja pada data nyata. Temuan: 11 layanan Kecamatan, 6 layanan Kemenag, 151 kelurahan/21 kecamatan, **0 kelurahan penerima yang tak cocok dengan `wilayah`**, semua layanan penerima ada di master; Kecamatan 3.433 input / kuota 7.890, Kemenag 1.011 / 6.075; **34 kelurahan belum ada input sama sekali** (layanan Kecamatan). Keputusan orientasi: matriks A (11 kolom) → **A4 landscape**; matriks B dibuat **kecamatan (21 baris) × 6 layanan** agar muat portrait.
> **P2 SELESAI di lokal (2026-10-29, belum commit/deploy):** `public/js/app-capaian-input.js` (baru, dimuat malas UTAMA lewat `SKRIP_PER_PERAN` di `app-pesan-periode.js`; **`index.html` tidak diubah**, tab disuntik oleh skrip dan isi Dashboard lama hanya dibungkus). CSS memakai kelas `ci-*` yang disuntik skrip, jadi **tidak perlu build Tailwind**. Cache `getCapaianInput` dipindah ke domain `dashboard` (TTL 3 mnt) karena datanya bergantung pada penerima + kuota. Uji jsdom 36 lulus (hak akses, pembungkus, matriks A 21×11, matriks B 21×6, rincian Medan Area, kelurahan 0 input, sel 0, sel tanpa kuota, keterangan, realtime digabung 1x, galat server); uji visual Chrome desktop (1440) + tanpa luapan mendatar di lebar HP (512). Data uji = sintetis (fungsi server belum dideploy). **Sisa untuk P4:** naikkan `?v=` di `index.html` agar skrip baru tidak tertahan cache; belum diuji di akun nyata.
> **P3 SELESAI di lokal (2026-10-29, belum commit/deploy):** `public/js/app-capaian-input-pdf.js` (baru; penggambar jsPDF, dimuat malas saat tombol Unduh diklik bersama `vendor/jspdf.umd.min.js`) + kontrol "pilihan cakupan + Unduh PDF" di `app-capaian-input.js` (data diminta SEGAR lewat argumen penanda `ci<waktu>`, layar ikut disegarkan dgn angka yang sama). Cakupan: **Semua** (23 hlm, A4 landscape: hlm 1 = kartu ringkasan + matriks A, hlm 2 = matriks B, lalu 1 hlm rincian per kecamatan), **satu kecamatan** (1 hlm landscape), **satu layanan Kemenag** (1 hlm portrait: input, kuota, sisa, % capaian). Nama berkas `Laporan-Capaian-Input-DJPM-2027_{SEMUA|NAMA-KECAMATAN|LAYANAN-NAMA}_{YYYY-MM-DD}.pdf` (tanggal WIB dari jam server). Keterangan warna di bawah tiap tabel, sel tanpa kuota abu-abu. Uji: jsdom 50 lulus (tambahan alur unduh: data segar, 3 cakupan, klik ganda, galat server, sesi berganti), render visual pdf.js di Chrome (3 jenis PDF diperiksa; ditemukan & diperbaiki: nama kecamatan terpotong, teks "Belum ada input" menimpa nama, judul kolom terputus di tengah kata, keterangan salah pada PDF per layanan). Ukuran: Semua ±91 KB. Data uji = sintetis. Belum diuji: akun nyata, Acrobat/HP.
> **REVIEW MENDALAM P1-P3 (2026-10-29, setelah P3):** ditemukan & diperbaiki — (1) **BUG DATA**: baris kuota bernilai 0 dianggap "ada kuota" -> tampil merah "0/0 0%" padahal di produksi banyak pasangan layanan x kecamatan bernilai 0 (Guru Sekolah Hindu 17/21 kecamatan, Kong Hu Chu 19/21, Buddha 9/21, Petugas Gereja Katolik 4/21); kini server **tidak memasukkan kuota 0** ke peta `kuota`, jadi sel abu-abu (D10). (2) jam di layar memakai zona waktu perangkat sedangkan PDF WIB -> layar kini WIB juga. (3) keterangan PDF bisa menimpa kaki halaman bila tabel mentok (diberi pemeriksaan; sempat terlalu ketat sehingga keterangan terlempar sendirian ke hlm 2 -> dilonggarkan, kembali 23 hlm). (4) fokus papan ketik hilang setelah baris kecamatan dibuka -> dikembalikan. (5) baris "kelurahan tak terdaftar" kini bertanda "Tidak ada di daftar kelurahan" (layar+PDF). (6) fungsi mati `namaPendek` dibuang. Uji tambahan: **logika server ASLI (`kuota.ts`) dijalankan lewat esbuild dengan db/sesi/master ditiruan, 24 pemeriksaan lulus** (hak akses, kuota 0/teks, penjumlahan grup, layanan non-master, kecamatan di luar daftar, kelurahan salah ketik/kosong, invarian Σ kelurahan = input kecamatan, galat DB tidak melempar); tab Progres Verifikasi lama dicek visual (gulir & footer normal); PDF diuji ekstrem (48 kelurahan -> pindah halaman + kepala berulang, nama sangat panjang, pencetak panjang); `deno check`: 0 galat di `kuota.ts` (9 galat lama di master/penerima/pembayaran/sesi, bukan dari pekerjaan ini); verify-html lulus; SW (`network-first` untuk /js/) dan CSP (hanya /cek-status*) tidak bermasalah. **Belum terbukti:** fungsi server di database produksi (belum dideploy), akun nyata, Firefox/Safari/Acrobat/HP, `?v=` index.html belum dinaikkan.
> Menggantikan v1.1 (kartu kelurahan). Prinsip: bertahap, tiap tahap bisa dibatalkan, uji lokal dulu, deploy hanya setelah izin.

## 1. Tujuan & keputusan

Bahan laporan ke **pimpinan**, lalu diteruskan ke **tiap kecamatan** (layanan Kecamatan) dan ke **Kemenag**. Hanya **progres input** (status verifikasi sudah ada di Dashboard Verifikasi, tidak diulang).

| # | Keputusan | Sumber |
|---|---|---|
| D1 | Dua bagian: **A. Layanan Kecamatan** dan **B. Layanan Kemenag** | user |
| D2 | A turun sampai **kelurahan** | user |
| D3 | B: **semua layanan Kemenag** turun ke **21 kecamatan** (bukan hanya GMM) | user, contoh 2 |
| D4 | Bentuk **tabel matriks berwarna**, bukan kartu per kelurahan; kartu hanya untuk angka ringkasan | usulan, disetujui |
| D5 | Isi sel = **jumlah input** (semua status, termasuk belum diverifikasi). Kuota hanya di level kecamatan/layanan; kelurahan **tanpa kuota** | user + usulan |
| D6 | Letak: **tab "Capaian Input"** di modal tombol **Dashboard** (tab lain = Progres Verifikasi yang sekarang, tidak diubah) | usulan, disetujui |
| D7 | **PDF dengan tampilan sama** dengan layar, dari model data yang sama | user |
| D9 | **Semua layanan diikutsertakan** (seluruh `master.kecamatan` dan `master.kemenag`), walau belum ada input atau belum ada kuota. Sel yang inputnya 0 **ditulis "0"** (tidak dikosongkan atau diganti "-"). Berbeda dengan Progres Kuota lama yang menyembunyikan layanan tanpa kuota | user, 2026-10-29 |
| D10 | Layanan **tanpa kuota** di suatu kecamatan: sel ditulis `0` berwarna **abu-abu netral** (bukan merah). **Keterangan (legenda) di bawah setiap tabel**, di layar dan PDF | user, 2026-10-29 |
| D11 | **Filter kecamatan untuk TAMPILAN** ("Tampilkan data": Semua Kecamatan / satu kecamatan), terpisah dari pilihan cakupan PDF. Dipilih kecamatan -> ringkasan, bagian A (langsung tabel semua kelurahannya) dan bagian B (satu baris kecamatan itu) HANYA memuat kecamatan itu; pilihan PDF otomatis mengikuti (kecuali pilihan "layanan Kemenag"). Ditambahkan 2026-10-29 setelah user mengira pilihan PDF adalah filter ("saya klik medan amplas, data masih kota medan") | user |
| D8 | Hanya **Admin Utama**; tanpa kop/tanda tangan/nomor surat; nama berkas `Laporan-Capaian-Input-DJPM-2027_{SEMUA\|LAYANAN\|KECAMATAN}_{YYYY-MM-DD}.pdf` | usulan (konsisten dengan PDF Dashboard) |

## 2. Temuan di kode sekarang

1. Sudah ada **"Progres Kuota"** (`btn-progres-kuota`, `public/js/app-admin.js:1-87`, `getProgresKuota` di `supabase/functions/api/domains/kuota.ts:65`): input vs kuota per layanan × kecamatan, khusus UTAMA, tanpa kelurahan dan tanpa PDF. Fitur baru ini menggantikannya (dialihkan di P5) agar tak ada dua sumber angka.
2. Dashboard Verifikasi sudah punya PDF (`public/js/app-laporan-progres.js`, jsPDF di `public/js/vendor/`) → pola, pemuat malas, dan gotcha-nya dipakai ulang.
3. Kuota hanya ada **per Kecamatan × Layanan** (`kuota`, `kuota_katolik`). Kelurahan resmi ada di tabel `wilayah`, sehingga kelurahan 0 input tetap bisa ditampilkan.
4. Jumlah layanan Kecamatan menentukan lebar matriks (portrait vs landscape) → dicek di P1 dari `master`.

## 3. Isi laporan (layar = PDF)

**Halaman 1 – Ringkasan Kota** (pimpinan)
- 4 kartu: Total input · Total kuota · % capaian · Jumlah kelurahan belum ada input.
- **Matriks A**: 21 kecamatan (baris) × layanan Kecamatan (kolom). Sel = `input/kuota` + persen, warna ambang `warnaProgresKuota` (merah <25, oranye <50, kuning <75, hijau muda <100, hijau tua ≥100). Baris total + kolom total.

**Bagian B – Layanan Kemenag**
- **Matriks B**: layanan Kemenag (baris) × 21 kecamatan (kolom), sel `input/kuota` + warna, sama gayanya. Bila terlalu lebar untuk portrait → dibalik atau landscape (diputuskan di P1/P3).
- Tiap layanan Kemenag juga bisa dicetak/diunduh **sendiri** (daftar 21 kecamatan) untuk dikirim ke unit Kemenag terkait.

**Rincian per Kecamatan** (untuk dikirim ke kecamatan; 1 kecamatan = 1 halaman = 1 PDF)
- **Kelurahan (baris) × layanan Kecamatan (kolom)**; sel = jumlah input saja.
- Baris bawah: **Total kecamatan `input/kuota` + persen** per layanan.
- Kelurahan total 0 diberi warna merah + keterangan "belum ada input".
- Kelurahan di data penerima yang tak cocok dengan `wilayah` → baris "Tidak terdaftar" agar jumlah tetap cocok.

**Keterangan di bawah tabel (D10)** — dipasang di bawah setiap tabel (matriks A, matriks B, rincian kecamatan), identik di layar dan PDF:
- Kotak warna + arti ambang: merah <25% · oranye 25–49% · kuning 50–74% · hijau muda 75–99% · hijau tua ≥100%.
- Kotak abu-abu: "Tanpa kuota — layanan ini tidak mempunyai kuota di kecamatan tersebut".
- "0" berarti belum ada input. Format sel: `input/kuota`.
- Pada rincian kelurahan: "Merah = kelurahan belum ada input sama sekali; angka = jumlah input (semua status); kuota hanya tersedia di tingkat kecamatan".
- Hanya keterangan yang dipakai pada tabel itu yang ditampilkan (mis. kotak abu-abu muncul bila ada sel tanpa kuota).

**Di layar:** tab sub **A. Layanan Kecamatan | B. Layanan Kemenag**; klik nama kecamatan di matriks A membuka rincian kelurahannya (contoh 1: Medan Area → semua kelurahan Medan Area). Di B, klik layanan membuka daftar 21 kecamatan (contoh 2). Filter layanan/kecamatan; stempel "data per <jam server>". Tabel bisa digulir mendatar di HP.

**Cakupan unduh PDF:** *Semua* (ringkasan + A + B + rincian semua kecamatan), *Satu kecamatan* (halamannya saja), *Satu layanan Kemenag*. Kaki halaman "Halaman x dari y".

## 4. Rancangan data (backend)

Fungsi baru **`getCapaianInput(token)`** di `supabase/functions/api/domains/kuota.ts` (`getProgresKuota` lama **tidak diubah**).
- Wajib sesi, role UTAMA saja.
- 3 kueri agregat paralel: (1) `penerima` grup `(upper(layanan), upper(kecamatan), upper(kelurahan))` count, `tahun = TAHUN_AKTIF` (memakai indeks `idx_penerima_tahun_layanan_kecamatan_upper`); (2) `kuota`; (3) `wilayah`.
- Hasil: `{sukses, diperbarui, layananKecamatan:[...], layananKemenag:[...], kecamatan:[ {nama, kelurahan:[{nama, perLayanan:{L:n}, total}], tidakTerdaftar}], kuota:{ "LAYANAN||KEC": n }, input:{ "LAYANAN||KEC": n } }`. Satu model dipakai layar dan PDF.
- Daftar layanan diambil dari `getMasterLayanan()` lengkap (D9), bukan dari baris yang punya kuota/input. Sel tanpa input = `0`. Bila kuota kecamatan×layanan tidak ada, sel tampil `0` abu-abu netral, bukan merah (D10). Bila ada input tanpa kuota, sel menampilkan jumlah inputnya, tetap abu-abu.
- Pemeriksaan konsistensi di server (uji): Σ kelurahan = input kecamatan = angka `getProgresKuota`.
- `api-bridge.js`: `getCapaianInput: { ttl: 5 * 60 * 1000, domain: 'kuota' }`.
- Butuh **deploy fungsi `api` (v100)** hanya setelah izin; sebelumnya cek `get_edge_function` agar basis tidak usang. Tanpa migrasi DB.

## 5. Rancangan frontend

- `index.html`: tab bar di `modal-dashboard-progres`; isi lama dibungkus `#panel-dashboard-verifikasi` (tidak diubah), panel baru `#panel-capaian-input`. Jangan pakai tag `<header>` (aturan CSS global). Bump `?v=`.
- Berkas baru `public/js/app-capaian-input.js` (+ bagian PDF), **dimuat malas hanya UTAMA** lewat `muatSkripAdmin` (`app-pesan-periode.js`).
- Penyegaran otomatis seperti `app-admin.js:2806` (sinyal domain kuota/penerima), tanpa `djpmCache.invalidate()` (pakai argumen penanda unik), tanpa mereset tab/filter yang aktif (pelajaran form terhapus sinyal realtime).
- Tailwind: `npm run build:css` + commit `public/css/tailwind.css` + `npm run check-css`.
- PDF: jsPDF yang ada, digambar vektor dari model data yang sama; `setFillColor` tepat sebelum tiap bentuk; wajib uji render visual (pdf.js di Chrome); baris tabel tak terpotong lintas halaman, kepala kolom diulang.

## 6. Tahapan kerja

| Tahap | Isi | Sifat |
|---|---|---|
| **P0** | Bentuk disetujui (D1–D8) | selesai |
| **P1** | `getCapaianInput` + uji lokal data nyata (baca-saja); cek jumlah layanan → tentukan portrait/landscape; cek Σ & kelurahan tak terdaftar | lokal |
| **P2** | Tab + matriks A, B, rincian kecamatan di layar; uji jsdom + Chrome (desktop & HP) | lokal |
| **P3** | Unduh PDF (cakupan Semua/Kecamatan/Layanan Kemenag) + uji visual & jumlah halaman | lokal |
| **P4** | Commit; **deploy fungsi `api` v100 + push frontend** (hanya setelah izin) | outward-facing |
| **P5** | User uji klik akun UTAMA; pantau log; lalu alihkan tombol "Progres Kuota" lama | verifikasi |

## 7. Daftar uji

- Hak akses: selain UTAMA ditolak server, skrip tak termuat.
- Konsistensi angka (lihat §4); total kota = jumlah baris `penerima` tahun aktif per layanan.
- Semua layanan master muncul walau 0 input/tanpa kuota, dan sel 0 tertulis "0" (D9).
- Kelurahan 0 input tampil merah; kelurahan tak terdaftar muncul; kuota 0 tidak membagi nol.
- Semua layanan Kemenag menampilkan 21 kecamatan.
- Realtime: input baru mengubah angka tanpa mereset tab/filter.
- PDF: halaman, teks tak terpotong, warna = layar, nama berkas, buka di Chrome/Acrobat/HP.
- Regresi: Dashboard Verifikasi (layar + Cetak + Unduh PDF) dan Progres Kuota lama tetap jalan; `check-css`, `verify-html`, `check-lines`.

## 8. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Matriks terlalu lebar | Putuskan orientasi di P1; gulir mendatar di layar; singkat nama kolom |
| Beban DB (pelajaran koneksi penuh) | 3 kueri agregat, cache 5 menit, hanya UTAMA |
| Penulisan kelurahan tak seragam | Baris "Tidak terdaftar", jumlah selalu menjumlah |
| Dua panel kuota beda angka | Panel lama dialihkan di P5 |
| Dashboard lama rusak oleh pembungkus tab | Isi lama hanya dibungkus; uji regresi P2 |

## 9. Jalan balik

Frontend: kembalikan commit (Dashboard lama utuh). Fungsi `getCapaianInput` yang tak dipanggil tidak berdampak; v99 tetap titik pemulihan. Tanpa migrasi DB.

## 10. Di luar lingkup

Kuota per kelurahan, status verifikasi di laporan ini, grafik tren, ekspor Excel, peran selain UTAMA, perubahan Dashboard Verifikasi.
