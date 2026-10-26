// Uji logika dropdown Kelurahan pada dialog "Unduh Cover" (public/js/app-cover-berkas.js, bagian inti tanpa DOM).
// Plan: plans/plan-perbaikan-unduh-cover-dan-dropdown-kelurahan.md. Memuat modul APA ADANYA di Node (tanpa database/jaringan).
// Jalankan: npm run uji:cover     (Node 24+; data KARANGAN).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const akar = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
globalThis.window = globalThis;           // modul memasang dirinya ke `window`/`globalThis`
createRequire(import.meta.url)(path.join(akar, "public/js/app-cover-berkas.js"));
const C = globalThis.djpmCover;

// Data karangan: nama kelurahan KEMBAR "SEI MATI" di dua kecamatan; satu kelurahan kosong; spasi liar.
const R = (kec, kel, lay, nama) => ({ nama: nama || "P", nik: "1", kecamatan: kec, kelurahan: kel, layanan: lay });
const DATA = [
  R("MEDAN SELAYANG", "TANJUNG SARI", "IMAM MASJID", "A1"),
  R("MEDAN SELAYANG", "TANJUNG SARI", "GURU MAGHRIB MENGAJI", "A2"),
  R("MEDAN SELAYANG", "SEMPAKATA", "IMAM MASJID", "A3"),
  R("MEDAN MAIMUN", "SEI MATI", "IMAM MASJID", "B1"),
  R("MEDAN MAIMUN", "SEI MATI", "GURU MAGHRIB MENGAJI", "B2"),
  R("MEDAN LABUHAN", "SEI MATI", "IMAM MASJID", "C1"),
  R("MEDAN LABUHAN", "", "IMAM MASJID", "C2"),                     // kelurahan kosong
  R(" MEDAN SELAYANG ", " TANJUNG SARI ", " IMAM MASJID ", "A4"),  // spasi liar pada data
];
const nama = (daftar) => daftar.map((r) => r.nama).sort().join(",");

test("tanpa pilihan: semua baris (perilaku lama untuk Kecamatan dan Layanan tidak berubah)", () => {
  assert.equal(C.saringCover(DATA, "", "", "").length, DATA.length);
  assert.equal(nama(C.saringCover(DATA, "MEDAN SELAYANG", "", "")), "A1,A2,A3,A4");
  assert.equal(nama(C.saringCover(DATA, "", "", "GURU MAGHRIB MENGAJI")), "A2,B2");
  assert.equal(nama(C.saringCover(DATA, "MEDAN SELAYANG", "", "IMAM MASJID")), "A1,A3,A4");
});

test("daftar kelurahan dibatasi kecamatan terpilih dan hanya memuat yang ADA pada data", () => {
  const d = C.daftarKelurahan(DATA, "MEDAN SELAYANG");
  assert.deepEqual(d.map((o) => o.label), ["SEMPAKATA", "TANJUNG SARI"]);
  assert.deepEqual(d.map((o) => o.kec), ["MEDAN SELAYANG", "MEDAN SELAYANG"]);
  const kosong = C.daftarKelurahan(DATA, "KECAMATAN TAK ADA");
  assert.equal(kosong.length, 0);
});

test("Kecamatan 'Semua': nama kelurahan kembar diberi label kecamatan; yang unik tetap polos; kosong di akhir", () => {
  const d = C.daftarKelurahan(DATA, "");
  assert.deepEqual(d.map((o) => o.label), [
    "SEI MATI (MEDAN LABUHAN)", "SEI MATI (MEDAN MAIMUN)", "SEMPAKATA", "TANJUNG SARI", "(TANPA KELURAHAN)",
  ]);
  assert.equal(new Set(d.map((o) => o.nilai)).size, d.length, "nilai opsi unik");
});

test("kelurahan KEMBAR antar kecamatan TIDAK tercampur (kunci pasangan)", () => {
  const nilaiMaimun = C.kunciKelurahan("MEDAN MAIMUN", "SEI MATI");
  const nilaiLabuhan = C.kunciKelurahan("MEDAN LABUHAN", "SEI MATI");
  assert.notEqual(nilaiMaimun, nilaiLabuhan);
  assert.equal(nama(C.saringCover(DATA, "", nilaiMaimun, "")), "B1,B2");
  assert.equal(nama(C.saringCover(DATA, "", nilaiLabuhan, "")), "C1");
});

test("kelurahan + layanan digabung; kelurahan + kecamatan yang sesuai", () => {
  const tj = C.kunciKelurahan("MEDAN SELAYANG", "TANJUNG SARI");
  assert.equal(nama(C.saringCover(DATA, "", tj, "IMAM MASJID")), "A1,A4");
  assert.equal(nama(C.saringCover(DATA, "MEDAN SELAYANG", tj, "GURU MAGHRIB MENGAJI")), "A2");
  assert.equal(C.saringCover(DATA, "MEDAN MAIMUN", tj, "").length, 0, "kecamatan tidak cocok dengan pasangan -> kosong");
});

test("spasi liar pada data dirapikan (baris ' MEDAN SELAYANG ' ikut pasangan yang benar)", () => {
  const tj = C.kunciKelurahan("MEDAN SELAYANG", "TANJUNG SARI");
  assert.ok(C.saringCover(DATA, "", tj, "").some((r) => r.nama === "A4"));
  assert.equal(C.daftarKelurahan(DATA, "").filter((o) => o.kel === "TANJUNG SARI").length, 1, "tidak menggandakan karena spasi");
});

test("spasi liar pada baris PERTAMA tidak bocor ke label/nilai opsi (urutan data tidak boleh berpengaruh)", () => {
  const data = [R(" MEDAN SELAYANG ", "  TANJUNG SARI  ", "IMAM MASJID", "X1"), R("MEDAN SELAYANG", "TANJUNG SARI", "IMAM MASJID", "X2")];
  const d = C.daftarKelurahan(data, "");
  assert.equal(d.length, 1);
  assert.equal(d[0].label, "TANJUNG SARI");
  assert.equal(d[0].kel, "TANJUNG SARI");
  assert.equal(d[0].kec, "MEDAN SELAYANG");
  assert.equal(d[0].nilai, "MEDAN SELAYANG||TANJUNG SARI");
  assert.equal(C.daftarKelurahan(data, "  MEDAN SELAYANG ").length, 1, "pilihan kecamatan juga dirapikan");
  assert.equal(C.saringCover(data, "", d[0].nilai, "").length, 2);
});

test("kelurahan kosong dapat dipilih sendiri dan tidak hilang dari hasil", () => {
  const kosong = C.daftarKelurahan(DATA, "MEDAN LABUHAN").find((o) => o.kel === "");
  assert.ok(kosong);
  assert.equal(kosong.label, C.TEKS_TANPA_KELURAHAN);
  assert.equal(nama(C.saringCover(DATA, "", kosong.nilai, "")), "C2");
});

test("nilai kelurahan tak dikenal (bukan pasangan) menghasilkan DAFTAR KOSONG, bukan semua data", () => {
  assert.equal(C.saringCover(DATA, "", "SEI MATI", "").length, 0);
  assert.equal(C.saringCover(DATA, "", "tidak-ada-pemisah", "").length, 0);
  assert.equal(C.uraiKunciKelurahan("SEI MATI"), null);
  assert.deepEqual(C.uraiKunciKelurahan("A||B"), { kec: "A", kel: "B" });
  assert.deepEqual(C.uraiKunciKelurahan("A||B||C"), { kec: "A", kel: "B||C" }, "dipecah pada pemisah pertama");
});

test("jumlah dari daftarKelurahan = jumlah dari saringCover untuk setiap pilihan (ringkasan dialog konsisten)", () => {
  let total = 0;
  for (const o of C.daftarKelurahan(DATA, "")) total += C.saringCover(DATA, "", o.nilai, "").length;
  assert.equal(total, DATA.length, "setiap baris masuk tepat satu kelurahan");
});

test("pilihan satu-satunya: akun satu kelurahan hanya mendapat satu opsi", () => {
  const hanyaSatu = DATA.filter((r) => r.nama === "A1" || r.nama === "A2");
  assert.equal(C.daftarKelurahan(hanyaSatu, "").length, 1);
});

test("uraiPilihanCover: kelurahan terpilih membawa kecamatannya sendiri bila kecamatan 'Semua'", () => {
  assert.deepEqual(C.uraiPilihanCover("", C.kunciKelurahan("MEDAN MAIMUN", "SEI MATI")), { kec: "MEDAN MAIMUN", kelTeks: "SEI MATI" });
  assert.deepEqual(C.uraiPilihanCover("MEDAN LABUHAN", C.kunciKelurahan("MEDAN LABUHAN", "")), { kec: "MEDAN LABUHAN", kelTeks: "(TANPA KELURAHAN)" });
  assert.deepEqual(C.uraiPilihanCover("MEDAN SELAYANG", ""), { kec: "MEDAN SELAYANG", kelTeks: "" });
  assert.deepEqual(C.uraiPilihanCover("", ""), { kec: "", kelTeks: "" });
});

test("nama berkas memuat kecamatan, kelurahan, layanan, tanggal; 'SEMUA-...' bila kosong; karakter berbahaya dibersihkan", () => {
  assert.equal(C.namaDasarBerkas("", "", "", "2026-10-26"), "Cover-Berkas_SEMUA-KECAMATAN_SEMUA-KELURAHAN_SEMUA-LAYANAN_2026-10-26");
  assert.equal(C.namaDasarBerkas("MEDAN SELAYANG", "TANJUNG SARI", "IMAM MASJID", "2026-10-26"), "Cover-Berkas_MEDAN-SELAYANG_TANJUNG-SARI_IMAM-MASJID_2026-10-26");
  assert.equal(C.namaDasarBerkas("MEDAN LABUHAN", "(TANPA KELURAHAN)", "", "2026-10-26"), "Cover-Berkas_MEDAN-LABUHAN_TANPA-KELURAHAN_SEMUA-LAYANAN_2026-10-26");
  const n = C.namaDasarBerkas("A/B", "..\\..\\x:y*z?", "<>|", "2026-10-26");
  assert.ok(!/[\\/:*?"<>|]/.test(n), "tanpa karakter terlarang di nama berkas: " + n);
  assert.ok(C.namaDasarBerkas("K".repeat(100), "L".repeat(100), "M".repeat(100), "2026-10-26").length < 130);
});

test("ekspor lama tetap ada (tidak merusak pemakai djpmCover lainnya)", () => {
  for (const k of ["muatLogo", "bersihkanTeks", "gambarCover", "bangunPdf", "MAKS_HALAMAN_PER_BERKAS"]) assert.ok(k in C, k);
  assert.equal(C.MAKS_HALAMAN_PER_BERKAS, 150, "batas halaman per berkas tidak diubah");
});
