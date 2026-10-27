// Penjaga regresi konfigurasi pool koneksi fungsi `api` (supabase/functions/api/_shared/db.ts).
// Latar: Postgres project ini hanya ber-max_connections=60 dan fungsi memakai koneksi LANGSUNG dengan hampir satu isolate per
// permintaan, jadi idle_timeout panjang menahan koneksi dan memicu PostgresError 53300 (±10% permintaan 5xx di jam kerja).
// Jalankan: npm run uji:db-pool     (Node 24+; hanya membaca teks berkas, tanpa koneksi database)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const akar = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const teks = fs.readFileSync(path.join(akar, "supabase/functions/api/_shared/db.ts"), "utf8");
const ambil = (nama) => {
  const m = new RegExp("^\\s*" + nama + ":\\s*(\\d+(?:\\.\\d+)?)\\s*,", "m").exec(teks.replace(/\/\/.*$/gm, (c) => c.startsWith("//") ? "" : c));
  assert.ok(m, `opsi ${nama} tidak ditemukan di db.ts`);
  return Number(m[1]);
};

test("pool: idle_timeout sangat pendek (0,1-1 dtk) agar koneksi cepat dilepas", () => {
  assert.ok(ambil("idle_timeout") >= 0.1 && ambil("idle_timeout") <= 1, "idle_timeout = " + ambil("idle_timeout"));
});

test("pool: max per isolate tetap kecil (<= 2) dan prepare dimatikan", () => {
  assert.ok(ambil("max") <= 2, "max = " + ambil("max"));
  assert.match(teks, /prepare:\s*false/);
});

test("pool: connect_timeout tidak lebih dari 5 dtk dan tetap memakai SUPABASE_DB_URL", () => {
  assert.ok(ambil("connect_timeout") <= 5);
  assert.match(teks, /Deno\.env\.get\("SUPABASE_DB_URL"\)/);
});
