import { wajibSesi } from "./sesi.ts";
import {
  kelurahanTerkunciDari,
  lolosAksesBarisLihatData,
  resolveInstansiPengguna,
  subFilterGsmDari,
} from "./akses.ts";

// Dipindah dari domains/retur.ts (modul Retur terintegrasi dihapus; Retur memakai aplikasi terpisah).
// Dipakai domains/statusPenerima.ts. Hak akses baris = fungsi bersama `lolosAksesBarisLihatData`
// (kecamatan / kelurahan terkunci / layanan Kemenag / sub-filter GSM), sama persis dengan "Lihat Data" --
// jangan menulis ulang aturan akses di sini.

export const BULAN = [
  "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
  "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER",
] as const;

type SesiLogin = Awaited<ReturnType<typeof wajibSesi>>;

/** Pembuat penyaring baris sesuai hak akses sesi. `tempatTugas` dibutuhkan sub-filter GSM Katolik/Kristen. */
export async function buatPenyaringAkses(sesi: SesiLogin) {
  const { instansiPengguna, layananPengguna, listLayananKemenag } = await resolveInstansiPengguna(sesi.role);
  if (!instansiPengguna) throw new Error("Peran tidak dikenali.");
  const namaKecamatanPengguna = sesi.kecamatan || "";
  const kelurahanTerkunci = kelurahanTerkunciDari(sesi);
  const subFilterGsm = subFilterGsmDari(sesi);

  // Parameter bertipe `Record<string, any>` karena baris dari postgres.js bertipe `Row` (indeks bebas);
  // kolom yang dibaca selalu ada di SELECT pemanggil (layanan, kecamatan, kelurahan, tempat_tugas).
  // deno-lint-ignore no-explicit-any
  return (b: Record<string, any>) =>
    lolosAksesBarisLihatData({
      instansiPengguna,
      layananPengguna,
      namaKecamatanPengguna,
      kelurahanTerkunci,
      subFilterGsm,
      listLayananKemenag,
      layananSheet: (b.layanan || "").toUpperCase(),
      kecamatanSheet: (b.kecamatan || "").toUpperCase(),
      kelurahanSheet: (b.kelurahan || "").toUpperCase(),
      tempatTugasSheet: (b.tempat_tugas || "").toUpperCase(),
    });
}
