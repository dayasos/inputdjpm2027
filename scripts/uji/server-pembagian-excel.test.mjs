// Excel PEMBAGIAN verifikasi ulang (khusus Admin Utama; memuat NIK utuh). Rencana: plans/plan-verifikasi-ulang.md
// Menjalankan kode server APA ADANYA (dibundel; tanpa Deno) dengan database tiruan + ExcelJS tiruan; data KARANGAN. Jalankan: npm run uji:pembagian-excel
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { db, muatServer } from "./_harness-server.mjs";
import { AKSI_VERIFIKATOR, ditolakUntukVerifikator } from "../../supabase/functions/api/_shared/gerbangPeran.ts";

const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const mod = await muatServer("supabase/functions/api/domains/pembagianUlangExcel.ts");

const SESI = {
  UTAMA: { akun_id: "u1", username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN" },
  VERIF: { akun_id: "a2", username: "verif_a2", role: "VERIFIKATOR", kecamatan: "", user_id: "" },
  KOORD: { akun_id: "a1", username: "verif_a1", role: "VERIFIKATOR", kecamatan: "", user_id: "" },
  KEC: { akun_id: "k1", username: "kec_x", role: "KECAMATAN", kecamatan: "MEDAN KOTA", user_id: "KECAMATAN MEDAN KOTA" },
};
let sesiAktif = SESI.UTAMA;
const tok = (() => { let n = 0; return () => "t-" + (++n); })();

// ---- data karangan
const BATCH = { id: 7, nama: "Tahap 1 / uji", dibuat_oleh: "ADMIN", dibuat_pada: "2026-11-14T15:23:09Z", status: "AKTIF", jumlah_tugas: 9, batas_selesai: "2026-11-20", benih: "benih-x", akun_khusus: "verif_uga_deba",
  // meniru produksi: jsonb tersimpan sebagai TEKS JSON (terenkode ganda)
  kriteria: JSON.stringify(JSON.stringify({ status: ["Memenuhi Syarat", "Berkas Tidak Lengkap"], layanan: [], sertakanSudahDiperiksa: false, jumlah: 6 })),
  pemeriksa: JSON.stringify(JSON.stringify(["verif_a1", "verif_a2", "verif_b1"])), pengecualian: JSON.stringify(JSON.stringify(["verif_ronald_fredy", "verif_fery_suhery"])) };
const T = (id, akun, nik, nama, lay, kec, kel, dibagi, ekstra = {}) => ({ id, akun, status_saat_dibagi: dibagi, selesai_pada: null, hasil: null, status_sesudah: null, ditarik_pada: null, nik, nama, layanan: lay, kecamatan: kec, kelurahan: kel, status_sekarang: dibagi, ...ekstra });
const TUGAS = [
  T(1, "VERIF_A2", "1271010101900001", "SITI AMINAH", "IMAM MASJID", "MEDAN KOTA", "PASAR BARU", "Memenuhi Syarat", { selesai_pada: "2026-11-14T15:26:07.549Z", hasil: "SESUAI", status_sesudah: "Memenuhi Syarat" }),
  T(2, "VERIF_A2", "0012345678901234", "BUDI SANTOSO", "IMAM MASJID", "MEDAN KOTA", "PASAR BARU", "Memenuhi Syarat", { selesai_pada: "2026-11-14T16:00:00Z", hasil: "DIKOREKSI", status_sesudah: "Berkas Tidak Lengkap", status_sekarang: "Berkas Tidak Lengkap" }),
  T(3, "VERIF_A2", "1271010101900003", "CITRA", "PENDETA", "MEDAN BARU", "TITI RANTAI", "Memenuhi Syarat"),
  T(4, "VERIF_A1", "1271010101900004", "DEWI", "PENDETA", "MEDAN BARU", "TITI RANTAI", "Memenuhi Syarat", { ditarik_pada: "2026-11-14T16:30:00Z", status_sekarang: "Tidak Memenuhi Syarat" }),
  T(5, "VERIF_A1", "1271010101900005", "EKA", "BILAL JENAZAH", "MEDAN KOTA", "SEI RENGAS", "Memenuhi Syarat", { selesai_pada: "2026-11-14T16:10:00Z", hasil: "SESUAI", status_sesudah: "Memenuhi Syarat" }),
  T(6, "VERIF_B1", "1271010101900006", "FAJAR", "IMAM MASJID", "MEDAN DELI", "TANJUNG MULIA", "Memenuhi Syarat"),
  T(7, "VERIF_UGA_DEBA", "1271010101900007", "GITA", "PENDETA", "MEDAN DELI", "TANJUNG MULIA", "Berkas Tidak Lengkap", { selesai_pada: "2026-11-14T17:00:00Z", hasil: "SESUAI", status_sesudah: "Berkas Tidak Lengkap" }),
  T(8, "VERIF_UGA_DEBA", "1271010101900008", "HANA", "IMAM MASJID", "MEDAN DELI", "TANJUNG MULIA", "Tidak Memenuhi Syarat"),
  T(9, "VERIF_HAPUS", "1271010101900009", "INDRA", "IMAM MASJID", "MEDAN KOTA", "PASAR BARU", "Memenuhi Syarat"),   // akun sudah tidak ada di daftar tim
];
const AKUN = [
  { username: "verif_a1", nama_lengkap: "A SATU", aktif: true, tim: "I", koordinator: true },
  { username: "verif_a2", nama_lengkap: "A DUA", aktif: true, tim: "I", koordinator: false },
  { username: "verif_b1", nama_lengkap: "", aktif: true, tim: "II", koordinator: true },
  { username: "verif_uga_deba", nama_lengkap: "UGA DEBA", aktif: true, tim: "IV", koordinator: false },
  { username: "verif_hapus", nama_lengkap: "AKUN LAMA", aktif: true, tim: null, koordinator: false },
];
function pasang({ batch = BATCH, tugas = TUGAS, akun = AKUN } = {}) {
  db().panggilan.length = 0;
  db().handler = (q) => {
    if (q.includes("from sesi_login")) return [sesiAktif];
    if (q.includes("from batch_verifikasi_ulang where id")) return batch ? [batch] : [];
    if (q.includes("left join penerima p on p.id = t.penerima_id")) return tugas;
    if (q.includes("from akun a left join tim_verifikator")) return akun;
    return [];
  };
}
const pakai = (p, o) => { sesiAktif = SESI[p]; pasang(o); };

// ---- ExcelJS tiruan (cukup untuk memeriksa isi)
function excelTiruan() {
  const lembar = [];
  class Row { constructor() { this.font = null; } }
  class WS {
    constructor(nama) { this.nama = nama; this.baris = []; this.kolom = {}; this.sel = {}; this.views = null; this.autoFilter = null; lembar.push(this); }
    addRow(a) { this.baris.push(a); return new Row(); }
    getRow() { return new Row(); }
    getCell(r, c) { const k = r + ":" + c; return (this.sel[k] = this.sel[k] || {}); }
    getColumn(i) { this.kolom[i] = this.kolom[i] || {}; return this.kolom[i]; }
    mergeCells() {}
  }
  class WB { addWorksheet(n) { return new WS(n); } }
  return { Workbook: WB, lembar };
}

test("PERAN: hanya Admin Utama; verifikator, koordinator, dan peran lain ditolak SEBELUM membaca data apa pun", async () => {
  for (const p of ["VERIF", "KOORD", "KEC"]) {
    pakai(p);
    const h = await mod.unduhRekapPembagianUlang(tok(), 7);
    assert.equal(h.sukses, false, p); assert.match(h.pesan, /khusus Admin Utama/);
    assert.deepEqual(db().panggilan.filter((x) => !x.teks.includes("sesi_login")), [], p + ": tidak ada kueri data pribadi");
  }
  pakai("UTAMA");
  assert.equal((await mod.unduhRekapPembagianUlang(tok(), 0)).sukses, false, "id tidak valid");
  pasang({ batch: null }); sesiAktif = SESI.UTAMA;
  const tdk = await mod.unduhRekapPembagianUlang(tok(), 99);
  assert.equal(tdk.sukses, false); assert.match(tdk.pesan, /tidak ditemukan/);
});

test("GERBANG: aksi tidak ada di daftar-putih Verifikator (aman bawaan) dan terdaftar di ALLOWED index.ts", () => {
  assert.equal(AKSI_VERIFIKATOR.has("unduhRekapPembagianUlang"), false);
  assert.equal(ditolakUntukVerifikator("VERIFIKATOR", "unduhRekapPembagianUlang"), true);
  assert.match(baca("supabase/functions/api/index.ts"), /^  unduhRekapPembagianUlang,/m);
});

test("DATA: paket dengan jsonb TERENKODE GANDA (seperti produksi) terbaca benar; status tugas dan hasil dipetakan", async () => {
  pakai("UTAMA");
  const d = await mod.ambilDataPembagian(7);
  assert.equal(d.paket.nama, "Tahap 1 / uji");
  assert.deepEqual(d.paket.statusKriteria, ["Memenuhi Syarat", "Berkas Tidak Lengkap"]);
  assert.equal(d.paket.jumlahKriteria, 6); assert.equal(d.paket.jumlahPemeriksa, 3); assert.deepEqual(d.paket.pengecualian, ["verif_ronald_fredy", "verif_fery_suhery"]);
  assert.deepEqual(d.tugas.map((t) => t.statusTugas), ["SELESAI", "SELESAI", "BELUM DIKERJAKAN", "DITARIK", "SELESAI", "BELUM DIKERJAKAN", "SELESAI", "BELUM DIKERJAKAN", "BELUM DIKERJAKAN"]);
  assert.equal(d.tugas[1].statusSesudah, "Berkas Tidak Lengkap"); assert.equal(d.tugas[0].statusSesudah, "", "status setelah koreksi hanya untuk DIKOREKSI");
  assert.equal(d.tugas[0].nik, "1271010101900001");
});

test("PER PETUGAS: Ditugaskan = Selesai + Ditarik + Sisa; urutan tim -> koordinator dulu; subtotal dan TOTAL benar; akun tanpa tim di akhir", async () => {
  pakai("UTAMA");
  const d = await mod.ambilDataPembagian(7);
  const r = mod.ringkasPerPetugas(d);
  for (const o of r) assert.equal(o.ditugaskan, o.selesai + o.ditarik + o.sisa, o.username);
  assert.deepEqual(r.map((o) => o.username), ["verif_a1", "verif_a2", "verif_b1", "verif_uga_deba", "verif_hapus"], "Tim I (koordinator dulu), Tim II, Tim IV, tanpa tim");
  const a2 = r.find((o) => o.username === "verif_a2");
  assert.deepEqual([a2.ditugaskan, a2.selesai, a2.sesuai, a2.dikoreksi, a2.ditarik, a2.sisa], [3, 2, 1, 1, 0, 1]);
  const ex = excelTiruan();
  mod.susunBukuPembagian(ex, d, "ADMIN");
  assert.deepEqual(ex.lembar.map((l) => l.nama), ["Per Petugas", "Per Data", "Aturan"]);
  const ws = ex.lembar[0].baris;
  assert.match(ws[0][0], /Pembagian Verifikasi Ulang - Tahap 1 \/ uji \(paket 7\)/);
  assert.deepEqual(ws[3].slice(0, 13), ["No", "Tim", "Username", "Nama Lengkap", "Peran", "Jenis Tugas", "Ditugaskan", "Selesai", "Sesuai", "Dikoreksi", "Ditarik", "Sisa", "% Selesai"]);
  const isi = ws.slice(4);
  const orang = isi.filter((x) => typeof x[0] === "number");
  assert.deepEqual(orang.map((x) => x[2]), ["verif_a1", "verif_a2", "verif_b1", "verif_uga_deba", "verif_hapus"]);
  assert.deepEqual(orang.map((x) => x[5]), ["Data Memenuhi Syarat", "Data Memenuhi Syarat", "Data Memenuhi Syarat", "BTL/TMS khusus", "Data Memenuhi Syarat"]);
  assert.equal(orang.find((x) => x[2] === "verif_b1")[3], "(belum mengisi profil)");
  const sub = isi.filter((x) => String(x[1]).startsWith("Subtotal"));
  assert.deepEqual(sub.map((x) => [x[1], x[6], x[7], x[10], x[11]]), [["Subtotal Tim I", 5, 3, 1, 1], ["Subtotal Tim II", 1, 0, 0, 1], ["Subtotal Tim IV", 2, 1, 0, 1], ["Subtotal Tanpa tim", 1, 0, 0, 1]]);
  const total = isi.find((x) => x[1] === "TOTAL");
  assert.deepEqual([total[6], total[7], total[8], total[9], total[10], total[11]], [9, 4, 3, 1, 1, 4], "TOTAL: ditugaskan 9 = selesai 4 + ditarik 1 + sisa 4");
  assert.equal(total[6], total[7] + total[10] + total[11]);
  assert.equal(orang.find((x) => x[2] === "verif_a1")[12], 100, "% selesai: 1 dari (2 - 1 ditarik) = 100, bukan 50");
  assert.equal(orang.find((x) => x[2] === "verif_a2")[12], 67, "% selesai: 2 dari 3");
  assert.equal(orang.reduce((s, x) => s + x[6], 0), TUGAS.length, "jumlah per orang = jumlah tugas");
});

test("PER DATA: NIK UTUH sebagai TEKS (nol di depan terjaga, 16 digit), urutan menurut petugas, status/hasil/waktu WIB, filter dan beku baris judul", async () => {
  pakai("UTAMA");
  const d = await mod.ambilDataPembagian(7);
  const ex = excelTiruan();
  mod.susunBukuPembagian(ex, d, "ADMIN");
  const wd = ex.lembar[1];
  assert.deepEqual(wd.baris[3].slice(0, 6), ["No", "Tim", "Petugas (Username)", "Nama Petugas", "NIK", "Nama Penerima"]);
  const data = wd.baris.slice(4);
  assert.equal(data.length, 9);
  for (const r of data) { assert.equal(typeof r[4], "string", "NIK berupa teks: " + r[5]); assert.equal(r[4].length, 16); }
  assert.equal(data.find((r) => r[5] === "BUDI SANTOSO")[4], "0012345678901234", "nol di depan terjaga");
  assert.equal(data.find((r) => r[5] === "SITI AMINAH")[4], "1271010101900001");
  assert.equal(wd.kolom[5].numFmt, "@", "format KOLOM NIK = teks (gaya per sel sengaja tidak dipasang pada ribuan baris: terlalu berat untuk batas CPU Edge Function)");
  assert.deepEqual(data.map((r) => r[2]), ["verif_a1", "verif_a1", "verif_a2", "verif_a2", "verif_a2", "verif_b1", "verif_uga_deba", "verif_uga_deba", "verif_hapus"], "urut: petugas menurut tim/koordinator");
  const siti = data.find((r) => r[5] === "SITI AMINAH");
  assert.deepEqual([siti[1], siti[9], siti[11], siti[12], siti[13], siti[14], siti[15]], ["Tim I", "Memenuhi Syarat", "SELESAI", "Sesuai", "", "14-11-2026 22:26", 1], "waktu selesai dalam WIB (UTC+7)");
  const budi = data.find((r) => r[5] === "BUDI SANTOSO");
  assert.deepEqual([budi[10], budi[11], budi[12], budi[13]], ["Berkas Tidak Lengkap", "SELESAI", "Dikoreksi", "Berkas Tidak Lengkap"]);
  const dewi = data.find((r) => r[5] === "DEWI");
  assert.deepEqual([dewi[9], dewi[10], dewi[11], dewi[12], dewi[14]], ["Memenuhi Syarat", "Tidak Memenuhi Syarat", "DITARIK", "", ""], "tugas ditarik: status sekarang berbeda dari saat dibagi");
  assert.equal(data.find((r) => r[5] === "INDRA")[1], "Tanpa tim");
  assert.deepEqual(wd.autoFilter, { from: { row: 4, column: 1 }, to: { row: 13, column: 16 } });
  assert.deepEqual(wd.views, [{ state: "frozen", ySplit: 4 }]);
});

test("ATURAN: benih, kriteria terbaca (walau terenkode ganda), pengecualian, dan peringatan data pribadi tertulis", async () => {
  pakai("UTAMA");
  const d = await mod.ambilDataPembagian(7);
  const ex = excelTiruan();
  mod.susunBukuPembagian(ex, d, "ADMIN");
  const teks = ex.lembar[2].baris.map((r) => String(r[0])).join("\n");
  assert.match(teks, /Benih pengacakan: benih-x/);
  assert.match(teks, /status Memenuhi Syarat, Berkas Tidak Lengkap; layanan semua; jumlah data Memenuhi Syarat 6; tidak termasuk/);
  assert.match(teks, /verif_ronald_fredy, verif_fery_suhery/); assert.match(teks, /BTL\/TMS hanya ke verif_uga_deba/);
  assert.match(teks, /data pribadi penerima: hanya untuk Admin Utama/); assert.match(teks, /Dibuat oleh ADMIN/);
  assert.match(teks, /Ditugaskan = Selesai \+ Ditarik \+ Sisa/);
});

test("PAKET KOSONG dan paket tanpa tugas tidak melempar galat", async () => {
  pakai("UTAMA", { tugas: [], akun: [] });
  const d = await mod.ambilDataPembagian(7);
  const ex = excelTiruan();
  mod.susunBukuPembagian(ex, d, "ADMIN");
  assert.equal(ex.lembar[0].baris.filter((x) => typeof x[0] === "number").length, 0);
  assert.equal(ex.lembar[0].baris.find((x) => x[1] === "TOTAL")[6], 0);
  assert.equal(ex.lembar[1].baris.length, 4);
});

test("KOLOM data pribadi hanya dibaca oleh aksi ini lewat satu kueri; aksi hanya MEMBACA (tidak ada INSERT/UPDATE/DELETE)", async () => {
  pakai("UTAMA");
  await mod.ambilDataPembagian(7);
  assert.equal(db().panggilan.filter((x) => /^\s*(insert|update|delete)/i.test(x.teks)).length, 0);
  assert.equal(db().panggilan.filter((x) => x.teks.includes("p.nik")).length, 1, "NIK dibaca dalam satu kueri");
  const src = baca("supabase/functions/api/domains/pembagianUlangExcel.ts");
  assert.doesNotMatch(src, /\b(insert into|update\s+\w+\s+set|delete from)\b/i);
});
