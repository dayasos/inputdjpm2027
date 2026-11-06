// Uji pemeriksaan "wilayah rumah ibadah = wilayah penerima" pada Kelola Data (adminUbahData) dan fungsi bantunya
// (periksaWilayahRumahIbadah). Rencana: plans/plan-pilih-rumah-ibadah-kelola-data.md (keputusan user 2026-11-06:
// tolak bila beda wilayah; pemeriksaan juga berlaku saat kecamatan/kelurahan diubah).
// Menjalankan kode server APA ADANYA (dibundel; tanpa Deno) dengan database tiruan; data KARANGAN, tanpa koneksi database/jaringan.
// Jalankan: npm run uji:wilayah-ri-kelola     (Node 24+)
import test from "node:test";
import assert from "node:assert/strict";
import { db, muatServer } from "./_harness-server.mjs";
import { muatWilayahTugas } from "./_harness-wilayah.mjs";

const kelola = await muatServer("supabase/functions/api/domains/kelolaData.ts");
const { modul: wilayahModul, state: stateWilayah } = await muatWilayahTugas();

const RUMAH_IBADAH = [
  { id: 11, nama: "GEREJA D", kecamatan: "MEDAN SELAYANG", kelurahan: "TANJUNG SARI", alamat: "JL A" },
  { id: 12, nama: "GEREJA S", kecamatan: "MEDAN SELAYANG", kelurahan: "SEMPAKATA", alamat: "JL S" },
  { id: 13, nama: "GEREJA E", kecamatan: "MEDAN BELAWAN", kelurahan: "BELAWAN II", alamat: "JL B" },
  // nama + alamat kembar di dua kelurahan berbeda
  { id: 21, nama: "GEREJA K", kecamatan: "MEDAN SELAYANG", kelurahan: "TANJUNG SARI", alamat: "JL K" },
  { id: 22, nama: "GEREJA K", kecamatan: "MEDAN SELAYANG", kelurahan: "SEMPAKATA", alamat: "JL K" },
];
const WILAYAH = new Set([
  "MEDAN SELAYANG|TANJUNG SARI", "MEDAN SELAYANG|SEMPAKATA", "MEDAN BELAWAN|BELAWAN II", "MEDAN BELAWAN|BELAWAN BAHARI",
]);
const BARIS = (lebih = {}) => ({
  id: 1, tahun: 2027, nomor_urut: 1, nama: "ANDI", nik: "1271010101900001", jenis_kelamin: "LAKI-LAKI", tempat_lahir: "MEDAN",
  tanggal_lahir: new Date("1989-02-04T00:00:00Z"), alamat: "JL X", layanan: "PENGURUS GEREJA", tempat_tugas: "GEREJA D",
  alamat_tugas: "JL A", kecamatan: "MEDAN SELAYANG", kelurahan: "TANJUNG SARI", nama_rekening: "A", nomor_rekening: "12345678901234",
  kantor_cabang: "B", no_kontak: "0812345678", status_bpjs_tk: "YA", umur: 37, status_verifikasi: "Memenuhi Syarat",
  diperbarui_at: new Date("2026-10-26T00:00:00Z"), dibuat_oleh_akun_id: null, id_folder_berkas: "x", ...lebih,
});
let baris = BARIS();
let capil = [];        // baris tabel capil (NIK domisili luar Medan)
let statusLama = [];   // baris arsip tahun lalu untuk NIK baru
const sesi = { akun_id: "a1", username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN" };

function pasang() {
  db().panggilan.length = 0;
  db().handler = (q, v) => {
    if (q.includes("from sesi_login")) return [sesi];
    if (q.includes("from rumah_ibadah")) return RUMAH_IBADAH.filter((r) => r.nama === v[0]);
    if (q.includes("select * from penerima where id")) return [baris];
    if (q.includes("from wilayah")) return WILAYAH.has(String(v[0]).toUpperCase().trim() + "|" + String(v[1]).toUpperCase().trim()) ? [{ ada: 1 }] : [];
    if (q.includes("select nik from penerima where id")) return [{ nik: baris.nik }];
    if (q.includes("from capil")) return capil;
    if (/and tahun <> ?/.test(q)) return statusLama;
    if (q.includes("from kuota")) return [{ kuota_maks: 100 }];
    if (q.includes("count(*)::int as n")) return [{ n: 0 }];
    return [];
  };
}
const penulisan = () => db().panggilan.filter((p) => p.teks.startsWith("UNSAFE update penerima"));
const token = (() => { let n = 0; return () => "token-wil-" + (++n); })();
const ubah = async (perubahan) => { pasang(); return await kelola.adminUbahData(token(), 1, 2027, perubahan); };

// ============================== fungsi bantu periksaWilayahRumahIbadah ==============================
test("Fungsi bantu: layanan bebas / rumah ibadah tak terdaftar -> lolos (bukan urusannya); wilayah sama lolos; beda ditolak", async () => {
  stateWilayah.rumahIbadah = RUMAH_IBADAH;
  const f = wilayahModul.periksaWilayahRumahIbadah;
  assert.equal((await f("BILAL JENAZAH", "GEREJA E", "JL B", "MEDAN SELAYANG", "TANJUNG SARI")).ok, true);
  assert.equal((await f("PENGURUS GEREJA", "TIDAK ADA", "JL Z", "MEDAN SELAYANG", "TANJUNG SARI")).ok, true);
  assert.equal((await f("PENGURUS GEREJA", "gereja  d", "jl a", "medan selayang", "tanjung sari")).ok, true, "huruf besar/kecil & spasi dirapikan");
  const tolak = await f("PENGURUS GEREJA", "GEREJA E", "JL B", "MEDAN SELAYANG", "TANJUNG SARI");
  assert.equal(tolak.ok, false);
  assert.match(tolak.pesan, /tercatat di Kec\. MEDAN BELAWAN, Kel\. BELAWAN II/);
  assert.match(tolak.pesan, /wilayah penerima adalah Kec\. MEDAN SELAYANG, Kel\. TANJUNG SARI/);
});

// ============================== Kelola Data ==============================
test("Pindah ke rumah ibadah di KECAMATAN lain ditolak, tanpa menulis", async () => {
  baris = BARIS();
  const h = await ubah({ tempat_tugas: "GEREJA E", alamat_tugas: "JL B" });
  assert.equal(h.sukses, false, JSON.stringify(h));
  assert.match(h.pesan, /tercatat di Kec\. MEDAN BELAWAN/);
  assert.equal(penulisan().length, 0);
});

test("Pindah ke rumah ibadah di KELURAHAN lain (kecamatan sama) ditolak, tanpa menulis", async () => {
  baris = BARIS();
  const h = await ubah({ tempat_tugas: "GEREJA S", alamat_tugas: "JL S" });
  assert.equal(h.sukses, false, JSON.stringify(h));
  assert.match(h.pesan, /Kel\. SEMPAKATA/);
  assert.equal(penulisan().length, 0);
});

test("Pindah rumah ibadah SEKALIGUS mengubah kecamatan + kelurahan ke wilayah rumah ibadah itu diterima, dan tertaut ke ID-nya", async () => {
  baris = BARIS();
  const h = await ubah({ tempat_tugas: "GEREJA E", alamat_tugas: "JL B", kecamatan: "MEDAN BELAWAN", kelurahan: "BELAWAN II" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.equal(penulisan().length, 1);
  assert.ok(penulisan()[0].nilai.includes(13), "rumah_ibadah_id = 13 ikut ditulis");
});

test("Memperluas W3: ubah KELURAHAN saja (tempat tugas tetap) ke wilayah lain ditolak", async () => {
  baris = BARIS();
  const h = await ubah({ kelurahan: "SEMPAKATA" });
  assert.equal(h.sukses, false, JSON.stringify(h));
  assert.match(h.pesan, /Kel\. TANJUNG SARI, sedangkan wilayah penerima adalah Kec\. MEDAN SELAYANG, Kel\. SEMPAKATA|wilayah penerima/);
  assert.equal(penulisan().length, 0);
});

test("Ubah KECAMATAN + kelurahan saja (tempat tugas tetap di wilayah lama) ditolak", async () => {
  baris = BARIS();
  const h = await ubah({ kecamatan: "MEDAN BELAWAN", kelurahan: "BELAWAN II" });
  assert.equal(h.sukses, false, JSON.stringify(h));
  assert.equal(penulisan().length, 0);
});

test("Ubah LAYANAN dari layanan bebas ke wajib-daftar dengan rumah ibadah di wilayah lain ditolak (bukan hanya cek daftar)", async () => {
  baris = BARIS({ layanan: "BILAL JENAZAH", tempat_tugas: "GEREJA E", alamat_tugas: "JL B" });
  const h = await ubah({ layanan: "PENGURUS GEREJA" });
  assert.equal(h.sukses, false, JSON.stringify(h));
  assert.match(h.pesan, /tercatat di Kec\. MEDAN BELAWAN/);
});

test("Ubah kolom LAIN pada data lama yang beda wilayah tidak diblokir (data lama dibiarkan)", async () => {
  baris = BARIS({ tempat_tugas: "GEREJA E", alamat_tugas: "JL B" }); // rumah ibadah di Belawan, penerima di Selayang
  const h = await ubah({ nama: "BUDI", no_kontak: "0899123456789" });
  assert.equal(h.sukses, true, JSON.stringify(h));
});

test("Data lama yang tempat tugasnya tidak ada di daftar: ubah kelurahan saja tetap diterima (tak ada pembanding)", async () => {
  baris = BARIS({ tempat_tugas: "GEREJA KETIKAN LAMA", alamat_tugas: "JL LAMA" });
  const h = await ubah({ kelurahan: "SEMPAKATA" });
  assert.equal(h.sukses, true, JSON.stringify(h));
});

test("Layanan bebas (Bilal Jenazah / Guru Maghrib Mengaji): ubah kelurahan/tempat tidak dikenai pemeriksaan wilayah", async () => {
  for (const lay of ["BILAL JENAZAH", "GURU MAGHRIB MENGAJI"]) {
    baris = BARIS({ layanan: lay, tempat_tugas: "GEREJA E", alamat_tugas: "JL B" });
    const h = await ubah({ kelurahan: "SEMPAKATA" });
    assert.equal(h.sukses, true, lay + " " + JSON.stringify(h));
  }
});

test("Nama + alamat KEMBAR di dua kelurahan: diterima bila salah satunya sewilayah, dan tertaut ke ID yang sewilayah", async () => {
  baris = BARIS({ kelurahan: "SEMPAKATA", tempat_tugas: "GEREJA LAMA", alamat_tugas: "JL LAMA" });
  const h = await ubah({ tempat_tugas: "GEREJA K", alamat_tugas: "JL K" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.ok(penulisan()[0].nilai.includes(22), "terhubung ke ID 22 (SEMPAKATA), bukan 21");
  assert.ok(!penulisan()[0].nilai.includes(21));
});

test("Ubah wilayah ke kelurahan yang sama dengan kembaran lain menautkan ulang ID (tempat tugas tidak diubah)", async () => {
  baris = BARIS({ tempat_tugas: "GEREJA K", alamat_tugas: "JL K", kelurahan: "TANJUNG SARI" });
  const h = await ubah({ kelurahan: "SEMPAKATA" });
  assert.equal(h.sukses, true, JSON.stringify(h)); // GEREJA K ada di kedua kelurahan -> sewilayah
  assert.ok(penulisan()[0].nilai.includes(22), "tertaut ulang ke ID 22");
});

test("Wilayah sama (tanpa perubahan wilayah) dan pilih rumah ibadah sewilayah tetap diterima (regresi)", async () => {
  baris = BARIS({ tempat_tugas: "GEREJA LAMA", alamat_tugas: "JL LAMA" });
  const h = await ubah({ tempat_tugas: "GEREJA D", alamat_tugas: "JL A" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.equal(penulisan().length, 1);
});

// ============================== Audit konsistensi dengan formulir input (2026-11-06) ==============================
const bersih = () => { capil = []; statusLama = []; };

test("Kolom WAJIB tidak boleh dikosongkan (formulir input mewajibkan semuanya), tanpa menulis", async () => {
  const kolom = ["jenis_kelamin", "tempat_lahir", "alamat", "nama_rekening", "nomor_rekening", "kantor_cabang", "no_kontak", "status_bpjs_tk"];
  for (const k of kolom) {
    baris = BARIS(); bersih();
    const h = await ubah({ [k]: "" });
    assert.equal(h.sukses, false, k + " " + JSON.stringify(h));
    assert.match(h.pesan, /wajib diisi/, k);
    assert.equal(penulisan().length, 0, k);
  }
  for (const k of ["tempat_tugas", "alamat_tugas"]) {
    baris = BARIS(); bersih();
    const h = await ubah({ [k]: "" });
    assert.equal(h.sukses, false, k + " " + JSON.stringify(h));
    assert.equal(penulisan().length, 0, k);
  }
});

test("No. kontak: harus 08 + angka, 10-13 digit (sama dengan formulir input)", async () => {
  for (const ok of ["0812345678", "08123456789", "081234567890", "0812345678901"]) {
    baris = BARIS(); bersih();
    assert.equal((await ubah({ no_kontak: ok })).sukses, true, ok);
  }
  for (const buruk of ["0899", "628123456789", "081234 567890", "08123456789012", "0812-3456-7890", "+6281234567890", "abc"]) {
    baris = BARIS(); bersih();
    const h = await ubah({ no_kontak: buruk });
    assert.equal(h.sukses, false, buruk);
    assert.equal(penulisan().length, 0, buruk);
  }
});

test("Nomor rekening: 14 digit ANGKA; huruf atau panjang salah ditolak", async () => {
  baris = BARIS(); bersih();
  assert.equal((await ubah({ nomor_rekening: "98765432109876" })).sukses, true);
  for (const buruk of ["1234567890123", "123456789012345", "1234567890123A", "1234 5678901234"]) {
    baris = BARIS(); bersih();
    const h = await ubah({ nomor_rekening: buruk });
    assert.equal(h.sukses, false, buruk);
    assert.match(h.pesan, /14 digit angka|terlalu panjang/, buruk);
  }
});

test("Jenis kelamin dan Status BPJS hanya pilihan baku formulir input", async () => {
  baris = BARIS(); bersih();
  assert.equal((await ubah({ jenis_kelamin: "PEREMPUAN" })).sukses, true);
  baris = BARIS(); bersih();
  assert.equal((await ubah({ jenis_kelamin: "LAIN" })).sukses, false);
  baris = BARIS(); bersih();
  assert.equal((await ubah({ status_bpjs_tk: "ADA" })).sukses, false);
  baris = BARIS({ status_bpjs_tk: "TIDAK" }); bersih();
  assert.equal((await ubah({ status_bpjs_tk: "YA" })).sukses, true);
});

test("Panjang maksimum sama dengan formulir input (100; kontak 13), nilai 100 karakter masih sah", async () => {
  const seratus = "A".repeat(100);
  for (const k of ["nama", "tempat_lahir", "alamat", "nama_rekening", "kantor_cabang"]) {
    baris = BARIS(); bersih();
    assert.equal((await ubah({ [k]: seratus })).sukses, true, k + " 100");
    baris = BARIS(); bersih();
    const h = await ubah({ [k]: seratus + "B" });
    assert.equal(h.sukses, false, k + " 101");
    assert.match(h.pesan, /terlalu panjang/, k);
  }
});

test("NIK BARU yang terdaftar di arsip tahun lalu dengan status bukan AKTIF (mis. HASIL MONEV) ditolak, tanpa menulis", async () => {
  baris = BARIS(); bersih();
  statusLama = [{ tahun: 2026, nama: "ORANG LAIN", layanan: "GURU MAGHRIB MENGAJI", status_verifikasi: "HASIL MONEV TAHUN 2026" }];
  const h = await ubah({ nik: "3210172512990041" });
  assert.equal(h.sukses, false, JSON.stringify(h));
  assert.match(h.pesan, /TERDAFTAR DI DATA 2026 DENGAN STATUS: HASIL MONEV TAHUN 2026/);
  assert.equal(penulisan().length, 0);
});

test("NIK BARU berdomisili luar Kota Medan (Capil) ditolak; NIK arsip berstatus AKTIF diterima", async () => {
  baris = BARIS(); bersih();
  capil = [{ nama: "X", nik: "3210172512990041", status: "A", alamat_domisili: "JL", kab_kota_domisili: "KOTA BINJAI" }];
  const h = await ubah({ nik: "3210172512990041" });
  assert.equal(h.sukses, false, JSON.stringify(h));
  assert.match(h.pesan, /DI LUAR KOTA MEDAN: KOTA BINJAI/);
  baris = BARIS(); bersih();
  statusLama = [{ tahun: 2026, nama: "ORANG", layanan: "IMAM MASJID", status_verifikasi: "AKTIF" }];
  const ok = await ubah({ nik: "3210172512990041" });
  assert.equal(ok.sukses, true, JSON.stringify(ok));
});

test("NIK yang TIDAK berubah tidak diperiksa ulang (data lama yang NIK-nya berstatus lama tetap bisa diedit)", async () => {
  baris = BARIS(); bersih();
  statusLama = [{ tahun: 2026, nama: "ORANG", layanan: "IMAM MASJID", status_verifikasi: "MENINGGAL DUNIA" }];
  const h = await ubah({ nik: baris.nik, nama: "BUDI" });
  assert.equal(h.sukses, true, JSON.stringify(h));
});
