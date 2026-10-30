// Logika MURNI fitur Cek Alamat Tugas GMM (tanpa database; plan: plans/plan-cek-alamat-tugas-gmm.md).
// Dipisah dari domains/cekAlamatTugas.ts agar alur status, validasi, dan lingkup akses bisa diuji tuntas di Node.

export const LAYANAN_GMM = "GURU MAGHRIB MENGAJI";

export const STATUS = ["BELUM", "SUDAH_BENAR", "DIPERBAIKI", "TIDAK_PASTI", "DIKEMBALIKAN", "SELESAI"] as const;
export type Status = typeof STATUS[number];
export type Peran = "UTAMA" | "GMM";
export type Menunggu = Peran | null;

export const MAKS_PESAN = 500;
export const MIN_ALASAN = 5;
export const MIN_ALAMAT = 5;
export const MAKS_ALAMAT = 100; // sama dengan batas kolom Alamat Tempat Tugas di form input
export const UKURAN_HALAMAN = 25;

/** Teks seragam dengan rapikanTeks() di config.ts: tanpa spasi tepi/ganda, HURUF BESAR. */
export function rapi(teks: unknown): string {
  return (teks == null ? "" : String(teks)).trim().toUpperCase().replace(/\s+/g, " ");
}

/**
 * Tempat tugas "RUMAH" (kata utuh): diawali RUMAH atau RMH tanpa huruf/angka sesudahnya, dan BUKAN "RUMAH IBADAH ..." (lembaga).
 * HARUS sama dengan public/js/pengingat-alamat-rumah.js dan dengan kriteria SQL di domains/cekAlamatTugas.ts (kesetaraan dijaga uji).
 */
export function tempatTugasRumah(tempatTugas: unknown): boolean {
  const t = rapi(tempatTugas);
  return /^(RUMAH|RMH)(?![A-Z0-9])/.test(t) && !/^RUMAH[^A-Z0-9]*IBADAH(?![A-Z0-9])/.test(t);
}

/** Alamat dibandingkan tanpa peduli huruf besar/kecil, spasi, dan tanda baca. Kosong tidak pernah dianggap sama. */
export function samaAlamat(a: unknown, b: unknown): boolean {
  const x = rapi(a).replace(/[^A-Z0-9]/g, "");
  const y = rapi(b).replace(/[^A-Z0-9]/g, "");
  return x !== "" && x === y;
}

// ── Lingkup akses ────────────────────────────────────────────────────────────────────────────────────────────
export interface Lingkup {
  peran: Peran;
  /** Kosong = semua kecamatan (UTAMA, atau akun GMM tingkat Kota). */
  kecamatan: string;
}

/** Hanya UTAMA dan akun GURU MAGHRIB MENGAJI yang punya akses; peran lain (KECAMATAN, MUI, layanan lain) null. */
export function lingkupAkun(role: unknown, kecamatan: unknown): Lingkup | null {
  const r = rapi(role);
  if (r === "UTAMA") return { peran: "UTAMA", kecamatan: "" };
  if (r === LAYANAN_GMM) return { peran: "GMM", kecamatan: rapi(kecamatan) };
  return null;
}

/** Apakah data di kecamatan ini boleh disentuh oleh lingkup tersebut. */
export function kecamatanDalamLingkup(lingkup: Lingkup, kecamatanData: unknown): boolean {
  if (!lingkup.kecamatan) return true;
  return rapi(kecamatanData) === lingkup.kecamatan;
}

// ── Validasi masukan ─────────────────────────────────────────────────────────────────────────────────────────
export type Hasil<T> = ({ ok: true } & T) | { ok: false; pesan: string };

export function validasiAlamatBaru(masukan: unknown): Hasil<{ alamat: string }> {
  if (typeof masukan !== "string") return { ok: false, pesan: "Alamat tugas yang benar wajib diisi." };
  const alamat = rapi(masukan);
  if (alamat.length < MIN_ALAMAT) return { ok: false, pesan: `Alamat tugas terlalu pendek (minimal ${MIN_ALAMAT} karakter).` };
  if (alamat.length > MAKS_ALAMAT) return { ok: false, pesan: `Alamat tugas terlalu panjang (maksimal ${MAKS_ALAMAT} karakter).` };
  // deno-lint-ignore no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(alamat)) return { ok: false, pesan: "Alamat tugas memuat karakter yang tidak diizinkan." };
  if (!/[A-Z]/.test(alamat)) return { ok: false, pesan: "Alamat tugas harus memuat nama jalan atau lingkungan." };
  return { ok: true, alamat };
}

export function validasiPesan(masukan: unknown, opsi: { wajib: boolean }): Hasil<{ isi: string }> {
  if (masukan != null && typeof masukan !== "string") return { ok: false, pesan: "Catatan tidak valid." };
  const isi = (masukan ?? "").toString().replace(/\r\n/g, "\n").trim();
  // deno-lint-ignore no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(isi)) return { ok: false, pesan: "Catatan memuat karakter yang tidak diizinkan." };
  if (isi.length > MAKS_PESAN) return { ok: false, pesan: `Catatan terlalu panjang (maksimal ${MAKS_PESAN} karakter).` };
  if (opsi.wajib && isi.length < MIN_ALASAN) return { ok: false, pesan: `Catatan wajib diisi (minimal ${MIN_ALASAN} karakter).` };
  return { ok: true, isi };
}

export function idPositif(v: unknown): number | null {
  const n = typeof v === "string" && /^[0-9]{1,15}$/.test(v.trim()) ? Number(v.trim()) : typeof v === "number" ? v : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// ── Alur status ──────────────────────────────────────────────────────────────────────────────────────────────
export type Aksi = "JAWAB_BENAR" | "JAWAB_TIDAK_PASTI" | "JAWAB_DIPERBAIKI" | "BALAS" | "KEMBALIKAN" | "SELESAI";

const STATUS_BISA_DIJAWAB: Status[] = ["BELUM", "DIKEMBALIKAN"];
const STATUS_SUDAH_DIJAWAB: Status[] = ["SUDAH_BENAR", "DIPERBAIKI", "TIDAK_PASTI"];

/**
 * Aturan satu-satunya untuk perpindahan status (dipakai server di dalam transaksi, dengan baris terkunci).
 *  - Jawab (hanya GMM): saat BELUM atau DIKEMBALIKAN -> status jawaban, menunggu UTAMA.
 *  - Balas (keduanya): selama belum SELESAI; status tetap, menunggu pindah ke pihak lawan.
 *  - Kembalikan (hanya UTAMA): dari sudah-dijawab atau SELESAI -> DIKEMBALIKAN, menunggu GMM.
 *  - Selesai (hanya UTAMA): dari status apa pun selain SELESAI -> SELESAI, tidak ada yang ditunggu.
 */
export function transisi(
  aksi: Aksi,
  peran: Peran,
  status: Status,
): { ok: true; status: Status; menunggu: Menunggu } | { ok: false; pesan: string } {
  switch (aksi) {
    case "JAWAB_BENAR":
    case "JAWAB_TIDAK_PASTI":
    case "JAWAB_DIPERBAIKI": {
      if (peran !== "GMM") return { ok: false, pesan: "Hanya akun Guru Maghrib Mengaji yang dapat menjawab permintaan cek." };
      if (!STATUS_BISA_DIJAWAB.includes(status)) {
        return { ok: false, pesan: "Permintaan ini sudah dijawab atau ditutup. Tambahkan catatan, atau minta Admin Utama mengembalikannya bila perlu dicek ulang." };
      }
      const baru: Status = aksi === "JAWAB_BENAR" ? "SUDAH_BENAR" : aksi === "JAWAB_TIDAK_PASTI" ? "TIDAK_PASTI" : "DIPERBAIKI";
      return { ok: true, status: baru, menunggu: "UTAMA" };
    }
    case "BALAS":
      if (status === "SELESAI") return { ok: false, pesan: "Permintaan ini sudah selesai. Admin Utama dapat mengembalikannya bila perlu dicek ulang." };
      return { ok: true, status, menunggu: peran === "GMM" ? "UTAMA" : "GMM" };
    case "KEMBALIKAN":
      if (peran !== "UTAMA") return { ok: false, pesan: "Hanya Admin Utama yang dapat mengembalikan permintaan." };
      if (!STATUS_SUDAH_DIJAWAB.includes(status) && status !== "SELESAI") {
        return { ok: false, pesan: "Permintaan ini belum dijawab, tidak perlu dikembalikan." };
      }
      return { ok: true, status: "DIKEMBALIKAN", menunggu: "GMM" };
    case "SELESAI":
      if (peran !== "UTAMA") return { ok: false, pesan: "Hanya Admin Utama yang dapat menandai selesai." };
      if (status === "SELESAI") return { ok: false, pesan: "Permintaan ini sudah selesai." };
      return { ok: true, status: "SELESAI", menunggu: null };
  }
}

/** Menutup tanpa jawaban GMM (BELUM/DIKEMBALIKAN) wajib disertai catatan alasan. */
export function selesaiButuhCatatan(status: Status): boolean {
  return STATUS_BISA_DIJAWAB.includes(status);
}

export function statusValid(v: unknown): v is Status {
  return typeof v === "string" && (STATUS as readonly string[]).includes(v);
}
