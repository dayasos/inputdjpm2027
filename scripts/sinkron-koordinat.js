"use strict";

/**
 * Menjaga penerjemah koordinat di browser dan di server TETAP IDENTIK (plans/plan-koordinat-lokasi-pintar.md, bagian 4.3).
 *
 *   node scripts/sinkron-koordinat.js          menulis ulang salinan server dari bagian KOORDINAT-INTI di browser
 *   node scripts/sinkron-koordinat.js --cek    hanya memeriksa kesamaan (keluar dengan kode 1 bila berbeda); dipakai di uji
 *
 * Sumber kebenaran: public/js/koordinat-lokasi.js. Salinan: supabase/functions/api/_shared/koordinat.ts (jangan diedit tangan).
 */
const fs = require("fs");
const path = require("path");

const SUMBER = path.join(__dirname, "..", "public", "js", "koordinat-lokasi.js");
const SALINAN = path.join(__dirname, "..", "supabase", "functions", "api", "_shared", "koordinat.ts");
const AWAL = "// <<KOORDINAT-INTI";
const AKHIR = "// KOORDINAT-INTI>>";

function inti(teks, berkas) {
  const t = teks.replace(/\r\n/g, "\n");
  const a = t.indexOf(AWAL);
  const b = t.indexOf(AKHIR);
  if (a < 0 || b < 0 || b < a) throw new Error("Penanda KOORDINAT-INTI tidak ditemukan di " + berkas);
  return t.slice(t.indexOf("\n", a) + 1, b);
}
// Perbandingan mengabaikan indentasi, spasi di ujung, dan baris kosong.
function normal(blok) {
  return blok.split("\n").map((l) => l.trim()).filter((l) => l !== "").join("\n");
}
function dedent(blok) {
  return blok.split("\n").map((l) => l.replace(/^ {2}/, "")).join("\n");
}

const intiSumber = inti(fs.readFileSync(SUMBER, "utf8"), SUMBER);
const kepala = [
  "// @ts-nocheck -- SALINAN OTOMATIS dari public/js/koordinat-lokasi.js (bagian KOORDINAT-INTI). JANGAN diedit tangan:",
  "// ubah di sumbernya lalu jalankan `node scripts/sinkron-koordinat.js`. Kesamaan diperiksa oleh `--cek` dan oleh uji.",
  "// Penerjemah koordinat lokasi (plans/plan-koordinat-lokasi-pintar.md): server adalah penentu terakhir sebelum data disimpan.",
  "",
].join("\n");
const ekor = [
  "",
  "export { normalisasiKoordinat, layananWajib, LAYANAN_WAJIB };",
  "export const layananWajibKoordinat = layananWajib;",
  "",
].join("\n");
const isiBaru = kepala + "\n" + AWAL + "\n" + dedent(intiSumber) + AKHIR + "\n" + ekor;

if (process.argv.includes("--cek")) {
  if (!fs.existsSync(SALINAN)) { console.error("GAGAL: salinan server belum ada:", SALINAN); process.exit(1); }
  const intiSalinan = inti(fs.readFileSync(SALINAN, "utf8"), SALINAN);
  if (normal(intiSalinan) !== normal(intiSumber)) {
    console.error("GAGAL: bagian KOORDINAT-INTI di browser dan di server BERBEDA. Jalankan: node scripts/sinkron-koordinat.js");
    process.exit(1);
  }
  console.log("OK: penerjemah koordinat browser = server (" + normal(intiSumber).split("\n").length + " baris inti).");
} else {
  fs.writeFileSync(SALINAN, isiBaru);
  console.log("Salinan server ditulis:", path.relative(process.cwd(), SALINAN));
}
