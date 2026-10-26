// Uji "kabel": memastikan tiga jalur tulis data penerima benar-benar memakai aturan bersama (validasiPenerima.ts) dan
// pengecualian lama tidak muncul lagi. Kode penerima.ts / kelolaData.ts butuh Deno + database sehingga tidak dapat dijalankan
// di Node; uji ini membaca teks sumbernya sebagai pengaman regresi (BUKAN pengganti uji perilaku sungguhan di Deno).
// Plan: plans/plan-perbaikan-validasi-data-penerima.md, bagian 5.2 dan 8.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const akar = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const baca = (rel) => fs.readFileSync(path.join(akar, rel), "utf8").replace(/\r\n/g, "\n");
const jumlah = (teks, potongan) => teks.split(potongan).length - 1;

const penerima = baca("supabase/functions/api/domains/penerima.ts");
const kelolaData = baca("supabase/functions/api/domains/kelolaData.ts");
const wilayah = baca("supabase/functions/api/_shared/wilayahTugas.ts");
const indeks = baca("supabase/functions/api/index.ts");

test("input baru dan edit data memakai periksaTanggalLahir (2 pemanggilan) dan pemeriksaan umur lama sudah hilang", () => {
  assert.equal(jumlah(penerima, "periksaTanggalLahir("), 2);
  assert.ok(!penerima.includes("(umurHitung ?? -1) < 18"), "pemeriksaan umur<18 lama pada input baru kembali");
  assert.ok(!penerima.includes("umurCekBaru"), "pemeriksaan umur lama pada edit kembali");
});

test("hasil pemeriksaan tanggal lahir DITEGAKKAN (ditolak bila gagal) di input baru, edit data, dan Kelola Data", () => {
  // Memeriksa bahwa pemeriksa bukan sekadar dipanggil: hasil gagal harus langsung mengembalikan penolakan.
  assert.ok(penerima.includes("if (!cekTglLahir.ok) return { sukses: false, pesan: cekTglLahir.pesan };"), "input baru");
  assert.ok(penerima.includes("if (!cekTglEdit.ok) return { sukses: false, pesan: cekTglEdit.pesan };"), "edit data");
  assert.ok(kelolaData.includes("if (!cekTgl.ok) return { sukses: false, pesan: cekTgl.pesan };"), "Kelola Data");
});

test("Kelola Data memakai periksaTanggalLahir dan tidak memakai hitungUmur/tanggalIsoValid lama", () => {
  assert.equal(jumlah(kelolaData, "periksaTanggalLahir("), 1);
  assert.ok(!kelolaData.includes("hitungUmur"));
  assert.ok(!kelolaData.includes("tanggalIsoValid"));
});

test("Kelola Data menolak kelurahan kosong (bukan melewati pemeriksaan)", () => {
  assert.ok(kelolaData.includes('("kecamatan" in baru || "kelurahan" in baru) && !eff("kelurahan")'));
  assert.ok(kelolaData.includes("GAGAL: Kelurahan wilayah tugas wajib dipilih."));
});

test("edit data: kelurahan kosong ditolak untuk SEMUA peran dan Admin Utama diperiksa ke tabel wilayah", () => {
  const i = penerima.indexOf("const kelurahanEditBaru");
  assert.ok(i > 0);
  const blok = penerima.slice(i, i + 1200);
  assert.ok(blok.includes("kelurahanEditBerubah && !kelurahanEditBaru"));
  assert.ok(blok.includes('peranSesi === "UTAMA" && kelurahanEditBerubah'));
  // Penolakan kelurahan kosong harus SEBELUM cabang non-UTAMA (tidak bergantung peran).
  assert.ok(blok.indexOf("kelurahanEditBerubah && !kelurahanEditBaru") < blok.indexOf('if (peranSesi !== "UTAMA")'));
});

test("input baru oleh UTAMA memakai putuskanKelurahanTugas; cabang UTAMA lama (lolos tanpa periksa) sudah hilang", () => {
  assert.ok(wilayah.includes("putuskanKelurahanTugas("));
  assert.ok(!wilayah.includes('return tolakBedaKecamatan() ?? { ok: true, kecamatan: kecKirim, kelurahan: kelKirim'));
});

test("gerbang aksi publik TIDAK berubah: hanya loginPengguna yang dibuka tanpa _secret/sesi", () => {
  assert.equal(jumlah(indeks, 'const isAksiPublikTanpaGerbang = action === "loginPengguna";'), 1);
  assert.equal(jumlah(indeks, "isAksiPublikTanpaGerbang"), 2); // definisi + satu pemakaian
});

// ---- Layar (P2) ----
const indexHtml = baca("index.html");
const appTransaksi = baca("public/js/app-transaksi.js");
const appKelolaData = baca("public/js/app-kelola-data.js");

test("layar: skrip pemeriksa dimuat SEBELUM app-transaksi.js dan app-kelola-data.js, dan kolom tanggal punya min 1900", () => {
  const iHelper = indexHtml.indexOf('<script src="/js/validasi-tanggal-lahir.js');
  const iTransaksi = indexHtml.indexOf('<script src="/js/app-transaksi.js');
  const iKelola = indexHtml.indexOf('<script src="/js/app-kelola-data.js');
  assert.ok(iHelper > 0 && iHelper < iTransaksi && iTransaksi > 0 && iHelper < iKelola, "urutan skrip salah");
  assert.ok(/id="input-tgl-lahir" min="1900-01-01"/.test(indexHtml));
});

test("layar: form input memeriksa tanggal lahir saat mengetik, saat keluar kolom, dan saat simpan", () => {
  assert.ok(appTransaksi.includes("function periksaTglLahirLayar("));
  assert.ok(appTransaksi.includes("inputTglLahir.addEventListener('blur'"));
  assert.ok(appTransaksi.includes("const cekTglLahir = periksaTglLahirLayar(inputTglLahir.value);"));
  // Jalur utama memakai pemeriksa bersama; perhitungan usia lama HANYA tersisa sebagai cadangan bila berkas pemeriksa gagal dimuat.
  assert.ok(appTransaksi.includes("const hasil = periksaTglLahirLayar(inputTglLahir.value);"));
  assert.ok(appTransaksi.includes("if (!window.djpmTanggalLahir) {\n      // Cadangan: berkas pemeriksa gagal dimuat"));
  assert.equal(jumlah(appTransaksi, 'new Date("2027-01-01")'), 1, "perhitungan usia lama muncul di luar blok cadangan");
});

test("layar: penjaga SIMPAN ditegakkan (form input: blok & fokus; Kelola Data: berhenti sebelum memanggil server)", () => {
  assert.ok(appTransaksi.includes('if (!cekTglLahir.ok) { tampilkanToast(cekTglLahir.pesan, "gagal", { durasi: 6000 }); inputTglLahir.focus(); return; }'));
  assert.ok(appKelolaData.includes("if (kunciGalat.length) { toast(galat[kunciGalat[0]], 'gagal', 6000); tandaiPerubahan(); return; }"));
  // Penjaga Kelola Data harus SEBELUM api('adminUbahData') dipanggil.
  assert.ok(appKelolaData.indexOf("if (kunciGalat.length)") < appKelolaData.indexOf("api('adminUbahData'"));
});

test("layar: edit detail menolak tanggal lahir tak wajar dan kelurahan kosong sebelum dikirim", () => {
  assert.ok(appTransaksi.includes("periksaTglLahirLayar(teks[5])"));
  assert.ok(appTransaksi.includes("teks[11] !== undefined && !String(teks[11]).trim()"));
});

test("layar: Kelola Data memblokir Simpan (dan penjaga di simpanPerubahan) untuk tanggal tak wajar / kelurahan kosong", () => {
  assert.ok(appKelolaData.includes("function galatFormulir(perubahan)"));
  assert.ok(appKelolaData.includes("btn.disabled = n === 0 || D.sibuk || adaGalat;"));
  assert.ok(appKelolaData.includes("var galat = galatFormulir(perubahan), kunciGalat = Object.keys(galat);"));
});
