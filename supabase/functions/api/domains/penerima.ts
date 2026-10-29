import { sql } from "../_shared/db.ts";
import { wajibSesi } from "../_shared/sesi.ts";
import { LAYANAN_BATASI_TEMPAT_TUGAS, rapikanTeks, TAHUN_AKTIF } from "../_shared/config.ts";
import { bersihkanSelUntukArray, formatTanggalDDMMYYYY, formatTanggalWaktuWIB } from "../_shared/tanggal.ts";
import {
  daftarLayananKemenagUpper,
  kategoriPenginput,
  kelurahanTerkunciDari,
  layananBolehDiinputMui,
  lolosAksesBarisLihatData,
  resolveInstansiPengguna,
  subFilterGsmDari,
} from "../_shared/akses.ts";
import { periksaIzinInput } from "./setelan.ts";
import { cekKuotaTersedia } from "./validasi.ts";
import {
  cariRumahIbadah,
  kelurahanAdaDiKecamatan,
  periksaTempatTugasDariDaftar,
  pilihRumahIbadahId,
  tentukanWilayahTugas,
} from "../_shared/wilayahTugas.ts";
import { layananWajibKoordinat, normalisasiKoordinat } from "../_shared/koordinat.ts";
import { periksaTanggalLahir, tanggalHariIniWIB } from "../_shared/validasiPenerima.ts";

// ---------------------------------------------------------------------------
// Penanda PENGINPUT di Lihat Data (rencana akun MUI, 2026-10-20): data hasil input akun MUI diberi tanda
// "Input MUI" untuk Admin Utama (dan MUI). Dua kolom ditambahkan di UJUNG baris daftar (indeks 23 & 24) dan
// indeks 48-51 pada detail, jadi indeks lama tidak bergeser. Server hanya MENGISI keterangan ini untuk
// Admin Utama dan MUI; peran lain menerima string kosong (bentuk baris tetap sama).
//   daftar : [23] kategori penginput (UTAMA | KECAMATAN | KEMENAG | MUI | ""), [24] nama akun penginput
//   detail : [48] kategori, [49] nama, [50] waktu input (WIB), [51] true bila data ini diinput akun yang sedang login
// Pelacaknya sudah ada sejak awal (penerima.dibuat_oleh_akun_id, dibuat_at), jadi tanpa migrasi.
// Subselect lateral hanya mengekspos 2 kolom sehingga nama kolom lain di query (id, kecamatan, ...) tidak ambigu.
// ---------------------------------------------------------------------------
function joinPenginput() {
  return sql`
    left join lateral (
      select a.role as penginput_role, coalesce(nullif(btrim(a.nama_lengkap), ''), a.username::text) as penginput_nama
      from akun a where a.id = penerima.dibuat_oleh_akun_id
    ) pa on true
  `;
}

function bolehLihatPenginput(instansi: string | null): boolean {
  return instansi === "SUPERADMIN" || instansi === "MUI";
}

// deno-lint-ignore no-explicit-any
function kolomPenginput(row: any, boleh: boolean, listLayananKemenag: string[]): [string, string] {
  if (!boleh || !row.penginput_role) return ["", ""];
  return [kategoriPenginput(row.penginput_role, listLayananKemenag), String(row.penginput_nama ?? "").trim()];
}

// ---------------------------------------------------------------------------
// "Perlu lapor" (plan wajib lapor perbaikan, 2026-10-22): data Berkas Tidak Lengkap yang berkasnya sudah diganti user
// (penerima.tanggal_berkas_diubah) tetapi belum dilaporkan SESUDAH penggantian itu. Dikirim ke semua peran (bukan data
// sensitif): Admin Utama memakainya untuk lencana/filter, user pemilik data untuk gerbang tutup Detail.
//   daftar : indeks 25 (boolean) · detail : [52] waktu berkas diubah (WIB), [53] boolean yang sama
// Murni dari kolom baris -> bisa dihitung di JS tanpa query tambahan.
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
export function perluLaporBerkas(row: any): boolean {
  if ((row.status_verifikasi || "") !== "Berkas Tidak Lengkap" || !row.tanggal_berkas_diubah) return false;
  if (!row.tanggal_lapor_perbaikan) return true;
  return new Date(row.tanggal_berkas_diubah).getTime() > new Date(row.tanggal_lapor_perbaikan).getTime();
}

export async function ambilDataLihatDataHakAkses(token: string): Promise<string> {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return JSON.stringify({ sukses: false, pesan: e instanceof Error ? e.message : String(e) });
  }

  try {
    const namaKecamatanPengguna = sesi.kecamatan || "";
    const kelurahanTerkunci = kelurahanTerkunciDari(sesi);
    const subFilterGsm = subFilterGsmDari(sesi);

    const { instansiPengguna, layananPengguna, listLayananKemenag } = await resolveInstansiPengguna(sesi.role);
    if (!instansiPengguna) {
      return JSON.stringify({ sukses: false, pesan: "Peran tidak dikenali." });
    }

    // ---------------------------------------------------------------------------
    // OPTIMASI SQL (2026-09-17): Filter RBAC dikerjakan Postgres, bukan JS loop.
    //
    // Sebelumnya: query ambil SEMUA baris, lalu loop JS filter satu per satu.
    // Sekarang:   WHERE clause spesifik per role → Postgres pakai index → data minimal
    //             yang masuk ke memory Edge Function.
    //
    // lolosAksesBarisLihatData() tetap dipakai HANYA untuk sub-filter GSM Katolik/Kristen
    // (tempat_tugas LIKE '%KATOLIK%') yang lebih mudah di JS daripada SQL dinamis.
    // ---------------------------------------------------------------------------

    // deno-lint-ignore no-explicit-any
    let rows: any[];

    if (instansiPengguna === "SUPERADMIN") {
      // Admin utama: lihat semua data tahun aktif
      rows = await sql`
        select id, nama, nik, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, layanan,
               tempat_tugas, alamat_tugas, kecamatan, kelurahan, nama_rekening, nomor_rekening,
               kantor_cabang, no_kontak, status_bpjs_tk, umur, status_verifikasi, tanggal_lapor_perbaikan,
               status_rekomendasi_mui, catatan_rekomendasi_mui, respon_admin_mui, tanggal_berkas_diubah,
               pa.penginput_role, pa.penginput_nama
        from penerima
        ${joinPenginput()}
        where tahun = ${TAHUN_AKTIF}
        order by nomor_urut
      `;
    } else if (instansiPengguna === "KECAMATAN") {
      // Operator kecamatan: hanya kecamatannya sendiri, bukan layanan kemenag
      const kecamatanFilter = namaKecamatanPengguna.toUpperCase();
      // Gunakan NOT IN untuk exclude semua layanan kemenag sekaligus di SQL
      rows = await sql`
        select id, nama, nik, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, layanan,
               tempat_tugas, alamat_tugas, kecamatan, kelurahan, nama_rekening, nomor_rekening,
               kantor_cabang, no_kontak, status_bpjs_tk, umur, status_verifikasi, tanggal_lapor_perbaikan,
               status_rekomendasi_mui, catatan_rekomendasi_mui, respon_admin_mui, tanggal_berkas_diubah
        from penerima
        where tahun = ${TAHUN_AKTIF}
          and upper(kecamatan) = ${kecamatanFilter}
          and upper(layanan) not in (
            select upper(nama_layanan) from layanan_master where kategori = 'KEMENAG'
          )
          ${kelurahanTerkunci ? sql`and upper(kelurahan) = ${kelurahanTerkunci}` : sql``}
        order by nomor_urut
      `;
    } else if (instansiPengguna === "KEMENAG") {
      // Operator kemenag: hanya layanan kemenag yang sesuai (dan opsional per-kecamatan)
      if (layananPengguna) {
        // Kemenag spesifik layanan (mis. IMAM MASJID) — opsional filter kecamatan
        const layananFilter = layananPengguna.toUpperCase();
        if (namaKecamatanPengguna) {
          const kecamatanFilter = namaKecamatanPengguna.toUpperCase();
          rows = await sql`
            select id, nama, nik, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, layanan,
                   tempat_tugas, alamat_tugas, kecamatan, kelurahan, nama_rekening, nomor_rekening,
                   kantor_cabang, no_kontak, status_bpjs_tk, umur, status_verifikasi, tanggal_lapor_perbaikan,
                   status_rekomendasi_mui, catatan_rekomendasi_mui, respon_admin_mui, tanggal_berkas_diubah
            from penerima
            where tahun = ${TAHUN_AKTIF}
              and upper(layanan) = ${layananFilter}
              and upper(kecamatan) = ${kecamatanFilter}
            order by nomor_urut
          `;
        } else {
          rows = await sql`
            select id, nama, nik, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, layanan,
                   tempat_tugas, alamat_tugas, kecamatan, kelurahan, nama_rekening, nomor_rekening,
                   kantor_cabang, no_kontak, status_bpjs_tk, umur, status_verifikasi, tanggal_lapor_perbaikan,
                   status_rekomendasi_mui, catatan_rekomendasi_mui, respon_admin_mui, tanggal_berkas_diubah
            from penerima
            where tahun = ${TAHUN_AKTIF}
              and upper(layanan) = ${layananFilter}
            order by nomor_urut
          `;
        }
      } else {
        // Kemenag tanpa layanan spesifik: semua layanan kemenag
        rows = await sql`
          select id, nama, nik, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, layanan,
                 tempat_tugas, alamat_tugas, kecamatan, kelurahan, nama_rekening, nomor_rekening,
                 kantor_cabang, no_kontak, status_bpjs_tk, umur, status_verifikasi, tanggal_lapor_perbaikan,
                 status_rekomendasi_mui, catatan_rekomendasi_mui, respon_admin_mui, tanggal_berkas_diubah
          from penerima
          where tahun = ${TAHUN_AKTIF}
            and upper(layanan) in (
              select upper(nama_layanan) from layanan_master where kategori = 'KEMENAG'
            )
          order by nomor_urut
        `;
      }
    } else if (instansiPengguna === "MUI") {
      // MUI: hanya layanan Ustadz dan Ustadzah se-Kota Medan
      rows = await sql`
        select id, nama, nik, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, layanan,
               tempat_tugas, alamat_tugas, kecamatan, kelurahan, nama_rekening, nomor_rekening,
               kantor_cabang, no_kontak, status_bpjs_tk, umur, status_verifikasi, tanggal_lapor_perbaikan,
               status_rekomendasi_mui, catatan_rekomendasi_mui, respon_admin_mui, tanggal_berkas_diubah,
               pa.penginput_role, pa.penginput_nama
        from penerima
        ${joinPenginput()}
        where tahun = ${TAHUN_AKTIF}
          and upper(layanan) in ('USTADZ', 'USTADZAH', 'USTADZ/USTADZAH')
        order by nomor_urut
      `;
    } else {
      return JSON.stringify({ sukses: false, pesan: "Peran tidak dikenali." });
    }

    // Hanya sub-filter GSM (tempat_tugas berisi/tidak berisi 'KATOLIK') yang masih dikerjakan JS
    // karena ini logika string dinamis yang kompleks — semua filter lain sudah di SQL di atas.
    const resultRows: unknown[][] = [];
    for (const row of rows) {
      const layananSheet = (row.layanan || "").toUpperCase();
      const kecamatanSheet = (row.kecamatan || "").toUpperCase();
      const kelurahanSheet = (row.kelurahan || "").toUpperCase();
      const tempatTugasSheet = (row.tempat_tugas || "").toUpperCase();

      const lolos = lolosAksesBarisLihatData({
        instansiPengguna,
        layananPengguna,
        namaKecamatanPengguna,
        kelurahanTerkunci,
        subFilterGsm,
        listLayananKemenag,
        layananSheet,
        kecamatanSheet,
        kelurahanSheet,
        tempatTugasSheet,
      });
      if (!lolos) continue;

      resultRows.push([
        row.id,
        row.nama,
        row.nik,
        row.jenis_kelamin,
        row.tempat_lahir,
        formatTanggalDDMMYYYY(row.tanggal_lahir),
        row.alamat,
        row.layanan,
        row.tempat_tugas,
        row.alamat_tugas,
        row.kecamatan,
        row.kelurahan,
        row.nama_rekening,
        row.nomor_rekening,
        row.kantor_cabang,
        (row.no_kontak || "").toString().replace(/^'+/, "").trim(),
        row.status_bpjs_tk,
        // umur bisa NULL kalau backfill data lama tidak punya nilai valid (lihat angkaAtauNull di
        // scripts/backfill) — jadikan "" (bukan `null` literal) supaya perilakunya sama seperti sel
        // Sheets kosong yang dibaca Kode.gs asli (getRange().getValues() tidak pernah mengembalikan
        // null untuk sel kosong, selalu "").
        row.umur ?? "",
        row.status_verifikasi || "Proses Verifikasi",
        // Dikonfirmasi ke laporkanPerbaikanBerkas() (Kode.gs baris 3054): ditulis sbg string
        // "dd-MM-yyyy HH:mm" WIB, bukan ISO. index.html sendiri di sini cuma memakainya sbg
        // penanda truthy/falsy (row[19], lihat index.html baris 3706/3757) jadi formatnya tidak
        // kritikal DI FUNGSI INI, tapi disamakan supaya konsisten dgn dataLengkap[38] di bawah.
        formatTanggalWaktuWIB(row.tanggal_lapor_perbaikan),
        row.status_rekomendasi_mui || "BELUM_DIPERIKSA",
        row.catatan_rekomendasi_mui || "",
        row.respon_admin_mui || "",
        ...kolomPenginput(row, bolehLihatPenginput(instansiPengguna), listLayananKemenag),
        perluLaporBerkas(row),
      ]);
    }

    return JSON.stringify({ sukses: true, rows: resultRows });
  } catch (error) {
    return JSON.stringify({ sukses: false, pesan: String(error) });
  }
}

// Ambil ULANG hanya beberapa baris daftar "Lihat Data" (dipakai sinkronisasi realtime: admin lain
// mengubah status/data satu-dua baris -> klien cukup menarik baris itu saja, bukan seluruh ribuan
// baris lewat ambilDataLihatDataHakAkses). Bentuk baris SAMA PERSIS dengan ambilDataLihatDataHakAkses
// (23 kolom, urutan sama) supaya klien bisa langsung menimpa baris di tabelnya -- kalau kolom di
// fungsi itu berubah, ubah juga `petakanBarisLihat` di bawah. Akses memakai helper yang sama dengan
// ambilDetailPenerimaPerBaris (lolosAksesBarisLihatData) -- baris di luar hak akses TIDAK pernah
// dikembalikan, dan id yang tidak ditemukan/tidak berhak dilaporkan di `hilang` (klien menghapusnya
// dari tabel; ini juga yang membuat baris yang dihapus admin lain langsung hilang).
// Hanya baca: tidak ada insert/update/delete di sini.
// deno-lint-ignore no-explicit-any
function petakanBarisLihat(row: any, penginput: [string, string]): unknown[] {
  return [
    row.id,
    row.nama,
    row.nik,
    row.jenis_kelamin,
    row.tempat_lahir,
    formatTanggalDDMMYYYY(row.tanggal_lahir),
    row.alamat,
    row.layanan,
    row.tempat_tugas,
    row.alamat_tugas,
    row.kecamatan,
    row.kelurahan,
    row.nama_rekening,
    row.nomor_rekening,
    row.kantor_cabang,
    (row.no_kontak || "").toString().replace(/^'+/, "").trim(),
    row.status_bpjs_tk,
    row.umur ?? "",
    row.status_verifikasi || "Proses Verifikasi",
    formatTanggalWaktuWIB(row.tanggal_lapor_perbaikan),
    row.status_rekomendasi_mui || "BELUM_DIPERIKSA",
    row.catatan_rekomendasi_mui || "",
    row.respon_admin_mui || "",
    penginput[0],
    penginput[1],
    perluLaporBerkas(row),
  ];
}

const MAKS_ID_BARIS_LIHAT = 200;

export async function ambilBarisLihatDataByIds(token: string, ids: unknown) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return JSON.stringify({ sukses: false, pesan: e instanceof Error ? e.message : String(e) });
  }

  try {
    const daftarId = Array.from(
      new Set((Array.isArray(ids) ? ids : []).map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0)),
    ).slice(0, MAKS_ID_BARIS_LIHAT);
    if (daftarId.length === 0) return JSON.stringify({ sukses: true, rows: [], hilang: [] });

    const { instansiPengguna, layananPengguna, listLayananKemenag } = await resolveInstansiPengguna(sesi.role);
    if (!instansiPengguna) {
      return JSON.stringify({ sukses: false, pesan: "Peran tidak dikenali." });
    }
    const namaKecamatanPengguna = sesi.kecamatan || "";
    const kelurahanTerkunci = kelurahanTerkunciDari(sesi);
    const subFilterGsm = subFilterGsmDari(sesi);

    const rows = await sql`
      select id, nama, nik, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, layanan,
             tempat_tugas, alamat_tugas, kecamatan, kelurahan, nama_rekening, nomor_rekening,
             kantor_cabang, no_kontak, status_bpjs_tk, umur, status_verifikasi, tanggal_lapor_perbaikan,
             status_rekomendasi_mui, catatan_rekomendasi_mui, respon_admin_mui, tanggal_berkas_diubah,
             pa.penginput_role, pa.penginput_nama
      from penerima
      ${joinPenginput()}
      where tahun = ${TAHUN_AKTIF} and id in ${sql(daftarId)}
    `;

    const resultRows: unknown[][] = [];
    const ditemukan = new Set<number>();
    for (const row of rows) {
      const lolos = lolosAksesBarisLihatData({
        instansiPengguna,
        layananPengguna,
        namaKecamatanPengguna,
        kelurahanTerkunci,
        subFilterGsm,
        listLayananKemenag,
        layananSheet: (row.layanan || "").toUpperCase(),
        kecamatanSheet: (row.kecamatan || "").toUpperCase(),
        kelurahanSheet: (row.kelurahan || "").toUpperCase(),
        tempatTugasSheet: (row.tempat_tugas || "").toUpperCase(),
      });
      if (!lolos) continue;
      ditemukan.add(Number(row.id));
      resultRows.push(petakanBarisLihat(row, kolomPenginput(row, bolehLihatPenginput(instansiPengguna), listLayananKemenag)));
    }
    const hilang = daftarId.filter((id) => !ditemukan.has(id));

    return JSON.stringify({ sukses: true, rows: resultRows, hilang });
  } catch (error) {
    return JSON.stringify({ sukses: false, pesan: String(error) });
  }
}

// Port dari ambilDetailPenerimaPerBaris() — `nomorBarisAsli` sekarang ditafsirkan sebagai
// `penerima.id` (lihat catatan arsitektur di atas), BUKAN nomor baris fisik sheet.
//
// PENGERASAN DISENGAJA (atas permintaan eksplisit, BUKAN bagian dari "porting 1:1"): fungsi asli
// di Kode.gs TIDAK menerapkan kelurahan-lock maupun sub-filter GSM Katolik/Kristen di sini (beda
// dari ambilDataLihatDataHakAkses) — celah yang sama persis kelasnya dengan bug ambilDataDetailByNik
// (lihat memori project-bug-akses-data-detail-gsm). Di sini SEKARANG dipakai helper akses penuh
// yang sama (`lolosAksesBarisLihatData`) supaya tampilan detail-per-baris tidak pernah lebih
// longgar daripada daftar "Lihat Data" yang menampilkannya.
export async function ambilDetailPenerimaPerBaris(token: string, nomorBarisAsli: number) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return JSON.stringify({ sukses: false, pesan: e instanceof Error ? e.message : String(e) });
  }

  try {
    const id = Number(nomorBarisAsli);
    if (!id) return JSON.stringify({ sukses: false, pesan: "Nomor baris tidak valid." });

    const rows = await sql`
      select * from penerima where id = ${id} and tahun = ${TAHUN_AKTIF} limit 1
    `;
    if (rows.length === 0) return JSON.stringify({ sukses: false, pesan: "Nomor baris tidak valid." });
    const row = rows[0];

    const { instansiPengguna, layananPengguna, listLayananKemenag } = await resolveInstansiPengguna(sesi.role);
    if (!instansiPengguna) {
      return JSON.stringify({ sukses: false, pesan: "Anda tidak berhak melihat data ini." });
    }

    const boleh = lolosAksesBarisLihatData({
      instansiPengguna,
      layananPengguna,
      namaKecamatanPengguna: sesi.kecamatan || "",
      kelurahanTerkunci: kelurahanTerkunciDari(sesi),
      subFilterGsm: subFilterGsmDari(sesi),
      listLayananKemenag,
      layananSheet: (row.layanan || "").toUpperCase(),
      kecamatanSheet: (row.kecamatan || "").toUpperCase(),
      kelurahanSheet: (row.kelurahan || "").toUpperCase(),
      tempatTugasSheet: (row.tempat_tugas || "").toUpperCase(),
    });
    if (!boleh) return JSON.stringify({ sukses: false, pesan: "Anda tidak berhak melihat data ini." });

    // Array 40 kolom, urutan PERSIS header "Data Input <tahun>" asli (lihat migrasi
    // 20260907090200_penerima_partitioned.sql) — index.html membaca lewat dataLengkap[0..39]
    // posisional (mis. dataAktif[32] = status verifikasi, dikonfirmasi dari index.html baris 4360).
    const dataLengkap = [
      row.nomor_urut, row.nama, row.nik, row.jenis_kelamin, row.tempat_lahir, row.tanggal_lahir,
      row.alamat, row.layanan, row.tempat_tugas, row.alamat_tugas, row.kecamatan, row.kelurahan,
      row.nama_rekening, row.nomor_rekening, row.kantor_cabang, row.no_kontak, row.status_bpjs_tk,
      row.umur, row.link_ktp, row.link_buku_rekening, row.link_surat_permohonan,
      row.link_pernyataan_satu_bantuan, row.link_domisili_kelurahan, row.link_formulir_pendataan,
      row.link_berkas_pendukung, row.link_foto_plank_rumah_ibadah, row.link_foto_lokasi_ibadah,
      row.link_foto_kegiatan_belajar, row.link_rekomendasi_bkm, row.link_rekomendasi_rumah_ibadah,
      row.id_folder_berkas, row.link_koordinat_lokasi, row.status_verifikasi,
      row.keterangan_verifikasi, row.tanggal_verifikasi, row.diverifikasi_oleh,
      row.batas_waktu_perbaikan, row.catatan_perbedaan_nama, row.tanggal_lapor_perbaikan,
      row.dilapor_oleh,
      row.link_domisili_rumah_ibadah, // indeks 40, ditaruh paling akhir agar 0..39 tidak bergeser
    ].map(bersihkanSelUntukArray);

    // tanggal_verifikasi (index 34) & tanggal_lapor_perbaikan (index 38) BUKAN tanggal murni —
    // dikonfirmasi ke verifikasiSatuData (Kode.gs baris 2988) & laporkanPerbaikanBerkas (baris 3054):
    // keduanya ditulis sbg "dd-MM-yyyy HH:mm" WIB (menyertakan jam), beda dari tanggal_lahir/
    // batas_waktu_perbaikan yang cuma tanggal. Timpa hasil map generik di atas dengan format yang benar.
    dataLengkap[34] = formatTanggalWaktuWIB(row.tanggal_verifikasi);
    dataLengkap[38] = formatTanggalWaktuWIB(row.tanggal_lapor_perbaikan);

    // Bersihkan kutip depan pada no kontak (index 15) — port dari Kode.gs baris 1457.
    if (dataLengkap[15]) {
      dataLengkap[15] = (dataLengkap[15] as string).replace(/^'+/, "").trim();
    }

    // Kolom verifikasi Rekomendasi MUI & jalur komunikasi Admin Utama (indeks 41..47, non-breaking):
    dataLengkap[41] = row.status_rekomendasi_mui || "BELUM_DIPERIKSA";
    dataLengkap[42] = row.catatan_rekomendasi_mui || "";
    dataLengkap[43] = formatTanggalWaktuWIB(row.tgl_rekomendasi_mui);
    dataLengkap[44] = row.petugas_rekomendasi_mui || "";
    dataLengkap[45] = row.respon_admin_mui || "";
    dataLengkap[46] = formatTanggalWaktuWIB(row.tgl_respon_admin_mui);
    dataLengkap[47] = row.id;

    // Penginput (indeks 48-51, non-breaking; lihat catatan di atas joinPenginput). Keterangan penginput hanya
    // dikirim ke Admin Utama & MUI; [51] "milik sendiri" untuk semua peran (dipakai tombol Edit akun MUI).
    let penginputKategori = "";
    let penginputNama = "";
    let penginputWaktu = "";
    if (bolehLihatPenginput(instansiPengguna)) {
      penginputWaktu = row.dibuat_at ? formatTanggalWaktuWIB(row.dibuat_at) : "";
      if (row.dibuat_oleh_akun_id) {
        const rowsPenginput = await sql`select role, nama_lengkap, username from akun where id = ${row.dibuat_oleh_akun_id} limit 1`;
        if (rowsPenginput.length > 0) {
          penginputKategori = kategoriPenginput(rowsPenginput[0].role, listLayananKemenag);
          penginputNama = String(rowsPenginput[0].nama_lengkap || "").trim() || String(rowsPenginput[0].username || "").trim();
        }
      }
    }
    dataLengkap[48] = penginputKategori;
    dataLengkap[49] = penginputNama;
    dataLengkap[50] = penginputWaktu;
    dataLengkap[51] = !!row.dibuat_oleh_akun_id && String(row.dibuat_oleh_akun_id) === String(sesi.akunId);

    // Penanda perbaikan berkas (indeks 52-53, non-breaking; lihat perluLaporBerkas).
    dataLengkap[52] = formatTanggalWaktuWIB(row.tanggal_berkas_diubah);
    dataLengkap[53] = perluLaporBerkas(row);

    return JSON.stringify({ sukses: true, dataLengkap });
  } catch (error) {
    return JSON.stringify({ sukses: false, pesan: String(error) });
  }
}

// ---------------------------------------------------------------------------
// PETA KOLOM INDEX (0-based, sesuai posisi di sheet "Data Input 2027") → nama kolom Postgres.
// Dipakai editDataPenerima untuk teks maupun berkas.
// Sumber: header appendRow di Kode.gs baris 997-1007 & KOLOM_TEKS_BOLEH/KOLOM_BERKAS baris 2635-2650.
// ---------------------------------------------------------------------------
export const MAP_IDX_KE_KOLOM_TEKS: Record<number, string> = {
  1: "nama",
  2: "nik",
  3: "jenis_kelamin",
  4: "tempat_lahir",
  5: "tanggal_lahir",    // format "dd-MM-yyyy" dari frontend; dikonversi ke date Postgres di bawah
  6: "alamat",
  8: "tempat_tugas",
  9: "alamat_tugas",
  11: "kelurahan",
  12: "nama_rekening",
  13: "nomor_rekening",
  14: "kantor_cabang",
  15: "no_kontak",
  16: "status_bpjs_tk",
  31: "link_koordinat_lokasi", // hanya layanan Guru; divalidasi/dinormalkan di editDataPenerima
};

// Kolom `penerima` yang JUGA disalin ke tabel `data_detail` (Data Detail, cover PDF, sumber proses Pembayaran). Edit data harus menyamakan
// salinan itu untuk kolom-kolom ini -- sama seperti Kelola Data (kelolaData.ts). Berkas (link_*), koordinat, dan kolom administrasi
// lain TIDAK ada di data_detail sehingga sengaja tidak termasuk. `rumah_ibadah_id` (tautan ke rumah ibadah) hanya ikut bila kode lain
// mengisinya ke setValues; selama belum ada, entri ini tidak berpengaruh.
const KOLOM_SALINAN_DATA_DETAIL = new Set([
  "nama", "nik", "jenis_kelamin", "tempat_lahir", "tanggal_lahir", "alamat", "tempat_tugas", "alamat_tugas", "kelurahan",
  "nama_rekening", "nomor_rekening", "kantor_cabang", "no_kontak", "status_bpjs_tk", "umur", "rumah_ibadah_id",
]);

export const MAP_IDX_KE_KOLOM_BERKAS: Record<number, string> = {
  18: "link_ktp",
  19: "link_buku_rekening",
  20: "link_surat_permohonan",
  21: "link_pernyataan_satu_bantuan",
  22: "link_domisili_kelurahan",
  23: "link_formulir_pendataan",
  24: "link_berkas_pendukung",
  25: "link_foto_plank_rumah_ibadah",
  26: "link_foto_lokasi_ibadah",
  27: "link_foto_kegiatan_belajar",
  28: "link_rekomendasi_bkm",
  29: "link_rekomendasi_rumah_ibadah",
  40: "link_domisili_rumah_ibadah",
};

// Label kolom untuk riwayat_edit (sama persis labelKolom_() Kode.gs baris 3102-3110)
export function labelKolom(idx: number): string {
  const MAP: Record<number, string> = {
    1: "Nama Lengkap", 2: "NIK", 3: "Jenis Kelamin", 4: "Tempat Lahir",
    5: "Tanggal Lahir", 6: "Alamat Domisili", 8: "Tempat Tugas", 9: "Alamat Tugas",
    11: "Kelurahan", 12: "Nama Rekening", 13: "Nomor Rekening",
    14: "Kantor Cabang", 15: "No. Kontak", 16: "Status BPJS",
    18: "KTP", 19: "Buku Rekening", 20: "Surat Permohonan",
    21: "Surat Pernyataan (Satu Jenis & Bukan ASN/BUMN/BUMD/TNI/POLRI)",
    22: "Domisili Kelurahan", 23: "Formulir Pendataan", 24: "Berkas Pendukung",
    25: "Foto Plank", 26: "Foto Lokasi Ibadah", 27: "Foto Kegiatan",
    28: "Rekomendasi BKM", 29: "Rekomendasi Pengurus Rumah Ibadah",
    31: "Koordinat Lokasi", 40: "Unggah Domisili Rumah Ibadah",
  };
  return MAP[idx] || ("Kolom " + idx);
}

// Hitung umur berdasarkan patokan 1 Januari TAHUN_AKTIF (port hitungUmur_ Kode.gs baris 3112-3127)
export function hitungUmur(tglStr: string): number | null {
  try {
    const parts = tglStr.split(/[-/]/);
    if (parts.length < 3) return null;
    let d: number, m: number, y: number;
    if (parts[0].length === 4) {
      y = Number(parts[0]); m = Number(parts[1]); d = Number(parts[2]);
    } else {
      d = Number(parts[0]); m = Number(parts[1]); y = Number(parts[2]);
    }
    const lahir = new Date(y, m - 1, d);
    const patokan = new Date(TAHUN_AKTIF, 0, 1); // 1 Januari tahun aktif
    let umur = patokan.getFullYear() - lahir.getFullYear();
    const selisihBulan = patokan.getMonth() - lahir.getMonth();
    if (selisihBulan < 0 || (selisihBulan === 0 && patokan.getDate() < lahir.getDate())) umur--;
    return umur >= 0 ? umur : null;
  } catch (_e) {
    return null;
  }
}

// Konversi "dd-MM-yyyy" → "yyyy-MM-dd" untuk Postgres date type
export function tglDDMMYYYYkeISO(tglStr: string): string | null {
  try {
    const parts = tglStr.trim().split(/[-/]/);
    if (parts.length < 3) return null;
    if (parts[0].length === 4) return tglStr.trim(); // sudah ISO
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  } catch (_e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Port dari simpanDataKeSheet() — Kode.gs baris 970-1183.
//
// PERUBAHAN ARSITEKTUR DISENGAJA (Fase 4):
// Upload berkas ke Google Drive TETAP dilakukan oleh GAS (microservice upload),
// karena Drive write dari personal account tidak bisa dilakukan via Service Account/Edge Function.
// formObject.__linkBerkas = { fileKtp, fileBukuRekening, ... } berisi URL Drive yang sudah jadi
// (dihasilkan oleh panggilan terpisah ke GAS sebelum submit ke sini).
// formObject.__berkas (base64) TIDAK diproses di sini.
//
// Kontrak respons identik: { sukses, pesan } — tidak ada perubahan di frontend yang mengkonsumsi
// respons ini (index.html baris sekitar 3100-3140 hanya cek sukses/pesan).
// ---------------------------------------------------------------------------
// Hasil yang tersimpan di idempotency_keys -> objek { sukses, pesan }. Menerima jsonb objek (benar) maupun
// jsonb string (baris lama hasil double-encode); selain itu null supaya pemanggil lanjut proses normal.
function hasilIdempotensiSebagaiObjek(nilai: unknown): { sukses: boolean; pesan: string } | null {
  let h = nilai;
  if (typeof h === "string") {
    try {
      h = JSON.parse(h);
    } catch (_e) {
      return null;
    }
  }
  if (h && typeof h === "object" && "sukses" in h) return h as { sukses: boolean; pesan: string };
  return null;
}

export async function simpanDataKeSheet(token: string, formObject: Record<string, unknown>) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { sukses: false, pesan: e instanceof Error ? e.message : String(e) };
  }

  // ── Idempotency: cegah data dobel saat browser retry akibat timeout/koneksi putus ──
  // Frontend mengirim `idempotencyKey` (UUID v4) yang di-generate SEKALI saat tombol Konfirmasi
  // diklik. Jika request pertama berhasil tapi responsnya hilang di jalan (timeout/koneksi putus),
  // browser akan retry dengan kunci yang SAMA — dan server langsung beri tahu "sudah berhasil"
  // tanpa menulis data lagi.
  const idempotencyKey = typeof formObject.idempotencyKey === "string"
    ? formObject.idempotencyKey.trim()
    : null;

  if (idempotencyKey) {
    try {
      const existing = await sql`
        SELECT result FROM idempotency_keys WHERE key = ${idempotencyKey} LIMIT 1
      `;
      if (existing.length > 0) {
        // Sudah pernah diproses — kembalikan hasil asli tanpa tulis ulang. Baris yang ditulis versi
        // lama berupa jsonb STRING (double-encode, lihat catatan di penulisan bawah) -> di-parse dulu,
        // karena frontend membaca response.sukses dan string tidak punya properti itu.
        const hasilTersimpan = hasilIdempotensiSebagaiObjek(existing[0].result);
        if (hasilTersimpan) return hasilTersimpan;
      }
    } catch (_errIdempotency) {
      // Jika tabel belum ada / error DB sementara, lanjutkan proses normal (fail-open).
      // Tidak blokir user hanya karena cek idempotency gagal.
    }
  }

  try {
    // ── Pemetaan nilai form (port 1:1 dari Kode.gs baris 1011-1039) ──
    const nama = ((formObject.inputNama as string) || "").trim().toUpperCase();
    const nik = String(formObject.inputNik || "").trim();
    const jenisKelamin = ((formObject.selectGender as string) || "").trim().toUpperCase();
    const tempatLahir = ((formObject.inputTempatLahir as string) || "").trim().toUpperCase();
    const tglLahirRaw = (formObject.inputTglLahir as string) || "";
    const tanggalLahirISO = tglLahirRaw ? tglDDMMYYYYkeISO(tglLahirRaw) : null;
    const umurHitung = tglLahirRaw ? hitungUmur(tglLahirRaw) : -1;
    const alamat = ((formObject.inputAlamat as string) || "").trim().toUpperCase();
    const layanan = ((formObject.selectLayanan as string) || "").trim().toUpperCase();
    const tempatTugas = ((formObject.inputTempatTugas as string) || "").trim().toUpperCase();
    const alamatTugas = ((formObject.inputAlamatTugas as string) || "").trim().toUpperCase();
    // let: ditimpa hasil tentukanWilayahTugas() di bawah (wilayah tugas yang sah).
    let kecamatan = ((formObject.controlKecamatan as string) || "").trim().toUpperCase();
    let kelurahan = ((formObject.controlKelurahan as string) || "").trim().toUpperCase();
    // Formulir baru selalu mengirim field domisili (boleh kosong). Formulir lama (cache PWA)
    // tidak mengirimnya sama sekali -- di formulir lama kecamatan domisili = salinan kecamatan
    // tugas dan `controlKelurahan` = kelurahan domisili, jadi itulah default-nya.
    const formulirPunyaDomisili = "inputKecamatanDomisili" in formObject;
    let kecamatanDomisili = formulirPunyaDomisili
      ? rapikanTeks(formObject.inputKecamatanDomisili)
      : kecamatan;
    let kelurahanDomisili = formulirPunyaDomisili
      ? rapikanTeks(formObject.inputKelurahanDomisili)
      : kelurahan;
    const namaRekening = ((formObject.inputNamaRekening as string) || "").trim().toUpperCase();
    const nomorRekening = String(formObject.inputNoRekening || "").trim();
    const kantorCabang = ((formObject.inputKantorCabang as string) || "").trim().toUpperCase();
    const noKontak = String(formObject.inputNoKontak || "").trim();
    const statusBpjs = ((formObject.selectBpjs as string) || "").trim().toUpperCase();
    let koordinatLink = ((formObject.koordinatLink as string) || "").trim();
    const catatanPerbedaanNama = ((formObject.catatanPerbedaanNama as string) || "").trim();

    // Link berkas dari GAS microservice upload (bukan base64)
    const L = (formObject.__linkBerkas as Record<string, string>) || {};
    const linkKtp = L.fileKtp || "";
    const linkBukuRekening = L.fileBukuRekening || "";
    const linkSuratPermohon = L.fileSuratPermohon || "";
    const linkPernyataan = L.filePernyataan || "";
    const linkDomisili = L.fileDomisili || "";
    const linkFormulirPendataan = L.fileBerkasPendukung || "";
    const linkBerkasPendukung = L.fileBerkasPendukung2 || "";
    const linkFotoPlank = L.fileFotoPlank || "";
    const linkFotoIbadah = L.fileFotoIbadah || "";
    const linkFotoKegiatan = L.fileFotoKegiatan || "";
    const linkRekomendasiBkm = L.fileRekomendasiBkm || "";
    const linkRekomendasiRi = L.fileRekomendasiRi || "";
    const linkDomisiliRumahIbadah = L.fileDomisiliRumahIbadah || "";
    const idFolderBerkas = L.idFolderBerkas || "";

    // ── Otorisasi server-side: RBAC layanan+kecamatan (port Kode.gs baris 1057-1072) ──
    const peranSesi = (sesi.role || "").toString().trim().toUpperCase();
    const listLayananKemenag = await daftarLayananKemenagUpper();

    if (peranSesi === "MUI") {
      // Akun MUI menginput se-Kota Medan (tanpa kecamatan sesi), tetapi HANYA layanan Ustadz/Ustadzah.
      // Penegakan di server; dropdown/tombol di browser hanya kenyamanan.
      if (!layananBolehDiinputMui(layanan)) {
        return { sukses: false, pesan: "GAGAL: Akun MUI hanya berwenang mengisi layanan Ustadz dan Ustadzah." };
      }
    } else if (peranSesi !== "UTAMA") {
      if (peranSesi === "KECAMATAN") {
        if (listLayananKemenag.includes(layanan)) {
          return { sukses: false, pesan: "GAGAL: Akun Kecamatan tidak berwenang mengisi layanan Kemenag." };
        }
        if (!(sesi.kecamatan || "").toString().trim()) {
          return { sukses: false, pesan: "GAGAL: Akun Anda belum terdaftar untuk kecamatan mana pun. Hubungi admin utama." };
        }
      } else if (layanan !== peranSesi) {
        return { sukses: false, pesan: `GAGAL: Akun Anda hanya berwenang mengisi layanan "${sesi.role}".` };
      }
      const kecSesi = (sesi.kecamatan || "").toString().trim().toUpperCase();
      if (kecSesi && kecamatan !== kecSesi) {
        return { sukses: false, pesan: "GAGAL: Akun Anda hanya berwenang mengisi data untuk Kecamatan " + kecSesi + "." };
      }
    }

    // ── Cek sakelar tutup (port Kode.gs baris 1074-1085), kini juga jadwal timer + masa tenggang ──
    {
      const keputusan = await periksaIzinInput(sesi, "simpan", listLayananKemenag);
      if (!keputusan.izin) return keputusan.respons;
    }

    // ── Validasi server (port Kode.gs baris 1087-1100) ──
    // Tanggal lahir: kalender sah, tahun >= 1900, tidak di masa depan, umur 18-100 (validasiPenerima.ts; berlaku utk semua peran).
    const cekTglLahir = periksaTanggalLahir(tglLahirRaw, { tahunAktif: TAHUN_AKTIF, hariIni: tanggalHariIniWIB() });
    if (!cekTglLahir.ok) return { sukses: false, pesan: cekTglLahir.pesan };
    if (!nama || nik.length !== 16 || nomorRekening.length !== 14 || !layanan || !kecamatan) {
      return { sukses: false, pesan: "GAGAL: Data wajib tidak lengkap atau format NIK/Rekening salah." };
    }

    // Koordinat lokasi (plans/plan-koordinat-lokasi-pintar.md): untuk layanan Guru WAJIB koordinat/tautan Maps yang sah. Server menjadi
    // penentu terakhir (layar bisa dilewati / halaman lama masih mengirim teks bebas); nilai disimpan dalam bentuk ternormalisasi.
    // Sengaja SESUDAH cek hak akses & data wajib: peran yang tidak berhak tetap menerima pesan hak-akses, bukan pesan koordinat.
    if (layananWajibKoordinat(layanan)) {
      const hk = normalisasiKoordinat(koordinatLink);
      if (!hk.ok) return { sukses: false, pesan: "GAGAL: Koordinat lokasi tidak valid. " + hk.pesan };
      koordinatLink = hk.tautan;
    }

    // ── Wilayah tugas: kecamatan & kelurahan dari rumah ibadah / sesi login (lihat wilayahTugas.ts) ──
    // Dijalankan SEBELUM cek kuota supaya kuota dihitung pada kecamatan tugas yang sah.
    const wilayahTugas = await tentukanWilayahTugas({ sesi, layanan, tempatTugas, alamatTugas, kecamatan, kelurahan });
    if (!wilayahTugas.ok) return { sukses: false, pesan: wilayahTugas.pesan };
    kecamatan = wilayahTugas.kecamatan;
    kelurahan = wilayahTugas.kelurahan;
    // Tautan ke rumah ibadah (plans/plan-penautan-rumah-ibadah-id.md): ID bila tempat tugas + alamat persis satu rumah ibadah
    // terdaftar, selain itu null (RUMAH/LAINNYA/layanan tempat bebas). Server yang menentukan -- klien tidak perlu mengirim ID.
    const rumahIbadahId = pilihRumahIbadahId(await cariRumahIbadah(tempatTugas, alamatTugas), kecamatan, kelurahan);

    // ── Domisili: kosong (formulir lama / tidak diisi) -> ikut wilayah tugas. Kewajiban mengisi
    // ditegakkan formulir (required); server hanya memvalidasi pasangan yang benar-benar dikirim.
    const domisiliDikirim = formulirPunyaDomisili && !!kecamatanDomisili && !!kelurahanDomisili;
    if (formulirPunyaDomisili && !!kecamatanDomisili !== !!kelurahanDomisili) {
      // Hanya separuh terisi (mis. daftar kelurahan gagal dimuat): tolak, jangan diam-diam diganti.
      return { sukses: false, pesan: "GAGAL: Kecamatan dan kelurahan domisili wajib diisi lengkap." };
    }
    if (!kecamatanDomisili || !kelurahanDomisili) {
      kecamatanDomisili = kecamatan;
      kelurahanDomisili = kelurahan;
    }
    if (domisiliDikirim && !(await kelurahanAdaDiKecamatan(kecamatanDomisili, kelurahanDomisili))) {
      return {
        sukses: false,
        pesan: "GAGAL: Kelurahan domisili " + kelurahanDomisili + " tidak berada di Kecamatan " + kecamatanDomisili + ".",
      };
    }

    // Validasi akhir secara paralel untuk efisiensi (tanpa full round-trip validasiDataBaru internal)
    const cekTempatTugasRelevan = LAYANAN_BATASI_TEMPAT_TUGAS.includes(layanan);
    const tempatTugasTarget = rapikanTeks(tempatTugas);
    const alamatTugasTarget = rapikanTeks(alamatTugas);

    const [rowsNik, rowsRek, rowsTempat, hasilKuota] = await Promise.all([
      sql`select id from penerima where tahun = ${TAHUN_AKTIF} and nik = ${nik} limit 1`,
      sql`select id from penerima where tahun = ${TAHUN_AKTIF} and nomor_rekening = ${nomorRekening} limit 1`,
      cekTempatTugasRelevan
        ? sql`
            select id from penerima
            where tahun = ${TAHUN_AKTIF} and layanan = ${layanan}
              and tempat_tugas = ${tempatTugasTarget} and alamat_tugas = ${alamatTugasTarget}
            limit 1
          `
        : Promise.resolve([]),
      cekKuotaTersedia(kecamatan, layanan)
    ]);

    if (rowsNik.length > 0) return { sukses: false, pesan: "GAGAL: NIK sudah terdaftar (race condition). Coba lagi." };
    if (rowsRek.length > 0) return { sukses: false, pesan: "GAGAL: Nomor rekening sudah terdaftar (race condition). Coba lagi." };
    if (rowsTempat.length > 0) return { sukses: false, pesan: "GAGAL: Tempat tugas sudah memiliki penerima untuk layanan ini (race condition). Coba lagi." };

    if (!hasilKuota.tersedia) {
      return {
        sukses: false,
        pesan: hasilKuota.pesan,
        kuotaHabis: true,
      };
    }

    // ── Rekomendasi MUI untuk data yang DIINPUT akun MUI sendiri: langsung "Sesuai" (keputusan K4a, 2026-10-20) ──
    // MUI tidak perlu memeriksa inputnya sendiri, dan antrean "Belum Diperiksa" tidak terisi data miliknya.
    // Berkas tetap diverifikasi Admin Utama seperti biasa. Petugas = nama akun yang MENYIMPAN (dibaca dari
    // tabel akun; objek sesi tidak membawa nama lengkap). Input peran lain memakai nilai bawaan kolom.
    let rekomStatus = "BELUM_DIPERIKSA";
    let rekomPetugas: string | null = null;
    let rekomTgl: Date | null = null;
    let rekomCatatan: string | null = null;
    if (peranSesi === "MUI") {
      const rowsAkun = await sql`select nama_lengkap, username from akun where id = ${sesi.akunId} limit 1`;
      const namaAkun = String(rowsAkun[0]?.nama_lengkap || "").trim() || String(rowsAkun[0]?.username || "").trim();
      rekomStatus = "SESUAI";
      rekomPetugas = namaAkun || "MUI Kota Medan";
      rekomTgl = new Date();
      rekomCatatan = "Diinput langsung oleh akun MUI";
    }

    // ── Hitung nomor urut & INSERT ke Postgres dengan retry otomatis jika terjadi tabrakan nomor urut ──
    // (Serial per tahun dengan unique index uq_penerima_nomor_urut. Jika dua operator submit bersamaan,
    // percobaan kedua/ketiga akan menghitung ulang nomor urut baru secara instan).
    let insertSukses = false;
    const maksPercobaan = 3;
    let lastError: unknown = null;

    for (let percobaan = 0; percobaan < maksPercobaan; percobaan++) {
      try {
        const rowsNomor = await sql`
          select coalesce(max(nomor_urut), 0) + 1 as next_nomor
          from penerima where tahun = ${TAHUN_AKTIF}
        `;
        const nomorUrut = Number(rowsNomor[0]?.next_nomor) || 1;

        // deno-lint-ignore no-explicit-any
        await sql.begin(async (trx: any) => {
          await trx`
            insert into penerima (
              tahun, nomor_urut,
              nama, nik, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat,
              layanan, tempat_tugas, alamat_tugas, kecamatan, kelurahan,
              nama_rekening, nomor_rekening, kantor_cabang, no_kontak, status_bpjs_tk, umur,
              link_ktp, link_buku_rekening, link_surat_permohonan, link_pernyataan_satu_bantuan,
              link_domisili_kelurahan, link_formulir_pendataan, link_berkas_pendukung,
              link_foto_plank_rumah_ibadah, link_foto_lokasi_ibadah, link_foto_kegiatan_belajar,
              link_rekomendasi_bkm, link_rekomendasi_rumah_ibadah, link_domisili_rumah_ibadah,
              id_folder_berkas, link_koordinat_lokasi, rumah_ibadah_id,
              status_verifikasi, catatan_perbedaan_nama,
              dibuat_oleh_akun_id, sync_status,
              kecamatan_domisili, kelurahan_domisili,
              status_rekomendasi_mui, petugas_rekomendasi_mui, tgl_rekomendasi_mui, catatan_rekomendasi_mui
            ) values (
              ${TAHUN_AKTIF}, ${nomorUrut},
              ${nama}, ${nik}, ${jenisKelamin}, ${tempatLahir}, ${tanggalLahirISO}, ${alamat},
              ${layanan}, ${rapikanTeks(tempatTugas)}, ${rapikanTeks(alamatTugas)},
              ${kecamatan}, ${kelurahan},
              ${namaRekening}, ${nomorRekening}, ${kantorCabang}, ${noKontak}, ${statusBpjs},
              ${umurHitung},
              ${linkKtp}, ${linkBukuRekening}, ${linkSuratPermohon}, ${linkPernyataan},
              ${linkDomisili}, ${linkFormulirPendataan}, ${linkBerkasPendukung},
              ${linkFotoPlank}, ${linkFotoIbadah}, ${linkFotoKegiatan},
              ${linkRekomendasiBkm}, ${linkRekomendasiRi}, ${linkDomisiliRumahIbadah},
              ${idFolderBerkas}, ${koordinatLink}, ${rumahIbadahId},
              'Proses Verifikasi', ${catatanPerbedaanNama},
              ${sesi.akunId}, 'SUKSES',
              ${kecamatanDomisili}, ${kelurahanDomisili},
              ${rekomStatus}, ${rekomPetugas}, ${rekomTgl}, ${rekomCatatan}
            )
            returning id
          `;
        });

        insertSukses = true;
        break;
      } catch (err) {
        lastError = err;
        const msgErr = String(err);
        // Postgres melaporkan nama indeks PARTISI yang bertabrakan (penerima_<TAHUN>_tahun_nomor_urut_idx), BUKAN nama
        // indeks induk (uq_penerima_nomor_urut, yang hanya "ON ONLY" pada tabel berpartisi). Dulu hanya nama induk yang
        // dicocokkan sehingga coba-ulang ini tidak pernah jalan dan penyimpan kedua melihat "Gagal Sistem: duplicate key".
        // Pola yang sama dgn penanganan indeks rekening/tempat tugas di blok catch bawah (nama berubah per tahun).
        if (/uq_penerima_nomor_urut|penerima(_\d{4})?_tahun_nomor_urut_idx/.test(msgErr) && percobaan < maksPercobaan - 1) {
          // Jeda acak (jitter 40-120ms) agar tidak bentrok lagi
          await new Promise((res) => setTimeout(res, 40 + Math.random() * 80));
          continue;
        }
        throw err;
      }
    }

    if (!insertSukses) throw lastError;

    const hasilSimpan = { sukses: true, pesan: "Data dan berkas berhasil disimpan ke Database!" };

    // Simpan idempotency key agar retry berikutnya (jika koneksi tadi putus) langsung beri tahu sukses.
    // PENTING: pakai sql.json(), JANGAN `${JSON.stringify(x)}::jsonb` -- postgres.js menyerialkan parameter
    // bertipe jsonb dengan JSON.stringify lagi, sehingga yang tersimpan adalah jsonb STRING ("{\"sukses\":..}")
    // dan saat retry hasilnya kembali sebagai teks, bukan objek (frontend lalu menampilkan "Gagal menyimpan").
    if (idempotencyKey) {
      try {
        await sql`
          INSERT INTO idempotency_keys (key, result) VALUES (${idempotencyKey}, ${sql.json(hasilSimpan)})
          ON CONFLICT (key) DO NOTHING
        `;
      } catch (_e) {
        // Gagal simpan key tidak perlu menghentikan proses — data sudah masuk, ini hanya safety net.
      }
    }

    return hasilSimpan;

  } catch (error) {
    // Tangkap pelanggaran unique constraint (NIK/rekening/tempat tugas ganda lewat race condition).
    // PENTING: index rekening & tempat-tugas dipindah ke partisi tahun aktif dan namanya jadi
    // "uq_penerima_<TAHUN>_..." (mis. uq_penerima_2027_rekening) sejak migrasi
    // 20260914150000_longgarkan_tempat_tugas_arsip.sql / 20260914151500_longgarkan_rekening_arsip.sql
    // -- match pola dgn regex (bukan string literal lama) supaya tetap kena walau tahun aktif
    // berganti (uq_penerima_2028_rekening, dst). uq_penerima_nik TIDAK dipindah (tetap di tabel
    // induk), jadi namanya tetap tanpa tahun.
    const msg = String(error);
    if (msg.includes("uq_penerima_nik")) {
      return { sukses: false, pesan: "GAGAL: NIK sudah terdaftar (race condition). Coba lagi." };
    }
    if (/uq_penerima(_\d{4})?_rekening/.test(msg)) {
      return { sukses: false, pesan: "GAGAL: Nomor rekening sudah terdaftar (race condition). Coba lagi." };
    }
    if (/uq_penerima(_\d{4})?_tempat_tugas/.test(msg)) {
      return {
        sukses: false,
        pesan: "GAGAL: Tempat tugas sudah memiliki penerima untuk layanan ini (race condition). Coba lagi.",
      };
    }
    return { sukses: false, pesan: "Gagal Sistem: " + msg };
  }
}

// ---------------------------------------------------------------------------
// Port dari editDataPenerima() — Kode.gs baris 2582-2763.
//
// PERUBAHAN ARSITEKTUR DISENGAJA (Fase 4):
// - `nomorBarisAsli` ditafsirkan sebagai `penerima.id` (bukan nomor baris sheet) — konsisten
//   dengan ambilDetailPenerimaPerBaris di atas.
// - Kolom berkas menerima URL Drive langsung (bukan base64) di editData.berkas[idx].
//   Frontend mengirim link baru setelah upload terpisah ke GAS microservice.
// - Hak akses edit menggunakan lolosAksesBarisLihatData (pengerasan RBAC konsisten).
// ---------------------------------------------------------------------------
export async function editDataPenerima(
  token: string,
  nomorBarisAsli: number,
  editData: {
    teks?: Record<string, string>;
    berkas?: Record<string, string>; // idx → URL Drive baru (bukan base64)
    idFolderBerkas?: string; // folder Drive baru dari uploadSemuaBerkasKeDrive, kalau baris belum punya
  },
) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { sukses: false, pesan: e instanceof Error ? e.message : String(e) };
  }

  const id = Number(nomorBarisAsli);
  if (!id) return { sukses: false, pesan: "Nomor baris tidak valid." };

  try {
    // Ambil data baris saat ini
    const rows = await sql`
      select * from penerima where id = ${id} and tahun = ${TAHUN_AKTIF} limit 1
    `;
    if (rows.length === 0) return { sukses: false, pesan: "Baris tidak ditemukan." };
    const rowLama = rows[0];

    // ── Cek hak akses edit — RBAC identik dengan baca (lolosAksesBarisLihatData) ──
    const { instansiPengguna, layananPengguna, listLayananKemenag } = await resolveInstansiPengguna(sesi.role);
    if (!instansiPengguna) return { sukses: false, pesan: "Anda tidak berhak mengedit data ini." };

    const bolehEdit = lolosAksesBarisLihatData({
      instansiPengguna,
      layananPengguna,
      namaKecamatanPengguna: sesi.kecamatan || "",
      kelurahanTerkunci: kelurahanTerkunciDari(sesi),
      subFilterGsm: subFilterGsmDari(sesi),
      listLayananKemenag,
      layananSheet: (rowLama.layanan || "").toString().toUpperCase(),
      kecamatanSheet: (rowLama.kecamatan || "").toString().toUpperCase(),
      kelurahanSheet: (rowLama.kelurahan || "").toString().toUpperCase(),
      tempatTugasSheet: (rowLama.tempat_tugas || "").toString().toUpperCase(),
    });
    if (!bolehEdit) return { sukses: false, pesan: "Anda tidak berhak mengedit data ini." };

    // ── Cek sakelar tutup (port Kode.gs baris 2618-2632) ──
    const peranSesi = (sesi.role || "").toString().trim().toUpperCase();
    if (peranSesi === "MUI") {
      // MUI hanya boleh mengubah data Ustadz/Ustadzah yang DIA input sendiri (akun yang sama, bukan akun MUI lain).
      // Data milik Kecamatan tetap hanya dilihat + diverifikasi rekomendasinya.
      const milikSendiri = !!rowLama.dibuat_oleh_akun_id && String(rowLama.dibuat_oleh_akun_id) === String(sesi.akunId);
      if (!milikSendiri || !layananBolehDiinputMui(rowLama.layanan)) {
        return { sukses: false, pesan: "Akses ditolak: Akun MUI hanya dapat mengubah data Ustadz/Ustadzah yang diinputnya sendiri." };
      }
    }
    {
      const keputusan = await periksaIzinInput(sesi, "edit", listLayananKemenag);
      if (!keputusan.izin) return keputusan.respons;
    }

    const teks = editData.teks || {};
    const berkas = editData.berkas || {};

    // ── Validasi duplikat bila NIK/rekening/tempat-tugas berubah (port Kode.gs baris 2656-2687) ──
    const nikBaruEdit = teks[2] !== undefined ? String(teks[2]).trim() : (rowLama.nik || "").toString().trim();
    const rekBaruEdit = teks[13] !== undefined ? String(teks[13]).trim() : (rowLama.nomor_rekening || "").toString().trim();
    const tempatTugasBaruEdit = rapikanTeks(teks[8] !== undefined ? teks[8] : rowLama.tempat_tugas);
    const alamatTugasBaruEdit = rapikanTeks(teks[9] !== undefined ? teks[9] : rowLama.alamat_tugas);
    const nikBerubah = teks[2] !== undefined && nikBaruEdit !== (rowLama.nik || "").toString().trim();
    const rekBerubah = teks[13] !== undefined && rekBaruEdit !== (rowLama.nomor_rekening || "").toString().trim();
    const tempatBerubah =
      tempatTugasBaruEdit !== rapikanTeks(rowLama.tempat_tugas) ||
      alamatTugasBaruEdit !== rapikanTeks(rowLama.alamat_tugas);
    const layananSheet = (rowLama.layanan || "").toString().trim().toUpperCase();

    if (nikBerubah) {
      const cekNik = await sql`
        select id from penerima
        where tahun = ${TAHUN_AKTIF} and nik = ${nikBaruEdit} and id <> ${id} limit 1
      `;
      if (cekNik.length > 0) {
        return { sukses: false, pesan: "GAGAL: NIK " + nikBaruEdit + " sudah terdaftar." };
      }
    }
    if (rekBerubah && rekBaruEdit) {
      const cekRek = await sql`
        select id from penerima
        where tahun = ${TAHUN_AKTIF} and nomor_rekening = ${rekBaruEdit} and id <> ${id} limit 1
      `;
      if (cekRek.length > 0) {
        return { sukses: false, pesan: "GAGAL: Nomor rekening " + rekBaruEdit + " sudah digunakan." };
      }
    }
    if (tempatBerubah && LAYANAN_BATASI_TEMPAT_TUGAS.includes(layananSheet)) {
      const cekTempat = await sql`
        select nama from penerima
        where tahun = ${TAHUN_AKTIF} and layanan = ${layananSheet}
          and tempat_tugas = ${tempatTugasBaruEdit} and alamat_tugas = ${alamatTugasBaruEdit}
          and id <> ${id}
        limit 1
      `;
      if (cekTempat.length > 0) {
        return {
          sukses: false,
          pesan: "GAGAL: " + tempatTugasBaruEdit + " sudah memiliki penerima untuk layanan " +
            layananSheet + " atas nama " + cekTempat[0].nama + ".",
        };
      }
    }

    // ── Layanan wajib-daftar: pasangan tempat tugas + alamat yang BARU harus persis rumah ibadah terdaftar (hanya dicek bila
    // tempat ATAU alamat tugas berubah, supaya edit kolom lain pada data lama yang belum cocok tidak tiba-tiba gagal). Semua peran. ──
    if (tempatBerubah) {
      const cekDaftar = await periksaTempatTugasDariDaftar(layananSheet, tempatTugasBaruEdit, alamatTugasBaruEdit);
      if (!cekDaftar.ok) return { sukses: false, pesan: cekDaftar.pesan };
    }

    // ── Wilayah tugas saat edit (kecamatan tidak bisa diedit; hanya dicek bila tempat tugas /
    // kelurahan BERUBAH, supaya edit kolom lain pada data lama tidak tiba-tiba gagal) ──
    // Kelurahan tugas TIDAK BOLEH dikosongkan oleh siapa pun, termasuk Admin Utama
    // (plans/plan-perbaikan-validasi-data-penerima.md, G4).
    const kelurahanEditBaru = teks[11] !== undefined ? rapikanTeks(teks[11]) : "";
    const kelurahanEditBerubah = teks[11] !== undefined && kelurahanEditBaru !== rapikanTeks(rowLama.kelurahan);
    if (kelurahanEditBerubah && !kelurahanEditBaru) {
      return { sukses: false, pesan: "GAGAL: Kelurahan wilayah tugas wajib dipilih." };
    }
    if (peranSesi === "UTAMA" && kelurahanEditBerubah) {
      const kecBarisUtama = rapikanTeks(rowLama.kecamatan);
      if (!(await kelurahanAdaDiKecamatan(kecBarisUtama, kelurahanEditBaru))) {
        return { sukses: false, pesan: "GAGAL: Kelurahan " + kelurahanEditBaru + " tidak berada di Kecamatan " + kecBarisUtama + "." };
      }
    }
    if (peranSesi !== "UTAMA") {
      const kecBaris = rapikanTeks(rowLama.kecamatan);
      const kelTerkunci = rapikanTeks(kelurahanTerkunciDari(sesi));
      if (tempatBerubah) {
        const lokasi = await cariRumahIbadah(tempatTugasBaruEdit, alamatTugasBaruEdit);
        if (lokasi.length > 0 && !lokasi.some((l) => l.kecamatan === kecBaris)) {
          return {
            sukses: false,
            pesan: "GAGAL: " + tempatTugasBaruEdit + " tercatat di Kec. " + lokasi[0].kecamatan +
              ", Kel. " + lokasi[0].kelurahan + " -- berbeda dari kecamatan data ini (" + kecBaris + ").",
          };
        }
        // Akun kelurahan: rumah ibadah baru wajib di kelurahannya sendiri (kelurahan kosong di data
        // rumah ibadah tidak dianggap pelanggaran), sama seperti saat input.
        const kelRumahIbadah = lokasi
          .filter((l) => l.kecamatan === kecBaris && l.kelurahan)
          .map((l) => l.kelurahan);
        if (kelTerkunci && kelRumahIbadah.length > 0 && !kelRumahIbadah.includes(kelTerkunci)) {
          return {
            sukses: false,
            pesan: "GAGAL: " + tempatTugasBaruEdit + " tercatat di Kel. " + kelRumahIbadah.join(" / ") +
              " -- di luar kelurahan akun Anda (Kelurahan " + kelTerkunci + ").",
          };
        }
      }
      const kelBaruEdit = teks[11] !== undefined ? rapikanTeks(teks[11]) : "";
      if (teks[11] !== undefined && kelBaruEdit !== rapikanTeks(rowLama.kelurahan)) {
        if (kelTerkunci && kelBaruEdit !== kelTerkunci) {
          return { sukses: false, pesan: "GAGAL: Akun Anda hanya berwenang mengisi data untuk Kelurahan " + kelTerkunci + "." };
        }
        if (!(await kelurahanAdaDiKecamatan(kecBaris, kelBaruEdit))) {
          return { sukses: false, pesan: "GAGAL: Kelurahan " + kelBaruEdit + " tidak berada di Kecamatan " + kecBaris + "." };
        }
      }
    }

    // Validasi tanggal lahir bila berubah (port Kode.gs baris 2682-2687, diperketat: kalender sah, tahun >= 1900,
    // tidak di masa depan, umur 18-100; sebelumnya hanya umur < 18 sehingga tahun 0199 dan tanggal masa depan lolos).
    if (teks[5] !== undefined) {
      const cekTglEdit = periksaTanggalLahir(String(teks[5]).trim(), { tahunAktif: TAHUN_AKTIF, hariIni: tanggalHariIniWIB() });
      if (!cekTglEdit.ok) return { sukses: false, pesan: cekTglEdit.pesan };
    }

    // ── Bangun SET clause dinamis ──
    const riwayat: Array<{ kolom: number; label: string; sebelum: string; sesudah: string }> = [];
    // deno-lint-ignore no-explicit-any
    const setValues: Record<string, any> = {};

    // Perubahan teks (port Kode.gs baris 2689-2713)
    let koordinatDiubah = false;
    for (const idxStr of Object.keys(teks)) {
      const idx = Number(idxStr);
      const namaKolom = MAP_IDX_KE_KOLOM_TEKS[idx];
      if (!namaKolom) continue;

      let nilaiBaru: string = String(teks[idxStr] || "").trim();
      if (idx === 31) {
        // Koordinat lokasi: hanya layanan Guru; wajib sah (tautan Maps / angka koordinat / Plus Code) dan disimpan ternormalisasi.
        if (!layananWajibKoordinat(layananSheet)) continue;
        const hk = normalisasiKoordinat(nilaiBaru);
        if (!hk.ok) return { sukses: false, pesan: "GAGAL: Koordinat lokasi tidak valid. " + hk.pesan };
        nilaiBaru = hk.tautan;
      } else if (![2, 13, 15].includes(idx)) {
        // Uppercase kecuali kolom numerik/kontak (NIK=2, rekening=13, kontak=15)
        nilaiBaru = nilaiBaru.toUpperCase();
      }

      const nilaiLama = (rowLama[namaKolom] !== null && rowLama[namaKolom] !== undefined)
        ? rowLama[namaKolom].toString().trim()
        : "";

      if (nilaiLama === nilaiBaru) continue;

      if (idx === 5) {
        // Tanggal lahir: konversi ke ISO untuk Postgres
        const isoDate = tglDDMMYYYYkeISO(nilaiBaru);
        if (isoDate) {
          setValues["tanggal_lahir"] = isoDate;
          // Hitung ulang umur sekaligus (port Kode.gs baris 2708-2713)
          const umurBaru = hitungUmur(nilaiBaru);
          if (umurBaru !== null) setValues["umur"] = umurBaru;
        }
      } else {
        setValues[namaKolom] = nilaiBaru;
      }
      if (idx === 31) koordinatDiubah = true;

      riwayat.push({ kolom: idx, label: labelKolom(idx), sebelum: nilaiLama, sesudah: nilaiBaru });
    }

    // Perubahan berkas (port Kode.gs baris 2715-2747)
    // Menerima URL Drive langsung; upload sudah dilakukan di GAS microservice oleh frontend
    let berkasBerganti = 0;
    for (const idxStr of Object.keys(berkas)) {
      const idx = Number(idxStr);
      const namaKolom = MAP_IDX_KE_KOLOM_BERKAS[idx];
      if (!namaKolom) continue;

      const linkBaru = String(berkas[idxStr] || "").trim();
      if (!linkBaru) continue;

      const linkLama = (rowLama[namaKolom] || "").toString().trim();
      if (linkLama === linkBaru) continue;

      setValues[namaKolom] = linkBaru;
      berkasBerganti++;
      riwayat.push({
        kolom: idx, label: labelKolom(idx),
        sebelum: linkLama ? "[link lama]" : "-",
        sesudah: "[link baru]",
      });
    }

    // Tautan rumah ibadah ikut diperbarui hanya bila tempat/alamat tugas berubah (plans/plan-penautan-rumah-ibadah-id.md);
    // null bila tempat yang baru bukan rumah ibadah terdaftar. Edit kolom lain tidak menyentuh tautan.
    if (setValues["tempat_tugas"] !== undefined || setValues["alamat_tugas"] !== undefined) {
      const tempatAkhir = setValues["tempat_tugas"] !== undefined ? setValues["tempat_tugas"] : rowLama.tempat_tugas;
      const alamatAkhir = setValues["alamat_tugas"] !== undefined ? setValues["alamat_tugas"] : rowLama.alamat_tugas;
      const kelurahanAkhir = setValues["kelurahan"] !== undefined ? setValues["kelurahan"] : rowLama.kelurahan;
      setValues["rumah_ibadah_id"] = pilihRumahIbadahId(
        await cariRumahIbadah(tempatAkhir, alamatAkhir), rowLama.kecamatan, kelurahanAkhir,
      );
    }

    // Plan wajib lapor perbaikan (2026-10-22): user (bukan Admin Utama) mengganti berkas pada data Berkas Tidak Lengkap ->
    // catat waktunya di server supaya Admin Utama tahu walau user menutup tab sebelum menekan "Laporkan Sudah Diperbaiki".
    // Status dibaca dari baris yang sudah dimuat di atas (tanpa query baru). Perubahan teks saja TIDAK memicu.
    if ((berkasBerganti > 0 || koordinatDiubah) && peranSesi !== "UTAMA" && rowLama.status_verifikasi === "Berkas Tidak Lengkap") {
      setValues["tanggal_berkas_diubah"] = new Date().toISOString();
    }

    // Kalau berkas di-upload lebih dulu lewat uploadSemuaBerkasKeDrive dan baris ini belum punya
    // folder tersimpan (data lama), simpan ID folder yang baru dibuat — supaya edit berikutnya
    // reuse folder yang sama (port dari perilaku yang sama di Kode.gs editDataPenerima).
    if (editData.idFolderBerkas && !(rowLama.id_folder_berkas || "").toString().trim()) {
      setValues["id_folder_berkas"] = editData.idFolderBerkas;
    }

    if (Object.keys(setValues).length === 0) {
      return { sukses: true, pesan: "Data berhasil diperbarui (0 kolom diubah).", berkasDiubah: 0 };
    }

    setValues["diperbarui_at"] = new Date().toISOString();

    // Bangun query UPDATE dinamis — postgres.js tidak mendukung dynamic SET via tagged template
    // sehingga kita gunakan sql.unsafe() dengan placeholder $N yang aman dari injection.
    const setCols = Object.keys(setValues);
    // deno-lint-ignore no-explicit-any
    const setVals = setCols.map((k) => setValues[k]);
    const setParts = setCols.map((col, i) => `${col} = $${i + 1}`).join(", ");
    const whereIdx = setCols.length + 1;

    // UPDATE data penerima secara langsung di Postgres, DAN salinannya di data_detail untuk kolom yang disalin (KOLOM_SALINAN_DATA_DETAIL).
    // Dulu hanya `penerima` yang diubah sehingga Data Detail/cover/sumber Pembayaran tertinggal (mis. rekening atau nama yang sudah dikoreksi
    // petugas). Satu transaksi: salah satu gagal = tidak ada yang berubah. Baris data_detail belum ada (belum "Memenuhi Syarat") -> UPDATE
    // 0 baris, aman. Di dalam sql.begin hanya boleh memakai `trx` (pool 2 koneksi; lihat _shared/db.ts).
    const kolomDetail = setCols.filter((c) => KOLOM_SALINAN_DATA_DETAIL.has(c));
    // deno-lint-ignore no-explicit-any
    await sql.begin(async (trx: any) => {
      await trx.unsafe(
        `update penerima set ${setParts} where id = $${whereIdx} and tahun = $${whereIdx + 1}`,
        [...setVals, id, TAHUN_AKTIF],
      );
      if (kolomDetail.length > 0) {
        // Nama kolom datang dari daftar tetap KOLOM_SALINAN_DATA_DETAIL -- bukan dari input pengguna.
        const setDetail = kolomDetail.map((c, i) => `${c} = $${i + 1}`).join(", ");
        await trx.unsafe(
          `update data_detail set ${setDetail}, diperbarui_at = now() where penerima_id = $${kolomDetail.length + 1} and tahun = $${kolomDetail.length + 2}`,
          [...kolomDetail.map((c) => setValues[c]), id, TAHUN_AKTIF],
        );
      }
    });

    // ── Catat riwayat edit (port catatRiwayatEdit_ Kode.gs baris 3129-3146) ──
    if (riwayat.length > 0) {
      const namaPenerima = (rowLama.nama || "").toString().trim();
      for (const r of riwayat) {
        // Fire-and-forget: gagal catat riwayat TIDAK menggagalkan edit (sama seperti Kode.gs)
        sql`
          insert into riwayat_edit
            (waktu, editor_username, editor_role, penerima_id, tahun, nama_penerima,
             kolom_diubah, sebelum, sesudah)
          values (now(), ${sesi.username}, ${sesi.role}, ${id}, ${TAHUN_AKTIF},
                  ${namaPenerima}, ${r.label}, ${r.sebelum}, ${r.sesudah})
        `.catch((_e: unknown) => { /* diabaikan, sama seperti Logger.log di Kode.gs */ });
      }
    }

    return { sukses: true, pesan: `Data berhasil diperbarui (${riwayat.length} kolom diubah).`, berkasDiubah: berkasBerganti + (koordinatDiubah ? 1 : 0) };
  } catch (e) {
    return { sukses: false, pesan: "Gagal mengedit data: " + String(e) };
  }
}

/**
 * Simpan status dan catatan verifikasi rekomendasi MUI oleh akun MUI atau Admin Utama.
 * Khusus untuk layanan Ustadz dan Ustadzah.
 */
export async function simpanCatatanRekomendasiMui(
  token: string,
  nomorBarisAsli: number,
  statusRekomendasi: string,
  catatan: string,
) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { sukses: false, pesan: e instanceof Error ? e.message : String(e) };
  }

  const role = (sesi.role || "").toString().trim().toUpperCase();
  if (role !== "MUI" && role !== "UTAMA") {
    return { sukses: false, pesan: "Akses ditolak: hanya akun MUI dan Admin Utama yang berhak memverifikasi rekomendasi MUI." };
  }

  const id = Number(nomorBarisAsli);
  if (!id) return { sukses: false, pesan: "Nomor baris tidak valid." };

  const statusValid = ["BELUM_DIPERIKSA", "SESUAI", "PERLU_KOREKSI"];
  const statusBersih = (statusRekomendasi || "").toString().trim().toUpperCase();
  if (!statusValid.includes(statusBersih)) {
    return { sukses: false, pesan: "Status rekomendasi MUI tidak valid (harus BELUM_DIPERIKSA, SESUAI, atau PERLU_KOREKSI)." };
  }

  const catatanBersih = (catatan || "").toString().trim();
  if (statusBersih === "PERLU_KOREKSI" && !catatanBersih) {
    return { sukses: false, pesan: "Catatan verifikasi wajib diisi jika status Rekom MUI Salah." };
  }

  try {
    const cek = await sql`
      select id, layanan from penerima where id = ${id} and tahun = ${TAHUN_AKTIF} limit 1
    `;
    if (cek.length === 0) return { sukses: false, pesan: "Data penerima tidak ditemukan." };
    const lay = (cek[0].layanan || "").toString().toUpperCase();
    if (!["USTADZ", "USTADZAH", "USTADZ/USTADZAH"].includes(lay)) {
      return { sukses: false, pesan: "Verifikasi rekomendasi MUI hanya berlaku untuk layanan Ustadz atau Ustadzah." };
    }

    const namaPetugas = sesi.nama_lengkap || sesi.user_id || (role === "MUI" ? "MUI Kota Medan" : sesi.username || "Admin Utama");
    const waktuSekarang = new Date();

    await sql`
      update penerima set
        status_rekomendasi_mui = ${statusBersih},
        catatan_rekomendasi_mui = ${catatanBersih},
        tgl_rekomendasi_mui = ${waktuSekarang},
        petugas_rekomendasi_mui = ${namaPetugas}
      where id = ${id} and tahun = ${TAHUN_AKTIF}
    `;

    return {
      sukses: true,
      pesan: "Catatan verifikasi rekomendasi MUI berhasil disimpan.",
      status: statusBersih,
      catatan: catatanBersih,
      petugas: namaPetugas,
      tanggal: formatTanggalWaktuWIB(waktuSekarang),
    };
  } catch (error) {
    return { sukses: false, pesan: String(error) };
  }
}

/**
 * Simpan respon/tanggapan dari Admin Utama kepada akun MUI.
 */
export async function simpanResponAdminMui(
  token: string,
  nomorBarisAsli: number,
  responAdmin: string,
) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { sukses: false, pesan: e instanceof Error ? e.message : String(e) };
  }

  const role = (sesi.role || "").toString().trim().toUpperCase();
  if (role !== "UTAMA") {
    return { sukses: false, pesan: "Akses ditolak: tanggapan hanya dapat dikirim oleh Admin Utama." };
  }

  const id = Number(nomorBarisAsli);
  if (!id) return { sukses: false, pesan: "Nomor baris tidak valid." };

  const responBersih = (responAdmin || "").toString().trim();
  if (!responBersih) {
    return { sukses: false, pesan: "Tanggapan Admin Utama tidak boleh kosong." };
  }

  try {
    const waktuSekarang = new Date();
    const rows = await sql`
      update penerima set
        respon_admin_mui = ${responBersih},
        tgl_respon_admin_mui = ${waktuSekarang}
      where id = ${id} and tahun = ${TAHUN_AKTIF}
      returning id
    `;
    if (rows.length === 0) return { sukses: false, pesan: "Data penerima tidak ditemukan." };

    return {
      sukses: true,
      pesan: "Tanggapan Admin Utama berhasil dikirim ke akun MUI.",
      respon: responBersih,
      tanggal: formatTanggalWaktuWIB(waktuSekarang),
    };
  } catch (error) {
    return { sukses: false, pesan: String(error) };
  }
}

