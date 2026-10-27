// Uji penautan penerima.rumah_ibadah_id (plan: plans/plan-penautan-rumah-ibadah-id.md, F3): server menentukan ID sendiri saat
// simpan baru, edit data, dan Kelola Data; ID dikosongkan bila tempat tugas bukan rumah ibadah terdaftar; edit kolom lain tidak
// menyentuh tautan. Menjalankan kode server APA ADANYA (dibundel; tanpa Deno) dengan database tiruan; data KARANGAN.
// Jalankan: npm run uji:tautan-ri     (Node 24+)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, muatServer } from "./_harness-server.mjs";
import { muatWilayahTugas } from "./_harness-wilayah.mjs";

const penerima = await muatServer("supabase/functions/api/domains/penerima.ts");
const kelola = await muatServer("supabase/functions/api/domains/kelolaData.ts");
const { pilihRumahIbadahId } = await muatWilayahTugas();
const akar = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// ============================== (1) pilihRumahIbadahId (murni) ==============================
const L = (id, kecamatan, kelurahan) => ({ id, kecamatan, kelurahan });

test("pilihRumahIbadahId: tepat 1 kecocokan -> ID itu (bigint dari database berupa string tetap jadi Number)", () => {
  assert.equal(pilihRumahIbadahId([L(77, "MEDAN SELAYANG", "TANJUNG SARI")], "MEDAN BELAWAN", "APA SAJA"), 77);
  assert.equal(pilihRumahIbadahId([L("77", "A", "B")], "", ""), 77);
});

test("pilihRumahIbadahId: tidak ada kecocokan -> null", () => {
  assert.equal(pilihRumahIbadahId([], "MEDAN SELAYANG", "TANJUNG SARI"), null);
});

test("pilihRumahIbadahId: >1 kecocokan dipersempit kecamatan+kelurahan; tetap ambigu -> null (tidak menebak)", () => {
  const dua = [L(1, "MEDAN SELAYANG", "TANJUNG SARI"), L(2, "MEDAN SELAYANG", "SEMPAKATA")];
  assert.equal(pilihRumahIbadahId(dua, "medan selayang", " sempakata "), 2);
  assert.equal(pilihRumahIbadahId(dua, "MEDAN BELAWAN", "BELAWAN BAHARI"), null);
  assert.equal(pilihRumahIbadahId([L(1, "A", "B"), L(2, "A", "B")], "A", "B"), null);
});

test("pilihRumahIbadahId: baris tanpa ID diabaikan", () => {
  assert.equal(pilihRumahIbadahId([L(null, "A", "B")], "A", "B"), null);
  assert.equal(pilihRumahIbadahId([L(null, "A", "B"), L(5, "A", "B")], "A", "B"), 5);
});

// ============================== database tiruan ==============================
const RUMAH_IBADAH = [{ id: "77", nama: "GEREJA D", kecamatan: "MEDAN SELAYANG", kelurahan: "TANJUNG SARI", alamat: "JL A" }];
const WILAYAH = new Set(["MEDAN SELAYANG|TANJUNG SARI", "MEDAN SELAYANG|SEMPAKATA"]);
const SESI = {
  UTAMA: { akun_id: "a1", username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN" },
  KECAMATAN: { akun_id: "a2", username: "kec", role: "KECAMATAN", kecamatan: "MEDAN SELAYANG", user_id: "KECAMATAN MEDAN SELAYANG" },
};
const BARIS = (lebih = {}) => ({
  id: 1, tahun: 2027, nomor_urut: 1, nama: "ANDI", nik: "1271010101900001", jenis_kelamin: "LAKI-LAKI", tempat_lahir: "MEDAN",
  tanggal_lahir: new Date("1989-02-04T00:00:00Z"), alamat: "JL X", layanan: "PENGURUS GEREJA", tempat_tugas: "GEREJA LAMA",
  alamat_tugas: "JL LAMA", kecamatan: "MEDAN SELAYANG", kelurahan: "TANJUNG SARI", nama_rekening: "A", nomor_rekening: "12345678901234",
  kantor_cabang: "B", no_kontak: "0812345678", status_bpjs_tk: "YA", umur: 37, status_verifikasi: "Memenuhi Syarat",
  diperbarui_at: new Date("2026-10-26T00:00:00Z"), dibuat_oleh_akun_id: null, id_folder_berkas: "x", ...lebih,
});
let sesiAktif = SESI.UTAMA;
let baris = BARIS();
function pasang() {
  db().panggilan.length = 0;
  db().handler = (q, v) => {
    if (q.includes("from sesi_login")) return [sesiAktif];
    if (q.includes("from rumah_ibadah")) return RUMAH_IBADAH.filter((r) => r.nama === v[0]);
    if (q.includes("select * from penerima where id")) return [baris];
    if (q.includes("from wilayah")) return WILAYAH.has(String(v[0]).toUpperCase().trim() + "|" + String(v[1]).toUpperCase().trim()) ? [{ ada: 1 }] : [];
    if (q.includes("from kuota")) return [{ kuota_maks: 100 }];
    if (q.includes("count(*)::int as n")) return [{ n: 0 }];
    return [];
  };
}
const token = (() => { let n = 0; return () => "token-tautan-" + (++n); })();
const tulis = (tabel) => db().panggilan.filter((p) => p.teks.startsWith("UNSAFE update " + tabel));

// ============================== (2) simpan data baru ==============================
const form = (ubah = {}) => ({
  inputNama: "andi syahputra", inputNik: "1271010101900001", selectGender: "LAKI-LAKI", inputTempatLahir: "medan",
  inputTglLahir: "04-02-1989", inputAlamat: "jl x", selectLayanan: "PENGURUS GEREJA", inputTempatTugas: "GEREJA D", inputAlamatTugas: "JL A",
  controlKecamatan: "MEDAN SELAYANG", controlKelurahan: "TANJUNG SARI", inputKecamatanDomisili: "MEDAN SELAYANG", inputKelurahanDomisili: "SEMPAKATA",
  inputNamaRekening: "andi", inputNoRekening: "12345678901234", inputKantorCabang: "bank", inputNoKontak: "0812345678", selectBpjs: "YA",
  koordinatLink: "", catatanPerbedaanNama: "CATATAN-UJI", __linkBerkas: {}, ...ubah,
});
const simpan = async (peran, ubah) => { sesiAktif = SESI[peran]; pasang(); return await penerima.simpanDataKeSheet(token(), form(ubah)); };
const insertan = () => db().panggilan.filter((p) => p.teks.includes("insert into penerima"));
// rumah_ibadah_id = parameter tepat sebelum catatan_perbedaan_nama di daftar nilai INSERT (urutan kolom di penerima.ts).
const idDariInsert = (ins) => { const i = ins.nilai.indexOf("CATATAN-UJI"); assert.ok(i > 0, "catatan tidak ditemukan"); return ins.nilai[i - 1]; };

for (const peran of ["UTAMA", "KECAMATAN"]) {
  test(`Simpan baru [${peran}]: tempat tugas rumah ibadah terdaftar -> rumah_ibadah_id terisi (kolom ada di INSERT)`, async () => {
    const h = await simpan(peran, {});
    assert.equal(h.sukses, true, JSON.stringify(h));
    const ins = insertan();
    assert.equal(ins.length, 1);
    assert.match(ins[0].teks, /rumah_ibadah_id/);
    assert.equal(idDariInsert(ins[0]), 77);
  });

  test(`Simpan baru [${peran}]: tempat tugas bebas (RUMAH) pada layanan yang membolehkan -> rumah_ibadah_id null`, async () => {
    const h = await simpan(peran, { selectLayanan: "BILAL JENAZAH", inputTempatTugas: "RUMAH", inputAlamatTugas: "JL BEBAS" });
    assert.equal(h.sukses, true, JSON.stringify(h));
    assert.equal(idDariInsert(insertan()[0]), null);
  });
}

// ============================== (3) Lihat Data -> Edit ==============================
const edit = async (teks) => { sesiAktif = SESI.UTAMA; pasang(); return await penerima.editDataPenerima(token(), 1, { teks, berkas: {}, idFolderBerkas: "" }); };

test("Edit data: pindah ke rumah ibadah terdaftar -> UPDATE menulis rumah_ibadah_id = ID rumah ibadah itu", async () => {
  baris = BARIS();
  const h = await edit({ 8: "GEREJA D", 9: "JL A" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  const w = tulis("penerima");
  assert.equal(w.length, 1);
  assert.match(w[0].teks, /rumah_ibadah_id = \$/);
  assert.ok(w[0].nilai.includes(77));
});

test("Edit data: tautan rumah ibadah juga disalin ke data_detail (tabel salinan tidak boleh tertinggal)", async () => {
  baris = BARIS();
  const h = await edit({ 8: "GEREJA D", 9: "JL A" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  const d = tulis("data_detail");
  assert.equal(d.length, 1);
  assert.match(d[0].teks, /rumah_ibadah_id = \$/);
  assert.ok(d[0].nilai.includes(77));
});

test("Edit data: layanan tempat bebas ganti tempat ke teks bebas -> rumah_ibadah_id dikosongkan (null)", async () => {
  baris = BARIS({ layanan: "GURU MAGHRIB MENGAJI", tempat_tugas: "GEREJA D", alamat_tugas: "JL A", rumah_ibadah_id: 77 });
  const h = await edit({ 8: "PANTI ASUHAN", 9: "JL BEBAS" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  const w = tulis("penerima")[0];
  assert.match(w.teks, /rumah_ibadah_id = \$/);
  assert.ok(w.nilai.includes(null), "nilai null untuk rumah_ibadah_id");
  assert.ok(!w.nilai.includes(77));
});

test("Edit data: mengubah kolom LAIN tidak menyentuh tautan (rumah_ibadah_id tidak ada di UPDATE)", async () => {
  baris = BARIS({ tempat_tugas: "GEREJA D", alamat_tugas: "JL A", rumah_ibadah_id: 77 });
  const h = await edit({ 1: "BUDI" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.doesNotMatch(tulis("penerima")[0].teks, /rumah_ibadah_id/);
});

// ============================== (4) Kelola Data ==============================
const ubah = async (perubahan) => { sesiAktif = SESI.UTAMA; pasang(); return await kelola.adminUbahData(token(), 1, 2027, perubahan); };

test("Kelola Data: ubah tempat+alamat ke rumah ibadah terdaftar -> penerima DAN data_detail menulis rumah_ibadah_id", async () => {
  baris = BARIS();
  const h = await ubah({ tempat_tugas: "GEREJA D", alamat_tugas: "JL A" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  for (const tabel of ["penerima", "data_detail"]) {
    const w = tulis(tabel);
    assert.equal(w.length, 1, tabel);
    assert.match(w[0].teks, /rumah_ibadah_id = \$/, tabel);
    assert.ok(w[0].nilai.includes(77), tabel);
  }
});

test("Kelola Data: ubah layanan ke layanan bebas dengan tempat teks bebas -> rumah_ibadah_id null di kedua tabel", async () => {
  baris = BARIS({ tempat_tugas: "GEREJA D", alamat_tugas: "JL A", rumah_ibadah_id: 77 });
  const h = await ubah({ layanan: "BILAL JENAZAH", tempat_tugas: "MUSHOLLA BEBAS", alamat_tugas: "JL BEBAS" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  for (const tabel of ["penerima", "data_detail"]) {
    const w = tulis(tabel)[0];
    assert.match(w.teks, /rumah_ibadah_id = \$/, tabel);
    assert.ok(w.nilai.includes(null) && !w.nilai.includes(77), tabel);
  }
});

test("Kelola Data: mengubah kolom lain (nama) TIDAK menyentuh tautan", async () => {
  baris = BARIS({ tempat_tugas: "GEREJA D", alamat_tugas: "JL A", rumah_ibadah_id: 77 });
  const h = await ubah({ nama: "BUDI" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  for (const tabel of ["penerima", "data_detail"]) assert.doesNotMatch(tulis(tabel)[0].teks, /rumah_ibadah_id/, tabel);
});

// ============================== (5) pembuat data_detail ==============================
test("Pembuat data_detail menyalin rumah_ibadah_id dari penerima (kabel sumber)", () => {
  const src = fs.readFileSync(path.join(akar, "supabase/functions/api/domains/dataDetail.ts"), "utf8");
  assert.match(src, /kecamatan_domisili, kelurahan_domisili, rumah_ibadah_id\s*\)/);
  assert.match(src, /p\.kecamatan_domisili, p\.kelurahan_domisili, p\.rumah_ibadah_id/);
});
