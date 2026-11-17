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

## Tahap B (DIKERJAKAN 2026-11-17, tanpa saklar)
Modul `domains/gerbangKoordinat.ts`, GAGAL-TERBUKA (Google/DB bermasalah = lolos; penyapu tetap menandai kemudian). Admin Utama tidak pernah diblokir.
- Petugas lapangan menyimpan koordinat (input baru `simpanDataKeSheet`, Edit Data `editDataPenerimaInti` hanya bila tautan BERUBAH): tautan Street View/pencarian/rute/tanpa penanda/di luar Medan/mati ditolak dengan alasan + petunjuk "tekan lama titik -> Bagikan -> Salin tautan". Tautan pendek dibuka (batas 4 dtk).
- Verifikator: `verifikasiSatuData` dan `simpanHasilUlang` tidak boleh menghasilkan Memenuhi Syarat pada koordinat TIDAK_VALID; Berkas Tidak Lengkap wajib menyebut "koordinat" (Verifikasi Ulang: hanya untuk koreksi, bukan SESUAI pada data yang sudah BTL); Tidak Memenuhi Syarat bebas.
- `laporkanPerbaikanBerkas` (petugas): ditolak selama koordinat masih TIDAK_VALID.
- Layar: banner Detail menjelaskan akibatnya (teks beda untuk Admin Utama dan Verifikator). Kunci sementara perbaikan GMM (maintenance) dicabut saat Tahap B tayang.
- Temuan tinjauan mendalam (2026-11-17, sudah diperbaiki): (a) normalizer input mengubah tautan >500 huruf menjadi ?q=lat,lng, jadi Street View panjang tak terlihat server -> gerbang menilai tautan MENTAH (Edit Data) dan formulir input GMM menolak Street View tanpa titik/ID di layar (koordinat-lokasi.js, mode plank); (b) penilai kini membaca nama tempat yang berupa koordinat lengkap (desimal/DMS/Plus Code) dan ?q=loc:, tetapi Street View tetap tidak sah dan tempat ber-ID diutamakan; (c) seluruh pemeriksaan gerbang dibatasi 6 dtk total (gagal-terbuka); (d) koordinat-lokasi.js dinaikkan ke ?v=20271100.
- Uji: `npm run uji:gerbang-koordinat`; mutan 20/20 + 13/13 (tinjauan) terbunuh atau setara. Templat alasan cepat "Koordinat tidak valid" belum dibuat (Admin dapat menambahkannya lewat Kelola templat; pesan penolakan memuat kalimat siap salin).

## Koreksi sekali pakai oleh SISTEM (SELESAI 2026-11-17, kode sudah DIHAPUS)
Data GMM yang sudah Memenuhi Syarat oleh akun verifikator tetapi koordinatnya TIDAK_VALID (36 data) diturunkan ke Berkas Tidak Lengkap oleh **SISTEM** lewat aksi sekali pakai (pratinjau lalu jalankan, khusus Admin Utama; commit 847c609). Hasil terverifikasi di database: 36 data BTL, 36 riwayat oleh=SISTEM sumber=OTOMATIS, hitungan verifikator tidak berubah, Data Detail bersih. Aksi dan layarnya kemudian dihapus dari kode (bukan fitur permanen); data hasilnya tetap.
