// Uji bagian murni pengingat koordinat GMM: teks pesan persis seperti yang disetujui user dan penentuan sasaran (hanya peran GMM).
// Rencana: plans/plan-pengingat-koordinat-gmm.md. Perilaku tampilan di Chrome diuji oleh scripts/uji/layar/pengingat-koordinat-gmm.mjs.
// Jalankan: npm run uji:pengingat-koordinat     (Node 24+; tanpa koneksi database/jaringan)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pk = require("../../public/js/app-pengingat-koordinat-gmm.js");

test("Teks banner berjalan persis kalimat yang disetujui user (2026-11-07)", () => {
  assert.equal(
    pk.PESAN_BANNER,
    "Cek dan Pastikan kembali Koordinat terhadap data yang SUDAH diinput adalah BENAR dan menunjukkan alamat tugas Guru Maghrib Mengaji.",
  );
});

test("Banner: kalimat yang disetujui TIDAK berubah, informasi Cek Status hanya ditambahkan sesudahnya", () => {
  assert.equal(
    pk.TEKS_BANNER,
    pk.PESAN_BANNER + " Informasikan kepada guru bahwa titik lokasi dapat diperiksa sendiri di halaman Cek Status: djpmkotamedan.web.id/cek-status",
  );
  assert.equal(pk.ALAMAT_CEK_STATUS, "djpmkotamedan.web.id/cek-status");
  assert.equal(pk.INFO_FORMULIR, "Informasikan kepada guru bahwa titik lokasinya dapat diperiksa sendiri di halaman Cek Status:");
});

test("Teks kotak formulir sesuai persetujuan (K1: 'dapat berdampak'), judul dan isi terpisah", () => {
  assert.equal(pk.JUDUL_FORMULIR, "PENTING: Koordinat Lokasi.");
  assert.equal(
    pk.ISI_FORMULIR,
    "Koordinat dipakai Tim Monitoring untuk menemukan lokasi guru. Koordinat yang salah atau hanya perkiraan membuat guru dianggap tidak ditemukan saat monitoring dan dapat berdampak pada pembayaran Dana Jasa yang bersangkutan.",
  );
  assert.doesNotMatch(pk.ISI_FORMULIR, /dapat akan/, "kekeliruan 'dapat akan' tidak boleh terbawa");
});

test("Sasaran: hanya peran GURU MAGHRIB MENGAJI (huruf besar/kecil dan spasi tambahan diabaikan)", () => {
  for (const ya of ["GURU MAGHRIB MENGAJI", "guru maghrib mengajI", "  GURU   MAGHRIB MENGAJI  ", "Guru Maghrib Mengaji"]) {
    assert.equal(pk.peranSasaran(ya), true, ya);
  }
  for (const tidak of ["UTAMA", "KECAMATAN", "MUI", "IMAM MASJID", "KHATIB JUMAT", "GURU SEKOLAH MINGGU", "GURU MAGHRIB", "GURU MAGHRIB MENGAJI X", "", null, undefined]) {
    assert.equal(pk.peranSasaran(tidak), false, String(tidak));
  }
});

test("Dipasang hanya untuk sesi yang MASUK (ada token) dengan peran sasaran", () => {
  assert.equal(pk.perluDipasang({ token: "t", role: "GURU MAGHRIB MENGAJI" }), true);
  assert.equal(pk.perluDipasang({ token: "", role: "GURU MAGHRIB MENGAJI" }), false, "tanpa token (sudah keluar)");
  assert.equal(pk.perluDipasang({ role: "GURU MAGHRIB MENGAJI" }), false);
  assert.equal(pk.perluDipasang({ token: "t", role: "UTAMA" }), false);
  assert.equal(pk.perluDipasang({ token: "t", role: "KECAMATAN" }), false);
  assert.equal(pk.perluDipasang(null), false);
  assert.equal(pk.perluDipasang(undefined), false);
});

test("Pemuat per peran: skrip dimuat hanya untuk GMM (peran lain tidak mengunduh) dan versi dinaikkan", () => {
  const pemuat = fs.readFileSync("public/js/app-pesan-periode.js", "utf8");
  assert.match(pemuat, /'GURU MAGHRIB MENGAJI': \['\/js\/app-pengingat-koordinat-gmm\.js'\]/);
  // Entri UTAMA dan MUI tidak ikut memuat skrip pengingat.
  const utama = /UTAMA: \[[^\]]*\]/.exec(pemuat)[0];
  assert.doesNotMatch(utama, /pengingat-koordinat-gmm/);
  assert.doesNotMatch(/MUI: \[[^\]]*\]/.exec(pemuat)[0], /pengingat-koordinat-gmm/);
  const html = fs.readFileSync("index.html", "utf8");
  assert.match(html, /app-pesan-periode\.js\?v=20271074/);
});

test("Pembungkus hak akses tidak merusak kebiasaan pembungkus lain: nama berkas tidak mengubah aksi server/DB (hanya tampilan)", () => {
  const sumber = fs.readFileSync("public/js/app-pengingat-koordinat-gmm.js", "utf8");
  assert.doesNotMatch(sumber, /google\.script\.run|fetch\(|XMLHttpRequest|localStorage|sessionStorage/, "pengingat murni tampilan");
  assert.doesNotMatch(sumber, /innerHTML\s*=[^;]*(PESAN_BANNER|ISI_FORMULIR)/, "teks pesan tidak boleh masuk lewat innerHTML");
});
