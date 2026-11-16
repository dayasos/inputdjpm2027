# Plan: Verifikasi Awal dibagi rata otomatis (sama jumlah per verifikator, data baru terus dibagi)

> Versi **1.0 (draf)** · 2026-11-16 · Status: **RENCANA; belum ada kode.** Menunggu konfirmasi K1 (bagian 2) dan keputusan bagian 12 sebelum dikerjakan.
> Berlanjut dari `plans/plan-verifikasi-ulang.md` (pola paket tugas, pembagian acak berbenih, uji berlapis) dan `plans/plan-agregat-verifikator.md` (hitungan lembur tidak berubah).
> Prinsip proyek: bertahap, lokal dulu, mudah dibatalkan, migrasi/deploy/push hanya atas izin. Fitur baru ini **dapat dimatikan seketika** (saklar) sehingga kembali ke cara sekarang.

---

## 1. Masalah (data produksi 2026-11-16, hanya dibaca)

Verifikasi Awal sejak 12 Nov (1.259 data oleh 27 akun) sangat timpang karena **petugas memilih sendiri** data yang dikerjakan:

| Ukuran | Nilai |
|---|---|
| Tertinggi → terendah (akun aktif) | 106, 103, 90, 87, 76 … 16, 15, 15, 14, 1 (jarak ±7 kali) |
| Rata-rata 28 akun layak | ±44 |
| Lima teratas | 462 data = 37% seluruh pekerjaan |
| Sepuluh terbawah | 168 data = 13% |
| Tanpa satu pun | `verif_bungamin_surbakti`, `verif_titis_oktivani` (selain pimpinan dan `verif_uga_deba`) |
| Pola | 7 akun tepat 50 data (kemungkinan jatah manual) |
| Antara yang sama-sama aktif 3 hari | 19 sampai 87 data (jadi bukan semata soal hari kerja) |

Antrean menunggu: **1.714 data**, dari itu **1.603 = Guru Sekolah Minggu (821) + Guru Maghrib Mengaji (782)**, tertahan sejak 26 Okt (sebelumnya ditugaskan per tim: Tim I khusus GMM, Tim II khusus GSM). Layanan lain hanya ±110. Data masuk 60–420 per hari, jadi pembagian harus **terus-menerus**.

## 2. Keputusan user (2026-11-16)

| No | Keputusan | Catatan |
|---|---|---|
| K1 | Dulu verifikasi ditugaskan per tim (Tim I = GMM, Tim II = GSM) | **PERLU KONFIRMASI** — lihat bagian 3 |
| K2 | **Adil = sama jumlah** | dasar seluruh rancangan |
| K3 | 28 akun (di luar 5 pimpinan dan `verif_uga_deba`); koordinator ikut | disetujui |
| K4 | Pembagian **otomatis**, tetap dengan kaidah sama jumlah (K2) | |
| K5 | ~~Data yang tak dikerjakan kembali ke antrean otomatis + tombol alihkan~~ **DITARIK user 2026-11-16: data TETAP di akun verifikator; keterlambatan ditangani user secara verbal.** Tidak ada pengembalian otomatis, tidak ada tombol alihkan, tidak ada batas hari | berlaku |
| K6 | Verifikator tetap melihat semua data di Lihat Data seperti sekarang | hanya **memberi hasil** dibatasi ke data miliknya |

Dari hasil verifikasi ulang: hitungan Verifikasi Awal/lembur **tidak berubah** (hasil pertama oleh verifikator, 1 kali per data); istilah baku **Verifikasi Awal** dan **Verifikasi Ulang**.

## 3. K1 bertentangan dengan K2 bila dibaca "tim tetap berlaku" (perlu konfirmasi)

Bila Tim I hanya GMM dan Tim II hanya GSM, beban per akun **tidak mungkin sama jumlah**:

| Skema | Tim I (8 akun) | Tim II (6 akun) | Tim III + IV (14 akun) |
|---|---|---|---|
| Tim tetap (K1 berlaku) | GMM 782 → **±98** per akun | GSM 821 → **±137** per akun | hanya ±110 data lain → **±8** per akun |
| Sama jumlah (K2) | 61–62 | 61–62 | 61–62 |

**Bacaan saya:** K1 menjelaskan *mengapa* GMM/GSM menumpuk (hanya ditugaskan ke dua tim), dan keputusan sekarang adalah **sama jumlah untuk 28 akun tanpa kekhususan tim**. Rencana ini memakai bacaan itu. Bila ternyata kekhususan tim tetap dikehendaki, ada pilihan: (a) tim khusus tetap tetapi sama jumlah dicapai dengan menambah bagian layanan lain ke Tim I/II (tidak mungkin: layanan lain hanya ±110), atau (b) "afinitas lunak" (utamakan tim itu bila beban sama), yang tetap dapat ditambahkan nanti tanpa mengubah rancangan.

## 4. Definisi dan aturan inti

**A1. Kolam.** Data tahun aktif dengan status "Proses Verifikasi" (atau kosong, sama dengan predikat verifikasi yang ada) dan **belum punya tugas aktif**.
**A2. Penerima tugas.** Akun VERIFIKATOR aktif, kecuali daftar pengecualian server (`verif_ronald_fredy`, `verif_fery_suhery`, `verif_khoiruddin`, `verif_amy_pratiwi`, `verif_netty_abdiati`, dan `verif_uga_deba` yang khusus BTL/TMS verifikasi ulang). Ditegakkan SERVER; tidak dapat diubah dari layar.
**A3. "Jumlah" = tugas yang dibebankan sejak fitur aktif, dikurangi yang dikembalikan** (bukan yang selesai; petugas lambat tidak otomatis mendapat lebih sedikit). Data baru selalu ke akun dengan **jumlah terkecil** → selisih maksimal 1 antar 28 akun, kapan pun.
**A4. Pemecah seri.** Bila jumlah sama: akun dengan bagian layanan itu paling sedikit (agar layanan "berat" seperti GMM/GSM tersebar adil), lalu acak berbenih (benih dicatat; hasil dapat dihitung ulang).
**A5. Urutan.** Data dibagi menurut waktu masuk (yang lama dulu).
**A6. Akun baru / kembali aktif.** Mulai dari jumlah terkecil saat itu (tidak membanjiri satu akun hingga "menyusul").
**A7. Satu tugas aktif per data** (dijaga indeks unik sebagian di basis data).
**A8. Pemberian hasil.** Verifikator hanya boleh memberi hasil pada data **yang ditugaskan kepadanya** (server menolak lainnya dengan pesan jelas). Admin Utama tetap boleh memverifikasi data apa pun; itu menutup tugasnya sebagai "diselesaikan Admin".
**A9. Penutupan tugas.** Atomik dalam transaksi pemberian hasil; bila data keluar dari "Proses Verifikasi" lewat jalur lain (Admin, edit, hapus) tugas ditutup otomatis (penarikan malas, pola yang sama dengan verifikasi ulang).
**A10. (DIBATALKAN 2026-11-16) Pengembalian/pengalihan.** Tugas menetap pada akun penerimanya sampai selesai; tidak ada batas hari, pengembalian otomatis, maupun tombol alihkan. Keterlambatan ditangani user secara verbal. Konsekuensi yang perlu diketahui: tugas akun yang dinonaktifkan/berhalangan panjang tetap tertahan; jalan keluar yang sudah ada: Admin Utama boleh memverifikasi data apa pun (A8). Bila kelak perlu, pengalihan dapat ditambahkan tanpa mengubah rancangan.
**A11. Saklar.** Pembagian dapat dinyalakan/dimatikan Admin. Mati = verifikator kembali memilih sendiri seperti sekarang; tugas dan riwayat tersimpan.

## 5. Model data (migrasi baru, belum dijalankan)

Tabel baru, RLS aktif tanpa kebijakan, hak anon/authenticated dicabut, pola yang sama dengan verifikasi ulang:
- `tugas_verifikasi_awal` — `penerima_id`, `tahun`, `akun_id`, `layanan`, `ditugaskan_pada`, `jatuh_tempo`, `status` (AKTIF | SELESAI | SELESAI_ADMIN | DIKEMBALIKAN | DITUTUP_DATA_BERUBAH), `selesai_pada`, `hasil_status`, `dikembalikan_pada`, `alasan`, `sapuan_id`. **Indeks unik sebagian** `(penerima_id, tahun) where status = 'AKTIF'`. Pemicu pagar: baris yang sudah selesai tidak boleh diubah atau dihapus.
- `sapuan_pembagian_awal` — log tiap pembagian (waktu, jenis OTOMATIS/MANUAL/PRATINJAU, oleh, benih, jumlah dibagi/dikembalikan/ditutup, ringkasan per akun).
- `pembagian_awal_akun` — `akun_id`, `dasar` (jumlah awal, lihat A6).
- Pengaturan di tabel `setelan` yang sudah ada: `verif_awal_aktif`, `verif_awal_hari_kembali`.

Aturan teknis yang sudah terbukti sebelumnya (jangan diulang salahnya): jsonb ditulis dengan `trx.json()`, **bukan** `JSON.stringify(x)::jsonb`; penjaga uji statis sudah ada. Uji Postgres sungguhan (PGlite) wajib memakai adaptor yang meniru `sql.json`.

## 6. Algoritme (modul murni, diuji ketat)

`bagiTugasAwal({ benih, kolam (urut waktu masuk), akun: [{ username, jumlah, perLayanan }] })` → daftar penugasan. Pada tiap data: pilih akun dengan (jumlah, bagian layanan) terkecil; seri diacak berbenih; perbarui penghitung di memori. Sifat yang dibuktikan dengan uji acak dan pembanding sederhana:
1. Setelah pembagian, selisih jumlah antar akun ≤ 1 (dari keadaan seimbang), baik dibagi sekaligus maupun satu per satu.
2. Pengecualian tidak pernah menerima; akun nonaktif tidak menerima.
3. Deterministik untuk benih dan masukan yang sama; hasil dapat dihitung ulang (tombol cek).
4. Akun baru tidak membanjir; pengembalian menurunkan jumlah pemilik semula dan tidak kembali ke pemilik semula bila ada pilihan.
5. Per layanan: selisih bagian layanan antar akun kecil (batas diukur dari data GMM/GSM nyata).
Simulasi awal (data hari ini): 1.714 data / 28 akun = **61,2** → 6 akun 62 dan 22 akun 61.

## 7. Penyapu (otomatis)

Satu fungsi server `jalankanPembagianAwal` (satu kunci advisory agar tak berbenturan), langkahnya: (1) tutup tugas yang datanya sudah tak "Proses Verifikasi"; (2) kembalikan tugas lewat jatuh tempo; (3) bagi data tanpa tugas. Dipicu:
- **pg_cron + pg_net tiap 10 menit** dengan rahasia dari Vault (pola `sinkronDataSheet2026` yang sudah berjalan; aksi lewat jalur `_secret`, bukan aksi publik);
- **oportunistik** saat petugas membuka panelnya atau Admin menekan "Bagikan sekarang" (dibatasi 1 kali per menit);
- data baru menunggu paling lama sekitar 10 menit. Beban per sapuan kecil (kueri berindeks; saat tak ada data baru hanya beberapa kueri ringan). Catatan: log lama menunjukkan pekerjaan terjadwal yang berat memperlambat fungsi `api`; sapuan ini harus diukur (EXPLAIN pada data nyata, termasuk jebakan partisi 2026).

## 8. Aksi server baru (daftar-putih sesuai peran; cakupan ditentukan server)

**Admin Utama:** `getStatusPembagianAwal`, `aturPembagianAwal` (saklar, hari kembali), `pratinjauPembagianAwal` (tanpa menulis), `bagiSekarangAwal`, `alihkanTugasAwal` (satu data atau semua milik seorang petugas), `cekPembagianAwal` (hitung ulang dari benih), `unduhRekapPembagianAwal` (Excel; berisi NIK utuh seperti Excel pembagian ulang; khusus Admin Utama).
**Verifikator:** `getTugasAwalSaya` (hanya miliknya; halaman 50; sisa, selesai, jatuh tempo).
**Diubah:** `verifikasiSatuData` — untuk VERIFIKATOR memeriksa kepemilikan tugas dan menutupnya dalam transaksi yang sama (saat saklar menyala).

## 9. Rancangan layar (mockup dulu, sebelum dikodekan)

- **Petugas:** tombol melayang **"Tugas Awal · sisa N"** → daftar tugas (nama, layanan, kelurahan, sejak kapan, sisa hari) → **Buka** membuka Detail data yang sudah ada dengan form verifikasi yang biasa (alasan cepat dan lainnya tidak berubah). Pada data yang bukan miliknya, tombol hasil dinonaktifkan dengan pesan "ditugaskan kepada &lt;nama&gt;" (Lihat Data tetap seperti sekarang, K6).
- **Admin:** menu **Pembagian Awal**: saklar dan hari kembali, tabel per petugas (ditugaskan, selesai, dikembalikan, sisa, jatuh tempo terdekat), "Bagikan sekarang", "Alihkan", "Cek pembagian", "Unduh Excel", riwayat sapuan.
- **Koordinator:** kemajuan timnya (angka saja) di panel agregat.
- Ponsel 320–390 px, mode terang/gelap, modul dimuat malas per peran (jangan menambah isi ke `index.html` dan `app-transaksi.js`).

## 10. Agregat dan Excel

Hitungan Verifikasi Awal dan lembur **tidak berubah**. Ditambah: kolom "ditugaskan / sisa" Verifikasi Awal di panel dan Excel hasil kerja (angka saja), serta Excel pembagian awal (sheet Per Petugas, Per Data dengan NIK utuh sebagai teks, Aturan; gaya per sel tidak dipasang pada ribuan baris karena batas CPU ±2 detik; diukur dengan ExcelJS asli).

## 11. Tahapan (semua lokal dulu, tiap tahap dapat dibatalkan)

| Tahap | Isi | Dampak produksi |
|---|---|---|
| T0 | Konfirmasi K1 dan putuskan bagian 12 | tidak ada |
| T1 | Migrasi 3 tabel + pagar + RLS; saklar bawaan **MATI** | migrasi (izin Anda) |
| T2 | Modul algoritme + uji sifat acak dan perusakan kode | lokal |
| T3 | Penyapu + aksi server + gerbang `verifikasiSatuData`; uji tiruan dan **Postgres sungguhan** (termasuk jsonb gaya produksi) | lokal |
| T4 | Mockup layar → layar petugas dan Admin (uji Chrome tiap peran dan ponsel) | lokal |
| T5 | Agregat dan Excel; uji ExcelJS asli, ukur CPU | lokal |
| T6 | Tinjauan menyeluruh; EXPLAIN kueri pada data nyata (hanya baca); beban 28 petugas serentak | lokal |
| T7 | Penayangan bertahap: migrasi → deploy (saklar MATI) → push → cron → **pratinjau Admin atas 1.714 data nyata** → saklar **NYALA** → pengumuman ke petugas (WA oleh Anda) → pantau log dan angka 1–2 hari | produksi (izin Anda) |
| Mundur | Saklar MATI: seketika kembali memilih sendiri; tugas dan riwayat tersimpan | — |

## 12. Keputusan yang masih terbuka

| No | Pertanyaan | Usul saya |
|---|---|---|
| P1 | K1: kekhususan tim dihapus (sama jumlah untuk 28 akun tanpa tim)? | **DIPUTUSKAN user 2026-11-16: dihentikan.** Cek ketersediaan: butuh 1.725 data agar 27 akun lain = 106 (Sugito), tersedia 1.715 → hasil 105–106 |
| P2 | ~~Batas pengembalian N hari~~ | **GUGUR (K5 ditarik 2026-11-16)** |
| P3 | Pembagian awal atas 1.714 data nyata: sekaligus (61–62 per petugas) atau bertahap per layanan | Sekaligus setelah pratinjau, lalu pantau; GMM/GSM tersebar rata per akun |
| P4 | Petugas cuti/berhalangan | Tugas tetap di akunnya (K5 ditarik); user menegur verbal; Admin Utama masih bisa memverifikasi data apa pun |
| P5 | Koordinator tetap menerima jatah penuh | Ya (K3) |

## 13. Risiko dan catatan

- **Pemberian hasil dikunci per kepemilikan**: bila ada bug, verifikator tak bisa bekerja. Mitigasi: saklar, uji gerbang yang ketat, tahap pratinjau, Admin tidak terikat.
- **Beban awal besar** (data hari ini: akun rendah menerima sampai ±91 tugas sekaligus): bisa terasa menumpuk; karena pengembalian/pengalihan ditiadakan (K5 ditarik), petugas lambat menahan data sampai ditegur verbal. Panel Admin menampilkan sisa per petugas agar mudah dipantau.
- **Jalur lain yang mengubah status** (Admin, edit, hapus, "Tandai Sudah Diperbaiki", batas waktu perbaikan otomatis): ditangani penutupan malas; harus diuji satu per satu.
- **Kinerja penyapu pada paket gratis**: diukur sebelum penayangan; jadwal 10 menit dapat dilonggarkan.
- **Kejujuran angka**: "sama jumlah" menyamakan beban yang diberikan, bukan hasil; petugas lambat memikul tunggakan sampai selesai (A10 dibatalkan). Ini sesuai K2.

> **Revisi 2026-11-16 (K5 ditarik):** bagian lain di atas yang menyebut pengembalian, jatuh tempo, status DIKEMBALIKAN, `alihkanTugasAwal`, `verif_awal_hari_kembali`, langkah (2) penyapu, dan tombol "Alihkan" dianggap **DIHAPUS dari lingkup**; kolom/aksi itu tidak dibuat.

---

## Pembaruan 2026-11-16 (sore): keputusan pimpinan, rancangan layar baru, status pengerjaan

- **Pimpinan setuju** (disampaikan user). Pengerjaan dimulai, semua LOKAL (belum ada migrasi/deploy/push).
- **Layar diganti tab** (usul user): verifikator mendapat tab **Verifikasi Awal** dan **Verifikasi Ulang** di nav, di samping Lihat Data. Isi tab = tabel Lihat Data yang SAMA (kolom, filter, pencarian, tombol) yang dibatasi ke data tugasnya lewat kait `window.djpmLolosTugas` (3 baris di `saringDanTampilkanTabel`, app-transaksi.js). Awal: tombol **Detail** (modal Detail biasa). Ulang: tombol **Periksa** membuka panel pemeriksaan berkas (app-tugas-ulang.js) langsung ke tugas yang diklik (Detail biasa tidak punya klik/centang berkas). Tombol melayang Tugas Ulang dihapus; lencana hasil kerja tetap. Modul: `public/js/app-tab-tugas.js` (VERIFIKATOR), `public/js/app-pembagian-awal-admin.js` (UTAMA).
- **Server**: `_shared/pembagianAwal.ts` (algoritme), `domains/verifikasiAwal.ts` (penyapu, aksi Admin/petugas), gerbang di `verifikasi.ts`, migrasi `20261116120000_verifikasi_awal_bagi_rata.sql` (saklar bawaan MATI, pg_cron 10 menit). Predikat menunggu memakai nilai persis agar memakai indeks (EXPLAIN data nyata: 1.627 ms -> 13 ms).
- **Uji**: pembagian-awal (9), server-verifikasi-awal-pg (12, Postgres sungguhan), tab-tugas-murni (9), layar/verifikasi-awal (Chrome), regresi seluruh uji Node + layar verifikasi-ulang lulus; mutan kode (server 8/8, layar 5/5 tertangkap).
- **Tidak dikerjakan (di luar lingkup disepakati)**: Excel pembagian awal, tombol "Cek pembagian dari benih" (benih dicatat di sapuan_pembagian_awal), penguncian tombol status di Detail untuk data bukan tugasnya (server sudah menolak dengan pesan jelas), kolom ditugaskan/sisa di agregat.
- **Penayangan (menunggu perintah "tayangkan")**: migrasi -> deploy fungsi api (saklar MATI) -> push (frontend) -> Admin: Pembagian Awal -> Lihat pratinjau -> Nyalakan -> pengumuman WA ke verifikator -> pantau log.

### Hasil tinjauan ulang (2026-11-16, malam) -> perbaikan sebelum penayangan
1. **Pimpinan/akun khusus bebas gerbang** (`bebasGerbangAwal`): tanpa ini 5 pimpinan + verif_uga_deba kehilangan kemampuan memverifikasi saat saklar NYALA (mereka tak punya tugas). Data yang mereka verifikasi, tugasnya ditutup penyapu (DITUTUP).
2. **Titik awal dihitung ulang tiap saklar dinyalakan** (historis dikurangi yang selesai lewat tugas): verifikasi pilihan sendiri selagi MATI ikut terhitung. Pratinjau saat MATI = hasil penyalaan.
3. `::uuid` eksplisit pada pencocokan akun di gerbang dan daftar tugas.
4. Terkonfirmasi di produksi (hanya baca): setelan(key pk, value not null), trigger siaran realtime pada setelan (klien hanya memeriksa status akses; aman), pg_cron/pg_net tersedia, EXPLAIN kolam 13 ms.
- **Batas yang diketahui**: akun yang sudah di atas rata-rata (mis. karena memilih sendiri) tidak menerima tugas sampai yang lain menyusul, dan jumlahnya tidak bisa diturunkan; tugas yang datanya diverifikasi Admin/pimpinan tetap terhitung milik pemegang tugas.
