// Agregat hasil kerja verifikator + pemberian hasil verifikasi di Postgres SUNGGUHAN (PGlite): migrasi ASLI, kode domain ASLI.
// Rencana: plans/plan-agregat-verifikator.md. Jalankan: npm run uji:agregat-pg
// Memerlukan @electric-sql/pglite (bukan dependensi repo; lihat scripts/uji/_harness-pg.mjs) -- bila tidak ada, uji ini DILEWATI.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { muatPglite, muatServerPg } from "./_harness-pg.mjs";

const PGlite = await muatPglite();
const lewati = PGlite ? false : "PGlite tidak tersedia (npm install --no-save @electric-sql/pglite@0.3.14, atau set PGLITE_DIR)";
if (!PGlite) console.log("DILEWATI: " + lewati);
const AG = PGlite ? await muatServerPg("supabase/functions/api/domains/agregatVerifikasi.ts") : null;
const VF = PGlite ? await muatServerPg("supabase/functions/api/domains/verifikasi.ts", { stub: ["dataDetail.ts"] }) : null;
const opsi = { skip: lewati };
const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");

const ID = { admin: "00000000-0000-4000-8000-000000000001", a1: "00000000-0000-4000-8000-0000000000a1", a2: "00000000-0000-4000-8000-0000000000a2", b1: "00000000-0000-4000-8000-0000000000b1", baru: "00000000-0000-4000-8000-0000000000c1", kec: "00000000-0000-4000-8000-0000000000d1" };
const TOKEN = { admin: "T-ADMIN", a1: "T-A1", a2: "T-A2", b1: "T-B1", baru: "T-BARU", kec: "T-KEC" };

async function siap() {
  const db = new PGlite();
  // Peran bawaan Supabase yang dirujuk migrasi
  await db.exec("create role anon; create role authenticated;");
  await db.exec(`
    create table akun (id uuid primary key, username text not null, nama_lengkap text not null default '', role text not null, aktif boolean not null default true);
    create table penerima (
      id serial primary key, tahun int not null, layanan text, kecamatan text, kelurahan text, tempat_tugas text,
      status_verifikasi text, keterangan_verifikasi text default '', tanggal_verifikasi timestamptz, diverifikasi_oleh text,
      batas_waktu_perbaikan date, tanggal_lapor_perbaikan timestamptz, dilapor_oleh text, tanggal_berkas_diubah timestamptz, dibuat_oleh_akun_id uuid);
    insert into akun (id, username, nama_lengkap, role) values
      ('${ID.admin}', 'admin', 'ADMIN UTAMA', 'UTAMA'),
      ('${ID.a1}', 'verif_ronald_fredy', 'A SATU', 'VERIFIKATOR'),
      ('${ID.a2}', 'verif_herna_hutapea', 'A DUA', 'VERIFIKATOR'),
      ('${ID.b1}', 'verif_bungamin_surbakti', 'B SATU', 'VERIFIKATOR'),
      ('${ID.baru}', 'verif_tanpa_tim', '', 'VERIFIKATOR'),
      ('${ID.kec}', 'kec_x', '', 'KECAMATAN');
  `);
  await db.exec(baca("supabase/migrations/20261112100000_riwayat_verifikasi.sql"));
  await db.exec(baca("supabase/migrations/20261112150000_agregat_verifikasi.sql"));   // migrasi ASLI yang akan dijalankan di produksi
  globalThis.__ujiPg = db;
  globalThis.__ujiSesi = {
    [TOKEN.admin]: { akunId: ID.admin, username: "admin", role: "UTAMA", kecamatan: "", userId: "ADMIN" },
    [TOKEN.a1]: { akunId: ID.a1, username: "verif_ronald_fredy", role: "VERIFIKATOR", kecamatan: "", userId: "" },
    [TOKEN.a2]: { akunId: ID.a2, username: "verif_herna_hutapea", role: "VERIFIKATOR", kecamatan: "", userId: "" },
    [TOKEN.b1]: { akunId: ID.b1, username: "verif_bungamin_surbakti", role: "VERIFIKATOR", kecamatan: "", userId: "" },
    [TOKEN.baru]: { akunId: ID.baru, username: "verif_tanpa_tim", role: "VERIFIKATOR", kecamatan: "", userId: "" },
    [TOKEN.kec]: { akunId: ID.kec, username: "kec_x", role: "KECAMATAN", kecamatan: "MEDAN KOTA", userId: "" },
  };
  return db;
}
const tambahData = async (db, n, status = "Proses Verifikasi") => { for (let i = 0; i < n; i++) await db.query("insert into penerima (tahun, layanan, kecamatan, status_verifikasi) values (2027, 'IMAM MASJID', 'MEDAN KOTA', $1)", [status]); };
// Catatan riwayat langsung (waktu WIB agar mudah dibaca). 2026-11-09 = Senin.
const riw = (db, pid, oleh, waktuWib, statusBaru = "Memenuhi Syarat", { lama = "Proses Verifikasi", sumber = "SATU" } = {}) =>
  db.query("insert into riwayat_verifikasi (penerima_id, tahun, status_lama, status_baru, keterangan, oleh, sumber, waktu) values ($1, 2027, $2, $3, '', $4, $5, $6::timestamptz)", [pid, lama, statusBaru, oleh, sumber, waktuWib.replace(" ", "T") + "+07:00"]);

test("MIGRASI ASLI: tabel, isi awal (tim/koordinator/jam kerja/libur), satu koordinator per tim, hak anon dicabut", opsi, async () => {
  const db = await siap();
  const tim = (await db.query("select a.username, t.tim, t.koordinator from tim_verifikator t join akun a on a.id = t.akun_id order by a.username")).rows;
  assert.deepEqual(tim.map((r) => [r.username, r.tim, r.koordinator]), [["verif_bungamin_surbakti", "II", true], ["verif_herna_hutapea", "I", false], ["verif_ronald_fredy", "I", true]], "akun tanpa daftar tim tidak ikut");
  assert.equal((await db.query("select count(*)::int n from jam_kerja_verifikasi")).rows[0].n, 5);
  assert.deepEqual((await db.query("select isodow, mulai::text m, selesai::text s from jam_kerja_verifikasi order by isodow")).rows.map((r) => [r.isodow, r.m, r.s]), [[1, "08:00:00", "16:30:00"], [2, "08:00:00", "16:30:00"], [3, "08:00:00", "16:30:00"], [4, "08:00:00", "16:30:00"], [5, "08:00:00", "17:00:00"]]);
  assert.ok((await db.query("select count(*)::int n from hari_libur_verifikasi where tanggal = '2026-12-25'")).rows[0].n === 1);
  await assert.rejects(() => db.query("insert into tim_verifikator (akun_id, tim, koordinator) values ($1, 'I', true)", [ID.baru]), /satu_koordinator|unique/i, "dua koordinator dalam satu tim ditolak");
  await assert.rejects(() => db.query("insert into tim_verifikator (akun_id, tim) values ($1, 'V')", [ID.baru]), /check/i, "tim di luar I-IV ditolak");
  await db.exec(baca("supabase/migrations/20261112150000_agregat_verifikasi.sql"));   // idempotent: dijalankan ulang tidak menggandakan apa pun
  assert.equal((await db.query("select count(*)::int n from tim_verifikator")).rows[0].n, 3);
  assert.equal((await db.query("select count(*)::int n from jam_kerja_verifikasi")).rows[0].n, 5);
  assert.equal((await db.query("select has_table_privilege('anon','tim_verifikator','select') as p")).rows[0].p, false);
  // akun dihapus -> keanggotaan tim ikut hilang (tidak memblokir penghapusan akun)
  await db.query("delete from akun where id = $1", [ID.b1]);
  assert.equal((await db.query("select count(*)::int n from tim_verifikator where akun_id = $1", [ID.b1])).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::int n from tim_verifikator")).rows[0].n, 2);
});

test("RIWAYAT HANYA-TAMBAH: INSERT boleh; UPDATE dan DELETE ditolak oleh pemicu", opsi, async () => {
  const db = await siap();
  await tambahData(db, 1);
  await riw(db, 1, "VERIF_X", "2026-11-09 10:00:00");
  await assert.rejects(() => db.query("update riwayat_verifikasi set oleh = 'LAIN'"), /hanya-tambah/);
  await assert.rejects(() => db.query("delete from riwayat_verifikasi"), /hanya-tambah/);
  assert.equal((await db.query("select count(*)::int n from riwayat_verifikasi")).rows[0].n, 1);
});

test("D8+D9 (SQL nyata): verifikator memberi hasil -> status + riwayat tertulis; data yang sudah berstatus DITOLAK dan tidak mengubah apa pun", opsi, async () => {
  const db = await siap();
  await tambahData(db, 2);
  const h = await VF.verifikasiSatuData(TOKEN.a1, 1, "Memenuhi Syarat", "", "", "Proses Verifikasi");
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.equal(h.verifikator, "VERIF_RONALD_FREDY");
  const p = (await db.query("select status_verifikasi, diverifikasi_oleh from penerima where id = 1")).rows[0];
  assert.deepEqual([p.status_verifikasi, p.diverifikasi_oleh], ["Memenuhi Syarat", "VERIF_RONALD_FREDY"]);
  const r = (await db.query("select oleh, status_lama, status_baru, sumber from riwayat_verifikasi")).rows;
  assert.deepEqual(r, [{ oleh: "VERIF_RONALD_FREDY", status_lama: "Proses Verifikasi", status_baru: "Memenuhi Syarat", sumber: "SATU" }]);

  // verifikator mencoba mengubah data yang sudah berstatus (tanpa/ dengan statusLama yang benar)
  for (const lama of ["", "Memenuhi Syarat"]) {
    const t = await VF.verifikasiSatuData(TOKEN.a2, 1, "Berkas Tidak Lengkap", "alasan", "", lama);
    assert.equal(t.sukses, false, "statusLama=" + lama);
    assert.equal(t.konflik, true);
    assert.match(t.pesan, /hanya dapat dilakukan oleh Admin Utama/);
  }
  assert.equal((await db.query("select status_verifikasi from penerima where id = 1")).rows[0].status_verifikasi, "Memenuhi Syarat", "tidak berubah");
  assert.equal((await db.query("select count(*)::int n from riwayat_verifikasi")).rows[0].n, 1, "tidak ada riwayat baru");

  // Admin Utama boleh mengubah data yang sudah berstatus; riwayat tetap tertulis (status_lama = status sebelumnya)
  const u = await VF.verifikasiSatuData(TOKEN.admin, 1, "Berkas Tidak Lengkap", "alasan", "", "Memenuhi Syarat");
  assert.equal(u.sukses, true, JSON.stringify(u));
  assert.equal((await db.query("select status_verifikasi from penerima where id = 1")).rows[0].status_verifikasi, "Berkas Tidak Lengkap");
  assert.deepEqual((await db.query("select oleh, status_lama from riwayat_verifikasi order by id")).rows.map((x) => [x.oleh, x.status_lama]), [["VERIF_RONALD_FREDY", "Proses Verifikasi"], ["ADMIN", "Memenuhi Syarat"]]);

  // Tandai Sudah Diperbaiki: verifikator ditolak, Admin Utama berhasil
  const tv = await VF.tandaiSudahDiperbaiki(TOKEN.a1, 1);
  assert.equal(tv.sukses, false);
  assert.equal((await db.query("select status_verifikasi from penerima where id = 1")).rows[0].status_verifikasi, "Berkas Tidak Lengkap");
  const ta = await VF.tandaiSudahDiperbaiki(TOKEN.admin, 1);
  assert.equal(ta.sukses, true, JSON.stringify(ta));
  assert.equal((await db.query("select sumber from riwayat_verifikasi order by id desc limit 1")).rows[0].sumber, "DIPERBAIKI");
});

test("D8 (rollback NYATA): bila riwayat gagal tertulis, pembaruan status verifikator ikut dibatalkan (tidak ada verifikasi yang tak terhitung)", opsi, async () => {
  const db = await siap();
  await tambahData(db, 1);
  await db.exec(`
    create function gagal_riwayat() returns trigger language plpgsql as $$ begin raise exception 'riwayat gagal (uji)'; end; $$;
    create trigger gagal_riwayat before insert on riwayat_verifikasi for each row execute function gagal_riwayat();`);
  const h = await VF.verifikasiSatuData(TOKEN.a1, 1, "Memenuhi Syarat", "", "", "Proses Verifikasi");
  assert.equal(h.sukses, false, JSON.stringify(h));
  const p = (await db.query("select status_verifikasi, diverifikasi_oleh from penerima where id = 1")).rows[0];
  assert.deepEqual([p.status_verifikasi, p.diverifikasi_oleh], ["Proses Verifikasi", null], "status TIDAK berubah (rollback)");
  // Admin Utama: riwayat tetap non-blocking -> verifikasi berhasil walau riwayat gagal
  const galat = console.error; console.error = () => {};
  try {
    const u = await VF.verifikasiSatuData(TOKEN.admin, 1, "Memenuhi Syarat", "", "", "Proses Verifikasi");
    assert.equal(u.sukses, true, JSON.stringify(u));
  } finally { console.error = galat; }
  assert.equal((await db.query("select status_verifikasi from penerima where id = 1")).rows[0].status_verifikasi, "Memenuhi Syarat");
});

test("AGREGAT (SQL nyata): hanya pemberian hasil PERTAMA oleh verifikator dihitung; perbaikan/massal/ulang/Admin tidak; batas jam kerja & tanggal merah", opsi, async () => {
  const db = await siap();
  await tambahData(db, 14);
  // verif_ronald_fredy (koordinator Tim I)
  await riw(db, 1, "VERIF_RONALD_FREDY", "2026-11-09 08:00:00");                                   // Senin 08.00 -> jam kerja
  await riw(db, 2, "VERIF_RONALD_FREDY", "2026-11-09 16:29:59", "Berkas Tidak Lengkap");            // jam kerja
  await riw(db, 3, "VERIF_RONALD_FREDY", "2026-11-09 16:30:00", "Tidak Memenuhi Syarat");           // luar (batas)
  await riw(db, 4, "VERIF_RONALD_FREDY", "2026-11-13 16:59:59");                                   // Jumat -> jam kerja
  await riw(db, 5, "VERIF_RONALD_FREDY", "2026-11-13 17:00:00");                                   // Jumat 17.00 -> luar
  await riw(db, 1, "VERIF_RONALD_FREDY", "2026-11-10 09:00:00", "Berkas Tidak Lengkap");            // data 1 DIBERI HASIL LAGI -> data sama, hanya yang pertama (tidak masuk: status_lama default Proses Verifikasi, tetapi data sama)
  await riw(db, 6, "VERIF_RONALD_FREDY", "2026-11-10 09:00:00", "Memenuhi Syarat", { lama: "Berkas Tidak Lengkap" });   // bukan pemberian pertama (status_lama BTL) -> tidak dihitung
  await riw(db, 7, "VERIF_RONALD_FREDY", "2026-11-10 09:00:00", "Memenuhi Syarat", { sumber: "DIPERBAIKI", lama: "Berkas Tidak Lengkap" });   // perbaikan -> tidak
  await riw(db, 8, "VERIF_RONALD_FREDY", "2026-11-10 09:00:00", "Memenuhi Syarat", { sumber: "MASSAL" });                                      // massal -> tidak
  await riw(db, 9, "VERIF_RONALD_FREDY", "2026-11-14 11:00:00");                                  // Sabtu -> luar
  await riw(db, 10, "VERIF_RONALD_FREDY", "2026-12-25 11:00:00");                                 // di luar rentang -> tidak
  // verif_herna_hutapea (Tim I, anggota)
  await riw(db, 11, "VERIF_HERNA_HUTAPEA", "2026-11-10 10:00:00");
  await riw(db, 12, "VERIF_HERNA_HUTAPEA", "2026-11-11 23:30:00");                                // 23.30 WIB Rabu -> luar, tetap tanggal 11
  // verif_bungamin_surbakti (koordinator Tim II)
  await riw(db, 13, "VERIF_BUNGAMIN_SURBAKTI", "2026-11-12 10:00:00");
  // verif_tanpa_tim
  await riw(db, 14, "VERIF_TANPA_TIM", "2026-11-12 11:00:00");
  // Admin Utama (informasi)
  await riw(db, 1, "ADMIN", "2026-11-12 09:00:00", "Memenuhi Syarat", { lama: "Berkas Tidak Lengkap", sumber: "DIPERBAIKI" });
  await riw(db, 2, "ADMIN", "2026-11-14 09:00:00", "Memenuhi Syarat", { lama: "Berkas Tidak Lengkap", sumber: "SATU" });

  const RENT = ["2026-11-09", "2026-11-15"];
  // Verifikator biasa: hanya dirinya
  const sa = await AG.getAgregatVerifikasi(TOKEN.a2, ...RENT, "II");
  assert.equal(sa.sukses, true, JSON.stringify(sa));
  assert.equal(sa.cakupan, "SAYA");
  assert.deepEqual(sa.perOrang.map((o) => o.username), ["verif_herna_hutapea"]);
  assert.deepEqual([sa.ringkasan.total, sa.ringkasan.jamKerja, sa.ringkasan.luarJamKerja], [2, 1, 1]);
  // Koordinator Tim I: Tim I saja; tidak melihat Tim II walau meminta
  const k1 = await AG.getAgregatVerifikasi(TOKEN.a1, ...RENT, "II");
  assert.equal(k1.cakupan, "TIM");
  assert.deepEqual(k1.perOrang.map((o) => o.username).sort(), ["verif_herna_hutapea", "verif_ronald_fredy"]);
  const ron = k1.perOrang.find((o) => o.username === "verif_ronald_fredy");
  // dihitung: data 1 (Sen 08.00 jam), 2 (16.29.59 jam), 3 (16.30 luar), 4 (Jum 16.59.59 jam), 5 (Jum 17.00 luar), 9 (Sabtu luar) = 6; data 1 kedua, 6, 7, 8, 10 tidak
  assert.deepEqual([ron.total, ron.jamKerja, ron.luarJamKerja], [6, 3, 3], JSON.stringify(ron));
  assert.deepEqual([ron.memenuhiSyarat, ron.berkasTidakLengkap, ron.tidakMemenuhiSyarat], [4, 1, 1]);
  assert.equal(k1.ringkasan.total, 8);
  assert.ok(!JSON.stringify(k1).includes("BUNGAMIN"), "tidak ada anggota Tim II");
  // Admin Utama: semua; perTim; tanpa tim; luarTim
  const ad = await AG.getAgregatVerifikasi(TOKEN.admin, ...RENT);
  assert.equal(ad.cakupan, "SEMUA");
  assert.equal(ad.ringkasan.total, 8 + 1 + 1, "Tim I 8 + Tim II 1 + tanpa tim 1");
  const tim = Object.fromEntries(ad.perTim.map((t) => [t.tim, t.total]));
  assert.deepEqual([tim.I, tim.II, tim["-"]], [8, 1, 1]);
  assert.deepEqual(ad.luarTim, { total: 2, jamKerja: 1, luarJamKerja: 1 }, "Admin Utama: SATU 14.11 (luar) + DIPERBAIKI 12.11 (jam kerja), terpisah dari angka tim");
  // Harian: Rabu 11 Nov 23.30 WIB tetap tanggal 11
  const h11 = ad.perHari.find((x) => x.tanggal === "2026-11-11");
  assert.deepEqual([h11.total, h11.luarJamKerja], [1, 1]);
  // Tanggal merah dari tabel
  await db.query("insert into hari_libur_verifikasi (tanggal, keterangan) values ('2026-11-10', 'uji')");
  const sa2 = await AG.getAgregatVerifikasi(TOKEN.a2, ...RENT);
  assert.deepEqual([sa2.ringkasan.jamKerja, sa2.ringkasan.luarJamKerja], [0, 2], "10 Nov tanggal merah -> 10.00 jadi luar jam kerja");
  // Saringan tim (Admin Utama)
  const t2 = await AG.getAgregatVerifikasi(TOKEN.admin, ...RENT, "II");
  assert.deepEqual(t2.perOrang.map((o) => o.username), ["verif_bungamin_surbakti"]);
  const timT2 = Object.fromEntries(t2.perTim.map((x) => [x.tim, x.total]));
  assert.deepEqual([timT2.I, timT2.II, timT2["-"]], [8, 1, 1], "kartu per tim tidak menyempit saat disaring ke Tim II");
  // Peran lain ditolak
  const kk = await AG.getAgregatVerifikasi(TOKEN.kec, ...RENT);
  assert.equal(kk.sukses, false);
  // Badge (sumber yang sama dengan agregat)
  const bd = await VF.getRingkasanVerifikasiSaya(TOKEN.a1);
  assert.equal(bd.sukses, true, JSON.stringify(bd));
  assert.equal(bd.total, 7, "semua pemberian hasil pertama (sampai 25 Des) oleh akun ini: data 1,2,3,4,5,9,10");
  assert.equal(bd.memenuhiSyarat + bd.berkasTidakLengkap + bd.tidakMemenuhiSyarat, bd.total);
});

test("AGREGAT: tahun/riwayat tidak ada isi -> semua nol tanpa galat; rentang tak valid ditolak", opsi, async () => {
  await siap();
  const k = await AG.getAgregatVerifikasi(TOKEN.admin, "2026-11-09", "2026-11-15");
  assert.equal(k.sukses, true, JSON.stringify(k));
  assert.equal(k.ringkasan.total, 0);
  assert.equal(k.perHari.length, 7);
  assert.equal((await AG.getAgregatVerifikasi(TOKEN.admin, "2026-11-15", "2026-11-09")).sukses, false);
});

test("STATUS SEKARANG + LEMBUR AMAN (SQL nyata): Admin mengubah/menghapus data sesudah diverifikasi -> dikoreksi bertambah, tetapi total, jam kerja, luar jam kerja, dan hasil verifikator TIDAK berubah", async () => {
  const db = await siap();
  await tambahData(db, 3);
  assert.equal((await VF.verifikasiSatuData(TOKEN.a1, 1, "Tidak Memenuhi Syarat", "alasan", "", "Proses Verifikasi")).sukses, true);
  assert.equal((await VF.verifikasiSatuData(TOKEN.a1, 2, "Memenuhi Syarat", "", "", "Proses Verifikasi")).sukses, true);
  assert.equal((await VF.verifikasiSatuData(TOKEN.a1, 3, "Berkas Tidak Lengkap", "alasan", "", "Proses Verifikasi")).sukses, true);
  const pokok = (h) => JSON.stringify([h.ringkasan.total, h.ringkasan.jamKerja, h.ringkasan.luarJamKerja, h.ringkasan.memenuhiSyarat, h.ringkasan.berkasTidakLengkap, h.ringkasan.tidakMemenuhiSyarat]);

  const awal = await AG.getAgregatVerifikasi(TOKEN.a1);
  assert.equal(awal.sukses, true, JSON.stringify(awal));
  assert.equal(awal.ringkasan.total, 3);
  assert.deepEqual([awal.ringkasan.dikoreksi, awal.ringkasan.sekarangTidakMemenuhiSyarat, awal.ringkasan.sekarangMemenuhiSyarat, awal.ringkasan.sekarangBerkasTidakLengkap], [0, 1, 1, 1], "belum ada koreksi: status sekarang = hasil verifikator");

  // Admin Utama menaikkan data 1 dari Tidak Memenuhi Syarat ke Berkas Tidak Lengkap (kasus nyata user)
  assert.equal((await VF.verifikasiSatuData(TOKEN.admin, 1, "Berkas Tidak Lengkap", "dinaikkan", "", "Tidak Memenuhi Syarat")).sukses, true);
  const sesudah = await AG.getAgregatVerifikasi(TOKEN.a1);
  assert.equal(pokok(sesudah), pokok(awal), "total/jam kerja/lembur/hasil verifikator IDENTIK");
  assert.deepEqual([sesudah.ringkasan.tidakMemenuhiSyarat, sesudah.ringkasan.dikoreksi, sesudah.ringkasan.sekarangTidakMemenuhiSyarat, sesudah.ringkasan.sekarangBerkasTidakLengkap], [1, 1, 0, 2], "hasil verifikator tetap TMS 1; sekarang BTL 2; dikoreksi 1");
  const ron = sesudah.perOrang.find((o) => o.username === "verif_ronald_fredy");
  assert.deepEqual([ron.total, ron.dikoreksi], [3, 1]);

  // Data 2 dihapus Admin: ikut selisih (lainnya), total tetap
  await db.query("delete from penerima where id = 2");
  const hapus = await AG.getAgregatVerifikasi(TOKEN.a1);
  assert.equal(pokok(hapus), pokok(awal), "data dihapus tidak mengurangi hitungan verifikator");
  assert.deepEqual([hapus.ringkasan.dikoreksi, hapus.ringkasan.sekarangLainnya], [2, 1]);
});
