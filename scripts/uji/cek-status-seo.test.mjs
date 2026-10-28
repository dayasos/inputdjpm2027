// Go-live Cek Status (plan F3): halaman dapat diindeks, masuk sitemap, ditautkan dari aplikasi, dan tidak membocorkan data.
// Jalankan: npm run uji:cek-status-seo
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8").split("\r\n").join("\n");
const halaman = baca("public/cek-status.html");
const URL_HALAMAN = "https://djpmkotamedan.web.id/cek-status";

test("halaman: robots index,follow (BUKAN noindex) dan canonical persis alamat halaman", () => {
  assert.ok(halaman.includes('<meta name="robots" content="index, follow">'));
  assert.ok(!halaman.toLowerCase().includes("noindex"), "tidak boleh ada noindex tersisa");
  assert.ok(halaman.includes('<link rel="canonical" href="' + URL_HALAMAN + '">'));
  assert.ok(halaman.includes('<meta property="og:url" content="' + URL_HALAMAN + '">'));
});

test("halaman: tetap tidak menyimpan referrer, dan hasil pengecekan tidak pernah ada di HTML statis", () => {
  assert.ok(halaman.includes('<meta name="referrer" content="no-referrer">'));
  assert.ok(!halaman.includes("Memenuhi Syarat</dd>"), "tidak ada hasil bawaan di HTML");
});

test("data terstruktur: JSON valid, WebPage, alamat benar, TANPA data pribadi (tidak ada NIK/nama/tanggal lahir)", () => {
  const awal = halaman.indexOf('<script type="application/ld+json">');
  assert.ok(awal > 0);
  const mulai = halaman.indexOf(">", awal) + 1;
  const akhir = halaman.indexOf("</script>", mulai);
  const ld = JSON.parse(halaman.slice(mulai, akhir));
  assert.equal(ld["@type"], "WebPage");
  assert.equal(ld.url, URL_HALAMAN);
  assert.equal(ld.inLanguage, "id");
  const teks = JSON.stringify(ld);
  assert.ok(!/[0-9]{16}/.test(teks), "tidak boleh ada 16 digit angka");
  assert.ok(!/[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(teks), "tidak boleh ada tanggal");
});

test("sitemap: memuat halaman utama DAN /cek-status, XML sederhana valid", () => {
  const s = baca("public/sitemap.xml");
  assert.ok(s.includes("<loc>https://djpmkotamedan.web.id/</loc>"));
  assert.ok(s.includes("<loc>" + URL_HALAMAN + "</loc>"));
  assert.equal(s.split("<url>").length, s.split("</url>").length, "tag <url> seimbang");
  assert.equal(s.split("<url>").length - 1, 2);
});

test("robots.txt: /api/ tidak boleh dirayapi, sitemap tetap terdaftar, halaman tidak diblokir", () => {
  const r = baca("public/robots.txt");
  assert.ok(r.includes("Disallow: /api/"));
  assert.ok(r.includes("Sitemap: https://djpmkotamedan.web.id/sitemap.xml"));
  assert.ok(!r.includes("Disallow: /cek-status"));
  assert.ok(!r.split("\n").includes("Disallow: /"), "tidak boleh memblokir seluruh situs");
});

test("aplikasi utama: modal login (yang dilihat warga) menautkan ke /cek-status", () => {
  const idx = baca("index.html");
  const modal = idx.indexOf('<div id="modal-login"');
  assert.ok(modal > 0);
  const tautan = idx.indexOf('href="/cek-status"', modal);
  assert.ok(tautan > modal, "tautan harus berada di dalam/sesudah modal login");
  const tombolMasuk = idx.indexOf('id="btn-login"', modal);
  assert.ok(tautan > tombolMasuk, "tautan ditaruh di bawah tombol MASUK, tidak mengganggu form");
});

test("kelas Tailwind pada tautan sudah ada di CSS yang di-commit (tidak perlu build ulang)", () => {
  const css = baca("public/css/tailwind.css");
  for (const kelas of ["text-sky-700", "hover\\:text-sky-800", "underline", "pb-4", "text-center", "font-semibold", "text-xs"]) {
    assert.ok(css.includes("." + kelas), "kelas hilang dari CSS: " + kelas);
  }
});

test("CSP /cek-status* tetap membolehkan data terstruktur inline dan Turnstile saja", () => {
  const h = baca("public/_headers");
  assert.ok(h.includes("/cek-status*"));
  assert.ok(h.includes("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com"));
  assert.ok(h.includes("frame-ancestors 'none'"));
});
