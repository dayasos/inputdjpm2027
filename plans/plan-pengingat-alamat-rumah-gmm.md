# Plan: Pengingat alamat tugas untuk Guru Maghrib Mengaji bertempat tugas "RUMAH" (Tahap 0)

Tanggal: 2026-10-30. Status: KODE SELESAI + UJI LULUS di cabang lokal `pengingat-alamat-rumah-gmm` (belum push/deploy). Induk: `plan-cek-alamat-tugas-gmm.md`.

## 1. Tujuan dan keputusan user
Mencegah kesalahan BARU: petugas input mengisi Alamat Tempat Tugas dengan alamat rumah/domisili, padahal berkas guru menulis tempat tugas lain, sehingga tim monitoring Dinsos salah alamat.
Keputusan user (2026-10-30):
1. Pengingat tampil **setiap kali** tempat tugasnya Rumah, baik alamat sama maupun tidak sama dengan domisili.
2. Hanya layanan **GURU MAGHRIB MENGAJI**.
Pesan (persis): *"Pastikan alamat tugas sudah benar karena akan berpengaruh ketika Tim Verifikasi dari Dinas Sosial akan melakukan monitoring."*

## 2. Temuan penting dari kode
- Untuk GMM, memilih jenis "RUMAH" di jendela **Pilih Data** mengisi tempat tugas "RUMAH" otomatis dan meminta alamat dengan placeholder **"Masukkan Alamat Rumah Lengkap"** (`renderGmmContent`, app-admin.js). Kalimat itu sangat mungkin penyebab alamat domisili tersalin. Placeholder diganti menjadi **"Alamat tempat guru mengajar, sesuai berkas"** (perubahan teks saja, perilaku tidak berubah).
- Di Detail > Edit, Tempat Tugas dan Alamat Tugas **baca-saja**; hanya Admin Utama yang dapat mengubahnya (Kelola Data). Karena itu pengingat cukup di form Input.
- Semua 746 data nyata bertempat tugas persis "RUMAH" (tidak ada varian), sehingga aturan kata utuh aman.

## 3. Isi perubahan (hanya tampilan; tanpa migrasi, tanpa perubahan server)
- `public/js/pengingat-alamat-rumah.js` (baru): `layananGmm`, `tempatTugasRumah` (kata utuh RUMAH/RMH; "RUMAH IBADAH ..." dan "RUMAHKU" tidak), `perluPengingat`, `sama` (bandingkan alamat tanpa peduli huruf/spasi/tanda baca), `PESAN` (satu sumber).
- Tiga titik pengingat, semuanya hanya muncul untuk GMM + RUMAH:
  1. **Jendela Pilih Data jenis RUMAH**: kotak amber di atas tombol Simpan Data (tempat petugas mengetik alamat).
  2. **Catatan di bawah kolom Alamat Tempat Tugas** di form (muncul otomatis setelah Simpan Data, atau bila diketik).
  3. **Jendela Konfirmasi Penyimpanan Data**: kotak amber berisi pesan, alamat tugas yang akan disimpan, dan, bila SAMA dengan domisili, peringatan tambahan.
- Tidak memblokir: tidak mengubah tombol Simpan, tidak memasang kunci blok, tidak melempar galat.
- Versi skrip dinaikkan: `app-transaksi.js` dan `app-admin.js` ke 20271058; modul baru 20271058.

## 4. Uji
- `npm run uji:pengingat-alamat` (10 uji: aturan, perbandingan, kabel HTML/JS, tidak memblokir, kelas CSS). 8 mutan perusak tertangkap semua.
- `node scripts/uji/layar/form-input-pengingat-alamat.mjs` (Chrome 390 px, server dev `npx vite --port 3123 --strictPort`; 18 pemeriksaan + 3 tangkapan layar tanpa data nyata): pesan persis, tersembunyi bagi layanan lain / tempat masjid / "RUMAH IBADAH", hilang saat berganti layanan, tidak meluber, jendela konfirmasi muat di layar.
- Regresi: `uji:validasi-penerima` 75, `uji:cek-status` 35, `uji:worker-cek-status` 31, `uji:gerbang-aksi` 6, `uji:cek-status-tanggal` 12, `uji:cek-status-seo` 8, `uji:cover` 14, `uji:pencarian` 10, `uji:wajib-daftar-ri` 15, `uji:tautan-ri` 16, `uji:rumah-ibadah-id` 24, `uji:sinkron-detail` 10; `check-css` OK (tidak ada kelas baru).

## 5. Rilis dan pemulihan
- Rilis = hanya frontend: push ke `main` (Workers Builds). Tanpa deploy fungsi `api`, tanpa migrasi. **Menunggu izin push user.**
- Perangkat dengan versi lama tersimpan di browser mendapat pengingat setelah dimuat ulang (skrip dimuat network-first oleh service worker).
- Pemulihan: `git revert` commit lalu push.

## 6. Di luar cakupan
Layanan selain GMM (mis. Bilal Jenazah, 75 data "RUMAH"); mengubah data lama (tugas fitur Cek Alamat); validasi yang memblokir; Detail > Edit (alamat tugas baca-saja).

## 7. Tinjauan mendalam (2026-10-31) dan perbaikannya
Tiga masalah nyata ditemukan dan sudah diperbaiki, masing-masing dijaga uji yang gagal bila perbaikannya dibuang:
1. **Jendela konfirmasi tidak terjangkau di layar kecil.** Di 320x568 isi jendela (dengan pengingat + peringatan "SAMA") lebih tinggi dari layar, terpotong 43-50 px di atas dan tidak bisa digulir, sehingga tombol "Ya, Simpan Data" di luar layar: petugas di ponsel kecil tidak bisa menyimpan. Perbaikan: wadah jendela diberi `max-h-[92vh] max-h-[92dvh] overflow-y-auto` (pola yang sama dengan jendela lain; tanpa kelas CSS baru). Uji kini menggulir ke dasar jendela dan mensyaratkan kedua tombol berada di dalam layar (320x568 dan 360x640), termasuk jendela "Pilih Data".
2. **"Ganti Pilihan" meninggalkan catatan menempel.** `bukaKunciTempatTugas()` mengosongkan kolom lewat kode tanpa event, sehingga catatan tetap tampil padahal kolom kosong. Perbaikan: pemanggilan penyegar di akhir fungsi itu (app-core.js, dijaga `typeof`). Versi `app-core.js` dinaikkan ke 20271058.
3. **Pemulihan draf tidak menampilkan catatan.** `pulihkanDrafLokalForm()` mengisi tempat tugas tanpa event. Perbaikan: penyegar dipanggil tepat setelah nilai dipulihkan.
Penguatan lain: pengecualian "RUMAH IBADAH" kini menerima pemisah apa pun (`RUMAH-IBADAH`, `RUMAH.IBADAH`, `RUMAH / IBADAH`).

Diperiksa dan aman: hanya satu pembuka jendela konfirmasi (tidak ada jalur lolos); semua nilai ditulis lewat `textContent`; modul yang gagal dimuat tidak merusak form (semua pemanggilan dijaga); tidak ada galat JavaScript tak tertangani saat uji; versi skrip 20271058 unik terhadap yang live (origin/main tidak berubah); `vite build` lolos dan berkas baru ikut terbawa; `check-css` OK; CSS yang di-commit tidak berubah.
Uji akhir: 11 uji Node (+ 11 mutan perusak tertangkap), uji Chrome semua lulus, 14 rangkaian regresi hijau.
Catatan: perbandingan "SAMA dengan domisili" sengaja hanya kesamaan persis (setelah abaikan huruf/spasi/tanda baca); kemiripan sebagian tidak dihitung agar peringatannya tidak keliru.
