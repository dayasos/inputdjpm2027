// Nilai kolom yang ditulis saat status verifikasi sebuah data ditetapkan (MODUL MURNI).
// Dipakai BERSAMA oleh verifikasiSatuData (verifikasi pertama) dan simpanHasilUlang (verifikasi ulang) supaya aturan
// "Memenuhi Syarat mengosongkan keterangan; BTL memulai putaran perbaikan baru dan memakai batas seragam" tidak bisa menyimpang.

export interface NilaiStatusVerifikasi {
  /** keterangan yang disimpan (kosong untuk Memenuhi Syarat) */
  keterangan: string;
  /** true -> tanggal_lapor_perbaikan dan dilapor_oleh dikosongkan (putaran perbaikan baru) */
  putaranBaru: boolean;
  /** batas_waktu_perbaikan: batas seragam hanya untuk Berkas Tidak Lengkap, selain itu "" (disimpan null) */
  batasWaktu: string;
}

export function nilaiStatusVerifikasi(statusBaru: string, keterangan: unknown, batasPerbaikanSeragam: string): NilaiStatusVerifikasi {
  const memenuhi = statusBaru === "Memenuhi Syarat";
  return {
    keterangan: memenuhi ? "" : String(keterangan == null ? "" : keterangan).trim(),
    putaranBaru: memenuhi || statusBaru === "Berkas Tidak Lengkap",
    batasWaktu: statusBaru === "Berkas Tidak Lengkap" ? batasPerbaikanSeragam : "",
  };
}
