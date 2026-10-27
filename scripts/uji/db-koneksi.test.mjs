// Uji pemilihan connection string database (supabase/functions/api/_shared/dbKonfigurasi.ts + kabelnya di db.ts).
// Tujuan: DB_POOLER_URL dipakai bila sah; nilai salah/placeholder TIDAK menjatuhkan aplikasi (jatuh ke koneksi langsung) dan sandi tidak pernah bocor ke log.
// Jalankan: npm run uji:db-koneksi     (Node 24+; modul murni, tanpa database/jaringan)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";

const akar = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-dbk-"));
const keluar = path.join(tmp, "dbKonfigurasi.mjs");
await build({ entryPoints: [path.join(akar, "supabase/functions/api/_shared/dbKonfigurasi.ts")], bundle: true, format: "esm", platform: "node", outfile: keluar, logLevel: "error" });
const { tentukanKoneksi } = await import(pathToFileURL(keluar).href);
fs.rmSync(tmp, { recursive: true, force: true });

const SANDI = "RAHASIA-JANGAN-BOCOR-123";
const LANGSUNG = `postgresql://postgres:${SANDI}@db.abcdefghij.supabase.co:5432/postgres`;
const POOLER = `postgresql://postgres.abcdefghij:${SANDI}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;

test("tanpa pooler: koneksi langsung (perilaku lama, tanpa peringatan)", () => {
  for (const kosong of [undefined, "", "   "]) {
    const k = tentukanKoneksi(LANGSUNG, kosong);
    assert.deepEqual(k, { url: LANGSUNG, mode: "langsung" });
  }
});

test("pooler sah diutamakan atas koneksi langsung", () => {
  const k = tentukanKoneksi(LANGSUNG, POOLER);
  assert.equal(k.mode, "pooler");
  assert.equal(k.url, POOLER);
  assert.equal(k.peringatan, undefined);
});

test("spasi/baris baru di sekitar nilai dibuang, isi tidak diubah", () => {
  const k = tentukanKoneksi("  " + LANGSUNG + "\n", "\n " + POOLER + "  ");
  assert.equal(k.url, POOLER);
  assert.equal(tentukanKoneksi("  " + LANGSUNG + "\n", undefined).url, LANGSUNG);
});

test("pooler sah dengan skema postgres:// dan sandi ter-encode (%40) diterima", () => {
  const p = `postgres://postgres.abcdefghij:p%40ss%23word@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres`;
  assert.equal(tentukanKoneksi(LANGSUNG, p).mode, "pooler");
});

test("parameter khusus Prisma (?pgbouncer=true dst.) dibuang dari alamat pooler; parameter Postgres lain dan sandi TIDAK diubah", () => {
  assert.equal(tentukanKoneksi(LANGSUNG, POOLER + "?pgbouncer=true").url, POOLER);
  assert.equal(tentukanKoneksi(LANGSUNG, POOLER + "?pgbouncer=true&connection_limit=1").url, POOLER);
  assert.equal(tentukanKoneksi(LANGSUNG, POOLER + "?sslmode=require&pgbouncer=true").url, POOLER + "?sslmode=require");
  assert.equal(tentukanKoneksi(LANGSUNG, POOLER + "?PgBouncer=TRUE&application_name=djpm").url, POOLER + "?application_name=djpm");
  const aneh = `postgresql://postgres.abcdefghij:p%40ss%23w%26rd@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true`;
  assert.equal(tentukanKoneksi(LANGSUNG, aneh).url, aneh.replace("?pgbouncer=true", ""), "sandi ter-encode utuh");
  assert.equal(tentukanKoneksi(LANGSUNG, POOLER).url, POOLER, "tanpa query -> tidak berubah");
});

test("alamat LANGSUNG tidak diubah sama sekali (perilaku lama), termasuk bila memuat query", () => {
  const dgnQuery = LANGSUNG + "?pgbouncer=true";
  assert.equal(tentukanKoneksi(dgnQuery, undefined).url, dgnQuery);
});

// ---- rilis bertahap (DB_POOLER_PERSEN) ----
test("persen kosong/100 -> selalu pooler; 0 -> selalu langsung (tanpa peringatan)", () => {
  for (const acak of [0, 0.5, 0.999]) {
    assert.equal(tentukanKoneksi(LANGSUNG, POOLER, undefined, acak).mode, "pooler");
    assert.equal(tentukanKoneksi(LANGSUNG, POOLER, "", acak).mode, "pooler");
    assert.equal(tentukanKoneksi(LANGSUNG, POOLER, "100", acak).mode, "pooler");
    const nol = tentukanKoneksi(LANGSUNG, POOLER, "0", acak);
    assert.deepEqual(nol, { url: LANGSUNG, mode: "langsung" });
  }
});

test("persen 1-99: pooler hanya bila acak*100 < persen (batas tepat)", () => {
  assert.equal(tentukanKoneksi(LANGSUNG, POOLER, "20", 0.19).mode, "pooler");
  assert.equal(tentukanKoneksi(LANGSUNG, POOLER, "20", 0.2).mode, "langsung");
  assert.equal(tentukanKoneksi(LANGSUNG, POOLER, "20", 0.99).mode, "langsung");
  assert.equal(tentukanKoneksi(LANGSUNG, POOLER, " 50 ", 0.49).mode, "pooler");
  assert.equal(tentukanKoneksi(LANGSUNG, POOLER, "50", 0.5).mode, "langsung");
  assert.equal(tentukanKoneksi(LANGSUNG, POOLER, "1", 0).mode, "pooler");
});

test("sebaran: dengan persen 30 sekitar 30% dari 10.000 isolate memakai pooler (acak seragam)", () => {
  let n = 0;
  for (let i = 0; i < 10000; i++) if (tentukanKoneksi(LANGSUNG, POOLER, "30", i / 10000).mode === "pooler") n++;
  assert.equal(n, 3000);
});

for (const buruk of ["abc", "101", "-1", "10.5", "5%", "1e2", "999", "ten"]) {
  test(`persen tidak valid (${JSON.stringify(buruk)}) -> FAIL-SAFE ke koneksi langsung + peringatan (bukan pooler penuh)`, () => {
    for (const acak of [0, 0.5, 0.99]) {
      const k = tentukanKoneksi(LANGSUNG, POOLER, buruk, acak);
      assert.equal(k.mode, "langsung");
      assert.equal(k.url, LANGSUNG);
      assert.match(k.peringatan, /DB_POOLER_PERSEN tidak valid/);
      assert.ok(!k.peringatan.includes(SANDI));
    }
  });
}

test("persen diabaikan bila DB_POOLER_URL tidak ada; peringatan pooler tidak sah tetap muncul walau persen valid", () => {
  assert.deepEqual(tentukanKoneksi(LANGSUNG, undefined, "50", 0.1), { url: LANGSUNG, mode: "langsung" });
  const k = tentukanKoneksi(LANGSUNG, `postgresql://postgres.abcdefghij:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`, "100", 0);
  assert.equal(k.mode, "langsung");
  assert.match(k.peringatan, /DB_POOLER_URL diabaikan/);
});

test("hanya pooler yang diset (langsung kosong): tetap dipakai", () => {
  assert.equal(tentukanKoneksi(undefined, POOLER).mode, "pooler");
});

test("kedua-duanya tidak ada -> null (db.ts melempar galat jelas seperti dulu)", () => {
  assert.equal(tentukanKoneksi(undefined, undefined), null);
  assert.equal(tentukanKoneksi("", " "), null);
});

const TIDAK_SAH = [
  ["placeholder dashboard [YOUR-PASSWORD]", `postgresql://postgres.abcdefghij:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`],
  ["placeholder <password>", `postgresql://postgres.abcdefghij:<password>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`],
  ["placeholder {password}", `postgresql://postgres.abcdefghij:{password}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`],
  ["skema bukan postgres", `https://aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`],
  ["skema salah padahal pengguna/sandi/host lengkap (https)", `https://postgres.abcdefghij:${SANDI}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`],
  ["skema salah padahal pengguna/sandi/host lengkap (mysql)", `mysql://postgres.abcdefghij:${SANDI}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`],
  ["bukan URL", `ini bukan url ${SANDI}`],
  ["tanpa sandi", `postgresql://postgres.abcdefghij@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`],
  ["tanpa nama pengguna", `postgresql://:${SANDI}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`],
  ["host pooler tetapi pengguna tanpa kode proyek (pasti ditolak pooler)", `postgresql://postgres:${SANDI}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`],
];
for (const [nama, url] of TIDAK_SAH) {
  test(`pooler TIDAK sah (${nama}): jatuh ke koneksi langsung + peringatan, sandi tidak bocor`, () => {
    const k = tentukanKoneksi(LANGSUNG, url);
    assert.equal(k.mode, "langsung", nama);
    assert.equal(k.url, LANGSUNG);
    assert.match(k.peringatan, /DB_POOLER_URL diabaikan/);
    assert.ok(!k.peringatan.includes(SANDI), "peringatan tidak boleh memuat sandi");
    assert.ok(!k.peringatan.includes("aws-0-ap-southeast-1") && !k.peringatan.includes("abcdefghij") && !k.peringatan.includes("db."),
      "peringatan tidak boleh memuat host lengkap atau kode proyek");
  });
}

test("pooler tidak sah DAN koneksi langsung tidak ada -> null (bukan koneksi ke alamat rusak)", () => {
  assert.equal(tentukanKoneksi(undefined, `postgresql://postgres.abcdefghij:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`), null);
});

test("kabel db.ts: memakai tentukanKoneksi, tetap prepare:false, tetap membaca SUPABASE_DB_URL, DB_POOLER_URL dan DB_POOLER_PERSEN, hanya mencatat peringatan", () => {
  const src = fs.readFileSync(path.join(akar, "supabase/functions/api/_shared/db.ts"), "utf8");
  assert.match(src, /import \{ tentukanKoneksi \} from "\.\/dbKonfigurasi\.ts"/);
  assert.match(src, /Deno\.env\.get\("SUPABASE_DB_URL"\)/);
  assert.match(src, /Deno\.env\.get\("DB_POOLER_URL"\)/);
  assert.match(src, /Deno\.env\.get\("DB_POOLER_PERSEN"\)/);
  assert.doesNotMatch(src, /Deno\.env\.get\("SUPABASE_POOLER/, "awalan SUPABASE_ dicadangkan platform: tidak boleh dipakai untuk secret buatan sendiri");
  assert.match(src, /Deno\.env\.get\("DB_POOLER_PERSEN"\),\s*Math\.random\(\),/, "peluang per isolate harus dari Math.random() (bukan konstanta)");
  assert.match(src, /postgres\(koneksi\.url,/);
  assert.match(src, /prepare:\s*false/);
  assert.doesNotMatch(src, /console\.(log|info)\(/, "tidak boleh mencatat hal rutin per isolate");
  assert.doesNotMatch(src, /console\.warn\([^)]*koneksi\.url/, "URL tidak boleh masuk log");
});
