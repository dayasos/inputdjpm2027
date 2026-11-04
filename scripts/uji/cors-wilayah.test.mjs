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

const DTK = 1000;
const KEGAGALAN = () => [new TypeError("Failed to fetch"), { status: 500 }, { status: 503 }, Object.assign(new Error("aborted"), { name: "AbortError" })];
/** Kirim satu panggilan dan telan galatnya (uji ini hanya peduli pada keadaan pemutus). */
const coba = async (k) => { try { await k.kirim(payload, "t", undefined); } catch (_e) { /* diharapkan utk kegagalan */ } };
const jalankan = async (k, hasil) => { k.antrean.push(hasil); await coba(k); };

test("PEMUTUS: satu TypeError (galat DB tanpa header CORS saat lonjakan) TIDAK melepas header", async () => {
  const k = buatKlien();
  await jalankan(k, new TypeError("Failed to fetch"));
  assert.equal(k.aktif(), true);
  assert.equal(k.gagal(), 1);
  await k.kirim(payload, "t", undefined);
  assert.equal(adaWilayah(k.panggilan[1]), true, "panggilan berikutnya tetap bersepetak wilayah");
  assert.equal(k.gagal(), 0, "keberhasilan mereset runtunan");
});

test("PEMUTUS: galat sama dilempar ulang apa adanya (objek yang sama), baik TypeError maupun timeout", async () => {
  const k = buatKlien();
  const a = new TypeError("Failed to fetch"), b = Object.assign(new Error("aborted"), { name: "AbortError" });
  k.antrean.push(a); await assert.rejects(k.kirim(payload, "t", undefined), (e) => e === a);
  k.antrean.push(b); await assert.rejects(k.kirim(payload, "t", undefined), (e) => e === b);
});

test("PEMUTUS: LONJAKAN serempak (banyak kegagalan cepat dalam hitungan detik, lalu keberhasilan) TIDAK menyalakan pemutus", async () => {
  const k = buatKlien();
  const campur = KEGAGALAN();
  for (let i = 0; i < 12; i++) k.antrean.push(campur[i % campur.length]);
  for (let i = 0; i < 12; i++) await coba(k);                    // 12 kegagalan pada detik yang sama (jam tidak maju)
  assert.equal(k.aktif(), true, "12 kegagalan dalam 0 detik: durasi < 30 dtk");
  await k.kirim(payload, "t", undefined);                        // keberhasilan menyusul
  assert.equal(k.gagal(), 0);
  assert.equal(k.aktif(), true);
});

test("PEMUTUS: lonjakan BERULANG selama 10 menit (tiap 20 dtk: 8 kegagalan cepat lalu keberhasilan) tidak pernah menyala", async () => {
  const k = buatKlien();
  const campur = KEGAGALAN();
  for (let putaran = 0; putaran < 30; putaran++) {
    for (let i = 0; i < 8; i++) { k.antrean.push(campur[i % campur.length]); await coba(k); k.jam.sekarang += 100; }
    await k.kirim(payload, "t", undefined);
    k.jam.sekarang += 20 * DTK;
  }
  assert.equal(k.aktif(), true);
});

test("PEMUTUS: gangguan BERKEPANJANGAN menyala tepat saat kegagalan >= 30 dtk dan >= 5 kali (29,999 dtk belum, 30 dtk menyala)", async () => {
  const k = buatKlien();
  for (let i = 0; i < 4; i++) { await jalankan(k, { status: 502 }); k.jam.sekarang += 1 * DTK; }   // t=0,1,2,3 -> 4 kegagalan
  k.jam.sekarang = 1_000_000 + 29_999;
  await jalankan(k, { status: 502 });                                                             // kegagalan ke-5 pada t=29,999 dtk
  assert.equal(k.aktif(), true, "29,999 dtk: belum");
  k.jam.sekarang = 1_000_000 + 30_000;
  await jalankan(k, { status: 502 });                                                             // kegagalan ke-6 pada t=30 dtk
  assert.equal(k.aktif(), false, "30 dtk: menyala");
  assert.match(k.peringatan[0], /dimatikan sementara/);
});

test("PEMUTUS: gangguan CORS sungguhan (SEMUA panggilan TypeError terus-menerus) tertangkap dalam ±30 dtk; panggilan sesudahnya tanpa header; kembali setelah 5 menit", async () => {
  const k = buatKlien();
  let menyalaPada = null, terakhirGagal = null;
  for (let t = 0; t <= 60; t += 2) {
    k.jam.sekarang = 1_000_000 + t * DTK;
    if (!k.aktif()) { menyalaPada = terakhirGagal; break; }     // yang memicu pemutus = kegagalan terakhir sebelum teramati mati
    terakhirGagal = t;
    await jalankan(k, new TypeError("Failed to fetch"));
  }
  assert.ok(menyalaPada !== null && menyalaPada >= 30 && menyalaPada <= 32, "menyala pada kegagalan di detik " + menyalaPada);
  const jumlahSebelum = k.panggilan.length;
  await k.kirim(payload, "t", undefined);
  assert.equal(adaWilayah(k.panggilan[jumlahSebelum]), false, "tanpa header setelah pemutus menyala");
  k.jam.sekarang = 1_000_000 + menyalaPada * DTK + 5 * 60 * DTK - 1;     // jeda dihitung dari kegagalan yang memicu pemutus
  assert.equal(k.aktif(), false, "1 ms sebelum 5 menit: masih dilepas");
  k.jam.sekarang += 1;
  assert.equal(k.aktif(), true, "tepat 5 menit kemudian kembali menyematkan wilayah");
});

test("PEMUTUS: satu keberhasilan di tengah memutus runtunan (4 gagal, sukses, lalu 4 gagal 31 dtk kemudian tidak menyala)", async () => {
  const k = buatKlien();
  for (let i = 0; i < 4; i++) await jalankan(k, { status: 500 });
  await k.kirim(payload, "t", undefined);
  assert.equal(k.gagal(), 0);
  k.jam.sekarang += 31 * DTK;
  for (let i = 0; i < 4; i++) await jalankan(k, { status: 500 });
  assert.equal(k.gagal(), 4, "runtunan baru dihitung dari awal");
  assert.equal(k.aktif(), true);
});

test("PEMUTUS: kegagalan jarang tetapi terus-menerus (1 per 10 dtk, tanpa keberhasilan) menyala pada kegagalan ke-5 (t=40 dtk)", async () => {
  const k = buatKlien();
  for (let t = 0; t <= 40; t += 10) {
    k.jam.sekarang = 1_000_000 + t * DTK;
    await jalankan(k, { status: 503 });
    if (t < 40) assert.equal(k.aktif(), true, "t=" + t);
  }
  assert.equal(k.aktif(), false);
});

test("PEMUTUS: 4xx (400/401/404/413) dihitung BERHASIL (wilayah melayani) dan memutus runtunan; 500/502/503/504 dihitung gagal", async () => {
  const k = buatKlien();
  for (const s of [500, 502, 503, 504]) await jalankan(k, { status: s });
  assert.equal(k.gagal(), 4);
  for (const s of [413, 400, 401, 404]) { await jalankan(k, { status: s }); assert.equal(k.gagal(), 0, "HTTP " + s); }
  assert.equal(k.aktif(), true);
});

test("PEMUTUS: saat header sudah dilepas, hasil panggilan TIDAK dicatat dan jeda tidak diperpanjang", async () => {
  const k = buatKlien();
  for (let t = 0; t <= 40; t += 5) { k.jam.sekarang = 1_000_000 + t * DTK; if (!k.aktif()) break; await jalankan(k, { status: 503 }); }
  assert.equal(k.aktif(), false);
  const mulaiJeda = k.jam.sekarang;
  for (let i = 0; i < 8; i++) { k.jam.sekarang += 10 * DTK; await jalankan(k, { status: 500 }); }
  assert.equal(k.gagal(), 0, "tidak dihitung selama dilepas");
  k.jam.sekarang = mulaiJeda + 5 * 60 * DTK;
  assert.equal(k.aktif(), true, "jeda habis tepat 5 menit sejak pelepasan");
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
