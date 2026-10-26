import { sql } from "../_shared/db.ts";
import { TAHUN_AKTIF } from "../_shared/config.ts";
import {
  BATAS_GAGAL,
  DURASI_KUNCI_DETIK,
  JENDELA_DETIK,
  prosesCekStatus,
} from "../_shared/cekStatusInti.ts";
import type { BarisPenerima, DepsCek, HasilCek } from "../_shared/cekStatusInti.ts";

// Cek Status Penerima untuk warga (NIK + tanggal lahir). Plan: plans/plan-cek-status-penerima-publik.md.
//
// Aksi ini TIDAK dibuka sebagai aksi publik di gerbang index.ts (hanya loginPengguna yang dibuka). Ia hanya bisa
// dipanggil lewat jalur _secret -- yaitu Worker Cloudflare (/api/cek-status), yang sudah memverifikasi Turnstile dan
// membatasi laju permintaan. Seluruh aturan keamanan ada di _shared/cekStatusInti.ts (diuji di Node).

function tanggalHariIniWIB(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

const depsDb: Omit<DepsCek, "pepper"> = {
  tahun: TAHUN_AKTIF,
  hariIni: tanggalHariIniWIB,

  async fiturAktif() {
    const rows = await sql`select aktif from public.cek_status_pengaturan where id limit 1`;
    return rows.length > 0 && rows[0].aktif === true;
  },

  async terkunci(kunci: string) {
    const rows = await sql`
      select 1 from public.cek_status_percobaan
      where kunci = ${kunci} and terkunci_sampai > now()
      limit 1
    `;
    return rows.length > 0;
  },

  // Jendela tetap (bukan bergeser): hitungan dimulai dari gagal pertama; mencapai BATAS_GAGAL -> terkunci
  // DURASI_KUNCI_DETIK. Kolom DB sengaja tidak menyimpan NIK; kunci = hash NIK (lihat cekStatusInti.ts).
  async catatGagal(kunci: string) {
    await sql`
      insert into public.cek_status_percobaan as c (kunci, jumlah_gagal, jendela_mulai, terkunci_sampai)
      values (${kunci}, 1, now(), null)
      on conflict (kunci) do update set
        jumlah_gagal = case
          when c.jendela_mulai > now() - make_interval(secs => ${JENDELA_DETIK}) then c.jumlah_gagal + 1
          else 1 end,
        jendela_mulai = case
          when c.jendela_mulai > now() - make_interval(secs => ${JENDELA_DETIK}) then c.jendela_mulai
          else now() end,
        terkunci_sampai = case
          when c.jendela_mulai > now() - make_interval(secs => ${JENDELA_DETIK})
               and c.jumlah_gagal + 1 >= ${BATAS_GAGAL}
            then coalesce(c.terkunci_sampai, now() + make_interval(secs => ${DURASI_KUNCI_DETIK}))
          when c.jendela_mulai > now() - make_interval(secs => ${JENDELA_DETIK}) then c.terkunci_sampai
          else null end
    `;
  },

  async resetPercobaan(kunci: string) {
    await sql`delete from public.cek_status_percobaan where kunci = ${kunci}`;
  },

  // Satu kueri yang mencocokkan NIK dan tanggal lahir sekaligus. Hanya kolom yang dibutuhkan yang dibaca.
  async cariPenerima(nik: string, tglLahir: string, tahun: number): Promise<BarisPenerima | null> {
    const rows = await sql`
      select nama, layanan, kecamatan, kelurahan, status_verifikasi
      from public.penerima
      where tahun = ${tahun} and nik = ${nik} and tanggal_lahir = ${tglLahir}::date
      limit 1
    `;
    return rows.length > 0 ? (rows[0] as BarisPenerima) : null;
  },
};

export async function cekStatusPublik(nik: unknown, tanggalLahir: unknown): Promise<HasilCek> {
  const pepper = Deno.env.get("CEK_STATUS_PEPPER") ?? "";
  return await prosesCekStatus({ ...depsDb, pepper }, nik, tanggalLahir);
}
