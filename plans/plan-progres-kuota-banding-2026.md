# Plan: Tombol "Progres Kuota" — Tambah Kolom Data 2026 sebagai Pembanding

> Versi **1.2** (2026-11-02) · Status: **P1 + P2 SELESAI di lokal (belum commit, belum deploy).** Keputusan user: K1 = semua yang pernah tercatat, K2 = di kepala layanan, K3 = ada selisih. Rincian pengerjaan di §10.
> **v1.1 menyederhanakan v1.0** setelah user memperjelas maksud (2026-11-02, dengan tangkapan layar): cukup **satu kolom baru di paling kanan** tiap baris, berisi angka 2026. Penanda pada batang, kolom selisih, dan saklar dari v1.0 **dibuang**.
> Prinsip: bertahap, tiap tahap bisa dibatalkan, uji lokal dulu, deploy hanya setelah izin.
> Angka di plan ini adalah **cuplikan produksi 2026-11-02** (SQL baca-saja), dipakai sebagai data uji penerimaan di §6.

## Daftar isi
1. Tujuan & ruang lingkup
2. Kondisi sekarang (terverifikasi)
3. Temuan data 2026 (menentukan desain)
4. Keputusan desain
5. Rancangan backend dan tampilan
6. Rencana uji & data penerimaan
7. Tahapan kerja, deploy, dan jalan balik
8. Pertanyaan terbuka (K1–K3)
9. Risiko & mitigasi

---

## 1. Tujuan & ruang lingkup

**Tujuan.** Pada modal "Progres Capaian Kuota per Layanan" (tombol **Progres Kuota**, khusus Admin Utama), setiap baris kecamatan menampilkan **angka 2026 pada kolom terakhir**, di samping `input/kuota` 2027, sehingga bisa dibandingkan dengan mata.

**Termasuk**
- Kolom baru paling kanan di setiap baris (layanan × kecamatan) berisi jumlah penerima 2026.
- Total 2026 per layanan pada kepala layanan (di atas kolom yang sama), dan **selisih** (input 2027 − 2026) di samping angka 2026, per baris dan per kepala layanan.
- Berlaku di kedua tab: Layanan Kecamatan dan Layanan Kemenag.

**Tidak termasuk (non-goal)**
- Persen capaian 2026 (kuota 2026 tidak tersimpan; lihat T1).
- Penanda pada batang dan saklar (dibuang di v1.1). **Selisih termasuk** (K3: diminta user, lihat D8).
- Perbandingan "pada tanggal yang sama tahun lalu" (tidak mungkin; lihat T2).
- Mengubah cara kuota/input 2027 dihitung, menu Kelola Kuota, hak akses (tetap khusus UTAMA).
- Tab **Capaian Input** di Dashboard dan PDF-nya (tidak disentuh).

---

## 2. Kondisi sekarang (terverifikasi)

| Komponen | Fakta | Lokasi |
|---|---|---|
| Tombol & modal | `btn-progres-kuota`, modal `modal-progres-kuota`, 2 tab (Layanan Kecamatan / Layanan Kemenag), lebar `max-w-4xl` | `index.html:1029`, `index.html:2254` |
| Baris sekarang | nama kecamatan · batang berwarna · `%` · `input/kuota`. Kepala layanan: nama + chip `% (input/kuota)` | `public/js/app-admin.js:14-44` |
| Data | `getProgresKuota(token)`: hanya UTAMA; kuota dari tabel `kuota`; input = `count(*)` dari `penerima` `tahun = TAHUN_AKTIF`; hasil `{sukses, grup:[{layanan,totalKuota,totalInput,persenLayanan,baris:[{kecamatan,kuota,input,sisa,persen}]}]}` | `supabase/functions/api/domains/kuota.ts:65` |
| Cache | 5 menit, domain `kuota` | `public/js/api-bridge.js:207` |
| Tahun | `TAHUN_AKTIF` dari env, bawaan 2027 | `supabase/functions/api/_shared/config.ts:10` |

---

## 3. Temuan data 2026 (menentukan desain)

**T1 — Kuota 2026 tidak ada.** Tabel `kuota` tanpa kolom tahun; isinya kuota yang berlaku sekarang. Maka kolom 2026 berupa **angka penerima**, bukan persen.

**T2 — Data 2026 tidak punya garis waktu.** Seluruh 12.361 baris `penerima` 2026 dibuat pada satu hari (2026-09-14). Pembanding = **hasil akhir 2026**.

**T3 — Dua sumber 2026 dengan arti berbeda.**

| Sumber | Isi | Total | Kondisi |
|---|---|---|---|
| `data_detail` tahun 2026 | penerima **AKTIF** | **12.095** | disinkronkan harian dari Sheet 2026 (pg_cron `0 17 * * *`) |
| `penerima` tahun 2026 | semua yang pernah tercatat | **12.361** | potret tetap 2026-09-14 |

Selisih 266 = status non-aktif di `penerima` 2026: Hasil Monev 2026 (60), Meninggal Dunia (49), ASN/P3K (46), Tidak Memperbaiki Retur (42), Penerima Bantuan Guru MDTA/MDTS/TPA/TPQ (32), Hasil Monev 2025 (21), Mengundurkan Diri (10), Sudah Tidak Aktif (6).

**T4 — Sisi 2027 menghitung semua input**, termasuk yang belum diverifikasi (5.778 baris: Memenuhi Syarat 4.064, Proses Verifikasi 1.635, Berkas Tidak Lengkap 79). Definisi ini **tidak diubah**.

**T5 — Kecocokan nama aman.** Semua kecamatan 2026 dan 2027 cocok dengan tabel `wilayah` (21 kecamatan, 0 tidak cocok); 0 baris 2026 tanpa kecamatan/layanan; nama layanan cocok setelah `upper(trim())`.

**T6 — Beda daftar layanan.** **Guru Sekolah Buddha** (71) dan **Hindu** (8) ada di 2026 tetapi belum ada input 2027; keduanya punya kuota sehingga sudah tampil di modal (input 0). **Kong Hu Chu** punya kuota 10 tetapi 0 data di kedua tahun.

**T7 — Kueri 2026 ringan.** ±12 ribu baris; `data_detail_2026` berindeks `(kecamatan, layanan)` dan `(tahun, status)`.

---

## 4. Keputusan desain

| # | Keputusan | Alasan |
|---|---|---|
| D1 | Kolom 2026 = **jumlah penerima 2026 per layanan × kecamatan** (angka, tanpa %) | T1 |
| D2 | Sumber 2026 = tabel `penerima` tahun 2026, **semua yang pernah tercatat** (12.361) — **keputusan user K1** | Menggantikan usulan awal `data_detail` AKTIF (12.095). Konsekuensi: baris berstatus meninggal/ASN/mundur 2026 ikut dihitung |
| D3 | Backend **hanya menambah** kolom; kolom lama tidak diubah | Frontend lama tetap jalan selama deploy bertahap |
| D4 | Kegagalan kueri 2026 **tidak menggagalkan** Progres Kuota: kolom 2026 tampil `–` | Fitur utama tak boleh rusak oleh fitur tambahan |
| D5 | Tahun pembanding = `TAHUN_AKTIF − 1`, bukan angka 2026 tertulis tetap | Tahun depan otomatis membandingkan 2027 |
| D6 | Tetap khusus UTAMA; tanpa migrasi, tanpa tabel baru | Tidak ada perubahan skema |
| D7 | Warna kolom 2026 **netral** (abu-abu), tidak ikut skala merah-hijau | Warna skala hanya untuk capaian terhadap kuota |
| D8 | Selisih = `input 2027 − tercatat 2026`, tampil ▲/▼ + angka, `= 0` bila sama, warna netral; null bila pembanding gagal (**keputusan user K3**) | Arti tidak bergantung warna; di awal periode "di bawah 2026" wajar |

---

## 5. Rancangan backend dan tampilan

### 5.1 Backend (`kuota.ts`, hanya `getProgresKuota`)
Kueri tambahan, paralel dengan kueri yang ada, dibungkus `try/catch` sendiri:
```sql
select upper(trim(layanan)) as layanan, upper(trim(kecamatan)) as kecamatan, count(*)::int as jumlah
from penerima
where tahun = ${TAHUN_AKTIF - 1}
group by 1, 2
```
Kolom baru (➕); semua kolom lama tetap:
```
{ sukses, grup:[{ layanan, totalKuota, totalInput, persenLayanan,
                  ➕ total2026, ➕ selisihTotal,
                  baris:[{ kecamatan, kuota, input, sisa, persen, ➕ input2026, ➕ selisih }] }],
  ➕ bandingTersedia: true|false, ➕ tahunBanding: 2026 }
```
`total2026` = jumlah `input2026` pada baris yang tampil di grup itu (kepala = jumlah baris). Pasangan layanan × kecamatan yang punya data 2026 tetapi tak punya baris kuota tidak tampil (aturan lama); saat ini semua 21 pasangan per layanan punya baris kuota, jadi tidak ada yang tercecer (dibuktikan pada uji §6).

### 5.2 Tampilan (`public/js/app-admin.js`, `index.html`)
Sketsa (**angka hanya contoh bentuk, bukan data nyata**):
```
┌───────────────────────────────────────────────────────────────────────┐
│ BILAL JENAZAH            [ 67,8% (1821/2686) ]              2026: 2645│
├───────────────────────────────────────────────────────────────────────┤
│ AMPLAS   ████████████░░░░░   73,8%   93/126                      120  │
│ AREA     ██████████░░░░░░░   64,5%   78/121                      110  │
│ BARAT    █░░░░░░░░░░░░░░░░    8,9%    4/45                        40  │
└───────────────────────────────────────────────────────────────────────┘
                                                      ▲ kolom baru: 2026
```
- **Kolom baru di paling kanan** tiap baris, angka rata kanan, warna abu-abu netral, `title` "Penerima aktif 2026".
- **Kepala layanan:** `2026: <total>` di ujung kanan, sejajar dengan kolom.
- Lebar kolom ±`w-12`–`w-14`; batang progres sedikit menyempit. **Di HP (320–390 px) tidak boleh meluap mendatar** (uji §6).
- Keterangan satu baris di bawah daftar: "Kolom paling kanan = penerima aktif 2026 (pembanding). Kuota 2026 tidak tersimpan, jadi tanpa persen."
- Jika `bandingTersedia = false`: kolom menampilkan `–` dan satu catatan "Data 2026 sedang tidak tersedia".
- **Gaya:** pakai `style` inline / kelas yang sudah ada di `tailwind.css`. Bila terpaksa ada kelas baru → `npm run build:css`, `npm run check-css`, naikkan `?v=` CSS di `index.html` (aturan proyek).
- `app-admin.js` aman di bawah batas 3.500 baris. Tidak ada tombol baru.

---

## 6. Rencana uji & data penerimaan

**Uji server** (kode `kuota.ts` ASLI lewat esbuild + harness; pola `scripts/uji/`):
1. `input2026` per baris benar; Σ baris = `total2026`.
2. Layanan yang hanya ada di 2026 (Buddha, Hindu) tampil dengan input 0 dan 2026 terisi.
3. Baris `data_detail` 2026 yang bukan AKTIF tidak dihitung.
4. Ejaan kecamatan/layanan berspasi atau huruf kecil dinormalkan.
5. **Kueri 2026 gagal → `sukses:true`, `bandingTersedia:false`, kolom lama tetap benar.**
6. Non-UTAMA tetap ditolak; kolom lama identik dengan sebelum perubahan (regresi).

**Uji layar** (jsdom + Chrome desktop 1440 dan lebar HP 360):
1. Kolom 2026 muncul di kedua tab; kepala menampilkan total.
2. Tanpa meluap mendatar di 360 px.
3. `bandingTersedia=false` → `–` + catatan, bagian lain tetap normal.

**Data penerimaan** — cuplikan 2026-11-02 (harus cocok dengan layar setelah P2):

| Layanan | Kuota 2027 | Input 2027 | 2026 aktif | 2026 tercatat |
|---|---:|---:|---:|---:|
| Bilal Jenazah | 2.686 | 1.821 | 2.645 | 2.681 |
| Guru Maghrib Mengaji | 2.780 | 1.029 | 2.594 | 2.730 |
| Guru Sekolah Minggu | 2.050 | 328 | 1.600 | 1.613 |
| Penatua Gereja | 1.100 | 233 | 759 | 764 |
| Penggali Kubur | 951 | 560 | 894 | 912 |
| Nazir Masjid | 850 | 435 | 760 | 774 |
| Imam Masjid | 803 | 417 | 726 | 737 |
| Petugas Gereja Katolik | 599 | 142 | 551 | 554 |
| Pengurus Gereja | 515 | 231 | 439 | 442 |
| Khatib Jumat | 455 | 233 | 383 | 387 |
| Nazir Musholla | 415 | 191 | 338 | 346 |
| Ustadz | 336 | 76 | 147 | 155 |
| Ustadzah | 200 | 64 | 142 | 148 |
| Guru Sekolah Buddha | 100 | 0 | 70 | 71 |
| Pengurus Vihara/Klenteng/Kuil | 80 | 18 | 39 | 39 |
| Guru Sekolah Hindu | 35 | 0 | 8 | 8 |
| Guru Sekolah Kong Hu Chu | 10 | 0 | 0 | 0 |
| **Total** | **13.965** | **5.778** | **12.095** | **12.361** |

Contoh yang terlihat pada tangkapan layar user: Bilal Jenazah 2027 = 1821/2686 (cocok dengan tabel). Pemeriksaan silang: total 2026 aktif = 12.095 = jumlah `data_detail` tahun 2026.
*Angka bergeser (input 2027 terus bertambah; 2026 ikut sinkron harian). Bandingkan ulang dengan SQL baca-saja pada hari uji, bukan dengan tabel ini.*

---

## 7. Tahapan kerja, deploy, dan jalan balik

| Tahap | Isi | Menyentuh produksi? | Jalan balik |
|---|---|---|---|
| **P0** | Jawab K1–K3; plan disetujui | — | — |
| **P1** | Backend lokal: `input2026`, `total2026`, `bandingTersedia` + uji server §6 | Tidak | hapus perubahan lokal |
| **P2** | Frontend lokal: kolom 2026 + kepala + keterangan + uji layar §6 | Tidak | hapus perubahan lokal |
| **P3** | Review mendalam: baca ulang diff, uji regresi kolom lama, uji visual desktop + HP, `check-css` / `check-lines` / `verify-html`, naikkan `?v=` `app-admin.js` | Tidak | — |
| **P4a** | **Deploy fungsi `api`** (hanya menambah kolom; frontend lama tidak terpengaruh) → cek kesehatan + panggil `getProgresKuota` dari akun UTAMA | **Ya** (izin) | deploy ulang commit sebelumnya |
| **P4b** | Commit + push frontend → uji klik nyata Admin Utama | **Ya** (izin) | `git revert` commit frontend |

Urutan P4a lalu P4b disengaja: kolom baru ada di server dulu, baru tampilan memakainya. Tidak ada migrasi database.

---

## 8. Pertanyaan terbuka

| # | Pertanyaan | Rekomendasi |
|---|---|---|
| **K1** | Angka 2026 = penerima **aktif** (12.095) atau **semua yang pernah tercatat** (12.361)? | **Aktif**: itu penerima yang benar-benar menerima dan ikut sinkron harian. Selisih 266 adalah yang sudah gugur (meninggal, ASN, mundur, dst.). |
| **K2** | Perlu judul kolom/keterangan lebih jelas, mis. tulisan "2026" kecil di atas kolom? | Cukup `2026: <total>` di kepala layanan + keterangan di bawah daftar. |
| **K3** | Ingin **selisih** (▲/▼ terhadap 2026) di samping angka 2026? | **Tidak** untuk versi pertama; bisa ditambahkan belakangan tanpa mengubah data. |

---

## 9. Risiko & mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Pembanding dianggap "apel dengan apel" padahal 2027 menghitung semua input (T4) dan 2026 hanya aktif | Kesimpulan keliru | Keterangan di bawah daftar; K1 diputuskan eksplisit |
| Pengguna mengira ada persen capaian 2026 | Salah baca | Kolom 2026 hanya angka; keterangan "kuota 2026 tidak tersimpan" |
| Angka 2026 bergeser karena sinkron harian | Angka hari ini ≠ kemarin | Disebut di keterangan; data uji dibandingkan ulang pada hari uji |
| Kolom tambahan membuat baris sempit di HP | Tidak terbaca / meluap | Uji lebar 360 px; batang menyempit lebih dulu |
| Kueri tambahan memperlambat modal | Lebih lambat | Satu agregat ±12 ribu baris, berindeks, paralel; cache 5 menit tetap |
| Kegagalan kueri 2026 menjatuhkan Progres Kuota | Fitur lama rusak | D4: `try/catch` terpisah + uji nomor 5 |
| Deploy fungsi ditahan pengaman otomatis (terjadi pada tahap Retur) | Tertunda | Siapkan perintah deploy untuk dijalankan user; fungsi lebih dulu, frontend kemudian |
| `TAHUN_AKTIF` diganti tahun depan | Pembanding salah tahun | D5: `TAHUN_AKTIF − 1` |
| Kelas Tailwind baru tak masuk CSS | Gaya hilang | Pakai gaya inline / kelas yang ada; bila baru: build + `check-css` + naikkan `?v=` |

---

## 10. Status pengerjaan (2026-11-02)

**Keputusan user:** K1 = semua yang pernah tercatat · K2 = di kepala layanan · K3 = buatkan selisih.

**P1 — backend (SELESAI lokal):** `getProgresKuota` di `supabase/functions/api/domains/kuota.ts` menambah `input2026`, `selisih` per baris; `total2026`, `selisihTotal` per layanan; `bandingTersedia`, `tahunBanding` di tingkat atas. Kueri 2026 berurutan (bukan paralel; pooler pernah menggantung pada kueri paralel) dan `try/catch` sendiri.

**P2 — tampilan (SELESAI lokal):** `public/js/app-admin.js` (`bangunProgresKuotaHtml`, `htmlSelisihProgresKuota`, state `bandingProgresKuota`). Layar lebar: kolom paling kanan; HP: baris kedua kecil. CSS dibangun ulang (+3 aturan: `-mt-3`, `basis-full`, `sm:flex`), `?v=` CSS dan `app-admin.js` dinaikkan ke 20271063.

**Uji (semua lulus; kontrol negatif terbukti: versi lama gagal pada 8 dari 10 uji server dan tidak bisa memuat uji layar):**
- `npm run uji:progres-kuota` = 19 uji: server di Postgres sungguhan (PGlite) 10, layar 9. Uji PGlite perlu `PGLITE_DIR` (lihat `scripts/uji/_harness-pg.mjs`).
- **Regresi:** saat pembanding tidak ada, HTML sama dengan versi sebelum perubahan (sidik jari dari commit lama).
- Data produksi: seluruh 12.361 baris 2026 ada pada pasangan layanan × kecamatan yang punya baris kuota (0 tercecer); jumlah Bilal Jenazah 2026 = 2.681.
- Chrome sungguhan, data Bilal Jenazah asli: desktop 1000 px, iframe 360 dan 320 px, **tanpa luapan mendatar**. Pada 320 px batang menyusut jadi irisan tipis, **sama dengan versi lama** (dibuktikan dengan render versi lama).
- `check-css`, `verify-html`, `check-lines` (app-admin.js 3.025 baris), uji lain yang terkait (gerbang-aksi 6, validasi-penerima 75, sinkron-detail 10) lulus.

**Temuan untuk diperhatikan:** kuota 2027 hampir sama dengan tercatat 2026 di tiap kecamatan (Bilal Jenazah: kuota 2.686 vs 2026 2.681; Barat 45/45, Deli 184/184, Helvetia 279/279). Jadi kolom 2026 sering ≈ kuota dan selisih ≈ −sisa kuota. Itu fakta data, bukan galat.

**Belum:** P3 review akhir oleh user, commit, **P4a deploy fungsi `api`** (izin), **P4b push frontend** (izin), uji klik akun Admin Utama nyata. Fungsi harus tayang lebih dulu; frontend baru tanpa fungsi baru tetap tampil seperti lama (HTML identik).

**Review ketat (2026-11-02, setelah P2):** diff dibaca ulang utuh; tidak ada bentrok nama global (`bandingProgresKuota`, `htmlSelisihProgresKuota` hanya di `app-admin.js`); tag HTML **seimbang** pada tiga mode (server lama / pembanding gagal / pembanding ada; pencacah diuji dengan kontrol timpang & seimbang); **tipe TypeScript** `kuota.ts` bersih (`tsc` dengan konfigurasi repo; 7 galat lama ada di `kelolaData.ts`, `master.ts`, `penerima.ts`, `backup-spreadsheet`, bukan dari pekerjaan ini; kontrol negatif: kesalahan tipe sengaja terdeteksi); kueri 2026 di produksi **24 ms** pada panggilan hangat (panggilan pertama 661 ms = cache dingin; keduanya tidak memakai indeks karena seluruh partisi 2026 dibaca, wajar). Perbaikan dari review: tahun dari server dipaksa angka sebelum masuk atribut HTML. Setelah perbaikan: 19 uji, `check-css`, `verify-html` lulus ulang.
**Catatan operasional:** klien menyimpan jawaban `getProgresKuota` 5 menit (`api-bridge.js`), jadi tepat setelah deploy, jawaban lama yang masih tersimpan tampil seperti sebelumnya sampai kedaluwarsa (aman, bukan galat).
