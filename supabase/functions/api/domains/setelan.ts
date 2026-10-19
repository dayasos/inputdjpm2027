import { sql } from "../_shared/db.ts";
import { wajibSesi } from "../_shared/sesi.ts";
import type { DataSesi } from "../_shared/sesi.ts";
import { formatTanggalWaktuWIB } from "../_shared/tanggal.ts";
import { TAHUN_AKTIF } from "../_shared/config.ts";
import { daftarLayananKemenagUpper } from "../_shared/akses.ts";
import { GalatBisnis, wajibUtama } from "../_shared/aksesUtama.ts";
import { bacaIdOpsional } from "../_shared/pesanAdmin.ts";
import { ambilPesanTerbit, ambilRingkasBaca, ambilRiwayatPesan, terbitkanDalamTrx } from "./pesanAdmin.ts";
import {
  BATAS_PERPANJANG_MENIT,
  bersihkanCatatan,
  dalamTenggang,
  hitungAksesInput,
  parseWaktuWIB,
  PENGGUNA_TIMER,
  pesanPenutupan,
  validasiWaktuJadwal,
} from "../_shared/periode.ts";
import type { AksesInput, KonteksTolak } from "../_shared/periode.ts";

// Port dari konstanta Kode.gs (KEY_INPUT_KECKEM baris 1997, PREFIX_SAKELAR_USER baris 3507).
const KEY_INPUT_KECKEM = "INPUT_KECAMATAN_KEMENAG";
const PREFIX_SAKELAR_USER = "INPUT_USER_";

// CATATAN: setHeaderUserId() (Kode.gs baris 3512) SENGAJA TIDAK diporting — dikonfirmasi lewat
// pencarian menyeluruh TIDAK dipanggil dari index.html sama sekali; murni utilitas sekali-jalan
// yang dulu dijalankan manual dari editor Apps Script untuk memastikan judul kolom H sheet
// db_admin = "USER_ID". Kolom `akun.user_id` di Postgres sudah otomatis bernama benar sejak awal.

interface BarisSetelan {
  key?: string;
  value?: string | null;
}

interface BarisRiwayatSetelan {
  waktu: Date | string;
  username?: string | null;
  nilai_baru?: string | null;
  keterangan?: string | null;
}

interface AkunPenggunaBaris {
  username?: string | null;
  role?: string | null;
  kecamatan?: string | null;
  user_id?: string | null;
  nama_lengkap?: string | null;
  nomor_hp?: string | null;
  jabatan?: string | null;
}

interface ItemDaftarUserStatus {
  username: string;
  userId: string;
  role: string;
  kecamatan: string;
  nama: string;
  hp: string;
  jabatan: string;
  status: string;
  sumber: string;
}

async function ambilSetelan(key: string): Promise<string> {
  const rows = await sql<BarisSetelan[]>`select value from setelan where key = ${key}`;
  return rows.length > 0 ? (rows[0].value || "").toString().trim().toUpperCase() : "";
}

// Port dari catatRiwayatSetelan_() — SENGAJA menelan error (tidak throw), sama seperti asli:
// gagal mencatat riwayat TIDAK BOLEH menggagalkan aksi utama yang sedang berjalan.
async function catatRiwayatSetelan(
  username: string,
  key: string,
  nilaiLama: string,
  nilaiBaru: string,
  keterangan = "",
): Promise<void> {
  try {
    await sql`
      insert into riwayat_setelan (waktu, username, key, nilai_lama, nilai_baru, keterangan)
      values (now(), ${username}, ${key}, ${nilaiLama}, ${nilaiBaru}, ${keterangan})
    `;
  } catch (_e) {
    // diam-diam diabaikan, sama seperti Logger.log() di Kode.gs
  }
}

async function inputKecKemDitutup(): Promise<boolean> {
  return (await ambilSetelan(KEY_INPUT_KECKEM)) === "TUTUP";
}

// ---------------------------------------------------------------------------
// Timer periode input (plan: plans/plan-timer-tutup-periode-input.md)
// ---------------------------------------------------------------------------
// Penutupan oleh jadwal dihitung SAAT DIBACA (jam database vs jadwal_periode_input), jadi tetap
// tepat walau job pg_cron terlambat. Job cron (terapkan_jadwal_periode) hanya mewujudkannya ke
// master + riwayat + sinyal realtime.

const normalisasi = (v: unknown): string => (v == null ? "" : String(v)).trim().toUpperCase();

interface BarisKeadaan {
  master: string | null;
  khusus: string | null;
  tutup_menunggu: Date | null;
  buka_menunggu: Date | null;
  sekarang: Date;
}

// SATU query (bukan tiga) untuk semua yang dibutuhkan keputusan akses. Database proyek ini
// jauh (Tokyo), jadi mengurangi round trip lebih berharga daripada query yang sedikit lebih besar.
async function ambilKeadaanPeriode(userId: string) {
  const kunciKhusus = userId ? PREFIX_SAKELAR_USER + userId : null;
  const rows = await sql<BarisKeadaan[]>`
    select
      (select value from setelan where key = ${KEY_INPUT_KECKEM}) as master,
      (select value from setelan where key = ${kunciKhusus}) as khusus,
      (select min(waktu_berlaku) from jadwal_periode_input
        where tahun = ${TAHUN_AKTIF} and jenis = 'TUTUP' and status = 'MENUNGGU') as tutup_menunggu,
      (select min(waktu_berlaku) from jadwal_periode_input
        where tahun = ${TAHUN_AKTIF} and jenis = 'BUKA' and status = 'MENUNGGU') as buka_menunggu,
      now() as sekarang
  `;
  const r = rows[0];
  return {
    master: normalisasi(r.master),
    khusus: kunciKhusus ? (normalisasi(r.khusus) || null) : null,
    tutupMenunggu: r.tutup_menunggu,
    bukaMenunggu: r.buka_menunggu,
    sekarang: r.sekarang,
  };
}

function ringkasJadwal(waktu: Date | null) {
  return waktu ? { waktuISO: waktu.toISOString(), waktuTeks: formatTanggalWaktuWIB(waktu) } : null;
}

// Padanan cekAksesInputUser_() lama (Kode.gs) + sumber "TIMER". Bentuk hasil tetap kompatibel.
export async function cekAksesInputUser(userId: string): Promise<AksesInput> {
  return hitungAksesInput(await ambilKeadaanPeriode(userId));
}

// Port dari statusInputKecKem() (Kode.gs baris 2033-2055). Field lama tidak berubah; ditambah
// waktuServer + jadwal supaya browser bisa menampilkan hitung mundur dengan jam server.
export async function statusInputKecKem(token: string) {
  try {
    const sesi = await wajibSesi(token);
    const peranSesi = (sesi.role || "").toString().trim().toUpperCase();
    const utama = peranSesi === "UTAMA";

    const [keadaan, pesan] = await Promise.all([
      ambilKeadaanPeriode(utama ? "" : sesi.userId),
      ambilPesanTerbit(sesi.akunId),
    ]);
    const tambahan = {
      waktuServer: keadaan.sekarang.toISOString(),
      jadwalTutup: ringkasJadwal(keadaan.tutupMenunggu),
      jadwalBuka: ringkasJadwal(keadaan.bukaMenunggu),
      // Pesan Admin Utama yang sedang terbit (null bila tidak ada) + apakah akun ini sudah membacanya.
      pesan,
    };

    if (utama) {
      return { sukses: true, ditutup: false, sumber: "UTAMA_BEBAS", ...tambahan };
    }

    const akses = hitungAksesInput(keadaan);
    return { sukses: true, ditutup: akses.ditutup, sumber: akses.sumber, nilai: akses.nilai, ...tambahan };
  } catch (e) {
    return { sukses: false, pesan: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// Gerbang tunggal "boleh input/edit/unggah?" untuk akun KECAMATAN & layanan Kemenag
// ---------------------------------------------------------------------------
// Dipakai simpanDataKeSheet, editDataPenerima, dan mulaiUnggahBerkas, sehingga aturan
// (sakelar khusus, master, timer, masa tenggang) hanya ada di satu tempat.

export type KeputusanInput =
  | { izin: true; tenggang: boolean; terbatas: boolean }
  | { izin: false; respons: { sukses: false; pesan: string } };

interface BarisKonteksPenutupan {
  terakhir_oleh: string | null;
  tutup_terakhir: Date | null;
  unggah_dimulai: Date | null;
  sekarang: Date;
}

export async function periksaIzinInput(
  sesi: DataSesi,
  konteks: KonteksTolak,
  listLayananKemenag?: string[],
): Promise<KeputusanInput> {
  const peran = (sesi.role || "").toString().trim().toUpperCase();
  if (peran === "UTAMA" || peran === "MUI") return { izin: true, tenggang: false, terbatas: false };

  const daftar = listLayananKemenag ?? await daftarLayananKemenagUpper();
  const terbatas = peran === "KECAMATAN" || daftar.includes(peran);
  if (!terbatas) return { izin: true, tenggang: false, terbatas: false };

  const akses = hitungAksesInput(await ambilKeadaanPeriode(sesi.userId));
  if (!akses.ditutup) return { izin: true, tenggang: false, terbatas: true };

  // Ditutup. Sakelar khusus akun bersifat final (tanpa masa tenggang). Selain itu, cari tahu
  // apakah penyebabnya jadwal otomatis: langsung (TIMER, cron belum jalan) atau sudah
  // diwujudkan cron (master TUTUP dan perubahan terakhirnya atas nama SISTEM (TIMER)).
  let timerDari: Date | null = akses.sumber === "TIMER" ? (akses.waktuTutup ?? null) : null;
  if (akses.sumber !== "KHUSUS") {
    const rows = await sql<BarisKonteksPenutupan[]>`
      select
        (select username from riwayat_setelan where key = ${KEY_INPUT_KECKEM}
          order by waktu desc, id desc limit 1) as terakhir_oleh,
        (select max(waktu_berlaku) from jadwal_periode_input
          where tahun = ${TAHUN_AKTIF} and jenis = 'TUTUP' and status in ('MENUNGGU', 'DIJALANKAN')
            and waktu_berlaku <= now()) as tutup_terakhir,
        (select dimulai_pada from upload_berkas_dimulai where akun_id = ${sesi.akunId}) as unggah_dimulai,
        now() as sekarang
    `;
    const k = rows[0];
    if (akses.sumber === "MASTER" && k.terakhir_oleh === PENGGUNA_TIMER) timerDari = k.tutup_terakhir;

    if (timerDari && dalamTenggang({ sekarang: k.sekarang, waktuTutup: timerDari, unggahDimulai: k.unggah_dimulai })) {
      return { izin: true, tenggang: true, terbatas: true };
    }
  }

  return {
    izin: false,
    respons: { sukses: false, pesan: pesanPenutupan({ konteks, sumber: akses.sumber, timerDari }) },
  };
}

// Dipanggil browser TEPAT SEBELUM mengunggah berkas ke Drive (unggah berjalan browser -> GAS,
// tidak lewat server ini). Dua fungsi: (1) menolak lebih awal bila periode sudah ditutup, supaya
// tidak ada berkas yatim; (2) mencatat "unggah dimulai" sebagai dasar masa tenggang 5 menit.
export async function mulaiUnggahBerkas(token: string) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { sukses: false, pesan: e instanceof Error ? e.message : String(e) };
  }

  try {
    const keputusan = await periksaIzinInput(sesi, "unggah");
    if (!keputusan.izin) return keputusan.respons;

    // Selama masa tenggang penanda TIDAK diperbarui, kalau tidak tenggang bisa diperpanjang
    // terus lewat unggahan baru.
    if (keputusan.terbatas && !keputusan.tenggang) {
      await sql`
        insert into upload_berkas_dimulai (akun_id, dimulai_pada) values (${sesi.akunId}, now())
        on conflict (akun_id) do update set dimulai_pada = excluded.dimulai_pada
      `;
    }
    return { sukses: true, tenggang: keputusan.tenggang };
  } catch (e) {
    return { sukses: false, pesan: "Gagal memeriksa status periode input: " + (e instanceof Error ? e.message : String(e)) };
  }
}

// Port dari setInputKecKem() (Kode.gs baris 2060-2140). Perubahan master + riwayat + auto-cleanup
// sakelar khusus yang jadi redundan kini dilakukan fungsi SQL set_master_periode() (juga dipakai
// job timer), jadi tombol manual dan timer tidak mungkin berbeda perilaku.
//
// Tambahan karena ada timer: tombol manual MENGALAHKAN jadwal lawannya yang sudah jatuh tempo
// tapi belum sempat dijalankan cron (kalau tidak, cron akan membalikkan pilihan admin dalam
// hitungan detik). Jadwal di masa depan tidak disentuh, kecuali admin memilih
// batalkanJadwalTutup saat menutup manual. `pesanMasukan` (opsional, K10): id pesan DRAF yang
// diterbitkan bersamaan; bila pesan tidak sah, SELURUH perubahan dibatalkan (periode tidak berubah).
export async function setInputKecKem(
  token: string,
  buka: boolean,
  batalkanJadwalTutup?: boolean,
  pesanMasukan?: number | string | null,
) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { sukses: false, pesan: e instanceof Error ? e.message : String(e) };
  }
  if ((sesi.role || "").toString().trim().toUpperCase() !== "UTAMA") {
    return { sukses: false, pesan: "Hanya admin utama yang boleh mengubah setelan ini." };
  }
  const idPesan = bacaIdOpsional(pesanMasukan);
  if (idPesan === undefined) return { sukses: false, pesan: "Id pesan tidak valid." };

  try {
    const nilaiBaru = buka ? "BUKA" : "TUTUP";
    const lawan = buka ? "TUTUP" : "BUKA";
    const batalSemuaTutup = !buka && batalkanJadwalTutup === true;
    const username = sesi.username;

    const hasil = await sql.begin(async (trx: any) => {
      const master = await trx`select public.set_master_periode(${nilaiBaru}, ${username}, ${""}) as h`;

      // CTE pemodifikasi data selalu dieksekusi: pesan yang terikat jadwal batal kembali ke DRAF.
      const dibatalkan = await trx`
        with batal as (
          update jadwal_periode_input
          set status = 'DIBATALKAN', dibatalkan_oleh = ${username}, dibatalkan_pada = now()
          where tahun = ${TAHUN_AKTIF} and status = 'MENUNGGU'
            and ((jenis = ${lawan} and waktu_berlaku <= now()) or (${batalSemuaTutup}::boolean and jenis = 'TUTUP'))
          returning id, jenis, waktu_berlaku, pesan_id
        ), pesan as (
          update pesan_admin set status = 'DRAF'
          where status = 'TERJADWAL' and id in (select pesan_id from batal)
        )
        select jenis, waktu_berlaku from batal
      `;

      // Dilakukan SETELAH pembatalan jadwal (urutan kunci: jadwal dulu, baru pesan).
      if (idPesan !== null) await terbitkanDalamTrx(trx, idPesan);

      const tutup = await trx`
        select waktu_berlaku from jadwal_periode_input
        where tahun = ${TAHUN_AKTIF} and jenis = 'TUTUP' and status = 'MENUNGGU'
        order by waktu_berlaku limit 1
      `;
      return {
        cleanup: Number(master[0].h?.cleanup) || 0,
        dibatalkan: dibatalkan as Array<{ jenis: string; waktu_berlaku: Date }>,
        tutupMenunggu: (tutup[0]?.waktu_berlaku ?? null) as Date | null,
      };
    });

    for (const j of hasil.dibatalkan) {
      await catatRiwayatSetelan(
        username,
        "JADWAL_PERIODE_" + j.jenis,
        j.waktu_berlaku.toISOString(),
        "(dibatalkan)",
        "tombol " + nilaiBaru + " manual",
      );
    }

    return {
      sukses: true,
      ditutup: !buka,
      cleanup: hasil.cleanup,
      jadwalDibatalkan: hasil.dibatalkan.length,
      jadwalTutup: ringkasJadwal(hasil.tutupMenunggu),
      pesanTerbit: idPesan,
    };
  } catch (error) {
    if (error instanceof GalatBisnis) return { sukses: false, pesan: error.message };
    return { sukses: false, pesan: String(error) };
  }
}

// Port dari ambilStatusDetailSetelan() (Kode.gs baris 2163-2199). Field lama tetap; ditambah jadwal
// (dan, khusus UTAMA, detail + riwayat jadwal). `ditutup` kini memperhitungkan jadwal tutup yang
// sudah jatuh tempo, supaya panel admin tidak menampilkan DIBUKA saat pengguna sebenarnya sudah
// ditolak (selisih sampai cron berikutnya, paling lama satu menit).
export async function ambilStatusDetailSetelan(token: string) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { sukses: false, pesan: e instanceof Error ? e.message : String(e) };
  }

  try {
    const utama = (sesi.role || "").toString().trim().toUpperCase() === "UTAMA";
    const [keadaan, rows, jadwal, pesan] = await Promise.all([
      ambilKeadaanPeriode(""),
      sql<BarisRiwayatSetelan[]>`
        select waktu, username, nilai_baru, keterangan from riwayat_setelan
        where key = ${KEY_INPUT_KECKEM}
        order by waktu desc, id desc
        limit 1
      `,
      utama ? ambilDetailJadwal() : Promise.resolve(null),
      ambilPesanTerbit(sesi.akunId),
    ]);

    // Khusus panel UTAMA: 10 versi pesan terbaru (lengkap dengan isi) + berapa yang sudah membaca.
    const [pesanRiwayat, statistikBaca] = utama
      ? await Promise.all([ambilRiwayatPesan(), pesan ? ambilRingkasBaca(pesan.id) : Promise.resolve(null)])
      : [null, null];

    const ditutup = keadaan.master === "TUTUP" ||
      (keadaan.tutupMenunggu !== null && keadaan.tutupMenunggu.getTime() <= keadaan.sekarang.getTime());

    let terakhirUbah = { waktu: "", username: "", nilaiBaru: "", keterangan: "" };
    if (rows.length > 0) {
      terakhirUbah = {
        waktu: formatTanggalWaktuWIB(rows[0].waktu),
        username: (rows[0].username || "").toString(),
        nilaiBaru: (rows[0].nilai_baru || "").toString(),
        keterangan: (rows[0].keterangan || "").toString(),
      };
    }

    return {
      sukses: true,
      ditutup,
      terakhirUbah,
      waktuServer: keadaan.sekarang.toISOString(),
      jadwalTutup: ringkasJadwal(keadaan.tutupMenunggu),
      jadwalBuka: ringkasJadwal(keadaan.bukaMenunggu),
      pesan,
      ...(jadwal ? { jadwal } : {}),
      ...(pesanRiwayat ? { pesanRiwayat, statistikBaca } : {}),
    };
  } catch (error) {
    return { sukses: false, pesan: String(error) };
  }
}

interface BarisJadwal {
  id: string | number;
  jenis: string;
  waktu_berlaku: Date;
  status: string;
  dibuat_oleh: string;
  dibuat_pada: Date;
  dijalankan_pada: Date | null;
  dibatalkan_oleh: string | null;
  dibatalkan_pada: Date | null;
  catatan: string;
  pesan_id: string | number | null;
}

function petaJadwal(r: BarisJadwal) {
  return {
    id: Number(r.id),
    jenis: r.jenis,
    status: r.status,
    ...ringkasJadwal(r.waktu_berlaku)!,
    dibuatOleh: r.dibuat_oleh,
    dibuatPada: formatTanggalWaktuWIB(r.dibuat_pada),
    dijalankanPada: formatTanggalWaktuWIB(r.dijalankan_pada),
    dibatalkanOleh: r.dibatalkan_oleh || "",
    dibatalkanPada: formatTanggalWaktuWIB(r.dibatalkan_pada),
    catatan: r.catatan || "",
    pesanId: r.pesan_id == null ? null : Number(r.pesan_id),
  };
}

// Jadwal yang sedang menunggu (maks. 1 TUTUP + 1 BUKA) + 5 riwayat terakhir. Khusus panel UTAMA.
async function ambilDetailJadwal() {
  const rows = await sql<BarisJadwal[]>`
    select id, jenis, waktu_berlaku, status, dibuat_oleh, dibuat_pada,
           dijalankan_pada, dibatalkan_oleh, dibatalkan_pada, catatan, pesan_id
    from jadwal_periode_input
    where tahun = ${TAHUN_AKTIF}
    order by (status = 'MENUNGGU') desc, id desc
    limit 7
  `;
  type ItemJadwal = ReturnType<typeof petaJadwal>;
  const semua: ItemJadwal[] = rows.map((r: BarisJadwal) => petaJadwal(r));
  const menunggu = semua.filter((j: ItemJadwal) => j.status === "MENUNGGU");
  return {
    tutup: menunggu.find((j: ItemJadwal) => j.jenis === "TUTUP") ?? null,
    buka: menunggu.find((j: ItemJadwal) => j.jenis === "BUKA") ?? null,
    riwayat: semua.filter((j: ItemJadwal) => j.status !== "MENUNGGU").slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// Jadwal otomatis: atur / batalkan / perpanjang (khusus admin UTAMA)
// ---------------------------------------------------------------------------

const PESAN_JADWAL_BUKAN_UTAMA = "Hanya admin utama yang boleh mengatur jadwal periode input.";

function normalisasiJenis(v: unknown): "BUKA" | "TUTUP" | null {
  const j = normalisasi(v);
  return j === "BUKA" || j === "TUTUP" ? j : null;
}

// Buat jadwal baru. Jadwal sejenis yang masih menunggu otomatis digantikan (dibatalkan + tercatat).
// `waktuMasukan` tanpa zona dibaca sebagai WIB ("2026-11-30T23:59").
// `pesanMasukan` (opsional): id pesan DRAF/TERJADWAL yang akan terbit otomatis saat jadwal berjalan.
export async function aturJadwalPeriode(
  token: string,
  jenisMasukan: string,
  waktuMasukan: string,
  catatanMasukan?: string,
  pesanMasukan?: number | string | null,
) {
  const cek = await wajibUtama(token, PESAN_JADWAL_BUKAN_UTAMA);
  if ("galat" in cek) return cek.galat;
  const { sesi } = cek;

  const jenis = normalisasiJenis(jenisMasukan);
  if (!jenis) return { sukses: false, pesan: "Jenis jadwal harus BUKA atau TUTUP." };
  const waktu = parseWaktuWIB(waktuMasukan);
  if (!waktu) return { sukses: false, pesan: "Format tanggal/jam tidak valid. Contoh: 2026-11-30T23:59 (WIB)." };
  const idPesan = bacaIdOpsional(pesanMasukan);
  if (idPesan === undefined) return { sukses: false, pesan: "Id pesan tidak valid." };
  const catatan = bersihkanCatatan(catatanMasukan);
  const lawan = jenis === "TUTUP" ? "BUKA" : "TUTUP";
  const waktuIso = waktu.toISOString();
  const username = sesi.username;

  try {
    const hasil = await sql.begin(async (trx: any) => {
      const [kead] = await trx`
        select now() as sekarang,
          (select value from setelan where key = ${KEY_INPUT_KECKEM}) as master,
          (select min(waktu_berlaku) from jadwal_periode_input
            where tahun = ${TAHUN_AKTIF} and jenis = ${lawan} and status = 'MENUNGGU') as lainnya
      `;
      const galat = validasiWaktuJadwal({ waktu, sekarang: kead.sekarang, lainnya: kead.lainnya });
      if (galat) throw new GalatBisnis(galat);

      // Urutan kunci: jadwal dulu, baru pesan (sama dengan job cron).
      const lama = await trx`
        with batal as (
          update jadwal_periode_input
          set status = 'DIBATALKAN', dibatalkan_oleh = ${username}, dibatalkan_pada = now()
          where tahun = ${TAHUN_AKTIF} and jenis = ${jenis} and status = 'MENUNGGU'
          returning id, waktu_berlaku, pesan_id
        ), pesan as (
          update pesan_admin set status = 'DRAF'
          where status = 'TERJADWAL' and id in (select pesan_id from batal)
        )
        select id, waktu_berlaku from batal
      `;

      if (idPesan !== null) {
        const p = await trx`select status from pesan_admin where id = ${idPesan} for update`;
        if (p.length === 0) throw new GalatBisnis("Pesan yang akan dijadwalkan tidak ditemukan.");
        if (p[0].status !== "DRAF" && p[0].status !== "TERJADWAL") {
          throw new GalatBisnis("Hanya pesan berstatus DRAF yang bisa dikaitkan dengan jadwal.");
        }
        const terikat = await trx`
          select 1 from jadwal_periode_input where pesan_id = ${idPesan} and status = 'MENUNGGU' and jenis <> ${jenis}
        `;
        if (terikat.length > 0) throw new GalatBisnis("Pesan ini sudah terikat ke jadwal lain.");
      }

      const baru = await trx`
        insert into jadwal_periode_input (tahun, jenis, waktu_berlaku, pesan_id, dibuat_oleh, catatan)
        values (${TAHUN_AKTIF}, ${jenis}, ${waktuIso}::timestamptz, ${idPesan}, ${username}, ${catatan})
        returning id
      `;
      if (idPesan !== null) await trx`update pesan_admin set status = 'TERJADWAL' where id = ${idPesan}`;

      const masterSaatIni = normalisasi(kead.master);
      let peringatan = "";
      if (jenis === "TUTUP" && masterSaatIni === "TUTUP") {
        peringatan = "Periode input saat ini sudah DITUTUP, jadi jadwal tutup ini tidak mengubah apa pun.";
      } else if (jenis === "BUKA" && masterSaatIni !== "TUTUP") {
        peringatan = "Periode input saat ini sudah DIBUKA, jadi jadwal buka ini tidak mengubah apa pun.";
      }
      return { id: Number(baru[0].id), lama: (lama[0]?.waktu_berlaku ?? null) as Date | null, peringatan };
    });

    await catatRiwayatSetelan(
      username,
      "JADWAL_PERIODE_" + jenis,
      hasil.lama ? hasil.lama.toISOString() : "-",
      waktuIso,
      `jadwal #${hasil.id}${idPesan !== null ? " | pesan #" + idPesan : ""}${catatan ? " | " + catatan : ""}`,
    );

    return {
      sukses: true,
      id: hasil.id,
      jenis,
      ...ringkasJadwal(waktu)!,
      menggantikan: hasil.lama ? ringkasJadwal(hasil.lama) : null,
      pesanId: idPesan,
      peringatan: hasil.peringatan,
    };
  } catch (error) {
    if (error instanceof GalatBisnis) return { sukses: false, pesan: error.message };
    if ((error as { code?: string })?.code === "23505") {
      return { sukses: false, pesan: "Jadwal sedang diubah admin lain. Muat ulang panel lalu coba lagi." };
    }
    return { sukses: false, pesan: String(error) };
  }
}

export async function batalkanJadwalPeriode(token: string, jenisMasukan: string) {
  const cek = await wajibUtama(token, PESAN_JADWAL_BUKAN_UTAMA);
  if ("galat" in cek) return cek.galat;
  const { sesi } = cek;

  const jenis = normalisasiJenis(jenisMasukan);
  if (!jenis) return { sukses: false, pesan: "Jenis jadwal harus BUKA atau TUTUP." };

  try {
    const batal = await sql`
      with batal as (
        update jadwal_periode_input
        set status = 'DIBATALKAN', dibatalkan_oleh = ${sesi.username}, dibatalkan_pada = now()
        where tahun = ${TAHUN_AKTIF} and jenis = ${jenis} and status = 'MENUNGGU'
        returning id, waktu_berlaku, pesan_id
      ), pesan as (
        update pesan_admin set status = 'DRAF'
        where status = 'TERJADWAL' and id in (select pesan_id from batal)
      )
      select id, waktu_berlaku from batal
    `;
    if (batal.length === 0) {
      return { sukses: false, pesan: `Tidak ada jadwal ${jenis} yang sedang menunggu (mungkin sudah dijalankan).` };
    }

    await catatRiwayatSetelan(
      sesi.username,
      "JADWAL_PERIODE_" + jenis,
      (batal[0].waktu_berlaku as Date).toISOString(),
      "(dibatalkan)",
      `jadwal #${Number(batal[0].id)}`,
    );
    return { sukses: true, jenis, id: Number(batal[0].id) };
  } catch (error) {
    return { sukses: false, pesan: String(error) };
  }
}

// Pintasan "+1 jam / +1 hari / +3 hari": geser jadwal TUTUP yang menunggu sebanyak `menit`.
// Hanya untuk jadwal yang BELUM dijalankan; bila sudah tutup, gunakan tombol BUKA PERIODE INPUT.
export async function perpanjangJadwalPeriode(token: string, menitMasukan: number) {
  const cek = await wajibUtama(token, PESAN_JADWAL_BUKAN_UTAMA);
  if ("galat" in cek) return cek.galat;
  const { sesi } = cek;

  const menit = Number(menitMasukan);
  if (!Number.isInteger(menit) || menit < 1 || menit > BATAS_PERPANJANG_MENIT) {
    return { sukses: false, pesan: `Perpanjangan harus 1 sampai ${BATAS_PERPANJANG_MENIT} menit.` };
  }

  try {
    const hasil = await sql.begin(async (trx: any) => {
      // Kunci baris dulu supaya tidak berebut dengan job cron yang sedang menjalankannya.
      const ada = await trx`
        select id, waktu_berlaku, now() as sekarang from jadwal_periode_input
        where tahun = ${TAHUN_AKTIF} and jenis = 'TUTUP' and status = 'MENUNGGU'
        for update
      `;
      if (ada.length === 0) {
        return { galat: "Tidak ada jadwal TUTUP yang sedang menunggu. Jika periode sudah ditutup, gunakan tombol BUKA PERIODE INPUT." };
      }
      const lama: Date = ada[0].waktu_berlaku;
      const baru = new Date(lama.getTime() + menit * 60 * 1000);
      const galat = validasiWaktuJadwal({ waktu: baru, sekarang: ada[0].sekarang, jedaMinimalMenit: 1 });
      if (galat) return { galat };

      await trx`update jadwal_periode_input set waktu_berlaku = ${baru.toISOString()}::timestamptz where id = ${ada[0].id}`;
      return { id: Number(ada[0].id), lama, baru };
    });

    if ("galat" in hasil) return { sukses: false, pesan: hasil.galat };

    await catatRiwayatSetelan(
      sesi.username,
      "JADWAL_PERIODE_TUTUP",
      hasil.lama.toISOString(),
      hasil.baru.toISOString(),
      `jadwal #${hasil.id} diperpanjang ${menit} menit`,
    );
    return { sukses: true, id: hasil.id, jenis: "TUTUP", ...ringkasJadwal(hasil.baru)! };
  } catch (error) {
    return { sukses: false, pesan: String(error) };
  }
}

interface HasilSakelar {
  action: "DIHAPUS" | "TIDAK_BERUBAH" | "DIUBAH" | "DITAMBAH" | "TIDAK_ADA_USER_ID" | "TIDAK_KETEMU";
  nilaiLama?: string;
  nilaiBaru?: string;
  alasan?: string;
}

// Port 1:1 dari setSakelarUser_() (Kode.gs baris 3587-3629) — versi private, TANPA parameter
// token/pengecekan sesi (pemanggil di modul ini sudah memvalidasi UTAMA lebih dulu; Kode.gs
// memvalidasi lagi di sini karena fungsi aslinya bisa dipanggil lepas, tapi di sini SELALU
// dipanggil dari fungsi yang sudah mengecek, jadi pengecekan ganda dihilangkan tanpa mengubah
// perilaku yang terlihat).
async function setSakelarUser(userId: string, nilaiBaru: string): Promise<HasilSakelar> {
  if (!userId) throw new Error("User ID kosong.");
  const nilaiUpper = nilaiBaru.toString().trim().toUpperCase();
  if (nilaiUpper !== "BUKA" && nilaiUpper !== "TUTUP") throw new Error("Nilai harus BUKA atau TUTUP.");

  const masterKetutup = await inputKecKemDitutup();
  const masterNilai = masterKetutup ? "TUTUP" : "BUKA";
  const keyUser = PREFIX_SAKELAR_USER + userId;
  const nilaiLama = await ambilSetelan(keyUser);

  if (nilaiUpper === masterNilai) {
    if (nilaiLama) {
      await hapusSakelarUser(userId);
      return { action: "DIHAPUS", nilaiLama, alasan: "Sama dengan master" };
    }
    return { action: "TIDAK_BERUBAH", nilaiLama: "", alasan: "Sudah default (ikut master)" };
  }

  await sql`
    insert into setelan (key, value) values (${keyUser}, ${nilaiUpper})
    on conflict (key) do update set value = excluded.value
  `;
  return nilaiLama
    ? { action: "DIUBAH", nilaiLama, nilaiBaru: nilaiUpper }
    : { action: "DITAMBAH", nilaiLama: "", nilaiBaru: nilaiUpper };
}

// Port 1:1 dari hapusSakelarUser_() (Kode.gs baris 3632-3654) — versi private, lihat catatan di atas.
async function hapusSakelarUser(userId: string): Promise<HasilSakelar> {
  if (!userId) return { action: "TIDAK_ADA_USER_ID" };
  const keyUser = PREFIX_SAKELAR_USER + userId;
  const rows = await sql`delete from setelan where key = ${keyUser} returning key`;
  return rows.length > 0 ? { action: "DIHAPUS" } : { action: "TIDAK_KETEMU" };
}

// Port 1:1 dari setSakelarUserByAdmin() (Kode.gs baris 3658-3693).
export async function setSakelarUserByAdmin(token: string, userId: string, buka: boolean) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { sukses: false, pesan: e instanceof Error ? e.message : String(e) };
  }
  if ((sesi.role || "").toString().trim().toUpperCase() !== "UTAMA") {
    return { sukses: false, pesan: "Hanya admin utama yang boleh mengubah sakelar user." };
  }
  if (!userId) return { sukses: false, pesan: "User ID kosong." };

  try {
    const nilaiBaru = buka ? "BUKA" : "TUTUP";
    const hasil = await setSakelarUser(userId, nilaiBaru);

    if (hasil.action === "DITAMBAH" || hasil.action === "DIUBAH" || hasil.action === "DIHAPUS") {
      const nilaiLamaLog = hasil.nilaiLama || "(default)";
      const nilaiBaruLog = hasil.action === "DIHAPUS" ? "(default)" : nilaiBaru;
      await catatRiwayatSetelan(sesi.username, PREFIX_SAKELAR_USER + userId, nilaiLamaLog, nilaiBaruLog);
    }

    return {
      sukses: true,
      action: hasil.action,
      pesan: hasil.action === "TIDAK_BERUBAH"
        ? "Sakelar tidak berubah: " + hasil.alasan
        : "Sakelar user berhasil diubah.",
    };
  } catch (error) {
    return { sukses: false, pesan: String(error) };
  }
}

// Port 1:1 dari resetSakelarUserByAdmin() (Kode.gs baris 3696-3727).
export async function resetSakelarUserByAdmin(token: string, userId: string) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { sukses: false, pesan: e instanceof Error ? e.message : String(e) };
  }
  if ((sesi.role || "").toString().trim().toUpperCase() !== "UTAMA") {
    return { sukses: false, pesan: "Hanya admin utama yang boleh mengubah sakelar user." };
  }
  if (!userId) return { sukses: false, pesan: "User ID kosong." };

  try {
    const nilaiLama = await ambilSetelan(PREFIX_SAKELAR_USER + userId);
    const hasil = await hapusSakelarUser(userId);

    if (hasil.action === "DIHAPUS") {
      await catatRiwayatSetelan(sesi.username, PREFIX_SAKELAR_USER + userId, nilaiLama, "(default)");
    }

    return {
      sukses: true,
      pesan: hasil.action === "DIHAPUS"
        ? "Sakelar khusus dihapus. User kembali mengikuti master."
        : "User tidak punya sakelar khusus. Sudah ikut master.",
    };
  } catch (error) {
    return { sukses: false, pesan: String(error) };
  }
}

// Port 1:1 dari ambilDaftarUserDenganStatus() (Kode.gs baris 3732-3818). Filter `role <> 'UTAMA'`
// dipindah ke SQL (dieksekusi Postgres, bukan loop JS) — hasil akhirnya sama.
export async function ambilDaftarUserDenganStatus(token: string) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { sukses: false, pesan: e instanceof Error ? e.message : String(e) };
  }
  if ((sesi.role || "").toString().trim().toUpperCase() !== "UTAMA") {
    return { sukses: false, pesan: "Hanya admin utama yang boleh mengakses daftar ini." };
  }

  try {
    const rowsAkun = await sql<AkunPenggunaBaris[]>`
      select username, role, kecamatan, user_id, nama_lengkap, nomor_hp, jabatan
      from akun
      where role <> 'UTAMA'
    `;

    const rowsSetelanKhusus = await sql<BarisSetelan[]>`
      select key, value from setelan where key like ${PREFIX_SAKELAR_USER + "%"}
    `;
    const petaSakelarKhusus: Record<string, string> = {};
    for (const r of rowsSetelanKhusus) {
      const nilai = (r.value || "").toString().trim().toUpperCase();
      if (nilai === "BUKA" || nilai === "TUTUP") {
        const userId = (r.key || "").toString().toUpperCase().slice(PREFIX_SAKELAR_USER.length);
        petaSakelarKhusus[userId] = nilai;
      }
    }

    const masterKetutup = await inputKecKemDitutup();

    const daftar: ItemDaftarUserStatus[] = rowsAkun.map((r: AkunPenggunaBaris) => {
      const userId = (r.user_id || "").toString().trim().toUpperCase();
      let statusEfektif: string;
      let sumber: string;
      if (userId && petaSakelarKhusus[userId]) {
        statusEfektif = petaSakelarKhusus[userId];
        sumber = "KHUSUS";
      } else {
        statusEfektif = masterKetutup ? "TUTUP" : "BUKA";
        sumber = "MASTER";
      }
      return {
        username: String(r.username || ""),
        userId,
        role: (r.role || "").toString().trim().toUpperCase(),
        kecamatan: (r.kecamatan || "").toString().trim().toUpperCase(),
        nama: (r.nama_lengkap || "").toString().trim(),
        hp: (r.nomor_hp || "").toString().trim(),
        jabatan: (r.jabatan || "").toString().trim(),
        status: statusEfektif,
        sumber,
      };
    });

    daftar.sort((a: ItemDaftarUserStatus, b: ItemDaftarUserStatus) => {
      if (a.sumber !== b.sumber) return a.sumber === "KHUSUS" ? -1 : 1;
      if (a.kecamatan !== b.kecamatan) return a.kecamatan.localeCompare(b.kecamatan);
      return a.username.localeCompare(b.username);
    });

    return {
      sukses: true,
      daftar,
      masterKetutup,
      jumlahKhusus: Object.keys(petaSakelarKhusus).length,
    };
  } catch (error) {
    return { sukses: false, pesan: String(error) };
  }
}

// Port 1:1 dari bulkSakelarPerKecamatan() (Kode.gs baris 3823-3897).
export async function bulkSakelarPerKecamatan(token: string, namaKecamatan: string, action: string) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { sukses: false, pesan: e instanceof Error ? e.message : String(e) };
  }
  if ((sesi.role || "").toString().trim().toUpperCase() !== "UTAMA") {
    return { sukses: false, pesan: "Hanya admin utama yang boleh melakukan aksi ini." };
  }

  const actionUpper = (action || "").toString().trim().toUpperCase();
  if (!["BUKA", "TUTUP", "RESET"].includes(actionUpper)) {
    return { sukses: false, pesan: "Action harus BUKA, TUTUP, atau RESET." };
  }

  try {
    const kecTarget = (namaKecamatan || "").toString().trim().toUpperCase();

    const rowsAkun = await sql<AkunPenggunaBaris[]>`
      select user_id from akun where role <> 'UTAMA' and kecamatan = ${kecTarget}
    `;
    const listUserId = rowsAkun
      .map((r: AkunPenggunaBaris) => (r.user_id || "").toString().trim().toUpperCase())
      .filter((id: string) => id.length > 0);

    if (listUserId.length === 0) {
      return { sukses: false, pesan: "Tidak ada user di kecamatan tsb." };
    }

    let berhasil = 0;
    for (const userId of listUserId) {
      try {
        if (actionUpper === "RESET") {
          await hapusSakelarUser(userId);
        } else {
          await setSakelarUser(userId, actionUpper);
        }
        berhasil++;
      } catch (_eInner) {
        // Sama seperti Kode.gs: satu user gagal tidak menghentikan proses bulk untuk user lain.
      }
    }

    const labelKec = kecTarget || "(TANPA KECAMATAN)";
    await catatRiwayatSetelan(sesi.username, "BULK_" + actionUpper + "_" + labelKec, "-", berhasil + " user");

    return {
      sukses: true,
      jumlah: berhasil,
      pesan: "Bulk " + actionUpper + " berhasil untuk " + berhasil + " user di " + labelKec + ".",
    };
  } catch (error) {
    return { sukses: false, pesan: String(error) };
  }
}
