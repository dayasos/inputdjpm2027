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
| D1 | Penyebaran saat edit rumah ibadah | **Otomatis berdasarkan ID**, dengan dialog konfirmasi yang menyebut jumlah penerima | menunggu jawaban |
| D2 | Ubah kecamatan/kelurahan rumah ibadah yang punya penerima tertaut | **Ditolak** dengan pesan jelas; penyebaran wilayah = fase lanjutan terpisah | menunggu jawaban |
| D3 | Hapus rumah ibadah yang masih dipakai | **Ditolak** ("masih dipakai N penerima") | menunggu jawaban |
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
