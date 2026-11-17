// Beban tugas verifikasi (Awal dan Ulang) pada Excel agregat verifikasi: angka dari SQL SUNGGUHAN (PGlite, migrasi ASLI) dan tata letak Excel.
// Jalankan: npm run uji:agregat-beban  (butuh @electric-sql/pglite; bila tidak ada, uji DILEWATI)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { muatPglite, muatServerPg } from "./_harness-pg.mjs";

const PGlite = await muatPglite();
const lewati = PGlite ? false : "PGlite tidak tersedia";
if (!PGlite) console.log("DILEWATI: " + lewati);
const AG = PGlite ? await muatServerPg("supabase/functions/api/domains/agregatVerifikasi.ts") : null;
const opsi = { skip: lewati };
const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const MIGRASI_AWAL = baca("supabase/migrations/20261116120000_verifikasi_awal_bagi_rata.sql");

const ID = { admin: "00000000-0000-4000-8000-000000000001", v1: "00000000-0000-4000-8000-0000000000a1", v2: "00000000-0000-4000-8000-0000000000a2", v3: "00000000-0000-4000-8000-0000000000b1", v4: "00000000-0000-4000-8000-0000000000c1", kec: "00000000-0000-4000-8000-0000000000e1" };
const TOKEN = { admin: "T-ADMIN", v1: "T-V1", v2: "T-V2", v3: "T-V3", v4: "T-V4", kec: "T-KEC" };
// Tim dari migrasi agregat: ronald (I, koordinator), herna (I), bungamin (II, koordinator); verif_tanpa_tim tidak punya tim.
const USER = { v1: "verif_ronald_fredy", v2: "verif_herna_hutapea", v3: "verif_bungamin_surbakti", v4: "verif_tanpa_tim" };
const RENT = ["2026-11-01", "2026-11-30"];

async function siap() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated;");
  await db.exec(`
    create table akun (id uuid primary key, username text not null, nama_lengkap text not null default '', role text not null, aktif boolean not null default true);
    create table setelan (key text primary key, value text);
    create table penerima (
      id serial, tahun int not null, nik text, nama text, layanan text, kecamatan text, kelurahan text, nomor_urut int,
      status_verifikasi text, keterangan_verifikasi text default '', tanggal_verifikasi timestamptz, diverifikasi_oleh text,
      batas_waktu_perbaikan date, tanggal_lapor_perbaikan timestamptz, dilapor_oleh text, tanggal_berkas_diubah timestamptz,
      dibuat_at timestamptz not null default now(), primary key (id, tahun));
    insert into akun (id, username, nama_lengkap, role) values
      ('${ID.admin}', 'admin', 'ADMIN UTAMA', 'UTAMA'), ('${ID.v1}', '${USER.v1}', 'SATU', 'VERIFIKATOR'), ('${ID.v2}', '${USER.v2}', 'DUA', 'VERIFIKATOR'),
      ('${ID.v3}', '${USER.v3}', 'TIGA', 'VERIFIKATOR'), ('${ID.v4}', '${USER.v4}', '', 'VERIFIKATOR'), ('${ID.kec}', 'kec_x', '', 'KECAMATAN');
  `);
  await db.exec(baca("supabase/migrations/20261112100000_riwayat_verifikasi.sql"));
  await db.exec(baca("supabase/migrations/20261112150000_agregat_verifikasi.sql").split("-- Jadwal")[0]);
  await db.exec(MIGRASI_AWAL.slice(0, MIGRASI_AWAL.indexOf("-- Jadwal tiap 10 menit")));
  await db.exec(baca("supabase/migrations/20261114100000_verifikasi_ulang.sql"));
  globalThis.__ujiPg = db;
  globalThis.__ujiSesi = Object.fromEntries(Object.entries(TOKEN).map(([k, t]) => [t, { akunId: ID[k], username: k === "admin" ? "admin" : k === "kec" ? "kec_x" : USER[k], role: k === "admin" ? "UTAMA" : k === "kec" ? "KECAMATAN" : "VERIFIKATOR", kecamatan: "", userId: "" }]));
  return db;
}
const data = async (db, status) => (await db.query("insert into penerima (tahun, layanan, kecamatan, status_verifikasi) values (2027, 'IMAM MASJID', 'MEDAN KOTA', $1) returning id", [status])).rows[0].id;
const awal = (db, akun, pid, status) => db.query("insert into tugas_verifikasi_awal (penerima_id, tahun, akun_id, status, selesai_pada, hasil_status) values ($1, 2027, $2, $3, $4, $5)", [pid, ID[akun], status, status === "SELESAI" ? new Date() : null, status === "SELESAI" ? "Memenuhi Syarat" : null]);
const batch = async (db, status = "AKTIF") => (await db.query("insert into batch_verifikasi_ulang (nama, dibuat_oleh, benih, kriteria, pemeriksa, status) values ('x','ADMIN','b','{}','[]', $1) returning id", [status])).rows[0].id;
const ulang = (db, b, akun, pid, { selesai = false, ditarik = false } = {}) => db.query(
  "insert into tugas_verifikasi_ulang (batch_id, penerima_id, tahun, akun_id, selesai_pada, hasil, ditarik_pada) values ($1, $2, 2027, $3, $4, $5, $6)",
  [b, pid, ID[akun], selesai ? new Date() : null, selesai ? "SESUAI" : null, ditarik ? new Date() : null]);

// Skenario: v1 Awal 10 tugas (4 selesai, 2 ditutup, 2 sisa, 1 aktif tapi datanya sudah MS, 1 aktif tapi datanya terhapus); v2 Awal 3 sisa; v3 tanpa tugas.
// Ulang: v1 3 selesai + 1 ditarik + 2 sisa (+1 selesai di paket yang dibatalkan, yang tetap dihitung selesai); v2 1 sisa.
async function muatData(db) {
  for (let i = 0; i < 4; i++) await awal(db, "v1", await data(db, "Memenuhi Syarat"), "SELESAI");
  for (let i = 0; i < 2; i++) await awal(db, "v1", await data(db, "Memenuhi Syarat"), "DITUTUP");
  for (let i = 0; i < 2; i++) await awal(db, "v1", await data(db, "Proses Verifikasi"), "AKTIF");
  await awal(db, "v1", await data(db, "Memenuhi Syarat"), "AKTIF");             // diverifikasi pihak lain, belum disapu -> dihitung ditutup
  const hilang = await data(db, "Proses Verifikasi"); await awal(db, "v1", hilang, "AKTIF"); await db.query("delete from penerima where id = $1", [hilang]);   // data terhapus -> ditutup
  for (let i = 0; i < 3; i++) await awal(db, "v2", await data(db, "Proses Verifikasi"), "AKTIF");
  const b = await batch(db), batal = await batch(db, "DIBATALKAN");
  for (let i = 0; i < 3; i++) await ulang(db, b, "v1", await data(db, "Memenuhi Syarat"), { selesai: true });
  await ulang(db, b, "v1", await data(db, "Memenuhi Syarat"), { ditarik: true });
  for (let i = 0; i < 2; i++) await ulang(db, b, "v1", await data(db, "Memenuhi Syarat"));
  await ulang(db, batal, "v1", await data(db, "Memenuhi Syarat"), { selesai: true });
  await ulang(db, b, "v2", await data(db, "Memenuhi Syarat"));
  await ulang(db, batal, "v2", await data(db, "Memenuhi Syarat"));   // belum selesai di paket yang DIBATALKAN: bukan sisa
}

test("ANGKA BEBAN (SQL asli): ditugaskan = selesai + sisa (ditutup/ditarik hanya informasi); aturan 'sisa' sama dengan layar verifikator", opsi, async () => {
  const db = await siap(); await muatData(db);
  const h = await AG.hitungAgregat(TOKEN.admin, ...RENT, "", false, true);
  assert.ok(!h.galat, JSON.stringify(h)); assert.ok(h.beban);
  const b = h.beban.perOrang;
  assert.deepEqual(b[USER.v1.toUpperCase()].awal, { ditugaskan: 6, selesai: 4, sisa: 2, ditutup: 4 }, "2 DITUTUP + 1 aktif datanya sudah MS + 1 aktif datanya terhapus = 4 ditutup");
  assert.deepEqual(b[USER.v2.toUpperCase()].awal, { ditugaskan: 3, selesai: 0, sisa: 3, ditutup: 0 });
  assert.deepEqual(b[USER.v3.toUpperCase()].awal, { ditugaskan: 0, selesai: 0, sisa: 0, ditutup: 0 }, "tanpa tugas = nol, tetap tercantum");
  assert.deepEqual(b[USER.v1.toUpperCase()].ulang, { ditugaskan: 6, selesai: 4, sisa: 2, ditarik: 1 }, "selesai di paket yang dibatalkan tetap dihitung selesai; 1 ditarik hanya informasi");
  assert.deepEqual(b[USER.v2.toUpperCase()].ulang, { ditugaskan: 1, selesai: 0, sisa: 1, ditarik: 0 });
  for (const o of Object.values(b)) { assert.equal(o.awal.ditugaskan, o.awal.selesai + o.awal.sisa); assert.equal(o.ulang.ditugaskan, o.ulang.selesai + o.ulang.sisa); }
  assert.match(h.beban.dibuatPada, /^\d{2}-\d{2}-\d{4} \d{2}:\d{2}/, "waktu unduh WIB tercantum: " + h.beban.dibuatPada);
  assert.equal(h.beban.awalTersedia, true); assert.equal(h.beban.ulangTersedia, true);
  // 'sisa' Awal identik dengan yang dilihat verifikator di tab Verifikasi Awal (data masih Proses Verifikasi)
  const lihat = (await db.query("select count(*)::int n from tugas_verifikasi_awal t join penerima p on p.id = t.penerima_id and p.tahun = t.tahun where t.akun_id = $1 and t.status = 'AKTIF' and (p.status_verifikasi in ('Proses Verifikasi', '') or p.status_verifikasi is null)", [ID.v1])).rows[0].n;
  assert.equal(lihat, b[USER.v1.toUpperCase()].awal.sisa);
});

test("CAKUPAN: Admin Utama melihat semua verifikator; verifikator hanya diri sendiri/timnya; peran lain ditolak; layar biasa TIDAK memuat beban", opsi, async () => {
  const db = await siap(); await muatData(db);
  const semua = await AG.hitungAgregat(TOKEN.admin, ...RENT, "", false, true);
  assert.deepEqual(Object.keys(semua.beban.perOrang).sort(), Object.values(USER).map((x) => x.toUpperCase()).sort());
  const tim1 = await AG.hitungAgregat(TOKEN.v1, ...RENT, "", false, true);          // koordinator Tim I: dirinya + herna
  assert.deepEqual(Object.keys(tim1.beban.perOrang).sort(), [USER.v1, USER.v2].map((x) => x.toUpperCase()).sort(), "Tim I saja");
  const sendiri = await AG.hitungAgregat(TOKEN.v4, ...RENT, "", false, true);        // tanpa tim: hanya dirinya
  assert.deepEqual(Object.keys(sendiri.beban.perOrang), [USER.v4.toUpperCase()]);
  const lain = await AG.hitungAgregat(TOKEN.kec, ...RENT, "", false, true);
  assert.match(lain.galat, /khusus Admin Utama dan Verifikator/);
  const layar = await AG.hitungAgregat(TOKEN.admin, ...RENT, "", false);
  assert.equal(layar.beban, undefined, "pemakaian layar (tanpa unduh) tidak menjalankan kueri beban");
  const api = await AG.getAgregatVerifikasi(TOKEN.admin, ...RENT, "");
  assert.equal(api.sukses, true); assert.equal(api.beban, undefined);
});

test("TAHAN GANGGUAN: tabel Verifikasi Awal/Ulang belum ada -> kolom bernilai 0 dan ditandai tidak tersedia; agregat lain tetap jalan", opsi, async () => {
  const db = await siap(); await muatData(db);
  await db.exec("drop table tugas_verifikasi_awal cascade");
  let h = await AG.hitungAgregat(TOKEN.admin, ...RENT, "", false, true);
  assert.equal(h.beban.awalTersedia, false); assert.equal(h.beban.ulangTersedia, true);
  assert.equal(h.beban.perOrang[USER.v1.toUpperCase()].awal.ditugaskan, 0); assert.equal(h.beban.perOrang[USER.v1.toUpperCase()].ulang.selesai, 4);
  await db.exec("drop table tugas_verifikasi_ulang cascade");
  h = await AG.hitungAgregat(TOKEN.admin, ...RENT, "", false, true);
  assert.equal(h.beban.ulangTersedia, false); assert.ok(h.hasil.perOrang.length >= 3, "agregat hasil kerja tetap tampil");
});

// ---------------------------------------------------------------- tata letak Excel (ExcelJS tiruan)
function excelTiruan() {
  const lembar = [];
  class Row { constructor() { this.font = null; } }
  class WS {
    constructor(nama) { this.nama = nama; this.baris = []; this.kolom = {}; this.format = {}; this.views = null; lembar.push(this); }
    addRow(a) { this.baris.push(a); return new Row(); }
    getRow() { return new Row(); }
    mergeCells(...a) { (this.gabung = this.gabung || []).push(a); }
    getCell(r, c) { const k = r + ":" + c; this.format[k] = this.format[k] || {}; return this.format[k]; }
    getColumn(i) { this.kolom[i] = this.kolom[i] || {}; return this.kolom[i]; }
  }
  class WB { addWorksheet(n) { return new WS(n); } }
  return { Workbook: WB, lembar };
}

test("EXCEL: kolom beban di ujung kanan (Awal 21-25, Ulang 26-30), judul kelompok digabung, subtotal tim dan TOTAL dihitung ulang dari jumlah (bukan rata-rata persen), '-' bila belum ada tugas, catatan waktu unduh", opsi, async () => {
  const db = await siap(); await muatData(db);
  const h = await AG.hitungAgregat(TOKEN.admin, ...RENT, "", true, true);
  const ex = excelTiruan();
  AG.susunBukuRekap(ex, h, "ADMIN");
  const ws = ex.lembar[0], rekap = ws.baris;
  assert.match(rekap[3][0], /^Beban tugas \(kolom paling kanan\) dihitung per \d{2}-\d{2}-\d{4}/, "catatan waktu unduh di baris 4");
  assert.equal(rekap[4][20], "BEBAN TUGAS AWAL (dari sistem, per unduh)"); assert.equal(rekap[4][25], "BEBAN TUGAS ULANG (per unduh)");
  assert.deepEqual(rekap[5].slice(20), ["Ditugaskan", "Selesai", "Sisa", "% Selesai", "Ditutup", "Ditugaskan", "Selesai", "Sisa", "% Selesai", "Ditarik"]);
  assert.deepEqual(ws.gabung.slice(4), [[5, 21, 5, 25], [5, 26, 5, 30]], "dua kelompok baru digabung; empat kelompok lama tidak berubah");
  assert.deepEqual(ws.gabung.slice(0, 4), [[5, 6, 5, 8], [5, 9, 5, 13], [5, 14, 5, 16], [5, 17, 5, 19]]);
  const isi = rekap.slice(6), orang = isi.filter((r) => typeof r[0] === "number");
  const per = (u) => orang.find((r) => r[2] === u);
  assert.deepEqual(per(USER.v1).slice(20), [6, 4, 2, 4 / 6, 4, 6, 4, 2, 4 / 6, 1], "ronald: Awal 4 selesai dari 6 yang harus dikerjakan (4 ditutup hanya informasi); Ulang 4 dari 6 (1 ditarik hanya informasi)");
  assert.deepEqual(per(USER.v2).slice(20), [3, 0, 3, 0, 0, 1, 0, 1, 0, 0]);
  assert.deepEqual(per(USER.v3).slice(20), [0, 0, 0, "-", 0, 0, 0, 0, "-", 0], "belum ada tugas: persen '-' (bukan 0% atau galat)");
  const sub = isi.filter((r) => String(r[1]).startsWith("Subtotal"));
  const tim1 = sub.find((r) => r[1] === "Subtotal Tim I");
  assert.deepEqual(tim1.slice(20), [9, 4, 5, 4 / 9, 4, 7, 4, 3, 4 / 7, 1], "Tim I = ronald + herna dijumlahkan; persen dari jumlah (4/9), bukan rata-rata persen");
  const total = isi.find((r) => r[1] === "TOTAL");
  assert.deepEqual(total.slice(20), [9, 4, 5, 4 / 9, 4, 7, 4, 3, 4 / 7, 1]);
  assert.equal(orang.reduce((s, r) => s + r[20], 0), total[20], "jumlah per orang = total");
  for (const br of [7, 8, 9, 10, 11]) for (const kc of [24, 29]) assert.equal(ws.getCell(br, kc).numFmt, "0%", "format persen kolom " + kc);
  assert.ok(ex.lembar[2].baris.some((r) => /Beban tugas dihitung per/.test(String(r[0]))), "penjelasan di sheet Aturan");
  assert.ok(ex.lembar[2].baris.some((r) => /beban hanya mencakup tugas yang DIBAGIKAN sistem/.test(String(r[0])) && /lebih kecil daripada Total Verifikasi Awal/.test(String(r[0]))), "catatan: pekerjaan yang dipilih sendiri tidak masuk beban");
  assert.ok(ex.lembar[2].baris.some((r) => /Verifikasi Awal: Ditugaskan = Selesai \+ Sisa/.test(String(r[0]))) && ex.lembar[2].baris.some((r) => /Verifikasi Ulang: Ditugaskan = Selesai \+ Sisa/.test(String(r[0]))));
});

test("EXCEL: tabel beban tidak tersedia -> peringatan di sheet Aturan; tanpa beban (layar/uji lama) kolom lama persis seperti sebelumnya (20 kolom)", opsi, async () => {
  const db = await siap(); await muatData(db);
  await db.exec("drop table tugas_verifikasi_awal cascade");
  const h = await AG.hitungAgregat(TOKEN.admin, ...RENT, "", true, true);
  const ex = excelTiruan(); AG.susunBukuRekap(ex, h, "ADMIN");
  assert.ok(ex.lembar[2].baris.some((r) => /PERHATIAN: data beban Verifikasi Awal tidak dapat dibaca/.test(String(r[0]))));
  const h2 = await AG.hitungAgregat(TOKEN.admin, ...RENT, "", true);
  const ex2 = excelTiruan(); AG.susunBukuRekap(ex2, h2, "ADMIN");
  assert.equal(ex2.lembar[0].baris[5].length, 20, "tanpa beban: 20 kolom seperti semula");
  assert.deepEqual(ex2.lembar[0].gabung, [[5, 6, 5, 8], [5, 9, 5, 13], [5, 14, 5, 16], [5, 17, 5, 19]]);
  assert.equal(ex2.lembar[0].baris[3].length, 0, "baris 4 tetap kosong");
});

test("KABEL: unduhan memuat beban, layar biasa tidak; semua kueri hanya membaca", () => {
  const s = baca("supabase/functions/api/domains/agregatVerifikasi.ts");
  assert.match(s, /hitung\(token, dari, sampai, tim, true, true\)/, "unduhan Excel meminta beban");
  assert.match(s, /hitung\(token, dari, sampai, tim, false\)/, "layar tidak meminta beban");
  const bagian = s.slice(s.indexOf("let beban: BebanTugas"), s.indexOf("const semuaAnggotaCakupan"));
  assert.doesNotMatch(bagian, /\binsert\b|\bupdate\b|\bdelete\b/i, "kueri beban hanya membaca");
});

// ---------------------------------------------------------------- endpoint unduhan utuh dengan ExcelJS ASLI (opsional)
const adaExcelJS = !!process.env.DJPM_EXCELJS_DIR;
test("ENDPOINT UNDUH (ExcelJS asli): unduhRekapLemburVerifikasi menghasilkan .xlsx yang sah; kolom beban terbaca kembali; nama file benar; peran lain ditolak sebelum membangun berkas", { skip: lewati || (adaExcelJS ? false : "set DJPM_EXCELJS_DIR (folder berisi node_modules/exceljs) untuk menjalankan uji ini") }, async () => {
  const db = await siap(); await muatData(db);
  const AGX = await muatServerPg("supabase/functions/api/domains/agregatVerifikasi.ts");
  const r = await AGX.unduhRekapLemburVerifikasi(TOKEN.admin, ...RENT, "");
  assert.equal(r.sukses, true, JSON.stringify(r).slice(0, 300));
  assert.equal(r.namaFile, "Rekap Verifikasi Semua Tim 2026-11-01 sd 2026-11-30.xlsx");
  const { createRequire } = await import("node:module"); const path = await import("node:path");
  const ExcelJS = createRequire(path.join(process.env.DJPM_EXCELJS_DIR, "x.js"))("exceljs");
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(r.base64, "base64"));
  assert.deepEqual(wb.worksheets.map((x) => x.name), ["Rekap", "Per Hari", "Aturan"]);
  const ws = wb.getWorksheet("Rekap");
  assert.equal(ws.columnCount, 30);
  const baris = []; ws.eachRow((row, n) => { if (n >= 7) baris.push([row.getCell(2).value, row.getCell(3).value, ...[21, 22, 23, 24, 25, 26, 27, 28, 29, 30].map((c) => row.getCell(c).value)]); });
  const ronald = baris.find((x) => x[1] === USER.v1);
  assert.deepEqual(ronald.slice(2), [6, 4, 2, 4 / 6, 4, 6, 4, 2, 4 / 6, 1]);
  assert.equal(ws.getRow(7).getCell(24).numFmt, "0%");
  assert.equal(baris.find((x) => x[1] === USER.v3)[5], "-");
  const ditolak = await AGX.unduhRekapLemburVerifikasi(TOKEN.kec, ...RENT, "");
  assert.equal(ditolak.sukses, false); assert.match(ditolak.pesan, /khusus Admin Utama dan Verifikator/);
  const tim = await AGX.unduhRekapLemburVerifikasi(TOKEN.v1, ...RENT, "");
  assert.equal(tim.sukses, true); assert.equal(tim.namaFile, "Rekap Verifikasi Tim I 2026-11-01 sd 2026-11-30.xlsx");
  const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(Buffer.from(tim.base64, "base64"));
  const namaTim = []; wb2.getWorksheet("Rekap").eachRow((row, n) => { if (n >= 7 && typeof row.getCell(1).value === "number") namaTim.push(row.getCell(3).value); });
  assert.deepEqual(namaTim.sort(), [USER.v1, USER.v2].sort(), "koordinator Tim I hanya melihat Tim I");
});
