// Nama petugas pada verifikasi rekomendasi MUI (simpanCatatanRekomendasiMui di penerima.ts) dengan database tiruan.
// Latar: kode lama membaca `sesi.nama_lengkap` / `sesi.user_id` -- properti yang TIDAK ada di DataSesi -- sehingga nama yang
// tersimpan selalu cadangan terakhir ("MUI Kota Medan" untuk MUI, username untuk Admin Utama). Kini nama diambil dari tabel `akun`.
// Menjalankan kode server APA ADANYA (dibundel; tanpa Deno). Jalankan: npm run uji:rekom-mui-petugas.
import test from "node:test";
import assert from "node:assert/strict";
import { db, muatServer } from "./_harness-server.mjs";

const penerima = await muatServer("supabase/functions/api/domains/penerima.ts");

let sesiDb = null;      // baris sesi_login yang dikembalikan (bentuk kolom DB, dibaca sesi.ts)
let akunDb = null;      // baris akun { nama_lengkap } atau null (tidak ada)
let gagalBacaAkun = false;
let layanan = "USTADZ";

function pasang() {
  db().panggilan.length = 0;
  db().handler = (q) => {
    if (q.includes("from sesi_login")) return [sesiDb];
    if (q.includes("from akun where id")) {
      if (gagalBacaAkun) throw new Error("uji: pembacaan akun sengaja gagal");
      return akunDb ? [akunDb] : [];
    }
    if (q.includes("select id, layanan from penerima")) return [{ id: 7, layanan }];
    return [];
  };
}
const penulisan = () => db().panggilan.filter((p) => p.teks.includes("update penerima set"));
const sesiBaru = (o) => ({ akun_id: "akun-1", username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN UTAMA DEDI", ...o });
let n = 0;
const jalankan = async (status = "SESUAI", catatan = "") => { pasang(); return await penerima.simpanCatatanRekomendasiMui("token-" + (++n), 7, status, catatan); };
// nilai yang ditulis: [status, catatan, waktu, petugas, id, tahun]
const petugasTertulis = () => penulisan()[0].nilai[3];

test("BUG LAMA: Admin Utama dengan nama lengkap tercatat memakai NAMA LENGKAP (bukan username)", async () => {
  sesiDb = sesiBaru({ username: "admin", role: "UTAMA", user_id: "ADMIN UTAMA DEDI" });
  akunDb = { nama_lengkap: "DEDI ARMANSYAH" }; gagalBacaAkun = false; layanan = "USTADZ";
  const r = await jalankan();
  assert.equal(r.sukses, true, JSON.stringify(r));
  assert.equal(r.petugas, "DEDI ARMANSYAH");
  assert.equal(petugasTertulis(), "DEDI ARMANSYAH");
  assert.equal(penulisan().length, 1, "tepat satu penulisan");
});

test("AKUN MUI: nama lengkap akun dipakai (hasil sama dengan perilaku kebetulan sebelumnya)", async () => {
  sesiDb = sesiBaru({ username: "mui_medan", role: "MUI", user_id: "MUI KOTA MEDAN" });
  akunDb = { nama_lengkap: "MUI Kota Medan" }; gagalBacaAkun = false;
  const r = await jalankan("PERLU_KOREKSI", "NIK tidak sesuai");
  assert.equal(r.sukses, true, JSON.stringify(r));
  assert.equal(r.petugas, "MUI Kota Medan");
  assert.equal(petugasTertulis(), "MUI Kota Medan");
});

test("NAMA KOSONG: pakai label userId, lalu username (UTAMA) atau 'MUI Kota Medan' (MUI)", async () => {
  gagalBacaAkun = false;
  sesiDb = sesiBaru({ username: "dinsos_evi", role: "UTAMA", user_id: "ADMIN UTAMA EVI" }); akunDb = { nama_lengkap: "" };
  assert.equal((await jalankan()).petugas, "ADMIN UTAMA EVI", "nama kosong -> label userId");
  sesiDb = sesiBaru({ username: "kabid_dayasos", role: "UTAMA", user_id: "" }); akunDb = { nama_lengkap: "   " };
  assert.equal((await jalankan()).petugas, "kabid_dayasos", "nama spasi + userId kosong -> username");
  sesiDb = sesiBaru({ username: "mui_medan", role: "MUI", user_id: "" }); akunDb = { nama_lengkap: "" };
  assert.equal((await jalankan()).petugas, "MUI Kota Medan", "MUI tanpa nama & label -> cadangan MUI");
  sesiDb = sesiBaru({ username: "", role: "UTAMA", user_id: "" }); akunDb = null;
  assert.equal((await jalankan()).petugas, "Admin Utama", "akun tak ditemukan -> cadangan terakhir");
});

test("NAMA DIPANGKAS: spasi di tepi nama lengkap dibuang", async () => {
  sesiDb = sesiBaru({ username: "admin", role: "UTAMA" }); akunDb = { nama_lengkap: "  DEDI ARMANSYAH  " }; gagalBacaAkun = false;
  assert.equal((await jalankan()).petugas, "DEDI ARMANSYAH");
});

test("KETAHANAN: pembacaan akun gagal TIDAK menggagalkan verifikasi; pakai label/cadangan", async () => {
  sesiDb = sesiBaru({ username: "admin", role: "UTAMA", user_id: "ADMIN UTAMA DEDI" }); akunDb = { nama_lengkap: "DEDI ARMANSYAH" }; gagalBacaAkun = true;
  const r = await jalankan();
  assert.equal(r.sukses, true, JSON.stringify(r));
  assert.equal(r.petugas, "ADMIN UTAMA DEDI");
  assert.equal(penulisan().length, 1);
  gagalBacaAkun = false;
});

test("REGRESI: aturan lama utuh -- peran lain ditolak, layanan non-Ustadz ditolak, status/catatan divalidasi, tanpa menulis", async () => {
  gagalBacaAkun = false; akunDb = { nama_lengkap: "X" };
  sesiDb = sesiBaru({ role: "KECAMATAN", username: "kec1" });
  let r = await jalankan(); assert.equal(r.sukses, false); assert.match(r.pesan, /hanya akun MUI dan Admin Utama/);
  assert.equal(penulisan().length, 0);
  sesiDb = sesiBaru({ role: "UTAMA" }); layanan = "IMAM MASJID";
  r = await jalankan(); assert.equal(r.sukses, false); assert.match(r.pesan, /hanya berlaku untuk layanan Ustadz atau Ustadzah/);
  assert.equal(penulisan().length, 0);
  layanan = "USTADZAH";
  r = await jalankan("ASAL"); assert.equal(r.sukses, false); assert.match(r.pesan, /Status rekomendasi MUI tidak valid/);
  r = await jalankan("PERLU_KOREKSI", ""); assert.equal(r.sukses, false); assert.match(r.pesan, /Catatan verifikasi wajib diisi/);
  assert.equal(penulisan().length, 0);
  r = await jalankan("SESUAI", ""); assert.equal(r.sukses, true, JSON.stringify(r));
  assert.equal(penulisan().length, 1);
  layanan = "USTADZ";
});

test("TAHUN: penulisan hanya ke baris tahun aktif; nama petugas tidak masuk ke tempat lain", async () => {
  sesiDb = sesiBaru({}); akunDb = { nama_lengkap: "DEDI ARMANSYAH" }; gagalBacaAkun = false;
  await jalankan();
  const w = penulisan()[0];
  assert.equal(w.nilai[4], 7, "id baris");
  assert.equal(w.nilai[5], 2027, "tahun aktif");
  assert.equal(db().panggilan.filter((p) => /^\s*(insert|delete)/i.test(p.teks)).length, 0, "tidak ada sisip/hapus");
});
