import { sql } from "../_shared/db.ts";
import { TAHUN_AKTIF } from "../_shared/config.ts";
import { BATAS_GAGAL, JENDELA_DETIK, prosesCekStatus } from "../_shared/cekStatusInti.ts";
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

  // ATOMIK: satu pernyataan menaikkan hitungan dan mengembalikan nilainya (baris dikunci Postgres, jadi permintaan
  // paralel diantrekan). Jendela tetap: hitungan dimulai dari percobaan pertama; jendela lewat -> mulai lagi dari 1.
  // Percobaan ke-(BATAS_GAGAL+1) dst. dalam jendela yang sama ditolak. Kolom terkunci_sampai tidak dipakai lagi (NULL).
  // least(...) membatasi angka agar tidak tumbuh tanpa batas saat diserang. Kunci = hash NIK, bukan NIK mentah.
  async ambilJatah(kunci: string) {
    const rows = await sql`
      insert into public.cek_status_percobaan as c (kunci, jumlah_gagal, jendela_mulai, terkunci_sampai)
      values (${kunci}, 1, now(), null)
      on conflict (kunci) do update set
        jumlah_gagal = case
          when c.jendela_mulai > now() - make_interval(secs => ${JENDELA_DETIK}) then least(c.jumlah_gagal + 1, 1000)
          else 1 end,
        jendela_mulai = case
          when c.jendela_mulai > now() - make_interval(secs => ${JENDELA_DETIK}) then c.jendela_mulai
          else now() end
      returning jumlah_gagal
    `;
    return rows.length > 0 && Number(rows[0].jumlah_gagal) <= BATAS_GAGAL;
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
