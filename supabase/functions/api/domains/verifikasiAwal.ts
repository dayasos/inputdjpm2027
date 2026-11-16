// Verifikasi Awal dibagi rata otomatis. Rencana: plans/plan-verifikasi-awal-bagi-rata.md.
//
// Aturan penting (ditegakkan DI SINI dan di verifikasi.ts, bukan di layar):
//  - SAMA JUMLAH: data baru (status "Proses Verifikasi", belum punya tugas aktif) dibagikan kepada verifikator dengan jumlah paling sedikit
//    (_shared/pembagianAwal.ts). Tanpa kekhususan tim. Pimpinan dan akun khusus (verif_uga_deba) tidak pernah menerima.
//  - Tugas MENETAP pada akunnya sampai selesai (tanpa pengembalian/pengalihan; keputusan user 2026-11-16). Admin Utama tetap boleh memverifikasi
//    data apa pun; tugas yang datanya sudah tidak "Proses Verifikasi" ditutup (DITUTUP) oleh penyapu berikutnya.
//  - Saat saklar NYALA, akun Verifikator hanya boleh memberi hasil pada data yang ditugaskan kepadanya (gerbang di verifikasi.ts memakai
//    `TugasBukanMilik` dan `pesanTugasBukanMilik` dari sini). Saat MATI semuanya berjalan seperti sebelumnya.
//  - Penyisiran berjalan dalam SATU transaksi dengan kunci advisory (satu penyisiran pada satu waktu). Pemicu: pg_cron tiap 10 menit
//    (aksi jalur _secret), saat petugas membuka panel tugasnya (paling cepat 1x/menit), dan tombol Admin.
//  - Predikat "menunggu verifikasi" memakai nilai persis ('Proses Verifikasi', kosong, null) supaya memakai indeks status_verifikasi: pada data nyata
//    2026-11-16 pemindaian dengan upper(trim(...)) memakan 1,6 dtk, indeks 13 ms. Aplikasi hanya menulis nilai persis itu (penerima.ts).
//  - jsonb ditulis dengan trx.json (BUKAN JSON.stringify::jsonb, lihat _shared/jsonDb.ts).
import { adalahVerifikator } from "../_shared/gerbangPeran.ts";
import { sql } from "../_shared/db.ts";
import { wajibSesi } from "../_shared/sesi.ts";
import { TAHUN_AKTIF } from "../_shared/config.ts";
import { bagiTugasAwal, saringPemeriksa, titikAwalAkunBaru, type AkunAwal } from "../_shared/pembagianAwal.ts";
import { AKUN_KHUSUS_ULANG, PENGECUALIAN_ULANG } from "../_shared/verifikasiUlangInti.ts";
import { literalArrayTeks } from "./templatAlasan.ts";

type Baris = Record<string, unknown>;
const KUNCI_LOCK = 7771002;
const KUNCI_SAKLAR = "verif_awal_aktif";
const UKURAN_HALAMAN = 50;
const JEDA_OPORTUNISTIK_MS = 60_000;
const JEDA_OTOMATIS_MS = 30_000;

const huruf = (v: unknown) => String(v == null ? "" : v).trim();
const besar = (v: unknown) => huruf(v).toUpperCase();
const literalAngka = (a: number[]) => "{" + a.join(",") + "}";
const galat = (e: unknown) => ({ sukses: false, pesan: e instanceof Error ? e.message : String(e) });

export class TugasBukanMilik extends Error {
  constructor() { super("Data ini bukan tugas Anda."); }
}

async function sesiUtama(token: string) {
  const sesi = await wajibSesi(token);
  if (besar(sesi.role) !== "UTAMA") throw new Error("Fitur ini khusus Admin Utama.");
  return sesi;
}

/**
 * Akun yang TIDAK terkena gerbang "hanya data tugasnya": pimpinan dan akun khusus (daftar yang sama dengan yang tidak menerima tugas).
 * Mereka tidak punya tugas, jadi tanpa pengecualian ini mereka kehilangan kemampuan memverifikasi yang sekarang mereka miliki.
 * Bila mereka memverifikasi data yang sedang bertugas pada orang lain, tugas itu ditutup oleh penyapu berikutnya (DITUTUP).
 */
export function bebasGerbangAwal(username: unknown): boolean {
  const u = besar(username);
  return [...PENGECUALIAN_ULANG, AKUN_KHUSUS_ULANG].some((x) => besar(x) === u);
}

/** Saklar pembagian. Pembacaan tunggal; dipakai verifikasi.ts untuk akun Verifikator saja. */
export async function pembagianAwalAktif(): Promise<boolean> {
  const r = await sql`select value from setelan where key = ${KUNCI_SAKLAR} limit 1`;
  return r.length > 0 && huruf((r[0] as Baris).value) === "1";
}

/** Pesan bila verifikator mencoba memberi hasil pada data yang bukan tugasnya (dibaca sesudah transaksi dibatalkan). */
export async function pesanTugasBukanMilik(penerimaId: number): Promise<string> {
  const r = await sql`
    select a.username, a.nama_lengkap from tugas_verifikasi_awal t join akun a on a.id = t.akun_id
    where t.penerima_id = ${penerimaId} and t.tahun = ${TAHUN_AKTIF} and t.status = 'AKTIF' limit 1`;
  if (r.length === 0) return "Data ini belum dibagikan kepada verifikator mana pun. Tunggu beberapa menit lalu muat ulang daftar Tugas Awal Anda.";
  const x = r[0] as Baris;
  const nama = huruf(x.nama_lengkap) || huruf(x.username);
  return "Data ini ditugaskan kepada " + nama + ". Anda hanya dapat memverifikasi data pada daftar Tugas Awal Anda.";
}

// ---------------------------------------------------------------------------
// Penyisiran (dipakai pratinjau, pembagian manual, otomatis, dan saat menyalakan: logika SATU, hasil identik)
// ---------------------------------------------------------------------------
type Jenis = "OTOMATIS" | "MANUAL" | "MULAI" | "MATI";

interface HasilSapuan {
  sukses: true;
  dilewati?: string;
  dryRun: boolean;
  jenis: Jenis;
  benih: string;
  dibagi: number;
  ditutup: number;
  menungguSebelum: number;
  selisih: number;
  perAkun: { username: string; jumlahAwal: number; diterima: number; jumlahAkhir: number }[];
}

// deno-lint-ignore no-explicit-any
async function sapuanDalamTrx(trx: any, jenis: Jenis, oleh: string, dryRun: boolean, rebaseDiminta: boolean): Promise<HasilSapuan> {
  const benih = jenis + ":" + new Date().toISOString() + ":" + Math.random().toString(36).slice(2, 8);

  // 1) tutup tugas yang datanya sudah bukan "Proses Verifikasi" (diverifikasi Admin / jalur lain / dihapus)
  let ditutup = 0;
  if (dryRun) {
    const c = await trx`
      select count(*)::int as n from tugas_verifikasi_awal t
      where t.status = 'AKTIF' and t.tahun = ${TAHUN_AKTIF}
        and not exists (select 1 from penerima p where p.id = t.penerima_id and p.tahun = t.tahun
                        and (p.status_verifikasi in ('Proses Verifikasi', '') or p.status_verifikasi is null))`;
    ditutup = Number(c[0].n) || 0;
  } else {
    const c = await trx`
      update tugas_verifikasi_awal t set status = 'DITUTUP', selesai_pada = now(), alasan_tutup = 'Data tidak lagi berstatus Proses Verifikasi'
      where t.status = 'AKTIF' and t.tahun = ${TAHUN_AKTIF}
        and not exists (select 1 from penerima p where p.id = t.penerima_id and p.tahun = t.tahun
                        and (p.status_verifikasi in ('Proses Verifikasi', '') or p.status_verifikasi is null))
      returning t.id`;
    ditutup = c.length;
  }

  // 2) penerima tugas: verifikator aktif, tanpa pengecualian dan akun khusus
  const akunRows = await trx`select id, username from akun where role = 'VERIFIKATOR' and aktif is not false order by username`;
  const boleh = new Set(saringPemeriksa((akunRows as Baris[]).map((a) => huruf(a.username)), [...PENGECUALIAN_ULANG, AKUN_KHUSUS_ULANG]).map(besar));
  const akun = (akunRows as Baris[]).filter((a) => boleh.has(besar(a.username)));

  // 3) keadaan: titik awal per akun + tugas yang sudah diterima
  const dasarRows = await trx`select akun_id, dasar from pembagian_awal_akun`;
  const dasar = new Map<string, number>((dasarRows as Baris[]).map((r) => [huruf(r.akun_id), Number(r.dasar)]));
  const tugasRows = await trx`select akun_id, upper(layanan) as layanan, count(*)::int as n from tugas_verifikasi_awal where tahun = ${TAHUN_AKTIF} group by 1, 2`;
  const terima = new Map<string, number>();
  const perLayanan = new Map<string, Record<string, number>>();
  for (const r of tugasRows as Baris[]) {
    const id = huruf(r.akun_id);
    terima.set(id, (terima.get(id) || 0) + Number(r.n));
    const m = perLayanan.get(id) || {};
    m[huruf(r.layanan)] = Number(r.n);
    perLayanan.set(id, m);
  }
  const baru: { akun_id: string; dasar: number; keterangan: string }[] = [];
  // Titik awal dihitung ULANG tiap pembagian dinyalakan (dan saat belum ada titik awal sama sekali): jumlah Verifikasi Awal yang sudah dikerjakan akun
  // itu (sumber SATU, status sebelumnya Proses Verifikasi, 1 kali per data) dikurangi yang dikerjakannya LEWAT tugas (sudah terhitung di tabel tugas).
  // Dengan begitu verifikasi yang dipilih sendiri selagi pembagian MATI ikut terhitung dan jumlah akhir tetap sama.
  const rebase = rebaseDiminta || dasar.size === 0;
  if (rebase) {
    const sel = await trx`select akun_id, count(*)::int as n from tugas_verifikasi_awal where tahun = ${TAHUN_AKTIF} and status = 'SELESAI' group by 1`;
    const selesaiLewatTugas = new Map<string, number>((sel as Baris[]).map((r) => [huruf(r.akun_id), Number(r.n)]));
    const h = await trx`
      select upper(oleh) as u, count(distinct penerima_id)::int as n from riwayat_verifikasi
      where tahun = ${TAHUN_AKTIF} and sumber = 'SATU' and coalesce(nullif(trim(status_lama), ''), 'Proses Verifikasi') = 'Proses Verifikasi' group by 1`;
    const peta = new Map<string, number>((h as Baris[]).map((r) => [besar(r.u), Number(r.n)]));
    for (const a of akun) {
      const dasarAkun = Math.max(0, (peta.get(besar(a.username)) || 0) - (selesaiLewatTugas.get(huruf(a.id)) || 0));
      baru.push({ akun_id: huruf(a.id), dasar: dasarAkun, keterangan: "jumlah Verifikasi Awal yang sudah dikerjakan di luar tugas, dihitung saat pembagian dinyalakan" });
    }
  } else {
    const efektifLain = akun.filter((a) => dasar.has(huruf(a.id))).map((a) => (dasar.get(huruf(a.id)) || 0) + (terima.get(huruf(a.id)) || 0));
    for (const a of akun) if (!dasar.has(huruf(a.id))) baru.push({ akun_id: huruf(a.id), dasar: titikAwalAkunBaru(efektifLain), keterangan: "akun baru: mulai dari jumlah terkecil" });
  }
  for (const b of baru) dasar.set(b.akun_id, b.dasar);

  const akunAwal: AkunAwal[] = akun.map((a) => ({
    username: huruf(a.username),
    jumlah: (dasar.get(huruf(a.id)) || 0) + (terima.get(huruf(a.id)) || 0),
    perLayanan: perLayanan.get(huruf(a.id)) || {},
  }));

  // 4) kolam: data "Proses Verifikasi" tahun aktif yang belum punya tugas aktif, urut waktu masuk
  const kolam = await trx`
    select p.id, p.tahun, p.layanan from penerima p
    where p.tahun = ${TAHUN_AKTIF}
      and (p.status_verifikasi in ('Proses Verifikasi', '') or p.status_verifikasi is null)
      and not exists (select 1 from tugas_verifikasi_awal t where t.penerima_id = p.id and t.tahun = p.tahun and t.status = 'AKTIF')
    order by p.dibuat_at, p.id`;
  const butir = (kolam as Baris[]).map((r) => ({ id: Number(r.id), tahun: Number(r.tahun), layanan: huruf(r.layanan) }));
  const hasil = bagiTugasAwal({ benih, kolam: butir, akun: akunAwal });

  const diterima = new Map<string, number>();
  for (const t of hasil.tugas) diterima.set(besar(t.akun), (diterima.get(besar(t.akun)) || 0) + 1);
  const perAkun = akunAwal
    .map((a) => ({ username: a.username, jumlahAwal: a.jumlah, diterima: diterima.get(besar(a.username)) || 0, jumlahAkhir: hasil.jumlahAkhir[a.username] ?? a.jumlah }))
    .sort((a, b) => a.username.localeCompare(b.username));
  const nilai = perAkun.map((x) => x.jumlahAkhir);
  const selisih = nilai.length ? Math.max(...nilai) - Math.min(...nilai) : 0;
  const ringkas: HasilSapuan = { sukses: true, dryRun, jenis, benih, dibagi: hasil.tugas.length, ditutup, menungguSebelum: butir.length, selisih, perAkun };
  if (dryRun) return ringkas;

  // 5) tulis: baris titik awal akun baru, log penyisiran, tugas. OTOMATIS yang tidak berbuat apa pun tidak dicatat (hemat tabel).
  if (baru.length && rebase) {
    await trx`insert into pembagian_awal_akun (akun_id, dasar, keterangan)
      select x.akun_id::uuid, x.dasar, x.ket
      from unnest(${literalArrayTeks(baru.map((b) => b.akun_id))}::text[], ${literalAngka(baru.map((b) => b.dasar))}::int[], ${literalArrayTeks(baru.map((b) => b.keterangan))}::text[]) as x(akun_id, dasar, ket)
      on conflict (akun_id) do update set dasar = excluded.dasar, keterangan = excluded.keterangan, dicatat = now()`;
  } else if (baru.length) {
    await trx`insert into pembagian_awal_akun (akun_id, dasar, keterangan)
      select x.akun_id::uuid, x.dasar, x.ket
      from unnest(${literalArrayTeks(baru.map((b) => b.akun_id))}::text[], ${literalAngka(baru.map((b) => b.dasar))}::int[], ${literalArrayTeks(baru.map((b) => b.keterangan))}::text[]) as x(akun_id, dasar, ket)
      on conflict (akun_id) do nothing`;
  }
  if (jenis === "OTOMATIS" && hasil.tugas.length === 0 && ditutup === 0) return ringkas;
  const ringkasanJson = Object.fromEntries(perAkun.map((x) => [x.username, x.jumlahAkhir]));
  const s = await trx`
    insert into sapuan_pembagian_awal (jenis, oleh, benih, dibagi, ditutup, ringkasan)
    values (${jenis}, ${oleh}, ${benih}, ${hasil.tugas.length}, ${ditutup}, ${trx.json(ringkasanJson)}) returning id`;
  const sapuanId = Number(s[0].id);
  if (hasil.tugas.length > 0) {
    const t = hasil.tugas;
    const masuk = await trx`
      insert into tugas_verifikasi_awal (penerima_id, tahun, akun_id, layanan, sapuan_id)
      select x.pid, x.tahun, a.id, x.layanan, ${sapuanId}
      from unnest(${literalAngka(t.map((x) => x.id))}::bigint[], ${literalAngka(t.map((x) => x.tahun))}::int[], ${literalArrayTeks(t.map((x) => besar(x.akun)))}::text[], ${literalArrayTeks(t.map((x) => x.layanan))}::text[]) as x(pid, tahun, akun, layanan)
      join akun a on upper(a.username) = x.akun
      on conflict do nothing
      returning id`;
    if (masuk.length !== t.length) throw new Error("Pembagian dibatalkan: " + (t.length - masuk.length) + " data baru saja ditugaskan oleh proses lain atau akun tidak ditemukan. Coba lagi.");
  }
  return ringkas;
}

async function jalankanSapuan(jenis: Jenis, oleh: string, dryRun: boolean): Promise<HasilSapuan | { sukses: true; dilewati: string }> {
  // deno-lint-ignore no-explicit-any
  return await sql.begin(async (trx: any) => {
    const kunci = await trx`select pg_try_advisory_xact_lock(${KUNCI_LOCK}) as ok`;
    if (!kunci[0].ok) return { sukses: true as const, dilewati: "Penyisiran lain sedang berjalan." };
    const s = await trx`select value from setelan where key = ${KUNCI_SAKLAR} limit 1`;
    const nyala = s.length > 0 && huruf(s[0].value) === "1";
    if (!dryRun && !nyala) return { sukses: true as const, dilewati: "Pembagian Verifikasi Awal sedang dimatikan." };
    // Pratinjau saat saklar MATI memperlihatkan hasil PENYALAAN (titik awal dihitung ulang); pratinjau saat NYALA = pembagian biasa.
    return await sapuanDalamTrx(trx, jenis, oleh, dryRun, dryRun && !nyala);
  });
}

let terakhirOportunistik = 0;
/** Dipanggil saat petugas membuka panelnya: menyisir bila sudah lewat 1 menit sejak penyisiran terakhir di isolate ini. Kegagalan tidak menghambat. */
async function sapuOportunistik() {
  const sekarang = Date.now();
  if (sekarang - terakhirOportunistik < JEDA_OPORTUNISTIK_MS) return;
  terakhirOportunistik = sekarang;
  try { await jalankanSapuan("OTOMATIS", "SISTEM", false); } catch (e) { console.error("sapuOportunistik gagal:", e); }
}

/** Jalur _secret (pg_cron tiap 10 menit). Aman dijalankan kapan pun; saklar mati = berhenti seketika. */
let terakhirOtomatis = 0;
export async function jalankanPembagianAwalOtomatis() {
  try {
    // Aksi ini boleh sampai lewat sesi non-Verifikator (tidak khusus jalur _secret); pembatasan membuat pemanggilan berulang tidak berarti.
    const sekarang = Date.now();
    if (sekarang - terakhirOtomatis < JEDA_OTOMATIS_MS) return { sukses: true, dilewati: "Baru saja dijalankan." };
    terakhirOtomatis = sekarang;
    const r = await jalankanSapuan("OTOMATIS", "SISTEM", false);
    return "dilewati" in r ? { sukses: true, dilewati: r.dilewati } : { sukses: true, dibagi: r.dibagi, ditutup: r.ditutup };
  } catch (e) {
    console.error("jalankanPembagianAwalOtomatis gagal:", e);
    return galat(e);
  }
}

// ---------------------------------------------------------------------------
// Admin Utama
// ---------------------------------------------------------------------------
export async function pratinjauPembagianAwal(token: string) {
  try {
    await sesiUtama(token);
    return await jalankanSapuan("MANUAL", "PRATINJAU", true);
  } catch (e) {
    return galat(e);
  }
}

export async function bagiSekarangAwal(token: string) {
  try {
    const sesi = await sesiUtama(token);
    const r = await jalankanSapuan("MANUAL", besar(sesi.username || "UTAMA"), false);
    if ("dilewati" in r) return { sukses: false, pesan: r.dilewati };
    return { ...r, pesan: "Dibagikan " + r.dibagi + " data." + (r.ditutup ? " " + r.ditutup + " tugas ditutup karena datanya sudah diverifikasi." : "") };
  } catch (e) {
    return galat(e);
  }
}

/** Menyalakan = SATU transaksi: saklar '1' + penyalaan pertama (titik awal historis + pembagian). Mematikan = saklar '0' dan catatan. */
export async function aturPembagianAwal(token: string, aktif: unknown) {
  try {
    const sesi = await sesiUtama(token);
    const oleh = besar(sesi.username || "UTAMA");
    const nyala = aktif === true;
    // deno-lint-ignore no-explicit-any
    const hasil = await sql.begin(async (trx: any) => {
      await trx`select pg_advisory_xact_lock(${KUNCI_LOCK})`;
      await trx`insert into setelan (key, value) values (${KUNCI_SAKLAR}, ${nyala ? "1" : "0"}) on conflict (key) do update set value = excluded.value`;
      if (!nyala) {
        await trx`insert into sapuan_pembagian_awal (jenis, oleh, benih, ringkasan) values ('MATI', ${oleh}, '', ${trx.json({})})`;
        return null;
      }
      return await sapuanDalamTrx(trx, "MULAI", oleh, false, true);
    });
    return nyala
      ? { sukses: true, aktif: true, dibagi: hasil ? hasil.dibagi : 0, selisih: hasil ? hasil.selisih : 0, pesan: "Pembagian Verifikasi Awal dinyalakan. Dibagikan " + (hasil ? hasil.dibagi : 0) + " data." }
      : { sukses: true, aktif: false, pesan: "Pembagian Verifikasi Awal dimatikan. Verifikator kembali memilih data sendiri." };
  } catch (e) {
    return galat(e);
  }
}

export async function getStatusPembagianAwal(token: string) {
  try {
    await sesiUtama(token);
    const aktif = await pembagianAwalAktif();
    const akunRows = await sql`
      select a.id, a.username, a.nama_lengkap, a.aktif, t.tim,
        coalesce(d.dasar, 0)::int as dasar, d.akun_id is not null as punya_dasar,
        count(g.id)::int as ditugaskan,
        count(g.id) filter (where g.status = 'SELESAI')::int as selesai,
        count(g.id) filter (where g.status = 'DITUTUP')::int as ditutup,
        count(g.id) filter (where g.status = 'AKTIF')::int as sisa
      from akun a
      left join tim_verifikator t on t.akun_id = a.id
      left join pembagian_awal_akun d on d.akun_id = a.id
      left join tugas_verifikasi_awal g on g.akun_id = a.id and g.tahun = ${TAHUN_AKTIF}
      where a.role = 'VERIFIKATOR'
      group by a.id, a.username, a.nama_lengkap, a.aktif, t.tim, d.akun_id, d.dasar
      order by a.username`;
    const kecuali = new Set([...PENGECUALIAN_ULANG, AKUN_KHUSUS_ULANG].map(besar));
    const menunggu = await sql`
      select count(*)::int as n from penerima p
      where p.tahun = ${TAHUN_AKTIF}
        and (p.status_verifikasi in ('Proses Verifikasi', '') or p.status_verifikasi is null)
        and not exists (select 1 from tugas_verifikasi_awal t where t.penerima_id = p.id and t.tahun = p.tahun and t.status = 'AKTIF')`;
    const sapuan = await sql`select id, waktu, jenis, oleh, dibagi, ditutup from sapuan_pembagian_awal order by id desc limit 10`;
    return {
      sukses: true,
      aktif,
      menunggu: Number((menunggu[0] as Baris).n) || 0,
      akun: (akunRows as Baris[]).map((a) => ({
        username: huruf(a.username), namaLengkap: huruf(a.nama_lengkap), tim: a.tim ? huruf(a.tim) : "", aktif: a.aktif !== false,
        dikecualikan: kecuali.has(besar(a.username)), dasar: Number(a.dasar), punyaDasar: a.punya_dasar === true,
        ditugaskan: Number(a.ditugaskan), selesai: Number(a.selesai), ditutup: Number(a.ditutup), sisa: Number(a.sisa),
        jumlah: Number(a.dasar) + Number(a.ditugaskan),
      })),
      sapuan: (sapuan as Baris[]).map((s) => ({ id: Number(s.id), waktu: s.waktu, jenis: huruf(s.jenis), oleh: huruf(s.oleh), dibagi: Number(s.dibagi), ditutup: Number(s.ditutup) })),
    };
  } catch (e) {
    return galat(e);
  }
}

// ---------------------------------------------------------------------------
// Verifikator
// ---------------------------------------------------------------------------
/** Tugas Awal milik akun yang login (hanya yang masih "Proses Verifikasi"). `ids` memuat semua tugas aktif untuk penguncian tombol di layar. */
export async function getTugasAwalSaya(token: string, halaman?: number) {
  try {
    const sesi = await wajibSesi(token);
    if (!adalahVerifikator(sesi.role)) return { sukses: false, pesan: "Fitur ini khusus akun Verifikator." };
    const aktif = await pembagianAwalAktif();
    if (!aktif) return { sukses: true, aktif: false, ditugaskan: 0, selesai: 0, sisa: 0, ids: [], daftar: [], halaman: 1, totalHalaman: 1 };
    await sapuOportunistik();
    const akunId = sesi.akunId as string;
    const ringkas = await sql`
      select count(*)::int as ditugaskan,
        count(*) filter (where status = 'SELESAI')::int as selesai
      from tugas_verifikasi_awal where akun_id = ${akunId}::uuid and tahun = ${TAHUN_AKTIF}`;
    const sisaRows = await sql`
      select t.penerima_id as id, t.layanan, t.ditugaskan_pada, p.nama, p.kecamatan, p.kelurahan, p.nomor_urut
      from tugas_verifikasi_awal t join penerima p on p.id = t.penerima_id and p.tahun = t.tahun
      where t.akun_id = ${akunId}::uuid and t.tahun = ${TAHUN_AKTIF} and t.status = 'AKTIF'
        and (p.status_verifikasi in ('Proses Verifikasi', '') or p.status_verifikasi is null)
      order by t.ditugaskan_pada, t.id`;
    const semua = sisaRows as Baris[];
    const total = Math.max(1, Math.ceil(semua.length / UKURAN_HALAMAN));
    const h = Math.min(Math.max(1, Math.floor(Number(halaman) || 1)), total);
    const r = (ringkas[0] || {}) as Baris;
    return {
      sukses: true, aktif: true,
      ditugaskan: Number(r.ditugaskan) || 0, selesai: Number(r.selesai) || 0, sisa: semua.length,
      ids: semua.map((x) => Number(x.id)),
      daftar: semua.slice((h - 1) * UKURAN_HALAMAN, h * UKURAN_HALAMAN).map((x) => ({
        id: Number(x.id), nama: huruf(x.nama), layanan: huruf(x.layanan), kecamatan: huruf(x.kecamatan), kelurahan: huruf(x.kelurahan),
        nomorUrut: x.nomor_urut == null ? null : Number(x.nomor_urut), ditugaskanPada: x.ditugaskan_pada,
      })),
      halaman: h, totalHalaman: total,
    };
  } catch (e) {
    return galat(e);
  }
}

