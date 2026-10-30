// Server Cek Alamat Tugas GMM di Postgres SUNGGUHAN (PGlite): kode domain ASLI + migrasi ASLI. Plan: plans/plan-cek-alamat-tugas-gmm.md.
// Jalankan: npm run uji:cek-alamat. Memerlukan @electric-sql/pglite (bukan dependensi repo; lihat scripts/uji/_harness-pg.mjs) --
// bila tidak ada, uji ini DILEWATI (bukan gagal) dan pesan cara memasangnya dicetak.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { muatPglite, muatServerPg } from "./_harness-pg.mjs";
import { tempatTugasRumah } from "../../supabase/functions/api/_shared/cekAlamatInti.ts";

const PGlite = await muatPglite();
const lewati = PGlite ? false : "PGlite tidak tersedia (npm install --no-save @electric-sql/pglite@0.3.14, atau set PGLITE_DIR)";
if (!PGlite) console.log("DILEWATI: " + lewati);
const D = PGlite ? await muatServerPg("supabase/functions/api/domains/cekAlamatTugas.ts") : null;
const MIGRASI = fs.readFileSync(new URL("../../supabase/migrations/20261031100000_cek_alamat_tugas_gmm.sql", import.meta.url), "utf8");

// ---- Basis data uji: tabel minimal yang dibaca/ditulis kode (editDataPenerima ikut dijalankan sungguhan) ----
const DDL = `
  create role anon; create role authenticated;
  create table penerima (
    id bigint primary key, tahun int not null, nomor_urut int, nik text, nama text, jenis_kelamin text, tempat_lahir text, tanggal_lahir date,
    umur int, alamat text, layanan text, tempat_tugas text, alamat_tugas text, kecamatan text, kelurahan text, nama_rekening text,
    nomor_rekening text, kantor_cabang text, no_kontak text, status_bpjs_tk text, status_verifikasi text, link_koordinat_lokasi text,
    rumah_ibadah_id bigint, id_folder_berkas text, tanggal_berkas_diubah timestamptz, diperbarui_at timestamptz);
  create table data_detail (penerima_id bigint, tahun int, alamat_tugas text, tempat_tugas text, rumah_ibadah_id bigint, diperbarui_at timestamptz);
  create table riwayat_edit (id serial primary key, waktu timestamptz, editor_username text, editor_role text, penerima_id bigint, tahun int,
    nama_penerima text, kolom_diubah text, sebelum text, sesudah text);
  create table rumah_ibadah (id bigint primary key, nama text, alamat text, kecamatan text, kelurahan text);
  create table akun (username text primary key, nama_lengkap text);`;

const GMM = "GURU MAGHRIB MENGAJI";
function seed(id, o) {
  const d = { tahun: 2027, layanan: GMM, status_verifikasi: "Memenuhi Syarat", kelurahan: "KEL X", link_koordinat_lokasi: "https://maps.google.com/?q=3.5,98.6", ...o };
  return [`insert into penerima (id, tahun, nik, nama, alamat, layanan, tempat_tugas, alamat_tugas, kecamatan, kelurahan, status_verifikasi, link_koordinat_lokasi, no_kontak, nomor_rekening)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'0811111','1234567890123')`,
    [id, d.tahun, "12710000000000" + String(id).padStart(2, "0"), d.nama, d.alamat, d.layanan, d.tempat_tugas, d.alamat_tugas, d.kecamatan, d.kelurahan, d.status_verifikasi, d.link_koordinat_lokasi]];
}
const DATA = [
  [1, { nama: "ANI", alamat: "JL. A NO 1", tempat_tugas: "RUMAH", alamat_tugas: "JL. A NO 1", kecamatan: "MEDAN LABUHAN" }],          // sama dgn rumah
  [2, { nama: "BUDI", alamat: "JL. Z NO 9", tempat_tugas: "RUMAH", alamat_tugas: "JL. B NO 2", kecamatan: "MEDAN LABUHAN" }],
  [3, { nama: "CICI", alamat: "JL C NO 3", tempat_tugas: "rmh", alamat_tugas: "JL C NO 3", kecamatan: "MEDAN DENAI" }],
  [4, { nama: "DEDI", alamat: "JL D", tempat_tugas: "RUMAH IBADAH AL AMIN", alamat_tugas: "JL AMIN", kecamatan: "MEDAN DENAI" }],     // lembaga
  [5, { nama: "EKA", alamat: "JL E", tempat_tugas: "MASJID X", alamat_tugas: "JL MASJID", kecamatan: "MEDAN LABUHAN" }],               // masjid
  [6, { nama: "FARID", alamat: "JL F", tempat_tugas: "RUMAH", alamat_tugas: "JL F", kecamatan: "MEDAN LABUHAN", layanan: "BILAL JENAZAH" }], // layanan lain
  [7, { nama: "GITA", alamat: "JL Q NO 7", tempat_tugas: "RUMAH", alamat_tugas: "JL. D NO 4", kecamatan: "MEDAN TEMBUNG" }],
  [8, { nama: "HANI", alamat: "JL H", tempat_tugas: "RUMAH", alamat_tugas: "JL H", kecamatan: "MEDAN LABUHAN", tahun: 2026 }],           // tahun lain
];
const TOKEN = { utama: "T-UTAMA", labuhan: "T-LAB", denai: "T-DEN", tembung: "T-TEM", kota: "T-KOTA", kec: "T-KEC", mui: "T-MUI" };
function pasangSesi() {
  const s = (username, role, kecamatan) => ({ akunId: "id-" + username, username, role, kecamatan, userId: "" });
  globalThis.__ujiSesi = {
    [TOKEN.utama]: s("utama1", "UTAMA", ""),
    [TOKEN.labuhan]: s("gmm_labuhan", GMM, "MEDAN LABUHAN"),
    [TOKEN.denai]: s("gmm_denai", GMM, "MEDAN DENAI"),
    [TOKEN.tembung]: s("gmm_tembung", GMM, "MEDAN TEMBUNG"),
    [TOKEN.kota]: s("gmm_kota", GMM, ""),
    [TOKEN.kec]: s("kec_labuhan", "KECAMATAN", "MEDAN LABUHAN"),
    [TOKEN.mui]: s("mui1", "MUI", ""),
  };
}

/** Basis data segar: DDL + migrasi ASLI (dijalankan 2x: idempoten) + data awal + akun. */
async function baru(opsi = {}) {
  const db = new PGlite();
  await db.exec(DDL);
  await db.exec(MIGRASI);
  await db.exec(MIGRASI);
  for (const [id, o] of DATA) await db.query(...seed(id, o));
  await db.query(`insert into akun values ('utama1','Admin Utama Uji'), ('gmm_labuhan','Guru Labuhan Uji')`);
  globalThis.__ujiPg = db;
  globalThis.__ujiIzin = undefined;
  pasangSesi();
  if (opsi.buka !== false) {
    const r = await D.cekAlamatBuka(TOKEN.utama, "eksekusi", "");
    assert.equal(r.sukses, true, JSON.stringify(r));
  }
  return db;
}
const q = async (teks, nilai = []) => (await globalThis.__ujiPg.query(teks, nilai)).rows;
const cekIdDari = async (penerimaId) => Number((await q("select id from cek_alamat_tugas where penerima_id = $1", [penerimaId]))[0].id);
const tunggu = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const ditolak = (r, pola) => { assert.equal(r.sukses, false, JSON.stringify(r)); if (pola) assert.match(r.pesan, pola, r.pesan); };

const opsi = { skip: lewati };

// ───────────────────────────────────────── Migrasi ─────────────────────────────────────────
test("MIGRASI: idempoten (2x), RLS aktif di 3 tabel, batasan status/menunggu dan keunikan berlaku, utas hanya-tambah", opsi, async () => {
  const db = await baru({ buka: false });
  const rls = await q(`select relname, relrowsecurity from pg_class where relname in ('cek_alamat_tugas','cek_alamat_tugas_pesan','cek_alamat_tugas_kecamatan') order by 1`);
  assert.equal(rls.length, 3);
  for (const r of rls) assert.equal(r.relrowsecurity, true, r.relname);
  await q(`insert into cek_alamat_tugas (tahun, penerima_id, dibuka_oleh, status, menunggu) values (2027, 1, 'u', 'BELUM', 'GMM')`);
  await assert.rejects(q(`insert into cek_alamat_tugas (tahun, penerima_id, dibuka_oleh, status, menunggu) values (2027, 1, 'u', 'BELUM', 'GMM')`), /unique|uq_cek/i, "satu per guru per tahun");
  await assert.rejects(q(`insert into cek_alamat_tugas (tahun, penerima_id, dibuka_oleh, status, menunggu) values (2027, 2, 'u', 'SELESAI', 'GMM')`), /ck_cek_alamat/i, "SELESAI tidak boleh punya yang ditunggu");
  await assert.rejects(q(`insert into cek_alamat_tugas (tahun, penerima_id, dibuka_oleh, status, menunggu) values (2027, 2, 'u', 'BELUM', null)`), /ck_cek_alamat/i, "selain SELESAI harus ada yang ditunggu");
  await assert.rejects(q(`insert into cek_alamat_tugas (tahun, penerima_id, dibuka_oleh, status, menunggu) values (2027, 2, 'u', 'ASAL', 'GMM')`), /check/i, "status di luar daftar");
  await q(`insert into cek_alamat_tugas_pesan (cek_id, pengirim_username, pengirim_role, jenis, status_sesudah, isi) values (1, 'u', 'UTAMA', 'BUKA', 'BELUM', '')`);
  await assert.rejects(q(`update cek_alamat_tugas_pesan set isi = 'ubah' where id = 1`), /hanya-tambah/);
  await assert.rejects(q(`delete from cek_alamat_tugas_pesan where id = 1`), /hanya-tambah/);
  await assert.rejects(q(`delete from cek_alamat_tugas where id = 1`), /foreign|violates/i, "permintaan yang punya utas tidak dapat dihapus");
  await assert.rejects(q(`insert into cek_alamat_tugas_pesan (cek_id, pengirim_username, pengirim_role, jenis, status_sesudah, isi) values (1, 'u', 'UTAMA', 'BUKA', 'BELUM', $1)`, ["x".repeat(501)]), /check/i, "isi maks 500");
  await db.close();
});

test("KESETARAAN: kriteria RUMAH di SQL = tempatTugasRumah() di TypeScript untuk semua contoh (termasuk tab/baris baru/spasi ganda)", opsi, async () => {
  const db = await baru({ buka: false });
  const contoh = ["RUMAH", "rumah", "  Rumah  ", "RMH", "rmh ", "RUMAH SENDIRI", "RUMAH, JL. X", "Rumah Bapak Ali", "MASJID AL IKHLAS", "RUMAH IBADAH AL AMIN",
    "rumah ibadah", "RUMAH-IBADAH X", "RUMAH.IBADAH X", "RUMAH  /  IBADAH X", "RUMAH\tIBADAH X", "RUMAH\nIBADAH X", "\tRUMAH", "RUMAHKU", "RUMAH2", "GEDUNG MADRASAH",
    "MUSHOLLA RUMAH SAKIT", "PERUMAHAN", "", "   ", "RMHKU", "RMH2", "TPU GANG PUSARA", "RUMAH  PRIBADI", "rUmAh"];
  for (const t of contoh) {
    const baris = await q(`select (${D.SQL_RUMAH}) as r from (select $1::text as tempat_tugas) p`, [t]);
    assert.equal(baris[0].r === true, tempatTugasRumah(t), JSON.stringify(t));
  }
  await db.close();
});

// ───────────────────────────────────────── Hak akses ─────────────────────────────────────────
test("AKSES: peran selain UTAMA/GMM (KECAMATAN, MUI) dan tanpa sesi DITOLAK di semua aksi; semua aksi memeriksa sesi", opsi, async () => {
  const db = await baru();
  const id = await cekIdDari(1);
  const aksi = (t) => [
    ["lencana", () => D.cekAlamatLencana(t, true)], ["ringkasan", () => D.cekAlamatRingkasan(t)], ["daftar", () => D.cekAlamatDaftar(t, {})],
    ["utas", () => D.cekAlamatUtas(t, id)], ["buka", () => D.cekAlamatBuka(t, "eksekusi", "")], ["jawab", () => D.cekAlamatJawab(t, id, "SUDAH_BENAR", "", true)],
    ["perbaiki", () => D.cekAlamatPerbaiki(t, id, "JL BARU NO 1")], ["balas", () => D.cekAlamatBalas(t, id, "halo semua")],
    ["kembalikan", () => D.cekAlamatKembalikan(t, id, "cek ulang ya")], ["selesai", () => D.cekAlamatSelesai(t, id, "selesai ya")],
  ];
  for (const t of [TOKEN.kec, TOKEN.mui, "TOKEN-ASAL", "", undefined]) {
    for (const [nama, f] of aksi(t)) ditolak(await f(), /Akses ditolak|Sesi tidak valid/i);
  }
  const sebelum = await q("select status, menunggu from cek_alamat_tugas where id = $1", [id]);
  assert.deepEqual(sebelum[0], { status: "BELUM", menunggu: "GMM" }, "tidak ada yang berubah");
  assert.equal((await q("select count(*)::int n from cek_alamat_tugas_pesan"))[0].n, 4, "hanya 4 pesan BUKA dari pembukaan awal");
  await db.close();
});

test("AKSES: aksi khusus UTAMA ditolak untuk GMM; aksi khusus GMM ditolak untuk UTAMA", opsi, async () => {
  const db = await baru();
  const id = await cekIdDari(1);
  ditolak(await D.cekAlamatBuka(TOKEN.labuhan, "eksekusi", ""), /Hanya Admin Utama/);
  ditolak(await D.cekAlamatKembalikan(TOKEN.labuhan, id, "alasan cukup"), /Hanya Admin Utama|belum dijawab/);
  ditolak(await D.cekAlamatSelesai(TOKEN.labuhan, id, "catatan cukup"), /Hanya Admin Utama/);
  ditolak(await D.cekAlamatPerbaiki(TOKEN.utama, id, "JL BARU NO 1"), /akun Guru Maghrib Mengaji/);
  ditolak(await D.cekAlamatJawab(TOKEN.utama, id, "SUDAH_BENAR", "", true), /Hanya akun Guru Maghrib Mengaji/);
  assert.equal((await q("select status from cek_alamat_tugas where id = $1", [id]))[0].status, "BELUM");
  await db.close();
});

// ───────────────────────────────────────── Membuka permintaan ─────────────────────────────────────────
test("BUKA: pratinjau tidak menulis; eksekusi hanya GMM-RUMAH tahun aktif; idempoten; data baru ikut pada pembukaan berikutnya", opsi, async () => {
  const db = await baru({ buka: false });
  let r = await D.cekAlamatBuka(TOKEN.utama, "pratinjau", "");
  assert.equal(r.sukses, true);
  assert.deepEqual({ m: r.memenuhi, a: r.sudahAda, b: r.baru }, { m: 4, a: 0, b: 4 }, JSON.stringify(r));
  assert.deepEqual(Object.fromEntries(r.perKecamatan.map((x) => [x.kecamatan, x.memenuhi])), { "MEDAN DENAI": 1, "MEDAN LABUHAN": 2, "MEDAN TEMBUNG": 1 });
  assert.equal((await q("select count(*)::int n from cek_alamat_tugas"))[0].n, 0, "pratinjau tidak menulis");

  r = await D.cekAlamatBuka(TOKEN.utama, "eksekusi", "");
  assert.equal(r.baru, 4, JSON.stringify(r));
  const baris = await q("select penerima_id::int as pid, status, menunggu, alamat_tugas_awal, sama_alamat_rumah, dibuka_oleh from cek_alamat_tugas order by penerima_id");
  assert.deepEqual(baris.map((b) => b.pid), [1, 2, 3, 7], "tidak termasuk: lembaga RUMAH IBADAH, masjid, layanan lain, tahun lain");
  for (const b of baris) assert.deepEqual({ s: b.status, m: b.menunggu, o: b.dibuka_oleh }, { s: "BELUM", m: "GMM", o: "utama1" });
  assert.deepEqual(baris.map((b) => b.sama_alamat_rumah), [true, false, true, false]);
  assert.deepEqual(baris.map((b) => b.alamat_tugas_awal), ["JL. A NO 1", "JL. B NO 2", "JL C NO 3", "JL. D NO 4"]);
  assert.equal((await q("select count(*)::int n from cek_alamat_tugas_pesan where jenis = 'BUKA'"))[0].n, 4);

  r = await D.cekAlamatBuka(TOKEN.utama, "eksekusi", "");
  assert.deepEqual({ b: r.baru, a: r.sudahAda }, { b: 0, a: 4 }, "idempoten");
  assert.equal((await q("select count(*)::int n from cek_alamat_tugas_pesan where jenis = 'BUKA'"))[0].n, 4, "tidak ada utas ganda");

  await db.query(...seed(9, { nama: "INDRA", alamat: "JL I", tempat_tugas: "RUMAH", alamat_tugas: "JL I", kecamatan: "MEDAN DENAI" }));
  r = await D.cekAlamatBuka(TOKEN.utama, "eksekusi", "MEDAN DENAI");
  assert.deepEqual({ b: r.baru, a: r.sudahAda }, { b: 1, a: 1 }, "guru baru ikut; filter kecamatan bekerja");
  await db.close();
});

test("BUKA: masukan tidak valid ditolak (mode, kecamatan asal)", opsi, async () => {
  const db = await baru({ buka: false });
  ditolak(await D.cekAlamatBuka(TOKEN.utama, "hapus", ""), /Mode tidak valid/);
  ditolak(await D.cekAlamatBuka(TOKEN.utama, undefined, ""), /Mode tidak valid/);
  ditolak(await D.cekAlamatBuka(TOKEN.utama, "eksekusi", "MEDAN NEGERI DONGENG"), /Kecamatan tidak dikenal/);
  ditolak(await D.cekAlamatBuka(TOKEN.utama, "eksekusi", "'; drop table penerima; --"), /Kecamatan tidak dikenal/);
  assert.equal((await q("select count(*)::int n from cek_alamat_tugas"))[0].n, 0);
  await db.close();
});

// ───────────────────────────────────────── Daftar / cakupan ─────────────────────────────────────────
test("CAKUPAN: tiap akun hanya melihat kecamatannya; akun Kota dan UTAMA melihat semua; GMM tidak bisa memperluas lewat filter", opsi, async () => {
  const db = await baru();
  const tot = async (t, f) => (await D.cekAlamatDaftar(t, f)).total;
  assert.equal(await tot(TOKEN.utama, {}), 4);
  assert.equal(await tot(TOKEN.kota, {}), 4, "GMM tanpa kecamatan = se-Kota");
  assert.equal(await tot(TOKEN.labuhan, {}), 2);
  assert.equal(await tot(TOKEN.denai, {}), 1);
  assert.equal(await tot(TOKEN.tembung, {}), 1);
  assert.equal(await tot(TOKEN.labuhan, { kecamatan: "MEDAN DENAI" }), 2, "filter kecamatan tidak dapat memperluas cakupan GMM");
  assert.equal(await tot(TOKEN.utama, { kecamatan: "MEDAN DENAI" }), 1);
  assert.equal(await tot(TOKEN.kota, { kecamatan: "medan  tembung" }), 1);
  const lab = (await D.cekAlamatDaftar(TOKEN.labuhan, {})).daftar;
  assert.deepEqual(lab.map((x) => x.penerimaId), [1, 2], "yang alamat tugasnya sama dgn rumah diprioritaskan");
  assert.equal(lab[0].samaAlamatRumah, true);
  assert.equal(lab[1].samaAlamatRumah, false);
  assert.equal(lab[0].masihRumah, true);
  const TERLARANG = new Set(["nik", "nokontak", "no_kontak", "kontak", "nohp", "hp", "telepon", "norekening", "nomorrekening", "rekening", "tanggallahir", "tgllahir"]);
  for (const x of lab) for (const k of Object.keys(x)) assert.ok(!TERLARANG.has(k.toLowerCase()), "tidak ada data sensitif: " + k);
  assert.doesNotMatch(JSON.stringify(lab), /12710000|0811111|1234567890123/, "nilai NIK/HP/rekening tidak ikut keluar");
  assert.match(JSON.stringify(lab), /BUDI/);
  assert.doesNotMatch(JSON.stringify(lab), /GITA|CICI/, "kecamatan lain tidak bocor");
  await db.close();
});

test("DAFTAR: filter status, 'menunggu saya', pencarian, halaman; masukan aneh/injeksi aman", opsi, async () => {
  const db = await baru();
  const id1 = await cekIdDari(1);
  assert.equal((await D.cekAlamatJawab(TOKEN.labuhan, id1, "SUDAH_BENAR", "", true)).sukses, true);
  const f = (t, x) => D.cekAlamatDaftar(t, x);
  assert.equal((await f(TOKEN.utama, { status: "MENUNGGU_SAYA" })).total, 1, "UTAMA menunggu: 1 jawaban");
  assert.equal((await f(TOKEN.labuhan, { status: "MENUNGGU_SAYA" })).total, 1, "GMM Labuhan menunggu: tinggal 1");
  assert.equal((await f(TOKEN.utama, { status: "sudah_benar" })).total, 1, "status dinormalkan");
  assert.equal((await f(TOKEN.utama, { status: "BELUM" })).total, 3);
  ditolak(await f(TOKEN.utama, { status: "ASAL" }), /Filter status tidak valid/);
  ditolak(await f(TOKEN.utama, { kecamatan: "MEDAN NEGERI" }), /Kecamatan tidak dikenal/);
  assert.equal((await f(TOKEN.utama, { cari: "bud" })).total, 1, "cari nama (tanpa peduli huruf)");
  assert.equal((await f(TOKEN.utama, { cari: "kel x" })).total, 4, "cari kelurahan");
  assert.equal((await f(TOKEN.utama, { cari: "JL. D NO" })).total, 1, "cari alamat tugas");
  assert.equal((await f(TOKEN.labuhan, { cari: "GITA" })).total, 0, "pencarian tidak menembus cakupan");
  for (const jahat of ["'; drop table penerima; --", "%", "_", "\\", "' or '1'='1", "\u0000", "x".repeat(500)]) {
    const r = await f(TOKEN.utama, { cari: jahat });
    assert.equal(r.sukses === false || r.total === 0, true, JSON.stringify(jahat).slice(0, 30));
  }
  assert.equal((await q("select count(*)::int n from penerima"))[0].n, 8, "tabel penerima utuh");
  const hal = await f(TOKEN.utama, { halaman: 999999 });
  assert.equal(hal.sukses, true); assert.equal(hal.total, 4); assert.equal(hal.daftar.length, 0);
  assert.equal((await f(TOKEN.utama, { halaman: -5 })).halaman, 1);
  assert.equal((await f(TOKEN.utama, { halaman: "abc" })).halaman, 1);
  assert.equal((await f(TOKEN.utama, null)).total, 4, "filter null aman");
  assert.equal((await f(TOKEN.utama, "bukan objek")).total, 4, "filter non-objek aman");
  await db.close();
});

test("CAKUPAN DINAMIS: data dipindah kecamatan (domisili lintas kecamatan) -> otomatis pindah cakupan; id kecamatan lain 'tidak ditemukan' (sama dgn id fiktif)", opsi, async () => {
  const db = await baru();
  const id2 = await cekIdDari(2);
  await q(`update penerima set kecamatan = 'MEDAN DENAI' where id = 2`);
  assert.equal((await D.cekAlamatDaftar(TOKEN.labuhan, {})).total, 1);
  assert.equal((await D.cekAlamatDaftar(TOKEN.denai, {})).total, 2);
  const tebak = await D.cekAlamatUtas(TOKEN.labuhan, id2);
  const fiktif = await D.cekAlamatUtas(TOKEN.labuhan, 999999);
  ditolak(tebak, /Permintaan tidak ditemukan/);
  assert.equal(tebak.pesan, fiktif.pesan, "tak bisa dibedakan dari id yang tidak ada");
  for (const hasil of [
    await D.cekAlamatJawab(TOKEN.labuhan, id2, "SUDAH_BENAR", "", true),
    await D.cekAlamatBalas(TOKEN.labuhan, id2, "coba tebak id"),
    await D.cekAlamatPerbaiki(TOKEN.labuhan, id2, "JL TEBAK NO 1"),
  ]) { ditolak(hasil, /Permintaan tidak ditemukan/); }
  assert.equal((await q("select status from cek_alamat_tugas where id = $1", [id2]))[0].status, "BELUM");
  assert.equal((await q("select alamat_tugas from penerima where id = 2"))[0].alamat_tugas, "JL. B NO 2");
  await db.close();
});

test("DATA DIHAPUS: disembunyikan dari semua GMM (termasuk Kota); UTAMA melihatnya dan dapat menutup dengan catatan", opsi, async () => {
  const db = await baru();
  const id7 = await cekIdDari(7);
  await q(`delete from penerima where id = 7`);
  assert.equal((await D.cekAlamatDaftar(TOKEN.tembung, {})).total, 0);
  assert.equal((await D.cekAlamatDaftar(TOKEN.kota, {})).total, 3);
  const utama = await D.cekAlamatDaftar(TOKEN.utama, {});
  assert.equal(utama.total, 4);
  assert.equal(utama.daftar.find((x) => x.id === id7).dataDihapus, true);
  ditolak(await D.cekAlamatUtas(TOKEN.kota, id7), /tidak ditemukan/);
  ditolak(await D.cekAlamatJawab(TOKEN.kota, id7, "SUDAH_BENAR", "", true), /tidak ditemukan/);
  ditolak(await D.cekAlamatSelesai(TOKEN.utama, id7, ""), /Catatan wajib/);
  assert.equal((await D.cekAlamatSelesai(TOKEN.utama, id7, "data sudah dihapus")).sukses, true);
  const rg = await D.cekAlamatRingkasan(TOKEN.utama);
  assert.ok(rg.daftar.some((k) => k.kecamatan === "(DATA DIHAPUS)"));
  await db.close();
});

// ───────────────────────────────────────── Jawab ─────────────────────────────────────────
test("JAWAB: Sudah benar wajib dicentang; tidak bisa menjawab dua kali; mencatat siapa dan kapan; utas bertambah", opsi, async () => {
  const db = await baru();
  const id = await cekIdDari(1);
  ditolak(await D.cekAlamatJawab(TOKEN.labuhan, id, "SUDAH_BENAR", "", false), /Centang pernyataan/);
  ditolak(await D.cekAlamatJawab(TOKEN.labuhan, id, "SUDAH_BENAR", "", undefined), /Centang pernyataan/);
  ditolak(await D.cekAlamatJawab(TOKEN.labuhan, id, "SUDAH_BENAR", "", "true"), /Centang pernyataan/, "bukan boolean true");
  assert.equal((await q("select status from cek_alamat_tugas where id = $1", [id]))[0].status, "BELUM");
  const r = await D.cekAlamatJawab(TOKEN.labuhan, id, "SUDAH_BENAR", "cocok dengan berkas", true);
  assert.deepEqual({ s: r.sukses, st: r.status, m: r.menunggu }, { s: true, st: "SUDAH_BENAR", m: "UTAMA" }, JSON.stringify(r));
  const b = (await q("select status, menunggu, dijawab_oleh, dijawab_pada from cek_alamat_tugas where id = $1", [id]))[0];
  assert.deepEqual({ s: b.status, m: b.menunggu, o: b.dijawab_oleh }, { s: "SUDAH_BENAR", m: "UTAMA", o: "gmm_labuhan" });
  assert.ok(b.dijawab_pada);
  ditolak(await D.cekAlamatJawab(TOKEN.labuhan, id, "SUDAH_BENAR", "", true), /sudah dijawab atau ditutup/);
  ditolak(await D.cekAlamatJawab(TOKEN.labuhan, id, "TIDAK_PASTI", "ragu sekarang", true), /sudah dijawab atau ditutup/);
  const utas = (await D.cekAlamatUtas(TOKEN.utama, id)).pesan;
  assert.deepEqual(utas.map((m) => m.jenis), ["BUKA", "JAWAB"]);
  assert.equal(utas[1].isi, "cocok dengan berkas");
  assert.equal(utas[1].statusSesudah, "SUDAH_BENAR");
  assert.equal(utas[1].oleh, "Guru Labuhan Uji", "nama lengkap akun");
  assert.equal(utas[0].oleh, "Admin Utama Uji");
  assert.equal(utas[1].peran, "GMM");
  assert.equal(utas[0].peran, "UTAMA");
  await db.close();
});

test("JAWAB: Tidak pasti wajib catatan; Diperbaiki (hanya mencatat) menuntut alamat memang sudah berubah; jawaban/id tidak valid ditolak", opsi, async () => {
  const db = await baru();
  const id = await cekIdDari(2);
  ditolak(await D.cekAlamatJawab(TOKEN.labuhan, id, "TIDAK_PASTI", "", false), /Catatan wajib/);
  ditolak(await D.cekAlamatJawab(TOKEN.labuhan, id, "TIDAK_PASTI", "abc", false), /Catatan wajib/);
  ditolak(await D.cekAlamatJawab(TOKEN.labuhan, id, "DIPERBAIKI", "", false), /belum berubah/);
  ditolak(await D.cekAlamatJawab(TOKEN.labuhan, id, "SELESAI", "", true), /Jawaban tidak valid/);
  ditolak(await D.cekAlamatJawab(TOKEN.labuhan, id, undefined, "", true), /Jawaban tidak valid/);
  ditolak(await D.cekAlamatJawab(TOKEN.labuhan, id, 5, "", true), /Jawaban tidak valid/);
  for (const jahat of ["abc", -1, 0, null, undefined, "1 OR 1=1", 1.5, {}]) ditolak(await D.cekAlamatJawab(TOKEN.labuhan, jahat, "SUDAH_BENAR", "", true), /Nomor permintaan tidak valid/);
  await q(`update penerima set alamat_tugas = 'JL. MANDOR NO 5' where id = 2`);   // misalnya diubah Admin Utama lewat Kelola Data
  const r = await D.cekAlamatJawab(TOKEN.labuhan, id, "DIPERBAIKI", "diperbaiki Admin Utama", false);
  assert.equal(r.sukses, true, JSON.stringify(r));
  assert.equal(r.status, "DIPERBAIKI");
  const id1 = await cekIdDari(1);
  const t = await D.cekAlamatJawab(TOKEN.labuhan, id1, "TIDAK_PASTI", "berkas belum ada", false);
  assert.equal(t.status, "TIDAK_PASTI");
  await db.close();
});

test("JAWAB: guru yang tempat tugasnya sudah BUKAN 'RUMAH' tidak dapat dijawab (jawaban maupun perbaikan); balas tetap boleh", opsi, async () => {
  const db = await baru();
  const id = await cekIdDari(1);
  await q(`update penerima set tempat_tugas = 'MASJID AL IKHLAS' where id = 1`);
  ditolak(await D.cekAlamatJawab(TOKEN.labuhan, id, "SUDAH_BENAR", "", true), /sudah bukan RUMAH/);
  ditolak(await D.cekAlamatPerbaiki(TOKEN.labuhan, id, "JL BARU NO 1"), /sudah bukan RUMAH/);
  assert.equal((await D.cekAlamatBalas(TOKEN.labuhan, id, "tempat tugas sudah diganti")).sukses, true);
  const daftar = (await D.cekAlamatDaftar(TOKEN.labuhan, {})).daftar.find((x) => x.id === id);
  assert.equal(daftar.masihRumah, false);
  await db.close();
});

test("JAWAB: dua jawaban serentak -> hanya satu yang menang (tidak ada jawaban ganda)", opsi, async () => {
  const db = await baru();
  const id = await cekIdDari(1);
  const hasil = await Promise.all([
    D.cekAlamatJawab(TOKEN.labuhan, id, "SUDAH_BENAR", "", true),
    D.cekAlamatJawab(TOKEN.labuhan, id, "TIDAK_PASTI", "ragu sekali", false),
    D.cekAlamatJawab(TOKEN.labuhan, id, "SUDAH_BENAR", "", true),
  ]);
  assert.equal(hasil.filter((r) => r.sukses).length, 1, JSON.stringify(hasil));
  assert.equal((await q("select count(*)::int n from cek_alamat_tugas_pesan where cek_id = $1 and jenis = 'JAWAB'", [id]))[0].n, 1);
  await db.close();
});

// ───────────────────────────────────────── Perbaiki alamat ─────────────────────────────────────────
test("PERBAIKI: mengubah HANYA alamat tugas (huruf besar), menyinkronkan data_detail, mencatat riwayat edit, dan mencatat jawaban DIPERBAIKI", opsi, async () => {
  const db = await baru();
  await q(`insert into data_detail (penerima_id, tahun, alamat_tugas, tempat_tugas) values (1, 2027, 'JL. A NO 1', 'RUMAH')`);
  const id = await cekIdDari(1);
  const sebelum = (await q("select * from penerima where id = 1"))[0];
  const r = await D.cekAlamatPerbaiki(TOKEN.labuhan, id, "  jl. mandor   no 5 ", "sesuai berkas");
  assert.equal(r.sukses, true, JSON.stringify(r));
  assert.equal(r.alamat, "JL. MANDOR NO 5");
  await tunggu();
  const sesudah = (await q("select * from penerima where id = 1"))[0];
  assert.equal(sesudah.alamat_tugas, "JL. MANDOR NO 5");
  for (const k of Object.keys(sebelum)) {
    if (k === "alamat_tugas" || k === "diperbarui_at") continue;
    assert.deepEqual(sesudah[k], sebelum[k], "kolom lain TIDAK berubah: " + k);
  }
  assert.equal((await q("select alamat_tugas from data_detail where penerima_id = 1"))[0].alamat_tugas, "JL. MANDOR NO 5", "data_detail ikut");
  const rw = await q("select editor_username, editor_role, kolom_diubah, sebelum, sesudah from riwayat_edit where penerima_id = 1");
  assert.equal(rw.length, 1);
  assert.deepEqual({ u: rw[0].editor_username, r: rw[0].editor_role, s: rw[0].sebelum, d: rw[0].sesudah }, { u: "gmm_labuhan", r: GMM, s: "JL. A NO 1", d: "JL. MANDOR NO 5" });
  const c = (await q("select status, menunggu, dijawab_oleh from cek_alamat_tugas where id = $1", [id]))[0];
  assert.deepEqual({ s: c.status, m: c.menunggu, o: c.dijawab_oleh }, { s: "DIPERBAIKI", m: "UTAMA", o: "gmm_labuhan" });
  const utas = (await D.cekAlamatUtas(TOKEN.utama, id)).pesan;
  assert.equal(utas[1].alamatSesudah, "JL. MANDOR NO 5");
  assert.equal(utas[1].isi, "sesuai berkas");
  ditolak(await D.cekAlamatPerbaiki(TOKEN.labuhan, id, "JL LAIN NO 9"), /sudah dijawab atau ditutup/, "tidak bisa memperbaiki dua kali");
  assert.equal((await q("select alamat_tugas from penerima where id = 1"))[0].alamat_tugas, "JL. MANDOR NO 5");
  await db.close();
});

test("PERBAIKI: masukan buruk ditolak tanpa mengubah apa pun (sama dengan sekarang, terlalu pendek/panjang, tanpa huruf, karakter kendali, bukan teks)", opsi, async () => {
  const db = await baru();
  const id = await cekIdDari(1);
  const awal = JSON.stringify(await q("select * from penerima order by id"));
  ditolak(await D.cekAlamatPerbaiki(TOKEN.labuhan, id, "jl. a no 1"), /sama dengan yang tercatat/);
  ditolak(await D.cekAlamatPerbaiki(TOKEN.labuhan, id, "JL. A  NO.1"), /sama dengan yang tercatat/, "beda tanda baca/spasi = sama");
  ditolak(await D.cekAlamatPerbaiki(TOKEN.labuhan, id, "JL"), /terlalu pendek/);
  ditolak(await D.cekAlamatPerbaiki(TOKEN.labuhan, id, "A".repeat(101)), /terlalu panjang/);
  ditolak(await D.cekAlamatPerbaiki(TOKEN.labuhan, id, "12345-678"), /nama jalan/);
  ditolak(await D.cekAlamatPerbaiki(TOKEN.labuhan, id, "JL\u0000 BARU"), /tidak diizinkan/);
  ditolak(await D.cekAlamatPerbaiki(TOKEN.labuhan, id, null), /wajib diisi/);
  ditolak(await D.cekAlamatPerbaiki(TOKEN.labuhan, id, 12345), /wajib diisi/);
  ditolak(await D.cekAlamatPerbaiki(TOKEN.labuhan, id, "JL BARU NO 1", "x".repeat(501)), /terlalu panjang/);
  ditolak(await D.cekAlamatPerbaiki(TOKEN.labuhan, "abc", "JL BARU NO 1"), /Nomor permintaan tidak valid/);
  assert.equal(JSON.stringify(await q("select * from penerima order by id")), awal, "data penerima tidak berubah sama sekali");
  assert.equal((await q("select status from cek_alamat_tugas where id = $1", [id]))[0].status, "BELUM");
  assert.equal((await q("select count(*)::int n from riwayat_edit"))[0].n, 0);
  await db.close();
});

test("PERBAIKI: aturan periode input tetap berlaku (ditutup -> ditolak, status dan data tak berubah); dibuka lagi -> berhasil", opsi, async () => {
  const db = await baru();
  const id = await cekIdDari(1);
  globalThis.__ujiIzin = { izin: false, respons: { sukses: false, pesan: "Periode input sudah ditutup." } };
  ditolak(await D.cekAlamatPerbaiki(TOKEN.labuhan, id, "JL BARU NO 1"), /Periode input sudah ditutup/);
  assert.equal((await q("select alamat_tugas from penerima where id = 1"))[0].alamat_tugas, "JL. A NO 1");
  assert.equal((await q("select status from cek_alamat_tugas where id = $1", [id]))[0].status, "BELUM");
  assert.equal((await D.cekAlamatJawab(TOKEN.labuhan, id, "TIDAK_PASTI", "periode tutup, belum bisa", false)).sukses, true, "jawaban tanpa mengubah data tetap boleh");
  globalThis.__ujiIzin = undefined;
  const id2 = await cekIdDari(2);
  assert.equal((await D.cekAlamatPerbaiki(TOKEN.labuhan, id2, "JL BARU NO 2")).sukses, true);
  await db.close();
});

test("PERBAIKI: tidak dapat dipakai mengubah data selain 'RUMAH' GMM pada daftar; akun GMM lain/KECAMATAN/UTAMA ditolak", opsi, async () => {
  const db = await baru();
  const id3 = await cekIdDari(3);
  ditolak(await D.cekAlamatPerbaiki(TOKEN.labuhan, id3, "JL BARU NO 1"), /tidak ditemukan/, "kecamatan lain");
  ditolak(await D.cekAlamatPerbaiki(TOKEN.kec, id3, "JL BARU NO 1"), /Akses ditolak/);
  ditolak(await D.cekAlamatPerbaiki(TOKEN.utama, id3, "JL BARU NO 1"), /akun Guru Maghrib Mengaji/);
  // baris yang TIDAK ada dalam daftar permintaan (penerima 5 = GMM di masjid) tak punya id cek: tidak ada jalur untuk mengubahnya.
  ditolak(await D.cekAlamatPerbaiki(TOKEN.labuhan, 5, "JL BARU NO 1"), /tidak ditemukan/, "id cek 5 bukan penerima 5");
  const kota = await D.cekAlamatPerbaiki(TOKEN.kota, id3, "JL KOTA NO 3");
  assert.equal(kota.sukses, true, "akun GMM tingkat Kota berwenang atas semua kecamatan");
  assert.equal((await q("select alamat_tugas from penerima where id = 3"))[0].alamat_tugas, "JL KOTA NO 3");
  assert.equal((await q("select alamat_tugas from penerima where id = 5"))[0].alamat_tugas, "JL MASJID");
  await db.close();
});

// ───────────────────────────────────────── Dua arah ─────────────────────────────────────────
test("UTAS: Balas dua arah memindahkan 'menunggu', status tetap; catatan pendek/kosong ditolak; setelah SELESAI tidak bisa membalas", opsi, async () => {
  const db = await baru();
  const id = await cekIdDari(2);
  const st = async () => (await q("select status, menunggu from cek_alamat_tugas where id = $1", [id]))[0];
  ditolak(await D.cekAlamatBalas(TOKEN.labuhan, id, ""), /Catatan wajib/);
  ditolak(await D.cekAlamatBalas(TOKEN.labuhan, id, "abc"), /Catatan wajib/);
  ditolak(await D.cekAlamatBalas(TOKEN.labuhan, id, "x".repeat(501)), /terlalu panjang/);
  ditolak(await D.cekAlamatBalas(TOKEN.labuhan, id, 12345), /tidak valid/);
  assert.deepEqual(await st(), { status: "BELUM", menunggu: "GMM" });
  assert.equal((await D.cekAlamatBalas(TOKEN.labuhan, id, "Alamat di berkas yang mana ya?")).menunggu, "UTAMA");
  assert.deepEqual(await st(), { status: "BELUM", menunggu: "UTAMA" });
  assert.equal((await D.cekAlamatBalas(TOKEN.utama, id, "Di surat permohonan halaman 2.")).menunggu, "GMM");
  assert.deepEqual(await st(), { status: "BELUM", menunggu: "GMM" });
  assert.equal((await D.cekAlamatJawab(TOKEN.labuhan, id, "SUDAH_BENAR", "", true)).sukses, true, "boleh menjawab setelah berbalas");
  assert.equal((await D.cekAlamatSelesai(TOKEN.utama, id, "")).sukses, true);
  ditolak(await D.cekAlamatBalas(TOKEN.labuhan, id, "masih ada pertanyaan"), /sudah selesai/);
  ditolak(await D.cekAlamatBalas(TOKEN.utama, id, "masih ada pertanyaan"), /sudah selesai/);
  const utas = (await D.cekAlamatUtas(TOKEN.labuhan, id)).pesan;
  assert.deepEqual(utas.map((m) => m.jenis), ["BUKA", "BALAS", "BALAS", "JAWAB", "SELESAI"]);
  assert.deepEqual(utas.map((m) => m.peran), ["UTAMA", "GMM", "UTAMA", "GMM", "UTAMA"]);
  assert.equal((await D.cekAlamatDaftar(TOKEN.utama, {})).daftar.find((x) => x.id === id).jumlahPesan, 5);
  await db.close();
});

test("KEMBALIKAN/SELESAI: aturan dan jejak jawaban terakhir (dijawab_oleh) TIDAK terhapus oleh balas/kembalikan/selesai", opsi, async () => {
  const db = await baru();
  const id = await cekIdDari(1);
  ditolak(await D.cekAlamatKembalikan(TOKEN.utama, id, "belum dijawab"), /belum dijawab/);
  ditolak(await D.cekAlamatSelesai(TOKEN.utama, id, ""), /Catatan wajib/, "menutup tanpa jawaban wajib beralasan");
  assert.equal((await D.cekAlamatJawab(TOKEN.labuhan, id, "SUDAH_BENAR", "", true)).sukses, true);
  const jejak = async () => (await q("select dijawab_oleh, dijawab_pada from cek_alamat_tugas where id = $1", [id]))[0];
  const j0 = await jejak();
  assert.equal(j0.dijawab_oleh, "gmm_labuhan");
  assert.equal((await D.cekAlamatBalas(TOKEN.utama, id, "terima kasih, kami cek")).sukses, true);
  assert.deepEqual(await jejak(), j0, "balas tidak menghapus jejak jawaban");
  ditolak(await D.cekAlamatKembalikan(TOKEN.utama, id, "abc"), /Catatan wajib/);
  const k = await D.cekAlamatKembalikan(TOKEN.utama, id, "Alamat masih sama dengan rumah, cek berkas lagi");
  assert.deepEqual({ s: k.status, m: k.menunggu }, { s: "DIKEMBALIKAN", m: "GMM" });
  assert.deepEqual(await jejak(), j0, "kembalikan tidak menghapus jejak jawaban");
  assert.equal((await D.cekAlamatJawab(TOKEN.labuhan, id, "TIDAK_PASTI", "masih mencari berkasnya", false)).status, "TIDAK_PASTI", "GMM menjawab lagi setelah dikembalikan");
  const s = await D.cekAlamatSelesai(TOKEN.utama, id, "");
  assert.deepEqual({ s: s.status, m: s.menunggu }, { s: "SELESAI", m: null });
  assert.equal((await jejak()).dijawab_oleh, "gmm_labuhan", "selesai tidak menghapus jejak jawaban");
  ditolak(await D.cekAlamatSelesai(TOKEN.utama, id, "lagi"), /sudah selesai/);
  const buka = await D.cekAlamatKembalikan(TOKEN.utama, id, "Dibuka ulang: ada berkas baru");
  assert.equal(buka.status, "DIKEMBALIKAN", "SELESAI dapat dibuka ulang");
  assert.equal(buka.menunggu, "GMM");
  await db.close();
});

// ───────────────────────────────────────── Lencana & pantauan ─────────────────────────────────────────
test("LENCANA: hitungan 'menunggu saya' per peran; 'dilihat' tercatat hanya untuk GMM berkecamatan saat panel dibuka", opsi, async () => {
  const db = await baru();
  const l = async (t, dilihat) => D.cekAlamatLencana(t, dilihat);
  assert.deepEqual({ m: (await l(TOKEN.labuhan)).menunggu, t: (await l(TOKEN.labuhan)).total }, { m: 2, t: 2 });
  assert.equal((await l(TOKEN.utama)).menunggu, 0);
  assert.equal((await l(TOKEN.kota)).menunggu, 4);
  assert.equal((await q("select count(*)::int n from cek_alamat_tugas_kecamatan"))[0].n, 0, "lencana tanpa catatDilihat tidak mencatat");
  await D.cekAlamatJawab(TOKEN.labuhan, await cekIdDari(1), "SUDAH_BENAR", "", true);
  assert.equal((await l(TOKEN.labuhan)).menunggu, 1);
  assert.equal((await l(TOKEN.utama)).menunggu, 1);

  await l(TOKEN.labuhan, true);
  const a = (await q("select * from cek_alamat_tugas_kecamatan"))[0];
  assert.deepEqual({ k: a.kecamatan, o: a.dilihat_oleh }, { k: "MEDAN LABUHAN", o: "gmm_labuhan" });
  await tunggu(30);
  await l(TOKEN.labuhan, true);
  const b = (await q("select * from cek_alamat_tugas_kecamatan"))[0];
  assert.equal(+b.pertama_dilihat_pada, +a.pertama_dilihat_pada, "pertama dilihat tidak berubah");
  assert.ok(+b.terakhir_dilihat_pada > +a.terakhir_dilihat_pada, "terakhir dilihat diperbarui");
  await l(TOKEN.kota, true); await l(TOKEN.utama, true);
  assert.equal((await q("select count(*)::int n from cek_alamat_tugas_kecamatan"))[0].n, 1, "akun Kota dan UTAMA tidak tercatat sebagai 'kecamatan melihat'");

  const rg = await D.cekAlamatRingkasan(TOKEN.utama);
  const lab = rg.daftar.find((k) => k.kecamatan === "MEDAN LABUHAN");
  const den = rg.daftar.find((k) => k.kecamatan === "MEDAN DENAI");
  assert.deepEqual({ t: lab.total, b: lab.belum, sb: lab.sudahBenar, mg: lab.menungguGmm, mu: lab.menungguUtama }, { t: 2, b: 1, sb: 1, mg: 1, mu: 1 });
  assert.ok(lab.pertamaDilihat && lab.terakhirDilihat, "UTAMA melihat kapan kecamatan membuka panel");
  assert.equal(den.pertamaDilihat, null, "Denai belum pernah membuka");
  const rgGmm = await D.cekAlamatRingkasan(TOKEN.labuhan);
  assert.deepEqual(rgGmm.daftar.map((k) => k.kecamatan), ["MEDAN LABUHAN"], "GMM hanya melihat ringkasan kecamatannya");
  assert.ok(!("pertamaDilihat" in rgGmm.daftar[0]), "informasi pantauan hanya untuk UTAMA");
  await db.close();
});

test("KETAHANAN: sebelum migrasi diterapkan (tabel belum ada) semua aksi gagal DENGAN PESAN, bukan melempar galat tak tertangani", opsi, async () => {
  const db = new PGlite();
  await db.exec(DDL);
  globalThis.__ujiPg = db; globalThis.__ujiIzin = undefined; pasangSesi();
  for (const r of [await D.cekAlamatLencana(TOKEN.utama), await D.cekAlamatRingkasan(TOKEN.utama), await D.cekAlamatDaftar(TOKEN.utama, {}),
    await D.cekAlamatBuka(TOKEN.utama, "pratinjau", ""), await D.cekAlamatUtas(TOKEN.utama, 1)]) {
    assert.equal(r.sukses, false);
    assert.equal(typeof r.pesan, "string");
  }
  await db.close();
});
