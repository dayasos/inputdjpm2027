# Plan: Larang tautan (URL) di Alamat Tugas + buka kunci perbaikan untuk data GMM terdampak

Tanggal: 2026-11-05. Status: RENCANA, belum ada kode. Semua langkah deploy/push/migrasi menunggu izin eksplisit user.

## 1. Latar belakang (terukur, 2027)
- 20 dari 1.286 data Guru Maghrib Mengaji (GMM) berisi tautan di `alamat_tugas` (17 maps.app.goo.gl, 2 goo.gl, 1 h5.timemark.com). Hanya GMM; Medan Timur 12, Medan Marelan 8; semuanya tempat tugas RUMAH, `link_koordinat_lokasi` terisi.
- Status: 19 "Berkas Tidak Lengkap" (keterangan baku: ALAMAT TUGAS TIDAK BOLEH DALAM BENTUK HTTPS://.. HARUS ALAMAT ...), 1 "Memenuhi Syarat" (tanpa keterangan).
- Riwayat edit: 22 perubahan Alamat Tugas (31 Okt - 2 Nov) oleh 2 akun peran GMM, hampir semuanya MENGISI tautan -> jalur Cek Alamat juga meloloskan tautan.
- Penyebab sistem: tidak ada validasi apa pun terhadap isi Alamat Tugas selain `maxlength=100` (formulir input) dan 500 (Kelola Data).
- "Kunci" yang dialami petugas: di layar Detail > Edit (`public/js/app-transaksi.js`, `renderEdit`), kolom indeks 8 (Tempat Tugas) dan 9 (Alamat Tugas) TIDAK ada di `KOLOM_TEKS`, sehingga tampil abu-abu, hanya baca. Server (`editDataPenerima`, `penerima.ts` ~1006-1210) sebenarnya sudah menerima `teks[9]` dari siapa pun yang berhak edit -> kuncinya hanya di layar, bukan di server.

## 2. Keputusan user (2026-11-05)
1. Setuju: tolak tautan di sumber (server + layar).
2. Data yang sudah ada: buka kunci khusus untuk data GMM terdampak agar petugas bisa langsung mengedit Alamat Tugas.
3. Data "Memenuhi Syarat" dikembalikan ke "Berkas Tidak Lengkap" bila alamatnya masih tautan.

## 3. Definisi "tautan" (satu fungsi, dua salinan identik)
Alamat Tugas dianggap tautan bila setelah dirapikan (trim, huruf besar/kecil diabaikan) mengandung salah satu:
- skema `http://` atau `https://` (juga `HTTPS:` tanpa garis miring, karena user mencari "https:");
- awalan `www.`;
- domain peringkas/peta yang dikenal: `goo.gl`, `maps.app`, `google.com`, `bit.ly`, `timemark.com`, `share.google`, `wa.me`;
- pola umum `nama.tld` tanpa spasi (tld: com, id, co.id, net, org, app, link, gl, me, ly) yang diikuti `/` atau akhir kata.
Tidak boleh ada positif-palsu: singkatan alamat seperti "JL. MAWAR NO.5", "GG. PERSATUAN", "KOMP. ...", "DSN. I" harus lolos.
- Server: `supabase/functions/api/_shared/alamatTugas.ts` (fungsi murni `mengandungTautan(teks)` + `PESAN_ALAMAT_TAUTAN`).
- Layar: `public/js/alamat-tugas.js` (salinan identik, dimuat sebelum app-transaksi.js; mengikuti pola `koordinat-lokasi.js` + `_shared/koordinat.ts`).
- Uji paritas: kedua salinan memberi hasil sama pada seluruh korpus uji.

Pesan galat (satu kalimat, sama di server dan layar):
"Alamat Tugas tidak boleh berupa tautan (https://...). Tulis alamat sebenarnya (jalan, nomor, lingkungan). Tautan Google Maps isi di kolom Koordinat Lokasi."

## 4. Aturan penolakan (Langkah A) - semua jalur tulis
Prinsip: tolak hanya bila nilai Alamat Tugas yang akan TERSIMPAN adalah tautan DAN nilai itu baru/berubah. Edit kolom lain (mis. Koordinat Lokasi, berkas) pada data lama yang alamatnya masih tautan TIDAK diblokir, supaya 20 data tidak terkunci dalam perbaikan lain.

| Jalur | Berkas | Aturan |
|---|---|---|
| Input data baru | `penerima.ts` simpan baru + `validasiDataBaru` | tolak bila `alamatTugas` mengandung tautan (semua layanan) |
| Edit Detail | `penerima.ts` `editDataPenerima` | tolak bila `teks[9]` berubah dan hasilnya tautan |
| Kelola Data (Admin Utama) | `kelolaData.ts` (kolom `alamat_tugas`) | tolak bila diubah menjadi tautan |
| Cek Alamat (perbaikan admin GMM) | `cekAlamatTugas.ts` perbaikan (~447-480) | tolak bila alamat baru tautan (jalur ini terbukti meloloskan tautan) |
| Layar input | `app-core.js`/`app-transaksi.js` (blur + submit) | tolak dengan pesan sama (cermin server; server tetap penentu) |
| Layar edit Detail | `simpanEdit` | cermin server |
| Layar Kelola Data & Cek Alamat | `app-kelola-data.js`, `app-cek-alamat.js` | cermin server |
Dikecualikan dengan sengaja: `master.ts` (~812-848, ganti alamat rumah ibadah dari daftar resmi, bukan input petugas) - diperiksa ulang saat implementasi; bila ternyata nilai dapat berisi tautan, ditambahkan.

## 5. Buka kunci terbatas (Langkah B) - REVISI 2026-11-05 (dipersempit user)
Kunci dibuka dengan SATU syarat (bukan daftar ID): `alamat_tugas` TERSIMPAN saat ini mengandung tautan (layanan apa pun; praktiknya hanya 20 data GMM).
Penguncian kembali: begitu petugas menyimpan alamat sah (bukan tautan), syarat tak terpenuhi lagi -> kolom terkunci seperti semula, otomatis, tanpa penanda tambahan. Petugas lalu menekan "Laporkan Sudah Diperbaiki" lewat alur wajib-lapor yang sudah ada (dipicu `tanggal_berkas_diubah`). Salah ketik sesudah tersimpan hanya bisa dibetulkan Admin Utama (Kelola Data).
Larangan: nilai baru yang berupa tautan selalu ditolak (Langkah A), jadi kolom terbuka tidak bisa diisi tautan lagi.
(Syarat lama "GMM + RUMAH" dihapus; tempat tugas tetap terkunci. Untuk layanan wajib-daftar, pagar `periksaTempatTugasDariDaftar` server tetap berlaku.)
Layar (`renderEdit`): bila syarat terpenuhi, kolom Alamat Tugas (indeks 9) dirender sebagai kolom isian (maks 100, label diberi petunjuk "isi alamat sebenarnya, bukan tautan"); Tempat Tugas tetap abu-abu. Syarat dihitung dari `dataAktif[9]` dengan fungsi `mengandungTautan`.
Server (`editDataPenerima`): tambahkan gerbang untuk perubahan `teks[9]`:
- diizinkan hanya bila alamat LAMA mengandung tautan (syarat B), ATAU peran UTAMA (perilaku saat ini untuk UTAMA tidak berubah; lewat Kelola Data), dan nilai baru bukan tautan;
- jalur lain (mis. permintaan buatan yang mengubah alamat tugas tanpa syarat B) ditolak dengan pesan "Alamat Tugas hanya dapat diubah untuk data GMM yang masih berupa tautan."
- CATATAN keputusan: ini juga menutup celah yang ada sekarang (kunci hanya di layar). Bila user ingin tidak mengubah perilaku server untuk kasus lain, gerbang server dibatasi hanya menolak tautan (Langkah A) - ditanyakan di bawah.
- Pengubahan tetap melewati semua pagar lama: izin periode (`periksaIzinInput "edit"`; periode tutup = tetap ditolak), wilayah/kelurahan akun, `periksaTempatTugasDariDaftar`, penautan `rumah_ibadah_id`, `riwayat_edit` (kolom "Alamat Tugas" tercatat siapa/kapan/sebelum/sesudah).
- Data berstatus "Tidak Memenuhi Syarat" tetap tidak bisa diedit (tombol Edit tersembunyi) - tidak diubah.
Pelaporan perbaikan: bila alamat diubah pada data "Berkas Tidak Lengkap" oleh non-UTAMA, ikut set `tanggal_berkas_diubah` (seperti perubahan berkas/koordinat saat ini) agar Admin Utama tahu data siap diverifikasi ulang. Dicek dulu di `verifikasi.ts`/`wajibLapor` bahwa memasukkan perubahan alamat ke pemicu itu tidak merusak alur "Laporkan Sudah Diperbaiki".

## 6. Data "Memenuhi Syarat" yang alamatnya masih tautan (Langkah C) - 1 data
- Kembalikan ke "Berkas Tidak Lengkap" dengan keterangan baku: "ALAMAT TUGAS TIDAK BOLEH DALAM BENTUK HTTPS://.. HARUS ALAMAT SEBENARNYA".
- Dilakukan lewat jalur verifikasi resmi (fungsi di `verifikasi.ts` / layar Verifikasi oleh Admin Utama), BUKAN SQL mentah, supaya `batas_waktu_perbaikan`, riwayat verifikasi, dan sinyal realtime konsisten. Bila Admin Utama lebih suka, saya siapkan SQL yang meniru persis kolom yang disentuh fungsi tersebut (diperiksa dulu), dengan satu transaksi + kontrol "tepat 1 baris".
- Dijalankan SETELAH Langkah A+B live (supaya petugas langsung bisa memperbaiki), dan hanya bila saat itu alamatnya masih tautan (kondisi diulang dalam klausa WHERE).
- Identitas data tidak ditulis di plan ini; dicari ulang lewat kueri saat eksekusi.

## 7. Pengujian
1. Unit murni `mengandungTautan`: korpus positif (https://, HTTPS:, www., maps.app.goo.gl, goo.gl, h5.timemark.com, share.google, bit.ly, "JL X https://..." campuran) dan korpus negatif alamat nyata ("JL. SM RAJA NO.5", "GG. PERSATUAN", "KOMP. ...").
2. Korpus nyata (baca-saja): jalankan fungsi pada SELURUH `alamat_tugas` 2026+2027 -> harapan: tepat 20 cocok (+ nol positif-palsu); hasil selisih dilaporkan sebelum lanjut.
3. Paritas server<->layar (vm) pada korpus yang sama.
4. Server (harness DB tiruan): input baru tautan ditolak; edit teks[9] tautan ditolak; edit kolom lain pada data beralamat-tautan TETAP lolos; edit teks[9] alamat sah pada data syarat-B lolos + riwayat + `tanggal_berkas_diubah`; edit teks[9] pada data non-syarat-B (mis. layanan lain) ditolak untuk non-UTAMA; periode tutup menolak; Cek Alamat tautan ditolak; Kelola Data tautan ditolak.
5. Layar (vm): kolom indeks 9 terbuka hanya saat syarat B; tetap terkunci untuk layanan lain/alamat normal; pesan tampil.
6. Kontrol negatif: cabut aturan (atau gerbang) -> uji kunci harus gagal.
7. Seluruh suite lama (21 skrip / 439 uji) tetap lulus; esbuild bundle-check; tsc (5 galat lama saja); skrip uji baru didaftarkan di package.json (`uji:alamat-tugas`).

## 8. Rilis bertahap (reversibel)
1. Tulis kode + uji lokal (tanpa deploy).
2. Review menyeluruh (tinjauan ulang "sangat hati-hati").
3. Commit lokal -> menunggu izin "deploy fungsi api" (versi > v108) -> verifikasi pasca-deploy: panggilan uji ke jalur input/edit dengan tautan ditolak, alamat sah lolos (data uji dibatalkan/tidak disimpan; tidak memakai data nyata).
4. Menunggu izin "push" (frontend, naikkan `?v=` di index.html; tidak ada kelas Tailwind baru -> CSS tak perlu dibangun ulang, tetap `npm run check-css`).
5. Langkah C (1 data) setelah A+B live + izin.
6. Pasca-rilis: pantau log 1-2 hari; tanya petugas Medan Timur/Marelan; hitung ulang jumlah tautan tersisa (target menurun dari 20 ke 0 seiring perbaikan).
Rollback: deploy fungsi versi sebelumnya (v108) + revert commit frontend; tidak ada migrasi/skema, tidak ada perubahan data oleh kode.

## 9. Yang TIDAK dikerjakan
- Tidak mengubah isi Alamat Tugas 20 data lewat SQL (alamat sebenarnya hanya diketahui petugas).
- Tidak menyentuh layanan lain selain aturan "tolak tautan" (berlaku semua layanan, tetapi hanya GMM yang punya data terdampak).
- Tidak mengubah tampilan Tempat Tugas (tetap terkunci).

## 10. Pertanyaan terbuka (default yang akan dipakai bila tidak dijawab)
- P1: Gerbang server Langkah B juga menolak perubahan Alamat Tugas oleh non-UTAMA di luar syarat B (menutup celah "kunci hanya di layar")? DEFAULT: ya (selaras dengan permintaan user "hanya bagi data yang alamatnya url").
- P2: Perbaikan alamat pada data "Berkas Tidak Lengkap" memicu `tanggal_berkas_diubah` (wajib lapor)? DEFAULT: ya - ini yang membuat petugas bisa "melaporkan" setelah edit.
- P3: Periode input ditutup -> tetap ditolak (tidak ada pengecualian)? DEFAULT: ya, ikut periode.

## 11. STATUS IMPLEMENTASI (2026-11-05) - KODE SELESAI + UJI LULUS LOKAL, BELUM commit/deploy/push
- Baru: `_shared/alamatTugas.ts`, `public/js/alamat-tugas.js`, `scripts/uji/alamat-tugas.test.mjs`, `scripts/uji/server-alamat-tugas.test.mjs`; skrip npm `uji:alamat-tugas`.
- Diubah: `penerima.ts` (input baru; `editDataPenerima` = pembungkus 3 parameter + `editDataPenerimaInti`), `cekAlamatTugas.ts` (memakai inti dgn opsi internal), `cekAlamatInti.ts`, `validasi.ts`, `kelolaData.ts`; layar: `app-transaksi.js`, `app-core.js`, `app-admin.js`, `app-kelola-data.js`, `app-cek-alamat.js`, `index.html` (?v=20271064).
- Penyimpangan dari rencana (disengaja, hasil telaah kode):
  1. Admin GMM memperbaiki lewat Cek Alamat (alur sah, alamat RUMAH sah -> alamat sah lain). Kunci "hanya bila masih tautan" TIDAK berlaku di jalur itu (opsi internal `dariCekAlamat`, tak dapat diset klien), tetapi tautan tetap ditolak.
  2. Kunci server hanya untuk perubahan Alamat Tugas SAJA. Pindah Tempat Tugas bersama alamatnya tetap lewat pagar lama (Tempat Tugas tidak punya kunci server sebelumnya; di luar permintaan).
  3. Peran yang mengedit data GMM = akun layanan "GURU MAGHRIB MENGAJI" per kecamatan dan UTAMA (akun KECAMATAN tidak berhak atas layanan Kemenag).
- Bukti: 474 uji lulus (PGlite aktif, 0 dilewati); 10 mutasi (kontrol negatif) semuanya tertangkap; tsc hanya 5 galat lama; bundle esbuild ok; polanya diukur pada 19.542 alamat_tugas (2026+2027): tepat 20 cocok, 0 positif-palsu, 0 di 2026, 0 non-GMM.
- Sisa: commit -> deploy fungsi api (> v108) -> push -> Langkah C (1 data Memenuhi Syarat) -> pantau.

### Tambahan 2026-11-05 (persetujuan user): Tempat Tugas ikut dikunci di server
- `editDataPenerima` menolak perubahan Tempat Tugas (PESAN_TEMPAT_TERKUNCI); perubahan hanya lewat Kelola Data (Admin Utama). Izin internal `bolehPindahTempat` HANYA dipakai uji (menjaga pagar perpindahan tempat); dijaga uji kabel agar tak dipakai kode produksi.
- Bukti akhir: 479 uji lulus (0 dilewati), 11 mutasi tertangkap, tsc 5 galat lama.

### Hasil tinjauan ulang (2026-11-05, "sangat hati-hati") - temuan yang sudah diperbaiki
1. ReDoS: pola nama-domain kuadratik pada teks panjang bertitik berulang (50.000 karakter = ±8 dtk; server menerima teks tanpa batas di jalur edit/simpan). Perbaikan: pemeriksaan per jendela 1.000 karakter (tumpang 200) = linear (±0,2 dtk); batas 1.000 karakter di input baru & edit; pengganti maks 100 karakter (sama dgn kolom isian).
2. Cek Alamat: GMM bisa menjawab "Sudah benar" untuk alamat yang masih tautan. Kini ditolak (harus "Perbaiki alamat tugas"); "Belum pasti" tetap boleh.
- Bukti akhir: 484 uji lulus (0 dilewati), 13 mutasi tertangkap, tsc 5 galat lama, bundle ok, sintaks semua skrip klien ok.
