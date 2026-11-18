import { sql } from "../_shared/db.ts";
import { wajibSesi } from "../_shared/sesi.ts";
import { TAHUN_AKTIF } from "../_shared/config.ts";
import { formatTanggalWaktuWIB } from "../_shared/tanggal.ts";
import { muatExcelJS, terapkanBorderData, terapkanGayaBarisTotal, terapkanGayaHeaderKolom, terapkanMergeLabel } from "../_shared/excelGaya.ts";
import {
  type AkunVerif,
  bangunKonfig,
  hariIniWib,
  gabungkan,
  type Kejadian,
  type KejadianUlang,
  susunAgregat,
  susunUlang,
  tafsirRentang,
  tentukanCakupan,
} from "../_shared/agregatInti.ts";

// Agregat hasil kerja verifikator (plans/plan-agregat-verifikator.md). Seluruh aksi di sini HANYA MEMBACA.
//
// Yang dihitung: pemberian hasil verifikasi PERTAMA oleh akun ber-role VERIFIKATOR (riwayat_verifikasi.sumber = 'SATU' dan status
// sebelumnya "Proses Verifikasi"/kosong), satu per data per verifikator (D2). Perbaikan, pemeriksaan ulang, verifikasi massal, dan
// penurunan otomatis tidak dihitung. VERIFIKASI ULANG (T6) dihitung TERPISAH dari tabel tugas_verifikasi_ulang (1 kali per data per
// pemeriksa) dengan aturan jam kerja yang sama, lalu dijumlahkan menjadi TOTAL PEKERJAAN. Cakupan (sendiri / tim / semua) ditentukan SERVER dari peran sesi dan tabel tim_verifikator.

/** Awal pencatatan riwayat (tabel riwayat_verifikasi diterapkan 2026-11-12); ditampilkan di layar sebagai catatan. */
const MULAI_DIHITUNG = "2026-11-12";

// Daftar teks -> literal array Postgres ('{"a","b"}') yang dikirim sebagai SATU parameter lalu di-cast ::text[] (pola yang sama dengan
// master.ts dan templatAlasan.ts; JS array teks langsung tidak dipakai karena perilaku postgres.js untuk larik teks tidak seragam).
export function literalArrayTeks(daftar: string[]): string {
  return "{" + daftar.map((x) => '"' + x.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"').join(",") + "}";
}

/** Beban tugas SAAT diunduh (kumulatif, tidak mengikuti rentang tanggal). Awal: Selesai = semua data yang sudah diverifikasi verifikator (tugas sistem + di luar tugas sistem), Sisa = data pembagian sistem yang masih menunggu, Ditugaskan = Selesai + Sisa; ditutup = tugas yang datanya diverifikasi pihak lain (informasi). Ulang: Ditugaskan = Selesai + Sisa; tugas yang ditarik tidak dihitung. */
export interface BebanAwal { ditugaskan: number; selesai: number; sisa: number }
export interface BebanUlang { ditugaskan: number; selesai: number; sisa: number }
export interface BebanTugas {
  dibuatPada: string;
  awalTersedia: boolean;
  ulangTersedia: boolean;
  perOrang: Record<string, { awal: BebanAwal; ulang: BebanUlang }>;
}

interface HasilHitung {
  cakupan: "SAYA" | "TIM" | "SEMUA";
  timFokus: string | null;
  rentang: { dari: string; sampai: string; jumlahHari: number };
  hasil: ReturnType<typeof susunAgregat>;
  /** Verifikasi Ulang (terpisah) dan Total pekerjaan = Verifikasi Awal + Verifikasi Ulang. */
  ulang: ReturnType<typeof susunUlang>;
  gabungan: ReturnType<typeof gabungkan>;
  /** false bila tabel verifikasi ulang belum ada (migrasi belum diterapkan): angka verifikasi ulang 0 dan agregat lama tetap jalan. */
  ulangTersedia: boolean;
  /** Hanya diisi untuk unduhan Excel. */
  beban?: BebanTugas;
  saya: string;
}

async function hitung(token: string, dari: unknown, sampai: unknown, timDiminta: unknown, sertakanPerOrangHari: boolean, sertakanBeban = false): Promise<{ galat: string } | HasilHitung> {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { galat: e instanceof Error ? e.message : String(e) };
  }

  const peran = String(sesi.role || "").trim().toUpperCase();
  if (peran !== "UTAMA" && peran !== "VERIFIKATOR") return { galat: "Fitur ini khusus Admin Utama dan Verifikator." };

  const r = tafsirRentang(dari, sampai, hariIniWib());
  if (!r.ok) return { galat: r.pesan };

  const rowsAkun = await sql`
    select a.id, a.username, a.nama_lengkap, a.aktif, t.tim, coalesce(t.koordinator, false) as koordinator
    from akun a left join tim_verifikator t on t.akun_id = a.id
    where a.role = 'VERIFIKATOR'
    order by a.username
  `;
  const semuaAkun: AkunVerif[] = rowsAkun.map((x: Record<string, unknown>) => ({
    akunId: String(x.id), username: String(x.username), namaLengkap: String(x.nama_lengkap || ""), aktif: x.aktif !== false,
    tim: x.tim ? String(x.tim) : null, koordinator: x.koordinator === true,
  }));

  const c = tentukanCakupan(sesi.role, sesi.akunId, semuaAkun, timDiminta);
  if (!c.ok) return { galat: c.pesan };

  const rowsJam = await sql`select isodow, mulai::text as mulai, selesai::text as selesai from jam_kerja_verifikasi`;
  const rowsLibur = await sql`
    select tanggal::text as tanggal from hari_libur_verifikasi
    where tanggal >= ${r.rentang.dari}::date and tanggal <= ${r.rentang.sampai}::date
  `;
  const konfig = bangunKonfig(rowsJam);
  const libur = new Set<string>(rowsLibur.map((x: Record<string, unknown>) => String(x.tanggal)));

  // Admin Utama: riwayat SEMUA verifikator dibaca walau tabel disaring ke satu tim, karena kartu per tim memakai semuanya.
  const dasarKejadian = c.cakupan === "SEMUA" ? semuaAkun : c.anggota;
  const usernames = dasarKejadian.map((a) => a.username.toUpperCase());
  let kejadian: Kejadian[] = [];
  if (usernames.length > 0) {
    const rowsKej = await sql`
      select oleh, waktu, status_baru, status_sekarang from (
        select distinct on (r.penerima_id, r.oleh) r.penerima_id, r.oleh, r.waktu, r.status_baru, p.status_verifikasi as status_sekarang
        from riwayat_verifikasi r
        left join penerima p on p.id = r.penerima_id and p.tahun = r.tahun
        where r.sumber = 'SATU' and r.tahun = ${TAHUN_AKTIF}
          and r.oleh = any(${literalArrayTeks(usernames)}::text[])
          and coalesce(nullif(trim(r.status_lama), ''), 'Proses Verifikasi') = 'Proses Verifikasi'
        order by r.penerima_id, r.oleh, r.waktu
      ) x
      where waktu >= ${r.rentang.awalUtc} and waktu < ${r.rentang.akhirUtcEksklusif}
    `;
    kejadian = rowsKej.map((x: Record<string, unknown>) => ({ oleh: String(x.oleh), waktu: new Date(x.waktu as string), statusBaru: String(x.status_baru || ""), statusSekarang: x.status_sekarang == null ? null : String(x.status_sekarang) }));
  }

  // Hanya Admin Utama: pekerjaan Admin Utama sendiri sebagai informasi terpisah (tidak masuk angka tim).
  let luarTim: { waktu: Date }[] = [];
  if (c.cakupan === "SEMUA") {
    const rowsAdm = await sql`
      select waktu from riwayat_verifikasi
      where sumber in ('SATU', 'DIPERBAIKI') and tahun = ${TAHUN_AKTIF}
        and oleh in (select upper(username) from akun where role = 'UTAMA')
        and waktu >= ${r.rentang.awalUtc} and waktu < ${r.rentang.akhirUtcEksklusif}
    `;
    luarTim = rowsAdm.map((x: Record<string, unknown>) => ({ waktu: new Date(x.waktu as string) }));
  }

  // Verifikasi Ulang: satu kejadian per (data, pemeriksa) dari tugas yang SELESAI; sisa tugas aktif per orang (angka saja, tanpa data pribadi).
  // Tahan terhadap migrasi yang belum diterapkan: gagal -> angka 0, agregat Verifikasi Awal tetap tampil.
  let kejadianUlang: KejadianUlang[] = [];
  const sisaUlang: Record<string, number> = {};
  let ulangTersedia = true;
  if (usernames.length > 0) {
    try {
      const rowsUlang = await sql`
        select oleh, waktu, hasil from (
          select distinct on (t.penerima_id, t.akun_id) upper(a.username) as oleh, t.selesai_pada as waktu, t.hasil
          from tugas_verifikasi_ulang t join akun a on a.id = t.akun_id
          where t.tahun = ${TAHUN_AKTIF} and t.selesai_pada is not null and t.hasil is not null
            and upper(a.username) = any(${literalArrayTeks(usernames)}::text[])
          order by t.penerima_id, t.akun_id, t.selesai_pada
        ) x
        where waktu >= ${r.rentang.awalUtc} and waktu < ${r.rentang.akhirUtcEksklusif}
      `;
      kejadianUlang = rowsUlang.map((x: Record<string, unknown>) => ({ oleh: String(x.oleh), waktu: new Date(x.waktu as string), hasil: String(x.hasil || "") }));
      const rowsSisa = await sql`
        select upper(a.username) as oleh, count(*)::int as sisa
        from tugas_verifikasi_ulang t join akun a on a.id = t.akun_id join batch_verifikasi_ulang b on b.id = t.batch_id
        where t.tahun = ${TAHUN_AKTIF} and t.selesai_pada is null and t.ditarik_pada is null and b.status = 'AKTIF'
          and upper(a.username) = any(${literalArrayTeks(usernames)}::text[])
        group by 1
      `;
      for (const x of rowsSisa as Record<string, unknown>[]) sisaUlang[String(x.oleh)] = Number(x.sisa) || 0;
    } catch (e) {
      ulangTersedia = false; kejadianUlang = [];
      console.error("agregat: data verifikasi ulang tidak tersedia (migrasi belum diterapkan?):", e instanceof Error ? e.message : e);
    }
  }

  // Beban tugas (hanya unduhan Excel): berapa tugas yang dibagikan ke tiap verifikator dan berapa yang sudah selesai, SAAT diunduh. Hanya membaca; gagal -> kolom bertanda tidak tersedia.
  let beban: BebanTugas | undefined;
  if (sertakanBeban) {
    beban = { dibuatPada: formatTanggalWaktuWIB(new Date()), awalTersedia: true, ulangTersedia: true, perOrang: {} };
    const kosongAwal = (): BebanAwal => ({ ditugaskan: 0, selesai: 0, sisa: 0 });
    const kosongUlang = (): BebanUlang => ({ ditugaskan: 0, selesai: 0, sisa: 0 });
    for (const u of usernames) beban.perOrang[u] = { awal: kosongAwal(), ulang: kosongUlang() };
    if (usernames.length > 0) {
      try {
        // Verifikasi Awal: aturan 'sisa' SAMA dengan yang dilihat verifikator (tugas aktif yang datanya masih menunggu); tugas yang datanya sudah diverifikasi pihak lain (ditutup/belum disapu) tidak dihitung.
        const rowsAwal = await sql`
          select upper(a.username) as oleh,
            count(*) filter (where t.status = 'SELESAI')::int as selesai,
            count(*) filter (where t.status = 'AKTIF' and p.id is not null and (p.status_verifikasi in ('Proses Verifikasi', '') or p.status_verifikasi is null))::int as sisa
          from tugas_verifikasi_awal t join akun a on a.id = t.akun_id left join penerima p on p.id = t.penerima_id and p.tahun = t.tahun
          where t.tahun = ${TAHUN_AKTIF} and upper(a.username) = any(${literalArrayTeks(usernames)}::text[])
          group by 1`;
        for (const x of rowsAwal as Record<string, unknown>[]) {
          const o = beban.perOrang[String(x.oleh)]; if (!o) continue;
          const sel = Number(x.selesai) || 0, sis = Number(x.sisa) || 0;
          o.awal = { ditugaskan: sel + sis, selesai: sel, sisa: sis };
        }
        // Selesai = SEMUA data yang sudah diverifikasi verifikator ini (tugas sistem + yang dikerjakan di luar tugas sistem, mis. diambil sendiri sebelum pembagian otomatis berjalan). Aturan kejadian sama dengan Rekap (hasil pertama, 1 kali per data), tetapi kumulatif (tanpa rentang tanggal). Ditugaskan = Selesai + Sisa.
        const rowsLuar = await sql`
          select k.oleh, count(*)::int as luar from (
            select distinct on (r.penerima_id, r.oleh) r.penerima_id, r.oleh, r.tahun
            from riwayat_verifikasi r
            where r.sumber = 'SATU' and r.tahun = ${TAHUN_AKTIF} and r.oleh = any(${literalArrayTeks(usernames)}::text[])
              and coalesce(nullif(trim(r.status_lama), ''), 'Proses Verifikasi') = 'Proses Verifikasi'
            order by r.penerima_id, r.oleh, r.waktu) k
          where not exists (select 1 from tugas_verifikasi_awal t join akun a on a.id = t.akun_id
            where t.penerima_id = k.penerima_id and t.tahun = k.tahun and upper(a.username) = k.oleh and t.status = 'SELESAI')
          group by 1`;
        for (const x of rowsLuar as Record<string, unknown>[]) {
          const o = beban.perOrang[String(x.oleh).toUpperCase()]; if (!o) continue;
          const luar = Number(x.luar) || 0; o.awal.selesai += luar; o.awal.ditugaskan += luar;
        }
      } catch (e) {
        beban.awalTersedia = false;
        console.error("agregat: beban tugas verifikasi awal tidak tersedia:", e instanceof Error ? e.message : e);
      }
      try {
        const rowsBebanUlang = await sql`
          select upper(a.username) as oleh,
            count(*) filter (where t.selesai_pada is not null)::int as selesai,
            count(*) filter (where t.selesai_pada is null and t.ditarik_pada is null and b.status = 'AKTIF')::int as sisa
          from tugas_verifikasi_ulang t join akun a on a.id = t.akun_id left join batch_verifikasi_ulang b on b.id = t.batch_id
          where t.tahun = ${TAHUN_AKTIF} and upper(a.username) = any(${literalArrayTeks(usernames)}::text[])
          group by 1`;
        for (const x of rowsBebanUlang as Record<string, unknown>[]) {
          const o = beban.perOrang[String(x.oleh)]; if (!o) continue;
          const sel = Number(x.selesai) || 0, sis = Number(x.sisa) || 0;
          o.ulang = { ditugaskan: sel + sis, selesai: sel, sisa: sis };
        }
      } catch (e) {
        beban.ulangTersedia = false;
        console.error("agregat: beban tugas verifikasi ulang tidak tersedia:", e instanceof Error ? e.message : e);
      }
    }
  }

  const semuaAnggotaCakupan = c.cakupan === "SEMUA" ? semuaAkun : undefined;
  const hasil = susunAgregat({ cakupan: c.cakupan, anggota: c.anggota, semuaAnggota: semuaAnggotaCakupan, kejadian, rentang: r.rentang, konfig, libur, luarTim, sertakanPerOrangHari });
  const ulang = susunUlang({ cakupan: c.cakupan, anggota: c.anggota, semuaAnggota: semuaAnggotaCakupan, kejadian: kejadianUlang, sisa: sisaUlang, rentang: r.rentang, konfig, libur, sertakanPerOrangHari });
  const gabungan = gabungkan(hasil, ulang);
  return {
    cakupan: c.cakupan, timFokus: c.timFokus,
    rentang: { dari: r.rentang.dari, sampai: r.rentang.sampai, jumlahHari: r.rentang.jumlahHari },
    hasil, ulang, gabungan, ulangTersedia, saya: String(sesi.username || "").toUpperCase(), beban,
  };
}

/** Dipakai uji (pola sama dengan pembagianUlangExcel.ambilDataPembagian): angka sebenarnya dari SQL tanpa membuat berkas Excel. */
export { hitung as hitungAgregat };

/** getAgregatVerifikasi(token, dari, sampai, tim): dari/sampai "yyyy-mm-dd" (WIB, inklusif; kosong = bulan ini); tim hanya dipakai Admin Utama. */
export async function getAgregatVerifikasi(token: string, dari?: string, sampai?: string, tim?: string) {
  try {
    const h = await hitung(token, dari, sampai, tim, false);
    if ("galat" in h) return { sukses: false, pesan: h.galat };
    return {
      sukses: true,
      cakupan: h.cakupan,
      tim: h.timFokus,
      saya: h.saya,
      rentang: h.rentang,
      ringkasan: h.hasil.ringkasan,
      perOrang: h.hasil.perOrang,
      perTim: h.hasil.perTim,
      perHari: h.hasil.perHari,
      luarTim: h.hasil.luarTim,
      // verifikasi ulang (terpisah) dan total pekerjaan; kunci di atas tidak berubah (verifikasi awal)
      ulangTersedia: h.ulangTersedia,
      ulang: { ringkasan: h.ulang.ringkasan, perOrang: h.ulang.perOrang, perTim: h.ulang.perTim, perHari: h.ulang.perHari },
      gabungan: { ringkasan: h.gabungan.ringkasan, perOrang: h.gabungan.perOrang, perTim: h.gabungan.perTim, perHari: h.gabungan.perHari },
      mulaiDihitung: MULAI_DIHITUNG,
      diperbaruiPada: new Date().toISOString(),
    };
  } catch (error) {
    return { sukses: false, pesan: error instanceof Error ? error.message : String(error) };
  }
}

// ------------------------------------------------------------------ Unduh Excel

const TEKS_ATURAN = "Jam kerja (WIB): Senin-Kamis 08.00-16.30, Jumat 08.00-17.00. Sabtu, Minggu, dan tanggal merah dihitung luar jam kerja. "
  + "Total pekerjaan = Verifikasi Awal (pemberian hasil pertama oleh verifikator, 1 kali per data) + Verifikasi Ulang (1 kali per data per petugas, waktu server saat hasil disimpan). Perbaikan oleh Admin Utama tidak dihitung.";

const URUTAN_TIM = ["I", "II", "III", "IV"];
function peringkatTim(tim: string | null): number { const k = URUTAN_TIM.indexOf(String(tim || "")); return k < 0 ? 99 : k; }

/** Urutan untuk Excel: per TIM (I, II, III, IV, tanpa tim), koordinator lebih dulu, lalu username. */
export function urutkanPerTim<T extends { tim: string | null; koordinator?: boolean; username: string }>(daftar: T[]): T[] {
  return [...daftar].sort((a, b) =>
    peringkatTim(a.tim) - peringkatTim(b.tim) ||
    Number(!!b.koordinator) - Number(!!a.koordinator) ||
    a.username.localeCompare(b.username));
}

const labelTim = (tim: string | null) => tim ? "Tim " + tim : "Tanpa tim";
const namaTampil = (n: string | undefined) => (n && n.trim()) ? n : "(belum mengisi profil)";

// deno-lint-ignore no-explicit-any
export function susunBukuRekap(ExcelJS: any, h: HasilHitung, namaPembuat: string) {
  const wb = new ExcelJS.Workbook();
  const judulCakupan = h.cakupan === "SAYA" ? "Hasil Kerja Saya" : h.cakupan === "TIM" ? `Hasil Tim ${h.timFokus}` : (h.timFokus ? `Agregat Tim ${h.timFokus}` : "Agregat Semua Tim");
  const rentangTeks = `${h.rentang.dari} s/d ${h.rentang.sampai}`;
  const urut = urutkanPerTim(h.hasil.perOrang);
  const kolom = 20;
  const nolU = { total: 0, jamKerja: 0, luarJamKerja: 0, sesuai: 0, dikoreksi: 0, sisa: 0 };
  const ulangOrang = new Map((h.ulang?.perOrang ?? []).map((u) => [u.username.toUpperCase(), u]));
  const ulangDari = (username: string) => ulangOrang.get(username.toUpperCase()) ?? nolU;
  type Nilai = { total: number; jamKerja: number; luarJamKerja: number; memenuhiSyarat: number; berkasTidakLengkap: number; tidakMemenuhiSyarat: number; dikoreksi?: number };
  // Kolom angka: pertama (jam kerja, luar, total) | ulang (jam kerja, luar, total, sesuai, dikoreksi) | TOTAL PEKERJAAN (jam kerja, luar, total) | status hasil pertama | dikoreksi (informasi)
  const angka = (p: Nilai, u: typeof nolU): number[] => [
    p.jamKerja, p.luarJamKerja, p.total,
    u.jamKerja, u.luarJamKerja, u.total, u.sesuai, u.dikoreksi,
    p.jamKerja + u.jamKerja, p.luarJamKerja + u.luarJamKerja, p.total + u.total,
    p.memenuhiSyarat, p.berkasTidakLengkap, p.tidakMemenuhiSyarat, p.dikoreksi ?? 0,
  ];
  const jumlahKolom = (baris: number[][]) => (baris[0] ?? new Array(15).fill(0)).map((_, i) => baris.reduce((s, b) => s + b[i], 0));
  // Beban tugas per orang: [awal ditugaskan, selesai, sisa, ulang ditugaskan, selesai, sisa]. Ditugaskan = Selesai + Sisa; % Selesai = Selesai / Ditugaskan; '-' bila belum ada tugas.
  const nolB = [0, 0, 0, 0, 0, 0];
  const bebanHitungan = (username: string): number[] => {
    const b = h.beban?.perOrang[username.toUpperCase()];
    return b ? [b.awal.ditugaskan, b.awal.selesai, b.awal.sisa, b.ulang.ditugaskan, b.ulang.selesai, b.ulang.sisa] : nolB;
  };
  const persen = (selesai: number, ditugaskan: number): number | string => ditugaskan > 0 ? selesai / ditugaskan : "-";
  const bebanBaris = (c: number[]): (number | string)[] => [c[0], c[1], c[2], persen(c[1], c[0]), c[3], c[4], c[5], persen(c[4], c[3])];
  const jumlahB = (daftar: number[][]) => nolB.map((_, i) => daftar.reduce((s, x) => s + x[i], 0));

  // Sheet 1: rekap per orang, DIURUTKAN per tim (Admin Utama: dengan subtotal tiap tim)
  const ws = wb.addWorksheet("Rekap");
  ws.addRow([`Rekap Hasil Kerja Verifikator - ${judulCakupan}`]);
  ws.addRow([`Periode: ${rentangTeks} (WIB)`]);
  ws.addRow([TEKS_ATURAN]);
  ws.addRow([]);
  // Dua baris judul: baris 5 = kelompok (sel digabung), baris 6 = nama kolom.
  const barisKelompok = 5;
  const barisHeader = 6;
  ws.addRow(["", "", "", "", "", "VERIFIKASI AWAL", "", "", "VERIFIKASI ULANG", "", "", "", "", "TOTAL PEKERJAAN (AWAL + ULANG)", "", "", "HASIL VERIFIKASI AWAL", "", "", "INFORMASI"]);
  ws.addRow(["No", "Tim", "Username", "Nama Lengkap", "Peran",
    "Jam Kerja", "Luar Jam Kerja", "Total",
    "Jam Kerja", "Luar Jam Kerja", "Total", "Sesuai", "Dikoreksi",
    "Jam Kerja", "Luar Jam Kerja (Lembur)", "Total",
    "Memenuhi Syarat", "Berkas Tidak Lengkap", "Tidak Memenuhi Syarat", "Dikoreksi (per tanggal unduh)"]);
  let baris = barisHeader;
  let no = 0;
  const barisSubtotal: number[] = [];
  const kelompok = new Map<string, typeof urut>();
  for (const o of urut) { const k = o.tim || "-"; if (!kelompok.has(k)) kelompok.set(k, []); kelompok.get(k)!.push(o); }
  for (const [k, anggota] of kelompok) {
    const nilaiAnggota: number[][] = [];
    for (const o of anggota) {
      no++; baris++;
      const a = angka(o, ulangDari(o.username));
      nilaiAnggota.push(a);
      ws.addRow([no, labelTim(o.tim), o.username, namaTampil(o.namaLengkap), o.koordinator ? "Koordinator" : "Anggota", ...a]);
    }
    if (h.cakupan === "SEMUA") {
      baris++; barisSubtotal.push(baris);
      ws.addRow(["", "Subtotal " + labelTim(k === "-" ? null : k), "", "", `${anggota.length} orang`, ...jumlahKolom(nilaiAnggota)]);
    }
  }
  const r = h.hasil.ringkasan;
  baris++;
  ws.addRow(["", "TOTAL", "", "", `${urut.length} orang`, ...angka(r, h.ulang?.ringkasan ?? nolU)]);
  const barisTotal = baris;
  if (h.cakupan === "SEMUA" && h.hasil.luarTim) {
    const a = h.hasil.luarTim;
    ws.addRow([]);
    ws.addRow([`Informasi (tidak masuk total di atas): pekerjaan Admin Utama pada periode ini = ${a.total} (jam kerja ${a.jamKerja}, luar jam kerja ${a.luarJamKerja}).`]);
  }
  ws.getRow(1).font = { bold: true, size: 13 };
  terapkanGayaHeaderKolom(ws, barisKelompok, kolom);
  for (const [a, b] of [[6, 8], [9, 13], [14, 16], [17, 19]]) terapkanMergeLabel(ws, barisKelompok, a, b);
  terapkanGayaHeaderKolom(ws, barisHeader, kolom);
  terapkanBorderData(ws, barisHeader + 1, barisTotal, kolom);
  for (const b of barisSubtotal) ws.getRow(b).font = { bold: true };
  terapkanGayaBarisTotal(ws, barisTotal, kolom);
  [6, 12, 28, 30, 13, 12, 14, 12, 12, 14, 12, 12, 14, 14, 20, 14, 16, 18, 20, 22].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: "frozen", ySplit: barisHeader }];

  // Sheet 1b: BEBAN TUGAS per verifikator (hanya unduhan Excel). Sheet tersendiri agar Rekap tidak melebar dan mudah dibaca pimpinan.
  if (h.beban) {
    const wb2 = wb.addWorksheet("Beban Tugas");
    wb2.addRow([`Beban Tugas Verifikasi - ${judulCakupan}`]);
    wb2.addRow([`Dihitung per ${h.beban.dibuatPada} WIB (saat file diunduh). Kumulatif dan TIDAK mengikuti periode laporan di sheet Rekap.`]);
    wb2.addRow(["Verifikasi Awal: Selesai = semua data yang sudah diverifikasi verifikator (termasuk yang dikerjakan di luar tugas sistem); Sisa = data pembagian sistem yang masih menunggu; Ditugaskan = Selesai + Sisa (bertambah saat sistem membagi data baru). % Selesai = Selesai / Ditugaskan. Data yang diverifikasi pihak lain sebelum dikerjakan verifikator tidak dihitung. Penjelasan lengkap di sheet Aturan."]);
    wb2.addRow([]);
    wb2.addRow(["", "", "", "", "", "VERIFIKASI AWAL", "", "", "", "VERIFIKASI ULANG", "", "", ""]);
    wb2.addRow(["No", "Tim", "Username", "Nama Lengkap", "Peran", "Ditugaskan", "Selesai", "Sisa", "% Selesai", "Ditugaskan", "Selesai", "Sisa", "% Selesai"]);
    const kolomB = 13, barisKelompokB = 5, barisHeaderB = 6;
    let nomorB = 0, barisB = barisHeaderB;
    const barisSubtotalB: number[] = [];
    const semuaB: number[][] = [];
    for (const [k, anggota] of kelompok) {
      const jumlahTim: number[][] = [];
      for (const o of anggota) {
        nomorB++; barisB++;
        const b = bebanHitungan(o.username);
        jumlahTim.push(b); semuaB.push(b);
        wb2.addRow([nomorB, labelTim(o.tim), o.username, namaTampil(o.namaLengkap), o.koordinator ? "Koordinator" : "Anggota", ...bebanBaris(b)]);
      }
      if (h.cakupan === "SEMUA") {
        barisB++; barisSubtotalB.push(barisB);
        wb2.addRow(["", "Subtotal " + labelTim(k === "-" ? null : k), "", "", `${anggota.length} orang`, ...bebanBaris(jumlahB(jumlahTim))]);
      }
    }
    barisB++;
    wb2.addRow(["", "TOTAL", "", "", `${urut.length} orang`, ...bebanBaris(jumlahB(semuaB))]);
    const barisTotalB = barisB;
    wb2.getRow(1).font = { bold: true, size: 13 };
    terapkanGayaHeaderKolom(wb2, barisKelompokB, kolomB);
    terapkanMergeLabel(wb2, barisKelompokB, 6, 9); terapkanMergeLabel(wb2, barisKelompokB, 10, 13);
    terapkanGayaHeaderKolom(wb2, barisHeaderB, kolomB);
    terapkanBorderData(wb2, barisHeaderB + 1, barisTotalB, kolomB);
    for (const b of barisSubtotalB) wb2.getRow(b).font = { bold: true };
    terapkanGayaBarisTotal(wb2, barisTotalB, kolomB);
    for (let br = barisHeaderB + 1; br <= barisTotalB; br++) for (const kc of [9, 13]) wb2.getCell(br, kc).numFmt = "0%";
    [6, 12, 28, 30, 13, 13, 11, 11, 12, 13, 11, 11, 12].forEach((w, i) => { wb2.getColumn(i + 1).width = w; });
    wb2.getRow(barisKelompokB).height = 24;
    wb2.getRow(barisHeaderB).height = 32;   // tinggi tetap: judul tidak bergantung pada hitung-otomatis tinggi baris milik aplikasi Excel
    wb2.views = [{ state: "frozen", ySplit: barisHeaderB }];
  }

  // Sheet 2: per orang per hari (dasar lembur), diurutkan per tim -> orang -> tanggal. Verifikasi Awal dan Verifikasi Ulang dirinci terpisah.
  const wh = wb.addWorksheet("Per Hari");
  wh.addRow([`Rincian per hari - ${judulCakupan}`]);
  wh.addRow([`Periode: ${rentangTeks} (WIB)`]);
  wh.addRow([]);
  wh.addRow(["Tim", "Username", "Nama Lengkap", "Tanggal", "Hari", "Keterangan", "Awal: Jam Kerja", "Awal: Luar Jam Kerja", "Ulang: Jam Kerja", "Ulang: Luar Jam Kerja", "TOTAL: Jam Kerja", "TOTAL: Luar Jam Kerja (Lembur)", "TOTAL: Data"]);
  const info = new Map(h.hasil.perHari.map((x) => [x.tanggal, x]));
  const orang = new Map(h.hasil.perOrang.map((o) => [o.username.toUpperCase(), o]));
  const tanpaData = { tim: null as string | null, koordinator: false };
  const sumberHari = h.gabungan?.perOrangHari
    ?? (h.hasil.perOrangHari ?? []).map((x) => ({ username: x.username, tanggal: x.tanggal, pertamaJam: x.jamKerja, pertamaLuar: x.luarJamKerja, ulangJam: 0, ulangLuar: 0 }));
  const perOrangHari = [...sumberHari].sort((a, b) => {
    const oa = orang.get(a.username.toUpperCase()) ?? { ...tanpaData, username: a.username };
    const ob = orang.get(b.username.toUpperCase()) ?? { ...tanpaData, username: b.username };
    return peringkatTim(oa.tim) - peringkatTim(ob.tim) || Number(!!ob.koordinator) - Number(!!oa.koordinator) || a.username.localeCompare(b.username) || a.tanggal.localeCompare(b.tanggal);
  });
  for (const x of perOrangHari) {
    const hh = info.get(x.tanggal);
    const o = orang.get(x.username.toUpperCase());
    const jam = x.pertamaJam + x.ulangJam, luar = x.pertamaLuar + x.ulangLuar;
    wh.addRow([labelTim(o?.tim ?? null), x.username, namaTampil(o?.namaLengkap), x.tanggal, hh?.hari ?? "", hh?.libur ? "Sabtu/Minggu/tanggal merah (seharian luar jam kerja)" : "", x.pertamaJam, x.pertamaLuar, x.ulangJam, x.ulangLuar, jam, luar, jam + luar]);
  }
  const barisAkhirHari = 4 + perOrangHari.length;
  wh.getRow(1).font = { bold: true, size: 13 };
  terapkanGayaHeaderKolom(wh, 4, 13);
  if (barisAkhirHari >= 5) terapkanBorderData(wh, 5, barisAkhirHari, 13);
  [11, 28, 30, 12, 10, 48, 13, 14, 12, 14, 14, 20, 12].forEach((w, i) => { wh.getColumn(i + 1).width = w; });
  wh.views = [{ state: "frozen", ySplit: 4 }];

  // Sheet 3: aturan
  const wa = wb.addWorksheet("Aturan");
  wa.addRow(["Aturan perhitungan"]);
  wa.getRow(1).font = { bold: true };
  [TEKS_ATURAN, `Dihitung sejak ${MULAI_DIHITUNG} (awal pencatatan riwayat). Dibuat oleh ${namaPembuat}.`, "Urutan: per tim (I, II, III, IV, tanpa tim), koordinator lebih dulu, lalu menurut username.",
    "Verifikasi Awal dihitung dari HASIL VERIFIKATOR saat diberikan; Verifikasi Ulang dari waktu server saat hasilnya disimpan (1 kali per data per petugas). TOTAL PEKERJAAN = Awal + Ulang, jam kerja dan luar jam kerja dijumlahkan terpisah (dasar lembur).", "Kolom \"Dikoreksi\" hanya informasi: jumlah data yang statusnya SEKARANG berbeda dari hasil verifikator (diubah Admin Utama, dikoreksi saat verifikasi ulang, atau dihapus), dihitung per tanggal unduh, dan tidak memengaruhi angka lembur."].forEach((x) => wa.addRow([x]));
  if (h.beban) {
    for (const x of [
      `Sheet "Beban Tugas": dihitung per ${h.beban.dibuatPada} WIB (saat file diunduh), kumulatif sejak tugas dibagikan, dan tidak mengikuti periode laporan.`,
      "Verifikasi Awal: Selesai = semua data yang sudah diverifikasi verifikator, yaitu tugas dari sistem ditambah data yang dikerjakan di luar tugas sistem (mis. diambil sendiri sebelum pembagian otomatis berjalan). Sisa = data yang dibagikan sistem dan masih menunggu verifikator. Ditugaskan = Selesai + Sisa, jadi bertambah setiap sistem membagi data baru. Angka Selesai sama dengan Total Verifikasi Awal di sheet Rekap bila periode Rekap mencakup seluruh waktu.",
      "Data yang sempat dibagikan kepada seorang verifikator tetapi diverifikasi pihak lain (mis. akun khusus atau Admin Utama) sebelum ia mengerjakannya tidak dihitung pada Ditugaskan, Selesai, maupun Sisa verifikator itu. Sistem juga tidak menghitungnya dalam pembagian rata, sehingga verifikator tersebut mendapat data pengganti.",
      "Verifikasi Ulang: Ditugaskan = Selesai + Sisa. Selesai = hasil sudah disimpan; Sisa = masih di paket aktif. Tugas yang ditarik (paket dikosongkan atau status data berubah sebelum diperiksa) tidak dihitung.",
      "% Selesai = Selesai / Ditugaskan; tanda '-' berarti belum ada tugas yang harus dikerjakan.",
      "Catatan: pembagian otomatis berjalan sejak 16 Nov 2026; sebelumnya verifikator memilih data sendiri. Pekerjaan itu sudah termasuk dalam Selesai (dan Ditugaskan) pada Verifikasi Awal.",
      ...(h.beban.awalTersedia ? [] : ["PERHATIAN: data beban Verifikasi Awal tidak dapat dibaca saat unduh; kolomnya bernilai 0."]),
      ...(h.beban.ulangTersedia ? [] : ["PERHATIAN: data beban Verifikasi Ulang tidak dapat dibaca saat unduh; kolomnya bernilai 0."]),
    ]) wa.addRow([x]);
  }
  wa.getColumn(1).width = 120;
  return wb;
}

/** unduhRekapLemburVerifikasi(token, dari, sampai, tim): kontrak respons sama seperti eksporDataKeSpreadsheet: { sukses, base64, namaFile }. */
export async function unduhRekapLemburVerifikasi(token: string, dari?: string, sampai?: string, tim?: string) {
  try {
    const h = await hitung(token, dari, sampai, tim, true, true);
    if ("galat" in h) return { sukses: false, pesan: h.galat };
    const ExcelJS = await muatExcelJS();
    const wb = susunBukuRekap(ExcelJS, h, h.saya);
    const mentah = await wb.xlsx.writeBuffer();
    const buf: Uint8Array = mentah instanceof Uint8Array ? mentah : new Uint8Array(mentah);
    let biner = "";
    for (let i = 0; i < buf.length; i += 8192) biner += String.fromCharCode(...buf.subarray(i, i + 8192));
    const sufiks = h.cakupan === "SAYA" ? "Saya" : h.cakupan === "TIM" ? `Tim ${h.timFokus}` : (h.timFokus ? `Tim ${h.timFokus}` : "Semua Tim");
    return { sukses: true, base64: btoa(biner), namaFile: `Rekap Verifikasi ${sufiks} ${h.rentang.dari} sd ${h.rentang.sampai}.xlsx` };
  } catch (error) {
    return { sukses: false, pesan: error instanceof Error ? error.message : String(error) };
  }
}
