// Penyematan wilayah fungsi (x-region) di klien (public/js/api-bridge.js), Worker (worker/index.js), dan CORS fungsi (supabase/functions/api/index.ts).
// Jalankan: npm run uji:cors-wilayah. Klien dijalankan di vm (tanpa peramban) dari kode ASLI; Worker dipanggil lewat export default dengan fetch tiruan.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const klienSrc = baca("public/js/api-bridge.js");
const indexTs = baca("supabase/functions/api/index.ts");

// ─────────────────────────────── CORS server ↔ klien ───────────────────────────────
const izinServer = () => {
  const m = indexTs.match(/"access-control-allow-headers":\s*"([^"]+)"/);
  assert.ok(m, "access-control-allow-headers tidak ditemukan di index.ts");
  return m[1].split(",").map((h) => h.trim().toLowerCase());
};

test("CORS server: mengizinkan x-region dan semua header lama (tidak ada yang hilang)", () => {
  const izin = izinServer();
  for (const h of ["authorization", "x-client-info", "apikey", "content-type", "x-session-token", "content-range", "x-region"]) {
    assert.ok(izin.includes(h), "header tidak diizinkan: " + h);
  }
});

test("CORS server: access-control-max-age ada, berupa angka detik, dan tidak melebihi batas Chrome (7200)", () => {
  const m = indexTs.match(/"access-control-max-age":\s*"(\d+)"/);
  assert.ok(m, "access-control-max-age tidak ditemukan di CORS_HEADERS");
  const detik = Number(m[1]);
  assert.ok(detik >= 600 && detik <= 7200, "di luar rentang wajar: " + detik);
  // Ada di objek CORS_HEADERS yang sama dengan allow-headers (dipakai pada jawaban OPTIONS).
  const blok = indexTs.slice(indexTs.indexOf("const CORS_HEADERS"), indexTs.indexOf("function json("));
  assert.match(blok, /access-control-allow-headers/);
  assert.match(blok, /access-control-max-age/);
});

test("PENJAGA: setiap header kustom yang dikirim klien di _fetchEdgeDirect TERCANTUM di CORS server (tanpa ini peramban memblokir SEMUA panggilan)", () => {
  const mulai = klienSrc.indexOf("async function _fetchEdgeDirect(");
  const akhir = klienSrc.indexOf("\n}\n", mulai);
  assert.ok(mulai > 0 && akhir > mulai, "fungsi tidak ditemukan");
  const badan = klienSrc.slice(mulai, akhir);
  const dikirim = new Set();
  for (const m of badan.matchAll(/headers\['([^']+)'\]\s*=/g)) dikirim.add(m[1].toLowerCase());
  for (const m of badan.matchAll(/^\s*'([A-Za-z][A-Za-z0-9-]*)':\s/gm)) dikirim.add(m[1].toLowerCase());
  assert.ok(dikirim.has("x-region") && dikirim.has("apikey") && dikirim.has("x-session-token"), "pemindai header tidak menemukan header yang diharapkan: " + [...dikirim].join(","));
  const izin = izinServer();
  for (const h of dikirim) assert.ok(izin.includes(h), `klien mengirim '${h}' tetapi server tidak mengizinkannya di CORS`);
});

test("KESESUAIAN: nama wilayah di klien sama dengan Worker", () => {
  const klien = klienSrc.match(/const _WILAYAH_FUNGSI = '([^']+)';/);
  const worker = baca("worker/index.js").match(/const WILAYAH_FUNGSI = '([^']+)';/);
  assert.ok(klien && worker);
  assert.equal(klien[1], worker[1]);
  assert.equal(klien[1], "ap-northeast-1", "wilayah database (Tokyo)");
});

// ─────────────────────────────── Perilaku klien (vm) ───────────────────────────────
const awal = klienSrc.indexOf("const _WILAYAH_FUNGSI");
const batas = klienSrc.indexOf("/**\n * Fetch via proxy Worker");
assert.ok(awal > 0 && batas > awal, "potongan klien tidak ditemukan");
const potongan = klienSrc.slice(awal, batas);

function buatKlien() {
  const jam = { sekarang: 1_000_000 };
  const panggilan = [];
  const antrean = [];                 // setiap elemen: Response-tiruan {status} atau Error untuk dilempar
  const fetchTiruan = async (url, opsi) => {
    panggilan.push({ url, headers: { ...opsi.headers }, body: opsi.body });
    const berikut = antrean.length ? antrean.shift() : { status: 200 };
    if (berikut instanceof Error) throw berikut;
    return berikut;
  };
  const peringatan = [];
  const konteks = {
    fetch: fetchTiruan, TypeError, Date: { now: () => jam.sekarang }, JSON,
    console: { warn: (m) => peringatan.push(String(m)) },
    _SUPABASE_EDGE_URL: "https://abc.supabase.co/functions/v1/api", _SUPABASE_ANON_KEY: "ANON",
  };
  const api = vm.runInNewContext(
    potongan + "; ({ kirim: _fetchEdgeDirect, aktif: _wilayahFungsiAktif, gagal: () => _gagalBeruntunWilayah })", konteks);
  return { ...api, jam, panggilan, antrean, peringatan };
}
const payload = { action: "ambilDataLihatDataHakAkses", args: ["tok"] };
const PINTAR = "x-region";
const adaWilayah = (p) => Object.prototype.hasOwnProperty.call(p.headers, PINTAR);

test("KLIEN: panggilan pertama membawa x-region=ap-northeast-1 beserta header lama; respons dikembalikan apa adanya", async () => {
  const k = buatKlien();
  const res = { status: 200, penanda: "asli" };
  k.antrean.push(res);
  const hasil = await k.kirim(payload, "TOKEN-SESI", undefined);
  assert.equal(hasil, res, "objek respons sama persis");
  const p = k.panggilan[0];
  assert.equal(p.headers[PINTAR], "ap-northeast-1");
  assert.equal(p.headers["x-session-token"], "TOKEN-SESI");
  assert.equal(p.headers["apikey"], "ANON");
  assert.equal(p.headers["Authorization"], "Bearer ANON");
  assert.equal(p.headers["Content-Type"], "application/json");
  assert.equal(p.body, JSON.stringify(payload), "badan permintaan tidak berubah");
});

test("KLIEN: tanpa token sesi, header x-session-token tidak dikirim (aksi publik) tetapi x-region tetap", async () => {
  const k = buatKlien();
  await k.kirim({ action: "loginPengguna", args: ["u", "p"] }, null, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(k.panggilan[0].headers, "x-session-token"), false);
  assert.equal(k.panggilan[0].headers[PINTAR], "ap-northeast-1");
});

test("KLIEN: TypeError (jaringan/CORS menolak header) -> galat yang SAMA dilempar ulang, header dilepas SEGERA 5 menit, lalu kembali", async () => {
  const k = buatKlien();
  const galat = new TypeError("Failed to fetch");
  k.antrean.push(galat);
  await assert.rejects(k.kirim(payload, "t", undefined), (e) => e === galat);
  assert.equal(k.aktif(), false);
  assert.match(k.peringatan[0], /dimatikan sementara/);
  await k.kirim(payload, "t", undefined);
  assert.equal(adaWilayah(k.panggilan[1]), false, "panggilan berikutnya tanpa header");
  k.jam.sekarang += 5 * 60 * 1000 - 1;
  await k.kirim(payload, "t", undefined);
  assert.equal(adaWilayah(k.panggilan[2]), false, "masih dalam jeda (1 ms sebelum habis)");
  k.jam.sekarang += 1;
  await k.kirim(payload, "t", undefined);
  assert.equal(adaWilayah(k.panggilan[3]), true, "setelah 5 menit kembali menyematkan wilayah");
});

test("KLIEN: 5 respons 5xx BERTURUT-TURUT melepas header; 4 lalu satu keberhasilan lalu 4 lagi TIDAK", async () => {
  const k = buatKlien();
  for (let i = 0; i < 4; i++) k.antrean.push({ status: 500 });
  k.antrean.push({ status: 200 });
  for (let i = 0; i < 4; i++) k.antrean.push({ status: 503 });
  for (let i = 0; i < 9; i++) await k.kirim(payload, "t", undefined);
  assert.equal(k.aktif(), true, "keberhasilan di tengah memutus runtunan");
  assert.equal(k.gagal(), 4);
  k.antrean.push({ status: 502 });
  await k.kirim(payload, "t", undefined);
  assert.equal(k.aktif(), false, "kegagalan ke-5 berturut-turut");
  assert.equal(k.gagal(), 0, "penghitung direset saat dimatikan");
});

test("KLIEN: 502/503/504 dihitung gagal; 400/401/404/413 TIDAK dihitung dan memutus runtunan", async () => {
  const k = buatKlien();
  for (const s of [502, 503, 504, 500]) k.antrean.push({ status: s });
  for (let i = 0; i < 4; i++) await k.kirim(payload, "t", undefined);
  assert.equal(k.gagal(), 4);
  k.antrean.push({ status: 413 });
  await k.kirim(payload, "t", undefined);
  assert.equal(k.gagal(), 0, "4xx memutus runtunan");
  for (const s of [400, 401, 404]) { k.antrean.push({ status: s }); await k.kirim(payload, "t", undefined); }
  assert.equal(k.gagal(), 0);
  assert.equal(k.aktif(), true);
});

test("KLIEN: timeout (AbortError) dihitung dalam runtunan tetapi TIDAK melepas header seketika (beda dengan TypeError)", async () => {
  const k = buatKlien();
  const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
  for (let i = 0; i < 4; i++) { k.antrean.push(abort); await assert.rejects(k.kirim(payload, "t", undefined), (e) => e === abort); }
  assert.equal(k.aktif(), true);
  assert.equal(k.gagal(), 4);
  k.antrean.push(abort);
  await assert.rejects(k.kirim(payload, "t", undefined), (e) => e === abort);
  assert.equal(k.aktif(), false, "timeout ke-5 berturut-turut");
});

test("KLIEN: saat header dilepas, hasil panggilan TIDAK ikut dicatat (tak memperpanjang jeda atau mengubah penghitung)", async () => {
  const k = buatKlien();
  k.antrean.push(new TypeError("x"));
  await assert.rejects(k.kirim(payload, "t", undefined));
  for (let i = 0; i < 8; i++) { k.antrean.push({ status: 500 }); await k.kirim(payload, "t", undefined); }
  assert.equal(k.gagal(), 0);
  k.jam.sekarang += 5 * 60 * 1000;
  assert.equal(k.aktif(), true, "jeda habis tepat 5 menit sejak pelepasan, tidak diperpanjang");
});

// ─────────────────────────────── Perilaku Worker ───────────────────────────────
const worker = (await import("../../worker/index.js")).default;
const ENV = { SUPABASE_EDGE_FUNCTION_URL: "https://abc.supabase.co/functions/v1/api", SUPABASE_ANON_KEY: "ANON", GAS_SECRET_TOKEN: "RAHASIA", ASSETS: { fetch: async () => new Response("aset") } };
const fetchAsli = globalThis.fetch;
function pasangFetch(urutan) {
  const catatan = [];
  globalThis.fetch = async (url, opsi) => {
    catatan.push({ url: String(url), headers: { ...(opsi.headers || {}) }, body: opsi.body });
    const berikut = urutan.length ? urutan.shift() : "ok";
    if (berikut instanceof Error) throw berikut;
    if (berikut === "ok") return new Response(JSON.stringify({ result: "pong" }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ galat: true }), { status: berikut });
  };
  return catatan;
}
const gas = (aksi, env = ENV) => worker.fetch(new Request("https://djpmkotamedan.web.id/api/gas", { method: "POST", body: JSON.stringify({ action: aksi, args: [] }) }), env);
test.afterEach(() => { globalThis.fetch = fetchAsli; });

test("WORKER: /api/gas menyematkan x-region dan tetap membawa apikey, Authorization, dan _secret", async () => {
  const c = pasangFetch([]);
  const r = await gas("ping");
  assert.equal(r.status, 200);
  assert.equal(c.length, 1);
  assert.equal(c[0].headers["x-region"], "ap-northeast-1");
  assert.equal(c[0].headers["apikey"], "ANON");
  assert.equal(c[0].headers["Authorization"], "Bearer ANON");
  assert.equal(JSON.parse(c[0].body)._secret, "RAHASIA");
});

test("WORKER: /api/health juga menyematkan x-region", async () => {
  const c = pasangFetch([]);
  const r = await worker.fetch(new Request("https://djpmkotamedan.web.id/api/health"), ENV);
  const j = await r.json();
  assert.equal(j.pingTest.ok, true);
  assert.equal(c[0].headers["x-region"], "ap-northeast-1");
});

test("WORKER: target BUKAN supabase.co (mis. lokal) tidak diberi x-region", async () => {
  const c = pasangFetch([]);
  await gas("ping", { ...ENV, SUPABASE_EDGE_FUNCTION_URL: "http://localhost:54321/functions/v1/api" });
  assert.equal(c.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(c[0].headers, "x-region"), false);
});

test("WORKER: kegagalan jaringan pada aksi AMAN (pulihkanSesi, ping, logoutPengguna, getMasterLayanan) diulang SEKALI tanpa x-region", async () => {
  for (const aksi of ["pulihkanSesi", "ping", "logoutPengguna", "getMasterLayanan"]) {
    const c = pasangFetch([new TypeError("fetch failed")]);
    const r = await gas(aksi);
    assert.equal(r.status, 200, aksi);
    assert.equal(c.length, 2, aksi);
    assert.equal(c[0].headers["x-region"], "ap-northeast-1");
    assert.equal(Object.prototype.hasOwnProperty.call(c[1].headers, "x-region"), false, aksi + ": percobaan kedua tanpa header");
  }
});

test("WORKER: aksi TULIS/lain TIDAK diulang saat gagal jaringan (hanya satu panggilan; galat dilaporkan)", async () => {
  for (const aksi of ["adminUbahData", "simpanDataKeSheet", "cekBatasWaktuVerifikasi", "resetPasswordUser"]) {
    const c = pasangFetch([new TypeError("fetch failed")]);
    const r = await gas(aksi);
    assert.equal(c.length, 1, aksi + " tidak boleh diulang");
    assert.equal(r.status, 500, "perilaku lama Worker (tidak diubah): galat koneksi = HTTP 500 berisi JSON");
    const j = await r.json();
    assert.ok(j.error, aksi + " harus melaporkan galat");
  }
});

test("WORKER: respons HTTP (walau 5xx) TIDAK diulang; kegagalan ganda pada aksi aman dilaporkan setelah tepat 2 panggilan", async () => {
  let c = pasangFetch([503]);
  await gas("ping");
  assert.equal(c.length, 1, "ada respons -> tidak diulang");
  c = pasangFetch([new TypeError("a"), new TypeError("b")]);
  const r = await gas("pulihkanSesi");
  assert.equal(c.length, 2);
  assert.ok((await r.json()).error);
});
