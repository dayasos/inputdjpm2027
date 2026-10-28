// Uji inti "Cek Status Penerima" (plan: plans/plan-cek-status-penerima-publik.md, bagian 12.1).
// Jalankan: npm run uji:cek-status     (Node 24+, tanpa dependensi; semua data KARANGAN, tidak menyentuh database).
import test from "node:test";
import assert from "node:assert/strict";
import {
  BATAS_GAGAL,
  kunciPercobaan,
  pilihKolomPublik,
  prosesCekStatus,
  tanggalKalenderValid,
  validasiMasukan,
} from "../../supabase/functions/api/_shared/cekStatusInti.ts";

const PEPPER = "garam-uji-yang-cukup-panjang";
const HARI_INI = "2026-10-26";

const NIK_ADA = "1271010101900001";
const TGL_BENAR = "1990-01-01";
const NIK_TAK_ADA = "1271019999999999";

// Penerima karangan; sengaja memuat kolom SENSITIF yang tidak boleh keluar.
const BARIS = {
  nama: "BUDI SANTOSO", layanan: "IMAM MASJID", kecamatan: "MEDAN HELVETIA", kelurahan: "HELVETIA",
  status_verifikasi: "Memenuhi Syarat",
  nik: NIK_ADA, alamat: "JL. RAHASIA NO. 1", nomor_rekening: "9999999999", no_kontak: "081200000000",
  tanggal_lahir: TGL_BENAR, link_ktp: "https://contoh/ktp", keterangan_verifikasi: "catatan internal",
};

/** Dependensi karangan di memori. Mencatat semua pemanggilan agar bisa diperiksa. */
function buatDeps(opsi = {}) {
  const panggilan = [];
  const percobaan = new Map(); // kunci -> {gagal}
  const deps = {
    pepper: opsi.pepper ?? PEPPER,
    tahun: 2027,
    hariIni: () => HARI_INI,
    async fiturAktif() { panggilan.push("fiturAktif"); if (opsi.saklarError) throw new Error("db mati"); return opsi.aktif ?? true; },
    // Atomik seperti SQL aslinya: naikkan lalu baca dalam satu langkah (tanpa await di antaranya).
    async ambilJatah(k) {
      panggilan.push("ambilJatah");
      const c = percobaan.get(k) ?? { gagal: 0 };
      c.gagal += 1;
      percobaan.set(k, c);
      return c.gagal <= BATAS_GAGAL;
    },
    async resetPercobaan(k) { panggilan.push("resetPercobaan"); percobaan.delete(k); },
    async cariPenerima(nik, tgl, tahun) {
      panggilan.push("cariPenerima");
      deps.terakhirDicari = { nik, tgl, tahun };
      if (opsi.lambatCari) await new Promise((r) => setTimeout(r, opsi.lambatCari));
      return nik === BARIS.nik && tgl === BARIS.tanggal_lahir ? BARIS : null;
    },
  };
  return { deps, panggilan, percobaan };
}

test("NIK ada + tanggal benar -> hanya 5 kolom publik, kolom sensitif tidak ikut", async () => {
  const { deps } = buatDeps();
  const h = await prosesCekStatus(deps, NIK_ADA, TGL_BENAR);
  assert.equal(h.sukses, true);
  assert.deepEqual(Object.keys(h.data).sort(), ["kecamatan", "kelurahan", "layanan", "nama", "status"]);
  assert.deepEqual(h.data, {
    nama: "BUDI SANTOSO", layanan: "IMAM MASJID", kecamatan: "MEDAN HELVETIA", kelurahan: "HELVETIA", status: "Memenuhi Syarat",
  });
  const json = JSON.stringify(h);
  for (const rahasia of ["RAHASIA", "9999999999", "081200000000", NIK_ADA, "ktp", "catatan internal"]) {
    assert.ok(!json.includes(rahasia), `respons tidak boleh memuat: ${rahasia}`);
  }
});

test("pilihKolomPublik: nilai kosong/null menjadi string kosong; status apa adanya", () => {
  assert.deepEqual(
    pilihKolomPublik({ nama: null, layanan: undefined, kecamatan: "X", kelurahan: "", status_verifikasi: "Berkas Tidak Lengkap" }),
    { nama: "", layanan: "", kecamatan: "X", kelurahan: "", status: "Berkas Tidak Lengkap" },
  );
});

test("NIK tidak ada vs tanggal lahir salah -> hasil IDENTIK dan jalur panggilan identik", async () => {
  const a = buatDeps();
  const b = buatDeps();
  const hasilTakAda = await prosesCekStatus(a.deps, NIK_TAK_ADA, TGL_BENAR);
  const hasilTglSalah = await prosesCekStatus(b.deps, NIK_ADA, "1990-01-02");
  assert.deepEqual(hasilTakAda, { sukses: false, kode: "TIDAK_TERDATA" });
  assert.deepEqual(hasilTglSalah, hasilTakAda);
  assert.equal(JSON.stringify(hasilTglSalah), JSON.stringify(hasilTakAda));
  assert.deepEqual(a.panggilan, b.panggilan, "urutan operasi harus sama agar tidak ada oracle");
});

test("5 gagal berturut-turut -> terkunci; berlaku juga untuk NIK yang tidak ada", async () => {
  for (const nik of [NIK_ADA, NIK_TAK_ADA]) {
    const { deps } = buatDeps();
    for (let i = 1; i <= BATAS_GAGAL; i++) {
      assert.deepEqual(await prosesCekStatus(deps, nik, "1980-05-05"), { sukses: false, kode: "TIDAK_TERDATA" }, `percobaan ${i}`);
    }
    assert.deepEqual(await prosesCekStatus(deps, nik, "1980-05-05"), { sukses: false, kode: "TERKUNCI" });
  }
});

test("saat terkunci, tanggal lahir yang BENAR pun ditolak dan database penerima tidak disentuh", async () => {
  const { deps, panggilan } = buatDeps();
  for (let i = 0; i < BATAS_GAGAL; i++) await prosesCekStatus(deps, NIK_ADA, "1980-05-05");
  panggilan.length = 0;
  assert.deepEqual(await prosesCekStatus(deps, NIK_ADA, TGL_BENAR), { sukses: false, kode: "TERKUNCI" });
  assert.ok(!panggilan.includes("cariPenerima"), "tidak boleh mencari penerima saat terkunci");
});

test("4 gagal lalu berhasil -> hitungan di-reset (tidak terkunci)", async () => {
  const { deps, percobaan } = buatDeps();
  for (let i = 0; i < BATAS_GAGAL - 1; i++) await prosesCekStatus(deps, NIK_ADA, "1980-05-05");
  assert.equal((await prosesCekStatus(deps, NIK_ADA, TGL_BENAR)).sukses, true);
  assert.equal(percobaan.size, 0);
  for (let i = 0; i < BATAS_GAGAL - 1; i++) await prosesCekStatus(deps, NIK_ADA, "1980-05-05");
  assert.equal((await prosesCekStatus(deps, NIK_ADA, TGL_BENAR)).sukses, true);
});

test("SERANGAN PARALEL: 40 permintaan serentak untuk satu NIK -> hanya 5 yang sampai ke pencarian", async () => {
  const { deps, panggilan } = buatDeps({ lambatCari: 20 }); // pencarian lambat: semua permintaan "berpapasan"
  const hasil = await Promise.all(
    Array.from({ length: 40 }, (_, i) => prosesCekStatus(deps, NIK_ADA, `1980-05-${String(1 + (i % 28)).padStart(2, "0")}`)),
  );
  assert.equal(panggilan.filter((x) => x === "cariPenerima").length, BATAS_GAGAL, "pencarian tidak boleh melebihi batas");
  assert.equal(hasil.filter((h) => h.kode === "TERKUNCI").length, 40 - BATAS_GAGAL);
  assert.equal(hasil.filter((h) => h.kode === "TIDAK_TERDATA").length, BATAS_GAGAL);
});

test("jatah diambil SEBELUM pencarian (urutan operasi)", async () => {
  const { deps, panggilan } = buatDeps();
  await prosesCekStatus(deps, NIK_ADA, "1980-05-05");
  assert.deepEqual(panggilan, ["fiturAktif", "ambilJatah", "cariPenerima"]);
});

test("format salah tidak memakai jatah percobaan", async () => {
  const { deps, panggilan, percobaan } = buatDeps();
  for (let i = 0; i < 20; i++) await prosesCekStatus(deps, "123", TGL_BENAR);
  assert.equal(percobaan.size, 0);
  assert.ok(!panggilan.includes("ambilJatah"));
});

test("penguncian satu NIK tidak memengaruhi NIK lain", async () => {
  const { deps } = buatDeps();
  for (let i = 0; i < BATAS_GAGAL; i++) await prosesCekStatus(deps, NIK_TAK_ADA, "1980-05-05");
  assert.equal((await prosesCekStatus(deps, NIK_TAK_ADA, "1980-05-05")).kode, "TERKUNCI");
  assert.equal((await prosesCekStatus(deps, NIK_ADA, TGL_BENAR)).sukses, true);
});

test("kunci percobaan = hash: tidak memuat NIK mentah, stabil, dan berbeda menurut garam/NIK", async () => {
  const k1 = await kunciPercobaan(PEPPER, NIK_ADA);
  assert.match(k1, /^nik:[0-9a-f]{64}$/);
  assert.ok(!k1.includes(NIK_ADA));
  assert.equal(k1, await kunciPercobaan(PEPPER, NIK_ADA));
  assert.notEqual(k1, await kunciPercobaan(PEPPER + "x", NIK_ADA));
  assert.notEqual(k1, await kunciPercobaan(PEPPER, NIK_TAK_ADA));
  // Kunci yang dikirim ke penyimpanan juga tidak boleh memuat NIK mentah.
  const dilihat = [];
  const { deps } = buatDeps();
  const asli = deps.ambilJatah;
  deps.ambilJatah = async (k) => { dilihat.push(k); return asli(k); };
  await prosesCekStatus(deps, NIK_TAK_ADA, TGL_BENAR);
  assert.equal(dilihat.length, 1);
  assert.ok(!dilihat[0].includes(NIK_TAK_ADA));
});

test("saklar mati -> NONAKTIF dan tidak menyentuh penerima/percobaan", async () => {
  const { deps, panggilan } = buatDeps({ aktif: false });
  assert.deepEqual(await prosesCekStatus(deps, NIK_ADA, TGL_BENAR), { sukses: false, kode: "NONAKTIF" });
  assert.deepEqual(panggilan, ["fiturAktif"]);
});

test("saklar tak terbaca (galat database) -> proses gagal tertutup, tidak memberi data", async () => {
  const { deps } = buatDeps({ saklarError: true });
  await assert.rejects(() => prosesCekStatus(deps, NIK_ADA, TGL_BENAR), /db mati/);
});

test("garam kosong/pendek -> gagal tertutup (melempar galat)", async () => {
  for (const pepper of ["", "pendek"]) {
    const { deps } = buatDeps({ pepper });
    await assert.rejects(() => prosesCekStatus(deps, NIK_ADA, TGL_BENAR), /CEK_STATUS_PEPPER/);
  }
});

const FORMAT_SALAH = [
  ["NIK 15 digit", "127101010190000", TGL_BENAR],
  ["NIK 17 digit", "12710101019000012", TGL_BENAR],
  ["NIK berhuruf", "12710101019000AB", TGL_BENAR],
  ["NIK ber-spasi di tengah", "1271 010101900001", TGL_BENAR],
  ["NIK angka JSON (bukan string)", 1271010101900001, TGL_BENAR],
  ["NIK null", null, TGL_BENAR],
  ["NIK objek", { a: 1 }, TGL_BENAR],
  ["NIK suntikan SQL", "1' or '1'='1", TGL_BENAR],
  ["tanggal 31 Februari", NIK_ADA, "1990-02-31"],
  ["tanggal bulan 13", NIK_ADA, "1990-13-01"],
  ["tanggal sebelum 1900", NIK_ADA, "1899-12-31"],
  ["tanggal masa depan", NIK_ADA, "2026-10-27"],
  ["format dd-mm-yyyy", NIK_ADA, "01-01-1990"],
  ["tanggal kosong", NIK_ADA, ""],
  ["tanggal null", NIK_ADA, null],
  ["tanggal suntikan SQL", NIK_ADA, "1990-01-01'; drop table x;--"],
];
for (const [nama, nik, tgl] of FORMAT_SALAH) {
  test(`format salah ditolak sebelum database: ${nama}`, async () => {
    const { deps, panggilan } = buatDeps();
    assert.deepEqual(await prosesCekStatus(deps, nik, tgl), { sukses: false, kode: "FORMAT" });
    assert.ok(!panggilan.includes("cariPenerima") && !panggilan.includes("catatGagal"), "format salah tidak boleh menyentuh data/percobaan");
  });
}

test("batas tanggal valid: hari ini dan 1900-01-01 diterima; 29 Feb tahun kabisat diterima, bukan kabisat ditolak", () => {
  assert.ok(validasiMasukan(NIK_ADA, HARI_INI, HARI_INI));
  assert.ok(validasiMasukan(NIK_ADA, "1900-01-01", HARI_INI));
  assert.ok(validasiMasukan(NIK_ADA, "2000-02-29", HARI_INI));
  assert.equal(validasiMasukan(NIK_ADA, "1900-02-29", HARI_INI), null); // 1900 bukan tahun kabisat
  assert.equal(tanggalKalenderValid("2025-02-29"), false);
});

test("spasi di ujung NIK/tanggal dibersihkan, lalu dicari dengan nilai bersih", async () => {
  const { deps } = buatDeps();
  const h = await prosesCekStatus(deps, ` ${NIK_ADA} `, ` ${TGL_BENAR} `);
  assert.equal(h.sukses, true);
  assert.deepEqual(deps.terakhirDicari, { nik: NIK_ADA, tgl: TGL_BENAR, tahun: 2027 });
});

test("pencarian memakai tahun anggaran yang disuntikkan (bukan tahun lain)", async () => {
  const { deps } = buatDeps();
  await prosesCekStatus(deps, NIK_ADA, TGL_BENAR);
  assert.equal(deps.terakhirDicari.tahun, 2027);
});

test("konstanta pembatas dikunci sesuai rencana (5 percobaan per jendela 15 menit)", async () => {
  const m = await import("../../supabase/functions/api/_shared/cekStatusInti.ts");
  assert.equal(m.BATAS_GAGAL, 5);
  assert.equal(m.JENDELA_DETIK, 900);
  assert.equal(m.TAHUN_LAHIR_MIN, 1900);
});
