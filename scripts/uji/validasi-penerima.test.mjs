// Uji aturan validasi data penerima (plan: plans/plan-perbaikan-validasi-data-penerima.md, bagian 8).
// Jalankan: npm run uji:validasi-penerima     (Node 24+, tanpa dependensi; data KARANGAN, tidak menyentuh database).
import test from "node:test";
import assert from "node:assert/strict";
import {
  hitungUmurPatokan,
  periksaTanggalLahir,
  putuskanKelurahanTugas,
  tanggalHariIniWIB,
  UMUR_MAKS,
  UMUR_MIN,
} from "../../supabase/functions/api/_shared/validasiPenerima.ts";

const K = { tahunAktif: 2027, hariIni: "2026-10-26" };
const cek = (t, k = K) => periksaTanggalLahir(t, k);

// Salinan PERSIS hitungUmur() lama (domains/penerima.ts) untuk membuktikan angka umur tidak bergeser.
function hitungUmurLama(tglStr, TAHUN_AKTIF) {
  const parts = tglStr.split(/[-/]/);
  let d, m, y;
  if (parts[0].length === 4) { y = Number(parts[0]); m = Number(parts[1]); d = Number(parts[2]); }
  else { d = Number(parts[0]); m = Number(parts[1]); y = Number(parts[2]); }
  const lahir = new Date(y, m - 1, d);
  const patokan = new Date(TAHUN_AKTIF, 0, 1);
  let umur = patokan.getFullYear() - lahir.getFullYear();
  const selisihBulan = patokan.getMonth() - lahir.getMonth();
  if (selisihBulan < 0 || (selisihBulan === 0 && patokan.getDate() < lahir.getDate())) umur--;
  return umur;
}

test("konstanta dikunci: umur 18 sampai 100", () => {
  assert.equal(UMUR_MIN, 18);
  assert.equal(UMUR_MAKS, 100);
});

test("kasus nyata No. 1575: tahun 0199 ditolak (ISO maupun dd-MM-yyyy)", () => {
  for (const t of ["0199-02-04", "04-02-0199", "04/02/0199"]) {
    const h = cek(t);
    assert.equal(h.ok, false, t);
    assert.match(h.pesan, /tidak wajar/);
    assert.match(h.pesan, /4 digit/);
  }
});

test("tahun 0001-0099 (4 digit berawalan nol) dinilai 'tidak wajar', BUKAN 'tidak valid' (Date.UTC memetakan 0-99 ke 1900-1999)", () => {
  for (const t of ["0089-02-04", "0000-01-01", "0001-01-01", "0099-12-31", "04-02-0089", "01/01/0000"]) {
    const h = cek(t);
    assert.equal(h.ok, false, t);
    assert.match(h.pesan, /tidak wajar/, t);
  }
  assert.match(cek("0089-02-30").pesan, /tidak valid/); // tetap bukan tanggal kalender
});

test("tahun kurang/lebih dari 4 digit (mis. 199 atau 19900) ditolak dengan pesan tahun 4 digit", () => {
  for (const t of ["04-02-199", "199-02-04", "04-02-19900", "04/02/89"]) {
    const h = cek(t);
    assert.equal(h.ok, false, t);
    assert.match(h.pesan, /4 digit/, t);
  }
});

test("tanggal valid diterima dan dinormalkan ke ISO; hasil sama untuk tiga bentuk penulisan", () => {
  for (const t of ["1989-02-04", "04-02-1989", "4-2-1989", "04/02/1989", " 1989-02-04 "]) {
    const h = cek(t);
    assert.equal(h.ok, true, t);
    assert.equal(h.iso, "1989-02-04");
    assert.equal(h.umur, 37);
  }
});

test("bukan tanggal kalender -> 'tidak valid'", () => {
  for (const t of ["1990-02-31", "31-02-1990", "1990-13-01", "1990-00-10", "1990-01-00", "abc", "1990", "1990-1", "1990-01-01-01"]) {
    const h = cek(t);
    assert.equal(h.ok, false, t);
    assert.equal(h.pesan, "GAGAL: Tanggal lahir tidak valid.", t);
  }
});

test("kosong/null/undefined -> wajib diisi", () => {
  for (const t of ["", "   ", null, undefined]) {
    const h = cek(t);
    assert.equal(h.ok, false);
    assert.equal(h.pesan, "GAGAL: Tanggal lahir wajib diisi.");
  }
});

test("batas tahun 1900 dan masa depan", () => {
  assert.equal(cek("1899-12-31").ok, false);
  assert.equal(cek("1900-01-01").ok, false);         // umur 127 -> tetap ditolak (di luar 18-100)
  assert.equal(cek("2026-10-27").ok, false);          // besok
  assert.equal(cek("2999-01-01").ok, false);
  assert.match(cek("2026-10-27").pesan, /tidak wajar/);
});

test("batas umur pada patokan 1 Januari 2027: 18 tahun diterima, 17 ditolak; 100 diterima, 101 ditolak", () => {
  assert.equal(cek("2009-01-01").ok, true);           // tepat 18
  assert.equal(cek("2009-01-02").ok, false);          // masih 17
  assert.equal(cek("2009-01-02").pesan, "GAGAL: Usia di bawah 18 tahun tidak memenuhi syarat.");
  assert.equal(cek("1927-01-01").ok, true);           // tepat 100 (2027 - 1927)
  assert.equal(cek("1926-12-31").ok, true);           // 100 (belum ulang tahun ke-101)
  assert.equal(cek("1926-01-02").ok, true);           // 100
  assert.equal(cek("1926-01-01").ok, false);          // 101 -> ditolak
});

test("umur > 100 ditolak dengan pesan 'tidak wajar'", () => {
  const h = cek("1925-06-15");
  assert.equal(h.ok, false);
  assert.match(h.pesan, /tidak wajar/);
  assert.match(h.pesan, /18 sampai 100/);
});

test("29 Februari: tahun kabisat diterima, bukan kabisat ditolak", () => {
  assert.equal(cek("1992-02-29").ok, true);
  assert.equal(cek("1993-02-29").ok, false);
  assert.equal(cek("29-02-1900").ok, false);
});

test("hari ini diterima sebagai tanggal, tetapi umur 0 ditolak sebagai < 18", () => {
  const h = cek("2026-10-26");
  assert.equal(h.ok, false);
  assert.match(h.pesan, /di bawah 18/);
});

test("umur identik dengan hitungUmur() lama untuk ribuan tanggal (tidak ada pergeseran angka umur)", () => {
  let n = 0;
  for (let y = 1927; y <= 2009; y++) {
    for (let m = 1; m <= 12; m++) {
      for (const d of [1, 2, 15, 28]) {
        const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        assert.equal(hitungUmurPatokan(iso, 2027), hitungUmurLama(iso, 2027), iso);
        n++;
      }
    }
  }
  assert.ok(n > 3000);
});

test("peran tidak memengaruhi hasil: fungsi tidak menerima peran sama sekali (tak ada pengecualian UTAMA)", () => {
  assert.equal(periksaTanggalLahir.length, 2);
  assert.equal(putuskanKelurahanTugas.length, 1);
});

test("konteks umur dapat diubah (batas atas) tanpa mengubah aturan lain", () => {
  assert.equal(periksaTanggalLahir("1930-05-05", { ...K, umurMaks: 90 }).ok, false);
  assert.equal(periksaTanggalLahir("1930-05-05", K).ok, true);
});

test("tanggalHariIniWIB berbentuk YYYY-MM-DD", () => {
  assert.match(tanggalHariIniWIB(), /^\d{4}-\d{2}-\d{2}$/);
});

// ---------------------------------------------------------------------------------------------------------------------
const WILAYAH = new Set(["MEDAN BELAWAN|BELAWAN BAHARI", "MEDAN BELAWAN|BELAWAN II", "MEDAN SELAYANG|TANJUNG SARI"]);
const adaDiWilayah = async (kec, kel) => WILAYAH.has(`${kec}|${kel}`);
const dasar = { kecamatan: "MEDAN BELAWAN", kelurahanKirim: "", daftarKelurahanRumahIbadah: [], tempatTugas: "GEREJA X", adaDiWilayah };

test("kasus nyata No. 902: kelurahan kosong ditolak (tanpa data rumah ibadah)", async () => {
  const h = await putuskanKelurahanTugas({ ...dasar, kelurahanKirim: "" });
  assert.equal(h.ok, false);
  assert.equal(h.pesan, "GAGAL: Kelurahan wilayah tugas wajib dipilih.");
});

test("kelurahan yang ada di kecamatan diterima; yang tidak ada ditolak", async () => {
  assert.deepEqual(await putuskanKelurahanTugas({ ...dasar, kelurahanKirim: "BELAWAN BAHARI" }), { ok: true, kelurahan: "BELAWAN BAHARI" });
  const h = await putuskanKelurahanTugas({ ...dasar, kelurahanKirim: "TANJUNG SARI" });
  assert.equal(h.ok, false);
  assert.equal(h.pesan, "GAGAL: Kelurahan TANJUNG SARI tidak berada di Kecamatan MEDAN BELAWAN.");
});

test("rumah ibadah punya satu kelurahan: dipakai otomatis meski kiriman kosong atau berbeda", async () => {
  for (const kirim of ["", "BELAWAN II"]) {
    const h = await putuskanKelurahanTugas({ ...dasar, kelurahanKirim: kirim, daftarKelurahanRumahIbadah: ["BELAWAN BAHARI"] });
    assert.deepEqual(h, { ok: true, kelurahan: "BELAWAN BAHARI" });
  }
});

test("rumah ibadah punya beberapa kelurahan: kiriman harus salah satunya, jika tidak ditolak", async () => {
  const dua = ["BELAWAN BAHARI", "BELAWAN II"];
  assert.deepEqual(await putuskanKelurahanTugas({ ...dasar, kelurahanKirim: "BELAWAN II", daftarKelurahanRumahIbadah: dua }), { ok: true, kelurahan: "BELAWAN II" });
  const h = await putuskanKelurahanTugas({ ...dasar, kelurahanKirim: "", daftarKelurahanRumahIbadah: dua });
  assert.equal(h.ok, false);
  assert.match(h.pesan, /beberapa kelurahan \(BELAWAN BAHARI, BELAWAN II\)/);
});

test("elemen kosong di daftar rumah ibadah diabaikan (kelurahan rumah ibadah kosong = pilih manual)", async () => {
  const h = await putuskanKelurahanTugas({ ...dasar, kelurahanKirim: "", daftarKelurahanRumahIbadah: ["", ""] });
  assert.equal(h.ok, false);
  assert.equal(h.pesan, "GAGAL: Kelurahan wilayah tugas wajib dipilih.");
  assert.deepEqual(
    await putuskanKelurahanTugas({ ...dasar, kelurahanKirim: "BELAWAN II", daftarKelurahanRumahIbadah: [""] }),
    { ok: true, kelurahan: "BELAWAN II" },
  );
});

test("pemeriksaan wilayah tidak dipanggil bila kelurahan kosong (tidak ada kueri sia-sia)", async () => {
  let dipanggil = 0;
  await putuskanKelurahanTugas({ ...dasar, kelurahanKirim: "", adaDiWilayah: async () => { dipanggil++; return true; } });
  assert.equal(dipanggil, 0);
});
