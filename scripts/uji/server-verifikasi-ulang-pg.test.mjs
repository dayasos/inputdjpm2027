// Verifikasi ulang di Postgres SUNGGUHAN (PGlite): migrasi ASLI, kode domain ASLI. Rencana: plans/plan-verifikasi-ulang.md
// Jalankan: npm run uji:verifikasi-ulang-pg  (butuh @electric-sql/pglite; lihat scripts/uji/_harness-pg.mjs -- bila tidak ada, uji DILEWATI)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { muatPglite, muatServerPg } from "./_harness-pg.mjs";

const PGlite = await muatPglite();
const lewati = PGlite ? false : "PGlite tidak tersedia (npm install --no-save @electric-sql/pglite@0.3.14, atau set PGLITE_DIR)";
if (!PGlite) console.log("DILEWATI: " + lewati);
const UL = PGlite ? await muatServerPg("supabase/functions/api/domains/verifikasiUlang.ts", { stub: ["dataDetail.ts"] }) : null;
const PE = PGlite ? await muatServerPg("supabase/functions/api/domains/pembagianUlangExcel.ts") : null;
const VF = PGlite ? await muatServerPg("supabase/functions/api/domains/verifikasi.ts", { stub: ["dataDetail.ts"] }) : null;
const opsi = { skip: lewati };
const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");

const NAMA = ["admin", "verif_p1", "verif_p2", "verif_p3", "verif_p4", "verif_p5", "verif_p6", "verif_ronald_fredy", "verif_fery_suhery", "verif_uga_deba", "kec_x"];
const ID = Object.fromEntries(NAMA.map((n, i) => [n, "00000000-0000-4000-8000-" + String(i + 1).padStart(12, "0")]));
const TOKEN = Object.fromEntries(NAMA.map((n) => [n, "T-" + n]));
const LINK = ["link_ktp", "link_buku_rekening", "link_surat_permohonan", "link_pernyataan_satu_bantuan", "link_domisili_kelurahan", "link_formulir_pendataan", "link_berkas_pendukung",
  "link_foto_plank_rumah_ibadah", "link_foto_lokasi_ibadah", "link_foto_kegiatan_belajar", "link_rekomendasi_bkm", "link_rekomendasi_rumah_ibadah", "link_domisili_rumah_ibadah"];

async function siap({ ms = 60, btl = 4, proses = 5, verifOleh = {} } = {}) {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated;");
  await db.exec(`
    create table akun (id uuid primary key, username text not null, nama_lengkap text not null default '', role text not null, aktif boolean not null default true);
    create table penerima (
      id serial, tahun int not null, nik text, nama text, layanan text, kecamatan text, kelurahan text, tempat_tugas text,
      status_verifikasi text, keterangan_verifikasi text default '', tanggal_verifikasi timestamptz, diverifikasi_oleh text,
      batas_waktu_perbaikan date, tanggal_lapor_perbaikan timestamptz, dilapor_oleh text, tanggal_berkas_diubah timestamptz,
      jenis_kelamin text, tempat_lahir text, tanggal_lahir date, alamat text, umur int, nama_rekening text, nomor_rekening text, kantor_cabang text, alamat_tugas text, no_kontak text,
      ${LINK.map((l) => l + " text").join(", ")}, link_koordinat_lokasi text, primary key (id, tahun));
    create table pembayaran_baris (id serial primary key, tahun int not null, nik text not null);
  `);
  for (const n of NAMA) {
    await db.query("insert into akun (id, username, role) values ($1, $2, $3)", [ID[n], n, n === "admin" ? "UTAMA" : n === "kec_x" ? "KECAMATAN" : "VERIFIKATOR"]);
  }
  await db.exec(baca("supabase/migrations/20261112100000_riwayat_verifikasi.sql"));
  await db.exec(baca("supabase/migrations/20261114100000_verifikasi_ulang.sql"));   // migrasi ASLI
  let nik = 1;
  const tambah = async (status, n, oleh) => {
    for (let i = 0; i < n; i++) {
      const id = (await db.query(
        "insert into penerima (tahun, nik, nama, layanan, kecamatan, status_verifikasi, diverifikasi_oleh, link_ktp, link_buku_rekening, link_koordinat_lokasi) values (2027, $1, $2, $3, 'MEDAN KOTA', $4, $5, 'https://x/ktp', 'https://x/bk', 'https://maps/x') returning id",
        ["12" + String(nik++).padStart(14, "0"), "NAMA " + nik, ["IMAM MASJID", "PENDETA", "BILAL JENAZAH"][i % 3], status, oleh || "ADMIN"])).rows[0].id;
      if (oleh) await db.query("insert into riwayat_verifikasi (penerima_id, tahun, status_lama, status_baru, oleh, sumber) values ($1, 2027, 'Proses Verifikasi', $2, $3, 'SATU')", [id, status, oleh]);
    }
  };
  await tambah("Memenuhi Syarat", ms - (verifOleh.VERIF_P1 || 0), null);
  await tambah("Memenuhi Syarat", verifOleh.VERIF_P1 || 0, "VERIF_P1");
  await tambah("Berkas Tidak Lengkap", btl, null);
  await tambah("Proses Verifikasi", proses, null);
  globalThis.__ujiPg = db;
  globalThis.__ujiSesi = Object.fromEntries(NAMA.map((n) => [TOKEN[n], { akunId: ID[n], username: n, role: n === "admin" ? "UTAMA" : n === "kec_x" ? "KECAMATAN" : "VERIFIKATOR", kecamatan: "", userId: "" }]));
  return db;
}
const buat = async (kriteria = {}) => UL.buatBatchUlang(TOKEN.admin, { benih: "BENIH-1", nama: "Paket uji", ...kriteria });

test("MIGRASI ASLI: tabel ada, hak anon dicabut, idempoten; pemicu menolak ubah/hapus tugas SELESAI tetapi mengizinkan tugas belum selesai", opsi, async () => {
  const db = await siap();
  await db.exec(baca("supabase/migrations/20261114100000_verifikasi_ulang.sql"));   // jalankan ulang
  for (const t of ["batch_verifikasi_ulang", "tugas_verifikasi_ulang", "pembatalan_koreksi_ulang"]) {
    assert.equal((await db.query("select has_table_privilege('anon', $1, 'select') as p", [t])).rows[0].p, false, t);
    assert.equal((await db.query("select relrowsecurity from pg_class where relname = $1", [t])).rows[0].relrowsecurity, true, "RLS " + t);
  }
  const b = (await db.query("insert into batch_verifikasi_ulang (nama, dibuat_oleh, benih, kriteria, pemeriksa) values ('x','ADMIN','b','{}','[]') returning id")).rows[0].id;
  const t = (await db.query("insert into tugas_verifikasi_ulang (batch_id, penerima_id, tahun, akun_id) values ($1, 1, 2027, $2) returning id", [b, ID.verif_p1])).rows[0].id;
  await assert.rejects(() => db.query("insert into tugas_verifikasi_ulang (batch_id, penerima_id, tahun, akun_id) values ($1, 1, 2027, $2)", [b, ID.verif_p2]), /unique|duplicate/i, "1 data = 1 tugas per paket");
  await db.query("update tugas_verifikasi_ulang set dibuka_pada = now() where id = $1", [t]);                       // belum selesai: boleh
  await assert.rejects(() => db.query("update tugas_verifikasi_ulang set akun_id = $2 where id = $1", [t, ID.verif_p2]), /tidak boleh diganti/, "pemeriksa tak boleh diganti");
  await db.query("update tugas_verifikasi_ulang set selesai_pada = now(), hasil = 'SESUAI' where id = $1", [t]);
  await assert.rejects(() => db.query("update tugas_verifikasi_ulang set hasil = 'DIKOREKSI' where id = $1", [t]), /tidak boleh diubah/);
  await assert.rejects(() => db.query("update tugas_verifikasi_ulang set selesai_pada = '2020-01-01' where id = $1", [t]), /tidak boleh diubah/, "waktu selesai tak bisa digeser");
  await assert.rejects(() => db.query("delete from tugas_verifikasi_ulang where id = $1", [t]), /tidak boleh dihapus/);
});

test("PRATINJAU di Postgres: tidak menulis; V10/V11; data sudah dibayar dikeluarkan; benih sama -> sama", opsi, async () => {
  const db = await siap({ ms: 60, btl: 4, verifOleh: { VERIF_P1: 12 } });
  await db.query("insert into pembayaran_baris (tahun, nik) select 2027, nik from penerima where id = 1");
  const sebelum = (await db.query("select count(*)::int n from tugas_verifikasi_ulang")).rows[0].n;
  const p = await UL.pratinjauBatchUlang(TOKEN.admin, { benih: "B1" });
  assert.equal(p.sukses, true, JSON.stringify(p));
  assert.equal(p.dikeluarkan.sudahDibayar, 1);
  assert.equal(p.jumlahTugas, 59 + 4, "59 MS (1 dibayar dikeluarkan) + 4 BTL");
  assert.equal(p.akunKhusus, "verif_uga_deba");
  const nama = p.perAkun.map((a) => a.username);
  assert.ok(!nama.includes("VERIF_RONALD_FREDY") && !nama.includes("VERIF_FERY_SUHERY"), "pimpinan tidak menerima tugas");
  assert.equal(p.perAkun.find((a) => a.username === "VERIF_UGA_DEBA").jumlah, 4, "BTL semua ke akun khusus");
  const msAkun = p.perAkun.filter((a) => a.username !== "VERIF_UGA_DEBA").map((a) => a.jumlah);
  assert.ok(Math.max(...msAkun) - Math.min(...msAkun) <= 1, "±1: " + msAkun);
  assert.equal((await db.query("select count(*)::int n from tugas_verifikasi_ulang")).rows[0].n, sebelum, "pratinjau tidak menulis");
  assert.equal((await db.query("select count(*)::int n from batch_verifikasi_ulang")).rows[0].n, 0);
  const p2 = await UL.pratinjauBatchUlang(TOKEN.admin, { benih: "B1" });
  assert.deepEqual(p2.perAkun, p.perAkun);
  const p3 = await UL.pratinjauBatchUlang(TOKEN.admin, { benih: "B1", status: ["Berkas Tidak Lengkap"], layanan: ["imam masjid"] });
  assert.equal(p3.jumlahTugas, 2, "saringan status + layanan (huruf kecil dinormalkan): BTL layanan IMAM MASJID");
});

test("BUAT PAKET di Postgres: V1 (pemverifikasi pertama tidak jadi pemeriksa), cek ulang pembagian sama, paket kedua tidak menumpuk data yang sama", opsi, async () => {
  const db = await siap({ ms: 60, btl: 4, verifOleh: { VERIF_P1: 20 } });
  const h = await buat();
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.equal(h.jumlahTugas, 64);
  const rows = (await db.query("select t.penerima_id, upper(a.username) as akun, t.status_saat_dibagi, t.layanan, t.pemverifikasi_awal from tugas_verifikasi_ulang t join akun a on a.id = t.akun_id")).rows;
  assert.equal(rows.length, 64);
  for (const r of rows) {
    assert.ok(!r.pemverifikasi_awal.includes(r.akun), "V1 dilanggar: " + r.penerima_id + " -> " + r.akun);
    if (r.status_saat_dibagi === "Berkas Tidak Lengkap") assert.equal(r.akun, "VERIF_UGA_DEBA");
    else assert.notEqual(r.akun, "VERIF_UGA_DEBA");
    assert.ok(!["VERIF_RONALD_FREDY", "VERIF_FERY_SUHERY"].includes(r.akun));
  }
  const dariP1 = rows.filter((r) => r.pemverifikasi_awal.includes("VERIF_P1"));
  assert.equal(dariP1.length, 20, "snapshot pemverifikasi awal tercatat");
  assert.equal(rows.filter((r) => r.akun === "VERIF_P1").some((r) => dariP1.includes(r)), false);

  const cek = await UL.cekPembagianBatchUlang(TOKEN.admin, h.batchId);
  assert.equal(cek.sukses, true, JSON.stringify(cek));
  assert.equal(cek.sama, true, "hitung ulang dari benih + snapshot = tersimpan");
  // data diubah diam-diam -> terdeteksi
  const satu = rows.find((r) => r.akun !== "VERIF_UGA_DEBA");
  const lain = rows.find((r) => r.akun !== satu.akun && r.akun !== "VERIF_UGA_DEBA" && !r.pemverifikasi_awal.includes(satu.akun));
  await assert.rejects(() => db.query("update tugas_verifikasi_ulang set akun_id = (select id from akun where upper(username) = $2) where penerima_id = $1", [satu.penerima_id, lain.akun]), /tidak boleh diganti/, "pagar: pemeriksa tak bisa diganti lewat SQL biasa");
  await db.exec("alter table tugas_verifikasi_ulang disable trigger tugas_verifikasi_ulang_jaga");   // meniru perusakan oleh pihak yang punya hak penuh
  await db.query("update tugas_verifikasi_ulang set akun_id = (select id from akun where upper(username) = $2) where penerima_id = $1", [satu.penerima_id, lain.akun]);
  await db.exec("alter table tugas_verifikasi_ulang enable trigger tugas_verifikasi_ulang_jaga");
  const cek2 = await UL.cekPembagianBatchUlang(TOKEN.admin, h.batchId);
  assert.equal(cek2.sama, false, "penugasan yang diubah di basis data terdeteksi");

  const kedua = await buat({ benih: "BENIH-2", nama: "Paket 2" });
  assert.equal(kedua.sukses, false, "tidak ada data tersisa: semua sudah di paket aktif");
  assert.equal((await db.query("select count(*)::int n from batch_verifikasi_ulang")).rows[0].n, 1);
});

test("JUMLAH per paket: sampel MS dibatasi, BTL/TMS tetap seluruhnya; paket kedua mengambil data lain", opsi, async () => {
  const db = await siap({ ms: 60, btl: 4 });
  const a = await buat({ jumlah: 20 });
  assert.equal(a.jumlahTugas, 24, "20 MS + 4 BTL");
  const b = await buat({ jumlah: 20, benih: "B2", nama: "Paket 2" });
  assert.equal(b.sukses, true, JSON.stringify(b));
  assert.equal(b.jumlahTugas, 20, "BTL sudah di paket aktif; hanya MS yang tersisa");
  const dobel = (await db.query("select penerima_id, count(*)::int n from tugas_verifikasi_ulang group by penerima_id having count(*) > 1")).rows;
  assert.equal(dobel.length, 0, "tidak ada data pada dua paket aktif");
});

async function tugasSatu(db, akun, kondisi = "") {
  return (await db.query("select t.id, t.penerima_id from tugas_verifikasi_ulang t where t.akun_id = $1 " + kondisi + " order by t.id limit 1", [ID[akun]])).rows[0];
}

test("ALUR VERIFIKATOR: daftar -> buka -> klik berkas -> SESUAI; riwayat ULANG; status tetap; tidak bisa disimpan dua kali", opsi, async () => {
  const db = await siap({ ms: 60, btl: 0 });
  await buat();
  const miliknya = (await db.query("select count(*)::int n from tugas_verifikasi_ulang where akun_id = $1", [ID.verif_p2])).rows[0].n;
  const d = await UL.getTugasUlangSaya(TOKEN.verif_p2);
  assert.equal(d.sukses, true, JSON.stringify(d));
  assert.equal(d.sisa, miliknya); assert.ok(d.tugas.length > 0 && d.tugas.every((x) => x.tugasId));
  const orang = await UL.getTugasUlangSaya(TOKEN.verif_p3);
  assert.ok(!orang.tugas.some((x) => d.tugas.some((y) => y.tugasId === x.tugasId)), "daftar hanya milik sendiri");

  const tg = d.tugas[0];
  assert.equal((await UL.simpanHasilUlang(TOKEN.verif_p2, tg.tugasId, { hasil: "SESUAI", centang: { link_ktp: true, link_buku_rekening: true } })).sukses, false, "belum dibuka");
  const bk = await UL.bukaTugasUlang(TOKEN.verif_p2, tg.tugasId);
  assert.equal(bk.sukses, true, JSON.stringify(bk));
  assert.deepEqual(bk.berkas.map((b) => b.kunci), ["link_ktp", "link_buku_rekening"]);
  assert.ok(bk.berkas.every((b) => b.dibuka === false));
  assert.equal((await UL.simpanHasilUlang(TOKEN.verif_p2, tg.tugasId, { hasil: "SESUAI", centang: { link_ktp: true, link_buku_rekening: true } })).sukses, false, "berkas belum diklik");
  assert.equal((await UL.catatBerkasDibuka(TOKEN.verif_p2, tg.tugasId, "link_ktp")).sukses, true);
  assert.equal((await UL.catatBerkasDibuka(TOKEN.verif_p2, tg.tugasId, "link_ktp")).sukses, true, "klik ulang tidak menggandakan");
  assert.equal((await UL.catatBerkasDibuka(TOKEN.verif_p2, tg.tugasId, "link_buku_rekening")).sukses, true);
  assert.deepEqual((await db.query("select berkas_dibuka from tugas_verifikasi_ulang where id = $1", [tg.tugasId])).rows[0].berkas_dibuka.sort(), ["link_buku_rekening", "link_ktp"]);
  assert.equal((await UL.bukaTugasUlang(TOKEN.verif_p2, tg.tugasId)).berkas.every((b) => b.dibuka), true, "status klik terbaca saat dibuka ulang");
  assert.equal((await UL.simpanHasilUlang(TOKEN.verif_p2, tg.tugasId, { hasil: "SESUAI", centang: { link_ktp: true } })).sukses, false, "belum dicentang semua");

  const s = await UL.simpanHasilUlang(TOKEN.verif_p2, tg.tugasId, { hasil: "SESUAI", centang: { link_ktp: true, link_buku_rekening: true } });
  assert.equal(s.sukses, true, JSON.stringify(s));
  const t = (await db.query("select hasil, selesai_pada, status_sebelum, status_sesudah, daftar_periksa from tugas_verifikasi_ulang where id = $1", [tg.tugasId])).rows[0];
  assert.equal(t.hasil, "SESUAI"); assert.ok(t.selesai_pada); assert.equal(t.status_sesudah, "Memenuhi Syarat");
  const r = (await db.query("select oleh, sumber, status_lama, status_baru, keterangan, waktu from riwayat_verifikasi where penerima_id = $1 and sumber = 'ULANG'", [tg.penerimaId])).rows;
  assert.equal(r.length, 1); assert.equal(r[0].oleh, "VERIF_P2"); assert.equal(r[0].keterangan, "SESUAI");
  assert.equal(new Date(r[0].waktu).getTime(), new Date(t.selesai_pada).getTime(), "waktu riwayat = waktu selesai (waktu server, satu transaksi)");
  assert.equal((await db.query("select status_verifikasi from penerima where id = $1", [tg.penerimaId])).rows[0].status_verifikasi, "Memenuhi Syarat");

  const lagi = await UL.simpanHasilUlang(TOKEN.verif_p2, tg.tugasId, { hasil: "SESUAI", centang: { link_ktp: true, link_buku_rekening: true } });
  assert.equal(lagi.sukses, false); assert.match(lagi.pesan, /sudah selesai/);
  assert.equal((await db.query("select count(*)::int n from riwayat_verifikasi where penerima_id = $1 and sumber = 'ULANG'", [tg.penerimaId])).rows[0].n, 1, "1 data = 1 hitungan");
  assert.equal((await UL.getTugasUlangSaya(TOKEN.verif_p2)).selesai, 1);
});

test("DATA UNTUK DICOCOKKAN di Postgres: bukaTugasUlang mengirim data input lengkap (tanggal lahir dd-mm-yyyy, no kontak tanpa kutip depan) dan HANYA untuk tugas milik sendiri", opsi, async () => {
  const db = await siap({ ms: 60, btl: 0 });
  await buat();
  const tg = await tugasSatu(db, "verif_p2");
  await db.query("update penerima set jenis_kelamin='PEREMPUAN', tempat_lahir='MEDAN', tanggal_lahir='1989-02-04', alamat='JL MARELAN NO 5', umur=37, nama_rekening='SITI AMINAH', nomor_rekening='1234567890', kantor_cabang='SUMUT', alamat_tugas='JL MESJID 1', no_kontak=$2, tempat_tugas='MASJID AL IKHLAS', link_koordinat_lokasi='https://maps.app.goo.gl/abc' where id = $1", [tg.penerima_id, "'0812345678"]);
  const b = await UL.bukaTugasUlang(TOKEN.verif_p2, tg.id);
  assert.equal(b.sukses, true, JSON.stringify(b));
  assert.deepEqual(
    [b.data.jenisKelamin, b.data.tempatLahir, b.data.tanggalLahir, b.data.umur, b.data.alamat, b.data.namaRekening, b.data.nomorRekening, b.data.kantorCabang, b.data.alamatTugas, b.data.noKontak, b.data.tempatTugas, b.data.koordinat],
    ["PEREMPUAN", "MEDAN", "04-02-1989", "37", "JL MARELAN NO 5", "SITI AMINAH", "1234567890", "SUMUT", "JL MESJID 1", "0812345678", "MASJID AL IKHLAS", "https://maps.app.goo.gl/abc"]);
  const kosong = await tugasSatu(db, "verif_p3");
  const b3 = await UL.bukaTugasUlang(TOKEN.verif_p3, kosong.id);
  assert.equal(b3.data.tanggalLahir, "", "data tanpa tanggal lahir -> kosong, bukan galat"); assert.equal(b3.data.umur, "");
  const orang = await UL.bukaTugasUlang(TOKEN.verif_p4, tg.id);
  assert.equal(orang.sukses, false, "tugas orang lain tidak membuka datanya"); assert.ok(!JSON.stringify(orang).includes("1234567890"));
});

test("BERKAS DIGANTI di Postgres: kelurahan mengganti berkas sesudah petugas mengklik -> klik lama tidak sah; klik ulang berkas baru sah lagi", opsi, async () => {
  const db = await siap({ ms: 60, btl: 0 });
  await buat();
  const tg = await tugasSatu(db, "verif_p2");
  await UL.bukaTugasUlang(TOKEN.verif_p2, tg.id);
  await UL.catatBerkasDibuka(TOKEN.verif_p2, tg.id, "link_ktp"); await UL.catatBerkasDibuka(TOKEN.verif_p2, tg.id, "link_buku_rekening");
  const url = (await db.query("select berkas_url from tugas_verifikasi_ulang where id = $1", [tg.id])).rows[0].berkas_url;
  assert.deepEqual(url, { link_ktp: "https://x/ktp", link_buku_rekening: "https://x/bk" }, "tautan saat diklik tercatat");
  const sesuai = { hasil: "SESUAI", centang: { link_ktp: true, link_buku_rekening: true } };
  await db.query("update penerima set link_ktp = 'https://x/ktp-baru' where id = $1", [tg.penerima_id]);   // kelurahan mengunggah KTP baru
  let r = await UL.simpanHasilUlang(TOKEN.verif_p2, tg.id, sesuai);
  assert.equal(r.sukses, false); assert.match(r.pesan, /Belum dibuka: KTP/);
  const b = await UL.bukaTugasUlang(TOKEN.verif_p2, tg.id);
  assert.equal(b.berkas.find((x) => x.kunci === "link_ktp").dibuka, false); assert.equal(b.berkas.find((x) => x.kunci === "link_buku_rekening").dibuka, true);
  await UL.catatBerkasDibuka(TOKEN.verif_p2, tg.id, "link_ktp");
  assert.equal((await db.query("select berkas_url->>'link_ktp' as u, jsonb_array_length(berkas_dibuka) as n from tugas_verifikasi_ulang where id = $1", [tg.id])).rows[0].u, "https://x/ktp-baru");
  assert.equal((await db.query("select jsonb_array_length(berkas_dibuka)::int as n from tugas_verifikasi_ulang where id = $1", [tg.id])).rows[0].n, 2, "tidak menumpuk duplikat kunci");
  r = await UL.simpanHasilUlang(TOKEN.verif_p2, tg.id, sesuai);
  assert.equal(r.sukses, true, JSON.stringify(r));
});

test("DIKOREKSI di Postgres: MS -> BTL mengubah status data dengan batas seragam + riwayat ULANG; Admin membatalkan -> status kembali + riwayat BATAL_ULANG", opsi, async () => {
  const db = await siap({ ms: 60, btl: 0 });
  await buat();
  const tg = await tugasSatu(db, "verif_p3");
  await UL.bukaTugasUlang(TOKEN.verif_p3, tg.id);
  await UL.catatBerkasDibuka(TOKEN.verif_p3, tg.id, "link_ktp"); await UL.catatBerkasDibuka(TOKEN.verif_p3, tg.id, "link_buku_rekening");
  const naik = await UL.simpanHasilUlang(TOKEN.verif_p3, tg.id, { hasil: "DIKOREKSI", statusSesudah: "Memenuhi Syarat", alasan: "x" });
  assert.equal(naik.sukses, false);
  const k = await UL.simpanHasilUlang(TOKEN.verif_p3, tg.id, { hasil: "DIKOREKSI", statusSesudah: "Berkas Tidak Lengkap", alasan: "KTP tidak terbaca", centang: { link_ktp: false, link_buku_rekening: true } });
  assert.equal(k.sukses, true, JSON.stringify(k));
  const p = (await db.query("select status_verifikasi, keterangan_verifikasi, diverifikasi_oleh, batas_waktu_perbaikan::text as batas from penerima where id = $1", [tg.penerima_id])).rows[0];
  assert.equal(p.status_verifikasi, "Berkas Tidak Lengkap"); assert.equal(p.keterangan_verifikasi, "KTP tidak terbaca"); assert.equal(p.diverifikasi_oleh, "VERIF_P3"); assert.equal(p.batas, "2026-11-30");
  const r = (await db.query("select status_lama, status_baru, keterangan from riwayat_verifikasi where penerima_id = $1 and sumber = 'ULANG'", [tg.penerima_id])).rows[0];
  assert.deepEqual([r.status_lama, r.status_baru, r.keterangan], ["Memenuhi Syarat", "Berkas Tidak Lengkap", "DIKOREKSI: KTP tidak terbaca"]);

  const dk = await UL.getDaftarKoreksiUlang(TOKEN.admin);
  assert.equal(dk.sukses, true); assert.equal(dk.koreksi.length, 1);
  assert.deepEqual([dk.koreksi[0].pemeriksa, dk.koreksi[0].statusSebelum, dk.koreksi[0].statusSesudah, dk.koreksi[0].dibatalkan], ["verif_p3", "Memenuhi Syarat", "Berkas Tidak Lengkap", false]);

  const b = await UL.batalkanKoreksiUlang(TOKEN.admin, tg.id, "kelurahan melapor berkas sudah lengkap");
  assert.equal(b.sukses, true, JSON.stringify(b));
  const p2 = (await db.query("select status_verifikasi, keterangan_verifikasi, batas_waktu_perbaikan from penerima where id = $1", [tg.penerima_id])).rows[0];
  assert.equal(p2.status_verifikasi, "Memenuhi Syarat"); assert.equal(p2.keterangan_verifikasi, ""); assert.equal(p2.batas_waktu_perbaikan, null);
  assert.equal((await db.query("select count(*)::int n from riwayat_verifikasi where penerima_id = $1 and sumber = 'BATAL_ULANG'", [tg.penerima_id])).rows[0].n, 1);
  assert.equal((await UL.batalkanKoreksiUlang(TOKEN.admin, tg.id, "lagi")).sukses, false, "tidak bisa dibatalkan dua kali");
  assert.equal((await UL.getDaftarKoreksiUlang(TOKEN.admin)).koreksi[0].dibatalkan, true);
  // tugas selesai tetap utuh (pagar), hasil DIKOREKSI tidak berubah
  assert.equal((await db.query("select hasil from tugas_verifikasi_ulang where id = $1", [tg.id])).rows[0].hasil, "DIKOREKSI");
});

test("K11 di Postgres: Admin mengubah status data sesudah dibagikan -> tugas ditarik otomatis (tidak muncul, tidak bisa disimpan), tercatat", opsi, async () => {
  const db = await siap({ ms: 60, btl: 0 });
  await buat();
  const tg = await tugasSatu(db, "verif_p4");
  await db.query("update penerima set status_verifikasi = 'Tidak Memenuhi Syarat' where id = $1", [tg.penerima_id]);
  const d = await UL.getTugasUlangSaya(TOKEN.verif_p4);
  assert.equal(d.ditarikBaruSaja, 1);
  assert.ok(!d.tugas.some((x) => x.tugasId === Number(tg.id)), "tidak lagi muncul");
  const baris = (await db.query("select ditarik_pada, ditarik_alasan from tugas_verifikasi_ulang where id = $1", [tg.id])).rows[0];
  assert.ok(baris.ditarik_pada && baris.ditarik_alasan);
  const s = await UL.simpanHasilUlang(TOKEN.verif_p4, tg.id, { hasil: "SESUAI", centang: { link_ktp: true, link_buku_rekening: true } });
  assert.equal(s.sukses, false);
  assert.equal((await db.query("select count(*)::int n from riwayat_verifikasi where penerima_id = $1 and sumber = 'ULANG'", [tg.penerima_id])).rows[0].n, 0);
  // data dihapus -> juga ditarik
  const tg2 = await tugasSatu(db, "verif_p5");
  await db.query("delete from penerima where id = $1", [tg2.penerima_id]);
  assert.equal((await UL.getTugasUlangSaya(TOKEN.verif_p5)).ditarikBaruSaja, 1);
});

test("K15 di Postgres: data yang masuk batch pembayaran SESUDAH dibagikan tidak bisa dikoreksi", opsi, async () => {
  const db = await siap({ ms: 60, btl: 0 });
  await buat();
  const tg = await tugasSatu(db, "verif_p6");
  await db.query("insert into pembayaran_baris (tahun, nik) select tahun, nik from penerima where id = $1", [tg.penerima_id]);
  await UL.bukaTugasUlang(TOKEN.verif_p6, tg.id);
  await UL.catatBerkasDibuka(TOKEN.verif_p6, tg.id, "link_ktp"); await UL.catatBerkasDibuka(TOKEN.verif_p6, tg.id, "link_buku_rekening");
  const k = await UL.simpanHasilUlang(TOKEN.verif_p6, tg.id, { hasil: "DIKOREKSI", statusSesudah: "Berkas Tidak Lengkap", alasan: "x" });
  assert.equal(k.sukses, false); assert.match(k.pesan, /batch pembayaran/);
  assert.equal((await db.query("select status_verifikasi from penerima where id = $1", [tg.penerima_id])).rows[0].status_verifikasi, "Memenuhi Syarat");
  assert.equal((await db.query("select selesai_pada from tugas_verifikasi_ulang where id = $1", [tg.id])).rows[0].selesai_pada, null, "tugas tetap terbuka");
});

test("BATAL PAKET di Postgres: tugas belum selesai dihapus, yang SUDAH selesai tetap; verifikator tidak bisa lagi membuka tugas paket batal", opsi, async () => {
  const db = await siap({ ms: 60, btl: 0 });
  const h = await buat();
  const tg = await tugasSatu(db, "verif_p2");
  await UL.bukaTugasUlang(TOKEN.verif_p2, tg.id);
  await UL.catatBerkasDibuka(TOKEN.verif_p2, tg.id, "link_ktp"); await UL.catatBerkasDibuka(TOKEN.verif_p2, tg.id, "link_buku_rekening");
  assert.equal((await UL.simpanHasilUlang(TOKEN.verif_p2, tg.id, { hasil: "SESUAI", centang: { link_ktp: true, link_buku_rekening: true } })).sukses, true);
  const b = await UL.batalkanBatchUlang(TOKEN.admin, h.batchId);
  assert.equal(b.sukses, true, JSON.stringify(b));
  assert.equal((await db.query("select count(*)::int n from tugas_verifikasi_ulang")).rows[0].n, 1, "hanya yang selesai tersisa");
  assert.equal((await db.query("select status from batch_verifikasi_ulang")).rows[0].status, "DIBATALKAN");
  assert.equal((await UL.batalkanBatchUlang(TOKEN.admin, h.batchId)).sukses, false, "batal dua kali ditolak");
  assert.equal((await UL.getTugasUlangSaya(TOKEN.verif_p3)).sisa, 0);
  const lagi = await buat({ benih: "BARU", nama: "Setelah batal" });
  assert.equal(lagi.sukses, true, "data yang tugasnya dibatalkan bisa dibagi lagi");
  assert.equal(lagi.jumlahTugas, 59, "data yang sudah selesai diperiksa tidak ikut (default), sisanya masuk");
  const termasuk = await buat({ benih: "X", nama: "Sertakan", sertakanSudahDiperiksa: true });
  assert.equal(termasuk.sukses, true, JSON.stringify(termasuk));
  assert.equal(termasuk.jumlahTugas, 1, "hanya data yang sudah selesai diperiksa (sisanya sedang di paket aktif) ikut karena Admin memilihnya");
  const ulangi = (await db.query("select upper(a.username) as akun from tugas_verifikasi_ulang t join akun a on a.id = t.akun_id where t.batch_id = $1", [termasuk.batchId])).rows[0].akun;
  assert.notEqual(ulangi, "VERIF_P2", "V1: pemeriksa sebelumnya tidak mendapat data yang sama lagi walau paket lamanya dibatalkan");
});

test("CEK PEMBAGIAN tetap benar bila ada data yang TIDAK TERBAGI (pengacakan memakai seluruh kolam, jadi data itu disimpan)", opsi, async () => {
  const db = await siap({ ms: 40, btl: 0, verifOleh: { VERIF_P1: 25 } });
  const h = await UL.buatBatchUlang(TOKEN.admin, { benih: "TT", nama: "Hanya P1", pemeriksa: ["verif_p1"] });   // P1 satu-satunya pemeriksa: 25 data buatannya sendiri tidak bisa dibagikan (V1)
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.equal(h.jumlahTugas, 15);
  assert.equal(h.tidakTerbagi, 25); assert.match(h.pesan, /25 data tidak dapat dibagikan/);
  const cek = await UL.cekPembagianBatchUlang(TOKEN.admin, h.batchId);
  assert.equal(cek.sukses, true, JSON.stringify(cek));
  assert.equal(cek.sama, true, "hitung ulang harus sama walau ada data tidak terbagi");
  const k = (await db.query("select kriteria from batch_verifikasi_ulang")).rows[0].kriteria;
  assert.equal(k.tidakTerbagiButir.length, 25);
  const tanpa = await UL.pratinjauBatchUlang(TOKEN.admin, { benih: "TT", pemeriksa: ["verif_p1"] });
  assert.equal(tanpa.tidakTerbagi.jumlah, 25);
});

test("CEK PEMBAGIAN dengan DUA pemeriksa dan data yang tak terbagi di tengah kolam (peka terhadap urutan pengacakan)", opsi, async () => {
  const db = await siap({ ms: 60, btl: 0, verifOleh: { VERIF_P1: 30 } });
  // 12 data lagi juga pernah diverifikasi VERIF_P2 -> pemeriksa [P1, P2] tidak ada yang boleh memeriksanya (tak terbagi)
  const ids = (await db.query("select id from penerima where diverifikasi_oleh = 'VERIF_P1' order by id limit 12")).rows.map((r) => r.id);
  for (const i of ids) await db.query("insert into riwayat_verifikasi (penerima_id, tahun, status_lama, status_baru, oleh, sumber) values ($1, 2027, 'Proses Verifikasi', 'Memenuhi Syarat', 'VERIF_P2', 'SATU')", [i]);
  const h = await UL.buatBatchUlang(TOKEN.admin, { benih: "DUA-P", nama: "Dua pemeriksa", pemeriksa: ["verif_p1", "verif_p2"] });
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.equal(h.tidakTerbagi, 12);
  assert.equal(h.jumlahTugas, 48);
  const cek = await UL.cekPembagianBatchUlang(TOKEN.admin, h.batchId);
  assert.equal(cek.sama, true, "hitung ulang sama walau 12 data tak terbagi ikut mengacak: " + JSON.stringify(cek));
});

test("ADMIN melihat angka jujur: tugas yang datanya sudah berubah ikut ditarik saat daftar paket dibuka (tanpa menunggu petugasnya)", opsi, async () => {
  const db = await siap({ ms: 60, btl: 0 });
  await buat();
  const tg = await tugasSatu(db, "verif_p4");
  await db.query("update penerima set status_verifikasi = 'Berkas Tidak Lengkap' where id = $1", [tg.penerima_id]);
  const l = await UL.daftarBatchUlang(TOKEN.admin);
  assert.equal(l.batch[0].ditarik, 1); assert.equal(l.batch[0].sisa, 59);
  assert.equal(l.batch[0].perAkun.find((a) => a.username === "verif_p4").ditarik, 1);
});

test("JSON di Postgres: kriteria/pemeriksa/pengecualian/daftar_periksa tersimpan sebagai OBJEK/LARIK; paket yang terlanjur terenkode ganda (seperti di produksi) tetap bisa dicek ulang", opsi, async () => {
  const db = await siap({ ms: 60, btl: 4, verifOleh: { VERIF_P1: 20 } });
  const h = await buat();
  const jenis = async () => (await db.query("select jsonb_typeof(kriteria) k, jsonb_typeof(pemeriksa) p, jsonb_typeof(pengecualian) e from batch_verifikasi_ulang")).rows[0];
  assert.deepEqual(await jenis(), { k: "object", p: "array", e: "array" }, "bukan string");
  const tg = await tugasSatu(db, "verif_p2");
  await UL.bukaTugasUlang(TOKEN.verif_p2, tg.id);
  await UL.catatBerkasDibuka(TOKEN.verif_p2, tg.id, "link_ktp"); await UL.catatBerkasDibuka(TOKEN.verif_p2, tg.id, "link_buku_rekening");
  assert.equal((await UL.simpanHasilUlang(TOKEN.verif_p2, tg.id, { hasil: "SESUAI", centang: { link_ktp: true, link_buku_rekening: true } })).sukses, true);
  const dp = (await db.query("select jsonb_typeof(daftar_periksa) j, daftar_periksa from tugas_verifikasi_ulang where id = $1", [tg.id])).rows[0];
  assert.equal(dp.j, "object"); assert.deepEqual(dp.daftar_periksa, { link_ktp: true, link_buku_rekening: true });
  assert.equal((await UL.cekPembagianBatchUlang(TOKEN.admin, h.batchId)).sama, true);
  // meniru keadaan produksi (paket pertama): jsonb berisi TEKS JSON
  await db.query("update batch_verifikasi_ulang set kriteria = to_jsonb(kriteria::text), pemeriksa = to_jsonb(pemeriksa::text), pengecualian = to_jsonb(pengecualian::text)");
  assert.deepEqual(await jenis(), { k: "string", p: "string", e: "string" });
  const cek = await UL.cekPembagianBatchUlang(TOKEN.admin, h.batchId);
  assert.equal(cek.sukses, true, JSON.stringify(cek)); assert.equal(cek.sama, true, "paket terenkode ganda tetap sama saat dicek ulang");
  const l = await UL.daftarBatchUlang(TOKEN.admin);
  assert.equal(l.sukses, true); assert.equal(l.batch[0].jumlahTugas, 64);
  await db.query("update batch_verifikasi_ulang set pemeriksa = '[]'::jsonb");   // daftar pemeriksa rusak/kosong: ditolak dengan pesan jelas, bukan "berbeda" yang menyesatkan
  const rusak = await UL.cekPembagianBatchUlang(TOKEN.admin, h.batchId);
  assert.equal(rusak.sukses, false); assert.match(rusak.pesan, /Daftar pemeriksa paket tidak terbaca/);
});

test("JSON di Postgres: data tak terbagi pada paket terenkode ganda tetap ikut hitung ulang (kriteria terbaca dari teks)", opsi, async () => {
  const db = await siap({ ms: 60, btl: 0, verifOleh: { VERIF_P1: 30 } });
  const ids = (await db.query("select id from penerima where diverifikasi_oleh = 'VERIF_P1' order by id limit 12")).rows.map((r) => r.id);
  for (const i of ids) await db.query("insert into riwayat_verifikasi (penerima_id, tahun, status_lama, status_baru, oleh, sumber) values ($1, 2027, 'Proses Verifikasi', 'Memenuhi Syarat', 'VERIF_P2', 'SATU')", [i]);
  const h = await UL.buatBatchUlang(TOKEN.admin, { benih: "ENKODE", nama: "Dua", pemeriksa: ["verif_p1", "verif_p2"] });
  assert.equal(h.tidakTerbagi, 12);
  await db.query("update batch_verifikasi_ulang set kriteria = to_jsonb(kriteria::text), pemeriksa = to_jsonb(pemeriksa::text), pengecualian = to_jsonb(pengecualian::text)");
  const cek = await UL.cekPembagianBatchUlang(TOKEN.admin, h.batchId);
  assert.equal(cek.sama, true, JSON.stringify(cek));
});

test("EXCEL PEMBAGIAN di Postgres: data nyata (SQL asli) -> jumlah per petugas dan per data cocok dengan tabel; jsonb terenkode ganda terbaca; NIK utuh; peran lain ditolak", opsi, async () => {
  const db = await siap({ ms: 60, btl: 4 });
  await db.exec(baca("supabase/migrations/20261112150000_agregat_verifikasi.sql"));   // tabel tim (dibaca untuk nama tim petugas)
  const h = await buat();
  const p2 = (await db.query("select id, penerima_id from tugas_verifikasi_ulang where akun_id = $1 order by id", [ID.verif_p2])).rows;
  for (const [i, tg] of p2.slice(0, 2).entries()) {   // dua tugas selesai: satu Sesuai, satu Dikoreksi
    await UL.bukaTugasUlang(TOKEN.verif_p2, tg.id);
    await UL.catatBerkasDibuka(TOKEN.verif_p2, tg.id, "link_ktp"); await UL.catatBerkasDibuka(TOKEN.verif_p2, tg.id, "link_buku_rekening");
    const r = await UL.simpanHasilUlang(TOKEN.verif_p2, tg.id, i === 0 ? { hasil: "SESUAI", centang: { link_ktp: true, link_buku_rekening: true } } : { hasil: "DIKOREKSI", statusSesudah: "Berkas Tidak Lengkap", alasan: "uji" });
    assert.equal(r.sukses, true, JSON.stringify(r));
  }
  const tarik = p2[2];
  await db.query("update penerima set status_verifikasi = 'Tidak Memenuhi Syarat' where id = $1", [tarik.penerima_id]);
  assert.equal((await UL.getTugasUlangSaya(TOKEN.verif_p2)).ditarikBaruSaja, 1);
  await db.query("update batch_verifikasi_ulang set kriteria = to_jsonb(kriteria::text), pemeriksa = to_jsonb(pemeriksa::text), pengecualian = to_jsonb(pengecualian::text)");

  // paket LAIN dengan tugas sendiri: tidak boleh ikut dalam unduhan paket ini
  const b2 = (await db.query("insert into batch_verifikasi_ulang (nama, dibuat_oleh, benih, kriteria, pemeriksa) values ('lain','ADMIN','y','{}','[]') returning id")).rows[0].id;
  await db.query("insert into tugas_verifikasi_ulang (batch_id, penerima_id, tahun, akun_id) select $1, id, tahun, $2 from penerima where tahun = 2027 limit 5", [b2, ID.verif_p3]);
  const d = await PE.ambilDataPembagian(h.batchId);
  assert.equal(d.tugas.length, 64, "hanya tugas milik paket ini (paket lain berisi 5 tugas tambahan)");
  assert.equal(d.tugas.length + 5, (await db.query("select count(*)::int n from tugas_verifikasi_ulang")).rows[0].n); assert.equal(d.paket.jumlahTugas, 64); assert.equal(d.paket.akunKhusus, "verif_uga_deba");
  assert.ok(d.paket.jumlahPemeriksa >= 6 && d.paket.pengecualian.includes("verif_ronald_fredy"), "pemeriksa dan pengecualian terbaca dari jsonb teks");
  const r = PE.ringkasPerPetugas(d);
  const x2 = r.find((o) => o.username === "verif_p2");
  assert.deepEqual([x2.selesai, x2.sesuai, x2.dikoreksi, x2.ditarik], [2, 1, 1, 1]);
  assert.equal(x2.ditugaskan, x2.selesai + x2.ditarik + x2.sisa);
  assert.equal(r.reduce((s, o) => s + o.ditugaskan, 0), 64);
  assert.equal(r.find((o) => o.username === "verif_uga_deba").ditugaskan, 4);
  const dasar = (await db.query("select count(*)::int n, count(*) filter (where selesai_pada is not null)::int s, count(*) filter (where ditarik_pada is not null)::int t from tugas_verifikasi_ulang")).rows[0];
  assert.deepEqual([d.tugas.filter((x) => x.statusTugas === "SELESAI").length, d.tugas.filter((x) => x.statusTugas === "DITARIK").length], [dasar.s, dasar.t]);
  for (const x of d.tugas) { assert.match(x.nik, /^12\d{14}$/, "NIK utuh 16 digit: " + x.nik); assert.ok(x.namaPenerima); }
  const tr = d.tugas.find((x) => x.tugasId === Number(tarik.id));
  assert.deepEqual([tr.statusDibagi, tr.statusSekarang, tr.statusTugas], ["Memenuhi Syarat", "Tidak Memenuhi Syarat", "DITARIK"]);

  for (const p of ["verif_p2", "verif_p3"]) { const ditolak = await PE.unduhRekapPembagianUlang(TOKEN[p], h.batchId); assert.equal(ditolak.sukses, false); assert.match(ditolak.pesan, /khusus Admin Utama/); }
  assert.equal((await PE.ambilDataPembagian(999999)), null);
});

test("DAFTAR PAKET: kemajuan benar (selesai/sesuai/dikoreksi/ditarik/sisa) dan per akun", opsi, async () => {
  const db = await siap({ ms: 60, btl: 0 });
  await buat();
  const tg = await tugasSatu(db, "verif_p2");
  await UL.bukaTugasUlang(TOKEN.verif_p2, tg.id);
  await UL.catatBerkasDibuka(TOKEN.verif_p2, tg.id, "link_ktp"); await UL.catatBerkasDibuka(TOKEN.verif_p2, tg.id, "link_buku_rekening");
  await UL.simpanHasilUlang(TOKEN.verif_p2, tg.id, { hasil: "SESUAI", centang: { link_ktp: true, link_buku_rekening: true } });
  const l = await UL.daftarBatchUlang(TOKEN.admin);
  assert.equal(l.sukses, true, JSON.stringify(l));
  const p = l.batch[0];
  assert.deepEqual([p.jumlahTugas, p.selesai, p.sesuai, p.dikoreksi, p.ditarik, p.sisa], [60, 1, 1, 0, 0, 59]);
  assert.equal(p.perAkun.find((a) => a.username === "verif_p2").selesai, 1);
  assert.equal(p.perAkun.reduce((s, a) => s + a.tugas, 0), 60);
});

// ------------------------------------------------------------------ T6: agregat dengan pemeriksaan ulang (SQL nyata)
const AG = PGlite ? await muatServerPg("supabase/functions/api/domains/agregatVerifikasi.ts") : null;
const sekarangWib = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const geserTgl = (t, n) => new Date(new Date(t + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);

async function kerjakan(db, akun, hasilKe) {
  const tugasAkun = (await db.query("select id from tugas_verifikasi_ulang where akun_id = $1 and selesai_pada is null order by id", [ID[akun]])).rows;
  let i = 0;
  for (const t of tugasAkun) {
    const hasil = hasilKe(i++);
    if (!hasil) break;
    await UL.bukaTugasUlang(TOKEN[akun], t.id);
    await UL.catatBerkasDibuka(TOKEN[akun], t.id, "link_ktp"); await UL.catatBerkasDibuka(TOKEN[akun], t.id, "link_buku_rekening");
    const r = await UL.simpanHasilUlang(TOKEN[akun], t.id, hasil === "SESUAI" ? { hasil: "SESUAI", centang: { link_ktp: true, link_buku_rekening: true } } : { hasil: "DIKOREKSI", statusSesudah: "Berkas Tidak Lengkap", alasan: "uji" });
    assert.equal(r.sukses, true, JSON.stringify(r));
  }
}

test("AGREGAT + ULANG (SQL nyata): total pekerjaan = verifikasi pertama + pemeriksaan ulang; cakupan Saya/Admin benar; sisa tugas dihitung", opsi, async () => {
  const db = await siap({ ms: 60, btl: 0 });
  await db.exec(baca("supabase/migrations/20261112150000_agregat_verifikasi.sql"));
  // verifikasi PERTAMA nyata atas nama verif_p2 (3 data) -> masuk riwayat SATU
  for (const id of [1, 2, 3]) await db.query("insert into riwayat_verifikasi (penerima_id, tahun, status_lama, status_baru, oleh, sumber) values ($1, 2027, 'Proses Verifikasi', 'Memenuhi Syarat', 'VERIF_P2', 'SATU')", [id]);
  await buat();
  const milikP2 = (await db.query("select count(*)::int n from tugas_verifikasi_ulang where akun_id = $1", [ID.verif_p2])).rows[0].n;
  await kerjakan(db, "verif_p2", (i) => (i < 3 ? (i === 0 ? "DIKOREKSI" : "SESUAI") : null));   // 3 selesai: 2 sesuai + 1 dikoreksi
  await kerjakan(db, "verif_p3", (i) => (i < 2 ? "SESUAI" : null));                                 // 2 selesai

  const dari = geserTgl(sekarangWib(), -2), sampai = sekarangWib();
  const adm = await AG.getAgregatVerifikasi(TOKEN.admin, dari, sampai);
  assert.equal(adm.sukses, true, JSON.stringify(adm));
  assert.equal(adm.ulangTersedia, true);
  assert.deepEqual([adm.ulang.ringkasan.total, adm.ulang.ringkasan.sesuai, adm.ulang.ringkasan.dikoreksi], [5, 4, 1]);
  assert.equal(adm.ulang.ringkasan.jamKerja + adm.ulang.ringkasan.luarJamKerja, 5);
  assert.equal(adm.ringkasan.total, 3, "verifikasi pertama tidak berubah oleh pemeriksaan ulang");
  assert.equal(adm.gabungan.ringkasan.total, 8, "TOTAL PEKERJAAN = 3 pertama + 5 ulang");
  assert.equal(adm.gabungan.ringkasan.total, adm.gabungan.ringkasan.jamKerja + adm.gabungan.ringkasan.luarJamKerja);
  const p2 = adm.gabungan.perOrang.find((o) => o.username === "verif_p2");
  assert.equal(p2.total, 3 + 3, "p2: 3 pertama + 3 ulang");
  assert.equal(adm.ulang.perOrang.find((o) => o.username === "verif_p2").sisa, milikP2 - 3, "sisa tugas aktif p2");
  assert.equal(adm.ulang.ringkasan.sisa, (await db.query("select count(*)::int n from tugas_verifikasi_ulang where selesai_pada is null and ditarik_pada is null")).rows[0].n);
  assert.equal(adm.gabungan.perTim.reduce((s, t) => s + t.total, 0), adm.gabungan.ringkasan.total, "jumlah per tim = total");
  assert.equal(adm.gabungan.perHari.reduce((s, h) => s + h.total, 0), adm.gabungan.ringkasan.total, "jumlah per hari = total");

  const saya = await AG.getAgregatVerifikasi(TOKEN.verif_p2, dari, sampai);
  assert.equal(saya.cakupan, "SAYA");
  assert.deepEqual(saya.ulang.perOrang.map((o) => o.username), ["verif_p2"], "verifikator hanya melihat dirinya");
  assert.equal(saya.ulang.ringkasan.total, 3); assert.equal(saya.gabungan.ringkasan.total, 6);
  assert.ok(!JSON.stringify(saya).includes("FULAN") && !JSON.stringify(saya).includes("NAMA "), "tidak ada data pribadi penerima");

  // rentang di luar waktu pengerjaan -> nol
  const lampau = await AG.getAgregatVerifikasi(TOKEN.admin, geserTgl(sekarangWib(), -20), geserTgl(sekarangWib(), -10));
  assert.deepEqual([lampau.ulang.ringkasan.total, lampau.gabungan.ringkasan.total], [0, 0]);
});

test("AGREGAT + ULANG (SQL nyata): sisa tugas hanya tugas AKTIF (bukan yang ditarik, selesai, atau milik paket yang sudah tidak aktif)", opsi, async () => {
  const db = await siap({ ms: 10, btl: 0 });
  await db.exec(baca("supabase/migrations/20261112150000_agregat_verifikasi.sql"));
  const bAktif = (await db.query("insert into batch_verifikasi_ulang (nama, dibuat_oleh, benih, kriteria, pemeriksa) values ('a','ADMIN','x','{}','[]') returning id")).rows[0].id;
  const bBatal = (await db.query("insert into batch_verifikasi_ulang (nama, dibuat_oleh, benih, kriteria, pemeriksa, status) values ('b','ADMIN','y','{}','[]','DIBATALKAN') returning id")).rows[0].id;
  const t = (b, pid, ekstra = "") => db.query("insert into tugas_verifikasi_ulang (batch_id, penerima_id, tahun, akun_id" + (ekstra ? ", " + ekstra.split("=")[0] : "") + ") values ($1, $2, 2027, $3" + (ekstra ? ", " + ekstra.split("=")[1] : "") + ")", [b, pid, ID.verif_p2]);
  await t(bAktif, 1);                                   // aktif -> dihitung
  await t(bAktif, 2, "ditarik_pada=now()");             // ditarik -> tidak
  await t(bAktif, 3, "selesai_pada=now()");             // selesai -> tidak (sudah jadi pekerjaan, bukan sisa)
  await t(bBatal, 4);                                   // paket tidak aktif -> tidak
  const adm = await AG.getAgregatVerifikasi(TOKEN.admin, geserTgl(sekarangWib(), -1), sekarangWib());
  assert.equal(adm.ulang.perOrang.find((o) => o.username === "verif_p2").sisa, 1);
});

test("AGREGAT + ULANG (SQL nyata): 1 data = 1 hitungan per pemeriksa walau ada dua tugas selesai untuk data yang sama (paket berbeda)", opsi, async () => {
  const db = await siap({ ms: 10, btl: 0 });
  await db.exec(baca("supabase/migrations/20261112150000_agregat_verifikasi.sql"));
  const b1 = (await db.query("insert into batch_verifikasi_ulang (nama, dibuat_oleh, benih, kriteria, pemeriksa) values ('a','ADMIN','x','{}','[]') returning id")).rows[0].id;
  const b2 = (await db.query("insert into batch_verifikasi_ulang (nama, dibuat_oleh, benih, kriteria, pemeriksa) values ('b','ADMIN','y','{}','[]') returning id")).rows[0].id;
  for (const b of [b1, b2]) await db.query("insert into tugas_verifikasi_ulang (batch_id, penerima_id, tahun, akun_id, selesai_pada, hasil) values ($1, 1, 2027, $2, now(), 'SESUAI')", [b, ID.verif_p2]);
  const adm = await AG.getAgregatVerifikasi(TOKEN.admin, geserTgl(sekarangWib(), -1), sekarangWib());
  assert.equal(adm.ulang.ringkasan.total, 1, "dihitung satu kali");
});

test("AGREGAT + ULANG: migrasi verifikasi ulang BELUM diterapkan -> agregat lama tetap jalan, angka ulang 0, ulangTersedia=false", opsi, async () => {
  const db = await siap({ ms: 10, btl: 0 });
  await db.exec(baca("supabase/migrations/20261112150000_agregat_verifikasi.sql"));
  await db.query("insert into riwayat_verifikasi (penerima_id, tahun, status_lama, status_baru, oleh, sumber) values (1, 2027, 'Proses Verifikasi', 'Memenuhi Syarat', 'VERIF_P2', 'SATU')");
  await db.exec("drop table pembatalan_koreksi_ulang; drop table tugas_verifikasi_ulang; drop table batch_verifikasi_ulang;");
  const adm = await AG.getAgregatVerifikasi(TOKEN.admin, geserTgl(sekarangWib(), -1), sekarangWib());
  assert.equal(adm.sukses, true, JSON.stringify(adm));
  assert.equal(adm.ulangTersedia, false);
  assert.equal(adm.ringkasan.total, 1, "verifikasi pertama tetap dihitung");
  assert.deepEqual([adm.ulang.ringkasan.total, adm.gabungan.ringkasan.total], [0, 1]);
});

test("DAFTAR TUGAS: 'semua' memuat SEMUA tugas aktif milik sendiri (lebih dari 50), daftar tetap 50 per halaman, dan tugas di luar 50 pertama tetap bisa dibuka; milik orang lain tidak bocor", opsi, async () => {
  const db = await siap({ ms: 420, btl: 0 });
  await buat();
  const miliknya = (await db.query("select count(*)::int n from tugas_verifikasi_ulang where akun_id = $1", [ID.verif_p2])).rows[0].n;
  assert.ok(miliknya > 50, "uji ini butuh lebih dari 50 tugas: " + miliknya);
  const d = await UL.getTugasUlangSaya(TOKEN.verif_p2);
  assert.equal(d.sukses, true, JSON.stringify(d));
  assert.equal(d.tugas.length, 50, "daftar halaman tetap 50"); assert.equal(d.adaBerikutnya, true);
  assert.equal(d.semua.length, miliknya, "semua tugas aktif tercantum");
  assert.equal(d.sisa, miliknya);
  const punyaP2 = new Set((await db.query("select id from tugas_verifikasi_ulang where akun_id = $1", [ID.verif_p2])).rows.map((r) => Number(r.id)));
  assert.ok(d.semua.every((x) => punyaP2.has(x.tugasId) && x.penerimaId > 0), "hanya milik sendiri");
  const di50 = new Set(d.tugas.map((x) => x.tugasId));
  const luar = d.semua.find((x) => !di50.has(x.tugasId));
  assert.ok(luar, "ada tugas di luar 50 pertama");
  const buka = await UL.bukaTugasUlang(TOKEN.verif_p2, luar.tugasId);
  assert.equal(buka.sukses, true, "tugas di luar 50 pertama bisa dibuka: " + JSON.stringify(buka).slice(0, 200));
  assert.equal(buka.penerimaId, luar.penerimaId);
  const orang = await UL.getTugasUlangSaya(TOKEN.verif_p3);
  assert.ok(!orang.semua.some((x) => punyaP2.has(x.tugasId)), "tugas orang lain tidak bocor");
});

test("LENCANA (getRingkasanVerifikasiSaya): hasil VERIFIKASI ULANG ikut dihitung terpisah dari Verifikasi Awal; akun tanpa Verifikasi Awal tidak lagi selalu 0; 1 data = 1 hitungan; milik orang lain tidak ikut", opsi, async () => {
  const db = await siap({ ms: 60, btl: 0 });
  await buat();
  const kosong = await VF.getRingkasanVerifikasiSaya(TOKEN.verif_p2);
  assert.equal(kosong.sukses, true, JSON.stringify(kosong));
  assert.deepEqual(kosong.ulang, { total: 0, hariIni: 0, sesuai: 0, dikoreksi: 0 }, "belum ada yang selesai");
  const d = await UL.getTugasUlangSaya(TOKEN.verif_p2);
  const selesaikan = async (tg, hasil) => {
    await UL.bukaTugasUlang(TOKEN.verif_p2, tg.tugasId);
    for (const k of ["link_ktp", "link_buku_rekening"]) await UL.catatBerkasDibuka(TOKEN.verif_p2, tg.tugasId, k);
    const masuk = hasil === "SESUAI"
      ? { hasil: "SESUAI", centang: { link_ktp: true, link_buku_rekening: true } }
      : { hasil: "DIKOREKSI", statusSesudah: "Tidak Memenuhi Syarat", alasan: "berkas tidak sesuai", centang: { link_ktp: true, link_buku_rekening: true } };
    const s = await UL.simpanHasilUlang(TOKEN.verif_p2, tg.tugasId, masuk);
    assert.equal(s.sukses, true, JSON.stringify(s));
  };
  await selesaikan(d.tugas[0], "SESUAI");
  await selesaikan(d.tugas[1], "SESUAI");
  await selesaikan(d.tugas[2], "DIKOREKSI");
  const bd = await VF.getRingkasanVerifikasiSaya(TOKEN.verif_p2);
  assert.deepEqual(bd.ulang, { total: 3, hariIni: 3, sesuai: 2, dikoreksi: 1 });
  assert.equal(bd.total, 0, "Verifikasi Awal tetap terpisah: akun ini belum punya");
  const lain = await VF.getRingkasanVerifikasiSaya(TOKEN.verif_p3);
  assert.equal(lain.ulang.total, 0, "hasil orang lain tidak ikut");
  // sama dengan angka yang dipakai agregat (sumber tugas selesai, 1 kali per data)
  assert.equal((await db.query("select count(distinct penerima_id)::int n from tugas_verifikasi_ulang where akun_id = $1 and selesai_pada is not null", [ID.verif_p2])).rows[0].n, bd.ulang.total);
});
