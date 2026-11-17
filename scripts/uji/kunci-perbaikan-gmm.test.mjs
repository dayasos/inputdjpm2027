// Kunci SEMENTARA perbaikan data Guru Maghrib Mengaji oleh petugas lapangan (selama Tahap B penanda koordinat dikerjakan). Hapus uji ini bersama kuncinya.
// Menjalankan kode server APA ADANYA (dibundel; tanpa Deno) dengan database tiruan. Jalankan: npm run uji:kunci-gmm
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { db, muatServer } from "./_harness-server.mjs";

const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const penerima = await muatServer("supabase/functions/api/domains/penerima.ts");
const verifikasi = await muatServer("supabase/functions/api/domains/verifikasi.ts");
const kunci = await muatServer("supabase/functions/api/_shared/kunciSementara.ts");

const PESAN = kunci.PESAN_PERBAIKAN_GMM_DIKUNCI;
const SESI = {
  GMM: { akun_id: "a3", username: "gmm_timur", role: "GURU MAGHRIB MENGAJI", kecamatan: "MEDAN TIMUR", user_id: "GMM MEDAN TIMUR" },
  UTAMA: { akun_id: "a1", username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN" },
  KEMENAG_LAIN: { akun_id: "a4", username: "gsm_x", role: "GURU SEKOLAH MINGGU", kecamatan: "MEDAN TIMUR", user_id: "GSM X" },
};
const BARIS = (lay) => ({
  id: 1, tahun: 2027, nama: "ANI", nik: "1271010101900001", layanan: lay, tempat_tugas: "RUMAH", alamat_tugas: "JL Y", kecamatan: "MEDAN TIMUR", kelurahan: "X",
  status_verifikasi: "Berkas Tidak Lengkap", keterangan_verifikasi: "Koordinat tidak valid", link_koordinat_lokasi: "https://maps.app.goo.gl/x", dibuat_oleh_akun_id: null,
});
let sesiAktif = SESI.GMM, barisAktif = BARIS("GURU MAGHRIB MENGAJI"), tokenAktif = "tok-gmm";   // sesi di-cache menurut token: token berbeda per peran
function pasang() {
  db().panggilan.length = 0;
  db().handler = (q) => {
    if (q.includes("from sesi_login")) return [sesiAktif];
    if (q.includes("from penerima where id") || q.includes("select * from penerima where id")) return [barisAktif];
    if (q.includes("update penerima set")) return [{ id: 1 }];
    return [];
  };
}
const kunciAktif = (aktif) => { globalThis.Deno = { env: { get: (k) => (k === "KUNCI_PERBAIKAN_GMM" && !aktif ? "off" : undefined) } }; };
const menulis = () => db().panggilan.filter((p) => /update penerima|insert into/i.test(p.teks));
const edit = () => penerima.editDataPenerima(tokenAktif, 1, { teks: { 31: "https://maps.google.com/?q=3.6,98.67" }, berkas: {}, idFolderBerkas: "" });
const lapor = () => verifikasi.laporkanPerbaikanBerkas(tokenAktif, 1);

test("FUNGSI KUNCI: hanya data GMM dan hanya selain Admin Utama; huruf besar/kecil dan spasi diabaikan; dapat dimatikan lewat lingkungan (uji)", () => {
  kunciAktif(true);
  for (const peran of ["GURU MAGHRIB MENGAJI", "KEMENAG", "KECAMATAN", "MUI", "VERIFIKATOR", "", null]) assert.equal(kunci.perbaikanGmmDikunci(peran, "GURU MAGHRIB MENGAJI"), true, String(peran));
  assert.equal(kunci.perbaikanGmmDikunci("  guru maghrib mengaji ", " guru maghrib mengaji "), true);
  for (const peran of ["UTAMA", "utama", " Utama "]) assert.equal(kunci.perbaikanGmmDikunci(peran, "GURU MAGHRIB MENGAJI"), false, peran);
  for (const lay of ["GURU SEKOLAH MINGGU", "IMAM MASJID", "", null, undefined]) assert.equal(kunci.perbaikanGmmDikunci("GURU MAGHRIB MENGAJI", lay), false, String(lay));
  kunciAktif(false);
  assert.equal(kunci.perbaikanGmmDikunci("GURU MAGHRIB MENGAJI", "GURU MAGHRIB MENGAJI"), false);
  kunciAktif(true);
});

test("PESAN: menyebut maintenance dan menyuruh menunggu pengumuman", () => {
  assert.match(PESAN, /belum dapat dilakukan/); assert.match(PESAN, /maintenance/); assert.match(PESAN, /pengumuman/);
});

test("EDIT DATA: petugas GMM pada data GMM DITOLAK dengan pesan maintenance dan tidak ada yang ditulis", async () => {
  kunciAktif(true); sesiAktif = SESI.GMM; tokenAktif = "tok-gmm"; barisAktif = BARIS("GURU MAGHRIB MENGAJI"); pasang();
  const r = await edit();
  assert.equal(r.sukses, false); assert.equal(r.pesan, PESAN);
  assert.equal(menulis().length, 0, "tidak ada penulisan: " + JSON.stringify(menulis().map((x) => x.teks.slice(0, 40))));
});

test("LAPOR PERBAIKAN: petugas GMM pada data GMM DITOLAK dengan pesan maintenance dan tidak ada yang ditulis", async () => {
  kunciAktif(true); sesiAktif = SESI.GMM; tokenAktif = "tok-gmm"; barisAktif = BARIS("GURU MAGHRIB MENGAJI"); pasang();
  const r = await lapor();
  assert.equal(r.sukses, false); assert.equal(r.pesan, PESAN);
  assert.equal(menulis().length, 0);
});

test("TIDAK TERKENA: Admin Utama (edit dan lapor tidak ditolak oleh kunci); layanan lain (petugas GSM)", async () => {
  kunciAktif(true);
  sesiAktif = SESI.UTAMA; tokenAktif = "tok-utama"; barisAktif = BARIS("GURU MAGHRIB MENGAJI"); pasang();
  assert.notEqual((await edit()).pesan, PESAN); assert.notEqual((await lapor()).pesan, PESAN);
  sesiAktif = SESI.KEMENAG_LAIN; tokenAktif = "tok-gsm"; barisAktif = BARIS("GURU SEKOLAH MINGGU"); pasang();
  assert.notEqual((await edit()).pesan, PESAN); assert.notEqual((await lapor()).pesan, PESAN);
});

test("KUNCI MATI (uji): tanpa kunci perilaku lama kembali (petugas GMM tidak ditolak oleh kunci)", async () => {
  kunciAktif(false); sesiAktif = SESI.GMM; tokenAktif = "tok-gmm"; barisAktif = BARIS("GURU MAGHRIB MENGAJI"); pasang();
  assert.notEqual((await edit()).pesan, PESAN); assert.notEqual((await lapor()).pesan, PESAN);
  kunciAktif(true);
});

test("KABEL: kunci dipasang di Edit Data dan Lapor perbaikan SEBELUM penulisan; berkas penanda hanya satu; harness uji mematikan kunci secara bawaan", () => {
  const p = baca("supabase/functions/api/domains/penerima.ts"), v = baca("supabase/functions/api/domains/verifikasi.ts");
  assert.ok(p.indexOf("perbaikanGmmDikunci(sesi.role, rowLama.layanan)") > 0 && p.indexOf("perbaikanGmmDikunci(sesi.role, rowLama.layanan)") < p.indexOf("const teks = editData.teks"));
  assert.ok(v.indexOf("perbaikanGmmDikunci(sesi.role, rowCek.layanan)") > 0 && v.indexOf("perbaikanGmmDikunci(sesi.role, rowCek.layanan)") < v.indexOf("const namaPelapor"));
  assert.match(baca("supabase/functions/api/_shared/kunciSementara.ts"), /KUNCI_PERBAIKAN_GMM"\) === "off"/);
  assert.match(baca("scripts/uji/_harness-server.mjs"), /KUNCI_PERBAIKAN_GMM/);
});
