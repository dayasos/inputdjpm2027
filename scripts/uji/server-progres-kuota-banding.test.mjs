// Progres Kuota + kolom pembanding tahun sebelumnya (2026) di Postgres SUNGGUHAN (PGlite): kode domain ASLI kuota.ts.
// Plan: plans/plan-progres-kuota-banding-2026.md. Jalankan: npm run uji:progres-kuota.
// Memerlukan @electric-sql/pglite (bukan dependensi repo; lihat scripts/uji/_harness-pg.mjs) -- bila tidak ada, uji ini DILEWATI.
import test from "node:test";
import assert from "node:assert/strict";
import { muatPglite, muatServerPg } from "./_harness-pg.mjs";

const PGlite = await muatPglite();
const lewati = PGlite ? false : "PGlite tidak tersedia (npm install --no-save @electric-sql/pglite@0.3.14, atau set PGLITE_DIR)";
if (!PGlite) console.log("DILEWATI: " + lewati);
const K = PGlite ? await muatServerPg("supabase/functions/api/domains/kuota.ts") : null;
const opsi = { skip: lewati };

// Master stub (scripts/uji/_harness-pg.mjs): kecamatan = IMAM MASJID, PENGURUS GEREJA, BILAL JENAZAH; kemenag = GURU MAGHRIB MENGAJI, GURU SEKOLAH MINGGU.
const IMAM = "IMAM MASJID", GSM = "GURU SEKOLAH MINGGU", GMM = "GURU MAGHRIB MENGAJI";
const DENAI = "MEDAN DENAI", AREA = "MEDAN AREA", AMPLAS = "MEDAN AMPLAS", BARU = "MEDAN BARU";
const TOKEN = { utama: "T-UTAMA", kec: "T-KEC" };

async function baru(isi = {}) {
  const db = new PGlite();
  await db.exec(`
    create table kuota (id serial primary key, kecamatan text, layanan text, kuota_maks int, diperbarui_at timestamptz default now());
    create table penerima (id serial primary key, tahun int not null, layanan text, kecamatan text, status_verifikasi text);`);
  for (const [kec, lay, k] of isi.kuota || []) await db.query("insert into kuota (kecamatan, layanan, kuota_maks) values ($1,$2,$3)", [kec, lay, k]);
  for (const [tahun, lay, kec, n, status] of isi.penerima || []) {
    for (let i = 0; i < n; i++) await db.query("insert into penerima (tahun, layanan, kecamatan, status_verifikasi) values ($1,$2,$3,$4)", [tahun, lay, kec, status || "Memenuhi Syarat"]);
  }
  globalThis.__ujiPg = db;
  globalThis.__ujiSesi = {
    [TOKEN.utama]: { akunId: "a1", username: "utama1", role: "UTAMA", kecamatan: "", userId: "" },
    [TOKEN.kec]: { akunId: "a2", username: "kec1", role: "KECAMATAN", kecamatan: AREA, userId: "" },
  };
  return db;
}
const grupDari = (res, lay) => res.grup.find((g) => g.layanan === lay);
const barisDari = (g, kec) => g.baris.find((b) => b.kecamatan === kec);

const KUOTA_DASAR = [[DENAI, IMAM, 10], [AREA, IMAM, 4], [AMPLAS, IMAM, 6], [DENAI, GSM, 8], [AREA, GSM, 2]];

test("ANGKA: input2026 dan selisih per baris benar; kolom lama tidak berubah", opsi, async () => {
  const db = await baru({
    kuota: KUOTA_DASAR,
    penerima: [[2027, IMAM, DENAI, 3], [2027, IMAM, AREA, 1], [2026, IMAM, DENAI, 5], [2026, IMAM, AMPLAS, 2]],
  });
  const r = await K.getProgresKuota(TOKEN.utama);
  assert.equal(r.sukses, true, JSON.stringify(r));
  assert.equal(r.bandingTersedia, true);
  assert.equal(r.tahunBanding, 2026);
  const g = grupDari(r, IMAM);
  const denai = barisDari(g, DENAI), area = barisDari(g, AREA), amplas = barisDari(g, AMPLAS);
  // kolom lama (bentuk sebelum perubahan)
  assert.deepEqual({ k: denai.kuota, i: denai.input, s: denai.sisa, p: denai.persen }, { k: 10, i: 3, s: 7, p: 30 });
  assert.deepEqual({ k: area.kuota, i: area.input, s: area.sisa, p: area.persen }, { k: 4, i: 1, s: 3, p: 25 });
  assert.deepEqual({ k: amplas.kuota, i: amplas.input, s: amplas.sisa, p: amplas.persen }, { k: 6, i: 0, s: 6, p: 0 });
  // kolom baru
  assert.deepEqual({ a: denai.input2026, s: denai.selisih }, { a: 5, s: -2 });
  assert.deepEqual({ a: area.input2026, s: area.selisih }, { a: 0, s: 1 }, "tidak ada data 2026 -> 0, bukan null");
  assert.deepEqual({ a: amplas.input2026, s: amplas.selisih }, { a: 2, s: -2 });
  assert.equal(g.totalInput, 4);
  assert.equal(g.totalKuota, 20);
  assert.equal(g.total2026, 7);
  assert.equal(g.selisihTotal, -3);
  await db.close();
});

test("INVARIAN: total2026 = jumlah input2026 baris yang tampil; selisihTotal = totalInput - total2026", opsi, async () => {
  const db = await baru({
    kuota: KUOTA_DASAR,
    penerima: [[2027, IMAM, DENAI, 4], [2027, GSM, AREA, 1], [2026, IMAM, DENAI, 9], [2026, IMAM, AREA, 3], [2026, GSM, DENAI, 6], [2026, GSM, AREA, 7]],
  });
  const r = await K.getProgresKuota(TOKEN.utama);
  for (const g of r.grup) {
    assert.equal(g.total2026, g.baris.reduce((a, b) => a + b.input2026, 0), g.layanan);
    assert.equal(g.selisihTotal, g.totalInput - g.total2026, g.layanan);
    for (const b of g.baris) assert.equal(b.selisih, b.input - b.input2026, g.layanan + " " + b.kecamatan);
  }
  await db.close();
});

test("SEMUA TERCATAT: baris 2026 berstatus non-aktif (meninggal, ASN, dst.) tetap dihitung (keputusan K1)", opsi, async () => {
  const db = await baru({
    kuota: KUOTA_DASAR,
    penerima: [[2026, IMAM, DENAI, 2, "AKTIF"], [2026, IMAM, DENAI, 3, "MENINGGAL DUNIA"], [2026, IMAM, DENAI, 1, "ASN/P3K"], [2026, IMAM, DENAI, 1, null]],
  });
  const r = await K.getProgresKuota(TOKEN.utama);
  assert.equal(barisDari(grupDari(r, IMAM), DENAI).input2026, 7);
  await db.close();
});

test("TAHUN: hanya tahun sebelum tahun aktif (2026); 2025 dan tahun aktif tidak ikut", opsi, async () => {
  const db = await baru({
    kuota: KUOTA_DASAR,
    penerima: [[2025, IMAM, DENAI, 50], [2026, IMAM, DENAI, 4], [2027, IMAM, DENAI, 2], [2028, IMAM, DENAI, 70]],
  });
  const r = await K.getProgresKuota(TOKEN.utama);
  const b = barisDari(grupDari(r, IMAM), DENAI);
  assert.deepEqual({ i: b.input, a: b.input2026 }, { i: 2, a: 4 });
  await db.close();
});

test("NORMALISASI: huruf kecil dan spasi di tepi pada data 2026 tetap dicocokkan", opsi, async () => {
  const db = await baru({
    kuota: KUOTA_DASAR,
    penerima: [[2026, "imam masjid ", " medan denai", 2], [2026, IMAM, DENAI, 1]],
  });
  const r = await K.getProgresKuota(TOKEN.utama);
  assert.equal(barisDari(grupDari(r, IMAM), DENAI).input2026, 3);
  await db.close();
});

test("LAYANAN HANYA 2026: tetap tampil (punya kuota) dengan input 2027 = 0 dan angka 2026 terisi", opsi, async () => {
  const db = await baru({
    kuota: KUOTA_DASAR,
    penerima: [[2026, GSM, DENAI, 6], [2026, GSM, AREA, 2]],
  });
  const r = await K.getProgresKuota(TOKEN.utama);
  const g = grupDari(r, GSM);
  assert.ok(g, "layanan tampil");
  assert.equal(g.totalInput, 0);
  assert.equal(g.total2026, 8);
  assert.equal(g.selisihTotal, -8);
  assert.equal(barisDari(g, DENAI).selisih, -6);
  await db.close();
});

test("TANPA BARIS KUOTA: data 2026 di kecamatan tanpa baris kuota tidak ikut tampil maupun menggeser total", opsi, async () => {
  const db = await baru({
    kuota: KUOTA_DASAR,
    penerima: [[2026, IMAM, DENAI, 2], [2026, IMAM, BARU, 9]], // MEDAN BARU tidak punya baris kuota IMAM MASJID
  });
  const r = await K.getProgresKuota(TOKEN.utama);
  const g = grupDari(r, IMAM);
  assert.equal(barisDari(g, BARU), undefined);
  assert.equal(g.total2026, 2);
  await db.close();
});

test("LAYANAN TANPA KUOTA: tetap disembunyikan seperti aturan lama (walau ada data 2026)", opsi, async () => {
  const db = await baru({ kuota: KUOTA_DASAR, penerima: [[2026, GMM, DENAI, 5]] });
  const r = await K.getProgresKuota(TOKEN.utama);
  assert.equal(grupDari(r, GMM), undefined);
  await db.close();
});

test("KEGAGALAN KUERI 2026: Progres Kuota tetap sukses; kolom 2026 = null, bandingTersedia = false; kolom lama benar", opsi, async () => {
  const db = await baru({ kuota: KUOTA_DASAR, penerima: [[2027, IMAM, DENAI, 3], [2026, IMAM, DENAI, 5]] });
  const asli = db.query.bind(db);
  db.query = async (teks, nilai) => {
    if (Array.isArray(nilai) && nilai[0] === 2026) throw new Error("uji: kueri 2026 sengaja gagal");
    return asli(teks, nilai);
  };
  const r = await K.getProgresKuota(TOKEN.utama);
  assert.equal(r.sukses, true, JSON.stringify(r));
  assert.equal(r.bandingTersedia, false);
  const g = grupDari(r, IMAM), b = barisDari(g, DENAI);
  assert.deepEqual({ i: b.input, k: b.kuota, p: b.persen }, { i: 3, k: 10, p: 30 }, "kolom lama utuh");
  assert.equal(b.input2026, null);
  assert.equal(b.selisih, null);
  assert.equal(g.total2026, null);
  assert.equal(g.selisihTotal, null);
  await db.close();
});

test("AKSES: non-UTAMA dan tanpa sesi ditolak; tidak ada data yang bocor", opsi, async () => {
  const db = await baru({ kuota: KUOTA_DASAR, penerima: [[2026, IMAM, DENAI, 5]] });
  for (const t of [TOKEN.kec, "TOKEN-ASAL", "", undefined]) {
    const r = await K.getProgresKuota(t);
    assert.equal(r.sukses, false, String(t));
    assert.equal(r.grup, undefined);
  }
  assert.match((await K.getProgresKuota(TOKEN.kec)).pesan, /khusus Admin Utama/);
  await db.close();
});
