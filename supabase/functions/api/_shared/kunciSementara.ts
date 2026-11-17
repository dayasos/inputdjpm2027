// KUNCI SEMENTARA (2026-11-17): selama Tahap B penanda koordinat dikerjakan, petugas lapangan TIDAK boleh memperbaiki data Guru Maghrib Mengaji
// (Edit Data dan Lapor perbaikan), supaya koordinat tidak diperbaiki dengan tautan salah yang sama. Admin Utama tidak terkena kunci.
// HAPUS berkas ini beserta pemakaiannya (domains/penerima.ts editDataPenerimaInti dan domains/verifikasi.ts laporkanPerbaikanBerkas) saat Tahap B tayang.
//
// Bawaan: AKTIF. Hanya variabel lingkungan KUNCI_PERBAIKAN_GMM=off yang mematikannya (dipakai uji; tidak perlu diatur di produksi).

export const PESAN_PERBAIKAN_GMM_DIKUNCI =
  "Perbaikan data Guru Maghrib Mengaji belum dapat dilakukan karena sistem sedang dalam pemeliharaan (maintenance). Mohon tunggu pengumuman berikutnya.";

/** true bila perubahan/laporan perbaikan oleh peran ini pada data layanan ini sedang dikunci. */
export function perbaikanGmmDikunci(role: unknown, layanan: unknown): boolean {
  if (Deno.env.get("KUNCI_PERBAIKAN_GMM") === "off") return false;
  const lay = String(layanan == null ? "" : layanan).trim().toUpperCase();
  const peran = String(role == null ? "" : role).trim().toUpperCase();
  return lay === "GURU MAGHRIB MENGAJI" && peran !== "UTAMA";
}
