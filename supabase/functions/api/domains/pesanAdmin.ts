import { sql } from "../_shared/db.ts";
import { wajibSesi } from "../_shared/sesi.ts";
import { TAHUN_AKTIF } from "../_shared/config.ts";
import { formatTanggalWaktuWIB } from "../_shared/tanggal.ts";
import { GalatBisnis, wajibUtama } from "../_shared/aksesUtama.ts";
import { bacaIdOpsional, validasiPesan } from "../_shared/pesanAdmin.ts";

// ---------------------------------------------------------------------------
// Pesan Admin Utama (plan: plans/plan-timer-tutup-periode-input.md, K8-K14)
// ---------------------------------------------------------------------------
// Satu baris pesan_admin = satu VERSI pesan. Status:
//   DRAF -> TERJADWAL (terikat jadwal otomatis) -> TERBIT -> DIGANTI (ada versi terbit yang lebih baru)
//   atau DITARIK kapan saja (hilang dari layar pengguna).
// Mengubah pesan yang sudah TERBIT membuat VERSI BARU (id baru), sehingga pengguna yang sudah
// menekan "Mengerti" pada versi lama akan melihat pesan lagi (K12). DRAF/TERJADWAL diubah di tempat.
//
// URUTAN KUNCI: selalu jadwal_periode_input dulu, baru pesan_admin -- sama dengan job cron
// terapkan_jadwal_periode() -- supaya admin dan cron tidak saling menunggu (deadlock).

interface BarisPesan {
  id: string | number;
  tipe: string;
  judul: string;
  isi: string;
  status: string;
  menggantikan: string | number | null;
  terbit_pada: Date | null;
  dibuat_oleh: string;
  dibuat_pada: Date;
  oleh_nama: string | null;
  sudah_dibaca?: boolean | null;
  jumlah_dibaca?: number | null;
  jadwal_id?: string | number | null;
}

export function petaPesan(r: BarisPesan) {
  return {
    id: Number(r.id),
    tipe: r.tipe,
    judul: r.judul,
    isi: r.isi,
    status: r.status,
    menggantikan: r.menggantikan == null ? null : Number(r.menggantikan),
    oleh: (r.oleh_nama || "").trim() || r.dibuat_oleh,
    waktuTerbit: formatTanggalWaktuWIB(r.terbit_pada),
    waktuTerbitISO: r.terbit_pada ? r.terbit_pada.toISOString() : null,
    dibuatPada: formatTanggalWaktuWIB(r.dibuat_pada),
    ...(r.sudah_dibaca !== undefined ? { sudahDibaca: !!r.sudah_dibaca } : {}),
    ...(r.jumlah_dibaca !== undefined ? { jumlahDibaca: Number(r.jumlah_dibaca) || 0 } : {}),
    ...(r.jadwal_id !== undefined ? { jadwalId: r.jadwal_id == null ? null : Number(r.jadwal_id) } : {}),
  };
}

/** Pesan yang sedang TERBIT (maksimal satu per tahun) + apakah akun ini sudah membacanya. */
export async function ambilPesanTerbit(akunId: string | null) {
  const rows = await sql<BarisPesan[]>`
    select p.id, p.tipe, p.judul, p.isi, p.status, p.menggantikan, p.terbit_pada, p.dibuat_oleh, p.dibuat_pada,
           (select a.nama_lengkap from akun a where a.username = p.dibuat_oleh) as oleh_nama,
           coalesce((select true from pesan_admin_dibaca d where d.pesan_id = p.id and d.akun_id = ${akunId}), false) as sudah_dibaca
    from pesan_admin p
    where p.tahun = ${TAHUN_AKTIF} and p.status = 'TERBIT'
    limit 1
  `;
  return rows.length > 0 ? petaPesan(rows[0]) : null;
}

/** 10 versi pesan terbaru (lengkap dengan isi) untuk panel UTAMA. */
export async function ambilRiwayatPesan() {
  const rows = await sql<BarisPesan[]>`
    select p.id, p.tipe, p.judul, p.isi, p.status, p.menggantikan, p.terbit_pada, p.dibuat_oleh, p.dibuat_pada,
           (select a.nama_lengkap from akun a where a.username = p.dibuat_oleh) as oleh_nama,
           (select count(*)::int from pesan_admin_dibaca d where d.pesan_id = p.id) as jumlah_dibaca,
           (select j.id from jadwal_periode_input j where j.pesan_id = p.id and j.status = 'MENUNGGU' limit 1) as jadwal_id
    from pesan_admin p
    where p.tahun = ${TAHUN_AKTIF}
    order by p.id desc
    limit 10
  `;
  return rows.map((r: BarisPesan) => petaPesan(r));
}

/** Berapa dari seluruh akun aktif non-UTAMA (K8) yang sudah membaca pesan ini. */
export async function ambilRingkasBaca(pesanId: number) {
  const rows = await sql<Array<{ total: number; sudah: number }>>`
    select
      (select count(*)::int from akun where aktif and upper(role) <> 'UTAMA') as total,
      (select count(*)::int from pesan_admin_dibaca d join akun a on a.id = d.akun_id
        where d.pesan_id = ${pesanId} and a.aktif and upper(a.role) <> 'UTAMA') as sudah
  `;
  const total = Number(rows[0].total) || 0;
  const sudah = Number(rows[0].sudah) || 0;
  return { total, sudah, belum: total - sudah, persen: total > 0 ? Math.round((sudah / total) * 100) : 0 };
}

/**
 * Terbitkan pesan DRAF/TERJADWAL SEKARANG di dalam transaksi pemanggil: versi TERBIT sebelumnya
 * menjadi DIGANTI, dan pesan dilepas dari jadwal yang masih menunggu (supaya cron tidak
 * menerbitkannya lagi). Melempar GalatBisnis bila pesan tidak ada / tidak boleh diterbitkan.
 */
// deno-lint-ignore no-explicit-any
export async function terbitkanDalamTrx(trx: any, id: number): Promise<void> {
  await trx`update jadwal_periode_input set pesan_id = null where pesan_id = ${id} and status = 'MENUNGGU'`;

  const rows = await trx`select tahun, status from pesan_admin where id = ${id} for update`;
  if (rows.length === 0) throw new GalatBisnis("Pesan tidak ditemukan.");
  const p = rows[0];
  if (p.status !== "DRAF" && p.status !== "TERJADWAL") {
    throw new GalatBisnis(
      p.status === "TERBIT"
        ? "Pesan ini sudah terbit."
        : "Pesan yang sudah ditarik atau digantikan tidak dapat diterbitkan lagi. Buat pesan baru.",
    );
  }
  // Turunkan dulu yang lama baru naikkan yang baru (indeks unik: maksimal 1 TERBIT per tahun).
  await trx`update pesan_admin set status = 'DIGANTI' where tahun = ${p.tahun} and status = 'TERBIT' and id <> ${id}`;
  await trx`update pesan_admin set status = 'TERBIT', terbit_pada = now() where id = ${id}`;
}

async function ambilPesanSatu(id: number) {
  const rows = await sql<BarisPesan[]>`
    select p.id, p.tipe, p.judul, p.isi, p.status, p.menggantikan, p.terbit_pada, p.dibuat_oleh, p.dibuat_pada,
           (select a.nama_lengkap from akun a where a.username = p.dibuat_oleh) as oleh_nama
    from pesan_admin p where p.id = ${id}
  `;
  return rows.length > 0 ? petaPesan(rows[0]) : null;
}

const PESAN_BUKAN_UTAMA = "Hanya admin utama yang boleh mengelola pesan.";

/**
 * Buat atau ubah pesan. `idLama` kosong = pesan baru. Bila diisi: DRAF/TERJADWAL diubah di tempat,
 * TERBIT dibuatkan versi baru (tetap TERBIT sampai versi baru diterbitkan), lainnya ditolak.
 * `terbitkan` true = langsung terbit.
 */
export async function simpanPesanAdmin(
  token: string,
  tipe: string,
  judul: string,
  isi: string,
  terbitkan?: boolean,
  idLama?: number | string | null,
) {
  const cek = await wajibUtama(token, PESAN_BUKAN_UTAMA);
  if ("galat" in cek) return cek.galat;
  const { sesi } = cek;

  const bersih = validasiPesan({ tipe, judul, isi });
  if (typeof bersih === "string") return { sukses: false, pesan: bersih };
  const idLamaAman = bacaIdOpsional(idLama);
  if (idLamaAman === undefined) return { sukses: false, pesan: "Id pesan tidak valid." };

  try {
    const hasil = await sql.begin(async (trx: any) => {
      let id: number;
      let versiBaru = false;

      if (idLamaAman === null) {
        const baru = await trx`
          insert into pesan_admin (tahun, tipe, judul, isi, dibuat_oleh)
          values (${TAHUN_AKTIF}, ${bersih.tipe}, ${bersih.judul}, ${bersih.isi}, ${sesi.username})
          returning id
        `;
        id = Number(baru[0].id);
      } else {
        const lama = await trx`select status, tahun from pesan_admin where id = ${idLamaAman} for update`;
        if (lama.length === 0) throw new GalatBisnis("Pesan yang akan diubah tidak ditemukan.");
        const status = lama[0].status as string;
        if (status === "DRAF" || status === "TERJADWAL") {
          await trx`
            update pesan_admin set tipe = ${bersih.tipe}, judul = ${bersih.judul}, isi = ${bersih.isi}
            where id = ${idLamaAman}
          `;
          id = idLamaAman;
        } else if (status === "TERBIT") {
          const baru = await trx`
            insert into pesan_admin (tahun, tipe, judul, isi, menggantikan, dibuat_oleh)
            values (${lama[0].tahun}, ${bersih.tipe}, ${bersih.judul}, ${bersih.isi}, ${idLamaAman}, ${sesi.username})
            returning id
          `;
          id = Number(baru[0].id);
          versiBaru = true;
        } else {
          throw new GalatBisnis("Pesan yang sudah ditarik atau digantikan tidak dapat diubah. Buat pesan baru.");
        }
      }

      if (terbitkan === true) await terbitkanDalamTrx(trx, id);
      return { id, versiBaru };
    });

    return {
      sukses: true,
      id: hasil.id,
      versiBaru: hasil.versiBaru,
      terbit: terbitkan === true,
      pesan: await ambilPesanSatu(hasil.id),
    };
  } catch (error) {
    if (error instanceof GalatBisnis) return { sukses: false, pesan: error.message };
    return { sukses: false, pesan: String(error) };
  }
}

/** Terbitkan pesan DRAF/TERJADWAL sekarang juga. */
export async function terbitkanPesanAdmin(token: string, idMasukan: number | string) {
  const cek = await wajibUtama(token, PESAN_BUKAN_UTAMA);
  if ("galat" in cek) return cek.galat;

  const id = bacaIdOpsional(idMasukan);
  if (!id) return { sukses: false, pesan: "Id pesan tidak valid." };

  try {
    await sql.begin(async (trx: any) => {
      await terbitkanDalamTrx(trx, id);
    });
    return { sukses: true, id, pesan: await ambilPesanSatu(id) };
  } catch (error) {
    if (error instanceof GalatBisnis) return { sukses: false, pesan: error.message };
    return { sukses: false, pesan: String(error) };
  }
}

/** Tarik pesan: hilang dari layar pengguna. Pesan terjadwal dilepas dari jadwalnya. */
export async function tarikPesanAdmin(token: string, idMasukan: number | string) {
  const cek = await wajibUtama(token, PESAN_BUKAN_UTAMA);
  if ("galat" in cek) return cek.galat;
  const { sesi } = cek;

  const id = bacaIdOpsional(idMasukan);
  if (!id) return { sukses: false, pesan: "Id pesan tidak valid." };

  try {
    await sql.begin(async (trx: any) => {
      await trx`update jadwal_periode_input set pesan_id = null where pesan_id = ${id} and status = 'MENUNGGU'`;
      const rows = await trx`select status from pesan_admin where id = ${id} for update`;
      if (rows.length === 0) throw new GalatBisnis("Pesan tidak ditemukan.");
      const status = rows[0].status as string;
      if (status !== "DRAF" && status !== "TERJADWAL" && status !== "TERBIT") {
        throw new GalatBisnis("Pesan ini sudah ditarik atau sudah digantikan versi yang lebih baru.");
      }
      await trx`
        update pesan_admin set status = 'DITARIK', ditarik_pada = now(), ditarik_oleh = ${sesi.username}
        where id = ${id}
      `;
    });
    return { sukses: true, id };
  } catch (error) {
    if (error instanceof GalatBisnis) return { sukses: false, pesan: error.message };
    return { sukses: false, pesan: String(error) };
  }
}

/**
 * Pengguna menekan "Mengerti". Identitas SELALU dari sesi (bukan parameter), jadi tidak bisa
 * menandai atas nama orang lain. Idempoten. Admin UTAMA tidak dihitung sebagai pembaca.
 */
export async function tandaiPesanDibaca(token: string, idMasukan: number | string) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { sukses: false, pesan: e instanceof Error ? e.message : String(e) };
  }

  const id = bacaIdOpsional(idMasukan);
  if (!id) return { sukses: false, pesan: "Id pesan tidak valid." };
  if ((sesi.role || "").toString().trim().toUpperCase() === "UTAMA") {
    return { sukses: true, dicatat: false };
  }

  try {
    const rows = await sql`select status from pesan_admin where id = ${id}`;
    if (rows.length === 0) return { sukses: false, pesan: "Pesan tidak ditemukan." };
    // Versi yang baru saja diganti/ditarik: bukan galat, cukup tidak dicatat.
    if (rows[0].status !== "TERBIT") return { sukses: true, dicatat: false, aktif: false };

    await sql`
      insert into pesan_admin_dibaca (pesan_id, akun_id, username)
      values (${id}, ${sesi.akunId}, ${sesi.username})
      on conflict (pesan_id, akun_id) do nothing
    `;
    return { sukses: true, dicatat: true, aktif: true };
  } catch (error) {
    return { sukses: false, pesan: String(error) };
  }
}

interface BarisBaca {
  username: string;
  nama_lengkap: string | null;
  nomor_hp: string | null;
  jabatan: string | null;
  role: string;
  kecamatan: string | null;
  sudah: boolean;
}

const BATAS_DAFTAR_BELUM = 500;

/** Statistik baca + daftar yang belum membaca (berisi nomor HP, jadi khusus UTAMA). */
export async function ambilStatistikBacaPesan(token: string, idMasukan?: number | string | null) {
  const cek = await wajibUtama(token, PESAN_BUKAN_UTAMA);
  if ("galat" in cek) return cek.galat;

  const idOpsional = bacaIdOpsional(idMasukan);
  if (idOpsional === undefined) return { sukses: false, pesan: "Id pesan tidak valid." };

  try {
    let pesan;
    if (idOpsional === null) {
      pesan = await ambilPesanTerbit(null);
      if (!pesan) return { sukses: false, pesan: "Belum ada pesan yang terbit." };
    } else {
      pesan = await ambilPesanSatu(idOpsional);
      if (!pesan) return { sukses: false, pesan: "Pesan tidak ditemukan." };
    }

    const rows = await sql<BarisBaca[]>`
      select a.username, a.nama_lengkap, a.nomor_hp, a.jabatan, a.role, a.kecamatan,
             (d.akun_id is not null) as sudah
      from akun a
      left join pesan_admin_dibaca d on d.akun_id = a.id and d.pesan_id = ${pesan.id}
      where a.aktif and upper(a.role) <> 'UTAMA'
      order by (d.akun_id is not null), a.role, a.kecamatan, a.username
    `;
    const total = rows.length;
    const belumSemua = rows.filter((r: BarisBaca) => !r.sudah);
    const sudah = total - belumSemua.length;

    return {
      sukses: true,
      pesan: { id: pesan.id, tipe: pesan.tipe, judul: pesan.judul, status: pesan.status, waktuTerbit: pesan.waktuTerbit },
      total,
      sudah,
      belum: belumSemua.length,
      persen: total > 0 ? Math.round((sudah / total) * 100) : 0,
      daftarBelum: belumSemua.slice(0, BATAS_DAFTAR_BELUM).map((r: BarisBaca) => ({
        username: r.username,
        nama: (r.nama_lengkap || "").trim() || r.username,
        role: r.role,
        kecamatan: r.kecamatan || "",
        jabatan: r.jabatan || "",
        hp: r.nomor_hp || "",
      })),
      terpotong: belumSemua.length > BATAS_DAFTAR_BELUM,
    };
  } catch (error) {
    return { sukses: false, pesan: String(error) };
  }
}
