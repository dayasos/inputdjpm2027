"use strict";

/**
 * Penjaga cache CSS: index.html memuat `/css/tailwind.css?v=NNN`. Service worker memakai stale-while-revalidate untuk CSS dan browser
 * menyimpannya per alamat, jadi bila isi CSS berubah tetapi NNN tidak naik, pengguna tetap memakai CSS LAMA (kelas baru tampil polos:
 * mis. tombol berlatar transparan dengan teks putih = tak terlihat). Kejadian nyata 2026-10-31 (tombol "Buka Cek Alamat").
 *
 * Aturan: bila public/css/tailwind.css (copy kerja) berbeda dari commit terakhir (HEAD), maka angka ?v= di index.html HARUS berbeda dari HEAD.
 * Di luar repo git / tanpa HEAD: dilewati. Keluar dengan kode 1 bila dilanggar.
 *
 *   node scripts/cek-versi-css.js     (juga dipanggil oleh scripts/cek-css-terbaru.js = npm run check-css)
 */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const akar = path.join(__dirname, "..");
const norm = (t) => String(t).replace(/\r\n/g, "\n");
const versiDari = (html) => (/\/css\/tailwind\.css\?v=([0-9A-Za-z._-]+)/.exec(html) || [])[1] || null;

function dariHead(berkas) {
  try {
    return cp.execFileSync("git", ["show", "HEAD:" + berkas], { cwd: akar, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  } catch (_e) {
    return null;
  }
}

function periksa() {
  const cssHead = dariHead("public/css/tailwind.css");
  const htmlHead = dariHead("index.html");
  if (cssHead === null || htmlHead === null) return { ok: true, catatan: "dilewati (bukan repo git / tanpa HEAD)" };
  const cssSkrg = fs.readFileSync(path.join(akar, "public", "css", "tailwind.css"), "utf8");
  const htmlSkrg = fs.readFileSync(path.join(akar, "index.html"), "utf8");
  const vSkrg = versiDari(htmlSkrg), vHead = versiDari(htmlHead);
  if (!vSkrg) return { ok: false, pesan: "index.html tidak memuat /css/tailwind.css?v=... (nomor versi CSS wajib ada)." };
  if (norm(cssSkrg) === norm(cssHead)) return { ok: true, catatan: "CSS tidak berubah dari HEAD (?v=" + vSkrg + ")" };
  if (vSkrg !== vHead) return { ok: true, catatan: "CSS berubah dan ?v= sudah naik (" + vHead + " -> " + vSkrg + ")" };
  return { ok: false, pesan: "public/css/tailwind.css berubah dari commit terakhir tetapi nomor ?v= di index.html masih " + vSkrg + ". Naikkan angkanya (mis. +1) agar browser/service worker tidak memakai CSS lama." };
}

module.exports = { periksa, versiDari };

if (require.main === module) {
  const h = periksa();
  if (h.ok) { console.log("OK versi CSS: " + h.catatan); process.exit(0); }
  console.error("GAGAL versi CSS: " + h.pesan);
  process.exit(1);
}
