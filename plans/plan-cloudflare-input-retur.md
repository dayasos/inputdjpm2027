# Plan: Migrasi ke Cloudflare Workers — 2 Subdomain (Input & Retur) dalam 1 Akun

> Status: **DRAF — Fase 0 berjalan** (akun Cloudflare, zona & 2 Worker sudah dibuat 2026-10-18; lihat §2.1). D1 condong ke **Opsi A** (2 proyek Supabase), lihat §3.
> Dibuat: 2026-10-18 · Target Retur dipakai: **Februari 2027**
> Prinsip kerja: setiap fase = rencana → uji lokal / `workers.dev` → konfirmasi → produksi, **selalu ada jalan balik**.

---

## Daftar isi
1. [Tujuan & batasan](#1-tujuan--batasan)
2. [Kondisi sekarang (terverifikasi 2026-10-18)](#2-kondisi-sekarang-terverifikasi-2026-10-18)
3. [Keputusan yang harus diambil](#3-keputusan-yang-harus-diambil)
4. [Arsitektur target](#4-arsitektur-target)
5. [Fase 0 — Persiapan & inventaris](#fase-0--persiapan--inventaris)
6. [Fase 1 — Pindah DNS ke Cloudflare](#fase-1--pindah-dns-ke-cloudflare)
7. [Fase 2 — Penguatan sebelum pindah](#fase-2--penguatan-sebelum-pindah)
8. [Fase 3 — Input ke Cloudflare Workers](#fase-3--input-ke-cloudflare-workers)
9. [Fase 4 — Repo Retur baru](#fase-4--repo-retur-baru)
10. [Fase 5 — Backend melayani 2 subdomain](#fase-5--backend-melayani-2-subdomain)
11. [Fase 6 — Worker Retur & subdomain retur](#fase-6--worker-retur--subdomain-retur)
12. [Fase 7 — Pensiun Vercel & Retur lama](#fase-7--pensiun-vercel--retur-lama)
13. [Lampiran A — Tambahan bila memilih 2 database](#lampiran-a--tambahan-bila-memilih-2-database-opsi-a)
14. [Lampiran B — Daftar uji (regression checklist)](#lampiran-b--daftar-uji-regression-checklist)
15. [Lampiran C — Inventaris secret & env](#lampiran-c--inventaris-secret--env)
16. [Lampiran D — Risiko & mitigasi](#lampiran-d--risiko--mitigasi)
17. [Lampiran E — Jadwal usulan](#lampiran-e--jadwal-usulan)
18. [Lampiran F — Runbook jalan balik](#lampiran-f--runbook-jalan-balik)

---

## 1. Tujuan & batasan

### Tujuan
- **1 akun Cloudflare** yang menampung domain `djpmkotamedan.web.id` dan 2 aplikasi:
  - **Input** → `djpmkotamedan.web.id` (opsional alias `input.djpmkotamedan.web.id`)
  - **Retur & Kematian** → `retur.djpmkotamedan.web.id` (menggantikan `retur2027.vercel.app`)
- **2 repo GitHub**, masing-masing ter-deploy otomatis ke Worker sendiri:
  - `dayasos/input` → Worker `inputdjpm2027`
  - `dayasos/Retur2027` → Worker `retur2027`
- Lepas dari Vercel **Hobby**. Paket itu hanya untuk pemakaian pribadi/non-komersial, dan proyek *di-pause* bila kuota habis.
- Lebih robust: deploy otomatis, rollback per versi, cron tidak bergantung hosting.

### Bukan tujuan (non-goals)
- **Tidak** menjanjikan aplikasi "lebih cepat" secara signifikan. Bottleneck ada di Supabase (Edge Function + Postgres), bukan hosting. Saat ini TTFB `/api/gas` ±0,19 dtk dari `sin1`.
- **Tidak** menghidupkan lagi SSO Input↔Retur (keputusan 2026-10-11: tanpa SSO).
- **Tidak** memporting fitur chat (sudah dihapus 2026-09-12).
- **Tidak** mengubah UI/UX maupun bentuk data yang sudah dipakai pengguna.

---

## 2. Kondisi sekarang (terverifikasi 2026-10-18)

| Komponen | Fakta |
|---|---|
| Domain | `djpmkotamedan.web.id`. Registrar & DNS: **Domainesia** (`nsx1/nsx2.domainesia.com`). A record → `216.198.79.1` (Vercel). TTL default 3600. Tidak terlihat MX/TXT lewat 8.8.8.8, tapi **wajib dicek ulang di panel Domainesia**. |
| Hosting Input | Vercel Hobby, proyek `inputdjpm2027` (`prj_KPAZ…`), fungsi `api/gas` & `api/cron` di `sin1`. |
| Hosting Retur lama | Vercel proyek `web` (`prj_j9nm…`), repo `dayasos/Retur2027` (isi: `Kode.gs`, `Upload.html`, `Loading.html`, `web/`). Backend = Google Apps Script. Form lapor **publik tanpa login**. |
| Peran `/api/gas` | Hanya 3 aksi lewat proxy: `pulihkanSesi`, `logoutPengguna`, `ping` ([public/js/api-bridge.js:172](../public/js/api-bridge.js)). Aksi lain langsung browser → Supabase Edge Function `api`. |
| Cron Vercel | `cekBatasWaktuVerifikasi` 18:00 UTC (01:00 WIB) via `api/cron.js`. Cron lain sudah di **pg_cron** (bersihkan sesi, outbox, event bus, idempotency, sync 2026). |
| Kerangka Cloudflare | Sudah ada tapi **usang**: `functions/api/gas.js` (format *Pages Functions*, 2026-09-20), `public/_headers`, `cloudflare/cron-worker/`. |
| Retur baru | **Sudah LIVE di DB Input**: 11 tabel `retur_*` (migrasi `20261011100000_retur_terintegrasi`, `20261012110000_retur_riwayat_search_path`), domain `retur.ts` (269 baris) & `returAdmin.ts` (390 baris) di fungsi `api`, frontend `app-retur.js` (705) & `app-retur-status.js` (436) di repo Input, hanya untuk UTAMA. Ada **data sungguhan** hasil impor bank. Branch lokal `feat/retur-status-penerima` (laporan status + aktivasi kembali) belum di-deploy. |
| Ketergantungan data Retur | Membaca/menulis `retur_impor`, `retur_daftar`, `retur_rek_tidak_ditemukan`, `retur_proses`, `retur_riwayat`, **`data_detail`**, **`akun`**. Laporan status **mengubah `data_detail.status`**, dan itu mempengaruhi Pembayaran. |
| CORS fungsi `api` | `access-control-allow-origin: *` (supabase/functions/api/index.ts:195). |
| supabase-js | Dimuat dari `cdn.jsdelivr.net/npm/@supabase/supabase-js@2`, **tanpa versi persis**. |
| Sisa SSO | Env `SSO_SECRET_KEY`, `SSO_URL_RETUR` masih dibaca kode fungsi. |

### 2.1 Pemetaan dari user & kondisi Cloudflare/Supabase (dicek via API 2026-10-18)

| Aplikasi | Worker (`workers.dev`) | Domain | Proyek Supabase |
|---|---|---|---|
| Input | `inputdjpm2027.danajasa-dinsos26.workers.dev` | `djpmkotamedan.web.id` | `wwqxbscumaakvziwzwjx` "Input DJPM", region **ap-northeast-1 (Tokyo)** |
| Retur & Kematian | `retur2027.danajasa-dinsos26.workers.dev` | `retur.djpmkotamedan.web.id` | `hejczfikldccjdioalem` "Retur & Kematian", region **ap-southeast-1 (Singapura)**, dibuat 2026-10-11, **fungsi `api` belum ada** |

Akun Cloudflare `30e00ec8…c2be`, subdomain workers.dev `danajasa-dinsos26`. Kedua proyek Supabase berada di **organisasi yang sama** (`ukffpimcpqhulnzqlltm`).

| Item Cloudflare | Kondisi | Tindakan |
|---|---|---|
| Zona `djpmkotamedan.web.id` | **pending**, paket Free. NS tujuan: `guss.ns.cloudflare.com`, `katelyn.ns.cloudflare.com`. Registrar asal: PT Registrasi Neva Angkasa (Domainesia) | Ganti NS di Domainesia (Fase 1) |
| Worker `inputdjpm2027` | template dashboard "Hello World", **tanpa aset**, workers.dev → error 1042 | Ganti dengan deploy dari repo (Fase 3) |
| Worker `retur2027` | sama, template kosong | Deploy dari repo Retur (Fase 6) |
| Custom domain `retur.djpmkotamedan.web.id` → `retur2027` | sudah terpasang (record AAAA `100::` otomatis) | Aktif setelah zona Active. Sampai Worker berisi, pengunjung hanya melihat template |
| Record `*.retur` AAAA `100::` | ada, proxied | Hapus bila tidak dipakai (wildcard tidak dibutuhkan) |
| Record apex `A 216.198.79.1` | **proxied (oranye)** ⚠️ | **Ubah ke DNS only sebelum ganti NS.** Vercel tidak mendukung trafik yang di-proxy pihak lain (risiko SSL/redirect loop) |
| Record `www` CNAME `…vercel-dns-017.com` | **proxied (oranye)** ⚠️ | Sama: DNS only |
| MX / TXT | tidak ada di zona Cloudflare | Pastikan di panel Domainesia memang tidak ada. Bila ada, tambahkan dulu |

> ⚠️ **Temuan performa:** database Input ada di **Tokyo**, padahal fungsi Vercel di `sin1` dan pengguna di Medan. Setiap query menempuh Medan→Singapura→Tokyo. Memindah region Supabase berarti membuat proyek baru dan memindahkan data (pekerjaan besar, di luar plan ini). Tapi ini kandidat terbesar untuk "lebih cepat", jauh melebihi pindah hosting. Dicatat sebagai **pekerjaan lanjutan**. Untuk Worker Input, aktifkan `placement: smart` supaya Worker berjalan dekat database.

> 🔐 Token API Cloudflare sempat ditempel di percakapan 2026-10-18. **Cabut (roll) token itu** setelah pekerjaan, lalu simpan token baru hanya di `wrangler login` / secret CI, jangan di file repo.

---

## 3. Keputusan yang harus diambil

> **Update 2026-10-18:** user memetakan Retur ke proyek Supabase terpisah (`hejczfikldccjdioalem`), sehingga D1 condong ke **Opsi A**. Sebelum Fase 4 dimulai, konfirmasi sekali lagi bahwa konsekuensi di [Lampiran A](#lampiran-a--tambahan-bila-memilih-2-database-opsi-a) diterima: sinkron data penerima & status dua arah, akun ganda, dan pemindahan 11 tabel `retur_*` dari DB Input. Bila jadi A, Fase 4–6 dikerjakan bersama langkah A1–A8.

> ⚠️ Permintaan "2 database" **membalik** keputusan 2026-10-11 (Retur digabung ke Input), padahal penggabungan sudah live di produksi. Pilih salah satu sebelum Fase 4.

| | **A. Pisah total** | **B. Pisah tampilan, data satu** ✅ rekomendasi | **C. Tetap gabung** |
|---|---|---|---|
| Subdomain | 2 | 2 | 1 + `retur.*` redirect ke menu Retur |
| Repo | 2 | 2 (Retur2027 = frontend Retur) | 1 |
| Database / proyek Supabase | **2** | **1** | 1 |
| Tabel akun | 2 (sinkron manual/otomatis) | 1, login per subdomain | 1 |
| Sinkron `data_detail` & status | **Wajib dibangun dua arah** | Tidak perlu | Tidak perlu |
| Pindah data Retur yang sudah ada | Ya | Tidak | Tidak |
| Biaya Supabase | Bisa naik (proyek ke-2) | Tetap | Tetap |
| Usaha relatif | ±3× | 1× | 0,3× |
| Risiko status saling menimpa | **Tinggi** | Rendah | Rendah |

**Rekomendasi: B.** Tetap ada 2 subdomain + 2 repo yang deploy mandiri, tapi hanya **satu sumber kebenaran** untuk penerima, status, dan akun.

Pertanyaan lain:
1. **D1** — Pilih A / B / C?
2. **D2** — Input tetap di apex `djpmkotamedan.web.id`? (Disarankan **ya**: PWA & link yang tersebar tidak putus. `input.*` cukup jadi alias/redirect.)
3. **D3** — Siapa pemegang login Domainesia (untuk ganti nameserver)?
4. **D4** — Retur dipakai peran apa saja saat go-live (sekarang hanya UTAMA; rencana: Kecamatan, Kemenag, Kelurahan terbatas)?
5. **D5** — Kode bersama (modal, toast, Data Detail, `api-bridge.js`) untuk Retur: **disalin** (sederhana, risiko beda versi) atau **paket bersama** (lebih rapi, butuh langkah build)? Usul: **salin dulu**, rapikan belakangan.

Fase 0–3 **sama untuk semua opsi** dan bisa dikerjakan sekarang.

---

## 4. Arsitektur target

### Opsi B (rekomendasi)
```
                ┌────────────────────── Akun Cloudflare ──────────────────────┐
                │  Zona DNS: djpmkotamedan.web.id (paket Free)                │
                │                                                             │
GitHub          │  Worker inputdjpm2027  (static assets ./dist + /api/gas)       │
dayasos/input ──┼─▶  → djpmkotamedan.web.id   (+ input.* → 301 ke apex)      │
                │                                                             │
GitHub          │  Worker retur2027  (static assets ./dist + /api/gas)       │
dayasos/Retur ──┼─▶  → retur.djpmkotamedan.web.id                            │
                └───────────────┬────────────────────────┬────────────────────┘
                                │ (3 aksi proxy)          │ browser → langsung
                                ▼                         ▼
                ┌──────────── Supabase (1 proyek) ─────────────────────────┐
                │ Edge Function `api` (domain input + retur*)              │
                │ Postgres: akun, data_detail, penerima, retur_* …         │
                │ pg_cron: semua job terjadwal (termasuk cekBatasWaktu…)   │
                │ Realtime: realtime_event_bus                             │
                └──────────────────────────────────────────────────────────┘
                   Google Drive/Sheets via GAS Drive (berkas, cermin backup)
```

### Aturan desain
- **Backend Retur tetap di repo Input** (`supabase/functions/api/domains/retur*.ts` + migrasi). Repo Retur **hanya frontend**. Alasannya: satu fungsi, satu skema, satu tempat migrasi, sehingga tidak ada dua sumber migrasi untuk satu database.
- Worker tidak menyimpan state. Semua state ada di Supabase.
- Worker hanya menjalankan script untuk `/api/*`. Aset statis dilayani langsung oleh Cloudflare (gratis, tidak menghitung kuota request Worker).
- Kuota gratis Workers (±100 ribu invocation/hari) **dibagi kedua Worker**. Beban sekarang jauh di bawah itu.

---

## Fase 0 — Persiapan & inventaris
**Risiko: nol · Bisa dikerjakan sekarang**

1. **Inventaris DNS** di panel Domainesia: salin semua record (A, AAAA, CNAME, MX, TXT, SRV, CAA) ke tabel di Lampiran C. Tandai mana yang untuk email/verifikasi Google.
2. **Ukur baseline** supaya hasil sebelum/sesudah bisa dibandingkan:
   - Vercel → Usage (30 hari): edge requests, fast data transfer, function invocations.
   - Supabase → Usage: invocation Edge Function, egress, DB size, koneksi puncak. Cek juga **paket & region** proyek `wwqxbscumaakvziwzwjx`.
   - Catat TTFB `GET /api/gas` dan waktu login dari HP di Medan (3× pagi, 3× siang).
3. **Buat akun Cloudflare** memakai email instansi/tim (bukan email pribadi), aktifkan **2FA**, dan tambahkan minimal 1 anggota cadangan (Super Administrator).
4. Hubungkan Cloudflare ke GitHub `dayasos` (Workers Builds) **hanya untuk repo `input` & `Retur2027`**.
5. Pasang `wrangler` sebagai devDependency di kedua repo (versi persis), lalu `npx wrangler login`.

**Selesai bila:** tabel DNS lengkap, baseline tercatat, akun Cloudflare + 2FA aktif.

---

## Fase 1 — Pindah DNS ke Cloudflare
**Risiko: sedang (email/verifikasi bisa putus bila ada record terlewat) · Jalan balik: kembalikan nameserver ke Domainesia**

1. ~~Cloudflare → *Add a domain* → `djpmkotamedan.web.id` → paket **Free**.~~ ✅ sudah (zona pending, 2026-10-18).
2. Cocokkan record hasil impor otomatis dengan tabel Fase 0. Tambahkan yang kurang.
3. Record apex `A 216.198.79.1` dan `www` CNAME `73f017f3dc348708.vercel-dns-017.com` → ubah dari proxied ke **DNS only (awan abu-abu)**. Saat ini keduanya **masih proxied**, lihat §2.1. Trafik tetap ke Vercel dan tidak ada perubahan perilaku.
4. Turunkan TTL record di Domainesia ke 300 dtk, **24 jam sebelum** ganti nameserver.
5. Di Domainesia → ganti nameserver ke 2 NS Cloudflare. Matikan **DNSSEC** di Domainesia dulu bila aktif, lalu aktifkan lagi lewat Cloudflare setelah zona Active.
6. Tunggu zona **Active**, lalu verifikasi:
   - `nslookup -type=NS djpmkotamedan.web.id 8.8.8.8` → NS Cloudflare.
   - Situs Input bisa dibuka, login jalan, `GET /api/gas` → `pingTest.ok = true`.
   - Email/record TXT tetap berfungsi (bila ada).
   - Sertifikat SSL Vercel tetap valid. Mode DNS only tidak mengganggu sertifikat Vercel.

**Selesai bila:** zona Active ≥ 24 jam tanpa keluhan.

---

## Fase 2 — Penguatan sebelum pindah
**Risiko: rendah · Berguna di platform mana pun · Dikerjakan di branch & diuji lokal**

| # | Pekerjaan | Alasan | Jalan balik |
|---|---|---|---|
| 2.1 | Pin `@supabase/supabase-js@2.x.y` (versi persis) di `index.html`, atau salin ke `public/js/vendor/` dan masukkan ke precache SW | Rilis baru dari CDN bisa merusak aplikasi tanpa ada perubahan dari kita | revert commit |
| 2.2 | Pindahkan `cekBatasWaktuVerifikasi` ke **pg_cron** (migrasi baru, `0 18 * * *` via `pg_net` ke fungsi `api` dengan secret dari Vault) | Cron lepas dari hosting, sehingga Worker cron terpisah tidak perlu | `cron.unschedule(...)` + cron Vercel masih ada |
| 2.3 | Hapus pembacaan `SSO_SECRET_KEY` / `SSO_URL_RETUR` dari fungsi (bila sudah tidak dipakai) | Sisa SSO yang tidak dipakai lagi | revert |
| 2.4 | Perbaiki `sitemap.xml` & canonical `index.html` → `https://djpmkotamedan.web.id` | Masih menunjuk ke `inputdjpm2027.vercel.app` | revert |
| 2.5 | Tambah endpoint `GET /api/health` (versi build, commit SHA, waktu) | Memastikan versi yang tayang benar | — |

Urutan 2.2: terapkan job pg_cron → biarkan berjalan bersama cron Vercel selama 2 malam (fungsi harus **idempoten**, dicek dulu) → cek log → baru matikan cron Vercel.

---

## Fase 3 — Input ke Cloudflare Workers
**Risiko: sedang · Jalan balik: record DNS apex kembali ke Vercel (≤ 5 menit dengan TTL 300)**

### 3.1 Konfigurasi repo Input (branch `feat/cloudflare-workers`)
Tambahkan `wrangler.jsonc`:
```jsonc
{
  "name": "inputdjpm2027",
  "main": "worker/index.js",
  "compatibility_date": "2026-10-01",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "observability": { "enabled": true },
  "placement": { "mode": "smart" }
}
```
- `worker/index.js`: router kecil → `/api/gas` (proxy 3 aksi) & `/api/health`, sisanya `env.ASSETS.fetch(request)`.
- Porting **dari `api/gas.js` versi terbaru** (bukan `functions/api/gas.js` yang usang): timeout bertingkat, health-check GET, pesan error yang sama. Ganti `process.env` → `env`, dan `req/res` → `Request/Response`.
- **Hapus fallback anon key hardcoded**: wajib dari secret, fail-closed dengan pesan jelas.
- `public/_headers` dipertahankan (didukung Workers Static Assets) dan disamakan dengan blok `headers` di `vercel.json`.
- Pesan error untuk pengguna: ganti "server Vercel" → "server aplikasi", dengan kalimat lain tetap.
- Script npm: `"deploy": "npm run build && wrangler deploy"`, `"cf:dev": "npm run build && wrangler dev"`.

### 3.2 Uji lokal
`npm run cf:dev` → jalankan **Lampiran B** bagian Input terhadap Supabase produksi (hanya aksi baca + akun uji).

### 3.3 Deploy ke `workers.dev`
1. Workers Builds: repo `dayasos/input`, branch `main`, build `npm ci && npm run build`, deploy `npx wrangler deploy`. Aktifkan preview per branch.
2. Secret: `GAS_SECRET_TOKEN`, `SUPABASE_EDGE_FUNCTION_URL`, `SUPABASE_ANON_KEY` (Lampiran C).
3. Uji di `inputdjpm2027.danajasa-dinsos26.workers.dev`: seluruh Lampiran B Input + PWA install.

### 3.4 Cutover domain (jam sepi, mis. 21.00 WIB)
1. Umumkan singkat di grup admin (opsional, tanpa downtime yang diharapkan).
2. Worker `inputdjpm2027` → *Custom Domains* → tambah `djpmkotamedan.web.id`. Cloudflare membuat record & sertifikat; record lama ke Vercel dihapus otomatis atau manual.
3. Verifikasi: header respons **tidak** lagi `Server: Vercel`, `/api/health` menunjukkan SHA terbaru, login + `pulihkanSesi` jalan, SW lama ter-update (naikkan `SW_VERSION`).
4. Pantau 48 jam: Workers Observability (error rate, CPU), log Supabase (5xx), keluhan pengguna.
5. **Vercel jangan dimatikan dulu** (cadangan, lihat Fase 7).

> Origin tetap `https://djpmkotamedan.web.id`, sehingga localStorage, sesi login, dan PWA terpasang **tidak hilang**.

---

## Fase 4 — Repo Retur baru
**Prasyarat: D1 = B (atau A) · Risiko: rendah (belum menyentuh produksi)**

1. **Arsipkan Retur lama** di `dayasos/Retur2027`:
   - `git branch arsip-gas-2026 main && git tag retur-gas-final-2026 && git push --all --tags`.
   - Retur lama tetap online di `retur2027.vercel.app` sampai Fase 7.
2. Branch `main` baru (atau `v2` lalu dijadikan default) dengan struktur:
   ```
   index.html               halaman Retur (login + shell)
   public/js/api-bridge.js  salinan dari Input, ditambah namespace cache 'djpm_retur_'
   public/js/app-core.js    salinan bagian yang dipakai (modal, toast, util)
   public/js/app-retur.js        dipindah dari repo Input
   public/js/app-retur-status.js dipindah dari repo Input
   public/css/…, tailwind.input.css, vite.config.mjs
   public/manifest.json     name "DJPM Retur 2027", scope "/", ikon beda warna
   public/sw.js             SW_VERSION 'retur-sw-v1', nama cache 'retur-static-*'
   public/_headers
   worker/index.js          sama dengan Input (proxy 3 aksi + health)
   wrangler.jsonc           name "retur2027"
   ```
3. **Struktur menu** (keputusan 2026-10-11): Dashboard, Data Detail, Pembayaran Bulanan/Rekap Retur, Layanan (form perbaikan retur & laporan kematian), ditambah halaman admin UTAMA (impor bank, proses bulanan, massal, status kerja, Bendahara + Drive). Tampil sesuai hak akses.
4. **Kode bersama (D5)**: catat di `SHARED.md` file mana yang disalin dari Input beserta commit asalnya, supaya perbaikan bug di Input bisa diterapkan juga ke Retur.
5. Branch `feat/retur-status-penerima` di repo Input: **gabungkan dulu ke main Input** (backend), lalu frontend-nya ikut dipindah ke repo Retur.
6. Uji lokal penuh dengan harness PGlite (catatan: `POOL_MAX=1`).

---

## Fase 5 — Backend melayani 2 subdomain
**Risiko: sedang (menyentuh fungsi `api` produksi) · Jalan balik: deploy ulang versi fungsi sebelumnya**

1. **CORS daftar putih**: ganti `*` → origin yang diizinkan:
   `https://djpmkotamedan.web.id`, `https://input.djpmkotamedan.web.id`, `https://retur.djpmkotamedan.web.id`, `*.workers.dev` milik akun (preview), `http://localhost:*` (dev).
   Kirim balik origin yang cocok + `Vary: Origin`. Request tanpa header Origin (server-to-server, pg_cron) tetap diterima sesuai aturan secret.
2. **Gerbang aksi per aplikasi**: tabel aksi → `aplikasi` (`input` | `retur` | `bersama`).
   - Aksi `retur*` hanya dari origin Retur (dan Input selama masa transisi, dikendalikan flag `RETUR_DI_INPUT=true`).
   - Aksi bersama: `loginPengguna`, `pulihkanSesi`, `logoutPengguna`, `ping`, Data Detail baca.
   - **Hak akses peran tetap jadi penentu utama.** Origin hanya lapisan tambahan, bukan pengganti autentikasi.
3. **Sesi**: tambah kolom `aplikasi` pada tabel sesi (migrasi aditif, default `'input'`), sehingga login di Retur tidak mengakhiri sesi Input dan sebaliknya. Logout hanya untuk aplikasi itu.
4. **Brute-force & rate limit**: kunci tetap per akun + IP. Tidak perlu dipisah.
5. **Realtime**: Retur berlangganan `realtime_event_bus` dengan filter topik retur. Tidak ada channel baru.
6. **Drive**: unggahan Retur tetap lewat `unggahBerkasKeDriveGAS` (konteks kecamatan `RETUR`).
7. Deploy fungsi `api` → uji Input **tetap normal** (Lampiran B Input) sebelum lanjut.

---

## Fase 6 — Worker Retur & subdomain retur
**Risiko: sedang · Jalan balik: lepas custom domain `retur.*`, menu Retur di Input dinyalakan lagi**

1. Workers Builds: repo `dayasos/Retur2027` → Worker `retur2027`, secret sama dengan Input.
2. Uji di `retur2027.danajasa-dinsos26.workers.dev` (Lampiran B Retur).
   ⚠️ **Laporan status/kematian mengubah `data_detail.status` sungguhan.** Uji hanya dengan persetujuan, pada penerima uji, lalu pulihkan dengan *Aktivasi Kembali*.
3. Custom Domain: `retur.djpmkotamedan.web.id` → `retur2027`.
4. Di Input: tombol/menu Retur & "Laporan Retur & Kematian" diganti tautan ke `https://retur.djpmkotamedan.web.id`. Set `RETUR_DI_INPUT=false` setelah stabil.
5. Uji coba terbatas: UTAMA dulu (1 minggu), lalu buka per peran sesuai D4.
6. Panduan singkat (PDF/WA) untuk admin kecamatan/Kemenag: alamat baru, login dengan akun yang sama, cara pasang PWA Retur.

---

## Fase 7 — Pensiun Vercel & Retur lama
**Waktu: setelah Retur baru dipakai (±Feb 2027) dan Input stabil ≥ 2 minggu di Cloudflare**

1. **Retur lama** (`retur2027.vercel.app`): ganti `web/vercel.json` dengan redirect 301 permanen → `https://retur.djpmkotamedan.web.id`, sehingga link lama di grup WA tetap berfungsi.
2. **Form GAS publik lama**: nonaktifkan (deployment GAS di-*archive*, atau `doGet` mengembalikan halaman "pindah ke alamat baru"). Tidak boleh ada jalur tanpa login yang mengubah status.
3. **Input di Vercel**: proyek `inputdjpm2027` dibiarkan 1 bulan sebagai cadangan (tanpa domain), lalu dihapus.
4. Bersihkan repo Input: hapus `vercel.json`, `api/`, `.vercel/`, `functions/` (Pages lama), `cloudflare/cron-worker/` (diganti pg_cron), `app-retur*.js`.
5. Hapus secret `SSO_*` di Supabase.
6. Perbarui `CLAUDE.md` / `DEPLOYMENT_GUIDE.md`: cara deploy baru, lokasi secret, runbook.

---

## Lampiran A — Tambahan bila memilih 2 database (Opsi A)

| # | Pekerjaan | Catatan |
|---|---|---|
| A1 | Proyek Supabase ke-2 `retur2027` (region sama, Singapura) | Paket gratis: proyek *pause* setelah 7 hari tidak aktif, jumlah proyek gratis terbatas. Pro: ada biaya compute per proyek. |
| A2 | Salin backend: `index.ts`, `_shared/*` (akses, sesi, bruteforce, hash, tanggal, storage), `domains/retur*.ts`, `auth.ts` | Dua salinan kode keamanan, sehingga setiap perbaikan keamanan harus dilakukan dua kali |
| A3 | Pindahkan 11 tabel `retur_*` + data + riwayat append-only (trigger dinonaktifkan sementara hanya saat salin, diverifikasi checksum/jumlah baris) | Jendela beku: Retur tidak boleh dipakai selama pemindahan |
| A4 | **Sinkron Input → Retur** (`data_detail`, rekening, tempat tugas, `akun`): job pg_cron per 15–60 menit, upsert berdasarkan NIK + `diubah_pada` | Data di Retur bisa tertinggal sampai satu siklus sinkron |
| A5 | **Sinkron Retur → Input** (status kematian/tidak aktif, aktivasi kembali): aksi API server-to-server `terapkanStatusDariRetur` + tabel **outbox** + retry + idempotency key | Bila gagal, Pembayaran memakai status lama, dan ini risiko utama |
| A6 | Akun: pilih satu master (Input) dan sinkronkan ke Retur, atau kelola terpisah | Reset sandi, nonaktif, dan hapus akun harus ikut tersinkron |
| A7 | Konflik: aturan "siapa menang" bila status diubah di dua tempat | Usul: Retur menang untuk status kematian, Input menang untuk lainnya |
| A8 | Monitoring sinkron: tabel `sync_log` + peringatan bila outbox macet > 1 jam | — |

Perkiraan usaha: **2–3×** Opsi B. Opsi B tidak memerlukan satu pun langkah A1–A8.

---

## Lampiran B — Daftar uji (regression checklist)

### Input
- [ ] Buka halaman, aset termuat, tidak ada error di Console
- [ ] Login tiap peran: UTAMA, Kecamatan, Kemenag (Islam/Katolik/Kristen/lainnya), Kelurahan
- [ ] Refresh → `pulihkanSesi` (lewat `/api/gas`) berhasil
- [ ] Logout → sesi hilang di server
- [ ] `GET /api/gas` → `secretConfigured: true`, `pingTest.ok: true`
- [ ] Input data baru + upload berkas (concurrency pool, retry)
- [ ] Cek NIK/rekening/kuota realtime
- [ ] Edit data, verifikasi, Verifikasi Semua (modal kustom)
- [ ] Data Detail per denominasi tidak bocor (Katolik ≠ Kristen)
- [ ] Domisili lintas kecamatan, Salin WA Kecamatan/Kemenag
- [ ] Ekspor Excel, Pembayaran/Tools
- [ ] Realtime kuota & badge "Realtime Sync"
- [ ] PWA: install, offline shell, toast update saat versi baru
- [ ] Header keamanan (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) & cache `sw.js` `max-age=0`

### Retur
- [ ] Login dengan akun Input yang sama, sesi Input di tab lain tetap hidup
- [ ] Ringkasan, Daftar per bulan, Cari (tersaring hak akses)
- [ ] Impor Excel bank (pratinjau, simpan idempoten, batas 2 MB, sel angka ≥ 16 digit ditolak)
- [ ] Unduh Excel 11 kolom + rekening tidak ditemukan
- [ ] Laporan status / kematian (**hanya penerima uji, dengan izin**) → Aktivasi Kembali (UTAMA, alasan ≥ 10 huruf)
- [ ] Unggah dokumen ke Drive (konteks RETUR)
- [ ] Aksi Input tidak bisa dipanggil dari origin Retur (dan sebaliknya, setelah flag dimatikan)

---

## Lampiran C — Inventaris secret & env

| Nama | Dipakai di | Sumber | Catatan |
|---|---|---|---|
| `GAS_SECRET_TOKEN` | Worker input, Worker retur, fungsi `api` | sama | rotasi setelah migrasi selesai |
| `SUPABASE_EDGE_FUNCTION_URL` | Worker input, Worker retur | `https://wwqxbscumaakvziwzwjx.supabase.co/functions/v1/api` | bukan rahasia, tetap simpan sebagai var |
| `SUPABASE_ANON_KEY` | Worker input, Worker retur | Supabase → API keys | publik, tapi jangan dijadikan fallback hardcoded |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` | fungsi `api` | Supabase | tidak pernah ke Worker/browser |
| `GAS_DRIVE_URL`, `GAS_ADMIN_SECRET`, `DRIVE_FOLDER_ID_INDUK` | fungsi `api` | tetap | — |
| `GOOGLE_DRIVE_OAUTH_*`, `GOOGLE_SHEETS_SA_KEY_JSON` | fungsi `api` | tetap | — |
| `SS_ID_MASTER_DROPDOWN`, `SS_ID_PENYIMPANAN`, `SYNC_WORKER_SECRET`, `TAHUN_AKTIF` | fungsi `api` | tetap | — |
| `SSO_SECRET_KEY`, `SSO_URL_RETUR` | fungsi `api` | — | **hapus** di Fase 7 |
| `CRON_SECRET` | Vercel cron | — | hilang setelah pg_cron (Fase 2.2) |

Tabel DNS (diisi di Fase 0):

| Tipe | Nama | Nilai | Proxy | Fungsi |
|---|---|---|---|---|
| A | `@` | `216.198.79.1` → nanti Custom Domain Worker | DNS only → otomatis | Input |
| … | … | … | … | … |

---

## Lampiran D — Risiko & mitigasi

| Risiko | Dampak | Kemungkinan | Mitigasi |
|---|---|---|---|
| Record DNS (MX/TXT) terlewat saat pindah NS | Email/verifikasi mati | Sedang | Inventaris Fase 0, verifikasi di panel Domainesia, TTL 300 |
| DNSSEC aktif saat ganti NS | Domain tidak bisa diakses | Rendah | Matikan DNSSEC dulu (Fase 1.5) |
| `functions/api/gas.js` usang ikut ter-deploy | Perilaku timeout/pesan berbeda | Sedang | Porting dari `api/gas.js` terbaru, hapus `functions/` |
| SW lama menyajikan aset basi setelah cutover | Tampilan lama/rusak | Sedang | Naikkan `SW_VERSION`, `sw.js` `max-age=0` |
| CORS daftar putih salah ketik | Semua aksi gagal | Sedang | Uji di `workers.dev` + flag darurat `CORS_IZINKAN_SEMUA=true` |
| Uji Retur mengubah status penerima asli | Pembayaran salah | Tinggi bila lalai | Hanya penerima uji, dengan izin, pulihkan dengan Aktivasi Kembali |
| Kode bersama Input↔Retur berbeda versi | Bug diperbaiki di satu tempat saja | Sedang | `SHARED.md` + review tiap bulan |
| Kuota Worker gratis dibagi 2 | Error 1027 bila terlampaui | Sangat rendah | Aset statis tidak dihitung, pantau Observability. Paket Workers Paid ±US$5/bln bila perlu |
| Akun Cloudflare hanya 1 pemegang | Terkunci | Sedang | 2FA + anggota cadangan (Fase 0.3) |
| (Opsi A) sinkron dua arah gagal diam-diam | Status tertimpa | Tinggi | Outbox + monitoring (A5, A8), atau pilih Opsi B |

---

## Lampiran E — Jadwal usulan

| Minggu | Fase | Keterangan |
|---|---|---|
| Okt 2026 mg 4 | 0, 1 | Inventaris, akun Cloudflare, pindah NS |
| Nov 2026 mg 1 | 2 | Pin supabase-js, cron → pg_cron, health endpoint |
| Nov 2026 mg 2–3 | 3 | Input ke Workers, cutover domain |
| Nov 2026 mg 4 – Des mg 2 | Retur Tahap 2–4 | Fitur Retur (form perbaikan, proses bulanan, Bendahara + Drive) tetap dibangun di repo Input |
| Des 2026 mg 3 – Jan 2027 mg 1 | 4, 5 | Repo Retur baru, backend multi-origin |
| Jan 2027 mg 2–3 | 6 | Worker Retur, uji UTAMA |
| Jan 2027 mg 4 | 6 | Buka per peran, panduan |
| Feb 2027 | 7 | Retur dipakai, redirect Retur lama, pensiun Vercel |

Cadangan waktu: 2 minggu sebelum Februari. Jangan melakukan cutover di minggu pembayaran atau tenggat input.

---

## Lampiran F — Runbook jalan balik

| Situasi | Langkah | Waktu efektif |
|---|---|---|
| Input di Cloudflare bermasalah | Cloudflare DNS: hapus Custom Domain Worker → buat A `@` `216.198.79.1` (DNS only) → Vercel melayani lagi | ±5 menit (TTL 300) |
| Deploy Worker buruk | `npx wrangler rollback` atau Dashboard → Deployments → versi sebelumnya | < 1 menit |
| Fungsi `api` versi baru bermasalah | Deploy ulang commit sebelumnya (`npx supabase functions deploy api`) | ±2 menit |
| CORS memblokir pengguna | Set secret `CORS_IZINKAN_SEMUA=true` → deploy ulang fungsi | ±2 menit |
| Retur baru bermasalah | Lepas `retur.*`, set `RETUR_DI_INPUT=true`, menu Retur di Input aktif lagi | ±5 menit |
| Pindah NS bermasalah | Domainesia: kembalikan NS ke `nsx1/nsx2.domainesia.com` | jam (propagasi NS) |
| pg_cron `cekBatasWaktu…` gagal | `cron.unschedule`, cron Vercel masih aktif sampai Fase 7 | segera |
