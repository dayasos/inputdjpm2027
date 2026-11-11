import { sql } from "./db.ts";
import { TAHUN_AKTIF } from "./config.ts";

// Pemeriksaan NIK terhadap data Capil (domisili luar Kota Medan) dan arsip tahun sebelumnya (status bukan AKTIF, termasuk
// "HASIL MONEV ..."). Satu sumber kebenaran untuk formulir input (domains/validasi.ts: cekNikRealtime, validasiDataBaru) dan
// Kelola Data (domains/kelolaData.ts), supaya aturannya tidak bisa menyimpang (plans/plan-pilih-rumah-ibadah-kelola-data.md, audit konsistensi).
// Dipindah apa adanya dari validasi.ts (port cekDomisiliCapil_ dan cekStatusTahunLalu_ dari Kode.gs).

// Data Capil berstatus PINDAH (diimpor dari sumber) mengisi kolom domisili TERTUKAR: kab_kota_domisili berisi NOMOR SURAT pindah
// ("SKPWNI/1271/27102025/0008") dan alamat_domisili berisi nama kabupaten/kota. Pesan penolakan sebelumnya menampilkan nomor surat itu
// sebagai "kabupaten/kota". Dicek 2026-11-10: 6 dari 28 baris Capil (semua berstatus PINDAH). Penanganan di kode, data TIDAK diubah.
const POLA_NOMOR_SURAT_PINDAH = /^SKPWNI\b|^[A-Z]{3,10}\/\d+\/\d+\/\d+$/i;
export function rapikanDomisiliCapil(alamat: unknown, kabKota: unknown): { alamatDomisili: string; kabKotaDomisili: string } {
  const a = String(alamat ?? "").trim();
  const k = String(kabKota ?? "").trim();
  if (k && POLA_NOMOR_SURAT_PINDAH.test(k)) return { alamatDomisili: "", kabKotaDomisili: a };
  return { alamatDomisili: a, kabKotaDomisili: k };
}

// Port dari cekDomisiliCapil() -- gagal cek TIDAK memblokir (sama seperti Kode.gs).
export async function cekDomisiliCapil(nik: string) {
  try {
    const nikTarget = String(nik || "").trim();
    if (!nikTarget) return { ditemukan: false as const };

    const rows = await sql`
      select nama, nik, status, alamat_domisili, kab_kota_domisili
      from capil
      where nik = ${nikTarget}
      limit 1
    `;
    if (rows.length === 0) return { ditemukan: false as const };

    const r = rows[0];
    const domisili = rapikanDomisiliCapil(r.alamat_domisili, r.kab_kota_domisili);
    return {
      ditemukan: true as const,
      nama: (r.nama || "").toString().trim(),
      nik: nikTarget,
      status: (r.status || "").toString().trim(),
      alamatDomisili: domisili.alamatDomisili,
      kabKotaDomisili: domisili.kabKotaDomisili,
    };
  } catch (_e) {
    // Jika error, JANGAN blokir input — sama seperti Kode.gs.
    return { ditemukan: false as const };
  }
}

// Port dari cekStatusTahunLalu_() — cek ke SEMUA tahun selain TAHUN_AKTIF sekaligus (satu query
// yang di-prune otomatis ke partisi relevan oleh Postgres), bukan loop per-sheet seperti GAS.
// Kalau NIK muncul di lebih dari satu tahun lampau, ambil yang tahunnya paling baru (order by tahun desc).
export async function cekStatusTahunLalu(nik: string) {
  try {
    const nikTarget = String(nik || "").trim();
    if (!nikTarget) return { ditemukan: false as const };

    const rows = await sql`
      select tahun, nama, layanan, status_verifikasi
      from penerima
      where nik = ${nikTarget} and tahun <> ${TAHUN_AKTIF}
      order by tahun desc
      limit 1
    `;
    if (rows.length === 0) return { ditemukan: false as const };

    const r = rows[0];
    const status = (r.status_verifikasi || "").toString().trim().toUpperCase();
    return {
      ditemukan: true as const,
      status,
      aktif: status === "AKTIF",
      nama: (r.nama || "").toString().trim(),
      layanan: (r.layanan || "").toString().trim().toUpperCase(),
      tahun: String(r.tahun),
    };
  } catch (_e) {
    return { ditemukan: false as const };
  }
}

/**
 * Untuk NIK yang BARU dimasukkan pada Kelola Data (NIK berubah): sama dengan pemeriksaan di formulir input -- tolak NIK berdomisili
 * di luar Kota Medan (Capil) dan NIK yang di arsip tahun lalu berstatus bukan AKTIF (mis. HASIL MONEV, MENINGGAL DUNIA, ASN/P3K).
 * Pesan disamakan dengan validasiDataBaru. Harus dipanggil di LUAR transaksi (memakai pool `sql`).
 */
export async function periksaNikBolehDipakai(nik: string): Promise<{ ok: true } | { ok: false; pesan: string }> {
  // Dua kueri independen dijalankan bersamaan (hemat satu bolak-balik ke database); Capil tetap diprioritaskan di hasil.
  const [cekCapil, cekTahunLalu] = await Promise.all([cekDomisiliCapil(nik), cekStatusTahunLalu(nik)]);
  if (cekCapil.ditemukan) {
    return { ok: false, pesan: "GAGAL: NIK INI TERDAFTAR SEBAGAI DOMISILI DI LUAR KOTA MEDAN: " + cekCapil.kabKotaDomisili };
  }
  if (cekTahunLalu.ditemukan && !cekTahunLalu.aktif) {
    return {
      ok: false,
      pesan: "GAGAL: NIK INI TERDAFTAR DI DATA " + (cekTahunLalu.tahun || "SEBELUMNYA") + " DENGAN STATUS: " + cekTahunLalu.status,
    };
  }
  return { ok: true };
}
