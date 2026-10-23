import { sql } from "../_shared/db.ts";
import { wajibSesi } from "../_shared/sesi.ts";
import { TAHUN_AKTIF } from "../_shared/config.ts";
import { formatTanggalWaktuWIB } from "../_shared/tanggal.ts";
import {
  daftarLayananKemenagUpper,
  kelurahanTerkunciDari,
  lolosAksesBarisLihatData,
  resolveInstansiPengguna,
  subFilterGsmDari,
} from "../_shared/akses.ts";
import { arsipkanDataDetail, pastikanDataDetailTersinkron } from "./dataDetail.ts";

// ---------------------------------------------------------------------------
// Pengganti LockService di seluruh domain ini: bukan advisory lock, tapi UPDATE ... WHERE
// status_verifikasi = <status diharapkan> RETURNING id — atomik secara native di Postgres, jadi
// optimistic-locking (deteksi "sudah diubah admin lain") tidak butuh mekanisme lock terpisah sama
// sekali. Ini persis pola yang sudah dicatat di rencana migrasi (§ Pengganti Mekanisme GAS).
// ---------------------------------------------------------------------------

// Port 1:1 dari verifikasiSatuData() (Kode.gs baris 2942-3007). `nomorBarisAsli` = penerima.id.
export async function verifikasiSatuData(
  token: string,
  nomorBarisAsli: number,
  statusBaru: string,
  keterangan: string,
  batasWaktu: string,
  statusSebelumnyaDiharapkan?: string,
) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { sukses: false, pesan: e instanceof Error ? e.message : String(e) };
  }
  if ((sesi.role || "").toString().trim().toUpperCase() !== "UTAMA") {
    return { sukses: false, pesan: "Fitur ini khusus Admin Utama." };
  }

  const id = Number(nomorBarisAsli);
  if (!id) return { sukses: false, pesan: "Nomor baris tidak valid." };

  const statusValid = ["Memenuhi Syarat", "Tidak Memenuhi Syarat", "Berkas Tidak Lengkap"];
  if (!statusValid.includes(statusBaru)) return { sukses: false, pesan: "Status tidak valid." };

  // "Memenuhi Syarat": keterangan tidak dipakai (dikosongkan) dan laporan perbaikan ikut direset,
  // sama seperti tandaiSudahDiperbaiki. Dua status lain tetap wajib berketerangan.
  const memenuhi = statusBaru === "Memenuhi Syarat";
  // Putaran perbaikan baru: "Memenuhi Syarat" (selesai) ATAU "Berkas Tidak Lengkap" (admin menolak perbaikan sebelumnya / menetapkan
  // ulang) -> tanda laporan lama dikosongkan supaya user bisa melapor lagi dan Detail tidak lagi menampilkan "sudah dilaporkan".
  // Dulu hanya Memenuhi Syarat yang mengosongkannya, jadi admin harus memutar lewat Tandai Sudah Diperbaiki (K9, 2026-10-22).
  const putaranBaru = memenuhi || statusBaru === "Berkas Tidak Lengkap";
  const keteranganBersih = memenuhi ? "" : (keterangan || "").toString().trim();
  if (!memenuhi && !keteranganBersih) return { sukses: false, pesan: "Keterangan hasil verifikasi wajib diisi." };

  let batasWaktuBersih = "";
  if (statusBaru === "Berkas Tidak Lengkap") {
    batasWaktuBersih = (batasWaktu || "").toString().trim();
    if (!batasWaktuBersih) {
      return { sukses: false, pesan: "Batas waktu perbaikan wajib diisi untuk status Berkas Tidak Lengkap." };
    }
  }

  try {
    // Dihitung sekali di JS (bukan now() di SQL) supaya nilai yang DISIMPAN dan yang DIKEMBALIKAN
    // ke frontend di respons dijamin identik — sama seperti Kode.gs yang menghitung tglSekarang
    // sekali lalu memakainya untuk penulisan sel & isi respons sekaligus.
    const waktuVerifikasi = new Date();
    const namaVerifikator = (sesi.username || "UTAMA").toString().toUpperCase();
    const statusDiharapkan = (statusSebelumnyaDiharapkan || "").toString().trim();

    // Baca status sebelumnya SEBELUM UPDATE — dipakai untuk menentukan apakah perlu
    // menghapus baris dari data_detail (saat Memenuhi Syarat → status lain).
    const cekStatusAwal = await sql`
      select status_verifikasi from penerima where id = ${id} and tahun = ${TAHUN_AKTIF} limit 1
    `;
    const statusSebelumnya = cekStatusAwal[0]?.status_verifikasi ?? "";

    // "$8 = '' OR status_verifikasi = $8": kalau statusDiharapkan kosong (tidak dikirim), tidak
    // ada pengecekan status sama sekali (perilaku asli: cek konflik cuma jalan kalau statusDiharapkan
    // diisi) — persis logika `if (statusDiharapkan && statusSaatIni !== statusDiharapkan)`.
    const rows = await sql`
      update penerima set
        status_verifikasi = ${statusBaru},
        keterangan_verifikasi = ${keteranganBersih},
        tanggal_verifikasi = ${waktuVerifikasi},
        diverifikasi_oleh = ${namaVerifikator},
        batas_waktu_perbaikan = ${batasWaktuBersih || null},
        tanggal_lapor_perbaikan = case when ${putaranBaru}::boolean then null else tanggal_lapor_perbaikan end,
        dilapor_oleh = case when ${putaranBaru}::boolean then null else dilapor_oleh end,
        tanggal_berkas_diubah = null
      where id = ${id} and tahun = ${TAHUN_AKTIF}
        and (${statusDiharapkan} = '' or status_verifikasi = ${statusDiharapkan})
      returning id
    `;

    if (rows.length === 0) {
      const cekAda = await sql`select status_verifikasi from penerima where id = ${id} and tahun = ${TAHUN_AKTIF} limit 1`;
      if (cekAda.length === 0) return { sukses: false, pesan: "Baris tidak ditemukan." };
      const statusTerkini = cekAda[0].status_verifikasi;
      return {
        sukses: false,
        konflik: true,
        statusTerkini,
        pesan: 'Data ini sudah diverifikasi/diubah oleh admin lain (status terkini: "' + statusTerkini +
          '"). Muat ulang data sebelum menyimpan lagi.',
      };
    }

    // Update berhasil — jika status berubah DARI "Memenuhi Syarat" ke status lain,
    // arsipkan dan hapus baris dari data_detail (non-blocking: tidak boleh gagalkan respons).
    if (statusSebelumnya === "Memenuhi Syarat" && statusBaru !== "Memenuhi Syarat") {
      arsipkanDataDetail(
        [id],
        statusBaru,           // alasan: status baru yang dipilih admin
        TAHUN_AKTIF,
        namaVerifikator,
      ).catch((e) => {
        console.error("verifikasiSatuData: arsipkanDataDetail gagal (non-blocking):", e);
      });
    }

    return {
      sukses: true,
      pesan: "Status verifikasi berhasil disimpan.",
      status: statusBaru,
      keterangan: keteranganBersih,
      tanggal: formatTanggalWaktuWIB(waktuVerifikasi),
      verifikator: namaVerifikator,
      batasWaktu: batasWaktuBersih,
    };
  } catch (error) {
    return { sukses: false, pesan: String(error) };
  }
}

// Port dari laporkanPerbaikanBerkas() (Kode.gs baris 3011-3067) — hanya penanda "sudah dilaporkan",
// TIDAK mengubah status. PENGERASAN DISENGAJA (konsisten dgn ambilDetailPenerimaPerBaris/
// ambilRiwayatEdit): fungsi asli tidak menerapkan kelurahan-lock/sub-filter GSM, di sini ditambahkan
// lewat helper akses yang sama.
export async function laporkanPerbaikanBerkas(token: string, nomorBarisAsli: number) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { sukses: false, pesan: e instanceof Error ? e.message : String(e) };
  }

  const id = Number(nomorBarisAsli);
  if (!id) return { sukses: false, pesan: "Nomor baris tidak valid." };

  try {
    const rowsCek = await sql`
      select layanan, kecamatan, kelurahan, tempat_tugas, status_verifikasi, dibuat_oleh_akun_id
      from penerima where id = ${id} and tahun = ${TAHUN_AKTIF} limit 1
    `;
    if (rowsCek.length === 0) return { sukses: false, pesan: "Baris tidak ditemukan." };
    const rowCek = rowsCek[0];

    // Akun MUI (bisa menginput sejak 2026-10-20) hanya melapor perbaikan untuk data yang DIA input sendiri;
    // data Ustadz/Ustadzah milik Kecamatan tetap urusan Kecamatan itu.
    if ((sesi.role || "").toString().trim().toUpperCase() === "MUI" &&
        (!rowCek.dibuat_oleh_akun_id || String(rowCek.dibuat_oleh_akun_id) !== String(sesi.akunId))) {
      return { sukses: false, pesan: "Akun MUI hanya dapat melapor perbaikan untuk data yang diinputnya sendiri." };
    }

    const { instansiPengguna, layananPengguna, listLayananKemenag } = await resolveInstansiPengguna(sesi.role);
    if (!instansiPengguna) return { sukses: false, pesan: "Anda tidak berhak melapor untuk data ini." };

    const bolehLapor = lolosAksesBarisLihatData({
      instansiPengguna,
      layananPengguna,
      namaKecamatanPengguna: sesi.kecamatan || "",
      kelurahanTerkunci: kelurahanTerkunciDari(sesi),
      subFilterGsm: subFilterGsmDari(sesi),
      listLayananKemenag,
      layananSheet: (rowCek.layanan || "").toUpperCase(),
      kecamatanSheet: (rowCek.kecamatan || "").toUpperCase(),
      kelurahanSheet: (rowCek.kelurahan || "").toUpperCase(),
      tempatTugasSheet: (rowCek.tempat_tugas || "").toUpperCase(),
    });
    if (!bolehLapor) return { sukses: false, pesan: "Anda tidak berhak melapor untuk data ini." };

    const namaPelapor = (sesi.username || "").toString().toUpperCase();
    const waktuLapor = new Date();

    const rows = await sql`
      update penerima set tanggal_lapor_perbaikan = ${waktuLapor}, dilapor_oleh = ${namaPelapor}
      where id = ${id} and tahun = ${TAHUN_AKTIF} and status_verifikasi = 'Berkas Tidak Lengkap'
      returning id
    `;
    if (rows.length === 0) {
      return { sukses: false, pesan: "Data ini bukan berstatus Berkas Tidak Lengkap." };
    }

    return { sukses: true, tanggalLapor: formatTanggalWaktuWIB(waktuLapor), dilaporOleh: namaPelapor };
  } catch (error) {
    return { sukses: false, pesan: String(error) };
  }
}

// Port 1:1 dari tandaiSudahDiperbaiki() (Kode.gs baris 3070-3120) — khusus UTAMA.
export async function tandaiSudahDiperbaiki(token: string, nomorBarisAsli: number) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { sukses: false, pesan: e instanceof Error ? e.message : String(e) };
  }
  if ((sesi.role || "").toString().trim().toUpperCase() !== "UTAMA") {
    return { sukses: false, pesan: "Fitur ini khusus Admin Utama." };
  }

  const id = Number(nomorBarisAsli);
  if (!id) return { sukses: false, pesan: "Nomor baris tidak valid." };

  try {
    const namaVerifikator = (sesi.username || "UTAMA").toString().toUpperCase();
    const waktuVerifikasi = new Date();

    const rows = await sql`
      update penerima set
        status_verifikasi = 'Memenuhi Syarat',
        keterangan_verifikasi = '',
        tanggal_verifikasi = ${waktuVerifikasi},
        diverifikasi_oleh = ${namaVerifikator},
        batas_waktu_perbaikan = null,
        tanggal_lapor_perbaikan = null,
        dilapor_oleh = null,
        tanggal_berkas_diubah = null
      where id = ${id} and tahun = ${TAHUN_AKTIF} and status_verifikasi = 'Berkas Tidak Lengkap'
      returning id
    `;

    if (rows.length === 0) {
      const cekAda = await sql`select status_verifikasi from penerima where id = ${id} and tahun = ${TAHUN_AKTIF} limit 1`;
      if (cekAda.length === 0) return { sukses: false, pesan: "Baris tidak ditemukan." };
      const statusTerkini = cekAda[0].status_verifikasi;
      return {
        sukses: false,
        konflik: true,
        statusTerkini,
        pesan: 'Data ini sudah diubah oleh admin lain (status terkini: "' + statusTerkini +
          '"). Muat ulang data sebelum menyimpan lagi.',
      };
    }

    // Status kembali ke Memenuhi Syarat — sinkronkan data_detail secara non-blocking
    // agar baris tersedia segera (tidak menunggu user buka tombol Data Detail).
    pastikanDataDetailTersinkron(TAHUN_AKTIF).catch((e) => {
      console.error("tandaiSudahDiperbaiki: pastikanDataDetailTersinkron gagal (non-blocking):", e);
    });

    return { sukses: true, status: "Memenuhi Syarat", tanggal: formatTanggalWaktuWIB(waktuVerifikasi), verifikator: namaVerifikator };
  } catch (error) {
    return { sukses: false, pesan: String(error) };
  }
}

// Port 1:1 dari verifikasiMassalMemenuhiSyarat() (Kode.gs baris 3122-3169) — khusus UTAMA.
// Hanya menyentuh baris yang MASIH "" atau "Proses Verifikasi" (case-insensitive, sama seperti
// asli) — status lain (termasuk Berkas Tidak Lengkap) TIDAK disentuh.
//
// Verifikasi massal per layanan (plan-verifikasi-massal-per-layanan.md, 2026-10-23). Parameter baru SEMUA opsional:
// tanpa parameter = perilaku lama persis (semua layanan, tanpa pagar waktu), jadi frontend lama tetap bekerja.
//   layanan           kosong = semua layanan; terisi = hanya layanan itu (case-insensitive).
//   batasWaktu        ISO time dari ringkasanVerifikasiMassal: hanya data yang dibuat SEBELUM/SAAT batas ini yang diverifikasi,
//                     sehingga data yang masuk antara pratinjau dan klik "Ya" tidak ikut (angka yang disetujui = angka yang berubah).
//   lewatiMuiKoreksi  true = Ustadz/Ustadzah yang rekomendasi MUI-nya PERLU_KOREKSI dilewati (tetap Proses Verifikasi).
const LAYANAN_MUI_SQL = ["USTADZ", "USTADZAH", "USTADZ/USTADZAH"];

async function wajibUtama(token: string) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { galat: { sukses: false, pesan: e instanceof Error ? e.message : String(e) } };
  }
  if ((sesi.role || "").toString().trim().toUpperCase() !== "UTAMA") {
    return { galat: { sukses: false, pesan: "Fitur ini khusus Admin Utama." } };
  }
  return { sesi };
}

// Pratinjau (baca-saja): jumlah data menunggu verifikasi per layanan. Predikat "menunggu" IDENTIK dengan UPDATE di bawah.
// `batasWaktu` diambil DULU lalu dipakai untuk menghitung, jadi angka pratinjau = angka yang akan dieksekusi.
export async function ringkasanVerifikasiMassal(token: string) {
  const u = await wajibUtama(token);
  if (u.galat) return u.galat;
  try {
    const t = await sql`select now() as batas`;
    const batas: Date = t[0].batas;
    const rows = await sql`
      select upper(trim(layanan)) as layanan,
             count(*)::int as jumlah,
             count(*) filter (
               where upper(trim(layanan)) = any(${LAYANAN_MUI_SQL}::text[]) and coalesce(status_rekomendasi_mui, '') = 'PERLU_KOREKSI'
             )::int as mui_perlu_koreksi
      from penerima
      where tahun = ${TAHUN_AKTIF}
        and (status_verifikasi = '' or upper(trim(status_verifikasi)) = 'PROSES VERIFIKASI')
        and dibuat_at <= ${batas}
      group by upper(trim(layanan))
      order by jumlah desc, layanan
    `;
    const perLayanan = rows.map((r: any) => ({
      layanan: r.layanan as string,
      jumlah: Number(r.jumlah),
      muiPerluKoreksi: Number(r.mui_perlu_koreksi),
    }));
    return {
      sukses: true,
      total: perLayanan.reduce((a: number, r: { jumlah: number }) => a + r.jumlah, 0),
      perLayanan,
      batasWaktu: batas.toISOString(),
    };
  } catch (error) {
    return { sukses: false, pesan: String(error) };
  }
}

export async function verifikasiMassalMemenuhiSyarat(
  token: string,
  layanan?: string,
  batasWaktu?: string,
  lewatiMuiKoreksi?: boolean,
) {
  const u = await wajibUtama(token);
  if (u.galat) return u.galat;
  const sesi = u.sesi;

  const layananBersih = (layanan || "").toString().trim().toUpperCase();
  let batas: Date | null = null;
  if (batasWaktu) {
    batas = new Date(batasWaktu);
    if (isNaN(batas.getTime())) return { sukses: false, pesan: "Batas waktu pratinjau tidak valid. Muat ulang pilihan layanan." };
  }
  const lewati = lewatiMuiKoreksi === true;

  try {
    const namaVerifikator = (sesi.username || "UTAMA").toString().toUpperCase();

    if (layananBersih) {
      // Layanan yang tidak dikenal ditolak dengan pesan jelas (bukan "0 data" yang diam-diam).
      const ada = await sql`
        select 1 from penerima where tahun = ${TAHUN_AKTIF} and upper(trim(layanan)) = ${layananBersih} limit 1
      `;
      if (ada.length === 0) return { sukses: false, pesan: 'Layanan "' + layananBersih + '" tidak ditemukan. Muat ulang pilihan layanan.' };
    }

    // Transaksi: UPDATE data + catatan log atomik (tanpa log yatim / data berubah tanpa catatan).
    const idDiubah: number[] = await sql.begin(async (trx: any) => {
      const rows = await trx`
        update penerima set
          status_verifikasi = 'Memenuhi Syarat',
          keterangan_verifikasi = '',
          tanggal_verifikasi = now(),
          diverifikasi_oleh = ${namaVerifikator},
          batas_waktu_perbaikan = null,
          tanggal_lapor_perbaikan = null,
          dilapor_oleh = null,
          tanggal_berkas_diubah = null
        where tahun = ${TAHUN_AKTIF}
          and (status_verifikasi = '' or upper(trim(status_verifikasi)) = 'PROSES VERIFIKASI')
          and (${layananBersih} = '' or upper(trim(layanan)) = ${layananBersih})
          and (${batas}::timestamptz is null or dibuat_at <= ${batas}::timestamptz)
          and not (
            ${lewati}::boolean
            and upper(trim(layanan)) = any(${LAYANAN_MUI_SQL}::text[])
            and coalesce(status_rekomendasi_mui, '') = 'PERLU_KOREKSI'
          )
        returning id
      `;
      const ids = rows.map((r: any) => Number(r.id));
      if (ids.length > 0) {
        // JANGAN `${JSON.stringify(ids)}::jsonb`: postgres.js menyerialkan ulang parameter jsonb sehingga yang tersimpan jsonb STRING, bukan array
        // (lihat catatan di penerima.ts, idempotency_keys). Array bigint -> to_jsonb() menghasilkan jsonb array yang benar.
        await trx`
          insert into log_verifikasi_massal (username, tahun, layanan, jumlah, ids)
          values (${namaVerifikator}, ${TAHUN_AKTIF}, ${layananBersih}, ${ids.length}, to_jsonb(${ids}::bigint[]))
        `;
      }
      return ids;
    });

    // Sinkron data_detail non-blocking (idempoten; kegagalannya tidak menggagalkan respons).
    if (idDiubah.length > 0) {
      pastikanDataDetailTersinkron(TAHUN_AKTIF).catch((e) => {
        console.error("verifikasiMassalMemenuhiSyarat: pastikanDataDetailTersinkron gagal (non-blocking):", e);
      });
    }

    return { sukses: true, jumlah: idDiubah.length, layanan: layananBersih };
  } catch (error) {
    return { sukses: false, pesan: String(error) };
  }
}

// Port dari getDaftarBerkasTidakLengkapUntukWA() (Kode.gs baris 3171-3218) — khusus UTAMA.
//
// `kelompok` (2026-10-11): memisahkan broadcast WA untuk layanan KECAMATAN dan layanan KEMENAG
// (dua grup WA berbeda). Penentu "Kemenag" = daftar layanan kategori KEMENAG di master (sama dengan
// resolveInstansiPengguna/lolosAksesBarisLihatData), BUKAN daftar yang ditulis ulang di sini atau
// di frontend. Tanpa `kelompok` (kosong) perilaku lama dipertahankan: semua layanan.
export async function getDaftarBerkasTidakLengkapUntukWA(token: string, kelompok?: string) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { sukses: false, pesan: e instanceof Error ? e.message : String(e) };
  }
  if ((sesi.role || "").toString().trim().toUpperCase() !== "UTAMA") {
    return { sukses: false, pesan: "Fitur ini khusus Admin Utama." };
  }

  const kelompokBersih = String(kelompok ?? "").trim().toUpperCase();
  if (kelompokBersih !== "" && kelompokBersih !== "KECAMATAN" && kelompokBersih !== "KEMENAG") {
    return { sukses: false, pesan: "Kelompok layanan tidak dikenali (harus KECAMATAN atau KEMENAG)." };
  }

  interface BarisBerkasTidakLengkap {
    nama: string | null;
    nik: string | null;
    layanan: string | null;
    kecamatan: string | null;
    kelurahan: string | null;
    keterangan_verifikasi: string | null;
    batas_waktu_perbaikan: string | Date | null;
  }

  try {
    const rows = await sql<BarisBerkasTidakLengkap[]>`
      select nama, nik, layanan, kecamatan, kelurahan, keterangan_verifikasi, batas_waktu_perbaikan
      from penerima
      where tahun = ${TAHUN_AKTIF} and status_verifikasi = 'Berkas Tidak Lengkap'
    `;

    const layananKemenag = new Set(await daftarLayananKemenagUpper());
    // Daftar Kemenag kosong (master belum terisi/rusak) -> SEMUA baris akan terhitung Kecamatan dan data Kemenag
    // bisa ikut terkirim ke grup yang salah. Lebih aman gagal dengan pesan jelas.
    if (kelompokBersih && layananKemenag.size === 0) {
      return { sukses: false, pesan: "Daftar layanan Kemenag di master kosong. Hubungi pengembang." };
    }
    const kelompokBaris = (r: BarisBerkasTidakLengkap) =>
      layananKemenag.has((r.layanan || "").toString().trim().toUpperCase()) ? "KEMENAG" : "KECAMATAN";

    const data = rows
      .filter((r: BarisBerkasTidakLengkap) => !kelompokBersih || kelompokBaris(r) === kelompokBersih)
      .map((r: BarisBerkasTidakLengkap) => ({
        kelompok: kelompokBaris(r),
        nama: (r.nama || "").toString().trim(),
        nik: (r.nik || "").toString().replace(/'/g, "").trim(),
        layanan: (r.layanan || "").toString().trim(),
        kecamatan: (r.kecamatan || "").toString().trim(),
        kelurahan: (r.kelurahan || "").toString().trim(),
        keterangan: (r.keterangan_verifikasi || "").toString().trim(),
        // Format "yyyy-MM-dd" (BUKAN dd-MM-yyyy seperti field tanggal lain) — dikonfirmasi dari
        // Kode.gs baris 3210: Utilities.formatDate(..., "yyyy-MM-dd"). Kolom `date` murni (tanpa
        // jam) jadi tidak perlu geser WIB seperti formatTanggalWaktuWIB.
        batasWaktu: r.batas_waktu_perbaikan
          ? new Date(r.batas_waktu_perbaikan).toISOString().slice(0, 10)
          : "",
      }));

    return { sukses: true, data, kelompok: kelompokBersih };
  } catch (error) {
    return { sukses: false, pesan: String(error) };
  }
}

// ---------------------------------------------------------------------------
// Port dari cekBatasWaktuVerifikasi() — Kode.gs baris 3063-3100.
//
// Di Kode.gs fungsi ini dijalankan oleh trigger harian Apps Script (jam 01.00 WIB).
// Di Supabase, fungsi ini diekspos sebagai action API tanpa parameter token (dipanggil
// oleh Vercel Cron — lihat api/cron.js yang dibuat bersamaan dengan Fase 4 ini).
// Bisa juga dipanggil manual oleh admin via Postman/curl untuk trigger on-demand.
//
// Return: { sukses, jumlahBerubah, pesan } — bukan void seperti GAS.
// ---------------------------------------------------------------------------
export async function cekBatasWaktuVerifikasi() {
  try {
    const hariIniISO = new Date().toISOString().slice(0, 10); // yyyy-MM-dd UTC, cukup untuk perbandingan date

    // Atomic UPDATE: temukan + ubah dalam satu query (port Kode.gs baris 3075-3091)
    const rowsBerubah = await sql`
      update penerima set
        status_verifikasi    = 'Tidak Memenuhi Syarat',
        keterangan_verifikasi = 'Otomatis diubah sistem: batas waktu perbaikan berkas telah lewat tanpa perbaikan.',
        tanggal_verifikasi   = now() at time zone 'Asia/Jakarta',
        diverifikasi_oleh    = 'SISTEM (OTOMATIS)',
        batas_waktu_perbaikan = null,
        diperbarui_at        = now()
      where tahun             = ${TAHUN_AKTIF}
        and status_verifikasi = 'Berkas Tidak Lengkap'
        and batas_waktu_perbaikan is not null
        and batas_waktu_perbaikan < ${hariIniISO}::date
        -- Plan wajib lapor perbaikan (K5, 2026-10-22): data yang berkasnya SUDAH diganti user, atau sudah dilaporkan sudah
        -- diperbaiki, jangan ditolak otomatis -- Admin Utama yang memutuskan setelah memeriksa berkasnya.
        and tanggal_berkas_diubah is null
        and tanggal_lapor_perbaikan is null
      returning id, nama
    `;

    const jumlahBerubah = rowsBerubah.length;
    const sekarang = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

    // Jika ada data yang berubah, jalankan sweep data_detail sebagai jaring pengaman
    // (status Berkas Tidak Lengkap seharusnya sudah tidak ada di data_detail, tapi
    // cron ini berjalan tanpa melewati verifikasiSatuData — pastikan konsistensi tetap terjaga).
    if (jumlahBerubah > 0) {
      pastikanDataDetailTersinkron(TAHUN_AKTIF).catch((e) => {
        console.error("cekBatasWaktuVerifikasi: pastikanDataDetailTersinkron gagal (non-blocking):", e);
      });
    }

    return {
      sukses: true,
      jumlahBerubah,
      pesan: jumlahBerubah > 0
        ? `${jumlahBerubah} data diubah otomatis ke "Tidak Memenuhi Syarat" pada ${sekarang} WIB.`
        : `Tidak ada data yang perlu diubah (dijalankan ${sekarang} WIB).`,
    };
  } catch (error) {
    return { sukses: false, jumlahBerubah: 0, pesan: String(error) };
  }
}
