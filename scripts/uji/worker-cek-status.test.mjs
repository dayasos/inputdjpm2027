// Uji Worker /api/cek-status (plan bagian 12.2) dengan Turnstile dan backend palsu. Jalankan: npm run uji:worker-cek-status
import test from 'node:test';
import assert from 'node:assert/strict';
import { tanganiCekStatus, KONSTANTA_UJI } from '../../worker/cek-status.js';

const NIK = '1271010101900001';
const TGL = '1990-01-31';
const ENV = { TURNSTILE_SECRET_KEY: 'rahasia-turnstile', GAS_SECRET_TOKEN: 'rahasia-gas' };
const DATA = { nama: 'BUDI', layanan: 'GURU MAGHRIB MENGAJI', kecamatan: 'MEDAN KOTA', kelurahan: 'SITI REJO', status: 'Memenuhi Syarat' };

function req(badan, { metode = 'POST', header = {} } = {}) {
  const isi = typeof badan === 'string' ? badan : JSON.stringify(badan);
  return new Request('https://djpmkotamedan.web.id/api/cek-status', {
    method: metode, headers: { 'Content-Type': 'application/json', ...header }, body: metode === 'GET' ? undefined : isi,
  });
}
const lengkap = (o = {}) => ({ nik: NIK, tanggalLahir: TGL, turnstileToken: 'tok', ...o });

function buatDeps({ turnstile = { success: true, hostname: 'djpmkotamedan.web.id' }, backend = { result: { sukses: true, data: DATA } }, backendGalat = false } = {}) {
  const catatan = { backend: [], turnstile: [], tunggu: [] };
  let jam = 1000;
  return {
    catatan,
    ambil: async (url, opsi) => { catatan.turnstile.push({ url, body: opsi.body.toString() }); return { json: async () => turnstile }; },
    panggilBackend: async (env, payload, timeout) => {
      catatan.backend.push({ payload, timeout });
      if (backendGalat) throw new Error('mati');
      return { text: typeof backend === 'string' ? backend : JSON.stringify(backend) };
    },
    tunggu: async (ms) => { catatan.tunggu.push(ms); jam += ms; },
    sekarang: () => jam,
  };
}
async function jalan(r, deps = buatDeps(), env = ENV) {
  const res = await tanganiCekStatus(r, env, deps);
  return { status: res.status, headers: res.headers, json: await res.json(), deps };
}

test('berhasil: tepat 5 kolom, no-store, tanpa CORS', async () => {
  const h = await jalan(req(lengkap()));
  assert.equal(h.status, 200);
  assert.deepEqual(h.json, { sukses: true, data: DATA });
  assert.equal(h.headers.get('cache-control'), 'no-store');
  assert.equal(h.headers.get('access-control-allow-origin'), null);
});

test('kolom ekstra dari backend tidak pernah diteruskan', async () => {
  const deps = buatDeps({ backend: { result: { sukses: true, data: { ...DATA, nik: NIK, no_hp: '0812', rekening: '123' } } } });
  const h = await jalan(req(lengkap()), deps);
  assert.deepEqual(Object.keys(h.json.data).sort(), ['kecamatan', 'kelurahan', 'layanan', 'nama', 'status']);
});

test('backend menerima nik, tanggal, dan _secret sebagai string', async () => {
  const h = await jalan(req(lengkap()));
  const p = h.deps.catatan.backend[0];
  assert.equal(p.payload.action, 'cekStatusPublik');
  assert.deepEqual(p.payload.args, [NIK, TGL]);
  assert.equal(p.payload._secret, 'rahasia-gas');
  assert.equal(p.timeout, KONSTANTA_UJI.TIMEOUT_BACKEND_MS);
});

test('TIDAK_TERDATA: HTTP 200, badan identik untuk NIK-tak-ada dan tanggal-salah', async () => {
  const sama = { result: { sukses: false, kode: 'TIDAK_TERDATA' } };
  const a = await jalan(req(lengkap()), buatDeps({ backend: sama }));
  const b = await jalan(req(lengkap({ nik: '9999999999999999' })), buatDeps({ backend: sama }));
  assert.equal(a.status, 200);
  assert.deepEqual(a.json, { sukses: false, kode: 'TIDAK_TERDATA' });
  assert.deepEqual(a.json, b.json);
});

test('kode dari backend dipetakan ke HTTP yang benar', async () => {
  for (const [kode, status] of [['TERKUNCI', 429], ['NONAKTIF', 503], ['FORMAT', 400]]) {
    const h = await jalan(req(lengkap()), buatDeps({ backend: { result: { sukses: false, kode } } }));
    assert.equal(h.status, status, kode);
    assert.deepEqual(h.json, { sukses: false, kode });
  }
});

test('kode aneh/rusak dari backend -> GALAT 500 tanpa bocoran', async () => {
  for (const backend of [{ result: { sukses: false, kode: 'RAHASIA_DB' } }, { error: 'x' }, { result: null }, 'bukan json', { result: { sukses: true } }]) {
    const h = await jalan(req(lengkap()), buatDeps({ backend }));
    assert.equal(h.status, 500);
    assert.deepEqual(h.json, { sukses: false, kode: 'GALAT' });
  }
});

test('backend mati/lambat -> GALAT 500', async () => {
  const h = await jalan(req(lengkap()), buatDeps({ backendGalat: true }));
  assert.equal(h.status, 500);
  assert.deepEqual(h.json, { sukses: false, kode: 'GALAT' });
});

test('format: NIK 15/17 digit, huruf, angka JSON, tanggal ngawur -> 400 FORMAT, backend tak dipanggil', async () => {
  const buruk = [
    lengkap({ nik: '127101010190000' }), lengkap({ nik: '12710101019000012' }), lengkap({ nik: '12710101019000AB' }),
    lengkap({ nik: 1271010101900001 }), lengkap({ nik: null }), lengkap({ nik: "1' or '1'='1" }),
    lengkap({ tanggalLahir: '1990-02-31' }), lengkap({ tanggalLahir: '31-01-1990' }), lengkap({ tanggalLahir: null }),
    lengkap({ tanggalLahir: "1990-01-01'" }), [], 'bukan json', '"teks"', 'null',
  ];
  for (const b of buruk) {
    const deps = buatDeps();
    const h = await jalan(req(b), deps);
    assert.equal(h.status, 400, JSON.stringify(b));
    assert.equal(h.json.kode, 'FORMAT');
    assert.equal(deps.catatan.backend.length, 0);
    assert.equal(deps.catatan.turnstile.length, 0);
  }
});

test('badan > 1 KB ditolak sebelum diproses', async () => {
  const deps = buatDeps();
  const h = await jalan(req(lengkap({ sampah: 'x'.repeat(KONSTANTA_UJI.MAKS_BADAN_BYTE) })), deps);
  assert.equal(h.status, 400);
  assert.equal(deps.catatan.backend.length, 0);
});

test('metode selain POST -> 405', async () => {
  for (const m of ['GET', 'PUT', 'DELETE']) {
    const h = await jalan(req(lengkap(), { metode: m }));
    assert.equal(h.status, 405, m);
  }
});

test('Turnstile: token kosong/tak ada/terlalu panjang -> 403 tanpa panggil Cloudflare', async () => {
  for (const t of ['', undefined, null, 5, 'x'.repeat(3000)]) {
    const deps = buatDeps();
    const b = lengkap(); if (t === undefined) delete b.turnstileToken; else b.turnstileToken = t;
    const h = await jalan(req(b), deps);
    assert.equal(h.status, t && typeof t === 'string' && t.length > 1024 ? 400 : 403, String(t).slice(0, 5));
    assert.equal(deps.catatan.backend.length, 0);
  }
});

test('Turnstile: ditolak Cloudflare -> 403, backend tak dipanggil', async () => {
  const deps = buatDeps({ turnstile: { success: false, 'error-codes': ['invalid-input-response'] } });
  const h = await jalan(req(lengkap()), deps);
  assert.equal(h.status, 403);
  assert.deepEqual(h.json, { sukses: false, kode: 'TURNSTILE' });
  assert.equal(deps.catatan.backend.length, 0);
});

test('Turnstile: hostname beda -> 403 (token dari situs lain)', async () => {
  const deps = buatDeps({ turnstile: { success: true, hostname: 'situs-lain.example' } });
  assert.equal((await jalan(req(lengkap()), deps)).status, 403);
});

test('Turnstile: kunci uji Cloudflare tidak memeriksa hostname', async () => {
  const deps = buatDeps({ turnstile: { success: true, hostname: 'example.com' } });
  const h = await jalan(req(lengkap()), deps, { ...ENV, TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' });
  assert.equal(h.status, 200);
});

test('Turnstile: Cloudflare tak terjangkau -> GALAT 500 (gagal tertutup)', async () => {
  const deps = buatDeps();
  deps.ambil = async () => { throw new Error('jaringan'); };
  const h = await jalan(req(lengkap()), deps);
  assert.equal(h.status, 500);
  assert.equal(deps.catatan.backend.length, 0);
});

test('Turnstile: secret, token, dan IP dikirim ke siteverify', async () => {
  const deps = buatDeps();
  await jalan(req(lengkap(), { header: { 'CF-Connecting-IP': '203.0.113.9' } }), deps);
  const f = new URLSearchParams(deps.catatan.turnstile[0].body);
  assert.equal(f.get('secret'), 'rahasia-turnstile');
  assert.equal(f.get('response'), 'tok');
  assert.equal(f.get('remoteip'), '203.0.113.9');
});

test('rahasia belum dipasang -> GALAT 500, tidak menyebut apa yang kurang', async () => {
  for (const env of [{ GAS_SECRET_TOKEN: 'a' }, { TURNSTILE_SECRET_KEY: 'a' }, {}]) {
    const h = await jalan(req(lengkap()), buatDeps(), env);
    assert.equal(h.status, 500);
    assert.deepEqual(h.json, { sukses: false, kode: 'GALAT' });
  }
});

test('waktu respons disamakan: semua jalur menunggu sampai >= WAKTU_MIN_MS', async () => {
  const jalur = [
    [req(lengkap()), buatDeps()],
    [req(lengkap()), buatDeps({ backend: { result: { sukses: false, kode: 'TIDAK_TERDATA' } } })],
    [req(lengkap({ nik: 'x' })), buatDeps()],
    [req(lengkap()), buatDeps({ turnstile: { success: false } })],
  ];
  for (const [r, deps] of jalur) {
    const awal = deps.sekarang();
    await tanganiCekStatus(r, ENV, deps);
    assert.ok(deps.sekarang() - awal >= KONSTANTA_UJI.WAKTU_MIN_MS);
  }
});

test('tidak ada console.* yang memuat NIK, tanggal, token, atau nama', async () => {
  const tangkap = [];
  const asli = {};
  for (const k of ['log', 'info', 'warn', 'error', 'debug']) { asli[k] = console[k]; console[k] = (...a) => tangkap.push(a.join(' ')); }
  try {
    await jalan(req(lengkap({ turnstileToken: 'TOKEN-RAHASIA' })));
    await jalan(req(lengkap()), buatDeps({ backendGalat: true }));
    await jalan(req(lengkap()), buatDeps({ turnstile: { success: false } }));
  } finally { for (const k in asli) console[k] = asli[k]; }
  const semua = tangkap.join('\n');
  for (const rahasia of [NIK, TGL, 'TOKEN-RAHASIA', 'BUDI']) assert.ok(!semua.includes(rahasia), rahasia);
});

// --- /api/gas tidak boleh menjadi jalan pintas ke cekStatusPublik (melewati Turnstile) ---
import worker from '../../worker/index.js';
import { aksiKhususCekStatus } from '../../worker/cek-status.js';

async function lewatGas(action) {
  const dipanggil = [];
  const asli = globalThis.fetch;
  globalThis.fetch = async (u, o) => { dipanggil.push({ u: String(u), o }); return new Response(JSON.stringify({ result: { ok: true } })); };
  try {
    const r = new Request('https://djpmkotamedan.web.id/api/gas', { method: 'POST', body: JSON.stringify({ action, args: [NIK, TGL] }) });
    const res = await worker.fetch(r, { ...ENV, ASSETS: {} });
    return { status: res.status, json: await res.json(), dipanggil };
  } finally { globalThis.fetch = asli; }
}

test('/api/gas menolak cekStatusPublik (termasuk huruf besar/kecil & spasi) dan TIDAK memanggil backend', async () => {
  for (const a of ['cekStatusPublik', 'CEKSTATUSPUBLIK', ' cekStatusPublik ', 'cekstatuspublik']) {
    const h = await lewatGas(a);
    assert.equal(h.status, 403, a);
    assert.equal(h.dipanggil.length, 0, a);
  }
});

test('/api/gas aksi lain tetap diteruskan ke backend seperti biasa', async () => {
  const h = await lewatGas('pulihkanSesi');
  assert.equal(h.status, 200);
  assert.equal(h.dipanggil.length, 1);
});

test('aksiKhususCekStatus: bukan string / aksi lain -> false', () => {
  for (const x of [undefined, null, 5, {}, '', 'login', 'cekNikRealtime']) assert.equal(aksiKhususCekStatus(x), false);
});
