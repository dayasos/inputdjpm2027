// Pengingat alamat tugas di form Input (Guru Maghrib Mengaji + tempat tugas RUMAH).
// Plan: plans/plan-pengingat-alamat-rumah-gmm.md. Jalankan: npm run uji:pengingat-alamat   (Node 24+, tanpa dependensi).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const P = createRequire(import.meta.url)("../../public/js/pengingat-alamat-rumah.js");
const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8").split("\r\n").join("\n");
const GMM = "GURU MAGHRIB MENGAJI";

test("pesan persis sesuai permintaan user", () => {
  assert.equal(
    P.PESAN,
    "Pastikan alamat tugas sudah benar karena akan berpengaruh ketika Tim Verifikasi dari Dinas Sosial akan melakukan monitoring.",
  );
});

test("tempat tugas RUMAH dikenali (huruf besar/kecil, spasi, singkatan, penjelasan di belakangnya)", () => {
  for (const t of ["RUMAH", "rumah", "  Rumah  ", "RMH", "rmh ", "RUMAH SENDIRI", "RUMAH TINGGAL", "RUMAH   PRIBADI", "RUMAH, JL. X"]) {
    assert.equal(P.tempatTugasRumah(t), true, JSON.stringify(t));
  }
});

test("bukan RUMAH: lembaga, rumah ibadah, kata yang hanya mengandung huruf rumah, kosong", () => {
  for (const t of ["MASJID AL IKHLAS", "RUMAH IBADAH AL AMIN", "rumah ibadah", "RUMAH-IBADAH X", "RUMAH.IBADAH X", "RUMAH  /  IBADAH X", "RUMAHKU", "RUMAH2", "GEDUNG MADRASAH", "MUSHOLLA RUMAH SAKIT", "PERUMAHAN", "", "   ", null, undefined]) {
    assert.equal(P.tempatTugasRumah(t), false, JSON.stringify(t));
  }
});

test("pengingat HANYA untuk Guru Maghrib Mengaji", () => {
  assert.equal(P.perluPengingat(GMM, "RUMAH"), true);
  assert.equal(P.perluPengingat("guru maghrib mengaji ", "rumah"), true);
  for (const lay of ["BILAL JENAZAH", "IMAM MASJID", "USTADZ", "GURU SEKOLAH MINGGU", "", null, undefined]) {
    assert.equal(P.perluPengingat(lay, "RUMAH"), false, String(lay));
  }
  assert.equal(P.perluPengingat(GMM, "MASJID AL IKHLAS"), false);
  assert.equal(P.perluPengingat(GMM, ""), false);
});

test("perbandingan alamat tugas dengan domisili: abaikan huruf besar/kecil, spasi, tanda baca; kosong tidak pernah dianggap sama", () => {
  assert.equal(P.sama("JL. TAPIAN NAULI NO 96 F", "jl tapian nauli no.96 f"), true);
  assert.equal(P.sama("JL  PANCING II LINGK IV", "JL. PANCING II, LINGK. IV"), true);
  assert.equal(P.sama("JL. MANDOR NO 1", "JL. MADIO SANTOSO NO 1"), false);
  assert.equal(P.sama("", ""), false);
  assert.equal(P.sama("JL X", ""), false);
  assert.equal(P.sama(null, undefined), false);
});

// ---- KABEL: berkas HTML/JS benar-benar memasang pengingat, dan tidak memblokir penyimpanan ----
test("KABEL index.html: catatan di bawah Alamat Tempat Tugas, kotak di jendela konfirmasi, skrip dimuat sebelum app-transaksi", () => {
  const h = baca("index.html");
  const iAlamat = h.indexOf('id="input-almt-tugas"');
  const iCatatan = h.indexOf('id="pengingat-alamat-rumah"');
  const iGanti = h.indexOf('id="btn-ganti-tempat-tugas"');
  assert.ok(iAlamat > 0 && iCatatan > iAlamat && iCatatan < iGanti, "catatan tepat di bawah kolom Alamat Tempat Tugas");
  const iModal = h.indexOf('id="modal-konfirmasi-simpan"');
  const iKotak = h.indexOf('id="pengingat-alamat-rumah-konfirmasi"');
  const iOk = h.indexOf('id="btn-konfirmasi-ok"');
  assert.ok(iModal > 0 && iKotak > iModal && iKotak < iOk, "kotak pengingat di dalam jendela konfirmasi simpan");
  for (const id of ["pengingat-alamat-rumah-pesan", "pengingat-alamat-rumah-nilai", "pengingat-alamat-rumah-sama"]) {
    assert.ok(h.includes(`id="${id}"`), id);
  }
  // Tersembunyi bawaan: tanpa pemicu, tidak tampil di layanan lain.
  assert.match(h, /id="pengingat-alamat-rumah"[^>]*class="hidden /);
  assert.match(h, /id="pengingat-alamat-rumah-konfirmasi"\s+class="hidden /);
  // Layar kecil (mis. 320x568): isi jendela konfirmasi yang memanjang harus bisa digulir, bila tidak tombol Simpan tidak terjangkau.
  const iWadah = h.indexOf('<div class="bg-white rounded-2xl shadow-xl w-full max-w-md', iModal);
  const kelasWadah = h.slice(iWadah, h.indexOf(">", iWadah));
  assert.ok(iWadah > iModal && iWadah < iKotak, "wadah isi jendela konfirmasi ditemukan");
  assert.ok(kelasWadah.includes("max-h-[92dvh]") && kelasWadah.includes("overflow-y-auto"), "wadah jendela konfirmasi dapat digulir: " + kelasWadah);
  const iSkrip = h.indexOf('<script src="/js/pengingat-alamat-rumah.js');
  const iTransaksi = h.indexOf('<script src="/js/app-transaksi.js');
  assert.ok(iSkrip > 0 && iSkrip < iTransaksi, "modul dimuat sebelum app-transaksi.js");
});

test("KABEL app-transaksi.js: pengingat dipicu perubahan tempat tugas/layanan dan diisi tepat sebelum jendela konfirmasi dibuka", () => {
  const j = baca("public/js/app-transaksi.js");
  assert.match(j, /inputTempatTugas\.addEventListener\('input', perbaruiPengingatAlamatRumah\)/);
  assert.match(j, /inputTempatTugas\.addEventListener\('change', perbaruiPengingatAlamatRumah\)/);
  assert.match(j, /selectLayanan\.addEventListener\('change', perbaruiPengingatAlamatRumah\)/);
  assert.match(j, /function updateStatusTombolSimpan\(\) \{\n  perbaruiPengingatAlamatRumah\(\);/);
  const iIsi = j.indexOf("isiPengingatKonfirmasiSimpan();\n  document.getElementById('modal-konfirmasi-simpan').classList.remove('hidden');");
  assert.ok(iIsi > 0, "diisi sebelum modal dibuka");
});

test("TIDAK MEMBLOKIR: fungsi pengingat tidak mengubah tombol Simpan, tidak melempar galat, dan tidak mengembalikan nilai penentu alur", () => {
  const j = baca("public/js/app-transaksi.js");
  const mulai = j.indexOf("function pengingatAlamatRumahAktif()");
  const akhir = j.indexOf("function updateStatusTombolSimpan()");
  const blok = j.slice(mulai, akhir);
  assert.ok(!/\bdisabled\b/.test(blok), "tidak menyentuh disabled");
  assert.ok(!/_kuncianAktif/.test(blok), "tidak memasang kunci blok");
  assert.ok(!/\bthrow\b/.test(blok), "tidak melempar galat");
  assert.ok(!/tampilkanToast/.test(blok), "tidak memunculkan toast galat");
  // Di handler submit, pemanggilan berdiri sendiri tepat sebelum modal dibuka: bukan di dalam if/return yang bisa menghentikan alur.
  assert.match(j, /\n  \/\/ Tampilkan modal konfirmasi\n  isiPengingatKonfirmasiSimpan\(\);\n  document\.getElementById\('modal-konfirmasi-simpan'\)\.classList\.remove\('hidden'\);\n\}\);/);
});

test("KABEL app-admin.js: jendela GMM 'RUMAH' memuat pengingat dan placeholder yang tidak menyesatkan; 'LAINNYA' tidak", () => {
  const j = baca("public/js/app-admin.js");
  const mulai = j.indexOf('if (jenis === "RUMAH") {');
  const lainnya = j.indexOf('} else if (jenis === "LAINNYA") {', mulai);
  assert.ok(mulai > 0 && lainnya > mulai);
  const blokRumah = j.slice(mulai, lainnya);
  assert.ok(blokRumah.includes('id="pengingat-alamat-rumah-modal"'), "pengingat ada di jendela RUMAH");
  assert.ok(blokRumah.includes("window.djpmPengingatAlamat.PESAN"), "memakai pesan dari modul (satu sumber)");
  assert.ok(!/Alamat Rumah Lengkap/i.test(blokRumah), "placeholder lama 'Alamat Rumah Lengkap' (penyebab alamat domisili tersalin) sudah diganti");
  assert.ok(blokRumah.includes("Alamat tempat guru mengajar, sesuai berkas"));
  assert.ok(blokRumah.indexOf("pengingat-alamat-rumah-modal") < blokRumah.indexOf("submitManual()"), "pengingat tampil sebelum tombol Simpan Data");
  const blokLainnya = j.slice(lainnya, j.indexOf("function renderUstadzContent"));
  assert.ok(!blokLainnya.includes("pengingat-alamat-rumah-modal"), "jendela LAINNYA tidak diberi pengingat");
  assert.ok(!/function submitManual\(\)[\s\S]{0,700}pengingat/i.test(j), "submitManual tidak diubah: tidak memblokir");
});

test("KABEL jalur tanpa event: 'Ganti Pilihan' (bukaKunciTempatTugas) dan pemulihan draf menyegarkan pengingat", () => {
  const core = baca("public/js/app-core.js");
  const mulai = core.indexOf("function bukaKunciTempatTugas() {");
  const akhir = core.indexOf("function bukaUlangModalRumahIbadah()");
  assert.ok(mulai > 0 && akhir > mulai);
  const badan = core.slice(mulai, akhir).trimEnd();
  const panggilan = "if (typeof perbaruiPengingatAlamatRumah === 'function') perbaruiPengingatAlamatRumah();";
  assert.ok(badan.endsWith(panggilan + "\n}"), "dipanggil di akhir bukaKunciTempatTugas, aman bila fungsinya belum ada");
  const j = baca("public/js/app-transaksi.js");
  const iDraf = j.indexOf("function pulihkanDrafLokalForm()");
  const iKunci = j.indexOf("kunciTempatTugas();", iDraf);
  const iRefresh = j.indexOf("perbaruiPengingatAlamatRumah();", iKunci);
  assert.ok(iDraf > 0 && iKunci > iDraf && iRefresh > iKunci && iRefresh - iKunci < 200, "segarkan tepat setelah nilai tempat/alamat tugas dipulihkan");
});

test("Kelas Tailwind pada pengingat sudah ada di CSS yang di-commit (tanpa build ulang)", () => {
  const css = baca("public/css/tailwind.css");
  for (const kelas of ["bg-amber-50", "border-amber-200", "border-amber-300", "text-amber-800", "font-semibold", "font-bold", "leading-relaxed", "break-words"]) {
    assert.ok(css.includes("." + kelas), "kelas hilang dari CSS: " + kelas);
  }
  assert.ok(css.includes(".text-\\[11px\\]"), "text-[11px]");
});
