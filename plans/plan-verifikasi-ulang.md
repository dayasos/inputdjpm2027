# Plan: Verifikasi Ulang Data yang Sudah Terverifikasi (penugasan acak merata, pekerjaan nyata, masuk agregat/lembur sebagai kategori terpisah)

> Versi **1.2 (draf)** · 2026-11-14 · Status: **RENCANA; belum ada kode verifikasi ulang.** KEPUTUSAN USER: (1) seluruh hasil verifikasi termasuk BTL dan TMS; (2) pemeriksa mengoreksi sendiri (MS -> BTL dst.), Admin tidak dibebani; (3) masuk data lembur dan mengikuti ketentuan lembur; (4) **semua data BTL dan TMS HANYA ke akun `verif_uga_deba`**; (5) **lima akun pimpinan tidak menerima tugas**: `verif_ronald_fredy`, `verif_fery_suhery`, `verif_khoiruddin`, `verif_amy_pratiwi`, `verif_netty_abdiati`; (6) fitur **Verifikasi Massal DIHAPUS** (selesai lokal 2026-11-14, belum tayang).
> Berlanjut dari `plans/plan-agregat-verifikator.md` (D2, D8, D9, agregat) dan menggantikan bagian 3 `plans/plan-pemeriksaan-ulang-data-lama.md` (bagian pengakuan pekerjaan lama di sana tetap terpisah).
> Prinsip proyek: bertahap, lokal dulu, mudah dibatalkan, migrasi/deploy/push hanya atas izin.

---

## 1. Tujuan
Data yang sudah punya hasil verifikasi (Memenuhi Syarat, Berkas Tidak Lengkap, Tidak Memenuhi Syarat) **diperiksa ulang oleh petugas lain**. Pekerjaan itu:
1. nyata (dikerjakan dan dicatat dengan waktu server saat disimpan),
2. dibagi **acak dan merata** (±1 data per petugas) dengan benih yang tercatat sehingga dapat diaudit,
3. dihitung **terpisah** dari verifikasi pertama, dipisah **jam kerja / luar jam kerja** dengan aturan jam yang sama (Sen–Kam 08.00–16.30, Jum 08.00–17.00, WIB; Sabtu, Minggu, tanggal merah = luar jam kerja),
4. menghasilkan koreksi langsung oleh pemeriksa (tanpa membebani Admin Utama) dan temuan mutu (berapa persen data lama yang dikoreksi).

Hasil "Sesuai" **tetap pekerjaan yang dihitung**: yang dinilai adalah pemeriksaan yang dilakukan, bukan ada tidaknya kesalahan.

## 2. Fakta kondisi sekarang (cek database 2026-11-14, tahun 2027)
| Status | Jumlah | Catatan |
|---|---|---|
| Memenuhi Syarat | 7.667 | 7.293 diverifikasi sebelum 12 Nov (atas nama `ADMIN`), 374 sesudahnya |
| Berkas Tidak Lengkap | 121 | 77 sebelum 12 Nov, 44 sesudahnya |
| Tidak Memenuhi Syarat | 3 | |
| Proses Verifikasi | 2.335 | belum diverifikasi; **bukan** bahan verifikasi ulang |

- Aplikasi sudah punya: riwayat `riwayat_verifikasi` (hanya-tambah, atomik untuk verifikator), aturan D9 (verifikator tidak mengubah status), agregat dengan klasifikasi jam kerja, tampilan Detail data, templat alasan, 34 verifikator dalam 4 tim.
- Verifikator **tidak** bisa mengubah status data yang sudah berstatus (D9). Verifikasi ulang mengubahnya secara terbatas (V4): verifikator boleh mengoreksi status HANYA lewat tugas pemeriksaan ulang miliknya.

## 3. Aturan inti (keputusan desain, usul saya)
**V1. Pemeriksa ≠ pemverifikasi pertama.** Data yang dahulu diverifikasi seorang verifikator tidak boleh jatuh ke verifikator yang sama. (Data lama atas nama `ADMIN` bebas ke siapa pun.)
**V2. Satu data = satu pemeriksa per batch.** Dihitung 1 kali per data per pemeriksa.
**V3. Hasil: Sesuai atau Dikoreksi.** **Sesuai** = status tidak berubah. **Dikoreksi** = pemeriksa menetapkan status baru dengan aturan yang SAMA dengan verifikasi pertama: alasan wajib (templat alasan yang ada) untuk Berkas Tidak Lengkap dan Tidak Memenuhi Syarat, batas perbaikan seragam untuk BTL. Kasus utama yang diminta: data **Memenuhi Syarat yang ternyata kurang** diturunkan ke **Berkas Tidak Lengkap** (K13: apakah turun ke Tidak Memenuhi Syarat dan naik dari BTL/TMS ke MS juga diizinkan).
**V4. Amandemen D9 (terbatas).** Verifikator BOLEH mengubah status data **hanya melalui tugas pemeriksaan ulang miliknya sendiri**, satu kali per tugas, dengan aturan V3. Di luar tugas itu, D9 tetap berlaku (data berstatus tidak dapat diubah verifikator; "Tandai Sudah Diperbaiki" khusus Admin Utama). Perubahan dilakukan SERVER dalam satu transaksi (status data + riwayat + tugas), dengan pemeriksaan konflik terhadap status yang sedang dilihat pemeriksa. Admin Utama **tidak** menjadi pemeriksa temuan; ia melihat daftar koreksi dan dapat membatalkannya (K8).
**V5. Pencatatan atomik.** Menyimpan hasil = satu transaksi (tugas + riwayat). Jika riwayat gagal, hasil tidak tersimpan (pola D8).
**V6. Waktu = waktu server saat tersimpan.** Tidak ada jalur untuk mengisi tanggal/jam secara manual.
**V7. Pencatatan.** Riwayat bersumber `ULANG` dengan status lama/baru; verifikasi pertama (`SATU`) tidak tercampur. **Perhitungan lembur (keputusan user):** pemeriksaan ulang MASUK data lembur dan mengikuti ketentuan lembur yang sama (jam kerja / luar jam kerja menurut waktu server saat tersimpan, 1 kali per data per pemeriksa). Panel dan Excel menampilkan **tiga angka**: Verifikasi pertama, Pemeriksaan ulang, dan **Total pekerjaan** (jumlah keduanya) dengan pembagian jam kerja/luar jam kerja untuk masing-masing, supaya setiap angka dapat ditelusuri.
**V8. Pemeriksaan nyata, bukan klik massal** (bagian 6): detail harus dibuka, daftar periksa diisi, jeda minimal per data, dan audit sampel oleh Admin Utama.
**V10. BTL dan TMS khusus satu akun.** Semua data berstatus Berkas Tidak Lengkap dan Tidak Memenuhi Syarat (saat ini 128 data) ditugaskan HANYA ke `verif_uga_deba`, tidak diacak ke petugas lain. Tidak ada benturan V1 (tidak satu pun dari 128 data itu pernah diverifikasi akun tersebut).
**V11. Akun yang dikecualikan.** `verif_ronald_fredy`, `verif_fery_suhery`, `verif_khoiruddin`, `verif_amy_pratiwi`, `verif_netty_abdiati` (pimpinan) tidak masuk daftar pemeriksa mana pun. Daftar pengecualian disimpan di batch (snapshot) dan ditegakkan SERVER; tidak dapat ditimpa dari layar.
**V9. Pembatalan batch hanya untuk tugas yang belum dikerjakan.** Tugas yang sudah selesai tidak pernah dihapus atau dipindah.

## 4. Model data (migrasi baru, belum dijalankan)
Semua tabel baru: RLS aktif tanpa kebijakan, hak `anon`/`authenticated` dicabut (pola yang sama dengan tabel lain). Tidak menyentuh tabel lama.

```sql
-- Satu batch = satu kali pembagian oleh Admin Utama
create table batch_verifikasi_ulang (
  id bigint generated always as identity primary key,
  nama text not null,
  dibuat_oleh text not null, dibuat_pada timestamptz not null default now(),
  benih text not null,                       -- benih acak (dicatat untuk audit/reproduksi)
  kriteria jsonb not null,                   -- layanan, status, rentang tanggal, persen sampel
  pemeriksa jsonb not null,                  -- daftar username penerima tugas (snapshot)
  jumlah_tugas int not null,
  batas_selesai date,
  status text not null default 'AKTIF' check (status in ('AKTIF','SELESAI','DIBATALKAN')),
  catatan text not null default ''
);

-- Satu tugas = satu data untuk satu pemeriksa
create table tugas_verifikasi_ulang (
  id bigint generated always as identity primary key,
  batch_id bigint not null references batch_verifikasi_ulang(id),
  penerima_id bigint not null, tahun int not null,
  akun_id uuid not null references akun(id),            -- pemeriksa
  status_saat_dibagi text not null,                     -- status data ketika dibagikan
  ditugaskan_pada timestamptz not null default now(),
  dibuka_pada timestamptz,                              -- diisi SERVER saat pemeriksa membuka detail
  selesai_pada timestamptz,                             -- diisi SERVER saat hasil disimpan
  hasil text check (hasil in ('SESUAI','DIKOREKSI')),
  status_sebelum text, status_sesudah text,             -- pada DIKOREKSI: status sebelum -> sesudah (diterapkan server dalam transaksi yang sama)
  alasan text not null default '',
  daftar_periksa jsonb not null default '{}',
  unique (batch_id, penerima_id)
);

-- Log pembatalan koreksi oleh Admin Utama (opsional; koreksi berlaku langsung, Admin tidak wajib memeriksa)
create table pembatalan_koreksi_ulang (
  tugas_id bigint primary key references tugas_verifikasi_ulang(id),
  dibatalkan_oleh text not null, dibatalkan_pada timestamptz not null default now(), alasan text not null
);

-- Audit sampel hasil "Sesuai"
create table audit_verifikasi_ulang (
  tugas_id bigint primary key references tugas_verifikasi_ulang(id),
  auditor text not null, diaudit_pada timestamptz not null default now(),
  hasil text not null check (hasil in ('LOLOS','TIDAK_LOLOS')), catatan text not null default ''
);
```
Riwayat: baris `riwayat_verifikasi` dengan `sumber = 'ULANG'` (kolom `sumber` sudah teks bebas; tanpa perubahan skema), `status_lama = status_baru =` status data saat diperiksa, `keterangan` = "SESUAI" atau "DIKOREKSI: alasan". Pemicu hanya-tambah yang ada tetap berlaku.

## 5. Pembagian acak merata (algoritme)
1. **Kolam**: data tahun 2027 berstatus final yang memenuhi kriteria batch (K1), dikurangi data yang sudah pernah ditugaskan dalam batch aktif lain.
2. **Sampel** (bila K1 memilih sampel): sampel acak **bertingkat per layanan** (persentase sama di tiap layanan), semua data BTL/TMS selalu masuk.
3. **Pengacakan berbenih**: benih dari input Admin Utama + waktu, dicatat; PRNG deterministik; urutan kolam diurutkan dulu menurut `id` agar hasil sama untuk benih yang sama.
4. **Pembagian**: per layanan, daftar data diacak lalu dibagi bergilir (round-robin) ke daftar pemeriksa yang diurutkan tetap → selisih jumlah antar pemeriksa **maksimal 1**, dan tiap pemeriksa mendapat campuran layanan yang adil.
5. **Aturan V1**: bila data akan jatuh ke pemverifikasi pertamanya, dipindah ke pemeriksa berikutnya (pembagian tetap ±1).
6. **Pratinjau (tanpa menulis)**: Admin Utama melihat jumlah per pemeriksa dan per layanan sebelum menekan "Bagikan". Hasil pratinjau dan hasil sungguhan identik untuk benih yang sama.
7. **Verifikasi keabsahan**: ada fungsi "cek ulang pembagian" yang menghitung ulang dari benih + kriteria dan membandingkan dengan tabel (bukti tidak dipilih-pilih).

## 6. Pengaman agar pemeriksaan nyata (V8)
| Pengaman | Cara kerja |
|---|---|
| Detail wajib dibuka | Server mencatat `dibuka_pada` saat pemeriksa membuka detail tugas; simpan hasil **ditolak** bila belum dibuka. |
| Jeda minimal | Simpan ditolak bila selisih `now() - dibuka_pada` < N detik (K5; usul 20 dtk). Pesan jelas ke pemeriksa. |
| Daftar periksa | Beberapa butir wajib dicentang sebelum "Sesuai" (isi butir ditetapkan Anda, K6). |
| Tidak bisa dua kali | Tugas yang sudah selesai tidak bisa disimpan ulang; koreksi hanya oleh Admin Utama. |
| Hanya tugas sendiri | Server memeriksa pemilik tugas; pemeriksa lain/peran lain ditolak. |
| Audit sampel | Admin Utama mengambil sampel acak (usul 5%) dari hasil "Sesuai" dan menandai LOLOS/TIDAK_LOLOS; angka lolos per pemeriksa tampil di laporan. |
| Pemantauan | Laporan: median detik per data, lonjakan jumlah per jam, jam penyimpanan; pola janggal terlihat (informasi, bukan hukuman otomatis). |

## 7. Aksi server baru (semua di daftar-putih sesuai peran; cakupan ditentukan server)
**Admin Utama:** `pratinjauBatchUlang`, `buatBatchUlang`, `daftarBatchUlang`, `batalkanBatchUlang`, `cekPembagianBatchUlang`, `getDaftarKoreksiUlang`, `batalkanKoreksiUlang`, `ambilSampelAuditUlang`, `simpanAuditUlang`, `unduhRekapUlang`.
**Verifikator (dan koordinator):** `getTugasUlangSaya` (hanya miliknya; halaman 50 data), `bukaTugasUlang` (mencatat `dibuka_pada`, mengembalikan detail), `simpanHasilUlang` (validasi V3, V5, V6, pengaman bagian 6).
**Agregat:** blok "pemeriksaan ulang" di `getAgregatVerifikasi` (per orang: ditugaskan, selesai, sesuai, perlu dikoreksi, jam kerja, luar jam kerja, audit lolos), cakupan SAYA/TIM/SEMUA sama seperti agregat yang ada. Tanpa data pribadi penerima.

## 8. Rancangan UI/UX (ringkas; mockup visual dapat dibuat setelah plan disetujui)
**Verifikator:** tombol/tab **"Tugas Ulang (sisa N)"** → daftar tugas + bilah kemajuan → "Mulai" membuka Detail data dengan panel **Pemeriksaan Ulang**: status data (hanya baca), daftar periksa, pilihan **Sesuai** atau **Koreksi status** (pilih status baru; alasan wajib untuk BTL/TMS dengan templat alasan; MS yang kurang diturunkan ke Berkas Tidak Lengkap), disertai ringkasan dampak ("data keluar dari calon pembayaran; batas perbaikan 30-11-2026"), tombol **Simpan & berikutnya**. Pesan jelas bila ditolak (belum cukup lama dibuka, daftar periksa belum lengkap).
**Koordinator:** kemajuan timnya (angka saja) di panel agregat.
**Admin Utama:** menu **"Verifikasi Ulang"**: Buat batch (kriteria, pemeriksa, batas, pratinjau jumlah per orang + benih) → Pantau → **Daftar koreksi** (dapat dibatalkan Admin; tidak wajib diperiksa satu per satu) → Audit sampel → Unduh Excel. Kartu baru "Pemeriksaan ulang" dengan **garis warna dan label terpisah** dari verifikasi pertama.
**Panel agregat & Excel:** kolom/sheet **Verifikasi pertama, Pemeriksaan ulang, dan Total pekerjaan** (masing-masing jam kerja dan luar jam kerja), serta sesuai, dikoreksi, dan audit; kolom "Dikoreksi Admin" yang ada diganti "Dikoreksi" (Admin atau pemeriksa ulang); keterangan aturan tampil selalu.
Ponsel 320–390 px dan mode terang/gelap mengikuti pola yang sudah ada; tanpa penambahan isi ke `index.html` / `app-transaksi.js` (modul baru dimuat malas per peran).

## 9. Tahapan (semua lokal dulu, tiap tahap bisa dibatalkan)
| Tahap | Isi | Dampak produksi |
|---|---|---|
| T0 | Putuskan K1–K12; finalkan daftar periksa (K6) | tidak ada |
| T1 | Migrasi 4 tabel + indeks + RLS | migrasi (izin Anda) |
| T2 | Modul murni: pengacakan berbenih, pembagian ±1 dengan V1, sampel bertingkat (+ uji sifat: keadilan, determinisme, tanpa duplikat) | lokal |
| T3 | Aksi server Admin (pratinjau, buat batch atomik, batal, cek ulang pembagian) | lokal |
| T4a | **Refactor aman** logika penerapan status (satu fungsi bersama dipakai verifikasi biasa dan pemeriksaan ulang: UPDATE bersyarat, riwayat, sinkron/arsip `data_detail`) + uji regresi menyeluruh sebelum dipakai ulang | lokal |
| T4 | Aksi server verifikator (daftar, buka, simpan atomik dengan pengaman, **koreksi status**) + gerbang daftar-putih | lokal |
| T5 | Tampilan verifikator + Admin (layar uji Chrome tiap peran dan ponsel) | lokal |
| T6 | Agregat + Excel: Verifikasi pertama + Pemeriksaan ulang + **Total pekerjaan** (jam kerja/luar jam kerja); daftar koreksi; audit sampel | lokal |
| T7 | Uji berlapis: logika murni, server tiruan, **Postgres sungguhan (PGlite)**, layar; percobaan merusak kode; tinjauan menyeluruh | lokal |
| T8 | Penayangan bertahap: migrasi → deploy → push; **batch percobaan kecil (mis. 40 data, 4 orang)**, dipantau, baru batch penuh | produksi (izin Anda) |

## 10. Pertanyaan keputusan

| No | Pertanyaan BARU akibat keputusan user | Usul saya |
|---|---|---|
| K13 | Perubahan status yang diizinkan saat dikoreksi: hanya MS -> BTL (yang Anda sebut), atau juga MS -> TMS, BTL -> TMS/MS, TMS -> BTL/MS? | Izinkan semua turun/naik seperti verifikasi biasa, kecuali naik ke MS (naik ke MS tetap Admin Utama) |
| K14 | **Pengaman koreksi** (turun MS -> BTL berdampak nyata: data keluar dari `data_detail` dan BTL punya batas 2026-11-30, lewat batas otomatis menjadi TMS): audit sampel koreksi oleh Admin Utama (usul 20%), pemberitahuan ke kecamatan/Kemenag, dan/atau persetujuan koordinator sebelum berlaku ("dua mata") | Audit sampel 20% + koreksi tercatat lengkap; dua mata hanya bila Anda menghendaki |
| K15 | Bila pemeriksa mengoreksi data yang kemudian terlanjur dibayar/diproses di Tools Pembayaran: boleh? | Ditolak oleh sistem bila data sudah masuk batch pembayaran |


| No | Pertanyaan | Usul saya |
|---|---|---|
| K1 | ~~Ruang lingkup~~ **DIJAWAB:** seluruh hasil verifikasi termasuk BTL dan TMS (7.667 MS + 121 BTL + 3 TMS = **7.861 data per 2026-11-14 (bertambah seiring verifikasi tim)**) | (dilaksanakan; batch dipecah per tahap, mis. 500–1.000 data per batch) |
| K2 | ~~Pemeriksa~~ **DIJAWAB:** 34 verifikator aktif dikurangi 5 pimpinan = **29 pemeriksa** (termasuk `verif_uga_deba`); BTL/TMS khusus `verif_uga_deba` | (dilaksanakan) |
| K16 | Apakah `verif_uga_deba` **juga ikut mendapat bagian acak data Memenuhi Syarat** (selain 128 data BTL/TMS), atau hanya BTL/TMS? Bila ikut, beban akun itu lebih besar (≈ 7.733/29 ≈ 267 data MS + 128 BTL/TMS ≈ 395) dibanding yang lain (≈ 267). | Ikut dengan bagian MS yang LEBIH KECIL (mis. sisa dibagi rata sehingga total jumlah semua petugas seimbang), atau hanya BTL/TMS bila itu tugas khususnya |
| K3 | Pembagian: rata per orang (±1), distratifikasi per layanan | Setuju |
| K4 | **Batas waktu** per batch (tanggal) dan apa yang terjadi bila lewat | Batas per batch; sisa dapat dialihkan Admin ke petugas lain |
| K5 | **Jeda minimal** per data sebelum boleh disimpan | 20 detik |
| K6 | **Daftar periksa** (butir yang harus dicentang) — perlu dari Anda, per layanan atau seragam | Seragam dulu: berkas utama terbaca, NIK sesuai, foto/lokasi sesuai, status sesuai ketentuan |
| K7 | **Audit sampel**: persen dan pelaksana | 5%, Admin Utama |
| K8 | ~~Alur temuan~~ **DIJAWAB:** pemeriksa mengoreksi sendiri; Admin tidak memeriksa temuan. Perlu diputuskan: pengamanan koreksi (K14) dan apakah Admin boleh membatalkan koreksi | Koreksi langsung berlaku; Admin dapat membatalkan; audit sampel koreksi lebih tinggi |
| K9 | ~~Ikut dasar lembur?~~ **DIJAWAB:** ya, masuk data lembur dan mengikuti ketentuan lembur | (dilaksanakan: Total pekerjaan = verifikasi pertama + pemeriksaan ulang, jam kerja/luar jam kerja) |
| K10 | Aturan V1 (pemeriksa ≠ pemverifikasi pertama) | Setuju |
| K11 | Jika data diubah Admin sesudah dibagikan (sebelum diperiksa): tetap diperiksa atau ditarik dari batch? | Ditarik dari batch otomatis, tercatat |
| K12 | Bolehkah satu data diperiksa ulang lebih dari sekali (batch berikutnya)? | Boleh, antar batch berbeda, penghitungan per batch |

## 11. Risiko dan catatan
- **Beban kerja**: seluruh 7.861 data per 2026-11-14 (bertambah seiring verifikasi tim) akan memakan waktu lama (hasil verifikasi pertama tim ±400 data dalam dua hari); karena itu dibagi per batch dan kecepatan per jam dihitung dari batch percobaan.
- **Dampak koreksi turun status**: MS -> BTL mengeluarkan data dari `data_detail` (calon pembayaran) dan memulai tenggat BTL; salah koreksi merugikan penerima. Karena Admin tidak lagi memeriksa setiap temuan, pengaman K14, alasan wajib, jeda minimal, dan kemampuan Admin membatalkan koreksi menjadi penting.
- **Amandemen D9** adalah satu-satunya jalur verifikator mengubah status; harus dijaga uji yang membuktikan jalur lain tetap tertutup (percobaan merusak kode).
- **Kualitas pemeriksaan** bergantung pada pengaman bagian 6 dan audit sampel; tidak ada angka "otomatis benar".
- **Beban basis data (paket gratis)**: pembuatan batch memakai satu pernyataan massal; daftar tugas dipaginasi; agregat tetap satu kueri per pembukaan panel.
- **Data berubah saat batch berjalan**: ditangani K11; hasil tugas yang sudah selesai tidak pernah diubah.
- **Jejak hukum/audit**: seed, kriteria, daftar pemeriksa, waktu server, dan hasil audit tersimpan sehingga setiap angka dapat ditelusuri.
