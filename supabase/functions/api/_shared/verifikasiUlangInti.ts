// Aturan murni verifikasi ulang (tanpa database). Rencana: plans/plan-verifikasi-ulang.md bagian 3 dan 6.

export const STATUS_MS = "Memenuhi Syarat";
export const STATUS_BTL = "Berkas Tidak Lengkap";
export const STATUS_TMS = "Tidak Memenuhi Syarat";
export const STATUS_FINAL = [STATUS_MS, STATUS_BTL, STATUS_TMS];

/** Kolom berkas pada penerima (yang diunggah). Link koordinat BUKAN berkas. */
export const SLOT_BERKAS: ReadonlyArray<{ kunci: string; label: string }> = [
  { kunci: "link_ktp", label: "KTP" },
  { kunci: "link_buku_rekening", label: "Buku Rekening" },
  { kunci: "link_surat_permohonan", label: "Surat Permohonan" },
  { kunci: "link_pernyataan_satu_bantuan", label: "Pernyataan Satu Bantuan" },
  { kunci: "link_domisili_kelurahan", label: "Domisili Kelurahan" },
  { kunci: "link_formulir_pendataan", label: "Formulir Pendataan" },
  { kunci: "link_berkas_pendukung", label: "Berkas Pendukung" },
  { kunci: "link_foto_plank_rumah_ibadah", label: "Foto Plank Rumah Ibadah" },
  { kunci: "link_foto_lokasi_ibadah", label: "Foto Lokasi Ibadah" },
  { kunci: "link_foto_kegiatan_belajar", label: "Foto Kegiatan Belajar" },
  { kunci: "link_rekomendasi_bkm", label: "Rekomendasi BKM" },
  { kunci: "link_rekomendasi_rumah_ibadah", label: "Rekomendasi Rumah Ibadah" },
  { kunci: "link_domisili_rumah_ibadah", label: "Domisili Rumah Ibadah" },
];

export interface BerkasTugas {
  kunci: string;
  label: string;
  url: string;
}

/** Daftar berkas yang BENAR-BENAR diunggah (kolom tidak kosong). Diambil dari data, bukan dari layar. */
export function daftarBerkasDariBaris(baris: Record<string, unknown>): BerkasTugas[] {
  const hasil: BerkasTugas[] = [];
  const layanan = String(baris.layanan == null ? "" : baris.layanan).trim().toUpperCase();
  for (const s of SLOT_BERKAS) {
    const url = String(baris[s.kunci] == null ? "" : baris[s.kunci]).trim();
    if (url) hasil.push({ kunci: s.kunci, label: labelBerkasUntukLayanan(s.kunci, s.label, layanan), url });
  }
  return hasil;
}

/**
 * Nama berkas yang tampil. Untuk Ustadz/Ustadzah, kolom "berkas pendukung" berisi REKOMENDASI MUI (sama dengan layar Detail dan form input);
 * layanan lain tetap "Berkas Pendukung". `layanan` sudah huruf besar dan dirapikan.
 */
export function labelBerkasUntukLayanan(kunci: string, label: string, layanan: string): string {
  if (kunci === "link_berkas_pendukung" && (layanan === "USTADZ" || layanan === "USTADZAH")) return "Rekomendasi MUI";
  return label;
}

/**
 * Peralihan status yang boleh dilakukan pemeriksa (K13): turun/pindah antar BTL dan TMS, serta MS -> BTL/TMS.
 * NAIK ke Memenuhi Syarat tetap hanya Admin Utama (tidak lewat verifikasi ulang).
 */
export function peralihanStatusDiizinkan(dari: string, ke: string): boolean {
  if (!STATUS_FINAL.includes(dari) || !STATUS_FINAL.includes(ke)) return false;
  if (dari === ke) return false;
  if (ke === STATUS_MS) return false;
  return true;
}

/**
 * Berkas yang klik-nya masih SAH: sudah diklik DAN tautannya sekarang sama dengan tautan saat diklik. Bila kelurahan mengganti berkas sesudah
 * pemeriksa mengkliknya, klik lama tidak berlaku (pemeriksa harus membuka berkas yang baru).
 */
export function berkasDibukaSah(berkas: BerkasTugas[], dibuka: string[], urlTercatat: Record<string, unknown> | null | undefined): string[] {
  const sudah = new Set(dibuka || []);
  const peta = urlTercatat && typeof urlTercatat === "object" ? urlTercatat : {};
  return berkas.filter((b) => sudah.has(b.kunci) && String(peta[b.kunci] == null ? "" : peta[b.kunci]) === b.url).map((b) => b.kunci);
}

export interface MasukanSimpanHasil {
  hasil: unknown;
  statusSebelum: string;      // status data sekarang di basis data
  statusSesudah?: unknown;    // status yang dipilih (DIKOREKSI)
  alasan?: unknown;
  berkas: BerkasTugas[];      // dari data
  berkasDibuka: string[];     // kunci berkas yang sudah diklik (dicatat server)
  centang?: unknown;          // { kunci: boolean } dari layar
  sudahDibuka: boolean;       // tugas sudah pernah dibuka (dibuka_pada terisi)
}

export type HasilCek =
  | { ok: true; hasil: "SESUAI" | "DIKOREKSI"; statusSesudah: string; alasan: string; daftarPeriksa: Record<string, boolean> }
  | { ok: false; pesan: string };

/** Validasi menyimpan hasil verifikasi ulang (V3, V8). Server memakai fungsi ini apa adanya. */
export function cekSimpanHasil(m: MasukanSimpanHasil): HasilCek {
  const hasil = String(m.hasil || "").toUpperCase();
  if (hasil !== "SESUAI" && hasil !== "DIKOREKSI") return { ok: false, pesan: "Hasil harus Sesuai atau Dikoreksi." };
  if (!m.sudahDibuka) return { ok: false, pesan: "Buka data terlebih dahulu sebelum menyimpan hasil." };

  const dibuka = new Set(m.berkasDibuka || []);
  const belumDibuka = m.berkas.filter((b) => !dibuka.has(b.kunci));
  if (belumDibuka.length > 0) {
    return { ok: false, pesan: "Klik dan periksa setiap berkas terlebih dahulu. Belum dibuka: " + belumDibuka.map((b) => b.label).join(", ") + "." };
  }

  // Centang hanya dihitung untuk berkas yang memang ada; kunci asing diabaikan.
  const peta = (m.centang && typeof m.centang === "object" ? m.centang : {}) as Record<string, unknown>;
  const daftar: Record<string, boolean> = {};
  for (const b of m.berkas) daftar[b.kunci] = peta[b.kunci] === true;

  if (hasil === "SESUAI") {
    const belumCentang = m.berkas.filter((b) => !daftar[b.kunci]);
    if (belumCentang.length > 0) {
      return { ok: false, pesan: "Centang setiap berkas yang sudah diperiksa. Belum dicentang: " + belumCentang.map((b) => b.label).join(", ") + "." };
    }
    return { ok: true, hasil: "SESUAI", statusSesudah: m.statusSebelum, alasan: String(m.alasan || "").trim(), daftarPeriksa: daftar };
  }

  const statusSesudah = String(m.statusSesudah || "").trim();
  if (!peralihanStatusDiizinkan(m.statusSebelum, statusSesudah)) {
    return {
      ok: false,
      pesan: statusSesudah === STATUS_MS
        ? "Menaikkan status ke Memenuhi Syarat hanya dapat dilakukan Admin Utama."
        : "Perubahan status dari \"" + m.statusSebelum + "\" ke \"" + statusSesudah + "\" tidak diizinkan.",
    };
  }
  const alasan = String(m.alasan || "").trim();
  if (!alasan) return { ok: false, pesan: "Alasan koreksi wajib diisi." };
  return { ok: true, hasil: "DIKOREKSI", statusSesudah, alasan, daftarPeriksa: daftar };
}

/** V11: akun pimpinan yang TIDAK pernah menerima tugas verifikasi ulang. Ditegakkan server; tidak dapat ditimpa dari layar. */
export const PENGECUALIAN_ULANG: ReadonlyArray<string> = [
  "verif_ronald_fredy", "verif_fery_suhery", "verif_khoiruddin", "verif_amy_pratiwi", "verif_netty_abdiati",
];
/** V10: satu-satunya pemeriksa data Berkas Tidak Lengkap / Tidak Memenuhi Syarat (tidak ikut bagian acak data MS). */
export const AKUN_KHUSUS_ULANG = "verif_uga_deba";
