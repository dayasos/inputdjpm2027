// Verifikasi ulang data yang sudah terverifikasi. Rencana: plans/plan-verifikasi-ulang.md (v1.5).
//
// Aturan penting (ditegakkan DI SINI, bukan di layar):
//  - Admin Utama membuat/membatalkan paket tugas dan membatalkan koreksi; verifikator hanya mengerjakan tugas MILIKNYA.
//  - Pembagian acak berbenih (_shared/pembagianUlang.ts): V1 (bukan pemverifikasi pertama), V10 (BTL/TMS khusus satu akun), V11 (pimpinan dikecualikan).
//  - Pemeriksaan nyata: detail wajib dibuka, setiap berkas yang diunggah wajib diklik (dicatat server) lalu dicentang.
//  - 1 data = 1 hitungan: satu tugas per data per paket; hasil hanya ditulis sekali (pemicu basis data menolak ubah/hapus tugas selesai).
//  - Menyimpan hasil = SATU transaksi (tugas + status data + riwayat). Waktu selesai = waktu server.
//  - Koreksi tidak boleh menaikkan ke Memenuhi Syarat dan ditolak bila data sudah masuk batch pembayaran (K15).
import { adalahVerifikator } from "../_shared/gerbangPeran.ts";
import { sql } from "../_shared/db.ts";
import { wajibSesi } from "../_shared/sesi.ts";
import { BATAS_PERBAIKAN_SERAGAM, TAHUN_AKTIF } from "../_shared/config.ts";
import { catatRiwayatVerifikasiWajib } from "../_shared/riwayatVerifikasi.ts";
import { nilaiStatusVerifikasi } from "../_shared/statusVerifikasi.ts";
import { ambilSampel, bagiTugasUlang, layakMasukKolam, samaDenganTersimpan, type ButirKolam } from "../_shared/pembagianUlang.ts";
import {
  AKUN_KHUSUS_ULANG, PENGECUALIAN_ULANG, STATUS_FINAL, STATUS_MS, berkasDibukaSah, cekSimpanHasil, daftarBerkasDariBaris,
} from "../_shared/verifikasiUlangInti.ts";
import { arsipkanDataDetail, pastikanDataDetailTersinkron } from "./dataDetail.ts";
import { daftarDariPg, literalArrayTeks } from "./templatAlasan.ts";

type Baris = Record<string, unknown>;
const MAKS_TUGAS_PER_PAKET = 5000;
const UKURAN_HALAMAN = 50;

const huruf = (v: unknown) => String(v == null ? "" : v).trim();
const besar = (v: unknown) => huruf(v).toUpperCase();
const literalAngka = (a: number[]) => "{" + a.join(",") + "}";

class KonflikUlang extends Error {}
// Kolom jsonb berisi larik teks: postgres.js mengembalikannya sebagai array JS; cadangan: urai teks.
const keDaftar = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).map(String) : daftarDariPg(v));

async function sesiUtama(token: string) {
  const sesi = await wajibSesi(token);
  if (besar(sesi.role) !== "UTAMA") throw new Error("Fitur ini khusus Admin Utama.");
  return sesi;
}
async function sesiVerifikator(token: string) {
  const sesi = await wajibSesi(token);
  if (!adalahVerifikator(sesi.role)) throw new Error("Fitur ini khusus akun Verifikator.");
  return sesi;
}
const galat = (e: unknown) => ({ sukses: false, pesan: e instanceof Error ? e.message : String(e) });

// ---------------------------------------------------------------------------
// Kolam + pembagian (dipakai pratinjau DAN pembuatan paket: hasil identik untuk benih yang sama)
// ---------------------------------------------------------------------------
export interface KriteriaUlang {
  status?: unknown;
  layanan?: unknown;
  sertakanSudahDiperiksa?: unknown;
  jumlah?: unknown;
  benih?: unknown;
  pemeriksa?: unknown;
  batasSelesai?: unknown;
  nama?: unknown;
}

interface Rencana {
  benih: string;
  status: string[];
  layanan: string[];
  sertakanSudahDiperiksa: boolean;
  jumlah: number;
  batasSelesai: string | null;
  pemeriksa: string[];          // username (huruf asli akun) pemeriksa data MS
  akunKhusus: string | null;
  kolamCocok: number;
  dikeluarkanBayar: number;
  dikeluarkanSudahDiperiksa: number;
  dikeluarkanSedangDitugaskan: number;
  terpilih: ButirKolam[];
  hasil: ReturnType<typeof bagiTugasUlang>;
}

async function susunRencana(k: KriteriaUlang, benihBaru: () => string): Promise<Rencana> {
  const status = Array.isArray(k.status) ? (k.status as unknown[]).map(huruf).filter((s) => STATUS_FINAL.includes(s)) : [];
  const statusPakai = status.length ? Array.from(new Set(status)) : STATUS_FINAL.slice();
  const layanan = Array.isArray(k.layanan) ? Array.from(new Set((k.layanan as unknown[]).map(besar).filter(Boolean))) : [];
  const jumlahMasuk = Math.floor(Number(k.jumlah) || 0);
  if (jumlahMasuk < 0 || jumlahMasuk > MAKS_TUGAS_PER_PAKET) throw new Error("Jumlah data per paket maksimal " + MAKS_TUGAS_PER_PAKET + ".");
  const batas = huruf(k.batasSelesai);
  if (batas && !/^\d{4}-\d{2}-\d{2}$/.test(batas)) throw new Error("Batas selesai harus berformat tahun-bulan-tanggal.");
  const benih = huruf(k.benih) || benihBaru();
  const sertakan = k.sertakanSudahDiperiksa === true;

  // Akun pemeriksa: verifikator AKTIF; pengecualian (V11) dan akun khusus (V10/K16) ditegakkan di sini, bukan dari layar.
  const akun = await sql`select id, username from akun where role = 'VERIFIKATOR' and aktif is not false order by username`;
  const pengecualian = new Set(PENGECUALIAN_ULANG.map(besar));
  const khususB = besar(AKUN_KHUSUS_ULANG);
  const akunAktif = (akun as Baris[]).map((a) => huruf(a.username));
  const dipilih = Array.isArray(k.pemeriksa) && (k.pemeriksa as unknown[]).length > 0 ? new Set((k.pemeriksa as unknown[]).map(besar)) : null;
  const pemeriksa = akunAktif.filter((u) => !pengecualian.has(besar(u)) && besar(u) !== khususB && (!dipilih || dipilih.has(besar(u))));
  const akunKhusus = akunAktif.find((u) => besar(u) === khususB) || null;

  const rows = await sql`
    select p.id, p.tahun, p.nik, p.layanan, p.status_verifikasi as status, p.diverifikasi_oleh,
      exists (select 1 from tugas_verifikasi_ulang t where t.penerima_id = p.id and t.tahun = p.tahun and t.selesai_pada is not null) as sudah_diperiksa,
      exists (select 1 from tugas_verifikasi_ulang t join batch_verifikasi_ulang b on b.id = t.batch_id
              where t.penerima_id = p.id and t.tahun = p.tahun and t.selesai_pada is null and t.ditarik_pada is null and b.status = 'AKTIF') as sedang
    from penerima p
    where p.tahun = ${TAHUN_AKTIF}
      and p.status_verifikasi = any(${literalArrayTeks(statusPakai)}::text[])
      and (${layanan.length === 0}::boolean or upper(p.layanan) = any(${literalArrayTeks(layanan)}::text[]))
    order by p.id`;

  // NIK yang sudah masuk batch pembayaran tahun ini (satu kueri; dicocokkan di memori)
  const dibayarRows = await sql`select distinct nik from pembayaran_baris where tahun = ${TAHUN_AKTIF}`;
  const dibayar = new Set((dibayarRows as Baris[]).map((r) => huruf(r.nik)));
  const pernahRiwayat = await sql`
    select penerima_id, array_agg(distinct upper(oleh)) as oleh from riwayat_verifikasi
    where tahun = ${TAHUN_AKTIF} and sumber in ('SATU', 'ULANG') group by penerima_id`;
  const pernahTugas = await sql`
    select t.penerima_id, array_agg(distinct upper(a.username)) as oleh
    from tugas_verifikasi_ulang t join akun a on a.id = t.akun_id join batch_verifikasi_ulang b on b.id = t.batch_id
    where t.tahun = ${TAHUN_AKTIF} and (b.status <> 'DIBATALKAN' or t.selesai_pada is not null) group by t.penerima_id`;
  const pernah = new Map<number, Set<string>>();
  const tambah = (peta: Baris[]) => {
    for (const r of peta) {
      const s = pernah.get(Number(r.penerima_id)) || new Set<string>();
      daftarDariPg(r.oleh).forEach((u) => s.add(besar(u)));
      pernah.set(Number(r.penerima_id), s);
    }
  };
  tambah(pernahRiwayat as Baris[]);
  tambah(pernahTugas as Baris[]);

  let dikeluarkanBayar = 0, dikeluarkanSudah = 0, dikeluarkanSedang = 0;
  const kolam: ButirKolam[] = [];
  for (const r of rows as Baris[]) {
    if (huruf(r.nik) && dibayar.has(huruf(r.nik))) { dikeluarkanBayar++; continue; }
    const layak = layakMasukKolam(
      { status: huruf(r.status), sudahDiperiksaUlang: r.sudah_diperiksa === true, sedangDitugaskan: r.sedang === true },
      { sertakanSudahDiperiksa: sertakan, statusDiizinkan: statusPakai },
    );
    if (!layak) {
      if (r.sedang === true) dikeluarkanSedang++; else dikeluarkanSudah++;
      continue;
    }
    const s = new Set(pernah.get(Number(r.id)) || []);
    if (huruf(r.diverifikasi_oleh)) s.add(besar(r.diverifikasi_oleh));
    kolam.push({ id: Number(r.id), tahun: Number(r.tahun), layanan: huruf(r.layanan), status: huruf(r.status), pernahMemverifikasi: Array.from(s) });
  }
  const terpilih = ambilSampel(kolam, jumlahMasuk, benih);
  const hasil = bagiTugasUlang({ benih, kolam: terpilih, pemeriksa, pengecualian: PENGECUALIAN_ULANG.slice(), akunKhusus });
  return {
    benih, status: statusPakai, layanan, sertakanSudahDiperiksa: sertakan, jumlah: jumlahMasuk, batasSelesai: batas || null,
    pemeriksa, akunKhusus, kolamCocok: kolam.length, dikeluarkanBayar, dikeluarkanSudahDiperiksa: dikeluarkanSudah,
    dikeluarkanSedangDitugaskan: dikeluarkanSedang, terpilih, hasil,
  };
}

const benihAcak = () => new Date().toISOString() + "-" + Math.random().toString(36).slice(2, 8);

function ringkasRencana(r: Rencana) {
  const perAkun = Object.entries(r.hasil.perAkun).map(([username, jumlah]) => ({ username, jumlah })).sort((a, b) => a.username.localeCompare(b.username));
  const perLayanan: Record<string, number> = {};
  for (const t of r.hasil.tugas) perLayanan[t.layanan] = (perLayanan[t.layanan] || 0) + 1;
  return {
    benih: r.benih,
    kriteria: { status: r.status, layanan: r.layanan, sertakanSudahDiperiksa: r.sertakanSudahDiperiksa, jumlah: r.jumlah },
    batasSelesai: r.batasSelesai,
    kolamCocok: r.kolamCocok,
    dikeluarkan: { sudahDibayar: r.dikeluarkanBayar, sudahDiperiksaUlang: r.dikeluarkanSudahDiperiksa, sedangDitugaskan: r.dikeluarkanSedangDitugaskan },
    jumlahTugas: r.hasil.tugas.length,
    jumlahPemeriksa: r.pemeriksa.length,
    akunKhusus: r.akunKhusus,
    selisihMS: r.hasil.selisihMS,
    perAkun,
    perLayanan: Object.entries(perLayanan).map(([layanan, jumlah]) => ({ layanan, jumlah })).sort((a, b) => a.layanan.localeCompare(b.layanan)),
    tidakTerbagi: { jumlah: r.hasil.tidakTerbagi.length, contoh: r.hasil.tidakTerbagi.slice(0, 10).map((x) => ({ id: x.id, alasan: x.alasan })) },
  };
}

/** Admin Utama: hitung pembagian TANPA menulis apa pun. Benih yang sama -> hasil sama dengan pembuatan paket. */
export async function pratinjauBatchUlang(token: string, kriteria: KriteriaUlang) {
  try {
    await sesiUtama(token);
    const r = await susunRencana(kriteria || {}, benihAcak);
    return { sukses: true, ...ringkasRencana(r) };
  } catch (e) {
    return galat(e);
  }
}

/** Admin Utama: buat paket tugas (atomik: paket + semua tugas dalam satu transaksi). */
export async function buatBatchUlang(token: string, kriteria: KriteriaUlang) {
  try {
    const sesi = await sesiUtama(token);
    const k = kriteria || {};
    if (!huruf(k.benih)) return { sukses: false, pesan: "Benih wajib diisi (gunakan benih dari pratinjau)." };
    const nama = huruf(k.nama);
    if (!nama) return { sukses: false, pesan: "Nama paket tugas wajib diisi." };
    const r = await susunRencana(k, benihAcak);
    if (r.hasil.tugas.length === 0) return { sukses: false, pesan: "Tidak ada data yang dapat dibagikan dengan kriteria ini." };

    const t = r.hasil.tugas;
    const terpilihPeta = new Map(r.terpilih.map((b) => [b.tahun + ":" + b.id, b]));
    const pv = t.map((x) => (terpilihPeta.get(x.tahun + ":" + x.id)?.pernahMemverifikasi || []).join(","));
    const oleh = besar(sesi.username || "UTAMA");

    // deno-lint-ignore no-explicit-any
    const batchId = await sql.begin(async (trx: any) => {
      await trx`select pg_advisory_xact_lock(7771001)`; // satu pembuatan paket pada satu waktu (cegah dua paket menugaskan data yang sama)
      const b = await trx`
        insert into batch_verifikasi_ulang (nama, dibuat_oleh, benih, kriteria, pemeriksa, pengecualian, akun_khusus, jumlah_tugas, batas_selesai)
        values (${nama}, ${oleh}, ${r.benih},
                ${JSON.stringify({ status: r.status, layanan: r.layanan, sertakanSudahDiperiksa: r.sertakanSudahDiperiksa, jumlah: r.jumlah, tidakTerbagi: r.hasil.tidakTerbagi.length, tidakTerbagiButir: r.hasil.tidakTerbagi.map((x) => ({ id: x.id, tahun: x.tahun, layanan: x.layanan, status: x.status, pernahMemverifikasi: terpilihPeta.get(x.tahun + ":" + x.id)?.pernahMemverifikasi || [] })) })}::jsonb,
                ${JSON.stringify(r.pemeriksa)}::jsonb, ${JSON.stringify(PENGECUALIAN_ULANG)}::jsonb, ${r.akunKhusus},
                ${t.length}, ${r.batasSelesai})
        returning id`;
      const id = Number(b[0].id);
      const masuk = await trx`
        insert into tugas_verifikasi_ulang (batch_id, penerima_id, tahun, akun_id, status_saat_dibagi, layanan, pemverifikasi_awal)
        select ${id}, x.pid, x.tahun, a.id, x.status, x.layanan, coalesce(string_to_array(nullif(x.pv, ''), ','), '{}')
        from unnest(${literalAngka(t.map((x) => x.id))}::bigint[], ${literalAngka(t.map((x) => x.tahun))}::int[], ${literalArrayTeks(t.map((x) => x.akun))}::text[],
                    ${literalArrayTeks(t.map((x) => x.status))}::text[], ${literalArrayTeks(t.map((x) => x.layanan))}::text[], ${literalArrayTeks(pv)}::text[])
             as x(pid, tahun, akun, status, layanan, pv)
        join akun a on upper(a.username) = x.akun
        where not exists (
          select 1 from tugas_verifikasi_ulang u join batch_verifikasi_ulang bb on bb.id = u.batch_id
          where u.penerima_id = x.pid and u.tahun = x.tahun and u.selesai_pada is null and u.ditarik_pada is null and bb.status = 'AKTIF' and bb.id <> ${id})
        returning id`;
      if (masuk.length !== t.length) throw new Error("Pembagian dibatalkan: " + (t.length - masuk.length) + " data baru saja ditugaskan di paket lain atau akun tidak ditemukan. Ulangi pratinjau.");
      return id;
    });
    const tt = r.hasil.tidakTerbagi.length;
    return { sukses: true, batchId, jumlahTugas: t.length, tidakTerbagi: tt, benih: r.benih, pesan: "Paket tugas dibuat: " + t.length + " data." + (tt ? " " + tt + " data tidak dapat dibagikan dan tidak ikut." : "") };
  } catch (e) {
    return galat(e);
  }
}

/** Admin Utama: daftar paket beserta kemajuan. */
export async function daftarBatchUlang(token: string) {
  try {
    await sesiUtama(token);
    await tarikTugasBasi(null);
    const batch = await sql`
      select b.id, b.nama, b.dibuat_oleh, b.dibuat_pada, b.benih, b.status, b.batas_selesai, b.jumlah_tugas, b.akun_khusus,
        count(t.id) filter (where t.selesai_pada is not null)::int as selesai,
        count(t.id) filter (where t.hasil = 'SESUAI')::int as sesuai,
        count(t.id) filter (where t.hasil = 'DIKOREKSI')::int as dikoreksi,
        count(t.id) filter (where t.ditarik_pada is not null)::int as ditarik,
        count(t.id) filter (where t.selesai_pada is null and t.ditarik_pada is null)::int as sisa
      from batch_verifikasi_ulang b left join tugas_verifikasi_ulang t on t.batch_id = b.id
      group by b.id order by b.id desc`;
    const perAkun = await sql`
      select t.batch_id, a.username,
        count(*)::int as tugas,
        count(*) filter (where t.selesai_pada is not null)::int as selesai,
        count(*) filter (where t.ditarik_pada is not null)::int as ditarik
      from tugas_verifikasi_ulang t join akun a on a.id = t.akun_id group by t.batch_id, a.username order by a.username`;
    return {
      sukses: true,
      batch: (batch as Baris[]).map((b) => ({
        id: Number(b.id), nama: huruf(b.nama), dibuatOleh: huruf(b.dibuat_oleh), dibuatPada: b.dibuat_pada, benih: huruf(b.benih), status: huruf(b.status),
        batasSelesai: b.batas_selesai, jumlahTugas: Number(b.jumlah_tugas), akunKhusus: b.akun_khusus,
        selesai: Number(b.selesai), sesuai: Number(b.sesuai), dikoreksi: Number(b.dikoreksi), ditarik: Number(b.ditarik), sisa: Number(b.sisa),
        perAkun: (perAkun as Baris[]).filter((x) => Number(x.batch_id) === Number(b.id)).map((x) => ({ username: huruf(x.username), tugas: Number(x.tugas), selesai: Number(x.selesai), ditarik: Number(x.ditarik) })),
      })),
    };
  } catch (e) {
    return galat(e);
  }
}

/** Admin Utama: batalkan paket. Hanya tugas yang BELUM dikerjakan yang dihapus; tugas selesai tidak pernah dihapus (V9). */
export async function batalkanBatchUlang(token: string, batchId: number) {
  try {
    await sesiUtama(token);
    const id = Number(batchId);
    if (!id) return { sukses: false, pesan: "Paket tidak valid." };
    // deno-lint-ignore no-explicit-any
    const hasil = await sql.begin(async (trx: any) => {
      const b = await trx`update batch_verifikasi_ulang set status = 'DIBATALKAN' where id = ${id} and status = 'AKTIF' returning id`;
      if (b.length === 0) return null;
      const dihapus = await trx`delete from tugas_verifikasi_ulang where batch_id = ${id} and selesai_pada is null returning id`;
      return dihapus.length;
    });
    if (hasil === null) return { sukses: false, pesan: "Paket tidak ditemukan atau sudah tidak aktif." };
    return { sukses: true, tugasDihapus: hasil, pesan: "Paket dibatalkan. Tugas yang sudah selesai tetap tersimpan." };
  } catch (e) {
    return galat(e);
  }
}

/** Admin Utama: hitung ulang pembagian dari benih + snapshot dan bandingkan dengan tugas tersimpan (bukti tidak dipilih-pilih). */
export async function cekPembagianBatchUlang(token: string, batchId: number) {
  try {
    await sesiUtama(token);
    const id = Number(batchId);
    const b = await sql`select id, benih, kriteria, pemeriksa, pengecualian, akun_khusus, jumlah_tugas, status from batch_verifikasi_ulang where id = ${id} limit 1`;
    if (b.length === 0) return { sukses: false, pesan: "Paket tidak ditemukan." };
    const paket = b[0] as Baris;
    if (huruf(paket.status) === "DIBATALKAN") return { sukses: false, pesan: "Paket sudah dibatalkan; pembagiannya tidak dapat dicek ulang." };
    const rows = await sql`
      select t.penerima_id, t.tahun, t.layanan, t.status_saat_dibagi, t.pemverifikasi_awal, upper(a.username) as akun
      from tugas_verifikasi_ulang t join akun a on a.id = t.akun_id where t.batch_id = ${id}`;
    if (rows.length !== Number(paket.jumlah_tugas)) return { sukses: false, pesan: "Jumlah tugas tersimpan tidak sama dengan jumlah saat dibuat; pembagian tidak dapat dicek ulang." };
    const kolam: ButirKolam[] = (rows as Baris[]).map((r) => ({
      id: Number(r.penerima_id), tahun: Number(r.tahun), layanan: huruf(r.layanan), status: huruf(r.status_saat_dibagi), pernahMemverifikasi: daftarDariPg(r.pemverifikasi_awal),
    }));
    // data yang waktu itu tidak terbagi ikut dalam pengacakan; tanpa mereka hasil hitung ulang bisa berbeda
    const kriteria = (paket.kriteria && typeof paket.kriteria === "object" ? paket.kriteria : {}) as Baris;
    for (const b of Array.isArray(kriteria.tidakTerbagiButir) ? (kriteria.tidakTerbagiButir as Baris[]) : []) {
      kolam.push({ id: Number(b.id), tahun: Number(b.tahun), layanan: huruf(b.layanan), status: huruf(b.status), pernahMemverifikasi: Array.isArray(b.pernahMemverifikasi) ? (b.pernahMemverifikasi as unknown[]).map(String) : [] });
    }
    const pemeriksa = Array.isArray(paket.pemeriksa) ? (paket.pemeriksa as unknown[]).map(huruf) : [];
    const pengecualian = Array.isArray(paket.pengecualian) ? (paket.pengecualian as unknown[]).map(huruf) : [];
    const cek = samaDenganTersimpan(
      { benih: huruf(paket.benih), kolam, pemeriksa, pengecualian, akunKhusus: paket.akun_khusus ? huruf(paket.akun_khusus) : null },
      (rows as Baris[]).map((r) => ({ id: Number(r.penerima_id), tahun: Number(r.tahun), akun: huruf(r.akun) })),
    );
    return { sukses: true, sama: cek.sama, selisih: cek.selisih, jumlahTugas: rows.length };
  } catch (e) {
    return galat(e);
  }
}

/** Admin Utama: daftar koreksi hasil pemeriksaan ulang (dapat dibatalkan; tidak wajib diperiksa satu per satu). */
export async function getDaftarKoreksiUlang(token: string, halaman?: number) {
  try {
    await sesiUtama(token);
    const h = Math.max(1, Math.floor(Number(halaman) || 1));
    const rows = await sql`
      select t.id, t.batch_id, t.penerima_id, p.nama, p.layanan, p.kecamatan, p.kelurahan, a.username as pemeriksa, t.selesai_pada,
             t.status_sebelum, t.status_sesudah, t.alasan, (k.tugas_id is not null) as dibatalkan, p.status_verifikasi as status_sekarang
      from tugas_verifikasi_ulang t
      join akun a on a.id = t.akun_id
      left join penerima p on p.id = t.penerima_id and p.tahun = t.tahun
      left join pembatalan_koreksi_ulang k on k.tugas_id = t.id
      where t.hasil = 'DIKOREKSI'
      order by t.selesai_pada desc, t.id desc
      limit ${UKURAN_HALAMAN + 1} offset ${(h - 1) * UKURAN_HALAMAN}`;
    const ada = rows.length > UKURAN_HALAMAN;
    return {
      sukses: true, halaman: h, adaBerikutnya: ada,
      koreksi: (rows as Baris[]).slice(0, UKURAN_HALAMAN).map((r) => ({
        tugasId: Number(r.id), batchId: Number(r.batch_id), penerimaId: Number(r.penerima_id), nama: huruf(r.nama), layanan: huruf(r.layanan), kecamatan: huruf(r.kecamatan), kelurahan: huruf(r.kelurahan),
        pemeriksa: huruf(r.pemeriksa), selesaiPada: r.selesai_pada, statusSebelum: huruf(r.status_sebelum), statusSesudah: huruf(r.status_sesudah), alasan: huruf(r.alasan),
        dibatalkan: r.dibatalkan === true, statusSekarang: huruf(r.status_sekarang),
      })),
    };
  } catch (e) {
    return galat(e);
  }
}

/** Admin Utama: batalkan sebuah koreksi (status data dikembalikan ke status sebelum koreksi), dicatat lengkap. */
export async function batalkanKoreksiUlang(token: string, tugasId: number, alasan: string) {
  try {
    const sesi = await sesiUtama(token);
    const id = Number(tugasId);
    const sebabBersih = huruf(alasan);
    if (!id) return { sukses: false, pesan: "Tugas tidak valid." };
    if (!sebabBersih) return { sukses: false, pesan: "Alasan pembatalan wajib diisi." };
    const oleh = besar(sesi.username || "UTAMA");
    const waktu = new Date();
    // deno-lint-ignore no-explicit-any
    const hasil = await sql.begin(async (trx: any) => {
      const tg = await trx`
        select t.id, t.penerima_id, t.tahun, t.status_sebelum, t.status_sesudah from tugas_verifikasi_ulang t
        where t.id = ${id} and t.hasil = 'DIKOREKSI' and not exists (select 1 from pembatalan_koreksi_ulang k where k.tugas_id = t.id) limit 1`;
      if (tg.length === 0) throw new KonflikUlang("Koreksi tidak ditemukan atau sudah dibatalkan.");
      const x = tg[0] as Baris;
      const kembali = huruf(x.status_sebelum);
      const nilai = nilaiStatusVerifikasi(kembali, "Dikembalikan Admin Utama: " + sebabBersih, BATAS_PERBAIKAN_SERAGAM);
      const upd = await trx`
        update penerima set
          status_verifikasi = ${kembali}, keterangan_verifikasi = ${nilai.keterangan}, tanggal_verifikasi = ${waktu}, diverifikasi_oleh = ${oleh},
          batas_waktu_perbaikan = ${nilai.batasWaktu || null},
          tanggal_lapor_perbaikan = case when ${nilai.putaranBaru}::boolean then null else tanggal_lapor_perbaikan end,
          dilapor_oleh = case when ${nilai.putaranBaru}::boolean then null else dilapor_oleh end,
          tanggal_berkas_diubah = null
        where id = ${Number(x.penerima_id)} and tahun = ${Number(x.tahun)} and status_verifikasi = ${huruf(x.status_sesudah)}
        returning id`;
      if (upd.length === 0) throw new KonflikUlang("Status data sudah berubah sejak dikoreksi; pembatalan tidak dapat dilakukan otomatis.");
      await trx`insert into pembatalan_koreksi_ulang (tugas_id, dibatalkan_oleh, alasan) values (${id}, ${oleh}, ${sebabBersih})`;
      await catatRiwayatVerifikasiWajib(trx, {
        penerimaId: Number(x.penerima_id), tahun: Number(x.tahun), statusLama: huruf(x.status_sesudah), statusBaru: kembali,
        keterangan: "Koreksi pemeriksaan ulang dibatalkan: " + sebabBersih, oleh, sumber: "BATAL_ULANG",
      });
      return { penerimaId: Number(x.penerima_id), dari: huruf(x.status_sesudah), ke: kembali };
    });
    if (hasil.dari === STATUS_MS && hasil.ke !== STATUS_MS) {
      arsipkanDataDetail([hasil.penerimaId], hasil.ke, TAHUN_AKTIF, oleh).catch((e) => console.error("batalkanKoreksiUlang: arsip gagal (non-blocking):", e));
    }
    if (hasil.ke === STATUS_MS) {
      pastikanDataDetailTersinkron(TAHUN_AKTIF).catch((e) => console.error("batalkanKoreksiUlang: sinkron gagal (non-blocking):", e));
    }
    return { sukses: true, pesan: "Koreksi dibatalkan; status dikembalikan ke \"" + hasil.ke + "\"." };
  } catch (e) {
    return galat(e);
  }
}

// ---------------------------------------------------------------------------
// Verifikator: mengerjakan tugas milik sendiri
// ---------------------------------------------------------------------------

/** Tarik otomatis tugas milik akun yang datanya sudah berubah/dihapus sebelum diperiksa (K11). Mengembalikan jumlah yang ditarik. */
async function tarikTugasBasi(akunId: string | null): Promise<number> {
  const r = await sql`
    update tugas_verifikasi_ulang t set ditarik_pada = now(), ditarik_alasan = 'Status data berubah atau data dihapus sebelum diperiksa'
    where (${akunId}::uuid is null or t.akun_id = ${akunId}::uuid) and t.selesai_pada is null and t.ditarik_pada is null
      and not exists (select 1 from penerima p where p.id = t.penerima_id and p.tahun = t.tahun and p.status_verifikasi = t.status_saat_dibagi)
    returning t.id`;
  return r.length;
}

/** Daftar tugas ulang milik akun yang login (halaman 50). */
export async function getTugasUlangSaya(token: string, halaman?: number) {
  try {
    const sesi = await sesiVerifikator(token);
    const ditarik = await tarikTugasBasi(String(sesi.akunId));
    const h = Math.max(1, Math.floor(Number(halaman) || 1));
    const ringkas = await sql`
      select count(*) filter (where t.selesai_pada is null and t.ditarik_pada is null and b.status = 'AKTIF')::int as sisa,
             count(*) filter (where t.selesai_pada is not null)::int as selesai,
             count(*) filter (where t.hasil = 'DIKOREKSI')::int as dikoreksi
      from tugas_verifikasi_ulang t join batch_verifikasi_ulang b on b.id = t.batch_id where t.akun_id = ${String(sesi.akunId)}::uuid`;
    const rows = await sql`
      select t.id, t.penerima_id, t.status_saat_dibagi, t.dibuka_pada, p.nama, p.layanan, p.kecamatan, p.kelurahan, b.nama as nama_paket, b.batas_selesai
      from tugas_verifikasi_ulang t
      join batch_verifikasi_ulang b on b.id = t.batch_id and b.status = 'AKTIF'
      join penerima p on p.id = t.penerima_id and p.tahun = t.tahun
      where t.akun_id = ${String(sesi.akunId)}::uuid and t.selesai_pada is null and t.ditarik_pada is null
      order by t.id limit ${UKURAN_HALAMAN + 1} offset ${(h - 1) * UKURAN_HALAMAN}`;
    const r = (ringkas[0] || {}) as Baris;
    return {
      sukses: true, sisa: Number(r.sisa) || 0, selesai: Number(r.selesai) || 0, dikoreksi: Number(r.dikoreksi) || 0, ditarikBaruSaja: ditarik,
      halaman: h, adaBerikutnya: rows.length > UKURAN_HALAMAN,
      tugas: (rows as Baris[]).slice(0, UKURAN_HALAMAN).map((x) => ({
        tugasId: Number(x.id), penerimaId: Number(x.penerima_id), nama: huruf(x.nama), layanan: huruf(x.layanan), kecamatan: huruf(x.kecamatan), kelurahan: huruf(x.kelurahan),
        status: huruf(x.status_saat_dibagi), dibuka: x.dibuka_pada != null, namaPaket: huruf(x.nama_paket), batasSelesai: x.batas_selesai,
      })),
    };
  } catch (e) {
    return galat(e);
  }
}

// Memuat tugas MILIK akun yang login, belum selesai dan belum ditarik, pada paket aktif; beserta baris data.
async function muatTugasMilik(akunId: string, tugasId: number) {
  const id = Number(tugasId);
  if (!id) throw new Error("Tugas tidak valid.");
  const tg = await sql`
    select t.id, t.penerima_id, t.tahun, t.status_saat_dibagi, t.dibuka_pada, t.berkas_dibuka, t.berkas_url, t.selesai_pada, t.ditarik_pada, b.status as status_paket
    from tugas_verifikasi_ulang t join batch_verifikasi_ulang b on b.id = t.batch_id
    where t.id = ${id} and t.akun_id = ${akunId}::uuid limit 1`;
  if (tg.length === 0) throw new Error("Tugas tidak ditemukan.");
  const t = tg[0] as Baris;
  if (t.selesai_pada != null) throw new Error("Tugas ini sudah selesai dikerjakan.");
  if (t.ditarik_pada != null) throw new Error("Tugas ini sudah ditarik karena data berubah. Muat ulang daftar tugas.");
  if (huruf(t.status_paket) !== "AKTIF") throw new Error("Paket tugas ini sudah tidak aktif.");
  const p = await sql`select * from penerima where id = ${Number(t.penerima_id)} and tahun = ${Number(t.tahun)} limit 1`;
  if (p.length === 0 || huruf((p[0] as Baris).status_verifikasi) !== huruf(t.status_saat_dibagi)) {
    await tarikTugasBasi(akunId);
    throw new Error("Data ini sudah berubah (status atau dihapus) sehingga tugas ditarik. Muat ulang daftar tugas.");
  }
  return { t, p: p[0] as Baris };
}

/** Membuka detail tugas: mencatat waktu buka (server) dan mengembalikan data serta daftar berkas yang harus diperiksa. */
export async function bukaTugasUlang(token: string, tugasId: number) {
  try {
    const sesi = await sesiVerifikator(token);
    const { t, p } = await muatTugasMilik(String(sesi.akunId), tugasId);
    await sql`update tugas_verifikasi_ulang set dibuka_pada = coalesce(dibuka_pada, now()) where id = ${Number(t.id)} and selesai_pada is null`;
    const berkas = daftarBerkasDariBaris(p);
    const dibuka = new Set(berkasDibukaSah(berkas, keDaftar(t.berkas_dibuka), t.berkas_url as Record<string, unknown>));
    return {
      sukses: true,
      tugasId: Number(t.id),
      penerimaId: Number(t.penerima_id),
      status: huruf(p.status_verifikasi),
      keteranganVerifikasi: huruf(p.keterangan_verifikasi),
      diverifikasiOleh: huruf(p.diverifikasi_oleh),
      data: { nama: huruf(p.nama), nik: huruf(p.nik), layanan: huruf(p.layanan), tempatTugas: huruf(p.tempat_tugas), kecamatan: huruf(p.kecamatan), kelurahan: huruf(p.kelurahan) },
      berkas: berkas.map((b) => ({ kunci: b.kunci, label: b.label, url: b.url, dibuka: dibuka.has(b.kunci) })),
    };
  } catch (e) {
    return galat(e);
  }
}

/** Mencatat bahwa pemeriksa MENGKLIK sebuah berkas (dasar centang aktif). Kunci harus berkas yang benar-benar ada pada data. */
export async function catatBerkasDibuka(token: string, tugasId: number, kunciBerkas: string) {
  try {
    const sesi = await sesiVerifikator(token);
    const { t, p } = await muatTugasMilik(String(sesi.akunId), tugasId);
    if (t.dibuka_pada == null) return { sukses: false, pesan: "Buka data terlebih dahulu." };
    const kunci = huruf(kunciBerkas);
    if (!daftarBerkasDariBaris(p).some((b) => b.kunci === kunci)) return { sukses: false, pesan: "Berkas tidak dikenal pada data ini." };
    // tautan saat diklik ikut dicatat: bila berkas diganti sesudahnya, klik ini tidak lagi sah (lihat berkasDibukaSah)
    const url = daftarBerkasDariBaris(p).find((b) => b.kunci === kunci)!.url;
    await sql`
      update tugas_verifikasi_ulang set
        berkas_dibuka = case when berkas_dibuka @> jsonb_build_array(${kunci}::text) then berkas_dibuka else berkas_dibuka || jsonb_build_array(${kunci}::text) end,
        berkas_url = berkas_url || jsonb_build_object(${kunci}::text, ${url}::text)
      where id = ${Number(t.id)} and selesai_pada is null`;
    return { sukses: true };
  } catch (e) {
    return galat(e);
  }
}

export interface HasilUlangMasuk {
  hasil?: unknown;
  statusSesudah?: unknown;
  alasan?: unknown;
  centang?: unknown;
}

/** Menyimpan hasil pemeriksaan ulang (satu transaksi: tugas + status data + riwayat). */
export async function simpanHasilUlang(token: string, tugasId: number, masuk: HasilUlangMasuk) {
  try {
    const sesi = await sesiVerifikator(token);
    const { t, p } = await muatTugasMilik(String(sesi.akunId), tugasId);
    const statusSebelum = huruf(p.status_verifikasi);
    const berkas = daftarBerkasDariBaris(p);
    const dibuka = berkasDibukaSah(berkas, keDaftar(t.berkas_dibuka), t.berkas_url as Record<string, unknown>);
    const cek = cekSimpanHasil({
      hasil: masuk?.hasil, statusSebelum, statusSesudah: masuk?.statusSesudah, alasan: masuk?.alasan,
      berkas, berkasDibuka: dibuka, centang: masuk?.centang, sudahDibuka: t.dibuka_pada != null,
    });
    if (!cek.ok) return { sukses: false, pesan: cek.pesan };

    if (cek.hasil === "DIKOREKSI") {
      const dibayar = await sql`select 1 from pembayaran_baris where tahun = ${Number(t.tahun)} and nik = ${huruf(p.nik)} limit 1`;
      if (dibayar.length > 0) return { sukses: false, pesan: "Data ini sudah masuk batch pembayaran dan tidak dapat dikoreksi. Hubungi Admin Utama." };
    }

    const oleh = besar(sesi.username);
    const nilai = nilaiStatusVerifikasi(cek.statusSesudah, cek.alasan, BATAS_PERBAIKAN_SERAGAM);
    // deno-lint-ignore no-explicit-any
    await sql.begin(async (trx: any) => {
      const selesai = await trx`
        update tugas_verifikasi_ulang set selesai_pada = now(), hasil = ${cek.hasil}, status_sebelum = ${statusSebelum}, status_sesudah = ${cek.statusSesudah},
          alasan = ${cek.alasan}, daftar_periksa = ${JSON.stringify(cek.daftarPeriksa)}::jsonb
        where id = ${Number(t.id)} and selesai_pada is null and ditarik_pada is null returning id`;
      if (selesai.length === 0) throw new KonflikUlang("Tugas ini sudah selesai atau ditarik.");
      if (cek.hasil === "DIKOREKSI") {
        const upd = await trx`
          update penerima set
            status_verifikasi = ${cek.statusSesudah}, keterangan_verifikasi = ${nilai.keterangan}, tanggal_verifikasi = now(), diverifikasi_oleh = ${oleh},
            batas_waktu_perbaikan = ${nilai.batasWaktu || null},
            tanggal_lapor_perbaikan = case when ${nilai.putaranBaru}::boolean then null else tanggal_lapor_perbaikan end,
            dilapor_oleh = case when ${nilai.putaranBaru}::boolean then null else dilapor_oleh end,
            tanggal_berkas_diubah = null
          where id = ${Number(t.penerima_id)} and tahun = ${Number(t.tahun)} and status_verifikasi = ${statusSebelum}
          returning id`;
        if (upd.length === 0) throw new KonflikUlang("Status data berubah saat Anda memeriksa. Muat ulang daftar tugas.");
      }
      await catatRiwayatVerifikasiWajib(trx, {
        penerimaId: Number(t.penerima_id), tahun: Number(t.tahun), statusLama: statusSebelum, statusBaru: cek.statusSesudah,
        keterangan: cek.hasil === "SESUAI" ? "SESUAI" : "DIKOREKSI: " + cek.alasan, oleh, sumber: "ULANG",
      });
    });

    if (cek.hasil === "DIKOREKSI" && statusSebelum === STATUS_MS) {
      arsipkanDataDetail([Number(t.penerima_id)], cek.statusSesudah, TAHUN_AKTIF, oleh).catch((e) => console.error("simpanHasilUlang: arsipkanDataDetail gagal (non-blocking):", e));
    }
    return { sukses: true, hasil: cek.hasil, statusSesudah: cek.statusSesudah, pesan: cek.hasil === "SESUAI" ? "Hasil Sesuai tersimpan." : "Koreksi tersimpan: status menjadi " + cek.statusSesudah + "." };
  } catch (e) {
    if (e instanceof KonflikUlang) return { sukses: false, konflik: true, pesan: e.message };
    return galat(e);
  }
}
