// Koreksi koordinat oleh SISTEM di Postgres SUNGGUHAN (PGlite): kode domain ASLI, migrasi cek_koordinat ASLI. Rencana: percakapan 2026-11-17.
// Jalankan: npm run uji:koreksi-koordinat  (butuh @electric-sql/pglite; bila tidak ada, uji DILEWATI)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { muatPglite, muatServerPg } from "./_harness-pg.mjs";

const PGlite = await muatPglite();
const lewati = PGlite ? false : "PGlite tidak tersedia";
if (!PGlite) console.log("DILEWATI: " + lewati);
const KK = PGlite ? await muatServerPg("supabase/functions/api/domains/koreksiKoordinat.ts", { stub: ["dataDetail.ts"] }) : null;
const opsi = { skip: lewati };
const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const MIGRASI = baca("supabase/migrations/20261117100000_cek_koordinat.sql");
const MIGRASI_TABEL = MIGRASI.slice(0, MIGRASI.indexOf("do $$"));
const BATAS = (baca("supabase/functions/api/_shared/config.ts").match(/BATAS_PERBAIKAN_SERAGAM = "([\d-]+)"/) || [])[1];

const NAMA = ["admin", "verif_a", "kec_x"];
const ID = Object.fromEntries(NAMA.map((n, i) => [n, "00000000-0000-4000-8000-" + String(i + 1).padStart(12, "0")]));
const TOKEN = Object.fromEntries(NAMA.map((n) => [n, "T-" + n]));
const ROLE = (n) => (n === "admin" ? "UTAMA" : n === "kec_x" ? "KECAMATAN" : "VERIFIKATOR");
const GMM = "GURU MAGHRIB MENGAJI";
const OK = "https://maps.google.com/?q=3.6,98.67";

// id, layanan, status, oleh, tautan, hasil, alasan, tautanCek, riwayatSATU, tugas
const BARIS = [
  [1, GMM, "Memenuhi Syarat", "VERIF_A", "https://www.google.com/maps/@3.5,98.6,34a,75y/data=!1e1", "TIDAK_VALID", "STREET_VIEW", null, true, null],   // layak
  [2, GMM, "Memenuhi Syarat", "VERIF_B", "https://maps.app.goo.gl/x2", "TIDAK_VALID", "TANPA_PENANDA", null, true, null],                           // layak
  [3, GMM, "Memenuhi Syarat", "ADMIN", "https://maps.app.goo.gl/x3", "TIDAK_VALID", "STREET_VIEW", null, false, null],                              // hasil admin
  [4, GMM, "Memenuhi Syarat", "VERIF_A", "https://maps.app.goo.gl/x4", "TIDAK_VALID", "STREET_VIEW", null, true, "AKTIF"],                          // dalam paket aktif
  [5, GMM, "Memenuhi Syarat", "VERIF_A", OK, "VALID", "", null, true, null],                                                                       // koordinat valid
  [6, GMM, "Memenuhi Syarat", "VERIF_A", "https://maps.app.goo.gl/baru6", "TIDAK_VALID", "STREET_VIEW", "https://maps.app.goo.gl/lama6", true, null], // hasil basi
  [7, GMM, "Berkas Tidak Lengkap", "VERIF_A", "https://maps.app.goo.gl/x7", "TIDAK_VALID", "STREET_VIEW", null, true, null],                         // bukan MS
  [8, "GURU SEKOLAH MINGGU", "Memenuhi Syarat", "VERIF_A", "https://maps.app.goo.gl/x8", "TIDAK_VALID", "STREET_VIEW", null, true, null],           // layanan lain
  [9, GMM, "Memenuhi Syarat", "VERIF_A", "https://maps.app.goo.gl/x9", "TIDAK_VALID", "STREET_VIEW", null, false, null],                            // tanpa riwayat hasil verifikator
  [10, GMM, "Memenuhi Syarat", "VERIF_A", "https://maps.app.goo.gl/x10", "TIDAK_VALID", "STREET_VIEW", null, true, "SELESAI"],                       // sudah diperiksa ulang
  [11, GMM, "Memenuhi Syarat", "VERIF_A", "https://maps.app.goo.gl/x11", "TIDAK_VALID", "STREET_VIEW", null, true, "DITARIK"],                       // tugas ditarik: tetap layak
  [12, GMM, "Memenuhi Syarat", "ADMIN", "https://maps.app.goo.gl/x12", "TIDAK_VALID", "STREET_VIEW", null, true, null],                           // pernah diverifikator, kini MS oleh ADMIN: bukan kandidat
];

async function siap() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated;");
  await db.exec(`
    create table akun (id uuid primary key, username text not null, role text not null);
    create table sesi_login (token text primary key);
    create table penerima (id bigint, tahun int not null, nama text, nik text, layanan text, kecamatan text default 'MEDAN X', kelurahan text default 'KEL X', link_koordinat_lokasi text,
      status_verifikasi text default 'Proses Verifikasi', keterangan_verifikasi text default '', tanggal_verifikasi timestamptz, diverifikasi_oleh text default '',
      batas_waktu_perbaikan date, tanggal_lapor_perbaikan timestamptz, dilapor_oleh text, tanggal_berkas_diubah timestamptz, diperbarui_at timestamptz, primary key (id, tahun));
    create table riwayat_verifikasi (id bigserial primary key, waktu timestamptz not null default now(), penerima_id bigint not null, tahun int not null,
      status_lama text, status_baru text, keterangan text, oleh text, sumber text);
    create table tugas_verifikasi_ulang (id bigserial primary key, penerima_id bigint not null, tahun int not null, selesai_pada timestamptz, ditarik_pada timestamptz, hasil text);`);
  for (const n of NAMA) await db.query("insert into akun (id, username, role) values ($1, $2, $3)", [ID[n], n, ROLE(n)]);
  await db.exec(MIGRASI_TABEL);
  for (const [id, lay, st, oleh, tautan, hasil, alasan, tautanCek, riw, tugas] of BARIS) {
    await db.query("insert into penerima (id, tahun, nama, layanan, link_koordinat_lokasi, status_verifikasi, diverifikasi_oleh, tanggal_lapor_perbaikan, dilapor_oleh) values ($1, 2027, $2, $3, $4, $5, $6, now(), 'GURU')",
      [id, "NAMA " + id, lay, tautan, st, oleh]);
    await db.query("insert into cek_koordinat (penerima_id, tahun, tautan, hasil, alasan) values ($1, 2027, $2, $3, $4)", [id, tautanCek || tautan, hasil, alasan]);
    if (riw) await db.query("insert into riwayat_verifikasi (penerima_id, tahun, status_lama, status_baru, keterangan, oleh, sumber) values ($1, 2027, 'Proses Verifikasi', 'Memenuhi Syarat', '', $2, 'SATU')", [id, id === 12 ? 'VERIF_A' : oleh]);   // baris 12: riwayat milik verifikator, tetapi pemverifikasi terakhir ADMIN
    if (tugas === "AKTIF") await db.query("insert into tugas_verifikasi_ulang (penerima_id, tahun) values ($1, 2027)", [id]);
    if (tugas === "SELESAI") await db.query("insert into tugas_verifikasi_ulang (penerima_id, tahun, selesai_pada, hasil) values ($1, 2027, now(), 'SESUAI')", [id]);
    if (tugas === "DITARIK") await db.query("insert into tugas_verifikasi_ulang (penerima_id, tahun, ditarik_pada) values ($1, 2027, now())", [id]);
  }
  globalThis.__ujiPg = db;
  globalThis.__ujiArsip = [];
  globalThis.__ujiSesi = Object.fromEntries(NAMA.map((n) => [TOKEN[n], { akunId: ID[n], username: n, role: ROLE(n), kecamatan: "", userId: "" }]));
  return db;
}
const keadaan = async (db) => Object.fromEntries((await db.query("select id, status_verifikasi s, diverifikasi_oleh o, keterangan_verifikasi k, batas_waktu_perbaikan::text b, tanggal_lapor_perbaikan l, dilapor_oleh d from penerima order by id")).rows.map((r) => [r.id, r]));
// kueri hitungan verifikator PERSIS seperti getRingkasanVerifikasiSaya (verifikasi.ts)
const hitunganVerif = async (db, nama) => (await db.query(`select count(*)::int as total, count(*) filter (where status_baru = 'Memenuhi Syarat')::int as ms from (
  select distinct on (penerima_id) penerima_id, waktu, status_baru from riwayat_verifikasi where tahun = 2027 and oleh = $1 and sumber = 'SATU'
  and coalesce(nullif(trim(status_lama), ''), 'Proses Verifikasi') = 'Proses Verifikasi' order by penerima_id, waktu) x`, [nama])).rows[0];

test("KETERANGAN: kalimat sama dengan Excel yang disetujui user", opsi, () => {
  assert.equal(KK.keteranganKoordinat("STREET_VIEW"), "Koordinat tidak valid: tautan Street View, bukan titik penanda. Mohon kirim ulang titik lokasi yang benar (tekan lama titik di Google Maps, pilih Bagikan, lalu Salin tautan).");
  assert.match(KK.keteranganKoordinat("TANPA_PENANDA"), /^Koordinat tidak valid: tautan hanya menampilkan tampilan peta, tanpa titik penanda\./);
});

test("PRATINJAU: hanya data yang tepat; TIDAK mengubah apa pun", opsi, async () => {
  const db = await siap();
  const sebelum = await keadaan(db), riwSebelum = (await db.query("select count(*)::int n from riwayat_verifikasi")).rows[0].n;
  const p = await KK.koreksiKoordinatBermasalah(TOKEN.admin);
  assert.equal(p.sukses, true, JSON.stringify(p));
  assert.equal(p.dryRun, true);
  assert.deepEqual(p.data.map((x) => x.id).sort((x, y) => x - y), [1, 2, 11], "layak: 1, 2, 11 (tugas ditarik tetap layak); bukan 3(admin) 12(admin, pernah verifikator) 4(paket) 5(valid) 6(basi) 7(BTL) 8(layanan lain) 9(tanpa riwayat) 10(sudah diperiksa ulang)");
  assert.match(p.data[0].keterangan, /^Koordinat tidak valid: tautan Street View/);
  assert.deepEqual(Object.keys(p.data[0]).sort(), ["alasan", "id", "kecamatan", "kelurahan", "keterangan", "nama"], "tanpa NIK");
  assert.deepEqual(await keadaan(db), sebelum, "data tidak berubah");
  assert.equal((await db.query("select count(*)::int n from riwayat_verifikasi")).rows[0].n, riwSebelum);
  assert.equal(globalThis.__ujiArsip.length, 0);
});

test("GERBANG: hanya Admin Utama; tanpa pratinjau/daftar id -> ditolak; jalankan non-true -> tetap pratinjau", opsi, async () => {
  const db = await siap();
  for (const t of [TOKEN.verif_a, TOKEN.kec_x, "tak-ada"]) { const r = await KK.koreksiKoordinatBermasalah(t, true, [1]); assert.equal(r.sukses, false); }
  assert.match((await KK.koreksiKoordinatBermasalah(TOKEN.verif_a)).pesan, /khusus Admin Utama/);
  assert.match((await KK.koreksiKoordinatBermasalah(TOKEN.admin, true, [])).pesan, /pratinjau/i);
  assert.match((await KK.koreksiKoordinatBermasalah(TOKEN.admin, true)).pesan, /pratinjau/i);
  assert.equal((await KK.koreksiKoordinatBermasalah(TOKEN.admin, "true", [1])).dryRun, true, "hanya boolean true yang menjalankan");
  assert.equal((await KK.koreksiKoordinatBermasalah(TOKEN.admin, 1, [1])).dryRun, true);
  assert.match((await KK.koreksiKoordinatBermasalah(TOKEN.admin, true, Array.from({ length: 301 }, (_, i) => i + 1))).pesan, /Terlalu banyak/);
  assert.equal((await db.query("select count(*)::int n from penerima where status_verifikasi = 'Berkas Tidak Lengkap'")).rows[0].n, 1, "hanya baris 7 yang memang BTL");
});

test("JALANKAN: hanya id layak yang diubah; semua kolom benar; hitungan verifikator TIDAK berubah; riwayat SISTEM/OTOMATIS; arsip Data Detail", opsi, async () => {
  const db = await siap();
  const hv = await hitunganVerif(db, "VERIF_A"), hb = await hitunganVerif(db, "VERIF_B");
  const lain = (await keadaan(db));
  const r = await KK.koreksiKoordinatBermasalah(TOKEN.admin, true, [1, 2, 3, 4, 999]);
  assert.equal(r.sukses, true, JSON.stringify(r));
  assert.equal(r.diubah, 2);
  assert.deepEqual(r.dilewati.map((x) => x.id).sort((a, b) => a - b), [3, 4, 999]);
  const sesudah = await keadaan(db);
  for (const id of [1, 2]) {
    const x = sesudah[id];
    assert.equal(x.s, "Berkas Tidak Lengkap"); assert.equal(x.o, "SISTEM"); assert.equal(x.b, BATAS, "batas perbaikan seragam");
    assert.equal(x.l, null); assert.equal(x.d, null, "tanda laporan lama dikosongkan");
  }
  assert.equal(sesudah[1].k, KK.keteranganKoordinat("STREET_VIEW")); assert.equal(sesudah[2].k, KK.keteranganKoordinat("TANPA_PENANDA"));
  for (const id of [3, 4, 5, 6, 7, 8, 9, 10, 11]) assert.deepEqual(sesudah[id], lain[id], "data lain tidak tersentuh: " + id);
  const rw = (await db.query("select penerima_id, status_lama, status_baru, oleh, sumber from riwayat_verifikasi where oleh = 'SISTEM' order by penerima_id")).rows;
  assert.deepEqual(rw, [1, 2].map((id) => ({ penerima_id: id, status_lama: "Memenuhi Syarat", status_baru: "Berkas Tidak Lengkap", oleh: "SISTEM", sumber: "OTOMATIS" })));
  // baris riwayat milik verifikator tetap ada, hitungan mereka SAMA
  assert.deepEqual(await hitunganVerif(db, "VERIF_A"), hv); assert.deepEqual(await hitunganVerif(db, "VERIF_B"), hb);
  assert.deepEqual(await hitunganVerif(db, "SISTEM"), { total: 0, ms: 0 }, "SISTEM bukan akun yang dihitung");
  assert.deepEqual(globalThis.__ujiArsip.map((a) => [a.ids, a.alasan, a.oleh]), [[[1, 2], "Berkas Tidak Lengkap", "SISTEM"]]);
  // bukan lagi kandidat; pelaksanaan kedua tidak mengubah apa pun
  assert.deepEqual((await KK.koreksiKoordinatBermasalah(TOKEN.admin)).data.map((x) => x.id), [11]);
  const ulang = await KK.koreksiKoordinatBermasalah(TOKEN.admin, true, [1, 2]);
  assert.equal(ulang.diubah, 0); assert.equal(ulang.dilewati.length, 2);
  assert.equal((await db.query("select count(*)::int n from riwayat_verifikasi where oleh = 'SISTEM'")).rows[0].n, 2, "tidak ada riwayat ganda");
});

test("ATOMIK: riwayat gagal -> perubahan data ikut dibatalkan (tidak ada BTL tanpa catatan)", opsi, async () => {
  const db = await siap();
  await db.exec("alter table riwayat_verifikasi add constraint tolak_sistem check (oleh <> 'SISTEM')");
  const sebelum = await keadaan(db);
  const r = await KK.koreksiKoordinatBermasalah(TOKEN.admin, true, [1, 2]);
  assert.equal(r.sukses, false); assert.match(r.pesan, /tidak ada data yang diubah/);
  assert.deepEqual(await keadaan(db), sebelum);
  assert.equal(globalThis.__ujiArsip.length, 0, "tidak diarsipkan bila tidak ada yang berubah");
});

test("KABEL: aksi terdaftar di ALLOWED, TIDAK ada di daftar-putih Verifikator (default tolak); tak ada jalur selain Admin Utama", () => {
  const idx = baca("supabase/functions/api/index.ts");
  assert.match(idx, /^\s*koreksiKoordinatBermasalah,/m);
  assert.doesNotMatch(baca("supabase/functions/api/_shared/gerbangPeran.ts"), /koreksiKoordinatBermasalah/);
  const dom = baca("supabase/functions/api/domains/koreksiKoordinat.ts");
  assert.match(dom, /!== "UTAMA"\) throw/);
  assert.match(dom, /jalankan !== true/);
});

test("BALAPAN: data berubah TEPAT sebelum UPDATE (status jadi BTL / muncul tugas Verifikasi Ulang) -> tidak ditimpa, dilewati, tanpa riwayat", opsi, async () => {
  const db = await siap();
  const asli = db.transaction.bind(db);
  let sudah = false;
  db.transaction = (fn) => asli(async (tx) => {
    const q = tx.query.bind(tx);
    tx.query = async (t, p) => {
      if (!sudah && /update penerima p set/.test(t)) {
        sudah = true;
        await q("update penerima set status_verifikasi = 'Berkas Tidak Lengkap' where id = 1");               // Admin menurunkannya lebih dulu
        await q("insert into tugas_verifikasi_ulang (penerima_id, tahun) values (2, 2027)");                  // masuk paket Verifikasi Ulang
      }
      return q(t, p);
    };
    return fn(tx);
  });
  const r = await KK.koreksiKoordinatBermasalah(TOKEN.admin, true, [1, 2]);
  assert.equal(r.sukses, true, JSON.stringify(r));
  assert.equal(r.diubah, 0);
  assert.deepEqual(r.dilewati.map((x) => x.id).sort(), [1, 2]);
  const k = await keadaan(db);
  assert.equal(k[1].o, "VERIF_A", "baris 1 tidak ditimpa oleh SISTEM");
  assert.equal(k[2].s, "Memenuhi Syarat"); assert.equal(k[2].o, "VERIF_B", "baris 2 (kini dalam paket) tidak disentuh");
  assert.equal((await db.query("select count(*)::int n from riwayat_verifikasi where oleh = 'SISTEM'")).rows[0].n, 0);
  assert.equal(globalThis.__ujiArsip.length, 0);
});
