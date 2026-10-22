# Plan: Wajib "Laporkan Sudah Diperbaiki" sebelum menutup Detail (data berstatus Berkas Tidak Lengkap)

Tanggal: 2026-10-22 · Status: **K1–K8 DISETUJUI user 2026-10-22 ("setuju semua"); K9 diusulkan (bagian 12). Pengerjaan lokal dimulai; deploy hanya atas perintah.**
Bahasa: Indonesia · Pola kerja: bertahap, lokal dulu, deploy hanya atas perintah.

---

## 1. Masalah dan tujuan

**Masalah (laporan user):** untuk data berstatus *Berkas Tidak Lengkap*, user (Kecamatan / Kemenag / MUI) bisa mengganti berkas
lewat **Edit Data → Simpan Perubahan**, lalu langsung **menutup Detail** tanpa menekan tombol laporan. Akibatnya Admin Utama
tidak tahu berkasnya sudah diperbaiki: di Lihat Data data itu tetap tampil "Berkas Tidak Lengkap" biasa, bukan "Dilaporkan".

**Tujuan:**
1. User **wajib** menekan tombol laporan lebih dulu sebelum bisa menutup Detail setelah ia mengganti berkas.
2. Admin Utama **tetap tahu** walau user melewati gerbang itu (tutup tab, refresh, sesi habis, jaringan putus).
3. Tidak ada perubahan perilaku untuk status lain, untuk Admin Utama, maupun untuk alur input baru.

> **Catatan istilah:** tombol milik user di aplikasi bernama **"Laporkan Sudah Diperbaiki"** (`#btn-lapor-perbaikan`).
> "Tandai Sudah Diperbaiki" (`#btn-tandai-sudah-diperbaiki`) adalah tombol **Admin Utama** yang mengubah status menjadi
> Memenuhi Syarat. Plan ini mewajibkan tombol **user** (Laporkan…), bukan tombol admin.

---

## 2. Temuan: cara kerja sekarang (sudah diperiksa di kode)

| Langkah | Tempat | Perilaku |
|---|---|---|
| Admin menandai Berkas Tidak Lengkap + keterangan + batas waktu | `verifikasi.ts` `verifikasiSatuData` | status = `Berkas Tidak Lengkap` |
| User membuka Detail, klik **Edit Data**, ganti berkas, **Simpan Perubahan** | `app-transaksi.js` `simpanEdit` → server `editDataPenerima` (`penerima.ts:896`) | link berkas diganti; `riwayat_edit` mencatat "[link baru]"; **tidak menyentuh** penanda laporan |
| User menekan **Laporkan Sudah Diperbaiki** (tombol terpisah, di bagian atas Detail) | `app-transaksi.js:2354`, server `laporkanPerbaikanBerkas` (`verifikasi.ts:136`) | mengisi `tanggal_lapor_perbaikan` + `dilapor_oleh`; status **tidak** berubah |
| Admin melihat | Lihat Data: lencana biru "Dilaporkan" + filter "Sudah Dilaporkan" (`row[19]`) | hanya muncul bila laporan ditekan |

**Cara menutup Detail (semua jalur):**
1. Tombol ✕ `#tutup-modal-detail` (diberi `onclick` di `tampilkanDetailKeModalOnDemand`, `app-transaksi.js:3029`).
2. Tombol "Tutup Detail" di footer (`index.html:1600`, `onclick` sebaris yang hanya menambah `hidden`).
3. Tombol **Esc** → `modal-a11y.js` meng-klik tombol ✕ (ia berlabel "Tutup").
4. Tidak ada klik di luar modal yang menutup Detail (overlay tidak punya `onclick`).
5. Jalur yang tidak bisa/ tidak perlu diblok: logout, pindah akun, tutup tab, refresh, sesi habis.

**Temuan tambahan yang penting:** pekerjaan otomatis batas waktu (`verifikasi.ts:318–388`) mengubah data **Berkas Tidak Lengkap**
yang `batas_waktu_perbaikan`-nya lewat menjadi **Tidak Memenuhi Syarat** dengan keterangan *"…tanpa perbaikan"*. Pekerjaan itu
**tidak memeriksa** apakah berkas sudah diganti atau sudah dilaporkan. Jadi user yang sudah memperbaiki tetapi lupa melapor
bisa ditolak otomatis padahal berkasnya sudah benar. Ini alasan kuat memberi penanda di server (bagian 4.B) dan perlu
keputusan **K5**.

---

## 3. Akar masalah

Dua langkah yang saling bergantung (ganti berkas → laporkan) dipisah ke dua tombol di dua tempat, dan hanya langkah kedua yang
tercatat sebagai "informasi untuk admin". Tidak ada yang mengaitkan keduanya, dan tidak ada yang mencegah user berhenti
setelah langkah pertama.

---

## 4. Rancangan (dua lapis: gerbang di layar + jaring pengaman di server)

### 4.A Gerbang di layar (yang diminta user)

**Kapan gerbang aktif** ("perlu lapor"): data berstatus *Berkas Tidak Lengkap*, pengguna berperan Kecamatan / Kemenag /
MUI-pemilik-data (bukan Admin Utama), **dan** berkas sudah diganti dan belum dilaporkan sesudah penggantian itu.

**Selama aktif:**
- Di bagian atas Detail muncul kotak peringatan jelas: *"Anda sudah mengganti berkas. Klik 'Laporkan Sudah Diperbaiki' agar
  Admin Utama tahu, baru Detail bisa ditutup."* (kotak laporan yang sudah ada diberi sorotan + digulir ke tampilan).
- Tombol ✕ dan "Tutup Detail" ditandai nonaktif (`aria-disabled`, redup, tooltip alasan). Klik/Esc tidak menutup, hanya
  memunculkan toast: *"Tekan 'Laporkan Sudah Diperbaiki' dulu."*
- Peringatan browser saat user mencoba menutup tab/refresh (`beforeunload`) — upaya terbaik, bukan jaminan.

**Setelah laporan berhasil:** gerbang terbuka otomatis, toast sukses, Detail boleh ditutup.
**Jika laporan gagal (jaringan/server):** pesan + tombol bisa ditekan lagi; gerbang tetap tertutup. Tidak pernah "terkunci
selamanya" karena laporan selalu bisa diulang dan penanda server (4.B) menjaga admin tetap tahu.

**Mengapa dua jalur penutupan dicegat di satu titik:** semua klik tutup (✕, "Tutup Detail", Esc → ✕) melewati modal
`#modal-detail-penerima`; pencegat tunggal di fase *capture* pada modal itu menghentikan klik sebelum sampai ke tombol, tanpa
mengubah `onclick` yang ada.

### 4.B Jaring pengaman di server (supaya admin tetap tahu)

Gerbang di layar bisa dilewati (tutup tab, mati listrik, sesi habis). Karena itu server mencatat sendiri **kapan berkas
terakhir diganti oleh user** pada data Berkas Tidak Lengkap:

- Kolom baru `penerima.tanggal_berkas_diubah timestamptz null`.
- `editDataPenerima`: bila peran ≠ UTAMA **dan** status baris = `Berkas Tidak Lengkap` **dan** ada berkas yang benar-benar
  berganti (link berbeda) → set `tanggal_berkas_diubah = now()`. Memakai data baris yang sudah dibaca di fungsi itu (tanpa query baru).
- Status "perlu lapor" dihitung di server: `tanggal_berkas_diubah is not null and (tanggal_lapor_perbaikan is null or
  tanggal_berkas_diubah > tanggal_lapor_perbaikan)`. Jadi mengganti berkas **lagi sesudah** melapor membuka kewajiban lapor baru.
- Penanda direset (diisi `null`) bersama reset laporan yang sudah ada: `verifikasiSatuData` (semua cabang), `tandaiSudahDiperbaiki`,
  dan pekerjaan otomatis batas waktu. `laporkanPerbaikanBerkas` **tidak** mengubahnya (cukup `tanggal_lapor_perbaikan`).
- Hanya ditulis untuk data Berkas Tidak Lengkap yang diedit non-admin; edit oleh Admin Utama tidak memicu apa pun.

### 4.C Yang dilihat Admin Utama (dan user)

- Lihat Data: lencana amber **"Berkas diubah – belum dilaporkan"** (di samping lencana status), tampil untuk Admin Utama dan juga
  untuk user pemilik data (pengingat). Filter status baru: **"Berkas Diubah (Belum Dilaporkan)"**.
- Detail untuk Admin Utama: keterangan *"Berkas diganti oleh <user> pada <waktu WIB>, belum dilaporkan"* di kotak verifikasi.
- Ekspor Excel **tidak berubah**.

---

## 5. Rincian teknis per lapisan

### 5.1 Database
- Migrasi baru `supabase/migrations/2026102xxxxxxx_kolom_berkas_diubah.sql`:
  `alter table penerima add column if not exists tanggal_berkas_diubah timestamptz;` (kolom nullable pada tabel partisi:
  perubahan metadata, instan, tanpa kunci panjang). Idempoten.
- Terapkan ke produksi dengan `supabase db push --linked --yes`, lalu pastikan tidak ada *drift* skema (pelajaran dari kolom
  rekomendasi MUI yang sempat tak tercatat).

### 5.2 Server (`supabase/functions/api`)
| Berkas | Perubahan |
|---|---|
| `domains/penerima.ts` `editDataPenerima` | set `tanggal_berkas_diubah` (syarat 4.B); kembalikan `berkasDiubah: <jumlah>` pada respons (menambah field, tidak merusak klien lama) |
| `domains/penerima.ts` daftar (7 varian `select`: baris ±84, 99, 120, 132, 145, 160, 305), `petakanBarisLihat`, `ambilBarisLihatDataByIds` | tambah kolom; baris Lihat Data bertambah **indeks 25** = boolean "perlu lapor" (indeks 0–24 tidak berubah) |
| `domains/penerima.ts` detail `ambilDetailPenerimaPerBaris` | `dataLengkap[52]` = waktu berkas diubah (WIB, "" bila kosong), `[53]` = boolean perlu lapor |
| `domains/verifikasi.ts` | reset `tanggal_berkas_diubah = null` di `verifikasiSatuData`, `tandaiSudahDiperbaiki`, pekerjaan otomatis batas waktu |
| `domains/verifikasi.ts` `laporkanPerbaikanBerkas` | tidak berubah (opsional: respons ikut mengembalikan `perluLapor:false`) |

Semua tambahan bersifat **non-breaking** (indeks baru di ujung; frontend lama mengabaikannya) sehingga urutan deploy
migrasi → fungsi → frontend aman dan tiap tahap bisa dibatalkan terpisah.

### 5.3 Frontend
**Batasan keras:** `app-transaksi.js` sudah **3497 dari 3500 baris** (`scripts/verify-lines.js`). Maka logika baru dibuat di berkas
**baru** `public/js/app-wajib-lapor.js`, dan `app-transaksi.js` hanya boleh bertambah **≤ 2 baris** (kait):
1. di `renderBaca(d)`: `if (window.djpmWajibLapor) h += window.djpmWajibLapor.htmlDetail(d);` (mengikuti pola kait `djpmPenandaMui` yang sudah ada, baris 2342);
2. (bila perlu) satu kait di `badgeStatusVerifikasi`/baris tabel untuk lencana amber — atau lewat `window.djpmWajibLapor.badge(row)` seperti `badgePenginputMui`.

`app-wajib-lapor.js` berisi: pencegat penutupan (capture di `#modal-detail-penerima`), kotak peringatan + sorotan,
penonaktifan visual ✕/Tutup Detail, toast, `beforeunload`, lencana + filter, dan pelepasan gerbang setelah
`laporkanPerbaikanBerkas` sukses. Pemuatan: pemuat skrip malas di `app-pesan-periode.js` (`SKRIP_PER_PERAN`) saat ini hanya memuat
untuk `UTAMA` dan `MUI`; ditambah daftar untuk **semua peran non-Admin** (Kecamatan + seluruh peran Kemenag), dan Admin Utama
memuatnya juga untuk lencana/filter. `index.html`: beri `id` pada tombol "Tutup Detail" (tanpa mengubah perilakunya) dan naikkan `?v=`.

**Tidak diubah:** alur Edit Data, validasi, unggah berkas, tombol Admin, periode tutup/timer, RBAC.

---

## 6. Matriks perilaku & kasus tepi

| Situasi | Hasil yang diharapkan |
|---|---|
| Kecamatan ganti berkas pada data *Berkas Tidak Lengkap*, simpan | gerbang aktif; ✕/Tutup Detail/Esc tidak menutup; muncul peringatan |
| …lalu klik **Laporkan Sudah Diperbaiki** | laporan tercatat, gerbang terbuka, bisa ditutup |
| Ganti berkas pada status lain (Proses Verifikasi, Memenuhi Syarat) | **tidak** ada gerbang, tidak ada penanda |
| Hanya ubah teks (nama, alamat) pada Berkas Tidak Lengkap | tidak ada gerbang (bukan perbaikan berkas) |
| Ganti beberapa berkas dalam beberapa kali simpan | gerbang tetap aktif sampai satu kali laporan sesudah simpan terakhir |
| Sudah dilaporkan, lalu ganti berkas lagi | gerbang aktif lagi (penanda lebih baru dari laporan) |
| Muat ulang halaman / buka Detail lagi sebelum melapor | gerbang aktif lagi (dibaca dari server, bukan hanya memori browser) |
| Tutup tab / sesi habis sebelum melapor | admin melihat lencana "Berkas diubah – belum dilaporkan" |
| Admin Utama mengedit berkas | tidak ada gerbang, tidak ada penanda |
| Akun MUI: data Ustadz/Ustadzah yang **dia** input | berlaku sama seperti Kecamatan; data milik Kecamatan tidak bisa ia edit/lapor (aturan yang ada) |
| Periode input ditutup (timer/sakelar) | user tidak bisa mengedit berkas, jadi gerbang tidak terpicu; tombol lapor tetap seperti sekarang |
| Status berubah oleh admin saat user masih membuka Detail | saat dimuat ulang gerbang hilang; `laporkan…` menolak dengan pesan "bukan Berkas Tidak Lengkap" (perilaku yang ada) → gerbang dilepas dan toast menjelaskan |
| Laporan gagal karena jaringan | gerbang tetap, pesan jelas, bisa diulang |
| Mode edit sedang terbuka dengan perubahan belum disimpan | ✕/Tutup Detail mengikuti perilaku sekarang; gerbang hanya aktif setelah simpan berkas berhasil |
| Perangkat sangat lama (Chrome 104–109) | pencegat memakai fase capture standar; tidak memakai fitur baru |

---

## 7. Rencana uji

**Server (PGlite + modul asli, harness yang sudah ada):** edit berkas pada status BTL oleh Kecamatan/Kemenag/MUI-pemilik → kolom
terisi; edit teks saja → tidak; edit oleh UTAMA → tidak; status lain → tidak; lapor sesudahnya → "perlu lapor" false; edit lagi →
true lagi; reset oleh `verifikasiSatuData`/`tandaiSudahDiperbaiki`/pekerjaan otomatis; daftar & detail membawa indeks baru
untuk semua peran tanpa mengubah indeks lama (**regresi terhadap kode lama**); `ambilBarisLihatDataByIds`; MUI bukan pemilik ditolak.
**Uji mutasi** (rusakkan aturan satu per satu, uji harus merah).

**UI (Chrome sungguhan + backend tiruan):** gerbang aktif/lepas; ✕, "Tutup Detail", Esc semuanya diblok; setelah lapor semua
terbuka; muat ulang mempertahankan gerbang; peran UTAMA tak terkena; status lain tak terkena; laporan gagal → tetap
terkunci + bisa diulang; lencana dan filter muncul; **regresi layar semua peran** (identik piksel-demi-piksel seperti uji CSS
sebelumnya, animasi dibekukan); jalankan juga di **tiruan Chrome lama** (oklch/color-mix/gradien dinonaktifkan).

**Produksi (baca-saja + transaksi yang dibatalkan):** migrasi terpasang & skema tanpa drift; uji asap fungsi `api` dengan sesi
sementara (dihapus setelahnya); uji tulis memakai blok `DO` yang diakhiri `raise exception` agar pasti rollback.

**Uji manual user (1 siklus nyata):** buat data tes → Admin Utama tandai *Berkas Tidak Lengkap* → user ganti berkas → coba tutup
(harus diblok) → lapor → Admin melihat "Dilaporkan" → Admin tandai sudah diperbaiki → bersihkan data uji (berkas Drive ikut ke Sampah).

---

## 8. Tahapan pelaksanaan, deploy, dan pembatalan

| Tahap | Isi | Reversibel? |
|---|---|---|
| T1 | Migrasi kolom + server (edit/daftar/detail/reset) + uji server & mutasi — **lokal** | ya |
| T2 | `app-wajib-lapor.js` + kait + `index.html` + pemuat per peran — uji UI & regresi — **lokal** | ya |
| T3 | **Review menyeluruh** (dua kali bila perlu), cek batas 3500 baris | — |
| T4 | Deploy bertahap atas perintah: `db push` → fungsi `api` (v79) → commit & push (Vercel) → uji asap produksi | tiap tahap terpisah |
| T5 | Uji manual user + pemantauan log (5xx, error `editDataPenerima`) | — |

**Urutan deploy aman:** migrasi dulu (kolom tak dipakai siapa pun), lalu fungsi (frontend lama mengabaikan indeks baru),
terakhir frontend. **Pembatalan:** `git revert` commit frontend → gerbang hilang seketika; fungsi bisa dideploy ulang dari
versi sebelumnya; kolom boleh dibiarkan (nullable, tidak berpengaruh).

---

## 9. Keputusan yang dibutuhkan (rekomendasi di kolom kanan)

| # | Pertanyaan | Rekomendasi |
|---|---|---|
| **K1** | Gerbang **ketat** (tidak ada jalan menutup sebelum lapor), atau ketat + tombol kecil "Tutup tanpa lapor" yang meminta konfirmasi? | **Ketat sesuai permintaan**; jaring pengaman server menjamin admin tetap tahu bila user memaksa keluar (tutup tab) |
| **K2** | Gerbang aktif setelah **mengganti berkas** saja, atau setiap kali menyimpan apa pun pada data Berkas Tidak Lengkap? | **Hanya saat berkas diganti** (perbaikan berkas), perubahan teks tidak memicu |
| **K3** | Gerbang ikut **tersimpan di server** (aktif lagi setelah refresh/buka ulang) atau hanya selama Detail terbuka? | **Tersimpan di server** (4.B) |
| **K4** | Tambah lencana + filter "Berkas diubah – belum dilaporkan" untuk Admin Utama (dan pengingat bagi user)? | **Ya** |
| **K5** | Pekerjaan otomatis batas waktu: lewati data yang berkasnya **sudah diganti** (atau sudah dilaporkan) supaya admin yang memutuskan? | **Ya, lewati yang perlu lapor / sudah dilaporkan** — ini mengubah aturan bisnis, jadi butuh persetujuan; bila tidak, biarkan seperti sekarang |
| **K6** | Berlaku untuk Kecamatan, semua peran Kemenag, dan MUI (data miliknya); **tidak** untuk Admin Utama? | **Ya** |
| **K7** | Pertahankan label tombol **"Laporkan Sudah Diperbaiki"**? (Nama "Tandai Sudah Diperbaiki" sudah dipakai tombol Admin Utama.) | **Pertahankan** agar tidak membingungkan dengan tombol admin |
| **K8** | Tambahkan peringatan browser saat menutup tab/refresh ketika gerbang aktif? | **Ya** (upaya terbaik) |

---

## 10. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| User merasa "terkunci" bila tombol laporan gagal terus | pesan jelas, tombol bisa diulang, kotak laporan disorot; log diperiksa; K1 bisa dilonggarkan |
| `app-transaksi.js` melewati 3500 baris | logika di berkas baru, kait ≤ 2 baris, `verify-lines` dijalankan |
| Kolom baru mengubah bentuk data lama | indeks hanya ditambah di ujung; uji regresi terhadap kode lama |
| Reset penanda terlewat di salah satu jalur status | audit semua `update … status_verifikasi` (sudah dipetakan: `verifikasiSatuData`, `tandaiSudahDiperbaiki`, otomatis batas waktu; massal hanya menyentuh status Proses) + uji per jalur |
| Browser lama | tidak memakai fitur baru; diuji di tiruan Chrome lama |
| Kolom koneksi database terbatas (60) | tidak menambah query per permintaan; tambahan hanya kolom pada query yang sudah ada |

---

## 11. Di luar lingkup (sengaja)
Notifikasi WhatsApp otomatis ke admin; mengubah alur verifikasi Admin Utama; mengubah ekspor Excel; mengubah aturan bisnis
batas waktu kecuali **K5** disetujui.

---

## 12. Tambahan K9 (pertanyaan user 2026-10-22): mengembalikan ke "Berkas Tidak Lengkap" bila perbaikan ternyata masih salah

**Keadaan sekarang (diperiksa di kode):**
- Admin Utama sebenarnya **bisa langsung** menekan **"Tandai Berkas Tidak Lengkap"** (tombolnya selalu ada di panel Verifikasi, `app-transaksi.js:2378`)
  pada data yang sudah berstatus Berkas Tidak Lengkap, asalkan mengisi keterangan dan batas waktu baru.
- Tetapi `verifikasiSatuData` (`verifikasi.ts:85–86`) hanya **mengosongkan** `tanggal_lapor_perbaikan` / `dilapor_oleh` bila statusnya
  *Memenuhi Syarat*. Jadi data tetap membawa tanda "Dilaporkan" yang lama, dan di Detail user tampil *"Sudah dilaporkan… menunggu dicek
  ulang"* **tanpa tombol laporan** (`app-transaksi.js:2347–2350`) → user tidak bisa melapor perbaikan kedua.
- Karena itu admin terpaksa memutar: **Tandai Sudah Diperbaiki** (status → Memenuhi Syarat, tanda laporan dikosongkan) lalu **Tandai Berkas
  Tidak Lengkap**. Putaran ini punya efek samping nyata: saat menjadi Memenuhi Syarat data **masuk ke `data_detail`** (sumber Pembayaran,
  `pastikanDataDetailTersinkron`), lalu saat keluar lagi **diarsipkan ke Sheets dan dihapus** (`arsipkanDataDetail`).

**Usulan K9 (rekomendasi: ya):**
1. Server: `verifikasiSatuData` dengan status baru **Berkas Tidak Lengkap** juga mengosongkan `tanggal_lapor_perbaikan`, `dilapor_oleh` dan
   `tanggal_berkas_diubah` (putaran perbaikan baru). Status lain tidak berubah perilakunya.
2. Layar: bila data sudah Berkas Tidak Lengkap, tombol berlabel **"Kembalikan ke Berkas Tidak Lengkap"** + petunjuk *"Perbaikan belum benar? Isi
   keterangan & batas waktu baru"*; status optimistik ikut mengosongkan tanda laporan.
3. Hasilnya: tanpa putaran lewat Memenuhi Syarat, tanpa sentuhan `data_detail`, user melihat tombol **Laporkan Sudah Diperbaiki** lagi dan gerbang (K1)
   aktif kembali setelah ia mengganti berkas.

## 13. Anggaran baris `app-transaksi.js` (batas 3500, sekarang 3497)
Kait yang dibutuhkan: (a) `htmlDetail` di `renderBaca`, (b) lencana "perlu lapor" di sel status, (c) `resetLapor` untuk K9 (ganti 5 pemakaian `memenuhi` di
`jalankanVerifikasi`). Total ±+3 baris → tepat 3500. Bila kurang, rapikan komentar/baris kosong **yang tidak berubah fungsinya** di berkas yang sama.

---

## 14. Catatan realisasi (2026-10-22, pengerjaan lokal T1–T2; BELUM di-deploy)

Selisih terhadap rancangan di atas (semuanya menyederhanakan, tidak mengubah perilaku yang disetujui):
- **Pemuatan skrip:** `app-wajib-lapor.js` (162 baris) dimuat **statis** lewat `<script defer>` di `index.html` (bukan pemuat malas per peran), karena dipakai semua peran dan kecil. Kait di `app-transaksi.js` bersifat *opsional* (`window.djpmWajibLapor`, `window.badgePerluLapor`), jadi bila skrip gagal dimuat aplikasi tetap jalan tanpa gerbang.
- **Kait di `app-transaksi.js`: 0 baris tambahan** (semua mengubah baris yang sudah ada; berkas tetap 3497 baris).
- **Tanpa peristiwa baru di `api-bridge.js`:** setelah laporan sukses, handler yang sudah ada memperbarui `dataAktif[38]/[39]`; ditambah `dataAktif[53] = false` pada baris yang sama.
- **Kotak informasi Admin Utama** menyebut waktu penggantian berkas tetapi **tanpa nama pengganti** (server hanya menyimpan waktu, bukan siapa).
- **Filter** memakai opsi baru di `#filter-verifikasi` ("Berkas Diubah (Belum Dilaporkan)", nilai `Perlu Dilaporkan`) — berlaku juga pada ekspor Excel yang mengikuti filter.
- **Jendela kecil yang diketahui:** setelah *Simpan Perubahan* berkas, Detail dimuat ulang dari server (±1–2 dtk); selama jeda itu gerbang belum terpasang. Server tetap sudah menandai data itu, sehingga Admin Utama melihat lencana walau user menutup Detail pada jeda tersebut.
- **Ukuran perubahan server:** `penerima.ts` (kolom di 7 query, helper `perluLaporBerkas`, indeks daftar 25 / detail 52–53, pencatatan di `editDataPenerima`), `verifikasi.ts` (K9, reset penanda, K5); migrasi `20261022100000_kolom_berkas_diubah.sql`.

---

## 15. Review mendalam (2026-10-22 sore) — temuan & perbaikan

Fokus review: **jalur di mana user bisa terkunci tanpa jalan keluar** (risiko terbesar fitur yang menahan penutupan jendela). Temuan dan perbaikannya:

| # | Temuan | Dampak sebelum diperbaiki | Perbaikan |
|---|---|---|---|
| 1 | **Jebakan nyata:** `renderBaca` menyembunyikan tombol "Laporkan" bila `tglLaporPerbaikan` sudah terisi, padahal berkas bisa diganti LAGI sesudah laporan | user digerbang, kotak menyuruh menekan tombol, tetapi **tombol tidak ada** (terbukti dengan uji) | kondisi tombol: `tglLaporPerbaikan && d[53] !== true` |
| 2 | Pemuatan ulang Detail gagal sesudah "Simpan Perubahan" | gerbang-awal aktif tanpa tombol laporan | pengaman waktu 10 dtk melepas gerbang |
| 3 | Admin sudah mengubah status saat Detail user masih terbuka; laporan ditolak ("bukan berstatus…") | gerbang tak pernah bisa dilepas | `laporGagal`: penolakan PASTI (status berubah/tidak berhak/tak ada) melepas gerbang; galat sementara tetap menahan (bisa diulang) |
| 4 | Kasus tak terduga: gerbang aktif tetapi tombol laporan tidak ada di layar | terkunci | prinsip **fail-open** `pastikanJalanKeluar`: gerbang hanya aktif selama tombol laporan ada |
| 5 | Respons/penyimpanan yang selesai SESUDAH user menutup Detail memasang gerbang pada Detail tertutup | peringatan "tinggalkan halaman?" tanpa Detail terlihat | gerbang hanya dipasang bila Detail **terlihat** |
| 6 | Laporan lama + berkas diganti lagi: daftar menampilkan lencana biru "Dilaporkan" sekaligus lencana amber; filter "Sudah Dilaporkan" & ekspor ikut memuatnya; kotak hijau Admin menyebut laporan basi | informasi kontradiktif | laporan yang berkasnya diganti lagi dianggap **belum dilaporkan** di lencana, filter (tabel & ekspor), dan Detail Admin |

Diperiksa dan **tidak bermasalah**: peran selain `UTAMA` tidak dipetakan ke admin; unggah berkas selalu membuat berkas BARU (tautan baru) sehingga deteksi "berkas berganti" benar; ekspor/backup/Kelola Data membaca kolom bernama (kolom baru tidak menggeser apa pun); trigger event-bus bersifat per statement tanpa daftar kolom dan publikasi realtime `penerima` sudah dilepas; `index.ts` hanya mengekspos aksi di `ALLOWED`; `deno check`: 4 galat identik dengan HEAD (lama, bukan dari perubahan ini).

Pengaman tambahan ini **bukan celah untuk menghindari kewajiban**: server tetap menandai data (`tanggal_berkas_diubah`), sehingga Admin Utama selalu melihat lencana "Berkas diubah · belum dilaporkan" walau gerbang dilepas. Jalan keluar paksa bagi user tetap ada: muat ulang halaman (dengan konfirmasi peramban).
