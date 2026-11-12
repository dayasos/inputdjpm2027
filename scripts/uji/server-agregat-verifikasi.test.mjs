// Uji aksi server agregat verifikasi (cakupan per peran, baca-saja, tanpa data pribadi, Excel). Rencana: plans/plan-agregat-verifikator.md
// Menjalankan kode server APA ADANYA (dibundel; tanpa Deno) dengan database tiruan; data KARANGAN. Jalankan: npm run uji:agregat-server
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { db, muatServer } from "./_harness-server.mjs";
import { AKSI_VERIFIKATOR } from "../../supabase/functions/api/_shared/gerbangPeran.ts";

const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const agregat = await muatServer("supabase/functions/api/domains/agregatVerifikasi.ts");

const SESI = {
  UTAMA: { akun_id: "u1", username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN" },
  KOORD1: { akun_id: "a1", username: "verif_a1", role: "VERIFIKATOR", kecamatan: "", user_id: "" },
  ANGGOTA1: { akun_id: "a2", username: "verif_a2", role: "VERIFIKATOR", kecamatan: "", user_id: "" },
  KOORD2: { akun_id: "b1", username: "verif_b1", role: "VERIFIKATOR", kecamatan: "", user_id: "" },
  KEC: { akun_id: "k1", username: "kec_x", role: "KECAMATAN", kecamatan: "MEDAN KOTA", user_id: "KECAMATAN MEDAN KOTA" },
  GMM: { akun_id: "g1", username: "gmm_x", role: "GURU MAGHRIB MENGAJI", kecamatan: "", user_id: "" },
};
const AKUN = [
  { id: "a1", username: "verif_a1", nama_lengkap: "A SATU", aktif: true, tim: "I", koordinator: true },
  { id: "a2", username: "verif_a2", nama_lengkap: "A DUA", aktif: true, tim: "I", koordinator: false },
  { id: "b1", username: "verif_b1", nama_lengkap: "B SATU", aktif: true, tim: "II", koordinator: true },
  { id: "b2", username: "verif_b2", nama_lengkap: "B DUA", aktif: false, tim: "II", koordinator: false },
  { id: "n1", username: "verif_baru", nama_lengkap: "", aktif: true, tim: null, koordinator: false },
];
// Kejadian "pertama" yang dikembalikan basis data tiruan (waktu ISO UTC). 2026-11-09 Senin; 09.00 WIB = 02.00Z.
const KEJADIAN = [
  { oleh: "VERIF_A1", waktu: "2026-11-09T02:00:00Z", status_baru: "Memenuhi Syarat" },          // jam kerja
  { oleh: "VERIF_A1", waktu: "2026-11-09T09:30:00Z", status_baru: "Berkas Tidak Lengkap" },     // 16.30 WIB -> luar
  { oleh: "VERIF_A2", waktu: "2026-11-14T03:00:00Z", status_baru: "Tidak Memenuhi Syarat" },    // Sabtu -> luar
  { oleh: "VERIF_B1", waktu: "2026-11-10T03:00:00Z", status_baru: "Memenuhi Syarat" },
  { oleh: "VERIF_BARU", waktu: "2026-11-10T04:00:00Z", status_baru: "Memenuhi Syarat" },
];
let sesiAktif = SESI.UTAMA;
function pasang({ jam = [], libur = [], kejadian = KEJADIAN, admin = [] } = {}) {
  db().panggilan.length = 0;
  db().handler = (q, v) => {
    if (q.includes("from sesi_login")) return [sesiAktif];
    if (q.includes("from akun a left join tim_verifikator")) return AKUN;
    if (q.includes("from jam_kerja_verifikasi")) return jam;
    if (q.includes("from hari_libur_verifikasi")) return libur;
    if (q.includes("distinct on (penerima_id, oleh)")) return kejadian;
    if (q.includes("from riwayat_verifikasi") && q.includes("role = 'UTAMA'")) return admin;
    return [];
  };
}
const pakai = (p, opsi) => { sesiAktif = SESI[p]; pasang(opsi); };
const tok = (() => { let n = 0; return () => "t-" + (++n); })();
const RENT = ["2026-11-09", "2026-11-15"];
const ambil = (...a) => agregat.getAgregatVerifikasi(tok(), ...a);

test("CAKUPAN: verifikator biasa hanya dirinya; parameter tim dari browser tidak memperluas; kueri hanya memuat username dirinya", async () => {
  pakai("ANGGOTA1");
  const h = await ambil(...RENT, "II");
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.equal(h.cakupan, "SAYA");
  assert.deepEqual(h.perOrang.map((o) => o.username), ["verif_a2"]);
  assert.equal(h.perTim, undefined); assert.equal(h.luarTim, undefined);
  const kueri = db().panggilan.find((p) => p.teks.includes("distinct on"));
  assert.ok(kueri.nilai.includes('{"VERIF_A2"}'), "hanya username sendiri yang diminta dari riwayat (literal array teks): " + JSON.stringify(kueri.nilai));
});

test("CAKUPAN: koordinator melihat seluruh timnya; meminta tim lain tidak memperluas", async () => {
  pakai("KOORD1");
  for (const tim of [undefined, "", "II", "III", "-"]) {
    const h = await ambil(...RENT, tim);
    assert.equal(h.cakupan, "TIM");
    assert.deepEqual(h.perOrang.map((o) => o.username).sort(), ["verif_a1", "verif_a2"], "tim diminta: " + tim);
    const kueri = db().panggilan.find((p) => p.teks.includes("distinct on"));
    assert.ok(kueri.nilai.includes('{"VERIF_A1","VERIF_A2"}'), JSON.stringify(kueri.nilai));
  }
});

test("CAKUPAN: Admin Utama melihat semua tim, perTim, dan baris luarTim terpisah; saringan tim bekerja", async () => {
  pakai("UTAMA", { admin: [{ waktu: "2026-11-09T02:00:00Z" }, { waktu: "2026-11-15T13:00:00Z" }] });
  const h = await ambil(...RENT);
  assert.equal(h.cakupan, "SEMUA");
  assert.equal(h.perOrang.length, 5);
  assert.deepEqual(h.perTim.map((t) => [t.tim, t.total]).filter((t) => t[1] > 0), [["I", 3], ["II", 1], ["-", 1]]);
  assert.deepEqual(h.luarTim, { total: 2, jamKerja: 1, luarJamKerja: 1 });
  assert.deepEqual(h.ringkasan, { total: 5, jamKerja: 3, luarJamKerja: 2, memenuhiSyarat: 3, berkasTidakLengkap: 1, tidakMemenuhiSyarat: 1 });
  const t2 = await ambil(...RENT, "II");
  assert.deepEqual(t2.perOrang.map((o) => o.username).sort(), ["verif_b1", "verif_b2"]);
  assert.equal(t2.tim, "II");
});

test("HAK: peran lain (Kecamatan, GMM) ditolak tanpa membaca riwayat", async () => {
  for (const p of ["KEC", "GMM"]) {
    pakai(p);
    const h = await ambil(...RENT);
    assert.equal(h.sukses, false, p);
    assert.match(h.pesan, /khusus Admin Utama dan Verifikator/);
    assert.equal(db().panggilan.filter((x) => x.teks.includes("riwayat_verifikasi")).length, 0, p);
  }
});

test("HITUNG: batas jam kerja (16.30 luar), Sabtu luar, tanggal merah luar; konfigurasi dari tabel dipakai; riwayat hanya SATU pertama", async () => {
  pakai("ANGGOTA1", { kejadian: [{ oleh: "VERIF_A2", waktu: "2026-11-10T03:00:00Z", status_baru: "Memenuhi Syarat" }], libur: [{ tanggal: "2026-11-10" }] });
  const h = await ambil(...RENT);
  assert.equal(h.ringkasan.luarJamKerja, 1, "Selasa 10 Nov ditandai tanggal merah -> luar jam kerja");
  assert.equal(h.perHari.find((x) => x.tanggal === "2026-11-10").libur, true);
  const kueri = db().panggilan.find((p) => p.teks.includes("distinct on"));
  assert.ok(kueri.teks.includes("sumber = 'SATU'") && kueri.teks.includes("'Proses Verifikasi'"), "hanya pemberian hasil pertama (SATU, status lama Proses Verifikasi)");
  assert.ok(!kueri.teks.includes("DIPERBAIKI") && !kueri.teks.includes("MASSAL"), "perbaikan/massal tidak dihitung");
  pakai("ANGGOTA1", { kejadian: [{ oleh: "VERIF_A2", waktu: "2026-11-10T03:00:00Z", status_baru: "Memenuhi Syarat" }], jam: [{ isodow: 2, mulai: "13:00:00", selesai: "14:00:00" }] });
  const h2 = await ambil(...RENT);
  assert.equal(h2.ringkasan.luarJamKerja, 1, "10.00 WIB di luar jam kerja kustom 13-14");
});

test("RENTANG: tidak valid / terlalu panjang ditolak sebelum membaca riwayat; bawaan = bulan ini", async () => {
  pakai("UTAMA");
  for (const [d, s] of [["2026-13-01", "2026-13-02"], ["2026-11-12", "2026-11-01"], ["2026-01-01", "2026-12-31"], [5, 6]]) {
    const h = await ambil(d, s);
    assert.equal(h.sukses, false, JSON.stringify([d, s]));
  }
  assert.equal(db().panggilan.filter((x) => x.teks.includes("riwayat_verifikasi")).length, 0);
  const b = await ambil();
  assert.equal(b.sukses, true);
  assert.match(b.rentang.dari, /^\d{4}-\d{2}-01$/);
});

test("PRIVASI: hasil hanya angka/tanggal/identitas verifikator; tidak ada data penerima; aksi hanya MEMBACA", async () => {
  pakai("UTAMA");
  const h = await ambil(...RENT);
  const teks = JSON.stringify(h).toLowerCase();
  for (const kata of ["nik", "alamat", "nama_rekening", "penerima_id", "no_kontak", "password"]) assert.ok(!teks.includes(kata), "tidak boleh memuat: " + kata);
  assert.equal(db().panggilan.filter((p) => /^\s*(insert|update|delete)/i.test(p.teks)).length, 0, "tidak menulis");
  const src = baca("supabase/functions/api/domains/agregatVerifikasi.ts");
  assert.doesNotMatch(src.replace(/\/\/[^\n]*/g, ""), /\b(insert\s+into|update\s+\w+\s+set|delete\s+from)\b/i);
});

test("LITERAL ARRAY: username dikirim sebagai SATU literal teks yang aman (kutip/backslash di-escape; larik kosong tidak menghasilkan teks kosong)", () => {
  assert.equal(agregat.literalArrayTeks(["A", "B_C"]), '{"A","B_C"}');
  assert.equal(agregat.literalArrayTeks([]), "{}");
  assert.equal(agregat.literalArrayTeks(['A"B', "C\\D"]), '{"A\\"B","C\\\\D"}');
});

test("HAK: peran lain ditolak SEBELUM membaca basis data apa pun (bahkan daftar akun)", async () => {
  for (const p of ["KEC", "GMM"]) {
    pakai(p);
    await ambil(...RENT);
    assert.equal(db().panggilan.filter((x) => !x.teks.includes("from sesi_login")).length, 0, p + ": hanya pemeriksaan sesi yang boleh");
  }
});

test("GERBANG: kedua aksi ada di daftar-putih Verifikator dan di ALLOWED", () => {
  for (const a of ["getAgregatVerifikasi", "unduhRekapLemburVerifikasi"]) {
    assert.equal(AKSI_VERIFIKATOR.has(a), true, a);
    assert.match(baca("supabase/functions/api/index.ts"), new RegExp("^\\s*" + a + ",$", "m"), a);
  }
});

// ------------------------------------------------------------------ Excel (pembuat buku diuji dengan ExcelJS tiruan; berkas nyata diperiksa terpisah)
function excelTiruan() {
  const lembar = [];
  class Row { constructor() { this.font = null; } }
  class WS {
    constructor(nama) { this.nama = nama; this.baris = []; this.kolom = {}; this.views = null; lembar.push(this); }
    addRow(a) { this.baris.push(a); return new Row(); }
    getRow() { return new Row(); }
    getCell() { return { }; }
    getColumn(i) { this.kolom[i] = this.kolom[i] || {}; return this.kolom[i]; }
  }
  class WB { addWorksheet(n) { return new WS(n); } }
  return { Workbook: WB, lembar };
}

test("EXCEL: susunBukuRekap memuat rekap per orang (dengan TOTAL), rincian per hari, dan aturan; angka sama dengan agregat", async () => {
  pakai("UTAMA");
  // Memakai hasil agregat nyata dari fungsi hitung lewat aksi publik (kejadian KEJADIAN)
  const h = await ambil(...RENT);
  const ex = excelTiruan();
  const hasil = {
    cakupan: h.cakupan, timFokus: h.tim, rentang: h.rentang, saya: "ADMIN",
    hasil: { ringkasan: h.ringkasan, perOrang: h.perOrang, perHari: h.perHari, perOrangHari: [{ username: "verif_a1", tanggal: "2026-11-09", jamKerja: 1, luarJamKerja: 1 }] },
  };
  agregat.susunBukuRekap(ex, hasil, "ADMIN");
  const nama = ex.lembar.map((l) => l.nama);
  assert.deepEqual(nama, ["Rekap", "Per Hari", "Aturan"]);
  const rekap = ex.lembar[0].baris;
  assert.equal(rekap[0][0], "Rekap Hasil Kerja Verifikator - Agregat Semua Tim");
  assert.equal(rekap[4][0], "No"); assert.equal(rekap[4][5], "Luar Jam Kerja (Lembur)");
  const total = rekap[rekap.length - 1];
  assert.equal(total[1], "TOTAL"); assert.equal(total[4], h.ringkasan.jamKerja); assert.equal(total[5], h.ringkasan.luarJamKerja); assert.equal(total[6], h.ringkasan.total);
  const jumlahOrang = rekap.slice(5, -1);
  assert.equal(jumlahOrang.length, h.perOrang.length);
  assert.equal(jumlahOrang.reduce((s, r) => s + r[6], 0), h.ringkasan.total, "jumlah per orang = total");
  const hari = ex.lembar[1].baris;
  assert.deepEqual(hari[4].slice(0, 4), ["2026-11-09", "Senin", "", "verif_a1"]);
  assert.equal(hari[4][8], 2);
});

test("EXCEL: unduhRekapLemburVerifikasi mengikuti aturan hak yang sama (peran lain ditolak sebelum membangun berkas)", async () => {
  pakai("KEC");
  const h = await agregat.unduhRekapLemburVerifikasi(tok(), ...RENT);
  assert.equal(h.sukses, false);
  assert.match(h.pesan, /khusus Admin Utama dan Verifikator/);
  pakai("UTAMA");
  const g = await agregat.unduhRekapLemburVerifikasi(tok(), "2026-13-01", "2026-13-02");
  assert.equal(g.sukses, false, "rentang tak valid ditolak");
});
