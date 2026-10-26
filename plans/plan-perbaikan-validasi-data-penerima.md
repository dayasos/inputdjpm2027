# Plan: Perbaikan Validasi Data Penerima (Tanggal Lahir & Kelurahan Tugas)

> Dibuat 2026-10-26. **STATUS: P0, P1, dan P2 SELESAI LOKAL (2026-10-26); belum di-commit, belum dideploy. P3 (commit + deploy + uji penolakan 3 jalur) dan seterusnya belum dikerjakan.** Data yang sudah salah **diperbaiki manual oleh user** (bukan oleh Claude).
> Terkait: `plans/plan-cek-status-penerima-publik.md` (fitur cek status memakai tanggal lahir sebagai kunci, sehingga data harus bersih dulu).

## 1. Latar belakang
Dua data lolos ke database dengan nilai tidak wajar (data per 2026-10-26, `penerima_2027`):
| No. | Masalah | Dibuat/diubah | Jalur |
|---|---|---|---|
| 1575 | Tanggal lahir **0199-02-04** (umur tercatat 1.827) | dibuat 2026-10-19 lewat input biasa | `simpanDataKeSheet` |
| 902 | **Kelurahan tugas kosong** (sebelumnya BELAWAN BAHARI) | diubah 2026-10-18 oleh akun `admin` (UTAMA) bersama perubahan Tempat Tugas | `adminUbahData` (Kelola Data) atau `editDataPenerima`, keduanya punya celah yang sama (lihat 2) |
Dari 3.136 data lain: umur terkecil 18, terbesar 86; hanya dua data ini yang janggal.

## 2. Akar masalah (terbukti dari kode, bukan dugaan)
| # | Celah | Lokasi | Bukti |
|---|---|---|---|
| G1 | Kolom tanggal lahir di layar **tanpa `min`/`max`**; Chrome menerima tahun 3 digit (0199) | `index.html:649` (`<input type="date" required>`) | tidak ada atribut batas |
| G2 | Pemeriksaan umur hanya `< 18`; **tanpa batas atas** dan tanpa rentang tanggal | layar `app-transaksi.js:1075`; server `penerima.ts:711` (simpan) dan `penerima.ts:1077` (edit); `kelolaData.ts:387-389` (Kelola Data) | umur 1.827 lolos |
| G3 | **Edit Kelola Data**: pemeriksaan kelurahan hanya jalan bila nilai kelurahan **tidak kosong** (`&& eff("kelurahan")`) → kelurahan dikosongkan lolos | `kelolaData.ts:378` | riwayat edit No. 902 |
| G4 | **Edit data biasa**: seluruh blok pemeriksaan wilayah tugas hanya untuk peran **bukan UTAMA** (`if (peranSesi !== "UTAMA")`) | `penerima.ts:1038` | Admin Utama tidak diperiksa |
| G5 | **Input baru oleh UTAMA**: wilayah tugas langsung diloloskan tanpa memeriksa kelurahan kosong/di kecamatan | `_shared/wilayahTugas.ts:~133-135` (`peran === "UTAMA"` → `ok: true`) | tidak ada pemeriksaan |
| G6 | Form edit Kelola Data memungkinkan memilih "-- Pilih Kelurahan --" (kosong) dan **tidak melarang simpan**; mengganti kecamatan juga mengosongkan kelurahan | `app-kelola-data.js:296, 721-736` | tidak ada `required` |
| G7 | **Tidak ada batasan di database** untuk tanggal lahir maupun kelurahan kosong | tabel `penerima_2027` | tidak ada CHECK |
Catatan: alasan persis akun `admin` mengirim kelurahan kosong pada 2026-10-18 **tidak bisa dibuktikan** dari log; yang pasti, tidak ada lapisan yang menolaknya.

## 3. Tujuan dan batas
- Nilai tidak wajar **ditolak di semua jalur tulis, untuk semua peran (termasuk UTAMA)**, dengan pesan yang jelas.
- Tiga lapis: **layar** (cegah dini), **server** (penegak utama), **database** (jaring pengaman terakhir).
- **Tidak** mengubah data yang sudah ada (user memperbaiki manual). **Tidak** mengubah aturan bisnis lain (kuota, hak akses, verifikasi).
- Edit kolom lain pada data lama yang kebetulan janggal tetap boleh (pemeriksaan hanya pada kolom yang BERUBAH, mengikuti pola yang sudah ada di `penerima.ts` agar tidak tiba-tiba gagal).

## 4. Aturan validasi (spesifikasi)
### 4.1 Tanggal lahir
1. Tanggal kalender sungguhan (menolak 31 Februari dll).
2. Tahun ≥ **1900** dan tanggal ≤ **hari ini** (WIB).
3. Umur pada patokan 1 Januari `TAHUN_AKTIF` (cara hitung yang ada: `hitungUmur`) harus **18 ≤ umur ≤ 100** (batas atas **K1**, usulan 100; data nyata maksimum 86).
4. Pesan: `GAGAL: Tanggal lahir tidak wajar. Pastikan tahun lahir 4 digit (mis. 1990) dan usia antara 18 sampai 100 tahun.` Pesan umur < 18 yang ada tetap dipakai.
### 4.2 Kelurahan wilayah tugas
1. **Wajib terisi** (setelah dirapikan spasi), untuk **semua peran termasuk UTAMA**, pada: input baru, edit data, dan edit Kelola Data.
2. Harus ada di kecamatan tugasnya menurut tabel `wilayah` (fungsi yang ada: `kelurahanAdaDiKecamatan`).
3. Rumah ibadah yang kelurahannya kosong di data tetap diperbolehkan: petugas memilih kelurahan manual, dan pilihannya diperiksa (perilaku yang sudah ada untuk non-UTAMA; kini berlaku untuk UTAMA juga).
4. Pesan: `GAGAL: Kelurahan wilayah tugas wajib dipilih.` (sudah ada, dipakai ulang) dan pesan "tidak berada di Kecamatan" yang sudah ada.
### 4.3 Yang sengaja tidak diubah
Domisili (sudah wajib berpasangan di server), NIK/rekening, alur verifikasi.

## 5. Rancangan perubahan
### 5.1 Satu sumber aturan di server: `supabase/functions/api/_shared/validasiPenerima.ts` (baru, MODUL MURNI)
Fungsi murni tanpa Deno/DB (sama seperti `cekStatusInti.ts`, agar bisa diuji di Node):
- `periksaTanggalLahir(iso, { tahunAktif, hariIni, umurMin = 18, umurMaks = 100 })` → `{ok:true, umur}` atau `{ok:false, pesan}`.
- `periksaKelurahanWajib(kelurahan)` → mengecek tidak kosong.
Pemeriksaan ke tabel `wilayah` tetap memakai `kelurahanAdaDiKecamatan` yang sudah ada (butuh DB, jadi di luar modul murni).
### 5.2 Pemakaian di tiga jalur tulis
| Jalur | Perubahan |
|---|---|
| `simpanDataKeSheet` (`penerima.ts` ~711) | ganti `umurHitung < 18` dengan `periksaTanggalLahir`; pada `wilayahTugas.ts` hapus pengecualian UTAMA dari pemeriksaan kelurahan (G5) |
| `editDataPenerima` (`penerima.ts` ~1038, 1077) | pemeriksaan kelurahan berlaku untuk semua peran bila tempat tugas/kelurahan **berubah** (G4); ganti pemeriksaan umur dengan `periksaTanggalLahir` |
| `adminUbahData` (`kelolaData.ts` ~378, 387) | kelurahan kosong ditolak bila `kelurahan` atau `kecamatan` ada di perubahan (G3); ganti pemeriksaan umur (G2) |
Aksi `validasiDataBaru` (`domains/validasi.ts:272`, pra-validasi sebelum simpan) diperiksa pada P1: bila memeriksa umur/wilayah dengan logika sendiri, ia ikut memakai fungsi yang sama agar pesan tampil dini dan konsisten.
### 5.3 Layar
- `index.html:649`: `min="1900-01-01"` dan `max` = hari ini (diisi lewat skrip saat halaman dimuat, supaya tidak usang).
- `app-transaksi.js` (~26-45 dan 1075): tampilkan pesan bila tahun < 1900 atau usia > 100, dan **blokir tombol simpan** (bukan hanya toast).
- Kelola Data (`app-kelola-data.js`): kolom tanggal (teks `DD-MM-YYYY`) diperiksa dini; kelurahan tugas kosong → tombol Simpan nonaktif + pesan "Kelurahan wajib dipilih"; saat kecamatan diganti dan kelurahan masih kosong, beri penanda jelas.
- Tidak ada kelas Tailwind baru bila memungkinkan; bila ada → `npm run build:css` + commit CSS + `npm run check-css`.
### 5.4 Database (jaring pengaman)
Pada **partisi `penerima_2027` saja** (bukan tabel induk, agar arsip 2026 dan sinkron Sheet 2026 tidak terpengaruh):
```sql
alter table public.penerima_2027
  add constraint penerima_2027_tgl_lahir_wajar
    check (tanggal_lahir between date '1900-01-01' and date '2100-12-31') not valid,
  add constraint penerima_2027_kelurahan_terisi
    check (btrim(kelurahan) <> '') not valid;
-- setelah data diperbaiki user dan dipastikan bersih:
alter table public.penerima_2027 validate constraint penerima_2027_tgl_lahir_wajar;
alter table public.penerima_2027 validate constraint penerima_2027_kelurahan_terisi;
```
Alasan batas atas 2100 (bukan hari ini): CHECK harus bersifat tetap; batas "tidak di masa depan" ditegakkan server. **PERINGATAN**: `NOT VALID` tetap memeriksa setiap `UPDATE` pada baris yang melanggar (termasuk update status verifikasi). Karena itu migrasi ini **hanya dijalankan SETELAH** kedua data diperbaiki user (fase P0 selesai).
### 5.5 Pemeriksa kualitas data berkala
Skrip SQL baca-saja `scripts/cek-kualitas-data-penerima.sql`: tanggal lahir di luar rentang/umur di luar 18-100, kelurahan atau kecamatan kosong, pasangan kecamatan-kelurahan tidak ada di `wilayah`, NIK bukan 16 digit, umur tidak konsisten dengan tanggal lahir. Dijalankan sebelum F2 cek status dan sesudah tiap periode input besar.

## 6. Tahapan
| Fase | Isi | Pelaku | Menyentuh produksi? |
|---|---|---|---|
| **P0** | User memperbaiki manual No. 1575 (tanggal lahir) dan No. 902 (kelurahan). Claude menjalankan pemeriksa kualitas data (baca-saja) dan melapor hasilnya | User + Claude(baca) | Hanya baca |
| **P1** | Tulis `validasiPenerima.ts` + uji Node (batas tanggal/umur, kabisat, kelurahan kosong, tidak membedakan peran) + uji perusakan; pasang di tiga jalur server; periksa sintaks (esbuild) | Claude | Tidak (lokal) |
| **P2** | Perubahan layar + uji headless Chrome (isian tahun 3 digit ditolak, simpan terblokir, pesan tampil) di HP/desktop | Claude | Tidak (lokal) |
| **P3** | Commit + push + deploy fungsi Edge dan frontend; uji pasca-deploy dengan data uji yang **dibatalkan**/tidak menyimpan (hanya menguji penolakan) | Claude, perintah user | **Ya** (rendah risiko: hanya menolak nilai tidak wajar) |
| **P4** | Migrasi CHECK `NOT VALID` lalu `VALIDATE` (bagian 5.4), sesudah pemeriksa kualitas data bersih | Claude, perintah user | Ya |
| **P5** | Jadwalkan pemeriksa kualitas data (manual/tiap periode); catat di runbook | Claude/user | Tidak |
Aturan semua fase: bertahap, menunggu persetujuan tiap fase; tidak commit/push tanpa perintah user.

## 7. Urutan penerapan dan kompatibilitas
- **Server dulu, layar kemudian** (atau bersamaan): server yang lebih ketat hanya menolak nilai tidak wajar; layar lama (cache PWA) yang mengirim nilai tidak wajar akan menerima pesan `GAGAL: ...` yang sudah ditampilkan sebagai toast oleh aplikasi.
- Naikkan `?v=` pada berkas JS yang berubah di `index.html` agar cache petugas terbuang.
- **Tidak ada migrasi data**; migrasi CHECK baru di P4.
- Ketergantungan: fitur cek status (F2) menunggu P0 dan idealnya P3.

## 8. Rencana uji
**Unit (Node, data karangan):** tanggal valid/tidak (31 Feb, tahun 0199, 1899-12-31, masa depan, 29 Feb kabisat/bukan), umur tepat 18 dan 100 pada patokan 1 Januari (hari ulang tahun 1 Jan vs 2 Jan), umur 17/101 ditolak; kelurahan kosong/berspasi ditolak; **hasil sama untuk peran UTAMA dan non-UTAMA**; edit yang tidak mengubah tanggal/kelurahan tidak memicu pemeriksaan.
**Uji perusakan:** kembalikan tiap pengecualian lama (pengecualian UTAMA, `&& eff("kelurahan")`, batas atas dihapus) dan pastikan uji gagal.
**Layar (headless Chrome):** ketik tahun 3 digit → ditolak dan tombol simpan nonaktif; Kelola Data: kelurahan kosong → tombol nonaktif; kecamatan diganti → kelurahan kosong diberi penanda; HP 390 px.
**Pasca-deploy:** panggilan uji yang SENGAJA melanggar (tahun 0199, kelurahan kosong) pada semua tiga jalur harus ditolak dengan pesan benar; verifikasi tidak ada baris baru tercipta.
**Regresi:** input normal, edit normal (non-UTAMA dan UTAMA), Kelola Data, verifikasi, Cover, cek-status tidak terpengaruh; `npm run check-css` lolos.

## 9. Risiko dan mitigasi
| Risiko | Mitigasi |
|---|---|
| Batas umur 100 menolak orang sah | Data nyata maksimum 86; batas dapat diubah satu konstanta; keputusan K1 |
| UTAMA kini terblokir untuk edit yang dulu lolos | Disengaja; pesan jelas; hanya untuk nilai tidak wajar |
| Edit Kelola Data pada data lama tanpa kelurahan gagal | Pemeriksaan hanya pada kolom yang berubah; user memperbaiki data lama di P0 |
| CHECK `NOT VALID` memblokir UPDATE rutin pada baris janggal | Migrasi hanya setelah P0 bersih; pemeriksa kualitas dijalankan tepat sebelum |
| Cache PWA menampilkan form lama | Naikkan `?v=`; server tetap penegak utama |
| Ada jalur tulis lain yang terlewat | Peta jalur tulis (bagian 10) sudah disisir; CHECK database menutup sisanya |

## 10. Peta jalur tulis tabel penerima (hasil penyisiran 2026-10-26)
| Jalur | Menulis tanggal lahir/kelurahan? | Tindakan |
|---|---|---|
| `simpanDataKeSheet` (`penerima.ts:818`) | Ya | perbaiki (P1) |
| `editDataPenerima` (`penerima.ts:1183`) | Ya | perbaiki (P1) |
| `adminUbahData` (`kelolaData.ts:449`) | Ya | perbaiki (P1) |
| `kelolaData.ts:582` (kosongkan kolom berkas) | Tidak (hanya kolom berkas) | tidak perlu |
| `verifikasi.ts` (beberapa `update`) | Tidak | tidak perlu |
| `sinkronSheet2026.ts:149` (impor arsip ke 2026) | Ya, tetapi tahun 2026 | di luar cakupan; CHECK hanya di partisi 2027 |
| `penerima.ts:1258, 1310` | Tidak (hanya kolom rekomendasi/respon MUI) | tidak perlu (dikonfirmasi 2026-10-26) |

## 11. Keputusan terbuka
- **K1** Batas atas umur: usulan 100 tahun. Setuju?
- **K2** CHECK di database (P4): lanjutkan (usulan: ya)?
- **K3** Pemeriksa kualitas data: dijalankan manual saat diminta (usulan) atau dijadwalkan?
- **K4** Untuk akun UTAMA, kelurahan wajib pada input baru juga (usulan: ya, sama seperti petugas lain)?

## 12. Catatan realisasi
### P0 — selesai (2026-10-26)
User memperbaiki kedua data: No. 1575 kini lahir 1989-02-04 (umur 37), No. 902 kelurahan BELAWAN BAHARI. Pemeriksaan baca-saja atas 3.171 data: 0 tanggal lahir di luar 1900..hari ini, 0 umur di luar 18-100, 0 kelurahan/kecamatan kosong, 0 pasangan kecamatan-kelurahan yang tidak ada di tabel `wilayah`, 0 umur tak cocok dengan patokan 1 Jan 2027.

### P1 — selesai LOKAL (2026-10-26), belum commit/deploy
**Keputusan bawaan yang dipakai (user tidak menolak):** K1 batas umur atas 100; K4 Admin Utama wajib kelurahan pada input baru. K2 (CHECK DB) dan K3 (jadwal pemeriksa) tetap terbuka untuk P4/P5.
**Dibuat/diubah**
- Baru: `_shared/validasiPenerima.ts` (`periksaTanggalLahir`, `hitungUmurPatokan`, `putuskanKelurahanTugas`, `tanggalHariIniWIB`) -- modul murni.
- Diubah: `domains/penerima.ts` (input baru: tanggal lahir; edit: tanggal lahir + kelurahan kosong semua peran + UTAMA diperiksa ke `wilayah`), `domains/kelolaData.ts` (tanggal lahir; kelurahan kosong ditolak; fungsi mati `tanggalIsoValid` dihapus), `_shared/wilayahTugas.ts` (cabang UTAMA memakai `putuskanKelurahanTugas`).
- Uji baru: `scripts/uji/validasi-penerima.test.mjs`, `wilayah-tugas-utama.test.mjs` (+ `_harness-wilayah.mjs`: membundel kode Deno dengan `sql` palsu), `kabel-validasi-penerima.test.mjs`; skrip `npm run uji:validasi-penerima`.
**Hasil uji**
- 36 uji lulus (+31 uji cek-status tetap lulus). Uji perusakan: 15 mutan pada aturan dan cabang UTAMA, **15 tertangkap**.
- Perbandingan versi lama (git HEAD) vs baru pada `tentukanWilayahTugas`, 3.780 kombinasi (6 peran x 6 layanan x 7 tempat tugas x 3 kecamatan x 5 kelurahan): **peran selain UTAMA identik pada setiap kombinasi**; UTAMA tidak pernah lolos di versi baru bila ditolak di versi lama; penolakan baru UTAMA hanya: kelurahan kosong, kelurahan tak sesuai kecamatan, rumah ibadah multi-kelurahan, dan kecamatan kosong.
- Umur versi baru identik dengan `hitungUmur()` lama pada >3.000 tanggal uji.
- Uji "kabel" gagal 5 dari 6 bila kode lama dikembalikan (membuktikan ia mendeteksi regresi).
**Penyimpangan/penambahan dari rencana**
1. Cabang UTAMA di `wilayahTugas.ts` juga menolak **kecamatan kosong** dengan pesan kecamatan (sebelumnya lolos); konsisten dengan peran lain dan dengan `simpanDataKeSheet` yang sudah menolak kecamatan kosong.
2. Admin Utama kini ikut aturan "kelurahan mengikuti rumah ibadah" (bila rumah ibadah punya kelurahan di kecamatan itu), seperti peran lain.
3. Edit data: tanggal lahir kosong atau tanggal masa depan kini ditolak (sebelumnya diam-diam lolos/diabaikan).
**Keterbatasan (belum terbukti)**
- Kode di `penerima.ts` dan `kelolaData.ts` **belum dijalankan di Deno/Supabase** (tidak ada Deno di komputer ini); yang diuji perilaku adalah logika murni dan `tentukanWilayahTugas`; sisanya diperiksa sintaks (esbuild) dan uji "kabel". Pasca-deploy (P3) wajib uji penolakan di tiga jalur secara langsung.
- Layar (P2) belum diubah: sampai P2, kolom tanggal masih bisa diketik tahun 3 digit dan akan ditolak SERVER dengan pesan jelas.

### P2 — selesai LOKAL (2026-10-26), belum commit/deploy
**Dibuat/diubah**
- Baru: `public/js/validasi-tanggal-lahir.js` (`window.djpmTanggalLahir.periksa`; aturan SAMA dengan server).
- `index.html`: kolom tanggal lahir `min="1900-01-01"` (max = hari ini WIB diisi lewat skrip); skrip pemeriksa dimuat sebelum `app-transaksi.js`; versi: pemeriksa 20271040, app-transaksi 20271041, app-kelola-data 20271042.
- `app-transaksi.js`: form input utama -- pesan di bawah kolom (kuning "Ketik tahun lahir 4 digit" saat tahun masih diketik <1000 TANPA mengunci formulir; merah "tidak wajar" + kunci blok bila tahun >=1000 tetapi tak wajar), umur tidak lagi menampilkan angka konyol, toast saat keluar kolom, dan pemeriksaan saat simpan; form edit detail -- tanggal lahir tak wajar dan kelurahan kosong ditolak sebelum dikirim.
- `app-kelola-data.js`: `galatFormulir` + pesan merah di bawah kolom, tombol Simpan nonaktif selama ada galat, penjaga di `simpanPerubahan`.
- Warna pesan memakai kelas yang sudah ada (`text-red-700`, `text-amber-700`); CSS tidak berubah (`check-css` lolos).
**Hasil uji**
- Uji Node: 40 lulus (`npm run uji:validasi-penerima`), termasuk **kesetaraan layar vs server pada >4.000 masukan** (ok/iso/umur/pesan sama) dan uji "kabel" layar (gagal 4 dari 4 bila kode layar lama dikembalikan).
- Uji Chrome sungguhan (headless, `scripts/uji/layar/*.mjs`, manual): form input -- 14 pemeriksaan lulus (min/max, tahun 0199 hanya petunjuk lembut tanpa kunci, 1899/usia 101/masa depan merah + kunci blok USIA, 1989 sah, usia 17 tetap memunculkan modal, kunci dilepas saat diperbaiki); Kelola Data dengan SERVER TIRUAN (jaringan dicegat, WebSocket dimatikan, tidak ada permintaan ke server asli) -- 14 pemeriksaan lulus (tanggal 0199/199/31-02/1900 ditolak, kecamatan diganti tanpa kelurahan memblokir Simpan, penyimpanan paksa TIDAK memanggil server, simpan sah mengirim tepat satu panggilan dengan perubahan yang benar).
**Penyimpangan/penambahan**
1. Pada tahun yang masih diketik (<1000) formulir sengaja TIDAK dikunci: Chrome mengisi 0001, 0019, 0199 saat mengetik 1990; mengunci akan membuat formulir berkedip. Penyimpanan tetap diblokir oleh pemeriksaan saat simpan, dan server menolak.
2. Kolom `kecamatan` pada Kelola Data: mengganti kecamatan mengosongkan kelurahan (perilaku lama); kini Simpan diblokir sampai kelurahan dipilih.
**Keterbatasan (belum terbukti)**
- Form **edit detail** (`simpanEdit` di Lihat Data, kolom 5 dan 11) belum diuji di Chrome (butuh login dan banyak respons tiruan); hanya diperiksa sintaks dan uji "kabel". Uji manual saat P3.
- Perilaku di Chrome lama (< 111) dan di HP sungguhan belum diuji; kolom `type="date"` dan `min` adalah fitur lama yang didukung luas.

### Pemisahan dari pekerjaan Cek Status (2026-10-26)
Perbaikan validasi dan fitur Cek Status adalah dua pekerjaan berbeda. Pemisahan fisik: pekerjaan Cek Status dipindah ke cabang LOKAL `feat/cek-status-publik` (commit `8652cb3`, tidak di-push); `main` hanya berisi pekerjaan validasi. Titik persinggungan yang diputus: (1) `validasiPenerima.ts` tidak lagi mengimpor `tanggalKalenderValid` dari kode Cek Status (kini punya salinan sendiri), (2) pendaftaran `cekStatusPublik` di `index.ts` ikut cabang Cek Status (di `main` `index.ts` tidak berubah), (3) uji kabel tidak lagi menyebut `cekStatusPublik`, (4) `package.json` di `main` hanya memuat skrip uji validasi. Terbukti: bundel rantai impor `index.ts` di `main` memuat `putuskanKelurahanTugas` dan TIDAK memuat `cekStatusPublik`/`prosesCekStatus`/`cek_status_`.

### Review mendalam P0-P2 (2026-10-26) -- temuan dan perbaikan
Temuan yang SUDAH diperbaiki:
1. **Bug tahun 0001-0099**: `Date.UTC` memetakan tahun 0-99 ke 1900-1999 sehingga `0089-02-04` diberi pesan "tidak valid" (bukan "tidak wajar"). Diperbaiki di server dan layar dengan `setUTCFullYear`; uji ditambahkan.
2. **Cadangan layar hilang**: bila berkas pemeriksa gagal dimuat, umur tidak terhitung dan anak < 18 tidak ditandai. Perilaku lama dipulihkan sebagai cadangan (diuji di Chrome dengan berkas pemeriksa diblokir).
3. **Tahun patokan 2027 tertulis kaku** di modul layar: kini mengikuti `window._tahunAktifGetter` (app-core.js) bila ada, dengan nilai bawaan 2027.
4. **Skrip `uji:validasi-penerima` tidak menyertakan uji kesetaraan layar-server** (hanya pernah dijalankan terpisah): kini semua berkas uji terdaftar (diperiksa otomatis).
5. **Uji perusakan menemukan 5 dari 25 mutan lolos** (penjaga di `penerima.ts`, `kelolaData.ts`, dan blok simpan di layar tidak teruji perilakunya): ditutup dengan (a) uji kabel yang memeriksa baris penjaga, dan (b) uji PERILAKU yang menjalankan kode server asli dengan database tiruan (`_harness-server.mjs`, `server-penerima.test.mjs`, `server-simpan-penerima.test.mjs`).
6. Lapisan perintah mengikis garis miring ganda pada skrip sementara (regex rusak `d{4}` pernah terpasang): terdeteksi oleh uji, diperbaiki; seluruh berkas yang diubah dipindai untuk pola serupa (bersih).
**Bukti akhir (kode final):** 75 uji Node lulus (`npm run uji:validasi-penerima`); 25/25 mutan tertangkap; uji perilaku server dijalankan juga terhadap kode LAMA (git HEAD) dan gagal tepat pada skenario nyata (tanggal 0199 lolos untuk UTAMA dan Kecamatan, kelurahan kosong lolos untuk UTAMA) sambil tetap lulus pada perilaku yang harus dijaga (data lama tetap bisa diedit, penyimpanan sah, gerbang akses); uji Chrome: form input 19 + tanpa-pemeriksa 5 + Kelola Data 14 pemeriksaan lulus; data produksi (3.217 baris) tetap bersih (0 anomali).
**Keterbatasan yang MASIH ADA (jujur):**
- Kode server **belum dijalankan di Deno/Supabase** dan **belum dicek tipenya** (tidak ada Deno/TypeScript di komputer ini; memasang dari internet tidak dilakukan). Yang teruji: logika murni dan perilaku fungsi server lewat bundel Node dengan database TIRUAN, ditambah pemeriksaan sintaks dan rantai impor (esbuild). Risiko residual: galat tipe/Deno yang tak terdeteksi. Mitigasi di P3: siapkan versi fungsi sebelumnya untuk dipulihkan seketika, deploy lalu jalankan uji asap (login, daftar data, simpan/edit uji yang ditolak) sebelum mengumumkan.
- Form edit detail (Lihat Data) dan Chrome lama/HP asli belum diuji di browser; hanya sintaks dan uji kabel/kesetaraan.
- Tiruan database tidak menguji SQL asli (mis. kueri `wilayah`); itu terbukti hanya saat berjalan di produksi (P3).