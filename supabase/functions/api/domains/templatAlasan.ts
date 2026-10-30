import { sql } from "../_shared/db.ts";
import { wajibSesi } from "../_shared/sesi.ts";
import { getMasterLayanan } from "./master.ts";

// Templat "Alasan Cepat" untuk keterangan verifikasi (plan: plans/plan-templat-alasan-berkas-tidak-lengkap.md).
// Hanya Admin Utama. Jalur simpan keterangan verifikasi (verifikasi.ts) TIDAK berubah: templat hanya mengisi kotak
// keterangan di browser; yang tersimpan di penerima tetap teks biasa, sehingga mengubah/menghapus templat tidak
// mempengaruhi keterangan yang sudah ada.

export const STATUS_TEMPLAT = ["Berkas Tidak Lengkap", "Tidak Memenuhi Syarat"];
export const MAKS_JUDUL = 40;
export const MAKS_ISI = 400;
const VARIABEL = "{LAYANAN}";

interface BarisTemplat {
  id: number | string;
  status_berlaku: string;
  judul: string;
  isi: string;
  layanan: string[] | null;
  urutan: number | string;
  aktif: boolean;
}

// Daftar teks -> literal array Postgres ('{"a","b"}') yang dikirim sebagai SATU parameter lalu di-cast ::text[] di SQL (pola yang sama
// dengan master.ts). Sengaja BUKAN sql.array: untuk larik KOSONG (= "semua layanan") postgres.js mengirim teks kosong "" (tipe 0 tanpa serializer),
// yang ditolak Postgres ("malformed array literal"). Di dalam tanda kutip, backslash dan tanda kutip ganda di-escape dengan backslash.
export function literalArrayTeks(daftar: string[]): string {
  return "{" + daftar.map((x) => '"' + x.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"').join(",") + "}";
}

// Kolom text[] normalnya sudah menjadi array JS (postgres.js). Bila driver tak mengenali tipenya dan mengembalikan teks '{"A","B C"}',
// templat khusus layanan tertentu akan DIAM-DIAM tampil seolah berlaku untuk semua layanan -- maka teks itu diurai di sini sebagai cadangan.
export function daftarDariPg(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  const t = typeof v === "string" ? v.trim() : "";
  if (t.length < 2 || t[0] !== "{" || t[t.length - 1] !== "}") return [];
  const hasil: string[] = [];
  const akhir = t.length - 1;
  let i = 1;
  while (i < akhir) {
    if (t[i] === ",") { i++; continue; }
    if (t[i] === '"') {
      let j = i + 1, x = "";
      while (j < akhir && t[j] !== '"') {
        if (t[j] === "\\") j++;
        x += t[j] ?? "";
        j++;
      }
      hasil.push(x);
      i = j + 1;
    } else {
      let j = i;
      while (j < akhir && t[j] !== ",") j++;
      hasil.push(t.slice(i, j));
      i = j;
    }
  }
  return hasil;
}

function petakan(r: BarisTemplat) {
  return {
    id: Number(r.id),
    status: r.status_berlaku,
    judul: r.judul,
    isi: r.isi,
    layanan: daftarDariPg(r.layanan),
    urutan: Number(r.urutan) || 0,
    aktif: r.aktif === true,
  };
}

type HasilUtama = { ok: true; username: string } | { ok: false; pesan: string };

async function wajibUtama(token: string): Promise<HasilUtama> {
  let sesi;
  try {
    sesi = await wajibSesi(token);
  } catch (e) {
    return { ok: false, pesan: e instanceof Error ? e.message : String(e) };
  }
  if ((sesi.role || "").toString().trim().toUpperCase() !== "UTAMA") {
    return { ok: false, pesan: "Fitur ini khusus Admin Utama." };
  }
  return { ok: true, username: (sesi.username || "").toString() };
}

/**
 * Membersihkan & memvalidasi isian satu templat. Mengembalikan {galat} bila ada yang salah, selain itu nilai bersih
 * (judul rapi, kalimat HURUF BESAR satu baris, layanan unik & dikenal; kosong = semua layanan).
 */
export function bersihkanTemplat(
  data: { judul?: unknown; isi?: unknown; layanan?: unknown },
  layananValid: Set<string>,
): { galat: string } | { judul: string; isi: string; layanan: string[] } {
  const judul = String(data?.judul ?? "").replace(/\s+/g, " ").trim();
  if (!judul) return { galat: "Judul wajib diisi." };
  if (judul.length > MAKS_JUDUL) return { galat: `Judul maksimal ${MAKS_JUDUL} huruf.` };

  const isi = String(data?.isi ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  if (!isi) return { galat: "Kalimat wajib diisi." };
  if (isi.length > MAKS_ISI) return { galat: `Kalimat maksimal ${MAKS_ISI} huruf.` };
  if (/[{}]/.test(isi.split(VARIABEL).join(""))) {
    return { galat: `Ada tanda kurung kurawal atau variabel yang tidak dikenal. Yang tersedia hanya ${VARIABEL}.` };
  }

  const mentah = Array.isArray(data?.layanan) ? data.layanan : [];
  const layanan: string[] = [];
  for (const l of mentah) {
    const nama = String(l ?? "").trim().toUpperCase();
    if (!nama || layanan.includes(nama)) continue;
    if (!layananValid.has(nama)) return { galat: `Layanan tidak dikenal: ${nama}.` };
    layanan.push(nama);
  }
  return { judul, isi, layanan };
}

async function namaLayananValid() {
  const master = await getMasterLayanan();
  const rapikan = (d: string[]) => (d || []).map((x) => String(x || "").trim().toUpperCase()).filter((x) => x);
  const kecamatan = rapikan(master.kecamatan);
  const kemenag = rapikan(master.kemenag);
  return { kecamatan, kemenag, semua: new Set([...kecamatan, ...kemenag]) };
}

export async function getTemplatAlasan(token: string) {
  const u = await wajibUtama(token);
  if (!u.ok) return { sukses: false, pesan: u.pesan };
  try {
    const [rows, layanan] = await Promise.all([
      sql<BarisTemplat[]>`
        select id, status_berlaku, judul, isi, layanan, urutan, aktif
        from templat_alasan
        order by status_berlaku, urutan, id
      `,
      namaLayananValid(),
    ]);
    return {
      sukses: true,
      templat: rows.map(petakan),
      layananKecamatan: layanan.kecamatan,
      layananKemenag: layanan.kemenag,
    };
  } catch (error) {
    return { sukses: false, pesan: "Gagal memuat templat: " + String(error) };
  }
}

export async function simpanTemplatAlasan(
  token: string,
  data: { id?: number; status?: string; judul?: string; isi?: string; layanan?: string[]; aktif?: boolean },
) {
  const u = await wajibUtama(token);
  if (!u.ok) return { sukses: false, pesan: u.pesan };
  try {
    const bersih = bersihkanTemplat(data || {}, (await namaLayananValid()).semua);
    if ("galat" in bersih) return { sukses: false, pesan: bersih.galat };
    const aktif = data?.aktif === false ? false : true;
    const id = Number(data?.id) || 0;

    if (id) {
      const rows = await sql<{ id: number | string }[]>`
        update templat_alasan
        set judul = ${bersih.judul}, isi = ${bersih.isi}, layanan = ${literalArrayTeks(bersih.layanan)}::text[], aktif = ${aktif},
            diubah_oleh = ${u.username}, diubah_pada = now()
        where id = ${id}
        returning id
      `;
      if (!rows.length) return { sukses: false, pesan: "Templat tidak ditemukan (mungkin sudah dihapus)." };
      return { sukses: true, id, pesan: "Templat disimpan." };
    }

    const status = String(data?.status ?? "");
    if (!STATUS_TEMPLAT.includes(status)) return { sukses: false, pesan: "Status templat tidak valid." };
    const rows = await sql<{ id: number | string }[]>`
      insert into templat_alasan (status_berlaku, judul, isi, layanan, urutan, aktif, dibuat_oleh, diubah_oleh)
      select ${status}::text, ${bersih.judul}::text, ${bersih.isi}::text, ${literalArrayTeks(bersih.layanan)}::text[],
             coalesce(max(urutan), 0) + 1, ${aktif}::boolean, ${u.username}::text, ${u.username}::text
      from templat_alasan where status_berlaku = ${status}
      returning id
    `;
    return { sukses: true, id: Number(rows[0]?.id) || 0, pesan: "Templat ditambahkan." };
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      return { sukses: false, pesan: "Judul itu sudah dipakai templat lain pada status yang sama. Gunakan judul berbeda." };
    }
    return { sukses: false, pesan: "Gagal menyimpan templat: " + String(error) };
  }
}

export async function ubahAktifTemplatAlasan(token: string, id: number, aktif: boolean) {
  const u = await wajibUtama(token);
  if (!u.ok) return { sukses: false, pesan: u.pesan };
  const idAngka = Number(id) || 0;
  if (!idAngka) return { sukses: false, pesan: "Templat tidak valid." };
  try {
    const rows = await sql<{ id: number | string }[]>`
      update templat_alasan set aktif = ${aktif === true}, diubah_oleh = ${u.username}, diubah_pada = now()
      where id = ${idAngka} returning id
    `;
    if (!rows.length) return { sukses: false, pesan: "Templat tidak ditemukan (mungkin sudah dihapus)." };
    return { sukses: true };
  } catch (error) {
    return { sukses: false, pesan: "Gagal mengubah templat: " + String(error) };
  }
}

export async function hapusTemplatAlasan(token: string, id: number) {
  const u = await wajibUtama(token);
  if (!u.ok) return { sukses: false, pesan: u.pesan };
  const idAngka = Number(id) || 0;
  if (!idAngka) return { sukses: false, pesan: "Templat tidak valid." };
  try {
    const rows = await sql<{ id: number | string }[]>`delete from templat_alasan where id = ${idAngka} returning id`;
    if (!rows.length) return { sukses: false, pesan: "Templat tidak ditemukan (mungkin sudah dihapus)." };
    return { sukses: true, pesan: "Templat dihapus." };
  } catch (error) {
    return { sukses: false, pesan: "Gagal menghapus templat: " + String(error) };
  }
}

/** Urutan baru untuk satu status: `ids` = SELURUH id templat status itu, dari atas ke bawah. */
export async function urutkanTemplatAlasan(token: string, status: string, ids: number[]) {
  const u = await wajibUtama(token);
  if (!u.ok) return { sukses: false, pesan: u.pesan };
  if (!STATUS_TEMPLAT.includes(status)) return { sukses: false, pesan: "Status templat tidak valid." };
  const daftar = (Array.isArray(ids) ? ids : []).map((x) => Number(x) || 0);
  if (!daftar.length || daftar.some((x) => !Number.isInteger(x) || x <= 0) || new Set(daftar).size !== daftar.length) {
    return { sukses: false, pesan: "Daftar urutan tidak valid." };
  }
  // Literal array Postgres ("{3,1,2}") dikirim sebagai satu parameter teks lalu di-cast; semua elemen sudah dipastikan bilangan bulat > 0.
  const literalId = "{" + daftar.join(",") + "}";
  try {
    const ada = await sql<{ n: number | string }[]>`
      select count(*)::int as n from templat_alasan where status_berlaku = ${status} and id = any(${literalId}::bigint[])
    `;
    if (Number(ada[0]?.n) !== daftar.length) {
      return { sukses: false, pesan: "Daftar berubah (ada templat yang dihapus/ditambah). Muat ulang lalu coba lagi." };
    }
    await sql`
      update templat_alasan t set urutan = x.n, diubah_oleh = ${u.username}, diubah_pada = now()
      from (select id, ord::int as n from unnest(${literalId}::bigint[]) with ordinality as z(id, ord)) x
      where t.id = x.id and t.status_berlaku = ${status}
    `;
    return { sukses: true };
  } catch (error) {
    return { sukses: false, pesan: "Gagal mengurutkan templat: " + String(error) };
  }
}
