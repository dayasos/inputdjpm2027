// Uji tentukanWilayahTugas() untuk Admin Utama (plan: plans/plan-perbaikan-validasi-data-penerima.md, G5).
// Jalankan: npm run uji:validasi-penerima     (Node 24+; data KARANGAN, tidak menyentuh database).
import test from "node:test";
import assert from "node:assert/strict";
import { muatWilayahTugas } from "./_harness-wilayah.mjs";

const { tentukanWilayahTugas, state } = await muatWilayahTugas();

function atur() {
  state.wilayah = new Set(["MEDAN BELAWAN|BELAWAN BAHARI", "MEDAN BELAWAN|BELAWAN II", "MEDAN SELAYANG|TANJUNG SARI"]);
  state.rumahIbadah = [
    { nama: "GEREJA A", kecamatan: "MEDAN BELAWAN", kelurahan: "BELAWAN BAHARI", alamat: "JL A" },
    { nama: "GEREJA B", kecamatan: "MEDAN BELAWAN", kelurahan: "", alamat: "JL A" },
    { nama: "GEREJA C", kecamatan: "MEDAN BELAWAN", kelurahan: "BELAWAN BAHARI", alamat: "JL A" },
    { nama: "GEREJA C", kecamatan: "MEDAN BELAWAN", kelurahan: "BELAWAN II", alamat: "JL A" },
    { nama: "GEREJA D", kecamatan: "MEDAN SELAYANG", kelurahan: "TANJUNG SARI", alamat: "JL A" },
  ];
}
const UTAMA = { role: "UTAMA", kecamatan: "", userId: "admin" };
const KEC = { role: "KECAMATAN", kecamatan: "MEDAN BELAWAN", userId: "KECAMATAN MEDAN BELAWAN" };
const p = (sesi, tempatTugas, kecamatan, kelurahan, layanan = "PENGURUS GEREJA") =>
  ({ sesi, layanan, tempatTugas, alamatTugas: "JL A", kecamatan, kelurahan });

test("UTAMA: kelurahan kosong ditolak (tempat tugas bukan rumah ibadah terdaftar)", async () => {
  atur();
  const h = await tentukanWilayahTugas(p(UTAMA, "RUMAH", "MEDAN BELAWAN", "", "GURU MAGHRIB MENGAJI"));
  assert.equal(h.ok, false);
  assert.equal(h.pesan, "GAGAL: Kelurahan wilayah tugas wajib dipilih.");
  assert.equal(h.soalKelurahan, true);
});

test("UTAMA: kelurahan sah di kecamatan diterima; kelurahan salah/ngawur ditolak", async () => {
  atur();
  const ok = await tentukanWilayahTugas(p(UTAMA, "RUMAH", "MEDAN BELAWAN", "BELAWAN BAHARI", "GURU MAGHRIB MENGAJI"));
  assert.deepEqual(ok, { ok: true, kecamatan: "MEDAN BELAWAN", kelurahan: "BELAWAN BAHARI", dariRumahIbadah: false });
  for (const kel of ["TANJUNG SARI", "NGAWUR"]) {
    const h = await tentukanWilayahTugas(p(UTAMA, "RUMAH", "MEDAN BELAWAN", kel, "GURU MAGHRIB MENGAJI"));
    assert.equal(h.ok, false, kel);
    assert.match(h.pesan, /tidak berada di Kecamatan MEDAN BELAWAN/);
  }
});

test("UTAMA: rumah ibadah dengan satu kelurahan -> kelurahan mengikuti rumah ibadah (juga bila kiriman kosong/berbeda)", async () => {
  atur();
  for (const kirim of ["", "BELAWAN II", "NGAWUR"]) {
    const h = await tentukanWilayahTugas(p(UTAMA, "GEREJA A", "MEDAN BELAWAN", kirim));
    assert.deepEqual(h, { ok: true, kecamatan: "MEDAN BELAWAN", kelurahan: "BELAWAN BAHARI", dariRumahIbadah: false }, kirim);
  }
});

test("UTAMA: rumah ibadah tanpa kelurahan di datanya -> kelurahan WAJIB dipilih manual dan diperiksa", async () => {
  atur();
  assert.equal((await tentukanWilayahTugas(p(UTAMA, "GEREJA B", "MEDAN BELAWAN", ""))).ok, false);
  assert.equal((await tentukanWilayahTugas(p(UTAMA, "GEREJA B", "MEDAN BELAWAN", "TANJUNG SARI"))).ok, false);
  assert.equal((await tentukanWilayahTugas(p(UTAMA, "GEREJA B", "MEDAN BELAWAN", "BELAWAN II"))).ok, true);
});

test("UTAMA: rumah ibadah dengan beberapa kelurahan -> kiriman harus salah satunya", async () => {
  atur();
  assert.equal((await tentukanWilayahTugas(p(UTAMA, "GEREJA C", "MEDAN BELAWAN", "BELAWAN II"))).kelurahan, "BELAWAN II");
  const h = await tentukanWilayahTugas(p(UTAMA, "GEREJA C", "MEDAN BELAWAN", ""));
  assert.equal(h.ok, false);
  assert.match(h.pesan, /beberapa kelurahan \(BELAWAN BAHARI, BELAWAN II\)/);
});

test("UTAMA: kecamatan yang dipilih berbeda dari kecamatan rumah ibadah tetap ditolak (aturan lama utuh)", async () => {
  atur();
  const h = await tentukanWilayahTugas(p(UTAMA, "GEREJA D", "MEDAN BELAWAN", "BELAWAN BAHARI"));
  assert.equal(h.ok, false);
  assert.match(h.pesan, /tercatat di Kec\. MEDAN SELAYANG/);
});

test("UTAMA: kecamatan kosong ditolak dengan pesan kecamatan (bukan pesan kelurahan yang membingungkan)", async () => {
  atur();
  const h = await tentukanWilayahTugas(p(UTAMA, "RUMAH", "", "BELAWAN BAHARI", "GURU MAGHRIB MENGAJI"));
  assert.equal(h.ok, false);
  assert.equal(h.pesan, "GAGAL: Kecamatan wilayah tugas wajib dipilih.");
});

test("UTAMA dan petugas Kecamatan diperlakukan sama untuk kelurahan kosong/ngawur (tidak ada pengecualian UTAMA)", async () => {
  atur();
  for (const [kel, tempat, layanan] of [["", "RUMAH", "GURU MAGHRIB MENGAJI"], ["NGAWUR", "RUMAH", "GURU MAGHRIB MENGAJI"], ["", "GEREJA B", "PENGURUS GEREJA"]]) {
    const u = await tentukanWilayahTugas(p(UTAMA, tempat, "MEDAN BELAWAN", kel, layanan));
    const k = await tentukanWilayahTugas(p(KEC, tempat, "MEDAN BELAWAN", kel, layanan));
    assert.equal(u.ok, false, `UTAMA ${kel}/${tempat}`);
    assert.equal(k.ok, false, `KECAMATAN ${kel}/${tempat}`);
  }
});

test("peran non-UTAMA tidak berubah: Kecamatan dengan RUMAH + kelurahan sah tetap diterima", async () => {
  atur();
  const h = await tentukanWilayahTugas(p(KEC, "RUMAH", "MEDAN BELAWAN", "BELAWAN BAHARI", "GURU MAGHRIB MENGAJI"));
  assert.deepEqual(h, { ok: true, kecamatan: "MEDAN BELAWAN", kelurahan: "BELAWAN BAHARI", dariRumahIbadah: false });
});
