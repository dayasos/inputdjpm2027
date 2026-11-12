import { sql } from "./db.ts";

// Riwayat verifikasi per data (tabel riwayat_verifikasi; migrasi 20261112100000). Plan: plans/plan-tim-verifikator.md.
//
// NON-BLOCKING: kegagalan menulis riwayat (mis. tabel belum ada) hanya dicatat di log fungsi dan TIDAK menggagalkan verifikasi.
// Jejak utama tetap ada di penerima.diverifikasi_oleh; riwayat adalah tambahan agar pemverifikasi sebelumnya tidak hilang.

export type SumberRiwayat = "SATU" | "DIPERBAIKI" | "MASSAL" | "OTOMATIS";

export interface RiwayatVerifikasi {
  penerimaId: number;
  tahun: number;
  statusLama: string;
  statusBaru: string;
  keterangan: string;
  oleh: string;
  sumber: SumberRiwayat;
}

export async function catatRiwayatVerifikasi(r: RiwayatVerifikasi): Promise<void> {
  try {
    await sql`
      insert into riwayat_verifikasi (penerima_id, tahun, status_lama, status_baru, keterangan, oleh, sumber)
      values (${r.penerimaId}, ${r.tahun}, ${r.statusLama}, ${r.statusBaru}, ${r.keterangan}, ${r.oleh}, ${r.sumber})
    `;
  } catch (e) {
    console.error("catatRiwayatVerifikasi gagal (non-blocking):", e);
  }
}

/** Banyak data sekaligus (verifikasi massal / penurunan otomatis): satu pernyataan, status lama/baru sama untuk semuanya. */
export async function catatRiwayatVerifikasiBanyak(ids: number[], tahun: number, statusLama: string, statusBaru: string, keterangan: string, oleh: string, sumber: SumberRiwayat): Promise<void> {
  if (ids.length === 0) return;
  try {
    await sql`
      insert into riwayat_verifikasi (penerima_id, tahun, status_lama, status_baru, keterangan, oleh, sumber)
      select x, ${tahun}, ${statusLama}, ${statusBaru}, ${keterangan}, ${oleh}, ${sumber}
      from unnest(${ids}::bigint[]) as x
    `;
  } catch (e) {
    console.error("catatRiwayatVerifikasiBanyak gagal (non-blocking):", e);
  }
}
