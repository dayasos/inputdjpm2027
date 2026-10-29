import { sql } from "../_shared/db.ts";
import { wajibSesi } from "../_shared/sesi.ts";
import { KECAMATAN_MEDAN_URUT, TAHUN_AKTIF } from "../_shared/config.ts";
import { getMasterLayanan } from "./master.ts";

interface BarisKuota {
  kecamatan: string;
  layanan: string;
  kuota: number | string;
}

// Port 1:1 dari getSemuaKuota() — array polos [{kecamatan, layanan, kuota}], dipakai langsung
// sebagai `daftarKuotaCache` di index.html (baris 4941-4942) tanpa pembungkus {sukses,...}.
//
// PENTING: kegagalan sesi SENGAJA dibiarkan melempar (bukan ditangkap jadi array kosong).
// Versi sebelumnya menangkap error sesi lalu mengembalikan [] -- akibatnya modal "Kelola Kuota"
// selalu tampil "Belum ada data kuota tersimpan" saat token kedaluwarsa/tidak sah, walau data di
// tabel `kuota` ada (mis. 336 baris di produksi), menyesatkan admin mengira migrasi belum
// selesai. Dengan melempar, index.ts akan membalikkan {error:...} dan google.script.run shim di
// api-bridge.js otomatis mendeteksi pesan "SESI TIDAK SAH" lalu menampilkan modal login ulang --
// bukan diam-diam menampilkan tabel kosong.
export async function getSemuaKuota(token: string) {
  await wajibSesi(token);
  const rows = await sql<BarisKuota[]>`select kecamatan, layanan, kuota_maks as kuota from kuota`;
  return rows.map((r: BarisKuota) => ({ kecamatan: r.kecamatan, layanan: r.layanan, kuota: Number(r.kuota) || 0 }));
}

// Port dari simpanKuota() — hanya UTAMA. Kode.gs pakai LockService + scan-manual (find-then-update-
// or-append) karena Sheets tidak punya upsert atomik; di Postgres cukup INSERT..ON CONFLICT (atomik
// secara native, tidak perlu lock eksplisit). Deteksi insert-vs-update pakai trik `xmax = 0` supaya
// pesan sukses ("diperbarui" vs "ditambahkan") tetap sama seperti aslinya.
export async function simpanKuota(token: string, kecamatan: string, layanan: string, kuota: number) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { sukses: false, pesan: e instanceof Error ? e.message : String(e) };
  }
  if (sesi.role !== "UTAMA") {
    return { sukses: false, pesan: "Akses ditolak: hanya Admin Utama yang dapat mengubah kuota." };
  }

  try {
    const kecUpper = String(kecamatan || "").trim().toUpperCase();
    const layUpper = String(layanan || "").trim().toUpperCase();
    const kuotaNum = Number(kuota) || 0;

    const rows = await sql`
      insert into kuota (kecamatan, layanan, kuota_maks, diperbarui_at)
      values (${kecUpper}, ${layUpper}, ${kuotaNum}, now())
      on conflict (kecamatan, layanan) do update set kuota_maks = ${kuotaNum}, diperbarui_at = now()
      returning (xmax = 0) as inserted
    `;
    const diubah = !rows[0].inserted;

    return { sukses: true, pesan: diubah ? "Kuota berhasil diperbarui." : "Kuota berhasil ditambahkan." };
  } catch (error) {
    return { sukses: false, pesan: String(error) };
  }
}

// Port 1:1 dari getProgresKuota() — khusus Admin Utama. Pemakaian (jumlah input per
// layanan+kecamatan) dihitung via SQL GROUP BY (bukan loop JS di atas snapshot sheet) — hasil
// akhirnya sama, cuma lebih murah karena agregasi dilakukan di Postgres.
export async function getProgresKuota(token: string) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { sukses: false, pesan: e instanceof Error ? e.message : String(e) };
  }
  if ((sesi.role || "").toString().trim().toUpperCase() !== "UTAMA") {
    return { sukses: false, pesan: "Fitur ini khusus Admin Utama." };
  }

  try {
    const master = await getMasterLayanan();
    const urutanLayanan: string[] = [];
    for (const l of master.kecamatan || []) {
      const u = l.toString().trim().toUpperCase();
      if (!urutanLayanan.includes(u)) urutanLayanan.push(u);
    }
    for (const l of master.kemenag || []) {
      const u = l.toString().trim().toUpperCase();
      if (!urutanLayanan.includes(u)) urutanLayanan.push(u);
    }

    const rowsKuota = await sql`select kecamatan, layanan, kuota_maks from kuota`;
    const kuotaMap: Record<string, number> = {};
    const setLayananDenganKuota = new Set<string>();
    for (const r of rowsKuota) {
      const lay = (r.layanan || "").toUpperCase();
      const kec = (r.kecamatan || "").toUpperCase();
      kuotaMap[lay + "||" + kec] = Number(r.kuota_maks) || 0;
      setLayananDenganKuota.add(lay);
    }

    const rowsPemakaian = await sql`
      select layanan, kecamatan, count(*)::int as jumlah
      from penerima
      where tahun = ${TAHUN_AKTIF}
      group by layanan, kecamatan
    `;
    const pemakaian: Record<string, number> = {};
    for (const r of rowsPemakaian) {
      const lay = (r.layanan || "").toUpperCase();
      const kec = (r.kecamatan || "").toUpperCase();
      if (!lay || !kec) continue;
      pemakaian[lay + "||" + kec] = r.jumlah;
    }

    // deno-lint-ignore no-explicit-any
    const grup: any[] = [];
    for (const lay of urutanLayanan) {
      if (!setLayananDenganKuota.has(lay)) continue;

      // deno-lint-ignore no-explicit-any
      const baris: any[] = [];
      let totalKuota = 0;
      let totalInput = 0;
      for (const kec of KECAMATAN_MEDAN_URUT) {
        const key = lay + "||" + kec;
        if (!(key in kuotaMap)) continue;
        const kuotaNilai = kuotaMap[key];
        const input = pemakaian[key] || 0;
        const persen = kuotaNilai > 0 ? Math.round((input / kuotaNilai) * 1000) / 10 : 0;
        totalKuota += kuotaNilai;
        totalInput += input;
        baris.push({ kecamatan: kec, kuota: kuotaNilai, input, sisa: kuotaNilai - input, persen });
      }
      if (baris.length === 0) continue;

      const persenLayanan = totalKuota > 0 ? Math.round((totalInput / totalKuota) * 1000) / 10 : 0;
      grup.push({ layanan: lay, totalKuota, totalInput, persenLayanan, baris });
    }

    return { sukses: true, grup };
  } catch (error) {
    return { sukses: false, pesan: String(error) };
  }
}

// Progres Capaian Input (khusus Admin Utama) -- rencana: plans/plan-progres-capaian-input.md.
// Satu model data untuk layar DAN PDF. Beda dengan getProgresKuota: SEMUA layanan master ikut
// (walau belum ada kuota/input), dan input diperinci sampai kelurahan untuk layanan Kecamatan.
// Kunci "LAYANAN||KECAMATAN" di `kuota`/`input` sengaja hanya ada bila datanya ada: kunci
// `kuota` yang absen = layanan itu TIDAK punya kuota di kecamatan tsb (sel abu-abu di frontend).
// Baris kuota bernilai 0 diperlakukan SAMA dengan tidak ada kuota (di produksi banyak pasangan
// layanan x kecamatan bernilai 0, mis. Guru Sekolah Hindu 17 dari 21 kecamatan) -- bukan "0/0 = 0%" merah.
export async function getCapaianInput(token: string) {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { sukses: false, pesan: e instanceof Error ? e.message : String(e) };
  }
  if ((sesi.role || "").toString().trim().toUpperCase() !== "UTAMA") {
    return { sukses: false, pesan: "Fitur ini khusus Admin Utama." };
  }

  try {
    const [master, rowsKuota, rowsWilayah, rowsInput] = await Promise.all([
      getMasterLayanan(),
      sql`select upper(trim(kecamatan)) as kecamatan, upper(trim(layanan)) as layanan, kuota_maks from kuota`,
      sql`select upper(trim(kecamatan)) as kecamatan, upper(trim(kelurahan)) as kelurahan from wilayah order by 1, 2`,
      sql`
        select upper(trim(coalesce(layanan, ''))) as layanan,
               upper(trim(coalesce(kecamatan, ''))) as kecamatan,
               upper(trim(coalesce(kelurahan, ''))) as kelurahan,
               count(*)::int as jumlah
        from penerima
        where tahun = ${TAHUN_AKTIF}
        group by 1, 2, 3
      `,
    ]);

    const rapikan = (daftar: string[]) => daftar.map((l) => l.toString().trim().toUpperCase()).filter((l) => l);
    const layananKecamatan = rapikan(master.kecamatan || []);
    const layananKemenag = rapikan(master.kemenag || []);
    const setKecamatanLay = new Set(layananKecamatan);
    const semuaLayanan = new Set([...layananKecamatan, ...layananKemenag]);

    const kuota: Record<string, number> = {};
    for (const r of rowsKuota) {
      const nilai = Number(r.kuota_maks) || 0;
      if (nilai > 0) kuota[r.layanan + "||" + r.kecamatan] = nilai;
    }

    // Kelurahan resmi per kecamatan (0 input tetap tampil). Kelurahan penerima yang tak cocok
    // dengan `wilayah` dikumpulkan di `tidakTerdaftar` agar jumlah tetap menjumlah ke total kecamatan.
    // deno-lint-ignore no-explicit-any
    const kelurahan: Record<string, any[]> = {};
    for (const k of KECAMATAN_MEDAN_URUT) kelurahan[k] = [];
    // deno-lint-ignore no-explicit-any
    const petaKel: Record<string, any> = {};
    for (const w of rowsWilayah) {
      if (!(w.kecamatan in kelurahan)) continue;
      const item = { nama: w.kelurahan, perLayanan: {} as Record<string, number>, total: 0 };
      kelurahan[w.kecamatan].push(item);
      petaKel[w.kecamatan + "||" + w.kelurahan] = item;
    }

    const input: Record<string, number> = {};
    // deno-lint-ignore no-explicit-any
    const tidakTerdaftar: Record<string, Record<string, any>> = {};
    for (const r of rowsInput) {
      if (!semuaLayanan.has(r.layanan) || !(r.kecamatan in kelurahan)) continue;
      const kunci = r.layanan + "||" + r.kecamatan;
      input[kunci] = (input[kunci] || 0) + r.jumlah;

      if (!setKecamatanLay.has(r.layanan)) continue; // kelurahan hanya untuk layanan Kecamatan
      let item = petaKel[r.kecamatan + "||" + r.kelurahan];
      if (!item) {
        const peta = (tidakTerdaftar[r.kecamatan] ||= {});
        item = peta[r.kelurahan] ||= { nama: r.kelurahan || "(KOSONG)", perLayanan: {}, total: 0, tidakTerdaftar: true };
      }
      item.perLayanan[r.layanan] = (item.perLayanan[r.layanan] || 0) + r.jumlah;
      item.total += r.jumlah;
    }

    const hitung = (daftar: string[]) => {
      let totalKuota = 0;
      let totalInput = 0;
      for (const lay of daftar) {
        for (const kec of KECAMATAN_MEDAN_URUT) {
          const k = lay + "||" + kec;
          totalKuota += kuota[k] || 0;
          totalInput += input[k] || 0;
        }
      }
      const persen = totalKuota > 0 ? Math.round((totalInput / totalKuota) * 1000) / 10 : 0;
      return { totalKuota, totalInput, persen };
    };

    let kelurahanBelumInput = 0;
    for (const kec of KECAMATAN_MEDAN_URUT) {
      for (const k of kelurahan[kec]) if (k.total === 0) kelurahanBelumInput++;
    }

    return {
      sukses: true,
      diperbarui: new Date().toISOString(),
      tahun: TAHUN_AKTIF,
      layananKecamatan,
      layananKemenag,
      kecamatan: KECAMATAN_MEDAN_URUT,
      kuota,
      input,
      kelurahan,
      tidakTerdaftar: Object.fromEntries(
        Object.entries(tidakTerdaftar).map(([kec, peta]) => [kec, Object.values(peta)]),
      ),
      ringkasan: {
        kecamatan: hitung(layananKecamatan),
        kemenag: hitung(layananKemenag),
        kelurahanBelumInput,
        jumlahKelurahan: rowsWilayah.length,
      },
    };
  } catch (error) {
    return { sukses: false, pesan: String(error) };
  }
}
