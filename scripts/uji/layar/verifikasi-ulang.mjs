// Layar verifikasi ulang milik ADMIN UTAMA di Chrome sungguhan (server TIRUAN). Alur petugas ada di verifikasi-ulang-detail.mjs. Rencana: plans/plan-verifikasi-ulang.md (T5)
// Jalankan: node scripts/uji/layar/verifikasi-ulang.mjs   (Chrome + npx vite --port 3123 --strictPort)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cekSimpanHasil } from "../../../supabase/functions/api/_shared/verifikasiUlangInti.ts";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:3123";
const PORT = 9345;
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=1100,1000", "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map(); const galatJs = []; const skripDimuat = [];
const panggilan = [];
const CORS = [{ name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Headers", value: "*" }, { name: "Access-Control-Allow-Methods", value: "*" }];

let peran = "VERIFIKATOR";
const MS = "Memenuhi Syarat";
let unduhGagal = false;
let sasaran = { sukses: true, finalTotal: 9214, hasilVerifikator: 1798, sudahDibayar: 0, sasaran: 7416, sudahDiperiksa: 9, sedangDitugaskan: 0, sisa: 7407 };
let sasaranGagal = false;
let tugas, berkas, selesai, dikoreksi, simpanGagal, paket, koreksi, pratinjauJumlah, benihKe = 0, namaJahat = false;
function reset() {
  selesai = 0; dikoreksi = 0; simpanGagal = ""; benihKe = 0; pratinjauJumlah = 600;
  const nm = (i) => (namaJahat && i === 1 ? '<img src=x onerror="window.__xss=1">Budi' : ["Sri Wahyuni", "Ahmad Fauzi", "Marlina Sitorus", "Rahmat Hidayat"][i - 1]);
  tugas = [1, 2, 3, 4].map((i) => ({ tugasId: 100 + i, penerimaId: 500 + i, nama: nm(i), layanan: "IMAM MASJID", kecamatan: "MEDAN KOTA", kelurahan: "SEI SIKAMBING B", status: MS, dibuka: false, namaPaket: "Tahap percobaan 1", batasSelesai: "2026-11-20" }));
  berkas = { 101: ["ktp", "buku_rekening", "surat"], 102: ["ktp", "buku_rekening"], 103: ["ktp"], 104: [] };
  for (const k of Object.keys(berkas)) berkas[k] = berkas[k].map((x) => ({ kunci: "link_" + x, label: { ktp: "KTP", buku_rekening: "Buku Rekening", surat: "Surat Permohonan" }[x], url: "https://berkas.example/" + k + "/" + x, dibuka: false }));
  paket = [{ id: 7, nama: "Tahap percobaan 1", dibuatOleh: "ADMIN", dibuatPada: "2026-11-14T03:00:00Z", benih: "b1", status: "AKTIF", batasSelesai: "2026-11-20", jumlahTugas: 40, akunKhusus: "verif_uga_deba", selesai: 11, sesuai: 9, dikoreksi: 2, ditarik: 1, sisa: 28, perAkun: [{ username: "verif_helda_melani", tugas: 20, selesai: 6, ditarik: 0 }, { username: "verif_raja_rizki", tugas: 20, selesai: 5, ditarik: 1 }] }];
  koreksi = [{ tugasId: 10, batchId: 7, penerimaId: 2, nama: "Hasan Basri", layanan: "PENDETA", kecamatan: "X", kelurahan: "KOTA MATSUM I", pemeriksa: "verif_liana_rizky", selesaiPada: "2026-11-14T03:40:00Z", statusSebelum: MS, statusSesudah: "Tidak Memenuhi Syarat", alasan: "Alamat bukan wilayah Medan", dibatalkan: false, statusSekarang: MS },
    { tugasId: 9, batchId: 7, penerimaId: 1, nama: "Siti Aminah", layanan: "IMAM MASJID", kecamatan: "X", kelurahan: "SEI SIKAMBING B", pemeriksa: "verif_raja_rizki", selesaiPada: "2026-11-14T03:30:00Z", statusBaru: "", statusSebelum: MS, statusSesudah: "Berkas Tidak Lengkap", alasan: "Buku rekening tidak terbaca", dibatalkan: false, statusSekarang: "Berkas Tidak Lengkap" }];
}
reset();
const sisaTugas = () => tugas.filter((t) => !t.selesaiDi);
function jawab(aksi, args) {
  const [, a1, a2] = args;
  if (aksi === "pulihkanSesi") return { sukses: true, token: "TOKEN-UJI", username: peran === "VERIFIKATOR" ? "verif_helda_melani" : "admin", role: peran, kecamatan: "", userId: "", profileBelumDiisi: false, profil: { namaLengkap: "UJI", nomorHp: "0800", jabatan: "Uji" } };
  if (aksi === "getMasterLayanan") return { kecamatan: ["IMAM MASJID", "PENDETA"], kemenag: ["GURU MAGHRIB MENGAJI"] };
  if (aksi === "getRingkasanVerifikasiSaya") return { sukses: true, total: 12, hariIni: 3, memenuhiSyarat: 8, berkasTidakLengkap: 3, tidakMemenuhiSyarat: 1 };
  if (aksi === "getTemplatAlasan") return { sukses: true, templat: [{ id: 1, status: "Berkas Tidak Lengkap", judul: "KTP tidak terbaca", isi: "KTP {LAYANAN} tidak terbaca", layanan: [], urutan: 1, aktif: true }, { id: 2, status: "Tidak Memenuhi Syarat", judul: "Bukan warga Medan", isi: "Bukan warga Medan", layanan: [], urutan: 1, aktif: true }], layananKecamatan: [], layananKemenag: [] };
  if (aksi === "getTugasUlangSaya") { const s = sisaTugas(); return { sukses: true, sisa: s.length, selesai, dikoreksi, ditarikBaruSaja: 0, halaman: 1, adaBerikutnya: false, tugas: s.map((t) => ({ ...t })) }; }
  if (aksi === "bukaTugasUlang") {
    const t = tugas.find((x) => x.tugasId === a1); if (!t || t.selesaiDi) return { sukses: false, pesan: "Tugas tidak ditemukan." };
    t.dibuka = true;
    return { sukses: true, tugasId: t.tugasId, penerimaId: t.penerimaId, status: MS, keteranganVerifikasi: "", diverifikasiOleh: "ADMIN", data: { nama: t.nama, nik: "1201000000000" + (t.tugasId % 10), jenisKelamin: "PEREMPUAN", tempatLahir: "MEDAN", tanggalLahir: "04-02-1989", umur: "37", alamat: "JL MARELAN NO 5", namaRekening: "SITI AMINAH", nomorRekening: "1234567890", kantorCabang: t.tugasId === 102 ? "" : "SUMUT", layanan: t.layanan, tempatTugas: "MASJID AL IKHLAS", alamatTugas: "JL MESJID 1", kecamatan: t.kecamatan, kelurahan: t.kelurahan, noKontak: "0812345678", koordinat: "https://maps.app.goo.gl/abc" }, berkas: berkas[t.tugasId].map((b) => ({ ...b })) };
  }
  if (aksi === "catatBerkasDibuka") { const b = (berkas[a1] || []).find((x) => x.kunci === a2); if (!b) return { sukses: false, pesan: "Berkas tidak dikenal pada data ini." }; b.dibuka = true; return { sukses: true }; }
  if (aksi === "simpanHasilUlang") {
    if (simpanGagal) return { sukses: false, pesan: simpanGagal };
    const t = tugas.find((x) => x.tugasId === a1), bk = berkas[a1];
    const cek = cekSimpanHasil({ hasil: a2.hasil, statusSebelum: MS, statusSesudah: a2.statusSesudah, alasan: a2.alasan, berkas: bk, berkasDibuka: bk.filter((b) => b.dibuka).map((b) => b.kunci), centang: a2.centang, sudahDibuka: t.dibuka });
    if (!cek.ok) return { sukses: false, pesan: cek.pesan };
    t.selesaiDi = true; selesai++; if (cek.hasil === "DIKOREKSI") dikoreksi++;
    return { sukses: true, hasil: cek.hasil, statusSesudah: cek.statusSesudah, pesan: cek.hasil === "SESUAI" ? "Hasil Sesuai tersimpan." : "Koreksi tersimpan: status menjadi " + cek.statusSesudah + "." };
  }
  // ---- Admin
  if (aksi === "pratinjauBatchUlang") {
    const benih = a1.benih || "benih-" + (++benihKe);
    const per = ["verif_a", "verif_b", "verif_c"].map((u, i) => ({ username: u.toUpperCase(), jumlah: 200 - i }));
    return { sukses: true, benih, kriteria: a1, batasSelesai: a1.batasSelesai || null, kolamCocok: 7788, dikeluarkan: { sudahDibayar: 5, sudahDiperiksaUlang: 0, sedangDitugaskan: 0 }, jumlahTugas: pratinjauJumlah + 124, jumlahPemeriksa: 28, akunKhusus: "verif_uga_deba", selisihMS: 1, perAkun: per.concat([{ username: "VERIF_UGA_DEBA", jumlah: 124 }]), perLayanan: [], tidakTerbagi: { jumlah: 0, contoh: [] } };
  }
  if (aksi === "getRingkasanSasaranUlang") return sasaranGagal ? { sukses: false, pesan: "galat uji" } : { ...sasaran };
  if (aksi === "buatBatchUlang") { sasaran = { ...sasaran, sedangDitugaskan: 724, sisa: 6683 }; }
  if (aksi === "buatBatchUlang") return { sukses: true, batchId: 8, jumlahTugas: pratinjauJumlah + 124, benih: a1.benih, pesan: "Paket tugas dibuat: " + (pratinjauJumlah + 124) + " data." };
  if (aksi === "daftarBatchUlang") return { sukses: true, batch: paket.map((p) => ({ ...p })) };
  if (aksi === "unduhRekapPembagianUlang") return unduhGagal ? { sukses: false, pesan: "Fitur ini khusus Admin Utama." } : { sukses: true, base64: "UEsDBA==", namaFile: "Pembagian Verifikasi Ulang Tahap percobaan 1 (paket 7).xlsx", jumlahTugas: 40 };
  if (aksi === "cekPembagianBatchUlang") return { sukses: true, sama: true, selisih: 0, jumlahTugas: 40 };
  if (aksi === "batalkanBatchUlang") { paket[0].status = "DIBATALKAN"; return { sukses: true, tugasDihapus: 29, pesan: "Paket dibatalkan. Tugas yang sudah selesai tetap tersimpan." }; }
  if (aksi === "getDaftarKoreksiUlang") return { sukses: true, halaman: 1, adaBerikutnya: false, koreksi: koreksi.map((k) => ({ ...k })) };
  if (aksi === "batalkanKoreksiUlang") { koreksi.find((k) => k.tugasId === a1).dibatalkan = true; return { sukses: true, pesan: "Koreksi dibatalkan; status dikembalikan ke \"Memenuhi Syarat\"." }; }
  return { sukses: true };
}
async function dialihkan(p) {
  const url = p.request.url;
  if (!/supabase\.co|\/api\/gas/.test(url)) { await kirim("Fetch.continueRequest", { requestId: p.requestId }); return; }
  if (p.request.method === "OPTIONS") { await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 204, responseHeaders: CORS, body: "" }); return; }
  let aksi = "?", args = []; try { const b = JSON.parse(p.request.postData || "{}"); aksi = b.action; args = b.args || []; } catch { /* abaikan */ }
  panggilan.push({ aksi, args });
  const jawaban = jawab(aksi, args);
  await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200, responseHeaders: [...CORS, { name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify({ result: jawaban })).toString("base64") });
}
async function sambung() {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch { /* tunggu */ } await tidur(250); }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); }
    else if (m.method === "Fetch.requestPaused") dialihkan(m.params);
    else if (m.method === "Runtime.exceptionThrown") galatJs.push(((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text || "").slice(0, 200));
    else if (m.method === "Network.requestWillBeSent" && /\.js(\?|$)/.test(m.params.request.url)) skripDimuat.push(m.params.request.url);
  };
}
function kirim(method, params = {}) { return new Promise((r) => { const i = ++id; tunggu.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function js(ekspresi) {
  const m = await kirim("Runtime.evaluate", { expression: ekspresi, returnByValue: true, awaitPromise: true });
  if (m.result.exceptionDetails) throw new Error("JS galat: " + JSON.stringify(m.result.exceptionDetails).slice(0, 300));
  return m.result.result.value;
}
async function tungguSampai(ekspresi, label, maks = 60) { for (let i = 0; i < maks; i++) { if (await js(ekspresi).catch(() => false)) return true; await tidur(250); } throw new Error("Timeout menunggu: " + label); }
let gagal = 0;
function cek(nama, kondisi, rinci = "") { console.log((kondisi ? "LULUS  " : "GAGAL  ") + nama + (kondisi ? "" : "  -> " + rinci)); if (!kondisi) gagal++; }
const hitung = (a) => panggilan.filter((x) => x.aksi === a).length;
const terakhir = (a) => panggilan.filter((x) => x.aksi === a).pop();
const klik = (sel) => js("(() => { const e = document.querySelector(" + JSON.stringify(sel) + "); if (!e || e.disabled) return false; e.click(); return true; })()");
const ada = (sel) => js("!!document.querySelector(" + JSON.stringify(sel) + ")");
const teks = (sel) => js("(() => { const e = document.querySelector(" + JSON.stringify(sel) + "); return e ? e.textContent.replace(/\\s+/g, ' ').trim() : ''; })()");
const nonaktif = (sel) => js("(() => { const e = document.querySelector(" + JSON.stringify(sel) + "); return e ? e.disabled : null; })()");

async function masuk(peranBaru) {
  peran = peranBaru; panggilan.length = 0; skripDimuat.length = 0;
  await kirim("Page.navigate", { url: BASE + "/" });
  await tungguSampai("!!document.getElementById('tab-rekap') && document.readyState==='complete'", "halaman siap");
  await js(`sessionStorage.setItem('dana_jasa_sesi', JSON.stringify({ token: 'TOKEN-UJI', username: ${JSON.stringify(peranBaru === "VERIFIKATOR" ? "verif_helda_melani" : "admin")}, role: ${JSON.stringify(peranBaru)}, kecamatan: '', userId: '', namaLengkap: 'UJI' })); true`);
  skripDimuat.length = 0;
  await kirim("Page.reload");
  await tungguSampai("!!document.getElementById('tab-rekap') && document.readyState==='complete'", "halaman siap setelah muat ulang");
  await tungguSampai("document.getElementById('modal-login') && document.getElementById('modal-login').classList.contains('hidden')", "sesi tiruan diterima", 60);
  await tidur(2800);
}
async function pasangStubBuka() { await js("window.__dibuka = []; window.open = (u) => { window.__dibuka.push(u); return null; }; true"); }
const OVT = "#djpm-tul-overlay", OVA = "#djpm-vua-overlay";
async function ukurPonsel(selOverlay, selKotak, lebar) {
  await kirim("Emulation.setDeviceMetricsOverride", { width: lebar, height: 844, deviceScaleFactor: 2, mobile: true });
  await tidur(500);
  const r = await js(`(() => { const o = document.querySelector(${JSON.stringify(selOverlay)}); const W = document.documentElement.clientWidth; const k = o.querySelector(${JSON.stringify(selKotak)}).getBoundingClientRect(); const lewat = [];
    o.querySelectorAll('button, textarea, select, input[type=text], input[type=number], input[type=date], h2, h3, li').forEach((e) => { if (e.closest('.vua-gulir')) return; const b = e.getBoundingClientRect(); if (b.width && (b.right > W + 1 || b.left < -1)) lewat.push((e.className || e.tagName) + ':' + Math.round(b.left) + '-' + Math.round(b.right)); });
    return { W, kotakKanan: Math.round(k.right), gulirHalaman: document.documentElement.scrollWidth > W + 1, gulirOverlay: o.scrollWidth > o.clientWidth + 1, lewat: lewat.slice(0, 5) }; })()`);
  await kirim("Emulation.clearDeviceMetricsOverride");
  await tidur(300);
  return r;
}

try {
  await sambung();
  await kirim("Runtime.enable"); await kirim("Page.enable"); await kirim("Network.enable");
  await kirim("Fetch.enable", { patterns: [{ urlPattern: "*supabase.co*" }, { urlPattern: "*api/gas*" }] });

  // (Alur PETUGAS di halaman Detail kini diuji oleh scripts/uji/layar/verifikasi-ulang-detail.mjs.)

  // ============================ ADMIN UTAMA ============================
  namaJahat = false; reset();
  await masuk("UTAMA");
  cek("ADMIN: modul Admin dimuat; modul petugas TIDAK dimuat; tidak ada tombol Tugas Ulang", skripDimuat.some((u) => /app-verifikasi-ulang-admin\.js/.test(u)) && !skripDimuat.some((u) => /app-tugas-ulang\.js/.test(u)) && !(await ada("#djpm-tul-pil")), JSON.stringify(skripDimuat.map((u) => u.split("/").pop())));
  await tungguSampai("!!document.getElementById('btn-verifikasi-ulang')", "tombol Verifikasi Ulang");
  cek("ADMIN: tombol 'Verifikasi Ulang' ada di toolbar", true);
  await klik("#btn-verifikasi-ulang");
  await tungguSampai("!!document.querySelector('#djpm-vua-overlay [data-aksi=\"pratinjau\"]')", "panel terbuka");
  await tungguSampai("document.querySelectorAll('#vua-badge .vua-bk').length === 4", "badge sasaran termuat");
  { const b = await teks("#vua-badge"); cek("ADMIN: badge sasaran: Data yang akan diverifikasi ulang 7.416, Sedang ditugaskan 0, Sudah diperiksa ulang 9, Sisa belum ditugaskan 7.407", /Data yang akan diverifikasi ulang\s*7\.416/.test(b) && /Sedang ditugaskan\s*0/.test(b) && /Sudah diperiksa ulang\s*9/.test(b) && /Sisa belum ditugaskan\s*7\.407/.test(b), b);
    cek("ADMIN: catatan badge menyebut data hasil verifikator yang tidak ikut (1.798) dan yang sudah dibayar (0)", /1\.798 data hasil verifikasi petugas verifikator dan 0 data yang sudah masuk batch pembayaran/.test(await teks("#vua-badge-cat")), await teks("#vua-badge-cat")); }
  cek("ADMIN: kotak 'Sertakan data yang pernah diverifikasi ulang' DIHAPUS; aturan 1 data = 1 hitungan dijelaskan di formulir", !(await ada("#vua-sertakan")) && !/Sertakan data yang pernah/.test(await teks("#djpm-vua-overlay")) && /sudah pernah diverifikasi ulang tidak ikut lagi \(1 data = 1 hitungan\)/.test(await teks("#djpm-vua-overlay")), await teks("#djpm-vua-overlay"));
  cek("ADMIN: 'Bagikan' nonaktif sebelum pratinjau", (await nonaktif('[data-aksi="bagikan"]')) === true);
  await tungguSampai("document.querySelectorAll('#djpm-vua-overlay input[data-layanan]').length === 3", "daftar layanan termuat", 40).catch(() => {});   // dimuat asinkron
  cek("ADMIN: daftar layanan dimuat dari server (3 pilihan)", (await js("document.querySelectorAll('#djpm-vua-overlay input[data-layanan]').length")) === 3);
  await js("document.getElementById('vua-nama').value = 'Tahap 1'; document.getElementById('vua-nama').dispatchEvent(new Event('input', {bubbles:true})); true");
  await klik('[data-aksi="pratinjau"]');
  await tungguSampai("document.querySelectorAll('#djpm-vua-overlay .vua-dist > div').length === 4", "pratinjau tampil");
  const pj = terakhir("pratinjauBatchUlang").args[1];
  cek("ADMIN: pratinjau mengirim kriteria yang benar (3 status, jumlah 600, benih kosong -> dibuat server)", pj.status.length === 3 && pj.jumlah === 600 && pj.benih === "" && !("sertakanSudahDiperiksa" in pj), JSON.stringify(pj));
  cek("ADMIN: benih dari server terisi di formulir; total tugas, pemeriksa khusus, dan aturan pimpinan tampil", (await js("document.getElementById('vua-benih').value")) === "benih-1" && /724/.test(await teks("#vua-hasil")) && /verif_uga_deba/.test(await teks("#vua-hasil")) && /Akun pimpinan tidak menerima tugas/.test(await teks("#vua-hasil")), await teks("#vua-hasil"));
  cek("ADMIN: setelah pratinjau 'Bagikan' AKTIF", (await nonaktif('[data-aksi="bagikan"]')) === false);
  await js("(() => { const j = document.getElementById('vua-jumlah'); j.value = '300'; j.dispatchEvent(new Event('input', {bubbles:true})); return true; })()");
  cek("ADMIN: mengubah jumlah setelah pratinjau menonaktifkan 'Bagikan' (pratinjau tidak lagi cocok)", (await nonaktif('[data-aksi="bagikan"]')) === true);
  await js("(() => { const j = document.getElementById('vua-jumlah'); j.value = '600'; j.dispatchEvent(new Event('input', {bubbles:true})); return true; })()");
  cek("ADMIN: mengembalikan isian ke semula mengaktifkan 'Bagikan' lagi", (await nonaktif('[data-aksi="bagikan"]')) === false);
  await klik('input[data-status="Tidak Memenuhi Syarat"]');   // mengubah kotak centang memicu render ulang formulir
  cek("ADMIN: mengubah pilihan status (render ulang) menonaktifkan 'Bagikan' karena pratinjau tidak lagi cocok", (await nonaktif('[data-aksi="bagikan"]')) === true);
  await klik('input[data-status="Tidak Memenuhi Syarat"]');
  cek("ADMIN: mengembalikan pilihan status mengaktifkan 'Bagikan' lagi", (await nonaktif('[data-aksi="bagikan"]')) === false);
  await klik('[data-aksi="bagikan"]');
  await tungguSampai("document.querySelector('#djpm-vua-overlay .vua-tab [data-tab=\"paket\"][aria-selected=\"true\"]') && document.querySelectorAll('#djpm-vua-overlay table tbody tr').length >= 1", "pindah ke tab Paket berjalan");
  await tungguSampai("/Sedang ditugaskan\\s*724/.test(document.getElementById('vua-badge').textContent)", "badge disegarkan sesudah paket dibuat").catch(() => {});
  cek("ADMIN: sesudah paket dibuat badge disegarkan dari server (Sedang ditugaskan 724, Sisa 6.683)", /Sedang ditugaskan\s*724/.test(await teks("#vua-badge")) && /Sisa belum ditugaskan\s*6\.683/.test(await teks("#vua-badge")), await teks("#vua-badge"));
  const buat = terakhir("buatBatchUlang").args[1];
  cek("ADMIN: 'Bagikan' mengirim benih yang SAMA dengan pratinjau + nama paket; lalu pindah ke 'Paket berjalan'", buat.benih === "benih-1" && buat.nama === "Tahap 1" && buat.jumlah === 600, JSON.stringify(buat));
  cek("ADMIN: paket tampil dengan kemajuan (11 dari 40 selesai, 2 dikoreksi, 1 ditarik, 28 sisa)", /Tahap percobaan 1/.test(await teks("#vua-isi")) && /11 \(28%\)/.test(await teks("#vua-isi")), await teks("#vua-isi"));
  cek("ADMIN: tombol 'Unduh Excel pembagian' ada di tiap paket dengan peringatan data pribadi", (await js("(() => { const b = document.querySelector('#djpm-vua-overlay [data-aksi=\"unduh-excel\"]'); return !!b && /Unduh Excel pembagian/.test(b.textContent) && /NIK/.test(b.title); })()")) === true);
  unduhGagal = true;
  await klik('[data-aksi="unduh-excel"]');
  await tungguSampai("/khusus Admin Utama/.test(document.getElementById('vua-isi').textContent)", "pesan gagal unduh");
  cek("ADMIN: unduhan yang ditolak server menampilkan pesannya di baris paket dan tombol aktif lagi", hitung("unduhRekapPembagianUlang") === 1 && (await nonaktif('[data-aksi="unduh-excel"]')) === false);
  unduhGagal = false;
  await klik('[data-aksi="unduh-excel"]');
  await tungguSampai("/File diunduh/.test(document.getElementById('vua-isi').textContent)", "unduhan berhasil");
  const unduh = terakhir("unduhRekapPembagianUlang").args;
  cek("ADMIN: 'Unduh Excel pembagian' mengirim token dan nomor paket; pesan sukses menyebut nama file, 40 tugas, dan peringatan data pribadi", unduh[0] === "TOKEN-UJI" && unduh[1] === 7 && /Pembagian Verifikasi Ulang Tahap percobaan 1 \(paket 7\)\.xlsx/.test(await teks("#vua-isi")) && /40 tugas/.test(await teks("#vua-isi")) && /jangan disebarkan/.test(await teks("#vua-isi")), JSON.stringify(unduh));
  await klik('[data-aksi="cek"]');
  await tungguSampai("/sama persis/.test(document.getElementById('vua-isi').textContent)", "hasil cek pembagian");
  cek("ADMIN: 'Cek pembagian' memanggil server dan menampilkan hasil", hitung("cekPembagianBatchUlang") === 1);
  await klik('[data-aksi="batal"]');
  cek("ADMIN: 'Batalkan sisa' meminta konfirmasi di halaman dan BELUM memanggil server", (await ada('[data-aksi="batal-ya"]')) && hitung("batalkanBatchUlang") === 0 && /tetap tersimpan/.test(await teks("#vua-isi")));
  await klik('[data-aksi="batal-tidak"]');
  cek("ADMIN: memilih 'Tidak' menutup konfirmasi tanpa memanggil server", !(await ada('[data-aksi="batal-ya"]')) && hitung("batalkanBatchUlang") === 0);
  sasaranGagal = true;   // penyegaran badge sesudah pembatalan gagal: angka lama tetap tampil dengan tanda, tidak diam-diam basi
  await klik('[data-aksi="batal"]'); await klik('[data-aksi="batal-ya"]');
  // paket yang dibatalkan DISEMBUNYIKAN dari daftar (tugas selesai di dalamnya tidak boleh dihapus, jadi paketnya tetap ada); tombol menampilkannya kembali
  await tungguSampai("/1 paket dibatalkan disembunyikan/.test(document.getElementById('vua-isi').textContent)", "paket dibatalkan disembunyikan");
  cek("ADMIN: paket yang baru dibatalkan hilang dari daftar dan ada tombol 'Tampilkan paket dibatalkan'", !/DIBATALKAN/.test(await teks("#vua-isi")) && (await ada('[data-aksi="toggle-batal"]')), await teks("#vua-isi"));
  await klik('[data-aksi="toggle-batal"]');
  await tungguSampai("/DIBATALKAN/.test(document.getElementById('vua-isi').textContent)", "paket dibatalkan tampil lagi");
  cek("ADMIN: 'Tampilkan paket dibatalkan' memunculkan paketnya (status DIBATALKAN) dan tombol berubah jadi 'Sembunyikan'", /Sembunyikan paket dibatalkan/.test(await teks("#vua-isi")));
  await tungguSampai("/Gagal memperbarui/.test(document.getElementById('vua-badge-cat').textContent)", "tanda gagal memperbarui").catch(() => {});
  cek("ADMIN: penyegaran badge gagal -> angka terakhir tetap tampil dan catatan 'Gagal memperbarui ... mungkin belum terbaru' muncul", /Gagal memperbarui \(galat uji\)/.test(await teks("#vua-badge-cat")) && /Sedang ditugaskan\s*724/.test(await teks("#vua-badge")), await teks("#vua-badge-cat"));
  sasaranGagal = false;
  cek("ADMIN: konfirmasi 'Ya' membatalkan paket dan status berubah", hitung("batalkanBatchUlang") === 1);

  await klik('[data-tab="koreksi"]');
  await tungguSampai("/Siti Aminah/.test(document.getElementById('vua-isi').textContent)", "daftar koreksi");
  cek("ADMIN: daftar koreksi menampilkan pemeriksa, perubahan status, dan alasan", /verif_raja_rizki/.test(await teks("#vua-isi")) && /Buku rekening tidak terbaca/.test(await teks("#vua-isi")) && /MS/.test(await teks("#vua-isi")));
  cek("ADMIN: koreksi yang statusnya sudah diubah lagi oleh Admin TIDAK menawarkan 'Batalkan' (hanya yang masih sama dengan hasil koreksi)", (await js("document.querySelectorAll('#djpm-vua-overlay [data-aksi=\"batal-koreksi\"]').length")) === 1 && /status sudah diubah lagi oleh Admin/.test(await teks("#vua-isi")), await teks("#vua-isi"));
  await klik('[data-aksi="batal-koreksi"]');
  await klik('[data-aksi="batal-koreksi-ya"]');
  cek("ADMIN: batalkan koreksi tanpa alasan ditolak di layar dan tidak memanggil server", hitung("batalkanKoreksiUlang") === 0 && /Alasan pembatalan wajib/.test(await teks("#vua-isi")));
  await js("(() => { const t = document.getElementById('vua-alasan-batal'); t.value = 'Kelurahan melapor berkas lengkap'; t.dispatchEvent(new Event('input', {bubbles:true})); return true; })()");
  await klik('[data-aksi="batal-koreksi-ya"]');
  await tungguSampai("/dibatalkan/.test(document.getElementById('vua-isi').textContent) && !document.querySelector('[data-aksi=\"batal-koreksi\"]')", "koreksi dibatalkan");
  const bk = terakhir("batalkanKoreksiUlang").args;
  cek("ADMIN: pembatalan mengirim id tugas dan alasan; baris menjadi 'dibatalkan'", bk[1] === 9 && /Kelurahan melapor/.test(bk[2]), JSON.stringify(bk));

  await klik('[data-tab="buat"]');
  for (const lebar of [320, 360, 390]) {
    const hp = await ukurPonsel(OVA, ".vua-kotak", lebar);
    cek("PONSEL " + lebar + "px (Admin): panel pas, tanpa elemen terpotong atau gulir horizontal halaman", hp.kotakKanan <= hp.W + 1 && hp.lewat.length === 0 && !hp.gulirHalaman && !hp.gulirOverlay, JSON.stringify(hp));
  }
  await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(path.join(os.tmpdir(), "djpm_verifikasi_ulang_admin.png"), Buffer.from(s.result.data, "base64")));
  await js("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); true");
  cek("ADMIN: tombol Escape menutup panel", !(await ada("#djpm-vua-overlay")));

  // Pergantian akun tanpa muat ulang
  await js("dataPengguna.role = 'VERIFIKATOR'; true"); await tidur(2600);
  cek("Pergantian akun (UTAMA -> VERIFIKATOR) tanpa muat ulang: tombol Admin dihapus", !(await ada("#btn-verifikasi-ulang")));
  await js("dataPengguna.role = 'UTAMA'; true");

  // ============================ PERAN LAIN (regresi) ============================
  await masuk("GURU MAGHRIB MENGAJI");
  cek("GMM (regresi): tidak memuat modul verifikasi ulang apa pun dan tidak ada tombol/pil", !skripDimuat.some((u) => /app-tugas-ulang|app-verifikasi-ulang-admin/.test(u)) && !(await ada("#btn-verifikasi-ulang")) && !(await ada("#djpm-tul-pil")));

  cek("Tidak ada galat JavaScript selama pengujian", galatJs.length === 0, galatJs.slice(0, 3).join(" | "));
} catch (err) { console.log("GALAT HARNESS: " + err.message); gagal++; }
finally { try { ws && ws.close(); } catch { /* abaikan */ } chrome.kill(); await tidur(500); try { fs.rmSync(profil, { recursive: true, force: true }); } catch { /* abaikan */ } }
console.log(gagal === 0 ? "\nSEMUA LULUS" : `\n${gagal} GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
