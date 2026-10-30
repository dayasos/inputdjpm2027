// Logika MURNI Cek Alamat Tugas GMM (alur status, validasi, lingkup akses). Plan: plans/plan-cek-alamat-tugas-gmm.md.
// Jalankan: npm run uji:cek-alamat   (Node 24+, tanpa dependensi, tanpa database).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  idPositif, kecamatanDalamLingkup, lingkupAkun, samaAlamat, selesaiButuhCatatan, STATUS, statusValid,
  tempatTugasRumah, transisi, validasiAlamatBaru, validasiPesan, MAKS_ALAMAT, MAKS_PESAN,
} from "../../supabase/functions/api/_shared/cekAlamatInti.ts";

const klien = createRequire(import.meta.url)("../../public/js/pengingat-alamat-rumah.js");

const CONTOH_TEMPAT = [
  "RUMAH", "rumah", "  Rumah  ", "RMH", "rmh ", "RUMAH SENDIRI", "RUMAH TINGGAL", "RUMAH   PRIBADI", "RUMAH, JL. X", "Rumah Bapak Ali",
  "MASJID AL IKHLAS", "RUMAH IBADAH AL AMIN", "rumah ibadah", "RUMAH-IBADAH X", "RUMAH.IBADAH X", "RUMAH  /  IBADAH X", "RUMAHKU", "RUMAH2",
  "GEDUNG MADRASAH", "MUSHOLLA RUMAH SAKIT", "PERUMAHAN", "", "   ", null, undefined, "RMHKU", "RMH2", "MUSHOLLA AL", "TPU GANG PUSARA",
];

test("KESETARAAN: aturan tempat tugas RUMAH di server = di browser (pengingat-alamat-rumah.js) untuk semua contoh", () => {
  for (const t of CONTOH_TEMPAT) assert.equal(tempatTugasRumah(t), klien.tempatTugasRumah(t), JSON.stringify(t));
});

test("tempat tugas RUMAH: yang ya dan yang bukan", () => {
  for (const t of ["RUMAH", " rmh ", "RUMAH SENDIRI", "Rumah Bapak Ali"]) assert.equal(tempatTugasRumah(t), true, t);
  for (const t of ["RUMAH IBADAH X", "RUMAH-IBADAH X", "RUMAHKU", "PERUMAHAN", "", null, undefined, "MASJID"]) assert.equal(tempatTugasRumah(t), false, String(t));
});

test("samaAlamat: abaikan huruf/spasi/tanda baca; kosong tidak pernah sama", () => {
  assert.equal(samaAlamat("JL. TAPIAN NAULI NO 96 F", "jl tapian nauli no.96 f"), true);
  assert.equal(samaAlamat("JL. MANDOR NO 1", "JL. MADIO SANTOSO NO 1"), false);
  assert.equal(samaAlamat("", ""), false);
  assert.equal(samaAlamat(null, undefined), false);
  assert.equal(samaAlamat("JL X", ""), false);
});

test("lingkupAkun: hanya UTAMA dan GMM; peran lain null; GMM tanpa kecamatan = se-Kota", () => {
  assert.deepEqual(lingkupAkun("UTAMA", ""), { peran: "UTAMA", kecamatan: "" });
  assert.deepEqual(lingkupAkun(" utama ", "MEDAN BARAT"), { peran: "UTAMA", kecamatan: "" }, "UTAMA tidak dibatasi kecamatan");
  assert.deepEqual(lingkupAkun("GURU MAGHRIB MENGAJI", " medan  labuhan "), { peran: "GMM", kecamatan: "MEDAN LABUHAN" });
  assert.deepEqual(lingkupAkun("GURU MAGHRIB MENGAJI", ""), { peran: "GMM", kecamatan: "" });
  assert.deepEqual(lingkupAkun("GURU MAGHRIB MENGAJI", null), { peran: "GMM", kecamatan: "" });
  for (const r of ["KECAMATAN", "MUI", "GURU SEKOLAH MINGGU", "IMAM MASJID", "BILAL JENAZAH", "", null, undefined, "GURU MAGHRIB", "UTAMA2", "ADMIN"]) {
    assert.equal(lingkupAkun(r, "MEDAN KOTA"), null, String(r));
  }
});

test("kecamatanDalamLingkup", () => {
  const gmm = { peran: "GMM", kecamatan: "MEDAN LABUHAN" };
  assert.equal(kecamatanDalamLingkup(gmm, "medan labuhan "), true);
  assert.equal(kecamatanDalamLingkup(gmm, "MEDAN DENAI"), false);
  assert.equal(kecamatanDalamLingkup(gmm, ""), false);
  assert.equal(kecamatanDalamLingkup(gmm, null), false);
  assert.equal(kecamatanDalamLingkup({ peran: "GMM", kecamatan: "" }, "MEDAN DENAI"), true, "se-Kota: semua");
  assert.equal(kecamatanDalamLingkup({ peran: "UTAMA", kecamatan: "" }, null), true);
});

test("validasiAlamatBaru: dirapikan HURUF BESAR; batas panjang; harus memuat huruf; tanpa karakter kendali", () => {
  assert.deepEqual(validasiAlamatBaru("  jl.  mandor   no 5 "), { ok: true, alamat: "JL. MANDOR NO 5" });
  for (const x of ["", "    ", "JL", "1234567", "12-34/56", null, undefined, 5, {}, "JL\u0000MANDOR", "JL MANDOR\u0007 5", "x".repeat(MAKS_ALAMAT + 1)]) {
    assert.equal(validasiAlamatBaru(x).ok, false, JSON.stringify(x));
  }
  assert.equal(validasiAlamatBaru("A".repeat(MAKS_ALAMAT)).ok, true);
  assert.equal(validasiAlamatBaru("JL A").ok, false, "kurang dari 5 karakter");
  assert.equal(validasiAlamatBaru("JL AB").ok, true);
});

test("validasiPesan: wajib/tidak wajib, batas, karakter kendali; baris baru diperbolehkan", () => {
  assert.deepEqual(validasiPesan(undefined, { wajib: false }), { ok: true, isi: "" });
  assert.deepEqual(validasiPesan(null, { wajib: false }), { ok: true, isi: "" });
  assert.equal(validasiPesan("", { wajib: true }).ok, false);
  assert.equal(validasiPesan("abcd", { wajib: true }).ok, false);
  assert.equal(validasiPesan("abcde", { wajib: true }).ok, true);
  assert.equal(validasiPesan("a".repeat(MAKS_PESAN), { wajib: false }).ok, true);
  assert.equal(validasiPesan("a".repeat(MAKS_PESAN + 1), { wajib: false }).ok, false);
  assert.equal(validasiPesan("baris 1\nbaris 2", { wajib: true }).ok, true);
  assert.equal(validasiPesan("ada\u0000nul", { wajib: false }).ok, false);
  assert.equal(validasiPesan(123, { wajib: false }).ok, false);
  assert.equal(validasiPesan({ a: 1 }, { wajib: false }).ok, false);
});

test("idPositif: hanya bilangan bulat positif aman (angka atau teks angka)", () => {
  assert.equal(idPositif(5), 5);
  assert.equal(idPositif("12"), 12);
  assert.equal(idPositif(" 7 "), 7);
  for (const x of [0, -1, 1.5, "0", "-3", "1e3", "abc", "", null, undefined, NaN, Infinity, "9".repeat(20), {}, [], true, "1 OR 1=1"]) {
    assert.equal(idPositif(x), null, JSON.stringify(x));
  }
});

// ---- ALUR STATUS: tabel harapan ditulis TERPISAH dari kode (diturunkan dari plan, bagian 5) ----
const AKSI = ["JAWAB_BENAR", "JAWAB_TIDAK_PASTI", "JAWAB_DIPERBAIKI", "BALAS", "KEMBALIKAN", "SELESAI"];
const PERAN = ["UTAMA", "GMM"];
function harapan(aksi, peran, status) {
  if (aksi.startsWith("JAWAB_")) {
    if (peran !== "GMM") return null;
    if (status !== "BELUM" && status !== "DIKEMBALIKAN") return null;
    return { status: { JAWAB_BENAR: "SUDAH_BENAR", JAWAB_TIDAK_PASTI: "TIDAK_PASTI", JAWAB_DIPERBAIKI: "DIPERBAIKI" }[aksi], menunggu: "UTAMA" };
  }
  if (aksi === "BALAS") return status === "SELESAI" ? null : { status, menunggu: peran === "GMM" ? "UTAMA" : "GMM" };
  if (aksi === "KEMBALIKAN") {
    if (peran !== "UTAMA") return null;
    return ["SUDAH_BENAR", "DIPERBAIKI", "TIDAK_PASTI", "SELESAI"].includes(status) ? { status: "DIKEMBALIKAN", menunggu: "GMM" } : null;
  }
  if (aksi === "SELESAI") return peran === "UTAMA" && status !== "SELESAI" ? { status: "SELESAI", menunggu: null } : null;
  throw new Error("aksi?");
}

test("TRANSISI: seluruh kombinasi aksi x peran x status sesuai tabel harapan (6 x 2 x 6 = 72)", () => {
  let n = 0;
  for (const aksi of AKSI) for (const peran of PERAN) for (const status of STATUS) {
    const h = harapan(aksi, peran, status);
    const t = transisi(aksi, peran, status);
    n++;
    if (h === null) assert.equal(t.ok, false, `${aksi}/${peran}/${status} seharusnya DITOLAK`);
    else {
      assert.equal(t.ok, true, `${aksi}/${peran}/${status} seharusnya BOLEH`);
      assert.deepEqual({ status: t.status, menunggu: t.menunggu }, h, `${aksi}/${peran}/${status}`);
    }
  }
  assert.equal(n, 72);
});

test("TRANSISI: invarian -- SELESAI tepat bila tidak ada yang ditunggu (sesuai batasan basis data); penolakan selalu berpesan", () => {
  for (const aksi of AKSI) for (const peran of PERAN) for (const status of STATUS) {
    const t = transisi(aksi, peran, status);
    if (t.ok) assert.equal(t.status === "SELESAI", t.menunggu === null, `${aksi}/${peran}/${status}`);
    else assert.ok(typeof t.pesan === "string" && t.pesan.length > 10, `${aksi}/${peran}/${status}`);
  }
});

test("TRANSISI: skenario lengkap dua arah (buka -> tanya -> jawab -> kembalikan -> jawab -> selesai -> buka ulang)", () => {
  let s = { status: "BELUM", menunggu: "GMM" };
  const ikuti = (aksi, peran) => {
    const t = transisi(aksi, peran, s.status);
    assert.equal(t.ok, true, `${aksi}/${peran} dari ${s.status}`);
    s = { status: t.status, menunggu: t.menunggu };
  };
  ikuti("BALAS", "GMM");            assert.deepEqual(s, { status: "BELUM", menunggu: "UTAMA" });
  ikuti("BALAS", "UTAMA");          assert.deepEqual(s, { status: "BELUM", menunggu: "GMM" });
  ikuti("JAWAB_BENAR", "GMM");      assert.deepEqual(s, { status: "SUDAH_BENAR", menunggu: "UTAMA" });
  ikuti("KEMBALIKAN", "UTAMA");     assert.deepEqual(s, { status: "DIKEMBALIKAN", menunggu: "GMM" });
  ikuti("JAWAB_DIPERBAIKI", "GMM"); assert.deepEqual(s, { status: "DIPERBAIKI", menunggu: "UTAMA" });
  ikuti("SELESAI", "UTAMA");        assert.deepEqual(s, { status: "SELESAI", menunggu: null });
  assert.equal(transisi("BALAS", "GMM", "SELESAI").ok, false);
  ikuti("KEMBALIKAN", "UTAMA");     assert.deepEqual(s, { status: "DIKEMBALIKAN", menunggu: "GMM" }, "dibuka ulang");
});

test("selesaiButuhCatatan: hanya saat belum ada jawaban (BELUM, DIKEMBALIKAN); statusValid", () => {
  for (const st of STATUS) assert.equal(selesaiButuhCatatan(st), st === "BELUM" || st === "DIKEMBALIKAN", st);
  for (const st of STATUS) assert.equal(statusValid(st), true);
  for (const x of ["", "belum", "SELESAI ", null, undefined, 1, "DROP"]) assert.equal(statusValid(x), false, String(x));
});
