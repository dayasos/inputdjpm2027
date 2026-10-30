# Plan: Cek Alamat Tugas Guru Maghrib Mengaji (komunikasi dua arah Admin Utama <-> Admin GMM)

Tanggal: 2026-10-30; diperbarui 2026-10-31. Status: **KODE SELESAI + UJI LULUS di cabang lokal `feat/cek-alamat-tugas-gmm` (migrasi/fungsi/frontend BELUM diterapkan ke produksi; menunggu izin user per langkah)**. Menggantikan `plan-cek-status-tempat-tugas.md` (tampilan publik DIBATALKAN user: alamat rumah tidak boleh keluar lewat NIK + tanggal lahir).

## 1. Latar dan tujuan
Saat verifikasi, banyak petugas input mengisi **Alamat Tugas** Guru Maghrib Mengaji (GMM) dengan **alamat rumah**, padahal berkas guru menulis tempat tugas lain.
Contoh: berkas menulis tempat tugas Jl. Mandor, rumah Jl. Madio Santoso; yang terinput Jl. Madio Santoso. Akibatnya tim monitoring Dinsos salah alamat.

Tujuan: Admin Utama dan admin GMM tiap kecamatan memeriksa ulang alamat tugas guru yang **bertempat tugas "RUMAH"**, dengan jejak yang rapi, sehingga saat monitoring alamat tugasnya tepat (bersama peta/koordinat yang sudah ada di aplikasi).

Keputusan user (2026-10-30):
- Bukan di halaman publik.
- Komunikasi dua arah **hanya antara Admin Utama dan admin GMM semua kecamatan** (bukan akun Kecamatan, MUI, atau layanan lain).
- Bukan chat bebas (chat dihapus 2026-09-12). Bentuknya **utas pendek yang menempel pada tiap data guru**.

## 2. Data awal (kueri produksi 2026-10-30, tahun 2027)
- GMM bertempat tugas "RUMAH": **746** guru di 17 kecamatan. **462** (62%) `alamat_tugas` persis sama dengan `alamat` (rumah): prioritas. 424 sudah Memenuhi Syarat. Semua 746 punya `link_koordinat_lokasi`.
- Terbanyak: Labuhan 118, Denai 96, Barat 64, Helvetia 64, Timur 61, Petisah 56, Tuntungan 53, Selayang 53, Marelan 52, Tembung 51.
- Akun peran `GURU MAGHRIB MENGAJI`: **23 aktif** = **21 akun per kecamatan (semua 21 kecamatan, satu akun masing-masing)** + **2 akun tanpa kecamatan**.
- Medan Tembung (51 data) semula tanpa akun GMM berkecamatan; **sudah diperbaiki user 2026-10-30** (akun Tembung aktif, diperbarui 16:34 UTC, diverifikasi). Medan Baru, Deli, Perjuangan, Polonia punya akun tetapi 0 data bertempat tugas "RUMAH" (tidak perlu cek).

## 3. Hak akses (diperiksa di SERVER, bukan di tampilan)
| Peran | Boleh |
|---|---|
| **UTAMA** | Membuka permintaan cek (per kecamatan atau semua), melihat semua kecamatan + ringkasan, membalas, mengembalikan (alasan wajib), menandai selesai. |
| **GURU MAGHRIB MENGAJI** berkecamatan | Hanya data kecamatannya: menjawab, membalas, membuka peta, memperbaiki alamat lewat edit yang sudah ada. |
| GMM tanpa kecamatan (2 akun) | **Keputusan Q1.** Usul: tidak melihat apa pun sampai kecamatannya diisi (gagal ke arah aman). |
| KECAMATAN, MUI, layanan lain, tanpa sesi | Ditolak (tombol tidak tampil, server menolak). |

Kecamatan akun GMM selalu diambil dari **sesi**, tidak pernah dari kiriman browser. Cakupan data dihitung dari `penerima.kecamatan` **saat ini** (join), bukan salinan, karena fitur domisili lintas kecamatan bisa memindahkan data.

## 4. Model data (migrasi aditif; tanpa mengubah tabel lama)
Mengikuti pola tabel Retur: tanpa FK ke `penerima` (sinkron/hapus data tidak boleh gagal karenanya), RLS aktif tanpa policy (akses hanya lewat fungsi `api`).

`cek_alamat_tugas` (satu baris per guru per tahun)
- `id`, `tahun`, `penerima_id` (unik per tahun), `alamat_tugas_awal` (salinan saat dibuka, untuk bukti), `sama_alamat_rumah` (boolean prioritas, dihitung saat dibuka), `status` : `BELUM` | `SUDAH_BENAR` | `DIPERBAIKI` | `TIDAK_PASTI` | `DIKEMBALIKAN` | `SELESAI`, `menunggu` : `GMM` | `UTAMA` | NULL (siapa yang harus bertindak, dasar lencana), `dijawab_oleh`, `dijawab_pada`, `dibuka_oleh`, `dibuka_pada`.

`cek_alamat_tugas_pesan` (utas, hanya-tambah, seperti `retur_riwayat`)
- `id`, `cek_id`, `pengirim_username`, `pengirim_role`, `jenis` (`JAWAB` | `BALAS` | `KEMBALIKAN` | `BUKA` | `SELESAI`), `isi` (0..500 karakter; wajib untuk KEMBALIKAN dan TIDAK_PASTI), `alamat_sesudah` (untuk DIPERBAIKI, diambil dari data saat itu), `dibuat_pada`.

Nama dan alamat **tidak disalin** ke tabel baru; ditampilkan lewat join ke `penerima` (satu sumber kebenaran).

## 5. Alur
1. **Buka (UTAMA):** pilih "semua kecamatan" atau satu kecamatan, tampil pratinjau jumlah (kering), lalu eksekusi. Idempotent: guru yang sudah punya permintaan dilewati. Data diisi dari kriteria `layanan = GURU MAGHRIB MENGAJI` dan tempat tugas bertipe "RUMAH". Status awal `BELUM`, `menunggu = GMM`.
2. **Jawab (GMM):** per guru memilih
   - **Sudah benar**: wajib centang "sudah dicocokkan dengan berkas guru".
   - **Sudah diperbaiki**: server memeriksa `alamat_tugas` **memang sudah berubah** dari `alamat_tugas_awal` (tidak bisa mengaku diperbaiki tanpa mengubah). Perbaikan memakai edit data yang sudah ada.
   - **Tidak bisa dipastikan**: catatan wajib.
   Lalu `menunggu = UTAMA`.
3. **Balas (dua arah):** keduanya dapat menambah catatan di utas kapan saja; `menunggu` berpindah ke pihak lawan.
4. **Kembalikan (UTAMA):** alasan wajib, status `DIKEMBALIKAN`, `menunggu = GMM`.
5. **Selesai (UTAMA):** `SELESAI`, `menunggu = NULL`.
Semua langkah tercatat di utas (siapa, kapan, apa).

## 6. Tampilan
- Tombol baru "Cek Alamat GMM" hanya untuk UTAMA dan akun GMM, dengan lencana jumlah "menunggu saya".
- **UTAMA:** ringkasan per kecamatan (belum / sudah dijawab / dikembalikan / selesai), daftar dengan filter kecamatan dan status, tombol "Buka permintaan".
- **GMM:** daftar kecamatannya. Kartu per guru: Nama, Kelurahan, **Alamat Tugas**, **Alamat Rumah (pembanding)**, penanda "Sama dengan alamat rumah", tombol **Peta** (memakai `koordinat-lokasi.js` yang sudah ada), tombol **Buka data** (edit yang sudah ada), tombol jawab, utas.
- Mobile 390 px lebih dulu; tanpa kelas Tailwind baru bila mungkin (kalau perlu: `npm run build:css` + commit CSS + `npm run check-css`).
- **Tanpa sinyal realtime** (pelajaran: sinyal `setelan/*` pernah mereset form). Lencana disegarkan saat membuka aplikasi dan saat membuka panel.

## 6a. Agar akun GMM PASTI melihat adanya permintaan (pertanyaan user 2026-10-30)
Kondisi sekarang untuk akun GMM: baris atas hanya **Input Data**, **Lihat Data**, dan **Retur & Kematian**; baris Admin Utama (Kelola Data, Kelola User, Data Ibadah, Retur, dst.) tidak tampil. Satu-satunya pemberitahuan yang ada adalah modal "Pesan dari Admin Utama" (tombol Mengerti), yang bersifat umum, bukan per tugas. Karena itu fitur ini membawa pemberitahuan sendiri, tiga lapis:
1. **Tab "Cek Alamat" di baris atas** (di samping Lihat Data), tampil hanya untuk akun GMM dan UTAMA, dengan **lencana angka** jumlah guru yang menunggu tindakan akun itu (GMM: `menunggu = GMM`; UTAMA: `menunggu = UTAMA`). Warna menyolok (jingga) selama angkanya > 0.
2. **Pop-up saat masuk** (pola modal pesan admin yang sudah ada): "Admin Utama meminta Anda mengecek alamat tugas N guru Maghrib Mengaji di kecamatan Anda", tombol **Buka Cek Alamat** dan **Nanti**. Muncul setiap login selama masih ada yang menunggu; "Nanti" menutupnya untuk sesi itu. Tidak ditumpuk di atas modal pesan admin: tampil sesudah modal itu ditutup.
3. **Pita pengingat** tipis di atas Lihat Data dan Input Data selama ada yang menunggu: "N guru menunggu cek alamat tugas. Buka". Hilang saat nol.
Lencana disegarkan saat masuk, saat panel dibuka, dan saat tab browser kembali terlihat (dengan jeda minimal 2 menit). Tanpa polling dan tanpa sinyal realtime (menjaga beban DB dan menghindari bug reset form).

**Pantauan untuk UTAMA (apakah pesan sampai):** tabel kecil `cek_alamat_tugas_kecamatan` (`kecamatan`, `pertama_dilihat_pada`, `terakhir_dilihat_pada`, `dilihat_oleh`) diisi saat akun GMM membuka panel. Ringkasan per kecamatan menampilkan "belum pernah dibuka" atau "terakhir dibuka <tanggal>", sehingga UTAMA tahu kecamatan mana yang belum melihat permintaan dan bisa menindaklanjuti lewat WA. Satu akun GMM per kecamatan berarti pemegangnya bisa saja belum login berhari-hari, jadi pemberitahuan WA tetap disarankan pada peluncuran pertama (teks `.txt` disiapkan Claude bila diminta).

Pelengkap yang sudah ada: UTAMA dapat sekaligus mengirim **Pesan Admin (INFO)** yang akan tampil sebagai modal ke semua akun.

## 7. Aksi server (domain baru `domains/cekAlamatGmm.ts`, didaftarkan di `ALLOWED`)
`cekAlamatRingkasan`, `cekAlamatDaftar`, `cekAlamatBuka` (UTAMA, mode `pratinjau`/`eksekusi`), `cekAlamatJawab`, `cekAlamatBalas`, `cekAlamatKembalikan` (UTAMA), `cekAlamatSelesai` (UTAMA), `cekAlamatLencana` (jumlah menunggu + mencatat "dilihat" per kecamatan saat panel dibuka). Masukan divalidasi (panjang, enum, id angka); respons dibatasi per halaman.

## 7a. Perilaku data yang perlu diwaspadai
- Edit alamat memakai `editDataPenerima`: tunduk pada **periode input** (bila ditutup, perbaikan ditolak; jawaban Sudah benar/Tidak pasti tetap boleh), indeks unik `(tahun, layanan, tempat_tugas, alamat_tugas)` (dua guru dengan tempat "RUMAH" dan alamat sama akan bentrok; pesan galat yang sudah ada tampil apa adanya), dan `riwayat_edit` (jejak sebelum/sesudah sudah otomatis).
- Pembatasan "layanan wajib daftar rumah ibadah" tidak berlaku bila GMM tidak termasuk daftarnya; **dipastikan di F1**.
- Bila tempat tugas guru diubah dari "RUMAH" ke lembaga setelah dibuka, baris tetap ada dan tampil dengan keterangan "tempat tugas sudah bukan RUMAH".
- Bila data penerima dihapus, baris tampil "Data sudah dihapus" dan dapat ditutup UTAMA.

## 8. Pengujian
1. Server (PGlite + harness yang ada): matriks akses (UTAMA, GMM kecamatan A, GMM kecamatan B, GMM tanpa kecamatan, KECAMATAN, MUI, tanpa sesi); GMM tidak bisa membaca/menjawab data kecamatan lain walau mengirim `id` tebakan; buka idempotent; transisi status sah/tidak sah; "DIPERBAIKI" ditolak bila alamat tidak berubah; cakupan mengikuti kecamatan **saat ini** setelah data dipindah; batas panjang; utas hanya-tambah.
2. Tampilan (Chrome 390 px, data uji): urutan, lencana, peta, balasan.
3. Mutan perusak: hapus pemeriksaan peran/kecamatan -> uji akses harus gagal; hapus pemeriksaan "alamat berubah" -> uji gagal.
4. Regresi: rangkaian uji yang ada + `check-css`.

## 9. Urutan kerja (bertahap, reversibel; deploy hanya atas izin)
| Fase | Isi | Produksi? |
|---|---|---|
| F0 | Jawaban Q1-Q4. Kueri baca-saja: daftar akun GMM tanpa kecamatan, Tembung. | Baca saja |
| F1 | Migrasi + domain server + uji server, di salinan git bersih. | Tidak |
| F2 | Tampilan + uji layar. | Tidak |
| F3 | Tinjau diff (satu putaran). Terapkan migrasi, deploy fungsi `api`, push frontend (urutan itu). | **Izin user per langkah** |
| F4 | Uji klik oleh user (UTAMA + satu akun GMM). Pilot satu kecamatan (usul Q4), lalu buka semua. | User |

## 10. Pemulihan
Migrasi aditif: `drop table cek_alamat_tugas_pesan, cek_alamat_tugas;`. Kode: `git revert`. Data penerima tidak pernah diubah oleh fitur ini (kecuali edit alamat yang memang dilakukan petugas lewat edit biasa, dengan `riwayat_edit`).

## 11. Risiko
| # | Risiko | Mitigasi |
|---|---|---|
| R1 | ~~Medan Tembung tanpa akun GMM.~~ SELESAI 2026-10-30 (akun dibuat user, terverifikasi). | Cek ulang daftar akun per kecamatan sebelum pilot (F0). |
| R2 | Akun GMM tanpa kecamatan (2) melihat terlalu banyak/sedikit. | Q1; bawaan: tidak melihat apa pun. |
| R3 | Jawaban "sudah benar" asal klik. | Centang pernyataan + jejak per akun + UTAMA bisa mengembalikan; sampel dicek UTAMA. |
| R4 | Beban kueri/koneksi DB (sering penuh). | Daftar per halaman, satu kueri per panggilan, tanpa polling. |
| R5 | Periode input tertutup menghalangi perbaikan. | Jawaban non-edit tetap boleh; pesan jelas bila perbaikan ditolak. |

## 12. Pertanyaan terbuka (SEMUA SUDAH DIJAWAB user 2026-10-31, lihat bagian 15)
- **Q1** 2 akun GMM tanpa kecamatan: tidak ikut (usul), atau lihat semua kecamatan?
- ~~**Q2** Medan Tembung~~ SELESAI: akun GMM Tembung sudah ada.
- **Q3** Cakupan guru: hanya yang tempat tugasnya "RUMAH" (746), atau juga guru lain yang alamat tugasnya sama dengan alamat rumah?
- **Q4** Pilot di satu kecamatan dulu (usul: Medan Labuhan, 118 data, 100 prioritas), atau langsung semua?

## 13. Di luar cakupan
Chat bebas; layanan selain GMM (struktur `jenis` dipertimbangkan nanti, bukan sekarang); notifikasi WA otomatis; mengubah Cek Status publik; memperbaiki alamat massal otomatis.

## 14. Temuan tambahan 2026-10-30 (saat mengerjakan pengingat input, lihat `plan-pengingat-alamat-rumah-gmm.md`)
1. **GMM tidak bisa mengedit Alamat Tugas lewat Detail.** Di Detail > Edit kolom Tempat Tugas dan Alamat Tugas baca-saja; hanya Admin Utama lewat Kelola Data. Maka "Sudah diperbaiki lewat edit yang sudah ada" (bagian 5 langkah 2, 6, 7a) **tidak berlaku untuk akun GMM**. Server `editDataPenerima` memang mengizinkan GMM bila RBAC lolos, tetapi tampilannya tidak menyediakan. Keputusan baru **Q5**: (a) panel Cek Alamat menyediakan aksi terkontrol "Perbaiki alamat tugas" (hanya kolom alamat tugas, hanya data pada daftar, memakai logika `editDataPenerima` + `riwayat_edit` + sinkron `data_detail`), atau (b) GMM hanya melaporkan "alamat benar = ..." dan Admin Utama mengeksekusi di Kelola Data. Saran: (a).
2. **Akun GMM tanpa kecamatan berarti se-Kota Medan** menurut aturan aplikasi (app-admin.js: "GURU MAGHRIB MENGAJI kecamatan opsional (kosong = se-Kota Medan)"). Q1 sebaiknya diselaraskan: 2 akun itu melihat SEMUA kecamatan (baca + balas), bukan "tidak melihat apa pun".
3. **Penyebab kesalahan input kemungkinan placeholder** "Masukkan Alamat Rumah Lengkap" pada jendela jenis RUMAH; diperbaiki di Tahap 0 (pengingat input). Data lama (746) tetap perlu dicek lewat fitur ini.

## 15. Keputusan final dan realisasi (2026-10-31)
**Keputusan user:** Q1 = dua akun GMM tanpa kecamatan melihat SEMUA kecamatan (baca + balas; berwenang seperti akun GMM, se-Kota). Q2 selesai (akun Tembung dibuat). Q3 = hanya guru GMM bertempat tugas "RUMAH" (746 saat plan ditulis). Q4 = langsung semua kecamatan (tanpa pilot). Q5 = aksi "Perbaiki alamat tugas" terbatas, hanya untuk alamat yang akan diperbaiki.

**Realisasi (cabang lokal `feat/cek-alamat-tugas-gmm`):**
- Migrasi `20261031100000_cek_alamat_tugas_gmm.sql`: 3 tabel baru (`cek_alamat_tugas`, `cek_alamat_tugas_pesan` hanya-tambah, `cek_alamat_tugas_kecamatan`), RLS aktif tanpa policy, hak anon/authenticated dicabut, tanpa FK ke penerima, batasan basis data (SELESAI tepat bila tidak ada yang ditunggu; satu per guru per tahun; isi <= 500). Idempoten. Pemulihan tertulis di kepala berkas.
- Server: `_shared/cekAlamatInti.ts` (logika murni: aturan RUMAH, lingkup, validasi, alur status), `domains/cekAlamatTugas.ts` (10 aksi, terdaftar di `ALLOWED`). Perpindahan status hanya lewat `transisi()`, di dalam transaksi dengan baris terkunci. Perbaikan alamat memanggil `editDataPenerima` (HANYA indeks 9 = alamat tugas) sehingga RBAC, aturan periode, riwayat edit, dan sinkron `data_detail` ikut berlaku. Tidak ada tulis langsung ke `penerima`.
- Frontend: `public/js/app-cek-alamat.js` (dimuat malas hanya untuk UTAMA dan GURU MAGHRIB MENGAJI lewat `SKRIP_PER_PERAN`): tab "Cek Alamat" + lencana, pop-up sekali per sesi (GMM), pita pengingat, panel (ringkasan, daftar, utas, jawab, perbaiki, kembalikan, selesai, buka permintaan). `public/css/tailwind.css` dibangun ulang (kelas warna orange; 1217 aturan) dan HARUS ikut di-commit.
- Hal yang dibulatkan saat implementasi: data yang sudah dihapus disembunyikan dari semua akun GMM (hanya UTAMA yang melihat dan dapat menutupnya); perbaikan alamat hanya oleh akun GMM (UTAMA mengubah lewat Kelola Data lalu menandai selesai); panel dikosongkan dari DOM saat ditutup.

**Pengujian:**
- `npm run uji:cek-alamat`: 12 uji logika murni (termasuk tabel 72 kombinasi alur status dan kesetaraan aturan RUMAH dengan modul browser) + 7 uji kabel + 22 uji server di Postgres SUNGGUHAN (PGlite; dilewati bila PGlite tidak terpasang) dengan migrasi dan kode domain asli: matriks akses, cakupan kecamatan, tebak id, injeksi, alur status dua arah, perbaikan alamat (data_detail, riwayat edit, periode ditutup), dua jawaban serentak, ketahanan sebelum migrasi.
- Uji perusakan: 19 mutan server + 5 mutan kabel + mutan tampilan, semuanya tertangkap.
- `node scripts/uji/layar/cek-alamat.mjs` (Chrome 390 px, server tiruan berstatus): GMM, UTAMA, KECAMATAN, MUI; XSS pada semua kolom dan utas; tautan peta; dialog konfirmasi; lencana/pop-up/pita.
- Keterbatasan jujur: kunci baris (`FOR UPDATE`) tidak dapat diuji antar-koneksi di PGlite (satu koneksi); uji dua jawaban serentak membuktikan logika, bukan penguncian antar-koneksi. Cakupan kode ini dijaga oleh keluaran transaksi + batasan basis data (unik per guru, status/menunggu), bukan hanya oleh kunci.

**Urutan rilis (SETIAP langkah menunggu izin user):**
1. Terapkan migrasi ke produksi **lewat `apply_migration` (alat Supabase MCP)** dengan isi berkas migrasi ini (hanya tabel baru; idempoten). Jangan `db push` begitu saja: beberapa migrasi terbaru di produksi tercatat dengan stempel waktu berbeda dari nama berkas lokal (`cek_status_publik` = 20261028020049, `templat_alasan` = 20261030023520), sehingga `db push` menolak karena riwayat tidak cocok kecuali memakai `--include-all`. Migrasi terakhir di produksi 2026-10-31 adalah 20261030023520, jadi 20261031100000 berurutan. 2. Deploy fungsi `api`. 3. Push frontend (`main`, Workers Builds; termasuk CSS). Frontend yang tayang lebih dulu aman: modul menyembunyikan fitur bila server belum mendukung. Fungsi yang tayang sebelum migrasi aman: aksi menjawab dengan pesan, tidak melempar galat.
4. Uji klik user (UTAMA: Buka Permintaan Cek, pratinjau lalu eksekusi; satu akun GMM: jawab, perbaiki, balas). 5. WA ke 21 pemegang akun GMM.
**Pemulihan:** `git revert` untuk kode; data: `drop table public.cek_alamat_tugas_pesan, public.cek_alamat_tugas_kecamatan, public.cek_alamat_tugas; drop function public.cek_alamat_tugas_pesan_tolak_ubah();` (data penerima tidak pernah diubah oleh fitur ini selain perbaikan alamat tugas yang tercatat di riwayat edit).

## 16. Tinjauan kedua (2026-10-31): temuan dan perbaikan
Tinjauan ulang yang berfokus pada apa yang BELUM pernah dilihat/diuji menemukan 5 masalah, semuanya diperbaiki dan dijaga uji:
1. **Header ponsel rusak:** tombol "Cek Alamat" yang lebar mendorong "Retur & Kematian" keluar layar untuk akun GMM (di 390 px, ujungnya di 473 px). Kini tombol ringkas (ikon + lencana) di bawah 640 px, label teks di layar lebih besar. Uji Chrome mengukur baris navigasi untuk GMM dan UTAMA.
2. **Klik di luar panel membuang isian** (alamat koreksi/catatan) tanpa konfirmasi: kini diabaikan bila ada isian; tombol Tutup/X/ESC meminta konfirmasi.
3. **ESC tidak berfungsi / ganda:** modal-a11y.js mengabaikan ESC pada modal yang memasang `role` sendiri. Kini role dibiarkan ke modal-a11y.js, handler ESC sendiri dibuang; penutupan tepat sekali.
4. **Gangguan sementara menghapus tab:** koneksi DB penuh (kejadian nyata ±1,3%) membuat lencana gagal dan tab hilang. Kini hanya "Aksi tidak diizinkan / does not exist" yang menyembunyikan fitur; gangguan lain mempertahankan tampilan dan mencoba lagi (maks. 3 x 30 detik). Ditemukan juga bug pada perbaikan ini sendiri (tab tidak dibuat bila panggilan pertama gagal), tertangkap uji.
5. **Rencana rilis migrasi dikoreksi** (lihat bagian 15, langkah 1).

## 17. Pensiun fitur (keputusan user 2026-10-31: Cek Alamat bersifat SEMENTARA)
Yang dipedomani petugas ke depan adalah aturan saat INPUT (pengingat tahap 0, `plan-pengingat-alamat-rumah-gmm.md`), yang tetap berlaku. Cek Alamat hanya untuk memeriksa data yang sudah ada.
**Kriteria selesai:** semua permintaan berstatus SELESAI dan tidak ada yang menunggu; bila ada guru GMM RUMAH baru yang belum dibuka, tekan "Buka Permintaan Cek" sekali lagi sebelum pensiun.
**Urutan pensiun (kebalikan dari rilis; tiap langkah menunggu izin user):**
1. Ekspor arsip (Excel): permintaan + utas (siapa, kapan, jawaban, alamat sebelum/sesudah). Setelah tabel dihapus utas tidak dapat dipulihkan. Simpan 1-2 minggu sebelum menghapus tabel bila perlu bukti untuk monitoring Dinsos.
2. Frontend: revert commit fitur (cd170c6 + e4910e3, termasuk tailwind.css yang dibangun ulang) lalu push.
3. Fungsi `api`: deploy ulang tanpa 10 aksi cekAlamat*.
4. Hapus tabel: `drop table public.cek_alamat_tugas_pesan, public.cek_alamat_tugas_kecamatan, public.cek_alamat_tugas; drop function public.cek_alamat_tugas_pesan_tolak_ubah();`
Tidak ada yang bergantung pada tabel/kodenya (tanpa FK; fitur lain tidak memanggilnya). Perbaikan alamat yang sudah dilakukan tetap ada di `penerima`, `data_detail`, dan `riwayat_edit`. Opsi antara: saklar mati/nyala (belum dibangun).
