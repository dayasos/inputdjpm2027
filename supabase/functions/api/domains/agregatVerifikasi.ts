import { sql } from "../_shared/db.ts";
import { wajibSesi } from "../_shared/sesi.ts";
import { TAHUN_AKTIF } from "../_shared/config.ts";
import { muatExcelJS, terapkanBorderData, terapkanGayaBarisTotal, terapkanGayaHeaderKolom } from "../_shared/excelGaya.ts";
import {
  type AkunVerif,
  bangunKonfig,
  hariIniWib,
  type Kejadian,
  susunAgregat,
  tafsirRentang,
  tentukanCakupan,
} from "../_shared/agregatInti.ts";

// Agregat hasil kerja verifikator (plans/plan-agregat-verifikator.md). Seluruh aksi di sini HANYA MEMBACA.
//
// Yang dihitung: pemberian hasil verifikasi PERTAMA oleh akun ber-role VERIFIKATOR (riwayat_verifikasi.sumber = 'SATU' dan status
// sebelumnya "Proses Verifikasi"/kosong), satu per data per verifikator (D2). Perbaikan, pemeriksaan ulang, verifikasi massal, dan
// penurunan otomatis tidak dihitung. Cakupan (sendiri / tim / semua) ditentukan SERVER dari peran sesi dan tabel tim_verifikator.

/** Awal pencatatan riwayat (tabel riwayat_verifikasi diterapkan 2026-11-12); ditampilkan di layar sebagai catatan. */
const MULAI_DIHITUNG = "2026-11-12";

// Daftar teks -> literal array Postgres ('{"a","b"}') yang dikirim sebagai SATU parameter lalu di-cast ::text[] (pola yang sama dengan
// master.ts dan templatAlasan.ts; JS array teks langsung tidak dipakai karena perilaku postgres.js untuk larik teks tidak seragam).
export function literalArrayTeks(daftar: string[]): string {
  return "{" + daftar.map((x) => '"' + x.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"').join(",") + "}";
}

interface HasilHitung {
  cakupan: "SAYA" | "TIM" | "SEMUA";
  timFokus: string | null;
  rentang: { dari: string; sampai: string; jumlahHari: number };
  hasil: ReturnType<typeof susunAgregat>;
  saya: string;
}

async function hitung(token: string, dari: unknown, sampai: unknown, timDiminta: unknown, sertakanPerOrangHari: boolean): Promise<{ galat: string } | HasilHitung> {
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
      select oleh, waktu, status_baru from (
        select distinct on (penerima_id, oleh) penerima_id, oleh, waktu, status_baru
        from riwayat_verifikasi
        where sumber = 'SATU' and tahun = ${TAHUN_AKTIF}
          and oleh = any(${literalArrayTeks(usernames)}::text[])
          and coalesce(nullif(trim(status_lama), ''), 'Proses Verifikasi') = 'Proses Verifikasi'
        order by penerima_id, oleh, waktu
      ) x
      where waktu >= ${r.rentang.awalUtc} and waktu < ${r.rentang.akhirUtcEksklusif}
    `;
    kejadian = rowsKej.map((x: Record<string, unknown>) => ({ oleh: String(x.oleh), waktu: new Date(x.waktu as string), statusBaru: String(x.status_baru || "") }));
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

  const hasil = susunAgregat({ cakupan: c.cakupan, anggota: c.anggota, semuaAnggota: c.cakupan === "SEMUA" ? semuaAkun : undefined, kejadian, rentang: r.rentang, konfig, libur, luarTim, sertakanPerOrangHari });
  return {
    cakupan: c.cakupan, timFokus: c.timFokus,
    rentang: { dari: r.rentang.dari, sampai: r.rentang.sampai, jumlahHari: r.rentang.jumlahHari },
    hasil, saya: String(sesi.username || "").toUpperCase(),
  };
}

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
      mulaiDihitung: MULAI_DIHITUNG,
      diperbaruiPada: new Date().toISOString(),
    };
  } catch (error) {
    return { sukses: false, pesan: error instanceof Error ? error.message : String(error) };
  }
}

// ------------------------------------------------------------------ Unduh Excel

const TEKS_ATURAN = "Jam kerja (WIB): Senin-Kamis 08.00-16.30, Jumat 08.00-17.00. Sabtu, Minggu, dan tanggal merah dihitung luar jam kerja. "
  + "Dihitung: pemberian hasil verifikasi pertama oleh verifikator, 1 kali per data. Perbaikan/pemeriksaan ulang oleh Admin Utama tidak dihitung.";

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
  const kolom = 11;

  // Sheet 1: rekap per orang, DIURUTKAN per tim (Admin Utama: dengan subtotal tiap tim)
  const ws = wb.addWorksheet("Rekap");
  ws.addRow([`Rekap Hasil Kerja Verifikator - ${judulCakupan}`]);
  ws.addRow([`Periode: ${rentangTeks} (WIB)`]);
  ws.addRow([TEKS_ATURAN]);
  ws.addRow([]);
  const barisHeader = 5;
  ws.addRow(["No", "Tim", "Username", "Nama Lengkap", "Peran", "Jam Kerja", "Luar Jam Kerja (Lembur)", "Total Data", "Memenuhi Syarat", "Berkas Tidak Lengkap", "Tidak Memenuhi Syarat"]);
  let baris = barisHeader;
  let no = 0;
  const barisSubtotal: number[] = [];
  const kelompok = new Map<string, typeof urut>();
  for (const o of urut) { const k = o.tim || "-"; if (!kelompok.has(k)) kelompok.set(k, []); kelompok.get(k)!.push(o); }
  for (const [k, anggota] of kelompok) {
    for (const o of anggota) {
      no++; baris++;
      ws.addRow([no, labelTim(o.tim), o.username, namaTampil(o.namaLengkap), o.koordinator ? "Koordinator" : "Anggota", o.jamKerja, o.luarJamKerja, o.total, o.memenuhiSyarat, o.berkasTidakLengkap, o.tidakMemenuhiSyarat]);
    }
    if (h.cakupan === "SEMUA") {
      const s = (f: (o: (typeof urut)[number]) => number) => anggota.reduce((x, o) => x + f(o), 0);
      baris++; barisSubtotal.push(baris);
      ws.addRow(["", "Subtotal " + labelTim(k === "-" ? null : k), "", "", `${anggota.length} orang`, s((o) => o.jamKerja), s((o) => o.luarJamKerja), s((o) => o.total), s((o) => o.memenuhiSyarat), s((o) => o.berkasTidakLengkap), s((o) => o.tidakMemenuhiSyarat)]);
    }
  }
  const r = h.hasil.ringkasan;
  baris++;
  ws.addRow(["", "TOTAL", "", "", `${urut.length} orang`, r.jamKerja, r.luarJamKerja, r.total, r.memenuhiSyarat, r.berkasTidakLengkap, r.tidakMemenuhiSyarat]);
  const barisTotal = baris;
  if (h.cakupan === "SEMUA" && h.hasil.luarTim) {
    const a = h.hasil.luarTim;
    ws.addRow([]);
    ws.addRow([`Informasi (tidak masuk total di atas): pekerjaan Admin Utama pada periode ini = ${a.total} (jam kerja ${a.jamKerja}, luar jam kerja ${a.luarJamKerja}).`]);
  }
  ws.getRow(1).font = { bold: true, size: 13 };
  terapkanGayaHeaderKolom(ws, barisHeader, kolom);
  terapkanBorderData(ws, barisHeader + 1, barisTotal, kolom);
  for (const b of barisSubtotal) ws.getRow(b).font = { bold: true };
  terapkanGayaBarisTotal(ws, barisTotal, kolom);
  [6, 12, 28, 30, 13, 11, 22, 12, 16, 20, 22].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: "frozen", ySplit: barisHeader }];

  // Sheet 2: per orang per hari (dasar lembur), diurutkan per tim -> orang -> tanggal
  const wh = wb.addWorksheet("Per Hari");
  wh.addRow([`Rincian per hari - ${judulCakupan}`]);
  wh.addRow([`Periode: ${rentangTeks} (WIB)`]);
  wh.addRow([]);
  wh.addRow(["Tim", "Username", "Nama Lengkap", "Tanggal", "Hari", "Keterangan", "Jam Kerja", "Luar Jam Kerja (Lembur)", "Total Data"]);
  const info = new Map(h.hasil.perHari.map((x) => [x.tanggal, x]));
  const orang = new Map(h.hasil.perOrang.map((o) => [o.username.toUpperCase(), o]));
  const tanpaData = { tim: null as string | null, koordinator: false };
  const perOrangHari = [...(h.hasil.perOrangHari ?? [])].sort((a, b) => {
    const oa = orang.get(a.username.toUpperCase()) ?? { ...tanpaData, username: a.username };
    const ob = orang.get(b.username.toUpperCase()) ?? { ...tanpaData, username: b.username };
    return peringkatTim(oa.tim) - peringkatTim(ob.tim) || Number(!!ob.koordinator) - Number(!!oa.koordinator) || a.username.localeCompare(b.username) || a.tanggal.localeCompare(b.tanggal);
  });
  for (const x of perOrangHari) {
    const hh = info.get(x.tanggal);
    const o = orang.get(x.username.toUpperCase());
    wh.addRow([labelTim(o?.tim ?? null), x.username, namaTampil(o?.namaLengkap), x.tanggal, hh?.hari ?? "", hh?.libur ? "Sabtu/Minggu/tanggal merah (seharian luar jam kerja)" : "", x.jamKerja, x.luarJamKerja, x.jamKerja + x.luarJamKerja]);
  }
  const barisAkhirHari = 4 + perOrangHari.length;
  wh.getRow(1).font = { bold: true, size: 13 };
  terapkanGayaHeaderKolom(wh, 4, 9);
  if (barisAkhirHari >= 5) terapkanBorderData(wh, 5, barisAkhirHari, 9);
  [11, 28, 30, 12, 10, 48, 11, 22, 12].forEach((w, i) => { wh.getColumn(i + 1).width = w; });
  wh.views = [{ state: "frozen", ySplit: 4 }];

  // Sheet 3: aturan
  const wa = wb.addWorksheet("Aturan");
  wa.addRow(["Aturan perhitungan"]);
  wa.getRow(1).font = { bold: true };
  [TEKS_ATURAN, `Dihitung sejak ${MULAI_DIHITUNG} (awal pencatatan riwayat). Dibuat oleh ${namaPembuat}.`, "Urutan: per tim (I, II, III, IV, tanpa tim), koordinator lebih dulu, lalu menurut username."].forEach((x) => wa.addRow([x]));
  wa.getColumn(1).width = 120;
  return wb;
}

/** unduhRekapLemburVerifikasi(token, dari, sampai, tim): kontrak respons sama seperti eksporDataKeSpreadsheet: { sukses, base64, namaFile }. */
export async function unduhRekapLemburVerifikasi(token: string, dari?: string, sampai?: string, tim?: string) {
  try {
    const h = await hitung(token, dari, sampai, tim, true);
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
