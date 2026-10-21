// Pasca-build tailwind.css: ubah warna oklch() menjadi hex supaya tampil di Chrome/Edge lama.
//
// Tailwind v4 mendefinisikan SELURUH palet sebagai variabel `--color-xxx-nnn: oklch(...)` tanpa cadangan.
// Browser yang belum mengenal oklch (Chrome/Edge < 111, mis. Chrome 109 yang masih dipakai di Windows 7/8
// komputer kelurahan) menganggap variabelnya tidak valid, sehingga SETIAP warna palet hilang: latar tombol
// Simpan jadi transparan sedangkan tulisannya putih -> tombol tampak "tidak ada" (laporan Sidorejo,
// 2026-10-21; sebelumnya juga Asam Kumbang), garis tepi jadi hitam, dst.
//
// Pemakaian: node scripts/kompat-css.js [berkas.css]   (bawaan: public/css/tailwind.css). Aman dijalankan ulang.
// Dipanggil otomatis oleh `npm run build:css`. Opsi --periksa: hanya cek (exit 1 bila masih ada oklch()).
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

const asli = fs.readFileSync(berkas, 'utf8');
const sisa = (asli.match(/oklch\(/gi) || []).length;
if (hanyaPeriksa) {
  console.log(sisa === 0 ? `OK  ${berkas}: tanpa oklch()` : `MASIH ADA ${sisa} oklch() di ${berkas}`);
  process.exit(sisa === 0 ? 0 : 1);
}
if (sisa === 0) {
  console.log(`kompat-css: ${berkas} sudah tanpa oklch(), tidak ada yang diubah.`);
  process.exit(0);
}
const baru = ubah(asli);
const tersisa = (baru.match(/oklch\(/gi) || []).length;
if (tersisa > 0) {
  console.error(`kompat-css: GAGAL, ${tersisa} oklch() tidak dikenali formatnya; berkas tidak diubah.`);
  process.exit(1);
}
fs.writeFileSync(berkas, baru);
console.log(`kompat-css: ${sisa} warna oklch() -> hex di ${berkas}.`);
