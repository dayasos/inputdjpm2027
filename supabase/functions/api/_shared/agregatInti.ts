// Inti perhitungan agregat hasil kerja verifikator (plans/plan-agregat-verifikator.md).
//
// MODUL MURNI (tanpa Deno.*, tanpa database): diuji di Node (scripts/uji/agregat-verifikasi-inti.test.mjs).
// Semua aturan yang menentukan ANGKA lembur ada di sini: penentuan jam kerja (WIB), pemilihan rentang tanggal, cakupan hak lihat
// (verifikator / koordinator / Admin Utama), dan penyusunan agregat.

export const OFFSET_WIB_MS = 7 * 3600 * 1000;
export const MAKS_HARI_RENTANG = 93;
export const DAFTAR_TIM = ["I", "II", "III", "IV"] as const;
export const NAMA_HARI = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

// ------------------------------------------------------------------ jam kerja

export interface JamKerjaHari { mulaiDtk: number; selesaiDtk: number }
export type KonfigJamKerja = Map<number, JamKerjaHari>;

/** "08:00" / "08:00:00" -> detik sejak tengah malam. Tidak valid -> NaN. */
export function waktuKeDtk(teks: unknown): number {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(teks ?? "").trim());
  if (!m) return NaN;
  const j = Number(m[1]), mn = Number(m[2]), d = Number(m[3] ?? 0);
  if (j > 24 || mn > 59 || d > 59) return NaN;
  return j * 3600 + mn * 60 + d;
}

/** Aturan bawaan (dipakai bila tabel jam_kerja_verifikasi kosong): Senin-Kamis 08.00-16.30, Jumat 08.00-17.00. */
export function konfigBawaan(): KonfigJamKerja {
  const k: KonfigJamKerja = new Map();
  for (let h = 1; h <= 4; h++) k.set(h, { mulaiDtk: 8 * 3600, selesaiDtk: 16 * 3600 + 30 * 60 });
  k.set(5, { mulaiDtk: 8 * 3600, selesaiDtk: 17 * 3600 });
  return k;
}

export function bangunKonfig(baris: { isodow: unknown; mulai: unknown; selesai: unknown }[]): KonfigJamKerja {
  const k: KonfigJamKerja = new Map();
  for (const b of baris || []) {
    const h = Number(b.isodow), m = waktuKeDtk(b.mulai), s = waktuKeDtk(b.selesai);
    if (Number.isInteger(h) && h >= 1 && h <= 7 && Number.isFinite(m) && Number.isFinite(s) && s > m) k.set(h, { mulaiDtk: m, selesaiDtk: s });
  }
  return k.size > 0 ? k : konfigBawaan();
}

/** Waktu dinding WIB dari sebuah instan (WIB = UTC+7, tanpa waktu musim panas). */
export function lokalWib(d: Date): { tanggal: string; isodow: number; dtk: number } {
  const t = new Date(d.getTime() + OFFSET_WIB_MS);
  return { tanggal: t.toISOString().slice(0, 10), isodow: t.getUTCDay() === 0 ? 7 : t.getUTCDay(), dtk: t.getUTCHours() * 3600 + t.getUTCMinutes() * 60 + t.getUTCSeconds() };
}

/**
 * true = JAM KERJA. Aturan: bukan tanggal merah, hari itu punya jam kerja, dan mulai <= waktu < selesai (batas atas TIDAK termasuk,
 * jadi tepat 16.30.00 Senin-Kamis / 17.00.00 Jumat sudah luar jam kerja). Selain itu (Sabtu, Minggu, tanggal merah) = luar jam kerja.
 */
export function adalahJamKerja(waktu: Date, konfig: KonfigJamKerja, libur: ReadonlySet<string>): boolean {
  const l = lokalWib(waktu);
  if (libur.has(l.tanggal)) return false;
  const j = konfig.get(l.isodow);
  if (!j) return false;
  return l.dtk >= j.mulaiDtk && l.dtk < j.selesaiDtk;
}

// ------------------------------------------------------------------ rentang tanggal

export function hariIniWib(sekarang: Date = new Date()): string { return lokalWib(sekarang).tanggal; }

function tanggalValid(t: unknown): t is string {
  if (typeof t !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const d = new Date(t + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
}

function tambahHari(t: string, n: number): string {
  const d = new Date(t + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

export function daftarTanggal(dari: string, sampai: string): string[] {
  const out: string[] = [];
  for (let t = dari; t <= sampai; t = tambahHari(t, 1)) { out.push(t); if (out.length > 400) break; }
  return out;
}

export interface Rentang { dari: string; sampai: string; awalUtc: Date; akhirUtcEksklusif: Date; jumlahHari: number }

/** Kosong kedua-duanya = awal bulan ini s/d hari ini (WIB). Tanggal WIB inklusif di kedua ujung. Maksimal 93 hari. */
export function tafsirRentang(dari: unknown, sampai: unknown, hariIni: string): { ok: true; rentang: Rentang } | { ok: false; pesan: string } {
  const ada = (v: unknown) => v !== undefined && v !== null && v !== "";
  if ((ada(dari) && typeof dari !== "string") || (ada(sampai) && typeof sampai !== "string")) return { ok: false, pesan: "Rentang tanggal tidak valid (format yyyy-mm-dd)." };
  let d = typeof dari === "string" ? dari.trim() : "";
  let s = typeof sampai === "string" ? sampai.trim() : "";
  if (!d && !s) { d = hariIni.slice(0, 8) + "01"; s = hariIni; }
  if (!tanggalValid(d) || !tanggalValid(s)) return { ok: false, pesan: "Rentang tanggal tidak valid (format yyyy-mm-dd)." };
  if (d > s) return { ok: false, pesan: "Tanggal awal tidak boleh sesudah tanggal akhir." };
  const jumlahHari = daftarTanggal(d, s).length;
  if (jumlahHari > MAKS_HARI_RENTANG) return { ok: false, pesan: `Rentang maksimal ${MAKS_HARI_RENTANG} hari.` };
  return {
    ok: true,
    rentang: {
      dari: d, sampai: s, jumlahHari,
      awalUtc: new Date(d + "T00:00:00+07:00"),
      akhirUtcEksklusif: new Date(tambahHari(s, 1) + "T00:00:00+07:00"),
    },
  };
}

// ------------------------------------------------------------------ cakupan (hak lihat)

export interface AkunVerif { akunId: string; username: string; namaLengkap: string; aktif: boolean; tim: string | null; koordinator: boolean }
export type Cakupan = "SAYA" | "TIM" | "SEMUA";

function rapi(v: unknown): string { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().toUpperCase(); }

/**
 * Menentukan SIAPA yang boleh dilihat penanya. Seluruhnya dari peran sesi dan tabel tim di server; `timDiminta` hanya dipakai Admin Utama
 * (verifikator/koordinator yang mengirim tim lain TIDAK memperluas cakupan).
 */
export function tentukanCakupan(
  role: unknown, akunIdSesi: unknown, semuaAkun: AkunVerif[], timDiminta?: unknown,
): { ok: true; cakupan: Cakupan; anggota: AkunVerif[]; timFokus: string | null } | { ok: false; pesan: string } {
  const r = rapi(role);
  if (r === "UTAMA") {
    const t = rapi(timDiminta);
    let anggota = semuaAkun;
    let timFokus: string | null = null;
    if ((DAFTAR_TIM as readonly string[]).includes(t)) { anggota = semuaAkun.filter((a) => a.tim === t); timFokus = t; }
    else if (t === "-") { anggota = semuaAkun.filter((a) => !a.tim); timFokus = "-"; }
    return { ok: true, cakupan: "SEMUA", anggota, timFokus };
  }
  if (r === "VERIFIKATOR") {
    const saya = semuaAkun.find((a) => String(a.akunId) === String(akunIdSesi));
    if (!saya) return { ok: false, pesan: "Akun verifikator tidak ditemukan." };
    if (saya.koordinator && saya.tim) return { ok: true, cakupan: "TIM", anggota: semuaAkun.filter((a) => a.tim === saya.tim), timFokus: saya.tim };
    return { ok: true, cakupan: "SAYA", anggota: [saya], timFokus: saya.tim };
  }
  return { ok: false, pesan: "Fitur ini khusus Admin Utama dan Verifikator." };
}

// ------------------------------------------------------------------ agregat

export interface Kejadian { oleh: string; waktu: Date; statusBaru: string }

export interface BarisOrang {
  username: string; namaLengkap: string; tim: string | null; koordinator: boolean; aktif: boolean;
  total: number; jamKerja: number; luarJamKerja: number; memenuhiSyarat: number; berkasTidakLengkap: number; tidakMemenuhiSyarat: number;
}

const nol = () => ({ total: 0, jamKerja: 0, luarJamKerja: 0, memenuhiSyarat: 0, berkasTidakLengkap: 0, tidakMemenuhiSyarat: 0 });

export function susunAgregat(p: {
  cakupan: Cakupan; anggota: AkunVerif[]; kejadian: Kejadian[]; rentang: Rentang; konfig: KonfigJamKerja; libur: ReadonlySet<string>;
  luarTim?: { waktu: Date }[]; sertakanPerOrangHari?: boolean;
}) {
  const orang = new Map<string, BarisOrang>();
  for (const a of p.anggota) {
    orang.set(rapi(a.username), { username: a.username, namaLengkap: a.namaLengkap || "", tim: a.tim, koordinator: !!a.koordinator, aktif: !!a.aktif, ...nol() });
  }
  const hari = new Map<string, { total: number; jamKerja: number; luarJamKerja: number }>();
  for (const t of daftarTanggal(p.rentang.dari, p.rentang.sampai)) hari.set(t, { total: 0, jamKerja: 0, luarJamKerja: 0 });
  const orangHari = new Map<string, { username: string; tanggal: string; jamKerja: number; luarJamKerja: number }>();
  const ringkasan = nol();

  for (const k of p.kejadian) {
    const b = orang.get(rapi(k.oleh));
    if (!b) continue;                                                    // di luar cakupan penanya: diabaikan
    if (!(k.waktu >= p.rentang.awalUtc && k.waktu < p.rentang.akhirUtcEksklusif)) continue;
    const jam = adalahJamKerja(k.waktu, p.konfig, p.libur);
    const tgl = lokalWib(k.waktu).tanggal;
    const st = rapi(k.statusBaru);
    for (const x of [b, ringkasan]) {
      x.total++; if (jam) x.jamKerja++; else x.luarJamKerja++;
      if (st === "MEMENUHI SYARAT") x.memenuhiSyarat++;
      else if (st === "BERKAS TIDAK LENGKAP") x.berkasTidakLengkap++;
      else if (st === "TIDAK MEMENUHI SYARAT") x.tidakMemenuhiSyarat++;
    }
    const h = hari.get(tgl);
    if (h) { h.total++; if (jam) h.jamKerja++; else h.luarJamKerja++; }
    if (p.sertakanPerOrangHari) {
      const kunci = rapi(k.oleh) + "|" + tgl;
      const oh = orangHari.get(kunci) ?? { username: b.username, tanggal: tgl, jamKerja: 0, luarJamKerja: 0 };
      if (jam) oh.jamKerja++; else oh.luarJamKerja++;
      orangHari.set(kunci, oh);
    }
  }

  const perOrang = [...orang.values()].sort((a, b) => b.total - a.total || a.username.localeCompare(b.username));

  let perTim: { tim: string; anggota: number; total: number; jamKerja: number; luarJamKerja: number }[] | undefined;
  if (p.cakupan === "SEMUA") {
    const kunciTim = [...DAFTAR_TIM, "-"] as string[];
    perTim = kunciTim.map((tm) => {
      const m = perOrang.filter((o) => (o.tim || "-") === tm);
      return { tim: tm, anggota: m.length, total: m.reduce((s, o) => s + o.total, 0), jamKerja: m.reduce((s, o) => s + o.jamKerja, 0), luarJamKerja: m.reduce((s, o) => s + o.luarJamKerja, 0) };
    }).filter((t) => t.tim !== "-" || t.anggota > 0);
  }

  let luarTim: { total: number; jamKerja: number; luarJamKerja: number } | undefined;
  if (p.cakupan === "SEMUA") {
    luarTim = { total: 0, jamKerja: 0, luarJamKerja: 0 };
    for (const e of p.luarTim ?? []) {
      if (!(e.waktu >= p.rentang.awalUtc && e.waktu < p.rentang.akhirUtcEksklusif)) continue;
      luarTim.total++;
      if (adalahJamKerja(e.waktu, p.konfig, p.libur)) luarTim.jamKerja++; else luarTim.luarJamKerja++;
    }
  }

  const perHari = [...hari.entries()].map(([tanggal, v]) => {
    const dow = lokalWib(new Date(tanggal + "T12:00:00+07:00")).isodow;
    return { tanggal, hari: NAMA_HARI[dow], libur: dow >= 6 || p.libur.has(tanggal), ...v };
  });

  return {
    ringkasan, perOrang, perTim, perHari, luarTim,
    perOrangHari: p.sertakanPerOrangHari ? [...orangHari.values()].sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.username.localeCompare(b.username)) : undefined,
  };
}
