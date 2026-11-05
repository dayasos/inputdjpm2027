// Aturan "Alamat Tugas tidak boleh berupa tautan (URL)". Rencana: plans/plan-alamat-tugas-tautan-gmm.md.
//
// MODUL MURNI (tanpa Deno.*, tanpa database) supaya bisa diuji di Node. SALINAN KLIEN: public/js/alamat-tugas.js
// -- pola, normalisasi, dan pesan HARUS identik (dijaga scripts/uji/alamat-tugas.test.mjs: kesamaan sumber pola + paritas hasil).
//
// Latar belakang (2026-11): 20 data Guru Maghrib Mengaji menyimpan tautan Google Maps / timemark di kolom Alamat Tugas
// (alamat sebenarnya ada di kolom Koordinat Lokasi). Tidak ada validasi isi kolom itu sama sekali.
//
// Pola sengaja TANPA lookbehind (peramban Android lama / Chrome < 62 tidak mendukungnya) dan diukur pada seluruh
// alamat_tugas 2026+2027 (19.530 baris): tepat 20 cocok, 0 positif-palsu.

/** Pola penanda tautan, diterapkan pada teks yang sudah dinormalkan (huruf besar, NFKC, tanpa karakter tak terlihat). */
export const POLA_TAUTAN: readonly RegExp[] = [
  // Skema: "HTTPS://", "HTTPS:", "HTTP :", "HTTPS//" (kehilangan titik dua).
  /\bHTTPS?\s*:/,
  /\bHTTPS?\s*\/\//,
  // "WWW." di awal host.
  /\bWWW\s*\./,
  // Peringkas / layanan peta / pesan yang lazim ditempel (dengan atau tanpa skema).
  /(?:^|[^A-Z0-9])(?:GOO\.GL|MAPS\.APP|BIT\.LY|TINYURL\.COM|WA\.ME|T\.ME|SHARE\.GOOGLE|MAPS\.GOOGLE|TIMEMARK\.COM|GOOGLE\.[A-Z]{2,3})(?![A-Z0-9])/,
  // Nama domain umum "kata.com", "kata.co.id", dst. (tanpa spasi di sekitar titik; singkatan alamat seperti "NO.5" / "JL." tidak cocok).
  /(?:^|[^A-Z0-9-])[A-Z0-9][A-Z0-9-]*(?:\.[A-Z0-9-]+)*\.(?:COM|NET|ORG|APP|LINK|GL|LY|CO\.ID|GO\.ID|WEB\.ID|OR\.ID|SCH\.ID)(?![A-Z0-9])/,
];

export const PESAN_ALAMAT_TAUTAN =
  "GAGAL: Alamat Tugas tidak boleh berupa tautan (https://...). Tulis alamat sebenarnya (jalan, nomor, lingkungan). " +
  "Tautan Google Maps diisi di kolom Koordinat Lokasi.";

export const PESAN_ALAMAT_TERKUNCI =
  "GAGAL: Alamat Tugas hanya dapat diubah bila isinya masih berupa tautan (https://...).";

export const PESAN_TEMPAT_TERKUNCI =
  "GAGAL: Tempat Tugas tidak dapat diubah lewat Edit Data. Hubungi Admin Utama (menu Kelola Data) bila memang perlu diubah.";

export const PESAN_ALAMAT_KOSONG =
  "GAGAL: Alamat Tugas wajib diisi dengan alamat sebenarnya (jalan, nomor, lingkungan; minimal 5 karakter, memuat huruf).";

/** Huruf besar + NFKC (menyamakan "ＨＴＴＰＳ：" lebar penuh) + buang karakter tak terlihat/kendali yang bisa menyelipkan tautan. */
export function normalkanUntukTautan(teks: unknown): string {
  let t = teks == null ? "" : String(teks);
  try {
    t = t.normalize("NFKC");
  } catch (_e) { /* peramban sangat lama: lanjut tanpa normalisasi */ }
  // Karakter kendali (tab, baris baru, dst.) -> spasi (agar kata di antaranya tidak menyatu); karakter tak terlihat -> dibuang.
  // deno-lint-ignore no-control-regex
  t = t.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/[­​-‏⁠﻿]/g, "");
  return t.toUpperCase();
}

/**
 * Pola nama-domain bisa lambat (kuadratik) pada teks panjang bertitik berulang ("A.A.A....", 50.000 karakter = ±8 detik). Server menerima teks
 * tanpa batas panjang pada sebagian jalur, jadi pemeriksaan dilakukan per jendela 1.000 karakter yang saling tumpang 200 (biaya linear;
 * tautan/host nyata jauh lebih pendek dari 200 sehingga tidak terpotong). Alamat sungguhan <= 100 karakter: tetap satu jendela.
 */
export const JENDELA_PERIKSA = 1000;
export const TUMPANG_JENDELA = 200;

/** true bila teks memuat tautan / nama domain. Kosong atau bukan teks -> false. */
export function mengandungTautan(teks: unknown): boolean {
  const t = normalkanUntukTautan(teks);
  if (!t) return false;
  for (let awal = 0; ; awal += JENDELA_PERIKSA - TUMPANG_JENDELA) {
    const potong = t.slice(awal, awal + JENDELA_PERIKSA);
    for (const pola of POLA_TAUTAN) if (pola.test(potong)) return true;
    if (awal + JENDELA_PERIKSA >= t.length) return false;
  }
}

/** Alamat yang tersimpan boleh diperbaiki lewat Detail > Edit HANYA bila masih berupa tautan (kunci terbuka otomatis, tertutup lagi setelah diperbaiki). */
export function alamatTugasBolehDiperbaiki(alamatTersimpan: unknown): boolean {
  return mengandungTautan(alamatTersimpan);
}

/** Batas panjang alamat pengganti: sama dengan kolom isian (maxlength 100) dan Cek Alamat (MAKS_ALAMAT). */
export const MAKS_ALAMAT_PENGGANTI = 100;
export const PESAN_ALAMAT_PANJANG = "GAGAL: Alamat Tugas terlalu panjang (maksimal " + MAKS_ALAMAT_PENGGANTI + " karakter).";

/** Alamat pengganti yang sah untuk perbaikan: bukan tautan, minimal 5 karakter, maksimal 100, memuat huruf. */
export function periksaAlamatPengganti(nilai: unknown): { ok: true } | { ok: false; pesan: string } {
  if (mengandungTautan(nilai)) return { ok: false, pesan: PESAN_ALAMAT_TAUTAN };
  const t = (nilai == null ? "" : String(nilai)).replace(/\s+/g, " ").trim();
  if (t.length > MAKS_ALAMAT_PENGGANTI) return { ok: false, pesan: PESAN_ALAMAT_PANJANG };
  if (t.length < 5 || !/[A-Za-z]/.test(t)) return { ok: false, pesan: PESAN_ALAMAT_KOSONG };
  return { ok: true };
}
