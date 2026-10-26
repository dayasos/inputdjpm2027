// Uji PERILAKU simpanDataKeSheet (input baru) di penerima.ts dengan database tiruan: tanggal lahir tak wajar dan kelurahan
// tugas kosong/ngawur harus ditolak untuk SEMUA peran (termasuk Admin Utama) tanpa menulis ke database.
// Plan: plans/plan-perbaikan-validasi-data-penerima.md (P1/P3). Menjalankan kode server APA ADANYA (dibundel; tanpa Deno).
// Jalankan: npm run uji:validasi-penerima     (Node 24+; tanpa koneksi database/jaringan).
import test from "node:test";
import assert from "node:assert/strict";
import { db, muatServer } from "./_harness-server.mjs";

const penerima = await muatServer("supabase/functions/api/domains/penerima.ts");

const WILAYAH = new Set(["MEDAN SELAYANG|TANJUNG SARI", "MEDAN SELAYANG|SEMPAKATA", "MEDAN BELAWAN|BELAWAN BAHARI"]);
const SESI = {
  UTAMA: { akun_id: "a1", username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN" },
  KECAMATAN: { akun_id: "a2", username: "kec", role: "KECAMATAN", kecamatan: "MEDAN SELAYANG", user_id: "KECAMATAN MEDAN SELAYANG" },
};
let sesiAktif = SESI.UTAMA;
db().handler = (q, v) => {
  if (q.includes("from sesi_login")) return [sesiAktif];
  if (q.includes("from wilayah")) return WILAYAH.has(String(v[0]).toUpperCase().trim() + "|" + String(v[1]).toUpperCase().trim()) ? [{ ada: 1 }] : [];
  return [];   // rumah_ibadah kosong, tak ada duplikat NIK/rekening/tempat tugas
};
const seq = (() => { let n = 0; return () => "token-simpan-" + (++n); })();

// Layanan Kecamatan non-Guru, tempat tugas RUMAH: tidak butuh koordinat dan tidak wajib rumah ibadah.
const form = (ubah = {}) => ({
  inputNama: "andi syahputra", inputNik: "1271010101900001", selectGender: "LAKI-LAKI", inputTempatLahir: "medan",
  inputTglLahir: "04-02-1989", inputAlamat: "jl x", selectLayanan: "BILAL JENAZAH", inputTempatTugas: "RUMAH", inputAlamatTugas: "JL Y",
  controlKecamatan: "MEDAN SELAYANG", controlKelurahan: "TANJUNG SARI", inputKecamatanDomisili: "MEDAN SELAYANG", inputKelurahanDomisili: "SEMPAKATA",
  inputNamaRekening: "andi", inputNoRekening: "12345678901234", inputKantorCabang: "bank", inputNoKontak: "0812345678", selectBpjs: "YA",
  koordinatLink: "", catatanPerbedaanNama: "", __linkBerkas: {}, ...ubah,
});
const simpan = async (peran, ubah) => {
  sesiAktif = SESI[peran];
  db().panggilan.length = 0;
  return await penerima.simpanDataKeSheet(seq(), form(ubah));
};
const insertan = () => db().panggilan.filter((p) => p.teks.includes("insert into penerima"));

for (const peran of ["UTAMA", "KECAMATAN"]) {
  test(`Input baru [${peran}]: tanggal lahir 0199 / 199 / 31-02 / kosong / masa depan / tahun 1900 ditolak, TANPA menulis`, async () => {
    for (const [nilai, pola] of [["04-02-0199", /tidak wajar/], ["04-02-199", /4 digit/], ["31-02-1990", /tidak valid/], ["", /wajib diisi/], ["01-01-2999", /tidak wajar/], ["01-01-1900", /tidak wajar/], ["01-06-2009", /di bawah 18/]]) {
      const h = await simpan(peran, { inputTglLahir: nilai });
      assert.equal(h.sukses, false, `[${peran}] "${nilai}" seharusnya ditolak`);
      assert.match(h.pesan, pola, nilai);
      assert.equal(insertan().length, 0, `"${nilai}" tidak boleh menulis`);
    }
  });

  test(`Input baru [${peran}]: kelurahan tugas kosong atau bukan milik kecamatannya ditolak, TANPA menulis`, async () => {
    let h = await simpan(peran, { controlKelurahan: "" });
    assert.equal(h.sukses, false);
    assert.equal(h.pesan, "GAGAL: Kelurahan wilayah tugas wajib dipilih.");
    h = await simpan(peran, { controlKelurahan: "NGAWUR" });
    assert.equal(h.sukses, false);
    assert.match(h.pesan, /Kelurahan NGAWUR tidak berada di Kecamatan MEDAN SELAYANG/);
    h = await simpan(peran, { controlKelurahan: "BELAWAN BAHARI" });             // kelurahan kecamatan lain
    assert.equal(h.sukses, false);
    assert.equal(insertan().length, 0);
  });

  test(`Input baru [${peran}]: data sah tersimpan dengan tanggal ISO dan umur yang benar`, async () => {
    const h = await simpan(peran, {});
    assert.equal(h.sukses, true, JSON.stringify(h));
    const ins = insertan();
    assert.equal(ins.length, 1);
    assert.ok(ins[0].nilai.includes("1989-02-04"), "tanggal lahir ISO");
    assert.ok(ins[0].nilai.includes(37), "umur 37");
    assert.ok(ins[0].nilai.includes("TANJUNG SARI"));
  });
}

test("Input baru: Admin Utama dan petugas Kecamatan diperlakukan SAMA untuk kelurahan kosong (tidak ada pengecualian UTAMA)", async () => {
  const u = await simpan("UTAMA", { controlKelurahan: "" });
  const k = await simpan("KECAMATAN", { controlKelurahan: "" });
  assert.equal(u.sukses, false);
  assert.equal(k.sukses, false);
  assert.equal(u.pesan, k.pesan);
});
