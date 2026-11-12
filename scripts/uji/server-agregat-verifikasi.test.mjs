// Uji aksi server agregat verifikasi (cakupan per peran, baca-saja, tanpa data pribadi, Excel). Rencana: plans/plan-agregat-verifikator.md
// Menjalankan kode server APA ADANYA (dibundel; tanpa Deno) dengan database tiruan; data KARANGAN. Jalankan: npm run uji:agregat-server
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { db, muatServer } from "./_harness-server.mjs";
import { AKSI_VERIFIKATOR } from "../../supabase/functions/api/_shared/gerbangPeran.ts";

const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const agregat = await muatServer("supabase/functions/api/domains/agregatVerifikasi.ts");

const SESI = {
  UTAMA: { akun_id: "u1", username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN" },
  KOORD1: { akun_id: "a1", username: "verif_a1", role: "VERIFIKATOR", kecamatan: "", user_id: "" },
  ANGGOTA1: { akun_id: "a2", username: "verif_a2", role: "VERIFIKATOR", kecamatan: "", user_id: "" },
  KOORD2: { akun_id: "b1", username: "verif_b1", role: "VERIFIKATOR", kecamatan: "", user_id: "" },
  KEC: { akun_id: "k1", username: "kec_x", role: "KECAMATAN", kecamatan: "MEDAN KOTA", user_id: "KECAMATAN MEDAN KOTA" },
  GMM: { akun_id: "g1", username: "gmm_x", role: "GURU MAGHRIB MENGAJI", kecamatan: "", user_id: "" },
};
const AKUN = [
  { id: "a1", username: "verif_a1", nama_lengkap: "A SATU", aktif: true, tim: "I", koordinator: true },
  { id: "a2", username: "verif_a2", nama_lengkap: "A DUA", aktif: true, tim: "I", koordinator: false },
  { id: "b1", username: "verif_b1", nama_lengkap: "B SATU", aktif: true, tim: "II", koordinator: true },
  { id: "b2", username: "verif_b2", nama_lengkap: "B DUA", aktif: false, tim: "II", koordinator: false },
  { id: "n1", username: "verif_baru", nama_lengkap: "", aktif: true, tim: null, koordinator: false },
];
// Kejadian "pertama" yang dikembalikan basis data tiruan (waktu ISO UTC). 2026-11-09 Senin; 09.00 WIB = 02.00Z.
const KEJADIAN = [
  { oleh: "VERIF_A1", waktu: "2026-11-09T02:00:00Z", status_baru: "Memenuhi Syarat" },          // jam kerja
  { oleh: "VERIF_A1", waktu: "2026-11-09T09:30:00Z", status_baru: "Berkas Tidak Lengkap" },     // 16.30 WIB -> luar
  { oleh: "VERIF_A2", waktu: "2026-11-14T03:00:00Z", status_baru: "Tidak Memenuhi Syarat" },    // Sabtu -> luar
  { oleh: "VERIF_B1", waktu: "2026-11-10T03:00:00Z", status_baru: "Memenuhi Syarat" },
  { oleh: "VERIF_BARU", waktu: "2026-11-10T04:00:00Z", status_baru: "Memenuhi Syarat" },
];
let sesiAktif = SESI.UTAMA;
function pasang({ jam = [], libur = [], kejadian = KEJADIAN, admin = [] } = {}) {
  db().panggilan.length = 0;
  db().handler = (q, v) => {
    if (q.includes("from sesi_login")) return [sesiAktif];
    if (q.includes("from akun a left join tim_verifikator")) return AKUN;
    if (q.includes("from jam_kerja_verifikasi")) return jam;
    if (q.includes("from hari_libur_verifikasi")) return libur;
    if (q.includes("distinct on (penerima_id, oleh)")) return kejadian;
    if (q.includes("from riwayat_verifikasi") && q.includes("role = 'UTAMA'")) return admin;
    return [];
  };
}
const pakai = (p, opsi) => { sesiAktif = SESI[p]; pasang(opsi); };
const tok = (() => { let n = 0; return () => "t-" + (++n); })();
const RENT = ["2026-11-09", "2026-11-15"];
const ambil = (...a) => agregat.getAgregatVerifikasi(tok(), ...a);

test("CAKUPAN: verifikator biasa hanya dirinya; parameter tim dari browser tidak memperluas; kueri hanya memuat username dirinya", async () => {
  pakai("ANGGOTA1");
  const h = await ambil(...RENT, "II");
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.equal(h.cakupan, "SAYA");
  assert.deepEqual(h.perOrang.map((o) => o.username), ["verif_a2"]);
  assert.equal(h.perTim, undefined); assert.equal(h.luarTim, undefined);
  const kueri = db().panggilan.find((p) => p.teks.includes("distinct on"));
  assert.ok(kueri.nilai.includes('{"VERIF_A2"}'), "hanya username sendiri yang diminta dari riwayat (literal array teks): " + JSON.stringify(kueri.nilai));
});

test("CAKUPAN: koordinator melihat seluruh timnya; meminta tim lain tidak memperluas", async () => {
  pakai("KOORD1");
  for (const tim of [undefined, "", "II", "III", "-"]) {
    const h = await ambil(...RENT, tim);
    assert.equal(h.cakupan, "TIM");
    assert.deepEqual(h.perOrang.map((o) => o.username).sort(), ["verif_a1", "verif_a2"], "tim diminta: " + tim);
    const kueri = db().panggilan.find((p) => p.teks.includes("distinct on"));
    assert.ok(kueri.nilai.includes('{"VERIF_A1","VERIF_A2"}'), JSON.stringify(kueri.nilai));
  }
});

test("CAKUPAN: Admin Utama melihat semua tim, perTim, dan baris luarTim terpisah; saringan tim bekerja", async () => {
  pakai("UTAMA", { admin: [{ waktu: "2026-11-09T02:00:00Z" }, { waktu: "2026-11-15T13:00:00Z" }] });
  const h = await ambil(...RENT);
  assert.equal(h.cakupan, "SEMUA");
  assert.equal(h.perOrang.length, 5);
  assert.deepEqual(h.perTim.map((t) => [t.tim, t.total]).filter((t) => t[1] > 0), [["I", 3], ["II", 1], ["-", 1]]);
  assert.deepEqual(h.luarTim, { total: 2, jamKerja: 1, luarJamKerja: 1 });
  assert.deepEqual(h.ringkasan, { total: 5, jamKerja: 3, luarJamKerja: 2, memenuhiSyarat: 3, berkasTidakLengkap: 1, tidakMemenuhiSyarat: 1 });
  const t2 = await ambil(...RENT, "II");
  assert.deepEqual(t2.perOrang.map((o) => o.username).sort(), ["verif_b1", "verif_b2"]);
  assert.equal(t2.tim, "II");
  assert.deepEqual(t2.perTim.map((t) => [t.tim, t.total]).filter((t) => t[1] > 0), [["I", 3], ["II", 1], ["-", 1]], "kartu per tim tetap memuat semua tim saat disaring");
  assert.equal(t2.ringkasan.total, 1, "ringkasan hanya Tim II");
  const kueri = db().panggilan.filter((p) => p.teks.includes("distinct on")).pop();
  assert.ok(kueri.nilai.some((n) => typeof n === "string" && n.includes("VERIF_A1") && n.includes("VERIF_B1")), "riwayat semua verifikator dibaca untuk kartu per tim");
});

test("HAK: peran lain (Kecamatan, GMM) ditolak tanpa membaca riwayat", async () => {
  for (const p of ["KEC", "GMM"]) {
    pakai(p);
    const h = await ambil(...RENT);
    assert.equal(h.sukses, false, p);
    assert.match(h.pesan, /khusus Admin Utama dan Verifikator/);
    assert.equal(db().panggilan.filter((x) => x.teks.includes("riwayat_verifikasi")).length, 0, p);
  }
});

test("HITUNG: batas jam kerja (16.30 luar), Sabtu luar, tanggal merah luar; konfigurasi dari tabel dipakai; riwayat hanya SATU pertama", async () => {
  pakai("ANGGOTA1", { kejadian: [{ oleh: "VERIF_A2", waktu: "2026-11-10T03:00:00Z", status_baru: "Memenuhi Syarat" }], libur: [{ tanggal: "2026-11-10" }] });
  const h = await ambil(...RENT);
  assert.equal(h.ringkasan.luarJamKerja, 1, "Selasa 10 Nov ditandai tanggal merah -> luar jam kerja");
  assert.equal(h.perHari.find((x) => x.tanggal === "2026-11-10").libur, true);
  const kueri = db().panggilan.find((p) => p.teks.includes("distinct on"));
  assert.ok(kueri.teks.includes("sumber = 'SATU'") && kueri.teks.includes("'Proses Verifikasi'"), "hanya pemberian hasil pertama (SATU, status lama Proses Verifikasi)");
  assert.ok(!kueri.teks.includes("DIPERBAIKI") && !kueri.teks.includes("MASSAL"), "perbaikan/massal tidak dihitung");
  pakai("ANGGOTA1", { kejadian: [{ oleh: "VERIF_A2", waktu: "2026-11-10T03:00:00Z", status_baru: "Memenuhi Syarat" }], jam: [{ isodow: 2, mulai: "13:00:00", selesai: "14:00:00" }] });
  const h2 = await ambil(...RENT);
  assert.equal(h2.ringkasan.luarJamKerja, 1, "10.00 WIB di luar jam kerja kustom 13-14");
});

test("RENTANG: tidak valid / terlalu panjang ditolak sebelum membaca riwayat; bawaan = bulan ini", async () => {
  pakai("UTAMA");
  for (const [d, s] of [["2026-13-01", "2026-13-02"], ["2026-11-12", "2026-11-01"], ["2026-01-01", "2026-12-31"], [5, 6]]) {
    const h = await ambil(d, s);
    assert.equal(h.sukses, false, JSON.stringify([d, s]));
  }
  assert.equal(db().panggilan.filter((x) => x.teks.includes("riwayat_verifikasi")).length, 0);
  const b = await ambil();
  assert.equal(b.sukses, true);
  assert.match(b.rentang.dari, /^\d{4}-\d{2}-01$/);
});

test("PRIVASI: hasil hanya angka/tanggal/identitas verifikator; tidak ada data penerima; aksi hanya MEMBACA", async () => {
  pakai("UTAMA");
  const h = await ambil(...RENT);
  const teks = JSON.stringify(h).toLowerCase();
  for (const kata of ["nik", "alamat", "nama_rekening", "penerima_id", "no_kontak", "password"]) assert.ok(!teks.includes(kata), "tidak boleh memuat: " + kata);
  assert.equal(db().panggilan.filter((p) => /^\s*(insert|update|delete)/i.test(p.teks)).length, 0, "tidak menulis");
  const src = baca("supabase/functions/api/domains/agregatVerifikasi.ts");
  assert.doesNotMatch(src.replace(/\/\/[^\n]*/g, ""), /\b(insert\s+into|update\s+\w+\s+set|delete\s+from)\b/i);
});

test("LITERAL ARRAY: username dikirim sebagai SATU literal teks yang aman (kutip/backslash di-escape; larik kosong tidak menghasilkan teks kosong)", () => {
  assert.equal(agregat.literalArrayTeks(["A", "B_C"]), '{"A","B_C"}');
  assert.equal(agregat.literalArrayTeks([]), "{}");
  assert.equal(agregat.literalArrayTeks(['A"B', "C\\D"]), '{"A\\"B","C\\\\D"}');
});

test("HAK: peran lain ditolak SEBELUM membaca basis data apa pun (bahkan daftar akun)", async () => {
  for (const p of ["KEC", "GMM"]) {
    pakai(p);
    await ambil(...RENT);
    assert.equal(db().panggilan.filter((x) => !x.teks.includes("from sesi_login")).length, 0, p + ": hanya pemeriksaan sesi yang boleh");
  }
});

test("GERBANG: kedua aksi ada di daftar-putih Verifikator dan di ALLOWED", () => {
  for (const a of ["getAgregatVerifikasi", "unduhRekapLemburVerifikasi"]) {
    assert.equal(AKSI_VERIFIKATOR.has(a), true, a);
    assert.match(baca("supabase/functions/api/index.ts"), new RegExp("^\\s*" + a + ",$", "m"), a);
  }
});

// ------------------------------------------------------------------ Excel (pembuat buku diuji dengan ExcelJS tiruan; berkas nyata diperiksa terpisah)
function excelTiruan() {
  const lembar = [];
  class Row { constructor() { this.font = null; } }
  class WS {
    constructor(nama) { this.nama = nama; this.baris = []; this.kolom = {}; this.views = null; lembar.push(this); }
    addRow(a) { this.baris.push(a); return new Row(); }
    getRow() { return new Row(); }
    getCell() { return { }; }
    getColumn(i) { this.kolom[i] = this.kolom[i] || {}; return this.kolom[i]; }
  }
  class WB { addWorksheet(n) { return new WS(n); } }
  return { Workbook: WB, lembar };
}

test("EXCEL: Rekap diurutkan per TIM (I, II, III, IV, tanpa tim) dengan KOORDINATOR di paling atas tiap tim; subtotal per tim (Admin Utama) dan TOTAL benar", async () => {
  const o = (username, tim, koordinator, kerja, luar) => ({ username, namaLengkap: username === "verif_zz_anonim" ? "" : username.toUpperCase(), tim, koordinator, aktif: true, total: kerja + luar, jamKerja: kerja, luarJamKerja: luar, memenuhiSyarat: kerja + luar, berkasTidakLengkap: 0, tidakMemenuhiSyarat: 0 });
  // Sengaja ACAK (menurun menurut total seperti hasil agregat). Koordinator BUKAN yang pertama menurut abjad (Tim I = a3, Tim II = b2, Tim IV = d2), Tim III tanpa koordinator,
  // dan Tim IV punya koordinator sedangkan Tim III tidak: urutan tim tidak boleh bergantung pada keberadaan koordinator.
  const perOrang = [
    o("verif_d2", "IV", true, 9, 1), o("verif_b3", "II", false, 8, 2), o("verif_a2", "I", false, 7, 3), o("verif_zz_anonim", null, false, 4, 1),
    o("verif_c1", "III", false, 3, 3), o("verif_b1", "II", false, 2, 2), o("verif_a1", "I", false, 1, 1), o("verif_d1", "IV", false, 1, 0), o("verif_b2", "II", true, 1, 1), o("verif_a3", "I", true, 0, 2),
  ];
  const ex = excelTiruan();
  const total = perOrang.reduce((s, x) => s + x.total, 0), kerja = perOrang.reduce((s, x) => s + x.jamKerja, 0), luar = perOrang.reduce((s, x) => s + x.luarJamKerja, 0);
  const hasil = {
    cakupan: "SEMUA", timFokus: null, rentang: { dari: "2026-11-09", sampai: "2026-11-15", jumlahHari: 7 }, saya: "ADMIN",
    hasil: {
      ringkasan: { total, jamKerja: kerja, luarJamKerja: luar, memenuhiSyarat: total, berkasTidakLengkap: 0, tidakMemenuhiSyarat: 0 }, perOrang,
      perHari: [{ tanggal: "2026-11-09", hari: "Senin", libur: false, total: 1, jamKerja: 1, luarJamKerja: 0 }, { tanggal: "2026-11-14", hari: "Sabtu", libur: true, total: 1, jamKerja: 0, luarJamKerja: 1 }],
      perOrangHari: [
        { username: "verif_d2", tanggal: "2026-11-10", jamKerja: 1, luarJamKerja: 0 }, { username: "verif_a2", tanggal: "2026-11-14", jamKerja: 0, luarJamKerja: 1 },
        { username: "verif_a1", tanggal: "2026-11-12", jamKerja: 1, luarJamKerja: 0 }, { username: "verif_a2", tanggal: "2026-11-09", jamKerja: 1, luarJamKerja: 0 },
        { username: "verif_zz_anonim", tanggal: "2026-11-09", jamKerja: 0, luarJamKerja: 1 }, { username: "verif_c1", tanggal: "2026-11-09", jamKerja: 1, luarJamKerja: 0 },
      ],
      luarTim: { total: 5, jamKerja: 3, luarJamKerja: 2 },
    },
  };
  agregat.susunBukuRekap(ex, hasil, "ADMIN");
  assert.deepEqual(ex.lembar.map((l) => l.nama), ["Rekap", "Per Hari", "Aturan"]);
  const rekap = ex.lembar[0].baris;
  assert.equal(rekap[0][0], "Rekap Hasil Kerja Verifikator - Agregat Semua Tim");
  assert.deepEqual(rekap[4].slice(0, 5), ["No", "Tim", "Username", "Nama Lengkap", "Peran"]);
  assert.equal(rekap[4][6], "Luar Jam Kerja (Lembur)");
  const isi = rekap.slice(5);
  const orang = isi.filter((r) => typeof r[0] === "number");
  assert.deepEqual(orang.map((r) => [r[1], r[2]]), [
    ["Tim I", "verif_a3"], ["Tim I", "verif_a1"], ["Tim I", "verif_a2"],
    ["Tim II", "verif_b2"], ["Tim II", "verif_b1"], ["Tim II", "verif_b3"],
    ["Tim III", "verif_c1"], ["Tim IV", "verif_d2"], ["Tim IV", "verif_d1"], ["Tanpa tim", "verif_zz_anonim"],
  ], "urutan: tim, koordinator dulu, lalu username");
  assert.deepEqual(orang.map((r) => r[4]), ["Koordinator", "Anggota", "Anggota", "Koordinator", "Anggota", "Anggota", "Anggota", "Koordinator", "Anggota", "Anggota"]);
  assert.deepEqual(orang.map((r) => r[0]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "nomor urut berurutan tanpa terpengaruh subtotal");
  assert.equal(orang.find((r) => r[2] === "verif_zz_anonim")[3], "(belum mengisi profil)");
  // koordinator selalu baris pertama di grup timnya (baris tepat sesudah subtotal tim sebelumnya / header)
  const idxKoord = isi.map((r, k) => [r, k]).filter(([r]) => r[4] === "Koordinator").map(([, k]) => k);
  for (const k of idxKoord) assert.ok(k === 0 || String(isi[k - 1][1]).startsWith("Subtotal"), "koordinator di paling atas grup: baris " + k);
  // subtotal per tim
  const sub = isi.filter((r) => String(r[1]).startsWith("Subtotal"));
  assert.deepEqual(sub.map((r) => [r[1], r[5], r[6], r[7]]), [["Subtotal Tim I", 8, 6, 14], ["Subtotal Tim II", 11, 5, 16], ["Subtotal Tim III", 3, 3, 6], ["Subtotal Tim IV", 10, 1, 11], ["Subtotal Tanpa tim", 4, 1, 5]]);
  const baris_total = isi.find((r) => r[1] === "TOTAL");
  assert.deepEqual([baris_total[5], baris_total[6], baris_total[7]], [kerja, luar, total]);
  assert.equal(orang.reduce((s, r) => s + r[7], 0), total, "jumlah per orang = total");
  assert.equal(sub.reduce((s, r) => s + r[7], 0), total, "jumlah subtotal = total");
  assert.ok(rekap.some((r) => String(r[0]).includes("pekerjaan Admin Utama") && String(r[0]).includes("= 5")), "informasi Admin Utama di luar total");
  // Sheet Per Hari: tim -> koordinator -> username -> tanggal
  const hari = ex.lembar[1].baris.slice(4);
  assert.deepEqual(hari.map((r) => [r[0], r[1], r[3]]), [
    ["Tim I", "verif_a1", "2026-11-12"], ["Tim I", "verif_a2", "2026-11-09"], ["Tim I", "verif_a2", "2026-11-14"],
    ["Tim III", "verif_c1", "2026-11-09"], ["Tim IV", "verif_d2", "2026-11-10"], ["Tanpa tim", "verif_zz_anonim", "2026-11-09"],
  ]);
  assert.equal(hari[2][5], "Sabtu/Minggu/tanggal merah (seharian luar jam kerja)");
});

test("EXCEL: cakupan TIM/SAYA tanpa subtotal; urutan tetap koordinator dulu", async () => {
  const o = (username, koordinator, total) => ({ username, namaLengkap: username, tim: "II", koordinator, aktif: true, total, jamKerja: total, luarJamKerja: 0, memenuhiSyarat: total, berkasTidakLengkap: 0, tidakMemenuhiSyarat: 0 });
  const ex = excelTiruan();
  agregat.susunBukuRekap(ex, { cakupan: "TIM", timFokus: "II", rentang: { dari: "2026-11-09", sampai: "2026-11-09", jumlahHari: 1 }, saya: "X",
    hasil: { ringkasan: { total: 6, jamKerja: 6, luarJamKerja: 0, memenuhiSyarat: 6, berkasTidakLengkap: 0, tidakMemenuhiSyarat: 0 }, perOrang: [o("verif_b3", false, 3), o("verif_b2", false, 2), o("verif_b1", true, 1)], perHari: [] } }, "X");
  const isi = ex.lembar[0].baris.slice(5);
  assert.deepEqual(isi.filter((r) => typeof r[0] === "number").map((r) => r[2]), ["verif_b1", "verif_b2", "verif_b3"]);
  assert.ok(!isi.some((r) => String(r[1]).startsWith("Subtotal")), "tanpa subtotal untuk cakupan TIM");
  assert.equal(ex.lembar[0].baris[0][0], "Rekap Hasil Kerja Verifikator - Hasil Tim II");
});

test("EXCEL: unduhRekapLemburVerifikasi mengikuti aturan hak yang sama (peran lain ditolak sebelum membangun berkas)", async () => {
  pakai("KEC");
  const h = await agregat.unduhRekapLemburVerifikasi(tok(), ...RENT);
  assert.equal(h.sukses, false);
  assert.match(h.pesan, /khusus Admin Utama dan Verifikator/);
  pakai("UTAMA");
  const g = await agregat.unduhRekapLemburVerifikasi(tok(), "2026-13-01", "2026-13-02");
  assert.equal(g.sukses, false, "rentang tak valid ditolak");
});
