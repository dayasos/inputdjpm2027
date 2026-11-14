// Uji aksi server agregat verifikasi (cakupan per peran, baca-saja, tanpa data pribadi, Excel). Rencana: plans/plan-agregat-verifikator.md
// Menjalankan kode server APA ADANYA (dibundel; tanpa Deno) dengan database tiruan; data KARANGAN. Jalankan: npm run uji:agregat-server
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
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
  { oleh: "VERIF_A1", waktu: "2026-11-09T02:00:00Z", status_baru: "Memenuhi Syarat", status_sekarang: "Memenuhi Syarat" },          // jam kerja
  { oleh: "VERIF_A1", waktu: "2026-11-09T09:30:00Z", status_baru: "Berkas Tidak Lengkap", status_sekarang: "Tidak Memenuhi Syarat" },     // 16.30 WIB -> luar; dikoreksi Admin
  { oleh: "VERIF_A2", waktu: "2026-11-14T03:00:00Z", status_baru: "Tidak Memenuhi Syarat", status_sekarang: "Tidak Memenuhi Syarat" },    // Sabtu -> luar
  { oleh: "VERIF_B1", waktu: "2026-11-10T03:00:00Z", status_baru: "Memenuhi Syarat", status_sekarang: "Memenuhi Syarat" },
  { oleh: "VERIF_BARU", waktu: "2026-11-10T04:00:00Z", status_baru: "Memenuhi Syarat", status_sekarang: "Berkas Tidak Lengkap" },  // dikoreksi Admin
];
let sesiAktif = SESI.UTAMA;
function pasang({ jam = [], libur = [], kejadian = KEJADIAN, admin = [] } = {}) {
  db().panggilan.length = 0;
  db().handler = (q, v) => {
    if (q.includes("from sesi_login")) return [sesiAktif];
    if (q.includes("from akun a left join tim_verifikator")) return AKUN;
    if (q.includes("from jam_kerja_verifikasi")) return jam;
    if (q.includes("from hari_libur_verifikasi")) return libur;
    if (q.includes("distinct on (r.penerima_id, r.oleh)")) return kejadian;
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
  assert.deepEqual(h.ringkasan, { total: 5, jamKerja: 3, luarJamKerja: 2, memenuhiSyarat: 3, berkasTidakLengkap: 1, tidakMemenuhiSyarat: 1, sekarangMemenuhiSyarat: 2, sekarangBerkasTidakLengkap: 1, sekarangTidakMemenuhiSyarat: 2, sekarangLainnya: 0, dikoreksi: 2 });
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
  perOrang.find((x) => x.username === "verif_a2").dikoreksi = 2; perOrang.find((x) => x.username === "verif_d2").dikoreksi = 1; perOrang.find((x) => x.username === "verif_a1").dikoreksi = 1;
  const ex = excelTiruan();
  const total = perOrang.reduce((s, x) => s + x.total, 0), kerja = perOrang.reduce((s, x) => s + x.jamKerja, 0), luar = perOrang.reduce((s, x) => s + x.luarJamKerja, 0);
  const hasil = {
    cakupan: "SEMUA", timFokus: null, rentang: { dari: "2026-11-09", sampai: "2026-11-15", jumlahHari: 7 }, saya: "ADMIN",
    hasil: {
      ringkasan: { total, jamKerja: kerja, luarJamKerja: luar, memenuhiSyarat: total, berkasTidakLengkap: 0, tidakMemenuhiSyarat: 0, dikoreksi: 4 }, perOrang,
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
  assert.equal(rekap[4][6], "Pertama: Luar Jam Kerja");
  assert.equal(rekap[4][14], "TOTAL PEKERJAAN: Luar Jam Kerja (Lembur)");
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
  assert.equal(rekap[4][19], "Dikoreksi (informasi, per tanggal unduh)");
  assert.deepEqual(sub.map((r) => r[19]), [3, 0, 0, 1, 0], "subtotal dikoreksi per tim (Tim I a1+a2=3, Tim IV d2=1)");
  assert.equal(baris_total[19], 4, "total dikoreksi");
  assert.equal(orang.find((r) => r[2] === "verif_a2")[19], 2);
  assert.equal(orang.find((r) => r[2] === "verif_b3")[19], 0, "tanpa nilai -> 0 (bukan kosong)");
  assert.ok(ex.lembar[2].baris.some((r) => /Dikoreksi/.test(String(r[0])) && /tidak memengaruhi angka lembur/.test(String(r[0]))), "penjelasan di sheet Aturan");
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

test("EXCEL (T6): kolom Pemeriksaan ulang dan TOTAL PEKERJAAN = pertama + ulang di setiap baris, subtotal, TOTAL, dan sheet Per Hari", async () => {
  const o = (username, tim, k, koord, kerja, luar) => ({ username, namaLengkap: username.toUpperCase(), tim, koordinator: koord, aktif: true, total: kerja + luar, jamKerja: kerja, luarJamKerja: luar, memenuhiSyarat: kerja + luar, berkasTidakLengkap: 0, tidakMemenuhiSyarat: 0, dikoreksi: 0 });
  const perOrang = [o("verif_a1", "I", 0, true, 3, 1), o("verif_a2", "I", 0, false, 2, 0), o("verif_b1", "II", 0, true, 1, 1)];
  const u = (username, jam, luar, sesuai, dik, sisa) => ({ username, total: jam + luar, jamKerja: jam, luarJamKerja: luar, sesuai, dikoreksi: dik, sisa });
  const ulangOrang = [u("verif_a1", 2, 1, 2, 1, 5), u("verif_a2", 0, 3, 3, 0, 0), u("verif_b1", 1, 0, 0, 1, 2)];
  const ex = excelTiruan();
  agregat.susunBukuRekap(ex, {
    cakupan: "SEMUA", timFokus: null, rentang: { dari: "2026-11-09", sampai: "2026-11-10", jumlahHari: 2 }, saya: "ADMIN", ulangTersedia: true,
    hasil: { ringkasan: { total: 8, jamKerja: 6, luarJamKerja: 2, memenuhiSyarat: 8, berkasTidakLengkap: 0, tidakMemenuhiSyarat: 0, dikoreksi: 0 }, perOrang, perHari: [{ tanggal: "2026-11-09", hari: "Senin", libur: false, total: 5, jamKerja: 4, luarJamKerja: 1 }], luarTim: { total: 0, jamKerja: 0, luarJamKerja: 0 } },
    ulang: { ringkasan: { total: 7, jamKerja: 3, luarJamKerja: 4, sesuai: 5, dikoreksi: 2, sisa: 7 }, perOrang: ulangOrang, perHari: [] },
    gabungan: { perOrangHari: [
      { username: "verif_a1", tanggal: "2026-11-09", pertamaJam: 3, pertamaLuar: 1, ulangJam: 1, ulangLuar: 0 },
      { username: "verif_a2", tanggal: "2026-11-10", pertamaJam: 0, pertamaLuar: 0, ulangJam: 0, ulangLuar: 3 },
    ] },
  }, "ADMIN");
  const rekap = ex.lembar[0].baris, isi = rekap.slice(5);
  assert.deepEqual(rekap[4].slice(5, 16), ["Pertama: Jam Kerja", "Pertama: Luar Jam Kerja", "Pertama: Total", "Ulang: Jam Kerja", "Ulang: Luar Jam Kerja", "Ulang: Total", "Ulang: Sesuai", "Ulang: Dikoreksi", "TOTAL PEKERJAAN: Jam Kerja", "TOTAL PEKERJAAN: Luar Jam Kerja (Lembur)", "TOTAL PEKERJAAN: Total"]);
  const orang = isi.filter((r) => typeof r[0] === "number");
  const a1 = orang.find((r) => r[2] === "verif_a1");
  assert.deepEqual(a1.slice(5, 16), [3, 1, 4, 2, 1, 3, 2, 1, 5, 2, 7], "a1: pertama 3+1, ulang 2+1 (sesuai 2, dikoreksi 1), TOTAL 5 jam kerja + 2 luar = 7");
  for (const r of orang) {
    assert.equal(r[13], r[5] + r[8], "TOTAL jam kerja = pertama + ulang: " + r[2]);
    assert.equal(r[14], r[6] + r[9], "TOTAL luar jam kerja = pertama + ulang: " + r[2]);
    assert.equal(r[15], r[7] + r[10], "TOTAL = pertama + ulang: " + r[2]);
    assert.equal(r[15], r[13] + r[14], "TOTAL = jam kerja + luar jam kerja: " + r[2]);
  }
  const sub = isi.filter((r) => String(r[1]).startsWith("Subtotal"));
  assert.deepEqual(sub.map((r) => [r[1], r[7], r[10], r[15]]), [["Subtotal Tim I", 6, 6, 12], ["Subtotal Tim II", 2, 1, 3]]);
  const total = isi.find((r) => r[1] === "TOTAL");
  assert.deepEqual([total[7], total[10], total[11], total[12], total[15]], [8, 7, 5, 2, 15], "TOTAL: pertama 8 + ulang 7... (ringkasan ulang dipakai apa adanya)");
  assert.equal(orang.reduce((s, r) => s + r[15], 0), sub.reduce((s, r) => s + r[15], 0), "jumlah orang = jumlah subtotal");
  const hari = ex.lembar[1].baris.slice(4);
  assert.deepEqual(ex.lembar[1].baris[3].slice(6), ["Pertama: Jam Kerja", "Pertama: Luar Jam Kerja", "Ulang: Jam Kerja", "Ulang: Luar Jam Kerja", "TOTAL: Jam Kerja", "TOTAL: Luar Jam Kerja (Lembur)", "TOTAL: Data"]);
  assert.deepEqual(hari.map((r) => [r[1], r[3], ...r.slice(6)]), [["verif_a1", "2026-11-09", 3, 1, 1, 0, 4, 1, 5], ["verif_a2", "2026-11-10", 0, 0, 0, 3, 0, 3, 3]], "hari yang hanya punya pemeriksaan ulang tetap tampil");
});

test("EXCEL (T6): tanpa data pemeriksaan ulang (migrasi belum diterapkan) kolom ulang bernilai 0 dan TOTAL = pertama", async () => {
  const ex = excelTiruan();
  const perOrang = [{ username: "verif_a1", namaLengkap: "A", tim: "I", koordinator: true, aktif: true, total: 4, jamKerja: 3, luarJamKerja: 1, memenuhiSyarat: 4, berkasTidakLengkap: 0, tidakMemenuhiSyarat: 0 }];
  agregat.susunBukuRekap(ex, { cakupan: "TIM", timFokus: "I", rentang: { dari: "2026-11-09", sampai: "2026-11-09", jumlahHari: 1 }, saya: "X", hasil: { ringkasan: { total: 4, jamKerja: 3, luarJamKerja: 1, memenuhiSyarat: 4, berkasTidakLengkap: 0, tidakMemenuhiSyarat: 0 }, perOrang, perHari: [] } }, "X");
  const r = ex.lembar[0].baris.slice(5).find((x) => x[2] === "verif_a1");
  assert.deepEqual(r.slice(5, 16), [3, 1, 4, 0, 0, 0, 0, 0, 3, 1, 4]);
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

test("KONSISTEN: urutan tabel di layar (app-agregat-verifikasi.js) SAMA dengan urutan Excel (server) untuk data yang sama", () => {
  const layar = createRequire(import.meta.url)("../../public/js/app-agregat-verifikasi.js");
  const o = (username, tim, koordinator) => ({ username, tim, koordinator, namaLengkap: username, aktif: true });
  const daftar = [o("verif_zz", null, false), o("verif_d2", "IV", true), o("verif_b3", "II", false), o("verif_a2", "I", false), o("verif_c1", "III", false), o("verif_b2", "II", true),
    o("verif_a3", "I", true), o("verif_a1", "I", false), o("verif_d1", "IV", false), o("verif_b1", "II", false)];
  const dariLayar = layar.urutkanPerTim(daftar).map((x) => x.username);
  const dariServer = agregat.urutkanPerTim(daftar).map((x) => x.username);
  assert.deepEqual(dariLayar, dariServer, "layar dan Excel harus berurutan sama");
  assert.deepEqual(dariLayar, ["verif_a3", "verif_a1", "verif_a2", "verif_b2", "verif_b1", "verif_b3", "verif_c1", "verif_d2", "verif_d1", "verif_zz"]);
  assert.deepEqual(daftar.map((x) => x.username)[0], "verif_zz", "data asli tidak diubah (salinan diurutkan)");
  assert.deepEqual(layar.urutkanPerTim(null), []);
});

test("STATUS SEKARANG: kueri menggabungkan status data sekarang (left join penerima) dan hasilnya hanya informasi; per orang memuat dikoreksi", async () => {
  pakai("UTAMA");
  const h = await ambil(...RENT);
  const kueri = db().panggilan.find((p) => p.teks.includes("distinct on"));
  assert.ok(kueri.teks.includes("left join penerima p on p.id = r.penerima_id and p.tahun = r.tahun"), "status sekarang dari data penerima (data dihapus tetap terbaca lewat left join)");
  const a1 = h.perOrang.find((o) => o.username === "verif_a1");
  assert.deepEqual([a1.total, a1.dikoreksi, a1.sekarangTidakMemenuhiSyarat], [2, 1, 1]);
  assert.equal(h.perOrang.find((o) => o.username === "verif_baru").dikoreksi, 1);
  assert.equal(h.perOrang.find((o) => o.username === "verif_b1").dikoreksi, 0);
});

test("LEMBUR AMAN (server): status sekarang yang berubah-ubah tidak mengubah total/jam kerja/luar jam kerja hasil aksi", async () => {
  const pokok = (h) => JSON.stringify([h.ringkasan.total, h.ringkasan.jamKerja, h.ringkasan.luarJamKerja, h.ringkasan.memenuhiSyarat, h.ringkasan.berkasTidakLengkap, h.ringkasan.tidakMemenuhiSyarat, h.perOrang.map((o) => [o.username, o.total, o.jamKerja, o.luarJamKerja])]);
  pakai("UTAMA");
  const acuan = pokok(await ambil(...RENT));
  for (const v of [null, "Proses Verifikasi", "Memenuhi Syarat", "Tidak Memenuhi Syarat"]) {
    pakai("UTAMA", { kejadian: KEJADIAN.map((e) => ({ ...e, status_sekarang: v })) });
    assert.equal(pokok(await ambil(...RENT)), acuan, "status sekarang = " + v);
  }
});

test("LAYAR (T6): tiga angka utama; server lama tanpa data ulang -> ulang 0 dan total = pertama; gabungan dari server dipakai apa adanya", () => {
  const layar = createRequire(import.meta.url)("../../public/js/app-agregat-verifikasi.js");
  const lama = layar.ringkasTiga({ ringkasan: { total: 10, jamKerja: 7, luarJamKerja: 3 } });
  assert.deepEqual([lama.pertama.total, lama.ulang.total, lama.total.total, lama.total.jamKerja, lama.total.luarJamKerja], [10, 0, 10, 7, 3]);
  const baru = layar.ringkasTiga({ ringkasan: { total: 10, jamKerja: 7, luarJamKerja: 3 }, ulang: { ringkasan: { total: 4, jamKerja: 1, luarJamKerja: 3, sesuai: 3, dikoreksi: 1, sisa: 9 } }, gabungan: { ringkasan: { total: 14, jamKerja: 8, luarJamKerja: 6 } } });
  assert.deepEqual([baru.pertama.total, baru.ulang.total, baru.ulang.sesuai, baru.ulang.dikoreksi, baru.ulang.sisa, baru.total.total, baru.total.jamKerja, baru.total.luarJamKerja], [10, 4, 3, 1, 9, 14, 8, 6]);
  const kosong = layar.ringkasTiga(null);
  assert.deepEqual([kosong.pertama.total, kosong.ulang.total, kosong.total.total], [0, 0, 0]);
});

test("LAYAR (T6): baris tabel menggabungkan pertama + ulang menurut username (huruf besar/kecil tak berpengaruh); tanpa data ulang tetap sama dengan pertama", () => {
  const layar = createRequire(import.meta.url)("../../public/js/app-agregat-verifikasi.js");
  const d = { perOrang: [{ username: "verif_a1", total: 5, jamKerja: 4, luarJamKerja: 1 }, { username: "verif_b1", total: 2, jamKerja: 2, luarJamKerja: 0 }],
    ulang: { perOrang: [{ username: "VERIF_A1", total: 3, jamKerja: 1, luarJamKerja: 2, sesuai: 2, dikoreksi: 1, sisa: 6 }] } };
  const g = layar.gabungPerOrang(d);
  assert.deepEqual([g[0].ulangTotal, g[0].ulangSisa, g[0].totalPekerjaan, g[0].totalJamKerja, g[0].totalLuarJamKerja], [3, 6, 8, 5, 3]);
  assert.deepEqual([g[1].ulangTotal, g[1].totalPekerjaan, g[1].totalJamKerja], [0, 2, 2], "tanpa data ulang: total = pertama");
  const dariServer = layar.gabungPerOrang({ perOrang: d.perOrang, gabungan: { perOrang: [{ username: "VERIF_A1", total: 99, jamKerja: 90, luarJamKerja: 9 }] } });
  assert.deepEqual([dariServer[0].totalPekerjaan, dariServer[0].totalJamKerja], [99, 90], "angka gabungan dari server dipakai apa adanya");
  assert.deepEqual(layar.gabungPerOrang({}), []);
});

test("LAYAR (T6): bagan per hari memakai total pekerjaan tetapi tetap membawa penanda libur; kartu tim memakai total pekerjaan", () => {
  const layar = createRequire(import.meta.url)("../../public/js/app-agregat-verifikasi.js");
  const d = { perHari: [{ tanggal: "2026-11-14", hari: "Sabtu", libur: true, total: 1, jamKerja: 0, luarJamKerja: 1 }, { tanggal: "2026-11-15", hari: "Minggu", libur: true, total: 0, jamKerja: 0, luarJamKerja: 0 }],
    gabungan: { perHari: [{ tanggal: "2026-11-14", total: 4, jamKerja: 0, luarJamKerja: 4 }], perTim: [{ tim: "I", total: 70, jamKerja: 46, luarJamKerja: 24 }] },
    perTim: [{ tim: "I", anggota: 8, total: 60, jamKerja: 40, luarJamKerja: 20 }, { tim: "II", anggota: 7, total: 5, jamKerja: 5, luarJamKerja: 0 }] };
  const h = layar.hariGabungan(d);
  assert.deepEqual([h[0].total, h[0].luarJamKerja, h[0].libur, h[0].hari], [4, 4, true, "Sabtu"]);
  assert.deepEqual([h[1].total, h[1].libur], [0, true], "hari tanpa angka gabungan tetap tampil");
  const t = layar.timGabungan(d);
  assert.deepEqual([t[0].total, t[0].anggota, t[1].total], [70, 8, 5], "anggota tetap dari pertama; tim tanpa gabungan memakai angka pertama");
});
