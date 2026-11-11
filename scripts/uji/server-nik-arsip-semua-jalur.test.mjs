// Uji penutupan celah "NIK arsip/Capil hanya dijaga layar": pemeriksaan NIK (domisili luar Kota Medan di Capil, dan arsip tahun lalu
// berstatus selain AKTIF, mis. HASIL MONEV) kini juga ditegakkan SERVER di (1) simpan input baru (simpanDataKeSheet) dan
// (2) Lihat Data > Edit (editDataPenerimaInti) -- sama dengan validasiDataBaru dan Kelola Data (adminUbahData).
// Menjalankan kode server APA ADANYA (dibundel; tanpa Deno) dengan database tiruan; data KARANGAN, tanpa koneksi database/jaringan.
// Jalankan: npm run uji:nik-arsip     (Node 24+)
import test from "node:test";
import assert from "node:assert/strict";
import { db, muatServer } from "./_harness-server.mjs";

const penerima = await muatServer("supabase/functions/api/domains/penerima.ts");

const WILAYAH = new Set(["MEDAN SELAYANG|TANJUNG SARI", "MEDAN SELAYANG|SEMPAKATA"]);
const SESI = {
  UTAMA: { akun_id: "a1", username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN" },
  KECAMATAN: { akun_id: "a2", username: "kec", role: "KECAMATAN", kecamatan: "MEDAN SELAYANG", user_id: "KECAMATAN MEDAN SELAYANG" },
};
let sesiAktif = SESI.UTAMA;
let capil = [];        // baris tabel capil untuk NIK yang diperiksa
let statusLama = [];   // baris arsip tahun lalu untuk NIK yang diperiksa
let baris = null;      // baris penerima yang sedang diedit

const NIK_MONEV = "3210172512990041";
const BARIS = (lebih = {}) => ({
  id: 1, tahun: 2027, nomor_urut: 1, nama: "ANDI", nik: "1271010101900001", jenis_kelamin: "LAKI-LAKI", tempat_lahir: "MEDAN",
  tanggal_lahir: new Date("1989-02-04T00:00:00Z"), alamat: "JL X", layanan: "BILAL JENAZAH", tempat_tugas: "RUMAH",
  alamat_tugas: "JL Y", kecamatan: "MEDAN SELAYANG", kelurahan: "TANJUNG SARI", nama_rekening: "A", nomor_rekening: "12345678901234",
  kantor_cabang: "B", no_kontak: "0812345678", status_bpjs_tk: "YA", umur: 37, status_verifikasi: "Memenuhi Syarat",
  diperbarui_at: new Date("2026-10-26T00:00:00Z"), dibuat_oleh_akun_id: null, id_folder_berkas: "x", ...lebih,
});

function pasang() {
  db().panggilan.length = 0;
  db().handler = (q, v) => {
    if (q.includes("from sesi_login")) return [sesiAktif];
    if (q.includes("from capil")) return capil;
    if (/and tahun <> \?/.test(q)) return statusLama;
    if (q.includes("select * from penerima where id")) return baris ? [baris] : [];
    if (q.includes("from wilayah")) return WILAYAH.has(String(v[0]).toUpperCase().trim() + "|" + String(v[1]).toUpperCase().trim()) ? [{ ada: 1 }] : [];
    if (q.includes("from kuota")) return [{ kuota_maks: 100 }];
    return [];
  };
}
const token = (() => { let n = 0; return () => "token-nik-" + (++n); })();
const bersih = () => { capil = []; statusLama = []; };

// ============================== (1) simpan input baru ==============================
const form = (ubah = {}) => ({
  inputNama: "andi syahputra", inputNik: "1271010101900001", selectGender: "LAKI-LAKI", inputTempatLahir: "medan",
  inputTglLahir: "04-02-1989", inputAlamat: "jl x", selectLayanan: "BILAL JENAZAH", inputTempatTugas: "RUMAH", inputAlamatTugas: "JL Y",
  controlKecamatan: "MEDAN SELAYANG", controlKelurahan: "TANJUNG SARI", inputKecamatanDomisili: "MEDAN SELAYANG", inputKelurahanDomisili: "SEMPAKATA",
  inputNamaRekening: "andi", inputNoRekening: "12345678901234", inputKantorCabang: "bank", inputNoKontak: "0812345678", selectBpjs: "YA",
  koordinatLink: "", catatanPerbedaanNama: "", __linkBerkas: {}, ...ubah,
});
const simpan = async (peran, ubah) => { sesiAktif = SESI[peran]; pasang(); return await penerima.simpanDataKeSheet(token(), form(ubah)); };
const insertan = () => db().panggilan.filter((p) => p.teks.includes("insert into penerima"));

for (const peran of ["UTAMA", "KECAMATAN"]) {
  test(`Simpan input baru [${peran}]: NIK arsip berstatus HASIL MONEV ditolak server, TANPA menulis`, async () => {
    bersih();
    statusLama = [{ tahun: 2026, nama: "ANDIKA RAMADAN YULIAN PUTRA", layanan: "GURU MAGHRIB MENGAJI", status_verifikasi: "HASIL MONEV TAHUN 2026" }];
    const h = await simpan(peran, { inputNik: NIK_MONEV });
    assert.equal(h.sukses, false, JSON.stringify(h));
    assert.match(h.pesan, /TERDAFTAR DI DATA 2026 DENGAN STATUS: HASIL MONEV TAHUN 2026/);
    assert.equal(insertan().length, 0);
  });

  test(`Simpan input baru [${peran}]: status arsip lain (MENINGGAL DUNIA, ASN/P3K, ...) juga ditolak`, async () => {
    for (const st of ["MENINGGAL DUNIA", "ASN/P3K", "MENGUNDURKAN DIRI", "SUDAH TIDAK AKTIF", "TIDAK MEMPERBAIKI RETUR"]) {
      bersih();
      statusLama = [{ tahun: 2026, nama: "ORANG", layanan: "IMAM MASJID", status_verifikasi: st }];
      const h = await simpan(peran, { inputNik: NIK_MONEV });
      assert.equal(h.sukses, false, st);
      assert.match(h.pesan, new RegExp("STATUS: " + st.replace("/", "\\/")), st);
      assert.equal(insertan().length, 0, st);
    }
  });

  test(`Simpan input baru [${peran}]: NIK berdomisili luar Kota Medan (Capil) ditolak, TANPA menulis`, async () => {
    bersih();
    capil = [{ nama: "X", nik: NIK_MONEV, status: "A", alamat_domisili: "JL", kab_kota_domisili: "KOTA BINJAI" }];
    const h = await simpan(peran, { inputNik: NIK_MONEV });
    assert.equal(h.sukses, false, JSON.stringify(h));
    assert.match(h.pesan, /DI LUAR KOTA MEDAN: KOTA BINJAI/);
    assert.equal(insertan().length, 0);
  });

  test(`Simpan input baru [${peran}]: NIK tanpa arsip, atau arsip berstatus AKTIF, tersimpan (regresi)`, async () => {
    bersih();
    assert.equal((await simpan(peran, {})).sukses, true);
    assert.equal(insertan().length, 1);
    bersih();
    statusLama = [{ tahun: 2026, nama: "ORANG", layanan: "IMAM MASJID", status_verifikasi: "AKTIF" }];
    const ok = await simpan(peran, { inputNik: "3210172512990099" });
    assert.equal(ok.sukses, true, JSON.stringify(ok));
  });
}

// ============================== (2) Lihat Data > Edit ==============================
const edit = async (teks, peran = "UTAMA") => {
  sesiAktif = SESI[peran]; pasang();
  return await penerima.editDataPenerimaInti(token(), 1, { teks, berkas: {}, idFolderBerkas: "" }, { bolehPindahTempat: true });
};
const penulisan = () => db().panggilan.filter((p) => p.teks.startsWith("UNSAFE update penerima"));

for (const peran of ["UTAMA", "KECAMATAN"]) {
  test(`Edit data [${peran}]: ubah NIK ke NIK arsip HASIL MONEV ditolak server, TANPA menulis`, async () => {
    baris = BARIS(); bersih();
    statusLama = [{ tahun: 2026, nama: "ORANG LAIN", layanan: "GURU MAGHRIB MENGAJI", status_verifikasi: "HASIL MONEV TAHUN 2026" }];
    const h = await edit({ 2: NIK_MONEV }, peran);
    assert.equal(h.sukses, false, JSON.stringify(h));
    assert.match(h.pesan, /STATUS: HASIL MONEV TAHUN 2026/);
    assert.equal(penulisan().length, 0);
  });

  test(`Edit data [${peran}]: ubah NIK ke NIK berdomisili luar Kota Medan (Capil) ditolak`, async () => {
    baris = BARIS(); bersih();
    capil = [{ nama: "X", nik: NIK_MONEV, status: "A", alamat_domisili: "JL", kab_kota_domisili: "KOTA BINJAI" }];
    const h = await edit({ 2: NIK_MONEV }, peran);
    assert.equal(h.sukses, false, JSON.stringify(h));
    assert.match(h.pesan, /DI LUAR KOTA MEDAN: KOTA BINJAI/);
    assert.equal(penulisan().length, 0);
  });

  test(`Edit data [${peran}]: NIK yang TIDAK berubah tidak diperiksa ulang (data lama tetap bisa diedit kolom lain)`, async () => {
    baris = BARIS(); bersih();
    statusLama = [{ tahun: 2026, nama: "ORANG", layanan: "IMAM MASJID", status_verifikasi: "MENINGGAL DUNIA" }];
    capil = [{ nama: "X", nik: baris.nik, status: "A", alamat_domisili: "JL", kab_kota_domisili: "KOTA BINJAI" }];
    const h = await edit({ 1: "BUDI", 2: baris.nik }, peran);
    assert.equal(h.sukses, true, JSON.stringify(h));
  });

  test(`Edit data [${peran}]: ubah NIK ke NIK tanpa arsip / arsip AKTIF diterima (regresi)`, async () => {
    baris = BARIS(); bersih();
    assert.equal((await edit({ 2: "3210172512990098" }, peran)).sukses, true);
    baris = BARIS(); bersih();
    statusLama = [{ tahun: 2026, nama: "ORANG", layanan: "IMAM MASJID", status_verifikasi: "AKTIF" }];
    assert.equal((await edit({ 2: "3210172512990097" }, peran)).sukses, true);
  });
}

// ============================== (3) Capil berstatus PINDAH: kolom domisili tertukar (nomor surat vs kabupaten) ==============================
// Data nyata (6 dari 28 baris Capil, semua PINDAH): alamat_domisili = "KABUPATEN ACEH TENGGARA", kab_kota_domisili = "SKPWNI/1271/27102025/0008".
// Pesan penolakan harus menampilkan nama kabupaten/kota, BUKAN nomor surat.
const { rapikanDomisiliCapil } = await muatServer("supabase/functions/api/_shared/cekNik.ts");

test("rapikanDomisiliCapil: kolom tertukar (nomor SKPWNI di kab/kota) dibetulkan; baris normal tidak berubah", () => {
  assert.deepEqual(rapikanDomisiliCapil("KABUPATEN ACEH TENGGARA", "SKPWNI/1271/27102025/0008"), { alamatDomisili: "", kabKotaDomisili: "KABUPATEN ACEH TENGGARA" });
  assert.deepEqual(rapikanDomisiliCapil("KOTA SUBULUSSALAM", "  skpwni/1271/01102025/0052 "), { alamatDomisili: "", kabKotaDomisili: "KOTA SUBULUSSALAM" });
  assert.deepEqual(rapikanDomisiliCapil("JL.MALAYA LRG 12 NO. 11", "KOTA PALU"), { alamatDomisili: "JL.MALAYA LRG 12 NO. 11", kabKotaDomisili: "KOTA PALU" });
  assert.deepEqual(rapikanDomisiliCapil("DUSUN VI RAWA BADAK", "KABUPATEN DELI SERDANG"), { alamatDomisili: "DUSUN VI RAWA BADAK", kabKotaDomisili: "KABUPATEN DELI SERDANG" });
  assert.deepEqual(rapikanDomisiliCapil(null, undefined), { alamatDomisili: "", kabKotaDomisili: "" });
  assert.deepEqual(rapikanDomisiliCapil("A", ""), { alamatDomisili: "A", kabKotaDomisili: "" });
  // Nilai biasa yang memuat garis miring (bukan format nomor surat) tidak ikut ditukar.
  assert.deepEqual(rapikanDomisiliCapil("JL X", "KABUPATEN LABUHANBATU/UTARA"), { alamatDomisili: "JL X", kabKotaDomisili: "KABUPATEN LABUHANBATU/UTARA" });
  assert.deepEqual(rapikanDomisiliCapil("JL X", "KOTA A/B/C"), { alamatDomisili: "JL X", kabKotaDomisili: "KOTA A/B/C" });
  // Nama daerah yang kebetulan mengandung "SKPWNI" di tengah tidak dianggap nomor surat.
  assert.deepEqual(rapikanDomisiliCapil("X", "KABUPATEN SKPWNI BARU"), { alamatDomisili: "X", kabKotaDomisili: "KABUPATEN SKPWNI BARU" });
});

for (const peran of ["UTAMA", "KECAMATAN"]) {
  test(`Simpan input baru [${peran}]: Capil PINDAH (kolom tertukar) -> pesan menyebut KABUPATEN, bukan nomor surat; TANPA menulis`, async () => {
    bersih();
    capil = [{ nama: "TARMIZI", nik: NIK_MONEV, status: "PINDAH", alamat_domisili: "KABUPATEN ACEH TENGGARA", kab_kota_domisili: "SKPWNI/1271/27102025/0008" }];
    const h = await simpan(peran, { inputNik: NIK_MONEV });
    assert.equal(h.sukses, false, JSON.stringify(h));
    assert.match(h.pesan, /DI LUAR KOTA MEDAN: KABUPATEN ACEH TENGGARA/);
    assert.doesNotMatch(h.pesan, /SKPWNI/);
    assert.equal(insertan().length, 0);
  });

  test(`Edit data [${peran}]: ubah NIK ke NIK Capil PINDAH -> pesan menyebut KABUPATEN, bukan nomor surat`, async () => {
    baris = BARIS(); bersih();
    capil = [{ nama: "TARMIZI", nik: NIK_MONEV, status: "PINDAH", alamat_domisili: "KABUPATEN DELI SERDANG", kab_kota_domisili: "SKPWNI/1271/30062025/0102" }];
    const h = await edit({ 2: NIK_MONEV }, peran);
    assert.equal(h.sukses, false, JSON.stringify(h));
    assert.match(h.pesan, /DI LUAR KOTA MEDAN: KABUPATEN DELI SERDANG/);
    assert.doesNotMatch(h.pesan, /SKPWNI/);
    assert.equal(penulisan().length, 0);
  });
}
