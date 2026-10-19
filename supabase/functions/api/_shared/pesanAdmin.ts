// Logika MURNI Pesan Admin Utama (tanpa akses database/Deno, bisa diuji langsung di Node).
// Pesan dilihat SELURUH pengguna, jadi isinya dibersihkan di server dan disimpan sebagai TEKS BIASA;
// browser wajib menampilkannya lewat textContent (tidak pernah innerHTML).
// Rancangan: plans/plan-timer-tutup-periode-input.md (K8-K14)

export const TIPE_PESAN = ["TUTUP", "BUKA", "INFO"] as const;
export type TipePesan = (typeof TIPE_PESAN)[number];

export const BATAS_JUDUL = { min: 3, max: 100 } as const;
export const BATAS_ISI = { min: 10, max: 1500 } as const;

// Dihitung per code point (bukan UTF-16) supaya sama dengan char_length() Postgres pada CHECK tabel.
const panjang = (s: string): number => Array.from(s).length;

// Karakter kontrol (kecuali tab/LF/CR, ditangani terpisah) dan karakter pengatur arah teks
// (bidi override) yang bisa dipakai memalsukan tampilan teks.
// deno-lint-ignore no-control-regex
const KONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/** Judul satu baris: baris baru/tab jadi spasi, spasi berlebih dirapikan. */
export function bersihkanJudul(masukan: unknown): string {
  if (typeof masukan !== "string") return "";
  return masukan.replace(KONTROL, "").replace(/\s+/g, " ").trim();
}

/** Isi boleh berbaris-baris: akhir baris diseragamkan, spasi ujung dibuang, 3+ baris kosong jadi 1. */
export function bersihkanIsi(masukan: unknown): string {
  if (typeof masukan !== "string") return "";
  return masukan
    .replace(/\r\n?/g, "\n")
    .replace(KONTROL, "")
    .replace(/[^\S\n]+/g, " ")
    .split("\n")
    .map((baris) => baris.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface PesanBersih {
  tipe: TipePesan;
  judul: string;
  isi: string;
}

/** Pesan galat (string) bila tidak sah, selain itu nilai yang sudah bersih. */
export function validasiPesan(p: { tipe: unknown; judul: unknown; isi: unknown }): string | PesanBersih {
  const tipe = typeof p.tipe === "string" ? p.tipe.trim().toUpperCase() : "";
  if (!(TIPE_PESAN as readonly string[]).includes(tipe)) return "Jenis pesan harus TUTUP, BUKA, atau INFO.";

  const judul = bersihkanJudul(p.judul);
  const nJudul = panjang(judul);
  if (nJudul < BATAS_JUDUL.min) return `Judul pesan minimal ${BATAS_JUDUL.min} karakter.`;
  if (nJudul > BATAS_JUDUL.max) return `Judul pesan maksimal ${BATAS_JUDUL.max} karakter (sekarang ${nJudul}).`;

  const isi = bersihkanIsi(p.isi);
  const nIsi = panjang(isi);
  if (nIsi < BATAS_ISI.min) return `Isi pesan minimal ${BATAS_ISI.min} karakter.`;
  if (nIsi > BATAS_ISI.max) return `Isi pesan maksimal ${BATAS_ISI.max} karakter (sekarang ${nIsi}).`;

  return { tipe: tipe as TipePesan, judul, isi };
}

/** Id dari masukan frontend: bilangan bulat positif, atau null bila kosong. undefined = tidak sah. */
export function bacaIdOpsional(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
