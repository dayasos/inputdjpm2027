// Uji F2 "Cek Rumah Ibadah" (plan: plans/plan-cari-rumah-ibadah-pengurus.md; keputusan K1/K2/K5 user 2026-10-28):
//  * cariRumahIbadahPengurus HANYA untuk Admin Utama -- peran lain ditolak tanpa menjalankan kueri data apa pun.
//  * Hanya membaca; tidak mengambil NIK/No.HP/rekening; semua nilai pengguna lewat parameter ($n), bukan teks SQL.
//  * Filter jenis/kecamatan/kelurahan/status/cari + paginasi + ringkasan Sudah/Belum.
// Menjalankan kode server APA ADANYA (dibundel; tanpa Deno) dengan database tiruan; data KARANGAN.
// Jalankan: npm run uji:cek-rumah-ibadah     (Node 24+)
import test from "node:test";
import assert from "node:assert/strict";
import { db, muatServer } from "./_harness-server.mjs";

const master = await muatServer("supabase/functions/api/domains/master.ts");

const SESI = {
  UTAMA: { akun_id: "a1", username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN" },
  KECAMATAN: { akun_id: "a2", username: "kec", role: "KECAMATAN", kecamatan: "MEDAN KOTA", user_id: "KECAMATAN MEDAN KOTA" },
  KELURAHAN: { akun_id: "a3", username: "kel", role: "KECAMATAN", kecamatan: "MEDAN KOTA", user_id: "KELURAHAN PASAR BARU" },
  KEMENAG: { akun_id: "a4", username: "kem", role: "IMAM MASJID", kecamatan: "", user_id: "IMAM MASJID" },
  MUI: { akun_id: "a5", username: "mui", role: "MUI", kecamatan: "", user_id: "MUI" },
  KATOLIK: { akun_id: "a6", username: "kat", role: "PETUGAS GEREJA KATOLIK", kecamatan: "", user_id: "BIMAS KATOLIK" },
};
const RUMAH = [
  { id: 1, jenis: "MASJID", kecamatan: "MEDAN KOTA", kelurahan: "PASAR BARU", nama: "MASJID AL-IKHLAS", alamat: "JL MELATI 2" },
  { id: 2, jenis: "GEREJA", kecamatan: "MEDAN KOTA", kelurahan: "PASAR BARU", nama: "GEREJA HKBP", alamat: "JL MAWAR 1" },
];
const PENGURUS = [
  { id: 11, rumah_ibadah_id: 1, nama: "BUDI", layanan: "IMAM MASJID", status_verifikasi: "Memenuhi Syarat" },
  { id: 12, rumah_ibadah_id: 1, nama: "SITI", layanan: "NAZIR MASJID", status_verifikasi: null },
];
let st;
function atur(lebih = {}) {
  st = { sesi: SESI.UTAMA, ring: { total: 2, ada: 1 }, rumah: RUMAH, pengurus: PENGURUS, ...lebih };
  db().panggilan.length = 0;
  db().handler = (q) => {
    const k = q.replace(/\s+/g, " ");
    if (k.includes("from sesi_login")) return st.sesi ? [st.sesi] : [];
    if (k.includes("count(*)::int as total")) return [st.ring];
    if (k.includes("from rumah_ibadah r where")) return st.rumah;
    if (k.includes("from penerima") && k.includes("rumah_ibadah_id = any")) return st.pengurus;
    return [];
  };
}
const token = (() => { let n = 0; return () => "token-cek-" + (++n); })();
const unsafe = () => db().panggilan.filter((p) => p.teks.startsWith("UNSAFE "));
const kueriData = () => db().panggilan.filter((p) => !p.teks.includes("from sesi_login"));
const teks = (p) => p.teks.replace(/\s+/g, " ");

// ============================== akses (K2: khusus Utama) ==============================
test("Hanya Admin Utama: KECAMATAN, akun kelurahan, KEMENAG, MUI, BIMAS ditolak, tanpa kueri data", async () => {
  for (const [nama, sesi] of Object.entries(SESI)) {
    if (nama === "UTAMA") continue;
    atur({ sesi });
    const h = await master.cariRumahIbadahPengurus(token(), {});
    assert.equal(h.sukses, false, nama);
    assert.match(h.pesan, /Admin Utama/, nama);
    assert.equal(kueriData().length, 0, nama + ": tidak boleh ada kueri data");
  }
});

test("Token tidak sah ditolak", async () => {
  atur({ sesi: null });
  const h = await master.cariRumahIbadahPengurus("token-ngawur", {});
  assert.equal(h.sukses, false);
  assert.equal(kueriData().length, 0);
});

// ============================== hasil ==============================
test("Utama: ringkasan Sudah/Belum + daftar + pengurus per rumah ibadah", async () => {
  atur();
  const h = await master.cariRumahIbadahPengurus(token(), {});
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.deepEqual(h.ringkasan, { total: 2, ada: 1, belum: 1 });
  assert.equal(h.total, 2);
  assert.equal(h.daftar.length, 2);
  const [a, b] = h.daftar;
  assert.equal(a.jumlahPengurus, 2);
  assert.deepEqual(a.pengurus.map((x) => x.layanan), ["IMAM MASJID", "NAZIR MASJID"]);
  assert.equal(a.pengurus[1].statusVerifikasi, "Proses Verifikasi"); // null -> bawaan
  assert.equal(b.jumlahPengurus, 0);
  assert.deepEqual(b.pengurus, []);
});

test("Data pribadi: kueri tidak pernah menyebut nik / no_kontak / rekening; hasil tanpa kolom itu", async () => {
  atur();
  const h = await master.cariRumahIbadahPengurus(token(), { cari: "budi" });
  for (const p of kueriData()) assert.doesNotMatch(teks(p), /\b(nik|no_kontak|nomor_rekening|nama_rekening|tanggal_lahir)\b/, teks(p));
  assert.doesNotMatch(JSON.stringify(h), /nik|noKontak|rekening/i);
});

test("Hanya membaca: tidak ada insert/update/delete", async () => {
  atur();
  await master.cariRumahIbadahPengurus(token(), { cari: "x", jenis: "MASJID", status: "BELUM" });
  assert.equal(kueriData().filter((p) => /^\s*(UNSAFE\s+)?(insert|update|delete)\b/i.test(p.teks)).length, 0);
});

// ============================== filter ==============================
test("Cari per kata: pola ILIKE per kata + juga mencocokkan nama/layanan pengurus (cari dari sisi orang)", async () => {
  atur();
  await master.cariRumahIbadahPengurus(token(), { cari: "  ikhlas   masjid " });
  const u = unsafe();
  assert.equal(u.length, 2, "ringkasan + halaman");
  for (const p of u) {
    // Daftar pola dikirim sebagai SATU string literal array Postgres (di-cast ::text[] di SQL), bukan JS array.
    assert.equal(p.nilai[0], '{"%IKHLAS%","%MASJID%"}', JSON.stringify(p.nilai));
    const k = teks(p);
    assert.match(k, /concat_ws\(' ', r\.nama, r\.alamat, r\.kelurahan, r\.kecamatan\) ilike all\(\$\d+::text\[\]\)/);
    assert.match(k, /concat_ws\(' ', pc\.nama, pc\.layanan\) ilike all\(\$\d+::text\[\]\)/);
  }
});

test("Karakter khusus di kata kunci di-escape dan tidak pernah masuk teks SQL (anti-injeksi)", async () => {
  atur();
  await master.cariRumahIbadahPengurus(token(), { cari: "a%b_c'; drop table penerima;--", kecamatan: "x' or '1'='1", kelurahan: "y'--" });
  for (const p of unsafe()) {
    assert.doesNotMatch(p.teks, /drop table|or '1'='1|y'--/i);
    const pola = p.nilai.find((n) => typeof n === "string" && n.startsWith("{"));
    assert.ok(pola, "pola cari ada di parameter");
    // Kata pertama: % dan _ di-escape untuk ILIKE (\%, \_), lalu setiap \ digandakan di dalam literal array ("\\%").
    assert.ok(pola.startsWith("{\"%A\\\\%B\\\\_C';%\","), pola);
    assert.equal(p.nilai.filter((n) => Array.isArray(n)).length, 0, "tidak ada JS array sebagai parameter");
  }
});

test("Jenis: gabungan (MASJID_MUSHOLLA, GEREJA_ALL) jadi daftar parameter; jenis ngawur ditolak", async () => {
  atur();
  await master.cariRumahIbadahPengurus(token(), { jenis: "MASJID_MUSHOLLA" });
  assert.deepEqual(unsafe()[0].nilai, ['{"MASJID","MUSHOLLA","MUSHOLA"}']);
  atur();
  await master.cariRumahIbadahPengurus(token(), { jenis: "GEREJA_ALL" });
  assert.deepEqual(unsafe()[0].nilai, ['{"GEREJA","GEREJA_KATOLIK"}']);
  atur();
  await master.cariRumahIbadahPengurus(token(), { jenis: "KUIL" });
  assert.deepEqual(unsafe()[0].nilai, ['{"KUIL"}']);
  atur();
  const h = await master.cariRumahIbadahPengurus(token(), { jenis: "BUKAN_JENIS" });
  assert.equal(h.sukses, false);
  assert.equal(kueriData().length, 0);
});

test("Kecamatan & kelurahan: dibandingkan upper() sebagai parameter", async () => {
  atur();
  await master.cariRumahIbadahPengurus(token(), { kecamatan: "medan kota", kelurahan: "pasar baru" });
  const k = teks(unsafe()[0]);
  assert.match(k, /upper\(r\.kecamatan\) = \$\d+/);
  assert.match(k, /upper\(r\.kelurahan\) = \$\d+/);
  assert.deepEqual(unsafe()[0].nilai, ["MEDAN KOTA", "PASAR BARU"]);
});

test("Status BELUM: halaman memakai 'not exists', total = jumlah belum; ADA memakai 'exists'; ringkasan tanpa filter status", async () => {
  atur({ ring: { total: 10, ada: 4 } });
  const h = await master.cariRumahIbadahPengurus(token(), { status: "BELUM", limit: 5 });
  assert.equal(h.total, 6);
  assert.equal(h.totalHalaman, 2);
  assert.deepEqual(h.ringkasan, { total: 10, ada: 4, belum: 6 });
  const [ring, hal] = unsafe();
  assert.doesNotMatch(teks(ring), /and not exists/);
  assert.match(teks(hal), /and not exists \(select 1 from penerima pe where pe\.tahun = \d+ and pe\.rumah_ibadah_id = r\.id\)/);

  atur({ ring: { total: 10, ada: 4 } });
  const a = await master.cariRumahIbadahPengurus(token(), { status: "ADA" });
  assert.equal(a.total, 4);
  assert.doesNotMatch(teks(unsafe()[1]), /not exists/);
  assert.match(teks(unsafe()[1]), /and exists \(select 1 from penerima pe/);

  atur();
  const s = await master.cariRumahIbadahPengurus(token(), { status: "MUNGKIN" });
  assert.equal(s.sukses, false);
});

test("Paginasi: limit dibatasi 5..100, offset dari halaman; urutan stabil; hanya tahun aktif", async () => {
  atur();
  await master.cariRumahIbadahPengurus(token(), { page: 3, limit: 1000 });
  const hal = unsafe()[1];
  assert.deepEqual(hal.nilai.slice(-2), [100, 200]);
  assert.match(teks(hal), /order by r\.kecamatan, r\.kelurahan, r\.nama, r\.id limit \$\d+ offset \$\d+/);
  assert.match(teks(unsafe()[0]), /pe\.tahun = \d{4}/);
  atur();
  await master.cariRumahIbadahPengurus(token(), { page: -4, limit: 1 });
  assert.deepEqual(unsafe()[1].nilai.slice(-2), [5, 0]);
  atur();
  await master.cariRumahIbadahPengurus(token(), { page: Infinity, limit: "abc" });
  assert.deepEqual(unsafe()[1].nilai.slice(-2), [25, 99999 * 25], "halaman dibatasi, limit ngawur -> 25");
  atur();
  await master.cariRumahIbadahPengurus(token(), { page: "x" });
  assert.deepEqual(unsafe()[1].nilai.slice(-2), [25, 0]);
});

test("Tanpa hasil: tidak mengambil pengurus (tidak ada kueri tambahan)", async () => {
  atur({ rumah: [], ring: { total: 0, ada: 0 } });
  const h = await master.cariRumahIbadahPengurus(token(), { cari: "tidak ada" });
  assert.equal(h.sukses, true);
  assert.equal(h.daftar.length, 0);
  assert.equal(h.totalHalaman, 1);
  assert.equal(kueriData().filter((p) => p.teks.includes("rumah_ibadah_id = any")).length, 0);
});

test("Beban DB: tepat 3 kueri per panggilan (ringkasan, halaman, pengurus halaman)", async () => {
  atur();
  await master.cariRumahIbadahPengurus(token(), { cari: "a", jenis: "MASJID", kecamatan: "B", status: "ADA" });
  assert.equal(kueriData().length, 3);
});

test("Galat database dibungkus menjadi pesan, tidak melempar", async () => {
  atur();
  db().handler = (q) => { if (q.includes("from sesi_login")) return [SESI.UTAMA]; throw new Error("koneksi putus"); };
  const h = await master.cariRumahIbadahPengurus(token(), {});
  assert.equal(h.sukses, false);
  assert.match(h.pesan, /koneksi putus/);
});
