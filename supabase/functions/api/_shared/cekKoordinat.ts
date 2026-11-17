// Pemeriksa koordinat lokasi mengajar Guru Maghrib Mengaji (modul MURNI, tanpa database/jaringan; pengambilan alamat tujuan tautan pendek disuntik).
// Rencana: percakapan 2026-11-16 (penanda koordinat dicek sistem). Aturan KETAT (keputusan user): hanya titik yang PASTI yang sah.
//
//   VALID        : titik penanda (!3d!4d), koordinat pada ?q=/ll=/daddr=, atau tempat bernama (ID tempat / ftid) -- dan, bila koordinatnya diketahui, berada di Kota Medan.
//   TIDAK_VALID  : tampilan peta tanpa penanda, Street View, hasil pencarian teks, petunjuk arah (rute), di luar Medan, tautan mati, bukan Google Maps, atau tanpa titik.
//   BELUM_DICEK  : tidak bisa dipastikan (Google tidak menjawab, dibatasi, pengalihan tak dikenal). TIDAK PERNAH dianggap salah.

import { normalisasiKoordinat } from "./koordinat.ts";

export type HasilCek = "VALID" | "TIDAK_VALID" | "BELUM_DICEK";

export interface Penilaian {
  hasil: HasilCek;
  /** kode alasan (lihat ALASAN); kosong bila VALID */
  alasan: string;
  lat: number | null;
  lng: number | null;
}

/** Kotak Kota Medan yang sama dengan validasi input (_shared/koordinat.ts). */
export const BATAS_MEDAN = { latMin: 3.35, latMax: 3.85, lngMin: 98.50, lngMax: 98.85 };

/** Teks yang ditampilkan ke pengguna untuk tiap kode alasan. */
export const ALASAN: Readonly<Record<string, string>> = {
  TANPA_PENANDA: "Tautan hanya menampilkan tampilan peta, tanpa titik penanda",
  STREET_VIEW: "Tautan Street View, bukan titik penanda",
  PENCARIAN: "Tautan hasil pencarian teks, bukan titik penanda",
  ARAH: "Tautan petunjuk arah (rute), bukan titik lokasi",
  LUAR_MEDAN: "Titik berada di luar Kota Medan",
  MATI: "Tautan tidak ditemukan (kedaluwarsa atau salah)",
  BUKAN_GOOGLE: "Bukan tautan Google Maps",
  TANPA_TITIK: "Tautan tidak memuat titik lokasi yang jelas",
  TERPOTONG: "Tautan terpotong sehingga lokasinya hilang",
};

const dalamMedan = (lat: number, lng: number) =>
  lat >= BATAS_MEDAN.latMin && lat <= BATAS_MEDAN.latMax && lng >= BATAS_MEDAN.lngMin && lng <= BATAS_MEDAN.lngMax;

const valid = (lat: number | null, lng: number | null): Penilaian => ({ hasil: "VALID", alasan: "", lat, lng });
const salah = (alasan: string, lat: number | null = null, lng: number | null = null): Penilaian => ({ hasil: "TIDAK_VALID", alasan, lat, lng });
const belum = (alasan = ""): Penilaian => ({ hasil: "BELUM_DICEK", alasan, lat: null, lng: null });

/** Titik sah bila di Medan; di luar Medan = TIDAK_VALID. */
function titik(lat: number, lng: number): Penilaian {
  if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return salah("TANPA_TITIK");
  return dalamMedan(lat, lng) ? valid(lat, lng) : salah("LUAR_MEDAN", lat, lng);
}

function dekode(s: string): string {
  try { return decodeURIComponent(s); } catch (_e) { return s; }
}

const HOST_PETA = new Set(["www.google.com", "google.com", "www.google.co.id", "google.co.id", "maps.google.com", "maps.google.co.id"]);
const HOST_PENDEK = new Set(["maps.app.goo.gl", "goo.gl"]);

/** Tautan pendek Google Maps (maps.app.goo.gl/<kode> atau goo.gl/maps/<kode>)? */
export function adalahTautanPendek(url: unknown): boolean {
  if (typeof url !== "string") return false;
  let u: URL;
  try { u = new URL(url.trim()); } catch (_e) { return false; }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "maps.app.goo.gl") return u.pathname.length > 1;
  if (h === "goo.gl") return /^\/maps\//i.test(u.pathname) && u.pathname.length > 6;
  return false;
}

/**
 * Menilai alamat tujuan (atau tautan panjang yang tersimpan) tanpa jaringan. `url` HARUS sudah berupa alamat google.com/maps... (bukan tautan pendek).
 */
export function nilaiTautan(url: unknown): Penilaian {
  if (typeof url !== "string" || url.trim() === "") return salah("TANPA_TITIK");
  const mentah = url.trim();
  let u: URL;
  try { u = new URL(mentah); } catch (_e) { return salah("TANPA_TITIK"); }
  if (u.protocol !== "https:") return salah("BUKAN_GOOGLE");
  const host = u.hostname.toLowerCase();
  if (HOST_PENDEK.has(host)) return belum("tautan pendek belum dibuka");
  if (!HOST_PETA.has(host)) return salah("BUKAN_GOOGLE");
  const jalur = u.pathname || "/";
  if (!(jalur === "/" || jalur === "/maps" || jalur.startsWith("/maps/"))) return salah("BUKAN_GOOGLE");
  const t = dekode(mentah);

  // 1) Titik penanda !3d<lat>!4d<lng>. Nilai 0,0 adalah penanda kosong (muncul di tautan Street View) dan DIABAIKAN.
  const pin = t.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (pin) {
    const la = parseFloat(pin[1]), ln = parseFloat(pin[2]);
    if (!(la === 0 && ln === 0)) return titik(la, ln);
  }
  // 2) Koordinat pada parameter kueri (bentuk yang dibuat aplikasi sendiri: /maps?q=lat,lng) dan tujuan rute berupa koordinat (daddr)
  for (const kunci of ["q", "ll", "query", "center", "destination", "daddr"]) {
    const v = (u.searchParams.get(kunci) || "").replace(/^\s*loc:/i, "");
    const m = v ? v.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/) : null;
    if (m) return titik(parseFloat(m[1]), parseFloat(m[2]));
  }
  // 3) Petunjuk arah dan pencarian teks (tanpa koordinat di atas) bukan titik
  if (/^\/maps\/dir\//i.test(jalur) || u.searchParams.has("saddr") || u.searchParams.has("daddr")) return salah("ARAH");
  if (/^\/maps\/search\//i.test(jalur)) return salah("PENCARIAN");

  const at = t.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const idTempat = /!1s0x[0-9a-f]+:0x[0-9a-f]+/i.test(t) || u.searchParams.has("ftid") || /[?&]cid=\d+/.test(t);
  // 4) Tempat bernama: /maps/place/<nama>/ dengan ID tempat atau koordinat tempat
  const nama = jalur.match(/^\/maps\/place\/([^/@?]+)(?:\/|$)/i);
  if (nama) {
    const n = dekode(nama[1]).replace(/\+/g, " ").trim();
    // Nama tempat berupa koordinat LENGKAP (mis. /maps/place/3.5952,98.6722 atau DMS utuh): titik yang pasti. Yang terpotong tidak terbaca normalizer dan tetap TERPOTONG.
    const lengkap = !idTempat && (/\d+\.\d+\s*[,;]\s*-?\d+\.\d+/.test(n) || (/\d/.test(n) && /[NS]\b|[NS]\s/i.test(n) && /[EW]\b|[EW]$/i.test(n)) || /[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,6}/i.test(dekode(nama[1])));   // tempat ber-ID sudah teridentifikasi: ditangani aturan di bawah
    // Tautan Street View tetap TIDAK sah walau nama tempatnya berupa koordinat (yang terbaca hanya posisi kamera, aturan ketat user).
    if (lengkap && (/,\d+(?:\.\d+)?a,\d+(?:\.\d+)?y/.test(t) || /streetviewpixels|!1e1!3m/.test(t))) return salah("STREET_VIEW");
    for (const calon of lengkap ? [n, dekode(nama[1]).trim()] : []) {
      const k = normalisasiKoordinat(calon);
      if (k.ok && k.lat !== null && k.lng !== null) return titik(k.lat, k.lng);
      if (!k.ok && /luar Kota Medan/.test(String(k.pesan || ""))) return salah("LUAR_MEDAN");
    }
    if (/^\d+\s*[°º]/.test(n) || /^\d+\s*$/.test(n)) return salah("TERPOTONG");   // koordinat DMS yang terpotong pada tanda petik
    if (idTempat) return valid(at ? parseFloat(at[1]) : null, at ? parseFloat(at[2]) : null);
    if (at) {
      // nama + pusat tampilan tanpa ID tempat: hanya pencarian/tampilan
      return salah("PENCARIAN");
    }
    return salah("PENCARIAN");   // nama saja (mis. teks terpotong)
  }
  // 5) Tempat tanpa nama tetapi punya ID tempat (place//data=...!1s0x..:0x..) atau ?q=<alamat>&ftid=...
  if (idTempat && (/^\/maps\/place\/\//i.test(jalur) || u.searchParams.has("ftid") || u.searchParams.has("q") || u.searchParams.has("cid"))) {
    return valid(at ? parseFloat(at[1]) : null, at ? parseFloat(at[2]) : null);
  }
  // 6) Tampilan peta saja: /maps/@lat,lng,zoom (termasuk Street View) dan /maps/place//@lat,lng,zoom
  if (/^\/maps\/place\/\/@/i.test(jalur) || /^\/maps\/@/i.test(jalur) || (at && !idTempat)) {
    if (/,\d+(?:\.\d+)?a,\d+(?:\.\d+)?y/.test(t) || /streetviewpixels|!1e1!3m/.test(t)) return salah("STREET_VIEW", at ? parseFloat(at[1]) : null, at ? parseFloat(at[2]) : null);
    return salah("TANPA_PENANDA", at ? parseFloat(at[1]) : null, at ? parseFloat(at[2]) : null);
  }
  return salah("TANPA_TITIK");
}

/** Hasil pengambilan alamat tujuan sebuah tautan pendek. */
export type TujuanPendek =
  | { ok: true; tujuan: string }
  | { ok: false; jenis: "MATI" | "GAGAL"; pesan: string };

export type FungsiAmbil = (url: string, init: { redirect: "manual"; headers: Record<string, string> }) => Promise<{ status: number; headers: { get(n: string): string | null } }>;

const MAKS_LONCAT = 4;

/** Membuka tautan pendek (hanya header Location; tidak memuat halaman peta). Mengikuti pengalihan antar tautan pendek paling banyak MAKS_LONCAT kali. */
export async function ambilTujuanPendek(url: string, ambil: FungsiAmbil): Promise<TujuanPendek> {
  let sekarang = url.trim();
  for (let i = 0; i < MAKS_LONCAT; i++) {
    let r;
    try {
      r = await ambil(sekarang, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36", "accept-language": "id,en;q=0.8" } });
    } catch (e) {
      return { ok: false, jenis: "GAGAL", pesan: "jaringan: " + (e instanceof Error ? e.message : String(e)) };
    }
    if (r.status === 404 || r.status === 410) return { ok: false, jenis: "MATI", pesan: "HTTP " + r.status };
    if (r.status === 429 || r.status >= 500) return { ok: false, jenis: "GAGAL", pesan: "HTTP " + r.status };
    const lokasi = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && lokasi) {
      let berikut: URL;
      try { berikut = new URL(lokasi, sekarang); } catch (_e) { return { ok: false, jenis: "GAGAL", pesan: "alamat pengalihan tidak valid" }; }
      if (HOST_PENDEK.has(berikut.hostname.toLowerCase())) { sekarang = berikut.href; continue; }
      if (HOST_PETA.has(berikut.hostname.toLowerCase())) return { ok: true, tujuan: berikut.href };
      return { ok: false, jenis: "GAGAL", pesan: "pengalihan ke " + berikut.hostname };   // mis. halaman persetujuan: tidak dianggap salah
    }
    return { ok: false, jenis: "GAGAL", pesan: "tanpa pengalihan (HTTP " + r.status + ")" };
  }
  return { ok: false, jenis: "GAGAL", pesan: "terlalu banyak pengalihan" };
}

/** Penilaian lengkap sebuah tautan tersimpan: tautan pendek dibuka lebih dulu (lewat `ambil`), lainnya dinilai langsung. */
export async function periksaTautan(url: unknown, ambil: FungsiAmbil): Promise<Penilaian & { tujuan: string }> {
  if (typeof url !== "string") return { ...salah("TANPA_TITIK"), tujuan: "" };
  const t = url.trim();
  if (!adalahTautanPendek(t)) {
    const p = nilaiTautan(t);
    return { ...p, tujuan: "" };
  }
  const r = await ambilTujuanPendek(t, ambil);
  if (!r.ok) return r.jenis === "MATI" ? { ...salah("MATI"), tujuan: "" } : { ...belum(r.pesan), tujuan: "" };
  return { ...nilaiTautan(r.tujuan), tujuan: r.tujuan };
}
