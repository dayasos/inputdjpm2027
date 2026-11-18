// Uji bagian murni tab Verifikasi Awal/Ulang (petugas) dan panel Pembagian Awal (Admin) + kabel pemuatan per peran. Rencana: plans/plan-verifikasi-awal-bagi-rata.md
// Jalankan: npm run uji:tab-tugas-murni
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const T = require("../../public/js/app-tab-tugas.js");
const A = require("../../public/js/app-pembagian-awal-admin.js");
const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("TAB AWAL: tampil hanya saat pembagian NYALA dan akun pernah menerima tugas; label memuat sisa", () => {
  assert.equal(T.teksTabAwal(null), null);
  assert.equal(T.teksTabAwal({ aktif: false, sisa: 5, ditugaskan: 5 }), null, "saklar MATI -> tak ada tab");
  assert.equal(T.teksTabAwal({ aktif: true, sisa: 0, ditugaskan: 0 }), null, "belum pernah menerima -> tak ada tab");
  assert.equal(T.teksTabAwal({ aktif: true, sisa: 12, ditugaskan: 60 }), "Verifikasi Awal · 12");
  assert.equal(T.teksTabAwal({ aktif: true, sisa: 0, ditugaskan: 60 }), "Verifikasi Awal ✓");
});

test("TAB ULANG: tampil bila masih ada tugas atau sudah ada yang selesai", () => {
  assert.equal(T.teksTabUlang(null), null);
  assert.equal(T.teksTabUlang({ sisa: 0, selesai: 0 }), null);
  assert.equal(T.teksTabUlang({ sisa: 4, selesai: 0 }), "Verifikasi Ulang · 4");
  assert.equal(T.teksTabUlang({ sisa: 0, selesai: 9 }), "Verifikasi Ulang ✓");
});

test("TAMPILAN AWAL: terbuka otomatis hanya bila ada tugas tersisa, sekali per sesi, dan tidak menimpa pilihan tab pengguna", () => {
  const dasar = { awal: { aktif: true, sisa: 12, ditugaskan: 60 }, mode: "", sudahPilih: false, sudahBuka: false };
  assert.equal(T.perluBukaOtomatis(dasar), true);
  assert.equal(T.perluBukaOtomatis({ ...dasar, awal: { aktif: false, sisa: 12, ditugaskan: 60 } }), false, "saklar MATI");
  assert.equal(T.perluBukaOtomatis({ ...dasar, awal: { aktif: true, sisa: 0, ditugaskan: 60 } }), false, "semua tugas selesai: tetap Lihat Data");
  assert.equal(T.perluBukaOtomatis({ ...dasar, awal: { aktif: true, sisa: 0, ditugaskan: 0 } }), false, "belum pernah menerima (mis. pimpinan)");
  assert.equal(T.perluBukaOtomatis({ ...dasar, awal: null }), false);
  assert.equal(T.perluBukaOtomatis({ ...dasar, mode: "ulang" }), false, "sudah di tab tugas");
  assert.equal(T.perluBukaOtomatis({ ...dasar, sudahPilih: true }), false, "pengguna sudah memilih tab sendiri");
  assert.equal(T.perluBukaOtomatis({ ...dasar, sudahBuka: true }), false, "sekali per sesi");
  assert.equal(T.perluBukaOtomatis(null), false);
});

test("PENYARING: hanya baris dengan id tugas yang lolos; mode kosong = tidak membatasi; id teks dinormalkan", () => {
  assert.equal(T.buatPenyaring("", [1, 2]), null);
  const f = T.buatPenyaring("awal", [701, "702"]);
  assert.equal(f([701, "A"]), true);
  assert.equal(f(["702", "B"]), true);
  assert.equal(f([703, "C"]), false, "data milik orang lain tidak tampil");
  assert.equal(f(null), false);
  assert.equal(f([]), false);
  const kosong = T.buatPenyaring("ulang", []);
  assert.equal(kosong([1]), false, "tanpa id tiba, tabel kosong (tidak menampilkan data yang bukan tugasnya)");
});

test("BANNER: teks sesuai mode; tidak ada catatan batas 50 (seluruh tugas ditampilkan)", () => {
  assert.match(T.teksBanner("awal", 61), /61 data Verifikasi Awal.*Detail/);
  assert.match(T.teksBanner("ulang", 120), /120 data Verifikasi Ulang.*Periksa/);
  assert.doesNotMatch(T.teksBanner("ulang", 120), /Hanya 50/);
  assert.equal(T.teksBanner("", 5), "");
});

test("ESC: menetralkan HTML", () => {
  assert.equal(T.esc('<img src=x onerror="a()">&\''), "&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;");
});

test("ADMIN: selisih hanya antar akun PENERIMA (pimpinan dan nonaktif tidak dihitung)", () => {
  const akun = [
    { username: "a", jumlah: 106, aktif: true }, { username: "b", jumlah: 105, aktif: true },
    { username: "pimpinan", jumlah: 3, aktif: true, dikecualikan: true }, { username: "nonaktif", jumlah: 0, aktif: false },
  ];
  assert.equal(A.selisihJumlah(akun), 1);
  assert.equal(A.akunPenerima(akun).length, 2);
  assert.equal(A.selisihJumlah([]), 0);
});

test("ADMIN: urutan tabel: penerima dulu (jumlah terbesar di atas), yang tidak menerima di bawah", () => {
  const u = A.urutAkun([{ username: "x", jumlah: 1, dikecualikan: true }, { username: "b", jumlah: 5 }, { username: "a", jumlah: 9 }, { username: "n", jumlah: 99, aktif: false }]);
  assert.deepEqual(u.map((a) => a.username), ["a", "b", "n", "x"]);
});

test("ADMIN: Nyalakan hanya bila saklar MATI dan pratinjau sukses sudah dilihat", () => {
  assert.equal(A.bolehNyalakan({ aktif: false }, { sukses: true }), true);
  assert.equal(A.bolehNyalakan({ aktif: false }, null), false);
  assert.equal(A.bolehNyalakan({ aktif: true }, { sukses: true }), false);
  assert.equal(A.bolehNyalakan({ aktif: false }, { sukses: false }), false);
  assert.equal(A.bolehNyalakan(null, { sukses: true }), false);
});

test("KABEL: modul Admin hanya untuk UTAMA, modul tab hanya untuk VERIFIKATOR; versi pemuat dinaikkan", () => {
  const src = baca("public/js/app-pesan-periode.js");
  const peta = src.match(/var SKRIP_PER_PERAN = \{([\s\S]*?)\n  \};/)[1];
  const baris = (peran) => (peta.match(new RegExp("(^|\\n)\\s*" + peran + ": \\[([^\\]]*)\\]")) || [])[2] || "";
  assert.match(baris("UTAMA"), /app-pembagian-awal-admin\.js/);
  assert.doesNotMatch(baris("UTAMA"), /app-tab-tugas\.js/);
  assert.match(baris("VERIFIKATOR"), /app-tab-tugas\.js/);
  assert.match(baris("VERIFIKATOR"), /app-tugas-ulang\.js/, "panel pemeriksaan berkas tetap dimuat untuk tab Verifikasi Ulang");
  assert.doesNotMatch(baris("VERIFIKATOR"), /app-pembagian-awal-admin\.js/);
  assert.doesNotMatch(baris("MUI"), /awal|tab-tugas/);
  const html = baca("index.html");
  const v = (n) => Number((html.match(new RegExp("/js/" + n + "\\.js\\?v=(\\d+)")) || [])[1]);
  assert.ok(v("app-pesan-periode") >= 20271088 && v("app-pesan-periode") === v("api-bridge"), "versi pemuat skrip peran dinaikkan bersama: " + v("app-pesan-periode") + " / " + v("api-bridge"));
  assert.ok(!fs.existsSync(new URL("../../public/js/app-tugas-awal.js", import.meta.url)), "modul pil lama sudah dihapus");
});

test("KABEL: kait penyaring di Lihat Data ada; modul tab tidak memanggil aksi tulis; nama/tombol membuka Detail BIASA (tanpa panel); Detail Ulang memakai kotak Verifikasi Ulang", () => {
  const tr = baca("public/js/app-transaksi.js");
  assert.match(tr, /const lolosTugas = typeof window\.djpmLolosTugas !== 'function' \|\| window\.djpmLolosTugas\(row\);/);
  assert.match(tr, /lolosPenginput && lolosTugas\) dataLolosSaring\.push\(row\)/, "penyaring ikut menentukan baris yang tampil");
  const t = baca("public/js/app-tab-tugas.js");
  assert.doesNotMatch(t, /verifikasiSatuData|aturPembagianAwal|bagiSekarangAwal|simpanHasilUlang|bukaTugasUlang'/, "modul tab hanya membaca");
  assert.match(t, /rpc\(aksi, \[1\]\)/);
  assert.doesNotMatch(t, /bukaTugasUlangUntukPenerima|pasangPembungkus|__djpmTabTugasDibungkus/, "Detail tidak lagi dialihkan ke panel");
  assert.match(t, /e\.target\.closest\('#body-tabel-lihat td'\)/, "klik pada nama (sel baris) membuka Detail");
  assert.match(t, /api\.tugasIdUntuk = /); assert.match(t, /api\.setelahUlangSelesai = /); assert.match(t, /api\.modeSekarang = /);
  assert.match(t, /e\.isTrusted/, "klik otomatis aplikasi tidak dihitung sebagai pilihan pengguna");
  const ul = baca("public/js/app-tugas-ulang.js");
  assert.doesNotMatch(ul, /akar\.bukaTugasUlang|djpm-tul-overlay|djpm-tul-pil|tul-daftar/, "panel dan tombol melayang lama tidak ada lagi");
  assert.match(ul, /getElementById\('riwayat-edit-wrap'\)/, "kotak dipasang di halaman Detail");
  assert.match(ul, /rpc\('bukaTugasUlang', \[tugasId\]\)/); assert.match(ul, /rpc\('catatBerkasDibuka', \[tugasId, kunci\]\)/); assert.match(ul, /rpc\('simpanHasilUlang', \[d\.tugasId, masuk\]\)/);
  const tr2 = baca("public/js/app-transaksi.js");
  assert.match(tr2, /id="riwayat-edit-wrap"/, "penanda tempat kotak masih ada di Detail");
});
