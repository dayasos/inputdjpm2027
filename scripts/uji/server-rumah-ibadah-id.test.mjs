// Uji F4 penautan rumah ibadah (plan: plans/plan-penautan-rumah-ibadah-id.md; keputusan D1-D3 disetujui user 2026-10-27):
//  * ubahRumahIbadah menyebar nama/alamat ke penerima + data_detail yang tertaut lewat ID (BUKAN lewat kecocokan nama), satu transaksi,
//    dengan riwayat + log, dan ditolak bila wilayah berubah / jumlah berbeda dari yang dikonfirmasi / bentrok indeks unik / kembar.
//  * hapusRumahIbadah ditolak bila masih dipakai; tambahRumahIbadah menolak nama+alamat kembar; hitungPemakaianRumahIbadah.
// Menjalankan kode server APA ADANYA (dibundel; tanpa Deno) dengan database tiruan; data KARANGAN.
// Jalankan: npm run uji:rumah-ibadah-id     (Node 24+)
import test from "node:test";
import assert from "node:assert/strict";
import { db, muatServer } from "./_harness-server.mjs";

const master = await muatServer("supabase/functions/api/domains/master.ts");

const SESI = {
  UTAMA: { akun_id: "a1", username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN" },
  KECAMATAN: { akun_id: "a2", username: "kec", role: "KECAMATAN", kecamatan: "MEDAN KOTA", user_id: "KECAMATAN MEDAN KOTA" },
};
const LAMA = { id: 5, jenis: "MASJID", kecamatan: "MEDAN KOTA", kelurahan: "PASAR BARU", nama: "MASJID LAMA", alamat: "JL LAMA" };
let st;
function atur(lebih = {}) {
  st = { sesi: SESI.UTAMA, lama: [LAMA], kembar: [], tertaut: [], bentrok: [], pemakaian: [], hapus: [{ id: 5, nama: "MASJID LAMA" }], info: [{ nama: "MASJID LAMA", dipakai: 0 }], ...lebih };
  db().panggilan.length = 0;
  db().handler = (q) => {
    const k = q.replace(/\s+/g, " ");
    if (k.includes("from sesi_login")) return [st.sesi];
    if (k.includes("from rumah_ibadah where id") && k.includes("for update")) return st.lama;
    if (k.includes("from rumah_ibadah") && k.includes("regexp_replace(nama") && k.includes("limit 1")) return st.kembar;
    if (k.includes("from penerima where tahun") && k.includes("rumah_ibadah_id =") && k.includes("order by id")) return st.tertaut;
    if (k.includes("select nama, layanan from penerima") && k.includes("is distinct from")) return st.bentrok;
    if (k.includes("group by layanan")) return st.pemakaian;
    if (k.includes("delete from rumah_ibadah")) return st.hapus;
    if (k.includes("as dipakai")) return st.info;
    if (k.includes("insert into rumah_ibadah")) return [{ id: 99 }];
    return [];
  };
}
const token = (() => { let n = 0; return () => "token-ri-" + (++n); })();
const sebut = (frag) => db().panggilan.filter((p) => p.teks.replace(/\s+/g, " ").includes(frag));
const menulis = () => db().panggilan.filter((p) => /^\s*(update|insert|delete)/i.test(p.teks.trim()) && !p.teks.includes("from sesi_login"));
const payload = (lebih = {}) => ({ id: 5, jenis: "MASJID", kecamatan: "MEDAN KOTA", kelurahan: "PASAR BARU", nama: "Masjid Baru", alamat: "Jl Baru", ...lebih });
const TERTAUT3 = [
  { id: 101, layanan: "IMAM MASJID", nama: "A" }, { id: 102, layanan: "KHATIB JUMAT", nama: "B" }, { id: 103, layanan: "NAZIR MASJID", nama: "C" },
];
const ubah = (p, jumlahDikonfirmasi) => master.ubahRumahIbadah(token(), jumlahDikonfirmasi === undefined ? p : { ...p, jumlahDikonfirmasi });

// ============================== akses ==============================
test("Hanya Admin Utama: ubah / hapus / hitung ditolak untuk peran lain, tanpa menulis", async () => {
  atur({ sesi: SESI.KECAMATAN });
  assert.equal((await ubah(payload())).sukses, false);
  assert.equal((await master.hapusRumahIbadah(token(), 5)).sukses, false);
  assert.equal((await master.hitungPemakaianRumahIbadah(token(), 5)).sukses, false);
  assert.equal(menulis().length, 0);
});

// ============================== ubah: tanpa penerima tertaut ==============================
test("Ubah nama/alamat tanpa penerima tertaut: hanya rumah_ibadah yang diubah (perilaku lama), pesan tanpa 'ikut diperbarui'", async () => {
  atur();
  const h = await ubah(payload());
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.doesNotMatch(h.pesan, /ikut diperbarui/);
  assert.equal(sebut("update rumah_ibadah").length, 1);
  assert.equal(sebut("update penerima").length, 0);
  assert.equal(sebut("update data_detail").length, 0);
  assert.equal(sebut("insert into log_perubahan_rumah_ibadah").length, 0);
});

test("Ubah hanya jenis (nama/alamat/wilayah sama): tidak menyentuh penerima sama sekali, bahkan tidak mencari penerima tertaut", async () => {
  atur();
  const h = await ubah(payload({ jenis: "MUSHOLLA", nama: "MASJID LAMA", alamat: "JL LAMA" }));
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.equal(sebut("rumah_ibadah_id =").length, 0);
  assert.equal(sebut("update penerima").length, 0);
});

test("Ubah rumah ibadah yang tidak ada: pesan jelas, tanpa menulis", async () => {
  atur({ lama: [] });
  const h = await ubah(payload());
  assert.equal(h.sukses, false);
  assert.match(h.pesan, /tidak ditemukan/);
  assert.equal(menulis().length, 0);
});

// ============================== ubah: menyebar lewat ID ==============================
test("Ubah nama+alamat dengan 3 penerima tertaut: penerima + data_detail diperbarui LEWAT ID rumah ibadah, riwayat sebelum update, log tercatat", async () => {
  atur({ tertaut: TERTAUT3 });
  const h = await ubah(payload(), 3);
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.match(h.pesan, /3 penerima yang tertaut ikut diperbarui/);
  assert.equal(h.jumlahPenerimaDiperbarui, 3);

  const upP = sebut("update penerima set");
  const upD = sebut("update data_detail set");
  assert.equal(upP.length, 1);
  assert.equal(upD.length, 1);
  for (const u of [upP[0], upD[0]]) {
    // kunci = rumah_ibadah_id (ID), BUKAN nama lama
    assert.match(u.teks.replace(/\s+/g, " "), /where tahun = \? and rumah_ibadah_id = \?/);
    assert.ok(u.nilai.includes("MASJID BARU") && u.nilai.includes("JL BARU") && u.nilai.includes(5));
    assert.ok(!u.nilai.includes("MASJID LAMA"), "update tidak boleh memakai nama lama sebagai kunci");
  }
  // riwayat dicatat SEBELUM update penerima
  const idxRiwayat = db().panggilan.findIndex((p) => p.teks.includes("insert into riwayat_edit"));
  const idxUpdate = db().panggilan.findIndex((p) => p.teks.replace(/\s+/g, " ").includes("update penerima set"));
  assert.ok(idxRiwayat >= 0 && idxRiwayat < idxUpdate, "riwayat harus lebih dulu dari update");
  assert.equal(sebut("insert into riwayat_edit").length, 2, "Tempat Tugas + Alamat Tugas");
  // log
  const log = sebut("insert into log_perubahan_rumah_ibadah");
  assert.equal(log.length, 1);
  assert.ok(log[0].nilai.includes("MASJID LAMA") && log[0].nilai.includes("MASJID BARU") && log[0].nilai.includes(3));
  assert.ok(log[0].nilai.some((x) => Array.isArray(x) && x.join(",") === "101,102,103"), "daftar id penerima tercatat");
  // rumah ibadah sendiri ikut diubah
  assert.equal(sebut("update rumah_ibadah").length, 1);
});

test("Ubah hanya ALAMAT: riwayat hanya 'Alamat Tugas'; hanya NAMA: riwayat hanya 'Tempat Tugas'", async () => {
  atur({ tertaut: TERTAUT3 });
  let h = await ubah(payload({ nama: "MASJID LAMA" }), 3);                 // alamat saja
  assert.equal(h.sukses, true, JSON.stringify(h));
  let r = sebut("insert into riwayat_edit");
  assert.equal(r.length, 1);
  assert.ok(r[0].teks.includes("'Alamat Tugas'") && !r[0].teks.includes("'Tempat Tugas'"));
  atur({ tertaut: TERTAUT3 });
  h = await ubah(payload({ alamat: "JL LAMA" }), 3);                       // nama saja
  assert.equal(h.sukses, true, JSON.stringify(h));
  r = sebut("insert into riwayat_edit");
  assert.equal(r.length, 1);
  assert.ok(r[0].teks.includes("'Tempat Tugas'") && !r[0].teks.includes("'Alamat Tugas'"));
});

test("D1: tanpa jumlahDikonfirmasi (klien lama / permintaan langsung) yang akan memperbarui penerima DITOLAK (perluKonfirmasi), TANPA menulis", async () => {
  for (const kirim of [undefined, null, "abc", NaN]) {
    atur({ tertaut: TERTAUT3 });
    const h = await ubah(payload(), kirim);
    assert.equal(h.sukses, false, String(kirim));
    assert.equal(h.perluKonfirmasi, true, String(kirim));
    assert.equal(h.jumlah, 3);
    assert.match(h.pesan, /perlu konfirmasi/);
    assert.equal(menulis().length, 0, String(kirim));
  }
});

test("D1: jumlahDikonfirmasi yang sama dengan jumlah sebenarnya diterima", async () => {
  atur({ tertaut: TERTAUT3 });
  assert.equal((await ubah(payload(), 3)).sukses, true);
});

test("Tanpa penerima tertaut, jumlahDikonfirmasi TIDAK diperlukan (rumah ibadah yang tidak dipakai bebas diubah)", async () => {
  atur();
  assert.equal((await ubah(payload())).sukses, true);
});

test("Pra-periksa bentrok: satu kueri per layanan berbatas (IMAM + NAZIR = 2; KHATIB JUMAT tidak diperiksa), tiap kueri mengikat layanannya", async () => {
  atur({ tertaut: TERTAUT3 });
  const h = await ubah(payload(), 3);
  assert.equal(h.sukses, true, JSON.stringify(h));
  const q = sebut("select nama, layanan from penerima");
  assert.equal(q.length, 2);
  const diikat = q.map((x) => x.nilai.find((v) => v === "IMAM MASJID" || v === "NAZIR MASJID" || v === "KHATIB JUMAT")).sort();
  assert.deepEqual(diikat, ["IMAM MASJID", "NAZIR MASJID"]);
});

test("Kabel UI: bila data pembanding tidak ada, dialog konfirmasi TIDAK dilewati (dianggap berubah)", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../../public/js/app-kelola-ibadah.js", import.meta.url), "utf8");
  assert.match(src, /var namaAlamatBerubah = !asli \|\|/);
  assert.match(src, /var wilayahBerubah = !!asli &&/);
});

test("Kabel UI: fallback server lama HANYA untuk galat 'Aksi tidak diizinkan: hitungPemakaianRumahIbadah' (bukan galat lain)", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../../public/js/app-kelola-ibadah.js", import.meta.url), "utf8");
  assert.match(src, /\^Aksi tidak diizinkan: hitungPemakaianRumahIbadah\/\.test\(err\.message\)/);
});

test("Jumlah penerima terdampak berbeda dari yang dikonfirmasi: ditolak, TANPA menulis", async () => {
  atur({ tertaut: TERTAUT3 });
  const h = await ubah(payload(), 2);
  assert.equal(h.sukses, false);
  assert.equal(h.jumlahBerubah, true);
  assert.match(h.pesan, /dari 2 menjadi 3/);
  assert.equal(menulis().length, 0);
});

// ============================== ubah: wilayah (D2) ==============================
test("D2: ubah kecamatan/kelurahan rumah ibadah yang masih dipakai penerima ditolak, TANPA menulis", async () => {
  atur({ tertaut: TERTAUT3 });
  for (const p of [{ kelurahan: "SEI RENGAS" }, { kecamatan: "MEDAN AREA", kelurahan: "SEI RENGAS" }]) {
    const h = await ubah(payload({ ...p, nama: "MASJID LAMA", alamat: "JL LAMA" }));
    assert.equal(h.sukses, false, JSON.stringify(p));
    assert.match(h.pesan, /tidak dapat diubah karena masih dipakai 3 penerima/);
  }
  assert.equal(menulis().length, 0);
});

test("D2: ubah wilayah rumah ibadah yang TIDAK dipakai penerima diperbolehkan", async () => {
  atur();
  const h = await ubah(payload({ kelurahan: "SEI RENGAS", nama: "MASJID LAMA", alamat: "JL LAMA" }));
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.equal(sebut("update rumah_ibadah").length, 1);
});

// ============================== ubah: bentrok & kembar ==============================
test("Bentrok indeks unik (penerima lain di layanan berbatas sudah memakai nama+alamat baru): ditolak sebelum menulis apa pun", async () => {
  atur({ tertaut: TERTAUT3, bentrok: [{ nama: "BUDI", layanan: "IMAM MASJID" }] });
  const h = await ubah(payload(), 3);
  assert.equal(h.sukses, false);
  assert.match(h.pesan, /sudah dipakai penerima BUDI untuk layanan IMAM MASJID/);
  assert.equal(menulis().length, 0);
  const q = sebut("select nama, layanan from penerima")[0];
  assert.ok(q, "pra-periksa bentrok harus berjalan");
});

test("Pra-periksa bentrok hanya untuk layanan berbatas (Khatib Jumat saja tertaut -> tidak diperiksa)", async () => {
  atur({ tertaut: [{ id: 102, layanan: "KHATIB JUMAT", nama: "B" }] });
  const h = await ubah(payload(), 1);
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.equal(sebut("select nama, layanan from penerima").length, 0);
});

test("Nama+alamat baru sama dengan rumah ibadah LAIN: ditolak (ubah dan tambah), TANPA menulis", async () => {
  atur({ tertaut: TERTAUT3, kembar: [{ id: 9, kecamatan: "MEDAN AREA", kelurahan: "SEI RENGAS" }] });
  let h = await ubah(payload(), 3);
  assert.equal(h.sukses, false);
  assert.match(h.pesan, /sudah ada pada rumah ibadah lain \(ID 9/);
  assert.equal(menulis().length, 0);
  atur({ kembar: [{ id: 9, kecamatan: "MEDAN AREA", kelurahan: "SEI RENGAS" }] });
  h = await master.tambahRumahIbadah(token(), { jenis: "MASJID", kecamatan: "MEDAN KOTA", kelurahan: "PASAR BARU", nama: "Masjid Baru", alamat: "Jl Baru" });
  assert.equal(h.sukses, false);
  assert.match(h.pesan, /sudah ada pada rumah ibadah lain/);
  assert.equal(sebut("insert into rumah_ibadah").length, 0);
});

test("Pemeriksaan kembar saat UBAH mengecualikan baris sendiri (id <> id yang diubah); saat TAMBAH tidak ada pengecualian", async () => {
  atur({ tertaut: TERTAUT3 });
  await ubah(payload(), 3);
  const kU = sebut("regexp_replace(nama").filter((p) => p.teks.includes("limit 1"));
  assert.equal(kU.length, 1);
  assert.match(kU[0].teks.replace(/\s+/g, " "), /and id <> \?/);
  assert.ok(kU[0].nilai.includes(5), "id yang diubah ikut diikat sebagai pengecualian");
  atur();
  await master.tambahRumahIbadah(token(), { jenis: "MASJID", kecamatan: "MEDAN KOTA", kelurahan: "PASAR BARU", nama: "Masjid Baru", alamat: "Jl Baru" });
  const kT = sebut("regexp_replace(nama").filter((p) => p.teks.includes("limit 1"));
  assert.equal(kT.length, 1);
  assert.doesNotMatch(kT[0].teks.replace(/\s+/g, " "), /id <>/);
});

test("Tambah rumah ibadah yang unik tetap berhasil (perilaku lama)", async () => {
  atur();
  const h = await master.tambahRumahIbadah(token(), { jenis: "MASJID", kecamatan: "MEDAN KOTA", kelurahan: "PASAR BARU", nama: "Masjid Baru", alamat: "Jl Baru" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.equal(h.id, 99);
});

// ============================== hapus (D3) ==============================
test("D3: hapus rumah ibadah yang masih dipakai ditolak dengan jumlah; hapus yang tidak dipakai berhasil; yang tidak ada -> pesan jelas", async () => {
  atur({ hapus: [], info: [{ nama: "MASJID LAMA", dipakai: 4 }] });
  let h = await master.hapusRumahIbadah(token(), 5);
  assert.equal(h.sukses, false);
  assert.match(h.pesan, /masih dipakai 4 penerima sehingga tidak dapat dihapus/);
  atur();
  h = await master.hapusRumahIbadah(token(), 5);
  assert.equal(h.sukses, true, JSON.stringify(h));
  atur({ hapus: [], info: [] });
  h = await master.hapusRumahIbadah(token(), 5);
  assert.equal(h.sukses, false);
  assert.match(h.pesan, /tidak ditemukan/);
});

test("D3: bila foreign key database menolak hapus (balapan: penerima baru saja tertaut) -> pesan ramah, bukan galat mentah", async () => {
  atur();
  const asli = db().handler;
  db().handler = (q, v) => {
    if (q.replace(/\s+/g, " ").includes("delete from rumah_ibadah")) throw new Error('update or delete on table "rumah_ibadah" violates foreign key constraint "fk_penerima_rumah_ibadah"');
    return asli(q, v);
  };
  const h = await master.hapusRumahIbadah(token(), 5);
  assert.equal(h.sukses, false);
  assert.match(h.pesan, /baru saja dipakai penerima/);
  assert.doesNotMatch(h.pesan, /violates/);
});

test("D3: DELETE dilakukan dalam SATU pernyataan dengan 'not exists' (tanpa celah antara cek dan hapus)", async () => {
  atur();
  await master.hapusRumahIbadah(token(), 5);
  const d = sebut("delete from rumah_ibadah");
  assert.equal(d.length, 1);
  assert.match(d[0].teks.replace(/\s+/g, " "), /not exists \(select 1 from penerima p where p\.rumah_ibadah_id = r\.id\)/);
});

// ============================== hitung pemakaian ==============================
test("hitungPemakaianRumahIbadah: jumlah total + per layanan untuk dialog konfirmasi", async () => {
  atur({ pemakaian: [{ layanan: "IMAM MASJID", n: 2 }, { layanan: "KHATIB JUMAT", n: 1 }] });
  const h = await master.hitungPemakaianRumahIbadah(token(), 5);
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.equal(h.jumlah, 3);
  assert.deepEqual(h.perLayanan, [{ layanan: "IMAM MASJID", jumlah: 2 }, { layanan: "KHATIB JUMAT", jumlah: 1 }]);
  assert.equal((await master.hitungPemakaianRumahIbadah(token(), 0)).sukses, false);
});
