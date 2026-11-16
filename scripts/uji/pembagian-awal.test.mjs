// Uji pembagian Verifikasi Awal (modul murni). Rencana: plans/plan-verifikasi-awal-bagi-rata.md bagian 6
// Jalankan: npm run uji:pembagian-awal     (Node 24+)
import test from "node:test";
import assert from "node:assert/strict";
import { bagiTugasAwal, saringPemeriksa, titikAwalAkunBaru } from "../../supabase/functions/api/_shared/pembagianAwal.ts";
import { buatAcak } from "../../supabase/functions/api/_shared/pembagianUlang.ts";

const LAY = ["GURU SEKOLAH MINGGU", "GURU MAGHRIB MENGAJI", "IMAM MASJID", "PENDETA"];
const akunSama = (n, awal = 0) => Array.from({ length: n }, (_, i) => ({ username: "verif_p" + String(i + 1).padStart(2, "0"), jumlah: awal, perLayanan: {} }));
function kolam(n, mulai = 1, benih = "k") {
  const a = buatAcak(benih);
  return Array.from({ length: n }, (_, i) => ({ id: mulai + i, tahun: 2027, layanan: LAY[Math.floor(a() * LAY.length)] }));
}
const jumlahPer = (h) => h.jumlahAkhir;

test("DARI KEADAAN SEIMBANG: selisih paling banyak 1, berapa pun jumlah datanya", () => {
  for (const n of [0, 1, 27, 28, 29, 100, 1715]) {
    const h = bagiTugasAwal({ benih: "b", kolam: kolam(n), akun: akunSama(28) });
    assert.equal(h.tugas.length, n);
    assert.ok(h.selisih <= 1, "n=" + n + " selisih=" + h.selisih);
  }
});

test("DATA NYATA 2026-11-16: 28 akun dengan jumlah awal timpang + 1715 data -> semua 105 atau 106", () => {
  const awal = [106, 103, 90, 87, 76, 67, 66, 63, 51, 51, 50, 50, 50, 50, 50, 42, 39, 25, 23, 22, 19, 18, 15, 15, 14, 1, 0, 0];
  const akun = awal.map((j, i) => ({ username: "verif_x" + String(i).padStart(2, "0"), jumlah: j, perLayanan: {} }));
  const h = bagiTugasAwal({ benih: "nyata", kolam: kolam(1715), akun });
  const nilai = Object.values(jumlahPer(h));
  assert.equal(nilai.reduce((a, b) => a + b, 0), 1243 + 1715);
  assert.ok(nilai.every((v) => v === 105 || v === 106), "semua 105/106: " + nilai.join(","));
  assert.equal(nilai.filter((v) => v === 106).length, 18);
});

test("AKUN YANG SUDAH TINGGI TIDAK MENERIMA SELAMA YANG LAIN BELUM MENYUSUL", () => {
  const akun = [{ username: "tinggi", jumlah: 100 }, { username: "r1", jumlah: 10 }, { username: "r2", jumlah: 10 }];
  const h = bagiTugasAwal({ benih: "t", kolam: kolam(120), akun });
  assert.equal(h.tugas.filter((t) => t.akun === "tinggi").length, 0, "tinggi tidak menerima apa pun sebelum yang lain mencapai 100");
  assert.equal(h.tugas.filter((t) => t.akun === "r1").length + h.tugas.filter((t) => t.akun === "r2").length, 120);
});

test("INKREMENTAL: membagi satu per satu memberi hasil seimbang (selisih tetap <= 1 selamanya)", () => {
  let akun = akunSama(28);
  let id = 1;
  for (let putaran = 0; putaran < 200; putaran++) {
    const n = 1 + (putaran * 7) % 30;
    const h = bagiTugasAwal({ benih: "p" + putaran, kolam: kolam(n, id, "q" + putaran), akun });
    id += n;
    assert.ok(h.selisih <= 1, "putaran " + putaran + " selisih " + h.selisih);
    // teruskan keadaan (jumlah + per layanan) seperti yang dibaca server dari basis data
    akun = akun.map((a) => {
      const mine = h.tugas.filter((t) => t.akun === a.username);
      const per = { ...a.perLayanan };
      for (const t of mine) per[t.layanan.toUpperCase()] = (per[t.layanan.toUpperCase()] || 0) + 1;
      return { username: a.username, jumlah: h.jumlahAkhir[a.username], perLayanan: per };
    });
  }
});

test("DETERMINISTIK: benih + keadaan sama -> hasil sama persis; urutan masukan akun tidak berpengaruh; benih lain -> berbeda", () => {
  const k = kolam(300);
  const a = akunSama(28);
  const h1 = bagiTugasAwal({ benih: "x", kolam: k, akun: a });
  const h2 = bagiTugasAwal({ benih: "x", kolam: k.slice().reverse(), akun: a.slice().reverse() });
  assert.deepEqual(h1.tugas, h2.tugas);
  const h3 = bagiTugasAwal({ benih: "y", kolam: k, akun: a });
  assert.notDeepEqual(h1.tugas.map((t) => t.akun), h3.tugas.map((t) => t.akun));
});

test("PEMECAH SERI PER LAYANAN: tiap layanan tersebar rata (selisih per layanan antar akun kecil)", () => {
  const h = bagiTugasAwal({ benih: "lay", kolam: kolam(2800, 1, "lay"), akun: akunSama(28) });
  for (const l of LAY) {
    const per = {};
    for (const t of h.tugas) if (t.layanan === l) per[t.akun] = (per[t.akun] || 0) + 1;
    const nilai = Object.values(per);
    const total = h.tugas.filter((t) => t.layanan === l).length;
    assert.ok(Math.max(...nilai) - Math.min(...nilai) <= 3, l + " total " + total + " selisih " + (Math.max(...nilai) - Math.min(...nilai)));
  }
});

test("SARING PEMERIKSA: pengecualian tidak lolos (tanpa peduli huruf), akun lain utuh", () => {
  const r = saringPemeriksa(["verif_a", "VERIF_RONALD_FREDY", "verif_uga_deba", "verif_b"], ["verif_ronald_fredy", "verif_uga_deba"]);
  assert.deepEqual(r, ["verif_a", "verif_b"]);
});

test("TITIK AWAL AKUN BARU: jumlah terkecil akun lain; tanpa akun lain 0", () => {
  assert.equal(titikAwalAkunBaru([106, 90, 12, 50]), 12);
  assert.equal(titikAwalAkunBaru([]), 0);
});

test("TANPA AKUN atau TANPA DATA: aman, tidak melempar", () => {
  assert.deepEqual(bagiTugasAwal({ benih: "a", kolam: kolam(5), akun: [] }).tugas, []);
  assert.equal(bagiTugasAwal({ benih: "a", kolam: [], akun: akunSama(3) }).tugas.length, 0);
});
