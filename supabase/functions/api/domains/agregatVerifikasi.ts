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

/** Beban tugas SAAT diunduh (kumulatif, tidak mengikuti rentang tanggal). Ditugaskan = Selesai + Sisa (yang benar-benar harus dikerjakan). Awal: ditutup = data sudah diverifikasi pihak lain. Ulang: ditarik = tugas ditarik (mis. paket dikosongkan atau data berubah) dan tidak dihitung. */
export interface BebanAwal { ditugaskan: number; selesai: number; sisa: number; ditutup: number }
export interface BebanUlang { ditugaskan: number; selesai: number; sisa: number; ditarik: number }
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
    const kosongAwal = (): BebanAwal => ({ ditugaskan: 0, selesai: 0, sisa: 0, ditutup: 0 });
    const kosongUlang = (): BebanUlang => ({ ditugaskan: 0, selesai: 0, sisa: 0, ditarik: 0 });
    for (const u of usernames) beban.perOrang[u] = { awal: kosongAwal(), ulang: kosongUlang() };
    if (usernames.length > 0) {
      try {
        // Verifikasi Awal: aturan 'sisa' SAMA dengan yang dilihat verifikator (tugas aktif yang datanya masih menunggu); tugas aktif yang datanya sudah diverifikasi pihak lain dihitung ditutup.
        const rowsAwal = await sql`
          select upper(a.username) as oleh,
            count(*)::int as ditugaskan,
            count(*) filter (where t.status = 'SELESAI')::int as selesai,
            count(*) filter (where t.status = 'AKTIF' and p.id is not null and (p.status_verifikasi in ('Proses Verifikasi', '') or p.status_verifikasi is null))::int as sisa
          from tugas_verifikasi_awal t join akun a on a.id = t.akun_id left join penerima p on p.id = t.penerima_id and p.tahun = t.tahun
          where t.tahun = ${TAHUN_AKTIF} and upper(a.username) = any(${literalArrayTeks(usernames)}::text[])
          group by 1`;
        for (const x of rowsAwal as Record<string, unknown>[]) {
          const o = beban.perOrang[String(x.oleh)]; if (!o) continue;
          const dit = Number(x.ditugaskan) || 0, sel = Number(x.selesai) || 0, sis = Number(x.sisa) || 0;
          o.awal = { ditugaskan: sel + sis, selesai: sel, sisa: sis, ditutup: dit - sel - sis };
        }
      } catch (e) {
        beban.awalTersedia = false;
        console.error("agregat: beban tugas verifikasi awal tidak tersedia:", e instanceof Error ? e.message : e);
      }
      try {
        const rowsBebanUlang = await sql`
          select upper(a.username) as oleh,
            count(*) filter (where t.selesai_pada is not null)::int as selesai,
            count(*) filter (where t.selesai_pada is null and t.ditarik_pada is not null)::int as ditarik,
            count(*) filter (where t.selesai_pada is null and t.ditarik_pada is null and b.status = 'AKTIF')::int as sisa
          from tugas_verifikasi_ulang t join akun a on a.id = t.akun_id left join batch_verifikasi_ulang b on b.id = t.batch_id
          where t.tahun = ${TAHUN_AKTIF} and upper(a.username) = any(${literalArrayTeks(usernames)}::text[])
          group by 1`;
        for (const x of rowsBebanUlang as Record<string, unknown>[]) {
          const o = beban.perOrang[String(x.oleh)]; if (!o) continue;
          const sel = Number(x.selesai) || 0, tar = Number(x.ditarik) || 0, sis = Number(x.sisa) || 0;
          o.ulang = { ditugaskan: sel + sis, selesai: sel, sisa: sis, ditarik: tar };
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
  const adaBeban = !!h.beban;
  const kolom = adaBeban ? 30 : 20;
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
  // Beban tugas per orang: [awal ditugaskan, selesai, sisa, ditutup, ulang ditugaskan, selesai, sisa, ditarik]. Ditugaskan = Selesai + Sisa; % Selesai = Selesai / Ditugaskan; '-' bila belum ada tugas.
  const nolB = [0, 0, 0, 0, 0, 0, 0, 0];
  const bebanHitungan = (username: string): number[] => {
    const b = h.beban?.perOrang[username.toUpperCase()];
    return b ? [b.awal.ditugaskan, b.awal.selesai, b.awal.sisa, b.awal.ditutup, b.ulang.ditugaskan, b.ulang.selesai, b.ulang.sisa, b.ulang.ditarik] : nolB;
  };
  const persen = (selesai: number, ditugaskan: number): number | string => ditugaskan > 0 ? selesai / ditugaskan : "-";
  const bebanBaris = (c: number[]): (number | string)[] => [c[0], c[1], c[2], persen(c[1], c[0]), c[3], c[4], c[5], c[6], persen(c[5], c[4]), c[7]];
  const jumlahB = (daftar: number[][]) => nolB.map((_, i) => daftar.reduce((s, x) => s + x[i], 0));
  const bebanSemua: number[][] = [];

  // Sheet 1: rekap per orang, DIURUTKAN per tim (Admin Utama: dengan subtotal tiap tim)
  const ws = wb.addWorksheet("Rekap");
  ws.addRow([`Rekap Hasil Kerja Verifikator - ${judulCakupan}`]);
  ws.addRow([`Periode: ${rentangTeks} (WIB)`]);
  ws.addRow([TEKS_ATURAN]);
  ws.addRow(h.beban
    ? [`Beban tugas (kolom paling kanan) dihitung per ${h.beban.dibuatPada} WIB saat file diunduh dan TIDAK mengikuti periode di atas. Ditugaskan = Selesai + Sisa (tugas yang harus dikerjakan); % Selesai = Selesai / Ditugaskan; Ditutup/Ditarik = tugas yang tidak dihitung lagi (hanya informasi).`]
    : []);
  // Dua baris judul: baris 5 = kelompok (sel digabung), baris 6 = nama kolom.
  const barisKelompok = 5;
  const barisHeader = 6;
  ws.addRow(["", "", "", "", "", "VERIFIKASI AWAL", "", "", "VERIFIKASI ULANG", "", "", "", "", "TOTAL PEKERJAAN (AWAL + ULANG)", "", "", "HASIL VERIFIKASI AWAL", "", "", "INFORMASI",
    ...(adaBeban ? ["BEBAN TUGAS AWAL (dari sistem, per unduh)", "", "", "", "", "BEBAN TUGAS ULANG (per unduh)", "", "", "", ""] : [])]);
  ws.addRow(["No", "Tim", "Username", "Nama Lengkap", "Peran",
    "Jam Kerja", "Luar Jam Kerja", "Total",
    "Jam Kerja", "Luar Jam Kerja", "Total", "Sesuai", "Dikoreksi",
    "Jam Kerja", "Luar Jam Kerja (Lembur)", "Total",
    "Memenuhi Syarat", "Berkas Tidak Lengkap", "Tidak Memenuhi Syarat", "Dikoreksi (per tanggal unduh)",
    ...(adaBeban ? ["Ditugaskan", "Selesai", "Sisa", "% Selesai", "Ditutup", "Ditugaskan", "Selesai", "Sisa", "% Selesai", "Ditarik"] : [])]);
  let baris = barisHeader;
  let no = 0;
  const barisSubtotal: number[] = [];
  const kelompok = new Map<string, typeof urut>();
  for (const o of urut) { const k = o.tim || "-"; if (!kelompok.has(k)) kelompok.set(k, []); kelompok.get(k)!.push(o); }
  for (const [k, anggota] of kelompok) {
    const nilaiAnggota: number[][] = [];
    const bebanAnggota: number[][] = [];
    for (const o of anggota) {
      no++; baris++;
      const a = angka(o, ulangDari(o.username));
      nilaiAnggota.push(a);
      const b = bebanHitungan(o.username);
      bebanAnggota.push(b); bebanSemua.push(b);
      ws.addRow([no, labelTim(o.tim), o.username, namaTampil(o.namaLengkap), o.koordinator ? "Koordinator" : "Anggota", ...a, ...(adaBeban ? bebanBaris(b) : [])]);
    }
    if (h.cakupan === "SEMUA") {
      baris++; barisSubtotal.push(baris);
      ws.addRow(["", "Subtotal " + labelTim(k === "-" ? null : k), "", "", `${anggota.length} orang`, ...jumlahKolom(nilaiAnggota), ...(adaBeban ? bebanBaris(jumlahB(bebanAnggota)) : [])]);
    }
  }
  const r = h.hasil.ringkasan;
  baris++;
  ws.addRow(["", "TOTAL", "", "", `${urut.length} orang`, ...angka(r, h.ulang?.ringkasan ?? nolU), ...(adaBeban ? bebanBaris(jumlahB(bebanSemua)) : [])]);
  const barisTotal = baris;
  if (h.cakupan === "SEMUA" && h.hasil.luarTim) {
    const a = h.hasil.luarTim;
    ws.addRow([]);
    ws.addRow([`Informasi (tidak masuk total di atas): pekerjaan Admin Utama pada periode ini = ${a.total} (jam kerja ${a.jamKerja}, luar jam kerja ${a.luarJamKerja}).`]);
  }
  ws.getRow(1).font = { bold: true, size: 13 };
  terapkanGayaHeaderKolom(ws, barisKelompok, kolom);
  for (const [a, b] of [[6, 8], [9, 13], [14, 16], [17, 19], ...(adaBeban ? [[21, 25], [26, 30]] : [])]) terapkanMergeLabel(ws, barisKelompok, a, b);
  terapkanGayaHeaderKolom(ws, barisHeader, kolom);
  terapkanBorderData(ws, barisHeader + 1, barisTotal, kolom);
  if (adaBeban) for (let br = barisHeader + 1; br <= barisTotal; br++) for (const kc of [24, 29]) ws.getCell(br, kc).numFmt = "0%";
  for (const b of barisSubtotal) ws.getRow(b).font = { bold: true };
  terapkanGayaBarisTotal(ws, barisTotal, kolom);
  [6, 12, 28, 30, 13, 12, 14, 12, 12, 14, 12, 12, 14, 14, 20, 14, 16, 18, 20, 22, ...(adaBeban ? [12, 10, 10, 10, 11, 12, 10, 10, 10, 11] : [])].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: "frozen", ySplit: barisHeader }];

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
      `Beban tugas dihitung per ${h.beban.dibuatPada} WIB (saat file diunduh), kumulatif sejak tugas dibagikan, dan tidak mengikuti periode laporan.`,
      "Verifikasi Awal: Ditugaskan = Selesai + Sisa. Selesai = hasil sudah diberikan verifikator; Sisa = masih menunggu verifikator; Ditutup (informasi, tidak masuk Ditugaskan) = data sudah diverifikasi pihak lain sehingga tugasnya tidak perlu dikerjakan.",
      "Verifikasi Ulang: Ditugaskan = Selesai + Sisa. Selesai = hasil sudah disimpan; Sisa = masih di paket aktif; Ditarik (informasi, tidak masuk Ditugaskan) = tugas ditarik, misalnya paket dikosongkan atau status data berubah sebelum diperiksa.",
      "% Selesai = Selesai / Ditugaskan; tanda '-' berarti belum ada tugas yang harus dikerjakan.",
      "Catatan Verifikasi Awal: beban hanya mencakup tugas yang DIBAGIKAN sistem sejak pembagian otomatis dinyalakan. Verifikasi yang dipilih sendiri oleh verifikator sebelumnya tetap terhitung di kolom hasil kerja (Awal/Total), tetapi tidak masuk beban, sehingga angka Selesai pada beban bisa lebih kecil daripada Total Verifikasi Awal.",
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
