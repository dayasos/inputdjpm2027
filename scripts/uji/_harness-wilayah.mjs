// Harness uji: membundel supabase/functions/api/_shared/wilayahTugas.ts (kode Deno) agar bisa dijalankan di Node,
// dengan `sql` PALSU (data karangan di memori; tidak ada koneksi database). Dipakai oleh *.test.mjs di folder ini.
// Membutuhkan paket `esbuild` (sudah ada sebagai dependensi Vite).
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const akarRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Mengembalikan { tentukanWilayahTugas, state }. state.wilayah = Set 'KEC|KEL'; state.rumahIbadah = [{nama,kecamatan,kelurahan,alamat}]. */
export async function muatWilayahTugas(akar = akarRepo) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-uji-"));
  const stubDb = path.join(tmp, "db-stub.mjs");
  fs.writeFileSync(stubDb, `
    globalThis.__ujiState = { rumahIbadah: [], wilayah: new Set() };
    export function sql(strings, ...vals) {
      const q = strings.join("?");
      let rows = [];
      if (q.includes("from rumah_ibadah")) rows = globalThis.__ujiState.rumahIbadah.filter((r) => r.nama === vals[0]);
      else if (q.includes("from wilayah")) rows = globalThis.__ujiState.wilayah.has(vals[0] + "|" + vals[1]) ? [{ ada: 1 }] : [];
      return Promise.resolve(rows);
    }
  `);
  const keluar = path.join(tmp, "wilayahTugas.bundle.mjs");
  await build({
    entryPoints: [path.join(akar, "supabase/functions/api/_shared/wilayahTugas.ts")],
    bundle: true, format: "esm", platform: "node", outfile: keluar, logLevel: "error",
    plugins: [{ name: "stub-db", setup(b) { b.onResolve({ filter: /(^|\/)db\.ts$/ }, () => ({ path: stubDb })); } }],
  });
  globalThis.Deno = { env: { get: () => undefined } };
  const modul = await import(pathToFileURL(keluar).href);
  fs.rmSync(tmp, { recursive: true, force: true }); // bundel sudah dimuat ke memori; bersihkan folder sementara
  return { tentukanWilayahTugas: modul.tentukanWilayahTugas, state: globalThis.__ujiState };
}
