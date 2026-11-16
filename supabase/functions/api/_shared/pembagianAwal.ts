// Pembagian Verifikasi Awal (modul MURNI, tanpa database). Rencana: plans/plan-verifikasi-awal-bagi-rata.md bagian 4 dan 6.
//
// Aturan (ditegakkan server; layar tidak bisa menimpa):
//   - SAMA JUMLAH: tiap data (urut waktu masuk) diberikan kepada akun yang jumlahnya PALING SEDIKIT. Selisih terbesar-terkecil
//     tidak bertambah dan, dari keadaan seimbang, tidak pernah melebihi 1.
//   - Pemecah seri: bagian layanan itu yang paling sedikit pada akun tsb (agar layanan "berat" tersebar), lalu acak berbenih.
//   - Pengecualian (pimpinan, akun khusus) tidak pernah menerima: disaring oleh pemanggil lewat `saringPemeriksa`.
// Deterministik: benih + kolam + keadaan akun yang sama selalu menghasilkan pembagian yang sama.
import { buatAcak } from "./pembagianUlang.ts";

export interface AkunAwal {
  username: string;                       // huruf asli akun
  jumlah: number;                         // jumlah efektif sekarang (titik awal + tugas yang pernah diterima)
  perLayanan?: Record<string, number>;    // jumlah tugas yang pernah diterima per layanan (huruf besar)
}

export interface ButirAwal { id: number; tahun: number; layanan: string }

export interface HasilAwal {
  tugas: { id: number; tahun: number; layanan: string; akun: string }[];
  /** jumlah efektif setiap akun SESUDAH pembagian */
  jumlahAkhir: Record<string, number>;
  /** selisih terbesar - terkecil jumlah akhir */
  selisih: number;
}

const besar = (v: unknown) => String(v == null ? "" : v).trim().toUpperCase();

export function bagiTugasAwal(m: { benih: string; kolam: ButirAwal[]; akun: AkunAwal[] }): HasilAwal {
  const acak = buatAcak(m.benih);
  // urutan akun dibuat tetap (abjad) supaya hasil tidak bergantung pada urutan masukan
  const akun = m.akun
    .map((a) => ({ username: a.username, jumlah: Math.max(0, Math.floor(Number(a.jumlah) || 0)), lay: { ...(a.perLayanan || {}) } as Record<string, number> }))
    .sort((a, b) => besar(a.username).localeCompare(besar(b.username)));
  const hasil: HasilAwal = { tugas: [], jumlahAkhir: {}, selisih: 0 };
  if (akun.length === 0) return hasil;
  const kolam = m.kolam.slice().sort((a, b) => (a.tahun - b.tahun) || (a.id - b.id));
  for (const b of kolam) {
    const l = besar(b.layanan);
    let terbaik: typeof akun = [];
    let kj = Infinity, kl = Infinity;
    for (const a of akun) {
      const lj = a.lay[l] || 0;
      if (a.jumlah < kj || (a.jumlah === kj && lj < kl)) { terbaik = [a]; kj = a.jumlah; kl = lj; }
      else if (a.jumlah === kj && lj === kl) terbaik.push(a);
    }
    const pilih = terbaik.length === 1 ? terbaik[0] : terbaik[Math.floor(acak() * terbaik.length)];
    pilih.jumlah++;
    pilih.lay[l] = (pilih.lay[l] || 0) + 1;
    hasil.tugas.push({ id: b.id, tahun: b.tahun, layanan: b.layanan, akun: pilih.username });
  }
  let min = Infinity, maks = -Infinity;
  for (const a of akun) { hasil.jumlahAkhir[a.username] = a.jumlah; if (a.jumlah < min) min = a.jumlah; if (a.jumlah > maks) maks = a.jumlah; }
  hasil.selisih = maks - min;
  return hasil;
}

/**
 * Titik awal akun yang BELUM punya baris (akun baru / kembali aktif sesudah fitur menyala): mulai dari jumlah terkecil akun lain,
 * supaya tidak membanjiri satu akun hingga "menyusul". Bila belum ada akun lain, 0.
 */
export function titikAwalAkunBaru(jumlahAkunLain: number[]): number {
  return jumlahAkunLain.length === 0 ? 0 : Math.min(...jumlahAkunLain);
}

/** Akun yang boleh menerima: aktif, dan bukan pengecualian/akun khusus (perbandingan tanpa peduli huruf besar-kecil). */
export function saringPemeriksa(aktif: string[], dikecualikan: string[]): string[] {
  const k = new Set(dikecualikan.map(besar));
  return aktif.filter((u) => !k.has(besar(u)));
}
