// Uji tombol peta koordinat di Cek Status (khusus Guru Maghrib Mengaji). Plan: plans/plan-cek-status-koordinat-gmm.md.
// Jalankan: npm run uji:cek-status-koordinat     (Node 24+; data karangan, tanpa database/jaringan)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tautanPetaAman as amanServer, samaDenganLayananPeta } from "../../supabase/functions/api/_shared/tautanPeta.ts";
import { pilihKolomPublik, prosesCekStatus } from "../../supabase/functions/api/_shared/cekStatusInti.ts";
import { tautanPetaAman as amanWorker, tanganiCekStatus } from "../../worker/cek-status.js";

const GMM = "GURU MAGHRIB MENGAJI";
const Q = "https://www.google.com/maps?q=3.595200,98.672200";

// Bentuk nyata di data (dicek 2026-11-08) -> harus lolos.
const SAH = [
  Q,
  "https://maps.google.com/?q=3.744754,98.672447",
  "https://maps.app.goo.gl/AbCd1234",
  "https://goo.gl/maps/AbCd1234",
  "https://www.google.com/maps/place/Bakulan+kak+Marsya/@3.4994086,98.5989851,19z/data=!3m1!4b1?entry=ttu",
  "https://www.google.com/maps/search/jl.+nusa+indah+vi/@3.5363593,98.6248749,49m/data=!3m1!1e3",
  "https://google.com/maps?q=3.5,98.6",
  "https://www.google.co.id/maps/dir/3.5913728,98.566144/Masjid+Taqwa+Istiqlal", // bentuk nyata di data (1 baris)
  "https://www.google.co.id/maps/dir/3.5913728,98.566144/Masjid+Taqwa+Istiqlal,+Jl.+Pendidikan+No.104,+Kec.+Medan+Sunggal/@3.5884073,98.5582818,13z/data=!3m1!4b1!4m9!4m8!1m1!4e1!1m5!1m1!1s0x30312fb377681549:0xff1f9d27e1f26379!2m2!1d98.631892!2d3.5784612?entry=ttu&g_ep=EgoyMDI2MTAyMC4wIKXMDSoASAFQAw%3D%3D",
  "https://maps.google.com/maps?q=3.5824575%2C98.6398247&z=17&hl=id",
  "https://maps.google.com?q=3.5615270,98.6397090&entry=gps&shh=CAE&lucs=,94297699,94231188&g_st=ic", // tanpa "/" sebelum "?"
  "https://goo.gl/maps/ZdRRPnRqXHVXs6698?g_st=ac",
  "https://maps.app.goo.gl/DwWcCLH8JRs8PSN6A?g_st=aw",
  "  " + Q + "  ", // spasi tepi dirapikan
];
// Harus DITOLAK.
const JAHAT = [
  "http://www.google.com/maps?q=3.5,98.6",
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "//evil.com/maps",
  "https://google.com.evil.com/maps?q=1,1",
  "https://evilgoogle.com/maps?q=1,1",
  "https://www.google.com.evil.com/maps",
  "https://www.google.co.id.evil.com/maps",
  "https://www.google.co.uk/maps",
  "https://www.google.co.id/search?q=maps",
  "https://evil.com/?u=https://www.google.com/maps",
  "https://user@www.google.com/maps",
  "https://user:pw@www.google.com/maps",
  "https://www.google.com:8443/maps?q=1,1",
  "https://www.google.com/search?q=maps",
  "https://www.google.com/mapsevil",
  "https://www.google.com/",
  "https://maps.app.goo.gl",
  "https://maps.app.goo.gl/",
  "https://goo.gl/abc",
  "https://www.google.com\\@evil.com/maps",
  "https://www.google.com/maps?q=1,1 onclick=x",
  "https://www.google.com/maps?q=1,1\nHost: evil",
  "https://www.google.com./maps",
  "https://maps.google.com/other",
  "https://www.google.com/maps/" + "a".repeat(1000),
  "", "   ", null, undefined, 123, {}, [],
];

test("tautanPetaAman: bentuk nyata lolos (server dan Worker sama persis)", () => {
  for (const t of SAH) {
    const a = amanServer(t), b = amanWorker(t);
    assert.ok(a, "server menolak: " + t);
    assert.equal(a.startsWith("https://"), true);
    assert.equal(b, a, "Worker beda dari server: " + t);
  }
});

test("tautanPetaAman: tautan berbahaya/tak dikenal ditolak (server dan Worker sama)", () => {
  for (const t of JAHAT) {
    assert.equal(amanServer(t), null, "server meloloskan: " + String(t).slice(0, 60));
    assert.equal(amanWorker(t), null, "Worker meloloskan: " + String(t).slice(0, 60));
  }
});

test("Kesesuaian acak: server dan Worker memutuskan sama untuk 20.000 masukan campuran", () => {
  const bahan = ["https://", "http://", "www.google.com", "google.com", "maps.google.com", "maps.app.goo.gl", "goo.gl", "evil.com", "/maps", "/maps/", "/", "?q=1,1", "@", ":8443", "x", " ", "\\", ".", "%2e"];
  let seed = 7; const acak = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 20000; i++) {
    let t = ""; const n = 1 + Math.floor(acak() * 6);
    for (let j = 0; j < n; j++) t += bahan[Math.floor(acak() * bahan.length)];
    assert.equal(amanServer(t), amanWorker(t), JSON.stringify(t));
  }
});

test("Layanan GMM dikenali dengan rapi; layanan lain/bukan teks tidak", () => {
  for (const ya of [GMM, " guru  maghrib mengaji ", "Guru Maghrib Mengaji"]) assert.equal(samaDenganLayananPeta(ya), true, ya);
  for (const tidak of ["GURU MAGHRIB", "GURU MAGHRIB MENGAJI 2", "IMAM MASJID", "", null, undefined, 5]) assert.equal(samaDenganLayananPeta(tidak), false, String(tidak));
});

const baris = (o = {}) => ({
  nama: "SITI", layanan: GMM, kecamatan: "MEDAN KOTA", kelurahan: "SITI REJO", status_verifikasi: "Memenuhi Syarat",
  link_koordinat_lokasi: Q, nik: "1271010101900001", alamat: "JL. RAHASIA", nomor_rekening: "999", ...o,
});

test("pilihKolomPublik: GMM + tautan sah -> ada tautanPeta; kolom sensitif tetap tidak ikut", () => {
  const d = pilihKolomPublik(baris());
  assert.equal(d.tautanPeta, Q);
  assert.deepEqual(Object.keys(d).sort(), ["kecamatan", "kelurahan", "layanan", "nama", "status", "tautanPeta"]);
  assert.doesNotMatch(JSON.stringify(d), /RAHASIA|999|1271010101900001/);
});

test("pilihKolomPublik: layanan lain TIDAK PERNAH punya kolom tautanPeta (meski datanya ada dan sah)", () => {
  for (const l of ["IMAM MASJID", "GURU SEKOLAH MINGGU", "KHATIB JUMAT", "", "GURU MAGHRIB MENGAJI X"]) {
    const d = pilihKolomPublik(baris({ layanan: l }));
    assert.equal("tautanPeta" in d, false, l);
    assert.deepEqual(Object.keys(d).sort(), ["kecamatan", "kelurahan", "layanan", "nama", "status"], l);
  }
});

test("pilihKolomPublik: Tidak Memenuhi Syarat tanpa tautanPeta; status lain dengan tautanPeta", () => {
  assert.equal("tautanPeta" in pilihKolomPublik(baris({ status_verifikasi: "Tidak Memenuhi Syarat" })), false);
  for (const s of ["Memenuhi Syarat", "Proses Verifikasi", "Berkas Tidak Lengkap"]) {
    assert.equal(pilihKolomPublik(baris({ status_verifikasi: s })).tautanPeta, Q, s);
  }
});

test("pilihKolomPublik: tautan jahat/kosong/hilang -> kolom TIDAK ADA (bukan string kosong)", () => {
  for (const t of ["javascript:alert(1)", "http://www.google.com/maps", "https://google.com.evil.com/maps", "", null, undefined]) {
    const d = pilihKolomPublik(baris({ link_koordinat_lokasi: t }));
    assert.equal("tautanPeta" in d, false, String(t));
  }
  const tanpaKolom = baris(); delete tanpaKolom.link_koordinat_lokasi;
  assert.equal("tautanPeta" in pilihKolomPublik(tanpaKolom), false);
});

test("Alur penuh prosesCekStatus: GMM menerima tautanPeta, layanan lain tidak", async () => {
  const buat = (b) => ({
    pepper: "garam-uji-yang-cukup-panjang", tahun: 2027, hariIni: () => "2026-11-08",
    fiturAktif: async () => true, ambilJatah: async () => true, resetPercobaan: async () => {}, cariPenerima: async () => b,
  });
  const a = await prosesCekStatus(buat(baris()), "1271010101900001", "1990-01-01");
  assert.equal(a.sukses, true); assert.equal(a.data.tautanPeta, Q);
  const b = await prosesCekStatus(buat(baris({ layanan: "IMAM MASJID" })), "1271010101900001", "1990-01-01");
  assert.equal("tautanPeta" in b.data, false);
});

// ---- Worker ----
const ENV = { TURNSTILE_SECRET_KEY: "rahasia-turnstile", GAS_SECRET_TOKEN: "rahasia-gas" };
async function lewatWorker(data) {
  const req = new Request("https://djpmkotamedan.web.id/api/cek-status", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nik: "1271010101900001", tanggalLahir: "1990-01-31", turnstileToken: "tok" }),
  });
  let jam = 1000;
  const deps = {
    ambil: async () => ({ json: async () => ({ success: true, hostname: "djpmkotamedan.web.id" }) }),
    panggilBackend: async () => ({ text: JSON.stringify({ result: { sukses: true, data } }) }),
    tunggu: async (ms) => { jam += ms; }, sekarang: () => jam,
  };
  const res = await tanganiCekStatus(req, ENV, deps);
  return (await res.json()).data;
}
const dariServer = (o = {}) => ({ nama: "SITI", layanan: GMM, kecamatan: "K", kelurahan: "L", status: "Memenuhi Syarat", tautanPeta: Q, ...o });

test("Worker: meneruskan tautanPeta sah untuk GMM", async () => {
  const d = await lewatWorker(dariServer());
  assert.equal(d.tautanPeta, Q);
});

test("Worker: membuang tautanPeta jahat, bukan-string, untuk layanan lain, dan untuk Tidak Memenuhi Syarat", async () => {
  for (const t of ["javascript:alert(1)", "http://www.google.com/maps", "https://evil.com/maps", 5, null, { a: 1 }]) {
    assert.equal("tautanPeta" in (await lewatWorker(dariServer({ tautanPeta: t }))), false, String(t));
  }
  assert.equal("tautanPeta" in (await lewatWorker(dariServer({ layanan: "IMAM MASJID" }))), false);
  assert.equal("tautanPeta" in (await lewatWorker(dariServer({ status: "Tidak Memenuhi Syarat" }))), false);
  const d = await lewatWorker(dariServer({ koordinat: "3.5,98.6", nomorRekening: "999", lat: 3.5 }));
  assert.deepEqual(Object.keys(d).sort(), ["kecamatan", "kelurahan", "layanan", "nama", "status", "tautanPeta"]);
});

// ---- Halaman ----
test("Halaman: hanya tombol buka-peta + peringatan; tanpa angka koordinat, peta tertanam, atau aksi lain", () => {
  const html = fs.readFileSync("public/cek-status.html", "utf8");
  assert.match(html, /Buka titik di Google Maps/);
  assert.match(html, /Perhatikan apakah titik sudah sesuai\./);
  assert.match(html, /hubungi KUA masing-masing/);
  assert.match(html, /Guru Maghrib Mengaji, sehingga pembayaran berisiko dihentikan\./);
  assert.match(html, /Klik tombol di bawah ini untuk melihat titik lokasi Anda di Google Maps/);
  assert.doesNotMatch(html, /beresiko/i, "ejaan baku: berisiko");
  assert.match(html, /a\.rel = 'noopener noreferrer'/);
  assert.match(html, /a\.target = '_blank'/);
  assert.doesNotMatch(html, /<iframe|createElement\('(img|iframe)'\)|navigator\.clipboard|window\.open|innerHTML/i, "tidak ada peta tertanam/salin/innerHTML");
  assert.equal((html.match(/<img /gi) || []).length, 1, "hanya logo header yang berupa gambar");
  const csp = fs.readFileSync("public/_headers", "utf8");
  assert.match(csp, /img-src 'self' data:; connect-src 'self'; frame-src https:\/\/challenges\.cloudflare\.com;/, "CSP tidak dilonggarkan");
});
