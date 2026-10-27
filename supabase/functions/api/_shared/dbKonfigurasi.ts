// Pemilihan connection string database untuk Edge Function `api` (dipakai _shared/db.ts). Modul MURNI (tanpa Deno/jaringan) supaya bisa diuji.
//
// LATAR BELAKANG (diagnosis 2026-10-27, lihat memori/rencana): hampir tiap permintaan berjalan di isolate baru yang membuka koneksi LANGSUNG ke
// Postgres, sedangkan database hanya mengizinkan 60 koneksi -> saat laju isolate baru > ±2,5/detik muncul PostgresError 53300 dan ±9% permintaan 5xx.
// Pooler transaksi Supabase (port 6543) memultipleks banyak koneksi klien ke sedikit koneksi server, sehingga batas 60 tidak lagi jadi leher botol.
//
// !! PERINGATAN (27 Okt 2026): JANGAN mengaktifkan DB_POOLER_URL/DB_POOLER_PERSEN di produksi. Pooler transaksi membuat koneksi postgres.js
// yang dipakai ulang (jeda < idle_timeout) MENGGANTUNG saat ada kueri paralel -> Dashboard Progres Verifikasi macet. Terbukti lokal
// (putaran kedua Promise.all selalu timeout; koneksi langsung lancar); rilis pooler 100% sempat live lalu dimundurkan ke 0%.
// Kode ini dibiarkan (tanpa secret perilakunya = koneksi langsung). Sebelum dipakai lagi: uji pakai-ulang + paralel harus lulus.
//
// NAMA VARIABEL: `DB_POOLER_URL` (BUKAN SUPABASE_*): awalan SUPABASE_ dicadangkan platform -- CLI menolak mengaturnya dan nilainya ditimpa tiap deploy
// (terbukti: semua secret SUPABASE_* berubah tanggalnya tepat saat deploy). `SUPABASE_DB_URL` adalah nilai bawaan platform (koneksi langsung).
//
// ATURAN (aman bila salah konfigurasi):
//  * DB_POOLER_URL (bila ada, sah, DAN terpilih oleh DB_POOLER_PERSEN) dipakai; selain itu SUPABASE_DB_URL (langsung, perilaku lama).
//  * "Sah" = skema postgres(ql)://, bisa di-parse, ada pengguna+sandi, tanpa placeholder dashboard (mis. "[YOUR-PASSWORD]"), dan -- untuk host
//    pooler.supabase.com -- pengguna berbentuk "postgres.<kode-proyek>" (tanpa itu pooler pasti menolak login).
//  * DB_POOLER_PERSEN (opsional, bilangan bulat 0-100) = RILIS BERTAHAP: tiap isolate (hampir tiap permintaan) memakai pooler dengan peluang sebesar
//    persen itu. Kosong = 100. Nilai tak valid = 0 (fail-safe ke koneksi langsung) + peringatan.
//  * Nilai pooler/persen yang TIDAK sah TIDAK menjatuhkan aplikasi: dipakai koneksi langsung + peringatan (tanpa sandi/host).
//  * Mundur/rollback = hapus secret DB_POOLER_URL (atau set DB_POOLER_PERSEN=0).

export type KonfigurasiKoneksi = {
  url: string;
  mode: "pooler" | "langsung";
  /** Pesan untuk log (TIDAK memuat sandi/URL). Ada bila nilai pooler/persen diabaikan karena tidak sah. */
  peringatan?: string;
};

/** Bagian "pengguna:sandi" dari URL (antara "://" dan "@" terakhir), atau "" bila tidak ada. */
function bagianInfoPengguna(mentah: string): string {
  const awal = mentah.indexOf("://");
  const at = mentah.lastIndexOf("@");
  if (awal < 0 || at < awal + 3) return "";
  return mentah.slice(awal + 3, at);
}

/** Mengembalikan alasan penolakan (tanpa data rahasia) atau null bila URL pooler sah. */
function alasanPoolerTidakSah(mentah: string): string | null {
  if (!/^postgres(ql)?:\/\//i.test(mentah)) return "skema harus postgres:// atau postgresql://";
  // Placeholder bawaan dashboard Supabase: [YOUR-PASSWORD]; variasi umum: <password>, {password}.
  if (/\[[^\]]*\]|<[^>]*>|\{[^}]*\}/.test(bagianInfoPengguna(mentah))) {
    return "masih memuat placeholder sandi bawaan dashboard (ganti dengan sandi database)";
  }
  let u: URL;
  try {
    u = new URL(mentah);
  } catch {
    return "format URL tidak bisa dibaca";
  }
  if (!u.hostname) return "nama host kosong";
  if (!u.username) return "nama pengguna kosong";
  if (!u.password) return "sandi kosong";
  if (/pooler\.supabase\.com$/i.test(u.hostname) && !u.username.includes(".")) {
    return "untuk pooler.supabase.com nama pengguna harus berbentuk postgres.<kode-proyek>";
  }
  return null;
}

// Parameter query khusus Prisma/ORM lain yang BUKAN pengaturan Postgres. postgres.js meneruskan parameter query tak dikenal ke server sebagai
// pengaturan sesi -> server menolak ("unrecognized configuration parameter"). Dashboard/skrip lain sering menyertakan "?pgbouncer=true".
const PARAMETER_BUKAN_POSTGRES = new Set(["pgbouncer", "connection_limit", "pool_timeout", "statement_cache_size", "schema"]);

/** Membuang parameter query khusus ORM TANPA menyentuh bagian lain (sandi tidak di-encode ulang). */
export function bersihkanParameterQuery(url: string): string {
  const tanda = url.indexOf("?");
  if (tanda < 0) return url;
  const dasar = url.slice(0, tanda);
  const sisa = url.slice(tanda + 1).split("&").filter((p) => p !== "" && !PARAMETER_BUKAN_POSTGRES.has(p.split("=")[0].toLowerCase()));
  return sisa.length > 0 ? dasar + "?" + sisa.join("&") : dasar;
}

/** Persen rilis bertahap: kosong -> 100; bilangan bulat 0-100 -> itu; selain itu -> null (tidak valid). */
export function uraiPersen(mentah: string | undefined): number | null {
  const t = (mentah ?? "").trim();
  if (t === "") return 100;
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n >= 0 && n <= 100 ? n : null;
}

/**
 * @param acak bilangan acak [0,1) (disuntik agar bisa diuji; db.ts memberi Math.random()). Dipakai hanya bila persen < 100.
 */
export function tentukanKoneksi(
  urlLangsung: string | undefined,
  urlPooler: string | undefined,
  persenMentah?: string,
  acak: number = Math.random(),
): KonfigurasiKoneksi | null {
  const langsung = (urlLangsung ?? "").trim();
  const pooler = (urlPooler ?? "").trim();

  const peringatan: string[] = [];
  let pakaiPooler = false;
  if (pooler) {
    const alasan = alasanPoolerTidakSah(pooler);
    if (alasan) {
      peringatan.push("DB_POOLER_URL diabaikan: " + alasan + ".");
    } else {
      const persen = uraiPersen(persenMentah);
      if (persen === null) {
        peringatan.push("DB_POOLER_PERSEN tidak valid (harus bilangan bulat 0-100): pooler tidak dipakai.");
      } else {
        pakaiPooler = persen >= 100 || acak * 100 < persen;
      }
    }
  }
  if (pakaiPooler) return { url: bersihkanParameterQuery(pooler), mode: "pooler" };
  if (langsung) {
    return { url: langsung, mode: "langsung", ...(peringatan.length ? { peringatan: peringatan.join(" ") + " Memakai koneksi langsung." } : {}) };
  }
  return null;
}
