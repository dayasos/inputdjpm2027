// Uji: "Lihat Data -> Edit" (editDataPenerima) harus menyamakan salinan `data_detail` untuk kolom yang disalinnya, dalam SATU transaksi,
// tanpa menyentuh data_detail untuk perubahan yang tidak ada di sana (berkas, koordinat). Latar: 8 penerima 2027 sempat berbeda dari
// Data Detail-nya (nama, rekening, tanggal lahir, BPJS) karena edit biasa hanya memperbarui tabel `penerima`.
// Menjalankan kode server APA ADANYA (dibundel; tanpa Deno) dengan database tiruan; data KARANGAN.
// Jalankan: npm run uji:sinkron-detail     (Node 24+)
import test from "node:test";
import assert from "node:assert/strict";
import { db, muatServer } from "./_harness-server.mjs";

const penerima = await muatServer("supabase/functions/api/domains/penerima.ts");

const SESI = {
  UTAMA: { akun_id: "a1", username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN" },
  KECAMATAN: { akun_id: "a2", username: "kec", role: "KECAMATAN", kecamatan: "MEDAN SELAYANG", user_id: "KECAMATAN MEDAN SELAYANG" },
};
const BARIS = (lebih = {}) => ({
  id: 1, tahun: 2027, nomor_urut: 1, nama: "ANDI", nik: "1271010101900001", jenis_kelamin: "LAKI-LAKI", tempat_lahir: "MEDAN",
  tanggal_lahir: new Date("1989-02-04T00:00:00Z"), alamat: "JL X", layanan: "PENGURUS GEREJA", tempat_tugas: "GEREJA D",
  alamat_tugas: "JL A", kecamatan: "MEDAN SELAYANG", kelurahan: "TANJUNG SARI", nama_rekening: "A", nomor_rekening: "12345678901234",
  kantor_cabang: "B", no_kontak: "0812345678", status_bpjs_tk: "TIDAK", umur: 37, status_verifikasi: "Memenuhi Syarat",
  diperbarui_at: new Date("2026-10-26T00:00:00Z"), dibuat_oleh_akun_id: null, id_folder_berkas: "x", ...lebih,
});
let sesiAktif = SESI.UTAMA;
let baris = BARIS();
let gagalDetail = false;
function pasang() {
  db().panggilan.length = 0;
  db().handler = (q, v) => {
    if (q.includes("from sesi_login")) return [sesiAktif];
    if (q.includes("select * from penerima where id")) return [baris];
    if (q.includes("from rumah_ibadah")) return [{ kecamatan: "MEDAN SELAYANG", kelurahan: "TANJUNG SARI", alamat: "JL A", nama: "GEREJA D" }].filter((r) => r.nama === v[0]);
    if (q.includes("from wilayah")) return [{ ada: 1 }];
    if (q.startsWith("UNSAFE update data_detail") && gagalDetail) throw new Error("galat_uji_data_detail");
    return [];
  };
}
const token = (() => { let n = 0; return () => "token-sd-" + (++n); })();
const edit = async (teks, berkas = {}, peran = "UTAMA") => {
  sesiAktif = SESI[peran]; gagalDetail = false; pasang();
  return await penerima.editDataPenerima(token(), 1, { teks, berkas, idFolderBerkas: "" });
};
const tulis = (tabel) => db().panggilan.filter((p) => p.teks.startsWith("UNSAFE update " + tabel + " set"));
const kolomDari = (teks) => [...teks.matchAll(/(\w+) = \$\d+/g)].map((m) => m[1]);
const BERKAS_IDX = Number(Object.keys(penerima.MAP_IDX_KE_KOLOM_BERKAS)[0]);

for (const peran of ["UTAMA", "KECAMATAN"]) {
  test(`[${peran}] edit nama: penerima DAN data_detail diperbarui dengan nilai yang sama, kunci penerima_id + tahun`, async () => {
    baris = BARIS();
    const h = await edit({ 1: "budi santoso" }, {}, peran);
    assert.equal(h.sukses, true, JSON.stringify(h));
    const p = tulis("penerima"), d = tulis("data_detail");
    assert.equal(p.length, 1);
    assert.equal(d.length, 1);
    assert.deepEqual(kolomDari(d[0].teks).filter((k) => k !== "penerima_id" && k !== "tahun"), ["nama"]);
    assert.match(d[0].teks, /where penerima_id = \$\d+ and tahun = \$\d+/);
    assert.ok(d[0].nilai.includes("BUDI SANTOSO"), "nilai nama (huruf besar) tertulis di data_detail");
    assert.ok(d[0].nilai.includes(1) && d[0].nilai.includes(2027), "kunci penerima_id=1, tahun=2027");
  });
}

test("edit rekening + nama rekening + BPJS: semua kolom itu ikut ke data_detail", async () => {
  baris = BARIS();
  const h = await edit({ 12: "BUDI", 13: "13602030006017", 16: "YA" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  const d = tulis("data_detail");
  assert.equal(d.length, 1);
  assert.deepEqual(kolomDari(d[0].teks).filter((k) => !["penerima_id", "tahun"].includes(k)).sort(), ["nama_rekening", "nomor_rekening", "status_bpjs_tk"]);
  assert.ok(d[0].nilai.includes("13602030006017") && d[0].nilai.includes("YA"));
});

test("edit tanggal lahir: data_detail menerima tanggal ISO dan umur yang dihitung ulang (kasus tahun 0199 -> 1989)", async () => {
  baris = BARIS({ tanggal_lahir: new Date("0199-02-04T00:00:00Z"), umur: 1827 });
  const h = await edit({ 5: "04-02-1989" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  const d = tulis("data_detail")[0];
  assert.deepEqual(kolomDari(d.teks).filter((k) => !["penerima_id", "tahun"].includes(k)).sort(), ["tanggal_lahir", "umur"]);
  assert.ok(d.nilai.includes("1989-02-04"));
  assert.ok(d.nilai.includes(37));
});

test("edit tempat tugas + alamat tugas + kelurahan: ikut ke data_detail (layanan yang boleh teks bebas)", async () => {
  baris = BARIS({ layanan: "BILAL JENAZAH", tempat_tugas: "MUSHOLLA LAMA", alamat_tugas: "JL LAMA", kelurahan: "TANJUNG SARI" });
  const h = await edit({ 8: "MUSHOLLA BARU", 9: "JL BARU", 11: "SEMPAKATA" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  const d = tulis("data_detail")[0];
  const k = kolomDari(d.teks).filter((x) => !["penerima_id", "tahun"].includes(x)).sort();
  assert.deepEqual(k, ["alamat_tugas", "kelurahan", "tempat_tugas"]);
  assert.ok(d.nilai.includes("MUSHOLLA BARU") && d.nilai.includes("JL BARU") && d.nilai.includes("SEMPAKATA"));
});

test("perubahan yang TIDAK ada di data_detail (berkas / koordinat) tidak menyentuh data_detail", async () => {
  baris = BARIS();
  let h = await edit({}, { [BERKAS_IDX]: "https://drive.google.com/file/d/ABC/view" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.equal(tulis("penerima").length, 1, "penerima tetap diperbarui (link berkas)");
  assert.equal(tulis("data_detail").length, 0, "data_detail tidak perlu disentuh");
  baris = BARIS({ layanan: "GURU MAGHRIB MENGAJI" });
  h = await edit({ 31: "3.5952,98.6722" });
  assert.equal(tulis("data_detail").length, 0, "koordinat tidak ada di data_detail");
});

test("campuran nama + berkas: data_detail hanya menerima kolom data (tanpa kolom link_*)", async () => {
  baris = BARIS();
  const h = await edit({ 1: "BUDI" }, { [BERKAS_IDX]: "https://drive.google.com/file/d/ABC/view" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  const k = kolomDari(tulis("data_detail")[0].teks).filter((x) => !["penerima_id", "tahun"].includes(x));
  assert.deepEqual(k, ["nama"]);
  assert.ok(!tulis("data_detail")[0].teks.includes("link_"), "tidak boleh ada kolom link_* di data_detail");
});

test("tanpa perubahan apa pun: tidak ada penulisan ke penerima maupun data_detail", async () => {
  baris = BARIS();
  const h = await edit({ 1: "ANDI" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.equal(tulis("penerima").length + tulis("data_detail").length, 0);
});

test("urutan: penerima diperbarui lebih dulu, lalu data_detail (dalam transaksi yang sama)", async () => {
  baris = BARIS();
  await edit({ 1: "BUDI" });
  const i = db().panggilan.findIndex((p) => p.teks.startsWith("UNSAFE update penerima set"));
  const j = db().panggilan.findIndex((p) => p.teks.startsWith("UNSAFE update data_detail set"));
  assert.ok(i >= 0 && j > i);
});

test("bila pembaruan data_detail GAGAL, hasilnya dilaporkan GAGAL (tidak diam-diam sukses)", async () => {
  baris = BARIS();
  sesiAktif = SESI.UTAMA; pasang(); gagalDetail = true;
  const h = await penerima.editDataPenerima(token(), 1, { teks: { 1: "BUDI" }, berkas: {}, idFolderBerkas: "" });
  assert.equal(h.sukses, false);
  assert.match(h.pesan, /galat_uji_data_detail/);
});
