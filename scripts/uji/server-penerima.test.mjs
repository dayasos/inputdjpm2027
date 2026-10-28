// Uji PERILAKU kode server yang diubah (adminUbahData di kelolaData.ts, editDataPenerima di penerima.ts) dengan database tiruan.
// Plan: plans/plan-perbaikan-validasi-data-penerima.md (P1/P3). Menjalankan kode server APA ADANYA (dibundel; tanpa Deno).
// Jalankan: npm run uji:validasi-penerima     (Node 24+; tanpa koneksi database/jaringan).
import test from "node:test";
import assert from "node:assert/strict";
import { db, muatServer } from "./_harness-server.mjs";

const kelola = await muatServer("supabase/functions/api/domains/kelolaData.ts");
const penerima = await muatServer("supabase/functions/api/domains/penerima.ts");

const WILAYAH = new Set(["MEDAN SELAYANG|TANJUNG SARI", "MEDAN SELAYANG|SEMPAKATA", "MEDAN BELAWAN|BELAWAN BAHARI", "MEDAN BELAWAN|BELAWAN II"]);
const BARIS_SEHAT = () => ({
  id: 1, tahun: 2027, nomor_urut: 1575, nama: "ANDI", nik: "1271010101900001", jenis_kelamin: "LAKI-LAKI", tempat_lahir: "MEDAN",
  tanggal_lahir: new Date("1989-02-04T00:00:00Z"), alamat: "JL X", layanan: "GURU MAGHRIB MENGAJI", tempat_tugas: "MUSHOLLA X",
  alamat_tugas: "JL Y", kecamatan: "MEDAN SELAYANG", kelurahan: "TANJUNG SARI", nama_rekening: "A", nomor_rekening: "12345678901234",
  kantor_cabang: "B", no_kontak: "0812345678", status_bpjs_tk: "YA", umur: 37, status_verifikasi: "Memenuhi Syarat",
  diperbarui_at: new Date("2026-10-26T00:00:00Z"), dibuat_oleh_akun_id: null, id_folder_berkas: "x",
});
let baris = BARIS_SEHAT();
let sesi = { akun_id: "a1", username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN" };

function pasang() {
  db().panggilan.length = 0;
  db().handler = (q, v) => {
    if (q.includes("from sesi_login")) return [sesi];
    if (q.includes("from penerima where id") || q.includes("select * from penerima where id")) return [baris];
    if (q.includes("from wilayah")) return WILAYAH.has(String(v[0]).toUpperCase().trim() + "|" + String(v[1]).toUpperCase().trim()) ? [{ ada: 1 }] : [];
    if (q.includes("from kuota")) return [{ kuota_maks: 100 }];
    if (q.includes("count(*)::int as n")) return [{ n: 0 }];
    return [];
  };
}
const penulisan = () => db().panggilan.filter((p) => p.teks.startsWith("UNSAFE update penerima"));
const tokenSeq = (() => { let n = 0; return () => "token-" + (++n); })();

// ============================== adminUbahData (Kelola Data) ==============================
const ubah = async (perubahan, token = tokenSeq()) => { pasang(); return await kelola.adminUbahData(token, 1, 2027, perubahan); };

test("Kelola Data: tanggal lahir 0199 / 199 / 31-02 / kosong ditolak, TANPA menulis ke database", async () => {
  baris = BARIS_SEHAT(); sesi = { ...sesi, role: "UTAMA" };
  const kasus = [["04-02-0199", /tidak wajar/], ["04-02-199", /4 digit/], ["31-02-1990", /tidak valid/], ["", /wajib diisi/], ["01-01-1900", /tidak wajar/], ["01-01-2999", /tidak wajar/]];
  for (const [nilai, pola] of kasus) {
    const h = await ubah({ tanggal_lahir: nilai });
    assert.equal(h.sukses, false, `"${nilai}" seharusnya ditolak`);
    assert.match(h.pesan, pola, nilai);
    assert.equal(penulisan().length, 0, `"${nilai}" tidak boleh menulis`);
  }
});

test("Kelola Data: tanggal lahir sah disimpan bersama umur yang benar", async () => {
  baris = BARIS_SEHAT();
  const h = await ubah({ tanggal_lahir: "05-02-1989" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  const w = penulisan();
  assert.equal(w.length, 1);
  assert.ok(w[0].teks.includes("tanggal_lahir = $") && w[0].teks.includes("umur = $"));
  assert.ok(w[0].nilai.includes("1989-02-05"), JSON.stringify(w[0].nilai));
  assert.ok(w[0].nilai.includes(37));
});

test("Kelola Data: kelurahan dikosongkan ditolak (kasus nyata No. 902), tanpa menulis", async () => {
  baris = BARIS_SEHAT();
  const h = await ubah({ kelurahan: "" });
  assert.equal(h.sukses, false);
  assert.equal(h.pesan, "GAGAL: Kelurahan wilayah tugas wajib dipilih.");
  assert.equal(penulisan().length, 0);
});

test("Kelola Data: ganti kecamatan TANPA kelurahan ditolak; kelurahan dari kecamatan lain ditolak (aturan lama utuh)", async () => {
  baris = BARIS_SEHAT();
  let h = await ubah({ kecamatan: "MEDAN BELAWAN", kelurahan: "" });
  assert.equal(h.pesan, "GAGAL: Kelurahan wilayah tugas wajib dipilih.");
  h = await ubah({ kecamatan: "MEDAN BELAWAN" });                       // kelurahan lama (TANJUNG SARI) bukan milik Belawan
  assert.equal(h.sukses, false);
  assert.match(h.pesan, /Kelurahan tidak sesuai dengan kecamatan/);
  assert.equal(penulisan().length, 0);
});

test("Kelola Data: ganti kecamatan + kelurahan yang sah berhasil dan menulis keduanya", async () => {
  baris = BARIS_SEHAT();
  const h = await ubah({ kecamatan: "MEDAN BELAWAN", kelurahan: "BELAWAN BAHARI" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  const w = penulisan();
  assert.equal(w.length, 1);
  assert.ok(w[0].nilai.includes("MEDAN BELAWAN") && w[0].nilai.includes("BELAWAN BAHARI"));
});

test("Kelola Data: mengubah KOLOM LAIN pada data lama yang janggal TIDAK diblokir (kelurahan kosong / tanggal 0199 tak diubah)", async () => {
  baris = { ...BARIS_SEHAT(), kelurahan: "" };
  let h = await ubah({ nama: "BUDI" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  baris = { ...BARIS_SEHAT(), tanggal_lahir: new Date("0199-02-04T00:00:00Z"), umur: 1827 };
  h = await ubah({ nama: "BUDI" });
  assert.equal(h.sukses, true, JSON.stringify(h));
});

test("Kelola Data: selain Admin Utama ditolak (gerbang akses utuh)", async () => {
  baris = BARIS_SEHAT(); sesi = { ...sesi, role: "KECAMATAN", kecamatan: "MEDAN SELAYANG" };
  const h = await ubah({ nama: "BUDI" });
  sesi = { ...sesi, role: "UTAMA", kecamatan: "" };
  assert.equal(h.sukses, false);
  assert.equal(penulisan().length, 0);
});

// ============================== editDataPenerima (Lihat Data -> Edit) ==============================
const edit = async (teks, peran = "UTAMA", token = tokenSeq()) => {
  sesi = peran === "UTAMA"
    ? { akun_id: "a1", username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN" }
    : { akun_id: "a2", username: "kec", role: "KECAMATAN", kecamatan: "MEDAN SELAYANG", user_id: "KECAMATAN MEDAN SELAYANG" };
  pasang();
  return await penerima.editDataPenerima(token, 1, { teks, berkas: {}, idFolderBerkas: "" });
};

for (const peran of ["UTAMA", "KECAMATAN"]) {
  // Akun Kecamatan tidak berhak mengedit layanan Kemenag, jadi barisnya berlayanan Kecamatan.
  const dasar = () => (peran === "UTAMA" ? BARIS_SEHAT() : { ...BARIS_SEHAT(), layanan: "PENGURUS GEREJA" });
  test(`Edit data [${peran}]: tanggal lahir 0199/199/31-02/kosong/masa depan ditolak tanpa menulis`, async () => {
    baris = dasar();
    for (const [nilai, pola] of [["04-02-0199", /tidak wajar/], ["04-02-199", /4 digit/], ["31-02-1990", /tidak valid/], ["", /wajib diisi/], ["01-01-2999", /tidak wajar/], ["01-01-1900", /tidak wajar/]]) {
      const h = await edit({ 5: nilai }, peran);
      assert.equal(h.sukses, false, `[${peran}] "${nilai}"`);
      assert.match(h.pesan, pola, nilai);
      assert.equal(penulisan().length, 0);
    }
  });

  test(`Edit data [${peran}]: kelurahan dikosongkan ditolak dengan pesan yang jelas (semua peran, termasuk Admin Utama)`, async () => {
    baris = dasar();
    const h = await edit({ 11: "" }, peran);
    assert.equal(h.sukses, false);
    assert.equal(h.pesan, "GAGAL: Kelurahan wilayah tugas wajib dipilih.");
    assert.equal(penulisan().length, 0);
  });

  test(`Edit data [${peran}]: kelurahan yang bukan milik kecamatannya ditolak`, async () => {
    baris = dasar();
    const h = await edit({ 11: "BELAWAN BAHARI" }, peran);
    assert.equal(h.sukses, false);
    assert.match(h.pesan, /tidak berada di Kecamatan MEDAN SELAYANG/);
    assert.equal(penulisan().length, 0);
  });

  test(`Edit data [${peran}]: kelurahan sah dan tanggal sah disimpan`, async () => {
    baris = dasar();
    let h = await edit({ 11: "SEMPAKATA" }, peran);
    assert.equal(h.sukses, true, JSON.stringify(h));
    assert.ok(penulisan()[0].nilai.includes("SEMPAKATA"));
    h = await edit({ 5: "05-02-1989" }, peran);
    assert.equal(h.sukses, true, JSON.stringify(h));
    const w = penulisan().slice(-1)[0];
    assert.ok(w.nilai.includes("1989-02-05") && w.nilai.includes(37));
  });

  test(`Edit data [${peran}]: kolom lain pada data lama yang janggal tetap bisa diubah (tidak tiba-tiba gagal)`, async () => {
    baris = { ...dasar(), kelurahan: "", tanggal_lahir: new Date("0199-02-04T00:00:00Z"), umur: 1827 };
    const h = await edit({ 1: "BUDI" }, peran);
    assert.equal(h.sukses, true, JSON.stringify(h));
  });
}
