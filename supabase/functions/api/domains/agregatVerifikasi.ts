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

// deno-lint-ignore no-explicit-any
export function susunBukuRekap(ExcelJS: any, h: HasilHitung, namaPembuat: string) {
  const wb = new ExcelJS.Workbook();
  const judulCakupan = h.cakupan === "SAYA" ? "Hasil Kerja Saya" : h.cakupan === "TIM" ? `Hasil Tim ${h.timFokus}` : (h.timFokus ? `Agregat Tim ${h.timFokus}` : "Agregat Semua Tim");
  const rentangTeks = `${h.rentang.dari} s/d ${h.rentang.sampai}`;

  // Sheet 1: rekap per orang
  const ws = wb.addWorksheet("Rekap");
  ws.addRow([`Rekap Hasil Kerja Verifikator - ${judulCakupan}`]);
  ws.addRow([`Periode: ${rentangTeks} (WIB)`]);
  ws.addRow([TEKS_ATURAN]);
  ws.addRow([]);
  const barisHeader = 5;
  ws.addRow(["No", "Username", "Nama Lengkap", "Tim", "Jam Kerja", "Luar Jam Kerja (Lembur)", "Total Data", "Memenuhi Syarat", "Berkas Tidak Lengkap", "Tidak Memenuhi Syarat"]);
  h.hasil.perOrang.forEach((o, i) => {
    ws.addRow([i + 1, o.username, o.namaLengkap, o.tim ? "Tim " + o.tim : "-", o.jamKerja, o.luarJamKerja, o.total, o.memenuhiSyarat, o.berkasTidakLengkap, o.tidakMemenuhiSyarat]);
  });
  const r = h.hasil.ringkasan;
  ws.addRow(["", "TOTAL", "", "", r.jamKerja, r.luarJamKerja, r.total, r.memenuhiSyarat, r.berkasTidakLengkap, r.tidakMemenuhiSyarat]);
  const barisAkhir = barisHeader + h.hasil.perOrang.length + 1;
  ws.getRow(1).font = { bold: true, size: 13 };
  terapkanGayaHeaderKolom(ws, barisHeader, 10);
  terapkanBorderData(ws, barisHeader + 1, barisAkhir, 10);
  terapkanGayaBarisTotal(ws, barisAkhir, 10);
  [6, 28, 30, 9, 11, 22, 12, 16, 20, 22].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: "frozen", ySplit: barisHeader }];

  // Sheet 2: per orang per hari (dasar lembur)
  const wh = wb.addWorksheet("Per Hari");
  wh.addRow([`Rincian per hari - ${judulCakupan}`]);
  wh.addRow([`Periode: ${rentangTeks} (WIB)`]);
  wh.addRow([]);
  wh.addRow(["Tanggal", "Hari", "Keterangan", "Username", "Nama Lengkap", "Tim", "Jam Kerja", "Luar Jam Kerja (Lembur)", "Total Data"]);
  const info = new Map(h.hasil.perHari.map((x) => [x.tanggal, x]));
  const orang = new Map(h.hasil.perOrang.map((o) => [o.username.toUpperCase(), o]));
  for (const x of h.hasil.perOrangHari ?? []) {
    const hh = info.get(x.tanggal);
    const o = orang.get(x.username.toUpperCase());
    wh.addRow([x.tanggal, hh?.hari ?? "", hh?.libur ? "Libur / luar jam kerja seharian" : "", x.username, o?.namaLengkap ?? "", o?.tim ? "Tim " + o.tim : "-", x.jamKerja, x.luarJamKerja, x.jamKerja + x.luarJamKerja]);
  }
  const barisAkhirHari = 4 + (h.hasil.perOrangHari?.length ?? 0);
  wh.getRow(1).font = { bold: true, size: 13 };
  terapkanGayaHeaderKolom(wh, 4, 9);
  if (barisAkhirHari >= 5) terapkanBorderData(wh, 5, barisAkhirHari, 9);
  [12, 10, 30, 28, 30, 9, 11, 22, 12].forEach((w, i) => { wh.getColumn(i + 1).width = w; });
  wh.views = [{ state: "frozen", ySplit: 4 }];

  // Sheet 3: aturan
  const wa = wb.addWorksheet("Aturan");
  wa.addRow(["Aturan perhitungan"]);
  wa.getRow(1).font = { bold: true };
  [TEKS_ATURAN, `Dihitung sejak ${MULAI_DIHITUNG} (awal pencatatan riwayat). Dibuat oleh ${namaPembuat}.`].forEach((t) => wa.addRow([t]));
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
