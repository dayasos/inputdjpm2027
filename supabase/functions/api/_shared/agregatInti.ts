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

/**
 * statusBaru = hasil yang DIBERIKAN verifikator (dasar hitungan). statusSekarang = status data saat panel dibuka (hanya informasi):
 * undefined = tidak diketahui (tidak dihitung), null = data sudah tidak ada. Status sekarang TIDAK PERNAH memengaruhi total/jam kerja/lembur.
 */
export interface Kejadian { oleh: string; waktu: Date; statusBaru: string; statusSekarang?: string | null }

export interface BarisOrang {
  username: string; namaLengkap: string; tim: string | null; koordinator: boolean; aktif: boolean;
  total: number; jamKerja: number; luarJamKerja: number; memenuhiSyarat: number; berkasTidakLengkap: number; tidakMemenuhiSyarat: number;
  /** Informasi saja: status data SEKARANG dari data yang diberi hasil oleh verifikator, dan berapa yang berbeda dari hasil verifikator (dikoreksi Admin). */
  sekarangMemenuhiSyarat: number; sekarangBerkasTidakLengkap: number; sekarangTidakMemenuhiSyarat: number; sekarangLainnya: number; dikoreksi: number;
}

const nol = () => ({
  total: 0, jamKerja: 0, luarJamKerja: 0, memenuhiSyarat: 0, berkasTidakLengkap: 0, tidakMemenuhiSyarat: 0,
  sekarangMemenuhiSyarat: 0, sekarangBerkasTidakLengkap: 0, sekarangTidakMemenuhiSyarat: 0, sekarangLainnya: 0, dikoreksi: 0,
});

/** Catat status SEKARANG sebuah data (informasi). Tidak menyentuh total, jam kerja, maupun luar jam kerja. */
function catatStatusSekarang(x: BarisOrang | ReturnType<typeof nol>, hasil: string, sekarang: string | null | undefined): void {
  if (sekarang === undefined) return;                       // tidak diketahui: lewati
  const s = rapi(sekarang);
  if (s === "MEMENUHI SYARAT") x.sekarangMemenuhiSyarat++;
  else if (s === "BERKAS TIDAK LENGKAP") x.sekarangBerkasTidakLengkap++;
  else if (s === "TIDAK MEMENUHI SYARAT") x.sekarangTidakMemenuhiSyarat++;
  else x.sekarangLainnya++;                                  // mis. data sudah dihapus (null) atau kembali ke Proses Verifikasi
  if (s !== hasil) x.dikoreksi++;                            // berbeda dari hasil verifikator = dikoreksi (oleh Admin Utama; verifikator tak dapat mengubahnya)
}

/** Tabulasi per orang saja (tanpa rincian harian): dipakai kartu per tim agar tidak bergantung pada saringan tabel. Bukan rekursif (tipe hasil eksplisit). */
export function hitungPerOrang(
  anggota: AkunVerif[], kejadian: Kejadian[], rentang: Rentang, konfig: KonfigJamKerja, libur: ReadonlySet<string>,
): BarisOrang[] {
  const orang = new Map<string, BarisOrang>();
  for (const a of anggota) orang.set(rapi(a.username), { username: a.username, namaLengkap: a.namaLengkap || "", tim: a.tim, koordinator: !!a.koordinator, aktif: !!a.aktif, ...nol() });
  for (const k of kejadian) {
    const b = orang.get(rapi(k.oleh));
    if (!b) continue;
    if (!(k.waktu >= rentang.awalUtc && k.waktu < rentang.akhirUtcEksklusif)) continue;
    const jam = adalahJamKerja(k.waktu, konfig, libur);
    const st = rapi(k.statusBaru);
    b.total++; if (jam) b.jamKerja++; else b.luarJamKerja++;
    if (st === "MEMENUHI SYARAT") b.memenuhiSyarat++;
    else if (st === "BERKAS TIDAK LENGKAP") b.berkasTidakLengkap++;
    else if (st === "TIDAK MEMENUHI SYARAT") b.tidakMemenuhiSyarat++;
  }
  return [...orang.values()];
}

export function susunAgregat(p: {
  cakupan: Cakupan; anggota: AkunVerif[]; kejadian: Kejadian[]; rentang: Rentang; konfig: KonfigJamKerja; libur: ReadonlySet<string>;
  luarTim?: { waktu: Date }[]; sertakanPerOrangHari?: boolean;
  /** Hanya cakupan SEMUA: seluruh verifikator, dipakai untuk kartu per tim agar TIDAK ikut menyempit saat tabel disaring ke satu tim. */
  semuaAnggota?: AkunVerif[];
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
      catatStatusSekarang(x, st, k.statusSekarang);
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
    // Kartu per tim selalu dari SEMUA verifikator (bukan hanya yang lolos saringan tim), supaya angka tim lain tidak tampak 0 saat satu tim dipilih.
    const dasarTim = p.semuaAnggota && p.semuaAnggota !== p.anggota
      ? hitungPerOrang(p.semuaAnggota, p.kejadian, p.rentang, p.konfig, p.libur)
      : perOrang;
    perTim = kunciTim.map((tm) => {
      const m = dasarTim.filter((o) => (o.tim || "-") === tm);
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

// ------------------------------------------------------------------ pemeriksaan ulang (plans/plan-verifikasi-ulang.md, T6)
//
// Pemeriksaan ulang dihitung TERPISAH dari verifikasi pertama (susunAgregat tidak diubah), dengan aturan jam kerja yang SAMA, lalu
// dijumlahkan oleh gabungkan(): Total pekerjaan = verifikasi pertama + pemeriksaan ulang (keputusan user: ikut lembur, 1 data = 1 hitungan).
// Satu data dihitung satu kali per pemeriksa: pemanggil (kueri) hanya mengirim satu kejadian per (data, pemeriksa).

export interface KejadianUlang { oleh: string; waktu: Date; hasil: string }   // hasil: SESUAI | DIKOREKSI

export interface BarisOrangUlang { username: string; total: number; jamKerja: number; luarJamKerja: number; sesuai: number; dikoreksi: number; sisa: number }
const nolUlang = () => ({ total: 0, jamKerja: 0, luarJamKerja: 0, sesuai: 0, dikoreksi: 0, sisa: 0 });

function hitungOrangUlang(
  anggota: AkunVerif[], kejadian: KejadianUlang[], sisa: Record<string, number>, rentang: Rentang, konfig: KonfigJamKerja, libur: ReadonlySet<string>,
): Map<string, BarisOrangUlang> {
  const orang = new Map<string, BarisOrangUlang>();
  for (const a of anggota) orang.set(rapi(a.username), { username: a.username, ...nolUlang(), sisa: Number(sisa[rapi(a.username)]) || 0 });
  for (const k of kejadian) {
    const b = orang.get(rapi(k.oleh));
    if (!b) continue;
    if (!(k.waktu >= rentang.awalUtc && k.waktu < rentang.akhirUtcEksklusif)) continue;
    b.total++;
    if (adalahJamKerja(k.waktu, konfig, libur)) b.jamKerja++; else b.luarJamKerja++;
    const h = rapi(k.hasil);
    if (h === "SESUAI") b.sesuai++; else if (h === "DIKOREKSI") b.dikoreksi++;
  }
  return orang;
}

export function susunUlang(p: {
  cakupan: Cakupan; anggota: AkunVerif[]; kejadian: KejadianUlang[]; sisa: Record<string, number>; rentang: Rentang; konfig: KonfigJamKerja; libur: ReadonlySet<string>;
  sertakanPerOrangHari?: boolean; semuaAnggota?: AkunVerif[];
}) {
  const orang = hitungOrangUlang(p.anggota, p.kejadian, p.sisa, p.rentang, p.konfig, p.libur);
  const ringkasan = nolUlang();
  for (const b of orang.values()) { ringkasan.total += b.total; ringkasan.jamKerja += b.jamKerja; ringkasan.luarJamKerja += b.luarJamKerja; ringkasan.sesuai += b.sesuai; ringkasan.dikoreksi += b.dikoreksi; ringkasan.sisa += b.sisa; }

  const hari = new Map<string, { total: number; jamKerja: number; luarJamKerja: number }>();
  for (const t of daftarTanggal(p.rentang.dari, p.rentang.sampai)) hari.set(t, { total: 0, jamKerja: 0, luarJamKerja: 0 });
  const orangHari = new Map<string, { username: string; tanggal: string; jamKerja: number; luarJamKerja: number }>();
  for (const k of p.kejadian) {
    const b = orang.get(rapi(k.oleh));
    if (!b) continue;
    if (!(k.waktu >= p.rentang.awalUtc && k.waktu < p.rentang.akhirUtcEksklusif)) continue;
    const jam = adalahJamKerja(k.waktu, p.konfig, p.libur);
    const tgl = lokalWib(k.waktu).tanggal;
    const h = hari.get(tgl);
    if (h) { h.total++; if (jam) h.jamKerja++; else h.luarJamKerja++; }
    if (p.sertakanPerOrangHari) {
      const kunci = rapi(k.oleh) + "|" + tgl;
      const oh = orangHari.get(kunci) ?? { username: b.username, tanggal: tgl, jamKerja: 0, luarJamKerja: 0 };
      if (jam) oh.jamKerja++; else oh.luarJamKerja++;
      orangHari.set(kunci, oh);
    }
  }

  let perTim: { tim: string; total: number; jamKerja: number; luarJamKerja: number; sisa: number }[] | undefined;
  if (p.cakupan === "SEMUA") {
    const dasar = hitungOrangUlang(p.semuaAnggota ?? p.anggota, p.kejadian, p.sisa, p.rentang, p.konfig, p.libur);
    const akun = new Map((p.semuaAnggota ?? p.anggota).map((a) => [rapi(a.username), a]));
    perTim = ([...DAFTAR_TIM, "-"] as string[]).map((tm) => {
      const m = [...dasar.entries()].filter(([u]) => ((akun.get(u)?.tim) || "-") === tm).map(([, o]) => o);
      return { tim: tm, total: m.reduce((s, o) => s + o.total, 0), jamKerja: m.reduce((s, o) => s + o.jamKerja, 0), luarJamKerja: m.reduce((s, o) => s + o.luarJamKerja, 0), sisa: m.reduce((s, o) => s + o.sisa, 0) };
    });
  }

  return {
    ringkasan,
    perOrang: [...orang.values()],
    perHari: [...hari.entries()].map(([tanggal, v]) => ({ tanggal, ...v })),
    perTim,
    perOrangHari: p.sertakanPerOrangHari ? [...orangHari.values()].sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.username.localeCompare(b.username)) : undefined,
  };
}

/** Total pekerjaan = verifikasi pertama + pemeriksaan ulang (jam kerja dan luar jam kerja dijumlahkan terpisah). Tidak ada angka lain yang ikut. */
export function gabungkan(pertama: ReturnType<typeof susunAgregat>, ulang: ReturnType<typeof susunUlang>) {
  const u = new Map(ulang.perOrang.map((o) => [rapi(o.username), o]));
  const jumlah = (a: { jamKerja: number; luarJamKerja: number }, b?: { jamKerja: number; luarJamKerja: number }) =>
    ({ total: a.jamKerja + a.luarJamKerja + (b ? b.jamKerja + b.luarJamKerja : 0), jamKerja: a.jamKerja + (b?.jamKerja ?? 0), luarJamKerja: a.luarJamKerja + (b?.luarJamKerja ?? 0) });
  const ut = new Map((ulang.perTim ?? []).map((t) => [t.tim, t]));
  const uh = new Map(ulang.perHari.map((h) => [h.tanggal, h]));
  const kunciOh = (x: { username: string; tanggal: string }) => rapi(x.username) + "|" + x.tanggal;
  const gabOh = new Map<string, { username: string; tanggal: string; pertamaJam: number; pertamaLuar: number; ulangJam: number; ulangLuar: number }>();
  for (const x of pertama.perOrangHari ?? []) gabOh.set(kunciOh(x), { username: x.username, tanggal: x.tanggal, pertamaJam: x.jamKerja, pertamaLuar: x.luarJamKerja, ulangJam: 0, ulangLuar: 0 });
  for (const x of ulang.perOrangHari ?? []) {
    const e = gabOh.get(kunciOh(x)) ?? { username: x.username, tanggal: x.tanggal, pertamaJam: 0, pertamaLuar: 0, ulangJam: 0, ulangLuar: 0 };
    e.ulangJam = x.jamKerja; e.ulangLuar = x.luarJamKerja; gabOh.set(kunciOh(x), e);
  }
  return {
    ringkasan: jumlah(pertama.ringkasan, ulang.ringkasan),
    perOrang: pertama.perOrang.map((o) => ({ username: o.username, ...jumlah(o, u.get(rapi(o.username))) })),
    perTim: pertama.perTim?.map((t) => ({ tim: t.tim, ...jumlah(t, ut.get(t.tim)) })),
    perHari: pertama.perHari.map((h) => ({ tanggal: h.tanggal, ...jumlah(h, uh.get(h.tanggal)) })),
    perOrangHari: pertama.perOrangHari || ulang.perOrangHari ? [...gabOh.values()].sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.username.localeCompare(b.username)) : undefined,
  };
}
