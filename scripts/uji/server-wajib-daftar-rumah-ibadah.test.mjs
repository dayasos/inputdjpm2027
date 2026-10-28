// Uji penutupan celah "tempat tugas layanan wajib-daftar harus persis rumah ibadah terdaftar":
//   (1) input baru oleh Admin Utama (tentukanWilayahTugas), (2) Lihat Data -> Edit (editDataPenerima),
//   (3) Kelola Data (adminUbahData) -- termasuk jalan pintas "ubah layanan" (kasus Syafri Koto: Bilal Jenazah -> Nazir Masjid).
// Menjalankan kode server APA ADANYA (dibundel; tanpa Deno) dengan database tiruan; data KARANGAN, tanpa koneksi database/jaringan.
// Jalankan: npm run uji:wajib-daftar-ri     (Node 24+)
import test from "node:test";
import assert from "node:assert/strict";
import { db, muatServer } from "./_harness-server.mjs";
import { muatWilayahTugas } from "./_harness-wilayah.mjs";

const kelola = await muatServer("supabase/functions/api/domains/kelolaData.ts");
const penerima = await muatServer("supabase/functions/api/domains/penerima.ts");
const { tentukanWilayahTugas, state: stateWilayah } = await muatWilayahTugas();

const WAJIB = [
  "IMAM MASJID", "KHATIB JUMAT", "NAZIR MASJID", "NAZIR MUSHOLLA", "PENGURUS GEREJA", "PENGURUS VIHARA/KLENTENG/KUIL",
  "PETUGAS GEREJA KATOLIK", "GURU SEKOLAH BUDDHA", "GURU SEKOLAH HINDU", "GURU SEKOLAH KONG HU CHU", "GURU SEKOLAH MINGGU", "PENATUA GEREJA",
];
const BEBAS = ["BILAL JENAZAH", "PENGGALI KUBUR", "GURU MAGHRIB MENGAJI", "USTADZ", "USTADZAH"];

// ============================== (1) tentukanWilayahTugas: input baru oleh Admin Utama ==============================
function aturWilayah() {
  stateWilayah.wilayah = new Set(["MEDAN SELAYANG|TANJUNG SARI"]);
  stateWilayah.rumahIbadah = [{ nama: "GEREJA D", kecamatan: "MEDAN SELAYANG", kelurahan: "TANJUNG SARI", alamat: "JL A" }];
}
const UTAMA = { role: "UTAMA", kecamatan: "", userId: "admin" };
const input = (layanan, tempatTugas, alamatTugas = "JL A") =>
  tentukanWilayahTugas({ sesi: UTAMA, layanan, tempatTugas, alamatTugas, kecamatan: "MEDAN SELAYANG", kelurahan: "TANJUNG SARI" });

test("Input baru UTAMA: SETIAP layanan wajib-daftar menolak tempat tugas yang tidak ada di daftar (celah lama)", async () => {
  aturWilayah();
  for (const lay of WAJIB) {
    const h = await input(lay, "GEREJA KETIKAN BEBAS");
    assert.equal(h.ok, false, lay);
    assert.match(h.pesan, /wajib dipilih dari daftar rumah ibadah/, lay);
  }
});

test("Input baru UTAMA: nama sama tetapi ALAMAT beda tetap ditolak; nama + alamat persis diterima", async () => {
  aturWilayah();
  assert.equal((await input("PENGURUS GEREJA", "GEREJA D", "JL LAIN")).ok, false);
  const ok = await input("PENGURUS GEREJA", "GEREJA D", "JL A");
  assert.equal(ok.ok, true);
  assert.equal(ok.kelurahan, "TANJUNG SARI");
});

test("Input baru UTAMA: layanan yang punya opsi RUMAH/LAINNYA tidak terpengaruh (regresi)", async () => {
  aturWilayah();
  for (const lay of BEBAS) {
    const h = await input(lay, "RUMAH", "JL BEBAS");
    assert.equal(h.ok, true, lay);
  }
});

// ============================== database tiruan untuk edit data & Kelola Data ==============================
const RUMAH_IBADAH = [{ nama: "GEREJA D", kecamatan: "MEDAN SELAYANG", kelurahan: "TANJUNG SARI", alamat: "JL A" }];
const WILAYAH = new Set(["MEDAN SELAYANG|TANJUNG SARI", "MEDAN SELAYANG|SEMPAKATA"]);
const BARIS = (lebih = {}) => ({
  id: 1, tahun: 2027, nomor_urut: 1, nama: "ANDI", nik: "1271010101900001", jenis_kelamin: "LAKI-LAKI", tempat_lahir: "MEDAN",
  tanggal_lahir: new Date("1989-02-04T00:00:00Z"), alamat: "JL X", layanan: "PENGURUS GEREJA", tempat_tugas: "GEREJA D",
  alamat_tugas: "JL A", kecamatan: "MEDAN SELAYANG", kelurahan: "TANJUNG SARI", nama_rekening: "A", nomor_rekening: "12345678901234",
  kantor_cabang: "B", no_kontak: "0812345678", status_bpjs_tk: "YA", umur: 37, status_verifikasi: "Memenuhi Syarat",
  diperbarui_at: new Date("2026-10-26T00:00:00Z"), dibuat_oleh_akun_id: null, id_folder_berkas: "x", ...lebih,
});
let baris = BARIS();
let sesi = { akun_id: "a1", username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN" };

function pasang() {
  db().panggilan.length = 0;
  db().handler = (q, v) => {
    if (q.includes("from sesi_login")) return [sesi];
    if (q.includes("from rumah_ibadah")) return RUMAH_IBADAH.filter((r) => r.nama === v[0]);
    if (q.includes("select * from penerima where id")) return [baris];
    if (q.includes("from wilayah")) return WILAYAH.has(String(v[0]).toUpperCase().trim() + "|" + String(v[1]).toUpperCase().trim()) ? [{ ada: 1 }] : [];
    if (q.includes("from kuota")) return [{ kuota_maks: 100 }];
    if (q.includes("count(*)::int as n")) return [{ n: 0 }];
    return [];
  };
}
const penulisan = () => db().panggilan.filter((p) => p.teks.startsWith("UNSAFE update penerima"));
const token = (() => { let n = 0; return () => "token-wd-" + (++n); })();

// ============================== (3) Kelola Data ==============================
const ubah = async (perubahan) => { sesi = { akun_id: "a1", username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN" }; pasang(); return await kelola.adminUbahData(token(), 1, 2027, perubahan); };

test("Kelola Data: ubah LAYANAN ke layanan wajib-daftar dengan tempat tugas ketikan bebas ditolak (kasus Syafri Koto), tanpa menulis", async () => {
  baris = BARIS({ layanan: "BILAL JENAZAH", tempat_tugas: "MESJID BAKTI", alamat_tugas: "JL DENAI GG MESJID" });
  const h = await ubah({ layanan: "IMAM MASJID" });
  assert.equal(h.sukses, false, JSON.stringify(h));
  assert.match(h.pesan, /tidak ada di daftar rumah ibadah/);
  assert.match(h.pesan, /IMAM MASJID/);
  assert.equal(penulisan().length, 0);
});

test("Kelola Data: ubah layanan ke layanan wajib-daftar diterima bila tempat + alamat persis rumah ibadah terdaftar", async () => {
  baris = BARIS({ layanan: "BILAL JENAZAH", tempat_tugas: "GEREJA D", alamat_tugas: "JL A" });
  const h = await ubah({ layanan: "PENGURUS GEREJA" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.equal(penulisan().length, 1);
});

test("Kelola Data: ubah tempat tugas / alamat tugas layanan wajib-daftar ke yang tidak terdaftar ditolak; ke yang terdaftar diterima", async () => {
  baris = BARIS({ tempat_tugas: "GEREJA D", alamat_tugas: "JL A" });
  for (const p of [{ tempat_tugas: "GEREJA BARU" }, { alamat_tugas: "JL LAIN" }, { tempat_tugas: "GEREJA BARU", alamat_tugas: "JL LAIN" }]) {
    const h = await ubah(p);
    assert.equal(h.sukses, false, JSON.stringify(p));
    assert.equal(penulisan().length, 0, JSON.stringify(p));
  }
  baris = BARIS({ tempat_tugas: "GEREJA LAMA", alamat_tugas: "JL LAMA" });
  const ok = await ubah({ tempat_tugas: "GEREJA D", alamat_tugas: "JL A" });
  assert.equal(ok.sukses, true, JSON.stringify(ok));
});

test("Kelola Data: data lama yang tidak cocok TIDAK memblokir perubahan kolom lain (hanya dicek bila tempat/alamat/layanan diubah)", async () => {
  baris = BARIS({ tempat_tugas: "MESJID BAKTI", alamat_tugas: "JL DENAI GG MESJID" });
  const h = await ubah({ nama: "BUDI" });
  assert.equal(h.sukses, true, JSON.stringify(h));
});

test("Kelola Data: layanan yang boleh ketik bebas (Bilal Jenazah / Guru Maghrib Mengaji) tetap bebas mengubah tempat tugas", async () => {
  for (const lay of ["BILAL JENAZAH", "GURU MAGHRIB MENGAJI"]) {
    baris = BARIS({ layanan: lay, tempat_tugas: "RUMAH", alamat_tugas: "JL A" });
    const h = await ubah({ tempat_tugas: "MUSHOLLA BEBAS", alamat_tugas: "JL BEBAS" });
    assert.equal(h.sukses, true, lay + " " + JSON.stringify(h));
  }
});

// ============================== (2) Lihat Data -> Edit ==============================
const edit = async (teks, peran = "UTAMA") => {
  sesi = peran === "UTAMA"
    ? { akun_id: "a1", username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN" }
    : { akun_id: "a2", username: "kec", role: "KECAMATAN", kecamatan: "MEDAN SELAYANG", user_id: "KECAMATAN MEDAN SELAYANG" };
  pasang();
  return await penerima.editDataPenerima(token(), 1, { teks, berkas: {}, idFolderBerkas: "" });
};

for (const peran of ["UTAMA", "KECAMATAN"]) {
  test(`Edit data [${peran}]: ubah tempat/alamat tugas layanan wajib-daftar ke yang tidak terdaftar ditolak, tanpa menulis`, async () => {
    baris = BARIS({ layanan: "PENGURUS GEREJA" });
    for (const teks of [{ 8: "GEREJA KETIKAN BEBAS" }, { 9: "JL LAIN" }, { 8: "GEREJA BARU", 9: "JL BARU" }]) {
      const h = await edit(teks, peran);
      assert.equal(h.sukses, false, `[${peran}] ${JSON.stringify(teks)}`);
      assert.match(h.pesan, /tidak ada di daftar rumah ibadah/);
      assert.equal(penulisan().length, 0);
    }
  });

  test(`Edit data [${peran}]: pindah ke rumah ibadah yang terdaftar (nama + alamat persis) diterima`, async () => {
    baris = BARIS({ layanan: "PENGURUS GEREJA", tempat_tugas: "GEREJA LAMA", alamat_tugas: "JL LAMA" });
    const h = await edit({ 8: "GEREJA D", 9: "JL A" }, peran);
    assert.equal(h.sukses, true, JSON.stringify(h));
    assert.equal(penulisan().length, 1);
  });

  test(`Edit data [${peran}]: data lama yang tidak cocok tetap bisa diedit kolom lainnya (tidak tiba-tiba gagal)`, async () => {
    baris = BARIS({ layanan: "PENGURUS GEREJA", tempat_tugas: "GEREJA KETIKAN LAMA", alamat_tugas: "JL LAMA" });
    const h = await edit({ 1: "BUDI" }, peran);
    assert.equal(h.sukses, true, JSON.stringify(h));
  });
}

test("Edit data: layanan yang boleh ketik bebas (Guru Maghrib Mengaji) tetap bebas mengubah tempat tugas", async () => {
  baris = BARIS({ layanan: "GURU MAGHRIB MENGAJI", tempat_tugas: "RUMAH", alamat_tugas: "JL A" });
  const h = await edit({ 8: "PANTI ASUHAN", 9: "JL BEBAS" }, "UTAMA");
  assert.equal(h.sukses, true, JSON.stringify(h));
});
