# Plan: Pilih Rumah Ibadah (dropdown/pop-up) di Kelola Data + tolak bila beda wilayah

> Versi **2** (2026-11-06) · Status: **LIVE 2026-11-06** (commit a16c25b; fungsi `api` v113 di-deploy dulu, lalu frontend lewat push ke main). Sisa: user uji klik akun UTAMA, pantau log. User menjawab "perluas dan mulai": W3 diperluas (pemeriksaan wilayah juga saat kecamatan/kelurahan diubah); W2, W4, W5 memakai usulan bawaan. Atas permintaan user, Kelola Data juga DISAMAKAN dengan seluruh aturan formulir input (lihat §12 Realisasi).
>
> Permintaan user: Tempat Tugas dan Alamat Tugas di Kelola Data (Detail > Edit) sekarang diketik manual dan sering ditolak "harus sama persis dengan daftar". User minta pilihan dari daftar yang menyesuaikan **kecamatan, kelurahan, dan jenis rumah ibadah**. Keputusan user: **tolak bila wilayah rumah ibadah berbeda dari wilayah penerima.**
>
> Prinsip: memakai ulang pola pop-up "Pilih Rumah Ibadah" yang sudah ada di formulir input; perubahan sekecil mungkin; reversibel; commit/deploy hanya atas perintah eksplisit.

## 1. Ringkasan

| Hal | Rancangan |
|---|---|
| Apa | Tombol **Pilih Rumah Ibadah** di sebelah kolom Tempat Tugas/Alamat Tugas pada Kelola Data. Pop-up berisi daftar rumah ibadah dengan filter Kecamatan, Kelurahan, Jenis (otomatis dari layanan), dan kolom cari nama |
| Hasil pilih | Tempat Tugas + Alamat Tugas terisi **persis sama dengan daftar** (tak mungkin salah ketik) |
| Aturan wilayah | Pop-up **hanya menampilkan** rumah ibadah yang kecamatan + kelurahannya sama dengan penerima. Server **menolak** simpan bila pasangan tempat+alamat tidak berada di kecamatan + kelurahan penerima (lapis kedua; menutup jalur ketik manual/permintaan langsung) |
| Cakupan | 12 layanan wajib-daftar (`LAYANAN_WAJIB_RUMAH_IBADAH`, `_shared/wilayahTugas.ts`). Layanan bebas (Bilal, Penggali Kubur, Guru Maghrib Mengaji, Ustadz/Ustadzah) tetap isian teks |
| Siapa | Kelola Data hanya **Admin Utama** |
| Dampak | Frontend (`app-kelola-data.js`) + **satu pemeriksaan tambahan di server** (`kelolaData.ts`). Tanpa migrasi database |

## 2. Keputusan & pertanyaan

| # | Butir | Status |
|---|---|---|
| W1 | Beda wilayah ditolak | **SUDAH DIJAWAB user (2026-11-06): tolak** |
| W2 | Wilayah dibandingkan = **kecamatan DAN kelurahan** (bukan hanya kecamatan) | Usulan; user tadi menyebut "wilayahnya" — dikonfirmasi saat mulai |
| W3 | Penolakan server berlaku **hanya bila tempat tugas / alamat tugas / layanan diubah** pada edit (seperti aturan daftar yang ada, agar edit kolom lain pada data lama tidak tiba-tiba gagal) | Usulan |
| W4 | Bila admin ingin memindahkan penerima ke rumah ibadah di wilayah lain: **ubah Kecamatan/Kelurahan penerima di edit yang sama**; pemeriksaan memakai nilai akhir (setelah perubahan) | Usulan |
| W5 | Kolom Tempat/Alamat Tugas pada layanan wajib-daftar dijadikan **hanya-baca** (hanya lewat tombol pilih) bagi Admin Utama? | Usulan: **ya**, kecuali tombol "Ketik manual" dibutuhkan; pilihan user |

## 3. Temuan kode & data (2026-11-06)

- **Pola yang sudah ada**: formulir input memakai `bukaPopupTempatTugas(layanan)` (`app-admin.js:1728`) dengan daftar dari `getDataRumahIbadah(kategori)` / `getKemenagData(sheet)` (`master.ts:176/232`, bentuk `[kecamatan, kelurahan, nama, alamat]`). Layanan Kemenag memakai `openKemenagModal`; pemetaan layanan ke jenis ada di `getSheetName` (`master.ts:51`) dan `kategoriModal` (`app-admin.js:1704`).
- **Kelola Data sekarang** (`app-kelola-data.js:19-20`): `tempat_tugas` dan `alamat_tugas` = input teks maks 100; server memeriksa pasangan nama+alamat harus ada di daftar (`kelolaData.ts:406-410`, `periksaTempatTugasDariDaftar`) tetapi **tidak** memeriksa wilayah.
- **Input baru sudah menolak beda kecamatan** (`tentukanWilayahTugas` → `tolakBedaKecamatan`, `wilayahTugas.ts:182`), jadi aturan baru di Kelola Data menyamakan perilaku.
- **Daftar admin** `ambilDaftarRumahIbadahAdmin` (`master.ts:323`, khusus UTAMA) punya filter `cari`, `jenis`, `kecamatan`, paginasi (maks 100/halaman), **belum** punya filter `kelurahan`.
- **Data (dicek read-only)**: `rumah_ibadah` 2.880 baris (MASJID 1.251, GEREJA 755, MUSHOLLA 617, VIHARA 128, KLENTENG 56, KUIL 39, GEREJA_KATOLIK 34). Dari **3.630 penerima 2027 yang tertaut** ke rumah ibadah, **0** berbeda kecamatan dan **0** berbeda kelurahan. Jadi aturan tolak-beda-wilayah **tidak akan menolak data yang sudah ada**.

## 4. Rancangan

### 4.1 Antarmuka (frontend, `app-kelola-data.js` + berkas pop-up baru bila perlu)
1. Di `htmlField` untuk `tempat_tugas`/`alamat_tugas`, bila layanan penerima termasuk 12 layanan wajib-daftar: tampilkan tombol **Pilih Rumah Ibadah** (gaya tombol tepi yang ada) dan kolom keduanya ditandai (hanya-baca bila W5 = ya).
2. Pop-up (modal kecil, a11y seperti modal lain: fokus, Escape, `modal-a11y.js`): filter **Kecamatan** dan **Kelurahan** terkunci ke nilai penerima (dapat diganti hanya bila admin mengubah Kecamatan/Kelurahan di formulir edit lebih dulu), **Jenis** otomatis dari layanan (satu atau beberapa jenis), kolom **cari nama/alamat**, daftar bertombol, jumlah hasil, paginasi.
3. Klik satu baris → isi kolom Tempat Tugas dan Alamat Tugas persis dari daftar; tutup pop-up; tandai kolom berubah (pola yang ada untuk deteksi perubahan).
4. Jika penerima belum punya kecamatan/kelurahan terisi: pesan jelas "isi kecamatan dan kelurahan dulu".
5. Teks dari server selalu lewat `esc()`.

### 4.2 Sumber daftar
Opsi (diputuskan di P1, dengan ukuran beban sebagai dasar):
- **A (usulan, tanpa ubah server untuk daftar)**: `ambilDaftarRumahIbadahAdmin` dengan `kecamatan` + `jenis` + `cari`, kelurahan disaring di sisi klien (satu kelurahan umumnya puluhan rumah ibadah).
- **B**: tambah parameter `kelurahan` opsional pada fungsi itu (aditif, aman untuk pemanggil lama) agar paginasi tepat.
Untuk layanan dengan beberapa jenis (mis. Pengurus Vihara/Klenteng/Kuil): beberapa panggilan atau jenis gabungan; ditetapkan di P1.

### 4.3 Server (pemeriksaan wilayah, `kelolaData.ts`)
Setelah `periksaTempatTugasDariDaftar` (baris ±409), bila layanan wajib-daftar dan (tempat_tugas/alamat_tugas/layanan berubah):
- `lokasi = cariRumahIbadah(tempat, alamat, trx)` (sudah ada);
- lolos bila ada `lokasi` dengan `kecamatan == eff("kecamatan")` **dan** `kelurahan == eff("kelurahan")` (rapikanTeks);
- bila tidak: tolak dengan pesan sejenis input baru, mis. *"GAGAL: <TEMPAT> tercatat di Kec. X, Kel. Y, sedangkan wilayah penerima Kec. A, Kel. B. Pilih rumah ibadah di wilayah yang sama, atau ubah Kecamatan/Kelurahan penerima terlebih dahulu."*
- nama+alamat kembar di wilayah berbeda ditangani (cukup satu yang cocok).
- Memakai `trx` (pool kecil, lihat catatan berkas). Tidak ada kolom/migrasi baru; `rumah_ibadah_id` tetap diisi oleh `pilihRumahIbadahId` seperti sekarang.

### 4.4 Yang sengaja TIDAK diubah
Input baru, Edit di Detail (`penerima.ts`), pemeriksaan daftar yang ada, aturan kuota, dan layanan bebas.

## 5. Kasus tepi
| Kasus | Penanganan |
|---|---|
| Data lama yang kecamatan/kelurahannya tak cocok (saat ini 0) | Tidak ditolak selama tempat/alamat/layanan tidak diubah (W3) |
| Admin ubah layanan (mis. Bilal → Nazir Masjid) | Pemeriksaan daftar + wilayah ikut berlaku (sama seperti pemeriksaan daftar sekarang) |
| Nama+alamat kembar di dua kelurahan | Pop-up menampilkan keduanya per wilayah; server menerima yang cocok wilayah |
| Rumah ibadah kosong untuk wilayah itu | Pesan "belum ada rumah ibadah jenis ini di kelurahan X"; petunjuk menambah di Manajemen Data Rumah Ibadah |
| Penerima pindah kecamatan sekaligus tempat tugas | Diubah di edit yang sama; wilayah akhir dipakai (W4); pemeriksaan kuota yang ada tetap jalan |
| Layanan Kemenag dengan batasan jenis (GSM Katolik/Kristen) | Jenis dan sub-filter mengikuti pop-up input yang ada; diuji khusus |
| Sesi habis / daftar gagal dimuat | Pesan galat, tombol aktif lagi; ketik manual tak tersedia bila W5 = ya |

## 6. Tahapan kerja
| Tahap | Isi |
|---|---|
| P0 | Jawaban W2-W5 + "mulai" |
| P1 | Baca `htmlField`/penyimpan di `app-kelola-data.js`, `openKemenagModal`, pemetaan layanan→jenis; putuskan sumber daftar (A/B) dan ukur beban |
| P2 | Modul pop-up (berkas baru dimuat malas dari `app-kelola-data.js`, hindari berkas mepet batas baris) + sambungan ke kolom |
| P3 | Pemeriksaan wilayah di server (`kelolaData.ts`) + pesan |
| P4 | Uji lokal (§7), review mendalam |
| P5 | **Menunggu perintah Anda**: commit, deploy fungsi `api` **lebih dulu**, lalu push frontend. UI baru kompatibel dengan fungsi lama (hanya tanpa lapis server); fungsi baru kompatibel dengan UI lama (menolak beda wilayah dengan pesan jelas) |
| P6 | Uji klik user: pilih rumah ibadah di wilayah sama (berhasil), coba beda wilayah (ditolak), simpan dan cek Data Detail/cover |

## 7. Uji
1. Semua 12 layanan wajib-daftar: pop-up menampilkan jenis yang benar dan hanya wilayah penerima.
2. Pilih → kolom terisi persis; simpan sukses; riwayat edit tercatat; `rumah_ibadah_id` tertaut; Data Detail ikut sinkron.
3. Server: beda kecamatan ditolak, beda kelurahan ditolak, wilayah sama lolos, ubah wilayah+tempat bersamaan lolos, edit kolom lain pada data lama tetap lolos, layanan bebas tak terpengaruh, nama+alamat kembar.
4. Uji perusakan (mutasi): pemeriksaan wilayah dimatikan, filter kelurahan dimatikan, penjaga "ubah saja" dimatikan; semuanya harus tertangkap.
5. Layar: Tab/Escape/fokus, HP 360 px, Chrome lama (emulasi), daftar besar (kecamatan terpadat) tidak membeku.
6. Regresi: `npm run check-lines`, `npm run check-css` (CSS baru dibangun ulang bila perlu), uji Kelola Data yang ada.

## 8. Risiko & mitigasi
| Risiko | Mitigasi |
|---|---|
| Mengubah fungsi `api` saat input berjalan | Perubahan server satu pemeriksaan kecil di jalur Kelola Data (khusus UTAMA, jarang dipakai); deploy di jam sepi; titik pemulihan = commit/versi sebelumnya |
| Admin terhalang memperbaiki data yang memang beda wilayah | Pesan menunjuk jalan keluarnya (ubah Kecamatan/Kelurahan di edit yang sama, atau perbaiki data rumah ibadah) |
| Daftar rumah ibadah besar memperlambat pop-up | Penyaringan per kecamatan+jenis+cari di server; paginasi |
| Salah pemetaan layanan→jenis | Memakai pemetaan yang sama dengan pop-up input (tak membuat tabel baru), diuji per layanan |

## 9. Jalan balik
Frontend: `git revert` satu commit. Server: kembali ke versi fungsi sebelumnya (titik pemulihan dicatat saat deploy). Tanpa migrasi, tanpa perubahan data.

## 10. Kriteria selesai
- Admin Utama memilih rumah ibadah dari pop-up berfilter kecamatan/kelurahan/jenis dan tersimpan tanpa ditolak karena salah ketik.
- Memilih/mengetik rumah ibadah di wilayah berbeda ditolak server dengan pesan jelas.
- Data yang ada tidak berubah; semua uji §7 lulus; user sudah uji klik.

## 11. Di luar lingkup
- Dropdown di **Edit Data (Detail)** untuk petugas non-Utama (sudah punya pop-up sendiri atau rencana terpisah).
- Pemindahan wilayah rumah ibadah itu sendiri (sudah ada di Manajemen Data Rumah Ibadah dengan konfirmasi).
- Penolakan beda wilayah untuk penerima yang kecamatan/kelurahannya diubah **tanpa** mengubah tempat tugas (tidak diminta).

---

## 12. Realisasi (2026-11-06) dan audit konsistensi Kelola Data vs formulir input

**Dikerjakan (belum commit/deploy):**
- `public/js/app-pilih-rumah-ibadah.js` (baru, dimuat malas untuk UTAMA lewat `app-pesan-periode.js`): pop-up terkunci ke kecamatan + kelurahan penerima, jenis dari layanan, cari, paginasi; sumber data `ambilDaftarRumahIbadahAdmin` (dengan parameter baru `kelurahan`, opsional/aditif di `master.ts`).
- `app-kelola-data.js`: tombol Pilih Rumah Ibadah, kolom Tempat/Alamat Tugas hanya-baca untuk 12 layanan wajib-daftar (klik kolom juga membuka pop-up), aturan isian sisi layar.
- Server `kelolaData.ts` + `wilayahTugas.ts` (`periksaWilayahRumahIbadah`): tolak bila rumah ibadah tidak se-kecamatan + se-kelurahan dengan penerima, dicek saat tempat/alamat/layanan/kecamatan/kelurahan berubah (nilai akhir); relink `rumah_ibadah_id` ikut wilayah.
- CSS: 2 aturan baru ditambahkan (`hover:bg-sky-50`, `focus-visible:bg-sky-50`); `?v=` css + 5 skrip yang "dinaikkan bersama" menjadi 20271066.

**Ketidaksesuaian Kelola Data vs formulir input yang ditemukan dan DITUTUP:**
| # | Formulir input | Kelola Data sebelumnya | Sekarang |
|---|---|---|---|
| 1 | Semua kolom `required` | Hanya Nama (dan kelurahan) yang tak boleh kosong; alamat, tempat lahir, tempat/alamat tugas, rekening, cabang, kontak, jenis kelamin, BPJS bisa dikosongkan | Tak boleh dikosongkan (server + layar) |
| 2 | Kontak: 08 + angka, 10-13 digit, maxlength 13 | Tanpa pemeriksaan, maks 20 | Pola yang sama; maks 13 |
| 3 | Rekening: 14 digit angka | Hanya panjang 14 (huruf lolos) dan boleh kosong | 14 digit angka, wajib |
| 4 | maxlength 100 untuk nama/alamat/tempat/rekening/cabang | Server 150/500/200 | 100 |
| 5 | Jenis kelamin LAKI-LAKI/PEREMPUAN | Server tak memeriksa | Diperiksa |
| 6 | NIK: bukan domisili luar Medan (Capil) dan bukan arsip tahun lalu berstatus selain AKTIF (HASIL MONEV, dll.) | Tidak diperiksa saat NIK diubah | Diperiksa bila NIK berubah (`_shared/cekNik.ts`, dipakai bersama `validasi.ts`) |
| 7 | Wilayah rumah ibadah = wilayah tugas (input baru menolak beda kecamatan) | Tidak diperiksa | Kecamatan + kelurahan |

**Terukur sebelum menerapkan:** data 2027 (7.718 baris) tidak ada yang melanggar aturan baru (0 kolom kosong, 0 nilai >100 karakter, 0 kontak tak baku, 0 rekening bukan angka, 0 beda wilayah dari 3.630 penerima tertaut) sehingga tidak ada data lama yang terganggu.

**BELUM disamakan (butuh keputusan user):**
- **Koordinat lokasi** (user 2026-11-06: DIABAIKAN, tidak dikerjakan) layanan Guru (GMM, GSM, Buddha, Hindu, Kong Hu Chu) wajib sah di formulir input, tetapi Kelola Data tidak punya kolom koordinat: mengubah layanan menjadi Guru tidak mewajibkan koordinat, dan Lihat Data > Edit baru bisa mengubah koordinat setelah layanan sudah Guru. Usul: tambah kolom koordinat di Kelola Data (hanya untuk layanan Guru, memakai penerjemah yang sama).
- **Kecamatan/kelurahan domisili** tidak dapat diubah di Kelola Data (wajib di formulir input).
- ~~NIK arsip/Capil pada Lihat Data > Edit dan simpan input~~ **DITUTUP 2026-11-06 (atas permintaan user)**: `penerima.ts` (simpanDataKeSheet dan editDataPenerimaInti saat NIK berubah) kini memanggil `periksaNikBolehDipakai` (`_shared/cekNik.ts`), sama dengan validasiDataBaru dan Kelola Data. Uji: `npm run uji:nik-arsip` 16/16, 6 mutan tertangkap.
- Penanda "nama rekening beda dari nama" (konfirmasi di layar input) tidak ada di Kelola Data.

**Uji:** `npm run uji:wilayah-ri-kelola` 21/21 (server, database tiruan); layar Chrome `scripts/uji/layar/kelola-pilih-ri.mjs` 21/21 dan `kelola-data-validasi.mjs` 13/13; regresi `uji:` wajib-daftar-ri 15, rumah-ibadah-id 24, tautan-ri 16, sinkron-detail 10, alamat-tugas 42, validasi-penerima 75, cek-rumah-ibadah 14, dll. lulus; uji perusakan 12 mutan (satu "lolos" ekuivalen: batas kontak 13 dijaga ganda oleh maxlength server); `deno check` = 8 galat lama yang sama dengan sebelum perubahan (master.ts/pembayaran.ts/sandi.ts), tidak ada galat baru.

**Urutan rilis (saat user perintahkan):** deploy fungsi `api` LEBIH DULU (UI baru kompatibel dengan fungsi lama; fungsi baru + UI lama hanya menolak lebih ketat dengan pesan jelas), lalu push frontend (CSS + `?v=`). Jam sepi; titik pemulihan fungsi = versi `api` saat ini (v112).
