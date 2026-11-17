// Pemeriksa koordinat Guru Maghrib Mengaji: penyapu (menilai tautan yang belum dinilai/basi) dan pembaca penanda untuk layar.
// Aturan penilaian: _shared/cekKoordinat.ts (KETAT). Tahap A: hanya PENANDA; belum ada penolakan penyimpanan.
//
//  - Penyapu dipicu pg_cron tiap 5 menit (jalur _secret). Tautan panjang dinilai langsung; tautan pendek dibuka (hanya header pengalihan) dengan laju pelan.
//  - Hasil disimpan per penerima beserta tautan yang dinilai; tautan berubah -> dinilai ulang. Tautan yang sama dipakai bersama (cache) tanpa dibuka lagi.
//  - Google tidak menjawab/membatasi -> BELUM_DICEK (dicoba lagi setelah 30 menit); TIDAK PERNAH dianggap salah.
import { sql } from "../_shared/db.ts";
import { wajibSesi } from "../_shared/sesi.ts";
import { TAHUN_AKTIF } from "../_shared/config.ts";
import { ALASAN, adalahTautanPendek, nilaiTautan, periksaTautan, type FungsiAmbil, type Penilaian } from "../_shared/cekKoordinat.ts";
import { literalArrayTeks } from "./templatAlasan.ts";

type Baris = Record<string, unknown>;
export const LAYANAN_CEK = "GURU MAGHRIB MENGAJI";
const ANGGARAN_MS = 25_000;      // waktu kerja per putaran; terburuk ditambah 4 lompatan x 8 dtk (BATAS_AMBIL_MS) = ±57 dtk, di bawah batas 60 dtk
const MAKS_PER_PUTARAN = 400;    // baris yang diambil per putaran
const PEKERJA = 3;               // pembukaan tautan pendek serentak
const JEDA_MS = 300;             // jeda tiap pekerja antar permintaan (laju ±7/dtk)
const BATAS_AMBIL_MS = 8_000;    // batas waktu satu permintaan ke Google
const JEDA_PUTARAN_MS = 30_000; // pemanggilan berulang dalam jangka ini diabaikan
const ULANG_BELUM_DICEK = "30 minutes";

const huruf = (v: unknown) => String(v == null ? "" : v).trim();
const galat = (e: unknown) => ({ sukses: false, pesan: e instanceof Error ? e.message : String(e) });
const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));
const literalAngkaTeks = (a: (number | null)[]) => literalArrayTeks(a.map((x) => (x == null ? "" : String(x))));

// Fungsi pengambil dapat diganti uji lewat globalThis.__ujiFetch (tidak ada jalur di produksi yang mengisinya).
/** Pengambil dengan batas waktu per permintaan (ms). Google yang menggantung tidak boleh menahan putaran/penyimpanan (hasilnya BELUM_DICEK, bukan salah). */
export const ambilJaringanDengan = (ms: number): FungsiAmbil => (url, init) => {
  const f = (globalThis as unknown as { __ujiFetch?: FungsiAmbil }).__ujiFetch;
  return f ? f(url, init) : (fetch(url, { ...init, signal: AbortSignal.timeout(ms) }) as unknown as ReturnType<FungsiAmbil>);
};
const ambilJaringan: FungsiAmbil = ambilJaringanDengan(BATAS_AMBIL_MS);

interface Antrean { id: number; tautan: string }

/** Menilai satu putaran. Mengembalikan jumlah yang dinilai. Dipakai penyapu dan uji. */
export async function putaranCekKoordinat(anggaranMs = ANGGARAN_MS): Promise<{ diambil: number; dinilai: number; tertunda: number; dibuka: number; belumDicek: number }> {
  const mulai = Date.now();
  const rows = await sql`
    select p.id, coalesce(p.link_koordinat_lokasi, '') as tautan
    from penerima p left join cek_koordinat c on c.penerima_id = p.id and c.tahun = p.tahun
    where p.tahun = ${TAHUN_AKTIF} and p.layanan = ${LAYANAN_CEK}
      and (c.penerima_id is null or c.tautan is distinct from coalesce(p.link_koordinat_lokasi, '')
           or (c.hasil = 'BELUM_DICEK' and c.dicek_pada < now() - ${ULANG_BELUM_DICEK}::interval))
    order by (c.penerima_id is null) desc, p.id
    limit ${MAKS_PER_PUTARAN}`;
  const antre: Antrean[] = (rows as Baris[]).map((r) => ({ id: Number(r.id), tautan: huruf(r.tautan) }));
  if (antre.length === 0) return { diambil: 0, dinilai: 0, tertunda: 0, dibuka: 0, belumDicek: 0 };

  // kelompokkan menurut tautan (banyak penerima memakai tautan yang sama)
  const kelompok = new Map<string, number[]>();
  for (const a of antre) { const l = kelompok.get(a.tautan) || []; l.push(a.id); kelompok.set(a.tautan, l); }

  // hasil yang sudah ada untuk tautan yang sama (tautan pendek tidak dibuka dua kali)
  const hasil = new Map<string, Penilaian & { tujuan: string }>();
  const pendek: string[] = [];
  for (const t of kelompok.keys()) {
    if (adalahTautanPendek(t)) pendek.push(t);
    else hasil.set(t, { ...nilaiTautan(t), tujuan: "" });
  }
  let dibuka = 0;
  if (pendek.length > 0) {
    const ada = await sql`
      select distinct on (tautan) tautan, hasil, alasan, tujuan, lat, lng from cek_koordinat
      where tautan = any(${literalArrayTeks(pendek)}::text[]) and hasil <> 'BELUM_DICEK'
      order by tautan, dicek_pada desc`;
    for (const r of ada as Baris[]) {
      hasil.set(huruf(r.tautan), { hasil: huruf(r.hasil) as Penilaian["hasil"], alasan: huruf(r.alasan), tujuan: huruf(r.tujuan), lat: r.lat == null ? null : Number(r.lat), lng: r.lng == null ? null : Number(r.lng) });
    }
    const buka = pendek.filter((t) => !hasil.has(t));
    let i = 0;
    const kerja = async () => {
      while (true) {
        if (Date.now() - mulai > anggaranMs) return;
        const t = buka[i++];
        if (t === undefined) return;
        const p = await periksaTautan(t, ambilJaringan);
        hasil.set(t, p); dibuka++;
        await tidur(JEDA_MS);
      }
    };
    await Promise.all(Array.from({ length: PEKERJA }, kerja));
  }

  // simpan (hanya yang sudah bernilai); tautan yang belum sempat dibuka tetap di antrean putaran berikutnya
  const idArr: number[] = [], tautanArr: string[] = [], hasilArr: string[] = [], alasanArr: string[] = [], tujuanArr: string[] = [], latArr: (number | null)[] = [], lngArr: (number | null)[] = [];
  let belumDicek = 0, tertunda = 0;
  for (const [t, ids] of kelompok) {
    const p = hasil.get(t);
    if (!p) { tertunda += ids.length; continue; }
    if (p.hasil === "BELUM_DICEK") belumDicek += ids.length;
    for (const id of ids) {
      idArr.push(id); tautanArr.push(t); hasilArr.push(p.hasil); alasanArr.push(p.alasan); tujuanArr.push(huruf(p.tujuan).slice(0, 600)); latArr.push(p.lat); lngArr.push(p.lng);
    }
  }
  if (idArr.length > 0) {
    await sql`
      insert into cek_koordinat (penerima_id, tahun, tautan, hasil, alasan, tujuan, lat, lng, dicek_pada)
      select x.id::bigint, ${TAHUN_AKTIF}::int, x.tautan, x.hasil, x.alasan, x.tujuan, nullif(x.lat, '')::double precision, nullif(x.lng, '')::double precision, now()
      from unnest(${literalArrayTeks(idArr.map(String))}::text[], ${literalArrayTeks(tautanArr)}::text[], ${literalArrayTeks(hasilArr)}::text[], ${literalArrayTeks(alasanArr)}::text[],
                  ${literalArrayTeks(tujuanArr)}::text[], ${literalAngkaTeks(latArr)}::text[], ${literalAngkaTeks(lngArr)}::text[]) as x(id, tautan, hasil, alasan, tujuan, lat, lng)
      on conflict (penerima_id, tahun) do update set tautan = excluded.tautan, hasil = excluded.hasil, alasan = excluded.alasan, tujuan = excluded.tujuan, lat = excluded.lat, lng = excluded.lng, dicek_pada = excluded.dicek_pada`;
  }
  return { diambil: antre.length, dinilai: idArr.length, tertunda, dibuka, belumDicek };
}

let terakhirOtomatis = 0;
/** Jalur _secret (pg_cron tiap 5 menit). Dapat dipanggil kapan pun; dibatasi 1x/30 dtk per isolate. */
export async function jalankanCekKoordinatOtomatis() {
  try {
    const sekarang = Date.now();
    if (sekarang - terakhirOtomatis < JEDA_PUTARAN_MS) return { sukses: true, dilewati: "Baru saja dijalankan." };
    terakhirOtomatis = sekarang;
    const r = await putaranCekKoordinat();
    return { sukses: true, ...r };
  } catch (e) {
    console.error("jalankanCekKoordinatOtomatis gagal:", e);
    return galat(e);
  }
}

/**
 * Penanda koordinat untuk layar (Admin Utama dan Verifikator): id data Guru Maghrib Mengaji dikelompokkan menurut hasil.
 * Hasil yang tautannya sudah berbeda dari tautan data sekarang dianggap BELUM_DICEK (basi). Tanpa data pribadi: hanya id dan kode alasan.
 */
export async function getPenandaKoordinat(token: string) {
  try {
    const sesi = await wajibSesi(token);
    const role = huruf(sesi.role).toUpperCase();
    if (role !== "UTAMA" && role !== "VERIFIKATOR") return { sukses: false, pesan: "Fitur ini khusus Admin Utama dan Verifikator." };
    const rows = await sql`
      select p.id, c.hasil, c.alasan
      from penerima p left join cek_koordinat c on c.penerima_id = p.id and c.tahun = p.tahun and c.tautan = coalesce(p.link_koordinat_lokasi, '')
      where p.tahun = ${TAHUN_AKTIF} and p.layanan = ${LAYANAN_CEK}`;
    const v: number[] = [], b: number[] = [], x: Record<string, string> = {};
    for (const r of rows as Baris[]) {
      const id = Number(r.id), h = huruf(r.hasil);
      if (h === "VALID") v.push(id);
      else if (h === "TIDAK_VALID") x[String(id)] = huruf(r.alasan);
      else b.push(id);
    }
    return { sukses: true, v, b, x, teks: ALASAN, jumlah: { valid: v.length, tidakValid: Object.keys(x).length, belumDicek: b.length } };
  } catch (e) {
    return galat(e);
  }
}
