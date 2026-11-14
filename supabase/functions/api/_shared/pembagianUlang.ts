// Pembagian tugas verifikasi ulang (modul MURNI, tanpa database). Rencana: plans/plan-verifikasi-ulang.md bagian 5.
//
// Aturan yang ditegakkan di sini (server memakai fungsi ini apa adanya; layar tidak bisa menimpa):
//   V1  pemeriksa tidak boleh orang yang pernah memverifikasi data itu
//   V10 data berstatus Berkas Tidak Lengkap / Tidak Memenuhi Syarat HANYA ke akun khusus (bila ada), tidak diacak
//   V11 akun pengecualian (pimpinan) tidak pernah menerima tugas; akun khusus tidak ikut bagian acak data MS (K16)
//   ±1  selisih jumlah tugas data MS antar pemeriksa paling banyak 1
// Deterministik: benih + kolam + daftar pemeriksa yang sama selalu menghasilkan pembagian yang sama (dapat diaudit ulang).

export interface ButirKolam {
  id: number;
  tahun: number;
  layanan: string;
  status: string;
  /** Semua username (huruf besar) yang pernah memberi hasil verifikasi pada data ini. Kosong bila data lama atas nama ADMIN. */
  pernahMemverifikasi: string[];
}

export interface MasukanPembagian {
  benih: string;
  kolam: ButirKolam[];
  /** Pemeriksa data MS. Urutan masukan diabaikan (diurutkan tetap di sini). */
  pemeriksa: string[];
  /** Akun yang tidak boleh menerima tugas apa pun (V11). */
  pengecualian: string[];
  /** Pemeriksa khusus data BTL/TMS (V10); null/kosong bila tidak ada. */
  akunKhusus?: string | null;
}

export interface TugasTerbagi {
  id: number;
  tahun: number;
  layanan: string;
  status: string;
  akun: string; // username huruf besar
}

export interface HasilPembagian {
  tugas: TugasTerbagi[];
  /** Data yang tidak dapat dibagi (mis. satu-satunya calon pemeriksa adalah pemverifikasi pertamanya) beserta alasannya. */
  tidakTerbagi: { id: number; tahun: number; layanan: string; status: string; alasan: string }[];
  perAkun: Record<string, number>;
  perLayananPerAkun: Record<string, Record<string, number>>;
  /** selisih terbesar - terkecil jumlah data MS antar pemeriksa MS */
  selisihMS: number;
}

export const STATUS_MS = "Memenuhi Syarat";
export const STATUS_KHUSUS = ["Berkas Tidak Lengkap", "Tidak Memenuhi Syarat"];

const kunci = (u: string) => String(u || "").trim().toUpperCase();

// PRNG deterministik: xmur3 (benih -> bilangan) + mulberry32.
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
export function buatAcak(benih: string): () => number {
  let a = xmur3(String(benih))();
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function kocok<T>(larik: T[], acak: () => number): T[] {
  const h = larik.slice();
  for (let i = h.length - 1; i > 0; i--) {
    const j = Math.floor(acak() * (i + 1));
    [h[i], h[j]] = [h[j], h[i]];
  }
  return h;
}

const urutKolam = (a: ButirKolam, b: ButirKolam) => (a.tahun - b.tahun) || (a.id - b.id);

export function bagiTugasUlang(masukan: MasukanPembagian): HasilPembagian {
  const acak = buatAcak(masukan.benih);
  const dikecualikan = new Set((masukan.pengecualian || []).map(kunci));
  const khusus = masukan.akunKhusus ? kunci(masukan.akunKhusus) : "";
  if (khusus && dikecualikan.has(khusus)) throw new Error("Akun khusus tidak boleh sekaligus akun pengecualian.");

  // Pemeriksa MS: unik, tanpa pengecualian, tanpa akun khusus (K16), diurutkan tetap.
  const pemeriksa = Array.from(new Set((masukan.pemeriksa || []).map(kunci).filter((u) => u && !dikecualikan.has(u) && u !== khusus))).sort();

  const kolam = (masukan.kolam || []).slice().sort(urutKolam);
  const tugas: TugasTerbagi[] = [];
  const tidakTerbagi: HasilPembagian["tidakTerbagi"] = [];
  const perAkun: Record<string, number> = {};
  const perLayananPerAkun: Record<string, Record<string, number>> = {};
  const catat = (b: ButirKolam, akun: string) => {
    tugas.push({ id: b.id, tahun: b.tahun, layanan: b.layanan, status: b.status, akun });
    perAkun[akun] = (perAkun[akun] || 0) + 1;
    (perLayananPerAkun[b.layanan] ||= {})[akun] = (perLayananPerAkun[b.layanan][akun] || 0) + 1;
  };
  const tolak = (b: ButirKolam, alasan: string) => tidakTerbagi.push({ id: b.id, tahun: b.tahun, layanan: b.layanan, status: b.status, alasan });
  const pernah = (b: ButirKolam, akun: string) => (b.pernahMemverifikasi || []).some((u) => kunci(u) === akun);

  const adaStatusKhusus = (b: ButirKolam) => STATUS_KHUSUS.includes(b.status);

  // V10: BTL/TMS -> akun khusus saja.
  for (const b of kolam.filter(adaStatusKhusus)) {
    if (!khusus) tolak(b, "Tidak ada akun khusus untuk data " + b.status + ".");
    else if (pernah(b, khusus)) tolak(b, "Akun khusus adalah pemverifikasi pertama data ini.");
    else catat(b, khusus);
  }

  // Data MS (status lain yang diizinkan kriteria dianggap MS): dibagi acak per layanan, penghitung global.
  const dataMS = kolam.filter((b) => !adaStatusKhusus(b));
  if (dataMS.length > 0 && pemeriksa.length === 0) {
    for (const b of dataMS) tolak(b, "Tidak ada pemeriksa.");
  } else if (dataMS.length > 0) {
    const layananUrut = Array.from(new Set(dataMS.map((b) => b.layanan))).sort();
    const hitung: Record<string, number> = {};
    pemeriksa.forEach((p) => (hitung[p] = 0));
    const hitungLayanan: Record<string, Record<string, number>> = {};
    const penugasan = new Map<ButirKolam, string>();
    let putaran = 0;
    for (const lay of layananUrut) {
      hitungLayanan[lay] = {};
      pemeriksa.forEach((p) => (hitungLayanan[lay][p] = 0));
      const daftar = kocok(dataMS.filter((b) => b.layanan === lay), acak);
      for (const b of daftar) {
        let terbaik = "";
        let kunciTerbaik: number[] | null = null;
        for (let i = 0; i < pemeriksa.length; i++) {
          const p = pemeriksa[(putaran + i) % pemeriksa.length];
          if (pernah(b, p)) continue; // V1
          const k = [hitung[p], hitungLayanan[lay][p], i];
          if (!kunciTerbaik || k[0] < kunciTerbaik[0] || (k[0] === kunciTerbaik[0] && (k[1] < kunciTerbaik[1] || (k[1] === kunciTerbaik[1] && k[2] < kunciTerbaik[2])))) {
            terbaik = p;
            kunciTerbaik = k;
          }
        }
        putaran = (putaran + 1) % pemeriksa.length;
        if (!terbaik) {
          tolak(b, "Semua calon pemeriksa adalah pemverifikasi pertama data ini.");
          continue;
        }
        penugasan.set(b, terbaik);
        hitung[terbaik]++;
        hitungLayanan[lay][terbaik]++;
      }
    }

    // Perbaikan ±1: pindahkan data dari pemeriksa terbanyak ke tersedikit selama selisih >= 2 dan ada data yang boleh dipindah (V1).
    // Satu pemindahan bisa membutuhkan RANTAI (A -> B -> C): A memberi data ke B (yang boleh), B memberi data lain ke C. Jumlah A turun 1,
    // C naik 1, B tetap. Dicari dengan penelusuran jalur terpendek (BFS) sehingga ±1 tercapai bila memang mungkin (V1 tetap dijaga).
    const milik: Record<string, ButirKolam[]> = {};
    pemeriksa.forEach((p) => (milik[p] = []));
    for (const [b, a] of penugasan) milik[a].push(b);
    const pindahJalur = (): boolean => {
      const sumber = pemeriksa.slice().sort((x, y) => (hitung[y] - hitung[x]) || (x < y ? -1 : 1));
      for (const awal of sumber) {
        const induk = new Map<string, { dari: string; butir: ButirKolam } | null>([[awal, null]]);
        const antre = [awal];
        let tujuan = "";
        for (let i = 0; i < antre.length && !tujuan; i++) {
          const a = antre[i];
          for (const b of pemeriksa) {
            if (induk.has(b)) continue;
            const butir = milik[a].find((x) => !pernah(x, b));
            if (!butir) continue;
            induk.set(b, { dari: a, butir });
            antre.push(b);
            if (hitung[awal] - hitung[b] >= 2) { tujuan = b; break; }
          }
        }
        if (!tujuan) continue;
        for (let cur = tujuan; induk.get(cur);) {
          const langkah = induk.get(cur)!;
          milik[langkah.dari].splice(milik[langkah.dari].indexOf(langkah.butir), 1);
          milik[cur].push(langkah.butir);
          penugasan.set(langkah.butir, cur);
          hitungLayanan[langkah.butir.layanan][langkah.dari]--;
          hitungLayanan[langkah.butir.layanan][cur]++;
          cur = langkah.dari;
        }
        hitung[awal]--;
        hitung[tujuan]++;
        return true;
      }
      return false;
    };
    for (let aman = 0; aman < 1_000_000; aman++) {
      const nilai = pemeriksa.map((p) => hitung[p]);
      if (Math.max(...nilai) - Math.min(...nilai) < 2) break;
      if (!pindahJalur()) break;
    }
    for (const b of dataMS) {
      const akun = penugasan.get(b);
      if (akun) catat(b, akun);
    }
  }

  const jumlahMS = pemeriksa.map((p) => tugas.filter((t) => t.akun === p).length);
  return {
    tugas: tugas.sort((a, b) => (a.tahun - b.tahun) || (a.id - b.id)),
    tidakTerbagi,
    perAkun,
    perLayananPerAkun,
    selisihMS: jumlahMS.length ? Math.max(...jumlahMS) - Math.min(...jumlahMS) : 0,
  };
}

/** Cek ulang pembagian: hitung ulang dari benih + kolam yang sama dan bandingkan dengan tugas tersimpan. */
export function samaDenganTersimpan(masukan: MasukanPembagian, tersimpan: { id: number; tahun: number; akun: string }[]): { sama: boolean; selisih: number } {
  const hitung = bagiTugasUlang(masukan).tugas;
  const peta = new Map(tersimpan.map((t) => [t.tahun + ":" + t.id, kunci(t.akun)]));
  let selisih = Math.abs(hitung.length - tersimpan.length);
  for (const t of hitung) if (peta.get(t.tahun + ":" + t.id) !== t.akun) selisih++;
  return { sama: selisih === 0, selisih };
}

/** Kebijakan kolam: apakah data boleh ikut paket baru. Data yang pernah diperiksa ulang tidak ikut kecuali Admin memilih. */
export function layakMasukKolam(
  butir: { status: string; sudahDiperiksaUlang: boolean; sedangDitugaskan: boolean },
  opsi: { sertakanSudahDiperiksa: boolean; statusDiizinkan: string[] },
): boolean {
  if (butir.sedangDitugaskan) return false; // sedang di paket aktif lain
  if (butir.sudahDiperiksaUlang && !opsi.sertakanSudahDiperiksa) return false;
  return opsi.statusDiizinkan.includes(butir.status);
}

/**
 * Memilih sebagian kolam untuk satu paket tugas (paket dipecah per tahap, mis. 500-1.000 data). Deterministik menurut benih.
 * Data BTL/TMS SELALU ikut seluruhnya (tugas khusus satu akun); batas `jumlahMS` hanya untuk data selain itu. jumlahMS kosong/<=0 = semua.
 */
export function ambilSampel(kolam: ButirKolam[], jumlahMS: number | null | undefined, benih: string): ButirKolam[] {
  const urut = kolam.slice().sort(urutKolam);
  const khusus = urut.filter((b) => STATUS_KHUSUS.includes(b.status));
  const lain = urut.filter((b) => !STATUS_KHUSUS.includes(b.status));
  const n = Math.floor(Number(jumlahMS) || 0);
  const terpilih = n > 0 && n < lain.length ? kocok(lain, buatAcak(String(benih) + "|sampel")).slice(0, n) : lain;
  return khusus.concat(terpilih).sort(urutKolam);
}
