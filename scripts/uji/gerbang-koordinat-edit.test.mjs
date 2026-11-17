// TAHAP B: gerbang koordinat pada Edit Data petugas lapangan (kode server ASLI, database tiruan). Rencana: plans/plan-penanda-koordinat-gmm.md
// Jalankan: npm run uji:gerbang-koordinat
import test from "node:test";
import assert from "node:assert/strict";
import { db, muatServer } from "./_harness-server.mjs";

const penerima = await muatServer("supabase/functions/api/domains/penerima.ts");
const GMM = "GURU MAGHRIB MENGAJI";
const BAD = "https://www.google.com/maps/@3.5,98.6,34a,75y/data=!1e1";      // Street View
const BAIK = "https://www.google.com/maps?q=3.595200,98.672200";
const PENDEK = "https://maps.app.goo.gl/abc123";
const SESI = {
  GMM: { akun_id: "a3", username: "gmm_timur", role: GMM, kecamatan: "MEDAN TIMUR", user_id: "GMM MEDAN TIMUR" },
  UTAMA: { akun_id: "a1", username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN" },
  GSM: { akun_id: "a4", username: "gsm_x", role: "GURU SEKOLAH MINGGU", kecamatan: "MEDAN TIMUR", user_id: "GSM X" },
};
let sesiAktif = SESI.GMM, token = "t-gmm", baris = null;
const BARIS = (lay, tautan) => ({
  id: 1, tahun: 2027, nama: "ANI", nik: "1271010101900001", layanan: lay, tempat_tugas: "RUMAH", alamat_tugas: "JL Y", kecamatan: "MEDAN TIMUR", kelurahan: "X",
  status_verifikasi: "Berkas Tidak Lengkap", keterangan_verifikasi: "x", link_koordinat_lokasi: tautan, dibuat_oleh_akun_id: null,
});
function pasang(lay = GMM, tautan = "https://lama") {
  baris = BARIS(lay, tautan);
  db().panggilan.length = 0;
  db().handler = (q) => {
    if (q.includes("from sesi_login")) return [sesiAktif];
    if (q.includes("from penerima where id") || q.includes("select * from penerima where id")) return [baris];
    if (q.includes("update penerima set")) return [{ id: 1 }];
    return [];
  };
}
const peran = (nama, t) => { sesiAktif = SESI[nama]; token = t; };
const edit = (link) => penerima.editDataPenerima(token, 1, { teks: { 31: link }, berkas: {}, idFolderBerkas: "" });
const menulis = () => db().panggilan.filter((p) => /update penerima/i.test(p.teks));
const jaringanPutus = () => { const p = []; globalThis.__ujiFetch = async (u) => { p.push(u); throw new Error("putus (uji)"); }; return p; };

test("EDIT petugas GMM: tautan Street View/pencarian/rute DITOLAK dengan alasan + petunjuk; tidak ada yang ditulis", async () => {
  peran("GMM", "t-gmm-1"); jaringanPutus();
  for (const [url, kata] of [[BAD, "Street View"], ["https://www.google.com/maps/search/masjid/@3.5,98.6,17z", "pencarian"], ["https://www.google.com/maps/@3.5,98.6,17z", "tanpa titik penanda"]]) {
    pasang();
    const r = await edit(url);
    assert.equal(r.sukses, false, url); assert.match(r.pesan, /^GAGAL: Koordinat tidak dapat diterima/); assert.match(r.pesan, new RegExp(kata, "i"));
    assert.match(r.pesan, /tekan lama pada titik lokasi/);
    assert.equal(menulis().length, 0, "tidak ada penulisan untuk " + url);
  }
});

test("EDIT petugas GMM: titik sah diterima dan disimpan; tautan pendek yang tak bisa dibuka diterima (gagal-terbuka)", async () => {
  peran("GMM", "t-gmm-2"); const p = jaringanPutus();
  pasang(); let r = await edit(BAIK);
  assert.equal(r.sukses, true, JSON.stringify(r)); assert.equal(menulis().length >= 1, true);
  pasang(); r = await edit(PENDEK);
  assert.equal(r.sukses, true, "Google tidak menjawab: petugas tidak terhalang: " + JSON.stringify(r)); assert.ok(p.includes(PENDEK), "tautan pendek memang dicoba dibuka");
  // tautan pendek yang ternyata Street View/tanpa penanda -> ditolak
  globalThis.__ujiFetch = async () => ({ status: 302, headers: { get: () => "https://www.google.com/maps/place//@3.55,98.69,13z/data=!3m1!4b1" } });
  pasang(); r = await edit(PENDEK);
  assert.equal(r.sukses, false); assert.match(r.pesan, /tanpa titik penanda/);
});

test("EDIT: tautan TIDAK berubah (data lama yang masih bermasalah) tidak diperiksa ulang sehingga kolom lain tetap bisa diedit", async () => {
  peran("GMM", "t-gmm-3"); const p = jaringanPutus();
  pasang(GMM, BAD);
  const r = await edit(BAD);
  assert.equal(r.sukses, true, JSON.stringify(r)); assert.equal(p.length, 0);
});

test("EDIT: Admin Utama TIDAK dibatasi; layanan lain (Guru Sekolah Minggu) tidak diperiksa", async () => {
  jaringanPutus();
  peran("UTAMA", "t-utama"); pasang();
  let r = await edit(BAD); assert.equal(r.sukses, true, "Admin Utama boleh: " + JSON.stringify(r));
  peran("GSM", "t-gsm"); pasang("GURU SEKOLAH MINGGU");
  r = await edit(BAD); assert.equal(r.sukses, true, "layanan lain tidak diperiksa: " + JSON.stringify(r));
});

// ---------------------------------------------------------------- input baru (simpanDataKeSheet)
const WILAYAH = new Set(["MEDAN TIMUR|GLUGUR DARAT I"]);
const formBaru = (ubah = {}) => ({
  inputNama: "andi syahputra", inputNik: "1271010101900001", selectGender: "LAKI-LAKI", inputTempatLahir: "medan",
  inputTglLahir: "04-02-1989", inputAlamat: "jl x", selectLayanan: GMM, inputTempatTugas: "RUMAH", inputAlamatTugas: "JL Y",
  controlKecamatan: "MEDAN TIMUR", controlKelurahan: "GLUGUR DARAT I", inputKecamatanDomisili: "MEDAN TIMUR", inputKelurahanDomisili: "GLUGUR DARAT I",
  inputNamaRekening: "andi", inputNoRekening: "12345678901234", inputKantorCabang: "bank", inputNoKontak: "0812345678", selectBpjs: "YA",
  koordinatLink: BAIK, catatanPerbedaanNama: "", __linkBerkas: {}, ...ubah,
});
function pasangBaru() {
  db().panggilan.length = 0;
  db().handler = (q, v) => {
    if (q.includes("from sesi_login")) return [sesiAktif];
    if (q.includes("from wilayah")) return WILAYAH.has(String(v[0]).toUpperCase().trim() + "|" + String(v[1]).toUpperCase().trim()) ? [{ ada: 1 }] : [];
    return [];
  };
}
const simpanBaru = async (nama, t, ubah) => { peran(nama, t); pasangBaru(); return penerima.simpanDataKeSheet(t, formBaru(ubah)); };
const insertan = () => db().panggilan.filter((p) => p.teks.includes("insert into penerima"));

test("INPUT BARU petugas GMM: koordinat Street View/pencarian DITOLAK tanpa menulis; titik sah diterima dan disimpan; Google gagal = diterima", async () => {
  const p = jaringanPutus();
  let r = await simpanBaru("GMM", "t-baru-1", { koordinatLink: BAD });
  assert.equal(r.sukses, false, JSON.stringify(r)); assert.match(r.pesan, /^GAGAL: Koordinat tidak dapat diterima karena tautan Street View/); assert.match(r.pesan, /Bagikan dan Salin tautan/);
  assert.equal(insertan().length, 0, "ditolak sebelum menulis");
  r = await simpanBaru("GMM", "t-baru-2", { koordinatLink: "https://www.google.com/maps/search/masjid/@3.5,98.6,17z" });
  assert.equal(r.sukses, false); assert.match(r.pesan, /pencarian/i); assert.equal(insertan().length, 0);
  r = await simpanBaru("GMM", "t-baru-3", { koordinatLink: BAIK });
  assert.equal(r.sukses, true, "titik sah: " + JSON.stringify(r)); assert.equal(insertan().length, 1);
  r = await simpanBaru("GMM", "t-baru-4", { koordinatLink: PENDEK });
  assert.equal(r.sukses, true, "gagal-terbuka: " + JSON.stringify(r)); assert.ok(p.includes(PENDEK));
});

test("INPUT BARU: Admin Utama tidak dibatasi; layanan Guru lain tidak diperiksa", async () => {
  jaringanPutus();
  let r = await simpanBaru("UTAMA", "t-baru-5", { koordinatLink: BAD });
  assert.equal(r.sukses, true, "Admin Utama: " + JSON.stringify(r));
  r = await simpanBaru("GSM", "t-baru-6", { koordinatLink: BAD, selectLayanan: "GURU SEKOLAH MINGGU" });
  assert.doesNotMatch(String(r.pesan || ""), /Koordinat tidak dapat diterima/, "layanan lain lolos gerbang koordinat (penolakan lain tidak terkait): " + JSON.stringify(r));
});
