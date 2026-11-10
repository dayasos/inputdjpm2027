# Rencana: Alamat Tugas Guru Maghrib Mengaji (tempat tugas RUMAH) dibuka SEMENTARA untuk petugas GMM

> Versi **1** (2026-11-10) · Status: **SELESAI DI LOKAL (cabang `feat/alamat-gmm-rumah-sementara`), BELUM commit/push/deploy.**
> Permintaan user (2026-11-10): petugas Guru Maghrib Mengaji boleh mengubah Alamat Tugas khusus data GMM yang bertugas di rumah; berlaku **sementara sampai masa input selesai**, sesudahnya kembali seperti semula.

## 1. Keputusan user
1. Hanya untuk data **Guru Maghrib Mengaji yang bertempat tugas RUMAH**; yang bertempat tugas di masjid/lainnya tetap terkunci.
2. Perubahan alamat **tidak menaikkan maupun menurunkan status** verifikasi.
3. **Sementara** sampai masa input selesai; sesudahnya kembali seperti semula.
4. Usulan Claude yang dipakai: hanya **akun peran GMM** (bukan Kecamatan, bukan Admin Utama; Admin Utama tetap bisa lewat Kelola Data).

## 2. Aturan sebelum dan sesudah
| Kondisi (Detail > Edit Data) | Sebelum | Sesudah (sementara) |
|---|---|---|
| Alamat tersimpan berupa tautan | boleh diperbaiki | **sama** |
| Akun GMM, data GMM, tempat tugas RUMAH, alamat sah | terkunci | **boleh diubah** |
| Akun GMM, tempat tugas bukan RUMAH | terkunci | terkunci |
| Akun UTAMA / Kecamatan / MUI / layanan lain | terkunci | terkunci |
| Tempat Tugas | terkunci | terkunci |
Alamat baru tetap diperiksa: bukan tautan, 5-100 karakter, memuat huruf, tidak boleh dikosongkan. Tercatat di Riwayat Perubahan; `data_detail` ikut disinkronkan; kolom `status_verifikasi` tidak disentuh; **tidak memicu wajib-lapor perbaikan** (hanya perbaikan tautan yang memicu, seperti dulu).

## 3. Mekanisme "sementara" (jawaban atas pertanyaan user: trigger atau catatan)
**Berakhir sendiri lewat gerbang periode input yang sudah ada, tanpa trigger baru.** Server memeriksa `periksaIzinInput(sesi, "edit")` SEBELUM aturan alamat. Begitu periode input ditutup (sakelar master, sakelar khusus akun, atau timer), akun GMM ditolak untuk semua edit sehingga pelonggaran tidak dapat dipakai; layar juga menyembunyikan tombol Edit Data. Diuji (uji server memasang "periode ditutup" dan memastikan edit ditolak; uji layar memastikan tombol hilang).
**Catatan penting:** bila periode DIBUKA kembali untuk akun GMM (mis. masa perbaikan), pelonggaran ikut aktif lagi. Karena itu tetap ada **langkah pembersihan** (bagian 4) yang dicatat di memori Claude; dilakukan atas perintah user.

## 4. Langkah pembersihan (mengembalikan seperti semula)
Kembalikan commit perubahan ini (`git revert`) atau hapus manual: fungsi `alamatRumahGmmTerbuka` + konstanta di `_shared/alamatTugas.ts`; `alamatRumahGmmTerbuka`/`terbuka` di `public/js/alamat-tugas.js`; pemakaian `bukaRumahGmm`/`karenaTautan` di `domains/penerima.ts`; dua baris di `app-transaksi.js` (`alamatTugasTerbuka` kembali ke `bolehDiperbaiki(d[9])`; blok catatan tautan kembali ke `alamatTugasTerbuka(d)`); naikkan `?v=` lima skrip di `index.html` bersama-sama; uji-uji terkait. Deploy fungsi `api` + push frontend.

## 5. Berkas yang diubah
`supabase/functions/api/_shared/alamatTugas.ts`, `supabase/functions/api/domains/penerima.ts`, `public/js/alamat-tugas.js`, `public/js/app-transaksi.js` (2 baris, jumlah baris tetap), `index.html` (`?v=20271070` untuk app-core, alamat-tugas, app-transaksi, app-admin, app-kelola-data), uji: `scripts/uji/alamat-tugas.test.mjs`, `scripts/uji/server-alamat-tugas.test.mjs`, `scripts/uji/_harness-server.mjs` (stub izin input dapat dikendalikan uji), `scripts/uji/layar/alamat-rumah-gmm.mjs` (baru). Tanpa migrasi database; perlu deploy fungsi `api`.

## 6. Hasil uji (lokal)
- Node: `uji:alamat-tugas` 52 (termasuk paritas server=layar, 9 uji baru rumah GMM, penutupan periode), seluruh 25 rangkaian `uji:*` hijau.
- Layar Chrome: `alamat-rumah-gmm.mjs` 11/11; `form-input-pengingat-alamat` dan `kelola-data-validasi` tetap lulus.
- Percobaan merusak kode: 13 mutan, 13 tertangkap.
- `check-css`, `verify-html`, `vite build` OK.

## 7. Tinjauan ulang (2026-11-10, permintaan user)
- Diff dibaca ulang; peran di database sama persis dengan yang diperiksa kode ("GURU MAGHRIB MENGAJI", 24 akun).
- Data nyata (baca saja): 1.324 data GMM bertempat tugas RUMAH, **0** terhubung ke rumah ibadah (`rumah_ibadah_id` kosong), **0** rumah ibadah bernama RUMAH/LAINNYA, 0 tempat tugas berspasi tepi -> pencarian rumah ibadah saat alamat berubah tidak menemukan apa pun, wilayah dan tautan rumah ibadah tidak terpengaruh.
- Teks bantuan kolom diperjelas untuk kedua kasus: "Tulis alamat sebenarnya (jalan, nomor, lingkungan), bukan tautan" (jumlah baris `app-transaksi.js` tetap).
- Tampilan mode edit diperiksa lewat tangkapan layar: Alamat Tugas dapat diketik, Tempat Tugas dan Jenis Layanan tetap abu-abu terkunci.
- Uji ulang: `uji:alamat-tugas` 52, layar 11/11, `form-input-pengingat-alamat` lulus.
