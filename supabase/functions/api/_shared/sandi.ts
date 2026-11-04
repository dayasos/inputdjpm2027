import { bandingkanHashConstantTime, hashString } from "./hash.ts";

// Penyimpanan & verifikasi sandi. Dua format hidup berdampingan:
//   LAMA : SHA-256 heksadesimal 64 karakter, tanpa garam (hash.ts; warisan Kode.gs agar hash lama tetap berlaku).
//   BARU : "pbkdf2$sha256$<iterasi>$<garam base64url>$<hash base64url>" -- PBKDF2-HMAC-SHA256 dengan garam acak per akun.
//          Jumlah iterasi ikut tersimpan di dalam hash, jadi bisa dinaikkan nanti tanpa mengubah format.
//
// DUA FASE (agar fungsi bisa dikembalikan ke versi sebelumnya tanpa mengunci pengguna):
//   FASE A (bawaan, saklar mati): fungsi SELALU bisa memverifikasi kedua format, tetapi hanya MENULIS format lama.
//   FASE B (secret HASH_SANDI_BARU=1): sandi baru/ganti/reset ditulis format BARU, dan akun berformat lama ditingkatkan
//          otomatis saat login berhasil (sekali per akun). Kembali ke fase A cukup dengan mematikan saklar; hash baru yang sudah
//          tertulis tetap terverifikasi. JANGAN kembali ke kode yang lebih lama dari fase A setelah fase B berjalan.
//
// Plan/catatan: memori project_rls_log_arsip_terbuka_dan_toast_master (audit keamanan 2026-11-04).

const AWALAN = "pbkdf2$sha256$";
/** 210.000 iterasi ≈ 110 ms di mesin uji (perkiraan 170-340 ms di Edge Function): kompromi dengan batas CPU paket gratis. */
export const ITERASI_BARU = 210_000;
const ITERASI_MIN = 10_000;
const ITERASI_MAKS = 2_000_000; // pagar: nilai tak masuk akal di data tidak boleh menjadi beban CPU tanpa batas
const PANJANG_GARAM = 16;
const PANJANG_HASIL = 32;

const enc = new TextEncoder();

function keBase64Url(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function dariBase64Url(t: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(t)) return null;
  const baku = t.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (t.length % 4)) % 4);
  try {
    const biner = atob(baku);
    return Uint8Array.from(biner, (c) => c.charCodeAt(0));
  } catch (_e) {
    return null;
  }
}

async function turunkan(sandi: string, garam: Uint8Array, iterasi: number): Promise<Uint8Array> {
  const kunci = await crypto.subtle.importKey("raw", enc.encode(sandi), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: garam, iterations: iterasi }, kunci, PANJANG_HASIL * 8);
  return new Uint8Array(bits);
}

/** Saklar fase B. Dibaca setiap panggilan (bukan saat modul dimuat) supaya perubahan secret berlaku di instance yang baru. */
export function hashSandiBaruAktif(): boolean {
  try {
    return (Deno.env.get("HASH_SANDI_BARU") || "").trim() === "1";
  } catch (_e) {
    return false;
  }
}

export function adalahHashBaru(tersimpan: unknown): boolean {
  return typeof tersimpan === "string" && tersimpan.startsWith(AWALAN);
}

function uraikan(tersimpan: string): { iterasi: number; garam: Uint8Array; hasil: string } | null {
  const bagian = tersimpan.split("$");
  if (bagian.length !== 5 || bagian[0] !== "pbkdf2" || bagian[1] !== "sha256") return null;
  if (!/^[0-9]{1,8}$/.test(bagian[2])) return null;
  const iterasi = Number(bagian[2]);
  if (iterasi < ITERASI_MIN || iterasi > ITERASI_MAKS) return null;
  const garam = dariBase64Url(bagian[3]);
  if (!garam || garam.length < 8 || !dariBase64Url(bagian[4])) return null;
  return { iterasi, garam, hasil: bagian[4] };
}

/** Hash format BARU (selalu), dengan garam acak. */
export async function buatHashBaru(sandi: string): Promise<string> {
  const garam = crypto.getRandomValues(new Uint8Array(PANJANG_GARAM));
  const hasil = await turunkan(sandi, garam, ITERASI_BARU);
  return `${AWALAN}${ITERASI_BARU}$${keBase64Url(garam)}$${keBase64Url(hasil)}`;
}

/** Hash untuk DISIMPAN: format sesuai saklar (fase A = lama, fase B = baru). Dipakai semua jalur ganti/reset/buat akun. */
export async function hashUntukSimpan(sandi: string): Promise<string> {
  return hashSandiBaruAktif() ? await buatHashBaru(sandi) : await hashString(sandi);
}

/** Cocokkah `sandi` dengan hash tersimpan (format apa pun)? Perbandingan tahan serangan waktu. Nilai tak dikenal -> false. */
export async function verifikasiSandi(sandi: string, tersimpan: unknown): Promise<boolean> {
  if (typeof tersimpan !== "string" || tersimpan === "") return false;
  if (adalahHashBaru(tersimpan)) {
    const u = uraikan(tersimpan);
    if (!u) return false;
    const dihitung = keBase64Url(await turunkan(sandi, u.garam, u.iterasi));
    return bandingkanHashConstantTime(dihitung, u.hasil);
  }
  return bandingkanHashConstantTime(tersimpan, await hashString(sandi));
}

/** Perlu ditingkatkan saat login berhasil? Hanya pada fase B: format lama, atau format baru dengan iterasi di bawah standar sekarang. */
export function perluUpgradeHash(tersimpan: unknown): boolean {
  if (!hashSandiBaruAktif() || typeof tersimpan !== "string") return false;
  if (!adalahHashBaru(tersimpan)) return true;
  const u = uraikan(tersimpan);
  return u !== null && u.iterasi < ITERASI_BARU;
}
