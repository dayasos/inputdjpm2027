// Koreksi sekali pakai: data Guru Maghrib Mengaji yang SUDAH diberi Memenuhi Syarat oleh akun verifikator (sudah terhitung sebagai pekerjaan/lembur
// mereka) tetapi koordinatnya TIDAK VALID menurut pemeriksa koordinat -> diturunkan ke Berkas Tidak Lengkap OLEH SISTEM (bukan Admin, bukan verifikator).
// Rencana: percakapan 2026-11-17. Khusus Admin Utama. Dua langkah: pratinjau (tanpa perubahan) lalu jalankan dengan DAFTAR ID yang sudah dilihat.
//
// Tidak memengaruhi hitungan verifikator:
//  - baris riwayat baru memakai oleh = "SISTEM", sumber = "OTOMATIS" (hitungan hasil kerja hanya membaca akun verifikator + sumber SATU; baris pertama mereka tetap ada);
//  - kolam Verifikasi Ulang mengecualikan data yang punya riwayat hasil verifikator (V12), jadi data ini tidak menjadi tugas baru siapa pun.
// Yang diubah persis seperti verifikasiSatuData(Berkas Tidak Lengkap): status, keterangan, tanggal, pemverifikasi, batas perbaikan seragam, tanda laporan lama dikosongkan,
// riwayat (satu transaksi per data) dan Data Detail diarsipkan (status turun dari Memenuhi Syarat).
import { sql } from "../_shared/db.ts";
import { wajibSesi } from "../_shared/sesi.ts";
import { BATAS_PERBAIKAN_SERAGAM, TAHUN_AKTIF } from "../_shared/config.ts";
import { ALASAN } from "../_shared/cekKoordinat.ts";
import { catatRiwayatVerifikasiWajib } from "../_shared/riwayatVerifikasi.ts";
import { nilaiStatusVerifikasi } from "../_shared/statusVerifikasi.ts";
import { arsipkanDataDetail, pastikanDataDetailTersinkron } from "./dataDetail.ts";
import { literalArrayTeks } from "./templatAlasan.ts";

type Baris = Record<string, unknown>;
const LAYANAN = "GURU MAGHRIB MENGAJI";
const OLEH = "SISTEM";
const MAKS = 300;   // pagar: aksi sekali pakai tidak untuk ratusan data
const huruf = (v: unknown) => String(v == null ? "" : v).trim();
const galat = (e: unknown) => ({ sukses: false, pesan: e instanceof Error ? e.message : String(e) });

/** Keterangan Berkas Tidak Lengkap untuk satu kode alasan (kalimat yang sama dengan Excel yang disetujui user). */
export function keteranganKoordinat(kode: string): string {
  const teks = ALASAN[kode] || kode;
  return "Koordinat tidak valid: " + teks.charAt(0).toLowerCase() + teks.slice(1) +
    ". Mohon kirim ulang titik lokasi yang benar (tekan lama titik di Google Maps, pilih Bagikan, lalu Salin tautan).";
}

async function sesiUtama(token: string) {
  const sesi = await wajibSesi(token);
  if (huruf(sesi.role).toUpperCase() !== "UTAMA") throw new Error("Fitur ini khusus Admin Utama.");
  return sesi;
}

/** Kandidat: GMM, Memenuhi Syarat oleh akun verifikator (ada riwayat hasilnya), koordinat sekarang TIDAK_VALID, tidak ada tugas Verifikasi Ulang aktif/selesai. */
async function cariKandidat(): Promise<{ id: number; nama: string; kecamatan: string; kelurahan: string; kode: string }[]> {
  const rows = await sql`
    select p.id, p.nama, p.kecamatan, p.kelurahan, c.alasan
    from penerima p
    join cek_koordinat c on c.penerima_id = p.id and c.tahun = p.tahun and c.tautan = coalesce(p.link_koordinat_lokasi, '')
    where p.tahun = ${TAHUN_AKTIF} and p.layanan = ${LAYANAN}
      and p.status_verifikasi = 'Memenuhi Syarat'
      and c.hasil = 'TIDAK_VALID'
      and starts_with(upper(coalesce(p.diverifikasi_oleh, '')), 'VERIF_')
      and exists (select 1 from riwayat_verifikasi r where r.penerima_id = p.id and r.tahun = p.tahun and r.sumber = 'SATU' and starts_with(upper(r.oleh), 'VERIF_'))
      and not exists (select 1 from tugas_verifikasi_ulang t where t.penerima_id = p.id and t.tahun = p.tahun and ((t.selesai_pada is null and t.ditarik_pada is null) or t.selesai_pada is not null))
    order by p.kecamatan, p.kelurahan, p.nama`;
  return (rows as Baris[]).map((r) => ({ id: Number(r.id), nama: huruf(r.nama), kecamatan: huruf(r.kecamatan), kelurahan: huruf(r.kelurahan), kode: huruf(r.alasan) }));
}

/**
 * Langkah 1 (jalankan tidak true): pratinjau, TIDAK mengubah apa pun.
 * Langkah 2 (jalankan === true + ids hasil pratinjau): hanya id yang MASIH memenuhi syarat saat itu yang diubah; sisanya dilaporkan dilewati.
 */
export async function koreksiKoordinatBermasalah(token: string, jalankan?: unknown, ids?: unknown) {
  try {
    await sesiUtama(token);
    const kandidat = await cariKandidat();
    if (jalankan !== true) {
      return {
        sukses: true, dryRun: true, jumlah: kandidat.length, melebihiBatas: kandidat.length > MAKS,
        data: kandidat.map((k) => ({ id: k.id, nama: k.nama, kecamatan: k.kecamatan, kelurahan: k.kelurahan, alasan: ALASAN[k.kode] || k.kode, keterangan: keteranganKoordinat(k.kode) })),
      };
    }
    const diminta = new Set((Array.isArray(ids) ? ids : []).map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0));
    if (diminta.size === 0) return { sukses: false, pesan: "Daftar data kosong. Lakukan pratinjau lebih dulu." };
    if (diminta.size > MAKS) return { sukses: false, pesan: "Terlalu banyak data (" + diminta.size + "). Batas " + MAKS + " per pelaksanaan." };

    const peta = new Map(kandidat.map((k) => [k.id, k]));
    const dilewati: { id: number; alasan: string }[] = [];
    const terpilih: { id: number; ket: string }[] = [];
    for (const id of diminta) {
      const k = peta.get(id);
      if (!k) { dilewati.push({ id, alasan: "Tidak lagi memenuhi syarat koreksi (status/koordinat/tugas sudah berubah)." }); continue; }
      terpilih.push({ id, ket: keteranganKoordinat(k.kode) });
    }
    // SATU transaksi untuk seluruh daftar (semua-atau-tidak-sama-sekali, dan cepat: hanya beberapa kali bolak-balik ke database). Syarat kandidat diperiksa ULANG di UPDATE.
    let berhasil: number[] = [];
    if (terpilih.length > 0) {
      const nilai = nilaiStatusVerifikasi("Berkas Tidak Lengkap", "-", BATAS_PERBAIKAN_SERAGAM);
      const ketPerId = new Map(terpilih.map((t) => [t.id, t.ket]));
      try {
        // deno-lint-ignore no-explicit-any
        berhasil = await sql.begin(async (trx: any) => {
          const hasil = await trx`
            update penerima p set
              status_verifikasi = 'Berkas Tidak Lengkap',
              keterangan_verifikasi = d.ket,
              tanggal_verifikasi = ${new Date()},
              diverifikasi_oleh = ${OLEH},
              batas_waktu_perbaikan = ${nilai.batasWaktu || null},
              tanggal_lapor_perbaikan = null, dilapor_oleh = null, tanggal_berkas_diubah = null,
              diperbarui_at = now()
            from unnest(${literalArrayTeks(terpilih.map((t) => String(t.id)))}::text[], ${literalArrayTeks(terpilih.map((t) => t.ket))}::text[]) as d(id, ket)
            where p.id = d.id::bigint and p.tahun = ${TAHUN_AKTIF} and p.layanan = ${LAYANAN} and p.status_verifikasi = 'Memenuhi Syarat'
              and starts_with(upper(coalesce(p.diverifikasi_oleh, '')), 'VERIF_')
              and not exists (select 1 from tugas_verifikasi_ulang t where t.penerima_id = p.id and t.tahun = p.tahun and ((t.selesai_pada is null and t.ditarik_pada is null) or t.selesai_pada is not null))
            returning p.id`;
          const okIds: number[] = (hasil as Baris[]).map((r) => Number(r.id));
          if (okIds.length > 0) {
            await trx`
              insert into riwayat_verifikasi (penerima_id, tahun, status_lama, status_baru, keterangan, oleh, sumber)
              select d.id::bigint, ${TAHUN_AKTIF}::int, 'Memenuhi Syarat', 'Berkas Tidak Lengkap', d.ket, ${OLEH}, 'OTOMATIS'
              from unnest(${literalArrayTeks(okIds.map(String))}::text[], ${literalArrayTeks(okIds.map((i) => ketPerId.get(i) || ""))}::text[]) as d(id, ket)`;
          }
          return okIds;
        });
      } catch (e) {
        return { sukses: false, pesan: "Gagal: tidak ada data yang diubah (" + (e instanceof Error ? e.message : String(e)) + ")." };
      }
      const okSet = new Set(berhasil);
      for (const t of terpilih) if (!okSet.has(t.id)) dilewati.push({ id: t.id, alasan: "Status berubah saat dikerjakan; dilewati." });
    }
    let arsip = "";
    if (berhasil.length > 0) {
      try {
        const a = await arsipkanDataDetail(berhasil, "Berkas Tidak Lengkap", TAHUN_AKTIF, OLEH);
        if (!a.sukses) arsip = a.pesan || "arsip Data Detail gagal";
      } catch (e) { arsip = e instanceof Error ? e.message : String(e); }
      if (arsip) pastikanDataDetailTersinkron(TAHUN_AKTIF).catch((e) => console.error("koreksiKoordinatBermasalah: sinkron Data Detail gagal:", e));
    }
    return {
      sukses: true, dryRun: false, diubah: berhasil.length, dilewati,
      pesan: berhasil.length + " data diubah ke Berkas Tidak Lengkap oleh SISTEM." + (dilewati.length ? " " + dilewati.length + " dilewati." : "") + (arsip ? " Catatan: arsip Data Detail perlu disinkronkan (" + arsip + ")." : ""),
    };
  } catch (e) {
    return galat(e);
  }
}
