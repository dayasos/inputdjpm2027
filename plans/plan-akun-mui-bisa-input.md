# Plan: Akun MUI Bisa Input Data (khusus layanan Ustadz & Ustadzah, se-Kota Medan)

> Versi **1.1** (2026-10-20) · Status: **DRAF, menunggu jawaban keputusan di §3**
> **Realisasi (2026-10-20): M1–M5 SELESAI di lokal; BELUM di-commit/deploy (menunggu persetujuan M6).** User menyetujui semua keputusan K1–K10 ("setuju semua").
> - **Berkas berubah:** server `_shared/akses.ts` (LAYANAN_INPUT_MUI, kategoriPenginput), `_shared/eksporBaris.ts` (baru), `domains/penerima.ts`, `domains/setelan.ts`, `domains/master.ts`, `domains/verifikasi.ts`, `domains/ekspor.ts`; frontend `app-core.js`, `app-transaksi.js` (+9 baris → 3.497/3.500), `app-pesan-periode.js`, `app-penanda-mui.js` (baru), `index.html` (hanya `?v=20271022`), `tailwind.css`. **Tanpa migrasi DB.**
> - **Penyesuaian dari rencana:** (1) kontrak ekspor Excel: penginput dikirim di indeks **18/19** baris ekspor (bukan 23/24) karena hanya `ambilDataMemenuhiSyarat` yang dipakai; (2) tambahan: MUI hanya boleh "Laporkan Sudah Diperbaiki" untuk data miliknya (server + tombol); (3) lencana "N belum diperiksa" di tab Lihat Data khusus MUI (K8b); (4) pemuat skrip kini per peran (UTAMA 3 skrip, MUI 1, lainnya 0).
> - **Temuan sampingan (bukan dari perubahan ini):** kolom `status_rekomendasi_mui` dkk ADA di produksi tetapi TIDAK ada di file migrasi repo (drift lama); `simpanCatatanRekomendasiMui` membaca `sesi.nama_lengkap`/`sesi.user_id` yang tidak ada di objek sesi (petugas selalu "MUI Kota Medan"/username; 2 galat tipe lama di `penerima.ts`); bootstrap sesi tersimpan melempar galat TDZ `ROLE_KEMENAG_BEBAS` (pulih sendiri setelah validasi server); kedua akun MUI (`mui_medan`, `uji_mui`) berbagi `user_id` "MUI KOTA MEDAN" sehingga **sakelar khusus akun berlaku untuk keduanya**.
> - **Bukti uji:** server (PGlite + SEMUA migrasi asli + modul asli) 119 lulus termasuk regresi byte-per-byte daftar/detail vs kode lama, mutasi 14/14; UI di Chrome sungguhan (index.html + semua skrip asli, backend tiruan) 75 lulus termasuk regresi layar semua peran lain vs versi lama (periode terbuka & tutup), mutasi 12/12; suite lama ujilap 166, ujiui 99, ujiuser 104 (2 uji MUI disesuaikan ke perilaku baru); `deno check` hanya 4 galat lama; `check-lines`, `verify-html`, build Vite lulus.
> - **Review menyeluruh ke-2 (2026-10-20):** (a) **migrasi baru** `20261020100000_kolom_rekomendasi_mui.sql` (idempoten, `add column if not exists`; di produksi no-op; BELUM tercatat di produksi — `migration list` menunjukkan remote kosong; dijalankan lewat `supabase db push` saat deploy) menutup drift: setelah itu skema produksi vs migrasi repo = nol beda (tabel, kolom, tipe, indeks, fungsi); (b) **SQL baru diuji langsung di PostgreSQL produksi** (baca saja / blok `DO` yang selalu di-rollback): kueri daftar dgn `left join lateral` 1.817 baris = kueri lama, 14 ms; INSERT dgn 4 kolom rekomendasi berhasil di skema produksi dan tidak meninggalkan sisa; (c) pembuatan Excel dijalankan sungguhan di Deno + ExcelJS: kolom ke-19 "DIINPUT OLEH" benar, peran lain tetap 18 kolom; (d) jalur unggah berkas (GAS) diperiksa: hanya memvalidasi sesi sah (`ping`), tanpa pembatasan peran → MUI bisa mengunggah; (e) filter Penginput kini ikut disembunyikan bila akun berganti di tab yang sama.
> - **BUG LAMA DITEMUKAN & DIPERBAIKI (semua peran):** coba-ulang tabrakan `nomor_urut` di `simpanDataKeSheet` hanya mengenali nama indeks induk `uq_penerima_nomor_urut`, padahal Postgres melaporkan nama indeks partisi `penerima_2027_tahun_nomor_urut_idx` (terkonfirmasi di produksi) → dua penyimpanan bersamaan membuat yang kedua gagal "Gagal Sistem: duplicate key". Reproduksi deterministik di uji, lalu regex diperluas (`penerima(_\d{4})?_tahun_nomor_urut_idx`). Uji M15 + mutasi S15.
> - **Bukti uji terbaru:** server 133 lulus (mutasi 16/16); UI Chrome 77 lulus (mutasi 12/12); suite lama 166/99/104; `deno check` hanya 4 galat lama; `check-lines`, `verify-html`, build Vite lulus. Catatan: keserentakan transaksi tidak bisa ditiru PGlite (satu koneksi), jadi tabrakan diuji dengan menyisipkan baris pesaing tepat setelah nomor dihitung.
>
> v1.1: K8 diputuskan user → **langsung ke halaman Input** (seperti peran lain) + lencana jumlah "belum diperiksa" di tab Lihat Data; ditambah §4a **"Tugas MUI yang sudah ada tidak berubah"** sebagai syarat resmi (§10E, §14).
> Prinsip: server adalah penjaga aturan (UI hanya kenyamanan), perubahan kecil dan terarah, akun lain tidak berubah perilakunya, setiap tahap bisa dibatalkan.

## Daftar isi
1. [Ringkasan](#1-ringkasan)
2. [Kondisi sekarang (hasil telusur kode)](#2-kondisi-sekarang-hasil-telusur-kode)
3. [Keputusan yang perlu dijawab](#3-keputusan-yang-perlu-dijawab)
4. [Matriks hak akses setelah perubahan](#4-matriks-hak-akses-setelah-perubahan)
5. [Rancangan teknis — server](#5-rancangan-teknis--server)
6. [Rancangan teknis — tampilan (frontend)](#6-rancangan-teknis--tampilan-frontend)
7. [Penanda "diinput oleh MUI" untuk Admin Utama](#7-penanda-diinput-oleh-mui-untuk-admin-utama)
8. [Keamanan & integritas data](#8-keamanan--integritas-data)
9. [Tahapan kerja](#9-tahapan-kerja)
10. [Daftar uji](#10-daftar-uji)
11. [Risiko & mitigasi](#11-risiko--mitigasi)
12. [Jalan balik (rollback)](#12-jalan-balik-rollback)
13. [Panduan singkat](#13-panduan-singkat)
14. [Kriteria selesai](#14-kriteria-selesai)
15. [Di luar lingkup](#15-di-luar-lingkup)

---

## 1. Ringkasan

| Hal | Rancangan |
|---|---|
| Tujuan | Akun **MUI** (sekarang hanya melihat data + memverifikasi rekomendasi) **juga bisa menginput** data penerima |
| Layanan | **Hanya USTADZ dan USTADZAH**. Layanan lain ditolak oleh server |
| Wilayah | **Se-Kota Medan**: kecamatan dipilih bebas saat input (tidak dikunci ke satu kecamatan) |
| Tombol **Kemenag** | **Tidak berfungsi** (nonaktif, redup, tidak bisa diklik) untuk MUI |
| Filter & tampilan lain | **Berlaku seperti biasa**; yang berbeda hanya daftar layanan di formulir (2 pilihan) |
| Tanda untuk Admin Utama | Setiap data yang diinput MUI diberi **penanda "Input MUI"** di Lihat Data, bisa **difilter**, dan di Detail tertulis **siapa & kapan** menginput |
| Dampak teknis | Fungsi `api` (server) **perlu dideploy**; **tanpa migrasi database** (kolom penginput sudah ada); frontend: perubahan kecil + 1 berkas baru |
| Yang tidak berubah | Cara kerja Kecamatan, Kemenag, Admin Utama; aturan kuota, NIK/rekening ganda, tempat tugas ganda, domisili, timer periode |

---

## 2. Kondisi sekarang (hasil telusur kode)

### 2.1 Yang sudah ada dan bisa dipakai ulang
| Temuan | Lokasi | Arti untuk fitur ini |
|---|---|---|
| Server **sudah mencatat penginput**: kolom `penerima.dibuat_oleh_akun_id` (→ `akun.id`) dan `penerima.dibuat_at` terisi pada setiap input | `penerima.ts` ±719–735, DDL `penerima_partitioned.sql` | **Tidak perlu migrasi** untuk penanda penginput; data MUI otomatis bisa dikenali dari `akun.role = 'MUI'` |
| MUI **sudah se-Kota**: `lolosAksesBarisLihatData` & daftar data MUI memakai layanan Ustadz/Ustadzah tanpa batas kecamatan | `akses.ts` ±99, `penerima.ts` ±122 | Pola akses baca sudah benar |
| `sesiTerikatKecamatan` bernilai salah untuk MUI → daftar rumah ibadah tidak dibatasi kecamatan | `master.ts` ±38 | Akses wilayah se-Kota sudah sesuai |
| `tentukanWilayahTugas` memperlakukan akun tanpa kecamatan (seperti UTAMA/GMM se-Kota) dengan benar: **kecamatan yang dipilih harus sama dengan kecamatan rumah ibadah**; kelurahan wajib ada di kecamatan itu | `wilayahTugas.ts` | Tidak perlu diubah |
| Ustadz/Ustadzah bukan layanan yang **wajib** rumah ibadah (boleh pilihan "LAINNYA") | `wilayahTugas.ts` `LAYANAN_WAJIB_RUMAH_IBADAH` | Formulir MUI sama dengan formulir Kecamatan untuk layanan ini |
| Alur **Rekomendasi MUI** (verifikasi keabsahan berkas rekomendasi) sudah ada, kolom `status_rekomendasi_mui` dsb. | `penerima.ts` ±1069–1180, `app-transaksi.js` ±2391–2460 | Perlu diputuskan interaksinya (K4) |

### 2.2 Yang saat ini **memblokir** MUI
| Penghalang | Lokasi | Perlu diubah |
|---|---|---|
| Simpan ditolak: *"Akun MUI hanya memiliki hak akses melihat data, tidak dapat menginput data."* | `penerima.ts` 599–601 | Ganti dengan aturan "hanya Ustadz/Ustadzah" |
| Edit ditolak untuk MUI | `penerima.ts` 858–860 | Ganti dengan aturan edit (K2) |
| Cabang otorisasi simpan untuk non-UTAMA hanya mengenal KECAMATAN dan "layanan = peran"; MUI akan jatuh ke `layanan !== peranSesi` | `penerima.ts` 603–618 | Tambah cabang MUI |
| `periksaIzinInput` menganggap MUI **bebas dari penutupan periode** | `setelan.ts` 197 | Ubah sesuai K3 |
| Daftar rumah ibadah **kosong untuk MUI** (peran tidak ada di `JENIS_PER_ROLE`) | `master.ts` ±19–28 | Tambah `MUI: [MASJID, MUSHOLLA]` (jenis yang dipakai Ustadz/Ustadzah) |
| Tab Input disembunyikan & dinonaktifkan, panel input & formulir dikunci | `app-core.js` 858–872, 963–972 | Tampilkan & aktifkan untuk MUI |
| Klik tab Input memunculkan toast "Akses ditolak" | `app-core.js` 1219–1222 | Hapus untuk MUI; tambah cabang MUI |
| `periksaStatusAkses` melewati MUI (tidak memantau status buka/tutup) | `app-core.js` 1053 | Sertakan MUI (K3) |
| Pembaruan master layanan (`getMasterLayanan`) **mengembalikan dropdown layanan penuh** untuk peran non-Kemenag | `app-core.js` 1189–1197 | Kecualikan MUI, kalau tidak dropdown MUI kembali berisi semua layanan Kecamatan |
| Tombol edit hanya untuk Admin Utama dan akun Kecamatan/Kemenag | `app-transaksi.js` ±2998 | Tambah aturan MUI (K2) |
| Banner hitung mundur, modal penutupan, dan pesan admin **mengecualikan MUI** (`adalahMui()`) | `app-pesan-periode.js` 176, 230, 274, 335, 514 | Cabut pengecualian (K3) |
| Dashboard Progres, Data Detail, Retur disembunyikan untuk MUI | `app-core.js` 875–915 | **Tetap** (K7) |

---

## 3. Keputusan yang perlu dijawab

Empat permintaan Anda sudah menjadi dasar rancangan. Berikut hal-hal tambahan yang perlu dipastikan; usulan saya ditandai ✅.

| # | Pertanyaan | Pilihan | Usulan |
|---|---|---|---|
| **K1** | **Kuota**: input MUI memakai kuota yang mana? Kuota saat ini per **kecamatan + layanan** dan dihitung dari semua data (Kecamatan & MUI sama-sama menambah hitungan) | (a) **Kuota bersama** dengan akun Kecamatan ✅ (b) Kuota terpisah khusus MUI (butuh tabel & layar kelola kuota baru) | ✅ (a): satu sumber kebenaran, tanpa tabel baru. Akibatnya bila kuota Ustadz di satu kecamatan sudah penuh, MUI juga ditolak dan sebaliknya |
| **K2** | **Edit**: apa yang boleh diedit MUI? | (a) Tidak boleh edit sama sekali (b) **Hanya data yang ia input sendiri** ✅ (c) Semua data Ustadz/Ustadzah | ✅ (b): data milik Kecamatan tetap hanya dilihat + diverifikasi rekomendasinya. Server memeriksa `dibuat_oleh_akun_id` |
| **K3** | **Periode input**: apakah MUI ikut tutup periode (sakelar, jadwal otomatis, masa tenggang unggah 5 menit, banner hitung mundur, pesan Admin Utama)? | (a) **Ikut seperti Kecamatan** ✅ (b) Bebas seperti Admin Utama | ✅ (a): konsisten dan menjaga aturan penutupan |
| **K4** | **Rekomendasi MUI** pada data yang MUI input sendiri | (a) Otomatis **"Sesuai"** dengan catatan "Diinput langsung oleh MUI" ✅ (b) Tetap "Belum Diperiksa" | ✅ (a): MUI tidak perlu memverifikasi inputnya sendiri dan daftar "belum diperiksa" tidak penuh. Admin Utama tetap memverifikasi berkas seperti biasa |
| **K5** | **Berkas "Rekomendasi MUI"** (wajib untuk Ustadz/Ustadzah) pada input oleh MUI | (a) **Tetap wajib** ✅ (b) Tidak wajib | ✅ (a): berkas tetap menjadi bukti; mudah dilonggarkan nanti |
| **K6** | **Siapa melihat penanda penginput**? | (a) **Admin Utama + MUI** ✅ (b) Semua peran | ✅ (a): sesuai permintaan "info ke Admin Utama"; akun Kecamatan/Kemenag tidak menerima keterangan itu dari server |
| **K7** | **Dashboard Progres & Data Detail** untuk MUI | (a) Tetap disembunyikan ✅ (b) Dibuka khusus Ustadz/Ustadzah | ✅ (a): tidak diminta, bisa jadi tahap lanjutan |
| **K8** | **Tampilan awal** setelah login MUI | (a) Tetap Lihat Data (b) **Langsung tab Input** ✅ | ✅ **(b) — diputuskan user.** Konsisten dengan Kecamatan/Kemenag/Admin Utama dan menghapus pengecualian khusus MUI di kode. Saat periode ditutup, aturan yang ada otomatis mengarahkan ke Lihat Data. Pengaman: **lencana jumlah "N belum diperiksa"** pada tab Lihat Data khusus MUI (dihitung dari data yang sudah dimuat, tanpa permintaan baru) agar antrean verifikasi tidak terlupakan |
| **K9** | **Pemberitahuan ke Admin Utama** saat MUI menyimpan | (a) Penanda + filter + ringkasan jumlah di Lihat Data ✅ (b) ditambah toast/lonceng realtime | ✅ (a); (b) bisa menyusul bila diperlukan |
| **K10** | **Beberapa akun MUI**? | Sistem mendukung banyak akun berperan MUI; nama akun penginput tercatat per akun | Tidak perlu keputusan; mohon pastikan akun MUI di **Kelola User kolom Kecamatan kosong** (bila terisi, formulir akan terkunci ke satu kecamatan) |

---

## 4. Matriks hak akses setelah perubahan

| Aksi | Admin Utama | Kecamatan | Kemenag | **MUI (baru)** |
|---|---|---|---|---|
| Input layanan Ustadz / Ustadzah | Ya | Ya (kecamatannya) | Tidak | **Ya, se-Kota Medan** |
| Input layanan lain (Imam Masjid, GMM, dst.) | Ya | Sesuai peran | Sesuai peran | **Tidak** (ditolak server) |
| Tombol/instansi **Kemenag** di formulir | Aktif | Nonaktif | Aktif sesuai peran | **Nonaktif** |
| Kecamatan lokasi tugas | Bebas | Terkunci | Sesuai peran | **Bebas (21 kecamatan)** |
| Edit data | Semua | Data kecamatannya | Sesuai peran | **Hanya data yang ia input sendiri** (K2) |
| Ikut tutup periode / timer | Tidak | Ya | Ya | **Ya** (K3) |
| Verifikasi rekomendasi MUI | Ya | Tidak | Tidak | Ya (tetap) |
| Melihat penanda "Input MUI" & nama penginput | Ya | Tidak | Tidak | Ya (K6) |
| Dashboard Progres / Data Detail / Retur | Ya | Sesuai peran | Sesuai peran | **Tidak** (tetap) |

---

## 4a. Tugas MUI yang sudah ada **tidak berubah**

Fitur ini hanya **menambah** kemampuan input. Seluruh tugas MUI yang berjalan sekarang harus tetap sama dan menjadi syarat penerimaan (§10E, §14).

| Tugas / fitur MUI saat ini | Setelah perubahan |
|---|---|
| Melihat data **Ustadz & Ustadzah se-Kota Medan** (semua kecamatan) | Sama |
| Semua **filter** Lihat Data, termasuk "MUI: Perlu Koreksi / Sah / Belum Diperiksa" | Sama (ditambah filter Penginput) |
| **Verifikasi rekomendasi** pada data pihak lain: Sesuai / Perlu Koreksi, catatan wajib bila Perlu Koreksi, tombol "Kirim Catatan ke Admin Utama" | Sama |
| Melihat **berkas Rekomendasi MUI** dan tanda "berkas belum diunggah" | Sama |
| Menerima **tanggapan Admin Utama** | Sama |
| **Lencana status rekomendasi** di setiap baris | Sama |
| Sapaan "Instansi Rekomendasi : MUI Kota Medan" di kepala halaman | Sama |
| Ganti password, keluar, ikon aplikasi | Sama |
| Dashboard Progres, Data Detail, Retur **tidak tersedia** | Sama (K7) |
| Pengaturan akun MUI di Kelola User (peran, nama) | Sama |

Yang berubah bagi MUI hanya: (1) bisa **input** Ustadz/Ustadzah dan **edit milik sendiri**, (2) ikut **tutup periode**, (3) **tampilan awal** menjadi Input (K8b).

---

## 5. Rancangan teknis — server

Semua dalam fungsi `api` (Edge Function). **Tanpa migrasi database.**

| # | Berkas | Perubahan |
|---|---|---|
| S1 | `_shared/akses.ts` | Konstanta `LAYANAN_INPUT_MUI = ["USTADZ", "USTADZAH"]` dan helper `layananBolehDiinputMui(layanan)` (satu sumber kebenaran, dipakai simpan & edit) |
| S2 | `domains/penerima.ts` — `simpanDataKeSheet` | Ganti penolakan total MUI (baris 599) dengan: layanan harus ∈ `LAYANAN_INPUT_MUI` (huruf besar, spasi dirapikan), jika tidak → *"GAGAL: Akun MUI hanya berwenang mengisi layanan Ustadz dan Ustadzah."*. **Tanpa pembatasan kecamatan** (sesi MUI tanpa kecamatan). Tetap lewat `periksaIzinInput`, `tentukanWilayahTugas`, kuota, NIK/rekening/tempat tugas ganda |
| S3 | `domains/penerima.ts` — `editDataPenerima` | Ganti penolakan total MUI (baris 858) dengan: MUI hanya boleh bila `rowLama.dibuat_oleh_akun_id = sesi.akunId` **dan** layanan ∈ `LAYANAN_INPUT_MUI` (K2), plus `periksaIzinInput("edit")`. Selain itu → *"Akun MUI hanya dapat mengubah data yang diinputnya sendiri."* |
| S4 | `domains/setelan.ts` — `periksaIzinInput` | MUI masuk kelompok **terbatas** seperti Kecamatan/Kemenag (K3), sehingga sakelar umum, sakelar khusus akun, jadwal otomatis, dan masa tenggang unggah berlaku. Pesan penutupan memakai kalimat yang sama |
| S5 | `domains/master.ts` | `JENIS_PER_ROLE.MUI = ["MASJID", "MUSHOLLA"]` agar daftar rumah ibadah untuk Ustadz/Ustadzah terisi; `sesiTerikatKecamatan` tetap salah untuk MUI (se-Kota) |
| S6 | `domains/penerima.ts` — rekomendasi otomatis (K4a) | Pada `insert`, bila `sesi.role = MUI`: `status_rekomendasi_mui = 'SESUAI'`, `petugas_rekomendasi_mui = nama akun`, `tgl_rekomendasi_mui = now()`, `catatan_rekomendasi_mui = 'Diinput langsung oleh akun MUI'` |
| S7 | `domains/penerima.ts` — daftar & detail | Tambah `left join akun` (kunci utama, murah) untuk mengirim **penginput**: peran, nama, waktu input. Diisi **hanya bila peminta Admin Utama atau MUI** (K6); selain itu kosong. Ditaruh di **indeks paling akhir** supaya indeks lama tidak bergeser (pola yang sama dengan kolom 40–47). Detail juga mengirim penanda `milikSendiri` agar frontend tidak menebak (K2) |
| S8 | `domains/ekspor.ts` | Kolom tambahan **"DIINPUT OLEH"** pada ekspor Admin Utama (nama + peran penginput) |
| S9 | `index.ts` | Tidak ada aksi baru (memakai `simpanDataKeSheet`, `editDataPenerima`, dan aksi daftar/detail yang sudah ada) |

**Catatan keamanan server:** kecamatan yang dikirim MUI tetap divalidasi: untuk rumah ibadah terdaftar harus sama dengan kecamatan rumah ibadah; untuk input langsung, kelurahan harus ada di kecamatan itu (`kelurahanAdaDiKecamatan`). Kecamatan karangan ditolak.

---

## 6. Rancangan teknis — tampilan (frontend)

Batas 3.500 baris: `index.html` 3.483, `app-transaksi.js` 3.488 → perubahan di keduanya **sangat kecil**; logika baru ditaruh di berkas baru.

| # | Berkas | Perubahan |
|---|---|---|
| F1 | `app-core.js` `terapkanHakAkses` | Untuk MUI: **tampilkan** tab Input dan panel; instansi **Kecamatan aktif**, tombol **Kemenag nonaktif** (`disabled`, `opacity-40`, `cursor-not-allowed`, keterangan "Akun MUI hanya untuk layanan Ustadz dan Ustadzah"); kecamatan lokasi tugas **bebas**; dropdown layanan hanya **USTADZ** dan **USTADZAH**. **Tab awal = Input** (K8b): cabang khusus `isMui → klik tab Rekap` dihapus; bila periode ditutup, aturan yang ada mengarahkan ke Lihat Data. Tambah **lencana "N belum diperiksa"** di tab Lihat Data untuk MUI (dihitung dari data yang sudah dimuat) |
| F2 | `app-core.js` handler tab Input | Hapus toast penolakan MUI; tambah cabang MUI (mirip cabang Kecamatan tetapi kecamatan tidak dikunci) |
| F3 | `app-core.js` `murniGantiInstansi` | Tolak pergantian ke KEMENAG untuk MUI (pengaman, sama seperti pengaman akun Kecamatan); render dropdown 2 layanan |
| F4 | `app-core.js` pembaruan master (`getMasterLayanan`) | Kecualikan MUI dari render ulang dropdown penuh |
| F5 | `app-core.js` `periksaStatusAkses`, `isRoleKecKem_` | Sertakan MUI agar status buka/tutup dipantau (K3). Untuk tempat yang memang khusus Kecamatan/Kemenag (mis. tombol "Laporkan Sudah Diperbaiki") dibuat fungsi pembantu terpisah, bukan mengubah arti `isRoleKecKem_` |
| F6 | `app-pesan-periode.js` | Cabut pengecualian MUI (`adalahMui()`) pada banner hitung mundur, modal penutupan, toast bertahap, dan pesan Admin Utama (K3) |
| F7 | `app-transaksi.js` tombol edit | Tambah syarat MUI: data **milik sendiri** (penanda dari server) dan periode terbuka; selain itu tombol tetap tersembunyi |
| F8 | Formulir (berkas wajib, label "Upload Rekomendasi MUI") | Tidak diubah (K5) |
| F9 | Berkas baru `public/js/app-penanda-mui.js` | Penanda, filter, dan ringkasan untuk Admin Utama/MUI (lihat §7). Dimuat malas lewat pemuat di `app-pesan-periode.js` (diperluas: UTAMA mendapat semua skrip admin, MUI hanya skrip ini) |

---

## 7. Penanda "diinput oleh MUI" untuk Admin Utama

Tujuannya: Admin Utama **langsung tahu** data mana yang masuk lewat akun MUI, tanpa membuka satu per satu.

| Lapisan | Wujud | Data |
|---|---|---|
| **Baris Lihat Data** | Lencana kecil **"Input MUI"** (warna hijau zamrud, senada lencana MUI yang ada) di bawah nama, di samping lencana status rekomendasi | Dari kolom penginput baru (S7); hanya muncul bila peran penginput = MUI |
| **Filter** | Pilihan baru **"Penginput"**: Semua · **Diinput MUI** · Diinput Kecamatan · Diinput Kemenag · Diinput Admin Utama (berlaku bersama filter lain seperti biasa) | Disaring di sisi browser dari data yang sudah dimuat (tanpa permintaan baru) |
| **Ringkasan** | Satu baris kecil di atas tabel (khusus Admin Utama/MUI): *"Diinput MUI: 42 data (Ustadz 25 · Ustadzah 17)"* mengikuti filter aktif | Dihitung dari data yang sama |
| **Detail data** | Baris informasi: *"Diinput oleh **\<Nama akun\>** (MUI Kota Medan) pada \<tanggal WIB\>"* | `penerima.dibuat_at` + nama akun |
| **Ekspor Excel** | Kolom **DIINPUT OLEH** | S8 |
| **Realtime** | Tabel ikut diperbarui lewat mekanisme CDC yang sudah ada saat MUI menyimpan | Tidak ada kode baru |

Data lama (sebelum fitur) tidak punya input MUI, jadi **tidak perlu pengisian ulang**. Pengenal diambil dari `akun.role`, bukan dari kolom baru; bila akun MUI diganti perannya kelak, penanda ikut peran saat itu (dicatat sebagai batasan, lihat §11).

---

## 8. Keamanan & integritas data

| Ancaman | Penanganan |
|---|---|
| MUI memalsukan permintaan untuk layanan lain | Server menolak (S2); tombol/dropdown hanya kenyamanan |
| MUI mengisi kecamatan karangan | Divalidasi terhadap rumah ibadah / tabel wilayah (§5 catatan) |
| MUI mengubah data milik Kecamatan | Server menolak (S3) |
| MUI menginput saat periode ditutup | `periksaIzinInput` (S4) di simpan, edit, dan unggah berkas |
| Peran lain melihat siapa penginputnya | Server hanya mengirim keterangan penginput kepada Admin Utama dan MUI (S7) |
| Kuota dilampaui oleh dua akun bersamaan | Pemeriksaan kuota yang sudah ada (satu tempat, setelah simpan di transaksi); perilaku sama dengan akun Kecamatan |
| Akun MUI terisi kecamatan | Formulir terkunci ke satu kecamatan dan validasi wilayah ikut membatasi → diperiksa di langkah M1 dan diingatkan di Kelola User |

---

## 9. Tahapan kerja

| Tahap | Isi | Keluaran / bukti | Jalan balik |
|---|---|---|---|
| **M0** | Jawab keputusan §3 | Plan v2 bila ada perubahan | — |
| **M1** | Periksa data produksi (baca saja): akun MUI aktif, kolom `kecamatan` kosong; kuota Ustadz/Ustadzah per kecamatan sudah terisi; `dibuat_oleh_akun_id` terisi pada data terbaru | Catatan temuan | — |
| **M2** | **Server** S1–S8 + uji di mesin Postgres lokal (PGlite, pola uji timer) | Uji server lulus (§10A) | Tidak dideploy |
| **M3** | **Frontend** F1–F8 (input MUI) + uji jsdom | Uji UI lulus (§10B) | Tidak di-push |
| **M4** | **Penanda** F9 + S7/S8 + uji jsdom dan visual Chrome | Uji lulus (§10C) | Tidak di-push |
| **M5** | Regresi akun lain + uji mutasi + pemeriksaan proyek (`check-lines`, `verify-html`, build) | Semua lulus | — |
| **M6** | **Deploy bertahap**: (1) deploy fungsi `api` baru (sepenuhnya kompatibel mundur: frontend lama tetap bekerja, MUI belum melihat tab Input); (2) push frontend → Vercel | Fungsi v77 live, lalu frontend live | Kembalikan versi fungsi sebelumnya; revert commit frontend |
| **M7** | **Uji akun nyata** oleh Anda dengan akun MUI (atau akun uji `uji_mui` bila masih aktif): input 1 Ustadz di kecamatan berbeda, coba layanan lain (harus ditolak), coba edit data milik Kecamatan (harus ditolak), cek penanda di akun Admin Utama | Daftar centang M7 (§13) | Hapus data uji lewat Kelola Data |
| **M8** | Pantau 24 jam: log fungsi, kuota, data masuk | Laporan singkat | — |

Perkiraan: M1 ±½ jam, M2 ±1 hari, M3 ±½ hari, M4 ±½ hari, M5–M6 ±¼ hari, M7–M8 mengikuti jadwal Anda.

---

## 10. Daftar uji

### A. Server (mesin Postgres lokal)
- [ ] MUI menyimpan **Ustadz** dan **Ustadzah** di beberapa kecamatan berbeda → berhasil; `dibuat_oleh_akun_id` = akun MUI
- [ ] MUI menyimpan layanan lain (Imam Masjid, Khatib Jumat, GMM, Guru Sekolah Minggu, dst.) → **ditolak** dengan pesan jelas; juga bentuk lama `USTADZ/USTADZAH` ditolak untuk input
- [ ] Penulisan layanan huruf kecil/spasi ganda tetap dinilai benar (dirapikan)
- [ ] Kecamatan karangan / kelurahan tidak di kecamatan itu → ditolak
- [ ] Rumah ibadah tercatat di kecamatan lain dari yang dipilih → ditolak dengan pesan yang sama seperti akun lain
- [ ] Input "LAINNYA" (tanpa rumah ibadah) berhasil dengan kecamatan & kelurahan pilihan
- [ ] Kuota habis → ditolak; kuota dihitung **bersama** data Kecamatan (K1); kuota belum diset → pesan yang sama seperti sekarang
- [ ] NIK ganda, rekening ganda, tempat tugas ganda → ditolak seperti akun lain
- [ ] Periode **ditutup** (sakelar umum, sakelar khusus akun, jadwal otomatis) → MUI ditolak; **masa tenggang 5 menit** unggah berlaku; Admin Utama tetap bebas
- [ ] Edit: data **milik sendiri** berhasil; data milik Kecamatan → ditolak; layanan di luar Ustadz/Ustadzah → ditolak; periode tutup → ditolak
- [ ] Rekomendasi otomatis (K4a): status "SESUAI", petugas, tanggal, catatan terisi
- [ ] Daftar & detail: keterangan penginput **hanya** untuk Admin Utama dan MUI; untuk Kecamatan/Kemenag **kosong**
- [ ] Daftar rumah ibadah untuk MUI terisi (Masjid, Musholla) tanpa batas kecamatan
- [ ] **Regresi**: Kecamatan, Kemenag (bebas & terikat), Admin Utama menyimpan/mengedit persis seperti sebelumnya
- [ ] Ekspor Admin Utama memuat kolom "DIINPUT OLEH" dengan nilai benar
- [ ] Kinerja: `EXPLAIN` daftar data dengan `left join akun` tetap cepat (ribuan baris)

### B. Tampilan input (jsdom dengan `index.html` asli)
- [ ] Login MUI: tab **Input tampil**, **terbuka sebagai tampilan awal** (K8b); saat periode ditutup, tampilan awal otomatis Lihat Data
- [ ] Lencana "N belum diperiksa" pada tab Lihat Data MUI: angka benar, ikut berkurang setelah MUI menandai Sesuai/Perlu Koreksi, **tidak tampil** untuk peran lain
- [ ] Tombol **Kemenag nonaktif** dan klik paksa tidak berpengaruh
- [ ] Dropdown layanan hanya **USTADZ** dan **USTADZAH**; tetap benar setelah `getMasterLayanan` selesai/dimuat ulang
- [ ] Kecamatan lokasi tugas **bebas** (21 pilihan, tidak terkunci)
- [ ] Banner hitung mundur & modal penutupan **muncul untuk MUI**; saat ditutup formulir terkunci
- [ ] Tombol Edit hanya pada data milik sendiri
- [ ] Peran lain tidak berubah (Kecamatan, Kemenag, Admin Utama)
- [ ] Tidak ada tombol/halaman Dashboard, Data Detail, Retur untuk MUI

### C. Penanda Admin Utama
- [ ] Lencana "Input MUI" tampil di baris yang tepat, **tidak** tampil pada data Kecamatan/Kemenag/Admin Utama
- [ ] Filter "Penginput" bekerja bersama filter lain; ringkasan jumlah mengikuti filter
- [ ] Detail menampilkan nama akun + peran + tanggal (WIB) yang benar
- [ ] Akun Kecamatan/Kemenag **tidak** melihat penanda maupun nama penginput (periksa juga isi respons server)
- [ ] Tampilan HP (390 px) rapi; uji visual di Chrome

### E. Regresi tugas MUI yang sudah ada (§4a)
- [ ] MUI melihat **hanya** Ustadz/Ustadzah, se-Kota Medan, jumlah baris sama dengan sebelum perubahan
- [ ] Filter status rekomendasi ("Perlu Koreksi", "Sah", "Belum Diperiksa") menghasilkan data yang sama seperti sebelum perubahan
- [ ] **Verifikasi rekomendasi** pada data milik Kecamatan: simpan Sesuai; simpan Perlu Koreksi **tanpa catatan ditolak**; dengan catatan berhasil; Kecamatan/Kemenag tetap **tidak** bisa memverifikasi
- [ ] Tanggapan Admin Utama ke MUI tampil dan tombol kirim bekerja
- [ ] Lencana & berkas Rekomendasi MUI tampil seperti sebelumnya
- [ ] Dashboard Progres, Data Detail, Retur tidak muncul untuk MUI
- [ ] Data yang MUI input sendiri (K4a) **tidak** mengubah alur verifikasi data pihak lain
- [ ] Perbandingan **sebelum/sesudah** (data uji sama) pada respons daftar data MUI: seluruh indeks lama tidak bergeser, indeks baru hanya ditambahkan di akhir

### D. Mutasi & proyek
- [ ] Merusak sengaja: hapus pemeriksaan layanan, hapus pemeriksaan "milik sendiri", MUI tidak ikut periode, penanda ke semua peran → **tiap kerusakan tertangkap uji**
- [ ] `check-lines`, `verify-html`, build Vite, pemeriksaan tipe Deno (`deno check`: tidak menambah galat dari 4 galat lama)

---

## 11. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Kuota bersama membuat Kecamatan kehabisan kuota karena input MUI | K1 diputuskan sadar; Admin Utama dapat menambah kuota di Kelola Kuota; MUI/Kecamatan melihat pesan kuota yang jelas |
| Tombol Kemenag "mati" membingungkan | Redup + keterangan alasan (tooltip) |
| Dropdown layanan MUI kembali penuh setelah master dimuat | Dikecualikan (F4) dan diuji khusus |
| Akun MUI terisi kecamatan → formulir terkunci | Dicek di M1; diingatkan di Kelola User; pesan error jelas |
| Perubahan `isRoleKecKem_` merembet ke tempat lain | Tidak diubah artinya; dibuat fungsi pembantu khusus MUI |
| Penanda salah bila peran akun diganti kelak | Dicatat sebagai batasan; bila perlu bisa menambahkan kolom `penginput_peran` (migrasi kecil) pada tahap lanjutan |
| Deploy fungsi dan frontend tidak serentak | Fungsi baru kompatibel mundur; urutan deploy fungsi → frontend |
| Data uji tertinggal | Gunakan NIK/nama uji yang jelas, hapus lewat Kelola Data setelah M7 |

---

## 12. Jalan balik (rollback)
- **Frontend:** `git revert` commit fitur lalu push (atau *Promote* deploy Vercel sebelumnya). MUI kembali hanya melihat data.
- **Fungsi `api`:** deploy ulang versi sebelumnya (v76); aturan lama (MUI ditolak menyimpan) kembali.
- **Data:** data yang sudah diinput MUI tetap sah; bila perlu dihapus, gunakan Kelola Data. **Tanpa migrasi**, tidak ada skema yang perlu dipulihkan.

---

## 13. Panduan singkat

**Untuk akun MUI**
1. Login → buka tab **Input** (di samping Lihat Data).
2. Pilih layanan **Ustadz** atau **Ustadzah** (tombol Kemenag tidak aktif).
3. Pilih **Kecamatan lokasi tugas** (bebas se-Kota Medan), lalu isi data dan unggah berkas seperti biasa.
4. Data yang Anda input bisa diedit sendiri selama periode input masih terbuka.

**Untuk Admin Utama**
- Di **Lihat Data**, data yang masuk lewat MUI ditandai **"Input MUI"**. Gunakan filter **Penginput → Diinput MUI** untuk melihat semuanya; buka **Detail** untuk melihat nama akun dan waktu input.

**Daftar centang uji M7 (oleh Anda)**
- [ ] Login MUI → tab Input terbuka, tombol Kemenag tidak bisa diklik, layanan hanya Ustadz & Ustadzah
- [ ] Input 1 data Ustadz di kecamatan A dan 1 data Ustadzah di kecamatan B → berhasil
- [ ] Login Admin Utama → kedua data bertanda "Input MUI", filter Penginput berfungsi, detail menunjukkan penginput
- [ ] Login Kecamatan A → data tadi terlihat di wilayahnya **tanpa** keterangan penginput
- [ ] Coba edit data milik Kecamatan dari akun MUI → tidak ada tombol/ditolak
- [ ] (Saat jam kosong) tutup periode → akun MUI ikut terkunci

---

## 14. Kriteria selesai
1. MUI dapat menginput **hanya** Ustadz dan Ustadzah, se-Kota Medan; layanan lain ditolak **oleh server**.
2. Tombol Kemenag tidak berfungsi untuk MUI; dropdown layanan hanya 2 pilihan; semua filter berlaku seperti biasa.
3. Admin Utama melihat penanda "Input MUI", bisa memfilter, dan melihat nama + waktu penginput di Detail dan Ekspor; peran lain tidak.
4. MUI ikut aturan periode, kuota, dan validasi data yang sama dengan akun lain (sesuai K1–K3).
5. Akun Kecamatan, Kemenag, dan Admin Utama **tidak berubah perilakunya** (uji regresi).
5a. **Semua tugas MUI yang sudah ada tetap berjalan sama** (§4a): melihat data Ustadz/Ustadzah se-Kota, semua filter, verifikasi rekomendasi, tanggapan Admin Utama, lencana, dan pembatasan fitur lain — dibuktikan uji regresi §10E.
5b. MUI mendarat di halaman Input (K8b) dan melihat lencana "belum diperiksa" di tab Lihat Data.
6. Semua uji §10 lulus, termasuk uji mutasi; fungsi dan frontend dideploy bertahap; uji akun nyata (M7) lulus.

## 15. Di luar lingkup
- Kuota terpisah khusus MUI (K1b).
- Membuka Dashboard Progres / Data Detail untuk MUI (K7b).
- Notifikasi realtime/lonceng ke Admin Utama (K9b).
- Menyimpan peran penginput sebagai kolom tersendiri (hanya bila diperlukan, lihat §11).
- Mengubah alur verifikasi berkas oleh Admin Utama.
