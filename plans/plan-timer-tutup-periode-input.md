# Plan: Timer Tutup Periode Input + Pesan Admin Utama

> Versi: **2** (2026-10-19) · Status: **DRAF — menunggu jawaban §4**
> Branch kerja: `feat/timer-tutup-periode` (dari `origin/main`, **bukan** dari `feat/retur-status-penerima`)
> Prinsip: rencana → uji lokal → konfirmasi → produksi. Setiap tahap bisa dibatalkan, dan UI/UX yang sudah ada tetap dipertahankan.

## Daftar isi
1. [Ringkasan](#1-ringkasan)
2. [Tujuan & batasan](#2-tujuan--batasan)
3. [Kondisi sekarang](#3-kondisi-sekarang-hasil-baca-kode)
4. [Keputusan yang perlu dijawab](#4-keputusan-yang-perlu-dijawab)
5. [Desain umum](#5-desain-umum)
6. [Model data](#6-model-data-migrasi-aditif)
7. [Logika server](#7-logika-server)
8. [Tampilan](#8-tampilan)
9. [Keamanan](#9-keamanan)
10. [Tahapan kerja](#10-tahapan-kerja)
11. [Daftar uji](#11-daftar-uji)
12. [Risiko & mitigasi](#12-risiko--mitigasi)
13. [Runbook operasional](#13-runbook-operasional)
14. [Di luar lingkup](#14-di-luar-lingkup)

---

## 1. Ringkasan

Dua fitur yang saling terkait:

| Fitur | Untuk siapa | Inti |
|---|---|---|
| **A. Timer tutup/buka periode** | Admin UTAMA mengatur, Kecamatan & Kemenag terdampak | Penutupan dijadwalkan pada tanggal + jam WIB. Pengguna melihat hitung mundur, lalu input otomatis terkunci tepat waktu tanpa refresh |
| **B. Pesan Admin Utama** | Admin UTAMA menulis, **seluruh pengguna** membaca | Pesan resmi (judul + isi) yang tampil di modal dan banner saat penutupan terjadi, ikut disiarkan realtime, dengan catatan siapa yang sudah membaca |

Keduanya dibangun **di atas sakelar BUKA/TUTUP yang sudah ada**. Sakelar manual, pengecualian per akun, riwayat, dan realtime tetap dipakai, tidak diganti.

---

## 2. Tujuan & batasan

### Tujuan
1. Admin tidak perlu standby untuk menekan tombol TUTUP tepat pada tenggat.
2. Penguncian **tepat pada detiknya**, walau cron terlambat atau jam HP pengguna salah.
3. Semua pengguna mendapat **informasi resmi yang sama**: kapan ditutup, alasannya, dan langkah setelah ditutup.
4. Admin bisa memastikan pesan **benar-benar sampai** (jumlah yang sudah dan belum membaca).

### Bukan tujuan
- Tidak mengganti tombol BUKA/TUTUP manual.
- Tidak mengubah batas waktu perbaikan berkas (`cekBatasWaktuVerifikasi`), karena itu fitur per penerima.
- Tidak mengubah hak UTAMA (tetap bebas) dan MUI (tetap hanya lihat).
- Tidak menjadi fitur chat. Chat sudah dihapus 2026-09-12. Pesan bersifat **satu arah**, tanpa balasan.

---

## 3. Kondisi sekarang (hasil baca kode)

| Bagian | Lokasi | Perilaku |
|---|---|---|
| Sakelar master | `setelan.INPUT_KECAMATAN_KEMENAG` = `BUKA`/`TUTUP` | [setelan.ts:71](../supabase/functions/api/domains/setelan.ts) |
| Pengecualian per akun | `setelan.INPUT_USER_<userId>`, **mengalahkan master** | `cekAksesInputUser()` [setelan.ts:83](../supabase/functions/api/domains/setelan.ts) |
| Auto-cleanup | Pengecualian yang sama dengan master baru dihapus | `setInputKecKem()` [setelan.ts:138](../supabase/functions/api/domains/setelan.ts) |
| Audit | `riwayat_setelan` | `catatRiwayatSetelan()` (menelan error) |
| Penegakan | `simpanDataKeSheet` [penerima.ts:620](../supabase/functions/api/domains/penerima.ts), `editDataPenerima` [penerima.ts:866](../supabase/functions/api/domains/penerima.ts) | Hanya KECAMATAN + layanan Kemenag |
| Celah | Unggah berkas berjalan browser → GAS Drive tanpa cek sakelar (`mintaUrlUploadBerkas` adalah jalur lama yang tidak dipakai) | Berkas bisa terunggah lalu simpan ditolak, sehingga berkas yatim |
| Realtime | `trg_event_setelan` → `realtime_event_bus` domain `setelan` | Browser memanggil `periksaStatusAkses()` & `muatStatusSakelar()` [app-admin.js:2817](../public/js/app-admin.js) |
| Cache | `statusInputKecKem`, `ambilStatusDetailSetelan` TTL **2 menit** | [api-bridge.js:209](../public/js/api-bridge.js) |
| UI admin | `#gp-sakelar-section`, `#sakelar-toggle`, `konfirmasiToggleSakelar()` | [app-admin.js:694](../public/js/app-admin.js), [index.html:2910](../index.html) |
| UI pengguna | `#banner-tutup` (panel rekap), `#modal-notif-tutup` + `#notif-tutup-meta` | [index.html:952](../index.html), [index.html:2433](../index.html), `terapkanHakAkses()` [app-core.js:1010](../public/js/app-core.js) |
| Pengecualian peran | `periksaStatusAkses()` dilewati untuk UTAMA dan MUI | [app-core.js:1081](../public/js/app-core.js) |
| Escape HTML | `esc()` | [app-core.js:1148](../public/js/app-core.js) |

---

## 4. Keputusan yang perlu dijawab

Usulan saya tertulis di kolom kanan. Jawab "setuju semua", atau sebutkan nomor yang ingin diubah.

### Timer
| # | Pertanyaan | Usulan |
|---|---|---|
| K1 | Timer hanya menutup, atau juga bisa membuka otomatis? | **Keduanya**: buka opsional, tutup utama |
| K2 | Akun dengan pengecualian BUKA tetap boleh input setelah timer menutup? | **Ya**, sama seperti tutup manual. Ini juga jadi cara perpanjangan per kecamatan |
| K3 | Masa tenggang untuk kiriman yang sedang berjalan saat tenggat? | **5 menit**, hanya untuk simpan yang unggah berkasnya dimulai sebelum tenggat |
| K4 | Jadwal peringatan ke pengguna? | Banner mulai **H-3**, toast di **H-1, 1 jam, 15 menit** |
| K5 | Edit data lama ikut terkunci? | **Ya** |
| K6 | Timer sekali pakai atau berulang? | **Sekali pakai** |
| K7 | Ada pintasan perpanjang (+1 jam/+1 hari/+3 hari)? | **Ya** |

### Pesan Admin Utama
| # | Pertanyaan | Usulan |
|---|---|---|
| K8 | "Seluruh user" mencakup siapa? | **Semua peran non-UTAMA**: Kecamatan, semua layanan Kemenag, Kelurahan, dan **MUI** (MUI hanya membaca, input-nya memang sudah terkunci) |
| K9 | Pesan hanya tampil **saat** penutupan, atau juga **sebelum** (bersama hitung mundur)? | **Keduanya**: pesan bisa ditulis bersama jadwal. Sebelum tutup tampil di banner hitung mundur, saat tutup tampil di modal |
| K10 | Pesan juga muncul untuk tutup **manual** (bukan timer)? | **Ya**: dialog konfirmasi TUTUP diberi kolom pesan opsional |
| K11 | Perlu catatan siapa yang **sudah membaca**? | **Ya**: tombol "Mengerti" mencatat waktu baca, dan admin melihat "38 dari 52 akun sudah membaca" plus daftar yang belum |
| K12 | Pesan bisa **diubah** setelah terbit? | **Ya**, dengan versi baru: pengguna yang sudah membaca versi lama akan ditampilkan lagi. Riwayat versi disimpan |
| K13 | Batas panjang dan format? | Judul ≤ 100 karakter, isi ≤ 1.500 karakter, **teks biasa** (baris baru dipertahankan, tanpa HTML). Tautan `https://` dibuat bisa diklik secara aman |
| K14 | Pesan juga tampil saat periode **dibuka** (mis. "Periode gelombang 2 dibuka")? | **Ya, opsional**: tipe pesan `TUTUP`/`BUKA`/`INFO` |

---

## 5. Desain umum

### 5.1 Prinsip: dihitung saat dibaca, cron hanya pelengkap

```
status efektif untuk akun non-UTAMA:
  pengecualian KHUSUS akun ada?          → pakai nilainya          (sumber KHUSUS)
  master = TUTUP?                        → TUTUP                   (sumber MASTER)
  ada jadwal TUTUP menunggu & now ≥ waktu → TUTUP                  (sumber TIMER)
  selain itu                             → BUKA                    (sumber MASTER)
```

- **Penegakan tidak bergantung pada pg_cron.** Server membandingkan `now()` Postgres dengan jadwal di setiap simpan/edit/unggah.
- **pg_cron setiap menit** menjalankan `terapkan_jadwal_periode()`, yang:
  - mengubah master ke TUTUP/BUKA,
  - mencatat riwayat dengan username `SISTEM (TIMER)`,
  - menjalankan auto-cleanup,
  - **menerbitkan pesan** yang terkait jadwal,
  - memicu event realtime, sehingga semua browser berubah tanpa refresh.
- **Acuan jam = server.** Setiap respons status membawa `waktuServer`.

### 5.2 Alur waktu (contoh: tutup 30 Nov 2026 23.59 WIB)

```
27 Nov 08.00  Admin membuat jadwal + menulis pesan
              └─ realtime → banner hitung mundur + cuplikan pesan tampil ke semua pengguna
29 Nov 23.59  Toast H-1
30 Nov 22.59  Toast 1 jam, banner merah
30 Nov 23.44  Toast 15 menit
30 Nov 23.59  ├─ Server: simpan/edit ditolak (sumber TIMER), tenggang 5 menit untuk kiriman yang sedang berjalan
              ├─ Browser: hitung mundur 00:00 → cek ulang tanpa cache → tab Input terkunci
              └─ Modal "Periode Input Telah Ditutup" + Pesan Admin Utama
≤ 00.00       pg_cron: master TUTUP, riwayat, pesan TERBIT, event realtime
              └─ Pengguna yang sedang offline melihat modal + pesan saat login/kembali ke tab
01 Des        Admin memantau "Sudah dibaca 48/52", lalu menghubungi 4 akun sisanya
```

---

## 6. Model data (migrasi aditif)

Tidak ada tabel lama yang diubah strukturnya.

### 6.1 `jadwal_periode_input`
```sql
create table public.jadwal_periode_input (
  id              bigint generated always as identity primary key,
  tahun           int          not null,
  jenis           text         not null check (jenis in ('BUKA','TUTUP')),
  waktu_berlaku   timestamptz  not null,
  status          text         not null default 'MENUNGGU'
                  check (status in ('MENUNGGU','DIJALANKAN','DIBATALKAN')),
  pesan_id        bigint       references public.pesan_admin(id),  -- pesan yang terbit saat jadwal jalan (opsional)
  dibuat_oleh     text         not null,
  dibuat_pada     timestamptz  not null default now(),
  dijalankan_pada timestamptz,
  dibatalkan_oleh text,
  dibatalkan_pada timestamptz,
  catatan         text         not null default ''
);
create unique index uq_jadwal_menunggu
  on public.jadwal_periode_input (tahun, jenis) where status = 'MENUNGGU';
```

### 6.2 `pesan_admin` (satu baris = satu versi pesan)
```sql
create table public.pesan_admin (
  id            bigint generated always as identity primary key,
  tahun         int         not null,
  tipe          text        not null check (tipe in ('TUTUP','BUKA','INFO')),
  judul         text        not null check (char_length(judul) between 3 and 100),
  isi           text        not null check (char_length(isi) between 10 and 1500),
  status        text        not null default 'DRAF'
                check (status in ('DRAF','TERJADWAL','TERBIT','DITARIK','DIGANTI')),
  menggantikan  bigint      references public.pesan_admin(id),   -- versi sebelumnya (K12)
  terbit_pada   timestamptz,
  ditarik_pada  timestamptz,
  dibuat_oleh   text        not null,
  dibuat_pada   timestamptz not null default now()
);
-- maksimal 1 pesan TERBIT per tahun
create unique index uq_pesan_terbit on public.pesan_admin (tahun) where status = 'TERBIT';
```

### 6.3 `pesan_admin_dibaca` (K11)
```sql
create table public.pesan_admin_dibaca (
  pesan_id    bigint      not null references public.pesan_admin(id) on delete cascade,
  akun_id     uuid        not null references public.akun(id) on delete cascade,
  username    text        not null,
  dibaca_pada timestamptz not null default now(),
  primary key (pesan_id, akun_id)
);
```
> Diubah saat T1: kunci memakai `akun.id` (uuid), bukan `akun.user_id`, karena `user_id` boleh kosong (default `''`).

### 6.4 Pengaturan bersama
- RLS **aktif tanpa policy** di ketiga tabel, sehingga hanya fungsi server (service role) yang bisa mengakses. Pola ini sama dengan tabel Retur.
- Trigger event bus domain `setelan` ditambahkan pada `jadwal_periode_input` dan `pesan_admin`. `pesan_admin_dibaca` **tidak** disiarkan, supaya tidak ada badai event saat 50 orang menekan "Mengerti".
- Tabel baru **tidak** masuk outbox Sheets. Hanya perubahan `setelan` master yang dicerminkan, sama seperti sekarang.
- Indeks tambahan: `pesan_admin_dibaca (akun_id)`.
- **Tabel keempat (ditambah di T2):** `upload_berkas_dimulai (akun_id uuid pk, dimulai_pada)`, UNLOGGED seperti `sesi_login`. Penanda "unggah dimulai" untuk masa tenggang 5 menit. Hilang saat crash berarti tenggang tidak berlaku (gagal ke arah aman).

---

## 7. Logika server

### 7.1 Fungsi SQL `terapkan_jadwal_periode()` (pg_cron `* * * * *`)
1. `pg_try_advisory_xact_lock(<konstanta>)`. Kalau gagal, keluar.
2. Ambil jadwal `MENUNGGU` dengan `waktu_berlaku <= now()` (`for update skip locked`).
3. Per jadwal, dalam **satu transaksi**:
   - Upsert master `setelan`, lalu (bila berubah) catat ke `riwayat_setelan` dengan username `SISTEM (TIMER)` dan jalankan auto-cleanup.
   - Bila ada `pesan_id`: pesan TERBIT lama menjadi `DIGANTI`, pesan ini menjadi `TERBIT` dengan `terbit_pada = now()`.
   - Jadwal → `DIJALANKAN`.
4. Idempoten: menjalankannya dua kali tidak mengubah apa pun lagi.

> Logika auto-cleanup dipindah ke fungsi SQL `set_master_periode(nilai, username, keterangan)`, yang dipanggil oleh **tombol manual dan timer**. Dengan begitu tidak ada dua versi logika.

### 7.2 Perubahan pada aksi yang ada

| Aksi | Perubahan | Bentuk respons |
|---|---|---|
| `cekAksesInputUser` | Tambah cek jadwal → `sumber: "TIMER"` | internal |
| `statusInputKecKem` | Tambah `waktuServer`, `jadwalTutup`, `jadwalBuka`, `pesan` (`{id, tipe, judul, isi, oleh, waktuTerbit, sudahDibaca}`) | field lama **tetap**, hanya bertambah |
| `ambilStatusDetailSetelan` | Tambah jadwal aktif, 5 riwayat jadwal, pesan terbit + statistik baca | sama |
| `setInputKecKem(token, buka, batalkanJadwalTutup?)` | **[T2 selesai]** Memakai `set_master_periode()`. Tombol manual MENGALAHKAN jadwal lawan yang sudah jatuh tempo tapi belum dijalankan cron (kalau tidak, cron membalikkan pilihan admin dalam hitungan detik). Jadwal di masa depan tidak disentuh, kecuali `batalkanJadwalTutup=true` saat menutup manual. Respons menambah `jadwalDibatalkan` dan `jadwalTutup` agar UI bisa bertanya. Parameter pesan (K10) menyusul di T3 | kompatibel |
| `simpanDataKeSheet`, `editDataPenerima` | **[T2 selesai]** Memakai gerbang tunggal `periksaIzinInput()`. Pesan tolak `TIMER`: *"Periode input telah berakhir pada {waktu WIB}."* + masa tenggang K3. Teks KHUSUS dan MASTER tetap identik dengan versi lama | sama |
| `mulaiUnggahBerkas(token)` **(baru, menggantikan rencana `mintaUrlUploadBerkas`)** | **[T2 selesai]** Dipanggil browser tepat sebelum `unggahBerkasKeDriveGAS`. Menolak lebih awal bila periode tertutup dan mencatat "unggah dimulai" (dasar masa tenggang) | `{sukses, tenggang}` |

> **Koreksi rancangan (ditemukan saat T2):** unggah berkas berjalan **browser → GAS Drive** (`GAS_DRIVE_UPLOAD_URL` di `app-transaksi.js`), tidak lewat server ini. `mintaUrlUploadBerkas` / `konfirmasiUploadBerkas` adalah jalur Supabase Storage lama yang **tidak dipanggil frontend sama sekali**, jadi memberinya cek akses tidak ada gunanya, dan server tidak punya cara lain mengetahui kapan unggah dimulai. Penggantinya adalah aksi `mulaiUnggahBerkas`, yang dipanggil frontend (T5) di dua tempat: simpan baru (`app-transaksi.js` ±baris 834) dan edit (±baris 2958). `konfirmasiUploadBerkas` sengaja tidak dikunci.
>
> **Celah yang tersisa (diterima):** GAS tetap menerima unggahan dari sesi yang sah walau periode sudah tertutup, karena GAS hanya memeriksa sesi lewat `ping`. Frontend lama yang masih terbuka (formulir lama, cache PWA) bisa meninggalkan berkas yatim di Drive. Menutupnya butuh perubahan dan deploy GAS (perlu persetujuan user), jadi ditunda sebagai opsional.

### 7.3 Aksi baru

| Aksi | Siapa | Fungsi |
|---|---|---|
| `aturJadwalPeriode(token, jenis, waktu, catatan?)` **[T2 selesai]** | UTAMA | Argumen posisional (kontrak `google.script.run`). `waktu` tanpa zona dibaca WIB (`"2026-11-30T23:59"`). Validasi lalu buat jadwal; jadwal sejenis yang lama → `DIBATALKAN`. Respons: `{id, jenis, waktuISO, waktuTeks, menggantikan, peringatan}`. Parameter pesan (terjadwal) menyusul di T3 |
| `batalkanJadwalPeriode(token, jenis)` **[T2 selesai]** | UTAMA | Jadwal → `DIBATALKAN`, pesan terkait → `DRAF` |
| `perpanjangJadwalPeriode(token, menit)` **[T2 selesai]** | UTAMA | Pintasan K7: geser `waktu_berlaku` jadwal TUTUP yang menunggu (1 sampai 43.200 menit). Baris dikunci `for update` agar tidak berebut dengan cron. Yang sudah DIJALANKAN ditolak, arahkan ke tombol BUKA |
| `simpanPesanAdmin(token, tipe, judul, isi, terbitkan?, idLama?)` **[T3 selesai]** | UTAMA | Argumen posisional. `idLama` kosong = pesan baru (DRAF). Bila diisi: DRAF/TERJADWAL diubah **di tempat**, TERBIT dibuatkan **versi baru** (id baru, tetap TERBIT sampai versi baru diterbitkan), DITARIK/DIGANTI ditolak. Teks dibersihkan di server (kontrol, bidi, CRLF), disimpan sebagai teks biasa |
| `terbitkanPesanAdmin(token, id)` **[T3, ditambahkan]** | UTAMA | Terbitkan DRAF/TERJADWAL sekarang: versi TERBIT lama → DIGANTI, dilepas dari jadwal. Diperlukan karena pesan bisa ditulis dulu lalu diterbitkan terpisah |
| `tarikPesanAdmin(token, id)` **[T3 selesai]** | UTAMA | Pesan → `DITARIK`, hilang dari layar pengguna; bila terjadwal, dilepas dari jadwalnya |
| `tandaiPesanDibaca(token, pesanId)` **[T3 selesai]** | Semua non-UTAMA | Identitas dari sesi (bukan parameter). Idempoten. Versi yang sudah diganti/ditarik: sukses tetapi `dicatat:false` (bukan galat) |
| `ambilStatistikBacaPesan(token, pesanId?)` **[T3 selesai]** | UTAMA | Tanpa id = pesan yang sedang terbit. Hanya akun **aktif** non-UTAMA yang dihitung. Daftar belum baca memuat nama, peran, kecamatan, HP (maks. 500) |
| `aturJadwalPeriode(…, catatan?, pesanId?)` dan `setInputKecKem(token, buka, batalkanJadwalTutup?, pesanId?)` **[T3]** | UTAMA | `pesanId` mengikat pesan DRAF ke jadwal (jadi TERJADWAL, terbit otomatis saat jadwal berjalan, K9) atau menerbitkannya bersama tombol manual (K10). Pesan tidak sah → **seluruh perubahan dibatalkan**, periode tidak berubah |

> **Field baru pada respons status [T3]:** `statusInputKecKem` dan `ambilStatusDetailSetelan` memuat `pesan` (`{id, tipe, judul, isi, oleh, waktuTerbit, waktuTerbitISO, sudahDibaca}` atau `null`). Khusus UTAMA, `ambilStatusDetailSetelan` juga memuat `pesanRiwayat` (10 versi terbaru dengan isi, `jumlahDibaca`, `jadwalId`) dan `statistikBaca` (`{total, sudah, belum, persen}`).
>
> **Keputusan desain T3:** urutan kunci database selalu *jadwal dulu, baru pesan* (sama dengan job cron) agar admin dan cron tidak saling menunggu. Pelanggaran aturan bisnis dilempar sebagai `GalatBisnis` di dalam transaksi supaya otomatis di-*rollback*.

### 7.4 Aturan validasi
- Waktu jadwal ≥ now + 5 menit, ≤ now + 366 hari. Jadwal BUKA dan TUTUP yang sama-sama menunggu tidak boleh jatuh pada menit yang sama, selebihnya **urutannya bebas** (tutup lalu buka lagi untuk gelombang berikutnya adalah pemakaian yang sah; aturan "TUTUP harus setelah BUKA" di draf awal dihapus).
- Tanggal yang tidak ada di kalender (mis. 31 Februari) ditolak, tidak digulirkan diam-diam ke bulan berikutnya.
- Input waktu dari admin **selalu ditafsirkan WIB** (`+07:00`), lalu dikonversi ke `timestamptz`.
- Judul dan isi: di-*trim*, karakter kontrol dibuang, batas panjang K13, minimal 10 karakter isi.
- Semua aksi tulis memeriksa `role === "UTAMA"` di server, tidak hanya disembunyikan di UI.

### 7.5 Registrasi
- `index.ts`: daftarkan aksi baru. `tandaiPesanDibaca` masuk aksi bersesi biasa (bukan publik).
- `api-bridge.js`: `MUTATION_INVALIDATIONS` aksi baru → `['setelan']`. Tambah TTL cache untuk `ambilStatistikBacaPesan` (30 detik). **[T2: tiga aksi jadwal sudah didaftarkan; `mulaiUnggahBerkas` sengaja tanpa cache.]**
- **Catatan untuk T5 (cache jam):** `statusInputKecKem` di-cache browser 2 menit. Kalau respons lama dipakai ulang, `waktuServer`-nya sudah usang dan selisih jam yang dihitung dari sana meleset sebesar umur cache. Hitung selisih jam hanya dari respons yang **baru diambil** (lewati cache), dan segarkan lewat panggilan tanpa cache pada 00:00, `visibilitychange`, dan `online`.

---

## 8. Tampilan

> **Realisasi T4 (2026-10-19) — berbeda dari rancangan awal:** tiga kartu tidak ditumpuk di bawah tombol sakelar (panel profil jadi terlalu panjang di HP). Sebagai gantinya ada **satu tombol baru "Jadwal & Pesan Penutupan"** di panel Kontrol Periode Input yang membuka **modal besar bertab**: *Jadwal Otomatis*, *Pesan Admin Utama*, *Status Baca*. Dialog TUTUP/BUKA manual diganti dialog baru berisi pilihan pesan + pertanyaan membatalkan jadwal.
>
> - Berkas baru `public/js/app-jadwal-pesan.js` (1.064 baris). Markup modal dibuat lewat JS karena `index.html` hanya punya sisa ±17 baris dari batas 3.500; kerangka dibuat sekali sehingga ketikan admin tidak hilang saat data disegarkan realtime.
> - Di `app-admin.js`, `konfirmasiToggleSakelar` memakai `window.dialogSakelarManual` dan meneruskan `batalkanJadwal` + `pesanId` ke `setInputKecKem` (cadangan: konfirmasi lama bila berkas baru gagal dimuat).
> - **Tombol tutup/X:** semua modal baru memilikinya (`data-modal-close`, `aria-label="Tutup"`, tombol pertama di modal sehingga jadi target ESC `modal-a11y.js`). Modal `modal-notif-tutup` yang lama juga diberi X (hanya menyembunyikan modal, tidak menandai pesan sebagai dibaca; itu urusan tombol Mengerti di T5). Menutup modal editor saat ada isian yang belum disimpan meminta konfirmasi.
> - Server: `ambilStatusDetailSetelan` kini memuat `pesanId` pada jadwal agar panel tahu pesan mana yang terikat.
> - Helper global `window.djpmRenderIsiPesan(el, teks)` menampilkan isi pesan sebagai teks dan hanya menjadikan `https://` tautan (dibuat lewat `createElement`, `rel=noopener noreferrer`). Dipakai ulang di T5.

### 8.1 Admin UTAMA, panel "Kontrol Periode Input"
Di bawah tombol `#sakelar-toggle` yang sudah ada, ditambah tiga kartu:

**Kartu 1: Jadwal Otomatis**
- Input tanggal + jam (WIB) *Tutup otomatis* dan opsional *Buka otomatis*.
- Saat jadwal aktif: hitung mundur besar, misalnya *"Ditutup otomatis dalam 2 hari 04:12:09 · Sabtu, 30 Nov 2026 23.59 WIB"*.
- Tombol **Simpan Jadwal**, **Batalkan**, **+1 jam**, **+1 hari**, **+3 hari**.
- Riwayat ringkas: 5 jadwal terakhir (dibuat, dibatalkan, dijalankan oleh siapa).

**Kartu 2: Pesan Admin Utama**
- Pilih tipe (Tutup/Buka/Info), Judul, Isi (textarea dengan penghitung karakter `0/1500`).
- **Pratinjau langsung** persis seperti yang akan dilihat pengguna, memakai komponen modal yang sama.
- Pilihan: *Terbitkan sekarang* atau *Terbitkan saat jadwal berjalan* (K9).
- Pesan aktif: status, waktu terbit, tombol **Ubah (versi baru)** dan **Tarik**.
- Template cepat (bisa diedit), contoh:
  > **Periode Input DJPM 2027 Ditutup**
  > Terima kasih atas partisipasi seluruh admin kecamatan dan Kemenag. Periode input ditutup pada {tanggal}. Perubahan data selanjutnya hanya melalui Admin Utama Dinas Sosial Kota Medan dengan surat resmi.

**Kartu 3: Status Baca (K11)**
- Bilah progres *"48 dari 52 akun sudah membaca (92%)"*.
- Daftar belum membaca: nama, peran, kecamatan, dengan tombol **Salin WA** (memakai pola fitur Salin WA yang sudah ada) untuk mengingatkan.

**Konfirmasi**
- Semua aksi memakai `konfirmasiAksi()` (modal kustom, bukan `confirm()`), menampilkan hari + tanggal + jam WIB lengkap, sisa waktu, dan jumlah akun berpengecualian BUKA (K2).
- Dialog TUTUP manual ditambah kolom pesan opsional (K10). Kalau ada jadwal menunggu, dialog bertanya: *"Batalkan jadwal 30 Nov 23.59?"*.

> **Realisasi T5 (2026-10-19):** berkas baru `public/js/app-pesan-periode.js` (±500 baris) + pengait kecil. Keputusan yang berbeda atau ditambahkan dari rancangan:
>
> - **Aksi alias `ambilStatusPeriode`** (= `statusInputKecKem`, tidak ada di `SWR_CONFIG`) dipakai semua pembacaan sisi pengguna: `waktuServer` selalu segar, tanpa membuang cache. Membuang cache `setelan` akan memicu `periksaStatusAkses` → `terapkanHakAkses` → pembacaan lagi (berantai).
> - **`tandaiPesanDibaca` dikeluarkan dari `MUTATION_INVALIDATIONS`** (kesalahan T3): bridge menyiarkan invalidasi ke SELURUH klien, jadi tiap klik "Mengerti" akan memicu penyegaran di semua admin. Status baca dikelola lokal.
> - **Titik pengait:** `terapkanHakAkses` dibungkus (login, pemulihan sesi, realtime semuanya lewat situ), `bukaModalNotifTutup(res)` di `app-core.js` menggantikan pembukaan modal langsung, tombol X/Mengerti di `index.html` memanggil `tutupModalNotifTutup`/`mengertiModalNotifTutup` dengan cadangan ke perilaku lama.
> - **Penguncian 00:00:** detak 1 detik membandingkan jadwal dengan JAM SERVER; saat habis, status diambil ulang dengan jeda bertahap (0, 1,5, 4, 10, 30 dtk) karena selisih jam bisa beberapa ratus milidetik. Layar dikunci lewat `terapkanHakAkses(…, true)` yang sudah ada.
> - **Modal penutupan sekarang muncul SEKALI per sesi per penutupan** (atau bila ada pesan belum dibaca), bukan tiap penyegaran realtime seperti dulu. Penanda disimpan di `sessionStorage` dengan **username** di kuncinya (satu tab bisa dipakai bergantian akun).
> - **Pesan INFO/BUKA** saat periode terbuka tampil di `modal-pesan-admin` (baru); pesan TUTUP saat periode masih terbuka hanya jadi banner. **MUI** melihat modal pesan untuk semua pesan, tanpa banner.
> - **Perbaikan tampilan yang ditemukan lewat uji visual:** `modal-notif-tutup` tidak punya batas tinggi dan tidak bisa digulir, sehingga dengan kotak pesan judul terpotong dan tombol Mengerti tak terjangkau di HP. Diberi `max-h-[92dvh]`, badan `overflow-y-auto`, header/footer `shrink-0`.
> - **Unggah berkas:** dua pemanggil di `app-transaksi.js` kini memanggil `unggahBerkasDenganIzin` (tanpa menambah baris; ada cadangan langsung-unggah bila skrip baru gagal dimuat). Gagal menghubungi server TIDAK menghalangi unggah (fail-open); penyimpanan tetap diperiksa penuh di server.
> - **Catatan draf formulir:** bila `sessionStorage` memuat `djpm_form_draft_2027`, modal menampilkan peringatan bahwa isian BELUM terkirim.

### 8.2 Pengguna (Kecamatan, Kemenag, Kelurahan, MUI sesuai K8)

**Sebelum tutup (K4, K9)**
- **Banner hitung mundur** baru `#banner-hitung-mundur` di atas panel Input dan Rekap, mulai H-3:
  - biru (> 24 jam) → kuning (≤ 24 jam) → merah (≤ 1 jam), teks *"Periode input ditutup dalam 05:42:10 · 30 Nov 2026 23.59 WIB"*.
  - Bila ada pesan terjadwal bertipe INFO/TUTUP: cuplikan 1 baris + tautan **Baca pesan Admin Utama**.
- Toast H-1, 1 jam, 15 menit, masing-masing sekali per sesi (`sessionStorage`, dibungkus try/catch).

**Saat dan sesudah tutup**
- `#modal-notif-tutup` yang sudah ada **dipertahankan** (judul, daftar "Yang Anda Bisa Lakukan", tombol "Mengerti"), lalu ditambah:
  - Kotak **"Pesan dari Admin Utama"** di antara paragraf pembuka dan `#notif-tutup-meta`: judul tebal, isi (`white-space: pre-line`), *"— {nama admin}, {waktu WIB}"*.
  - Meta "Ditutup pada / Oleh" menampilkan `SISTEM (TIMER) · dijadwalkan oleh {admin}` bila sumbernya timer.
- Tombol **Mengerti** → `tandaiPesanDibaca`, lalu modal tidak muncul lagi untuk versi pesan itu.
- `#banner-tutup` (panel rekap): ditambah cuplikan pesan + tautan **Baca lagi** untuk membuka modal kembali.
- **MUI** (K8): tidak melihat banner tutup/hitung mundur karena memang tidak bisa input, tetapi **tetap melihat modal pesan** sekali per versi.

**Kapan pesan muncul**
| Situasi | Perilaku |
|---|---|
| Login setelah tutup, pesan belum dibaca | Modal tampil |
| Sedang online saat timer habis | Modal tampil otomatis (dari hitung mundur atau event realtime, mana yang lebih dulu) |
| Sudah menekan Mengerti | Tidak muncul lagi, kecuali pesan diubah (versi baru, K12) |
| Admin menarik pesan | Kotak pesan hilang dari modal dan banner (realtime) |
| Offline lalu kembali online | `visibilitychange` / `online` → cek ulang status |

### 8.3 Ketepatan jam & cache
- `selisih = waktuServer − Date.now()` disimpan saat status dimuat, lalu hitung mundur memakai `Date.now() + selisih`.
- Sinkron ulang setiap 5 menit, saat `visibilitychange`, dan saat event `online`.
- Saat hitung mundur mencapai 0 dan saat event realtime `setelan`: `statusInputKecKem` dipanggil **melewati cache** TTL 2 menit.
- Satu `setInterval` 1 detik global (tidak per elemen), dihentikan saat tab tersembunyi agar hemat baterai HP.

### 8.4 Aksesibilitas
- Banner hitung mundur memakai `role="status"` + `aria-live="polite"`, diperbarui per menit (bukan per detik) untuk pembaca layar.
- Modal memakai pola `modal-a11y.js` yang sudah ada (fokus masuk, ESC, fokus kembali).
- Warna banner selalu disertai teks/ikon, tidak hanya warna.

---

## 9. Keamanan

| Ancaman | Penanganan |
|---|---|
| XSS lewat isi pesan | Pesan disimpan **teks biasa**, dirender dengan `textContent`/`esc()`. Pengenalan tautan hanya untuk `https://`, dibuat lewat `createElement('a')` dengan `rel="noopener noreferrer" target="_blank"`, tanpa `innerHTML` |
| Non-UTAMA mengatur jadwal/pesan | Cek peran di server pada setiap aksi tulis |
| Memalsukan status baca orang lain | `tandaiPesanDibaca` memakai `user_id` dari **sesi**, bukan dari parameter |
| Membanjiri `tandaiPesanDibaca` | Upsert idempoten (primary key), tanpa event realtime |
| Mengakali jam dari browser | Semua keputusan di server dengan `now()` Postgres. Jam browser hanya untuk tampilan |
| Membaca tabel langsung via anon key | RLS aktif tanpa policy |
| Kebocoran daftar "belum membaca" (berisi nomor HP) | `ambilStatistikBacaPesan` khusus UTAMA |

---

## 10. Tahapan kerja

| Tahap | Isi | Uji | Jalan balik |
|---|---|---|---|
| **T0** | Branch dari `origin/main`, jawab §4 | — | — |
| **T1** | Migrasi: 3 tabel, `set_master_periode()`, `terapkan_jadwal_periode()`, trigger event bus, job pg_cron | PGlite lokal (`POOL_MAX=1`): jadwal 1 menit → master TUTUP + pesan TERBIT + riwayat, jalankan 2× tetap idempoten | `cron.unschedule('terapkan-jadwal-periode')`. Tabel aditif dibiarkan |
| **T2** ✅ | Server timer: `cekAksesInputUser`, field status tambahan, 3 aksi jadwal, aksi `mulaiUnggahBerkas`, gerbang tunggal `periksaIzinInput`, masa tenggang, `setInputKecKem` memakai fungsi SQL bersama | Uji per baris §5.1, simpan/edit/unggah sebelum, saat, dan sesudah tenggat, cron dimatikan | Deploy ulang versi fungsi `api` sebelumnya |
| **T3** ✅ | Server pesan: 4 aksi pesan, validasi, statistik baca | Uji XSS (`<script>`, `javascript:`), batas panjang, versi pesan, tarik pesan, non-UTAMA ditolak | Sama dengan T2 |
| **T4** ✅ | UI admin: kartu Jadwal, Pesan (+ pratinjau, template), Status Baca, perluasan dialog TUTUP manual | Klik manual semua tombol, waktu di masa lalu ditolak | Revert commit frontend |
| **T5** ✅ | UI pengguna: banner hitung mundur, toast bertahap, kotak pesan di modal + banner, "Mengerti", kunci otomatis 00:00, sinkron jam | Jam HP diubah ±1 jam, HP tidur 10 menit, 2 tab, MUI, offline → online | Revert commit frontend |
| **T6** | Uji gabungan di produksi: jadwal **15 menit** ke depan saat jam sepi, akun uji Kecamatan + MUI | Daftar uji §11 | Batalkan jadwal / tekan BUKA / tarik pesan |
| **T7** | Panduan admin UTAMA (1 halaman) + pengumuman ke admin kecamatan/Kemenag | — | — |

Urutan deploy produksi: **migrasi (T1) → fungsi `api` (T2+T3) → frontend (T4+T5)**. Setiap lapisan kompatibel dengan versi sebelumnya, karena field baru hanya ditambahkan.

Perkiraan: T1 ½ hari · T2–T3 1 hari · T4–T5 1½ hari · T6–T7 ½ hari.

---

## 11. Daftar uji

### Timer (server)
- [ ] Jadwal < 5 menit / masa lalu / > 366 hari → ditolak
- [ ] Jadwal baru menggantikan yang lama (lama → DIBATALKAN)
- [ ] Non-UTAMA memanggil aksi jadwal → ditolak
- [ ] 1 detik sebelum tenggat simpan berhasil, 1 detik sesudah ditolak `TIMER`, **dengan cron dimatikan**
- [ ] Masa tenggang: unggah mulai sebelum tenggat + simpan 3 menit sesudah → berhasil. 6 menit sesudah → ditolak
- [ ] `mulaiUnggahBerkas` setelah tutup (di luar tenggang) → ditolak; di dalam tenggang → sukses tanpa memperbarui penanda
- [ ] Akun pengecualian BUKA tetap bisa simpan (K2)
- [ ] Cron berjalan 2× bersamaan → 1 riwayat saja
- [ ] Auto-cleanup timer = auto-cleanup tombol manual
- [ ] Perpanjang +1 hari setelah tutup → ditolak (jadwal sudah DIJALANKAN; gunakan BUKA manual)

### Pesan (server)
- [ ] Isi `<script>alert(1)</script>` tersimpan apa adanya dan tampil sebagai teks
- [ ] `javascript:` tidak menjadi tautan, `https://…` menjadi tautan
- [ ] Judul > 100 / isi > 1.500 karakter → ditolak dengan pesan jelas
- [ ] Hanya 1 pesan TERBIT, versi baru → versi lama DIGANTI
- [ ] `tandaiPesanDibaca` 2× → 1 baris, user_id dari sesi
- [ ] Statistik baca: jumlah akun aktif non-UTAMA benar, akun nonaktif tidak dihitung

### Tampilan
- [ ] Hitung mundur admin dan pengguna cocok dengan jam server (selisih < 2 detik)
- [ ] Banner muncul H-3, kuning di H-1, merah < 1 jam, toast sekali per sesi
- [ ] Tepat 00:00: tab Input terkunci tanpa refresh, modal + pesan tampil, draf form tidak hilang
- [ ] Jam HP salah ±1 jam → tetap benar
- [ ] HP tidur lalu dibuka setelah tenggat → langsung terkunci + modal
- [ ] Pesan versi baru → modal tampil lagi bagi yang sudah membaca versi lama
- [ ] Tarik pesan → hilang dari layar pengguna dalam beberapa detik
- [ ] MUI melihat modal pesan, tidak melihat banner hitung mundur
- [ ] UTAMA tidak melihat modal pengguna, tetapi melihat pratinjau
- [ ] Tampilan HP 360 px: banner tidak meluber, modal bisa digulir
- [ ] Teks lama di modal dan banner tetap sama persis (tidak ada regresi UI)

---

## 12. Risiko & mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| pg_cron telat atau mati | Pesan/realtime terlambat | Penegakan saat dibaca (§5.1). Browser cek sendiri di 00:00. Pesan bertipe TUTUP juga **ikut tampil dari status TIMER** walau cron belum menerbitkannya |
| Jam HP salah | Hitung mundur keliru | Acuan `waktuServer` |
| Cache 2 menit | Penguncian di layar tertunda | Bypass cache saat 00:00 dan saat event `setelan` |
| Admin salah ketik tanggal/tahun | Tutup terlalu cepat/lambat | Validasi, konfirmasi menampilkan hari + sisa waktu, pratinjau |
| Pesan salah ketik sudah terbit | Informasi keliru ke semua pengguna | Ubah = versi baru (tampil ulang), Tarik tersedia |
| Lonjakan simpan di menit terakhir | Server lambat (DB di Tokyo) | Tenggang 5 menit, idempotency key yang sudah ada, pantau koneksi DB saat T6 |
| Berkas yatim | Penyimpanan Drive terbuang | Aksi `mulaiUnggahBerkas` menolak lebih awal dari frontend baru. Frontend lama/GAS tetap bisa menyisakan sedikit (diterima, lihat §7.2) |
| Badai event saat semua menekan "Mengerti" | Realtime berat | `pesan_admin_dibaca` tidak disiarkan |
| Regresi UI modal/banner lama | Pengguna bingung | Hanya **menambah** elemen, teks lama dipertahankan, uji visual T5 |
| Konflik dengan branch Retur/Cloudflare | Merge sulit | Branch dari `origin/main`, file yang disentuh dipisah dari file Retur |

---

## 13. Runbook operasional

| Situasi | Langkah admin UTAMA |
|---|---|
| Menjadwalkan penutupan | Panel → Jadwal Otomatis → isi tanggal/jam → tulis pesan → *Terbitkan saat jadwal berjalan* → Simpan |
| Kecamatan minta perpanjangan **semua** | Klik **+1 hari** (sebelum tenggat), lalu ubah pesan bila perlu |
| Perpanjangan untuk **satu kecamatan** setelah tutup | Kelola Akses User → set akun itu **BUKA** (pengecualian) |
| Membuka lagi setelah tutup | Tombol **BUKA PERIODE INPUT** (manual) + pesan tipe BUKA opsional |
| Pesan salah | Kartu Pesan → **Ubah** (versi baru) atau **Tarik** |
| Memastikan semua sudah tahu | Kartu Status Baca → **Salin WA** untuk yang belum membaca |
| Darurat: timer tidak boleh jalan | **Batalkan** jadwal. Kalau UI bermasalah: `update jadwal_periode_input set status='DIBATALKAN' where status='MENUNGGU';` |
| Darurat: cron bermasalah | `select cron.unschedule('terapkan-jadwal-periode');`. Penegakan tetap jalan dari server |

---

## 14. Di luar lingkup
- Notifikasi WA/email/push otomatis (bisa menyusul memakai service worker yang sudah ada).
- Tenggat berbeda per kecamatan/layanan (sementara pakai pengecualian per akun).
- Pesan balasan dari pengguna (fitur chat sudah dihapus dan tidak dihidupkan lagi).
- Lampiran berkas pada pesan.
