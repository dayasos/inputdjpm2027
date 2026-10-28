# Plan: Cek Status Penerima untuk Warga (NIK + Tanggal Lahir)

> Dibuat 2026-10-26, direvisi menjadi rencana lengkap pada hari yang sama.
> **STATUS: F0 (2026-10-26) dan F1 (2026-10-28) SELESAI SECARA LOKAL; F1 belum di-commit. Tidak ada perubahan live.**
> Dokumen ini adalah satu-satunya sumber kebenaran fitur ini; perbarui bagian "Catatan realisasi" (bagian 18) setiap fase selesai.

## Daftar isi
1. Ringkasan
2. Tujuan, ruang lingkup, dan di luar lingkup
3. Keputusan terkunci dan usulan bawaan
4. Fakta sistem saat ini
5. Alur pengguna dan teks layar
6. Kontrak API
7. Desain data
8. Desain server (Worker dan Edge Function)
9. Desain halaman publik dan SEO
10. Model ancaman dan mitigasi
11. Tahapan pelaksanaan (F0 sampai F4)
12. Rencana uji
13. Operasional dan pemantauan
14. Komunikasi dan dukungan
15. Kepatuhan data pribadi
16. Pembagian tugas, dependensi, dan urutan
17. Keputusan terbuka dan syarat go-live
18. Catatan realisasi
19. Lampiran teknis

---

## 1. Ringkasan
Warga membuka satu halaman publik (`/cek-status`, ditemukan lewat Google), mengisi **NIK + tanggal lahir**, lalu melihat **Nama, Layanan, Kecamatan, Kelurahan, dan Status Verifikasi** untuk Tahun Anggaran 2027. Google hanya pintu masuk ke halaman; **pengecekan dilakukan server kita sendiri**, dan hasilnya tidak pernah ada di alamat halaman maupun di Google.

Prinsip rancangan:
1. **Permukaan publik sekecil mungkin**: Edge Function Supabase tetap tertutup; hanya Worker Cloudflare yang boleh memanggilnya (lewat `_secret`).
2. **Tidak membocorkan keberadaan NIK**: semua kegagalan memakai satu pesan dan satu bentuk respons.
3. **Bisa dimatikan seketika** lewat saklar di database.
4. **Bertahap dan reversibel**: tiap fase menunggu persetujuan; sebelum go-live, halaman tidak diindeks dan tidak ditautkan.

## 2. Tujuan, ruang lingkup, dan di luar lingkup
**Tujuan**
- Warga dapat memastikan sendiri status datanya tanpa menghubungi petugas, sehingga beban tanya-jawab di kecamatan/kelurahan berkurang.
- Halaman mudah ditemukan lewat pencarian "djpm" / "cek status dana jasa".

**Dalam lingkup**
- Satu halaman publik + satu endpoint pengecekan (baca saja) untuk tahun anggaran 2027 (`penerima_2027`).
- Pengaman: Turnstile, batas percobaan, saklar, pesan seragam, log tanpa NIK.
- Pembaruan SEO (sitemap, indeks) saat go-live.

**Di luar lingkup (sengaja)**
- Tahun 2026 dan sebelumnya.
- Menampilkan alamat, nomor rekening, nomor HP, berkas, alasan verifikasi, atau nominal/jadwal pencairan.
- Mengubah data apa pun dari halaman publik (hanya baca).
- Login warga / akun Google warga (Google hanya untuk pencarian).
- Notifikasi WhatsApp/SMS otomatis.

## 3. Keputusan terkunci dan usulan bawaan
**Terkunci (dari user, 2026-10-26)**
| # | Keputusan |
|---|---|
| T1 | Tampil: Nama, Layanan, Kecamatan, Kelurahan, Status Verifikasi |
| T2 | Verifikasi kedua: NIK + tanggal lahir, dicocokkan dengan database (`penerima_2027.tanggal_lahir`) |
| T3 | Bila tidak ditemukan, tampil pesan "Tidak Terdata / Belum ada di database Penerima Dana Jasa Pelayanan Kepada Warga Pelayan Masyarakat Kota Medan Tahun Anggaran 2027" |

**Usulan bawaan (dipakai bila user tidak menolak; lihat bagian 17)**
| # | Usulan |
|---|---|
| K1 | Pesan gagal dibuat **satu** untuk "NIK tidak ada" dan "tanggal lahir tidak cocok" (lihat 5.3). |
| K2 | Status "Berkas Tidak Lengkap": tampilkan anjuran menghubungi petugas, **tanpa** rincian alasan atau batas waktu. |
| K3 | Go-live (F3) hanya setelah persetujuan pimpinan Dinas Sosial. |
| K4 | Alamat halaman `https://djpmkotamedan.web.id/cek-status`. |
| K5 | Halaman dibuka terus, dengan saklar untuk mematikan kapan saja. |
| K6 | Teks pengantar status (5.4) disetujui pimpinan, termasuk kalimat "status ini bukan jaminan pencairan". |

## 4. Fakta sistem saat ini (dicek 2026-10-26)
**Data `penerima_2027`** (hanya hitungan)
- 3.136 baris; 3.136 NIK unik; semua NIK 16 digit; tidak ada tanggal lahir kosong; tidak ada nama kosong; tidak ada status kosong.
- Status nyata: **Memenuhi Syarat 2.624 · Proses Verifikasi 399 · Berkas Tidak Lengkap 113**. (Tidak ada "Tidak Memenuhi Syarat".)
- Perlu diperiksa manual sebelum F2: **1** baris tanggal lahir sebelum 1930 (kemungkinan salah ketik), **1** baris kecamatan/kelurahan kosong, **21** baris lahir 1 Januari (wajar, tetapi sering tanggal "bawaan"; berisiko warga salah menyebut).
- Konsistensi umur vs tanggal lahir: 0 baris janggal.

**Akses & infrastruktur**
- RLS aktif **tanpa policy** di `penerima_2027` dan `capil`: peran `anon` tidak bisa membaca. Edge Function memakai peran server.
- Edge Function `api` (Deno) menerima aksi dari `ALLOWED` di `supabase/functions/api/index.ts`; gerbang: `_secret` ATAU `X-Session-Token`; hanya `loginPengguna` publik.
- Worker `worker/index.js` melayani `/api/gas` (proxy + `_secret`), `/api/health`, dan aset statis; `run_worker_first` hanya `["/api/*"]`.
- Pola batas percobaan sudah ada: `supabase/functions/api/_shared/bruteforce.ts` (5 gagal / 15 menit, jendela bergeser) dengan tabel `login_percobaan_gagal`.
- Tabel `setelan` berbentuk `key` / `value` (teks); perubahan tercatat di `riwayat_setelan`.
- Pola migrasi: `create table if not exists` + RLS aktif tanpa policy + `revoke ... from anon, authenticated` (contoh: `20261023100000_log_verifikasi_massal.sql`).
- Tailwind hanya memindai `index.html` dan `public/js/**/*.js` (`tailwind.input.css`). Halaman baru yang berdiri sendiri **tidak** otomatis ter-scan (lihat 9.1).
- Build: `vite build` menyalin `public/` apa adanya ke `dist/`; konfigurasi Vite saat ini satu halaman (tanpa `rollupOptions.input`).

## 5. Alur pengguna dan teks layar
### 5.1 Alur utama
1. Warga mencari di Google, membuka `/cek-status`.
2. Mengisi NIK (16 digit) dan tanggal lahir, menunggu Turnstile lolos, menekan **Cek Status**.
3. Halaman menampilkan kartu hasil atau pesan gagal.
4. Tombol **Cek lagi / Hapus hasil** mengosongkan formulir dan hasil dari layar.

### 5.2 Validasi sisi layar (hanya kenyamanan; server tetap memvalidasi ulang)
- NIK: hanya angka, otomatis membuang spasi/tanda baca, maksimal 16; pesan "NIK harus 16 digit angka" bila kurang.
- Tanggal lahir: pemilih tanggal; menolak tanggal masa depan dan sebelum 1900.
- Tombol aktif hanya bila NIK 16 digit, tanggal terisi, dan Turnstile lolos.

### 5.3 Pesan gagal (seragam, K1)
Berlaku untuk **NIK tidak ada** maupun **tanggal lahir tidak cocok**:
> NIK dan/atau tanggal lahir yang dimasukkan Tidak Terdata atau Belum ada di database Penerima Dana Jasa Pelayanan Kepada Warga Pelayan Masyarakat Kota Medan Tahun Anggaran 2027.
>
> Pastikan NIK dan tanggal lahir sesuai KTP. Bila sudah benar, hubungi petugas Kemenag/Kecamatan/Kelurahan Anda.

Pesan lain (berbeda dari di atas):
| Kondisi | Pesan |
|---|---|
| Format salah | "NIK harus 16 digit angka dan tanggal lahir harus valid." |
| Turnstile gagal | "Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi." |
| Terlalu banyak percobaan | "Terlalu banyak percobaan. Silakan coba lagi dalam 15 menit." |
| Layanan dimatikan | "Layanan cek status sedang tidak tersedia. Silakan coba beberapa saat lagi." |
| Gangguan server | "Terjadi gangguan. Silakan coba lagi nanti." |

### 5.4 Kartu hasil dan penjelasan status (K2, K6)
Kartu menampilkan: Nama · Layanan · Kecamatan · Kelurahan · **Status** (lencana berwarna + satu kalimat).
| Status di database | Lencana | Kalimat penjelas |
|---|---|---|
| Memenuhi Syarat | Hijau | "Data Anda telah diverifikasi dan memenuhi syarat." |
| Proses Verifikasi | Kuning | "Data Anda sedang diperiksa petugas. Silakan cek kembali beberapa hari lagi." |
| Berkas Tidak Lengkap | Merah | "Berkas Anda belum lengkap. Hubungi petugas Kemenag/Kecamatan/Kelurahan Anda untuk melengkapinya." |
| (nilai lain / tak dikenal) | Abu-abu | "Status: <teks apa adanya>." |

Catatan kaki (disetujui pimpinan, K6): "Status ini bukan jaminan pencairan. Informasi ini hanya untuk pemilik NIK; jangan bagikan hasil ini kepada orang lain."

## 6. Kontrak API
### 6.1 Browser → Worker: `POST /api/cek-status`
Permintaan (`Content-Type: application/json`):
```json
{ "nik": "1271010101900001", "tanggalLahir": "1990-01-31", "turnstileToken": "<token>" }
```
Respons (selalu JSON, `Cache-Control: no-store`):
| Kasus | HTTP | Isi |
|---|---|---|
| Berhasil | 200 | `{ "sukses": true, "data": { "nama": "...", "layanan": "...", "kecamatan": "...", "kelurahan": "...", "status": "Memenuhi Syarat" } }` |
| Tidak terdata (NIK tidak ada **atau** tanggal lahir salah) | 200 | `{ "sukses": false, "kode": "TIDAK_TERDATA" }` |
| Format salah | 400 | `{ "sukses": false, "kode": "FORMAT" }` |
| Turnstile gagal | 403 | `{ "sukses": false, "kode": "TURNSTILE" }` |
| Terkunci / batas | 429 | `{ "sukses": false, "kode": "TERKUNCI" }` |
| Dimatikan | 503 | `{ "sukses": false, "kode": "NONAKTIF" }` |
| Galat server | 500 | `{ "sukses": false, "kode": "GALAT" }` |
Teks pesan ditampung di halaman (bukan di API), supaya mudah diubah tanpa menyentuh server.

### 6.2 Worker → Edge Function: aksi `cekStatusPublik`
`POST` ke Edge Function dengan `{"action":"cekStatusPublik","args":["<nik>","<yyyy-mm-dd>"],"_secret":"..."}`. Aksi ini **tidak** didaftarkan sebagai aksi publik tanpa gerbang (berbeda dari `loginPengguna`); hanya jalur `_secret` yang bisa memanggilnya.

## 7. Desain data
### 7.1 Tabel baru: `cek_status_percobaan`
```sql
create table if not exists public.cek_status_percobaan (
  kunci            text primary key,                 -- 'nik:' || hex(sha256(pepper || nik))
  jumlah_gagal     integer     not null default 0,
  jendela_mulai    timestamptz not null default now(),
  terkunci_sampai  timestamptz
);
alter table public.cek_status_percobaan enable row level security;
revoke all on table public.cek_status_percobaan from anon, authenticated;
```
- Menyimpan **hash NIK**, bukan NIK. Kunci yang sama dipakai untuk NIK yang **tidak ada** (sehingga penguncian tidak membocorkan keberadaan NIK).
- Pembersihan: baris yang `jendela_mulai` lebih dari 1 hari dihapus oleh `pg_cron` (pola sama dengan `bersihkan-login-percobaan-gagal-lama`).

### 7.2 Saklar: tabel `cek_status_pengaturan` (PENYIMPANGAN dari rencana awal, lihat bagian 18)
- Satu baris saja (`id boolean primary key check (id)`), kolom `aktif` (**bawaan false**), `diubah_at`, `diubah_oleh`.
- **Sengaja bukan di tabel `setelan`**: tabel itu punya trigger `trg_event_setelan` yang menyiarkan sinyal realtime ke semua browser petugas setiap ada perubahan; menghidupkan/mematikan saklar akan ikut mengganggu petugas. Tabel baru tidak punya trigger dan tidak ada di publikasi realtime.
- Menghidupkan: `update public.cek_status_pengaturan set aktif = true, diubah_at = now(), diubah_oleh = '<nama>';` (mematikan: `aktif = false`). Dilakukan pemelihara lewat SQL Editor pada F2/F3; tombol di aplikasi admin opsional (F4).
- Saklar tak terbaca (galat database) atau baris hilang = dianggap MATI (gagal tertutup).

### 7.3 Yang dibaca dari `penerima_2027`
Hanya `nama, layanan, kecamatan, kelurahan, status_verifikasi`, dengan kondisi `nik = $1 and tanggal_lahir = $2 and tahun = TAHUN_AKTIF`. Tidak ada kolom lain yang pernah masuk ke respons.

### 7.4 Rahasia dan konfigurasi baru
| Nama | Tempat | Fungsi |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | secret Worker (`wrangler secret put`) | verifikasi token Turnstile |
| Site key Turnstile | HTML halaman (publik) | menampilkan widget |
| `CEK_STATUS_PEPPER` | secret Edge Function | garam hash NIK pada tabel percobaan |

## 8. Desain server
### 8.1 Worker `/api/cek-status` (urutan, berhenti di langkah pertama yang gagal)
1. Hanya `POST`; `OPTIONS` dijawab; metode lain 405. Tidak ada CORS lintas situs (hanya asal sendiri).
2. Batasi ukuran badan (maks 1 KB) dan parse JSON.
3. Validasi format ringan (NIK `^\d{16}$`, tanggal `yyyy-mm-dd`).
4. Verifikasi Turnstile ke `https://challenges.cloudflare.com/turnstile/v0/siteverify` (cek `success`, `hostname`). Gagal → 403.
5. Panggil Edge Function `cekStatusPublik` dengan `_secret` (batas waktu pendek, 10 detik).
6. **Samakan waktu respons**: pastikan total waktu minimal ±400 ms untuk semua jalur (tidak ada perbedaan waktu antara "ada" dan "tidak ada").
7. Teruskan hasil; buang semua detail galat internal; **tidak ada `console.log` yang memuat NIK, tanggal lahir, atau token**.

### 8.2 Edge Function `cekStatusPublik(nik, tglLahir)` (algoritma)
```
1. baca cek_status_pengaturan.aktif; bila bukan true -> {sukses:false, kode:'NONAKTIF'}
2. validasi ulang format; tolak tanggal masa depan / < 1900 -> 'FORMAT'
3. kunci = 'nik:' + sha256(PEPPER + nik)
4. bila kunci sedang terkunci (terkunci_sampai > now()) -> 'TERKUNCI'
5. SELECT 5 kolom ... WHERE nik=$1 AND tanggal_lahir=$2 AND tahun=TAHUN_AKTIF LIMIT 1   -- satu kueri, satu jalur
6. tidak ada baris -> catatGagal(kunci) (5 gagal / 15 menit => terkunci 15 menit); kembalikan 'TIDAK_TERDATA'
7. ada baris     -> hapus catatan percobaan kunci; kembalikan {sukses:true, data:{...}}
```
Catatan penting:
- Pembatasan dihitung **per NIK (hash)** untuk semua NIK, ada atau tidak.
- Pencatatan gagal tidak boleh membuat respons "ada" dan "tidak ada" berbeda bentuk atau status.
- Aksi didaftarkan di `ALLOWED` dan **tidak** ditambahkan ke jalur publik di gerbang.

### 8.3 Pengamanan lapisan jaringan (tindakan user di dashboard Cloudflare)
- **Rate Limiting Rule** (paket gratis: 1 aturan): `/api/cek-status`, contoh 10 permintaan/menit per IP, tindakan blokir 10 menit.
- Turnstile mode **Managed**, hanya untuk hostname `djpmkotamedan.web.id`.

## 9. Desain halaman publik dan SEO
### 9.1 Berkas dan pembuatan
- **`public/cek-status.html`**: halaman mandiri (CSS dan JS di dalam berkas), sengaja **tidak** memakai `index.html` (450 KB, terkunci modal login) dan **tidak** memakai Tailwind. Alasan: ringan di HP murah/sinyal lemah, tidak mengubah `tailwind.css`, dan tidak berisiko memengaruhi aplikasi utama.
- Vite menyalin `public/` apa adanya ke `dist/`; Cloudflare Workers Assets melayani `/cek-status` dari `cek-status.html` (perilaku `html_handling` bawaan). **Wajib diverifikasi di F1** dengan `wrangler dev`; bila tidak otomatis, tambahkan aturan sederhana di Worker atau salin sebagai `cek-status/index.html`.
- Perhatikan aturan lama: `not_found_handling: single-page-application` (alamat tak dikenal jatuh ke `index.html`).

### 9.2 Tampilan dan aksesibilitas
- Seluruh layar ≤ 480 px dirancang lebih dulu (mayoritas pembuka lewat HP). Satu kolom, huruf formulir ≥ 16 px (mencegah zoom otomatis iOS).
- `inputmode="numeric"`, `autocomplete="off"`, label terhubung ke input, pesan galat di `aria-live="polite"`, kontras teks ≥ 4,5:1, status tidak hanya dibedakan warna (ada teks dan ikon).
- Identitas: logo Pemko Medan (sudah ada), judul "Cek Status Penerima Dana Jasa Pelayanan Tahun Anggaran 2027", kredit pengembang memakai blok yang sama dengan aplikasi (tiga baris, nama tebal).

### 9.3 Privasi di sisi browser
- NIK/tanggal **tidak** disimpan ke `localStorage`/`sessionStorage`/cookie; tidak ada analitik pihak ketiga di halaman ini.
- `<meta name="referrer" content="no-referrer">`.
- Hasil hilang otomatis dari layar setelah 2 menit dan saat tombol **Hapus hasil** ditekan; kolom NIK dikosongkan.
- Permintaan memakai `POST` (tidak ada NIK di alamat/riwayat browser).

### 9.4 SEO
| Fase | Pengaturan |
|---|---|
| F2 (uji) | `<meta name="robots" content="noindex, nofollow">`; tidak ada tautan; tidak ada di `sitemap.xml` |
| F3 (go-live) | `index, follow`; `<title>` + deskripsi + canonical; masuk `sitemap.xml`; JSON-LD `WebPage` sederhana (tanpa data pribadi); "Minta pengindeksan" di Search Console (properti Domain sudah terverifikasi) |
- Jawaban API tidak pernah masuk indeks (POST JSON, tanpa alamat unik per orang).
- Tautan dari aplikasi utama (mis. footer) boleh ditambahkan setelah go-live.

## 10. Model ancaman dan mitigasi
| # | Ancaman | Mitigasi | Risiko sisa |
|---|---|---|---|
| A1 | Menebak NIK untuk mengetahui siapa penerima (enumerasi) | Pesan & bentuk respons seragam; waktu disamakan; kunci per hash NIK; Turnstile; rate limit IP | Rendah |
| A2 | Menebak tanggal lahir untuk satu NIK yang diketahui (brute force) | 5 gagal/15 menit per NIK, juga untuk NIK tak ada; Turnstile; rate limit | Sedang-rendah (orang yang sudah tahu NIK + tahu perkiraan tanggal) |
| A3 | Skrip otomatis (bot) | Turnstile managed; WAF rate limit; batas ukuran badan | Rendah |
| A4 | Kebocoran data lewat respons berlebih | Kolom dikunci di server (5 kolom); tidak ada `select *`; uji kontrak respons | Sangat rendah |
| A5 | Kebocoran lewat log/cache/riwayat | Tidak ada NIK di log; `no-store`; `POST`; referrer dimatikan | Rendah |
| A6 | Pencurian identitas oleh orang dekat yang tahu NIK + tgl lahir | Diterima dan diumumkan; yang tampil hanya nama, layanan, wilayah, status (tanpa rekening/alamat/HP) | **Sedang, diterima secara sadar (perlu persetujuan pimpinan)** |
| A7 | Akses Edge Function langsung dari internet | Aksi hanya lewat `_secret`; tidak dibuka publik | Sangat rendah |
| A8 | Salah ketik tanggal lahir oleh petugas → warga sah ditolak | Pra-periksa data (F0); pesan gagal mengarahkan ke petugas; jalur koreksi di aplikasi sudah ada | Sedang (operasional, bukan keamanan) |
| A9 | Penyalahgunaan sebagai alat penjajak "kuota/penerima" | Tidak ada pencarian massal/daftar; satu NIK per permintaan | Rendah |
| A10 | Beban/biaya mendadak | Turnstile + rate limit; Workers gratis 100 ribu permintaan/hari; saklar mati | Rendah |
| A11 | Rahasia bocor (`_secret`, Turnstile secret, pepper) | Hanya `wrangler secret put` / secret Supabase; tidak di repositori; nilai tidak pernah dicetak | Rendah |

## 11. Tahapan pelaksanaan
Aturan semua fase: **reversibel dulu, lokal dulu**; setiap fase berakhir dengan laporan dan menunggu persetujuan user sebelum fase berikutnya; tidak ada commit/push tanpa perintah user; CSS tidak berubah (halaman mandiri) sehingga `npm run check-css` harus tetap lolos.

### F0 — Fondasi database dan server (lokal, tanpa data nyata)
**Tugas**
- Tulis migrasi `supabase/migrations/2026102xxxxxxx_cek_status_publik.sql`: tabel `cek_status_percobaan`, baris `setelan` `CEK_STATUS_AKTIF='0'`, cron pembersihan.
- Tulis `supabase/functions/api/domains/cekStatusPublik.ts` + daftarkan di `ALLOWED` (tanpa menyentuh gerbang publik).
- Tambah fungsi bantu hash (SHA-256 via Web Crypto) dan pembatasan per kunci (meniru `bruteforce.ts`).
- **Pra-periksa data**: daftar 1 tanggal lahir < 1930, 1 baris wilayah kosong; serahkan ke user untuk dikoreksi lewat aplikasi (bukan oleh saya).
**Keluaran/uji**: migrasi diterapkan pada database **uji** (cabang Supabase atau transaksi yang dibatalkan), bukan produksi; uji unit logika (bagian 12.1).
**Selesai bila**: semua uji bagian 12.1 lulus.
**Mundur**: tidak ada yang live.

### F1 — Worker dan halaman, uji lokal
**Tugas**
- Tambah rute `/api/cek-status` di `worker/index.js` (langkah 8.1); variabel `TURNSTILE_SECRET_KEY` untuk lokal lewat `.dev.vars` (tidak di-commit).
- Buat `public/cek-status.html` (bagian 9) dengan `noindex`.
- Uji `vite` + `wrangler dev`: alur penuh dengan kunci uji Turnstile (Cloudflare menyediakan site key/secret uji) dan data karangan.
- Verifikasi `/cek-status` benar-benar dilayani (bagian 9.1).
**Selesai bila**: uji 12.2 dan 12.3 lulus; tampilan HP 360 px dan desktop diperiksa lewat tangkapan layar.
**Mundur**: tidak ada yang live.

### F2 — Deploy tersembunyi (saklar MATI) dan uji nyata terbatas
**Prasyarat user**: widget Turnstile dibuat (site key + secret); aturan Rate Limiting dibuat; 2 baris data janggal sudah dikoreksi.
**Tugas**
- Terapkan migrasi `20261026100000_cek_status_publik.sql` ke produksi; `wrangler secret put TURNSTILE_SECRET_KEY`; set secret `CEK_STATUS_PEPPER` di Supabase (acak, ≥ 32 karakter) **sebelum** deploy Edge Function; deploy Edge Function (versi baru) dan Worker/halaman.
- Halaman `noindex`, tidak ditautkan, tidak di sitemap; saklar **tetap 0**: verifikasi jawaban `NONAKTIF`.
- Hidupkan saklar **sementara** (`aktif = true`) hanya untuk sesi uji bersama user, lalu matikan lagi.
- UAT (12.4): user mengecek NIK + tanggal lahir milik sendiri/data uji dari tiap status, dan memeriksa kasus gagal.
**Selesai bila**: UAT lulus tanpa temuan serius; pengukuran waktu respons seragam; tidak ada data pribadi di log Worker/Supabase.
**Mundur**: set saklar `'0'`, atau hapus `public/cek-status.html` dan deploy ulang.

### F3 — Go-live (setelah persetujuan pimpinan dan user)
**Prasyarat**: K3 terpenuhi (persetujuan tertulis/pesan resmi pimpinan); teks K1/K2/K6 final.
**Tugas**
- Saklar `aktif = true`; ubah halaman ke `index, follow`; tambah ke `sitemap.xml`; commit + push.
- Search Console: "Minta pengindeksan" untuk `/cek-status`, kirim ulang sitemap.
- Kirim pengumuman (bagian 14).
- Pantau intensif 3 hari pertama (bagian 13).
**Selesai bila**: halaman dapat diakses publik, tidak ada lonjakan galat, tidak ada indikasi enumerasi (bagian 13.3).
**Mundur**: saklar `'0'` (instan, tanpa deploy); bila perlu `noindex` lagi.

### F4 — Penyempurnaan (opsional, setelah go-live stabil)
- Tombol saklar di aplikasi untuk Admin Utama (memakai pola `riwayat_setelan`).
- Laporan sederhana untuk admin: jumlah pengecekan/hari dan jumlah "tidak terdata" (tanpa NIK) untuk mendeteksi masalah data massal.
- Tautan ke halaman dari footer aplikasi.

## 12. Rencana uji
### 12.1 Uji logika server (F0, data karangan)
- NIK ada + tanggal benar → data 5 kolom persis (tidak ada kolom lain di JSON).
- NIK ada + tanggal salah → `TIDAK_TERDATA`; NIK tidak ada → `TIDAK_TERDATA`; **isi respons byte-per-byte sama** untuk kedua kasus.
- 5 gagal berturut-turut pada satu NIK → `TERKUNCI`; berlaku juga untuk NIK tak ada; setelah 15 menit bebas; berhasil → hitungan di-reset.
- Format: NIK 15/17 digit, huruf, spasi, `null`; tanggal masa depan, 31 Februari, `1899-12-31`, format `dd-mm-yyyy` → `FORMAT`.
- Injeksi: NIK `1' or '1'='1`, tanggal berisi kutip → ditolak/aman (parameter terikat).
- Saklar `'0'` → `NONAKTIF`, tanpa menyentuh `penerima_2027`.
- Tahun: hanya `TAHUN_AKTIF` (data 2026 tidak pernah muncul).

### 12.2 Uji Worker (F1)
- Metode selain POST, badan > 1 KB, JSON rusak, token Turnstile kosong/palsu/kedaluwarsa → kode yang benar.
- Edge Function lambat/mati → `GALAT` (tanpa bocoran detail), waktu tunggu 10 detik.
- Waktu respons: selisih antar jalur "ada" vs "tidak ada" tidak berarti secara statistik (≥ 50 sampel tiap jalur).
- Log: tidak ada NIK/tanggal/token di keluaran `wrangler tail` (periksa dengan NIK uji yang mudah dikenali).

### 12.3 Uji halaman (F1)
- Layar 360, 390, 768, 1280 px; Chrome terbaru dan Chrome lama (versi < 111; ingat kasus CSS lama); mode gelap bukan prioritas.
- Keyboard saja (Tab/Enter) dan pembaca layar dasar: label, fokus, `aria-live`.
- Menempel NIK berspasi/bertanda baca → dibersihkan; tombol nonaktif sampai syarat terpenuhi.
- Hasil terhapus setelah 2 menit dan saat "Hapus hasil"; tombol Kembali browser tidak memunculkan hasil lama.
- Tidak ada NIK di URL, riwayat, `localStorage`, atau cookie (periksa di DevTools).

### 12.4 UAT (F2)
Skenario dengan user: (1) satu NIK untuk setiap status (3 status); (2) tanggal salah; (3) NIK tidak ada; (4) lima kali gagal → terkunci; (5) saklar dimatikan saat halaman terbuka; (6) HP sungguhan lewat sinyal seluler; (7) akun uji di Kecamatan berbeda untuk memastikan nama wilayah benar.

### 12.5 Regresi
- `npm run check-css` lolos; aplikasi utama (login, refresh tetap masuk, Data Detail, Cover) tidak berubah perilakunya; `/api/gas` tetap normal; `sitemap.xml`/`robots.txt` tetap valid.

## 13. Operasional dan pemantauan
### 13.1 Runbook singkat
| Situasi | Tindakan |
|---|---|
| Lonjakan permintaan mencurigakan | Saklar `'0'`; periksa Rate Limiting/Turnstile; hidupkan lagi setelah aman |
| Banyak keluhan "tidak terdata" | Cek data (tanggal lahir keliru?), minta koreksi lewat aplikasi; jangan melonggarkan pengaman |
| Salah tampil/bocor | Saklar `'0'` segera; catat kronologi; laporkan ke pimpinan (kewajiban PDP) |
| Turnstile bermasalah | Saklar `'0'` sementara atau ganti mode; jangan menonaktifkan Turnstile permanen |

### 13.2 Pemeliharaan
- Pembersihan `cek_status_percobaan` otomatis harian.
- Rahasia: rotasi `TURNSTILE_SECRET_KEY` / `CEK_STATUS_PEPPER` bila ada kecurigaan (rotasi pepper menghapus kunci lama, tidak masalah).
- Setelah periode berakhir: matikan saklar dan (opsional) pasang halaman pemberitahuan.

### 13.3 Indikator yang dipantau (3 hari pertama, lalu mingguan)
Jumlah pengecekan/hari; rasio `TIDAK_TERDATA`; jumlah `TERKUNCI`; galat 5xx; waktu respons. Pola yang mencurigakan: banyak `TIDAK_TERDATA` dari NIK berbeda dalam waktu singkat, atau banyak `TERKUNCI`.

## 14. Komunikasi dan dukungan
- **Pengumuman WA** (setelah F3): isi singkat, alamat `https://djpmkotamedan.web.id/cek-status`, yang perlu disiapkan (NIK + tanggal lahir sesuai KTP), arti tiga status, dan nomor/kanal petugas untuk yang ditolak. Saya siapkan teksnya (format file `.txt` seperti broadcast cover).
- **Pegangan petugas kecamatan/kelurahan**: cara menjawab warga ("tidak terdata" → cek data di Lihat Data; tanggal lahir keliru → koreksi lewat aplikasi; "Berkas Tidak Lengkap" → arahkan melengkapi berkas).
- **Pegangan admin**: kapan mematikan saklar, siapa yang dihubungi.

## 15. Kepatuhan data pribadi (UU No. 27 Tahun 2022)
- **Dasar dan tujuan**: informasi status kepada pemilik data; dicatat sebagai tujuan tunggal.
- **Minimisasi**: hanya 5 kolom; tanpa alamat, rekening, HP.
- **Pengendali data**: Dinas Sosial Kota Medan; persetujuan/kebijakan pimpinan diperlukan (syarat go-live).
- **Penyimpanan**: tidak ada NIK/tanggal lahir disimpan oleh halaman; tabel percobaan hanya menyimpan hash dan dibersihkan harian.
- **Keamanan**: bagian 10; enkripsi transport (HTTPS Cloudflare).
- **Insiden**: ada prosedur 13.1; pemberitahuan sesuai aturan internal pimpinan.
- **Pemberitahuan kepada warga** di halaman: tujuan penggunaan NIK dan bahwa NIK tidak disimpan.
- Catatan: bagian ini bukan nasihat hukum; konfirmasi dengan bagian hukum/PDP dinas bila tersedia.

## 16. Pembagian tugas, dependensi, dan urutan
| Pihak | Tugas |
|---|---|
| **User** | Jawab K1–K6; persetujuan pimpinan (K3); buat widget Turnstile; buat Rate Limiting Rule; koreksi 2 baris data; ikut UAT; perintah commit/push tiap fase; mengirim pengumuman WA |
| **Claude** | Migrasi, Edge Function, Worker, halaman, uji, runbook, teks pengumuman, penerapan rahasia via `wrangler secret put` / secret Supabase (nilai tidak ditampilkan), pemantauan awal |
Urutan: **K1–K6 → F0 → F1 → (user menyiapkan Turnstile/Rate Limiting/koreksi data) → F2 → persetujuan pimpinan → F3 → F4**.
Perkiraan upaya (kerja efektif, bukan kalender): F0 ± 0,5 hari · F1 ± 1 hari · F2 ± 0,5 hari + waktu UAT user · F3 ± 0,5 hari · F4 opsional.

## 17. Keputusan terbuka dan syarat go-live
**Keputusan terbuka**: K1, K2, K3, K4, K5, K6 (bagian 3). Bila user tidak menolak, usulan bawaan dipakai mulai F0.
**Syarat go-live (semua harus terpenuhi sebelum F3)**
1. Persetujuan pimpinan (K3) dan teks final (K1/K2/K6).
2. UAT F2 lulus; tidak ada temuan keamanan terbuka.
3. Turnstile dan Rate Limiting aktif.
4. Dua baris data janggal sudah dikoreksi.
5. Saklar teruji mati/hidup; runbook 13.1 dibaca user.
6. Pengumuman WA dan pegangan petugas siap.

## 18. Catatan realisasi
### F0 — selesai lokal, 2026-10-26 (belum commit, belum diterapkan ke produksi)
**Dibuat:** migrasi `20261026100000_cek_status_publik.sql` (2 tabel + cron pembersihan); `_shared/cekStatusInti.ts`; `domains/cekStatusPublik.ts`; pendaftaran di `index.ts`; `scripts/uji/cek-status-inti.test.mjs`; skrip `npm run uji:cek-status`.

**Hasil uji**
- 31 uji Node lulus (format, penguncian, pesan seragam, kolom dikunci, saklar, garam, hash, tahun).
- Uji perusakan: 12 mutan, **12 tertangkap** (M12 awalnya lolos; ditambah uji konstanta 5 gagal/15 menit/15 menit).
- Sintaks `cekStatusPublik.ts`, `index.ts`, `cekStatusInti.ts` diperiksa dengan esbuild (tanpa Deno; **tidak dijalankan di Deno**).
- Kueri pencarian diuji **baca-saja** di produksi: NIK+tanggal benar = 1 baris, tanggal salah = 0, NIK tak ada = 0. Tabel baru terbukti belum ada di produksi.

**Penyimpangan dari rencana**
1. Saklar dipindah dari `setelan` ke tabel `cek_status_pengaturan` (alasan di 7.2).
2. Pencarian memakai tabel induk `penerima` dengan `tahun = TAHUN_AKTIF` (pola yang sama dengan `validasi.ts`), bukan nama partisi.

**Keterbatasan / belum terbukti**
- **SQL penghitung percobaan** (`catatGagal`, `terkunci`) belum diuji di database: pengujian dengan tabel sementara di produksi tidak disetujui. Logikanya baru diverifikasi lewat pembacaan; WAJIB diuji sebelum F2 (opsi: cabang Supabase pengembangan, atau dijalankan user di SQL Editor dengan tabel sementara).
- Edge Function belum dijalankan di Deno/Supabase (tidak ada Deno di komputer ini); pertama kali dijalankan pada F2.

**Temuan data (perlu dikoreksi user lewat aplikasi sebelum F2)**
- id 32356583, nomor urut 1575, GURU MAGHRIB MENGAJI, Kec. Medan Selayang, Kel. Tanjung Sari: **tahun lahir 0199** (umur tercatat 1.827), jelas salah ketik; penerima ini tak akan pernah bisa lolos cek.
- id 32306464, nomor urut 902, PENGURUS GEREJA, Kec. Medan Belawan: **kelurahan kosong**.

### F1 — selesai lokal, 2026-10-28 (belum commit, belum diterapkan ke produksi)
**Dibuat:** `worker/cek-status.js` (rute `/api/cek-status`, didaftarkan di `worker/index.js`); `public/cek-status.html` (mandiri, `noindex`, tanpa Tailwind); blok CSP + `no-cache` untuk `/cek-status` di `public/_headers`; uji `scripts/uji/worker-cek-status.test.mjs` (`npm run uji:worker-cek-status`) dan uji layar `scripts/uji/layar/cek-status-halaman.mjs` (Chrome CDP, manual).

**Hasil uji**
- 19 uji Node Worker lulus (format, badan >1 KB, metode, Turnstile gagal/hostname beda/tak terjangkau, pemetaan kode, 5 kolom, waktu minimal 400 ms, tidak ada console.* berisi NIK/tanggal/token/nama); 31 uji F0 tetap lulus; `npm run check-css` lolos.
- End-to-end lokal (`vite build` + `wrangler dev` + backend tiruan + kunci uji Turnstile): semua jalur menjawab kode dan HTTP yang benar; kolom ekstra dari backend terbuang; waktu respons seragam (~0,64 dtk); log Worker tanpa NIK/token/nama.
- `/cek-status` dilayani dari `cek-status.html` (bukan jatuh ke `index.html`): terbukti di `wrangler dev` (bagian 9.1 terjawab, tanpa aturan tambahan).
- Uji layar Chrome 360/390/1280 px: 24/24 lulus (tanpa gulir mendatar, huruf >=16 px, NIK dibersihkan, tombol menunggu Turnstile, hasil hijau/merah, pesan tidak terdata & terkunci seragam, tidak ada NIK di URL/storage/cookie, Hapus hasil, pageshow).

**Belum terbukti:** Chrome lama (<111) (hanya Chrome terbaru dicoba); keyboard-saja/pembaca layar; pengukuran waktu 50 sampel per jalur terhadap backend nyata; Edge Function dan SQL percobaan (masih F2).
**Wajib sebelum F2:** ganti `TURNSTILE_SITEKEY` di `cek-status.html` (kini kunci UJI Cloudflare yang selalu lolos) dengan site key asli; `TURNSTILE_SECRET_KEY` lewat `wrangler secret put`.

### F2 — deploy tersembunyi selesai, 2026-10-28 (saklar MATI; UAT belum)
**Diterapkan ke produksi:** migrasi `cek_status_publik` (2 tabel, cron `30 * * * *`, saklar false, RLS aktif, hak anon/authenticated 0); secret `TURNSTILE_SECRET_KEY` (Worker) dan `CEK_STATUS_PEPPER` (Supabase, diisi user di dashboard); fungsi `api` (kini v96); Worker + halaman (version 4053cf4b). Halaman `/cek-status` live tetapi `noindex`, tanpa tautan, tanpa sitemap.
**Temuan keamanan & perbaikan:** `/api/gas` menyisipkan `_secret` ke semua aksi sehingga `cekStatusPublik` dapat dipanggil lewat jalur itu tanpa Turnstile dan di luar batas laju `/api/cek-status`. Ditutup: Worker menolak aksi itu di `/api/gas` (403), termasuk variasi huruf/spasi. Terbukti: uji Node (22, mutan tertangkap) dan produksi (403). **Syarat go-live baru: denylist ini harus ada di Worker yang live.**
**Uji SQL:** 20 uji di PGlite lulus (`scripts/uji/sql-cek-status.mjs`); pg_cron dan Deno baru terbukti lewat deploy (cron terdaftar, fungsi aktif).
**Uji asap produksi:** health OK; `pulihkanSesi` token palsu = "Sesi tidak valid" (4/4; panggilan pertama sesudah tiap deploy kadang kosong = start dingin); `/api/cek-status` tanpa/dengan token palsu = TURNSTILE 403; GET = 405.
**Belum:** aturan Rate Limiting Cloudflare; kebenaran `CEK_STATUS_PEPPER` (baru teruji saat saklar dihidupkan sementara); UAT 12.4; push cabang ke git.

### Tinjauan kode setelah F2, 2026-10-28 (perbaikan LOKAL, BELUM dideploy)
Ditinjau dengan code-review (high); setiap temuan diperiksa ulang ke kode/data sebelum diterima.
**Terbukti dan sudah diperbaiki (lokal):**
1. **Balapan pada pembatas percobaan** (cek terkunci dan catat gagal terpisah): N permintaan paralel untuk satu NIK semuanya lolos sebelum ada yang tercatat, sehingga batas 5 bisa dilampaui sebanyak N. Perbaikan: `ambilJatah(kunci)` = SATU pernyataan SQL atomik (naikkan hitungan + kembalikan nilainya) yang dipanggil SEBELUM pencarian; percobaan ke-6 dst. dalam jendela 15 menit ditolak (`TERKUNCI`). Jendela tetap (tidak bergeser saat ditolak), hitungan dibatasi 1000, sukses mereset. Uji: 40 permintaan serentak -> tepat 5 yang sampai ke pencarian (mutan tertangkap). Kolom `terkunci_sampai` kini tak dipakai (NULL); skema tidak berubah.
2. **`cekStatusPublik` dapat dipanggil dengan X-Session-Token langsung ke Edge Function** (melewati Turnstile, Worker, dan pemerataan waktu); komentar "hanya lewat _secret" salah. Perbaikan: `_shared/gerbangAksi.ts` + pemeriksaan di `index.ts` sebelum `ALLOWED[action]`: aksi ini wajib `_secret` sah. (Jalur `/api/gas` sudah ditutup di Worker sebelumnya.)
3. **Badan permintaan dibaca penuh sebelum batas 1 KB diterapkan** (unggahan chunked tanpa Content-Length). Perbaikan: pembacaan aliran dengan batas byte dan pembatalan di tengah jalan; uji membuktikan hanya beberapa potongan dibaca.
4. **Validasi tanggal di Worker lebih longgar dari server** (1800-01-01 atau tanggal masa depan menghabiskan token Turnstile dan panggilan backend sebelum ditolak). Perbaikan: batas 1900 dan hari ini (WIB) juga di Worker.
5. Aturan header duplikat `/cek-status` dan `/cek-status.html` -> satu aturan `/cek-status*`.
6. Skrip uji SQL rusak setelah komentar migrasi diganti (penanda pemisah bagian pg_cron); kini memakai penanda kode, gagal keras bila tak ditemukan, dan menguji pernyataan atomik (22 lulus).
**Terbukti sebagai RISIKO (bukan galat kode) -- butuh keputusan pimpinan/user:**
- **A12: tanggal lahir lemah sebagai faktor kedua.** NIK memuat tanggal lahir pada digit 7-12 (hari + 40 untuk perempuan). Pada data nyata (3.865 baris) **3.566 (92,3%)** tanggal lahirnya identik dengan yang tertulis di NIK. Siapa pun yang memegang NIK (yang sering bocor/tersebar) lolos pada percobaan pertama dan melihat nama, layanan, wilayah, dan status. Penguncian tidak membantu. Faktor tambahan yang tidak dapat diturunkan dari NIK ada di data (mis. 4 digit terakhir nomor rekening atau nomor kontak), tetapi memerlukan keputusan dan menambah beban warga. Rekomendasi: keputusan pimpinan (K7) sebelum go-live.
- **A13: penguncian dapat disalahgunakan** (siapa pun yang tahu NIK dapat mengunci pemiliknya 15 menit dengan 5 percobaan salah). Pemilik hanya melihat "Terlalu banyak percobaan"; tidak ada jalur admin. Diterima sebagai trade-off bila tidak ada keberatan; pesan sudah mengarahkan ke petugas.
- **A14: tidak ada batas per IP di kode**; satu-satunya lapisan adalah aturan Rate Limiting Cloudflare yang BELUM dibuat. Tiap permintaan memakai siteverify + ±3-4 kueri dan satu slot koneksi (riwayat: koneksi DB penuh -> 5xx). Syarat go-live: aturan itu aktif dan diverifikasi.
- Pemakaian koneksi: 3-4 kueri berurutan per pengecekan pada koneksi yang sama dengan aplikasi petugas; belum diukur di bawah beban.

### Keputusan dan penerapan, 2026-10-28
- **K7 diputuskan user: tetap NIK + tanggal lahir** (tanpa faktor tambahan). Risiko A12 (92,3% tanggal lahir dapat diturunkan dari NIK) diterima secara sadar; tetap perlu disampaikan ke pimpinan pada persetujuan go-live (K3).
- **Perbaikan tinjauan kode DIDEPLOY:** fungsi `api` v97, Worker (7e8a14dc, lalu 06c4fed7 hasil Workers Builds), `main` di-push (`91426fb`). Uji asap produksi hijau: Edge langsung tanpa kredensial / token sesi palsu / _secret palsu = Akses Ditolak; `/api/gas` cekStatusPublik = 403; tanggal 1800 = FORMAT; chunked 200 KB = FORMAT; token palsu = TURNSTILE; `pulihkanSesi` = "Sesi tidak valid" (12/12 + 4/4 + 3/3; sesekali satu jawaban kosong yang tak dapat diulang); login palsu ditolak rapi.
- **Saklar tetap MATI.** Belum terbukti di produksi: pepper dan alur sukses (butuh saklar dihidupkan sementara saat UAT).
- Sisa: aturan Rate Limiting Cloudflare (syarat go-live), UAT, persetujuan pimpinan.

### Tinjauan kode ke-2 (xhigh, seluruh fitur), 2026-10-28 -- perbaikan LOKAL, BELUM dideploy
Setiap temuan diperiksa ulang ke kode/data/perilaku nyata sebelum diterima. (Satu putaran review awal salah sasaran: argumen `11c8940` dibaca sebagai SATU commit, bukan rentang; temuannya tentang `db.ts`/pooler milik pekerjaan lama dan tidak menyangkut fitur ini -- dipisah, tidak dikerjakan di sini.)
**Terbukti dan diperbaiki:**
1. **Batas badan 1024 byte < token Turnstile asli** (badan tanpa token 74 byte -> token maks 950 karakter; batas resmi 2048). Warga sah dengan token panjang akan mendapat "FORMAT" yang menyesatkan. Perbaikan: batas badan = 2048 + 256. Uji: token 950/1200/2048 diterima, 2049 ditolak sebagai TURNSTILE. (UAT lolos karena token uji < 950; tidak ada jaminan untuk semua.)
2. **Status "Tidak Memenuhi Syarat" tidak ditangani** (status sah yang diset otomatis oleh `cekBatasWaktuVerifikasi` bila batas waktu perbaikan lewat; kini 0 baris di produksi). Halaman memberi lencana abu-abu tanpa arahan. Perbaikan: lencana merah + "Data Anda dinyatakan belum memenuhi syarat. Hubungi petugas Kemenag/Kecamatan/Kelurahan Anda untuk informasi lebih lanjut." **Teks ini perlu disetujui pimpinan (K6).**
3. **Mengetik manual dengan pemisah rusak** ("1/2/1990" per karakter -> "12-19-90", tombol tak pernah aktif). Perbaikan: bagian yang ditutup pemisah dilengkapi nol; tombol hapus tetap natural; kursor tidak melompat ke akhir saat mengedit di tengah. Uji: 12 uji logika (termasuk 20.000 masukan acak) dan uji Chrome mengetik sungguhan.
4. **Kunci uji Turnstile tersalin ke produksi akan meloloskan semua token** (hostname dilewati menurut pola secret). Perbaikan: hostname dilewati HANYA untuk localhost atau penanda eksplisit `CEK_STATUS_DEV=1` (hanya di `.dev.vars`); selain itu gagal tertutup. Temuan sampingan: `wrangler dev` memakai nama domain rute, bukan localhost, sehingga penanda eksplisit diperlukan untuk uji lokal.
5. **Pepper diperiksa sebelum saklar**: saklar MATI + pepper salah menghasilkan galat 500, bukan NONAKTIF. Perbaikan: saklar dulu ("matikan" selalu NONAKTIF), lalu pepper (tetap gagal tertutup bila saklar hidup).
6. **Proxy dev vite** (`npm run dev`, terbuka di LAN) menyuntikkan `_secret` ke semua aksi tanpa penolakan seperti Worker. Perbaikan: penolakan yang sama; uji kabel + uji KESESUAIAN yang memastikan daftar aksi khusus di Worker dan di Edge Function tidak menyimpang.
7. Komentar yang keliru ("Worker membatasi laju") diperbaiki: batas per IP ada di aturan Rate Limiting Cloudflare (dashboard).
**Sengaja BELUM dikerjakan (keputusan/biaya-manfaat; dicatat agar tidak hilang):**
- **Kredensial terpisah** (mis. `CEK_STATUS_SECRET`) untuk `cekStatusPublik` agar tidak bergantung pada daftar tolak/izin ganda: struktur lebih kuat, tetapi menambah secret di dua tempat menjelang go-live; risiko salah konfigurasi lebih besar daripada manfaat saat ini (daftar ganda kini diuji kesesuaiannya). Layak setelah go-live stabil.
- **Duplikasi aturan tanggal** (validasiPenerima.ts, cekStatusInti.ts, Worker, skrip peramban): dijaga lewat uji; refaktor menyentuh kode lama yang teruji, ditunda.
- **3-4 kueri berurutan per pengecekan** (saklar dapat di-cache beberapa detik; DELETE reset dapat dilepas dari jalur respons): optimasi, belum diukur di bawah beban; dibatasi Turnstile + Rate Limiting.
- **Kolom `terkunci_sampai` tak terpakai** (selalu NULL): cadangan; menghapus kolom memerlukan migrasi, ditunda.
- **A13 (penguncian dapat disalahgunakan)** tetap diterima; **A12 (tanggal lahir lemah)** tetap diputuskan user (K7).

## 19. Lampiran teknis
**Berkas yang diperkirakan berubah/ditambah**
| Berkas | Perubahan |
|---|---|
| `supabase/migrations/20261026100000_cek_status_publik.sql` | baru (F0, belum diterapkan) |
| `supabase/functions/api/_shared/cekStatusInti.ts` | baru (F0): logika murni + semua aturan keamanan, diuji di Node |
| `supabase/functions/api/domains/cekStatusPublik.ts` | baru (F0): sambungan ke database/Deno |
| `scripts/uji/cek-status-inti.test.mjs` + skrip `npm run uji:cek-status` | baru (F0) |
| `supabase/functions/api/index.ts` | (F0, selesai) impor + daftar di `ALLOWED`; gerbang aksi publik TIDAK diubah |
| `worker/index.js` | rute `/api/cek-status` |
| `wrangler.jsonc` | tidak berubah (rute `/api/*` sudah `run_worker_first`); `.dev.vars` untuk lokal (tidak di-commit) |
| `public/cek-status.html` | baru, mandiri |
| `public/sitemap.xml` | tambah alamat (F3) |
| `plans/plan-cek-status-penerima-publik.md` | dokumen ini |
Tidak berubah: `public/css/tailwind.css`, `index.html`, aplikasi admin (kecuali F4).

**Pseudocode hash NIK (Edge Function)**
```ts
const data = new TextEncoder().encode(PEPPER + nik);
const hex = [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))]
  .map((b) => b.toString(16).padStart(2, "0")).join("");
const kunci = "nik:" + hex;
```

**Catatan teknis yang sudah diketahui**
- Memori proyek: gejala "logout saat refresh" pernah terjadi karena `GAS_SECRET_TOKEN` Worker tidak cocok; uji kesehatan: `POST /api/gas {"action":"pulihkanSesi","args":["token-palsu"]}` harus menjawab "Sesi tidak valid". Lakukan uji ini setelah setiap perubahan rahasia.
- Alamat `www` sudah dialihkan ke tanpa `www` lewat Redirect Rule Cloudflare; halaman baru otomatis mengikuti.
- Kredit pengembang di halaman memakai blok yang sama dengan footer aplikasi (nama tebal gelap, tim di baris sendiri).
