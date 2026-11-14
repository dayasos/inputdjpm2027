// Uji pembagian tugas verifikasi ulang (modul murni). Rencana: plans/plan-verifikasi-ulang.md bagian 5
// Jalankan: npm run uji:pembagian-ulang     (Node 24+)
import test from "node:test";
import assert from "node:assert/strict";
import { bagiTugasUlang, samaDenganTersimpan, layakMasukKolam, buatAcak } from "../../supabase/functions/api/_shared/pembagianUlang.ts";

const PIMPINAN = ["verif_ronald_fredy", "verif_fery_suhery", "verif_khoiruddin", "verif_amy_pratiwi", "verif_netty_abdiati"];
const KHUSUS = "verif_uga_deba";
const LAYANAN = ["IMAM MASJID", "GURU MENGAJI", "PENDETA", "USTADZ"];
const pemeriksa = (n) => Array.from({ length: n }, (_, i) => "verif_p" + String(i + 1).padStart(2, "0"));

function kolam(n, { btl = 0, tms = 0, verif = {}, benih = 1 } = {}) {
  const acak = buatAcak("kolam" + benih);
  const hasil = [];
  for (let i = 1; i <= n; i++) {
    hasil.push({ id: i, tahun: 2027, layanan: LAYANAN[Math.floor(acak() * LAYANAN.length)], status: "Memenuhi Syarat", pernahMemverifikasi: verif[i] || [] });
  }
  for (let i = 0; i < btl; i++) hasil.push({ id: 10000 + i, tahun: 2027, layanan: LAYANAN[i % 4], status: "Berkas Tidak Lengkap", pernahMemverifikasi: [] });
  for (let i = 0; i < tms; i++) hasil.push({ id: 20000 + i, tahun: 2027, layanan: LAYANAN[i % 4], status: "Tidak Memenuhi Syarat", pernahMemverifikasi: [] });
  return hasil;
}
const masukan = (k, benih = "benih-A", pem = pemeriksa(28)) => ({ benih, kolam: k, pemeriksa: pem.concat(PIMPINAN, [KHUSUS]), pengecualian: PIMPINAN, akunKhusus: KHUSUS });

test("DETERMINISTIK: benih sama -> pembagian sama persis; benih berbeda -> berbeda", () => {
  const k = kolam(500, { btl: 10 });
  const a = bagiTugasUlang(masukan(k, "A"));
  const b = bagiTugasUlang(masukan(k, "A"));
  assert.deepEqual(a.tugas, b.tugas);
  const c = bagiTugasUlang(masukan(k, "B"));
  assert.notDeepEqual(a.tugas.map((t) => t.akun), c.tugas.map((t) => t.akun));
  // urutan daftar pemeriksa / kolam di masukan tidak memengaruhi hasil
  const acakUrut = { ...masukan(k, "A"), pemeriksa: masukan(k, "A").pemeriksa.slice().reverse(), kolam: k.slice().reverse() };
  assert.deepEqual(bagiTugasUlang(acakUrut).tugas, a.tugas);
});

test("±1: selisih jumlah data MS antar pemeriksa paling banyak 1 (banyak ukuran kolam)", () => {
  for (const n of [1, 7, 28, 29, 100, 277, 1000, 7733]) {
    const h = bagiTugasUlang(masukan(kolam(n, { benih: n })));
    assert.ok(h.selisihMS <= 1, "n=" + n + " selisih=" + h.selisihMS);
    assert.equal(h.tugas.length, n);
    assert.equal(h.tidakTerbagi.length, 0);
  }
});

test("TANPA DUPLIKAT dan SEMUA data terbagi tepat satu kali", () => {
  const k = kolam(2000, { btl: 40, tms: 3 });
  const h = bagiTugasUlang(masukan(k));
  const kunciSet = new Set(h.tugas.map((t) => t.tahun + ":" + t.id));
  assert.equal(kunciSet.size, h.tugas.length);
  assert.equal(h.tugas.length + h.tidakTerbagi.length, k.length);
});

test("V11: akun pimpinan tidak pernah menerima tugas, walau ada di daftar pemeriksa", () => {
  const h = bagiTugasUlang(masukan(kolam(3000, { btl: 20 })));
  for (const p of PIMPINAN) assert.equal(h.perAkun[p.toUpperCase()] || 0, 0, p);
  assert.equal(Object.keys(h.perAkun).filter((u) => PIMPINAN.map((x) => x.toUpperCase()).includes(u)).length, 0);
});

test("V10 + K16: BTL/TMS hanya ke akun khusus; akun khusus tidak ikut bagian MS", () => {
  const k = kolam(900, { btl: 50, tms: 5 });
  const h = bagiTugasUlang(masukan(k));
  for (const t of h.tugas) {
    if (t.status === "Memenuhi Syarat") assert.notEqual(t.akun, KHUSUS.toUpperCase(), "akun khusus tidak boleh dapat data MS");
    else assert.equal(t.akun, KHUSUS.toUpperCase(), "BTL/TMS harus ke akun khusus");
  }
  assert.equal(h.perAkun[KHUSUS.toUpperCase()], 55);
  assert.equal(h.selisihMS <= 1, true);
});

test("V10: tanpa akun khusus, data BTL/TMS tidak dibagi (dilaporkan, bukan dilempar ke orang lain)", () => {
  const m = { ...masukan(kolam(50, { btl: 4 })), akunKhusus: null };
  const h = bagiTugasUlang(m);
  assert.equal(h.tidakTerbagi.length, 4);
  assert.equal(h.tugas.filter((t) => t.status !== "Memenuhi Syarat").length, 0);
});

test("V10: akun khusus yang ternyata pemverifikasi pertama -> tidak dibagi", () => {
  const k = kolam(5, { btl: 3 });
  k.find((b) => b.id === 10001).pernahMemverifikasi = [KHUSUS.toUpperCase()];
  const h = bagiTugasUlang(masukan(k));
  assert.deepEqual(h.tidakTerbagi.map((x) => x.id), [10001]);
});

test("V1: pemeriksa tidak pernah pemverifikasi pertama data itu (kasus berat: 1 orang memverifikasi ratusan data)", () => {
  const p = pemeriksa(28);
  const verif = {};
  const k = kolam(2000);
  // p01 memverifikasi 40% data, p02 memverifikasi 20%
  k.forEach((b, i) => { if (i % 5 < 2) b.pernahMemverifikasi = [p[0].toUpperCase()]; else if (i % 5 === 2) b.pernahMemverifikasi = [p[1].toUpperCase()]; });
  void verif;
  const h = bagiTugasUlang(masukan(k, "V1", p));
  const asli = new Map(k.map((b) => [b.id, b.pernahMemverifikasi]));
  for (const t of h.tugas) assert.ok(!asli.get(t.id).includes(t.akun), "data " + t.id + " jatuh ke pemverifikasinya " + t.akun);
  assert.ok(h.selisihMS <= 1, "selisih " + h.selisihMS);
  assert.equal(h.tidakTerbagi.length, 0);
});

test("V1: data yang dahulu diverifikasi BEBERAPA orang tidak jatuh ke salah satunya", () => {
  const p = pemeriksa(5);
  const k = kolam(100);
  k.forEach((b) => { b.pernahMemverifikasi = [p[0].toUpperCase(), p[1].toUpperCase()]; });
  const h = bagiTugasUlang(masukan(k, "multi", p));
  for (const t of h.tugas) assert.ok(![p[0].toUpperCase(), p[1].toUpperCase()].includes(t.akun));
  assert.equal(h.tugas.length, 100);
});

test("V1: bila semua calon adalah pemverifikasinya, data dilaporkan tidak terbagi (bukan dipaksa)", () => {
  const p = pemeriksa(2);
  const k = kolam(4);
  k[0].pernahMemverifikasi = p.map((x) => x.toUpperCase());
  const h = bagiTugasUlang({ benih: "x", kolam: k, pemeriksa: p, pengecualian: [], akunKhusus: null });
  assert.deepEqual(h.tidakTerbagi.map((x) => x.id), [1]);
  assert.equal(h.tugas.length, 3);
});

test("KOLAM KOSONG dan TANPA PEMERIKSA tidak melempar galat", () => {
  assert.equal(bagiTugasUlang(masukan([])).tugas.length, 0);
  const h = bagiTugasUlang({ benih: "x", kolam: kolam(3), pemeriksa: [], pengecualian: [], akunKhusus: null });
  assert.equal(h.tidakTerbagi.length, 3);
});

test("Akun khusus yang sekaligus pengecualian ditolak (konfigurasi salah)", () => {
  assert.throws(() => bagiTugasUlang({ benih: "x", kolam: kolam(3), pemeriksa: pemeriksa(3), pengecualian: [KHUSUS], akunKhusus: KHUSUS }));
});

test("HURUF BESAR/KECIL username tidak memengaruhi pengecualian dan V1", () => {
  const p = ["Verif_A", "verif_b", "VERIF_C"];
  const k = kolam(30);
  k.forEach((b) => (b.pernahMemverifikasi = ["verif_a"]));
  const h = bagiTugasUlang({ benih: "x", kolam: k, pemeriksa: p, pengecualian: ["VERIF_C"], akunKhusus: null });
  assert.deepEqual(Object.keys(h.perAkun).sort(), ["VERIF_B"]);
});

test("KEADILAN PER LAYANAN: tiap pemeriksa mendapat campuran layanan yang kira-kira sama", () => {
  const h = bagiTugasUlang(masukan(kolam(7733, { benih: 9 })));
  for (const lay of LAYANAN) {
    const jum = Object.values(h.perLayananPerAkun[lay]);
    const total = jum.reduce((a, b) => a + b, 0);
    const rata = total / 28;
    for (const j of jum) assert.ok(Math.abs(j - rata) <= 3, lay + ": " + j + " vs rata " + rata.toFixed(1));
  }
});

test("CEK ULANG: pembagian tersimpan sama; satu penugasan diubah -> terdeteksi", () => {
  const m = masukan(kolam(300, { btl: 5 }));
  const h = bagiTugasUlang(m);
  assert.equal(samaDenganTersimpan(m, h.tugas).sama, true);
  const rusak = h.tugas.map((t) => ({ ...t }));
  rusak[7].akun = rusak[8].akun === rusak[7].akun ? "ORANG_LAIN" : rusak[8].akun;
  const cek = samaDenganTersimpan(m, rusak);
  assert.equal(cek.sama, false);
  assert.ok(cek.selisih >= 1);
  assert.equal(samaDenganTersimpan(m, h.tugas.slice(1)).sama, false, "tugas hilang terdeteksi");
});

test("KEBIJAKAN KOLAM: yang pernah diperiksa ulang tidak ikut kecuali dipilih; yang sedang ditugaskan tidak pernah", () => {
  const opsi = { sertakanSudahDiperiksa: false, statusDiizinkan: ["Memenuhi Syarat"] };
  const dasar = { status: "Memenuhi Syarat", sudahDiperiksaUlang: false, sedangDitugaskan: false };
  assert.equal(layakMasukKolam(dasar, opsi), true);
  assert.equal(layakMasukKolam({ ...dasar, sudahDiperiksaUlang: true }, opsi), false);
  assert.equal(layakMasukKolam({ ...dasar, sudahDiperiksaUlang: true }, { ...opsi, sertakanSudahDiperiksa: true }), true);
  assert.equal(layakMasukKolam({ ...dasar, sedangDitugaskan: true }, { ...opsi, sertakanSudahDiperiksa: true }), false);
  assert.equal(layakMasukKolam({ ...dasar, status: "Proses Verifikasi" }, opsi), false);
});

// Pembanding mandiri (brute force): apakah ada penugasan ±1 tanpa melanggar V1?
function adaPenugasanLayak(p, kolamKecil) {
  const hit = new Array(p.length).fill(0);
  const rek = (i) => {
    if (i === kolamKecil.length) return Math.max(...hit) - Math.min(...hit) <= 1;
    for (let k = 0; k < p.length; k++) {
      if (kolamKecil[i].pernahMemverifikasi.includes(p[k])) continue;
      hit[k]++;
      const ok = rek(i + 1);
      hit[k]--;
      if (ok) return true;
    }
    return false;
  };
  return rek(0);
}

test("±1 TERCAPAI SELALU bila memang mungkin (dibuktikan dengan pembanding brute force, ribuan kasus kecil dengan banyak benturan V1)", () => {
  const r = buatAcak("sifat-acak");
  let layakDiuji = 0;
  for (let u = 0; u < 4000; u++) {
    const np = 3 + Math.floor(r() * 3), nb = 6 + Math.floor(r() * 7);
    const p = Array.from({ length: np }, (_, i) => "P" + i);
    const k = Array.from({ length: nb }, (_, i) => ({ id: i + 1, tahun: 2027, layanan: "L" + (i % 2), status: "Memenuhi Syarat", pernahMemverifikasi: r() < 0.6 ? [p[Math.floor(r() * 2)]] : [] }));
    const h = bagiTugasUlang({ benih: "s" + u, kolam: k, pemeriksa: p, pengecualian: [], akunKhusus: null });
    // V1 tidak pernah dilanggar
    const asli = new Map(k.map((b) => [b.id, b.pernahMemverifikasi]));
    for (const t of h.tugas) assert.ok(!asli.get(t.id).includes(t.akun));
    if (adaPenugasanLayak(p, k)) {
      layakDiuji++;
      assert.ok(h.selisihMS <= 1 && h.tidakTerbagi.length === 0, "kasus " + u + ": layak tetapi selisih " + h.selisihMS);
    }
  }
  assert.ok(layakDiuji > 500, "terlalu sedikit kasus layak yang diuji: " + layakDiuji);
});
