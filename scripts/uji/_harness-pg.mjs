// Harness uji: menjalankan modul Edge Function (kode Deno ASLI) di Node di atas Postgres SUNGGUHAN (PGlite, WebAssembly) -- bukan database tiruan --
// sehingga SQL, transaksi, batasan, dan trigger ikut teruji. Dipakai oleh server-progres-kuota-banding.test.mjs.
// PGlite BUKAN dependensi repo. Sediakan sendiri:   npm install --no-save @electric-sql/pglite@0.3.14
// atau set PGLITE_DIR ke folder yang memuatnya (node_modules/@electric-sql/pglite). Tanpa PGlite, uji yang memerlukannya dilewati.
// Modul yang ditiru (stub): setelan.ts (izin input; dapat ditutup lewat globalThis.__ujiIzin), validasi.ts, master.ts, gasDrive.ts, storage.ts,
// sesi.ts (token -> sesi dari globalThis.__ujiSesi).
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const akarRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Mengembalikan kelas PGlite, atau null bila tidak tersedia. */
export async function muatPglite() {
  const coba = [];
  if (process.env.PGLITE_DIR) coba.push(path.resolve(process.env.PGLITE_DIR, "..", ".."));
  coba.push(akarRepo);
  for (const dir of coba) {
    try {
      const req = createRequire(path.join(dir, "x.js"));
      const m = await import(pathToFileURL(req.resolve("@electric-sql/pglite")).href);
      return m.PGlite || (m.default && m.default.PGlite) || null;
    } catch { /* coba berikutnya */ }
  }
  return null;
}

const STUB_MODUL = {
  "setelan.ts": "export const periksaIzinInput = async () => (globalThis.__ujiIzin || { izin: true });",
  "validasi.ts": "export const cekKuotaTersedia = async () => ({ tersedia: true });",
  "master.ts": "export const getMasterLayanan = async () => ({ kecamatan: ['IMAM MASJID', 'PENGURUS GEREJA', 'BILAL JENAZAH'], kemenag: ['GURU MAGHRIB MENGAJI', 'GURU SEKOLAH MINGGU'] });",
  "gasDrive.ts": "export const panggilGasAdmin = async () => ({});",
  "storage.ts": "export const hapusObjekStorage = async () => {}; export const pathStorageDariUrl = () => null;",
  "sesi.ts": `export async function wajibSesi(token) {
    const s = (globalThis.__ujiSesi || {})[token];
    if (!s) throw new Error("Sesi tidak valid atau sudah berakhir. Silakan login ulang.");
    return s;
  }`,
};

// Adaptor postgres.js -> PGlite: sql\`...\` (parameter $n), sql.unsafe(teks, nilai), sql.begin(fn) dengan transaksi sungguhan.
// postgres.js mengembalikan bigint sebagai string; PGlite sebagai BigInt -> disamakan.
const STUB_DB = `
  const samakan = (rows) => rows.map((r) => { const o = {}; for (const k of Object.keys(r)) o[k] = typeof r[k] === 'bigint' ? String(r[k]) : r[k]; return o; });
  function fabrik(pegangan) {
    const jalankan = async (teks, nilai) => {
      globalThis.__ujiPanggilan.push({ teks, nilai });
      const r = await pegangan().query(teks, nilai || []);
      return samakan(r.rows);
    };
    const f = (strings, ...nilai) => jalankan(strings.reduce((t, s, i) => t + (i ? '$' + i : '') + s, ''), nilai);
    f.unsafe = (teks, nilai) => jalankan(teks, nilai);
    return f;
  }
  globalThis.__ujiPanggilan = globalThis.__ujiPanggilan || [];
  export const sql = fabrik(() => globalThis.__ujiPg);
  sql.begin = (fn) => globalThis.__ujiPg.transaction(async (tx) => fn(fabrik(() => tx)));
`;

// Stub OPSIONAL (hanya bila diminta lewat opsi.stub): modul sampingan yang tidak relevan bagi uji dan menyentuh tabel yang tidak dibuat di sana.
const STUB_OPSIONAL = {
  "dataDetail.ts": "export const arsipkanDataDetail = async () => {}; export const pastikanDataDetailTersinkron = async () => {};",
};

export async function muatServerPg(entriRelatif, opsi = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-ujipg-"));
  try {
    const stubDb = path.join(tmp, "db-stub.mjs");
    fs.writeFileSync(stubDb, STUB_DB);
    for (const [nama, isi] of Object.entries(STUB_MODUL)) fs.writeFileSync(path.join(tmp, "stub-" + nama + ".mjs"), isi);
    const stubOpsi = (opsi.stub || []).filter((n) => STUB_OPSIONAL[n]);
    for (const n of stubOpsi) fs.writeFileSync(path.join(tmp, "stub-" + n + ".mjs"), STUB_OPSIONAL[n]);
    const keluar = path.join(tmp, "bundel.mjs");
    await build({
      entryPoints: [path.join(akarRepo, entriRelatif)],
      bundle: true, format: "esm", platform: "node", outfile: keluar, logLevel: process.env.DJPM_LOG_BUNDEL || "error",
      plugins: [{
        name: "stub",
        setup(b) {
          b.onResolve({ filter: /(^|\/)db\.ts$/ }, () => ({ path: stubDb }));
          b.onResolve({ filter: /^npm:/ }, (x) => ({ path: x.path, external: true }));   // pustaka npm milik Deno (mis. exceljs) tidak dimuat di uji
          if (stubOpsi.length > 0) b.onResolve({ filter: new RegExp("(^|/)(" + stubOpsi.map((n) => n.replace(".ts", "")).join("|") + ")\\.ts$") }, (a) => ({ path: path.join(tmp, "stub-" + path.basename(a.path) + ".mjs") }));
          b.onResolve({ filter: /(^|\/)(setelan|validasi|master|gasDrive|storage|sesi)\.ts$/ }, (a) => {
            // Berkas stub sudah ditulis SEKALI di awal (menulis ulang saat resolusi = balapan dengan pembacaan esbuild -> terbaca kosong).
            return { path: path.join(tmp, "stub-" + path.basename(a.path) + ".mjs") };
          });
        },
      }],
    });
    if (process.env.DJPM_SIMPAN_BUNDEL) fs.copyFileSync(keluar, process.env.DJPM_SIMPAN_BUNDEL);
    globalThis.Deno = { env: { get: () => undefined } };
    return await import(pathToFileURL(keluar).href);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
