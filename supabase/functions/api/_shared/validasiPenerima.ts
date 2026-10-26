// Aturan validasi data penerima yang dipakai SEMUA jalur tulis (input baru, edit data, Kelola Data) dan SEMUA peran,
// termasuk Admin Utama. Plan: plans/plan-perbaikan-validasi-data-penerima.md (bagian 4 dan 5.1).
//
// MODUL MURNI: tanpa Deno.*, tanpa akses database langsung -- pemeriksaan yang butuh tabel `wilayah` menerima fungsi
// `adaDiWilayah` dari pemanggil. Dengan begitu seluruh aturan bisa diuji di Node (scripts/uji/validasi-penerima.test.mjs).
//
// Latar belakang (2026-10): tanggal lahir tahun 0199 (umur 1.827) dan kelurahan tugas kosong lolos karena pemeriksaan
// hanya "umur < 18", pengecualian untuk UTAMA, dan pemeriksaan kelurahan yang dilewati bila nilainya kosong.

export const UMUR_MIN = 18;
export const UMUR_MAKS = 100;
export const TAHUN_LAHIR_MIN = 1900;

/** Kalender sungguhan: menolak 31 Februari, 2026-13-01, dan sejenisnya. */
export function tanggalKalenderValid(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  // setUTCFullYear (bukan Date.UTC): Date.UTC memetakan tahun 0-99 ke 1900-1999 sehingga tahun 0089 salah dinilai tidak valid.
  const dt = new Date(0);
  dt.setUTCFullYear(y, mo - 1, d);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export type HasilTanggalLahir = { ok: true; iso: string; umur: number } | { ok: false; pesan: string };

const PESAN_WAJIB = "GAGAL: Tanggal lahir wajib diisi.";
const PESAN_TIDAK_VALID = "GAGAL: Tanggal lahir tidak valid.";

function pesanTidakWajar(umurMin: number, umurMaks: number): string {
  return "GAGAL: Tanggal lahir tidak wajar. Pastikan tahun lahir 4 digit (mis. 1990) dan usia antara " +
    umurMin + " sampai " + umurMaks + " tahun.";
}

/** Tanggal hari ini menurut WIB, 'YYYY-MM-DD'. */
export function tanggalHariIniWIB(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Umur pada patokan 1 Januari `tahunAktif` -- sama dengan hitungUmur() di domains/penerima.ts (port Kode.gs):
 * lahir tepat 1 Januari dihitung sudah genap; lahir setelah 1 Januari belum.
 */
export function hitungUmurPatokan(iso: string, tahunAktif: number): number {
  const [y, m, d] = iso.split("-").map(Number);
  return tahunAktif - y - (m > 1 || d > 1 ? 1 : 0);
}

/**
 * Memeriksa tanggal lahir mentah dari formulir ('dd-MM-yyyy', 'dd/MM/yyyy', atau 'yyyy-MM-dd').
 * Hasil ok membawa bentuk ISO dan umur pada patokan 1 Januari tahun aktif.
 * Menolak: kosong, bukan tanggal kalender, tahun bukan 4 digit, sebelum 1900, di masa depan, umur di luar [umurMin, umurMaks].
 */
export function periksaTanggalLahir(
  mentah: unknown,
  konteks: { tahunAktif: number; hariIni: string; umurMin?: number; umurMaks?: number },
): HasilTanggalLahir {
  const umurMin = konteks.umurMin ?? UMUR_MIN;
  const umurMaks = konteks.umurMaks ?? UMUR_MAKS;
  const t = mentah == null ? "" : String(mentah).trim();
  if (t === "") return { ok: false, pesan: PESAN_WAJIB };

  let y: number, m: number, d: number;
  let cocok = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (cocok) {
    y = Number(cocok[1]); m = Number(cocok[2]); d = Number(cocok[3]);
  } else if ((cocok = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(t))) {
    d = Number(cocok[1]); m = Number(cocok[2]); y = Number(cocok[3]);
  } else if (/^\d+[-/]\d{1,2}[-/]\d{1,2}$/.test(t) || /^\d{1,2}[-/]\d{1,2}[-/]\d+$/.test(t)) {
    // Bentuknya tanggal, tetapi tahunnya bukan 4 digit (mis. 04-02-199 yang kehilangan satu angka).
    return { ok: false, pesan: pesanTidakWajar(umurMin, umurMaks) };
  } else {
    return { ok: false, pesan: PESAN_TIDAK_VALID };
  }

  const iso = String(y).padStart(4, "0") + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  if (!tanggalKalenderValid(iso)) return { ok: false, pesan: PESAN_TIDAK_VALID };
  if (y < TAHUN_LAHIR_MIN || iso > konteks.hariIni) return { ok: false, pesan: pesanTidakWajar(umurMin, umurMaks) };

  const umur = hitungUmurPatokan(iso, konteks.tahunAktif);
  if (umur < umurMin) return { ok: false, pesan: "GAGAL: Usia di bawah " + umurMin + " tahun tidak memenuhi syarat." };
  if (umur > umurMaks) return { ok: false, pesan: pesanTidakWajar(umurMin, umurMaks) };
  return { ok: true, iso, umur };
}

export type HasilKelurahan =
  | { ok: true; kelurahan: string }
  | { ok: false; pesan: string; soalKelurahan: true };

/**
 * Menentukan kelurahan wilayah tugas yang sah untuk peran TANPA kunci kelurahan (dipakai Admin Utama pada input baru).
 * Aturan sama dengan jalur non-UTAMA di tentukanWilayahTugas():
 *  - Rumah ibadah punya kelurahan di kecamatan itu -> kelurahan harus salah satu darinya (satu-satunya dipakai otomatis).
 *  - Selain itu -> kelurahan WAJIB terisi dan harus ada di kecamatan itu menurut tabel `wilayah`.
 * Semua teks sudah dirapikan (huruf besar, spasi tunggal) oleh pemanggil.
 */
export async function putuskanKelurahanTugas(p: {
  kecamatan: string;
  kelurahanKirim: string;
  /** Kelurahan TIDAK KOSONG dari rumah ibadah yang cocok, pada kecamatan yang sama. */
  daftarKelurahanRumahIbadah: string[];
  tempatTugas: string;
  adaDiWilayah: (kecamatan: string, kelurahan: string) => Promise<boolean>;
}): Promise<HasilKelurahan> {
  const daftar = Array.from(new Set(p.daftarKelurahanRumahIbadah.filter((k) => k)));
  if (daftar.length === 0) {
    if (!p.kelurahanKirim) return { ok: false, pesan: "GAGAL: Kelurahan wilayah tugas wajib dipilih.", soalKelurahan: true };
    if (!(await p.adaDiWilayah(p.kecamatan, p.kelurahanKirim))) {
      return {
        ok: false,
        pesan: "GAGAL: Kelurahan " + p.kelurahanKirim + " tidak berada di Kecamatan " + p.kecamatan + ".",
        soalKelurahan: true,
      };
    }
    return { ok: true, kelurahan: p.kelurahanKirim };
  }
  if (daftar.includes(p.kelurahanKirim)) return { ok: true, kelurahan: p.kelurahanKirim };
  if (daftar.length === 1) return { ok: true, kelurahan: daftar[0] };
  return {
    ok: false,
    pesan: "GAGAL: " + p.tempatTugas + " tercatat di beberapa kelurahan (" + daftar.slice().sort().join(", ") +
      "). Silakan pilih ulang rumah ibadah dari daftar.",
    soalKelurahan: true,
  };
}
