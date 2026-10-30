"use strict";

/**
 * Memastikan public/css/tailwind.css (berkas YANG DI-COMMIT dan disajikan produksi) sudah mencakup semua kelas Tailwind
 * yang dipakai kode saat ini. Vercel TIDAK membangun ulang CSS: berkas yang di-commit itulah yang tampil. Kelas baru yang
 * belum dibangun ulang tampil polos di produksi (mis. bingkai merah jadi abu-abu gelap) walau normal di komputer pengembang.
 *
 *   node scripts/cek-css-terbaru.js          periksa saja (keluar dengan kode 1 bila CSS ketinggalan)
 *   npm run build:css                        bangun ulang (tailwind + kompat Chrome lama), lalu commit berkas CSS-nya
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const akar = path.join(__dirname, "..");
const terkomit = path.join(akar, "public", "css", "tailwind.css");
const sementara = path.join(os.tmpdir(), "tailwind-cek-" + process.pid + ".css");

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
cp.execFileSync(npx, ["--no-install", "tailwindcss", "-i", "./tailwind.input.css", "-o", sementara, "--minify"], { cwd: akar, stdio: "ignore", shell: process.platform === "win32" });
cp.execFileSync(process.execPath, [path.join(__dirname, "kompat-css.js"), sementara], { cwd: akar, stdio: "ignore" });

const norm = (t) => t.replace(/\r\n/g, "\n");
const aturan = (t) => new Set(norm(t).split("}"));
const baru = fs.readFileSync(sementara, "utf8");
const lama = fs.readFileSync(terkomit, "utf8");
fs.rmSync(sementara, { force: true });

const A = aturan(lama), B = aturan(baru);
const kurang = [...B].filter((x) => !A.has(x));
const lebih = [...A].filter((x) => !B.has(x));
if (kurang.length === 0 && lebih.length === 0) {
  console.log("OK: public/css/tailwind.css sudah terbaru (" + B.size + " aturan).");
  // Penjaga cache: CSS berubah dari HEAD => nomor ?v= di index.html wajib naik (lihat scripts/cek-versi-css.js).
  const v = require("./cek-versi-css.js").periksa();
  if (!v.ok) { console.error("GAGAL versi CSS: " + v.pesan); process.exit(1); }
  console.log("OK versi CSS: " + v.catatan);
  process.exit(0);
}
console.error("GAGAL: public/css/tailwind.css ketinggalan. Jalankan `npm run build:css` lalu commit berkas CSS-nya.");
kurang.slice(0, 12).forEach((x) => console.error("  perlu ditambah:", x.trim().slice(0, 140) + "}"));
lebih.slice(0, 5).forEach((x) => console.error("  tidak lagi dipakai:", x.trim().slice(0, 140) + "}"));
console.error("  (" + kurang.length + " aturan kurang, " + lebih.length + " berlebih)");
process.exit(1);
