# Rencana: Fungsi `api` memakai pooler koneksi database (opsi B)

Status: kode + uji siap di cabang `feat/pooler-db` (belum di-commit/di-deploy). Rilis menunggu persetujuan eksplisit user.

## 1. Masalah dan bukti
- Database hanya mengizinkan `max_connections = 60`. Hampir tiap permintaan ke fungsi `api` berjalan di isolate BARU (±9,5 ribu execution_id unik per ±13,9 ribu permintaan/jam) yang membuka koneksi LANGSUNG ke Postgres.
- 5xx (PostgresError 53300) berkorelasi dengan laju isolate baru: ±1,5/dtk -> 0%, ±2,7/dtk -> 4,9%, ±3,5/dtk -> 8,8%.
- Opsi A (`idle_timeout` 10 -> 2 dtk) sudah live (v87) dan menurunkan koneksi tertahan, tetapi tidak menghapus leher botol saat jam sibuk.

## 2. Rancangan
- Pooler transaksi Supabase (port 6543) memultipleks banyak koneksi klien ke sedikit koneksi server -> batas 60 tidak lagi jadi leher botol.
- Dua secret KUSTOM (awalan `SUPABASE_` dicadangkan platform: CLI menolak dan nilainya ditimpa tiap deploy):
  - `DB_POOLER_URL` = connection string pooler (mode transaksi, port 6543, pengguna `postgres.<kode-proyek>`).
  - `DB_POOLER_PERSEN` (opsional, bilangan bulat 0-100) = rilis bertahap: tiap isolate memakai pooler dengan peluang sebesar itu. Kosong = 100.
- `_shared/dbKonfigurasi.ts` (modul murni) memilih koneksi; `_shared/db.ts` memakainya. Aturan fail-safe:
  - `DB_POOLER_URL` tidak ada / tidak sah (skema salah, placeholder `[YOUR-PASSWORD]`, tanpa sandi, host pooler tanpa `postgres.<ref>`) -> koneksi langsung (`SUPABASE_DB_URL`) + satu baris peringatan TANPA sandi/host.
  - `DB_POOLER_PERSEN` tidak valid -> koneksi langsung + peringatan (bukan pooler penuh).
  - Parameter query khusus Prisma (`pgbouncer`, `connection_limit`, `pool_timeout`, `statement_cache_size`, `schema`) dibuang dari alamat pooler; sandi tidak di-encode ulang; alamat langsung tidak disentuh.
- Kode sudah aman untuk pooler mode transaksi: `prepare:false`, hanya `pg_advisory_xact_lock`, tanpa SET sesi/LISTEN/tabel sementara/kursor.

## 3. Bukti pengujian
- `npm run uji:db-koneksi`: 32 uji lulus (pemilihan, persen deterministik + batas tepat, sebaran 30% = 3000/10000, input rusak, kebocoran sandi, kabel db.ts).
- Uji perusakan (mutan): 19 dari 20 tertangkap; sisa 1 (`persen >= 100` vs `> 100`) setara perilaku karena `acak < 1`.
- Type-check `tsc --strict` untuk `dbKonfigurasi.ts` dan `db.ts`: 0 galat.
- Uji nyata BACA-SAJA lewat pooler dengan postgres@3.4.4 + opsi persis db.ts: koneksi, `select`, transaksi, `pg_advisory_xact_lock`, tanpa prepared statement -> lulus.
- Ukuran pool server pooler (diukur 2026-10-27): ±16 koneksi server. Klien serentak 20/40/80 semua sukses (mengantre, 2,1 / 2,1 / 3,6 dtk untuk kueri 0,4 dtk). Artinya kapasitas aman selama transaksi singkat (<100 ms rata-rata ≈ >150 transaksi/dtk).

## 4. Runbook rilis (tiap langkah: syarat -> verifikasi -> cara mundur)
1. Commit + push ke `main` (hanya kode; tanpa secret perilaku fungsi TIDAK berubah). Deploy fungsi dari checkout bersih (worktree):
   `npx supabase functions deploy api --project-ref wwqxbscumaakvziwzwjx --no-verify-jwt`. Verifikasi: bandingkan berkas live vs git (`bandingkan-live.mjs`), uji asap tanpa tulis. Mundur: deploy ulang commit sebelumnya (5167faf).
2. Siapkan berkas env SEMENTARA (di luar repo) berisi `DB_POOLER_URL=...` (dari `.env.local`, tanpa dicetak) dan `DB_POOLER_PERSEN=20`; `npx supabase secrets set --env-file <berkas> --project-ref wwqxbscumaakvziwzwjx`; hapus berkas. Secret kustom biasanya berlaku dalam ±2 menit; bila tidak, redeploy.
3. Pantau 15-30 menit (log fungsi + `query_logs`): lihat kriteria §5. Lanjut `DB_POOLER_PERSEN=50`, lalu `100` (ulang pemantauan tiap tahap, minimal pada jam sibuk).
4. Opsional setelah stabil: naikkan Pool Size pooler di dashboard (Database > Connection pooling) dari ±15 ke ±25-30 bila ada antrean (batas total 60 dibagi dengan koneksi langsung/PostgREST/Realtime).
- MUNDUR CEPAT di tahap mana pun: `npx supabase secrets set DB_POOLER_PERSEN=0` atau `npx supabase secrets unset DB_POOLER_URL` (fungsi kembali ke koneksi langsung; efek ±2 menit, redeploy bila perlu).

## 5. Kriteria berhasil (bandingkan dengan 07:20-07:50 UTC: 5xx 8,8% pada ±3,5 isolat/dtk)
- 5xx < 1% pada laju >= ±3 isolat/dtk.
- 53300 (too many connections) ≈ 0.
- Latensi p50/p95 tidak memburuk > 10%.
- Tidak ada galat: `prepared statement ... does not exist`, `unrecognized configuration parameter`, `permission denied`, `Tenant or user not found`.
- Tidak ada peringatan `db:` di log setelah secret diset (peringatan = nilai tidak sah, jatuh ke koneksi langsung).

## 6. Risiko dan mitigasi
- Pooler valid tetapi mati -> tidak ada failover otomatis saat runtime. Mitigasi: rilis bertahap, uji asap, mundur satu perintah.
- Pool server ±16 lebih kecil dari 60: transaksi lama (mis. impor besar) bisa memblokir antrean. Mitigasi: pantau; naikkan Pool Size; transaksi di kode pendek.
- Sandi bocor: secret hanya lewat berkas env sementara; peringatan log tak memuat sandi/host/kode proyek (diuji).
- Fitur memakai `LISTEN`/sesi/`SET` di masa depan akan rusak lewat pooler transaksi: uji `db-koneksi` tidak mendeteksi; tinjau kode baru.

## 7. Catatan
- Rilis penautan rumah ibadah (cabang `feat/rumah-ibadah-id`) dilakukan SESUDAH koneksi stabil (jam sibuk) karena migrasi + pengisian awal menambah beban.
- Jangan commit/push/deploy/atur secret tanpa perintah eksplisit user.
