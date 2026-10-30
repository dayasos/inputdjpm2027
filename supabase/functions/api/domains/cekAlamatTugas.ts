import { sql } from "../_shared/db.ts";
import { wajibSesi } from "../_shared/sesi.ts";
import type { DataSesi } from "../_shared/sesi.ts";
import { KECAMATAN_MEDAN_URUT, TAHUN_AKTIF } from "../_shared/config.ts";
import { formatTanggalWaktuWIB } from "../_shared/tanggal.ts";
import { GalatBisnis } from "../_shared/aksesUtama.ts";
import {
  idPositif, kecamatanDalamLingkup, LAYANAN_GMM, lingkupAkun, rapi, samaAlamat, selesaiButuhCatatan,
  statusValid, tempatTugasRumah, transisi, UKURAN_HALAMAN, validasiAlamatBaru, validasiPesan,
} from "../_shared/cekAlamatInti.ts";
import type { Aksi, Lingkup, Status } from "../_shared/cekAlamatInti.ts";
import { editDataPenerima } from "./penerima.ts";

// ---------------------------------------------------------------------------
// Cek Alamat Tugas GMM (plan: plans/plan-cek-alamat-tugas-gmm.md).
// Admin Utama membuka permintaan cek untuk Guru Maghrib Mengaji bertempat tugas RUMAH; akun GURU MAGHRIB MENGAJI (per kecamatan; tanpa kecamatan =
// se-Kota) menjawab; keduanya berkomunikasi lewat utas pendek pada tiap data. Hak akses SELALU diperiksa di sini (bukan di tampilan), kecamatan
// akun diambil dari SESI (tidak pernah dari kiriman browser), dan cakupan data dihitung dari penerima.kecamatan SAAT INI (join), bukan salinan.
// Perpindahan status hanya lewat transisi() di _shared/cekAlamatInti.ts, di dalam transaksi dengan baris terkunci (FOR UPDATE).
// ---------------------------------------------------------------------------

// Kriteria "tempat tugas = RUMAH" di SQL. HARUS setara dengan tempatTugasRumah() (kesetaraan dijaga uji dengan Postgres sungguhan).
export const SQL_RUMAH = `
  p.tempat_tugas ~* '^[[:space:]]*(rumah|rmh)(?![a-z0-9])'
  and p.tempat_tugas !~* '^[[:space:]]*rumah[^a-z0-9]*ibadah(?![a-z0-9])'`;
const SQL_NORMAL_TUGAS = `regexp_replace(upper(coalesce(p.alamat_tugas, '')), '[^A-Z0-9]', '', 'g')`;
const SQL_NORMAL_RUMAH = `regexp_replace(upper(coalesce(p.alamat, '')), '[^A-Z0-9]', '', 'g')`;
const SQL_SAMA_SEKARANG = `(${SQL_NORMAL_TUGAS} <> '' and ${SQL_NORMAL_TUGAS} = ${SQL_NORMAL_RUMAH})`;

const FILTER_STATUS_MENUNGGU_SAYA = "MENUNGGU_SAYA";

// deno-lint-ignore no-explicit-any
type Pembaca = any; // sql atau trx (postgres.js)

type HasilAkses = { sesi: DataSesi; lingkup: Lingkup } | { galat: { sukses: false; pesan: string } };

async function aksesCek(token: string): Promise<HasilAkses> {
  let sesi: DataSesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { galat: { sukses: false, pesan: e instanceof Error ? e.message : String(e) } };
  }
  const lingkup = lingkupAkun(sesi.role, sesi.kecamatan);
  if (!lingkup) {
    return { galat: { sukses: false, pesan: "Akses ditolak: fitur Cek Alamat hanya untuk Admin Utama dan akun Guru Maghrib Mengaji." } };
  }
  return { sesi, lingkup };
}

function pesanGalat(e: unknown, awalan: string): { sukses: false; pesan: string } {
  if (e instanceof GalatBisnis) return { sukses: false, pesan: e.message };
  return { sukses: false, pesan: awalan + ": " + (e instanceof Error ? e.message : String(e)) };
}

/** Potongan WHERE cakupan akun. Parameter ditambahkan ke `params` (nomor $n mengikuti urutan). */
function kondisiLingkup(lingkup: Lingkup, params: unknown[]): string {
  params.push(TAHUN_AKTIF);
  let w = `c.tahun = $${params.length}`;
  // Akun GMM (semua tingkat) tidak melihat data yang sudah dihapus; hanya Admin Utama (untuk menutup permintaannya).
  if (lingkup.peran === "GMM") w += ` and p.id is not null`;
  if (lingkup.kecamatan) {
    params.push(lingkup.kecamatan);
    // Akun GMM berkecamatan: data HARUS berada di kecamatannya SAAT INI.
    w += ` and upper(btrim(p.kecamatan)) = $${params.length}`;
  }
  return w;
}

const DARI_CEK = `from cek_alamat_tugas c left join penerima p on p.id = c.penerima_id and p.tahun = c.tahun`;

// ── Lencana / pantauan ───────────────────────────────────────────────────────────────────────────────────────
/** Jumlah yang menunggu akun ini. `catatDilihat` (saat panel dibuka): akun GMM berkecamatan menandai kecamatannya sudah melihat. */
export async function cekAlamatLencana(token: string, catatDilihat?: boolean) {
  const a = await aksesCek(token);
  if ("galat" in a) return a.galat;
  const { sesi, lingkup } = a;
  try {
    const params: unknown[] = [];
    const w = kondisiLingkup(lingkup, params);
    params.push(lingkup.peran);
    const r = await sql.unsafe(
      `select count(*) filter (where c.menunggu = $${params.length})::int as menunggu, count(*)::int as total ${DARI_CEK} where ${w}`,
      params,
    );
    if (catatDilihat === true && lingkup.peran === "GMM" && lingkup.kecamatan) {
      await sql`
        insert into cek_alamat_tugas_kecamatan (kecamatan, dilihat_oleh)
        values (${lingkup.kecamatan}, ${sesi.username})
        on conflict (kecamatan) do update
          set terakhir_dilihat_pada = now(), dilihat_oleh = excluded.dilihat_oleh
      `;
    }
    return { sukses: true, peran: lingkup.peran, kecamatan: lingkup.kecamatan, menunggu: Number(r[0]?.menunggu) || 0, total: Number(r[0]?.total) || 0 };
  } catch (e) {
    return pesanGalat(e, "Gagal memuat Cek Alamat");
  }
}

/** Ringkasan per kecamatan (cakupan akun). Untuk UTAMA ditambah "kapan kecamatan terakhir membuka panel". */
export async function cekAlamatRingkasan(token: string) {
  const a = await aksesCek(token);
  if ("galat" in a) return a.galat;
  const { lingkup } = a;
  try {
    const params: unknown[] = [];
    const w = kondisiLingkup(lingkup, params);
    const baris = await sql.unsafe(
      `select upper(btrim(coalesce(p.kecamatan, ''))) as kecamatan,
              count(*)::int as total,
              count(*) filter (where c.status = 'BELUM')::int as belum,
              count(*) filter (where c.status = 'SUDAH_BENAR')::int as sudah_benar,
              count(*) filter (where c.status = 'DIPERBAIKI')::int as diperbaiki,
              count(*) filter (where c.status = 'TIDAK_PASTI')::int as tidak_pasti,
              count(*) filter (where c.status = 'DIKEMBALIKAN')::int as dikembalikan,
              count(*) filter (where c.status = 'SELESAI')::int as selesai,
              count(*) filter (where c.menunggu = 'GMM')::int as menunggu_gmm,
              count(*) filter (where c.menunggu = 'UTAMA')::int as menunggu_utama
       ${DARI_CEK} where ${w} group by 1 order by 1`,
      params,
    );
    // deno-lint-ignore no-explicit-any
    let dilihat: Record<string, any> = {};
    if (lingkup.peran === "UTAMA") {
      const d = await sql`select kecamatan, pertama_dilihat_pada, terakhir_dilihat_pada from cek_alamat_tugas_kecamatan`;
      dilihat = Object.fromEntries(d.map((x: Pembaca) => [rapi(x.kecamatan), x]));
    }
    const daftar = baris.map((r: Pembaca) => ({
      kecamatan: r.kecamatan || "(DATA DIHAPUS)",
      total: r.total, belum: r.belum, sudahBenar: r.sudah_benar, diperbaiki: r.diperbaiki, tidakPasti: r.tidak_pasti,
      dikembalikan: r.dikembalikan, selesai: r.selesai, menungguGmm: r.menunggu_gmm, menungguUtama: r.menunggu_utama,
      ...(lingkup.peran === "UTAMA"
        ? {
          pertamaDilihat: dilihat[r.kecamatan] ? formatTanggalWaktuWIB(dilihat[r.kecamatan].pertama_dilihat_pada) : null,
          terakhirDilihat: dilihat[r.kecamatan] ? formatTanggalWaktuWIB(dilihat[r.kecamatan].terakhir_dilihat_pada) : null,
        }
        : {}),
    }));
    return { sukses: true, peran: lingkup.peran, kecamatan: lingkup.kecamatan, daftar };
  } catch (e) {
    return pesanGalat(e, "Gagal memuat ringkasan");
  }
}

// ── Daftar dan utas ──────────────────────────────────────────────────────────────────────────────────────────
export async function cekAlamatDaftar(
  token: string,
  filter?: { status?: string; kecamatan?: string; cari?: string; halaman?: number },
) {
  const a = await aksesCek(token);
  if ("galat" in a) return a.galat;
  const { lingkup } = a;
  const f = filter && typeof filter === "object" ? filter : {};
  try {
    const params: unknown[] = [];
    let w = kondisiLingkup(lingkup, params);

    const status = typeof f.status === "string" ? f.status.trim().toUpperCase() : "";
    if (status === FILTER_STATUS_MENUNGGU_SAYA) {
      params.push(lingkup.peran);
      w += ` and c.menunggu = $${params.length}`;
    } else if (status) {
      if (!statusValid(status)) return { sukses: false, pesan: "Filter status tidak valid." };
      params.push(status);
      w += ` and c.status = $${params.length}`;
    }
    const kec = rapi(f.kecamatan);
    if (kec && !lingkup.kecamatan) {
      if (!KECAMATAN_MEDAN_URUT.includes(kec)) return { sukses: false, pesan: "Kecamatan tidak dikenal." };
      params.push(kec);
      w += ` and upper(btrim(p.kecamatan)) = $${params.length}`;
    }
    const cari = rapi(f.cari).slice(0, 60);
    if (cari) {
      params.push(cari);
      const n = params.length;
      w += ` and (strpos(upper(coalesce(p.nama, '')), $${n}) > 0 or strpos(upper(coalesce(p.kelurahan, '')), $${n}) > 0
              or strpos(upper(coalesce(p.alamat_tugas, '')), $${n}) > 0)`;
    }

    const halaman = Math.min(Math.max(Math.floor(Number(f.halaman) || 1), 1), 5000);
    const total = Number((await sql.unsafe(`select count(*)::int as n ${DARI_CEK} where ${w}`, params))[0]?.n) || 0;

    params.push(lingkup.peran);
    const nPeran = params.length;
    params.push(UKURAN_HALAMAN, (halaman - 1) * UKURAN_HALAMAN);
    const baris = await sql.unsafe(
      `select c.id, c.penerima_id, c.status, c.menunggu, c.alamat_tugas_awal, c.sama_alamat_rumah as sama_awal, c.diperbarui_pada,
              p.id as p_id, p.nama, p.kelurahan, p.kecamatan, p.tempat_tugas, p.alamat_tugas, p.alamat as alamat_rumah,
              p.link_koordinat_lokasi, ${SQL_SAMA_SEKARANG} as sama_sekarang,
              (select count(*)::int from cek_alamat_tugas_pesan m where m.cek_id = c.id) as jumlah_pesan
       ${DARI_CEK} where ${w}
       order by (case when c.menunggu = $${nPeran} then 0 when c.menunggu is null then 2 else 1 end),
                ${SQL_SAMA_SEKARANG} desc nulls last, p.kecamatan nulls last, p.kelurahan, p.nama, c.id
       limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    const daftar = baris.map((r: Pembaca) => ({
      id: Number(r.id),
      penerimaId: Number(r.penerima_id),
      status: r.status,
      menunggu: r.menunggu,
      dataDihapus: r.p_id == null,
      nama: r.nama ?? "",
      kecamatan: r.kecamatan ?? "",
      kelurahan: r.kelurahan ?? "",
      tempatTugas: r.tempat_tugas ?? "",
      alamatTugas: r.alamat_tugas ?? "",
      alamatRumah: r.alamat_rumah ?? "",
      alamatAwal: r.alamat_tugas_awal ?? "",
      samaAlamatRumah: r.sama_sekarang === true,
      samaSaatDibuka: r.sama_awal === true,
      masihRumah: r.p_id != null && tempatTugasRumah(r.tempat_tugas),
      linkPeta: r.link_koordinat_lokasi ?? "",
      jumlahPesan: Number(r.jumlah_pesan) || 0,
      diperbaruiPada: formatTanggalWaktuWIB(r.diperbarui_pada),
    }));
    return { sukses: true, peran: lingkup.peran, total, halaman, ukuranHalaman: UKURAN_HALAMAN, daftar };
  } catch (e) {
    return pesanGalat(e, "Gagal memuat daftar");
  }
}

async function muatBaris(q: Pembaca, cekId: number, lingkup: Lingkup, kunci: boolean) {
  const rows = await q.unsafe(
    `select c.id, c.penerima_id, c.status, c.menunggu, c.alamat_tugas_awal,
            p.id as p_id, p.layanan, p.kecamatan, p.tempat_tugas, p.alamat_tugas
     ${DARI_CEK} where c.id = $1 and c.tahun = $2 ${kunci ? "for update of c" : ""}`,
    [cekId, TAHUN_AKTIF],
  );
  const b = rows[0];
  // Tidak ditemukan dan di luar cakupan dijawab SAMA (akun GMM tidak boleh bisa menebak id milik kecamatan lain).
  if (!b) throw new GalatBisnis("Permintaan tidak ditemukan.");
  if (lingkup.peran === "GMM" && b.p_id == null) throw new GalatBisnis("Permintaan tidak ditemukan.");
  if (lingkup.kecamatan && !kecamatanDalamLingkup(lingkup, b.kecamatan)) throw new GalatBisnis("Permintaan tidak ditemukan.");
  return b;
}

export async function cekAlamatUtas(token: string, cekId: number) {
  const a = await aksesCek(token);
  if ("galat" in a) return a.galat;
  const id = idPositif(cekId);
  if (!id) return { sukses: false, pesan: "Nomor permintaan tidak valid." };
  try {
    await muatBaris(sql, id, a.lingkup, false);
    const rows = await sql`
      select m.id, m.jenis, m.pengirim_username, m.pengirim_role, m.status_sesudah, m.isi, m.alamat_sesudah, m.dibuat_pada,
             (select ak.nama_lengkap from akun ak where ak.username = m.pengirim_username limit 1) as nama_lengkap
      from cek_alamat_tugas_pesan m where m.cek_id = ${id} order by m.id limit 200`;
    return {
      sukses: true,
      pesan: rows.map((r: Pembaca) => ({
        id: Number(r.id),
        jenis: r.jenis,
        oleh: (r.nama_lengkap || "").toString().trim() || r.pengirim_username,
        peran: rapi(r.pengirim_role) === "UTAMA" ? "UTAMA" : "GMM",
        statusSesudah: r.status_sesudah,
        isi: r.isi,
        alamatSesudah: r.alamat_sesudah ?? "",
        waktu: formatTanggalWaktuWIB(r.dibuat_pada),
      })),
    };
  } catch (e) {
    return pesanGalat(e, "Gagal memuat utas");
  }
}

// ── Membuka permintaan (hanya UTAMA) ─────────────────────────────────────────────────────────────────────────
export async function cekAlamatBuka(token: string, mode: string, kecamatan?: string) {
  const a = await aksesCek(token);
  if ("galat" in a) return a.galat;
  if (a.lingkup.peran !== "UTAMA") return { sukses: false, pesan: "Hanya Admin Utama yang dapat membuka permintaan cek." };
  if (mode !== "pratinjau" && mode !== "eksekusi") return { sukses: false, pesan: "Mode tidak valid." };
  const kec = rapi(kecamatan);
  if (kec && !KECAMATAN_MEDAN_URUT.includes(kec)) return { sukses: false, pesan: "Kecamatan tidak dikenal." };
  const { sesi } = a;
  try {
    const hasil = await sql.begin(async (trx: Pembaca) => {
      const params: unknown[] = [TAHUN_AKTIF, LAYANAN_GMM];
      let kecSql = "";
      if (kec) {
        params.push(kec);
        kecSql = ` and upper(btrim(p.kecamatan)) = $${params.length}`;
      }
      const kriteria = `p.tahun = $1 and upper(btrim(p.layanan)) = $2 and ${SQL_RUMAH}${kecSql}`;
      const hitung = await trx.unsafe(
        `select upper(btrim(p.kecamatan)) as kecamatan, count(*)::int as memenuhi, count(*) filter (where c.id is not null)::int as sudah_ada
         from penerima p left join cek_alamat_tugas c on c.penerima_id = p.id and c.tahun = p.tahun
         where ${kriteria} group by 1 order by 1`,
        params,
      );
      const memenuhi = hitung.reduce((s: number, r: Pembaca) => s + r.memenuhi, 0);
      const sudahAda = hitung.reduce((s: number, r: Pembaca) => s + r.sudah_ada, 0);
      let dibuka = 0;
      if (mode === "eksekusi") {
        const p2 = [...params, sesi.username];
        const nUser = p2.length;
        const baru = await trx.unsafe(
          `with baru as (
             insert into cek_alamat_tugas (tahun, penerima_id, alamat_tugas_awal, sama_alamat_rumah, status, menunggu, dibuka_oleh)
             select p.tahun, p.id, coalesce(p.alamat_tugas, ''), ${SQL_SAMA_SEKARANG}, 'BELUM', 'GMM', $${nUser}
             from penerima p
             where ${kriteria}
             on conflict (tahun, penerima_id) do nothing
             returning id)
           insert into cek_alamat_tugas_pesan (cek_id, pengirim_username, pengirim_role, jenis, status_sesudah, isi)
           select id, $${nUser}, 'UTAMA', 'BUKA', 'BELUM', '' from baru
           returning cek_id`,
          p2,
        );
        dibuka = baru.length;
      }
      return {
        memenuhi, sudahAda, baru: mode === "eksekusi" ? dibuka : memenuhi - sudahAda,
        perKecamatan: hitung.map((r: Pembaca) => ({ kecamatan: r.kecamatan, memenuhi: r.memenuhi, sudahAda: r.sudah_ada })),
      };
    });
    return {
      sukses: true, mode, ...hasil,
      pesan: mode === "eksekusi"
        ? `${hasil.baru} permintaan baru dibuka (${hasil.sudahAda} sudah ada sebelumnya).`
        : `${hasil.baru} guru akan dibuka permintaannya (${hasil.sudahAda} sudah ada dari total ${hasil.memenuhi}).`,
    };
  } catch (e) {
    return pesanGalat(e, "Gagal membuka permintaan");
  }
}

// ── Tindakan pada satu permintaan ────────────────────────────────────────────────────────────────────────────
async function catatPesan(
  trx: Pembaca, cekId: number, sesi: DataSesi, peran: string, jenis: string, status: Status, isi: string, alamatSesudah?: string,
) {
  await trx`
    insert into cek_alamat_tugas_pesan (cek_id, pengirim_username, pengirim_role, jenis, status_sesudah, isi, alamat_sesudah)
    values (${cekId}, ${sesi.username}, ${peran}, ${jenis}, ${status}, ${isi}, ${alamatSesudah ?? null})`;
}

/** Perpindahan status standar di dalam transaksi (baris terkunci). `perluGuruMasihRumah`: jawaban GMM hanya untuk yang masih "RUMAH". */
async function jalankanTransisi(
  token: string,
  cekId: unknown,
  aksi: Aksi,
  opsi: {
    jenis: "JAWAB" | "BALAS" | "KEMBALIKAN" | "SELESAI";
    isi?: unknown;
    isiWajib?: boolean | ((status: Status) => boolean);
    prasyarat?: (b: Pembaca) => void;
    pesanSukses: string;
  },
) {
  const a = await aksesCek(token);
  if ("galat" in a) return a.galat;
  const { sesi, lingkup } = a;
  const id = idPositif(cekId);
  if (!id) return { sukses: false, pesan: "Nomor permintaan tidak valid." };
  try {
    const hasil = await sql.begin(async (trx: Pembaca) => {
      const b = await muatBaris(trx, id, lingkup, true);
      const status = b.status as Status;
      const t = transisi(aksi, lingkup.peran, status);
      if (!t.ok) throw new GalatBisnis(t.pesan);
      const wajib = typeof opsi.isiWajib === "function" ? opsi.isiWajib(status) : opsi.isiWajib === true;
      const p = validasiPesan(opsi.isi, { wajib });
      if (!p.ok) throw new GalatBisnis(p.pesan);
      if (opsi.prasyarat) opsi.prasyarat(b);
      if (opsi.jenis === "JAWAB") {
        await trx`
          update cek_alamat_tugas set status = ${t.status}, menunggu = ${t.menunggu}, diperbarui_pada = now(),
                 dijawab_oleh = ${sesi.username}, dijawab_pada = now()
          where id = ${id}`;
      } else {
        // Balas/Kembalikan/Selesai TIDAK menyentuh jejak jawaban terakhir (dijawab_oleh/dijawab_pada).
        await trx`
          update cek_alamat_tugas set status = ${t.status}, menunggu = ${t.menunggu}, diperbarui_pada = now()
          where id = ${id}`;
      }
      await catatPesan(trx, id, sesi, lingkup.peran, opsi.jenis, t.status, p.isi);
      return { status: t.status, menunggu: t.menunggu };
    });
    return { sukses: true, pesan: opsi.pesanSukses, ...hasil };
  } catch (e) {
    return pesanGalat(e, "Gagal menyimpan");
  }
}

function wajibMasihRumah(b: Pembaca) {
  if (b.p_id == null || !tempatTugasRumah(b.tempat_tugas)) {
    throw new GalatBisnis("Tempat tugas guru ini sudah bukan RUMAH (atau datanya sudah dihapus), sehingga tidak dicek di sini. Hubungi Admin Utama.");
  }
}

/** Jawaban GMM tanpa mengubah data: "SUDAH_BENAR" (wajib dicocokkan dengan berkas) atau "TIDAK_PASTI" (catatan wajib). */
export function cekAlamatJawab(token: string, cekId: number, jawaban: string, catatan?: string, dicocokkan?: boolean) {
  const j = typeof jawaban === "string" ? jawaban.trim().toUpperCase() : "";
  if (j === "SUDAH_BENAR") {
    if (dicocokkan !== true) {
      return Promise.resolve({ sukses: false, pesan: "Centang pernyataan bahwa alamat tugas sudah dicocokkan dengan berkas guru." });
    }
    return jalankanTransisi(token, cekId, "JAWAB_BENAR", {
      jenis: "JAWAB", isi: catatan, prasyarat: wajibMasihRumah, pesanSukses: "Terjawab: alamat tugas sudah benar.",
    });
  }
  if (j === "TIDAK_PASTI") {
    return jalankanTransisi(token, cekId, "JAWAB_TIDAK_PASTI", {
      jenis: "JAWAB", isi: catatan, isiWajib: true, prasyarat: wajibMasihRumah, pesanSukses: "Terjawab: alamat tugas belum bisa dipastikan.",
    });
  }
  if (j === "DIPERBAIKI") {
    // Hanya mencatat perbaikan yang SUDAH terjadi (mis. pencatatan sebelumnya terputus): alamat harus memang sudah berubah dari awal.
    return jalankanTransisi(token, cekId, "JAWAB_DIPERBAIKI", {
      jenis: "JAWAB", isi: catatan,
      prasyarat: (b) => {
        wajibMasihRumah(b);
        if (samaAlamat(b.alamat_tugas, b.alamat_tugas_awal)) {
          throw new GalatBisnis("Alamat tugas belum berubah dari saat permintaan dibuka. Gunakan Perbaiki Alamat Tugas.");
        }
      },
      pesanSukses: "Terjawab: alamat tugas sudah diperbaiki.",
    });
  }
  return Promise.resolve({ sukses: false, pesan: "Jawaban tidak valid." });
}

export function cekAlamatBalas(token: string, cekId: number, isi: string) {
  return jalankanTransisi(token, cekId, "BALAS", { jenis: "BALAS", isi, isiWajib: true, pesanSukses: "Catatan terkirim." });
}

export function cekAlamatKembalikan(token: string, cekId: number, alasan: string) {
  return jalankanTransisi(token, cekId, "KEMBALIKAN", {
    jenis: "KEMBALIKAN", isi: alasan, isiWajib: true, pesanSukses: "Permintaan dikembalikan ke admin GMM.",
  });
}

export function cekAlamatSelesai(token: string, cekId: number, catatan?: string) {
  return jalankanTransisi(token, cekId, "SELESAI", {
    jenis: "SELESAI", isi: catatan, isiWajib: selesaiButuhCatatan, pesanSukses: "Permintaan ditandai selesai.",
  });
}

/**
 * Perbaikan alamat tugas oleh admin GMM. TERBATAS: hanya kolom alamat_tugas, hanya untuk data pada daftar permintaan yang masih bertempat tugas RUMAH,
 * dan perubahan dijalankan lewat editDataPenerima() (RBAC, aturan periode input, keunikan, riwayat edit, dan sinkron data_detail ikut berlaku).
 */
export async function cekAlamatPerbaiki(token: string, cekId: number, alamatBaru: string, catatan?: string) {
  const a = await aksesCek(token);
  if ("galat" in a) return a.galat;
  const { sesi, lingkup } = a;
  if (lingkup.peran !== "GMM") {
    return { sukses: false, pesan: "Perbaikan alamat tugas dilakukan oleh akun Guru Maghrib Mengaji. Admin Utama dapat mengubahnya lewat Kelola Data lalu menandai selesai." };
  }
  const id = idPositif(cekId);
  if (!id) return { sukses: false, pesan: "Nomor permintaan tidak valid." };
  const al = validasiAlamatBaru(alamatBaru);
  if (!al.ok) return { sukses: false, pesan: al.pesan };
  const cat = validasiPesan(catatan, { wajib: false });
  if (!cat.ok) return { sukses: false, pesan: cat.pesan };
  try {
    // 1) Pemeriksaan awal (tanpa kunci): lingkup, masih RUMAH, boleh dijawab, dan alamat benar-benar berbeda.
    const b = await muatBaris(sql, id, lingkup, false);
    const t = transisi("JAWAB_DIPERBAIKI", "GMM", b.status as Status);
    if (!t.ok) return { sukses: false, pesan: t.pesan };
    wajibMasihRumah(b);
    if (samaAlamat(al.alamat, b.alamat_tugas)) {
      return { sukses: false, pesan: "Alamat tugas yang diisi sama dengan yang tercatat sekarang. Isi alamat tugas yang benar sesuai berkas, atau pilih Sudah Benar." };
    }
    // 2) Ubah data lewat jalur edit yang sudah ada (HANYA kolom Alamat Tugas = indeks 9).
    const hasilEdit = await editDataPenerima(token, Number(b.penerima_id), { teks: { "9": al.alamat } }) as { sukses?: boolean; pesan?: string };
    if (!hasilEdit || hasilEdit.sukses !== true) {
      return { sukses: false, pesan: (hasilEdit && hasilEdit.pesan) || "Alamat tugas gagal diperbaiki." };
    }
    // 3) Catat jawaban (baris terkunci; baca ulang alamat yang kini tersimpan sebagai bukti).
    const akhir = await sql.begin(async (trx: Pembaca) => {
      const c = await muatBaris(trx, id, lingkup, true);
      if (samaAlamat(c.alamat_tugas, c.alamat_tugas_awal)) {
        throw new GalatBisnis("Alamat tugas tidak berubah setelah penyimpanan. Muat ulang lalu coba lagi.");
      }
      const tt = transisi("JAWAB_DIPERBAIKI", "GMM", c.status as Status);
      if (!tt.ok) return { dicatat: false as const, alamat: String(c.alamat_tugas ?? "") };
      await trx`
        update cek_alamat_tugas set status = ${tt.status}, menunggu = ${tt.menunggu}, diperbarui_pada = now(),
               dijawab_oleh = ${sesi.username}, dijawab_pada = now()
        where id = ${id}`;
      await catatPesan(trx, id, sesi, "GMM", "JAWAB", tt.status, cat.isi, String(c.alamat_tugas ?? ""));
      return { dicatat: true as const, alamat: String(c.alamat_tugas ?? "") };
    });
    return {
      sukses: true,
      pesan: akhir.dicatat
        ? "Alamat tugas berhasil diperbaiki dan dicatat."
        : "Alamat tugas berhasil diperbaiki, tetapi status permintaan sudah berubah sehingga tidak dicatat ulang.",
      alamat: akhir.alamat,
    };
  } catch (e) {
    return pesanGalat(e, "Gagal memperbaiki alamat tugas");
  }
}

