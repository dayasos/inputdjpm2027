// Kolom tanggal lahir yang DIKETIK di /cek-status (public/cek-status-tanggal.js). Jalankan: npm run uji:cek-status-tanggal
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { rapikan, periksa, posisiSetelahAngka } = createRequire(import.meta.url)("../../public/cek-status-tanggal.js");
const HARI_INI = "2026-10-28";

test("mengetik angka satu per satu: pemisah muncul otomatis, tanpa tersangkut saat dihapus", () => {
  const langkah = { "3": "3", "31": "31", "311": "31-1", "3112": "31-12", "31121": "31-12-1", "311219": "31-12-19", "31121990": "31-12-1990" };
  for (const [ketik, hasil] of Object.entries(langkah)) assert.equal(rapikan(ketik), hasil, ketik);
  // Tombol hapus: nilai terformat dikurangi satu karakter harus tetap bisa dikurangi.
  assert.equal(rapikan("31-12-199"), "31-12-199");
  assert.equal(rapikan("31-12-"), "31-12");
  assert.equal(rapikan("31-1"), "31-1");
  assert.equal(rapikan("31-"), "31");
  assert.equal(rapikan(""), "");
});

test("hanya angka: huruf dan simbol dibuang, maksimal 8 angka", () => {
  assert.equal(rapikan("ab3c1x1y2z"), "31-12");
  assert.equal(rapikan("3112199012345"), "31-12-1990");
  assert.equal(rapikan("   "), "");
  assert.equal(rapikan(null), "");
  assert.equal(rapikan(undefined), "");
});

test("tempelan berbagai format dipahami", () => {
  for (const [masuk, hasil] of [
    ["31/12/1990", "31-12-1990"], ["31.12.1990", "31-12-1990"], ["31-12-1990", "31-12-1990"],
    ["1/2/1990", "01-02-1990"], ["1.2.1990", "01-02-1990"], ["01 02 1990", "01-02-1990"],
    ["1990-12-31", "31-12-1990"], ["1990/2/1", "01-02-1990"], [" 31/12/1990 ", "31-12-1990"],
  ]) assert.equal(rapikan(masuk), hasil, masuk);
});

const ketikSatuPerSatu = (urutan) => { let v = ""; for (const c of urutan) v = rapikan(v + c); return v; };

test("mengetik MANUAL dengan pemisah, satu karakter demi satu: bagian yang ditutup pemisah dilengkapi nol", () => {
  for (const [urutan, hasil] of [
    ["1/2/1990", "01-02-1990"], ["1-2-1990", "01-02-1990"], ["1.2.1990", "01-02-1990"], ["31/12/1990", "31-12-1990"],
    ["1/12/1990", "01-12-1990"], ["12/1/1990", "12-01-1990"], ["5-6-2001", "05-06-2001"], ["31-12-1990", "31-12-1990"], ["01011990", "01-01-1990"],
  ]) {
    assert.equal(ketikSatuPerSatu(urutan), hasil, urutan);
    assert.equal(periksa(ketikSatuPerSatu(urutan), HARI_INI).status, "ok", urutan);
  }
  // Langkah antara tidak aneh: "1-" -> "01", "1-2" -> "01-2", "1-2-" -> "01-02".
  assert.equal(rapikan("1-"), "01");
  assert.equal(rapikan("1-2"), "01-2");
  assert.equal(rapikan("1-2-"), "01-02");
});

test("tombol hapus dari tanggal penuh turun satu demi satu tanpa tersangkut", () => {
  const urutan = ["01-02-1990", "01-02-199", "01-02-19", "01-02-1", "01-02", "01-0", "01", "0", ""];
  let v = urutan[0];
  for (let i = 1; i < urutan.length; i++) {
    v = rapikan(v.slice(0, -1));
    assert.equal(v, urutan[i], "setelah hapus ke-" + i);
  }
});

test("posisiSetelahAngka: kursor tetap sesudah angka yang sama setelah dirapikan", () => {
  assert.equal(posisiSetelahAngka("31-12-1990", 0), 0);
  assert.equal(posisiSetelahAngka("31-12-1990", 1), 1);
  assert.equal(posisiSetelahAngka("31-12-1990", 2), 2);
  assert.equal(posisiSetelahAngka("31-12-1990", 3), 4);   // sesudah "31-1"
  assert.equal(posisiSetelahAngka("31-12-1990", 8), 10);
  assert.equal(posisiSetelahAngka("31-12", 99), 5);        // lebih dari yang ada -> ujung
});

test("rapikan idempoten (hasilnya tidak berubah bila dirapikan lagi) pada 20.000 masukan acak", () => {
  const abjad = "0123456789-/. aZ";
  let seed = 12345;
  const acak = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 20000; i++) {
    let s = "";
    for (let j = 0, n = Math.floor(acak() * 14); j < n; j++) s += abjad[Math.floor(acak() * abjad.length)];
    const r = rapikan(s);
    assert.equal(rapikan(r), r, JSON.stringify(s));
    assert.match(r, /^(\d{0,2}|\d{2}-\d{1,2}|\d{2}-\d{2}-\d{1,4})$/, JSON.stringify(s));
  }
});

test("periksa: tanggal sah -> iso dan teks ramah", () => {
  assert.deepEqual(periksa("31-12-1990", HARI_INI), { status: "ok", iso: "1990-12-31", teks: "31 Desember 1990" });
  assert.deepEqual(periksa("01-01-1900", HARI_INI), { status: "ok", iso: "1900-01-01", teks: "1 Januari 1900" });
  assert.equal(periksa("28-10-2026", HARI_INI).status, "ok"); // hari ini
  assert.equal(periksa("29-02-2000", HARI_INI).status, "ok"); // kabisat
});

test("periksa: tanggal tidak sah ditolak dengan pesan", () => {
  for (const t of ["31-02-1990", "29-02-1900", "29-02-2001", "00-01-1990", "01-00-1990", "01-13-1990", "32-01-1990", "31-04-1990"]) {
    const h = periksa(t, HARI_INI);
    assert.equal(h.status, "salah", t);
    assert.ok(h.pesan && !("iso" in h), t);
  }
  assert.equal(periksa("31-12-1899", HARI_INI).status, "salah");
  assert.equal(periksa("29-10-2026", HARI_INI).status, "salah"); // besok
  assert.equal(periksa("01-01-2999", HARI_INI).status, "salah");
});

test("periksa: belum lengkap -> 'belum' (tidak ada pesan galat saat masih mengetik); kosong -> 'kosong'", () => {
  for (const t of ["3", "31", "31-1", "31-12", "31-12-1", "31-12-199"]) assert.equal(periksa(t, HARI_INI).status, "belum", t);
  assert.equal(periksa("", HARI_INI).status, "kosong");
  assert.equal(periksa(null, HARI_INI).status, "kosong");
});

test("periksa: isi yang bukan hasil rapikan tidak pernah dianggap sah", () => {
  for (const t of ["1990-12-31", "31/12/1990", "31-12-90", "3-1-1990", "31-12-19900", " 31-12-1990"]) assert.notEqual(periksa(t, HARI_INI).status, "ok", t);
});

test("alur lengkap: ketik -> rapikan -> periksa memberi iso yang dikirim ke server", () => {
  assert.equal(periksa(rapikan("01011990"), HARI_INI).iso, "1990-01-01");
  assert.equal(periksa(rapikan("1/1/1990"), HARI_INI).iso, "1990-01-01");
  assert.equal(periksa(rapikan("1990-01-01"), HARI_INI).iso, "1990-01-01");
});
