# Rencana: Tombol Navigasi Koordinat di Halaman Cek Status (khusus Guru Maghrib Mengaji)

> Versi **2** (2026-11-08) · Status: **T1-T4 SELESAI DI LOKAL (cabang `feat/cek-status-koordinat-gmm`), BELUM commit/push/deploy.** (v1 = rencana) **K1 DIJAWAB user 2026-11-08: guru harus bisa memeriksa titik lokasi apakah sesuai dengan tempat tugas -> pilihan (a), tombol buka-peta + peringatan.** K2-K5 memakai usulan bawaan bila user tidak menolak; menunggu perintah "mulai".
> Induk: `plans/plan-cek-status-penerima-publik.md` (halaman `/cek-status` sudah LIVE sejak 2026-10-28). Terkait: `plans/plan-pengingat-koordinat-gmm.md` (banner/pesan untuk petugas, LIVE).
>
> Prinsip: bertahap, mudah dibatalkan, uji lokal dulu. Perubahan menyentuh **fungsi `api` (server)**, Worker, dan halaman, jadi deploy hanya atas perintah eksplisit user.

## 1. Ringkasan

Guru Maghrib Mengaji (GMM) yang mengecek status di `/cek-status` dengan NIK + tanggal lahir akan melihat, di kartu hasil, satu tombol **"Buka titik di Google Maps"** yang membuka koordinat yang tersimpan di data mereka, disertai peringatan agar menghubungi KUA bila titik belum sesuai.

Permintaan user (2026-11-08), dengan tafsiran saya:

| # | Permintaan user | Tafsiran rencana |
|---|---|---|
| 1 | Hanya berlaku bagi NIK Guru Maghrib Mengaji | **Server** yang memutuskan: tautan hanya ikut dalam jawaban bila `layanan = GURU MAGHRIB MENGAJI`. Layanan lain tidak pernah menerima kolom itu (bukan sekadar disembunyikan di layar) |
| 2 | Hanya bisa navigasi ke titik koordinat | Satu tombol/tautan **buka di Google Maps** (tab baru). Tidak ada peta tertanam, tidak ada angka lintang-bujur ditampilkan, tidak ada tombol salin |
| 3 | Jangan buat klik apapun terhadap koordinat, hanya peringatan | Tidak ada aksi lain di sekitar koordinat: tidak bisa mengubah, memilih titik, melapor, atau mengirim apa pun. Hanya teks peringatan (dibuat persis kalimat user, lihat bagian 4) |

> **Butir 2 dan 3 bisa dibaca bertentangan** ("navigasi" vs "jangan buat klik apapun"). Tafsiran di atas: *boleh satu tautan untuk membuka peta (hanya melihat), tidak boleh ada klik yang mengubah/mengirim apa pun.* Bila yang dimaksud butir 3 adalah **tidak ada tautan sama sekali** (hanya peringatan teks), lihat K1 di bawah.

## 2. Keputusan yang perlu dijawab

| # | Butir | Usulan bawaan |
|---|---|---|
| **K1 (DIJAWAB: a)** | Tafsiran butir 2 vs 3: (a) tombol "Buka di Google Maps" + peringatan, atau (b) **hanya peringatan teks tanpa tautan** (guru tidak bisa melihat titiknya dari halaman ini) | **(a)**. Tanpa tautan, guru tidak bisa memeriksa "apakah titik sudah sesuai" seperti yang diminta peringatan |
| **K2** | Guru berstatus **Tidak Memenuhi Syarat** (6 orang saat ini): tampilkan tombol? | **Tidak** (tidak ada gunanya memeriksa titik; hanya Memenuhi Syarat, Proses Verifikasi, Berkas Tidak Lengkap) |
| **K3** | Bunyi peringatan: pakai persis kalimat user atau dirapikan? | Dirapikan sedikit (tanda baca dan ejaan), makna tidak berubah (bagian 4) |
| **K4** | Bila data tidak punya tautan yang aman dibuka (bentuk tak dikenal): tampilkan apa? | Tanpa tombol; tampil "Titik koordinat belum dapat ditampilkan. Hubungi KUA masing-masing." |
| **K5** | Risiko privasi (bagian 6.1) diterima? | Diterima oleh user (K7 induk sudah menerima risiko NIK+tanggal lahir), tetapi **disampaikan kembali ke pimpinan** karena kini yang terbuka adalah lokasi, bukan hanya status |

## 3. Temuan data (dicek 2026-11-08, hanya baca, hanya hitungan)

Kolom `penerima.link_koordinat_lokasi`, layanan GMM tahun 2027 (**1.461 baris**, semuanya terisi):

| Bentuk tautan | Jumlah |
|---|---|
| `https://www.google.com/maps?q=lat,lng` (bentuk baku hasil penerjemah koordinat) | 534 |
| Tautan pendek `maps.app.goo.gl` / `goo.gl` | 831 |
| Bentuk lain (mis. `maps.google.com/?q=...`, `google.com/maps/place/...@lat,lng`, `.../maps/search/...`) | 96 |
| Tidak terisi | 0 |
| Berstatus Tidak Memenuhi Syarat | 6 |

Akibat desain:
- **Tidak perlu membaca angka koordinat.** 831 tautan pendek tidak bisa diurai tanpa menelusuri tautan (belum dikerjakan; itu pilihan D yang ditunda). Maka tombol memakai **tautan yang tersimpan apa adanya**; yang dilihat guru di Google Maps = yang akan dilihat tim monitoring.
- Hal ini sekaligus jujur: bila tautan menunjuk tempat yang keliru, guru akan melihatnya sendiri.
- Tautan yang menyimpan titik "pusat tampilan" (`@lat,lng`) dan bukan penanda pin tetap terbuka sebagaimana adanya; kesesuaian titik dinilai guru dengan mata.

## 4. Teks layar

**Tombol** (hanya bila tautan lolos pemeriksaan): `Buka titik di Google Maps` (tab baru, `rel="noopener noreferrer"`).

**Peringatan** (kotak kuning di bawah tombol, selalu tampil untuk GMM, termasuk saat tombol tidak ada):

> **Perhatikan apakah titik sudah sesuai.** Jika belum sesuai, segera hubungi KUA masing-masing, karena kesalahan titik akan berdampak pada tidak ditemukannya alamat tugas ketika Tim Monitoring melakukan Monitoring dan Evaluasi ke alamat tugas Guru Maghrib Mengaji.

(Kalimat user: "...jika belum agar menghubungi KUA masing-masing karena kesalahan titik akan berdampak kepada tidak ditemukannya alamat tugas ketika tim monitoring melakukan Monitoring dan Evaluasi ke alamat tugas guru maghrib mengaji". Perapian K3: "jika belum sesuai", "berdampak pada".)

**Bila tautan tidak aman/tak dikenal (K4):** tanpa tombol; "Titik koordinat belum dapat ditampilkan." + peringatan yang sama.

Layanan selain GMM: kartu hasil **tidak berubah sama sekali**.

## 5. Rancangan teknis

### 5.1 Server (`supabase/functions/api`)
- `domains/cekStatusPublik.ts`: kueri `cariPenerima` menambah `link_koordinat_lokasi` (hanya bila perlu; tetap satu kueri, satu baris).
- `_shared/cekStatusInti.ts`: `pilihKolomPublik` tetap memetakan lima kolom secara eksplisit, **ditambah** satu kolom opsional `tautanPeta` yang hanya diisi bila:
  1. `layanan` (setelah rapikan spasi/huruf) = `GURU MAGHRIB MENGAJI`, **dan**
  2. status bukan Tidak Memenuhi Syarat (K2), **dan**
  3. tautan lolos `tautanPetaAman()`.
  Selain itu kolom **tidak ada** di jawaban (bukan string kosong).
- `tautanPetaAman(url)` (fungsi murni, diuji di Node): hanya `https:`; host persis salah satu dari `www.google.com`, `google.com`, `maps.google.com`, `maps.app.goo.gl`, `goo.gl` (**bukan** pencocokan akhiran: `google.com.evil.com` dan `evilgoogle.com` ditolak); tanpa kredensial (`user:pass@`) dan tanpa port selain 443; jalur harus diawali `/maps` bagi google.com (untuk `goo.gl`: `/maps/...`; untuk `maps.app.goo.gl`: apa saja); panjang ≤ 600; tanpa spasi/kontrol. Hasil dinormalkan lewat `new URL(...).href`.
- Kunci tetap **gagal tertutup**: ragu = tidak ada tombol.

### 5.2 Worker (`worker/cek-status.js`)
- Pemetaan 5 kolom (baris 119-121) diperluas: `tautanPeta` diteruskan **hanya bila string** yang lolos pemeriksaan ulang `https:` + daftar host yang sama (pertahanan berlapis; Worker adalah gerbang publik). Kolom lain dari backend tetap dibuang.

### 5.3 Halaman (`public/cek-status.html`)
- `tampilkanData(d)`: bila `d.tautanPeta` ada, buat satu elemen `<a>` lewat DOM (`textContent`, `href` diisi setelah diperiksa ulang `https:`), tab baru. Bila `d.layanan` adalah GMM tetapi tautan tak ada: tampil pesan K4. Peringatan tampil untuk GMM.
- Tidak ada peta tertanam, `iframe`, atau gambar (CSP `img-src 'self' data:`, `frame-src` Turnstile saja **tidak diubah**). Navigasi keluar lewat tautan tidak dibatasi CSP; `form-action 'none'` tidak terkait.
- Teks hanya lewat `textContent`; hasil tetap tidak masuk URL/penyimpanan (aturan lama dipertahankan); `Hapus hasil` ikut menghapus tombol.
- Tanpa Tailwind (halaman mandiri), tanpa perubahan CSS terbangun.

## 6. Risiko dan keamanan

### 6.1 Privasi (K5): lokasi ikut terbuka
Pemegang **NIK + tanggal lahir** kini dapat melihat lokasi alamat tugas guru. Catatan induk A12: 92,3% tanggal lahir dapat diturunkan dari NIK, jadi pelindung kedua lemah. Alamat tugas GMM sering rumah guru. Mitigasi yang sudah ada: Turnstile, batas 5 percobaan per NIK per 15 menit, saklar mati-hidup, tanpa log NIK. **Tambahan di rencana ini:** hanya layanan GMM, tanpa angka koordinat, tanpa salin, `Cache-Control: no-store` (sudah). Pilihan yang lebih ketat (bila pimpinan keberatan): tombol hanya menampilkan titik, tanpa alamat tugas (sudah demikian); atau tunda sampai ada faktor tambahan.

### 6.2 Pengalihan berbahaya (open redirect / skema)
Data tautan berasal dari input petugas dan data lama. Tanpa pemeriksaan, `javascript:` atau domain mirip bisa tampil sebagai tombol. Ditangani 5.1 + 5.2 (dua lapis) dan uji perusakan.

### 6.3 Jawaban salah-kelompok
Bila pemeriksaan layanan keliru, layanan lain bisa menerima tautan. Ditangani: keputusan di server, uji "layanan lain tidak pernah punya kolom `tautanPeta`", dan mutan.

### 6.4 Lain-lain
- Tautan pendek bisa mengarah ke tempat berbeda di kemudian hari: di luar kendali kita; sama dengan yang dipakai tim monitoring.
- Tautan lama berupa `@lat,lng` yang bukan pin: guru melihat titik tengah peta, bukan penanda; peringatan tetap berlaku.
- Beban server: tidak bertambah (satu kolom tambahan pada kueri yang sama).

## 7. Tahapan

| Tahap | Isi | Sifat |
|---|---|---|
| T0 | Jawaban K1-K5 dari user | |
| T1 | Fungsi murni `tautanPetaAman` + `pilihKolomPublik` + uji Node (sertakan ujian perusakan) | Lokal |
| T2 | Kueri `cariPenerima` + Worker + halaman | Lokal |
| T3 | Uji Worker (Node), uji layar Chrome 360/390/1280 px (tombol, peringatan, layanan non-GMM tidak berubah, TMS tanpa tombol, tautan jahat tidak jadi tombol, Hapus hasil), mutan, regresi `uji:cek-status`/`uji:worker-cek-status` | Lokal |
| T4 | Tinjauan ulang teliti (pola tinjauan sebelumnya), perbaiki temuan | Lokal |
| T5 | **Atas perintah user:** commit, push, deploy fungsi `api` (versi berikutnya dari 113) | Produksi |
| T6 | Verifikasi produksi: NIK GMM uji (dengan izin user) tampil tombol; NIK non-GMM tidak punya kolom; log bersih | Produksi |

Syarat T6: butuh satu NIK + tanggal lahir GMM nyata dari user untuk uji klik (atau user yang mengujinya sendiri). Tidak ada migrasi database.

## 8. Daftar uji

1. `tautanPetaAman`: lolos untuk 4 bentuk nyata (baku `?q=`, `maps.google.com/?q=`, `google.com/maps/place/...`, `maps.app.goo.gl/...`); tolak: `http://`, `javascript:`, `data:`, `//evil`, `https://google.com.evil.com/maps`, `https://evilgoogle.com/maps`, `https://user@www.google.com/maps`, port 8443, spasi, > 600 karakter, kosong, bukan string.
2. `pilihKolomPublik`: GMM + tautan sah -> ada `tautanPeta`; GMM tanpa/dengan tautan jahat -> kolom **tidak ada**; layanan lain dengan tautan sah -> tidak ada; TMS -> tidak ada; kolom ekstra lain tetap terbuang.
3. Worker: meneruskan `tautanPeta` sah; membuang non-string, `http:`, host asing.
4. Layar: tombol tampil dan terbuka di tab baru dengan `rel` benar; peringatan tampil; tanpa angka koordinat di DOM; layanan lain identik dengan sebelumnya; tombol hilang setelah Hapus hasil; tanpa galat JS; tanpa gulir mendatar di 360 px.
5. Mutan (harus tertangkap): hapus pemeriksaan layanan; hapus pemeriksaan host; pakai pencocokan akhiran host; lepaskan syarat https; biarkan TMS; Worker meneruskan kolom tanpa periksa.
6. Regresi: seluruh `uji:cek-status`, `uji:worker-cek-status`, `uji:cek-status-seo`, `check-css`, `verify-html`.

## 9. Jalan balik

Kolom tambahan bersifat opsional: mengembalikan `pilihKolomPublik`, Worker, dan halaman ke versi sebelumnya menghilangkan fitur tanpa efek ke data. Cepat: matikan seluruh halaman lewat saklar `cek_status_pengaturan` (sudah ada). Tidak ada migrasi untuk dibatalkan.

## 10. Di luar lingkup

- Membaca/menampilkan angka koordinat, peta tertanam, tombol salin, menu bagikan.
- Mengubah/melapor koordinat dari halaman publik (guru menghubungi KUA; KUA/petugas memperbaiki lewat aplikasi seperti biasa).
- Menelusuri 831 tautan pendek untuk memvalidasi titik (pilihan D, ditunda).
- Menolak otomatis koordinat bulat (pilihan C, ditunda).
- Layanan selain GMM; perubahan SEO/sitemap.

## 11. Catatan realisasi (2026-11-08)

**Dibuat/diubah (lokal, cabang `feat/cek-status-koordinat-gmm`):** `_shared/tautanPeta.ts` (baru), `_shared/cekStatusInti.ts` (`pilihKolomPublik` + `tautanPeta` bersyarat), `domains/cekStatusPublik.ts` (kueri +`link_koordinat_lokasi`), `worker/cek-status.js` (salinan aturan + pemeriksaan ulang), `public/cek-status.html` (tombol + peringatan), `package.json` (`uji:cek-status-koordinat`), uji `scripts/uji/cek-status-koordinat.test.mjs` (12) dan layar `scripts/uji/layar/cek-status-koordinat.mjs` (20).

**Keputusan:** K1 = (a) tombol buka-peta + peringatan (jawaban user: guru harus bisa memeriksa titiknya); K2-K4 usulan bawaan; K5 (pimpinan) perlu disampaikan sebelum deploy.

**Hasil uji:** uji baru 12/12; regresi `uji:cek-status` 35, `uji:worker-cek-status` 31, `uji:cek-status-seo` 8, `uji:cek-status-tanggal` 12 hijau; uji layar Chrome 360 px dan 1280 px masing-masing 20/20 (tombol, tab baru + noopener/noreferrer, peringatan persis, tanpa angka koordinat/gambar/iframe/isian, Hapus hasil, TMS dan layanan lain tanpa kotak, tautan `javascript:` tidak jadi tombol, tanpa galat JS, tanpa permintaan ke Google); `check-css`, `verify-html`, `vite build` OK.
**Uji perusakan:** 17 mutan + 1 mutan gabungan (kedua lapisan https dilepas) tertangkap; satu mutan "izinkan http" semula lolos karena setara (lapisan `u.protocol` kedua masih menahan), lalu tertangkap saat kedua lapisan dilepas.
**Temuan data nyata:** 1.461 tautan GMM: 621 `google.com/maps`, 8 `maps.google.com`, 820 `maps.app.goo.gl`, 11 `goo.gl/maps`, **1 `www.google.co.id/maps/dir/...`** -> host `google.co.id` ditambahkan ke daftar (server, Worker, uji). Setelah itu semua 1.461 lolos pemeriksaan bentuk.
**Belum terbukti:** Edge Function belum dijalankan di Deno (hanya diuji di Node); peramban lama; pembaca layar; uji klik dengan NIK GMM nyata di produksi (T6).
**Syarat deploy (T5):** fungsi `api` (v113 -> berikutnya) DAN Worker/halaman harus tayang; bila hanya frontend tayang, tombol tidak muncul (aman); bila hanya server tayang, Worker lama membuang kolom (aman). Tidak ada migrasi.

**Tinjauan ulang (2026-11-08, permintaan user):** seluruh diff dibaca ulang; 7 bentuk tautan nyata (termasuk `maps.google.com?q=` tanpa garis miring, `goo.gl/maps/...`, dan satu `www.google.co.id/maps/dir/...`) dijalankan lewat fungsi server DAN Worker: semua lolos dan hasil keduanya sama; bentuk nyata ini ditambahkan ke uji (12 uji tetap hijau). Catatan `google.co.id`: domain negara resmi Google; hanya 1 data memakainya, berupa tautan RUTE (`/maps/dir/...` dari satu titik asal ke Masjid Taqwa Istiqlal), bukan penanda lokasi, sehingga yang terbuka bagi guru adalah petunjuk rute; domain negara Google lain (mis. `google.com.sg`) sengaja tidak diizinkan -> tombol tidak muncul dan guru melihat pesan "belum dapat ditampilkan" + peringatan.

## 12. Perubahan teks 2026-11-08 (permintaan user, setelah go-live 6954f6e)

- Peringatan diperpanjang: "...ke alamat tugas Guru Maghrib Mengaji, **sehingga pembayaran berisiko dihentikan**." (kalimat user: "yang beresiko akan dihentikannya pembayaran"; dirapikan: ejaan baku "berisiko", susunan kalimat tidak ambigu.)
- **Ajakan klik tombol** di atas tombol (hanya bila tombol ada): "Klik tombol di bawah ini untuk melihat titik lokasi Anda di Google Maps, lalu pastikan sudah sesuai dengan tempat tugas Anda." Urutan kotak: ajakan -> tombol -> peringatan.
- Uji: Node 12/12, layar 22/22 di 360 px dan 1280 px; 4 mutan tertangkap. Hanya halaman yang berubah (tanpa server/Worker).
