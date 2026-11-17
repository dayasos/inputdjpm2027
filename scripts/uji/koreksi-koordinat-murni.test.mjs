// Uji bagian murni layar koreksi koordinat (khusus Admin Utama). Tanpa jaringan/database.
// Jalankan: npm run uji:koreksi-koordinat
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const K = require("../../public/js/app-koreksi-koordinat.js");
const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");

test("PRATINJAU: jawaban server -> daftar id persis yang tampil; jawaban tak sah ditolak", () => {
  const p = K.susunPratinjau({ sukses: true, dryRun: true, jumlah: 2, data: [{ id: 5, nama: "A" }, { id: 7, nama: "B" }, { id: 0 }, null] });
  assert.equal(p.ok, true); assert.deepEqual(p.ids, [5, 7]); assert.equal(p.jumlah, 2);
  for (const r of [null, {}, { sukses: false, pesan: "x" }, { sukses: true, dryRun: false, data: [] }, { sukses: true, dryRun: true }]) assert.equal(K.susunPratinjau(r).ok, false);
  assert.equal(K.susunPratinjau({ sukses: false, pesan: "Fitur ini khusus Admin Utama." }).pesan, "Fitur ini khusus Admin Utama.");
  assert.equal(K.susunPratinjau({ sukses: true, dryRun: true, data: [], melebihiBatas: true }).melebihiBatas, true);
});

test("HASIL & TEKS TOMBOL", () => {
  assert.deepEqual(K.teksHasil({ sukses: true, pesan: "2 data diubah ke Berkas Tidak Lengkap oleh SISTEM." }), { ok: true, teks: "2 data diubah ke Berkas Tidak Lengkap oleh SISTEM." });
  assert.equal(K.teksHasil({ sukses: false, pesan: "Gagal" }).ok, false);
  assert.equal(K.teksHasil(null).ok, false);
  assert.equal(K.teksTombol(37), "Jalankan koreksi oleh SISTEM (37 data)");
  assert.equal(K.esc('<b>"&'), "&lt;b&gt;&quot;&amp;");
});

test("KABEL: dimuat untuk UTAMA saja; layar hanya memanggil satu aksi dan mengirim daftar id dari pratinjau", () => {
  const src = baca("public/js/app-pesan-periode.js");
  const peta = src.match(/var SKRIP_PER_PERAN = \{([\s\S]*?)\n  \};/)[1];
  const baris = (peran) => (peta.match(new RegExp("(^|\\n)\\s*" + peran + ": \\[([^\\]]*)\\]")) || [])[2] || "";
  assert.match(baris("UTAMA"), /app-koreksi-koordinat\.js/);
  for (const r of ["VERIFIKATOR", "MUI", "'GURU MAGHRIB MENGAJI'"]) assert.doesNotMatch(baris(r), /app-koreksi-koordinat/, r);
  const m = baca("public/js/app-koreksi-koordinat.js");
  const aksi = [...m.matchAll(/rpc\('([A-Za-z]+)'/g)].map((x) => x[1]);
  assert.deepEqual(aksi, ["koreksiKoordinatBermasalah", "koreksiKoordinatBermasalah"], "pratinjau dan pelaksanaan");
  assert.match(m, /rpc\('koreksiKoordinatBermasalah', \[true, p\.ids\]\)/);
  assert.match(m, /rpc\('koreksiKoordinatBermasalah', \[\]\)/, "pratinjau tanpa argumen tulis");
  assert.match(baca("index.html"), /app-pesan-periode\.js\?v=20271097/);
});
