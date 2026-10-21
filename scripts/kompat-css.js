// Pasca-build tailwind.css: ubah warna oklch() menjadi hex supaya tampil di Chrome/Edge lama.
//
// Tailwind v4 mendefinisikan SELURUH palet sebagai variabel `--color-xxx-nnn: oklch(...)` tanpa cadangan.
// Browser yang belum mengenal oklch (Chrome/Edge < 111, mis. Chrome 109 yang masih dipakai di Windows 7/8
// komputer kelurahan) menganggap variabelnya tidak valid, sehingga SETIAP warna palet hilang: latar tombol
// Simpan jadi transparan sedangkan tulisannya putih -> tombol tampak "tidak ada" (laporan Sidorejo,
// 2026-10-21; sebelumnya juga Asam Kumbang), garis tepi jadi hitam, dst.
//
// Gradien (`bg-gradient-to-*`) juga memakai "in oklab" yang baru dikenal Chrome 111+: tombol "Instal" PWA dan bar
// progres unggah kehilangan latarnya (laporan Sidorejo, foto ke-2). Diperbaiki di bagian "Gradien" di bawah.
//
// Pemakaian: node scripts/kompat-css.js [berkas.css]   (bawaan: public/css/tailwind.css). Aman dijalankan ulang.
// Dipanggil otomatis oleh `npm run build:css`. Opsi --periksa: hanya cek (exit 1 bila masih ada oklch()
// atau gradien "in <ruang>" di luar @supports).
const fs = require('fs');
const path = require('path');

const berkas = process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join('public', 'css', 'tailwind.css');
const hanyaPeriksa = process.argv.includes('--periksa');

// OKLCH -> sRGB (Bjorn Ottosson), di-clamp ke gamut sRGB.
function oklchKeRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
  return lin.map((x) => {
    const g = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055;
    return Math.min(255, Math.max(0, Math.round(g * 255)));
  });
}

const hex2 = (n) => n.toString(16).padStart(2, '0');

// oklch(58.8% .158 241.966)  |  oklch(0.588 0.158 241.966 / 50%)  |  oklch(58.8% .158 none)
function ubah(teks) {
  return teks.replace(/oklch\(\s*([^)]+?)\s*\)/gi, (semua, isi) => {
    const [kanal, alfa] = isi.split('/').map((s) => s.trim());
    const p = kanal.split(/\s+/);
    if (p.length !== 3) return semua;
    const num = (s, persenSkala) => {
      if (s === 'none') return 0;
      return s.endsWith('%') ? (parseFloat(s) / 100) * persenSkala : parseFloat(s);
    };
    const L = num(p[0], 1), C = num(p[1], 0.4), H = p[2] === 'none' ? 0 : parseFloat(p[2]);
    if ([L, C, H].some((x) => Number.isNaN(x))) return semua;
    const [r, g, bl] = oklchKeRgb(L, C, H);
    let hasil = '#' + hex2(r) + hex2(g) + hex2(bl);
    if (alfa !== undefined) {
      const aNum = alfa.endsWith('%') ? parseFloat(alfa) / 100 : parseFloat(alfa);
      if (!Number.isNaN(aNum) && aNum < 1) hasil += hex2(Math.round(Math.min(1, Math.max(0, aNum)) * 255));
    }
    return hasil;
  });
}

// ---- Gradien: `to right in oklab` (interpolasi warna di dalam linear-gradient) juga baru dikenal Chrome 111+.
// Di browser lama deklarasi itu tidak valid -> background-image batal -> tombol bergradien (mis. "Instal" PWA,
// bar progres unggah) tampil TANPA latar. Perbaikan: buang " in <ruang>" dari arah gradien, lalu pulihkan di
// @supports khusus browser baru sehingga tampilan Chrome modern TIDAK berubah.
const PENANDA_GRADIEN = '/*kompat-gradien*/';

// Buang blok @supports (termasuk bersarang) supaya pemeriksaan hanya melihat aturan yang berlaku di browser lama.
function tanpaSupports(s) {
  let hasil = '', i = 0;
  while (i < s.length) {
    const j = s.indexOf('@supports', i);
    if (j < 0) { hasil += s.slice(i); break; }
    hasil += s.slice(i, j);
    let k = s.indexOf('{', j), d = 1;
    k++;
    while (k < s.length && d > 0) { if (s[k] === '{') d++; else if (s[k] === '}') d--; k++; }
    i = k;
  }
  return hasil;
}

const RE_GRADIEN = /(\.[^{}]+)\{--tw-gradient-position:([^;}]*?)\s+in\s+([a-z-]+)([;}])/g;
const gradienBermasalah = (css) => (tanpaSupports(css).match(/--tw-gradient-position:[^;}]*\sin\s[a-z-]+/g) || []).length;

function ubahGradien(css) {
  if (css.includes(PENANDA_GRADIEN)) return { css, jumlah: 0 };   // sudah diproses: idempoten
  const pulih = [];
  const baru = css.replace(RE_GRADIEN, (_semua, sel, arah, ruang, akhir) => {
    pulih.push({ sel, arah, ruang });
    return `${sel}{--tw-gradient-position:${arah}${akhir}`;
  });
  if (pulih.length === 0) return { css, jumlah: 0 };
  const perRuang = {};
  pulih.forEach((p) => { (perRuang[p.ruang] = perRuang[p.ruang] || []).push(p); });
  let blok = PENANDA_GRADIEN;
  Object.keys(perRuang).forEach((ruang) => {
    const aturan = perRuang[ruang].map((p) => `${p.sel}{--tw-gradient-position:${p.arah} in ${ruang}}`).join('');
    blok += `@layer utilities{@supports (background-image:linear-gradient(in ${ruang},red,red)){${aturan}}}`;
  });
  return { css: baru + blok, jumlah: pulih.length };
}

const asli = fs.readFileSync(berkas, 'utf8');
const sisa = (asli.match(/oklch\(/gi) || []).length;
const gradienSisa = gradienBermasalah(asli);
if (hanyaPeriksa) {
  if (sisa === 0 && gradienSisa === 0) { console.log(`OK  ${berkas}: tanpa oklch() dan tanpa interpolasi gradien "in <ruang>"`); process.exit(0); }
  console.log(`MASIH ADA di ${berkas}: ${sisa} oklch(), ${gradienSisa} gradien "in <ruang>" di luar @supports`);
  process.exit(1);
}
if (sisa === 0 && gradienSisa === 0) {
  console.log(`kompat-css: ${berkas} sudah kompatibel, tidak ada yang diubah.`);
  process.exit(0);
}
const hasilWarna = sisa > 0 ? ubah(asli) : asli;
const tersisa = (hasilWarna.match(/oklch\(/gi) || []).length;
if (tersisa > 0) {
  console.error(`kompat-css: GAGAL, ${tersisa} oklch() tidak dikenali formatnya; berkas tidak diubah.`);
  process.exit(1);
}
const hasilGradien = ubahGradien(hasilWarna);
if (gradienBermasalah(hasilGradien.css) > 0) {
  console.error('kompat-css: GAGAL, masih ada gradien "in <ruang>" di luar @supports; berkas tidak diubah.');
  process.exit(1);
}
fs.writeFileSync(berkas, hasilGradien.css);
console.log(`kompat-css: ${sisa} warna oklch() -> hex, ${hasilGradien.jumlah} gradien dipulihkan via @supports, di ${berkas}.`);
