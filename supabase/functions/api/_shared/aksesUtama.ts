import { wajibSesi } from "./sesi.ts";
import type { DataSesi } from "./sesi.ts";

/**
 * Galat yang pesannya aman ditampilkan ke pengguna. Dilempar DI DALAM sql.begin() agar transaksi
 * dibatalkan (ROLLBACK), lalu ditangkap pemanggil dan diubah jadi {sukses:false, pesan}.
 * Galat lain (bug/DB) tetap melewati jalur String(error) seperti sebelumnya.
 */
export class GalatBisnis extends Error {}

/** Sesi harus milik admin UTAMA. Bentuk balikan: {sesi} bila sah, {galat} siap dikembalikan bila tidak. */
export async function wajibUtama(
  token: string,
  pesanTolak: string,
): Promise<{ sesi: DataSesi } | { galat: { sukses: false; pesan: string } }> {
  let sesi: DataSesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { galat: { sukses: false, pesan: e instanceof Error ? e.message : String(e) } };
  }
  if ((sesi.role || "").toString().trim().toUpperCase() !== "UTAMA") {
    return { galat: { sukses: false, pesan: pesanTolak } };
  }
  return { sesi };
}
