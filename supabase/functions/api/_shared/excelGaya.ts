// Helper styling exceljs generik -- dipakai bersama oleh domains/pembayaran.ts (sheet REKAP,
// per-layanan, BPJS TK) dan domains/ekspor.ts (ekspor "Lihat Data"), supaya semua dokumen Excel
// yang dihasilkan aplikasi punya tampilan konsisten (bukan cuma payment yang rapi).
//
// Migrasi dari `xlsx` (SheetJS Community Edition, TIDAK menyimpan info gaya sel saat menulis
// .xlsx -- fitur itu dikunci di versi Pro berbayar) ke `exceljs` (mendukung penuh
// bold/border/fill/format angka/freeze pane secara gratis), 2026-09-15/16.

export const HURUF_KOLOM = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
export const WARNA_HEADER = "FFDDE6F0"; // biru muda lembut, dipakai konsisten di semua sheet
export const BORDER_TIPIS = { style: "thin" as const };
export const BORDER_SEL_PENUH = { top: BORDER_TIPIS, left: BORDER_TIPIS, bottom: BORDER_TIPIS, right: BORDER_TIPIS };

// Di Deno, import("npm:exceljs") TIDAK selalu meng-ekspos `Workbook` langsung di namespace (beda
// dari Node `require()`) -- CJS export exceljs sebenarnya ada di properti `.default` kalau Deno
// tidak berhasil mendeteksi named export secara statis. Diverifikasi lewat pengujian nyata ke
// Edge Function (bukan tebakan): tanpa fallback ini muncul error "ExcelJS.Workbook is not a
// constructor". Dipakai di semua tempat yang generate .xlsx supaya isu ini tidak perlu
// ditemukan ulang tiap kali ada sheet baru.
// deno-lint-ignore no-explicit-any
export async function muatExcelJS(): Promise<any> {
  // deno-lint-ignore no-explicit-any
  const mod: any = await import("npm:exceljs@4.4.0");
  return mod.Workbook ? mod : (mod.default ?? mod);
}

// deno-lint-ignore no-explicit-any
export function terapkanGayaJudul(ws: any, baris: number, jumlahKolom: number) {
  const rentang = `A${baris}:${HURUF_KOLOM[jumlahKolom - 1]}${baris}`;
  ws.mergeCells(rentang);
  const sel = ws.getCell(`A${baris}`);
  sel.font = { bold: true, size: 12 };
  sel.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}

// deno-lint-ignore no-explicit-any
export function terapkanMergeLabel(ws: any, baris: number, kolomAwal: number, kolomAkhir: number) {
  ws.mergeCells(baris, kolomAwal, baris, kolomAkhir);
}

// deno-lint-ignore no-explicit-any
export function terapkanGayaHeaderKolom(ws: any, baris: number, jumlahKolom: number) {
  for (let kolom = 1; kolom <= jumlahKolom; kolom++) {
    const sel = ws.getCell(baris, kolom);
    sel.font = { bold: true };
    sel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WARNA_HEADER } };
    sel.border = BORDER_SEL_PENUH;
    sel.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }
}

// deno-lint-ignore no-explicit-any
export function terapkanBorderData(ws: any, barisAwal: number, barisAkhir: number, jumlahKolom: number) {
  for (let baris = barisAwal; baris <= barisAkhir; baris++) {
    for (let kolom = 1; kolom <= jumlahKolom; kolom++) {
      ws.getCell(baris, kolom).border = BORDER_SEL_PENUH;
    }
  }
}

// deno-lint-ignore no-explicit-any
export function terapkanGayaBarisTotal(ws: any, baris: number, jumlahKolom: number) {
  for (let kolom = 1; kolom <= jumlahKolom; kolom++) {
    const sel = ws.getCell(baris, kolom);
    sel.font = { bold: true };
    sel.border = { top: { style: "medium" }, left: BORDER_TIPIS, bottom: BORDER_TIPIS, right: BORDER_TIPIS };
  }
}

// deno-lint-ignore no-explicit-any
export function terapkanFormatUang(ws: any, barisAwal: number, barisAkhir: number, kolomList: number[]) {
  for (let baris = barisAwal; baris <= barisAkhir; baris++) {
    for (const kolom of kolomList) {
      ws.getCell(baris, kolom).numFmt = "#,##0";
    }
  }
}

// Dipindah dari domains/returAdmin.ts (modul Retur terintegrasi dihapus). Dipakai domains/statusPenerima.ts.
// deno-lint-ignore no-explicit-any
export async function susunExcelBase64(namaSheet: string, header: string[], baris: any[][], lebar: number[], warnaHeader: string, kolomTeks: number[]) {
  const ExcelJS = await muatExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(namaSheet);
  ws.addRow(header);
  for (const b of baris) ws.addRow(b);
  ws.columns = lebar.map((w) => ({ width: w }));
  const tipis = { style: "thin" as const };
  const garis = { top: tipis, left: tipis, bottom: tipis, right: tipis };
  for (let r = 1; r <= baris.length + 1; r++) {
    for (let k = 1; k <= header.length; k++) {
      const sel = ws.getCell(r, k);
      sel.border = garis;
      if (r > 1 && kolomTeks.includes(k)) sel.numFmt = "@"; // NIK / rekening / kontak tetap teks (nol di depan tidak hilang)
      if (r === 1) {
        sel.font = { bold: true, color: { argb: "FFFFFFFF" } };
        sel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: warnaHeader } };
        sel.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      }
    }
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const mentah = await wb.xlsx.writeBuffer();
  const buf: Uint8Array = mentah instanceof Uint8Array ? mentah : new Uint8Array(mentah);
  let biner = "";
  for (let i = 0; i < buf.length; i += 8192) biner += String.fromCharCode(...buf.subarray(i, i + 8192));
  return btoa(biner);
}
