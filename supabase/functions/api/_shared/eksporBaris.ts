// Penyusun baris ekspor Excel "Lihat Data" -- murni (tanpa exceljs/DB) supaya mudah diuji.
//
// Header dasar sesuai Kode.gs baris 1530-1534 (18 kolom, mengikuti indeks 0..17 baris daftar Lihat Data).
// Baris ekspor dikirim browser dalam bentuk 18 kolom (lihat ambilDataMemenuhiSyarat di app-transaksi.js). Bila
// browser menambahkan keterangan penginput di indeks 18 (kategori) dan 19 (nama akun) -- hanya terisi untuk Admin
// Utama & MUI karena server hanya mengirimnya kepada mereka, lihat joinPenginput di domains/penerima.ts --
// ditambahkan kolom "DIINPUT OLEH". Kolom itu TIDAK muncul pada ekspor akun lain. Nilainya hanya label tampilan
// pada berkas milik pengekspor sendiri, bukan keputusan akses.

const HEADER_DASAR = [
  "NO", "NAMA", "NIK", "JENIS KELAMIN", "TEMPAT LAHIR", "TANGGAL LAHIR", "ALAMAT",
  "JENIS LAYANAN", "TEMPAT TUGAS", "ALAMAT TUGAS", "KECAMATAN", "KELURAHAN",
  "NAMA REKENING", "NOMOR REKENING", "KANTOR CABANG", "NO. KONTAK", "STATUS BPJS TK", "UMUR",
];
const HEADER_PENGINPUT = "DIINPUT OLEH";
const LABEL_PENGINPUT: Record<string, string> = {
  MUI: "MUI",
  KECAMATAN: "Kecamatan",
  KEMENAG: "Kemenag",
  UTAMA: "Admin Utama",
};

/** "Ustadz Rahman (MUI)"; tanpa nama -> hanya "MUI"; tanpa keduanya -> "". */
export function teksPenginput(kategori: unknown, nama: unknown): string {
  const kat = String(kategori ?? "").trim().toUpperCase();
  const label = LABEL_PENGINPUT[kat] ?? "";
  const n = String(nama ?? "").trim();
  if (n && label) return n + " (" + label + ")";
  return n || label;
}

export function susunBarisEkspor(dataRows: unknown[][]): { header: string[]; rows: unknown[][] } {
  const daftar = Array.isArray(dataRows) ? dataRows : [];
  const sertakanPenginput = daftar.some((r) => Array.isArray(r) && (r[18] || r[19]));
  const header = sertakanPenginput ? [...HEADER_DASAR, HEADER_PENGINPUT] : [...HEADER_DASAR];

  const rows: unknown[][] = [];
  for (const r of daftar) {
    const row = Array.isArray(r) ? [...r] : [];
    const penginput = sertakanPenginput ? teksPenginput(row[18], row[19]) : "";

    // Pastikan panjang sama dengan header dasar (port Kode.gs baris 1545-1559)
    while (row.length < HEADER_DASAR.length) row.push("");
    const baris = row.slice(0, HEADER_DASAR.length);

    // Bersihkan leading-quote untuk NIK (idx 2), rekening (idx 13), kontak (idx 15)
    baris[2] = baris[2] != null ? String(baris[2]).replace(/^'+/, "").trim() : "";
    baris[5] = baris[5] != null ? String(baris[5]).trim() : "";
    baris[13] = baris[13] != null ? String(baris[13]).replace(/^'+/, "").trim() : "";
    baris[15] = baris[15] != null ? String(baris[15]).replace(/^'+/, "").trim() : "";

    // TIDAK di-prefix "'" seperti Kode.gs baris 1553-1555 (trik itu khusus Google Sheets API). exceljs menyimpan
    // string JS biasa sebagai sel teks, jadi tidak ada risiko notasi ilmiah.
    if (sertakanPenginput) baris.push(penginput);
    rows.push(baris);
  }
  return { header, rows };
}
