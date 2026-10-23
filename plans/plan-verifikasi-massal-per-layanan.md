# Plan: Verifikasi Massal dengan pilihan layanan ("Verifikasi Semua" → pilih layanan tertentu atau semua layanan)

Tanggal: 2026-10-23 · Status: **K1–K8 DISETUJUI 2026-10-23 (K1–K4, K5=ya, K6, K8 ikut rekomendasi; K7=tidak). Sudah dikerjakan LOKAL & teruji; BELUM di-commit/deploy.**
Bahasa: Indonesia · Pola kerja: bertahap, lokal dulu, uji + review menyeluruh, deploy hanya atas perintah.

---

## 1. Permintaan dan tujuan

> "Tambahkan di tombol Verifikasi Semua berupa pilihan layanan dan semua layanan, jadi saya bisa bebas menentukan
> verifikasi massal untuk layanan tertentu." (Admin Utama)

**Tujuan:**
1. Admin Utama dapat memilih **satu layanan** atau **semua layanan** sebelum verifikasi massal.
2. Memilih "Semua layanan" **berperilaku sama persis** seperti tombol "Verifikasi Semua" sekarang (tidak ada kejutan).
3. Admin melihat **jumlah pasti** data yang akan diverifikasi *sebelum* menyetujui, dan angka itu **tidak bergeser diam-diam**
   bila ada data baru masuk di antara pratinjau dan persetujuan.
4. Tidak ada perubahan untuk peran lain, untuk verifikasi satuan, maupun untuk status selain "Proses Verifikasi".

---

## 2. Keadaan sekarang (sudah diperiksa di kode dan di data produksi)

**Tampilan** (`index.html:1068`, `app-transaksi.js:3172–3207`): tombol amber "Verifikasi Semua", hanya tampil untuk `UTAMA`
(`inisialisasiMenuLihatData`, baris 1277). Klik → modal konfirmasi umum (`konfirmasiAksi`) berisi teks tetap *"SEMUA data yang
masih berstatus 'Proses Verifikasi' … tanpa memandang filter yang sedang aktif"* → panggil `verifikasiMassalMemenuhiSyarat(token)`.
Setelah sukses, layar menandai **semua** baris lokal berstatus Proses Verifikasi menjadi Memenuhi Syarat (pembaruan optimistik),
lalu memuat ulang daftar dari server.

**Server** (`verifikasi.ts:260–293`): satu `UPDATE penerima … WHERE tahun = TAHUN_AKTIF AND (status = '' OR upper(trim(status)) =
'PROSES VERIFIKASI')` → `Memenuhi Syarat`, `keterangan = ''`, `tanggal_verifikasi = now()`, `diverifikasi_oleh = <admin>`. Hanya
`UTAMA`. Mengembalikan `{ sukses, jumlah }`. **Tidak ada** parameter layanan, **tidak ada** pratinjau jumlah, **tidak ada** log.

**Temuan lain yang relevan:**
- Sinkron `data_detail` **tidak** dipicu oleh aksi massal ini (verifikasi satuan juga tidak memicunya; hanya "Tandai Sudah Diperbaiki" dan cron)
  (`pastikanDataDetailTersinkron`, non-blocking). Data Memenuhi Syarat hasil massal baru masuk `data_detail` saat ada yang membuka
  "Data Detail" atau aksi lain yang memicu sinkron (dipakai Retur cari-NIK dan Pembayaran).
- Pembatalan cache: `verifikasiMassalMemenuhiSyarat → ['penerima','dashboard','data_detail']` tanpa id baris → semua klien lain
  memuat ulang penuh (sudah benar untuk aksi massal).
- `app-transaksi.js` sudah **3498 dari 3500 baris**. Penggantian handler 36 baris dengan pemanggil singkat justru **menghemat** baris.

**Data produksi (2026-10-23, tahun 2027, total 2.523 data):** 712 data menunggu verifikasi.

| Layanan | Menunggu | | Layanan | Menunggu |
|---|---:|---|---|---:|
| BILAL JENAZAH | 389 | | KHATIB JUMAT | 26 |
| PENGGALI KUBUR | 124 | | USTADZ | 16 |
| IMAM MASJID | 38 | | USTADZAH | 14 |
| NAZIR MASJID | 36 | | NAZIR MUSHOLLA | 6 |
| PETUGAS GEREJA KATOLIK | 28 | | PENGURUS VIHARA/KLENTENG/KUIL | 6 |
| PENGURUS GEREJA | 27 | | GURU MAGHRIB MENGAJI | 2 |

Semua nilai layanan di data ada di master layanan (tidak ada nilai aneh/warisan). Untuk Ustadz/Ustadzah, rekomendasi MUI semuanya
masih "Belum Diperiksa" (0 Sesuai, 0 Perlu Koreksi) — aturan MUI belum berdampak saat ini, tetapi desain harus siap (K4).

---

## 3. Rancangan tampilan

Tombol tetap di tempat yang sama. Klik tombol **membuka jendela pilihan** (bukan lagi langsung konfirmasi):

```
┌───────────────────────────────────────────────────────────────┐
│  Verifikasi Massal → Memenuhi Syarat                       ✕  │
├───────────────────────────────────────────────────────────────┤
│  Pilih layanan yang akan diverifikasi:                        │
│                                                               │
│   ( ) Semua layanan                                  712 data │
│   ( ) BILAL JENAZAH                                  389 data │
│   ( ) PENGGALI KUBUR                                 124 data │
│   ( ) IMAM MASJID                                     38 data │
│   ...  (hanya layanan yang masih ada data menunggu)           │
│                                                               │
│  Hanya data berstatus "Proses Verifikasi" yang diubah.        │
│  Status lain (Berkas Tidak Lengkap, Tidak Memenuhi Syarat,    │
│  Memenuhi Syarat) tidak disentuh. Filter di layar diabaikan.  │
│                                                               │
│                         [ Batal ]   [ Lanjut ]                │
└───────────────────────────────────────────────────────────────┘
          ↓ Lanjut (langkah 2, di jendela yang sama)
┌───────────────────────────────────────────────────────────────┐
│  Konfirmasi                                                   │
│  Akan menandai  38  data layanan  IMAM MASJID  menjadi        │
│  "Memenuhi Syarat".  Lanjutkan?                               │
│                    [ Kembali ]   [ Ya, Verifikasi 38 Data ]   │
└───────────────────────────────────────────────────────────────┘
```

- Daftar pilihan dibangun dari **data nyata di server** (bukan dari daftar master): hanya layanan yang masih punya data menunggu,
  lengkap dengan jumlahnya, diurutkan menurut jumlah terbanyak. Layanan tanpa data menunggu tidak muncul, jadi tidak ada pilihan "kosong".
- "Semua layanan" ada di paling atas dengan total. Pilihan awal: **tidak ada yang terpilih** (tombol Lanjut nonaktif) supaya klik
  tidak sengaja tidak langsung mengarah ke "semua".
- Label tombol: lihat K8 (usul "Verifikasi Massal").

---

## 4. Rancangan server (`verifikasi.ts`, kompatibel mundur)

### 4.1 Aksi baru, baca-saja: `ringkasanVerifikasiMassal(token)` — khusus `UTAMA`
Mengembalikan `{ sukses, total, perLayanan: [{ layanan, jumlah, muiPerluKoreksi }], batasWaktu }`.
- Predikat "menunggu" **identik** dengan UPDATE (`status = ''` atau `upper(trim(status)) = 'PROSES VERIFIKASI'`, `tahun = TAHUN_AKTIF`).
- `batasWaktu` = `now()` server pada saat pratinjau (lihat 4.3).
- Satu query `GROUP BY layanan`; 2.523 baris → tidak berarti beban.

### 4.2 `verifikasiMassalMemenuhiSyarat(token, layanan?, batasWaktu?, lewatiMuiKoreksi?)`
Parameter baru **opsional**; tanpa parameter = perilaku lama persis (semua layanan) sehingga frontend lama tetap bekerja.
- `layanan` kosong = semua; terisi = `AND upper(layanan) = upper(<layanan>)`. Nilai layanan yang tidak ada di data/master ditolak
  dengan pesan jelas (bukan 0 baris diam-diam).
- Hasil: `{ sukses, jumlah, layanan }`. Bila `jumlah = 0` → pesan "Tidak ada data … yang menunggu verifikasi" (bukan "Selesai! 0").

### 4.3 Pagar anti-geser (pratinjau ≠ eksekusi)
Antara pratinjau dan klik "Ya", petugas bisa menginput data baru. Tanpa pagar, data baru yang **belum pernah dilihat** admin ikut
terverifikasi dan jumlahnya berbeda dari yang disetujui. Maka eksekusi memakai `AND dibuat_at <= <batasWaktu dari pratinjau>`:
hanya data yang sudah ada saat pratinjau yang diverifikasi; data masuk sesudahnya tetap "Proses Verifikasi" untuk putaran berikutnya.
Bila `batasWaktu` tidak dikirim (klien lama) → tanpa pagar (perilaku lama). Jumlah akhir ditampilkan apa adanya.

### 4.4 Opsi Ustadz/Ustadzah (K4)
`lewatiMuiKoreksi = true` menambah `AND NOT (upper(layanan) IN ('USTADZ','USTADZAH','USTADZ/USTADZAH') AND status_rekomendasi_mui = 'PERLU_KOREKSI')`.
Pratinjau melaporkan `muiPerluKoreksi` per layanan supaya admin tahu berapa yang akan dilewati. Saat ini nilainya 0.

### 4.5 Sinkron `data_detail` (K6)
Setelah UPDATE berhasil dan `jumlah > 0`: `pastikanDataDetailTersinkron(TAHUN_AKTIF).catch(log)` — non-blocking, persis pola verifikasi
satuan. Idempoten (`ON CONFLICT DO NOTHING`); kegagalannya tidak menggagalkan respons.

### 4.6 Catatan/log (K5) — migrasi kecil opsional
Tabel baru `log_verifikasi_massal(id, waktu, username, layanan, jumlah, ids jsonb)`. Satu baris per aksi massal; `ids` menyimpan id
yang diubah (ribuan bilangan bulat, ringan). Manfaat: jejak siapa-kapan-apa, dan dasar untuk "batalkan verifikasi massal terakhir" bila
suatu saat diperlukan (tidak dibangun sekarang). Penulisan log di transaksi yang sama dengan UPDATE.

### 4.7 Pendaftaran & keamanan
- `index.ts`: daftarkan `ringkasanVerifikasiMassal` di `ALLOWED` (impor + objek).
- Hanya peran `UTAMA` (cek di server, bukan sekadar menyembunyikan tombol). Peran lain: pesan lama "Fitur ini khusus Admin Utama."
- Semua nilai masuk lewat parameter terikat (tanpa penyambungan string SQL).
- Eksekusi massal **tidak** boleh diulang otomatis oleh lapisan jaringan (tidak masuk daftar baca-aman); ringkasan boleh.

---

## 5. Rancangan frontend

| Berkas | Perubahan |
|---|---|
| `public/js/app-verifikasi-massal.js` (**baru**) | jendela pilihan + langkah konfirmasi, pemanggilan `ringkasanVerifikasiMassal` / `verifikasiMassalMemenuhiSyarat`, pembaruan optimistik terbatas pada layanan terpilih, perlindungan klik ganda, penanganan galat |
| `public/js/app-transaksi.js` | handler lama 36 baris diganti pemanggil ±4 baris (`window.djpmVerifMassal.buka()`); **berkas menyusut** |
| `public/js/app-pesan-periode.js` | tambahkan skrip baru ke `SKRIP_PER_PERAN.UTAMA` (dimuat hanya untuk Admin Utama) |
| `index.html` | label/judul tombol; (jendela dibuat dinamis oleh skrip, seperti modul lain) |
| `public/js/api-bridge.js` | tambahkan `ringkasanVerifikasiMassal` ke daftar baca-aman-diulang; **bukan** ke SWR (angka harus segar) |

Perilaku penting:
- **Pembaruan optimistik terbatas:** hanya baris lokal dengan layanan terpilih (dan `dibuat_at ≤ batas` bila diketahui) yang diubah, bukan
  semua baris Proses Verifikasi seperti sekarang. Lalu muat ulang resmi dari server (seperti sekarang) untuk menyamakan.
- Setelah sukses: toast "N data layanan X ditandai Memenuhi Syarat" (atau "semua layanan").
- Ringkasan gagal dimuat → pesan galat, tombol Lanjut tetap nonaktif (tidak ada eksekusi tanpa angka pasti).
- Esc / Batal / ✕ menutup tanpa efek. Selama eksekusi: tombol nonaktif, tidak bisa ditutup (menghindari dobel).
- Kait ke `app-transaksi.js` bersifat opsional: bila skrip gagal dimuat, klik menampilkan toast "Muat ulang halaman" (tombol tidak mati diam-diam).

---

## 6. Matriks kasus tepi

| Situasi | Hasil yang diharapkan |
|---|---|
| Pilih "Semua layanan" → Ya | sama dengan perilaku lama (semua Proses Verifikasi tahun aktif) |
| Pilih satu layanan → Ya | hanya layanan itu; layanan lain tidak berubah sama sekali |
| Tidak ada data menunggu | daftar kosong + pesan "Tidak ada data yang menunggu verifikasi"; tidak ada tombol aksi |
| Data baru masuk setelah pratinjau | **tidak** ikut diverifikasi (pagar `batasWaktu`); jumlah akhir = angka pratinjau (kecuali ada yang diubah admin lain) |
| Admin lain memverifikasi sebagian di antaranya | jumlah akhir lebih kecil dari pratinjau; toast memuat angka sebenarnya |
| Klik ganda "Ya" | tombol nonaktif; satu eksekusi saja; kalaupun terulang, putaran kedua mengubah 0 baris (idempoten) |
| Jaringan putus saat eksekusi | pesan galat + muat ulang daftar dari server (bisa saja sudah tersimpan) — tidak ada pembaruan optimistik yang menyesatkan |
| Peran selain Admin Utama memanggil API langsung | ditolak server |
| Layanan tidak dikenal dikirim | ditolak dengan pesan jelas |
| Ustadz/Ustadzah dengan "Perlu Koreksi" MUI | sesuai K4 (dilewati atau ikut, dan ditampilkan di pratinjau) |
| Data Berkas Tidak Lengkap / Tidak Memenuhi Syarat / sudah Memenuhi | tidak pernah disentuh |
| Periode input ditutup | tidak relevan (aksi admin; tidak memakai gerbang periode) |
| Layanan lama bernilai gabungan ("USTADZ/USTADZAH") muncul di data | muncul sebagai pilihan tersendiri di daftar (daftar dari data nyata) |
| Peramban lama (Chrome 104–110) | tanpa fitur JS/CSS baru; dipakai pola jendela yang sama dengan modul lain |

---

## 7. Rencana uji

**Server (PGlite + modul asli):** ringkasan = jumlah sebenarnya per layanan & total; eksekusi per layanan hanya mengubah layanan itu;
"semua" identik dengan perilaku lama (**regresi terhadap kode lama**); status selain Proses tidak berubah; huruf besar/kecil & spasi pada
status; pagar `batasWaktu` (baris yang dibuat sesudah batas tetap Proses); `lewatiMuiKoreksi`; layanan tak dikenal ditolak; non-UTAMA ditolak;
`jumlah = 0`; sinkron `data_detail` terpicu; log tercatat (K5); uji **mutasi** (rusakkan tiap aturan → uji harus merah).

**Layar (Chrome sungguhan + backend tiruan):** jendela terbuka dengan daftar & jumlah; Lanjut nonaktif sebelum memilih; langkah konfirmasi
menampilkan jumlah pasti; Batal/Esc tidak berefek; klik ganda; galat ringkasan; galat eksekusi; pembaruan optimistik hanya pada layanan
terpilih; muat ulang resmi; tombol hanya untuk Admin Utama; skrip gagal dimuat → toast; regresi visual layar lain identik; uji mutasi layar.

**Produksi (baca-saja + transaksi dibatalkan):** migrasi log (bila K5) lewat DO-block + `raise exception`; pernyataan UPDATE per layanan
diuji pada `id = -1`/rollback; uji asap fungsi `api` dengan sesi sementara (ringkasan sesuai angka basis data; eksekusi ditolak untuk non-admin).
**Eksekusi massal sungguhan di produksi tidak dijalankan oleh saya** — uji manual oleh Admin Utama (K: lihat 9).

---

## 8. Ukuran dan batasan teknis
- `app-transaksi.js`: berkurang (36 baris → ±4). `verifikasi.ts` 424 → ±520 baris (batas 3.500). Skrip baru ±250 baris.
- Tidak menambah query per permintaan untuk pengguna biasa; hanya Admin Utama yang memakai aksi baru.
- Tidak menambah koneksi database tetap (pool tidak berubah). Aksi dijalankan sekali per klik.

---

## 9. Tahapan, deploy, dan pembatalan

| Tahap | Isi | Reversibel? |
|---|---|---|
| T1 | server: aksi baru + parameter opsional + (opsional) migrasi log + uji server & mutasi — **lokal** | ya |
| T2 | frontend: skrip baru + hook + pemuat + uji layar & regresi — **lokal** | ya |
| T3 | review menyeluruh (fokus: angka pratinjau = angka eksekusi; tidak ada jalan "Semua" tanpa disengaja; tidak ada jebakan di jendela) | — |
| T4 | deploy atas perintah: `db push` (bila ada migrasi) → fungsi `api` (v80) → commit & push (Vercel) → uji asap produksi | tiap tahap terpisah |
| T5 | uji manual Admin Utama pada **satu layanan kecil** (mis. Guru Maghrib Mengaji, 2 data) lalu pantau log | — |

**Urutan deploy aman:** server dulu (parameter opsional → frontend lama tetap jalan), lalu frontend. **Pembatalan:** `git revert` commit
frontend → kembali ke tombol lama; fungsi dideploy ulang dari versi sebelumnya; tabel log boleh dibiarkan.

---

## 10. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Admin memverifikasi layanan yang salah | pratinjau jumlah + konfirmasi dua langkah menyebut nama layanan & jumlah; tidak ada pilihan awal |
| Data baru yang belum dilihat ikut terverifikasi | pagar `batasWaktu` (4.3) |
| Pembaruan optimistik menandai baris yang salah | dibatasi layanan + batas waktu; lalu disamakan dengan data server |
| Aksi massal tak bisa dibatalkan | log + daftar id (K5) memberi dasar pembatalan; uji manual di layanan kecil dulu |
| Regresi pada "Verifikasi Semua" lama | "Semua layanan" diuji identik dengan kode lama; parameter opsional |
| Skrip tidak termuat | kait opsional + toast; tombol tidak mati diam-diam |
| `app-transaksi.js` mendekati batas baris | justru berkurang |

---

## 11. Keputusan yang dibutuhkan (rekomendasi di kolom kanan)

| # | Pertanyaan | Rekomendasi |
|---|---|---|
| **K1** | Bentuk tampilan: jendela pilihan (bagian 3) atau menu turun pada tombol? | **Jendela pilihan** — memuat jumlah per layanan & konfirmasi dua langkah |
| **K2** | Daftar layanan dari data nyata (hanya yang punya data menunggu, dengan jumlah) atau dari master? | **Data nyata + jumlah** |
| **K3** | Pagar anti-geser (hanya data yang ada saat pratinjau yang diverifikasi)? | **Ya** |
| **K4** | Ustadz/Ustadzah berstatus "MUI: Perlu Koreksi": dilewati otomatis (ada kotak centang, default dicentang), ikut diverifikasi, atau tidak diatur? | **Kotak centang "Lewati yang Perlu Koreksi MUI", default dicentang** (saat ini 0 data) |
| **K5** | Catat setiap verifikasi massal di tabel log (butuh migrasi kecil)? | **Ya** |
| **K6** | Picu sinkron `data_detail` setelah verifikasi massal (seperti verifikasi satuan)? | **Ya** (mengubah perilaku kecil: data muncul di Data Detail/Retur lebih cepat) |
| **K7** | Tambah filter kecamatan juga? (di luar permintaan) | **Tidak sekarang**; desain tetap memungkinkan menambahkannya |
| **K8** | Label tombol: tetap "Verifikasi Semua" atau diganti "Verifikasi Massal"? | **"Verifikasi Massal"** (tidak lagi selalu berarti semua) |

---

## 12. Di luar lingkup (sengaja)
Verifikasi massal ke status selain Memenuhi Syarat (Berkas Tidak Lengkap / Tidak Memenuhi Syarat); fitur "batalkan verifikasi massal"
(hanya disiapkan dasarnya lewat log); perubahan aturan verifikasi satuan; perubahan ekspor; verifikasi massal untuk peran selain Admin Utama.
