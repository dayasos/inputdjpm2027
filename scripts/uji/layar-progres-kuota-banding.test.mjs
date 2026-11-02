// Progres Kuota: kolom pembanding tahun sebelumnya di LAYAR (render murni, tanpa peramban). Plan: plans/plan-progres-kuota-banding-2026.md.
// Jalankan: npm run uji:progres-kuota. Fungsi diambil langsung dari public/js/app-admin.js (kode ASLI) lalu dijalankan di vm.
// Yang diuji: bentuk HTML dan aturan tampil. Tata letak sebenarnya (lebar HP, gulir) dicek manual di Chrome.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const sumber = fs.readFileSync(new URL("../../public/js/app-admin.js", import.meta.url), "utf8");
const awal = sumber.indexOf("function warnaProgresKuota");
const akhir = sumber.indexOf("function renderTabProgresKuota");
assert.ok(awal >= 0 && akhir > awal, "penanda fungsi Progres Kuota tidak ditemukan di app-admin.js");
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const R = vm.runInNewContext(
  sumber.slice(awal, akhir) + "; ({ bangun: bangunProgresKuotaHtml, selisih: htmlSelisihProgresKuota, atur: (v) => { bandingProgresKuota = v; } })",
  { esc },
);
const norm = (h) => h.replace(/\s+/g, " ").replace(/> </g, "><").trim();

// Sidik jari keluaran kode LAMA (sebelum kolom pembanding) untuk data ini; diambil dari commit sebelum perubahan.
const SIDIK_LAMA = "<div class=\"mb-6\"><div class=\"flex items-center justify-between bg-slate-800 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-t-lg gap-2\"><span class=\"text-xs sm:text-sm font-bold tracking-wide\">BILAL JENAZAH</span><span class=\"text-[11px] sm:text-xs font-bold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full whitespace-nowrap\" style=\"background:#eab308;color:#fff;\"> 67.9% &nbsp;(171/252) </span></div><div class=\"border border-t-0 border-slate-200 rounded-b-lg divide-y divide-slate-100\"><div class=\"flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5\"><span class=\"w-20 sm:w-32 shrink-0 text-xs font-semibold text-slate-700 truncate\" title=\"AMPLAS\">AMPLAS</span><div class=\"flex-1 h-4 rounded-full overflow-hidden\" style=\"background:#fefce8;border:1px solid #eab30833;\"><div class=\"h-full rounded-full\" style=\"width:73.8%;background:#eab308;\"></div></div><span class=\"w-11 sm:w-14 shrink-0 text-right text-xs font-bold\" style=\"color:#a16207;\">73.8%</span><span class=\"w-14 sm:w-16 shrink-0 text-right text-[10px] sm:text-[11px] text-slate-500\">93/126</span></div><div class=\"flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5\"><span class=\"w-20 sm:w-32 shrink-0 text-xs font-semibold text-slate-700 truncate\" title=\"BARAT\">BARAT</span><div class=\"flex-1 h-4 rounded-full overflow-hidden\" style=\"background:#fef2f2;border:1px solid #ef444433;\"><div class=\"h-full rounded-full\" style=\"width:8.9%;background:#ef4444;\"></div></div><span class=\"w-11 sm:w-14 shrink-0 text-right text-xs font-bold\" style=\"color:#b91c1c;\">8.9%</span><span class=\"w-14 sm:w-16 shrink-0 text-right text-[10px] sm:text-[11px] text-slate-500\">4/45</span></div></div></div>";
const grupLama = () => [{ layanan: "BILAL JENAZAH", totalKuota: 252, totalInput: 171, persenLayanan: 67.9, baris: [
  { kecamatan: "MEDAN AMPLAS", kuota: 126, input: 93, sisa: 33, persen: 73.8 },
  { kecamatan: "MEDAN BARAT", kuota: 45, input: 4, sisa: 41, persen: 8.9 }] }];
const grupBanding = () => [{ layanan: "BILAL JENAZAH", totalKuota: 252, totalInput: 171, persenLayanan: 67.9, total2026: 170, selisihTotal: 1, baris: [
  { kecamatan: "MEDAN AMPLAS", kuota: 126, input: 93, sisa: 33, persen: 73.8, input2026: 125, selisih: -32 },
  { kecamatan: "MEDAN BARAT", kuota: 45, input: 4, sisa: 41, persen: 8.9, input2026: 45, selisih: -41 },
  { kecamatan: "MEDAN AREA", kuota: 121, input: 121, sisa: 0, persen: 100, input2026: 121, selisih: 0 },
  { kecamatan: "MEDAN BARU", kuota: 41, input: 50, sisa: -9, persen: 122, input2026: 40, selisih: 10 }] }];
const hitung = (h, pola) => (h.match(pola) || []).length;

test("REGRESI: pembanding tidak ada (server lama) -> HTML SAMA dengan versi sebelum perubahan", () => {
  R.atur({ tersedia: undefined, tahun: null });
  assert.equal(norm(R.bangun(grupLama())), SIDIK_LAMA);
});

test("REGRESI: server melaporkan pembanding gagal -> baris sama seperti lama + satu catatan, tanpa kolom 2026", () => {
  R.atur({ tersedia: false, tahun: 2026 });
  const h = norm(R.bangun(grupLama()));
  assert.ok(h.startsWith(SIDIK_LAMA), "isi daftar tidak berubah");
  assert.match(h.slice(SIDIK_LAMA.length), /Data pembanding 2026 sedang tidak tersedia/);
  assert.equal(hitung(h, /hidden sm:flex w-24/g), 0);
});

test("TAMPIL: kepala menampilkan total 2026 dan selisihnya; tiap baris punya kolom paling kanan", () => {
  R.atur({ tersedia: true, tahun: 2026 });
  const h = R.bangun(grupBanding());
  assert.match(h, /2026: 170 <span[^>]*>▲1<\/span>/, "kepala layanan");
  assert.equal(hitung(h, /hidden sm:flex w-24/g), 4, "satu kolom kanan per baris (layar lebar)");
  assert.equal(hitung(h, /sm:hidden basis-full/g), 4, "satu baris kedua per baris (HP)");
  assert.match(h, />125<\/span>/, "angka 2026 Amplas");
});

test("SELISIH: negatif ▼, positif ▲, nol '= 0'; label dibaca pembaca layar; netral (tidak merah/hijau)", () => {
  R.atur({ tersedia: true, tahun: 2026 });
  const h = R.bangun(grupBanding());
  assert.match(h, /▼32/);
  assert.match(h, /aria-label="Lebih sedikit 32 dari 2026"/);
  assert.match(h, /▲10/);
  assert.match(h, /aria-label="Lebih banyak 10 dari 2026"/);
  assert.match(h, /= 0/);
  assert.match(h, /aria-label="Sama dengan 2026"/);
  const selisihHtml = [R.selisih(-5, "#475569"), R.selisih(5, "#475569"), R.selisih(0, "#475569")].join("");
  assert.ok(!/#(ef4444|b91c1c|15803d|16a34a|22c55e)/i.test(selisihHtml), "tanpa warna merah/hijau skala capaian");
});

test("SELISIH: null/undefined tidak menghasilkan apa pun (bukan 'NaN' atau 'undefined')", () => {
  R.atur({ tersedia: true, tahun: 2026 });
  assert.equal(R.selisih(null, "#000"), "");
  assert.equal(R.selisih(undefined, "#000"), "");
  const g = grupBanding(); g[0].baris[0].selisih = null; g[0].selisihTotal = null;
  const h = R.bangun(g);
  assert.ok(!/NaN|undefined|null/.test(h));
});

test("KETERANGAN: ada di bawah daftar, menyebut kuota 2026 tidak tersimpan (tanpa persen)", () => {
  R.atur({ tersedia: true, tahun: 2026 });
  const h = norm(R.bangun(grupBanding()));
  assert.match(h, /Kolom paling kanan = jumlah penerima tahun 2026 \(semua yang pernah tercatat\)/);
  assert.match(h, /Kuota 2026 tidak tersimpan, jadi tanpa persen/);
});

test("KOLOM LAMA TETAP: nama, batang, persen, input/kuota tetap ada pada mode pembanding", () => {
  R.atur({ tersedia: true, tahun: 2026 });
  const h = R.bangun(grupBanding());
  assert.match(h, /67\.9% &nbsp;\(171\/252\)/);
  assert.match(h, />93\/126<\/span>/);
  assert.match(h, />73\.8%<\/span>/);
  assert.match(h, /width:73\.8%/);
  assert.match(h, /width:100%/, "batang dipotong 100% tetap");
});

test("AMAN: nama layanan/kecamatan di-escape; daftar kosong tetap pesan lama", () => {
  R.atur({ tersedia: true, tahun: 2026 });
  const g = grupBanding(); g[0].layanan = "<img src=x onerror=alert(1)>";
  assert.ok(!R.bangun(g).includes("<img src=x"), "tidak ada HTML liar");
  assert.match(R.bangun([]), /Belum ada data kuota untuk kategori ini/);
});

test("TAHUN: label mengikuti tahun dari server (bukan angka 2026 tertulis tetap)", () => {
  R.atur({ tersedia: true, tahun: 2027 });
  const h = R.bangun(grupBanding());
  assert.match(h, /2027: 170/);
  assert.ok(!/2026/.test(h));
});
