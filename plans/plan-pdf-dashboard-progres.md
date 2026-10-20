# Plan: Laporan PDF "Progres Verifikasi DJPM 2027" untuk Pimpinan

> Versi **3** (2026-10-20) · Status: **P1 + P2 SELESAI di lokal (belum commit/push); menunggu uji Preview Vercel (P3) dan persetujuan push (P4)**
>
> **Catatan realisasi P1–P2 (2026-10-20):**
> - Berkas: `public/js/app-laporan-progres.js` (baru, 539 baris, 8,5 KB gzip), pemuat di `app-pesan-periode.js` (2 skrip), `index.html` hanya naik `?v=20271020`, `public/css/tailwind.css` di-build ulang. `app-transaksi.js` tidak disentuh.
> - Temuan uji visual Chrome: (1) tag `<header>` kena aturan global `header{background:#0f172a!important}` di `tailwind.input.css` → kepala laporan memakai `<div>`; (2) 11 kartu Kecamatan tidak muat di halaman 1 → kartu cetak diberi `zoom:.8` sehingga laporan tepat 2 halaman (A di hlm 1, B di hlm 2); (3) kolom "A. Kecamatan" dibuat `nowrap`.
> - Uji: jsdom 97 lulus (hak akses, A/B, isi, gagal jaringan, sesi berganti, pemuat), regresi UI lama 99 + 104 lulus, Chrome `--print-to-pdf` → A4 portrait 595×842 pt, 2 halaman, kaki halaman + "Halaman x dari y" tampil, `check-lines`/`verify-html`/`vite build` lulus.
> - **Review menyeluruh (2026-10-20, setelah P2):** ditemukan & diperbaiki — (1) `invalidate()` memancarkan event `djpm:swr-invalidated` yang di `app-admin.js:2760` memuat ulang dashboard terbuka (skeleton berkedip + permintaan ganda) → diganti argumen penanda unik `lp<waktu>` pada `getDashboardProgresVerifikasi`/`getMasterLayanan` (selalu permintaan baru, tak pernah cache lama); (2) aturan CSS `html{}` bocor ke Ctrl+P biasa → kelas penanda dipindah ke `<html>` dan semua aturan dibatasi kelas itu; (3) listener `matchMedia('print')` hanya membersihkan setelah pernah `matches=true`; (4) sesi dicek ulang tepat sebelum `print()`; (5) ikon tombol tidak dibuat ulang (fokus tetap); (6) bila dialog cetak tak terbuka (print() ditolak peramban), muncul petunjuk Ctrl+P dan laporan tetap siap.
> - Uji review: jsdom 116 lulus, regresi UI lama 99 + 104 lulus, uji mutasi 8/8 tertangkap, uji di `index.html` asli + semua skrip aplikasi lewat server lokal + Chrome (dashboard dipanggil tepat 2x, lazy-load `?v=20271020` jalan, PDF 2 halaman hanya laporan), dan dengan opsi "Header dan footer" Chrome aktif (hanya menambah tanggal+judul di atas, tidak bertabrakan dengan kaki halaman).
> - Belum diuji: Firefox/Safari (margin box `@page` mungkin tidak tampil, baris "Dicetak dari …" di akhir laporan tetap ada sebagai cadangan), dan cetak ke kertas nyata.
> Menggantikan v2.1. Disusun dari jawaban K1–K13 (§2). Inti: **hanya Admin Utama** yang bisa mencetak; laporan dibagi **A. Layanan Kecamatan** dan **B. Layanan Kemenag**; laporannya **ringkas tanpa kop, tanda tangan, tabel rekap, catatan, atau nomor surat**; **satu kecamatan menghasilkan satu PDF**.
> Prinsip: murni frontend (tanpa migrasi DB, tanpa deploy fungsi `api`), angka diambil segar saat dicetak, setiap langkah mudah dibatalkan.

## Daftar isi
1. [Ringkasan](#1-ringkasan)
2. [Keputusan yang sudah diambil](#2-keputusan-yang-sudah-diambil)
3. [Hak akses](#3-hak-akses-hanya-admin-utama)
4. [Kondisi kode sekarang](#4-kondisi-kode-sekarang)
5. [Isi dan tata letak laporan](#5-isi-dan-tata-letak-laporan)
6. [Perubahan di layar dashboard (K11)](#6-perubahan-di-layar-dashboard-k11)
7. [Rancangan teknis](#7-rancangan-teknis)
8. [Keamanan & privasi](#8-keamanan--privasi)
9. [Tahapan kerja](#9-tahapan-kerja)
10. [Daftar uji](#10-daftar-uji)
11. [Risiko & mitigasi](#11-risiko--mitigasi)
12. [Jalan balik (rollback)](#12-jalan-balik-rollback)
13. [Panduan pakai Admin Utama](#13-panduan-pakai-admin-utama)
14. [Kriteria selesai](#14-kriteria-selesai)
15. [Di luar lingkup](#15-di-luar-lingkup)

---

## 1. Ringkasan

| Hal | Rancangan |
|---|---|
| Siapa | **Admin Utama saja**. Tombol dan skripnya tidak ada untuk peran lain |
| Di mana | Tombol **"Cetak Laporan PDF"** di footer modal **Dashboard Progres Verifikasi**, di sebelah kiri tombol Tutup |
| Sekali klik | Klik tombol → data diambil segar → dialog cetak browser terbuka → pilih **Simpan sebagai PDF**. Tanpa dialog isian tambahan |
| Isi | Judul laporan, cakupan, waktu data, **ringkasan A / B / JUMLAH**, **Bagian A. Layanan Kecamatan**, **Bagian B. Layanan Kemenag** (halaman baru), nomor halaman, keterangan pencetak |
| Kartu | **Sama persis dengan layar** (disalin dari kartu yang tampil) |
| Cakupan | Mengikuti filter modal: **satu kecamatan = satu PDF**; "Semua Kecamatan" = PDF tingkat kota |
| Kertas | **A4 portrait**, kartu 3 kolom |
| Nama berkas | `Laporan-Progres-Verifikasi-DJPM-2027_{SEMUA atau NAMA-KECAMATAN}_{YYYY-MM-DD}.pdf` |
| Layar | Dashboard Admin Utama juga dibagi **A. Layanan Kecamatan / B. Layanan Kemenag**. Peran lain tidak berubah |
| Dampak | 1 berkas JS baru + ±8 baris di pemuat yang sudah ada. **Tidak** ada perubahan database, fungsi `api`, `index.html`, maupun `app-transaksi.js` |

---

## 2. Keputusan yang sudah diambil

| # | Pertanyaan | Jawaban | Akibatnya pada rancangan |
|---|---|---|---|
| K1 | Cara membuat PDF | **Ya**, lewat cetak browser | PDF vektor: tajam, teks bisa dicari, ±150–400 KB, tanpa pustaka luar |
| K2 | A4 portrait | **Ya** | `@page { size: A4 portrait }`, kartu 3 kolom |
| K3 | Kop instansi | **Tidak** | Tanpa logo dan teks kop. Laporan dibuka langsung dengan **judul laporan** |
| K4 | Blok pengesahan / tanda tangan | **Tidak** | Tidak ada |
| K5 | Tabel rekap per layanan di bawah kartu | **Tidak** | Tidak ada. Rincian per layanan cukup lewat kartu |
| K6 | Kolom catatan | **Tidak** | Tidak ada |
| K7 | Nomor surat | **Tidak** | Tidak ada |
| K8 | Format nama berkas | **Ya** | Lihat §1 |
| K9 | Seluruh kecamatan sekaligus | **1 kecamatan 1 PDF** | Tidak ada PDF gabungan 21 kecamatan. Admin memilih kecamatan di filter lalu mencetak, satu per satu |
| K10 | Ctrl+P oleh peran lain | **Ya** (biarkan seperti sekarang) | Tidak ada perubahan untuk peran lain |
| K11 | Layar juga dibagi A/B | **Ya** | Khusus Admin Utama (§6) |
| K12 | Bagian B di halaman baru | **Ya** | `break-before: page` |
| K13 | Urutan A lalu B | **Ya** | A. Kecamatan, lalu B. Kemenag |

**Akibat K4–K7:** karena tidak ada isian apa pun, dialog "Siapkan Laporan" dari v2 **dihapus**, dan tidak ada penyimpanan preferensi (localStorage).

**Penafsiran yang mohon dikoreksi bila keliru:**
- K3 "tidak" saya artikan **tanpa logo juga**. Kalau logo Pemko Medan tetap ingin ada di sebelah judul, cukup bilang "pakai logo".
- K9: pilihan **"Semua Kecamatan" tetap bisa dicetak** sebagai laporan tingkat kota (satu PDF). Yang tidak dibuat adalah PDF berisi 21 bagian kecamatan.
- Judul laporan memakai nama resmi dari aplikasi: *"Data Penerima Dana Jasa Pelayanan Kepada Warga Pelayan Masyarakat Kota Medan Tahun 2027"*.

---

## 3. Hak akses (hanya Admin Utama)

| Lapisan | Penegakan |
|---|---|
| Skrip | `app-laporan-progres.js` **dimuat malas hanya untuk UTAMA** oleh pemuat di `app-pesan-periode.js` (pemuat yang sama dengan modal Jadwal & Pesan). Peran lain tidak mengunduh kodenya |
| Tombol | Disisipkan oleh skrip itu, lalu disembunyikan bila peran bukan UTAMA. Diperiksa setiap kali dashboard dirender **dan** saat tombol diklik (berjaga bila akun berganti di tab yang sama tanpa muat ulang) |
| Data | **Tanpa endpoint baru.** Memakai `getDashboardProgresVerifikasi` yang memang sudah dibatasi server per peran |
| Batas | Peran lain tetap bisa menekan Ctrl+P atau memotret layar dashboard **miliknya sendiri** (K10: dibiarkan). Yang dibatasi adalah laporan resminya |

---

## 4. Kondisi kode sekarang

| Bagian | Lokasi | Pengaruh |
|---|---|---|
| Modal | `index.html` 2136–2168, `#modal-dashboard-progres`; footer berisi tombol Tutup saja | Tombol cetak disisipkan lewat JS ke footer ini |
| Filter | `#filter-dashboard-kecamatan` (`onchange="muatDashboardProgres()"`), hanya tampil bila `res.bisaFilterKecamatan` (UTAMA) | Sumber cakupan laporan |
| Pemuat data | `muatDashboardProgres()` di `app-transaksi.js` 3410; cache lokal `cacheDashboardProgres` (`let` global) + cache SWR bridge 3 menit (domain `dashboard`) | Saat mencetak, kedua cache dilewati |
| Pembuat kartu | `renderDashboardProgres(res, kecFilter)` di `app-transaksi.js` 3429: satu grid berisi kartu sesuai urutan `res.kartu` | **Dibungkus** (bukan diubah) untuk pemisah A/B dan untuk disalin ke laporan |
| Bilah progres | `.bar-progres-animasi`, lebar awal `0%`, diisi `requestAnimationFrame` dari `data-target-width` | Di salinan, lebar langsung diisi nilai akhir |
| Animasi kartu | `.kartu-dashboard-animasi` (CSS `index.html` 136) | Dilepas di salinan |
| Urutan kartu UTAMA | `dashboard.ts` 95–96: `[...master.kecamatan, ...master.kemenag]`. Server **tidak** mengirim penanda kelompok | Kelompok ditentukan di browser dari master layanan |
| Master layanan | `masterLayanan` (`let` global, `app-core.js` 281, punya nilai bawaan, diperbarui dari `getMasterLayanan` saat halaman dibuka; SWR 30 menit) | Daftar `kemenag` menjadi penentu Bagian B |
| Pemuat malas UTAMA | `muatSkripAdmin()` di `app-pesan-periode.js` 555 | Diperluas agar memuat 2 skrip |
| Batas 3.500 baris | `index.html` 3.484, `app-transaksi.js` 3.489 | Keduanya **tidak disentuh** |

---

## 5. Isi dan tata letak laporan

### 5.1 Susunan (A4 portrait, margin 12 mm)
```
┌──────────────────────────────────────────────────────────────┐
│               LAPORAN PROGRES VERIFIKASI                      │
│  Data Penerima Dana Jasa Pelayanan Kepada Warga Pelayan       │
│           Masyarakat Kota Medan Tahun 2027                    │
│   Cakupan : Seluruh Kecamatan  /  Kecamatan MEDAN AMPLAS      │
│   Data per: Selasa, 20 Oktober 2026 pukul 14.05 WIB           │
│══════════════════════════════════════════════════════════════│
│ RINGKASAN                                                     │
│ Kelompok     │Layanan│Kuota│Total│Sisa │Proses│ MS │BTL│TMS│ % │
│ A. Kecamatan │  12   │4.200│ 900 │3.300│  80  │800 │ 20│ 0 │89%│
│ B. Kemenag   │   6   │1.960│ 354 │1.606│  50  │289 │ 15│ 0 │82%│
│ JUMLAH       │  18   │6.160│1.254│4.906│ 130  │1089│ 35│ 0 │87%│
│ ██████████████████████░░░  87% sudah diverifikasi             │
│                                                               │
│ A. LAYANAN KECAMATAN          Total 900 · Sisa 3.300 · 89%    │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                        │
│ │ kartu    │ │ kartu    │ │ kartu    │   (sama dengan layar)  │
│ └──────────┘ └──────────┘ └──────────┘                        │
│ ...                                                           │
├──────────────────── halaman baru ─────────────────────────────┤
│ B. LAYANAN KEMENAG            Total 354 · Sisa 1.606 · 82%    │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                        │
│ │ kartu    │ │ kartu    │ │ kartu    │                        │
│ └──────────┘ └──────────┘ └──────────┘                        │
├──────────────────────────────────────────────────────────────┤
│ Dicetak dari Aplikasi DJPM 2027 oleh <username> ·    Halaman  │
│ 20-10-2026 14.05 WIB                                  1 dari 2│  ← di setiap halaman
└──────────────────────────────────────────────────────────────┘
```
*Angka di gambar hanya contoh.* MS = Memenuhi Syarat, BTL = Berkas Tidak Lengkap, TMS = Tidak Memenuhi Syarat. Di laporan, kepala kolom ditulis lengkap.

### 5.2 Aturan isi
| Bagian | Sumber | Aturan |
|---|---|---|
| Judul | Tetap | "LAPORAN PROGRES VERIFIKASI" + nama program |
| Cakupan | Nilai filter saat diklik | "Seluruh Kecamatan" atau "Kecamatan {NAMA}" |
| Data per | Waktu data diterima | Hari, tanggal, jam WIB lengkap |
| Pembagian A/B | `masterLayanan.kemenag` | Layanan yang ada di daftar Kemenag masuk **B**, sisanya **A**. Dicocokkan dengan huruf besar dan spasi dirapikan |
| Ringkasan | `res.kartu` per kelompok | 3 baris (A, B, JUMLAH), kolom Jumlah Layanan, Kuota, Total Data, Sisa Kuota, Proses Verifikasi, Memenuhi Syarat, Berkas Tidak Lengkap, Tidak Memenuhi Syarat, % Terverifikasi; plus bilah persen gabungan |
| Persen | — | `round((MS + TMS) / Total × 100)`, 0 bila Total 0. Rumus yang sama dengan kartu. JUMLAH dihitung dari angka mentah, **bukan** rata-rata persen A dan B |
| Judul bagian | — | "A. LAYANAN KECAMATAN" / "B. LAYANAN KEMENAG" + subtotal (Total, Sisa Kuota, %) |
| Kartu | Salinan kartu layar | Identik; urutan sama dengan layar; bilah langsung berlebar akhir; tidak terpotong antar halaman |
| Bagian kosong | — | Tetap tampil: "Belum ada data untuk layanan Kecamatan/Kemenag." |
| Kaki halaman | Otomatis, setiap halaman | "Dicetak dari Aplikasi DJPM 2027 oleh {username} · {waktu cetak} WIB" dan "Halaman x dari y" |
| Angka | — | Format Indonesia (`1.254`) |

---

## 6. Perubahan di layar dashboard (K11)

- **Khusus Admin Utama:** grid kartu dipecah menjadi dua bagian berjudul **A. Layanan Kecamatan** dan **B. Layanan Kemenag**, masing-masing dengan subtotal kecil (Total · Sisa Kuota · %).
- Tampilan kartu, animasi masuk, bilah progres, filter, dan tombol Tutup **tidak berubah**.
- Peran Kecamatan, Kemenag, Kelurahan, dan MUI hanya melihat satu kelompok, jadi tampilannya **tidak berubah sama sekali**.
- Caranya: membungkus `renderDashboardProgres` dari berkas baru. Fungsi asli dipanggil dulu, lalu kartunya dipindah ke dua bagian. Bila terjadi galat apa pun atau jumlah kartu tidak cocok dengan data, **tampilan asli dibiarkan** (*fail-safe*).

---

## 7. Rancangan teknis

### 7.1 Berkas
| Berkas | Perubahan |
|---|---|
| `public/js/app-laporan-progres.js` **(baru, ±300 baris)** | Pembungkus render (layar A/B), tombol, pengambilan data segar, pembagian A/B, penyusunan area cetak, CSS cetak (disuntik sebagai `<style>`), pembersihan |
| `public/js/app-pesan-periode.js` | `muatSkripAdmin()` diubah dari 1 skrip menjadi daftar 2 skrip (±8 baris). Versi `?v=` tetap ikut skrip induk |
| `index.html`, `app-transaksi.js`, `api-bridge.js`, DB, fungsi `api` | **Tidak berubah** |

CSS cetak disuntik dari berkas JS (bukan `tailwind.input.css`), supaya fitur ini utuh dalam satu berkas, hanya dimuat untuk UTAMA, dan tidak perlu build ulang Tailwind. Kelas Tailwind yang dipakai tombol dicek dulu sudah ada di `public/css/tailwind.css`.

### 7.2 Alur klik
```
UTAMA klik "Cetak Laporan PDF"
 1. bila sedang menyiapkan → abaikan (cegah klik ganda)
 2. bila peran ≠ UTAMA → toast "hanya Admin Utama", sembunyikan tombol, berhenti
 3. tombol & filter dinonaktifkan, teks tombol "Menyiapkan…"
 4. buang cache SWR domain 'dashboard' (lokal saja, tanpa siaran ke klien lain)
 5. paralel: getDashboardProgresVerifikasi(token, filter) + getMasterLayanan()
 6. gagal / sukses=false → toast galat, TIDAK mencetak data lama, pulihkan tombol
 7. perbarui cacheDashboardProgres[filter] dan masterLayanan (bila master valid)
 8. renderDashboardProgres(res, filter) → layar ikut segar (dengan pemisah A/B)
 9. susun #area-laporan-cetak (anak langsung <body>, diganti bila sudah ada):
      judul · identitas · ringkasan · [A] judul+subtotal+salinan kartu · [B] sama, halaman baru
10. pasang <style> margin halaman (pencetak, waktu, nomor halaman)
11. document.title = nama berkas (K8), body + kelas 'mode-cetak-laporan'
12. toast: "Pilih Tujuan: Simpan sebagai PDF, lalu klik Simpan"
13. window.print()
14. afterprint → kembalikan judul halaman, lepas kelas & style halaman, hapus area cetak
    (pengaman: judul dikembalikan setelah 60 dtk walau afterprint tidak terpanggil;
     area cetak tetap tersembunyi di layar dan diganti pada cetak berikutnya)
15. pulihkan tombol & filter
```

### 7.3 Pencocokan kartu layar ↔ data
- `renderDashboardProgres` membuat kartu berurutan dari `res.kartu`, jadi kartu ke-*i* = `res.kartu[i]`. Pembungkus memberi atribut `data-lp-i="i"` **sebelum** memindah kartu.
- Saat menyusun laporan, kartu diambil berdasarkan `data-lp-i`. Bila jumlahnya tidak sama dengan `res.kartu.length`, laporan **batal** dengan pesan jelas (lebih aman daripada mencetak kartu yang salah tempat).

### 7.4 Perhitungan
- Satu fungsi `jumlahkan(daftarKartu)` dipakai untuk A, B, dan JUMLAH, sehingga **JUMLAH = A + B** selalu konsisten.
- Layanan yang tidak ada di daftar Kemenag masuk A. Kalau ada layanan yang tidak dikenal di kedua daftar, layanan itu masuk A dan dicatat di `console.warn`, jadi angka tidak pernah hilang dari JUMLAH.

### 7.5 CSS cetak (inti)
```css
@media screen { #area-laporan-cetak { display: none !important; } }
@media print {
  @page { size: A4 portrait; margin: 12mm 12mm 16mm; }
  html, body.mode-cetak-laporan { height: auto !important; overflow: visible !important; background: #fff !important; }
  body.mode-cetak-laporan > *:not(#area-laporan-cetak) { display: none !important; }
  #area-laporan-cetak { display: block; }
  #area-laporan-cetak, #area-laporan-cetak * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #area-laporan-cetak .lp-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
  #area-laporan-cetak .lp-kartu { break-inside: avoid; box-shadow: none !important; }
  #area-laporan-cetak .lp-judul-bagian { break-after: avoid; }
  #area-laporan-cetak .lp-bagian-b { break-before: page; }
}
/* disuntik per cetak, isinya dinamis (teks dibersihkan dari tanda kutip) */
@page { @bottom-left  { content: "Dicetak dari Aplikasi DJPM 2027 oleh … · …"; }
        @bottom-right { content: "Halaman " counter(page) " dari " counter(pages); } }
```
`overflow: visible` penting karena modal yang sedang terbuka bisa mengunci gulir `body`, dan kalau dibiarkan PDF hanya berisi satu halaman.

---

## 8. Keamanan & privasi

| Hal | Penanganan |
|---|---|
| Peran lain memakai fitur laporan | Skrip hanya dimuat untuk UTAMA; peran diperiksa ulang saat render dan klik |
| Data pribadi | Laporan hanya berisi **agregat per layanan**. Tidak ada nama, NIK, atau rekening |
| Penyisipan HTML | Semua teks baru dipasang dengan `textContent`. Kartu disalin dari HTML aplikasi yang sudah di-escape (`esc`). Teks kaki halaman dibersihkan dari `"` dan `\` |
| Angka basi | Cache dilewati; waktu data dicetak; bila pengambilan gagal, tidak mencetak |
| Pustaka luar | Tidak ada |
| Server | Tidak berubah, jadi tidak ada permukaan serangan baru |

---

## 9. Tahapan kerja

| Tahap | Isi | Uji | Jalan balik |
|---|---|---|---|
| **P0** | Persetujuan plan v3 + koreksi penafsiran §2 bila ada | — | — |
| **P1** | Tulis `app-laporan-progres.js` + perluas pemuat di `app-pesan-periode.js` | jsdom dengan `index.html` dan skrip asli: hak akses, pemisah A/B layar, isi laporan, perhitungan, klik ganda, gagal ambil data, pembersihan | Hapus berkas + kembalikan pemuat |
| **P2** | Uji tampilan PDF | Chrome headless `--print-to-pdf` dengan data contoh (0, 1, ±20 kartu; Semua & 1 kecamatan) → PDF dilihat sebagai gambar: A4 portrait, 3 kolom, kartu tidak terpotong, B di halaman baru, warna, kaki & nomor halaman | — |
| **P3** | Uji di **Preview Vercel** (branch, DB produksi, hanya baca) sebagai UTAMA: cetak Semua Kecamatan + 2–3 kecamatan; cocokkan angka dengan layar; coba juga sebagai peran lain (tombol tidak ada) | Manual oleh Anda | Tidak menyentuh produksi |
| **P4** | Commit → push `main` (setelah Anda setuju) → naikkan `?v=` skrip pemuat | Cek singkat di produksi | Vercel *Promote* deploy sebelumnya, atau revert commit |

Perkiraan: P1 ±½ hari, P2 ±¼ hari, P3–P4 sesuai waktu uji Anda. **Tanpa migrasi DB dan tanpa deploy fungsi.**

---

## 10. Daftar uji

### Hak akses
- [ ] UTAMA: tombol tampil. Kecamatan, Kemenag, Kelurahan, MUI: skrip tidak dimuat dan tombol tidak ada
- [ ] Logout UTAMA lalu login peran lain di tab yang sama: tombol tersembunyi, klik paksa ditolak
- [ ] Layar peran lain tidak berubah (tidak ada judul A/B)

### Layar (K11)
- [ ] UTAMA melihat bagian A dan B dengan subtotal yang benar
- [ ] Animasi masuk dan bilah progres tetap jalan
- [ ] Ganti filter kecamatan: pemisah A/B tetap benar
- [ ] Data kosong: teks "Belum ada data…" asli tetap tampil
- [ ] Jumlah kartu tidak cocok / galat: tampilan asli dipertahankan

### Isi laporan
- [ ] Setiap kartu masuk bagian yang benar; kartu A + B = kartu layar
- [ ] Ringkasan: JUMLAH = A + B di setiap kolom; persen gabungan dari angka mentah
- [ ] Cakupan, "Data per", dan nama berkas sesuai filter
- [ ] Angka segar: cache dilewati (ubah data uji → cetak → angka baru)
- [ ] Bagian kosong tampil dengan keterangan
- [ ] Tidak ada kop, tanda tangan, tabel rekap, catatan, atau nomor surat (K3–K7)

### Tampilan PDF
- [ ] A4 portrait, kartu 3 kolom, identik dengan layar (warna, lencana kuota, bilah)
- [ ] Tidak ada kartu terpotong; judul bagian tidak tertinggal sendirian di bawah halaman
- [ ] Bagian B mulai di halaman baru
- [ ] Kaki halaman dan "Halaman x dari y" ada di setiap halaman (Chrome/Edge)
- [ ] Tidak ada bagian aplikasi lain yang ikut tercetak; tidak terpotong jadi 1 halaman saat modal terbuka

### Kestabilan
- [ ] Klik ganda hanya menghasilkan satu proses
- [ ] Gagal jaringan: pesan jelas, tombol & filter pulih, tidak mencetak
- [ ] Batal di dialog cetak: judul halaman kembali, area cetak dibersihkan
- [ ] Cetak dua kali berturut-turut: tidak ada area cetak ganda
- [ ] `check-lines` dan `verify-html` lulus

---

## 11. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Bilah progres kosong di PDF | Salinan memakai lebar akhir langsung |
| Warna tidak tercetak | `print-color-adjust: exact` |
| PDF hanya 1 halaman karena gulir body terkunci modal | `overflow: visible` + `height: auto` saat mencetak |
| Kartu salah kelompok (ejaan master beda) | Pencocokan huruf besar + spasi dirapikan; master sama dengan server; layanan tak dikenal masuk A + peringatan |
| Kartu laporan tidak cocok dengan data | Dicocokkan lewat `data-lp-i`; bila tidak cocok, laporan batal (tidak mencetak data salah) |
| Pembungkus layar merusak dashboard | *Fail-safe* ke tampilan asli; hanya aktif untuk UTAMA |
| Admin bingung di dialog cetak | Toast petunjuk; browser biasanya mengingat pilihan "Simpan sebagai PDF" |
| Nomor halaman tidak ada di Firefox/Safari | Diutamakan Chrome/Edge; browser lain tetap mencetak tanpa nomor halaman |
| Mencetak di HP | Didukung lewat menu cetak Android/iOS; disarankan dari komputer agar hasil konsisten |
| Layanan baru ditambahkan | Otomatis ikut kelompoknya dari master, tanpa ubah kode |

---

## 12. Jalan balik (rollback)
- **Cepat:** kembalikan `muatSkripAdmin()` ke versi 1 skrip. Berkas baru tidak dimuat lagi, tombol dan pemisah A/B hilang, dashboard kembali persis seperti sekarang.
- **Penuh:** revert commit fitur, atau *Promote* deploy Vercel sebelumnya.
- Tidak ada data atau skema yang perlu dipulihkan.

---

## 13. Panduan pakai Admin Utama
1. Buka **Dashboard Progres Verifikasi**.
2. Pilih **Semua Kecamatan** untuk laporan tingkat kota, atau pilih satu kecamatan.
3. Klik **Cetak Laporan PDF** dan tunggu sebentar sampai data terbaru diambil.
4. Di dialog cetak: **Tujuan → Simpan sebagai PDF** → **Simpan**. Nama berkas sudah terisi otomatis.
5. Untuk kecamatan lain, ganti filter lalu ulangi langkah 3–4 (satu kecamatan, satu PDF).

---

## 14. Kriteria selesai
1. Tombol dan skrip hanya untuk UTAMA; peran lain tidak berubah.
2. Layar UTAMA terbagi A/B dengan subtotal yang benar.
3. PDF berisi judul, cakupan, waktu data, ringkasan A/B/JUMLAH, Bagian A dan Bagian B (B di halaman baru), kartu identik layar, kaki halaman, dan nomor halaman; tanpa kop, tanda tangan, tabel rekap, catatan, atau nomor surat.
4. Angka laporan sama dengan dashboard pada saat cetak.
5. Semua uji §10 lulus, termasuk uji di Preview Vercel dengan data nyata, sebelum digabung ke `main`.

## 15. Di luar lingkup
- PDF gabungan 21 kecamatan (K9: tidak).
- Kop, tanda tangan, tabel rekap, catatan, nomor surat (K3–K7: tidak). Semua bisa ditambahkan nanti tanpa merombak.
- Laporan untuk modal **Progres Capaian Kuota** dengan pola yang sama.
- Arsip laporan di server dan unduh sekali klik (html2canvas + jsPDF).
