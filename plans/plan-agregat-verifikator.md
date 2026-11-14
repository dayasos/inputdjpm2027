# Plan: Agregat Hasil Kerja Verifikator (per verifikator, per tim, seluruh tim, dan pembagian jam kerja / luar jam kerja untuk lembur)

> Versi **1.2** · 2026-11-12 · Status: **JAWABAN K1–K10 SUDAH DITERIMA dan D9 DISETUJUI (lihat bagian 9). Pengerjaan lokal dimulai (cabang `feat/agregat-verifikator`); belum ada migrasi/commit/push/deploy.**
> Prinsip proyek: bertahap, lokal dulu, mudah dibatalkan, migrasi/push/deploy hanya atas izin. Berlanjut dari `plans/plan-tim-verifikator.md` (role VERIFIKATOR, tabel `riwayat_verifikasi`, badge "Verifikasi saya").
> Rancangan tampilan (UI/UX) untuk dilihat: lihat halaman mockup yang dikirim bersama plan ini; ringkasannya ada di bagian 6.

---

## 1. Ketentuan dari Anda

1. Verifikator hanya melihat agregat hasil verifikasinya **sendiri**.
2. **Koordinator Tim** melihat agregat seluruh hasil verifikasi dari verifikator di **timnya**.
3. **Admin Utama** melihat agregat **semua tim**.
4. Pekerjaan tim verifikator akan **dihitung lembur**, jadi agregat menampilkan jumlah data yang diverifikasi pada **jam kerja** dan **di luar jam kerja**.
5. Rancangan UI/UX ditampilkan untuk Anda lihat.
6. Plan ditulis dalam Bahasa Indonesia.

Data yang Anda berikan:

| Tim | Koordinator (username) |
|---|---|
| Tim I | `verif_ronald_fredy` |
| Tim II | `verif_bungamin_surbakti` |
| Tim III | `verif_reynold_sianturi` |
| Tim IV | `verif_evi_prasanti` |

| Hari | Jam kerja |
|---|---|
| Senin – Kamis | 08.00 – 16.30 |
| Jumat | 08.00 – 17.00 |

Anggota tiap tim mengikuti daftar yang sudah Anda kirim (Tim I 8 orang, Tim II 7, Tim III 8, Tim IV 8; total 31 akun).

---

## 2. Kondisi sekarang (fakta, sudah dicek 2026-11-12)

- Tabel `riwayat_verifikasi` sudah ada di produksi dan mencatat satu baris **setiap kali status verifikasi sebuah data diberikan**: waktu (`waktu`, otomatis dari jam server database), `penerima_id`, `status_lama`, `status_baru`, `keterangan`, `oleh` (username huruf besar), dan `sumber` (`SATU`, `DIPERBAIKI`, `MASSAL`, `OTOMATIS`). Saat ini terisi **11 baris dari 2 pemverifikasi**, yang pertama tercatat 2026-11-12 pukul 12.43 UTC (19.43 WIB).
- Badge "Verifikasi saya" yang sudah tayang menghitung dari kolom `penerima.diverifikasi_oleh`, yaitu pemverifikasi **terakhir** sebuah data. Kolom ini tidak menyimpan **kapan** tiap kejadian terjadi dan tidak menyimpan kejadian lama yang tertimpa. Karena itu **tidak bisa dipakai untuk memisahkan jam kerja dan luar jam kerja**; sumber yang tepat adalah `riwayat_verifikasi`.
- Penulisan `riwayat_verifikasi` sekarang bersifat *non-blocking* (bila gagal hanya masuk log, verifikasi tetap sukses). Untuk angka lembur ini perlu diperketat (lihat D8).
- Verifikasi yang dilakukan **sebelum** tabel riwayat ada (oleh Admin Utama) tidak punya catatan waktu per kejadian, jadi tidak ikut agregat. Itu sesuai catatan Anda: fitur ini menghitung data setelah akun verifikator tayang.
- Role VERIFIKATOR sudah ada; **konsep tim dan koordinator belum ada** di aplikasi (kolom Tim I–IV hanya ada di daftar Anda).

---

## 3. Keputusan desain (rekomendasi saya; yang bertanda ★ perlu jawaban Anda di bagian 9)

**D1. Sumber data = `riwayat_verifikasi`.** Agregat dihitung dari kejadian, bukan dari kolom `diverifikasi_oleh`.

**D2 (K1 dijawab Anda). Satuan hitung = data yang diberi hasil verifikasi oleh verifikator, dihitung 1 kali per data.**
Tugas verifikator hanya **memberi hasil verifikasi** (Memenuhi Syarat, Berkas Tidak Lengkap, Tidak Memenuhi Syarat) pada data yang masih menunggu. Karena itu:
- Satu data yang diberi hasil oleh seorang verifikator dihitung **1**, walaupun data itu dibuka berkali-kali. Membuka data tidak mencatat apa pun; yang dicatat hanya saat hasil verifikasi disimpan.
- Yang dihitung hanya **pemberian hasil pertama** (status data sebelumnya "Proses Verifikasi" atau kosong).
- **Tidak dihitung:** "Tandai Sudah Diperbaiki", mengembalikan data ke Berkas Tidak Lengkap setelah perbaikan, pemeriksaan ulang setelah berkas diperbaiki, dan perubahan status lain pada data yang sudah punya status. Semua itu pekerjaan Admin Utama.
- Tidak ada lagi angka "data unik" sebagai pembanding: angkanya sama dengan jumlah data karena setiap data hanya dihitung sekali.

**D3 ★. Penentuan jam kerja.** Memakai **WIB**, berdasarkan **waktu server menyimpan** verifikasi (bukan saat halaman dibuka). Aturan:
- Senin–Kamis: jam kerja dari 08.00.00 sampai **sebelum** 16.30.00.
- Jumat: jam kerja dari 08.00.00 sampai **sebelum** 17.00.00.
- Selain itu = **luar jam kerja**, termasuk Sabtu, Minggu, dan **tanggal merah**.
- Istirahat siang tidak dikecualikan (Anda tidak menyebutkannya); tetap dihitung jam kerja.

**D4. Tim dan koordinator** disimpan di tabel baru `tim_verifikator` (satu baris per akun: tim, apakah koordinator). Koordinator **tetap role VERIFIKATOR** (tetap memverifikasi seperti anggota); statusnya sebagai koordinator hanya menambah hak **melihat agregat timnya**.

**D5. Jam kerja dan tanggal merah disimpan di tabel**, bukan di kode, supaya bisa diubah tanpa deploy ulang: `jam_kerja_verifikasi` (hari, mulai, selesai) dan `hari_libur_verifikasi` (tanggal, keterangan). Awalnya saya isi dari data Anda; tanggal merah 2026–2027 saya isi dari daftar libur nasional dan Anda koreksi.

**D6. Hak melihat dipaksakan di server**, bukan di layar. Server menentukan cakupan dari token sesi; browser **tidak** mengirim "username siapa" atau "tim mana" sebagai penentu hak. Layar hanya menampilkan apa yang dikirim server.

**D7. Yang tidak dihitung sebagai hasil kerja tim:** semua kejadian selain pemberian hasil pertama oleh verifikator, yaitu verifikasi massal (`MASSAL`), penurunan otomatis sistem (`OTOMATIS`), perbaikan (`DIPERBAIKI`), dan perubahan status atas data yang sudah berstatus. Pekerjaan Admin Utama ditampilkan **terpisah** (baris "Admin Utama, di luar tim") hanya sebagai informasi.

**D8. Ketahanan data lembur (prasyarat).** Karena angka dipakai untuk lembur:
- Penulisan riwayat untuk verifikator dijadikan **satu transaksi** dengan pembaruan status data: bila riwayat gagal tertulis, verifikasi ikut dibatalkan (pengguna melihat pesan gagal dan mencoba lagi). Tidak ada lagi verifikasi yang sukses tetapi tidak terhitung.
- `riwayat_verifikasi` dijadikan **hanya-tambah** (append-only): tidak ada aksi aplikasi yang mengubah atau menghapusnya.
- Agregat **tidak memuat data pribadi penerima** (tanpa nama, NIK, atau alamat). Hanya angka dan tanggal.

**D9 ★ (usul pengetatan hak, perlu persetujuan Anda). Verifikator hanya boleh memberi hasil pada data yang masih "Proses Verifikasi".**
Saat ini akun Verifikator juga bisa menekan "Tandai Sudah Diperbaiki" dan mengubah status data yang sudah berstatus, sedangkan Anda menetapkan bahwa itu pekerjaan Admin Utama. Supaya aturan itu **ditegakkan sistem** (bukan hanya kesepakatan), usul saya:
- Verifikator: hanya dapat memberi hasil pada data berstatus "Proses Verifikasi" atau kosong. Pada data yang sudah berstatus, tombol hasil tidak tampil dan server menolak ("Data ini sudah memiliki hasil verifikasi. Perubahan hanya oleh Admin Utama").
- "Tandai Sudah Diperbaiki" menjadi khusus Admin Utama.
- Admin Utama tidak berubah (tetap dapat semuanya).
- Akibatnya hitungan menjadi sederhana dan tidak bisa digelembungkan: satu data hanya bisa diberi hasil satu kali oleh verifikator.
- Bila verifikator salah menekan status, ia meminta Admin Utama mengoreksi (tidak dihitung ulang). Bila Anda ingin verifikator boleh mengoreksi sendiri, perubahan itu **tidak dihitung** juga, dan aturan "hanya pemberian pertama" tetap berlaku di kueri agregat.
Konsekuensi lain: jika dua verifikator membuka data yang sama, yang lebih dulu menyimpan yang dihitung; yang kedua mendapat pesan konflik yang sudah ada ("status sudah diubah") dan tidak mendapat hitungan.

---

## 4. Model data (migrasi, belum dijalankan)

```sql
-- Tim dan koordinator (satu baris per akun verifikator)
create table public.tim_verifikator (
  akun_id     uuid primary key references public.akun(id),   -- tipe mengikuti akun.id
  tim         text not null check (tim in ('I','II','III','IV')),
  koordinator boolean not null default false
);
-- Satu koordinator per tim
create unique index tim_verifikator_satu_koordinator on public.tim_verifikator (tim) where koordinator;

-- Jam kerja per hari (isodow: 1=Senin ... 7=Minggu); hari tanpa baris = luar jam kerja
create table public.jam_kerja_verifikasi (
  isodow smallint primary key check (isodow between 1 and 7),
  mulai  time not null,
  selesai time not null              -- batas atas TIDAK termasuk (selesai 16:30 -> 16:29:59 masih jam kerja)
);
insert into public.jam_kerja_verifikasi values (1,'08:00','16:30'),(2,'08:00','16:30'),(3,'08:00','16:30'),(4,'08:00','16:30'),(5,'08:00','17:00');

-- Tanggal merah / libur: seluruh hari = luar jam kerja
create table public.hari_libur_verifikasi (
  tanggal date primary key,
  keterangan text not null default ''
);
```

Semua tabel baru: RLS aktif tanpa policy, hak `anon` dan `authenticated` dicabut (pola yang sama dengan `riwayat_verifikasi`). Migrasi tidak mengubah tabel lama. Pengisian awal `tim_verifikator` memakai 31 username yang sudah ada.

Pengaman riwayat: `revoke update, delete on riwayat_verifikasi` dari peran aplikasi bila peran itu bukan pemilik tabel; bila peran yang dipakai fungsi adalah pemilik (`postgres`), pagar hanya di kode (tidak ada aksi yang mengubah/menghapus) ditambah pemicu yang menolak `update/delete`.

---

## 5. Server (Edge Function `api`)

### 5.1 Aksi baru: `getAgregatVerifikasi(token, filter)`
- `filter`: `{ dari, sampai }` (tanggal WIB, `sampai` inklusif; batas rentang dipagari, mis. maksimal 93 hari) dan khusus Admin Utama `{ tim }` opsional ("semua" atau satu tim).
- **Cakupan ditentukan server:**

| Peran penanya | Yang dikembalikan |
|---|---|
| VERIFIKATOR biasa | hanya dirinya sendiri |
| VERIFIKATOR koordinator Tim X | seluruh anggota Tim X (termasuk dirinya) |
| UTAMA | semua tim, per tim dan per orang, ditambah baris "Admin Utama, di luar tim" |
| peran lain | ditolak |

- Aksi ditambahkan ke daftar-putih Verifikator (`AKSI_VERIFIKATOR`, jadi 23 aksi) dan ke `ALLOWED`; pemeriksaan peran juga di dalam fungsi (lapis kedua).

### 5.2 Bentuk hasil (ringkas)
```
{ sukses, cakupan: 'SAYA' | 'TIM' | 'SEMUA', rentang: { dari, sampai },
  ringkasan: { total, jamKerja, luarJamKerja, memenuhiSyarat, berkasTidakLengkap, tidakMemenuhiSyarat },
  perOrang:  [ { username, namaLengkap, tim, koordinator, total, jamKerja, luarJamKerja, ms, btl, tms } ],
  perTim:    [ { tim, anggota, total, jamKerja, luarJamKerja } ]            // hanya cakupan SEMUA
  perHari:   [ { tanggal, hari, libur, total, jamKerja, luarJamKerja } ],
  luarTim:   { total, jamKerja, luarJamKerja } }                            // hanya UTAMA
```
Cakupan SAYA hanya berisi satu baris `perOrang` (dirinya); cakupan TIM tanpa `perTim` dan `luarTim`.

### 5.3 Inti perhitungan (satu kueri, baca saja)
Yang dihitung: **pemberian hasil pertama** oleh akun ber-role VERIFIKATOR (`sumber = SATU`, `status_lama` kosong atau "Proses Verifikasi"), satu per data per verifikator.
```sql
with k as (
  select r.*, (r.waktu at time zone 'Asia/Jakarta') as lokal,
         row_number() over (partition by r.penerima_id, r.oleh order by r.waktu) as urutan
  from riwayat_verifikasi r
  where r.sumber = 'SATU'
    and coalesce(nullif(trim(r.status_lama), ''), 'Proses Verifikasi') = 'Proses Verifikasi'
    and r.tahun = $tahun
    and r.oleh = any($daftar_username_cakupan)          -- cakupan dari server (hanya akun tim)
), pertama as (
  select * from k where urutan = 1                      -- 1 data = 1 hitungan per verifikator
    and waktu >= $dari_wib and waktu < $sampai_wib_plus_1
), kelas as (
  select p.*,
    (not exists (select 1 from hari_libur_verifikasi h where h.tanggal = p.lokal::date)
     and exists (select 1 from jam_kerja_verifikasi j
                 where j.isodow = extract(isodow from p.lokal)::int
                   and p.lokal::time >= j.mulai and p.lokal::time < j.selesai)) as jam_kerja
  from pertama p
)
select oleh, count(*) total,
       count(*) filter (where jam_kerja) jam_kerja,
       count(*) filter (where not jam_kerja) luar_jam_kerja,
       count(*) filter (where status_baru = 'Memenuhi Syarat') ms,
       count(*) filter (where status_baru = 'Berkas Tidak Lengkap') btl,
       count(*) filter (where status_baru = 'Tidak Memenuhi Syarat') tms
from kelas group by oleh;
```
Perhatikan: `urutan = 1` dihitung **sebelum** penyaring tanggal, supaya satu data yang (karena suatu sebab) tercatat dua kali tetap dihitung sekali, pada saat pemberian hasil pertamanya.

Batas hari memakai tanggal WIB (bukan UTC), sehingga verifikasi pukul 23.30 WIB tidak "pindah hari".

### 5.4 Aksi pendukung (tahap lanjut, khusus Admin Utama)
- `ambilDaftarTimVerifikator`, `simpanTimVerifikator` (atur tim/koordinator), `daftarHariLibur`, `simpanHariLibur`, `hapusHariLibur`. Tahap awal cukup lewat SQL oleh saya; layar kelolanya dikerjakan bila Anda mau.

---

## 6. Rancangan UI/UX (ringkas; versi visual ada di mockup)

**Prinsip:** angka lembur tampil paling menonjol; jam kerja dan luar jam kerja selalu berdampingan dan **dibedakan bukan hanya dengan warna** (label teks + pola/ikon) agar terbaca di layar kecil dan oleh yang buta warna; satu pertanyaan per layar; tanpa data pribadi penerima.

**Pintu masuk**
- Verifikator dan Koordinator: badge melayang "Verifikasi saya" yang sudah ada mendapat tautan **"Lihat hasil kerja"** yang membuka panel penuh. Badge tetap ringkas.
- Admin Utama: tombol baru **"Agregat Verifikasi"** di samping Dashboard Progres.

**Tiga tampilan (satu komponen, isi mengikuti peran):**
1. **Verifikator ("Hasil Kerja Saya")**: kartu total; dua kartu **Jam Kerja** dan **Luar Jam Kerja**; rincian per status (MS / BTL / TMS); bagan batang harian bertumpuk (jam kerja vs luar jam kerja); tabel per hari.
2. **Koordinator ("Hasil Tim X")**: sama seperti di atas untuk satu tim, ditambah **tabel anggota** (urut dapat diubah) berisi total, jam kerja, luar jam kerja, per status; baris dirinya diberi penanda.
3. **Admin Utama ("Agregat Semua Tim")**: empat kartu tim berdampingan (total, jam kerja, luar jam kerja), tabel seluruh verifikator dengan penyaring tim, dan baris terpisah "Admin Utama, di luar tim".

**Kontrol bersama:** pilihan periode (Hari ini, 7 hari, Bulan ini, Bulan lalu, Rentang sendiri), tombol **Unduh Excel** (bila K6 disetujui), keterangan aturan jam kerja yang selalu terlihat ("Senin–Kamis 08.00–16.30, Jumat 08.00–17.00, WIB; Sabtu, Minggu, tanggal merah = luar jam kerja"), dan waktu pembaruan terakhir.

**Keadaan khusus:** belum ada data pada periode (pesan kosong yang menjelaskan), memuat, gagal memuat (tombol coba lagi), tampilan ponsel (kartu menumpuk, tabel dapat digulir ke samping di dalam wadahnya), mode gelap, navigasi keyboard.

**Teknis tampilan:** modul baru `public/js/app-agregat-verifikasi.js` dimuat malas hanya untuk peran yang berhak (pola `SKRIP_PER_PERAN`); tidak menambah isi `index.html` / `app-transaksi.js` (sudah di atas 3.500 baris); warna memakai gaya sebaris atau kelas CSS yang sudah ada agar tidak perlu membangun ulang CSS Tailwind.

---

## 7. Hak akses dan keamanan

| Peran | Lihat sendiri | Lihat tim | Lihat semua tim | Ubah tim/jam kerja/libur |
|---|---|---|---|---|
| VERIFIKATOR biasa | ya | tidak | tidak | tidak |
| Koordinator | ya | ya (timnya saja) | tidak | tidak |
| UTAMA | (baris luar tim) | ya | ya | ya |
| Peran lain | tidak | tidak | tidak | tidak |

- Cakupan dihitung server dari `tim_verifikator` dan peran sesi; **parameter dari browser tidak pernah memperluas cakupan** (koordinator Tim I yang mengirim `tim: 'II'` tetap hanya mendapat Tim I).
- Tidak ada data penerima (nama, NIK, alamat) di hasil agregat.
- Rentang tanggal dipagari; kueri baca saja; tanpa menulis apa pun.
- Akun yang dinonaktifkan tetap muncul di agregat historis (jejak tidak hilang).

---

## 8. Tahapan (semua lokal dulu, tiap tahap bisa dibatalkan)

| Tahap | Isi | Dampak ke produksi |
|---|---|---|
| **T0** | Riwayat verifikator **atomik** dengan update status (D8) + uji + percobaan merusak kode | kode saja, belum tayang |
| **T0b** | (bila D9 disetujui) Verifikator hanya dapat memberi hasil pada data "Proses Verifikasi"; "Tandai Sudah Diperbaiki" khusus Admin Utama; layar menyembunyikan tombolnya + uji + percobaan merusak kode | kode saja, belum tayang |
| **T1** | Migrasi: `tim_verifikator`, `jam_kerja_verifikasi`, `hari_libur_verifikasi`; isi awal tim dan koordinator; pemicu pagar riwayat | migrasi (izin Anda) |
| **T2** | Aksi server `getAgregatVerifikasi` + daftar-putih + uji server (cakupan tiap peran, batas jam, pergantian hari, tanggal merah, rentang) | lokal |
| **T3** | Modul layar `app-agregat-verifikasi.js` (tiga tampilan) + uji layar Chrome (tiap peran, ponsel, gelap) | lokal |
| **T4** | Unduh Excel rekap lembur (per orang per hari; sheet ringkasan) | lokal |
| **T5** | Tinjauan ulang, percobaan merusak kode, regresi seluruh `uji:*` | lokal |
| **T6** | Setelah izin: migrasi → deploy fungsi `api` → push (urutan ini) → uji nyata dengan akun koordinator | produksi |
| **T7 (opsional)** | Layar Admin Utama untuk mengatur tim, jam kerja, dan tanggal merah; badge diselaraskan ke sumber riwayat (K10) | produksi |

Pengujian: uji server dengan basis data tiruan (pola `server-verifikator.test.mjs`), uji layar Chrome (pola `verifikator.mjs`), dan percobaan merusak kode untuk memastikan uji benar-benar menangkap pelanggaran (khususnya: batas 16.30/17.00, Jumat, tengah malam WIB, tanggal merah, dan **kebocoran lintas tim**).

---

## 9. Pertanyaan yang perlu jawaban Anda

> **Jawaban Anda (2026-11-12):** K1 satu data yang diberi hasil oleh verifikator = 1 (perbaikan/pemeriksaan ulang oleh Admin Utama tidak dihitung); D9 disetujui (verifikator hanya memberi hasil pada data "Proses Verifikasi"; "Tandai Sudah Diperbaiki" khusus Admin Utama); K7 tidak ada periode lembur tetap (pilihan periode bebas); K2, K3, K4, K5, K6, K8, K10 = ikuti rekomendasi (Sabtu/Minggu/tanggal merah = luar jam kerja; istirahat siang tetap jam kerja; batas atas tidak termasuk; koordinator ikut terhitung; Unduh Excel untuk Admin Utama dan Koordinator (timnya); pekerjaan Admin Utama tampil terpisah sebagai informasi; badge diselaraskan ke sumber riwayat). Tanggal merah: saya isi dari kalender libur nasional/cuti bersama resmi untuk sisa 2026 dan Anda koreksi lewat tabel.

| No | Pertanyaan | Rekomendasi saya |
|---|---|---|
| **K1** | ~~Dasar hitung lembur~~ **DIJAWAB:** satu data yang diberi hasil oleh verifikator = 1, tidak peduli berapa kali dibuka; perbaikan dan pemeriksaan ulang tidak dihitung karena dikerjakan Admin Utama | (dilaksanakan di D2) |
| **K2** | Sabtu, Minggu, dan tanggal merah seluruhnya **luar jam kerja**? Siapa yang mengisi daftar tanggal merah? | Ya; saya isi libur nasional 2026–2027, Anda koreksi |
| **K3** | Istirahat siang (12.00–13.00, Jumat biasanya 11.30–13.00) tetap **dihitung jam kerja**? | Ya, tetap jam kerja (Anda tidak menyebut pengecualian) |
| **K4** | Batas tepat: verifikasi yang tersimpan **tepat 16.30.00** (Jumat 17.00.00) dihitung **luar** jam kerja? | Ya (batas atas tidak termasuk) |
| **K5** | Koordinator juga memverifikasi sehingga **ikut terhitung** dalam angka timnya? | Ya |
| **K6** | Perlu **Unduh Excel** rekap lembur (per orang per hari, jam kerja vs luar jam kerja)? Untuk siapa saja? | Ya; Admin Utama (semua) dan Koordinator (timnya) |
| **K7** | Ada **periode tetap** untuk lembur (mis. tanggal 1 sampai akhir bulan)? | Pilihan periode tetap "Bulan ini" dan "Bulan lalu" |
| **K8** | Pekerjaan **Admin Utama** (verifikasi satu per satu, perbaikan, pengembalian ke Berkas Tidak Lengkap) tampil sebagai baris informasi "di luar tim"? | Ya, terpisah dari angka tim |
| **K9 ★ (D9)** | Setujukah hak verifikator **diperketat**: hanya boleh memberi hasil pada data "Proses Verifikasi"; "Tandai Sudah Diperbaiki" dan koreksi status khusus Admin Utama? | Setuju, supaya aturan ditegakkan sistem |
| **K10** | Badge "Verifikasi saya" yang sekarang (hitung dari pemverifikasi terakhir) **disamakan** dengan sumber riwayat supaya angkanya sama dengan agregat? | Ya, di T7 |

Dua hal yang saya perlukan dari Anda selain jawaban di atas:
1. **Daftar tanggal merah** yang berlaku (atau izin memakai kalender libur nasional resmi, ditambah cuti bersama bila Anda tetapkan).
2. Konfirmasi bahwa **anggota tiap tim** persis seperti daftar yang sudah Anda kirim (pembagian ke Tim I–IV dicatat dari daftar itu).

---

## 10. Risiko dan catatan

- **Verifikasi tanpa catatan riwayat:** diatasi D8 (transaksi satu paket). Tanpa D8 angka lembur bisa kurang hitung diam-diam.
- **Jam server:** waktu diambil dari jam database (`now()`), bukan dari jam perangkat verifikator, sehingga tidak bisa dimajukan atau dimundurkan dari sisi pengguna.
- **Satu data diberi hasil dua kali oleh verifikator** (bila D9 tidak diterapkan): hanya pemberian pertama yang dihitung (D2).
- **Data sebelum 2026-11-12 19.43 WIB** tidak ada rinciannya dan tidak ikut agregat (catatan di layar: "Dihitung sejak 12 Nov 2026").
- **Perubahan jam kerja di tengah periode:** tabel `jam_kerja_verifikasi` hanya menyimpan aturan **sekarang**. Bila aturan diubah, hitung ulang periode lama ikut aturan baru. Bila Anda ingin aturan lama tetap berlaku untuk periode lama, tabel perlu kolom berlaku-mulai (saya tambahkan di T1 bila diinginkan).
- **Beban basis data (paket gratis):** satu kueri agregat per pembukaan panel, tanpa penyegaran otomatis berulang; indeks `idx_riwayat_verifikasi_oleh` dan `idx_riwayat_verifikasi_waktu` sudah ada.
- Akun verifikator yang berhenti **dinonaktifkan, bukan dihapus**, agar jejak dan agregat historis tetap utuh.

---

## 11. Catatan realisasi (2026-11-12, LOKAL, cabang `feat/agregat-verifikator`; belum migrasi/commit/push/deploy)

| Tahap | Status | Berkas utama |
|---|---|---|
| T0 (D8) riwayat atomik untuk verifikator | selesai lokal | `domains/verifikasi.ts`, `_shared/riwayatVerifikasi.ts` (`catatRiwayatVerifikasiWajib`) |
| T0b (D9) verifikator hanya memberi hasil pada "Proses Verifikasi"; "Tandai Sudah Diperbaiki" khusus Admin Utama | selesai lokal | `verifikasi.ts`, `gerbangPeran.ts` (aksi dikeluarkan dari daftar-putih), `app-transaksi.js` (2 baris diganti, jumlah baris tetap) |
| T1 migrasi | berkas siap, **belum diterapkan** | `supabase/migrations/20261112150000_agregat_verifikasi.sql` (tim_verifikator, jam_kerja_verifikasi, hari_libur_verifikasi, pemicu hanya-tambah) |
| T2 aksi server | selesai lokal | `_shared/agregatInti.ts` (murni), `domains/agregatVerifikasi.ts` (`getAgregatVerifikasi`, `unduhRekapLemburVerifikasi`), `gerbangPeran.ts` (daftar-putih 23 aksi), `index.ts` |
| T3 tampilan | selesai lokal | `public/js/app-agregat-verifikasi.js` (panel 3 cakupan), tautan "Lihat hasil kerja" di badge (`app-verifikator.js`), tombol "Agregat Verifikasi" untuk Admin Utama |
| T4 Excel | selesai lokal | sheet Rekap, Per Hari, Aturan (diperiksa dengan exceljs sungguhan) |
| K10 badge disamakan dengan sumber riwayat | selesai lokal | `getRingkasanVerifikasiSaya` kini dari `riwayat_verifikasi` |

Hal yang dikerjakan di luar daftar awal:
- **Akun `verif_ade_sandrya` (Tim I)** ditambahkan Admin Utama sendiri lewat layar Manajemen Pengguna (bukti pilihan role Verifikator sudah berfungsi). Sudah dimasukkan ke isi awal `tim_verifikator`. Akun verifikator baru yang BELUM ada di tabel tim tetap berfungsi: ia melihat dirinya sendiri, dan di tampilan Admin Utama muncul sebagai "Tanpa tim" sampai ditetapkan timnya.
- Isi awal `hari_libur_verifikasi` hanya tanggal merah yang pasti untuk sisa 2026 dan awal 2027 (24-25 Des 2026, 1 Jan 2027). **Mohon dikoreksi/dilengkapi** (tabel dapat diubah tanpa deploy).
- Harness uji: `_harness-server.mjs` dan `_harness-pg.mjs` kini melewatkan impor `npm:` (pustaka Deno) dan `begin()` tiruan meniru rollback; `_harness-pg.mjs` mendukung stub opsional.

Pengujian: `uji:agregat-inti` (14), `uji:agregat-server` (10), `uji:verifikator` (32), `uji:agregat-pg` (6, Postgres sungguhan lewat PGlite: migrasi asli, rollback nyata, batas jam, tanggal merah, hak per peran), uji layar `agregat-verifikasi.mjs` (3 peran + keadaan kosong/galat + keamanan HTML) dan `verifikator.mjs`; percobaan merusak kode (lihat laporan akhir).

Urutan penayangan yang disarankan (menunggu izin Anda): (1) terapkan migrasi; (2) deploy fungsi `api`; (3) push (frontend). Fungsi baru bergantung pada tabel baru, jadi migrasi harus lebih dulu.

### Pembaruan 2026-11-14: "Status data sekarang" + "Dikoreksi Admin" (pilihan 3 user)
- Panel menampilkan DUA baris status: **Hasil verifikator** (dasar hitungan, dari riwayat) dan **Status data sekarang** (informasi, dari `penerima` lewat left join) beserta chip **Dikoreksi Admin** (jumlah data yang status sekarangnya berbeda dari hasil verifikator, termasuk data yang sudah dihapus). Tabel mendapat kolom "Dikoreksi"; Excel mendapat kolom "Dikoreksi Admin (informasi, per tanggal unduh)" dengan subtotal per tim dan penjelasan di sheet Aturan.
- **Lembur aman:** total, jam kerja, luar jam kerja, dan hasil verifikator TIDAK dihitung dari status sekarang. Dijaga uji invarian di tiga lapis (logika murni, server tiruan, Postgres sungguhan: kasus TMS -> Admin naikkan ke BTL -> total/jam/lembur identik, dikoreksi = 1) dan percobaan merusak kode.
- Status sekarang berubah mengikuti koreksi berikutnya; jangan dipakai sebagai dasar pembayaran.
