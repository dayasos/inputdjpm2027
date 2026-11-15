// Unduh Excel PEMBAGIAN verifikasi ulang (khusus Admin Utama). Rencana: plans/plan-verifikasi-ulang.md.
//
// Isi: sheet "Per Petugas" (berapa tugas, selesai, sesuai, dikoreksi, ditarik, sisa), sheet "Per Data" (satu baris per tugas dengan NIK UTUH, nama,
// wilayah, status, hasil), dan sheet "Aturan" (benih, kriteria, pengecualian). Berkas ini memuat DATA PRIBADI penerima: hanya Admin Utama yang boleh
// mengunduhnya (peran lain, termasuk koordinator, ditolak oleh server sebelum membaca data). NIK ditulis sebagai TEKS agar Excel tidak mengubahnya
// menjadi angka ilmiah (16 digit melebihi ketelitian angka Excel). Aksi ini HANYA MEMBACA.
import { sql } from "../_shared/db.ts";
import { wajibSesi } from "../_shared/sesi.ts";
import { formatTanggalWaktuWIB } from "../_shared/tanggal.ts";
import { keObjek } from "../_shared/jsonDb.ts";
import { muatExcelJS, terapkanBorderData, terapkanGayaBarisTotal, terapkanGayaHeaderKolom } from "../_shared/excelGaya.ts";
import { literalArrayTeks, urutkanPerTim } from "./agregatVerifikasi.ts";

type Baris = Record<string, unknown>;
const huruf = (v: unknown) => String(v == null ? "" : v).trim();
const besar = (v: unknown) => huruf(v).toUpperCase();

export interface PaketInfo {
  id: number; nama: string; dibuatOleh: string; dibuatPada: Date | null; status: string; jumlahTugas: number; batasSelesai: string;
  benih: string; akunKhusus: string; statusKriteria: string[]; layananKriteria: string[]; jumlahKriteria: number; sertakanSudahDiperiksa: boolean;
  jumlahPemeriksa: number; pengecualian: string[];
}
export interface BarisTugas {
  tugasId: number; akun: string; nik: string; namaPenerima: string; layanan: string; kecamatan: string; kelurahan: string;
  statusDibagi: string; statusSekarang: string; statusTugas: "BELUM DIKERJAKAN" | "SELESAI" | "DITARIK"; hasil: string; statusSesudah: string; selesaiPada: Date | null;
}
export interface InfoAkun { username: string; namaLengkap: string; aktif: boolean; tim: string | null; koordinator: boolean }
export interface DataPembagian { paket: PaketInfo; tugas: BarisTugas[]; akun: InfoAkun[] }

const labelTim = (tim: string | null) => (tim ? "Tim " + tim : "Tanpa tim");
const namaTampil = (n: string | undefined) => (n && n.trim() ? n : "(belum mengisi profil)");
const wib = (d: Date | null) => (d ? formatTanggalWaktuWIB(d) : "");

/** Membaca paket + seluruh tugasnya + data akun petugas (satu paket). Hanya membaca. */
export async function ambilDataPembagian(batchId: number): Promise<DataPembagian | null> {
  const b = await sql`
    select id, nama, dibuat_oleh, dibuat_pada, status, jumlah_tugas, batas_selesai::text as batas_selesai, benih, akun_khusus, kriteria, pemeriksa, pengecualian
    from batch_verifikasi_ulang where id = ${batchId} limit 1`;
  if (b.length === 0) return null;
  const p = b[0] as Baris;
  const kr = (keObjek(p.kriteria) && typeof keObjek(p.kriteria) === "object" ? keObjek(p.kriteria) : {}) as Baris;
  const lar = (v: unknown): string[] => { const x = keObjek(v); return Array.isArray(x) ? (x as unknown[]).map(huruf) : []; };

  const rows = await sql`
    select t.id, upper(a.username) as akun, t.status_saat_dibagi, t.selesai_pada, t.hasil, t.status_sesudah, t.ditarik_pada,
           p.nik, p.nama, p.layanan, p.kecamatan, p.kelurahan, p.status_verifikasi as status_sekarang
    from tugas_verifikasi_ulang t
    join akun a on a.id = t.akun_id
    left join penerima p on p.id = t.penerima_id and p.tahun = t.tahun
    where t.batch_id = ${batchId}
    order by t.id`;
  const tugas: BarisTugas[] = (rows as Baris[]).map((r) => ({
    tugasId: Number(r.id), akun: besar(r.akun), nik: huruf(r.nik), namaPenerima: huruf(r.nama), layanan: huruf(r.layanan), kecamatan: huruf(r.kecamatan), kelurahan: huruf(r.kelurahan),
    statusDibagi: huruf(r.status_saat_dibagi), statusSekarang: huruf(r.status_sekarang),
    statusTugas: r.selesai_pada != null ? "SELESAI" : (r.ditarik_pada != null ? "DITARIK" : "BELUM DIKERJAKAN"),
    hasil: huruf(r.hasil), statusSesudah: r.hasil === "DIKOREKSI" ? huruf(r.status_sesudah) : "", selesaiPada: r.selesai_pada != null ? new Date(r.selesai_pada as string) : null,
  }));

  const daftarAkun = Array.from(new Set(tugas.map((t) => t.akun)));
  const ak = daftarAkun.length === 0 ? [] : await sql`
    select a.username, a.nama_lengkap, a.aktif, t.tim, coalesce(t.koordinator, false) as koordinator
    from akun a left join tim_verifikator t on t.akun_id = a.id
    where upper(a.username) = any(${literalArrayTeks(daftarAkun)}::text[])`;
  const akun: InfoAkun[] = (ak as Baris[]).map((x) => ({ username: huruf(x.username), namaLengkap: huruf(x.nama_lengkap), aktif: x.aktif !== false, tim: x.tim ? huruf(x.tim) : null, koordinator: x.koordinator === true }));

  return {
    paket: {
      id: Number(p.id), nama: huruf(p.nama), dibuatOleh: huruf(p.dibuat_oleh), dibuatPada: p.dibuat_pada != null ? new Date(p.dibuat_pada as string) : null, status: huruf(p.status),
      jumlahTugas: Number(p.jumlah_tugas) || 0, batasSelesai: huruf(p.batas_selesai), benih: huruf(p.benih), akunKhusus: huruf(p.akun_khusus),
      statusKriteria: Array.isArray(kr.status) ? (kr.status as unknown[]).map(huruf) : [], layananKriteria: Array.isArray(kr.layanan) ? (kr.layanan as unknown[]).map(huruf) : [],
      jumlahKriteria: Number(kr.jumlah) || 0, sertakanSudahDiperiksa: kr.sertakanSudahDiperiksa === true,
      jumlahPemeriksa: lar(p.pemeriksa).length, pengecualian: lar(p.pengecualian),
    },
    tugas, akun,
  };
}

/** Ringkasan per petugas dari daftar tugas: Ditugaskan = Selesai + Ditarik + Sisa. */
export function ringkasPerPetugas(d: DataPembagian) {
  const info = new Map(d.akun.map((a) => [a.username.toUpperCase(), a]));
  const peta = new Map<string, { ditugaskan: number; selesai: number; sesuai: number; dikoreksi: number; ditarik: number; sisa: number; adaMS: boolean; adaKhusus: boolean }>();
  for (const t of d.tugas) {
    const x = peta.get(t.akun) ?? { ditugaskan: 0, selesai: 0, sesuai: 0, dikoreksi: 0, ditarik: 0, sisa: 0, adaMS: false, adaKhusus: false };
    x.ditugaskan++;
    if (t.statusTugas === "SELESAI") { x.selesai++; if (t.hasil === "SESUAI") x.sesuai++; else if (t.hasil === "DIKOREKSI") x.dikoreksi++; }
    else if (t.statusTugas === "DITARIK") x.ditarik++;
    else x.sisa++;
    if (t.statusDibagi === "Memenuhi Syarat") x.adaMS = true; else x.adaKhusus = true;
    peta.set(t.akun, x);
  }
  const daftar = [...peta.entries()].map(([akun, v]) => {
    const a = info.get(akun);
    return { username: a?.username ?? akun.toLowerCase(), namaLengkap: a?.namaLengkap ?? "", tim: a?.tim ?? null, koordinator: a?.koordinator ?? false, ...v };
  });
  return urutkanPerTim(daftar);
}

// deno-lint-ignore no-explicit-any
export function susunBukuPembagian(ExcelJS: any, d: DataPembagian, pembuat: string) {
  const wb = new ExcelJS.Workbook();
  const p = d.paket;
  const petugas = ringkasPerPetugas(d);
  const infoPaket = `Dibuat oleh ${p.dibuatOleh || "-"} pada ${wib(p.dibuatPada) || "-"} WIB · Status paket: ${p.status} · Batas selesai: ${p.batasSelesai || "tidak ditetapkan"}`;

  // ---- Sheet 1: Per Petugas
  const ws = wb.addWorksheet("Per Petugas");
  const kolom = 13;
  ws.addRow([`Pembagian Verifikasi Ulang - ${p.nama} (paket ${p.id})`]);
  ws.addRow([infoPaket]);
  ws.addRow([]);
  const barisHeader = 4;
  ws.addRow(["No", "Tim", "Username", "Nama Lengkap", "Peran", "Jenis Tugas", "Ditugaskan", "Selesai", "Sesuai", "Dikoreksi", "Ditarik", "Sisa", "% Selesai"]);
  const persen = (selesai: number, ditarik: number, total: number) => (total - ditarik > 0 ? Math.round((selesai * 100) / (total - ditarik)) : 0);
  let baris = barisHeader, no = 0;
  const kelompok = new Map<string, typeof petugas>();
  for (const o of petugas) { const k = o.tim || "-"; if (!kelompok.has(k)) kelompok.set(k, []); kelompok.get(k)!.push(o); }
  const barisSubtotal: number[] = [];
  const jumlah = (arr: typeof petugas) => ({
    ditugaskan: arr.reduce((s, o) => s + o.ditugaskan, 0), selesai: arr.reduce((s, o) => s + o.selesai, 0), sesuai: arr.reduce((s, o) => s + o.sesuai, 0),
    dikoreksi: arr.reduce((s, o) => s + o.dikoreksi, 0), ditarik: arr.reduce((s, o) => s + o.ditarik, 0), sisa: arr.reduce((s, o) => s + o.sisa, 0),
  });
  for (const [k, anggota] of kelompok) {
    for (const o of anggota) {
      no++; baris++;
      const jenis = o.adaMS && o.adaKhusus ? "Campuran" : (o.adaKhusus ? "BTL/TMS khusus" : "Data Memenuhi Syarat");
      ws.addRow([no, labelTim(o.tim), o.username, namaTampil(o.namaLengkap), o.koordinator ? "Koordinator" : "Anggota", jenis, o.ditugaskan, o.selesai, o.sesuai, o.dikoreksi, o.ditarik, o.sisa, persen(o.selesai, o.ditarik, o.ditugaskan)]);
    }
    const j = jumlah(anggota);
    baris++; barisSubtotal.push(baris);
    ws.addRow(["", "Subtotal " + labelTim(k === "-" ? null : k), "", "", `${anggota.length} orang`, "", j.ditugaskan, j.selesai, j.sesuai, j.dikoreksi, j.ditarik, j.sisa, persen(j.selesai, j.ditarik, j.ditugaskan)]);
  }
  const jt = jumlah(petugas);
  baris++;
  ws.addRow(["", "TOTAL", "", "", `${petugas.length} orang`, "", jt.ditugaskan, jt.selesai, jt.sesuai, jt.dikoreksi, jt.ditarik, jt.sisa, persen(jt.selesai, jt.ditarik, jt.ditugaskan)]);
  const barisTotal = baris;
  ws.getRow(1).font = { bold: true, size: 13 };
  terapkanGayaHeaderKolom(ws, barisHeader, kolom);
  terapkanBorderData(ws, barisHeader + 1, barisTotal, kolom);
  for (const b of barisSubtotal) ws.getRow(b).font = { bold: true };
  terapkanGayaBarisTotal(ws, barisTotal, kolom);
  [6, 12, 28, 30, 13, 20, 12, 10, 10, 11, 10, 10, 11].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: "frozen", ySplit: barisHeader }];

  // ---- Sheet 2: Per Data (NIK utuh sebagai TEKS)
  const wd = wb.addWorksheet("Per Data");
  const kolomD = 16;
  wd.addRow([`Daftar tugas per data - ${p.nama} (paket ${p.id}) · BERISI DATA PRIBADI`]);
  wd.addRow([infoPaket]);
  wd.addRow([]);
  const headerD = 4;
  wd.addRow(["No", "Tim", "Petugas (Username)", "Nama Petugas", "NIK", "Nama Penerima", "Layanan", "Kecamatan", "Kelurahan", "Status Saat Dibagi", "Status Sekarang", "Status Tugas", "Hasil", "Status Setelah Koreksi", "Waktu Selesai (WIB)", "ID Tugas"]);
  const urutan = new Map(petugas.map((o, i) => [o.username.toUpperCase(), i]));
  const infoAkun = new Map(d.akun.map((a) => [a.username.toUpperCase(), a]));
  const tugasUrut = [...d.tugas].sort((a, b) =>
    (urutan.get(a.akun) ?? 9999) - (urutan.get(b.akun) ?? 9999) || a.layanan.localeCompare(b.layanan) || a.kecamatan.localeCompare(b.kecamatan) ||
    a.kelurahan.localeCompare(b.kelurahan) || a.namaPenerima.localeCompare(b.namaPenerima) || a.tugasId - b.tugasId);
  let n = 0;
  for (const t of tugasUrut) {
    n++;
    const a = infoAkun.get(t.akun);
    wd.addRow([n, labelTim(a?.tim ?? null), a?.username ?? t.akun.toLowerCase(), namaTampil(a?.namaLengkap), String(t.nik), t.namaPenerima, t.layanan, t.kecamatan, t.kelurahan,
      t.statusDibagi, t.statusSekarang, t.statusTugas, t.hasil === "SESUAI" ? "Sesuai" : (t.hasil === "DIKOREKSI" ? "Dikoreksi" : ""), t.statusSesudah, wib(t.selesaiPada), t.tugasId]);
  }
  const akhirD = headerD + tugasUrut.length;
  wd.getRow(1).font = { bold: true, size: 13 };
  terapkanGayaHeaderKolom(wd, headerD, kolomD);
  // Gaya per sel SENGAJA tidak dipasang pada ribuan baris data (border/format per sel pada ±80 ribu sel menambah >1 dtk CPU dan mendekati batas Edge Function).
  // NIK sudah berupa string (sel bertipe teks): Excel tidak mengubahnya menjadi angka; format kolom "@" ditetapkan di tingkat kolom (murah).
  wd.getColumn(5).numFmt = "@";
  [6, 12, 26, 28, 20, 30, 22, 20, 22, 22, 22, 18, 11, 22, 19, 10].forEach((w, i) => { wd.getColumn(i + 1).width = w; });
  wd.views = [{ state: "frozen", ySplit: headerD }];
  wd.autoFilter = { from: { row: headerD, column: 1 }, to: { row: Math.max(akhirD, headerD), column: kolomD } };

  // ---- Sheet 3: Aturan
  const wa = wb.addWorksheet("Aturan");
  wa.addRow(["Keterangan paket dan aturan pembagian"]);
  wa.getRow(1).font = { bold: true };
  [
    `Paket: ${p.nama} (nomor ${p.id}). ${infoPaket}`,
    `Jumlah tugas saat dibuat: ${p.jumlahTugas}. Benih pengacakan: ${p.benih} (benih yang sama selalu menghasilkan pembagian yang sama; tombol "Cek pembagian" di layar Admin menghitung ulang dan membandingkannya).`,
    `Kriteria: status ${p.statusKriteria.length ? p.statusKriteria.join(", ") : "semua"}; layanan ${p.layananKriteria.length ? p.layananKriteria.join(", ") : "semua"}; jumlah data Memenuhi Syarat ${p.jumlahKriteria > 0 ? p.jumlahKriteria : "semua"}; ${p.sertakanSudahDiperiksa ? "termasuk" : "tidak termasuk"} data yang pernah diverifikasi ulang.`,
    `Pemeriksa data Memenuhi Syarat: ${p.jumlahPemeriksa} akun, dibagi acak dan merata (selisih antar petugas paling banyak 1). Data BTL/TMS hanya ke ${p.akunKhusus || "(tidak ada akun khusus)"}.`,
    `Tidak menerima tugas (pimpinan): ${p.pengecualian.length ? p.pengecualian.join(", ") : "-"}. Pemverifikasi awal sebuah data tidak pernah menjadi pemeriksanya.`,
    "Ditugaskan = Selesai + Ditarik + Sisa. Ditarik = tugas yang datanya berubah atau dihapus sebelum diperiksa (otomatis). Sisa = belum dikerjakan. % Selesai = Selesai / (Ditugaskan - Ditarik).",
    "NIK ditulis sebagai teks supaya semua 16 digit terjaga. Berkas ini memuat data pribadi penerima: hanya untuk Admin Utama, jangan disebarkan.",
    `Dibuat oleh ${pembuat}.`,
  ].forEach((x) => wa.addRow([x]));
  wa.getColumn(1).width = 140;
  return wb;
}

const bersihNama = (s: string) => s.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "paket";

/** unduhRekapPembagianUlang(token, batchId): kontrak respons sama seperti unduhan Excel lain: { sukses, base64, namaFile }. Khusus Admin Utama. */
export async function unduhRekapPembagianUlang(token: string, batchId: number) {
  try {
    const sesi = await wajibSesi(token);
    if (besar(sesi.role) !== "UTAMA") return { sukses: false, pesan: "Fitur ini khusus Admin Utama." };
    const id = Number(batchId);
    if (!id) return { sukses: false, pesan: "Paket tidak valid." };
    const d = await ambilDataPembagian(id);
    if (!d) return { sukses: false, pesan: "Paket tidak ditemukan." };
    const ExcelJS = await muatExcelJS();
    const wb = susunBukuPembagian(ExcelJS, d, besar(sesi.username || "UTAMA"));
    const mentah = await wb.xlsx.writeBuffer();
    const buf: Uint8Array = mentah instanceof Uint8Array ? mentah : new Uint8Array(mentah);
    let biner = "";
    for (let i = 0; i < buf.length; i += 8192) biner += String.fromCharCode(...buf.subarray(i, i + 8192));
    return { sukses: true, base64: btoa(biner), namaFile: `Pembagian Verifikasi Ulang ${bersihNama(d.paket.nama)} (paket ${d.paket.id}).xlsx`, jumlahTugas: d.tugas.length };
  } catch (e) {
    return { sukses: false, pesan: e instanceof Error ? e.message : String(e) };
  }
}
