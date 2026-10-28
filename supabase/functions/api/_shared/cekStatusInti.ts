// Inti logika "Cek Status Penerima" untuk warga (NIK + tanggal lahir). Plan: plans/plan-cek-status-penerima-publik.md.
//
// MODUL MURNI: tanpa Deno.*, tanpa akses database langsung -- semua dependensi disuntikkan lewat `DepsCek`, sehingga
// seluruh aturan keamanan di bawah bisa diuji di Node dengan data karangan (scripts/uji/cek-status-inti.test.mjs).
// Hubungan ke database/Deno ada di domains/cekStatusPublik.ts.
//
// ATURAN YANG TIDAK BOLEH DILANGGAR (lihat plan bagian 5.3, 8.2, 10):
//  1. NIK tidak ada DAN tanggal lahir salah memberi hasil IDENTIK ({sukses:false,kode:'TIDAK_TERDATA'}), dengan jalur
//     kode yang sama -- supaya keberadaan suatu NIK tidak bisa ditebak.
//  2. Penguncian dihitung per HASH NIK untuk semua NIK (ada atau tidak) -- NIK mentah tidak pernah disimpan.
//  3. Yang keluar hanya 5 kolom (nama, layanan, kecamatan, kelurahan, status), dipetakan eksplisit di sini.
//  4. Saklar mati (atau tak terbaca) = ditolak, sebelum menyentuh data penerima.

export const BATAS_GAGAL = 5;                  // percobaan per NIK (hash) dalam satu jendela; ke-6 dst. ditolak
export const JENDELA_DETIK = 15 * 60;          // panjang jendela tetap, dihitung sejak percobaan pertama
export const TAHUN_LAHIR_MIN = 1900;

export type KodeGagal = "NONAKTIF" | "FORMAT" | "TERKUNCI" | "TIDAK_TERDATA";

export interface DataPublik {
  nama: string;
  layanan: string;
  kecamatan: string;
  kelurahan: string;
  status: string;
}

export type HasilCek = { sukses: true; data: DataPublik } | { sukses: false; kode: KodeGagal };

/** Baris mentah dari database. Boleh memuat kolom lain; hanya 5 kolom di atas yang pernah dipakai. */
export type BarisPenerima = Record<string, unknown>;

export interface DepsCek {
  /** Garam hash NIK (rahasia server). Wajib terisi; bila tidak, proses gagal tertutup (melempar galat). */
  pepper: string;
  /** Tahun anggaran yang dicek. */
  tahun: number;
  /** Tanggal hari ini (WIB) 'YYYY-MM-DD'. */
  hariIni: () => string;
  /** Saklar fitur; false bila mati. Galat baca = anggap mati (dilempar ke atas). */
  fiturAktif: () => Promise<boolean>;
  /**
   * Mengambil SATU jatah percobaan secara ATOMIK (satu pernyataan SQL; hitungan naik dan nilainya dikembalikan dalam
   * satu langkah). true = masih dalam batas BATAS_GAGAL per JENDELA_DETIK; false = jatah habis (terkunci).
   * Wajib atomik: bila "cek terkunci" dan "catat gagal" dipisah, N permintaan paralel semuanya lolos cek sebelum ada
   * yang tercatat, sehingga batas 5 bisa dilampaui sebanyak N.
   */
  ambilJatah: (kunci: string) => Promise<boolean>;
  resetPercobaan: (kunci: string) => Promise<void>;
  /** SATU kueri yang mencocokkan NIK dan tanggal lahir sekaligus. */
  cariPenerima: (nik: string, tglLahir: string, tahun: number) => Promise<BarisPenerima | null>;
}

/** Kalender sungguhan: menolak 31 Februari, 2026-13-01, dan sejenisnya. */
export function tanggalKalenderValid(tgl: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tgl);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Mengembalikan {nik, tgl} bersih, atau null bila format salah. NIK HARUS string (angka JSON kehilangan nol di depan). */
export function validasiMasukan(
  nik: unknown,
  tanggalLahir: unknown,
  hariIni: string,
): { nik: string; tgl: string } | null {
  if (typeof nik !== "string" || typeof tanggalLahir !== "string") return null;
  const n = nik.trim();
  const t = tanggalLahir.trim();
  if (!/^[0-9]{16}$/.test(n)) return null;
  if (!tanggalKalenderValid(t)) return null;
  if (t < `${TAHUN_LAHIR_MIN}-01-01`) return null;
  if (t > hariIni) return null;                       // tanggal masa depan
  return { nik: n, tgl: t };
}

/** 'nik:' + sha256(garam + nik) heksadesimal. NIK mentah tidak pernah dikembalikan. */
export async function kunciPercobaan(pepper: string, nik: string): Promise<string> {
  const bytes = new TextEncoder().encode(pepper + nik);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return "nik:" + hex;
}

function teks(v: unknown): string {
  return v == null ? "" : String(v);
}

/** Pemetaan EKSPLISIT 5 kolom -- kolom lain di baris (jika ada) tidak ikut keluar. */
export function pilihKolomPublik(baris: BarisPenerima): DataPublik {
  return {
    nama: teks(baris.nama),
    layanan: teks(baris.layanan),
    kecamatan: teks(baris.kecamatan),
    kelurahan: teks(baris.kelurahan),
    status: teks(baris.status_verifikasi),
  };
}

export async function prosesCekStatus(deps: DepsCek, nik: unknown, tanggalLahir: unknown): Promise<HasilCek> {
  if (typeof deps.pepper !== "string" || deps.pepper.length < 16) {
    throw new Error("CEK_STATUS_PEPPER belum diset atau terlalu pendek (minimal 16 karakter).");
  }

  // 1. Saklar. Mati = tolak, sebelum menyentuh data penerima.
  if (!(await deps.fiturAktif())) return { sukses: false, kode: "NONAKTIF" };

  // 2. Format (tanpa menyentuh database; tidak dihitung sebagai percobaan gagal).
  const masukan = validasiMasukan(nik, tanggalLahir, deps.hariIni());
  if (!masukan) return { sukses: false, kode: "FORMAT" };

  // 3-4. Kunci per hash NIK (NIK ada maupun tidak). Jatah DIAMBIL DULU, secara atomik, SEBELUM mencari:
  //      yang sampai ke pencarian paling banyak BATAS_GAGAL per jendela, sebanyak apa pun permintaan paralelnya.
  const kunci = await kunciPercobaan(deps.pepper, masukan.nik);
  if (!(await deps.ambilJatah(kunci))) return { sukses: false, kode: "TERKUNCI" };

  // 5. Satu kueri, satu jalur: NIK dan tanggal lahir dicocokkan sekaligus.
  const baris = await deps.cariPenerima(masukan.nik, masukan.tgl, deps.tahun);

  // 6. Gagal (NIK tak ada ATAU tanggal salah) -> hasil dan jalur kode yang sama. Jatah sudah terpakai di langkah 4.
  if (!baris) return { sukses: false, kode: "TIDAK_TERDATA" };

  // 7. Berhasil: hitungan direset (pemilik yang benar tidak ikut terhitung).
  await deps.resetPercobaan(kunci);
  return { sukses: true, data: pilihKolomPublik(baris) };
}
