// TAHAP B penanda koordinat Guru Maghrib Mengaji: gerbang yang MENOLAK. Rencana: plans/plan-penanda-koordinat-gmm.md (keputusan user 2026-11-16/17, tanpa saklar).
//
//  1. Petugas lapangan menyimpan koordinat tidak valid (input baru / Edit Data)  -> ditolak dengan petunjuk cara mengirim titik yang benar.
//  2. Verifikator memberi Memenuhi Syarat pada data berkoordinat tidak valid     -> ditolak (Verifikasi Awal dan hasil Verifikasi Ulang yang berakhir Memenuhi Syarat).
//  3. Verifikator memberi Berkas Tidak Lengkap pada data berkoordinat tidak valid -> keterangan WAJIB menyebut "koordinat". Tidak Memenuhi Syarat tidak dipaksa.
//  4. Lapor perbaikan oleh petugas pada data yang koordinatnya masih tidak valid  -> ditolak.
// Admin Utama TIDAK diblokir (hanya mendapat penanda/peringatan di layar).
//
// GAGAL-TERBUKA: bila Google tidak menjawab (BELUM_DICEK), atau database/jaringan bermasalah, gerbang MELOLOSKAN (tidak pernah menghalangi pekerjaan karena gangguan teknis).
// Penyapu (domains/cekKoordinat.ts) tetap menandai tautan yang lolos itu kemudian.
import { sql } from "../_shared/db.ts";
import { TAHUN_AKTIF } from "../_shared/config.ts";
import { ALASAN, periksaTautan, type Penilaian } from "../_shared/cekKoordinat.ts";
import { ambilJaringanDengan } from "./cekKoordinat.ts";

export const LAYANAN_GERBANG = "GURU MAGHRIB MENGAJI";
const BATAS_GERBANG_MS = 4_000;   // pembukaan tautan pendek saat menyimpan/memeriksa: lebih singkat daripada penyapu agar layar tidak menunggu lama
const ambilCepat = ambilJaringanDengan(BATAS_GERBANG_MS);
const BATAS_TOTAL_MS = 6_000;     // seluruh pemeriksaan (semua lompatan pengalihan): lewat dari ini = BELUM_DICEK = lolos
const BELUM: Penilaian & { tujuan: string } = { hasil: "BELUM_DICEK", alasan: "", lat: null, lng: null, tujuan: "" };

/** Menilai satu tautan dengan batas waktu TOTAL; tidak pernah melempar dan tidak pernah menahan lebih lama dari BATAS_TOTAL_MS. */
async function nilai(url: string): Promise<Penilaian & { tujuan: string }> {
  let pewaktu: ReturnType<typeof setTimeout> | undefined;
  const habis = new Promise<Penilaian & { tujuan: string }>((r) => { pewaktu = setTimeout(() => r(BELUM), BATAS_TOTAL_MS); });
  try { return await Promise.race([periksaTautan(url, ambilCepat).catch(() => BELUM), habis]); } finally { if (pewaktu) clearTimeout(pewaktu); }
}

/** Tautan https pertama dalam masukan mentah petugas (cara membaca yang sama dengan normalizer koordinat); kosong bila tidak ada. */
export function ambilUrlMentah(masukan: unknown): string {
  const m = String(masukan == null ? "" : masukan).match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[.,;:)\]}]+$/, "") : "";
}

const huruf = (v: unknown) => String(v == null ? "" : v).trim();
const teksAlasan = (kode: string) => ALASAN[kode] || "Tautan tidak memuat titik lokasi yang jelas";

export const PETUNJUK_TITIK =
  "Cara mengirim titik yang benar: buka Google Maps, tekan lama pada titik lokasi sampai muncul penanda merah, lalu pilih Bagikan dan Salin tautan.";

/** Keterangan Berkas Tidak Lengkap yang cocok untuk satu kode alasan (kalimat baku). */
export function keteranganKoordinatTidakValid(kode: string): string {
  const t = teksAlasan(kode);
  return "Koordinat tidak valid: " + t.charAt(0).toLowerCase() + t.slice(1) + ". Mohon kirim ulang titik lokasi yang benar (tekan lama titik di Google Maps, pilih Bagikan, lalu Salin tautan).";
}

/** Apakah keterangan sudah menyebut masalah koordinat (syarat Berkas Tidak Lengkap pada data berkoordinat tidak valid). */
export const menyebutKoordinat = (keterangan: unknown) => /koordinat/i.test(huruf(keterangan));

/**
 * (1) Menilai koordinat yang akan disimpan petugas. `tautan` = hasil normalisasi; `mentah` = apa yang ditempel petugas (bila ada).
 * Tautan MENTAH dinilai lebih dulu: normalizer mengubah tautan panjang (>500 huruf) menjadi tautan koordinat ringkas sehingga Street View panjang tidak terlihat lagi.
 * Mengembalikan pesan penolakan, atau null bila boleh disimpan. Tautan pendek dibuka (batas 4 dtk per lompatan, 6 dtk total); tidak terjawab = lolos.
 */
export async function tolakKoordinatSalah(tautan: string, mentah?: unknown): Promise<string | null> {
  try {
    const url = ambilUrlMentah(mentah);
    const daftar = [...new Set([url, huruf(tautan)].filter((x) => x !== ""))];
    for (const k of daftar) {
      const p = await nilai(k);
      if (p.hasil === "VALID") return null;
      if (p.hasil === "TIDAK_VALID") {
        if (p.alasan === "BUKAN_GOOGLE" && k === url && daftar.length > 1) continue;   // tautan lain di teks; yang dinilai hasil normalisasi
        const sebab = teksAlasan(p.alasan);
        return "GAGAL: Koordinat tidak dapat diterima karena " + sebab.charAt(0).toLowerCase() + sebab.slice(1) + ". " + PETUNJUK_TITIK;
      }
    }
    return null;
  } catch (e) {
    console.error("tolakKoordinatSalah: dilewati (gagal-terbuka):", e);
    return null;
  }
}

export interface PenilaianTersimpan { hasil: "VALID" | "TIDAK_VALID" | "BELUM_DICEK"; alasan: string }

/**
 * Hasil penilaian koordinat SEKARANG untuk satu data GMM: memakai hasil penyapu bila tautannya masih sama; bila belum ada (atau belum dicek) dinilai saat itu juga
 * dan disimpan. Bukan data GMM / data tak ditemukan -> null.
 */
export async function nilaiKoordinatData(penerimaId: number): Promise<{ layanan: string; hasil: PenilaianTersimpan["hasil"]; alasan: string } | null> {
  const rows = await sql`
    select p.layanan, coalesce(p.link_koordinat_lokasi, '') as tautan, c.hasil, c.alasan
    from penerima p left join cek_koordinat c on c.penerima_id = p.id and c.tahun = p.tahun and c.tautan = coalesce(p.link_koordinat_lokasi, '')
    where p.id = ${penerimaId} and p.tahun = ${TAHUN_AKTIF} limit 1`;
  if (rows.length === 0) return null;
  const r = rows[0] as Record<string, unknown>;
  const layanan = huruf(r.layanan).toUpperCase();
  if (layanan !== LAYANAN_GERBANG) return null;
  const h = huruf(r.hasil);
  if (h === "VALID" || h === "TIDAK_VALID") return { layanan, hasil: h, alasan: huruf(r.alasan) };
  const p = await nilai(huruf(r.tautan));
  if (p.hasil === "BELUM_DICEK") return { layanan, hasil: "BELUM_DICEK", alasan: "" };
  await sql`
    insert into cek_koordinat (penerima_id, tahun, tautan, hasil, alasan, tujuan, lat, lng, dicek_pada)
    values (${penerimaId}, ${TAHUN_AKTIF}::int, ${huruf(r.tautan)}, ${p.hasil}, ${p.alasan}, ${huruf(p.tujuan).slice(0, 600)}, ${p.lat}, ${p.lng}, now())
    on conflict (penerima_id, tahun) do update set tautan = excluded.tautan, hasil = excluded.hasil, alasan = excluded.alasan, tujuan = excluded.tujuan, lat = excluded.lat, lng = excluded.lng, dicek_pada = excluded.dicek_pada`;
  return { layanan, hasil: p.hasil, alasan: p.alasan };
}

/**
 * (2)(3) Gerbang hasil verifikasi. `statusBaru` = status yang akan disimpan; `keterangan` = keterangan hasil. Mengembalikan pesan penolakan atau null.
 * Hanya untuk data GMM dan status Memenuhi Syarat / Berkas Tidak Lengkap; status lain tidak diperiksa (tidak ada kueri tambahan).
 */
export async function tolakHasilKarenaKoordinat(penerimaId: number, statusBaru: string, keterangan: unknown, opsi: { wajibKeteranganBTL: boolean } = { wajibKeteranganBTL: true }): Promise<string | null> {
  if (statusBaru !== "Memenuhi Syarat" && statusBaru !== "Berkas Tidak Lengkap") return null;
  try {
    const k = await nilaiKoordinatData(penerimaId);
    if (!k || k.hasil !== "TIDAK_VALID") return null;
    const sebab = teksAlasan(k.alasan);
    if (statusBaru === "Memenuhi Syarat") {
      return "Koordinat lokasi data ini tidak valid (" + sebab.charAt(0).toLowerCase() + sebab.slice(1) + "), jadi tidak dapat diberi Memenuhi Syarat. " +
        "Pilih Berkas Tidak Lengkap dan tulis alasan koordinat di keterangan, misalnya: \"" + keteranganKoordinatTidakValid(k.alasan) + "\"";
    }
    if (opsi.wajibKeteranganBTL && !menyebutKoordinat(keterangan)) {
      return "Koordinat lokasi data ini tidak valid (" + sebab.charAt(0).toLowerCase() + sebab.slice(1) + "). Keterangan Berkas Tidak Lengkap wajib menyebutkan masalah koordinat, misalnya: \"" +
        keteranganKoordinatTidakValid(k.alasan) + "\"";
    }
    return null;
  } catch (e) {
    console.error("tolakHasilKarenaKoordinat: dilewati (gagal-terbuka):", e);
    return null;
  }
}

/** (4) Lapor perbaikan oleh petugas: ditolak bila koordinat data GMM masih tidak valid. */
export async function tolakLaporKarenaKoordinat(penerimaId: number): Promise<string | null> {
  try {
    const k = await nilaiKoordinatData(penerimaId);
    if (!k || k.hasil !== "TIDAK_VALID") return null;
    const sebab = teksAlasan(k.alasan);
    return "Koordinat lokasi masih belum valid (" + sebab.charAt(0).toLowerCase() + sebab.slice(1) + "), jadi perbaikan belum dapat dilaporkan. Perbaiki koordinat lebih dulu. " + PETUNJUK_TITIK;
  } catch (e) {
    console.error("tolakLaporKarenaKoordinat: dilewati (gagal-terbuka):", e);
    return null;
  }
}
