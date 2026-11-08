// Tautan peta untuk halaman publik Cek Status (khusus Guru Maghrib Mengaji). Plan: plans/plan-cek-status-koordinat-gmm.md.
//
// MODUL MURNI (tanpa Deno.*): diuji di Node (scripts/uji/cek-status-koordinat.test.mjs). SALINAN aturan yang sama ada di
// worker/cek-status.js (pertahanan berlapis; Worker adalah gerbang publik). Kesamaan keduanya dijaga oleh uji kesesuaian.
//
// Aturan: tautan dari database hanya boleh menjadi tombol bila PASTI tautan peta Google. Ragu = null (tanpa tombol), gagal tertutup.

export const LAYANAN_PETA = "GURU MAGHRIB MENGAJI";
export const STATUS_TANPA_PETA = "Tidak Memenuhi Syarat";
export const MAKS_PANJANG_TAUTAN = 1000;

/** Rapikan nama layanan (spasi ganda, huruf besar/kecil) sebelum dibandingkan. */
export function samaDenganLayananPeta(layanan: unknown): boolean {
  if (typeof layanan !== "string") return false;
  return layanan.trim().replace(/\s+/g, " ").toUpperCase() === LAYANAN_PETA;
}

/**
 * Mengembalikan tautan yang sudah dinormalkan bila aman dibuka sebagai tautan peta, atau null.
 * - hanya https; tanpa kredensial dan tanpa port; tanpa spasi/kontrol/garis miring terbalik pada teks asli;
 * - host harus PERSIS salah satu dari daftar (bukan pencocokan akhiran: google.com.evil.com ditolak).
 */
export function tautanPetaAman(nilai: unknown): string | null {
  if (typeof nilai !== "string") return null;
  const mentah = nilai.trim();
  if (mentah.length === 0 || mentah.length > MAKS_PANJANG_TAUTAN) return null;
  if (!/^https:\/\//i.test(mentah)) return null;
  if (/[\s\u0000-\u001f\u007f\\]/.test(mentah)) return null;
  let u: URL;
  try {
    u = new URL(mentah);
  } catch (_e) {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (u.username !== "" || u.password !== "" || u.port !== "") return null;
  const host = u.hostname;
  const jalur = u.pathname;
  let ok = false;
  if (host === "www.google.com" || host === "google.com" || host === "www.google.co.id" || host === "google.co.id") ok = jalur === "/maps" || jalur.startsWith("/maps/");
  else if (host === "maps.google.com") ok = jalur === "/" || jalur === "/maps" || jalur.startsWith("/maps/");
  else if (host === "maps.app.goo.gl") ok = jalur.length > 1;
  else if (host === "goo.gl") ok = jalur.startsWith("/maps/");
  return ok ? u.href : null;
}
