// Gerbang DAFTAR-PUTIH untuk role VERIFIKATOR (tim verifikator). Rencana: plans/plan-tim-verifikator.md.
//
// MODUL MURNI (tanpa Deno.*, tanpa database): diuji di Node (scripts/uji/server-verifikator.test.mjs).
//
// Prinsip: DEFAULT TOLAK. Akun ber-role VERIFIKATOR hanya boleh memanggil aksi yang tercantum di bawah (membaca data, membuka
// detail/riwayat, dashboard progres, dua aksi verifikasi, serta urusan sesi/profil sendiri). Aksi lain -- input, edit, hapus,
// unggah berkas, Kelola Data, kuota, pembayaran, setelan, pengguna, verifikasi massal, dst. -- ditolak di index.ts SEBELUM fungsi
// aksi dijalankan, sehingga aksi baru yang kelak ditambahkan otomatis tertolak untuk role ini (aman bawaan).
// Lapisan kedua: fungsi aksi tertentu tetap memeriksa role sendiri (mis. verifikasi massal tetap khusus UTAMA).

export const ROLE_VERIFIKATOR = "VERIFIKATOR";

export const AKSI_VERIFIKATOR: ReadonlySet<string> = new Set([
  // Sesi dan profil sendiri
  "loginPengguna",
  "logoutPengguna",
  "pulihkanSesi",
  "ubahAkunSendiri",      // ganti kata sandi sendiri
  "simpanProfilUser",     // profil sendiri (nama lengkap, nomor HP, jabatan); pemilik akun saja yang lolos (akun.ts)
  "ping",
  "getVersiAplikasi",
  "getMasterLayanan",
  "getKelurahanByKecamatan",
  "statusInputKecKem",    // dipanggil layar saat masuk (status/pesan); hanya baca
  // Membaca data (baca saja)
  "ambilDataLihatDataHakAkses",
  "ambilBarisLihatDataByIds",
  "ambilDetailPenerimaPerBaris",
  "ambilTahunTersedia",
  "ambilDataTahunHakAkses",
  "ambilRiwayatEdit",
  "getDashboardProgresVerifikasi",
  // Verifikasi (satu data; hanya memberi hasil pada data "Proses Verifikasi"). "Tandai Sudah Diperbaiki" = khusus Admin Utama (D9)
  "getTemplatAlasan",     // templat alasan cepat (hanya membaca)
  "verifikasiSatuData",
  "getRingkasanVerifikasiSaya", // badge melayang: agregat verifikasi akun sendiri (hanya membaca)
  "getAgregatVerifikasi",       // agregat hasil kerja (sendiri / tim bila koordinator); cakupan ditentukan server (hanya membaca)
  "unduhRekapLemburVerifikasi", // Excel rekap lembur, cakupan sama seperti di atas (hanya membaca)
]);

export const PESAN_VERIFIKATOR_DITOLAK =
  "Akses ditolak: akun Verifikator hanya dapat melihat data dan memberi status verifikasi.";

function rapi(v: unknown): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().toUpperCase();
}

export function adalahVerifikator(role: unknown): boolean {
  return rapi(role) === ROLE_VERIFIKATOR;
}

/** true bila aksi harus DITOLAK untuk pemanggil ber-role ini (role VERIFIKATOR dan aksi tidak ada di daftar-putih). */
export function ditolakUntukVerifikator(role: unknown, aksi: unknown): boolean {
  return adalahVerifikator(role) && !(typeof aksi === "string" && AKSI_VERIFIKATOR.has(aksi));
}

/** Role yang boleh memberi status verifikasi satu data: Admin Utama dan Verifikator. Verifikasi massal TIDAK memakai ini (khusus UTAMA). */
export function bolehVerifikasiSatuData(role: unknown): boolean {
  const r = rapi(role);
  return r === "UTAMA" || r === ROLE_VERIFIKATOR;
}
