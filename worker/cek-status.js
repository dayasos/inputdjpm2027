// Cek Status Penerima untuk warga: POST /api/cek-status. Plan: plans/plan-cek-status-penerima-publik.md (bagian 6 dan 8.1).
//
// Urutan (berhenti di langkah pertama yang gagal): metode -> ukuran badan -> format -> Turnstile -> Edge Function
// `cekStatusPublik` (lewat _secret) -> samakan waktu respons. Seluruh aturan keamanan data (pesan seragam, penguncian
// per hash NIK, saklar, 5 kolom) ada di sisi Edge Function; Worker hanya gerbang dan penerjemah kode.
//
// ATURAN: tidak ada console.* yang memuat NIK, tanggal lahir, token, atau isi respons. Tanpa header CORS (hanya asal sendiri).

const MAKS_BADAN_BYTE = 1024;
const MAKS_TOKEN = 2048;
const WAKTU_MIN_MS = 400;          // semua jalur dibuat sama lambatnya agar "ada" vs "tidak ada" tak terbedakan lewat waktu
const TIMEOUT_BACKEND_MS = 10000;
const TIMEOUT_TURNSTILE_MS = 8000;
const URL_SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Kunci uji resmi Cloudflare (1x/2x/3x + nol): hostname yang dikembalikan bukan hostname kita, jadi tak diperiksa.
const POLA_KUNCI_UJI = /^[123]x0{10,}/;

const STATUS_BALASAN = {
  TIDAK_TERDATA: 200,
  FORMAT: 400,
  TURNSTILE: 403,
  TERKUNCI: 429,
  NONAKTIF: 503,
  GALAT: 500,
};

function balas(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function gagal(kode) {
  return balas({ sukses: false, kode }, STATUS_BALASAN[kode] || 500);
}

function tanggalKalenderValid(tgl) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tgl);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Pemeriksaan ringan; Edge Function tetap memvalidasi ulang (termasuk tanggal masa depan dan batas 1900). */
export function formatValid(nik, tanggalLahir) {
  return typeof nik === 'string' && /^\d{16}$/.test(nik) &&
    typeof tanggalLahir === 'string' && tanggalKalenderValid(tanggalLahir);
}

async function verifikasiTurnstile(env, token, ip, hostname, ambil) {
  const form = new URLSearchParams();
  form.set('secret', env.TURNSTILE_SECRET_KEY);
  form.set('response', token);
  if (ip) form.set('remoteip', ip);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_TURNSTILE_MS);
  try {
    const res = await ambil(URL_SITEVERIFY, { method: 'POST', body: form, signal: controller.signal });
    const hasil = await res.json();
    if (!hasil || hasil.success !== true) return false;
    if (POLA_KUNCI_UJI.test(env.TURNSTILE_SECRET_KEY)) return true;
    return typeof hasil.hostname === 'string' && hasil.hostname === hostname;
  } finally {
    clearTimeout(timer);
  }
}

/** Satu-satunya bentuk sukses yang keluar: tepat 5 kolom, dipetakan eksplisit. */
function pilihData(d) {
  return {
    nama: String(d.nama ?? ''),
    layanan: String(d.layanan ?? ''),
    kecamatan: String(d.kecamatan ?? ''),
    kelurahan: String(d.kelurahan ?? ''),
    status: String(d.status ?? ''),
  };
}

async function proses(request, env, deps) {
  const url = new URL(request.url);

  if (request.method !== 'POST') return balas({ sukses: false, kode: 'GALAT' }, 405);

  const panjang = Number(request.headers.get('Content-Length') || 0);
  if (panjang > MAKS_BADAN_BYTE) return gagal('FORMAT');
  let mentah = '';
  try {
    mentah = await request.text();
  } catch (_e) {
    return gagal('FORMAT');
  }
  if (mentah.length > MAKS_BADAN_BYTE) return gagal('FORMAT');

  let badan;
  try {
    badan = JSON.parse(mentah);
  } catch (_e) {
    return gagal('FORMAT');
  }
  if (!badan || typeof badan !== 'object' || Array.isArray(badan)) return gagal('FORMAT');

  const { nik, tanggalLahir, turnstileToken } = badan;
  if (!formatValid(nik, tanggalLahir)) return gagal('FORMAT');
  if (typeof turnstileToken !== 'string' || turnstileToken.length === 0 || turnstileToken.length > MAKS_TOKEN) {
    return gagal('TURNSTILE');
  }

  // Konfigurasi hilang = gagal tertutup, tanpa membocorkan apa yang kurang.
  if (!env.TURNSTILE_SECRET_KEY || !env.GAS_SECRET_TOKEN) return gagal('GALAT');

  try {
    const lolos = await verifikasiTurnstile(
      env, turnstileToken, request.headers.get('CF-Connecting-IP') || '', url.hostname, deps.ambil
    );
    if (!lolos) return gagal('TURNSTILE');
  } catch (_e) {
    return gagal('GALAT');
  }

  let respons;
  try {
    const { text } = await deps.panggilBackend(
      env,
      { action: 'cekStatusPublik', args: [nik, tanggalLahir], _secret: env.GAS_SECRET_TOKEN },
      TIMEOUT_BACKEND_MS
    );
    respons = JSON.parse(text);
  } catch (_e) {
    return gagal('GALAT');
  }

  const hasil = respons && respons.result;
  if (!hasil || typeof hasil !== 'object') return gagal('GALAT');
  if (hasil.sukses === true && hasil.data && typeof hasil.data === 'object') {
    return balas({ sukses: true, data: pilihData(hasil.data) }, 200);
  }
  if (hasil.sukses === false && Object.prototype.hasOwnProperty.call(STATUS_BALASAN, hasil.kode) &&
      hasil.kode !== 'TURNSTILE' && hasil.kode !== 'GALAT') {
    return gagal(hasil.kode);
  }
  return gagal('GALAT');
}

/**
 * @param deps.panggilBackend (env, payload, timeoutMs) -> {text}  -- disuntikkan dari worker/index.js
 * @param deps.ambil          fetch (untuk Turnstile); bawaan fetch global
 * @param deps.tunggu         (ms) -> Promise; bawaan setTimeout
 * @param deps.sekarang       () -> ms; bawaan Date.now
 */
export async function tanganiCekStatus(request, env, deps) {
  const d = {
    ambil: (...a) => fetch(...a),
    tunggu: (ms) => new Promise((r) => setTimeout(r, ms)),
    sekarang: () => Date.now(),
    ...deps,
  };
  const mulai = d.sekarang();
  let jawaban;
  try {
    jawaban = await proses(request, env, d);
  } catch (_e) {
    jawaban = gagal('GALAT');
  }
  const sisa = WAKTU_MIN_MS - (d.sekarang() - mulai);
  if (sisa > 0) await d.tunggu(sisa);
  return jawaban;
}

export const KONSTANTA_UJI = { MAKS_BADAN_BYTE, WAKTU_MIN_MS, TIMEOUT_BACKEND_MS };
