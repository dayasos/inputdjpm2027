# Penanda koordinat Guru Maghrib Mengaji (Tahap A penanda, Tahap B penolakan)

Latar: koordinat yang salah/perkiraan (mis. tautan "place//@..." tanpa titik penanda, Street View, pencarian teks, rute, di luar Medan, tautan mati) lolos sebagai
Memenuhi Syarat. Keputusan user (2026-11-16): tanpa saklar; beri penanda + pesan; verifikator tak boleh Memenuhi Syarat pada koordinat salah;
petugas lapangan yang mengirim koordinat benar; Tahap B dinyalakan ±2 hari setelah Tahap A tayang.

## Tahap A (penanda saja, tanpa penolakan)
- `_shared/cekKoordinat.ts` penilai KETAT (VALID / TIDAK_VALID + alasan / BELUM_DICEK). Hanya titik pasti yang sah; Google gagal -> BELUM_DICEK, tak pernah dianggap salah.
- Tabel `cek_koordinat` (migrasi `20261117100000_cek_koordinat.sql`, diterapkan user manual) + pg_cron 5 menit -> aksi `jalankanCekKoordinatOtomatis` (jalur `_secret`).
- `domains/cekKoordinat.ts`: penyapu (cache tautan sama, tautan pendek dibuka 3 pekerja jeda 300 ms, anggaran 40 dtk, tautan berubah = dinilai ulang) dan `getPenandaKoordinat` (UTAMA & VERIFIKATOR).
- `public/js/app-penanda-koordinat.js`: lencana di sel status baris tabel + banner di Detail. Teks netral (belum mengancam penolakan).
- Uji: `npm run uji:cek-koordinat`, `npm run uji:cek-koordinat-pg`, layar `scripts/uji/layar/penanda-koordinat.mjs`.
- Perkiraan hasil dari 1.277 tujuan nyata: ±1.146 valid, ±131 tidak valid.

## Tahap B (±2 hari setelah A tayang; belum dikerjakan)
- `verifikasiSatuData` dan `simpanHasilUlang` (SESUAI): tolak Memenuhi Syarat bila koordinat TIDAK_VALID; BTL wajib keterangan yang menyebut "koordinat"; TMS bebas.
- Templat alasan cepat "Koordinat tidak valid: <alasan>". Admin Utama tidak diblokir (hanya peringatan).
- Petugas lapangan ditolak saat menyimpan koordinat TIDAK_VALID, dengan petunjuk "tekan lama titik -> Bagikan -> Salin tautan"; fail-open bila Google gagal.
- Data Memenuhi Syarat yang kini bermasalah (±90) dibereskan lewat Verifikasi Ulang (dikoreksi ke BTL dengan keterangan koordinat).

## Koreksi sekali pakai oleh SISTEM (2026-11-17, lokal, belum tayang)
Data GMM yang sudah Memenuhi Syarat oleh akun verifikator (sudah terhitung pekerjaan/lembur mereka) tetapi koordinatnya TIDAK_VALID diturunkan ke Berkas Tidak Lengkap oleh **SISTEM** (bukan Admin, bukan verifikator).
- Aksi `koreksiKoordinatBermasalah(token, jalankan?, ids?)` di `domains/koreksiKoordinat.ts`, khusus Admin Utama: pratinjau (tanpa perubahan) lalu jalankan dengan daftar id dari pratinjau (satu transaksi per data; riwayat `oleh=SISTEM`, `sumber=OTOMATIS`; Data Detail diarsipkan; maks 300).
- Kandidat: GMM, MS, koordinat TIDAK_VALID terkini, pemverifikasi terakhir VERIF_*, ada riwayat SATU oleh verifikator, tak ada tugas Verifikasi Ulang aktif/selesai. Tidak mengubah hitungan verifikator; tidak masuk kolam Verifikasi Ulang (V12).
- Layar: `public/js/app-koreksi-koordinat.js` (UTAMA saja; tombol "Koreksi koordinat (SISTEM)" di Lihat Data; modal pratinjau + centang + Jalankan). Skrip ?v=20271097.
- Uji: `npm run uji:koreksi-koordinat`, layar `scripts/uji/layar/koreksi-koordinat.mjs`; mutan 20/20 terbunuh atau setara (3 lapisan pengaman ganda sengaja).
- Setelah dipakai: aksi + layar dapat dikeluarkan lagi dari kode (bukan fitur permanen).
