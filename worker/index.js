// Worker Cloudflare untuk Input DJPM 2027. Menggantikan hosting lama (Vercel), yang sudah dihapus.
// - /api/gas  : proxy ke Supabase Edge Function (menyisipkan _secret yang tak boleh ada di browser)
// - /api/health : cek cepat versi/konfigurasi tanpa memanggil backend
// - scheduled : cekBatasWaktuVerifikasi tiap 18:00 UTC (01:00 WIB)
// Semua selain /api/* dilayani sebagai aset statis (lihat "assets" di wrangler.jsonc).

const DEFAULT_TARGET_URL = 'https://wwqxbscumaakvziwzwjx.supabase.co/functions/v1/api';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const REALTIME_CHECK_ACTIONS = new Set([
  'cekNikRealtime',
  'cekRekeningRealtime',
  'cekKuotaRealtime',
  'cekTempatTugasGandaRealtime',
  'cekKuotaTersedia',
  'ping',
]);
const UPLOAD_ACTIONS = new Set([
  'simpanDataKeSheet',
  'editDataPenerima',
  'uploadSemuaBerkasKeSupabase',
  'mintaUrlUploadBerkas',
  'konfirmasiUploadBerkas',
]);

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS_HEADERS },
  });
}

function sanitizeUrl(raw) {
  if (!raw) return DEFAULT_TARGET_URL;
  let u = String(raw).trim().replace(/^["']|["']$/g, '');
  if (u.startsWith('ttps://')) u = 'h' + u;
  if (u.startsWith('http://') && !u.includes('localhost') && !u.includes('127.0.0.1')) {
    u = 'https://' + u.slice(7);
  }
  return u.includes('/functions/v1/') ? u : DEFAULT_TARGET_URL;
}

function pilihTimeout(action) {
  if (REALTIME_CHECK_ACTIONS.has(action)) return 15000; // fail fast, jangan blok UI >15 detik
  if (action === 'validasiDataBaru') return 25000;
  if (UPLOAD_ACTIONS.has(action)) return 50000; // payload besar
  return 30000;
}

async function panggilBackend(env, payload, timeoutMs) {
  const targetUrl = sanitizeUrl(env.SUPABASE_EDGE_FUNCTION_URL);
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/plain, */*' };
  if (targetUrl.includes('supabase.co') && env.SUPABASE_ANON_KEY) {
    headers['apikey'] = env.SUPABASE_ANON_KEY;
    headers['Authorization'] = `Bearer ${env.SUPABASE_ANON_KEY}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`Batas waktu permintaan terlampaui (${timeoutMs / 1000} detik)`)),
    timeoutMs
  );
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: controller.signal,
    });
    return { res, text: await res.text(), targetUrl };
  } finally {
    clearTimeout(timer);
  }
}

async function tanganiHealth(env) {
  const secretDikonfigurasi = Boolean(env.GAS_SECRET_TOKEN);
  const targetUrl = sanitizeUrl(env.SUPABASE_EDGE_FUNCTION_URL);
  let pingStatus;
  if (!secretDikonfigurasi) {
    pingStatus = { error: 'GAS_SECRET_TOKEN belum diset di environment ini -- ping dilewati.' };
  } else {
    try {
      const { res } = await panggilBackend(env, { action: 'ping', _secret: env.GAS_SECRET_TOKEN }, 6000);
      pingStatus = { status: res.status, ok: res.ok };
    } catch (err) {
      pingStatus = { error: err.message, cause: err.cause ? (err.cause.message || String(err.cause)) : null };
    }
  }
  return jsonResponse({
    status: 'API Proxy Online',
    runtime: 'cloudflare-workers',
    envConfigured: Boolean(env.SUPABASE_EDGE_FUNCTION_URL),
    secretConfigured: secretDikonfigurasi,
    activeBackendUrl: targetUrl,
    pingTest: pingStatus,
  });
}

async function tanganiGas(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS_HEADERS });
  if (request.method === 'GET') return tanganiHealth(env);
  if (request.method !== 'POST') return jsonResponse({ error: 'Method Not Allowed' }, 405);

  let payload = {};
  try {
    const raw = await request.text();
    if (raw) payload = JSON.parse(raw);
  } catch (e) {
    return jsonResponse({ error: 'Format JSON payload tidak valid', details: e.message }, 400);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) payload = {};

  if (!env.GAS_SECRET_TOKEN) {
    return jsonResponse(
      { error: 'Konfigurasi server tidak lengkap: GAS_SECRET_TOKEN belum diset. Hubungi administrator.' },
      500
    );
  }
  payload._secret = env.GAS_SECRET_TOKEN;

  const timeoutMs = pilihTimeout(payload.action);
  let text = '';
  try {
    const hasil = await panggilBackend(env, payload, timeoutMs);
    text = hasil.text;
    return jsonResponse(JSON.parse(text), 200);
  } catch (err) {
    const nama = 'Supabase Edge Function';
    console.error(`Proxy Error action [${payload.action}] timeout=${timeoutMs}ms:`, err.message);
    if (err instanceof SyntaxError) {
      return jsonResponse(
        {
          error: `${nama} tidak mengembalikan respon JSON valid. Pastikan endpoint aktif dan dapat diakses.`,
          action: payload.action,
          details: text ? text.slice(0, 500) : err.message,
        },
        502
      );
    }
    const errString = err instanceof Error ? err.message : String(err);
    const causeStr = err.cause ? ` (Penyebab: ${err.cause.message || err.cause.code || String(err.cause)})` : '';
    return jsonResponse(
      {
        error: `Terjadi kesalahan koneksi antara server aplikasi dan ${nama}. Detail: ${errString}${causeStr}`,
        action: payload.action,
        details: errString,
        cause: causeStr,
        timeoutMs,
      },
      500
    );
  }
}

async function jalankanCron(env) {
  if (!env.GAS_SECRET_TOKEN) {
    throw new Error('GAS_SECRET_TOKEN belum diset. Cron dihentikan (fail-closed).');
  }
  const { res, text } = await panggilBackend(
    env,
    { action: 'cekBatasWaktuVerifikasi', args: [], _secret: env.GAS_SECRET_TOKEN },
    25000
  );
  console.log(`cron cekBatasWaktuVerifikasi -> HTTP ${res.status}: ${text.slice(0, 300)}`);
  if (!res.ok) throw new Error(`cekBatasWaktuVerifikasi gagal: HTTP ${res.status}`);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    // www.* dialihkan ke apex supaya hanya ada satu origin (localStorage, sesi, dan PWA tidak terpecah).
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    if (pathname === '/api/gas') return tanganiGas(request, env);
    if (pathname === '/api/health') return tanganiHealth(env);
    if (pathname.startsWith('/api/')) return jsonResponse({ error: 'Not Found' }, 404);
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(jalankanCron(env));
  },
};
