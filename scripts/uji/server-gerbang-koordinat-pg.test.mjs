// TAHAP B penanda koordinat GMM di Postgres SUNGGUHAN (PGlite): gerbang yang MENOLAK. Kode domain ASLI, migrasi ASLI. Rencana: plans/plan-penanda-koordinat-gmm.md
// Jalankan: npm run uji:gerbang-koordinat-pg  (butuh @electric-sql/pglite; bila tidak ada, uji DILEWATI)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { muatPglite, muatServerPg } from "./_harness-pg.mjs";

const PGlite = await muatPglite();
const lewati = PGlite ? false : "PGlite tidak tersedia";
if (!PGlite) console.log("DILEWATI: " + lewati);
const GK = PGlite ? await muatServerPg("supabase/functions/api/domains/gerbangKoordinat.ts") : null;
const UL = PGlite ? await muatServerPg("supabase/functions/api/domains/verifikasiUlang.ts", { stub: ["dataDetail.ts"] }) : null;
const VF = PGlite ? await muatServerPg("supabase/functions/api/domains/verifikasi.ts", { stub: ["dataDetail.ts"] }) : null;
const opsi = { skip: lewati };
const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const MIGRASI = baca("supabase/migrations/20261117100000_cek_koordinat.sql");
const MIGRASI_TABEL = MIGRASI.slice(0, MIGRASI.indexOf("do $$"));

const NAMA = ["admin", "verif_p1", "verif_p2", "verif_p3", "verif_p4", "verif_p5", "verif_p6", "verif_uga_deba", "gmm_x"];
const ID = Object.fromEntries(NAMA.map((n, i) => [n, "00000000-0000-4000-8000-" + String(i + 1).padStart(12, "0")]));
const TOKEN = Object.fromEntries(NAMA.map((n) => [n, "T-" + n]));
const ROLE = (n) => (n === "admin" ? "UTAMA" : n === "gmm_x" ? "GURU MAGHRIB MENGAJI" : "VERIFIKATOR");
const LINK = ["link_ktp", "link_buku_rekening", "link_surat_permohonan", "link_pernyataan_satu_bantuan", "link_domisili_kelurahan", "link_formulir_pendataan", "link_berkas_pendukung",
  "link_foto_plank_rumah_ibadah", "link_foto_lokasi_ibadah", "link_foto_kegiatan_belajar", "link_rekomendasi_bkm", "link_rekomendasi_rumah_ibadah", "link_domisili_rumah_ibadah"];
const GMM = "GURU MAGHRIB MENGAJI";
const BAD = "https://www.google.com/maps/@3.5,98.6,34a,75y/data=!1e1";   // Street View
const PENDEK = "https://maps.app.goo.gl/abc123";

async function siap() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated;");
  await db.exec(`
    create table akun (id uuid primary key, username text not null, nama_lengkap text not null default '', role text not null, aktif boolean not null default true);
    create table penerima (
      id serial, tahun int not null, nik text, nama text, layanan text, kecamatan text, kelurahan text, tempat_tugas text,
      status_verifikasi text, keterangan_verifikasi text default '', tanggal_verifikasi timestamptz, diverifikasi_oleh text,
      batas_waktu_perbaikan date, tanggal_lapor_perbaikan timestamptz, dilapor_oleh text, tanggal_berkas_diubah timestamptz, dibuat_oleh_akun_id uuid,
      jenis_kelamin text, tempat_lahir text, tanggal_lahir date, alamat text, umur int, nama_rekening text, nomor_rekening text, kantor_cabang text, alamat_tugas text, no_kontak text,
      ${LINK.map((l) => l + " text").join(", ")}, link_koordinat_lokasi text, primary key (id, tahun));
    create table pembayaran_baris (id serial primary key, tahun int not null, nik text not null);
  `);
  for (const n of NAMA) await db.query("insert into akun (id, username, role) values ($1, $2, $3)", [ID[n], n, ROLE(n)]);
  await db.exec(baca("supabase/migrations/20261112100000_riwayat_verifikasi.sql"));
  await db.exec(baca("supabase/migrations/20261114100000_verifikasi_ulang.sql"));
  await db.exec(MIGRASI_TABEL);
  globalThis.__ujiPg = db;
  globalThis.__ujiSesi = Object.fromEntries(NAMA.map((n) => [TOKEN[n], { akunId: ID[n], username: n, role: ROLE(n), kecamatan: "", userId: "" }]));
  const fetchPanggilan = [];
  globalThis.__ujiFetch = async (url) => { fetchPanggilan.push(url); throw new Error("jaringan putus (uji)"); };
  return { db, fetchPanggilan };
}
let nik = 1;
// layanan, status, oleh, tautan koordinat, hasil cek (VALID/TIDAK_VALID/null), alasan
async function tambah(db, { layanan = GMM, status, oleh = "ADMIN", tautan = BAD, hasil = "TIDAK_VALID", alasan = "STREET_VIEW", tautanCek = null }) {
  const id = (await db.query(
    "insert into penerima (tahun, nik, nama, layanan, kecamatan, status_verifikasi, diverifikasi_oleh, link_ktp, link_buku_rekening, link_koordinat_lokasi) values (2027, $1, $2, $3, 'MEDAN KOTA', $4, $5, 'https://x/ktp', 'https://x/bk', $6) returning id",
    ["12" + String(nik++).padStart(14, "0"), "NAMA " + nik, layanan, status, oleh, tautan])).rows[0].id;
  if (hasil) await db.query("insert into cek_koordinat (penerima_id, tahun, tautan, hasil, alasan) values ($1, 2027, $2, $3, $4)", [id, tautanCek || tautan, hasil, alasan]);
  return id;
}
const statusDi = async (db, id) => (await db.query("select status_verifikasi s, diverifikasi_oleh o from penerima where id = $1", [id])).rows[0];
const riwayat = async (db, id) => (await db.query("select oleh, sumber, status_baru from riwayat_verifikasi where penerima_id = $1 order by id", [id])).rows;

// ====================================================== gerbang langsung
test("SIMPAN PETUGAS: tautan yang jelas bukan titik ditolak dengan alasan + petunjuk; titik sah lolos; Google gagal = LOLOS (gagal-terbuka)", opsi, async () => {
  const { fetchPanggilan } = await siap();
  const tolak = await GK.tolakKoordinatSalah(BAD);
  assert.match(tolak, /^GAGAL: Koordinat tidak dapat diterima karena tautan Street View, bukan titik penanda\./);
  assert.match(tolak, /tekan lama pada titik lokasi.*Bagikan.*Salin tautan/);
  for (const [url, kode] of [["https://www.google.com/maps/search/masjid/@3.5,98.6,17z", "pencarian"], ["https://www.google.co.id/maps/dir/3.5,98.6/Masjid/@3.5,98.6,15z", "petunjuk arah"],
    ["https://www.google.com/maps/@3.5,98.6,17z", "tanpa titik penanda"], ["https://www.google.com/maps/place/Masjid/@-6.2,106.6,17z/data=!3d-6.2!4d106.6", "di luar Kota Medan"]]) {
    assert.match(await GK.tolakKoordinatSalah(url), new RegExp(kode, "i"), url);
  }
  assert.equal(await GK.tolakKoordinatSalah("https://www.google.com/maps?q=3.595200,98.672200"), null, "titik sah");
  assert.equal(await GK.tolakKoordinatSalah("https://www.google.com/maps/place/X/@3.6,98.67,17z/data=!3d3.6012!4d98.6712"), null, "titik penanda sah");
  assert.equal(fetchPanggilan.length, 0, "tautan panjang tidak memanggil jaringan");
  assert.equal(await GK.tolakKoordinatSalah(PENDEK), null, "tautan pendek yang tak bisa dibuka -> lolos");
  assert.equal(fetchPanggilan.length, 1);
  globalThis.__ujiFetch = async () => ({ status: 302, headers: { get: () => "https://www.google.com/maps/place//@3.55,98.69,13z/data=!3m1!4b1" } });
  assert.match(await GK.tolakKoordinatSalah(PENDEK), /tanpa titik penanda/, "tautan pendek dibuka lalu dinilai (kasus Windi)");
  globalThis.__ujiFetch = async () => ({ status: 302, headers: { get: () => "https://maps.google.com/?q=3.57,98.72" } });
  assert.equal(await GK.tolakKoordinatSalah(PENDEK), null);
  globalThis.__ujiFetch = async () => ({ status: 404, headers: { get: () => null } });
  assert.match(await GK.tolakKoordinatSalah(PENDEK), /tidak ditemukan/);
});

test("NILAI DATA: hasil penyapu dipakai tanpa jaringan; basi/belum ada dinilai saat itu juga dan disimpan; Google gagal -> BELUM_DICEK (tidak disimpan); bukan GMM/tak ada -> null", opsi, async () => {
  const { db, fetchPanggilan } = await siap();
  const a = await tambah(db, { status: "Memenuhi Syarat", hasil: "TIDAK_VALID", alasan: "STREET_VIEW" });
  const b = await tambah(db, { status: "Memenuhi Syarat", tautan: "https://www.google.com/maps?q=3.6,98.67", hasil: "VALID", alasan: "" });
  const c = await tambah(db, { status: "Memenuhi Syarat", tautan: "https://www.google.com/maps/@3.5,98.6,17z", hasil: null });                          // belum pernah dinilai: tautan panjang
  const d = await tambah(db, { status: "Memenuhi Syarat", tautan: "https://www.google.com/maps?q=3.6,98.67", hasil: "TIDAK_VALID", alasan: "STREET_VIEW", tautanCek: "https://lama" });   // basi
  const e = await tambah(db, { status: "Memenuhi Syarat", tautan: PENDEK, hasil: null });                                                            // pendek, Google gagal
  const f = await tambah(db, { layanan: "GURU SEKOLAH MINGGU", status: "Memenuhi Syarat", hasil: null });
  assert.deepEqual(await GK.nilaiKoordinatData(a), { layanan: GMM, hasil: "TIDAK_VALID", alasan: "STREET_VIEW" });
  assert.equal((await GK.nilaiKoordinatData(b)).hasil, "VALID");
  assert.equal(fetchPanggilan.length, 0);
  assert.deepEqual((await GK.nilaiKoordinatData(c)), { layanan: GMM, hasil: "TIDAK_VALID", alasan: "TANPA_PENANDA" });
  assert.equal((await db.query("select hasil, alasan from cek_koordinat where penerima_id = $1", [c])).rows[0].alasan, "TANPA_PENANDA", "hasil disimpan");
  assert.equal((await GK.nilaiKoordinatData(d)).hasil, "VALID", "hasil basi diganti penilaian baru");
  assert.equal((await db.query("select tautan, hasil from cek_koordinat where penerima_id = $1", [d])).rows[0].tautan, "https://www.google.com/maps?q=3.6,98.67");
  assert.equal((await GK.nilaiKoordinatData(e)).hasil, "BELUM_DICEK");
  assert.equal((await db.query("select count(*)::int n from cek_koordinat where penerima_id = $1", [e])).rows[0].n, 0, "belum dicek tidak disimpan sebagai hasil");
  assert.equal(await GK.nilaiKoordinatData(f), null); assert.equal(await GK.nilaiKoordinatData(999999), null);
});

test("GERBANG HASIL: Memenuhi Syarat ditolak; BTL wajib menyebut 'koordinat'; TMS bebas; valid/belum dicek/non-GMM lolos; galat teknis = LOLOS", opsi, async () => {
  const { db } = await siap();
  const bad = await tambah(db, { status: "Proses Verifikasi" });
  const ok = await tambah(db, { status: "Proses Verifikasi", tautan: "https://www.google.com/maps?q=3.6,98.67", hasil: "VALID", alasan: "" });
  const tunggu = await tambah(db, { status: "Proses Verifikasi", tautan: PENDEK, hasil: null });
  const lain = await tambah(db, { layanan: "GURU SEKOLAH MINGGU", status: "Proses Verifikasi" });
  const ms = await GK.tolakHasilKarenaKoordinat(bad, "Memenuhi Syarat", "");
  assert.match(ms, /tidak dapat diberi Memenuhi Syarat/); assert.match(ms, /tautan street view/i); assert.match(ms, /Koordinat tidak valid: tautan Street View/);
  assert.match(await GK.tolakHasilKarenaKoordinat(bad, "Berkas Tidak Lengkap", "KTP buram"), /wajib menyebutkan masalah koordinat/);
  assert.equal(await GK.tolakHasilKarenaKoordinat(bad, "Berkas Tidak Lengkap", ""), (await GK.tolakHasilKarenaKoordinat(bad, "Berkas Tidak Lengkap", null)));
  for (const ket of ["Koordinat tidak valid: street view", "KOORDINAT salah", "titik koordinat bukan lokasi"]) assert.equal(await GK.tolakHasilKarenaKoordinat(bad, "Berkas Tidak Lengkap", ket), null, ket);
  assert.equal(await GK.tolakHasilKarenaKoordinat(bad, "Berkas Tidak Lengkap", "KTP buram", { wajibKeteranganBTL: false }), null, "SESUAI pada data yang sudah BTL tidak dipaksa");
  assert.equal(await GK.tolakHasilKarenaKoordinat(bad, "Tidak Memenuhi Syarat", "data ganda"), null, "TMS tidak dipaksa");
  assert.equal(await GK.tolakHasilKarenaKoordinat(ok, "Memenuhi Syarat", ""), null);
  assert.equal(await GK.tolakHasilKarenaKoordinat(tunggu, "Memenuhi Syarat", ""), null, "belum dicek -> lolos (gagal-terbuka)");
  assert.equal(await GK.tolakHasilKarenaKoordinat(lain, "Memenuhi Syarat", ""), null, "layanan lain tidak diperiksa");
  assert.equal(await GK.tolakHasilKarenaKoordinat(bad, "Proses Verifikasi", ""), null);
  await db.exec("drop table cek_koordinat");
  assert.equal(await GK.tolakHasilKarenaKoordinat(bad, "Memenuhi Syarat", ""), null, "galat database -> lolos, tidak menghalangi verifikasi");
});

test("GERBANG LAPOR: koordinat masih tidak valid -> ditolak dengan petunjuk; valid/belum dicek/non-GMM -> lolos", opsi, async () => {
  const { db } = await siap();
  const bad = await tambah(db, { status: "Berkas Tidak Lengkap" });
  const ok = await tambah(db, { status: "Berkas Tidak Lengkap", tautan: "https://www.google.com/maps?q=3.6,98.67", hasil: "VALID", alasan: "" });
  const lain = await tambah(db, { layanan: "GURU SEKOLAH MINGGU", status: "Berkas Tidak Lengkap" });
  const t = await GK.tolakLaporKarenaKoordinat(bad);
  assert.match(t, /belum dapat dilaporkan/); assert.match(t, /Bagikan dan Salin tautan/);
  assert.equal(await GK.tolakLaporKarenaKoordinat(ok), null); assert.equal(await GK.tolakLaporKarenaKoordinat(lain), null);
});

// ====================================================== jalur yang memakai gerbang (kode ASLI)
test("VERIFIKASI AWAL (verifikasiSatuData): verifikator ditolak MS pada koordinat tidak valid, BTL wajib 'koordinat', TMS bebas; Admin Utama TIDAK diblokir; koordinat valid lolos", opsi, async () => {
  const { db } = await siap();
  const a = await tambah(db, { status: "Proses Verifikasi" }), b = await tambah(db, { status: "Proses Verifikasi" }), c = await tambah(db, { status: "Proses Verifikasi" });
  const d = await tambah(db, { status: "Proses Verifikasi" }), v = await tambah(db, { status: "Proses Verifikasi", tautan: "https://www.google.com/maps?q=3.6,98.67", hasil: "VALID", alasan: "" });
  const tok = TOKEN.verif_uga_deba;   // akun khusus: tidak terkena pembagian awal, jadi hanya gerbang koordinat yang diuji
  const r1 = await VF.verifikasiSatuData(tok, a, "Memenuhi Syarat", "", "");
  assert.equal(r1.sukses, false); assert.equal(r1.koordinatTidakValid, true); assert.match(r1.pesan, /tidak dapat diberi Memenuhi Syarat/);
  assert.deepEqual(await statusDi(db, a), { s: "Proses Verifikasi", o: "ADMIN" }, "data tidak berubah");
  assert.equal((await riwayat(db, a)).length, 0, "tidak ada riwayat/hitungan");
  const r2 = await VF.verifikasiSatuData(tok, b, "Berkas Tidak Lengkap", "KTP buram", "");
  assert.equal(r2.sukses, false); assert.match(r2.pesan, /wajib menyebutkan masalah koordinat/);
  const r3 = await VF.verifikasiSatuData(tok, b, "Berkas Tidak Lengkap", "Koordinat tidak valid: tautan Street View, bukan titik penanda.", "");
  assert.equal(r3.sukses, true, JSON.stringify(r3)); assert.equal((await statusDi(db, b)).s, "Berkas Tidak Lengkap");
  const r4 = await VF.verifikasiSatuData(tok, c, "Tidak Memenuhi Syarat", "data ganda", "");
  assert.equal(r4.sukses, true, JSON.stringify(r4));
  const r5 = await VF.verifikasiSatuData(tok, v, "Memenuhi Syarat", "", "");
  assert.equal(r5.sukses, true, JSON.stringify(r5));
  const r6 = await VF.verifikasiSatuData(TOKEN.admin, d, "Memenuhi Syarat", "", "");
  assert.equal(r6.sukses, true, "Admin Utama tidak diblokir: " + JSON.stringify(r6)); assert.equal((await statusDi(db, d)).s, "Memenuhi Syarat");
});

test("LAPOR PERBAIKAN (laporkanPerbaikanBerkas): petugas ditolak selama koordinat masih tidak valid; setelah koordinat sah laporan diterima", opsi, async () => {
  const { db } = await siap();
  const id = await tambah(db, { status: "Berkas Tidak Lengkap" });
  const r1 = await VF.laporkanPerbaikanBerkas(TOKEN.gmm_x, id);
  assert.equal(r1.sukses, false); assert.match(r1.pesan, /belum dapat dilaporkan/);
  assert.equal((await db.query("select tanggal_lapor_perbaikan from penerima where id = $1", [id])).rows[0].tanggal_lapor_perbaikan, null);
  await db.query("update penerima set link_koordinat_lokasi = 'https://www.google.com/maps?q=3.6,98.67' where id = $1", [id]);   // petugas memperbaiki (tautan berubah -> hasil lama basi, dinilai ulang)
  const r2 = await VF.laporkanPerbaikanBerkas(TOKEN.gmm_x, id);
  assert.equal(r2.sukses, true, JSON.stringify(r2));
});

test("VERIFIKASI ULANG (simpanHasilUlang): SESUAI pada MS berkoordinat tidak valid ditolak; koreksi ke BTL wajib 'koordinat'; TMS bebas; koordinat valid SESUAI lolos", opsi, async () => {
  const { db } = await siap();
  const ids = [];
  for (let i = 0; i < 4; i++) ids.push(await tambah(db, { status: "Memenuhi Syarat", oleh: "ADMIN", ...(i === 3 ? { tautan: "https://www.google.com/maps?q=3.6,98.67", hasil: "VALID", alasan: "" } : {}) }));
  ids.push(await tambah(db, { status: "Berkas Tidak Lengkap", oleh: "ADMIN" }));   // sudah BTL (mis. karena koordinat), koordinat masih tidak valid
  const b = (await db.query("insert into batch_verifikasi_ulang (nama, dibuat_oleh, benih, kriteria, pemeriksa) values ('x','ADMIN','b','{}','[]') returning id")).rows[0].id;
  const tg = [];
  for (const id of ids) tg.push((await db.query("insert into tugas_verifikasi_ulang (batch_id, penerima_id, tahun, akun_id, status_saat_dibagi, layanan) values ($1, $2, 2027, $3, $5, $4) returning id", [b, id, ID.verif_p3, GMM, id === ids[4] ? "Berkas Tidak Lengkap" : "Memenuhi Syarat"])).rows[0].id);
  const siapkan = async (t) => { await UL.bukaTugasUlang(TOKEN.verif_p3, t); await UL.catatBerkasDibuka(TOKEN.verif_p3, t, "link_ktp"); await UL.catatBerkasDibuka(TOKEN.verif_p3, t, "link_buku_rekening"); };
  for (const t of tg) await siapkan(t);
  const centang = { link_ktp: true, link_buku_rekening: true };
  const s1 = await UL.simpanHasilUlang(TOKEN.verif_p3, tg[0], { hasil: "SESUAI", centang });
  assert.equal(s1.sukses, false); assert.equal(s1.koordinatTidakValid, true); assert.match(s1.pesan, /tidak dapat diberi Memenuhi Syarat/);
  assert.equal((await db.query("select selesai_pada from tugas_verifikasi_ulang where id = $1", [tg[0]])).rows[0].selesai_pada, null, "tugas tetap terbuka");
  assert.equal((await riwayat(db, ids[0])).length, 0);
  const s2 = await UL.simpanHasilUlang(TOKEN.verif_p3, tg[0], { hasil: "DIKOREKSI", statusSesudah: "Berkas Tidak Lengkap", alasan: "KTP buram", centang: { link_ktp: false, link_buku_rekening: true } });
  assert.equal(s2.sukses, false); assert.match(s2.pesan, /wajib menyebutkan masalah koordinat/);
  const s3 = await UL.simpanHasilUlang(TOKEN.verif_p3, tg[0], { hasil: "DIKOREKSI", statusSesudah: "Berkas Tidak Lengkap", alasan: "Koordinat tidak valid: tautan Street View", centang: { link_ktp: true, link_buku_rekening: true } });
  assert.equal(s3.sukses, true, JSON.stringify(s3)); assert.equal((await statusDi(db, ids[0])).s, "Berkas Tidak Lengkap");
  const s4 = await UL.simpanHasilUlang(TOKEN.verif_p3, tg[1], { hasil: "DIKOREKSI", statusSesudah: "Tidak Memenuhi Syarat", alasan: "data ganda", centang });
  assert.equal(s4.sukses, true, "TMS tidak dipaksa: " + JSON.stringify(s4));
  const s6 = await UL.simpanHasilUlang(TOKEN.verif_p3, tg[4], { hasil: "SESUAI", centang });
  assert.equal(s6.sukses, true, "SESUAI pada data yang sudah BTL tidak dipaksa menulis koordinat lagi: " + JSON.stringify(s6));
  assert.equal((await statusDi(db, ids[4])).s, "Berkas Tidak Lengkap");
  const s5 = await UL.simpanHasilUlang(TOKEN.verif_p3, tg[3], { hasil: "SESUAI", centang });
  assert.equal(s5.sukses, true, "koordinat valid lolos: " + JSON.stringify(s5));
});

test("KABEL: gerbang dipasang SEBELUM penulisan di semua jalur; Admin Utama dikecualikan; kunci sementara sudah tidak ada", () => {
  const p = baca("supabase/functions/api/domains/penerima.ts"), v = baca("supabase/functions/api/domains/verifikasi.ts"), u = baca("supabase/functions/api/domains/verifikasiUlang.ts");
  const sim = p.indexOf("tolakKoordinatSalah(koordinatLink)");
  assert.ok(sim > 0 && sim < p.indexOf("insert into penerima"), "simpan baru: gerbang sebelum insert");
  assert.match(p, /LAYANAN_GERBANG && String\(sesi\.role \|\| ""\)\.trim\(\)\.toUpperCase\(\) !== "UTAMA"/);
  const edt = p.indexOf("tolakKoordinatSalah(nilaiBaru)");
  assert.ok(edt > 0 && edt < p.indexOf("await sql.begin", edt), "edit: gerbang sebelum penulisan");
  assert.match(p, /nilaiBaru !== String\(rowLama\.link_koordinat_lokasi \?\? ""\)\.trim\(\)/, "edit: hanya bila tautan berubah");
  assert.ok(v.indexOf("tolakHasilKarenaKoordinat(id, statusBaru, keteranganBersih)") > 0 && v.indexOf("tolakHasilKarenaKoordinat(id, statusBaru, keteranganBersih)") < v.indexOf("const rows = await sql.begin"));
  assert.match(v, /if \(pelakuVerifikator\) \{\s+const tolakKoordinat/);
  assert.ok(v.indexOf("tolakLaporKarenaKoordinat(id)") > 0 && v.indexOf("tolakLaporKarenaKoordinat(id)") < v.indexOf("const namaPelapor"));
  const gu = u.indexOf("tolakHasilKarenaKoordinat(Number(t.penerima_id)");
  assert.ok(gu > 0 && gu < u.indexOf("await sql.begin", gu), "ulang: gerbang sebelum transaksi penyimpanan hasil");
  assert.equal(fs.existsSync(new URL("../../supabase/functions/api/_shared/kunciSementara.ts", import.meta.url)), false);
  assert.doesNotMatch(p + v, /perbaikanGmmDikunci|PESAN_PERBAIKAN_GMM_DIKUNCI/);
});
