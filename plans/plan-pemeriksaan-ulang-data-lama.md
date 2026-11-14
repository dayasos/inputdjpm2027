# Plan: Pemeriksaan Ulang Data Lama oleh Tim Verifikator (penugasan acak merata, pekerjaan nyata)

> Versi **0.1 (draf)** · 2026-11-14 · Status: **RENCANA SAJA, belum ada kode/migrasi.** Menunggu keputusan K1–K8 (bagian 7).
> Berlanjut dari `plans/plan-agregat-verifikator.md`. Prinsip: bertahap, lokal dulu, migrasi/deploy/push hanya atas izin.

## 1. Latar belakang dan permintaan
Data yang diverifikasi **sebelum 12 November 2026** dikerjakan Admin Utama, sebelum tim verifikator mulai. Angka di database (2026-11-14, tahun 2027):

| Status | Diverifikasi sebelum 12 Nov | Sesudahnya | Catatan |
|---|---|---|---|
| Memenuhi Syarat | 7.293 | 374 | |
| Berkas Tidak Lengkap | 77 | 44 | |
| Tidak Memenuhi Syarat | 3 | 0 | |
| Proses Verifikasi (belum diverifikasi) | – | – | 2.335 data, sedang dikerjakan tim |

Seluruh 7.373 data sebelum 12 Nov tercatat atas nama `ADMIN` (1 Okt – 12 Nov). Rencana Anda: data itu **dibagi rata dan acak** kepada seluruh petugas lembur, untuk periode dari 12 Nov sampai tanggal akhir yang akan ditetapkan.

## 2. Jawaban atas "apakah bisa?" (dan batasnya)
**Bisa, dalam bentuk PENUGASAN PEMERIKSAAN ULANG yang dikerjakan sungguhan.** Sistem membagi daftar data secara acak dan merata kepada verifikator; tiap verifikator memeriksa ulang bagiannya; yang dihitung adalah pemeriksaan yang **benar-benar dikerjakan**, dengan **waktu sebenarnya** saat disimpan.

**Yang tidak akan saya bangun:** mencatat 7.373 verifikasi lama itu seolah-olah dikerjakan verifikator pada tanggal dan jam acak di periode lembur (mengisi riwayat dengan tanggal/jam buatan). Alasannya bukan keterbatasan teknis:
- Catatan itu menjadi **bukti lembur yang palsu**: pekerjaan yang dikerjakan Admin sebelum 12 Nov tercatat sebagai kerja orang lain pada jam tertentu.
- Skalanya: 7.373 catatan buatan melawan sekitar 400 verifikasi nyata sejauh ini. Itu mengubah dasar pembayaran lembur secara drastis dan tidak dapat dipertanggungjawabkan saat diaudit.
- Risiko hukum dan administrasi ada pada penetapan lembur dan pihak yang menandatanganinya, termasuk Anda.

Kalau tujuan sebenarnya adalah **menambah beban kerja nyata** atau **memeriksa kualitas data lama**, bagian 3 mencapai keduanya secara sah.

## 3. Rancangan: "Pemeriksaan Ulang" (pekerjaan nyata)
**3.1 Kolam data.** Data tahun 2027 yang diverifikasi sebelum 12 Nov 2026 pukul 19.43 WIB (awal pencatatan riwayat) dan masih berstatus final (K1: ruang lingkup).

**3.2 Pembagian acak merata.**
- Tabel baru `penugasan_ulang` (penerima_id, tahun, akun_id verifikator, batch, dibagi_pada).
- Pengacakan dengan **benih (seed) yang dicatat**, sehingga hasil pembagian dapat direproduksi dan diaudit (bukti tidak dipilih-pilih).
- Merata: tiap verifikator mendapat jumlah data sama (selisih maksimal 1). K3: apakah dibagi sama rata per orang atau per tim lalu per orang.
- Pembagian dilakukan **sekali per batch** oleh Admin Utama (tombol "Bagi tugas"), tidak bisa diulang tanpa membatalkan batch; verifikator hanya melihat tugasnya sendiri.

**3.3 Pengerjaan oleh verifikator.**
- Daftar "Tugas Pemeriksaan Ulang" (hanya miliknya), dengan sisa jumlah dan batas tanggal batch.
- Membuka detail data seperti biasa, lalu memberi **hasil pemeriksaan ulang**: *Sesuai* atau *Perlu dikoreksi* (disertai alasan wajib).
- **Status data tidak berubah oleh verifikator** (konsisten dengan aturan D9). Temuan "Perlu dikoreksi" masuk antrean Admin Utama, yang memutuskan koreksi.
- Setiap pemeriksaan tercatat di `riwayat_verifikasi` dengan `sumber = 'ULANG'` dan **waktu server saat disimpan** (atomik, hanya-tambah, seperti verifikasi biasa).

**3.4 Perhitungan.**
- Pemeriksaan ulang dihitung **terpisah** dari verifikasi pertama ("Data diverifikasi" tetap seperti sekarang), dipisah jam kerja dan luar jam kerja dengan aturan jam yang sama, 1 kali per data per verifikator.
- Tampil sebagai kartu/kolom tersendiri di panel agregat dan sheet Excel. Apakah pemeriksaan ulang ikut dasar lembur adalah **keputusan kebijakan Anda/pimpinan (K4)**; sistem hanya menyediakan angka yang jujur.

**3.5 Pemantauan Admin Utama.** Kemajuan per verifikator (ditugaskan, selesai, sisa, temuan), daftar temuan "Perlu dikoreksi", dan ekspor Excel.

## 4. Alternatif yang lebih sederhana (bila pimpinan menginginkan alokasi tanpa pekerjaan ulang)
**Pencatatan alokasi resmi**: sebuah laporan terpisah "Penugasan" yang menyatakan terang-terangan *"data X dialokasikan ke petugas Y berdasarkan surat tugas/keputusan nomor …"*, **tanpa tanggal dan jam kerja buatan**, tidak digabung dengan angka verifikasi nyata, dan memuat dasar keputusan pimpinan. Sistem hanya mencetak daftar; sah-tidaknya sebagai dasar lembur adalah wewenang pimpinan dan bukan sesuatu yang dapat diputuskan aplikasi. Saya tidak merekomendasikan menggabungkannya ke angka lembur otomatis.

## 5. Tahapan (bila bagian 3 disetujui)
| Tahap | Isi | Dampak produksi |
|---|---|---|
| T1 | Migrasi `penugasan_ulang` + izin/RLS; `sumber 'ULANG'` di riwayat | migrasi (izin Anda) |
| T2 | Aksi server: bagi tugas (acak bersedia seed), daftar tugas saya, simpan hasil pemeriksaan ulang, antrean temuan | lokal |
| T3 | Tampilan verifikator (daftar tugas, form hasil), antrean temuan Admin | lokal |
| T4 | Agregat: kartu/kolom "Pemeriksaan ulang" (jam kerja/luar jam kerja), Excel | lokal |
| T5 | Uji (termasuk keadilan pembagian ±1, tak bisa melihat tugas orang lain, tak bisa mengubah status), tinjauan, percobaan merusak kode | lokal |
| T6 | Deploy bertahap setelah izin; uji nyata dengan satu batch kecil | produksi |

## 6. Pagar yang tetap berlaku
- Hasil verifikasi pertama dan hitungan lembur yang ada **tidak berubah**.
- Riwayat tetap hanya-tambah; waktu selalu jam server; tidak ada jalur untuk mengisi tanggal/jam secara manual.
- Verifikator tidak dapat mengubah status data; hanya Admin Utama (D9).

## 7. Pertanyaan keputusan
| No | Pertanyaan | Usul |
|---|---|---|
| K1 | Ruang lingkup: semua 7.373 data lama, atau hanya sampel (mis. 10–20%) atau hanya yang berstatus tertentu (BTL/TMS)? | Sampel acak bertingkat per layanan; semua data BTL/TMS |
| K2 | Periode pengerjaan dan tanggal batas (disebut "ditetapkan kemudian") | Batas per batch, bukan satu tanggal tunggal |
| K3 | Pembagian rata per orang atau per tim lalu per orang? | Per orang, merata ±1 |
| K4 | Apakah pemeriksaan ulang dihitung ke lembur? (kebijakan Anda/pimpinan) | Tampilkan terpisah; keputusan di pimpinan |
| K5 | Hasil "Perlu dikoreksi": siapa memutuskan, dan apakah perlu alasan wajib? | Admin Utama; alasan wajib |
| K6 | Apakah verifikator boleh meminta ganti tugas (data yang dikenalnya)? | Tidak; hanya Admin yang menukar, tercatat |
| K7 | Data yang sama sudah pernah dibuka verifikator saat Detail (hanya melihat) tidak dihitung; setuju? | Setuju |
| K8 | Perlu laporan resmi (PDF/Excel) untuk lampiran lembur? | Excel, dengan seed dan waktu nyata |

---

## 8. Pembaruan 2026-11-14: data lama dikerjakan petugas lembur lewat akun Admin Utama; pimpinan meminta diakui sebagai hasil lembur

**Fakta baru dari user:** 7.373 verifikasi sebelum 12 Nov dikerjakan petugas lembur yang memakai akun Admin Utama; pengerjaan terjadi SEBELUM perintah lembur terbit; pimpinan meminta pekerjaan itu dimasukkan sebagai hasil kerja lembur.

**Data yang sudah ada (cek database, 2026-11-14):** semua 7.373 data punya `tanggal_verifikasi` NYATA: 1 Okt – 12 Nov 2026 (42 hari aktif). Menurut aturan jam kerja yang sama: **3.732 di jam kerja**, **3.641 di luar jam kerja** (799 di Sabtu/Minggu). Catatan: `tanggal_verifikasi` adalah waktu verifikasi TERAKHIR sebuah data (riwayat per kejadian baru ada sejak 12 Nov 19.43 WIB).

**Rancangan yang sah ("Pengakuan Pekerjaan Sebelum Perintah Lembur"):**
1. Tanggal dan jam asli TIDAK diubah. Setiap data tetap membawa waktu verifikasi nyatanya.
2. Dibuat kategori terpisah di panel dan Excel: "Pekerjaan sebelum perintah lembur (diakui berdasarkan keputusan pimpinan)". Tidak digabung ke angka verifikasi/lembur yang sudah ada.
3. Tiap batch pengakuan memuat: nomor dan tanggal keputusan/perintah pimpinan, tanggal berlaku perintah lembur, pihak yang menetapkan, metode alokasi, benih acak, dan waktu pembuatan.
4. Alokasi ke petugas (acak merata, ±1 data) diberi label tegas **"dialokasikan"**, bukan "dikerjakan oleh". Alasannya: akun Admin dipakai bersama, jadi sistem tidak dapat membuktikan siapa mengerjakan data yang mana; yang dicatat adalah keputusan alokasi.
5. Pembagian jam kerja/luar jam kerja tiap petugas diturunkan dari waktu NYATA data yang dialokasikan kepadanya (bukan tanggal acak baru).
6. Sah-tidaknya pekerjaan sebelum perintah lembur dibayar (berlaku surut) adalah keputusan administrasi pimpinan/kepegawaian; sistem hanya mencatat dasar keputusan dan menyajikan fakta waktu.

**Yang tetap tidak dibangun:** memindahkan tanggal/jam ke periode sesudah 12 Nov, atau menyajikan alokasi sebagai pekerjaan yang dilakukan seseorang pada waktu tertentu.

**Konsekuensi aturan Anda sendiri:** hanya pekerjaan di luar jam kerja (3.641 data) yang tergolong lembur; yang 3.732 di jam kerja adalah tugas biasa.

**Keputusan yang dibutuhkan:** (a) nomor/tanggal perintah dan keputusan pimpinan untuk pengakuan; (b) tanggal berlaku perintah lembur; (c) siapa penerima alokasi (34 verifikator, atau daftar petugas lain); (d) alokasi per data (acak, dapat ditelusuri) atau hanya jumlah per orang; (e) apakah yang di jam kerja ikut ditampilkan atau hanya yang di luar jam kerja.
