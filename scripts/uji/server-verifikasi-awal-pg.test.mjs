// Verifikasi Awal bagi rata di Postgres SUNGGUHAN (PGlite): migrasi ASLI, kode domain ASLI. Rencana: plans/plan-verifikasi-awal-bagi-rata.md
// Jalankan: npm run uji:verifikasi-awal-pg  (butuh @electric-sql/pglite; lihat scripts/uji/_harness-pg.mjs -- bila tidak ada, uji DILEWATI)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { muatPglite, muatServerPg } from "./_harness-pg.mjs";

const PGlite = await muatPglite();
const lewati = PGlite ? false : "PGlite tidak tersedia (npm install --no-save @electric-sql/pglite@0.3.14, atau set PGLITE_DIR)";
if (!PGlite) console.log("DILEWATI: " + lewati);
const AW = PGlite ? await muatServerPg("supabase/functions/api/domains/verifikasiAwal.ts") : null;
const VR = PGlite ? await muatServerPg("supabase/functions/api/domains/verifikasi.ts", { stub: ["dataDetail.ts"] }) : null;
const opsi = { skip: lewati };
const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
// Migrasi asli tanpa bagian pg_cron/vault (tidak ada di PGlite); bagian jadwal diperiksa lewat teks.
const MIGRASI = baca("supabase/migrations/20261116120000_verifikasi_awal_bagi_rata.sql");
const MIGRASI_TABEL = MIGRASI.slice(0, MIGRASI.indexOf("-- Jadwal tiap 10 menit"));

const NAMA = ["admin", "verif_p1", "verif_p2", "verif_p3", "verif_p4", "verif_p5", "verif_p6", "verif_ronald_fredy", "verif_fery_suhery", "verif_uga_deba", "kec_x", "verif_p7"];
const ID = Object.fromEntries(NAMA.map((n, i) => [n, "00000000-0000-4000-8000-" + String(i + 1).padStart(12, "0")]));
const TOKEN = Object.fromEntries(NAMA.map((n) => [n, "T-" + n]));
const ROLE = (n) => (n === "admin" ? "UTAMA" : n === "kec_x" ? "KECAMATAN" : "VERIFIKATOR");
const LAY = ["GURU SEKOLAH MINGGU", "GURU MAGHRIB MENGAJI", "IMAM MASJID"];

async function siap({ proses = 40, riwayat = {}, p7 = false } = {}) {
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
  `);
  for (const n of NAMA) {
    if (n === "verif_p7" && !p7) continue;
    await db.query("insert into akun (id, username, nama_lengkap, role) values ($1, $2, $3, $4)", [ID[n], n, "Nama " + n, ROLE(n)]);
  }
  await db.exec(baca("supabase/migrations/20261112100000_riwayat_verifikasi.sql"));
  await db.exec(baca("supabase/migrations/20261112150000_agregat_verifikasi.sql").split("-- Jadwal")[0]);
  await db.exec(MIGRASI_TABEL);
  // riwayat historis (Verifikasi Awal yang sudah dikerjakan) -> titik awal saat dinyalakan
  let nomor = 1;
  for (const [akun, n] of Object.entries(riwayat)) {
    for (let i = 0; i < n; i++) {
      const id = (await db.query("insert into penerima (tahun, nik, nama, layanan, status_verifikasi, diverifikasi_oleh) values (2027, $1, 'LAMA', 'IMAM MASJID', 'Memenuhi Syarat', $2) returning id", ["9" + String(nomor++).padStart(15, "0"), akun])).rows[0].id;
      await db.query("insert into riwayat_verifikasi (penerima_id, tahun, status_lama, status_baru, oleh, sumber) values ($1, 2027, 'Proses Verifikasi', 'Memenuhi Syarat', $2, 'SATU')", [id, akun]);
    }
  }
  globalThis.__ujiPg = db;
  globalThis.__ujiSesi = Object.fromEntries(NAMA.map((n) => [TOKEN[n], { akunId: ID[n], username: n, role: ROLE(n), kecamatan: "", userId: "" }]));
  await tambahProses(db, proses);
  return db;
}
let urut = 1000;
async function tambahProses(db, n, status = "Proses Verifikasi") {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const r = await db.query("insert into penerima (tahun, nik, nama, layanan, kecamatan, kelurahan, status_verifikasi) values (2027, $1, $2, $3, 'MEDAN KOTA', 'KEL', $4) returning id",
      ["1" + String(urut++).padStart(15, "0"), "BARU " + urut, LAY[i % LAY.length], status]);
    ids.push(Number(r.rows[0].id));
  }
  return ids;
}
const nyalakan = () => AW.aturPembagianAwal(TOKEN.admin, true);
const jumlahTugas = async (db) => Object.fromEntries((await db.query("select upper(a.username) u, count(*)::int n from tugas_verifikasi_awal t join akun a on a.id = t.akun_id group by 1")).rows.map((r) => [r.u, r.n]));
const milik = async (db, akun) => (await db.query("select t.penerima_id from tugas_verifikasi_awal t where t.akun_id = $1 and t.status = 'AKTIF' order by 1", [ID[akun]])).rows.map((r) => Number(r.penerima_id));
const statusData = async (db, id) => (await db.query("select status_verifikasi from penerima where id = $1", [id])).rows[0].status_verifikasi;
const verif = (akun, id, status = "Memenuhi Syarat") => VR.verifikasiSatuData(TOKEN[akun], id, status, status === "Memenuhi Syarat" ? "" : "alasan uji", "");

test("MIGRASI ASLI: tabel ada, RLS aktif, hak anon dicabut, idempoten, saklar bawaan MATI; jadwal pg_cron di berkas; pagar tugas", opsi, async () => {
  const db = await siap({ proses: 3 });
  await db.exec(MIGRASI_TABEL);   // jalankan ulang
  for (const t of ["tugas_verifikasi_awal", "sapuan_pembagian_awal", "pembagian_awal_akun"]) {
    assert.equal((await db.query("select has_table_privilege('anon', $1, 'select') as p", [t])).rows[0].p, false, t);
    assert.equal((await db.query("select relrowsecurity from pg_class where relname = $1", [t])).rows[0].relrowsecurity, true, "RLS " + t);
  }
  assert.equal((await db.query("select value from setelan where key = 'verif_awal_aktif'")).rows[0].value, "0", "bawaan MATI");
  assert.match(MIGRASI, /cron\.schedule\(\s*'bagi-verifikasi-awal',\s*'\*\/10 \* \* \* \*'/);
  assert.match(MIGRASI, /'action', 'jalankanPembagianAwalOtomatis'/);
  assert.match(MIGRASI, /vault\.decrypted_secrets where name = 'sync_worker_secret'/);
  const id = (await db.query("select id from penerima limit 1")).rows[0].id;
  const t = (await db.query("insert into tugas_verifikasi_awal (penerima_id, tahun, akun_id) values ($1, 2027, $2) returning id", [id, ID.verif_p1])).rows[0].id;
  await assert.rejects(() => db.query("insert into tugas_verifikasi_awal (penerima_id, tahun, akun_id) values ($1, 2027, $2)", [id, ID.verif_p2]), /unique|duplicate/i, "satu tugas AKTIF per data");
  await assert.rejects(() => db.query("update tugas_verifikasi_awal set akun_id = $2 where id = $1", [t, ID.verif_p2]), /tidak boleh diganti/, "pemilik tak bisa dialihkan");
  await db.query("update tugas_verifikasi_awal set status = 'SELESAI', selesai_pada = now() where id = $1", [t]);
  await assert.rejects(() => db.query("update tugas_verifikasi_awal set status = 'AKTIF' where id = $1", [t]), /tidak boleh diubah/);
  await assert.rejects(() => db.query("delete from tugas_verifikasi_awal where id = $1", [t]), /tidak boleh dihapus/);
  await db.query("insert into tugas_verifikasi_awal (penerima_id, tahun, akun_id) values ($1, 2027, $2)", [id, ID.verif_p2]);   // data sama boleh punya tugas baru setelah yang lama selesai
});

test("SAKLAR MATI: penyapu otomatis tidak berbuat apa pun; verifikator memilih data sendiri seperti sebelumnya", opsi, async () => {
  const db = await siap({ proses: 6 });
  const r = await AW.jalankanPembagianAwalOtomatis();
  assert.equal(r.sukses, true);
  assert.match(String(r.dilewati || ""), /dimatikan/);
  assert.equal((await db.query("select count(*)::int n from tugas_verifikasi_awal")).rows[0].n, 0);
  const t = await AW.getTugasAwalSaya(TOKEN.verif_p1);
  assert.equal(t.aktif, false);
  const id = (await db.query("select id from penerima where status_verifikasi = 'Proses Verifikasi' limit 1")).rows[0].id;
  const v = await verif("verif_p1", Number(id));
  assert.equal(v.sukses, true, JSON.stringify(v));
});

test("PRATINJAU tidak menulis; MENYALAKAN: titik awal historis, pimpinan/akun khusus tak menerima, jumlah akhir sama (selisih <= 1), dicatat", opsi, async () => {
  const db = await siap({ proses: 40, riwayat: { VERIF_P1: 12, VERIF_P2: 4 } });
  const p = await AW.pratinjauPembagianAwal(TOKEN.admin);
  assert.equal(p.sukses, true, JSON.stringify(p));
  assert.equal(p.dibagi, 40);
  assert.equal((await db.query("select count(*)::int n from tugas_verifikasi_awal")).rows[0].n, 0, "pratinjau tidak menulis");
  assert.equal((await db.query("select count(*)::int n from pembagian_awal_akun")).rows[0].n, 0);
  assert.equal((await db.query("select value from setelan where key = 'verif_awal_aktif'")).rows[0].value, "0", "pratinjau tidak menyalakan");
  const h = await nyalakan();
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.equal(h.dibagi, 40);
  const jml = await jumlahTugas(db);
  for (const k of ["VERIF_RONALD_FREDY", "VERIF_FERY_SUHERY", "VERIF_UGA_DEBA"]) assert.equal(jml[k] || 0, 0, k + " tidak boleh menerima");
  const dasar = Object.fromEntries((await db.query("select upper(a.username) u, d.dasar from pembagian_awal_akun d join akun a on a.id = d.akun_id")).rows.map((r) => [r.u, r.dasar]));
  assert.equal(dasar.VERIF_P1, 12); assert.equal(dasar.VERIF_P2, 4); assert.equal(dasar.VERIF_P3, 0);
  const pemeriksa = Object.keys(dasar).filter((u) => !["VERIF_RONALD_FREDY", "VERIF_FERY_SUHERY", "VERIF_UGA_DEBA"].includes(u));
  assert.equal(pemeriksa.length, 6, "6 pemeriksa");
  // P1 (12 historis) sudah di atas rata-rata (56/6 = 9,3): tidak menerima apa pun; kelima akun lain disamakan (selisih <= 1)
  assert.equal(jml.VERIF_P1 || 0, 0, "akun yang sudah di atas tidak menerima tambahan");
  const lima = pemeriksa.filter((u) => u !== "VERIF_P1").map((u) => dasar[u] + (jml[u] || 0));
  assert.ok(Math.max(...lima) - Math.min(...lima) <= 1, "jumlah akhir lima akun sama: " + lima);
  assert.equal(lima.reduce((a, b) => a + b, 0) + 12, 12 + 4 + 40);
  const s = (await db.query("select jenis, oleh, benih, dibagi, ringkasan from sapuan_pembagian_awal")).rows;
  assert.equal(s.length, 1); assert.equal(s[0].jenis, "MULAI"); assert.equal(s[0].dibagi, 40);
  assert.equal(typeof s[0].ringkasan, "object", "ringkasan tersimpan sebagai objek jsonb, bukan teks terenkode ganda");
  assert.ok(Object.keys(s[0].ringkasan).length >= 6);
  assert.equal((await db.query("select count(*)::int n from tugas_verifikasi_awal where status = 'AKTIF'")).rows[0].n, 40);
});

test("GERBANG: verifikator hanya memberi hasil pada data MILIKNYA; data milik orang lain dan data belum dibagi ditolak tanpa mengubah apa pun; Admin tetap bebas", opsi, async () => {
  const db = await siap({ proses: 30 });
  await nyalakan();
  const p1 = await milik(db, "verif_p1"), p2 = await milik(db, "verif_p2");
  assert.ok(p1.length > 0 && p2.length > 0);
  const riwayatSebelum = (await db.query("select count(*)::int n from riwayat_verifikasi")).rows[0].n;
  const x = await verif("verif_p1", p2[0]);
  assert.equal(x.sukses, false);
  assert.match(x.pesan, /ditugaskan kepada Nama verif_p2/);
  assert.equal(await statusData(db, p2[0]), "Proses Verifikasi", "status tidak berubah");
  assert.equal((await db.query("select count(*)::int n from riwayat_verifikasi")).rows[0].n, riwayatSebelum, "riwayat tidak bertambah (transaksi dibatalkan)");
  assert.equal((await db.query("select status from tugas_verifikasi_awal where penerima_id = $1 and status <> 'AKTIF'", [p2[0]])).rows.length, 0);
  // data milik sendiri
  const ok = await verif("verif_p1", p1[0]);
  assert.equal(ok.sukses, true, JSON.stringify(ok));
  const t = (await db.query("select status, hasil_status, selesai_pada from tugas_verifikasi_awal where penerima_id = $1", [p1[0]])).rows[0];
  assert.equal(t.status, "SELESAI"); assert.equal(t.hasil_status, "Memenuhi Syarat"); assert.ok(t.selesai_pada);
  assert.equal((await db.query("select count(*)::int n from riwayat_verifikasi where penerima_id = $1 and oleh = 'VERIF_P1' and sumber = 'SATU'", [p1[0]])).rows[0].n, 1);
  // data baru masuk, belum dibagi
  const [baru] = await tambahProses(db, 1);
  const y = await verif("verif_p3", baru);
  assert.equal(y.sukses, false); assert.match(y.pesan, /belum dibagikan/);
  assert.equal(await statusData(db, baru), "Proses Verifikasi");
  // Admin bebas atas data milik siapa pun
  const a = await VR.verifikasiSatuData(TOKEN.admin, p2[1], "Memenuhi Syarat", "", "");
  assert.equal(a.sukses, true, JSON.stringify(a));
  // BTL/TMS wajib berketerangan tetap berlaku untuk tugas
  const b = await VR.verifikasiSatuData(TOKEN.verif_p1, p1[1], "Berkas Tidak Lengkap", "", "");
  assert.equal(b.sukses, false); assert.match(b.pesan, /Keterangan/);
});

test("TUGAS MENETAP & PENUTUPAN: data diverifikasi Admin -> tugas DITUTUP oleh penyapu (tetap terhitung bagi pemiliknya); tak muncul di daftar petugas", opsi, async () => {
  const db = await siap({ proses: 24 });
  await nyalakan();
  const p2 = await milik(db, "verif_p2");
  const dibagiAwal = (await jumlahTugas(db)).VERIF_P2;
  await VR.verifikasiSatuData(TOKEN.admin, p2[0], "Tidak Memenuhi Syarat", "alasan", "");
  const sebelum = await AW.getTugasAwalSaya(TOKEN.verif_p2);   // bisa memicu penyapu oportunistik; daftar tetap harus bersih
  assert.ok(!sebelum.ids.includes(p2[0]), "data yang sudah berstatus tak tampil di daftar petugas");
  const r = await AW.bagiSekarangAwal(TOKEN.admin);
  assert.equal(r.sukses, true, JSON.stringify(r));
  assert.ok(r.ditutup <= 1);
  const t = (await db.query("select status, alasan_tutup from tugas_verifikasi_awal where penerima_id = $1", [p2[0]])).rows[0];
  assert.equal(t.status, "DITUTUP"); assert.match(t.alasan_tutup, /tidak lagi berstatus/);
  assert.equal((await jumlahTugas(db)).VERIF_P2, dibagiAwal, "jumlah pemilik tidak berubah (tugas menetap, tidak dialihkan)");
  const lagi = await AW.bagiSekarangAwal(TOKEN.admin);
  assert.equal(lagi.dibagi, 0); assert.equal(lagi.ditutup, 0, "tidak ada yang dibagi/ditutup ulang");
});

test("DATA BARU TERUS DIBAGI RATA: berkali-kali masuk, selisih tetap <= 1; akun nonaktif tidak menerima tetapi tugasnya tetap padanya", opsi, async () => {
  const db = await siap({ proses: 12 });
  await nyalakan();
  await db.query("update akun set aktif = false where username = 'verif_p6'");
  const tugasP6 = (await milik(db, "verif_p6")).length;
  for (let i = 0; i < 25; i++) {
    await tambahProses(db, 1 + ((i * 5) % 9));
    const r = await AW.jalankanPembagianAwalOtomatis();
    assert.equal(r.sukses, true, JSON.stringify(r));
    // lewati pembatas 30 detik pada pemanggilan beruntun lewat jalur Admin
    await AW.bagiSekarangAwal(TOKEN.admin);
  }
  const jml = await jumlahTugas(db);
  const aktif = ["VERIF_P1", "VERIF_P2", "VERIF_P3", "VERIF_P4", "VERIF_P5"];
  const nilai = aktif.map((u) => jml[u] || 0);
  assert.ok(Math.max(...nilai) - Math.min(...nilai) <= 1, "5 akun aktif seimbang: " + nilai);
  assert.equal((await milik(db, "verif_p6")).length, tugasP6, "akun nonaktif: tugas lama tetap, tidak ada tambahan");
  assert.equal((await db.query("select count(*)::int n from (select penerima_id from tugas_verifikasi_awal where status = 'AKTIF' group by penerima_id having count(*) > 1) x")).rows[0].n, 0, "tidak ada data bertugas ganda");
  assert.equal((await db.query("select count(*)::int n from penerima where status_verifikasi = 'Proses Verifikasi' and not exists (select 1 from tugas_verifikasi_awal t where t.penerima_id = penerima.id and t.status = 'AKTIF')")).rows[0].n, 0, "semua data menunggu sudah bertugas");
});

test("AKUN BARU sesudah menyala: mulai dari jumlah TERKECIL (tidak dibanjiri), lalu ikut dibagi rata", opsi, async () => {
  const db = await siap({ proses: 30, riwayat: { VERIF_P1: 50 } });
  await nyalakan();
  const efektifSebelum = Object.fromEntries((await db.query("select upper(a.username) u, d.dasar + (select count(*) from tugas_verifikasi_awal t where t.akun_id = d.akun_id)::int as e from pembagian_awal_akun d join akun a on a.id = d.akun_id")).rows.map((x) => [x.u, Number(x.e)]));
  const terkecil = Math.min(...["VERIF_P1", "VERIF_P2", "VERIF_P3", "VERIF_P4", "VERIF_P5", "VERIF_P6"].map((u) => efektifSebelum[u]));
  await db.query("insert into akun (id, username, nama_lengkap, role) values ($1, 'verif_p7', 'Nama verif_p7', 'VERIFIKATOR')", [ID.verif_p7]);
  await tambahProses(db, 14);
  const r = await AW.bagiSekarangAwal(TOKEN.admin);
  assert.equal(r.sukses, true, JSON.stringify(r));
  const dasar = Object.fromEntries((await db.query("select upper(a.username) u, d.dasar from pembagian_awal_akun d join akun a on a.id = d.akun_id")).rows.map((x) => [x.u, x.dasar]));
  assert.equal(dasar.VERIF_P7, terkecil, "titik awal akun baru = jumlah efektif terkecil saat itu (bukan 0 dan bukan 50)");
  const jml = await jumlahTugas(db);
  const akhir = ["VERIF_P2", "VERIF_P3", "VERIF_P4", "VERIF_P5", "VERIF_P6", "VERIF_P7"].map((u) => dasar[u] + (jml[u] || 0));
  assert.ok(Math.max(...akhir) - Math.min(...akhir) <= 1, "enam akun disamakan: " + akhir);
  assert.ok((jml.VERIF_P7 || 0) <= Math.ceil(14 / 5), "akun baru tidak dibanjiri: " + jml.VERIF_P7);
});

test("DUA PENYISIRAN BERSAMAAN: tidak ada tugas ganda dan tidak ada yang hilang", opsi, async () => {
  const db = await siap({ proses: 40 });
  await nyalakan();
  await tambahProses(db, 20);
  await Promise.all([AW.bagiSekarangAwal(TOKEN.admin), AW.bagiSekarangAwal(TOKEN.admin), AW.bagiSekarangAwal(TOKEN.admin)]);
  assert.equal((await db.query("select count(*)::int n from (select penerima_id from tugas_verifikasi_awal where status = 'AKTIF' group by penerima_id having count(*) > 1) x")).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::int n from tugas_verifikasi_awal where status = 'AKTIF'")).rows[0].n, 60);
});

test("DAFTAR PETUGAS: hanya milik sendiri, ids lengkap, halaman 50; status Admin: tabel per akun; verifikator tak boleh memakai aksi Admin", opsi, async () => {
  const db = await siap({ proses: 130 });
  await nyalakan();
  const t = await AW.getTugasAwalSaya(TOKEN.verif_p1);
  const mine = await milik(db, "verif_p1");
  assert.equal(t.sukses, true); assert.equal(t.aktif, true);
  assert.deepEqual([...t.ids].sort((a, b) => a - b), mine);
  assert.equal(t.sisa, mine.length); assert.equal(t.ditugaskan, mine.length);
  assert.ok(t.daftar.length <= 50 && t.totalHalaman === Math.ceil(mine.length / 50));
  assert.ok(t.daftar.every((x) => mine.includes(x.id)));
  const st = await AW.getStatusPembagianAwal(TOKEN.admin);
  assert.equal(st.sukses, true, JSON.stringify(st));
  assert.equal(st.aktif, true); assert.equal(st.menunggu, 0);
  const p1 = st.akun.find((a) => a.username === "verif_p1");
  assert.equal(p1.sisa, mine.length); assert.equal(p1.dikecualikan, false);
  assert.equal(st.akun.find((a) => a.username === "verif_ronald_fredy").dikecualikan, true);
  for (const f of [() => AW.getStatusPembagianAwal(TOKEN.verif_p1), () => AW.pratinjauPembagianAwal(TOKEN.verif_p1), () => AW.bagiSekarangAwal(TOKEN.verif_p1), () => AW.aturPembagianAwal(TOKEN.verif_p1, false), () => AW.getStatusPembagianAwal(TOKEN.kec_x)]) {
    const r = await f();
    assert.equal(r.sukses, false); assert.match(r.pesan, /khusus Admin Utama/);
  }
  assert.equal((await AW.getTugasAwalSaya(TOKEN.admin)).sukses, false, "daftar tugas khusus Verifikator");
  assert.equal((await db.query("select value from setelan where key = 'verif_awal_aktif'")).rows[0].value, "1", "aksi yang ditolak tidak mengubah saklar");
});

test("MEMATIKAN: verifikator kembali bebas memilih data; tugas dan riwayat tersimpan; dicatat", opsi, async () => {
  const db = await siap({ proses: 12 });
  await nyalakan();
  const p2 = await milik(db, "verif_p2");
  const r = await AW.aturPembagianAwal(TOKEN.admin, false);
  assert.equal(r.sukses, true); assert.equal(r.aktif, false);
  const v = await verif("verif_p1", p2[0]);
  assert.equal(v.sukses, true, "saklar MATI -> boleh memilih data milik orang lain: " + JSON.stringify(v));
  assert.equal((await db.query("select count(*)::int n from tugas_verifikasi_awal where status = 'AKTIF'")).rows[0].n, 12, "tugas tersimpan, tidak dihapus");
  assert.deepEqual((await db.query("select jenis from sapuan_pembagian_awal order by id")).rows.map((x) => x.jenis), ["MULAI", "MATI"]);
  const o = await AW.jalankanPembagianAwalOtomatis();
  assert.ok(o.sukses);
});

test("KEGAGALAN MENYALAKAN dibatalkan utuh: saklar tetap MATI bila pembagian gagal di tengah", opsi, async () => {
  const db = await siap({ proses: 10 });
  await db.exec("create or replace function gagal() returns trigger language plpgsql as $$ begin raise exception 'sengaja gagal'; end; $$; create trigger t_gagal before insert on tugas_verifikasi_awal for each row execute function gagal();");
  const r = await nyalakan();
  assert.equal(r.sukses, false);
  assert.equal((await db.query("select value from setelan where key = 'verif_awal_aktif'")).rows[0].value, "0", "saklar kembali MATI (transaksi dibatalkan)");
  assert.equal((await db.query("select count(*)::int n from pembagian_awal_akun")).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::int n from sapuan_pembagian_awal")).rows[0].n, 0);
});

test("BENTURAN SAAT MENULIS: bila satu data ternyata sudah ditugaskan proses lain, SELURUH penyisiran dibatalkan (tak ada tugas separuh, tak ada log)", opsi, async () => {
  const db = await siap({ proses: 6 });
  await nyalakan();
  const [a, b, c] = await tambahProses(db, 3);
  // meniru proses lain yang menyisipkan lebih dulu: penyisipan data b diabaikan diam-diam (seperti on conflict do nothing)
  await db.exec(`create or replace function lewati() returns trigger language plpgsql as $$ begin if new.penerima_id = ${b} then return null; end if; return new; end; $$;
    create trigger t_lewati before insert on tugas_verifikasi_awal for each row execute function lewati();`);
  const sebelum = (await db.query("select count(*)::int n from tugas_verifikasi_awal")).rows[0].n;
  const sapuanSebelum = (await db.query("select count(*)::int n from sapuan_pembagian_awal")).rows[0].n;
  const r = await AW.bagiSekarangAwal(TOKEN.admin);
  assert.equal(r.sukses, false);
  assert.match(r.pesan, /Pembagian dibatalkan/);
  assert.equal((await db.query("select count(*)::int n from tugas_verifikasi_awal")).rows[0].n, sebelum, "tidak ada tugas yang tertulis separuh");
  assert.equal((await db.query("select count(*)::int n from sapuan_pembagian_awal")).rows[0].n, sapuanSebelum, "log ikut dibatalkan");
  void a; void c;
});

test("PIMPINAN dan AKUN KHUSUS bebas gerbang: tetap bisa memverifikasi data milik orang lain (tugas ditutup penyapu); verifikator biasa tetap ditolak", opsi, async () => {
  const db = await siap({ proses: 20 });
  await nyalakan();
  const p2 = await milik(db, "verif_p2");
  const x = await verif("verif_ronald_fredy", p2[0]);
  assert.equal(x.sukses, true, "pimpinan tidak terkunci: " + JSON.stringify(x));
  const y = await verif("verif_uga_deba", p2[1]);
  assert.equal(y.sukses, true, "akun khusus tidak terkunci: " + JSON.stringify(y));
  const z = await verif("verif_p1", p2[2]);
  assert.equal(z.sukses, false, "verifikator biasa tetap ditolak");
  await AW.bagiSekarangAwal(TOKEN.admin);
  assert.equal((await db.query("select count(*)::int n from tugas_verifikasi_awal where penerima_id = any($1) and status = 'DITUTUP'", [[p2[0], p2[1]]])).rows[0].n, 2, "tugas yang datanya diverifikasi pimpinan ditutup");
  assert.equal((await jumlahTugas(db)).VERIF_RONALD_FREDY || 0, 0, "pimpinan tetap tidak menerima tugas");
});

test("SAKLAR MATI lalu NYALA lagi: verifikasi yang dipilih sendiri selagi MATI ikut terhitung; jumlah akhir tetap sama (selisih <= 1)", opsi, async () => {
  const db = await siap({ proses: 18 });
  await nyalakan();
  const p1 = await milik(db, "verif_p1");
  assert.equal((await verif("verif_p1", p1[0])).sukses, true);   // selesai LEWAT TUGAS (tidak boleh terhitung dua kali)
  await AW.aturPembagianAwal(TOKEN.admin, false);
  // selagi MATI: verif_p2 memilih sendiri 6 data baru yang belum punya tugas, dan 1 data milik tugas orang lain
  const bebas = await tambahProses(db, 6);
  for (const id of bebas) assert.equal((await verif("verif_p2", id)).sukses, true);
  const p3 = await milik(db, "verif_p3");
  assert.equal((await verif("verif_p2", p3[0])).sukses, true);
  await tambahProses(db, 14);
  const tugasP2Sebelum = (await jumlahTugas(db)).VERIF_P2;
  const r = await nyalakan();
  assert.equal(r.sukses, true, JSON.stringify(r));
  assert.equal((await jumlahTugas(db)).VERIF_P2, tugasP2Sebelum, "verif_p2 sudah di atas rata-rata karena pilihan sendiri: tidak menerima tugas baru");
  const efektif = (await db.query(`
    select upper(a.username) u,
      (select count(distinct r.penerima_id) from riwayat_verifikasi r where r.oleh = upper(a.username) and r.sumber = 'SATU' and r.status_lama = 'Proses Verifikasi')::int
      + (select count(*) from tugas_verifikasi_awal t where t.akun_id = a.id and t.status in ('AKTIF', 'DITUTUP'))::int as e
    from akun a where a.username in ('verif_p1','verif_p2','verif_p3','verif_p4','verif_p5','verif_p6')`)).rows;
  // verif_p2 (sudah 10) berada di atas rata-rata; kelima akun lain disamakan dengan memperhitungkan pilihan sendirinya
  const nilai = efektif.filter((x) => x.u !== "VERIF_P2").map((x) => x.e);
  assert.ok(Math.max(...nilai) - Math.min(...nilai) <= 1, "lima akun lain sama setelah MATI->NYALA: " + JSON.stringify(efektif));
  assert.ok(efektif.find((x) => x.u === "VERIF_P2").e >= Math.max(...nilai), "verif_p2 tidak di bawah yang lain (pilihan sendirinya terhitung)");
  const dasar = Object.fromEntries((await db.query("select upper(a.username) u, d.dasar from pembagian_awal_akun d join akun a on a.id = d.akun_id")).rows.map((x) => [x.u, x.dasar]));
  assert.equal(dasar.VERIF_P2, 7, "6 data bebas + 1 data milik tugas orang lain terhitung bagi verif_p2");
  assert.equal(dasar.VERIF_P1, 0, "yang selesai lewat tugas tidak dihitung dua kali");
});
