# Plan: Koordinat Lokasi "Pintar" untuk layanan Guru (isian manual yang menerjemahkan, bukan sekadar menerima teks)

Tanggal: 2026-10-24 · Status: **K1–K7 DISETUJUI 2026-10-24 (semua mengikuti rekomendasi). T1–T5 SELESAI di lokal & teruji; BELUM di-commit/deploy. T7 (data lama) menunggu perintah.**
Bahasa: Indonesia · Pola kerja: bertahap, lokal dulu, uji + review menyeluruh, deploy hanya atas perintah.

---

## 1. Latar belakang dan masalah

Layanan **Guru Maghrib Mengaji** (foto plank) dan **Guru Sekolah Minggu / Buddha / Hindu / Kong Hu Chu** (foto lokasi ibadah) wajib
menyertakan koordinat lokasi. Koordinat dibaca otomatis dari data GPS (EXIF) pada foto. Foto yang dikirim lewat **"Foto" di
WhatsApp kehilangan data GPS-nya** (WhatsApp menghapusnya; hanya "Dokumen" yang menjaganya) sehingga aplikasi menampilkan kolom
manual "Tempel tautan Google Maps".

**Akar masalah:** kolom manual menerima **teks apa saja** asal lebih dari 10 karakter (`cekKoordinatManualDiisi`, `app-transaksi.js:171–181`),
dan server menyimpan apa adanya (`penerima.ts:655`, `:832`). Teks itu lalu tersalin apa adanya ke sheet cadangan di Drive
(`backup-spreadsheet/index.ts:78`). Akibatnya kolom "KOORDINAT LOKASI" berisi alamat, kode, atau angka acak.

**Bukti dari data produksi (tahun 2027, layanan Guru, 394 data, per 2026-10-24):**

| Isi kolom koordinat | Jumlah | Keterangan |
|---|---:|---|
| Koordinat otomatis dari foto (EXIF) | 76 | benar |
| Tautan Google Maps (`maps.app.goo.gl`, `google.com/maps…`) | 211 | benar |
| **Angka koordinat desimal tanpa tautan** (`3,7199335, 98,6815710`) | 1 | bisa dikonversi |
| **Plus Code / "salin alamat" Google Maps** (`HPG8+P7R, Jl. Pancasila…`) | 48 | bisa dikonversi otomatis |
| **Derajat/menit/detik atau kompas** (`3'34'58,68"N 98'40'43,95"E…`) | 7 | sebagian bisa, sebagian ragu |
| **Tautan bukan Maps** (`share.google/…`, `timemark`, pencarian Google) | 16 | belum pasti lokasi |
| **Deretan angka jam/stempel foto** (`14. 24. 20. 177`) | 6 | tidak valid |
| **Teks alamat / lainnya** | 29 | tidak valid |
| **Tidak bisa dipakai (jumlah)** | **107 (27%)** | |

Status 107 data itu: 99 "Memenuhi Syarat", 5 "Proses Verifikasi", 3 "Berkas Tidak Lengkap".
Dari 107: ±53 **bisa dikonversi otomatis**, 2 ragu, ±52 **harus diisi ulang** petugas.

---

## 2. Tujuan dan batasan

**Tujuan**
1. Petugas boleh menempel **bentuk apa pun** dari Google Maps; aplikasi **menerjemahkannya sendiri** menjadi koordinat yang benar.
2. Hanya yang **benar-benar koordinat/tautan Maps valid** yang bisa disimpan (di layar **dan** di server).
3. Penyimpanan seragam dan mudah dipakai ulang: koordinat → `https://www.google.com/maps?q=<lat>,<lng>` (format yang sama dengan hasil EXIF).
4. Admin dan petugas dapat **melihat** dan **memperbaiki** koordinat setelah data tersimpan (saat ini tidak bisa — lihat temuan T3/T4).
5. Menyiapkan jalur aman untuk membereskan **data lama** (bagian 9), dikerjakan terpisah atas permintaan Anda.

**Di luar lingkup (sengaja):** membaca koordinat dari tulisan di gambar (OCR); halaman khusus guru untuk memotret dengan GPS;
mengubah cara EXIF dibaca; kolom lat/lng terpisah di database; mengubah layanan selain kelima layanan di atas.

---

## 3. Temuan teknis (sudah diperiksa di kode dan data)

| # | Temuan | Rujukan |
|---|---|---|
| T1 | Kolom manual hanya cek `panjang > 10`; apa pun lolos | `app-transaksi.js:171–181` |
| T2 | Server tidak memeriksa/menormalkan `koordinatLink`; bahkan tidak mewajibkannya | `penerima.ts:655`, `:832` |
| T3 | **Detail data tidak menampilkan koordinat** sama sekali; admin hanya bisa melihatnya di sheet cadangan | pencarian `Koordinat` di `public/js` & `index.html` (hanya formulir input) |
| T4 | **Koordinat tidak bisa diedit** setelah tersimpan: bukan bagian `MAP_IDX_KE_KOLOM`/`KOLOM_TEKS` Edit Data, juga tidak ada di `KOLOM_EDIT` Kelola Data admin | `penerima.ts:478–505`, `kelolaData.ts:265–282` |
| T5 | Indeks data: koordinat ada di **indeks 31** pada daftar/detail (sesudah `id_folder_berkas` = 30, sebelum status = 32) | `penerima.ts:408–416` |
| T6 | `app-transaksi.js` sudah **3.471 dari 3.500 baris** → logika baru wajib di file baru | `scripts/verify-lines.js` |
| T7 | Pemicu status "wajib lapor perbaikan" hanya mengenali **ganti berkas** (`berkasBerganti`), bukan perubahan teks → koordinat perlu diperlakukan khusus | `penerima.ts:1111–1137` |
| T8 | Ada pengaman: sebelum menyimpan, semua `input[type=text]` diubah ke HURUF BESAR; nilai tersembunyi koordinat sudah disalin lebih dulu sehingga huruf besar/kecil tautan terjaga | `app-transaksi.js:~1052` |

T3 dan T4 penting: **tanpa memperbaikinya, data lama yang ditandai "Berkas Tidak Lengkap" tidak akan bisa diperbaiki petugas** untuk
alasan koordinat. Karena itu keduanya masuk lingkup (bagian 7) dan harus live **sebelum** data lama dibereskan.

---

## 4. Rancangan "penerjemah koordinat"

Satu fungsi murni: `normalisasiKoordinat(teks) → { ok, lat, lng, tautan, jenis, pesan }`.

### 4.1 Bentuk yang diterima dan hasilnya

| Urutan cek | Contoh masukan | Perlakuan | Disimpan sebagai |
|---|---|---|---|
| 1. Tautan Maps panjang | `https://www.google.com/maps/@3.595,98.672,17z`, `…/maps?q=3.59,98.67`, `…!3d3.59!4d98.67`, `…?ll=…`, `…?query=…` | ekstrak koordinat, verifikasi rentang | **tautan asli apa adanya** |
| 2. Tautan Maps pendek | `https://maps.app.goo.gl/AbC…`, `https://goo.gl/maps/…` | terima (tak bisa diurai di browser); **tidak terverifikasi** | tautan asli apa adanya |
| 3. Desimal | `3.5616, 98.6899` · `3,7199335, 98,6815710` · `3.5616;98.6899` | normalisasi koma/titik koma/spasi | `https://www.google.com/maps?q=3.561600,98.689900` |
| 4. Derajat-menit-detik | `3°34'58.68"N 98°40'43.95"E` · `3'34'58,68"N 98'40'43,95"E` | toleran terhadap simbol ° ' " yang terganti, N/S/E/W | tautan seperti no. 3 |
| 5. Desimal bertanda arah | `3. 56164122931659N. 98. 68996879085898E` | rapikan spasi setelah titik, baca arah | tautan seperti no. 3 |
| 6. Plus Code | `HPG8+P7R` · `HPG8+P7R, Jl. Pancasila, Tegal Sari…` (hasil "salin alamat") · `6PM3HPG8+P7R` | ambil kode dari teks, **dekode**; kode pendek dipulihkan memakai titik acuan Medan | tautan seperti no. 3 |
| 7. Selain itu | alamat biasa, `14. 24. 20. 177`, `share.google/…` (lihat K1) | **ditolak** dengan pesan dan petunjuk | — |

Aturan keselamatan (berlaku untuk no. 1, 3–6):
- **Rentang geografis Kota Medan:** lintang 3,35–3,85 dan bujur 98,50–98,85 (K3). Di luar itu → ditolak ("lokasi di luar Kota Medan; periksa kembali").
- Lintang −90…90 dan bujur −180…180; bukan `0,0`; bukan `NaN`.
- Kasus ambigu (mis. dua kemungkinan penafsiran angka) → **ditolak**, bukan ditebak.
- Hanya host Maps yang dikenal untuk tautan: `maps.app.goo.gl`, `goo.gl/maps`, `google.com|co.id/maps`, `maps.google.com`. Skema harus `https`.
- Tidak ada permintaan jaringan pada tahap inti (semua dihitung lokal), jadi tidak menambah beban server atau risiko privasi.

### 4.2 Plus Code
Plus Code (Open Location Code, Apache-2.0) memakai alfabet `23456789CFGHJMPQRVWX`. Kode lengkap (8+ karakter sebelum `+`) langsung
didekode. Kode pendek (`MMPV+794`, 4 karakter sebelum `+`) dipulihkan dengan **titik acuan pusat Kota Medan (≈3,595; 98,672)** —
benar selama lokasi berada dalam ±20 km dari acuan, yang terpenuhi untuk seluruh Kota Medan. Hasil pemulihan tetap lewat pemeriksaan
rentang Medan. Diimplementasikan sendiri (±80 baris, tanpa pustaka/CDN) dan **diuji dengan vektor uji resmi** spesifikasi OLC.

### 4.3 Satu sumber logika, dua tempat pakai (anti-melenceng)
Frontend butuh umpan balik langsung; server tetap penentu. Logika yang **sama persis** ada di:
- `public/js/koordinat-lokasi.js` (browser, dimuat untuk semua peran karena form Input dipakai Kecamatan/Kemenag/MUI/Admin), dan
- `supabase/functions/api/_shared/koordinat.ts` (server).

Pengaman agar keduanya tidak melenceng: skrip `scripts/cek-koordinat-sinkron.js` membandingkan isi fungsi kedua file (setelah
dinormalkan) dan **vektor uji bersama** (satu berkas JSON) dijalankan terhadap keduanya; keduanya masuk uji otomatis.

---

## 5. Perubahan di formulir Input (layar)

Berkas: `public/js/koordinat-lokasi.js` (baru) + perubahan kecil di `app-transaksi.js` (maks. ±12 baris bersih; sisa batas 29 baris) +
teks di `index.html`.

1. `cekKoordinatManualDiisi(mode)` memanggil `normalisasiKoordinat`. Hasil sah → isi `hidden-koordinat-link` dengan **nilai ternormalisasi**,
   `cfg.siap = true`, tampilkan kotak hijau: **"Koordinat terdeteksi: 3.595200, 98.672100 · [Lihat di peta]"** (memakai kotak `status-koordinat-ok` yang sudah ada).
   Tidak sah → `siap=false`, kotak merah berisi **pesan spesifik** (mis. "Itu alamat, bukan koordinat. Buka Google Maps → tekan lama pada titik → Bagikan → Salin tautan, lalu tempel di sini.").
2. Pemrosesan dipicu juga oleh **`paste`** dan **`change`** (bukan hanya `oninput`) supaya tempelan panjang langsung dinilai.
3. Placeholder: "Tempel tautan Google Maps, angka koordinat, atau kode lokasi (Plus Code)".
4. Teks petunjuk singkat di bawah kolom: "Foto dari WhatsApp (bukan Dokumen) tidak membawa lokasi. Salin tautan lokasi dari Google Maps."
5. Kolom manual **selalu tersedia** (tautan "Isi lokasi manual") bukan hanya saat foto tak ber-GPS, agar petugas tidak terpaksa mengganti foto.
6. Tombol Simpan tetap terkunci sampai `siap=true` (mekanisme `updateStatusTombolSimpan` yang sudah ada).
7. Nilai yang ditampilkan di kotak hijau selalu **hasil penerjemahan**, jadi petugas melihat dan mengoreksi sendiri bila keliru.

---

## 6. Perubahan di server (penentu terakhir)

Berkas: `supabase/functions/api/_shared/koordinat.ts` (baru), `penerima.ts` (simpan + edit), tanpa migrasi database.

1. **Simpan baru** (`simpanDataKeSheet`, `penerima.ts:655`): untuk lima layanan wajib-koordinat (satu konstanta `LAYANAN_WAJIB_KOORDINAT` di server),
   `koordinatLink` dinormalisasi ulang di server. Kosong atau tidak sah → **ditolak** dengan pesan yang sama seperti di layar; sah → simpan nilai ternormalisasi.
   (Untuk layanan lain: tidak berubah, tetap kosong.)
2. **Idempotensi dan data tertunda:** tidak mengubah mekanisme kunci idempotensi yang ada.
3. **Backup sheet:** tidak perlu diubah (menyalin nilai kolom); setelah fitur ini nilainya selalu koordinat/tautan valid.
4. Kegagalan validasi mengembalikan `{ sukses:false, pesan }` seperti validasi lain (tidak ada format respons baru).

---

## 7. Detail dan Edit Data (celah T3/T4 — wajib, karena prasyarat data lama)

1. **Detail:** tambah baris **"Koordinat Lokasi"** untuk lima layanan: tautan "Buka di Google Maps" bila valid; bila nilai lama tidak valid
   tampilkan teksnya + lencana merah "Koordinat belum valid — perlu diperbaiki". Dibuat di modul baru (kait kecil di `renderBaca`).
2. **Edit Data:** tambah kolom teks "Koordinat Lokasi" (indeks **31**) khusus lima layanan, dengan penerjemah yang sama dan umpan balik yang sama.
   Server: tambahkan indeks 31 ke `MAP_IDX_KE_KOLOM` (kolom `link_koordinat_lokasi`) dan `labelKolom` ("Koordinat Lokasi"),
   dengan validasi/normalisasi (bagian 6) sebelum menulis; tercatat di `riwayat_edit`.
3. **Perilaku wajib-lapor (K4):** perubahan koordinat oleh **non-admin** pada data "Berkas Tidak Lengkap" ikut mengisi `tanggal_berkas_diubah`
   (disamakan dengan ganti berkas) agar muncul "Laporkan Sudah Diperbaiki" dan Admin Utama tahu sudah diperbaiki.
4. **Admin Utama** boleh mengedit lewat Edit Data yang sama; Kelola Data admin tidak diubah (tidak diperlukan).
5. Perubahan di `app-transaksi.js` dibatasi pada kait pemanggil; logika di modul baru. Anggaran baris dihitung dan diuji `verify-lines`.

---

## 8. Rencana pengujian

**A. Unit penerjemah (lokal, tanpa jaringan)** — dijalankan terhadap **kedua** salinan (JS dan TS):
- Vektor resmi OLC (kode lengkap, pendek + pemulihan, tepi: dekat batas lintang/bujur).
- Korpus nyata dari produksi: seluruh 107 nilai bermasalah + sampel 30 nilai valid → hasil yang diharapkan ditetapkan dan ditinjau bersama (mana yang terkonversi, mana yang ditolak). Nilai dalam korpus disimpan hanya di folder uji sementara, tidak di-commit.
- Tautan Maps panjang berbagai pola; tautan pendek; host palsu (`maps.app.goo.gl.evil.com`, `http://`, `javascript:`); XSS di teks.
- Rentang: Medan lolos, kota lain/laut/`0,0` ditolak; ambigu ditolak; masukan sangat panjang dibatasi (mis. 500 karakter) agar tak membebani.
- **Kesamaan JS ↔ TS**: hasil identik untuk seluruh korpus.

**B. Server (database tiruan + modul asli):** simpan baru: valid/ditolak/kosong untuk lima layanan, layanan lain tak berubah; nilai tersimpan ternormalisasi;
edit koordinat: riwayat tercatat, penanda wajib-lapor hanya untuk non-admin pada BTL; regresi bentuk data (indeks 0..53 tidak bergeser); uji **mutasi** (rusakkan tiap aturan → uji harus merah).

**C. Layar (Chrome sungguhan + server tiruan):** tempel tiap bentuk → kotak hijau/merah benar; paste & input; Simpan terkunci/terbuka; foto tanpa GPS → kolom manual;
foto ber-GPS tetap otomatis (tidak regresi); Detail menampilkan tautan; Edit mengisi, memvalidasi, dan menyimpan; regresi wajib-lapor (92 uji) dan MUI (77 uji) tetap hijau; uji mutasi layar.

**D. Produksi sebelum/sesudah deploy:** `deno check`, `verify-lines`; **uji driver postgres.js asli dalam transaksi yang di-rollback** (pelajaran verifikasi massal: tiruan basis data tidak identik dengan driver asli);
uji asap fungsi live (hanya penolakan/validasi, tanpa menulis data nyata).

---

## 9. Data lama (tahap TERPISAH, dikerjakan setelah fitur live dan atas permintaan Anda)

Prasyarat: bagian 5–7 sudah live, supaya petugas **bisa** memperbaiki koordinat lewat Edit Data.

| Kelompok | Jumlah | Tindakan |
|---|---:|---|
| Bisa dikonversi otomatis (desimal + Plus Code) | ±53 | server menerjemahkan lalu **memperbarui** kolom ke tautan Maps; hanya bila hasil lolos rentang Medan; setiap perubahan dicatat di `riwayat_edit` (editor `SISTEM`); status verifikasi **tidak berubah** |
| Ragu (derajat/menit/detik janggal) | 2 | ditinjau manual bersama Anda |
| Harus diisi ulang petugas | ±52 (49 MS + 3 sudah BTL) | **ditandai "Berkas Tidak Lengkap"** + keterangan baku + batas waktu perbaikan (sesuai permintaan Anda) |

Pengerjaan tanda BTL massal (karena aksi massal yang ada hanya untuk "Memenuhi Syarat"): **skrip terkontrol** yang meniru persis `verifikasiSatuData`
(status, keterangan, `batas_waktu_perbaikan`, reset kolom laporan, dan **`arsipkanDataDetail`** untuk data yang sebelumnya "Memenuhi Syarat" agar tak tertinggal di Data Detail/Retur/Pembayaran).
Tata cara: (1) saya tampilkan **daftar lengkap** (nama, kecamatan, kelurahan, isi koordinat lama) → Anda setujui; (2) uji *dry-run* di transaksi yang di-rollback; (3) eksekusi dalam satu transaksi + catatan jejak (id yang diubah) agar bisa dipulihkan; (4) saya bantu menyusun **broadcast** untuk petugas.
Yang saya butuhkan dari Anda saat itu: **teks alasan baku** dan **tanggal batas perbaikan** (K7). Catatan: pekerjaan otomatis `cekBatasWaktuVerifikasi` akan menolak data yang tak diperbaiki/dilaporkan setelah batas — beri batas yang cukup longgar.

Peringatan dampak: 49 data berstatus "Memenuhi Syarat" akan turun ke "Berkas Tidak Lengkap"; periksa dulu apakah ada yang sudah masuk proses pembayaran/ekspor sebelum dieksekusi.

---

## 10. Tahapan, urutan deploy, dan pembatalan

| Tahap | Isi | Reversibel? |
|---|---|---|
| T1 | penerjemah (JS + TS) + vektor uji + skrip kesamaan; uji unit — lokal | ya |
| T2 | server: validasi simpan baru + edit koordinat — lokal, uji + mutasi | ya |
| T3 | layar: formulir Input (bagian 5) — lokal, uji + mutasi | ya |
| T4 | layar: Detail + Edit Data (bagian 7) — lokal, uji + mutasi | ya |
| T5 | review menyeluruh (fokus: tidak ada bentuk valid yang tertolak keliru; tidak ada jalan menyimpan teks bebas; JS = TS) + uji driver asli | — |
| T6 | deploy atas perintah: fungsi `api` (v81, `--no-verify-jwt`) → commit & push (Vercel) → uji asap | per langkah |
| T7 | **data lama** (bagian 9) — tahap terpisah, atas permintaan Anda | pulih lewat catatan jejak |

**Urutan aman:** server dulu (menolak teks bebas; frontend lama yang mengirim teks bebas akan mendapat pesan jelas), lalu frontend.
Tanpa migrasi database. **Pembatalan:** `git revert` frontend, deploy ulang fungsi dari versi sebelumnya; data tidak terpengaruh.

Catatan kompatibilitas: tab petugas yang masih memakai halaman lama (sebelum muat ulang) akan mengirim teks bebas → server menolak dengan pesan jelas
("Koordinat tidak valid… muat ulang halaman"), tidak ada data rusak.

---

## 11. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Format valid tertolak keliru → petugas tertahan | korpus nyata 107+ nilai; bentuk ambigu diberi pesan yang menuntun; kolom manual tersedia; mudah dilonggarkan lewat konstanta |
| Salah dekode Plus Code | vektor resmi OLC; pemeriksaan rentang Medan; kotak hijau menampilkan angka + tombol lihat di peta agar petugas mengonfirmasi |
| JS dan TS berbeda perilaku | satu korpus, kedua salinan diuji identik; skrip kesamaan; uji otomatis |
| Tautan pendek (`maps.app.goo.gl`) tak terverifikasi | tetap diterima (itu bentuk paling umum dari "Bagikan"); verifikasi server-side hanya tahap lanjutan opsional (K2) |
| `app-transaksi.js` penuh | logika di modul baru; perubahan bersih ≤ 12 baris; `verify-lines` dijalankan |
| Data lama MS turun ke BTL memengaruhi proses lain | tahap terpisah, daftar disetujui dulu, arsip Data Detail meniru verifikasi satuan, jejak untuk pemulihan |
| Mock uji ≠ driver asli | uji driver postgres.js asli dalam transaksi rollback sebelum deploy |

---

## 12. Keputusan yang dibutuhkan (rekomendasi di kolom kanan)

| # | Pertanyaan | Rekomendasi |
|---|---|---|
| **K1** | Tautan `share.google/…` dan `timemark`: diterima atau ditolak? (isinya tidak bisa dipastikan lokasi) | **Tolak** pada tahap inti; bila nanti banyak dipakai, tambah penerjemah server (K2) |
| **K2** | Tahap lanjutan opsional: server mengikuti tautan pendek/`share.google` untuk **memverifikasi** koordinat sungguhan? | **Tunda**; tambah bila perlu setelah melihat pemakaian |
| **K3** | Rentang wilayah yang dianggap sah (lintang 3,35–3,85; bujur 98,50–98,85 ≈ Kota Medan)? | **Ya**, bisa dilonggarkan bila ada rumah ibadah di perbatasan |
| **K4** | Perubahan koordinat oleh petugas pada data "Berkas Tidak Lengkap" ikut memicu "Laporkan Sudah Diperbaiki"? | **Ya** |
| **K5** | Server **mewajibkan** koordinat valid untuk kelima layanan (saat ini hanya layar)? | **Ya** |
| **K6** | Kolom manual selalu tersedia (bukan hanya saat foto tanpa GPS)? | **Ya** |
| **K7** | Untuk data lama (tahap T7): teks alasan baku dan tanggal batas perbaikan — ditentukan saat tahap itu dimulai | **Nanti**, setelah fitur live dan Anda memberi perintah |


---

## 13. Catatan pelaksanaan (2026-10-24) — temuan tambahan saat implementasi & review

1. **Akar masalah tambahan:** `app-core.js` memasang perapi otomatis "spasi setelah titik" pada SEMUA kolom teks. Itu yang mengubah tautan tempelan menjadi
   `maps. app. goo. gl/...` (ada di data nyata) dan angka `3.56` menjadi `3. 56`. Kolom koordinat (`input-koordinat-manual`, `-ibadah`, `edit-31`) kini dikecualikan.
2. Saat submit semua isian teks di-UPPERCASE; kolom manual koordinat dikecualikan (tautan Maps peka huruf besar/kecil).
3. Foto ber-GPS di luar Kota Medan kini ditolak di layar (sebelum berkas diunggah), konsisten dengan server.
4. Perbandingan Edit untuk koordinat peka huruf besar/kecil; koordinat lama yang tidak valid TIDAK menghalangi edit kolom lain.
5. Inti penerjemah ASCII murni (karakter khusus dibangun dari kode angka) supaya aman terhadap pengodean berkas.
6. Tautan Maps > 500 karakter: bila koordinat terbaca disimpan ringkas (`maps?q=lat,lng`); bila tidak terbaca ditolak.
7. Validasi koordinat di server diletakkan SESUDAH cek hak akses dan data wajib (urutan galat lama tidak bergeser).
8. Hasil uji: unit 164 (JS=TS, 12.000+ dekode Plus Code identik dengan pustaka resmi OLC); server 34; layar 43; regresi lama (wajib-lapor 71+92, MUI 133+77, verifikasi massal 42+42, layanan kosong 12+6) hijau; uji perusakan 18+12+21 tertangkap (1 mutan setara: cek 0,0 sudah tercakup cek wilayah Medan).
9. Dampak data nyata (korpus produksi 399 nilai): 344 diterima (170 tautan pendek, 123 tautan Maps, 53 Plus Code, 1 desimal, 1 derajat), 51 ditolak (alamat/teks, deretan angka, share.google, timemark).
