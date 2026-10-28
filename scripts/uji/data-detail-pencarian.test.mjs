// Uji F1 pencarian (plan: plans/plan-cari-rumah-ibadah-pengurus.md): pencarian per kata Lihat Data + kotak cari/filter Data Detail.
// Mengeksekusi potongan kode ASLI dari public/js/app-transaksi.js dengan DOM tiruan minimal (tanpa browser).
// Jalankan: npm run uji:pencarian     (Node 24+)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SUMBER = fs.readFileSync("public/js/app-transaksi.js", "utf8").replace(/\r/g, "");
const COVER = fs.readFileSync("public/js/app-cover-berkas.js", "utf8").replace(/\r/g, "");
const ambil = (re, nama) => { const m = SUMBER.match(re); assert.ok(m, "potongan kode tidak ditemukan: " + nama); return m[0]; };

const util = ambil(/function normalisasiCari[\s\S]*?function teksCariBarisLihat[\s\S]*?\n\}/, "util pencarian");
const blokDd = ambil(/let _ddSemua = \[\];[\s\S]*?function renderTabelDataDetail[\s\S]*?\n\}\n/, "blok Data Detail");

// ------------------------------ util pencarian (Lihat Data) ------------------------------
const { normalisasiCari, cocokKataKunci, teksCariBarisLihat } = new Function(util + "; return { normalisasiCari, cocokKataKunci, teksCariBarisLihat };")();
const BARIS = [1, "BUDI", "1271", "L", "M", "d", "JL MAWAR 5", "IMAM MASJID", "MASJID  AL-IKHLAS", "JL  MELATI 2", "a", "b", "c", "d", "e", "0812"];

test("Lihat Data: cari per kata, urutan bebas, spasi ganda diabaikan, kolom tempat/alamat tugas & alamat ikut dicari", () => {
  const t = teksCariBarisLihat(BARIS);
  for (const k of ["ikhlas masjid", "  AL-IKHLAS ", "melati", "mawar", "0812", "1271", "budi"]) assert.equal(cocokKataKunci(t, k), true, k);
  assert.equal(cocokKataKunci(t, "masjid raya"), false);
  assert.equal(cocokKataKunci(t, ""), true);
  assert.equal(cocokKataKunci(t, "   "), true);
});

test("Lihat Data: kolom kosong/null tidak menjadi teks 'undefined'/'null'", () => {
  const t = teksCariBarisLihat([0, null, undefined, "", "", "", "", "", null, undefined, "", "", "", "", "", ""]);
  assert.doesNotMatch(t, /undefined|null/);
});

// ------------------------------ Data Detail ------------------------------
const els = {};
const buatEl = (id) => (els[id] = { id, value: "", innerHTML: "", innerText: "", textContent: "", children: [], appendChild(o) { this.children.push(o); },
  set innerHTMLset(_) { } });
const ID = ["dd-cari", "dd-filter-kec", "dd-filter-kel", "dd-filter-lay", "body-tabel-data-detail", "info-total-data-detail", "info-halaman-data-detail"];
function pasangEl() {
  for (const id of ID) {
    const e = buatEl(id);
    let isi = "";
    Object.defineProperty(e, "innerHTML", { get: () => isi, set: (v) => { isi = v; if (v === "") e.children = []; } });
  }
}
const document = { getElementById: (id) => els[id] || null, createElement: () => ({ value: "", textContent: "" }) };
const log = { digambar: 0, nav: 0 };

function muatModul() {
  pasangEl();
  log.digambar = 0; log.nav = 0;
  const kode = util + blokDd + `
    let _ddRows = [], _ddHalaman = 1, _ddSudahTampil = false; const DD_PER_HALAMAN = 50;
    function _lepasObserverDataDetail() {} function _perbaruiNavDataDetail() { log.nav++; }
    function _gambarHalamanDataDetail(p) { log.digambar = _ddRows.length; log.pertahankan = p; }
    function _urutkanDataDetail(r) { return r.slice(); }
    return { render: renderTabelDataDetail, saring: (...a) => window.saringDataDetail(...a), reset: _resetFilterDataDetail,
      semua: () => _ddSemua, tampil: () => _ddRows, sudah: (v) => { if (v !== undefined) _ddSudahTampil = v; return _ddSudahTampil; } };`;
  return new Function("document", "window", "log", "setTimeout", "clearTimeout", kode)(document, {}, log, setTimeout, clearTimeout);
}
const ROWS = () => [
  { nama: "BUDI", nik: "1", layanan: "IMAM MASJID", tempatTugas: "MASJID AL-IKHLAS", alamatTugas: "JL MELATI 2", kecamatan: "MEDAN TIMUR", kelurahan: "GLUGUR" },
  { nama: "SITI", nik: "2", layanan: "NAZIR MASJID", tempatTugas: "MASJID RAYA", alamatTugas: "JL SUDIRMAN", kecamatan: "MEDAN BARAT", kelurahan: "KESAWAN" },
  { nama: "ANI", nik: "3", layanan: "PENGURUS GEREJA", tempatTugas: "GEREJA HKBP", alamatTugas: "JL MELATI 9", kecamatan: "MEDAN TIMUR", kelurahan: "PERINTIS" },
];
const set = (id, v) => { els[id].value = v; };

test("Data Detail: cari + filter mempersempit _ddRows tetapi _ddSemua (sumber cover) tetap utuh", () => {
  const m = muatModul();
  m.render(ROWS());
  assert.equal(m.tampil().length, 3);
  set("dd-cari", "melati"); m.saring(false);
  assert.equal(m.tampil().length, 2);
  set("dd-cari", "ikhlas masjid"); m.saring(false);
  assert.equal(m.tampil().length, 1);
  set("dd-cari", ""); set("dd-filter-kec", "MEDAN TIMUR"); m.saring(false, true);
  assert.equal(m.tampil().length, 2);
  set("dd-filter-lay", "IMAM MASJID"); m.saring(false);
  assert.equal(m.tampil().length, 1);
  assert.equal(m.semua().length, 3, "_ddSemua tidak boleh ikut tersaring");
  assert.match(els["info-total-data-detail"].innerText, /Ditemukan 1 dari 3/);
});

test("Data Detail: ganti Kecamatan membatasi opsi Kelurahan dan mengosongkan pilihan Kelurahan lama", () => {
  const m = muatModul();
  m.render(ROWS());
  set("dd-filter-kel", "KESAWAN");
  set("dd-filter-kec", "MEDAN TIMUR"); m.saring(false, true);
  const opsi = els["dd-filter-kel"].children.map((o) => o.value);
  assert.deepEqual(opsi, ["", "GLUGUR", "PERINTIS"]);
  assert.equal(els["dd-filter-kel"].value, "");
  assert.equal(m.tampil().length, 2);
});

test("Data Detail: tidak ada hasil -> pesan 'Tidak ada data yang sesuai'; data memang kosong -> 'Belum ada data'", () => {
  const m = muatModul();
  m.render(ROWS());
  set("dd-cari", "zzz"); m.saring(false);
  assert.equal(m.tampil().length, 0);
  assert.match(els["body-tabel-data-detail"].innerHTML, /Tidak ada data yang sesuai/);
  const k = muatModul();
  k.render([]);
  assert.match(els["body-tabel-data-detail"].innerHTML, /Belum ada data Memenuhi Syarat/);
});

test("Data Detail: mengetik saat data BELUM selesai dimuat tidak menimpa kerangka loading / pesan galat", () => {
  const m = muatModul();
  els["body-tabel-data-detail"].innerHTML = "<tr>SKELETON</tr>";
  set("dd-cari", "budi"); m.saring(false);
  assert.equal(els["body-tabel-data-detail"].innerHTML, "<tr>SKELETON</tr>");
  m.render(ROWS()); // data tiba -> teks yang sudah diketik langsung dipakai
  assert.equal(m.tampil().length, 1);
});

test("Data Detail: muat ulang (realtime) mempertahankan filter & opsi yang masih ada; opsi yang hilang direset", () => {
  const m = muatModul();
  m.render(ROWS());
  set("dd-filter-kec", "MEDAN TIMUR"); m.saring(false, true);
  m.render(ROWS());
  assert.equal(els["dd-filter-kec"].value, "MEDAN TIMUR");
  assert.equal(m.tampil().length, 2);
  assert.equal(log.pertahankan, true);
  m.render(ROWS().filter((r) => r.kecamatan !== "MEDAN TIMUR"));
  assert.equal(els["dd-filter-kec"].value, "");
  assert.equal(m.tampil().length, 1);
});

test("Data Detail: dibuka ulang -> filter dikosongkan dan opsi lama dibuang", () => {
  const m = muatModul();
  m.render(ROWS());
  set("dd-cari", "budi"); set("dd-filter-lay", "IMAM MASJID");
  m.semua().length = 0; // tampilkanDataDetail(): _ddSemua = []
  m.reset();
  assert.equal(els["dd-cari"].value, "");
  assert.equal(els["dd-filter-lay"].value, "");
  assert.deepEqual(els["dd-filter-kec"].children.map((o) => o.value), [""]);
});

// ------------------------------ kabel ke berkas lain ------------------------------
test("Cover berkas membaca SELURUH data (_ddSemua), bukan hasil saringan (_ddRows)", () => {
  const fn = COVER.match(/function barisLayar\(\)[\s\S]*?\n  \}/);
  assert.ok(fn, "barisLayar tidak ditemukan");
  const jalankan = (semua, rows) => new Function("_ddSemua", "_ddRows", fn[0] + "; return barisLayar();")(semua, rows);
  const penuh = [{ nik: "1" }, { nik: "2" }, { nik: "3" }], tersaring = [{ nik: "2" }];
  assert.equal(jalankan(penuh, tersaring), penuh, "harus mengembalikan seluruh data, bukan yang tersaring");
  assert.equal(jalankan(undefined, tersaring), tersaring, "cadangan ke _ddRows bila _ddSemua tidak ada");
  assert.equal(jalankan(undefined, undefined), null);
});

test("Semua penyaring Lihat Data (tabel, ekspor, ekspor Memenuhi Syarat) memakai cocokKataKunci yang sama", () => {
  const jumlah = (SUMBER.match(/cocokKataKunci\(/g) || []).length;
  assert.ok(jumlah >= 5, "dipakai di tabel, 2 ekspor, Data Detail (+definisi): " + jumlah);
  assert.doesNotMatch(SUMBER, /teksGabungan\.includes\(kataKunci\)/);
});
