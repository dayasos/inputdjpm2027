// Cek Status Penerima untuk warga: POST /api/cek-status. Plan: plans/plan-cek-status-penerima-publik.md (bagian 6 dan 8.1).
//
// Urutan (berhenti di langkah pertama yang gagal): metode -> ukuran badan -> format -> Turnstile -> Edge Function
// `cekStatusPublik` (lewat _secret) -> samakan waktu respons. Seluruh aturan keamanan data (pesan seragam, penguncian
// per hash NIK, saklar, 5 kolom) ada di sisi Edge Function; Worker hanya gerbang dan penerjemah kode.
//
// ATURAN: tidak ada console.* yang memuat NIK, tanggal lahir, token, atau isi respons. Tanpa header CORS (hanya asal sendiri).

// Token Turnstile bisa sampai 2048 karakter (batas resmi Cloudflare); badan tanpa token sudah ~75 byte. Batas badan HARUS
// menampung keduanya: batas 1024 lama menolak token > ~950 karakter sebagai "FORMAT" (warga sah gagal tanpa sebab jelas).
const MAKS_TOKEN = 2048;
const MAKS_BADAN_BYTE = MAKS_TOKEN + 256;
const WAKTU_MIN_MS = 400;          // semua jalur dibuat sama lambatnya agar "ada" vs "tidak ada" tak terbedakan lewat waktu
const TIMEOUT_BACKEND_MS = 10000;
const TIMEOUT_TURNSTILE_MS = 8000;
const URL_SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Kunci uji resmi Cloudflare (1x/2x/3x + nol): hostname yang dikembalikan bukan hostname kita. Pemeriksaan hostname
// HANYA dilewati untuk pengembangan lokal: request ke localhost ATAU penanda eksplisit CEK_STATUS_DEV=1 (hanya di
// .dev.vars; `wrangler dev` memakai nama domain rute, bukan localhost). Bila kunci uji tersalin ke secret produksi
// TANPA penanda itu, hostname tetap diperiksa sehingga token ditolak (gagal tertutup), bukan Turnstile diam-diam mati.
const POLA_KUNCI_UJI = /^[123]x0{10,}/;
const HOST_LOKAL = new Set(['localhost', '127.0.0.1', '[::1]']);

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

const TAHUN_LAHIR_MIN = 1900; // sama dengan supabase/functions/api/_shared/cekStatusInti.ts

function hariIniWIB() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Pemeriksaan di gerbang, SAMA dengan Edge Function (kalender sungguhan, >= 1900, tidak di masa depan) agar permintaan
 * yang pasti ditolak tidak menghabiskan token Turnstile dan panggilan backend. Edge Function tetap memvalidasi ulang.
 */
export function formatValid(nik, tanggalLahir, hariIni = hariIniWIB()) {
  return typeof nik === 'string' && /^\d{16}$/.test(nik) &&
    typeof tanggalLahir === 'string' && tanggalKalenderValid(tanggalLahir) &&
    tanggalLahir >= `${TAHUN_LAHIR_MIN}-01-01` && tanggalLahir <= hariIni;
}

/** Membaca badan permintaan SAMBIL membatasi ukuran; berhenti dan membatalkan aliran begitu melewati batas. null = terlalu besar. */
async function bacaBadanTerbatas(request, maksByte) {
  if (!request.body) return '';
  const pembaca = request.body.getReader();
  const potongan = [];
  let total = 0;
  for (;;) {
    const { done, value } = await pembaca.read();
    if (done) break;
    total += value.byteLength;
    if (total > maksByte) {
      try { await pembaca.cancel(); } catch (_e) { /* abaikan */ }
      return null;
    }
    potongan.push(value);
  }
  const gabung = new Uint8Array(total);
  let posisi = 0;
  for (const p of potongan) { gabung.set(p, posisi); posisi += p.byteLength; }
  return new TextDecoder().decode(gabung);
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
    const modeDev = env.CEK_STATUS_DEV === '1' || HOST_LOKAL.has(hostname);
    if (POLA_KUNCI_UJI.test(env.TURNSTILE_SECRET_KEY) && modeDev) return true;
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
  let mentah;
  try {
    mentah = await bacaBadanTerbatas(request, MAKS_BADAN_BYTE); // juga untuk unggahan chunked tanpa Content-Length
  } catch (_e) {
    return gagal('FORMAT');
  }
  if (mentah === null) return gagal('FORMAT');

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

/**
 * Aksi yang HANYA boleh lewat /api/cek-status (Turnstile + batas laju). /api/gas menyisipkan _secret ke semua aksi,
 * jadi tanpa penolakan ini aksi tersebut bisa dipanggil langsung dari internet dan melewati Turnstile.
 */
const AKSI_KHUSUS = new Set(['cekstatuspublik']);
export function aksiKhususCekStatus(action) {
  return typeof action === 'string' && AKSI_KHUSUS.has(action.trim().toLowerCase());
}

export const KONSTANTA_UJI = { MAKS_BADAN_BYTE, WAKTU_MIN_MS, TIMEOUT_BACKEND_MS };
