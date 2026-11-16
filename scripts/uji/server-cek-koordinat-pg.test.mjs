// Pemeriksa koordinat di Postgres SUNGGUHAN (PGlite): migrasi ASLI, kode domain ASLI, pengambil tautan palsu. Rencana: percakapan 2026-11-16 (Tahap A).
// Jalankan: npm run uji:cek-koordinat-pg  (butuh @electric-sql/pglite; bila tidak ada, uji DILEWATI)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { muatPglite, muatServerPg } from "./_harness-pg.mjs";

const PGlite = await muatPglite();
const lewati = PGlite ? false : "PGlite tidak tersedia";
if (!PGlite) console.log("DILEWATI: " + lewati);
const CK = PGlite ? await muatServerPg("supabase/functions/api/domains/cekKoordinat.ts") : null;
const opsi = { skip: lewati };
const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const MIGRASI = baca("supabase/migrations/20261117100000_cek_koordinat.sql");
const MIGRASI_TABEL = MIGRASI.slice(0, MIGRASI.indexOf("do $$"));

const NAMA = ["admin", "verif_p1", "kec_x", "gmm_x"];
const ID = Object.fromEntries(NAMA.map((n, i) => [n, "00000000-0000-4000-8000-" + String(i + 1).padStart(12, "0")]));
const TOKEN = Object.fromEntries(NAMA.map((n) => [n, "T-" + n]));
const ROLE = (n) => (n === "admin" ? "UTAMA" : n === "kec_x" ? "KECAMATAN" : n === "gmm_x" ? "GURU MAGHRIB MENGAJI" : "VERIFIKATOR");
const G = "https://www.google.com";
const PINDAH_VALID = "https://maps.app.goo.gl/AAAAvalid1";
const PINDAH_WINDI = "https://maps.app.goo.gl/QRFNTT3Euye4vW4F7";
const PINDAH_MATI = "https://maps.app.goo.gl/MMMMmati01";
const PINDAH_BATAS = "https://maps.app.goo.gl/BBBBbatas1";
const TUJUAN = {
  [PINDAH_VALID]: [302, "https://maps.google.com/?q=3.572790,98.724974&entry=gps"],
  [PINDAH_WINDI]: [302, G + "/maps/place//@3.550244,98.6930693,13z/data=!3m1!4b1?entry=tts"],
  [PINDAH_MATI]: [404, null],
  [PINDAH_BATAS]: [429, null],
};

async function siap(daftar) {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated;");
  await db.exec(`
    create table akun (id uuid primary key, username text not null, role text not null);
    create table penerima (id serial, tahun int not null, nama text, layanan text, link_koordinat_lokasi text, status_verifikasi text default 'Proses Verifikasi', primary key (id, tahun));`);
  for (const n of NAMA) await db.query("insert into akun (id, username, role) values ($1, $2, $3)", [ID[n], n, ROLE(n)]);
  await db.exec(`create table sesi_login (token text primary key)`);
  await db.exec(MIGRASI_TABEL);
  for (const [layanan, link] of daftar) await db.query("insert into penerima (tahun, nama, layanan, link_koordinat_lokasi) values (2027, 'N', $1, $2)", [layanan, link]);
  globalThis.__ujiPg = db;
  globalThis.__ujiSesi = Object.fromEntries(NAMA.map((n) => [TOKEN[n], { akunId: ID[n], username: n, role: ROLE(n), kecamatan: "", userId: "" }]));
  const panggilan = [];
  globalThis.__ujiFetch = async (url) => {
    panggilan.push(url);
    const t = TUJUAN[url];
    if (!t) throw new Error("tak terduga: " + url);
    return { status: t[0], headers: { get: (n) => (n.toLowerCase() === "location" ? t[1] : null) } };
  };
  return { db, panggilan };
}
const GMM = "GURU MAGHRIB MENGAJI";
const hasilPer = async (db) => Object.fromEntries((await db.query("select penerima_id, hasil, alasan from cek_koordinat order by penerima_id")).rows.map((r) => [r.penerima_id, r.hasil + (r.alasan ? ":" + r.alasan : "")]));

test("MIGRASI ASLI: tabel ada, RLS aktif, hak anon dicabut, idempoten; jadwal pg_cron 5 menit memanggil aksi jalur _secret dengan rahasia dari Vault", opsi, async () => {
  const { db } = await siap([]);
  await db.exec(MIGRASI_TABEL);
  assert.equal((await db.query("select has_table_privilege('anon', 'cek_koordinat', 'select') as p")).rows[0].p, false);
  assert.equal((await db.query("select relrowsecurity from pg_class where relname = 'cek_koordinat'")).rows[0].relrowsecurity, true);
  assert.match(MIGRASI, /cron\.schedule\(\s*'cek-koordinat-gmm',\s*'\*\/5 \* \* \* \*'/);
  assert.match(MIGRASI, /'action', 'jalankanCekKoordinatOtomatis'/);
  assert.match(MIGRASI, /vault\.decrypted_secrets where name = 'sync_worker_secret'/);
  await assert.rejects(() => db.query("insert into cek_koordinat (penerima_id, tahun, tautan, hasil) values (1, 2027, 'x', 'SALAH')"), /check|violates/i, "nilai hasil dijaga");
});

test("PUTARAN: tautan panjang dinilai tanpa jaringan; tautan pendek dibuka SEKALI per tautan unik; layanan lain diabaikan; hasil benar untuk tiap jenis", opsi, async () => {
  const { db, panggilan } = await siap([
    [GMM, G + "/maps?q=3.595200,98.672200"],                                            // 1 valid (panjang)
    [GMM, G + "/maps/@3.595964,98.6368103,3a,90y,7.9h,58.58t/data=!3m5!1e1"],            // 2 street view
    [GMM, PINDAH_WINDI],                                                                 // 3 pendek -> tanpa penanda
    [GMM, PINDAH_WINDI],                                                                 // 4 tautan SAMA (tidak dibuka lagi)
    [GMM, PINDAH_VALID],                                                                 // 5 pendek valid
    [GMM, PINDAH_MATI],                                                                  // 6 mati
    ["GURU SEKOLAH MINGGU", G + "/maps/@3.5,98.6,17z"],                                  // 7 layanan lain: diabaikan
  ]);
  const r = await CK.putaranCekKoordinat(10_000);
  assert.deepEqual([r.diambil, r.dinilai, r.tertunda], [6, 6, 0]);
  assert.equal(panggilan.filter((u) => u === PINDAH_WINDI).length, 1, "tautan yang sama dibuka sekali");
  assert.equal(panggilan.length, 3, "hanya tautan pendek unik yang dibuka: " + panggilan.join(","));
  assert.deepEqual(await hasilPer(db), { 1: "VALID", 2: "TIDAK_VALID:STREET_VIEW", 3: "TIDAK_VALID:TANPA_PENANDA", 4: "TIDAK_VALID:TANPA_PENANDA", 5: "VALID", 6: "TIDAK_VALID:MATI" });
  assert.equal((await db.query("select count(*)::int n from cek_koordinat where penerima_id = 7")).rows[0].n, 0, "layanan lain tidak diperiksa");
  const v = (await db.query("select lat, lng, tujuan from cek_koordinat where penerima_id = 5")).rows[0];
  assert.deepEqual([v.lat, v.lng], [3.57279, 98.724974]); assert.match(v.tujuan, /maps\.google\.com/);
  // putaran kedua: tidak ada yang perlu dikerjakan
  const r2 = await CK.putaranCekKoordinat(10_000);
  assert.equal(r2.diambil, 0); assert.equal(panggilan.length, 3, "tidak ada permintaan ulang");
});

test("GAGAL AMAN: Google membatasi/jaringan putus -> BELUM_DICEK (bukan TIDAK_VALID); dicoba lagi hanya setelah 30 menit, lalu dinilai benar", opsi, async () => {
  const { db, panggilan } = await siap([[GMM, PINDAH_BATAS], [GMM, PINDAH_VALID]]);
  globalThis.__ujiFetch = async (url) => { panggilan.push(url); if (url === PINDAH_BATAS) throw new Error("ECONNRESET"); return { status: 302, headers: { get: () => "https://maps.google.com/?q=3.6,98.67" } }; };
  const r = await CK.putaranCekKoordinat(10_000);
  assert.equal(r.belumDicek, 1);
  assert.deepEqual(await hasilPer(db), { 1: "BELUM_DICEK:jaringan: ECONNRESET", 2: "VALID" }, "alasan teknis dicatat, bukan kode penolakan");
  const sebelum = panggilan.length;
  await CK.putaranCekKoordinat(10_000);
  assert.equal(panggilan.length, sebelum, "belum 30 menit: tidak diulang");
  await db.query("update cek_koordinat set dicek_pada = now() - interval '2 hours' where penerima_id = 1");
  globalThis.__ujiFetch = async () => ({ status: 302, headers: { get: () => "https://maps.google.com/?q=3.6,98.67" } });
  await CK.putaranCekKoordinat(10_000);
  assert.deepEqual(await hasilPer(db), { 1: "VALID", 2: "VALID" }, "setelah 30 menit dicoba lagi dan kini dinilai");
});

test("BASI: tautan penerima berubah -> hasil lama tidak dipakai (dibaca BELUM_DICEK) dan dinilai ulang; tautan kosong/null tidak diproses berulang", opsi, async () => {
  const { db } = await siap([[GMM, G + "/maps/@3.5,98.6,17z"], [GMM, null]]);
  await CK.putaranCekKoordinat(10_000);
  assert.deepEqual(await hasilPer(db), { 1: "TIDAK_VALID:TANPA_PENANDA", 2: "TIDAK_VALID:TANPA_TITIK" });
  assert.equal((await CK.putaranCekKoordinat(10_000)).diambil, 0, "tautan null tidak membuat putaran tak berujung");
  await db.query("update penerima set link_koordinat_lokasi = $1 where id = 1", [G + "/maps?q=3.6,98.67"]);   // petugas memperbaiki tautan
  const p = await CK.getPenandaKoordinat(TOKEN.admin);
  assert.deepEqual(p.b, [1], "hasil lama untuk tautan yang sudah berubah dianggap belum dicek");
  assert.equal(p.x["1"], undefined);
  await CK.putaranCekKoordinat(10_000);
  const p2 = await CK.getPenandaKoordinat(TOKEN.admin);
  assert.deepEqual(p2.v, [1]); assert.equal(p2.x["2"], "TANPA_TITIK");
});

test("ANGGARAN WAKTU: tautan pendek yang belum sempat dibuka tetap di antrean (tidak hilang, tidak dianggap salah); tautan panjang tetap dinilai", opsi, async () => {
  const { db, panggilan } = await siap([[GMM, G + "/maps?q=3.6,98.67"], [GMM, PINDAH_VALID]]);
  const r = await CK.putaranCekKoordinat(0);
  assert.deepEqual([r.dinilai, r.tertunda], [1, 1]);
  assert.equal(panggilan.length, 0);
  assert.deepEqual(await hasilPer(db), { 1: "VALID" });
  await CK.putaranCekKoordinat(10_000);
  assert.deepEqual(await hasilPer(db), { 1: "VALID", 2: "VALID" });
});

test("PENANDA UNTUK LAYAR: kelompok valid/tidak valid/belum dicek dengan kode alasan; hanya Admin Utama dan Verifikator; tanpa data pribadi", opsi, async () => {
  const { db } = await siap([[GMM, G + "/maps?q=3.6,98.67"], [GMM, G + "/maps/@3.5,98.6,17z"], [GMM, PINDAH_BATAS], [GMM, G + "/maps/search/x/@3.5,98.6,17z"]]);
  globalThis.__ujiFetch = async () => { throw new Error("putus"); };
  await CK.putaranCekKoordinat(10_000);
  const p = await CK.getPenandaKoordinat(TOKEN.verif_p1);
  assert.equal(p.sukses, true, JSON.stringify(p));
  assert.deepEqual(p.v, [1]); assert.deepEqual(p.b, [3]); assert.deepEqual(p.x, { 2: "TANPA_PENANDA", 4: "PENCARIAN" });
  assert.deepEqual(p.jumlah, { valid: 1, tidakValid: 2, belumDicek: 1 });
  assert.ok(p.teks.TANPA_PENANDA && p.teks.PENCARIAN, "teks alasan ikut dikirim");
  assert.ok(!/nama|nik/i.test(JSON.stringify(Object.keys(p))), "hanya id dan kode");
  assert.equal((await CK.getPenandaKoordinat(TOKEN.admin)).sukses, true);
  for (const t of [TOKEN.kec_x, TOKEN.gmm_x]) { const x = await CK.getPenandaKoordinat(t); assert.equal(x.sukses, false); assert.match(x.pesan, /khusus Admin Utama dan Verifikator/); }
  assert.equal((await CK.getPenandaKoordinat("tak-ada")).sukses, false);
  void db;
});

test("JALUR OTOMATIS: dibatasi 1x/30 dtk; tidak melempar galat bila basis data bermasalah", opsi, async () => {
  await siap([[GMM, G + "/maps?q=3.6,98.67"]]);
  const a = await CK.jalankanCekKoordinatOtomatis();
  assert.equal(a.sukses, true); assert.equal(a.dinilai, 1);
  const b = await CK.jalankanCekKoordinatOtomatis();
  assert.match(String(b.dilewati || ""), /Baru saja/);
});

test("KABEL: aksi terdaftar di ALLOWED dan daftar-putih Verifikator; penyapu BUKAN aksi daftar-putih Verifikator; pemuat skrip peran; tidak ada penolakan simpan di Tahap A", () => {
  const idx = baca("supabase/functions/api/index.ts");
  assert.match(idx, /^\s*getPenandaKoordinat,/m); assert.match(idx, /^\s*jalankanCekKoordinatOtomatis,/m);
  const gp = baca("supabase/functions/api/_shared/gerbangPeran.ts");
  assert.match(gp, /"getPenandaKoordinat"/); assert.doesNotMatch(gp, /"jalankanCekKoordinatOtomatis"/);
  const dom = baca("supabase/functions/api/domains/cekKoordinat.ts");
  assert.doesNotMatch(dom, /verifikasiSatuData|simpanDataKeSheet/, "Tahap A: modul ini tidak menolak penyimpanan apa pun");
  assert.match(dom, /AbortSignal\.timeout\(BATAS_AMBIL_MS\)/, "setiap permintaan ke Google punya batas waktu");
  const angg = Number((dom.match(/const ANGGARAN_MS = ([\d_]+)/) || [])[1].replace(/_/g, "")), batas = Number((dom.match(/const BATAS_AMBIL_MS = ([\d_]+)/) || [])[1].replace(/_/g, ""));
  assert.ok(angg + 4 * batas < 60_000, "kasus terburuk (anggaran + 4 lompatan) di bawah batas fungsi 60 dtk: " + (angg + 4 * batas));
});
