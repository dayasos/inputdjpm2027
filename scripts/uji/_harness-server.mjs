// Harness uji: membundel modul Edge Function (kode Deno) agar bisa DIJALANKAN di Node dengan database TIRUAN.
// Dipakai oleh server-penerima.test.mjs. Tidak ada koneksi jaringan/database; semua data karangan di memori.
// Membutuhkan paket `esbuild` (sudah ada sebagai dependensi Vite).
//
// Tiruan database (globalThis.__ujiDb):
//   handler(teksKueri, nilai[]) -> array baris  (diatur oleh uji; bawaan: [])
//   panggilan[] -> catatan setiap kueri/ sql.unsafe, untuk memeriksa apa yang DITULIS
// Modul yang ditiru (stub) karena berat/di luar pokok uji: setelan.ts (izin input), validasi.ts (kuota), master.ts (layanan),
// gasDrive.ts, storage.ts.
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const akarRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const STUB_MODUL = {
  "setelan.ts": "export const periksaIzinInput = async () => ({ izin: true });",
  "validasi.ts": "export const cekKuotaTersedia = async () => ({ tersedia: true });",
  "master.ts": "export const getMasterLayanan = async () => ({ kecamatan: ['IMAM MASJID', 'PENGURUS GEREJA', 'BILAL JENAZAH'], kemenag: ['GURU MAGHRIB MENGAJI', 'GURU SEKOLAH MINGGU'] });",
  "gasDrive.ts": "export const panggilGasAdmin = async () => ({});",
  "storage.ts": "export const hapusObjekStorage = async () => {}; export const pathStorageDariUrl = () => null;",
};

const STUB_DB = `
  globalThis.__ujiDb = globalThis.__ujiDb || { handler: () => [], panggilan: [] };
  function jalankan(teks, nilai) {
    globalThis.__ujiDb.panggilan.push({ teks, nilai });
    return Promise.resolve(globalThis.__ujiDb.handler(teks, nilai) || []);
  }
  export function sql(strings, ...nilai) { return jalankan(strings.join("?"), nilai); }
  sql.unsafe = (teks, nilai) => jalankan("UNSAFE " + teks, nilai || []);
  sql.begin = (fn) => fn(sql);
  sql.json = (x) => x;
`;

/** Mengembalikan modul hasil bundel dari berkas sumber (relatif terhadap akar repo). */
export async function muatServer(entriRelatif) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-uji-"));
  try {
    const stubDb = path.join(tmp, "db-stub.mjs");
    fs.writeFileSync(stubDb, STUB_DB);
    const keluar = path.join(tmp, "bundel.mjs");
    await build({
      entryPoints: [path.join(akarRepo, entriRelatif)],
      bundle: true, format: "esm", platform: "node", outfile: keluar, logLevel: "error",
      plugins: [{
        name: "stub",
        setup(b) {
          b.onResolve({ filter: /(^|\/)db\.ts$/ }, () => ({ path: stubDb }));
          b.onResolve({ filter: /(^|\/)(setelan|validasi|master|gasDrive|storage)\.ts$/ }, (a) => {
            const nama = path.basename(a.path);
            const berkas = path.join(tmp, "stub-" + nama + ".mjs");
            fs.writeFileSync(berkas, STUB_MODUL[nama]);
            return { path: berkas };
          });
        },
      }],
    });
    globalThis.Deno = { env: { get: () => undefined } };
    globalThis.__ujiDb = globalThis.__ujiDb || { handler: () => [], panggilan: [] };
    return await import(pathToFileURL(keluar).href);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });   // bundel sudah dimuat ke memori
  }
}

/** Akses ke tiruan database dari uji. */
export const db = () => globalThis.__ujiDb;
