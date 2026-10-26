// Uji pemeriksa tanggal lahir di layar (public/js/validasi-tanggal-lahir.js) dan KESETARAANnya dengan server
// (supabase/functions/api/_shared/validasiPenerima.ts). Plan: plans/plan-perbaikan-validasi-data-penerima.md, bagian 5.3 dan 8.
// Jalankan: npm run uji:validasi-penerima     (Node 24+; tanpa dependensi, tanpa database).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { periksaTanggalLahir } from "../../supabase/functions/api/_shared/validasiPenerima.ts";

const layar = createRequire(import.meta.url)("../../public/js/validasi-tanggal-lahir.js");
const K = { tahunAktif: 2027, hariIni: "2026-10-26" };

test("kasus nyata: tahun 0199 ditolak dan tahun yang kehilangan digit ditolak dengan pesan 4 digit", () => {
  for (const t of ["0199-02-04", "04-02-0199", "04-02-199", "199-02-04", "04/02/89"]) {
    const h = layar.periksa(t, K);
    assert.equal(h.ok, false, t);
    assert.equal(h.jenis, "tidak_wajar", t);
    assert.match(h.pesan, /4 digit/);
  }
});

test("tanggal sah diterima dan dinormalkan", () => {
  for (const t of ["1989-02-04", "04-02-1989", "4-2-1989", "04/02/1989", " 1989-02-04 "]) {
    const h = layar.periksa(t, K);
    assert.deepEqual(h, { ok: true, iso: "1989-02-04", umur: 37 }, t);
  }
});

test("jenis penolakan: wajib, tidak_valid, tidak_wajar, di_bawah_umur", () => {
  assert.equal(layar.periksa("", K).jenis, "wajib");
  assert.equal(layar.periksa(null, K).jenis, "wajib");
  assert.equal(layar.periksa("1990-02-31", K).jenis, "tidak_valid");
  assert.equal(layar.periksa("abc", K).jenis, "tidak_valid");
  assert.equal(layar.periksa("2999-01-01", K).jenis, "tidak_wajar");
  assert.equal(layar.periksa("1925-06-15", K).jenis, "tidak_wajar");
  assert.equal(layar.periksa("2009-01-02", K).jenis, "di_bawah_umur");
  assert.equal(layar.periksa("2009-01-02", K).pesan, "Usia di bawah 18 tahun tidak memenuhi syarat.");
});

test("konstanta dikunci: 18, 100, 1900", () => {
  assert.equal(layar.UMUR_MIN, 18);
  assert.equal(layar.UMUR_MAKS, 100);
  assert.equal(layar.TAHUN_LAHIR_MIN, 1900);
});

test("tahun patokan umur mengikuti aplikasi (window._tahunAktifGetter) bila ada; nilai tak masuk akal diabaikan", () => {
  const sebelum = globalThis.self;
  try {
    globalThis.self = { _tahunAktifGetter: () => "2028" };   // app-core.js mengembalikan string
    assert.equal(layar.periksa("2010-01-01", { hariIni: "2026-10-26" }).ok, true);   // umur 18 pada 1 Jan 2028
    assert.equal(layar.periksa("2010-01-02", { hariIni: "2026-10-26" }).ok, false);  // masih 17
    globalThis.self = { _tahunAktifGetter: () => "abc" };
    assert.equal(layar.periksa("2009-01-01", { hariIni: "2026-10-26" }).umur, 18);   // kembali ke bawaan 2027
    globalThis.self = { _tahunAktifGetter: () => { throw new Error("rusak"); } };
    assert.equal(layar.periksa("2009-01-01", { hariIni: "2026-10-26" }).umur, 18);
    globalThis.self = { _tahunAktifGetter: () => "2028" };
    assert.equal(layar.periksa("2010-01-02", { tahunAktif: 2027, hariIni: "2026-10-26" }).ok, false, "opsi eksplisit menang atas getter");
  } finally {
    if (sebelum === undefined) delete globalThis.self; else globalThis.self = sebelum;
  }
});

test("tahun 0001-0099 dinilai 'tidak_wajar' (bukan 'tidak_valid'), sama dengan server", () => {
  for (const t of ["0089-02-04", "0000-01-01", "0001-01-01", "0099-12-31"]) {
    assert.equal(layar.periksa(t, K).jenis, "tidak_wajar", t);
  }
});

test("hariIniWIB berbentuk YYYY-MM-DD", () => {
  assert.match(layar.hariIniWIB(), /^\d{4}-\d{2}-\d{2}$/);
});

test("KESETARAAN layar vs server pada ribuan masukan: hasil ok, iso, umur sama; pesan sama (tanpa awalan 'GAGAL: ')", () => {
  const masukan = [];
  const bentuk = [
    (y, m, d) => `${y}-${m}-${d}`,
    (y, m, d) => `${d}-${m}-${y}`,
    (y, m, d) => `${d}/${m}/${y}`,
  ];
  const tahun = ["0001", "0199", "199", "1899", "1900", "1926", "1927", "1950", "1989", "2008", "2009", "2010", "2026", "2027", "2999", "19900", "89"];
  const bulan = ["1", "01", "2", "02", "12", "13", "0", "00"];
  const hari = ["1", "01", "2", "15", "28", "29", "30", "31", "32", "0"];
  for (const y of tahun) for (const m of bulan) for (const d of hari) for (const f of bentuk) masukan.push(f(y, m, d));
  masukan.push("", "   ", "abc", "1990", "1990-1", "1990-01-01-01", "01-01", "tanggal 1990-01-01", " 1989-02-04 ", "2026-10-26", "2026-10-27", "2009-01-01", "2009-01-02", "1927-01-01", "1926-01-01", "1926-12-31");
  let n = 0, ok = 0;
  for (const t of masukan) {
    const a = layar.periksa(t, K);
    const b = periksaTanggalLahir(t, K);
    assert.equal(a.ok, b.ok, `ok berbeda untuk "${t}"`);
    if (a.ok) {
      assert.equal(a.iso, b.iso, `iso berbeda untuk "${t}"`);
      assert.equal(a.umur, b.umur, `umur berbeda untuk "${t}"`);
      ok++;
    } else {
      assert.equal("GAGAL: " + a.pesan, b.pesan, `pesan berbeda untuk "${t}"`);
    }
    n++;
  }
  assert.ok(n > 4000, "jumlah masukan " + n);
  assert.ok(ok > 100, "terlalu sedikit kasus sah: " + ok);
});
