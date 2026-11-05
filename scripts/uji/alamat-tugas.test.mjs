// Aturan "Alamat Tugas tidak boleh berupa tautan" -- bagian MURNI + paritas server<->layar + kabel pemasangan.
// Rencana: plans/plan-alamat-tugas-tautan-gmm.md. Jalankan: npm run uji:alamat-tugas   (Node 24+, tanpa dependensi).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import * as S from "../../supabase/functions/api/_shared/alamatTugas.ts";

const K = createRequire(import.meta.url)("../../public/js/alamat-tugas.js");
const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8").split("\r\n").join("\n");

// Bentuk nyata 20 data GMM (tautan peta / timemark) + variasi yang mungkin diketik petugas.
const TAUTAN = [
  "HTTPS://MAPS.APP.GOO.GL/ABC123XYZ", "https://maps.app.goo.gl/AbC123", "https://goo.gl/maps/xyz789", "HTTPS://H5.TIMEMARK.COM/P/ABC",
  "https://www.google.com/maps/place/3.5952,98.6722", "https://maps.google.com/?q=3.59,98.67", "https://google.co.id/maps?q=3.5", "https://bit.ly/3abcDEF",
  "HTTPS:", "HTTPS:/", "https :// maps.app.goo.gl/x", "HTTP://EXAMPLE.COM", "http//maps.app.goo.gl/x", "HTTPS//MAPS.APP.GOO.GL/X",
  "JL. MAWAR NO 5 HTTPS://MAPS.APP.GOO.GL/ABC", "LIHAT MAPS.APP.GOO.GL/ABC", "maps.app.goo.gl/AbC", "goo.gl/maps/abc", "timemark.com/x", "share.google/abc",
  "wa.me/628123456789", "t.me/kanalku", "tinyurl.com/abcd", "www.alamatku.com", "WWW . ALAMATKU . COM", "www.google.com", "gmaps.link/abc", "alamatku.co.id",
  "rumahku.web.id/jalan", "sekolah.sch.id", "toko.net", "kampung.org/blok-a", "JL. SUDIRMAN, BUKA WWW.ALAMAT.COM",
  // Evasi: huruf lebar-penuh, karakter tak terlihat, pemisah baris, huruf campur.
  "ｈｔｔｐｓ：／／maps.app.goo.gl/x", "ＨＴＴＰＳ://GOO.GL/ABC", "HT​TPS://MAPS.APP.GOO.GL/X", "H­TTPS://GOO.GL/X", "JL. A\nWWW.ALAMAT.COM", "JL. A\r\nHTTPS://GOO.GL/X",
  "JL. A\tHTTPS://GOO.GL/X", "HtTpS://GoO.gL/aBc", "  https://goo.gl/x  ",
];
// Alamat sah: singkatan bertitik, nomor, RT/RW, nama gang -- TIDAK boleh dianggap tautan.
const ALAMAT_SAH = [
  "JL. SM RAJA NO.5", "JL. SM. RAJA NO 5", "GG. PERSATUAN", "JL. BUNGA ASOKA NO.10 LK.II", "DUSUN I", "DSN.I", "JL. MARELAN RAYA PASAR 1 TIMUR",
  "KOMP. PERUMNAS MANDALA BLOK C NO.12", "JL. PERJUANGAN GG. MASJID NO. 3", "JL. WILLEM ISKANDAR PSR V", "JL. ASRAMA NO.1 RT.02 RW.03", "JL. KOPRAL SUKARDI NO 7 LK. IV",
  "JL. T. AMIR HAMZAH NO.88", "DS. SEI MENCIRIM LINGK. 3", "JL. PANCING UJUNG NO.25 MEDAN", "JL. MEDAN-BELAWAN KM 14,5", "JL. TUAMANG NO. 4A / B",
  "JL. COKLAT NO.2", "JL. KOMPOS NO.9", "JL. MASJID AL-IKHLAS", "JL. BHAYANGKARA NO.1", "GG. NET NO.3", "JL. ORGANISASI NO.1", "JL. APPLE NO.1", "JL. LINK NO.2",
  "LINGKUNGAN 5 KEL. SIDOREJO HILIR", "JL. KARYA WISATA KOMPLEK KARYA WISATA MULIA BLOK B NO. 7", "JL. HTTP NO 1", "PASAR 5 GG. WWW 2", "JL. WA ME NO 5", "JL. GOO GL NO 5",
  "JL. SEI MENCIRIM NO. 12, MEDAN SUNGGAL.", "JL.PEMUDA NO.5", "JL.COMBAT NO.1", "BLOK A.1 NO.5", "", "   ", null, undefined,
];

test("TAUTAN: semua bentuk tautan (termasuk evasi huruf lebar-penuh, karakter tak terlihat, pemisah baris) terdeteksi di server dan layar", () => {
  for (const t of TAUTAN) {
    assert.equal(S.mengandungTautan(t), true, "server: " + JSON.stringify(t));
    assert.equal(K.mengandungTautan(t), true, "layar: " + JSON.stringify(t));
  }
});

test("ALAMAT SAH: tidak ada positif-palsu (singkatan bertitik, RT/RW, nomor, nama gang, kata mirip domain) -- server dan layar", () => {
  for (const t of ALAMAT_SAH) {
    assert.equal(S.mengandungTautan(t), false, "server: " + JSON.stringify(t));
    assert.equal(K.mengandungTautan(t), false, "layar: " + JSON.stringify(t));
  }
});

test("PARITAS: pola, pesan, dan hasil server = layar untuk seluruh korpus (+ pembangkit acak deterministik)", () => {
  assert.deepEqual(S.POLA_TAUTAN.map((p) => p.source), K.POLA_TAUTAN.map((p) => p.source), "sumber pola identik");
  assert.deepEqual(S.POLA_TAUTAN.map((p) => p.flags), K.POLA_TAUTAN.map((p) => p.flags), "flag pola identik");
  assert.equal(S.PESAN_ALAMAT_TAUTAN, K.PESAN_TAUTAN);
  assert.equal(S.PESAN_ALAMAT_KOSONG, K.PESAN_KOSONG);
  const potongan = ["JL.", " ", "NO.", "5", "HTTPS", ":", "//", "GOO.GL", "/", "MAPS.APP", "WWW", ".", "COM", "ID", "RT", "RW", "A", "-", ",", "\n", "​", "ｈｔｔｐ", "KOMP", "GG."];
  let x = 12345;
  const acak = () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const korpus = [...TAUTAN, ...ALAMAT_SAH];
  for (let i = 0; i < 4000; i++) {
    let t = "";
    for (let j = 0, n = 1 + Math.floor(acak() * 8); j < n; j++) t += potongan[Math.floor(acak() * potongan.length)];
    korpus.push(t);
  }
  for (const t of korpus) {
    assert.equal(S.mengandungTautan(t), K.mengandungTautan(t), JSON.stringify(t));
    assert.equal(S.normalkanUntukTautan(t), K.normalkan(t), JSON.stringify(t));
  }
});

test("PERBAIKAN: alamat pengganti harus bukan tautan, tidak kosong, >= 5 karakter, memuat huruf (server = layar)", () => {
  const kasus = [
    ["JL. MARELAN RAYA NO 5", true], ["jl a 1", true], ["JL A", false], ["", false], ["    ", false], ["12345", false], ["12345A", true],
    ["https://goo.gl/x", false], ["JL. A NO 1 WWW.X.COM", false], [null, false], [undefined, false],
  ];
  for (const [t, sah] of kasus) {
    assert.equal(S.periksaAlamatPengganti(t).ok, sah, "server " + JSON.stringify(t));
    assert.equal(K.galatPengganti(t) === "", sah, "layar " + JSON.stringify(t));
  }
  assert.equal(S.periksaAlamatPengganti("https://goo.gl/x").pesan, S.PESAN_ALAMAT_TAUTAN, "tautan -> pesan tautan, bukan pesan kosong");
  assert.equal(S.periksaAlamatPengganti("JL").pesan, S.PESAN_ALAMAT_KOSONG);
  assert.equal(K.galatInput("JL"), "", "input biasa tidak mewajibkan panjang");
  assert.equal(K.galatInput("https://goo.gl/x"), K.PESAN_TAUTAN);
});

test("KUNCI: kolom hanya terbuka bila alamat TERSIMPAN berupa tautan; alamat sah/kosong/null terkunci (server = layar)", () => {
  for (const t of TAUTAN) {
    assert.equal(S.alamatTugasBolehDiperbaiki(t), true, JSON.stringify(t));
    assert.equal(K.bolehDiperbaiki(t), true, JSON.stringify(t));
  }
  for (const t of ALAMAT_SAH) {
    assert.equal(S.alamatTugasBolehDiperbaiki(t), false, JSON.stringify(t));
    assert.equal(K.bolehDiperbaiki(t), false, JSON.stringify(t));
  }
});

test("PESAN: menyebut tautan, alamat sebenarnya, dan kolom Koordinat Lokasi; pesan terkunci menyebut syaratnya", () => {
  assert.match(S.PESAN_ALAMAT_TAUTAN, /tidak boleh berupa tautan/);
  assert.match(S.PESAN_ALAMAT_TAUTAN, /Koordinat Lokasi/);
  assert.match(S.PESAN_ALAMAT_TERKUNCI, /masih berupa tautan/);
});

// ───────────────────────────── Kabel: aturan benar-benar terpasang di semua jalur tulis ─────────────────────────────
test("KABEL SERVER: input baru, edit Detail, Kelola Data, validasi pra-simpan, dan perbaikan Cek Alamat memakai aturan bersama", () => {
  const pen = baca("supabase/functions/api/domains/penerima.ts");
  assert.match(pen, /import \{[^}]*mengandungTautan[^}]*\} from "\.\.\/_shared\/alamatTugas\.ts"/s);
  // input baru: sesudah pemeriksaan data wajib dan SEBELUM wilayah tugas/insert
  const iSimpan = pen.indexOf("export async function simpanDataKeSheet");
  const iTolak = pen.indexOf("if (mengandungTautan(alamatTugas))", iSimpan);
  assert.ok(iTolak > iSimpan, "simpanDataKeSheet menolak tautan");
  assert.ok(iTolak < pen.indexOf("tentukanWilayahTugas({ sesi", iSimpan), "ditolak sebelum penentuan wilayah");
  assert.ok(iTolak < pen.indexOf("insert into penerima (", iSimpan), "ditolak sebelum INSERT");
  // edit: pembungkus publik 3 parameter + inti dengan opsi internal
  assert.match(pen, /export function editDataPenerima\(token: string, nomorBarisAsli: number, editData: DataEdit\) \{\s*return editDataPenerimaInti\(token, nomorBarisAsli, editData, \{\}\);/);
  assert.match(pen, /export async function editDataPenerimaInti\(/);
  assert.match(pen, /alamatTugasBolehDiperbaiki\(alamatLamaTersimpan\)/);
  assert.match(pen, /\(berkasBerganti > 0 \|\| koordinatDiubah \|\| alamatDiperbaiki\)/, "perbaikan alamat memicu wajib-lapor");
  assert.match(pen, /berkasDiubah: berkasBerganti \+ \(koordinatDiubah \? 1 : 0\) \+ \(alamatDiperbaiki \? 1 : 0\)/, "klien dapat memasang gerbang laporan");
  const kd = baca("supabase/functions/api/domains/kelolaData.ts");
  assert.match(kd, /"alamat_tugas" in baru && mengandungTautan\(baru\.alamat_tugas\)/);
  const val = baca("supabase/functions/api/domains/validasi.ts");
  assert.match(val, /if \(mengandungTautan\(alamatTugasBaru\)\) return \{ valid: false, pesan: PESAN_ALAMAT_TAUTAN \}/);
  const inti = baca("supabase/functions/api/_shared/cekAlamatInti.ts");
  assert.match(inti, /if \(mengandungTautan\(alamat\)\) return \{ ok: false, pesan: PESAN_ALAMAT_TAUTAN \}/);
});

test("KABEL SERVER: opsi internal dariCekAlamat tidak dapat dijangkau klien (aksi terdaftar = pembungkus, tanpa parameter ke-4)", () => {
  const idx = baca("supabase/functions/api/index.ts");
  assert.doesNotMatch(idx, /editDataPenerimaInti/, "inti tidak diekspos sebagai aksi");
  const pen = baca("supabase/functions/api/domains/penerima.ts");
  const m = /export function editDataPenerima\(([^)]*)\)/.exec(pen);
  assert.ok(m && m[1].split(",").length === 3, "pembungkus publik tepat 3 parameter");
  const cek = baca("supabase/functions/api/domains/cekAlamatTugas.ts");
  assert.equal([...cek.matchAll(/dariCekAlamat: true/g)].length, 1, "hanya Cek Alamat yang memakai opsi internal");
});

test("KABEL LAYAR: skrip dimuat, versi sinkron, dan dipakai di input baru / popup manual / Detail > Edit / Kelola Data / Cek Alamat", () => {
  const html = baca("index.html");
  const iAT = html.indexOf('src="/js/alamat-tugas.js?v=');
  assert.ok(iAT > 0, "alamat-tugas.js dimuat");
  assert.ok(iAT < html.indexOf('src="/js/app-transaksi.js'), "dimuat sebelum app-transaksi.js");
  const ver = (n) => new RegExp('src="/js/' + n.replace(".", "\\.") + '\\?v=(\\d+)"').exec(html)[1];
  const v = ver("alamat-tugas.js");
  for (const n of ["app-core.js", "app-transaksi.js", "app-admin.js", "app-kelola-data.js", "app-pesan-periode.js"]) assert.equal(ver(n), v, n + " dinaikkan bersama");
  const tr = baca("public/js/app-transaksi.js");
  assert.match(tr, /window\.djpmAlamatTugas\.galatInput\(inputAlamatTugas\.value\)/, "submit input baru");
  assert.match(tr, /const kolDef = KOLOM_TEKS\[i\] \|\| \(i === 9 && alamatTugasTerbuka\(d\) \? KOLOM_ALAMAT_TUGAS : null\);/, "kolom 9 terbuka bersyarat");
  assert.match(tr, /if \(alamatTugasTerbuka\(dataAktif\)\) kunciEdit\.push\('9'\)/, "kolom 9 ikut dikirim hanya bila terbuka");
  assert.match(tr, /window\.djpmAlamatTugas\.galatPengganti\(teks\[9\]\)/, "alamat pengganti diperiksa sebelum kirim");
  const blokKolom = /const KOLOM_TEKS = \{[\s\S]*?\n  \};/.exec(tr);
  assert.ok(blokKolom, "blok KOLOM_TEKS ditemukan");
  assert.doesNotMatch(blokKolom[0], /(^|[\s,{])(8|9)\s*:/, "indeks 8 dan 9 TIDAK masuk KOLOM_TEKS tetap (terkunci secara bawaan)");
  assert.match(baca("public/js/app-core.js"), /window\.djpmAlamatTugas\.mengandungTautan\(inputAlamatTugas\.value\)/);
  assert.match(baca("public/js/app-admin.js"), /window\.djpmAlamatTugas\.galatInput\(alamat\)/);
  assert.match(baca("public/js/app-kelola-data.js"), /'alamat_tugas' in perubahan && window\.djpmAlamatTugas/);
  assert.match(baca("public/js/app-cek-alamat.js"), /window\.djpmAlamatTugas\.galatInput\(al\)\) galat = window\.djpmAlamatTugas\.PESAN_TAUTAN/);
});

// ───────────────────────────── Teks sangat panjang: biaya linear + tautan di posisi mana pun tetap terdeteksi ─────────────────────────────
test("TEKS PANJANG: pemeriksaan per jendela (biaya linear) -- 50.000 karakter bertitik berulang selesai cepat; hasil server = layar", () => {
  const kasusLambat = ["A.".repeat(25000), "A.B-".repeat(12500), "A.".repeat(25000) + "COMX"];
  for (const t of kasusLambat) {
    const mulai = performance.now();
    assert.equal(S.mengandungTautan(t), false);
    assert.equal(K.mengandungTautan(t), false);
    assert.ok(performance.now() - mulai < 3000, "terlalu lambat (kuadratik?)");
  }
});

test("TEKS PANJANG: tautan di awal / tengah / akhir / tepat di sambungan jendela terdeteksi (server = layar)", () => {
  const isi = (n) => "JL. MAWAR NO. 5 ".repeat(Math.ceil(n / 16)).slice(0, n);
  const url = "HTTPS://MAPS.APP.GOO.GL/ABC123";
  const J = S.JENDELA_PERIKSA, T = S.TUMPANG_JENDELA;
  assert.equal(J, K.JENDELA_PERIKSA);
  assert.equal(T, K.TUMPANG_JENDELA);
  const posisi = [0, 1, 500, J - url.length - 1, J - url.length, J - 10, J - 1, J, J + 1, J + T, (J - T) * 2 - 5, (J - T) * 2, 4000, 9990];
  for (const p of posisi) {
    const t = isi(p) + url + isi(300);
    assert.equal(S.mengandungTautan(t), true, "server pos " + p);
    assert.equal(K.mengandungTautan(t), true, "layar pos " + p);
  }
  const akhir = isi(20000) + "WWW.ALAMAT.COM";
  assert.equal(S.mengandungTautan(akhir), true);
  assert.equal(K.mengandungTautan(akhir), true);
  assert.equal(S.mengandungTautan(isi(20000)), false);
  assert.equal(K.mengandungTautan(isi(20000)), false);
});

test("PENGGANTI: terlalu panjang (> 100 karakter) ditolak dengan pesan panjang -- server = layar; tepat 100 sah", () => {
  const seratus = "JL. MAWAR ".repeat(10).slice(0, 100);
  assert.equal(seratus.length, 100);
  assert.equal(S.periksaAlamatPengganti(seratus).ok, true);
  assert.equal(K.galatPengganti(seratus), "");
  const panjang = seratus + "A";
  assert.equal(S.periksaAlamatPengganti(panjang).ok, false);
  assert.equal(S.periksaAlamatPengganti(panjang).pesan, S.PESAN_ALAMAT_PANJANG);
  assert.equal(K.galatPengganti(panjang), K.PESAN_PANJANG);
  assert.equal(S.PESAN_ALAMAT_PANJANG, K.PESAN_PANJANG);
});
