// Uji bagian murni layar verifikasi ulang (petugas dan Admin). Rencana: plans/plan-verifikasi-ulang.md (T5)
// Jalankan: npm run uji:tugas-ulang-murni     (Node 24+)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { cekSimpanHasil, peralihanStatusDiizinkan } from "../../supabase/functions/api/_shared/verifikasiUlangInti.ts";

const require = createRequire(import.meta.url);
const T = require("../../public/js/app-tugas-ulang.js");
const A = require("../../public/js/app-verifikasi-ulang-admin.js");
const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");

const MS = "Memenuhi Syarat", BTL = "Berkas Tidak Lengkap", TMS = "Tidak Memenuhi Syarat";
const B = (k, dibuka) => ({ kunci: k, label: k.toUpperCase(), dibuka });

test("STATUS TUJUAN petugas sama dengan aturan server (tidak pernah naik ke Memenuhi Syarat)", () => {
  for (const dari of [MS, BTL, TMS, "Proses Verifikasi", ""]) {
    for (const ke of [MS, BTL, TMS]) {
      assert.equal(T.statusTujuan(dari).includes(ke), peralihanStatusDiizinkan(dari, ke), dari + " -> " + ke);
    }
  }
  assert.ok(!T.statusTujuan(BTL).includes(MS) && !T.statusTujuan(TMS).includes(MS) && !T.statusTujuan(MS).includes(MS));
});

test("VALIDASI layar meniru server: hasil layar 'siap' <=> server menerima (banyak kombinasi)", () => {
  const status = [MS, BTL, TMS];
  const berkasSet = [[], [B("a", true)], [B("a", true), B("b", false)], [B("a", true), B("b", true)]];
  let diuji = 0;
  for (const statusSaatIni of status) for (const mode of ["sesuai", "koreksi"]) for (const berkas of berkasSet)
    for (const centangSemua of [true, false]) for (const statusBaru of [MS, BTL, TMS, ""]) for (const alasan of ["", "  ", "KTP buram"]) {
      const centang = centangSemua ? Object.fromEntries(berkas.map((b) => [b.kunci, true])) : {};
      const layar = T.validasiPeriksa({ berkas, centang, mode, statusSaatIni, statusBaru, alasan });
      const server = cekSimpanHasil({
        hasil: mode === "sesuai" ? "SESUAI" : "DIKOREKSI", statusSebelum: statusSaatIni, statusSesudah: statusBaru, alasan,
        berkas: berkas.map((b) => ({ kunci: b.kunci, label: b.label, url: "u" })), berkasDibuka: berkas.filter((b) => b.dibuka).map((b) => b.kunci), centang, sudahDibuka: true,
      });
      assert.equal(layar.ok, server.ok, JSON.stringify({ statusSaatIni, mode, berkas: berkas.length, centangSemua, statusBaru, alasan, layar: layar.pesan, server: server.ok ? "ok" : server.pesan }));
      diuji++;
    }
  assert.ok(diuji > 500, "kombinasi diuji: " + diuji);
});

test("PESAN layar menyebut berkas yang kurang; Sesuai butuh centang, Koreksi cukup berkas dibuka + alasan", () => {
  const berkas = [B("ktp", true), B("buku", false)];
  assert.match(T.validasiPeriksa({ berkas, centang: {}, mode: "sesuai", statusSaatIni: MS }).pesan, /Belum dibuka: BUKU/);
  const buka = [B("ktp", true), B("buku", true)];
  assert.match(T.validasiPeriksa({ berkas: buka, centang: { ktp: true }, mode: "sesuai", statusSaatIni: MS }).pesan, /Belum dicentang: BUKU/);
  assert.equal(T.validasiPeriksa({ berkas: buka, centang: { ktp: true, buku: true }, mode: "sesuai", statusSaatIni: MS }).ok, true);
  assert.equal(T.validasiPeriksa({ berkas: buka, centang: {}, mode: "koreksi", statusSaatIni: MS, statusBaru: BTL, alasan: "x" }).ok, true, "koreksi tidak mewajibkan centang");
  assert.equal(T.validasiPeriksa({ berkas, centang: {}, mode: "koreksi", statusSaatIni: MS, statusBaru: BTL, alasan: "x" }).ok, false, "tetap wajib membuka semua berkas");
  assert.match(T.validasiPeriksa({ berkas: buka, centang: {}, mode: "koreksi", statusSaatIni: MS, statusBaru: BTL, alasan: " " }).pesan, /Alasan/);
  assert.equal(T.validasiPeriksa({ berkas: [], centang: {}, mode: "sesuai", statusSaatIni: MS }).ok, true, "tanpa berkas unggahan boleh Sesuai");
});

test("URL berkas: hanya http(s) yang dibuka", () => {
  assert.equal(T.urlBolehDibuka("https://drive.google.com/x"), true);
  assert.equal(T.urlBolehDibuka("http://x"), true);
  for (const u of ["javascript:alert(1)", "data:text/html,x", "file:///c:/x", "", null, "  ftp://x"]) assert.equal(T.urlBolehDibuka(u), false, String(u));
});

test("TEMPLAT: hanya aktif, status sama, layanan cocok (huruf besar/kecil), {LAYANAN} diisi", () => {
  const d = [
    { aktif: true, status: BTL, layanan: [], judul: "a", isi: "KTP {LAYANAN}" },
    { aktif: true, status: BTL, layanan: ["PENDETA"], judul: "b", isi: "x" },
    { aktif: false, status: BTL, layanan: [], judul: "c", isi: "x" },
    { aktif: true, status: TMS, layanan: [], judul: "d", isi: "x" },
  ];
  assert.deepEqual(T.templatUntuk(d, BTL, "imam masjid").map((x) => x.judul), ["a"]);
  assert.deepEqual(T.templatUntuk(d, BTL, "pendeta").map((x) => x.judul), ["a", "b"]);
  assert.equal(T.isiTemplat("KTP {LAYANAN}  buram", "imam masjid"), "KTP IMAM MASJID buram");
  assert.deepEqual(T.templatUntuk(null, BTL, "x"), []);
});

test("DAMPAK koreksi: BTL menyebut batas perbaikan; MS -> keluar dari calon pembayaran; sama seperti BATAS_PERBAIKAN_SERAGAM server", () => {
  assert.match(T.dampakKoreksi(MS, BTL), /calon pembayaran/);
  assert.match(T.dampakKoreksi(MS, BTL), /30-11-2026/);
  assert.doesNotMatch(T.dampakKoreksi(BTL, TMS), /calon pembayaran/);
  assert.equal(T.dampakKoreksi(MS, MS), "");
  const cfg = baca("supabase/functions/api/_shared/config.ts");
  assert.match(cfg, /BATAS_PERBAIKAN_SERAGAM = "2026-11-30"/, "teks dampak (30-11-2026) harus ikut berubah bila batas seragam berubah");
});

test("KEMAJUAN: persen dari selesai/(sisa+selesai), aman untuk nol", () => {
  assert.deepEqual(T.kemajuan(0, 0), { total: 0, persen: 0 });
  assert.deepEqual(T.kemajuan(8, 0), { total: 8, persen: 0 });
  assert.deepEqual(T.kemajuan(1, 3), { total: 4, persen: 75 });
  assert.deepEqual(T.kemajuan(0, 5), { total: 5, persen: 100 });
});

test("ESC: nama berbahaya tidak lolos sebagai HTML", () => {
  assert.equal(T.esc('<img src=x onerror="a()">&\''), "&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;");
  assert.equal(A.esc("<b>"), "&lt;b&gt;");
});

test("ADMIN: kriteria dinormalkan, status asing dibuang, jumlah dan tanggal dicek", () => {
  const k = A.susunKriteria({ nama: "  Paket 1 ", status: [MS, "Proses Verifikasi", BTL], layanan: [" IMAM MASJID ", ""], jumlah: "600", batasSelesai: "2026-11-20", sertakan: true, benih: " b " });
  assert.deepEqual(k, { nama: "Paket 1", status: [MS, BTL], layanan: ["IMAM MASJID"], jumlah: 600, batasSelesai: "2026-11-20", sertakanSudahDiperiksa: true, benih: "b" });
  assert.equal(A.susunKriteria({}).jumlah, 0);
  assert.equal(A.susunKriteria({ jumlah: -5 }).jumlah, 0);
  assert.equal(A.susunKriteria({ sertakan: "ya" }).sertakanSudahDiperiksa, false, "hanya boolean true");
  const sah = A.susunKriteria({ nama: "x", status: [MS], jumlah: 10, benih: "b" });
  assert.equal(A.validasiKriteria(sah, true), "");
  assert.match(A.validasiKriteria({ ...sah, status: [] }, false), /status/);
  assert.match(A.validasiKriteria({ ...sah, jumlah: 5001 }, false), /maksimal/);
  assert.match(A.validasiKriteria({ ...sah, batasSelesai: "20-11-2026" }, false), /Batas/);
  assert.match(A.validasiKriteria({ ...sah, nama: "" }, true), /Nama/);
  assert.match(A.validasiKriteria({ ...sah, benih: "" }, true), /pratinjau/);
  assert.equal(A.validasiKriteria({ ...sah, nama: "", benih: "" }, false), "", "pratinjau tidak butuh nama/benih");
});

test("ADMIN: sidik jari berubah bila SATU isian berubah (Bagikan hanya untuk pratinjau yang cocok), urutan pilihan tak berpengaruh", () => {
  const dasar = A.susunKriteria({ nama: "x", status: [MS, BTL], layanan: ["A", "B"], jumlah: 10, batasSelesai: "2026-11-20", benih: "b" });
  const s = A.sidik(dasar);
  assert.equal(A.sidik({ ...dasar, status: [BTL, MS], layanan: ["B", "A"] }), s, "urutan pilihan tidak mengubah sidik");
  for (const ubah of [{ status: [MS] }, { layanan: ["A"] }, { jumlah: 11 }, { batasSelesai: "2026-11-21" }, { sertakanSudahDiperiksa: true }, { benih: "c" }]) {
    assert.notEqual(A.sidik({ ...dasar, ...ubah }), s, JSON.stringify(ubah));
  }
  assert.equal(A.sidik({ ...dasar, nama: "lain" }), s, "nama tidak memengaruhi pembagian");
});

test("ADMIN: persen dan format tanggal", () => {
  assert.equal(A.persen(1, 3), 33); assert.equal(A.persen(5, 0), 0);
  assert.equal(A.tanggalPendek("2026-11-14T03:00:00.000Z"), "14-11-2026"); assert.equal(A.tanggalPendek(null), "");
  assert.equal(A.singkatStatus(BTL), "BTL");
});

test("KABEL: modul terdaftar per peran yang tepat (Admin hanya UTAMA, petugas hanya VERIFIKATOR) dan versi skrip sinkron", () => {
  const p = baca("public/js/app-pesan-periode.js");
  const utama = /UTAMA: \[([^\]]*)\]/.exec(p)[1], verif = /VERIFIKATOR: \[([^\]]*)\]/.exec(p)[1];
  assert.match(utama, /app-verifikasi-ulang-admin\.js/); assert.doesNotMatch(utama, /app-tugas-ulang\.js/);
  assert.match(verif, /app-tugas-ulang\.js/); assert.doesNotMatch(verif, /app-verifikasi-ulang-admin/);
  const idx = baca("index.html");
  assert.doesNotMatch(idx, /app-tugas-ulang|app-verifikasi-ulang-admin/, "tidak ada isi baru di index.html (dimuat malas)");
  // skrip inti (yang memuat daftar skrip per peran) harus memakai versi yang sama, supaya peramban pasti mengambil daftar terbaru
  const versiDari = (nama) => (new RegExp("/js/" + nama.replace(".", "\\.") + "\\?v=(\\d+)").exec(idx) || [])[1];
  const inti = ["api-bridge.js", "app-core.js", "app-transaksi.js", "app-admin.js", "app-pesan-periode.js"].map(versiDari);
  assert.ok(inti.every((v) => v && v === inti[0]), "versi skrip inti harus sama: " + inti);
  for (const f of ["app-tugas-ulang.js", "app-verifikasi-ulang-admin.js"]) {
    const src = baca("public/js/" + f);
    assert.doesNotMatch(src, /innerHTML\s*=\s*[^;]*\b(res|d|r|t)\.(nama|alasan|pesan)\b(?!.*esc)/, f + ": teks server harus lewat esc()");
    assert.doesNotMatch(src, /\bconfirm\(|\balert\(|\bprompt\(/, f + ": tanpa dialog bawaan browser");
  }
});
