// Logika MURNI timer periode input (tanpa akses database dan tanpa API Deno), dipisah supaya bisa
// diuji langsung di Node. Pemakai: domains/setelan.ts. Rancangan: plans/plan-timer-tutup-periode-input.md

export type SumberAkses = "KHUSUS" | "MASTER" | "TIMER";

export interface AksesInput {
  ditutup: boolean;
  sumber: SumberAkses;
  nilai: "BUKA" | "TUTUP";
  /** Hanya terisi bila sumber === "TIMER": waktu jadwal tutup yang sudah lewat. */
  waktuTutup?: Date;
}

/** Masa tenggang bagi kiriman yang unggah berkasnya sudah dimulai sebelum tenggat (K3). */
export const TENGGANG_MENIT = 5;
/** Jadwal baru harus minimal sekian menit dari sekarang (supaya sempat diumumkan & dibatalkan). */
export const JEDA_MINIMAL_JADWAL_MENIT = 5;
export const BATAS_JADWAL_HARI = 366;
/** Pintasan perpanjang: paling lama 30 hari sekali klik. */
export const BATAS_PERPANJANG_MENIT = 30 * 24 * 60;
export const BATAS_CATATAN = 200;
/** Username yang dicatat di riwayat_setelan bila perubahan dilakukan job pg_cron. */
export const PENGGUNA_TIMER = "SISTEM (TIMER)";

const MS_MENIT = 60 * 1000;
const MS_HARI = 24 * 60 * MS_MENIT;
const GESER_WIB_MS = 7 * 60 * MS_MENIT;

export interface KeadaanPeriode {
  /** Nilai master INPUT_KECAMATAN_KEMENAG, sudah di-trim + huruf besar ("" = belum diset). */
  master: string;
  /** Sakelar khusus akun (INPUT_USER_<userId>), sudah di-trim + huruf besar; null = tidak ada. */
  khusus: string | null;
  /** Waktu jadwal TUTUP yang masih MENUNGGU (null = tidak ada). */
  tutupMenunggu: Date | null;
  /** Jam server database saat data diambil. */
  sekarang: Date;
}

/**
 * Padanan 1:1 cekAksesInputUser() lama, ditambah sumber "TIMER". Urutan prioritas:
 *   sakelar khusus akun  >  master TUTUP  >  jadwal TUTUP yang sudah jatuh tempo  >  BUKA
 * Penutupan oleh waktu dihitung SAAT DIBACA, jadi tetap tepat walau pg_cron terlambat.
 * Jadwal BUKA yang jatuh tempo sengaja TIDAK dihitung di sini (gagal ke arah tertutup): baru
 * berlaku setelah job cron mengubah master, paling lama satu menit.
 */
export function hitungAksesInput(k: KeadaanPeriode): AksesInput {
  if (k.khusus === "BUKA") return { ditutup: false, sumber: "KHUSUS", nilai: "BUKA" };
  if (k.khusus === "TUTUP") return { ditutup: true, sumber: "KHUSUS", nilai: "TUTUP" };
  if (k.master === "TUTUP") return { ditutup: true, sumber: "MASTER", nilai: "TUTUP" };
  if (k.tutupMenunggu && k.tutupMenunggu.getTime() <= k.sekarang.getTime()) {
    return { ditutup: true, sumber: "TIMER", nilai: "TUTUP", waktuTutup: k.tutupMenunggu };
  }
  return { ditutup: false, sumber: "MASTER", nilai: "BUKA" };
}

/**
 * True bila kiriman masih boleh diterima walau periode sudah ditutup oleh timer: unggah berkasnya
 * dimulai SEBELUM tenggat dan sekarang belum lewat tenggat + TENGGANG_MENIT.
 */
export function dalamTenggang(p: { sekarang: Date; waktuTutup: Date; unggahDimulai: Date | null }): boolean {
  if (!p.unggahDimulai) return false;
  if (p.unggahDimulai.getTime() >= p.waktuTutup.getTime()) return false;
  return p.sekarang.getTime() <= p.waktuTutup.getTime() + TENGGANG_MENIT * MS_MENIT;
}

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** "30 November 2026 pukul 23.59 WIB" — tidak bergantung zona waktu mesin maupun data lokal ICU. */
export function formatWaktuPanjangWIB(d: Date): string {
  const w = new Date(d.getTime() + GESER_WIB_MS);
  const jam = String(w.getUTCHours()).padStart(2, "0");
  const mnt = String(w.getUTCMinutes()).padStart(2, "0");
  return `${w.getUTCDate()} ${NAMA_BULAN[w.getUTCMonth()]} ${w.getUTCFullYear()} pukul ${jam}.${mnt} WIB`;
}

/**
 * Baca waktu masukan admin. Tanpa penunjuk zona ("2026-11-30T23:59" atau "2026-11-30 23:59")
 * SELALU dianggap WIB. Yang memakai "Z" atau offset (+07:00) dibaca apa adanya. Tanggal yang tidak
 * ada di kalender (mis. 31 Februari) ditolak, tidak digulirkan diam-diam ke bulan berikutnya.
 */
export function parseWaktuWIB(masukan: unknown): Date | null {
  if (typeof masukan !== "string") return null;
  const teks = masukan.trim();
  if (!teks) return null;

  const polaLokal = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
  const m = polaLokal.exec(teks);
  if (m) {
    const [y, mo, d, h, mi] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])];
    const s = m[6] ? Number(m[6]) : 0;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
    const utc = Date.UTC(y, mo - 1, d, h, mi, s) - GESER_WIB_MS;
    const cek = new Date(utc + GESER_WIB_MS);
    if (cek.getUTCFullYear() !== y || cek.getUTCMonth() !== mo - 1 || cek.getUTCDate() !== d) return null;
    return new Date(utc);
  }

  const polaZona = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!polaZona.test(teks)) return null;
  const hasil = new Date(teks);
  return isNaN(hasil.getTime()) ? null : hasil;
}

/** Pesan galat (atau null bila sah) untuk waktu jadwal baru. */
export function validasiWaktuJadwal(p: {
  waktu: Date;
  sekarang: Date;
  /** Waktu jadwal jenis LAIN yang masih menunggu. */
  lainnya?: Date | null;
  jedaMinimalMenit?: number;
}): string | null {
  const jeda = p.jedaMinimalMenit ?? JEDA_MINIMAL_JADWAL_MENIT;
  if (p.waktu.getTime() < p.sekarang.getTime() + jeda * MS_MENIT) {
    return `Waktu jadwal minimal ${jeda} menit dari sekarang.`;
  }
  if (p.waktu.getTime() > p.sekarang.getTime() + BATAS_JADWAL_HARI * MS_HARI) {
    return `Waktu jadwal maksimal ${BATAS_JADWAL_HARI} hari dari sekarang.`;
  }
  if (p.lainnya && Math.abs(p.waktu.getTime() - p.lainnya.getTime()) < MS_MENIT) {
    return "Jadwal BUKA dan TUTUP tidak boleh jatuh pada menit yang sama.";
  }
  return null;
}

/** Catatan bebas admin: tanpa karakter kontrol, spasi dirapikan, maksimal BATAS_CATATAN huruf. */
export function bersihkanCatatan(masukan: unknown): string {
  if (typeof masukan !== "string") return "";
  // deno-lint-ignore no-control-regex
  return masukan.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, BATAS_CATATAN);
}

export type KonteksTolak = "simpan" | "edit" | "unggah";

/**
 * Pesan penolakan saat periode ditutup. Teks untuk penutupan KHUSUS dan MASTER sama persis dengan
 * versi lama di penerima.ts; "timerDari" terisi bila penyebabnya jadwal otomatis.
 */
export function pesanPenutupan(p: { konteks: KonteksTolak; sumber: SumberAkses; timerDari: Date | null }): string {
  const edit = p.konteks === "edit";
  if (p.timerDari) {
    const dasar = `Periode input telah berakhir pada ${formatWaktuPanjangWIB(p.timerDari)}.`;
    return edit
      ? dasar + " Perubahan data hanya dapat dilakukan oleh Admin Utama Dinas Sosial Kota Medan berdasarkan surat resmi dari instansi."
      : dasar;
  }
  if (p.sumber === "KHUSUS") {
    return edit
      ? "Akses edit untuk akun Anda telah ditutup secara khusus oleh admin utama. Perubahan data hanya dapat dilakukan oleh Admin Utama Dinas Sosial Kota Medan berdasarkan surat resmi."
      : "Akses input untuk akun Anda telah ditutup secara khusus oleh admin utama. Hubungi Dinas Sosial Kota Medan.";
  }
  return edit
    ? "Periode input telah ditutup. Perubahan data hanya dapat dilakukan oleh Admin Utama Dinas Sosial Kota Medan berdasarkan surat resmi dari instansi."
    : "Periode input sudah ditutup oleh admin utama.";
}
