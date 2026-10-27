import postgres from "npm:postgres@3.4.4";

const connectionString = Deno.env.get("SUPABASE_DB_URL");

if (!connectionString) {
  throw new Error(
    "Env var SUPABASE_DB_URL belum diset. Set lewat: supabase secrets set SUPABASE_DB_URL=... " +
    "(connection string Postgres project Supabase, lihat Dashboard > Project Settings > Database).",
  );
}

export const sql = postgres(connectionString, {
  prepare: false,
  // max 2 (bukan 1): query paralel (mis. Promise.all di dashboard) benar-benar jalan bersamaan.
  // Sengaja kecil karena tiap isolate Deno punya pool sendiri & pooler Supabase punya batas klien.
  // max_lifetime 30 detik dulu memaksa buka koneksi baru terus-menerus -> dinaikkan ke 5 menit.
  //
  // idle_timeout SENGAJA pendek (2 dtk, dulu 10): log 27 Okt 2026 menunjukkan hampir tiap permintaan berjalan di isolate BARU
  // (±9,5 ribu execution_id unik per ~13,9 ribu permintaan/jam) yang membuka koneksi LANGSUNG ke Postgres. Dengan idle 10 dtk tiap
  // koneksi tertahan ±11 dtk -> ±30-60 koneksi + ±11 dasar melampaui max_connections=60 -> ±10% permintaan 5xx (PostgresError 53300).
  // Jangan dinaikkan lagi tanpa mengukur ulang 5xx/53300 (lihat scripts/uji/db-pool.test.mjs).
  max: 2,
  connect_timeout: 5,
  idle_timeout: 2,
  max_lifetime: 300,
});
