// Uji bagian murni penanda koordinat GMM (Tahap A: hanya penanda). Tanpa jaringan/database.
// Jalankan: npm run uji:penanda-koordinat
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const P = require("../../public/js/app-penanda-koordinat.js");
const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");

test("PETA: jawaban server -> penanda per id; kode alasan diubah ke teks dari server", () => {
  const peta = P.susunPeta({ sukses: true, v: [701], b: [703], x: { 702: "TANPA_PENANDA", 704: "KODE_BARU" }, teks: { TANPA_PENANDA: "Tautan hanya menampilkan tampilan peta, tanpa titik penanda" } });
  assert.deepEqual(P.tandaUntuk(peta, 701), { s: "valid", alasan: "" });
  assert.deepEqual(P.tandaUntuk(peta, "702"), { s: "salah", alasan: "Tautan hanya menampilkan tampilan peta, tanpa titik penanda" });
  assert.equal(P.tandaUntuk(peta, 703).s, "tunggu");
  assert.match(P.tandaUntuk(peta, 704).alasan, /tidak dapat dipastikan/, "kode tak dikenal tetap menghasilkan teks wajar");
  assert.equal(P.tandaUntuk(peta, 999), null, "id di luar peta (bukan GMM) tidak diberi penanda");
  assert.equal(P.tandaUntuk(null, 701), null);
  assert.equal(P.tandaUntuk(peta, null), null);
});

test("PETA: jawaban gagal/tak sah -> tidak ada penanda (tidak melempar galat)", () => {
  for (const r of [null, undefined, {}, { sukses: false, pesan: "x" }, "x"]) assert.equal(P.susunPeta(r), null);
  assert.deepEqual(P.susunPeta({ sukses: true }), {});
});

test("TEKS: tahap A netral (tanpa ancaman penolakan); lencana tiga jenis; banner hanya untuk bermasalah/belum dicek", () => {
  const s = { s: "salah", alasan: "Tautan Street View, bukan titik penanda" };
  assert.equal(P.teksLencana({ s: "valid" }), "Koordinat valid");
  assert.equal(P.teksLencana(s), "Koordinat bermasalah");
  assert.equal(P.teksLencana({ s: "tunggu" }), "Koordinat belum dicek");
  assert.equal(P.teksLencana(null), "");
  assert.equal(P.judulLencana(s), "Tautan Street View, bukan titik penanda");
  assert.equal(P.teksBanner({ s: "valid" }), "");
  assert.equal(P.teksBanner(null), "");
  assert.match(P.teksBanner(s), /^Koordinat bermasalah: Tautan Street View/);
  assert.match(P.teksBanner({ s: "tunggu" }), /belum dicek/);
  // Tahap B: verifikator diberi tahu akibatnya (tidak dapat Memenuhi Syarat, pilih BTL + alasan koordinat); Admin Utama diberi tahu bahwa ia tidak diblokir
  assert.match(P.teksBanner(s, "VERIFIKATOR"), /tidak dapat diberi Memenuhi Syarat.*Berkas Tidak Lengkap.*alasan koordinat/);
  assert.match(P.teksBanner(s, "UTAMA"), /Verifikator tidak dapat memberi Memenuhi Syarat.*Admin Utama\) tidak diblokir/);
  assert.match(P.teksBanner(s), /tidak dapat diberi Memenuhi Syarat/, "tanpa peran diperlakukan seperti verifikator (bukan melonggarkan)");
  assert.doesNotMatch(P.teksBanner({ s: "tunggu" }, "VERIFIKATOR"), /Memenuhi Syarat/, "belum dicek: tidak menakut-nakuti");
});

test("PERAN: hanya Admin Utama dan Verifikator", () => {
  for (const ok of ["UTAMA", "verifikator", " Verifikator "]) assert.equal(P.peranBerhak(ok), true, ok);
  for (const no of ["KECAMATAN", "KEMENAG", "MUI", "GURU MAGHRIB MENGAJI", "", null, undefined]) assert.equal(P.peranBerhak(no), false, String(no));
});

test("ESC: teks dari server tidak dapat menyisipkan HTML", () => {
  assert.equal(P.esc('<img src=x onerror=1>"&'), "&lt;img src=x onerror=1&gt;&quot;&amp;");
});

test("KABEL: dimuat untuk UTAMA dan VERIFIKATOR saja; modul hanya memanggil aksi baca; versi skrip dinaikkan", () => {
  const src = baca("public/js/app-pesan-periode.js");
  const peta = src.match(/var SKRIP_PER_PERAN = \{([\s\S]*?)\n  \};/)[1];
  const baris = (peran) => (peta.match(new RegExp("(^|\\n)\\s*" + peran + ": \\[([^\\]]*)\\]")) || [])[2] || "";
  assert.match(baris("UTAMA"), /app-penanda-koordinat\.js/);
  assert.match(baris("VERIFIKATOR"), /app-penanda-koordinat\.js/);
  for (const r of ["MUI", "'GURU MAGHRIB MENGAJI'"]) assert.doesNotMatch(baris(r), /app-penanda-koordinat/, r);
  const m = baca("public/js/app-penanda-koordinat.js");
  const aksi = [...m.matchAll(/rpc\('([A-Za-z]+)'/g)].map((x) => x[1]);
  assert.deepEqual(aksi, ["getPenandaKoordinat", "getTitikKoordinatData"], "hanya dua aksi server, keduanya hanya membaca");
  assert.equal(P.urlTitik(3.6173294, 98.6838672), "https://www.google.com/maps?q=3.6173294,98.6838672", "alamat titik langsung (selalu bermarka)");
  assert.equal(P.urlTitik("3.6; alert(1)", 98.6), "https://www.google.com/maps?q=NaN,98.6", "nilai bukan angka tidak lolos ke alamat");
  assert.doesNotMatch(m, /simpan|verifikasiSatuData|editDataPenerima/);
  const html = baca("index.html");
  assert.match(html, /app-pesan-periode\.js\?v=20271123/);
  assert.match(html, /koordinat-lokasi\.js\?v=20271100/, "pemeriksaan Street View di formulir GMM: versi skrip dinaikkan agar peramban tidak memakai salinan lama");
});
