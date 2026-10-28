# Rencana: Penautan Penerima ke Rumah Ibadah lewat ID (versi 2)

Tanggal: 2026-10-27 · Status: **RENCANA — belum ada kode untuk penautan; hanya penjaga server (Fase 0) yang sudah ditulis lokal & diuji, belum di-commit/di-deploy**
Pemilik keputusan: Admin Utama (Dedi) · Menggantikan `plan-rumah-ibadah-berbasis-id.md` (versi 1) dan `plan-sebar-perubahan-rumah-ibadah.md` (sudah dihapus)

---

## 1. Ringkasan

**Tujuan akhir:** setiap penerima yang bertempat tugas di rumah ibadah terdaftar **tertaut ke ID rumah ibadah itu**, sehingga mengubah nama/alamat satu rumah ibadah hanya memperbarui penerima ber-ID tersebut, tidak menyentuh rumah ibadah lain yang namanya sama (usul user, 2026-10-27).

**Mengapa sekarang jauh lebih aman dibanding versi 1:** dua prasyarat berat sudah selesai.
1. **Data sudah bersih.** Setelah user memperbaiki daftar rumah ibadah dan data penerima, **0 dari 1.133 penerima layanan wajib-daftar yang tidak cocok** (diperiksa 2026-10-27). Tinjauan manual ±100 data (F8 versi 1) tidak diperlukan lagi.
2. **Penjaga server sudah ditulis** (lokal, 15 uji + 7 mutan tertangkap): tempat tugas layanan wajib-daftar tidak bisa lagi menyimpang dari daftar lewat input Admin Utama, edit data, maupun Kelola Data. Artinya setelah dibersihkan, data **tidak bisa kembali kotor**, sehingga penautan berbasis kecocokan teks stabil.

---

## 2. Kondisi dasar (diukur 2026-10-27, hanya baca)

| Hal | Nilai |
|---|---|
| Penerima 2027 | 3.439 |
| Cocok persis 1 rumah ibadah (nama+alamat), wilayah sama | **1.303** |
| Cocok ganda / wilayah berbeda | **0 / 0** |
| Layanan wajib-daftar (12 layanan): total / tidak cocok | **1.133 / 0** |
| Tempat tugas "RUMAH" (Guru Maghrib Mengaji) | 468 |
| Tempat tugas bebas yang sah: Bilal Jenazah 1.264, Penggali Kubur 384, GMM 3, Ustadz 5, Ustadzah 12 | ±1.668 |
| Rumah ibadah: total / pasangan nama+alamat kembar / alamat kosong | 2.874 / 0 / 0 |
| Yang sudah cocok di luar layanan wajib-daftar (ikut tertaut otomatis) | GMM 90, Ustadz 37, Ustadzah 27, Bilal 14, Penggali 2 = 170 |

`1.303 = 1.133 (layanan wajib) + 170 (lainnya yang kebetulan cocok)`. Jumlah bergerak karena input masih berjalan; angka dihitung ulang di setiap fase.

**Penulis `tempat_tugas`/`alamat_tugas` untuk 2027 (hasil inventaris kode, hanya 4):**
1. `penerima.ts` — simpan data baru (`insert into penerima`, ±baris 819).
2. `penerima.ts` — edit data (`editDataPenerima`, `update penerima`, ±baris 1203).
3. `kelolaData.ts` — Kelola Data (`adminUbahData`, update `penerima` + `data_detail`, ±baris 455-460).
4. `dataDetail.ts` — pembuatan baris `data_detail` (±baris 250), menyalin dari penerima.
(`sinkronSheet2026.ts` hanya menulis 2026 → di luar cakupan; `verifikasi.ts`/`statusPenerima.ts` tidak menulis tempat tugas.)

---

## 3. Tujuan dan batasan

**Tujuan**
- T1. Kolom `rumah_ibadah_id` (boleh kosong) di `penerima_2027` dan `data_detail_2027`, terisi untuk semua penerima yang cocok.
- T2. Penulis-penulis di atas mengisi/menjaga ID secara otomatis di server (klien tidak perlu diubah).
- T3. Mengubah nama/alamat rumah ibadah → penerima ber-ID itu ikut diperbarui (atomik, tercatat, bisa dipulihkan).
- T4. Rumah ibadah yang masih dipakai tidak bisa dihapus; perubahan wilayahnya ditolak (v1) bila ada penerima tertaut.
- T5. Tampilan petugas, Data Detail, cover PDF, ekspor **tidak berubah**.

**Bukan tujuan (v1)**
- N1. Data 2026 (`penerima_2026`, `data_detail_2026`) tidak disentuh.
- N2. Perubahan kecamatan/kelurahan rumah ibadah tidak disebarkan (menyangkut kuota & hak akses).
- N3. ID tidak ditampilkan ke pengguna biasa dan tidak masuk Cek Status publik.
- N4. Teks salinan tidak diganti dengan *join* (dipertahankan sebagai *snapshot* yang disamakan sistem).
- N5. Layanan bertempat tugas bebas (Bilal Jenazah, Penggali Kubur, RUMAH, LAINNYA) tidak dipaksa punya ID.

---

## 4. Prinsip pengerjaan
Bertahap; tiap fase diuji lokal; **produksi disentuh hanya atas izin eksplisit**; commit/push hanya atas perintah "commit dan push"; perubahan database hanya menambah; server menegakkan aturan; UI/UX petugas dipertahankan; keamanan tidak bergantung pada kerahasiaan ID (otorisasi tetap di server); tiap langkah produksi punya rollback tertulis.

---

## 5. Keputusan desain

| # | Keputusan | Rekomendasi | Status |
|---|---|---|---|
| D1 | Penyebaran saat edit rumah ibadah | **Otomatis berdasarkan ID**, dengan dialog konfirmasi yang menyebut jumlah penerima | **DISETUJUI user 2026-10-27** |
| D2 | Ubah kecamatan/kelurahan rumah ibadah yang punya penerima tertaut | **Ditolak** dengan pesan jelas; penyebaran wilayah = fase lanjutan terpisah | **DISETUJUI user 2026-10-27** |
| D3 | Hapus rumah ibadah yang masih dipakai | **Ditolak** ("masih dipakai N penerima") | **DISETUJUI user 2026-10-27** |
| D4 | Teks salinan di penerima | **Dipertahankan** | disarankan |
| D5 | Cara menautkan data baru | **Server menautkan sendiri** lewat nama+alamat persis (tepat 1 kecocokan); klien tidak diubah | disarankan |
| D6 | Kecocokan ganda | ID dikosongkan + dilaporkan (saat ini 0 kasus, tapi tidak ada batasan DB yang melarang) | disarankan |
| D7 | Foreign key `ON DELETE RESTRICT` (`NOT VALID` → `VALIDATE`) | **Fase akhir, opsional** | ditunda |
| D8 | Indeks unik tempat tugas teks | **Tidak diubah** di v1 | disarankan |
| D9 | Pendeteksi penyimpangan (kueri konsistensi §9) | **Dipakai rutin** setelah tiap fase | disarankan |
| D10 | Layanan wajib-daftar sebagai invarian | Setelah F3 stabil, pertimbangkan `CHECK`/pemeriksa: layanan wajib-daftar **harus** punya ID | ditunda |

---

## 6. Fase kerja

### F0 — Deploy penjaga server *(kode sudah ada & teruji lokal)*
- **Isi:** `_shared/wilayahTugas.ts` (helper `periksaTempatTugasDariDaftar`, cabang UTAMA), `penerima.ts` (edit), `kelolaData.ts` (Kelola Data), uji `server-wajib-daftar-rumah-ibadah.test.mjs`, skrip `uji:wajib-daftar-ri`, rencana ini.
- **Langkah:** (1) tinjau diff terakhir; (2) catat nomor versi fungsi `api` sekarang (untuk rollback); (3) atas perintah "commit dan push": commit + push; (4) atas izin: `npx supabase functions deploy api --project-ref wwqxbscumaakvziwzwjx --no-verify-jwt`; (5) uji asap tanpa menulis data: panggilan validasi (`validasiDataBaru`) sebagai UTAMA dengan layanan wajib-daftar + tempat bebas → harus ditolak; layanan Guru Maghrib Mengaji + "RUMAH" → tetap lolos; (6) jalankan kueri konsistensi (harus 0).
- **Dampak yang harus dimaklumi:** mengubah tempat/alamat/layanan penerima layanan wajib-daftar ke teks yang tak ada di daftar akan ditolak (ini tujuannya). Edit kolom lain tidak terpengaruh.
- **Rollback:** deploy ulang versi fungsi sebelumnya (cadangan disimpan di scratchpad seperti `rollback-api-v83/`); revert commit.
- **Gerbang:** uji asap lulus + kueri konsistensi 0.

### F1 — Migrasi database (additive)
- `alter table penerima_2027 add column rumah_ibadah_id bigint null;` dan sama untuk `data_detail_2027`; indeks biasa pada kolom itu (bukan unik).
- Tabel log `log_perubahan_rumah_ibadah` (`id`, `waktu`, `username`, `rumah_ibadah_id`, `aksi`, nilai lama/baru nama & alamat, `jumlah_penerima`, `daftar_penerima_id` array, `status`), RLS aktif seperti `log_verifikasi_massal`.
- Berkas migrasi baru di `supabase/migrations/`; **diterapkan atas izin**. Pertimbangan: tabel kecil (±3.400 baris) sehingga `add column` nullable & `create index` cepat; tetap dijalankan di luar jam ramai input.
- **Rollback:** `drop column`/`drop table` (tidak ada data lama yang berubah).
- **Gerbang:** kolom ada, aplikasi berjalan normal (tidak ada kueri `select *` yang rusak oleh kolom baru — cek ekspor/Data Detail).

### F2 — Pengisian awal (*backfill*)
- Skrip idempoten, hanya mengisi baris yang masih `NULL`: tautkan bila **tepat satu** rumah ibadah cocok nama+alamat ternormalisasi **dan** kecamatan+kelurahan sama.
- `data_detail_2027`: salin dari penerima induk (`penerima_id`+`tahun`).
- Dijalankan bertahap: (a) `SELECT` pratinjau (harus ≈ 1.303 dan 0 ambigu); (b) eksekusi per kelompok layanan (layanan wajib dulu); (c) verifikasi dengan kueri independen.
- Catatan operasional: koneksi database pernah penuh sesaat (`53300`); jalankan dalam kelompok kecil, bukan satu pernyataan raksasa.
- **Rollback:** `update ... set rumah_ibadah_id = null` (teks tidak pernah diubah).
- **Gerbang:** jumlah tertaut = perkiraan; sampel acak 30 baris benar; layanan wajib-daftar tertaut 100%.

### F3 — Penaut otomatis di server (empat penulis)
- Modul inti murni `tentukanRumahIbadahId(nama, alamat, daftar)` → `id | null | ambigu` + uji Node.
- Pasang di: simpan baru, edit data (bila tempat/alamat berubah), Kelola Data (tempat/alamat/layanan berubah; memakai `trx`), pembuatan `data_detail`. Tempat bebas/tak cocok → ID dikosongkan.
- Klien tidak diubah. Aplikasi lama yang ter-cache tetap benar karena server yang menentukan.
- **Uji:** server dengan database tiruan (`_harness-server.mjs`) + mutan (lupa satu penulis, lupa `data_detail`, ID tidak dikosongkan saat tempat jadi bebas).
- **Gerbang:** input baru/edit/Kelola Data terbukti mengisi/mengosongkan ID dengan benar.

### F4 — Edit & hapus rumah ibadah berbasis ID
- `ubahRumahIbadah` diperluas dalam **satu transaksi**: validasi lama → hitung penerima tertaut → bila wilayah berubah & ada tertaut → tolak (D2) → pra-periksa bentrok indeks unik (5 layanan) → update `rumah_ibadah` → update `penerima_2027` & `data_detail_2027` (`where rumah_ibadah_id = :id`) → `riwayat_edit` per penerima → log.
- Hanya bila nama/alamat berubah; selain itu perilaku **sama persis** dengan sekarang.
- `hapusRumahIbadah`: tolak bila tertaut > 0 (D3).
- Fungsi baca `hitungPemakaianRumahIbadah` (jumlah per layanan) untuk dialog; fungsi `pulihkanPerubahanRumahIbadah` (hanya bila nilai saat ini masih hasil perubahan).
- **Gerbang:** uji server + mutan (update tanpa filter ID → menyentuh semua nama sama; lupa tabel; lupa log; lupa tolak-wilayah).

### F5 — Tampilan admin
- Form Ubah: bila nama/alamat berubah → dialog "N penerima akan ikut diperbarui"; wilayah berubah + ada tertaut → pesan tolak; tombol Hapus → pesan tolak bila dipakai.
- Form petugas, daftar pilihan, Data Detail, cover: tidak berubah. Kelas CSS baru → `npm run build:css` + commit CSS, cek `npm run check-css`; naikkan `?v=` skrip yang berubah.
- **Uji:** Chrome headless (HP & desktop) dengan server tiruan.

### F6 — Rilis & uji nyata
- Review menyeluruh → "commit dan push" → deploy fungsi `api` → uji asap.
- Uji nyata user pada **satu rumah ibadah uji**: ubah nama → cek penerima tertaut, Data Detail, cover PDF → pulihkan → hapus-saat-dipakai ditolak.
- Pantau log fungsi beberapa hari.

### F7 — Pengerasan *(opsional)*
- FK `NOT VALID` → `VALIDATE`; invarian layanan wajib-daftar (D10); kueri konsistensi terjadwal; evaluasi penyebaran wilayah (D2) dengan rencana kuota tersendiri.

---

## 7. Strategi uji
- **Unit (Node):** normalisasi, penentuan ID (1 / 0 / >1), alamat kosong, layanan bebas.
- **Server (database tiruan):** tiap penulis; ubah rumah ibadah memperbarui **hanya** penerima ber-ID itu (nama sama tapi ID berbeda **tidak** berubah); wilayah berubah + tertaut → ditolak; bentrok indeks unik → batal total; tanpa perubahan nama/alamat → perilaku lama identik; hapus saat dipakai → ditolak; pulihkan; hanya UTAMA; token buruk; ID tak ada.
- **Layar (Chrome headless):** dialog, pesan tolak, regresi form petugas.
- **Perusakan (mutan):** hapus penjaga UTAMA/konflik/filter ID/tabel kedua/log/tolak-wilayah → semua harus tertangkap.
- **Data nyata (baca saja):** bandingkan hasil backfill & hitungan pemakaian dengan SQL independen; kueri konsistensi 0.
- **Regresi:** `uji:wajib-daftar-ri`, `uji:validasi-penerima` (75), `uji:cover` (14), `check-css`.

---

## 8. Risiko dan mitigasi

| Risiko | Skenario | Mitigasi |
|---|---|---|
| Tautan salah | Nama+alamat sama persis milik rumah ibadah lain | Syarat wilayah sama; tepat 1 kecocokan; ambigu dikosongkan; verifikasi SQL independen (saat ini 0 ambigu) |
| Penulis terlewat | Jalur simpan lain tak mengisi ID | Inventaris (4 penulis); pendeteksi penyimpangan (D9) |
| Bentrok indeks unik | Rename ke nama yang dipakai penerima lain di layanan sama | Pra-periksa; batal total |
| Setengah jalan | Satu tabel terbarui, satu gagal | Satu transaksi |
| Kuota/akses bergeser | Wilayah rumah ibadah diubah | Ditolak (D2) |
| Koneksi database penuh | Backfill/transaksi besar (`53300` pernah terlihat) | Kelompok kecil; luar jam ramai; pool dibatasi 2 koneksi → di dalam transaksi hanya pakai `trx` |
| Edit daftar merusak kecocokan lain | Mengedit teks daftar saat penerima lain bergantung pada teks lama (sudah terjadi pada daftar 97 → Maghzanul Ilmi) | Setelah F4 diatasi sistem (menyebar by ID); sebelum itu, ikuti aturan: ubah daftar hanya bila 0 penerima lain bergantung |
| Cache klien lama | Petugas melihat nama lama sementara | Invalidasi cache `rumah_ibadah`; TTL 15 menit; tidak merusak data |
| Salah ubah massal | Admin salah mengubah nama | Dialog konfirmasi + log + fungsi pulihkan |
| Sinyal realtime berlebih | Banyak baris diubah sekaligus | Uji di F5; kelompokkan bila perlu |

**Rollback ringkas:** F0 redeploy versi lama; F1 drop kolom/tabel; F2 set NULL; F3–F5 kembalikan fungsi `api` + revert commit; perubahan teks yang sudah menyebar dipulihkan dari log.

---

## 9. Kueri konsistensi (baca saja, dijalankan setelah tiap fase)

```sql
-- (a) Layanan wajib-daftar yang tempat tugasnya tidak ada di daftar rumah ibadah (target: 0)
with r as (select upper(btrim(regexp_replace(nama,'\s+',' ','g'))) n,
                  upper(btrim(regexp_replace(coalesce(alamat,''),'\s+',' ','g'))) a from rumah_ibadah)
select count(*) filter (where not exists (
         select 1 from r where r.n = upper(btrim(regexp_replace(coalesce(p.tempat_tugas,''),'\s+',' ','g')))
                           and r.a = upper(btrim(regexp_replace(coalesce(p.alamat_tugas,''),'\s+',' ','g'))))) as tidak_cocok,
       count(*) as total
from penerima_2027 p
where p.layanan in ('GURU SEKOLAH BUDDHA','GURU SEKOLAH HINDU','GURU SEKOLAH MINGGU','GURU SEKOLAH KONG HU CHU',
  'PENATUA GEREJA','IMAM MASJID','KHATIB JUMAT','NAZIR MASJID','NAZIR MUSHOLLA','PENGURUS GEREJA',
  'PENGURUS VIHARA/KLENTENG/KUIL','PETUGAS GEREJA KATOLIK');
```
Setelah F2 ditambah: (b) penerima tertaut yang teksnya berbeda dari rumah ibadahnya (target: 0); (c) layanan wajib-daftar yang `rumah_ibadah_id` kosong (target: 0).

---

## 10. Pertanyaan terbuka
1. **D1** — penyebaran otomatis dengan dialog konfirmasi: setuju?
2. **D2** — ubah kecamatan/kelurahan rumah ibadah yang masih dipakai ditolak dulu: setuju?
3. **D3** — rumah ibadah yang masih dipakai tidak bisa dihapus: setuju?
4. **F0** — kapan penjaga server boleh di-commit dan di-deploy (data sudah bersih, jadi tidak menunggu perbaikan lagi)?
5. Ada rumah ibadah yang cocok dijadikan **kasus uji nyata** di F6?

---

## 11. Kriteria selesai
- Kueri konsistensi (a), (b), (c) = 0; backfill menautkan sesuai perkiraan tanpa tautan salah pada sampel.
- Mengubah nama/alamat satu rumah ibadah hanya mengubah penerima ber-ID itu (terbukti uji + uji nyata); data bernama sama lain tidak tersentuh.
- Wilayah-berubah, bentrok unik, hapus-saat-dipakai ditangani sesuai D2/D3.
- Form petugas, Data Detail, dan cover tidak berubah tampilan/perilaku.
- Semua uji lulus, mutan tertangkap, `check-css` OK, uji asap produksi lulus, user menyatakan uji nyata sesuai.

---

## 12. Catatan realisasi F0 (2026-10-27)

- **Dikerjakan:** commit `cb88b3b` (di-push ke `main`), deploy fungsi `api` **v84 → v85** (`npx supabase functions deploy api ...`).
- **Pemeriksaan sebelum deploy:** 40 dari 40 berkas fungsi yang live (v84) identik dengan HEAD → HEAD adalah titik pemulihan yang sah; salinan v84 disimpan di scratchpad (`rollback-api-v84/api-v84-live.json`). Semua uji lulus (15 + 75 + 14), `check-css` OK. Peringatan `check-lines` (index.html, app-transaksi.js > 3.500 baris) sudah ada sebelumnya.
- **Pemeriksaan sesudah deploy:** 40 dari 40 berkas live (v85) identik dengan `cb88b3b`. Uji asap tanpa-tulis: jalur langsung ke fungsi lulus (login palsu ditolak rapi, aksi tulis dengan token palsu ditolak, aksi tak dikenal ditolak). Pengujian lewat proxy sempat gagal pada beberapa lari karena **galat koneksi database (53300) yang sudah ada sebelum deploy** (lihat di bawah), bukan karena kode baru.
- **Belum teruji di produksi:** perilaku penjaga baru itu sendiri (butuh token Admin Utama yang sah; token uji tidak boleh dibuat dari sini). Cara uji manual oleh user: lihat pesan penutup F0 di percakapan (Kelola Data: ubah tempat tugas penerima layanan wajib-daftar ke teks bebas → harus ditolak dengan pesan "tidak ada di daftar rumah ibadah"; ubah ke nama+alamat persis daftar → berhasil).
- **Temuan besar di luar cakupan (sudah ada SEBELUM F0):** database `max_connections` = 60 dan sering penuh. Log menunjukkan galat `remaining connection slots are reserved for roles with the SUPERUSER attribute` ratusan sampai >1.000 kali per jam pada jam kerja (26 Okt 04-09 UTC; 27 Okt 02-04 UTC) dengan **±8-13% permintaan fungsi berstatus 5xx**. Fungsi `api` memakai `SUPABASE_DB_URL` dengan pool 2 koneksi per instance (`_shared/db.ts`). Perlu rencana tersendiri (bukan bagian rencana ini).

## 13. Catatan realisasi F1–F3 bagian LOKAL (2026-10-27) — belum diterapkan ke produksi

- **D1–D3 DISETUJUI user** (2026-10-27).
- **Ditulis lokal (belum di-commit, belum di-deploy, belum diterapkan):**
  - `supabase/migrations/20261027100000_rumah_ibadah_id_penerima.sql` — kolom `rumah_ibadah_id` nullable pada induk `penerima` & `data_detail` (menurun ke partisi 2026/2027), indeks parsial, tabel `log_perubahan_rumah_ibadah` (RLS aktif). `lock_timeout 5s`.
  - `scripts/backfill-rumah-ibadah-id.sql` — pratinjau (A), eksekusi (B1 penerima, B2 data_detail), verifikasi (C1–C4). Pratinjau terukur: dari 3.512 penerima, **1.339 akan ditautkan, 0 ambigu**.
  - Kode server: `pilihRumahIbadahId` + `cariRumahIbadah` kini mengembalikan `id` (`_shared/wilayahTugas.ts`); kabel di simpan baru & edit data (`penerima.ts`), Kelola Data (`kelolaData.ts`, penerima + data_detail), pembuat data_detail (`dataDetail.ts`).
  - Uji: `npm run uji:tautan-ri` (15 uji, 8 mutan tertangkap); uji lain tetap lulus (wajib-daftar 15, validasi 75, cover 14, db-pool 3).
- **URUTAN WAJIB saat dirilis (agar aplikasi tidak rusak):** (1) terapkan migrasi → (2) deploy fungsi `api` (kode F3 menulis kolom baru; tanpa migrasi, simpan baru dan sinkron data_detail GAGAL "column does not exist") → (3) jalankan backfill B1–B2 → (4) ulangi B1–B2 sekali lagi (menangkap penerima yang masuk di antara langkah 3 dan 2) → (5) verifikasi C1–C4 (semua harus 0).
- **Syarat sebelum menyentuh produksi:** koneksi database stabil di jam sibuk (lonjakan ±800 permintaan/2 menit masih memicu ±8% 5xx walau `idle_timeout` sudah 2 dtk; lihat memori `project_koneksi_db_penuh_5xx`).
- **Belum dikerjakan:** F4 (edit/hapus rumah ibadah berbasis ID + dialog), F5 (tampilan admin), F6 (rilis & uji nyata).

## 14. Catatan realisasi F4–F5 bagian LOKAL (2026-10-27) — belum diterapkan ke produksi

- **F4 (server, `domains/master.ts` + `index.ts`):**
  - `ubahRumahIbadah` kini satu transaksi (`sql.begin` + `for update`): menolak nama+alamat kembar dengan rumah ibadah lain; menolak ubah kecamatan/kelurahan bila ada penerima tertaut (D2); memeriksa `jumlahDikonfirmasi` (bila dikirim) terhadap jumlah sebenarnya; pra-periksa bentrok indeks unik (5 layanan) sebelum menulis; mencatat `riwayat_edit` SEBELUM mengubah; memperbarui `penerima` dan `data_detail` **lewat `rumah_ibadah_id`** (bukan lewat nama); menulis `log_perubahan_rumah_ibadah`; terakhir mengubah `rumah_ibadah`.
  - `hapusRumahIbadah`: satu pernyataan `delete … where not exists (penerima tertaut)` (tanpa celah cek-lalu-hapus); bila masih dipakai ditolak dengan jumlah (D3).
  - `tambahRumahIbadah`: menolak nama+alamat kembar (perubahan perilaku kecil, perlu agar kunci nama+alamat tetap unik).
  - Aksi baru `hitungPemakaianRumahIbadah` (jumlah total + per layanan) terdaftar di `ALLOWED`.
  - **Penyederhanaan dari rencana awal:** fungsi `pulihkanPerubahanRumahIbadah` TIDAK dibuat. Karena penyebaran kini tepat sasaran lewat ID, **memulihkan = mengedit rumah ibadah kembali ke nilai lama lewat menu yang sama** (ikut menyebar lagi, tercatat di riwayat). Log menyimpan nama/alamat lama dan daftar id sebagai jejak audit.
- **F5 (tampilan, `app-kelola-ibadah.js`, `?v=20271044`):** sebelum menyimpan perubahan nama/alamat/wilayah, halaman memanggil `hitungPemakaianRumahIbadah`; bila ada penerima terdampak → dialog "Perbarui Data Penerima Terkait" (jumlah + rincian per layanan); bila wilayah berubah & dipakai → ditolak di layar; bila gagal menghitung → TIDAK menyimpan; perbedaan hanya huruf/spasi dianggap tidak berubah. `api-bridge.js`: cache penerima/dashboard/data_detail/riwayat ikut disegarkan setelah `ubahRumahIbadah`.
- **Uji:** `npm run uji:rumah-ibadah-id` (17 uji; 9 dari 10 mutan tertangkap — 1 mutan setara secara logika); uji layar Chrome `scripts/uji/layar/ibadah-konfirmasi-tautan.mjs` (12 pemeriksaan; 6 dari 6 mutan tertangkap; butuh `npx vite --port 3123 --strictPort`).
- **Uji SQL di Postgres sungguhan (dibatalkan otomatis, tanpa menyentuh data):** 13 pernyataan F4 valid (termasuk penentuan tipe parameter, `INSERT … SELECT` dengan cast); hanya penerima ber-ID yang berubah (penerima senama tak tertaut, rumah ibadah lain, dan arsip 2026 tidak berubah); riwayat, log, dan hapus berperilaku benar. Sintaks migrasi diuji pada tabel berpartisi tiruan: kolom turun ke kedua partisi, indeks parsial terbentuk, idempoten, RLS log aktif, `anon` tanpa hak.
- **Catatan teknis:** nilai `\s` pada regex hilang dua kali saat berkas ditulis lewat jalur tertentu (tertangkap uji layar); semua regex pada berkas yang diubah sudah diperiksa ulang benar.
- **Masih menunggu:** F6 (rilis + uji nyata) — dengan URUTAN WAJIB di §13 dan syarat koneksi database stabil. Kode F4 juga membaca kolom/tabel baru → **jangan di-deploy sebelum migrasi diterapkan**.

## 15. Tinjauan mendalam sebelum rilis (2026-10-27) — temuan, perbaikan, batasan, runbook

### 15.1 Cara meninjau
Baca ulang seluruh diff; petakan SEMUA penulis `tempat_tugas`/`alamat_tugas` (tepat 4: simpan baru, edit data, Kelola Data, pembuat data_detail — `sinkronSheet2026` hanya 2026, `verifikasi`/`statusPenerima`/`kelolaData:595` tidak menyentuhnya; tidak ada trigger sinkron); uji SQL di Postgres sungguhan (tabel sementara, dibatalkan otomatis); uji perusakan (mutan) di server dan tampilan; uji layar Chrome; pemeriksaan data produksi baca-saja.

### 15.2 Kelemahan yang DITEMUKAN dan SUDAH DIPERBAIKI
1. **D1 bisa dilewati.** `jumlahDikonfirmasi` dulu opsional: klien lama atau permintaan langsung dapat memperbarui banyak penerima tanpa dialog. → Server kini MENOLAK (`perluKonfirmasi`) bila perubahan akan memperbarui ≥ 1 penerima dan jumlah tidak dikirim; jumlah berbeda → `jumlahBerubah`.
2. **UI melewati dialog bila data pembanding hilang** (`!!asli && …`). → Kini dianggap BERUBAH sehingga pemeriksaan + dialog tetap jalan.
3. **Ketergantungan pada fitur pustaka yang tak bisa diuji lokal**: fragmen SQL bersarang di `cariKembarRumahIbadah` dan `layanan in ${trx(array)}`. → Diganti kueri biasa (dua varian) dan satu kueri per layanan berbatas (maks. 5).
4. **Parameter tanpa tipe pada `INSERT … SELECT`** (riwayat). → Cast eksplisit `::text`; terbukti valid di Postgres sungguhan.
5. **Pesan galat mentah bila foreign key menolak hapus.** → Pesan ramah.
6. **Pengecualian ID sendiri pada pemeriksaan kembar tidak terkunci uji.** → Uji bentuk kueri ditambahkan (2 mutan lolos → tertangkap).
7. **Regex `\s` rusak** pada `normTeks` di tampilan (ditulis `/s+/`) — tertangkap uji layar; seluruh regex lain diperiksa.

### 15.3 Penambahan pengaman
- `scripts/backfill-rumah-ibadah-id.sql` Bagian **D (rekonsiliasi)**: menyembuhkan drift (teks penerima/data_detail tertaut ≠ rumah ibadahnya). Diuji di Postgres sungguhan: hanya baris menyimpang yang berubah; baris yang sudah sama (setelah normalisasi), tak tertaut, dan arsip 2026 tidak tersentuh.
- `supabase/migrations/20261027100100_fk_rumah_ibadah_id.sql`: foreign key `ON DELETE RESTRICT` (penerima & data_detail → rumah_ibadah). **BELUM diuji di database** (uji pada tabel tiruan sempat tidak dijalankan); idempoten; terapkan setelah pengisian awal + verifikasi C3 = 0, di luar jam ramai. Opsional tapi dianjurkan: menutup mutlak tautan yatim akibat balapan.

### 15.4 Batasan / risiko yang DITERIMA (diketahui, bukan lupa)
1. **Balapan langka**: penerima disimpan tepat (milidetik) saat rumah ibadahnya diganti nama → teks penerima bisa tertinggal lama padahal ID benar. Tidak dikunci di jalur simpan (jalur ramai) karena menambah kompleksitas; dideteksi oleh C2 dan disembuhkan Bagian D.
2. **`data_detail` tidak ikut diperbarui oleh "Lihat Data → Edit"** (sudah begitu sebelum fitur ini; hanya Kelola Data yang menyinkronkannya). Akibatnya tautan/teks `data_detail` bisa tertinggal terhadap `penerima` setelah edit biasa. Tidak diubah karena di luar cakupan; layak ditinjau tersendiri.
3. **Cache daftar rumah ibadah di klien (≤ 15 menit)**: petugas masih bisa memilih nama lama sesudah diganti nama → server menolak untuk layanan wajib-daftar dengan pesan yang menjelaskan; cukup muat ulang.
4. **Edit tempat tugas lewat "Lihat Data" untuk layanan wajib-daftar** masih berupa kolom teks bebas: petugas harus mengetik persis seperti daftar (kini dijaga server). Saran lanjutan: kunci kolom itu + tombol pilih seperti di input baru.
5. **Sebelum F6 dirilis**, mengganti nama rumah ibadah yang punya penerima TIDAK menyebar (perilaku lama) dan penerima lama menjadi tak cocok daftar; hindari sampai rilis.
6. **Kondisi koneksi database**: galat 5xx turun dari ±17% ke ±0,2–2,5% setelah `idle_timeout` 2 dtk, tetapi puncak jam kerja belum teramati penuh. Rilis (F6) menunggu bukti kestabilan.

### 15.5 Runbook rilis F6 (URUTAN WAJIB, tiap langkah ada syarat lanjut dan cara mundur)
| # | Langkah | Syarat sebelum | Verifikasi | Mundur |
|---|---|---|---|---|
| 0 | Cek 5xx jam sibuk & koneksi (`53300`) | 5xx < ±2% pada puncak | log | — (tunda rilis) |
| 1 | Terapkan `20261027100000_rumah_ibadah_id_penerima.sql` | luar jam ramai; `lock_timeout` 5 dtk | kolom ada di `penerima` & `data_detail` (+ partisi); aplikasi normal | drop kolom/tabel/indeks |
| 2 | Commit + push; deploy fungsi `api` | migrasi langkah 1 SUDAH ada | `list_edge_functions` versi baru; 40/40 berkas = HEAD; uji asap tanpa-tulis | redeploy dari commit sebelumnya (`cb88b3b` + `f8072ae`) |
| 3 | Pengisian awal B1 lalu B2 (satu per satu) | pratinjau A ≈ perkiraan, ambigu 0 | C1 (layanan wajib 100% tertaut), C2/C3/C4 = 0 | `update … set rumah_ibadah_id = null` |
| 4 | Ulangi B1–B2 sekali | — | C1–C4 | idem |
| 5 | (Dianjurkan) terapkan `20261027100100_fk_rumah_ibadah_id.sql` | C3 = 0; luar jam ramai | `pg_constraint` | drop constraint |
| 6 | Uji nyata user pada SATU rumah ibadah uji: ubah nama → dialog → cek penerima, Data Detail, cover PDF → ubah balik; coba hapus yang dipakai (harus ditolak); coba ubah kelurahan (harus ditolak) | langkah 1–5 selesai | hasil sesuai | ubah balik lewat menu yang sama |
| 7 | Pantau log fungsi 1–2 hari; ulangi C1–C4 | — | semua 0 | Bagian D bila C2 > 0 |

### 15.6 Status uji akhir
`uji:rumah-ibadah-id` 23, `uji:tautan-ri` 15, `uji:wajib-daftar-ri` 15, `uji:db-pool` 3, `uji:validasi-penerima` 75, `uji:cover` 14 — semua lulus; uji layar 12/12; mutan: server F4 8/10 (+1 setara) lalu 6/6 untuk pengaman baru, tampilan 6/6, penautan 8/8, penjaga F0 7/7; `check-css` OK.

## 16. Perbaikan sinkron Data Detail (2026-10-27) — terpisah dari rilis rumah ibadah

- **Temuan:** "Lihat Data → Edit" tidak pernah memperbarui `data_detail` (hanya Kelola Data). Perbandingan semua kolom salinan: 8 dari 2.859 penerima 2027 berbeda (nama, nama/nomor rekening, tanggal lahir/umur [0199→1989, umur 1827→37], status BPJS).
- **Sinkron data (SELESAI, terverifikasi):** 8 baris `data_detail` disamakan dengan `penerima` dalam satu blok atomik dengan dua pengaman (himpunan baris berbeda harus persis 8 ID yang disetujui; baris diubah harus tepat 8). Setelah itu 0 baris berbeda; `status`/`tgl_status`/`dibuat_at` utuh. Pemulihan: `scratchpad/PEMULIHAN-sinkron-data-detail.sql` (nilai lama saja).
- **Perbaikan kode (di-push `5167faf`, fungsi BELUM di-deploy):** `editDataPenerima` kini memperbarui `penerima` dan salinan `data_detail` dalam satu transaksi (daftar kolom `KOLOM_SALINAN_DATA_DETAIL`; berkas/koordinat tidak menyentuhnya); cache klien domain `data_detail` ikut disegarkan. Uji `npm run uji:sinkron-detail` (10 uji; 8 mutan tertangkap). Frontend (`api-bridge.js`/`index.html`) ikut live lewat push.
- **Deploy ditolak pengaman otomatis ("Production Deploy")** → menunggu izin pengguna. **DEPLOY HARUS DARI CHECKOUT BERSIH `5167faf`, BUKAN dari folder kerja utama** (folder utama memuat kode F3/F4 yang butuh migrasi dan akan merusak simpan data bila di-deploy lebih dulu). Checkout bersih tersedia sebagai git worktree di `scratchpad/wt-sinkron` (cabang `fix/sinkron-data-detail`, `node_modules` ditautkan): `cd` ke sana lalu `npx --no-install supabase functions deploy api --project-ref wwqxbscumaakvziwzwjx --no-verify-jwt`; sesudahnya banding 40/40 berkas live dengan commit tersebut dan jalankan ulang perbandingan data_detail vs penerima (target 0).
- **Sampai fungsi di-deploy**, edit baru lewat Lihat Data masih bisa menimbulkan selisih baru; cek ulang dengan kueri perbandingan semua kolom lalu sinkron seperti di atas bila ada.
