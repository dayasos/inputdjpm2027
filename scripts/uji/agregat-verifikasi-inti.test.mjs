// Uji inti perhitungan agregat verifikasi (modul murni). Rencana: plans/plan-agregat-verifikator.md
// Jalankan: npm run uji:agregat-inti     (Node 24+)
import test from "node:test";
import assert from "node:assert/strict";
import {
  adalahJamKerja, konfigBawaan, bangunKonfig, lokalWib, tafsirRentang, tentukanCakupan, susunAgregat, waktuKeDtk, daftarTanggal, MAKS_HARI_RENTANG,
} from "../../supabase/functions/api/_shared/agregatInti.ts";

// Waktu WIB yang mudah dibaca. Catatan kalender: 12 Nov 2026 = Kamis.
const wib = (s) => new Date(s.replace(" ", "T") + "+07:00");
const konfig = konfigBawaan();
const libur = new Set(["2026-12-25"]);
const jam = (s, l = libur) => adalahJamKerja(wib(s), konfig, l);

test("JAM KERJA: batas Senin-Kamis (08.00 masuk, 16.30 sudah luar)", () => {
  for (const hari of ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"]) {   // Sen-Kam
    assert.equal(jam(hari + " 07:59:59"), false, hari + " 07:59:59");
    assert.equal(jam(hari + " 08:00:00"), true, hari + " 08:00:00");
    assert.equal(jam(hari + " 12:30:00"), true, "istirahat siang tetap jam kerja");
    assert.equal(jam(hari + " 16:29:59"), true, hari + " 16:29:59");
    assert.equal(jam(hari + " 16:30:00"), false, hari + " 16:30:00 (batas atas tidak termasuk)");
    assert.equal(jam(hari + " 23:59:59"), false);
    assert.equal(jam(hari + " 00:00:00"), false);
  }
});

test("JAM KERJA: Jumat sampai 17.00 (16.30 masih jam kerja)", () => {
  assert.equal(jam("2026-11-13 08:00:00"), true);
  assert.equal(jam("2026-11-13 16:30:00"), true, "Jumat 16.30 masih jam kerja");
  assert.equal(jam("2026-11-13 16:59:59"), true);
  assert.equal(jam("2026-11-13 17:00:00"), false, "Jumat 17.00 sudah luar");
  assert.equal(jam("2026-11-13 07:59:59"), false);
});

test("JAM KERJA: Sabtu, Minggu, dan tanggal merah seluruh harinya luar jam kerja", () => {
  assert.equal(jam("2026-11-14 10:00:00"), false, "Sabtu");
  assert.equal(jam("2026-11-15 10:00:00"), false, "Minggu");
  assert.equal(jam("2026-12-25 10:00:00"), false, "Jumat tanggal merah (Natal)");
  assert.equal(jam("2026-12-25 10:00:00", new Set()), true, "tanpa daftar libur, Jumat itu jam kerja biasa (kontrol)");
});

test("JAM KERJA: hari dihitung menurut WIB, bukan UTC (verifikasi 23.30 WIB tidak pindah hari; 00.30 WIB sudah hari berikutnya)", () => {
  const a = new Date("2026-11-12T16:30:00Z");   // = 23.30 WIB Kamis 12 Nov
  assert.deepEqual(lokalWib(a), { tanggal: "2026-11-12", isodow: 4, dtk: 23 * 3600 + 30 * 60 });
  const b = new Date("2026-11-12T17:30:00Z");   // = 00.30 WIB Jumat 13 Nov
  assert.deepEqual(lokalWib(b), { tanggal: "2026-11-13", isodow: 5, dtk: 30 * 60 });
  const c = new Date("2026-11-13T01:00:00Z");   // = 08.00 WIB Jumat -> jam kerja
  assert.equal(adalahJamKerja(c, konfig, libur), true);
  const d = new Date("2026-11-12T09:30:00Z");   // = 16.30 WIB Kamis -> luar
  assert.equal(adalahJamKerja(d, konfig, libur), false);
});

test("KONFIG: tabel kosong/rusak memakai aturan bawaan; baris valid dipakai; baris tak valid diabaikan", () => {
  assert.equal(bangunKonfig([]).get(5).selesaiDtk, 17 * 3600);
  assert.equal(bangunKonfig(null).get(1).selesaiDtk, 16 * 3600 + 1800);
  const k = bangunKonfig([{ isodow: 1, mulai: "09:00:00", selesai: "15:00:00" }, { isodow: 9, mulai: "08:00", selesai: "09:00" }, { isodow: 2, mulai: "10:00", selesai: "09:00" }, { isodow: 3, mulai: "x", selesai: "09:00" }]);
  assert.equal(k.size, 1);
  assert.equal(k.get(1).mulaiDtk, 9 * 3600);
  assert.ok(Number.isNaN(waktuKeDtk("abc")) && waktuKeDtk("08:30") === 8 * 3600 + 1800 && waktuKeDtk("16:30:15") === 16 * 3600 + 1800 + 15);
});

test("RENTANG: bawaan awal bulan s/d hari ini; batas inklusif WIB; validasi", () => {
  const r = tafsirRentang("", "", "2026-11-12");
  assert.ok(r.ok);
  assert.equal(r.rentang.dari, "2026-11-01"); assert.equal(r.rentang.sampai, "2026-11-12"); assert.equal(r.rentang.jumlahHari, 12);
  const s = tafsirRentang("2026-11-12", "2026-11-12", "2026-11-12");
  assert.equal(s.rentang.awalUtc.toISOString(), "2026-11-11T17:00:00.000Z", "00.00 WIB = 17.00 UTC hari sebelumnya");
  assert.equal(s.rentang.akhirUtcEksklusif.toISOString(), "2026-11-12T17:00:00.000Z", "akhir eksklusif = 00.00 WIB hari berikutnya");
  for (const [d, e] of [["2026-13-01", "2026-13-02"], ["2026-02-30", "2026-03-01"], ["12-11-2026", "13-11-2026"], ["2026-11-12", ""], ["", "2026-11-12"], [null, 5], ["2026-11-13", "2026-11-12"]]) {
    assert.equal(tafsirRentang(d, e, "2026-11-12").ok, false, JSON.stringify([d, e]));
  }
  assert.equal(daftarTanggal("2026-08-01", "2026-11-01").length, 93);
  assert.equal(tafsirRentang("2026-08-01", "2026-11-01", "2026-11-12").ok, true, "tepat 93 hari masih boleh");
  assert.equal(tafsirRentang("2026-08-01", "2026-11-02", "2026-11-12").ok, false, "94 hari ditolak");
  assert.equal(MAKS_HARI_RENTANG, 93);
});

const AKUN = [
  { akunId: "1", username: "verif_a1", namaLengkap: "A Satu", aktif: true, tim: "I", koordinator: true },
  { akunId: "2", username: "verif_a2", namaLengkap: "A Dua", aktif: true, tim: "I", koordinator: false },
  { akunId: "3", username: "verif_b1", namaLengkap: "B Satu", aktif: true, tim: "II", koordinator: true },
  { akunId: "4", username: "verif_b2", namaLengkap: "B Dua", aktif: false, tim: "II", koordinator: false },
  { akunId: "5", username: "verif_baru", namaLengkap: "", aktif: true, tim: null, koordinator: false },
];

test("CAKUPAN: verifikator biasa hanya dirinya; parameter tim dari browser diabaikan", () => {
  const h = tentukanCakupan("VERIFIKATOR", "2", AKUN, "II");
  assert.ok(h.ok);
  assert.equal(h.cakupan, "SAYA");
  assert.deepEqual(h.anggota.map((a) => a.username), ["verif_a2"]);
});

test("CAKUPAN: koordinator melihat timnya saja (termasuk dirinya); meminta tim lain TIDAK memperluas", () => {
  for (const diminta of [undefined, "", "I", "II", "III", "-", "semua", "' or 1=1 --"]) {
    const h = tentukanCakupan("VERIFIKATOR", "1", AKUN, diminta);
    assert.ok(h.ok);
    assert.equal(h.cakupan, "TIM");
    assert.deepEqual(h.anggota.map((a) => a.username).sort(), ["verif_a1", "verif_a2"], "diminta: " + diminta);
  }
  const b = tentukanCakupan("verifikator", "3", AKUN, "I");
  assert.deepEqual(b.anggota.map((a) => a.username).sort(), ["verif_b1", "verif_b2"], "koordinator Tim II tidak melihat Tim I");
});

test("CAKUPAN: Admin Utama melihat semua; dapat menyaring per tim atau 'tanpa tim'; nilai aneh = semua", () => {
  assert.equal(tentukanCakupan("UTAMA", "9", AKUN).anggota.length, 5);
  assert.deepEqual(tentukanCakupan("UTAMA", "9", AKUN, "II").anggota.map((a) => a.username).sort(), ["verif_b1", "verif_b2"]);
  assert.deepEqual(tentukanCakupan("UTAMA", "9", AKUN, "-").anggota.map((a) => a.username), ["verif_baru"]);
  assert.equal(tentukanCakupan("UTAMA", "9", AKUN, "xyz").anggota.length, 5);
  assert.equal(tentukanCakupan("UTAMA", "9", AKUN).cakupan, "SEMUA");
});

test("CAKUPAN: peran lain, kosong, atau akun verifikator tak ditemukan -> ditolak", () => {
  for (const r of ["KECAMATAN", "MUI", "GURU MAGHRIB MENGAJI", "", null, undefined, "VERIFIKATOR2", "admin"]) assert.equal(tentukanCakupan(r, "1", AKUN).ok, false, String(r));
  assert.equal(tentukanCakupan("VERIFIKATOR", "999", AKUN).ok, false);
  assert.equal(tentukanCakupan("VERIFIKATOR", "5", AKUN).cakupan, "SAYA", "verifikator tanpa tim tetap melihat dirinya");
});

const rentang = tafsirRentang("2026-11-09", "2026-11-15", "2026-11-15").rentang;   // Sen 9 - Min 15 Nov
const kej = (oleh, s, status = "Memenuhi Syarat") => ({ oleh, waktu: wib(s), statusBaru: status });

test("AGREGAT: jam kerja vs luar jam kerja, per status, per hari, per orang (ada nol)", () => {
  const kejadian = [
    kej("VERIF_A1", "2026-11-09 08:00:00"),                                  // jam kerja
    kej("VERIF_A1", "2026-11-09 16:30:00", "Berkas Tidak Lengkap"),          // luar (batas)
    kej("VERIF_A2", "2026-11-10 10:00:00", "Tidak Memenuhi Syarat"),         // jam kerja
    kej("VERIF_A2", "2026-11-14 10:00:00"),                                  // Sabtu -> luar
    kej("VERIF_A1", "2026-11-13 16:45:00"),                                  // Jumat 16.45 -> jam kerja
    kej("VERIF_A1", "2026-11-08 23:59:59"),                                  // sebelum rentang -> diabaikan
    kej("VERIF_A1", "2026-11-16 00:00:00"),                                  // sesudah rentang -> diabaikan
    kej("VERIF_B1", "2026-11-10 10:00:00"),                                  // di luar cakupan -> diabaikan
  ];
  const a = susunAgregat({ cakupan: "TIM", anggota: AKUN.filter((x) => x.tim === "I"), kejadian, rentang, konfig, libur });
  assert.deepEqual(a.ringkasan, { total: 5, jamKerja: 3, luarJamKerja: 2, memenuhiSyarat: 3, berkasTidakLengkap: 1, tidakMemenuhiSyarat: 1, sekarangMemenuhiSyarat: 0, sekarangBerkasTidakLengkap: 0, sekarangTidakMemenuhiSyarat: 0, sekarangLainnya: 0, dikoreksi: 0 }, "status sekarang tidak diketahui (tak dikirim) -> tidak dihitung");
  const o1 = a.perOrang.find((o) => o.username === "verif_a1");
  assert.deepEqual([o1.total, o1.jamKerja, o1.luarJamKerja], [3, 2, 1]);
  assert.equal(a.perOrang[0].username, "verif_a1", "urut menurun menurut total");
  assert.equal(a.perHari.length, 7);
  assert.equal(a.perHari.find((h) => h.tanggal === "2026-11-14").libur, true, "Sabtu ditandai libur");
  assert.equal(a.perHari.find((h) => h.tanggal === "2026-11-14").hari, "Sabtu");
  assert.equal(a.perHari.find((h) => h.tanggal === "2026-11-11").total, 0, "hari tanpa data tetap ada (nol)");
  assert.equal(a.perTim, undefined, "perTim hanya untuk cakupan SEMUA");
  assert.equal(a.luarTim, undefined);
  assert.equal(a.perHari.reduce((s, h) => s + h.total, 0), a.ringkasan.total, "jumlah harian = total");
});

test("AGREGAT: cakupan SAYA hanya memuat dirinya walau kejadian orang lain dikirim (tidak bocor)", () => {
  const kejadian = [kej("VERIF_A1", "2026-11-09 09:00:00"), kej("VERIF_A2", "2026-11-09 09:00:00"), kej("VERIF_B1", "2026-11-09 09:00:00")];
  const a = susunAgregat({ cakupan: "SAYA", anggota: [AKUN[1]], kejadian, rentang, konfig, libur });
  assert.equal(a.ringkasan.total, 1);
  assert.deepEqual(a.perOrang.map((o) => o.username), ["verif_a2"]);
});

test("AGREGAT: Admin Utama (SEMUA): perTim, anggota tanpa tim, dan baris luarTim (informasi) terpisah dari angka tim", () => {
  const kejadian = [kej("VERIF_A1", "2026-11-09 09:00:00"), kej("VERIF_B1", "2026-11-14 09:00:00"), kej("VERIF_BARU", "2026-11-10 09:00:00")];
  const a = susunAgregat({ cakupan: "SEMUA", anggota: AKUN, kejadian, rentang, konfig, libur, luarTim: [{ waktu: wib("2026-11-09 09:00:00") }, { waktu: wib("2026-11-15 20:00:00") }, { waktu: wib("2026-11-30 09:00:00") }] });
  assert.equal(a.ringkasan.total, 3);
  const tim = Object.fromEntries(a.perTim.map((t) => [t.tim, t]));
  assert.deepEqual([tim.I.total, tim.II.total, tim["-"].total], [1, 1, 1]);
  assert.equal(tim.III.total, 0); assert.equal(tim.III.anggota, 0);
  assert.deepEqual(a.luarTim, { total: 2, jamKerja: 1, luarJamKerja: 1 }, "kejadian di luar rentang tidak dihitung; tidak masuk angka tim");
});

test("AGREGAT: per orang per hari tersedia hanya bila diminta (untuk Excel)", () => {
  const kejadian = [kej("VERIF_A1", "2026-11-09 09:00:00"), kej("VERIF_A1", "2026-11-09 18:00:00"), kej("VERIF_A1", "2026-11-10 09:00:00")];
  const a = susunAgregat({ cakupan: "TIM", anggota: AKUN.filter((x) => x.tim === "I"), kejadian, rentang, konfig, libur });
  assert.equal(a.perOrangHari, undefined);
  const b = susunAgregat({ cakupan: "TIM", anggota: AKUN.filter((x) => x.tim === "I"), kejadian, rentang, konfig, libur, sertakanPerOrangHari: true });
  assert.deepEqual(b.perOrangHari, [
    { username: "verif_a1", tanggal: "2026-11-09", jamKerja: 1, luarJamKerja: 1 },
    { username: "verif_a1", tanggal: "2026-11-10", jamKerja: 1, luarJamKerja: 0 },
  ]);
});

test("AGREGAT: kartu per tim memuat SEMUA tim walau tabel disaring ke satu tim (angka tim lain tidak boleh tampak 0)", () => {
  const kejadian = [kej("VERIF_A1", "2026-11-09 09:00:00"), kej("VERIF_B1", "2026-11-10 09:00:00"), kej("VERIF_B1", "2026-11-11 09:00:00")];
  const tim2 = AKUN.filter((x) => x.tim === "II");
  const a = susunAgregat({ cakupan: "SEMUA", anggota: tim2, semuaAnggota: AKUN, kejadian, rentang, konfig, libur });
  assert.deepEqual(a.perOrang.map((o) => o.username).sort(), ["verif_b1", "verif_b2"], "tabel tersaring ke Tim II");
  assert.equal(a.ringkasan.total, 2, "angka ringkasan hanya Tim II");
  const tim = Object.fromEntries(a.perTim.map((t) => [t.tim, t]));
  assert.deepEqual([tim.I.total, tim.I.anggota, tim.II.total, tim.II.anggota], [1, 2, 2, 2], "Tim I tetap tampil dengan angka aslinya");
  // tanpa semuaAnggota: perilaku lama
  const b = susunAgregat({ cakupan: "SEMUA", anggota: tim2, kejadian, rentang, konfig, libur });
  assert.equal(b.perTim.find((t) => t.tim === "I").total, 0);
});

test("AGREGAT: kartu per tim memakai aturan yang SAMA dengan tabel (rentang, jam kerja, status) walau disaring", () => {
  const kejadian = [
    kej("VERIF_A1", "2026-11-09 09:00:00"),                              // Tim I, jam kerja
    kej("VERIF_A1", "2026-11-14 09:00:00", "Berkas Tidak Lengkap"),      // Tim I, Sabtu -> luar
    kej("VERIF_A2", "2026-11-08 23:59:59"),                              // Tim I, SEBELUM rentang -> tidak dihitung di kartu
    kej("VERIF_A2", "2026-11-16 00:00:00"),                              // Tim I, SESUDAH rentang -> tidak dihitung
    kej("VERIF_B1", "2026-11-10 10:00:00"),
  ];
  const a = susunAgregat({ cakupan: "SEMUA", anggota: AKUN.filter((x) => x.tim === "II"), semuaAnggota: AKUN, kejadian, rentang, konfig, libur });
  const tim = Object.fromEntries(a.perTim.map((t) => [t.tim, t]));
  assert.deepEqual([tim.I.total, tim.I.jamKerja, tim.I.luarJamKerja], [2, 1, 1], "kartu Tim I: hanya kejadian dalam rentang, dengan klasifikasi jam kerja yang sama");
  assert.deepEqual([tim.II.total, tim.II.jamKerja, tim.II.luarJamKerja], [1, 1, 0]);
  assert.equal(a.ringkasan.total, 1, "ringkasan tetap hanya Tim II");
  // Kartu tanpa saringan = tabel (konsisten)
  const b = susunAgregat({ cakupan: "SEMUA", anggota: AKUN, semuaAnggota: AKUN, kejadian, rentang, konfig, libur });
  assert.deepEqual(b.perTim.map((x) => [x.tim, x.total, x.jamKerja, x.luarJamKerja]), a.perTim.map((x) => [x.tim, x.total, x.jamKerja, x.luarJamKerja]), "kartu sama dengan atau tanpa saringan");
});

test("STATUS SEKARANG: dikoreksi = status sekarang berbeda dari hasil verifikator; data dihapus (null) ikut selisih; undefined dilewati", () => {
  const k = (oleh, s, hasil, sekarang) => ({ oleh, waktu: wib(s), statusBaru: hasil, statusSekarang: sekarang });
  const kejadian = [
    k("VERIF_A1", "2026-11-09 09:00:00", "Tidak Memenuhi Syarat", "Berkas Tidak Lengkap"),   // dinaikkan Admin -> dikoreksi
    k("VERIF_A1", "2026-11-09 10:00:00", "Memenuhi Syarat", "Memenuhi Syarat"),             // sama
    k("VERIF_A1", "2026-11-09 11:00:00", "Berkas Tidak Lengkap", "memenuhi syarat "),       // beda huruf/spasi pada status sekarang tetap dinormalkan (beda isi -> dikoreksi)
    k("VERIF_A2", "2026-11-10 09:00:00", "Memenuhi Syarat", null),                           // data sudah dihapus
    k("VERIF_A2", "2026-11-10 10:00:00", "Memenuhi Syarat", undefined),                      // tidak diketahui
    k("VERIF_A2", "2026-11-10 11:00:00", "Memenuhi Syarat", "Proses Verifikasi"),            // dikembalikan ke Proses Verifikasi
  ];
  const a = susunAgregat({ cakupan: "TIM", anggota: AKUN.filter((x) => x.tim === "I"), kejadian, rentang, konfig, libur });
  const o1 = a.perOrang.find((o) => o.username === "verif_a1"), o2 = a.perOrang.find((o) => o.username === "verif_a2");
  assert.deepEqual([o1.sekarangMemenuhiSyarat, o1.sekarangBerkasTidakLengkap, o1.sekarangTidakMemenuhiSyarat, o1.sekarangLainnya, o1.dikoreksi], [2, 1, 0, 0, 2]);
  assert.deepEqual([o2.sekarangLainnya, o2.dikoreksi], [2, 2], "null dan Proses Verifikasi = lainnya; undefined dilewati");
  assert.deepEqual([a.ringkasan.dikoreksi, a.ringkasan.total], [4, 6]);
});

test("LEMBUR AMAN: status sekarang TIDAK PERNAH mengubah total, jam kerja, luar jam kerja, maupun hasil verifikator (uji invarian)", () => {
  const dasar = [
    { oleh: "VERIF_A1", waktu: wib("2026-11-09 09:00:00"), statusBaru: "Tidak Memenuhi Syarat" },
    { oleh: "VERIF_A1", waktu: wib("2026-11-09 17:00:00"), statusBaru: "Memenuhi Syarat" },
    { oleh: "VERIF_A2", waktu: wib("2026-11-14 09:00:00"), statusBaru: "Berkas Tidak Lengkap" },
    { oleh: "VERIF_B1", waktu: wib("2026-11-12 16:30:00"), statusBaru: "Memenuhi Syarat" },
  ];
  const varian = [undefined, null, "Memenuhi Syarat", "Berkas Tidak Lengkap", "Tidak Memenuhi Syarat", "Proses Verifikasi", "APA SAJA"];
  const acuan = susunAgregat({ cakupan: "SEMUA", anggota: AKUN, semuaAnggota: AKUN, kejadian: dasar, rentang, konfig, libur });
  const pokok = (a) => JSON.stringify({
    ringkasan: [a.ringkasan.total, a.ringkasan.jamKerja, a.ringkasan.luarJamKerja, a.ringkasan.memenuhiSyarat, a.ringkasan.berkasTidakLengkap, a.ringkasan.tidakMemenuhiSyarat],
    orang: a.perOrang.map((o) => [o.username, o.total, o.jamKerja, o.luarJamKerja, o.memenuhiSyarat, o.berkasTidakLengkap, o.tidakMemenuhiSyarat]),
    hari: a.perHari.map((h) => [h.tanggal, h.total, h.jamKerja, h.luarJamKerja]), tim: a.perTim.map((x) => [x.tim, x.total, x.jamKerja, x.luarJamKerja]),
  });
  for (const v of varian) {
    const a = susunAgregat({ cakupan: "SEMUA", anggota: AKUN, semuaAnggota: AKUN, kejadian: dasar.map((e) => ({ ...e, statusSekarang: v })), rentang, konfig, libur });
    assert.equal(pokok(a), pokok(acuan), "status sekarang = " + JSON.stringify(v));
  }
});
