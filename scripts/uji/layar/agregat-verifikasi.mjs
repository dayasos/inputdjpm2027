// Panel agregat hasil kerja verifikator di layar (server TIRUAN): Verifikator, Koordinator, Admin Utama. Rencana: plans/plan-agregat-verifikator.md
// Jalankan: node scripts/uji/layar/agregat-verifikasi.mjs   (Chrome + npx vite --port 3123 --strictPort)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AKSI_VERIFIKATOR } from "../../../supabase/functions/api/_shared/gerbangPeran.ts";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:3123";
const PORT = 9343;
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=1100,1000", "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map(); const galatJs = []; const skripDimuat = [];
const aksiDipanggil = new Map();   // nama aksi -> jumlah; dicatat PER PERAN (di-reset tiap masuk)
const panggilan = [];

let peran = "VERIFIKATOR";
let detail = null;
let tundaVerifikasiMs = 0;
let ringkasanGagal = false, ringkasanTotal = 12, tundaRingkasanMs = 0;
let nomorBaris = 300;   // jawaban detail di-cache klien 2 menit per nomor baris
const CORS = [{ name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Headers", value: "*" }, { name: "Access-Control-Allow-Methods", value: "*" }];

function buatDetail({ status = "Proses Verifikasi", ket = "", tgl = "", oleh = "", nama = "", layanan = "IMAM MASJID" } = {}) {
  const d = new Array(60).fill("");
  Object.assign(d, { 0: 1, 1: "SITI AMINAH", 2: "1271010101900001", 3: "PEREMPUAN", 4: "MEDAN", 5: "04-02-1989", 6: "JL X NO 1", 7: layanan, 8: "MASJID AL IKHLAS", 9: "JL. MARELAN RAYA NO 5",
    10: "MEDAN MARELAN", 11: "RUGEMUK", 12: "SITI AMINAH", 13: "12345678901234", 14: "SUMUT", 15: "0812345678", 16: "YA", 31: "", 32: status, 33: ket, 34: tgl, 35: oleh, 51: false, 54: nama });
  return d;
}
let modeKoordinator = false, agregatGagal = false, agregatKosong = false, agregatNamaJahat = false;
function datesAntara(dari, sampai) { const out = []; const a = new Date(dari + "T00:00:00Z"); const b = new Date(sampai + "T00:00:00Z"); for (let d = a; d <= b && out.length < 45; d = new Date(d.getTime() + 86400000)) out.push(d.toISOString().slice(0, 10)); return out; }
const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
function buatAgregat(args) {
  const [, dari, sampai, tim] = args;
  const cakupan = peran === "UTAMA" ? "SEMUA" : (modeKoordinator ? "TIM" : "SAYA");
  const perHari = datesAntara(dari, sampai).map((t, i) => { const dow = new Date(t + "T12:00:00Z").getUTCDay(); const lib = dow === 0 || dow === 6; return { tanggal: t, hari: NAMA_HARI[dow], libur: lib, total: lib ? 3 : 10, jamKerja: lib ? 0 : 8, luarJamKerja: lib ? 3 : 2 }; });
  const o = (u, n, t, k, tot, kerja, luar, koord = false) => ({ username: u, namaLengkap: n, tim: t, koordinator: koord, aktif: true, total: tot, jamKerja: kerja, luarJamKerja: luar, dikoreksi: Math.round(tot / 20), memenuhiSyarat: Math.round(tot * 0.7), berkasTidakLengkap: Math.round(tot * 0.2), tidakMemenuhiSyarat: tot - Math.round(tot * 0.7) - Math.round(tot * 0.2) });
  const ringkasan = agregatKosong ? { total: 0, jamKerja: 0, luarJamKerja: 0, memenuhiSyarat: 0, berkasTidakLengkap: 0, tidakMemenuhiSyarat: 0, sekarangMemenuhiSyarat: 0, sekarangBerkasTidakLengkap: 0, sekarangTidakMemenuhiSyarat: 0, sekarangLainnya: 0, dikoreksi: 0 } : { total: 142, jamKerja: 96, luarJamKerja: 46, memenuhiSyarat: 101, berkasTidakLengkap: 29, tidakMemenuhiSyarat: 12, sekarangMemenuhiSyarat: 105, sekarangBerkasTidakLengkap: 30, sekarangTidakMemenuhiSyarat: 5, sekarangLainnya: 2, dikoreksi: 8 };
  const nama = agregatNamaJahat ? '<img src=x onerror="window.__xss=1">Budi' : "Budi Santoso";
  const dasar = { sukses: true, cakupan, tim: cakupan === "SEMUA" ? (tim || null) : (cakupan === "TIM" ? "II" : "III"), saya: "VERIF_ANDI", rentang: { dari, sampai, jumlahHari: perHari.length }, ringkasan, perHari, mulaiDihitung: "2026-11-12", diperbaruiPada: "2026-11-12T12:00:00Z" };
  if (cakupan === "SAYA") return { ...dasar, perOrang: [o("verif_andi", "Andi Saputra", "III", 0, 142, 96, 46)] };
  if (cakupan === "TIM") return { ...dasar, perOrang: [o("verif_andi", "Andi Saputra", "II", 0, 70, 50, 20, true), o("verif_budi", nama, "II", 0, 40, 30, 10), o("verif_citra", "Citra", "II", 0, 32, 16, 16)] };
  return { ...dasar, perOrang: [o("verif_zz4", "Zed Empat", "IV", 0, 90, 60, 30), o("verif_budi", nama, "II", 0, 50, 30, 20), o("verif_baru", "", null, 0, 32, 26, 6), o("verif_b2", "Bela Koordinator", "II", 0, 41, 31, 10, true), o("verif_andi", "Andi Saputra", "I", 0, 60, 40, 20, true), o("verif_a2", "Ani", "I", 0, 20, 10, 10), o("verif_c1", "Citra Tiga", "III", 0, 5, 5, 0)],
    perTim: [{ tim: "I", anggota: 8, total: 60, jamKerja: 40, luarJamKerja: 20 }, { tim: "II", anggota: 7, total: 50, jamKerja: 30, luarJamKerja: 20 }, { tim: "III", anggota: 8, total: 0, jamKerja: 0, luarJamKerja: 0 }, { tim: "IV", anggota: 8, total: 0, jamKerja: 0, luarJamKerja: 0 }, { tim: "-", anggota: 1, total: 32, jamKerja: 26, luarJamKerja: 6 }],
    luarTim: { total: 6, jamKerja: 4, luarJamKerja: 2 } };
}
function jawab(aksi, args) {
  if (aksi === "pulihkanSesi") return { sukses: true, token: "TOKEN-UJI", username: peran === "VERIFIKATOR" ? "verif_andi" : "petugas", role: peran, kecamatan: peran === "GURU MAGHRIB MENGAJI" ? "MEDAN MARELAN" : "", userId: "", profileBelumDiisi: false, profil: { namaLengkap: "ANDI SAPUTRA", nomorHp: "0800", jabatan: "Verifikator" } };
  if (aksi === "getMasterLayanan") return { kecamatan: ["IMAM MASJID"], kemenag: ["GURU MAGHRIB MENGAJI"] };
  if (aksi === "getRingkasanVerifikasiSaya") return { sukses: true, total: 12, hariIni: 3, memenuhiSyarat: 8, berkasTidakLengkap: 3, tidakMemenuhiSyarat: 1 };
  if (aksi === "getAgregatVerifikasi") { panggilan.push({ aksi, args }); return agregatGagal ? { sukses: false, pesan: "Galat uji dari server." } : buatAgregat(args); }
  if (aksi === "unduhRekapLemburVerifikasi") { panggilan.push({ aksi, args }); return { sukses: true, base64: "UEsDBA==", namaFile: "Rekap Verifikasi uji.xlsx" }; }
  return { sukses: true };
}
async function dialihkan(p) {
  const url = p.request.url;
  if (!/supabase\.co|\/api\/gas/.test(url)) { await kirim("Fetch.continueRequest", { requestId: p.requestId }); return; }
  if (p.request.method === "OPTIONS") { await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 204, responseHeaders: CORS, body: "" }); return; }
  let aksi = "?", args = []; try { const b = JSON.parse(p.request.postData || "{}"); aksi = b.action; args = b.args || []; } catch { /* abaikan */ }
  aksiDipanggil.set(aksi, (aksiDipanggil.get(aksi) || 0) + 1);
  const jawaban = jawab(aksi, args);   // dihitung SAAT permintaan tiba, sebelum penundaan (seperti server sungguhan)
  if (aksi === "getRingkasanVerifikasiSaya" && tundaRingkasanMs) await tidur(tundaRingkasanMs);
  if (aksi === "verifikasiSatuData" && tundaVerifikasiMs) await tidur(tundaVerifikasiMs);   // memperlihatkan keadaan "menyimpan..." (tampilan optimistik)
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

async function masuk(peranBaru) {
  peran = peranBaru; aksiDipanggil.clear(); skripDimuat.length = 0;
  await kirim("Page.navigate", { url: BASE + "/" });
  await tungguSampai("!!document.getElementById('tab-rekap') && document.readyState==='complete'", "halaman siap");
  await js(`sessionStorage.setItem('dana_jasa_sesi', JSON.stringify({ token: 'TOKEN-UJI', username: ${JSON.stringify(peranBaru === "VERIFIKATOR" ? "verif_andi" : "petugas")}, role: ${JSON.stringify(peranBaru)}, kecamatan: ${JSON.stringify(peranBaru === "GURU MAGHRIB MENGAJI" ? "MEDAN MARELAN" : "")}, userId: '', namaLengkap: 'ANDI SAPUTRA' })); true`);
  skripDimuat.length = 0;
  await kirim("Page.reload");
  await tungguSampai("!!document.getElementById('tab-rekap') && document.readyState==='complete'", "halaman siap setelah muat ulang");
  await tungguSampai("document.getElementById('modal-login') && document.getElementById('modal-login').classList.contains('hidden')", "sesi tiruan diterima", 60);
  await tidur(2600);   // beri waktu skrip khusus peran dimuat dan pembungkus hak akses berjalan
}
const tampil = (idEl) => js(`(() => { const e = document.getElementById(${JSON.stringify(idEl)}); if (!e) return 'tidak ada'; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return (!e.classList.contains('hidden') && cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0) ? 'tampil' : 'tersembunyi'; })()`);
async function bukaDetail(opsi) {
  detail = buatDetail(opsi);
  await js("window.tampilkanDetailKeModalOnDemand(" + (++nomorBaris) + "); true");
  await tungguSampai("!document.getElementById('modal-detail-penerima').classList.contains('hidden') && /SITI AMINAH/.test(document.getElementById('isi-konten-detail').textContent)", "detail termuat");
  await tidur(900);   // templat alasan dimuat asinkron
  return await js(`(() => { const isi = document.getElementById('isi-konten-detail'); const tombolEdit = document.getElementById('btn-edit-detail');
    const panel = Array.from(isi.querySelectorAll('p')).find((p) => /^Verifikasi/.test(p.textContent.trim()));
    const kotakStatus = isi.querySelector('.mt-2.rounded-lg');
    const chips = Array.from(isi.querySelectorAll('.ac-chips button, .ac-chip')).map((x) => x.textContent.trim());
    const tombolAc = Array.from(isi.querySelectorAll('.ac-kepala button')).map((x) => x.textContent.trim());
    return { judulPanel: panel ? panel.textContent.trim() : null, editTampil: !!tombolEdit && !tombolEdit.classList.contains('hidden'),
      tombol: ['btn-tandai-memenuhi', 'btn-tandai-berkas-tidak-lengkap', 'btn-tandai-tidak-memenuhi', 'btn-tandai-sudah-diperbaiki'].filter((i) => document.getElementById(i)),
      chips, tombolAc, kotakStatus: kotakStatus ? kotakStatus.textContent.replace(/\\s+/g, ' ').trim() : null }; })()`);
}

const OV = "document.getElementById('djpm-agr-overlay')";
const UKUR_PONSEL = "(() => { const o = document.getElementById('djpm-agr-overlay'); const W = document.documentElement.clientWidth; const kotak = o.querySelector('.agr-kotak').getBoundingClientRect(); const lewat = []; o.querySelectorAll('.agr-kartu, .agr-aturan, .agr-periode, .agr-pil-baris, .agr-kepala, .agr-bagan').forEach((e) => { const r = e.getBoundingClientRect(); if (r.right > W + 1 || r.left < -1) lewat.push((e.className || e.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right)); }); return { W, kotakKanan: Math.round(kotak.right), gulirHalaman: document.documentElement.scrollWidth > W + 1, gulirOverlay: o.scrollWidth > o.clientWidth + 1, lewat }; })()";
const adaPanel = () => js("!!" + OV);
const teksPanel = () => js("(" + OV + " ? " + OV + ".textContent.replace(/\\s+/g, ' ') : '')");
const hitung = (a) => panggilan.filter((x) => x.aksi === a).length;
const terakhir = (a) => panggilan.filter((x) => x.aksi === a).pop();
const klik = (sel) => js("(() => { const e = document.querySelector(" + JSON.stringify(sel) + "); if (!e) return false; e.click(); return true; })()");
async function tungguPanel(maks = 40) { await tungguSampai("!!" + OV + " && !" + OV + ".textContent.includes('Memuat')", "panel agregat termuat", maks); }
async function cekPonselTerbuka(label, lebar = 360) {
  await kirim("Emulation.setDeviceMetricsOverride", { width: lebar, height: 844, deviceScaleFactor: 2, mobile: true });
  await tidur(500);
  const hp = await js(UKUR_PONSEL);
  cek("PONSEL " + lebar + "px (" + label + "): panel pas di layar, tanpa kartu/teks terpotong dan tanpa gulir horizontal halaman", hp.kotakKanan <= hp.W + 1 && hp.lewat.length === 0 && !hp.gulirHalaman && !hp.gulirOverlay, JSON.stringify(hp));
  await kirim("Emulation.clearDeviceMetricsOverride");
  await tidur(300);
}
async function tutupPanel() { await js("(" + OV + " && " + OV + ".remove()); true"); }

try {
  await sambung();
  await kirim("Runtime.enable"); await kirim("Page.enable"); await kirim("Network.enable");
  await kirim("Fetch.enable", { patterns: [{ urlPattern: "*supabase.co*" }, { urlPattern: "*api/gas*" }] });

  // ============================ VERIFIKATOR biasa (cakupan SAYA) ============================
  modeKoordinator = false;
  await masuk("VERIFIKATOR");
  cek("VERIFIKATOR: modul agregat dimuat (dan hanya untuk peran berhak)", skripDimuat.some((u) => /app-agregat-verifikasi\.js/.test(u)), JSON.stringify(skripDimuat.map((u) => u.split("/").pop())));
  cek("VERIFIKATOR: tautan 'Lihat hasil kerja' ada di badge", (await js("!!document.querySelector('#djpm-badge-verifikasi [data-agr]')")) === true);
  cek("VERIFIKATOR: tidak ada tombol 'Agregat Verifikasi' di toolbar (khusus Admin Utama)", (await js("!document.getElementById('btn-agregat-verifikasi')")) === true);
  await klik("#djpm-badge-verifikasi [data-agr]");
  await tungguPanel();
  let teks = await teksPanel();
  const harapan = await js("djpmAgregatVerifikasi.rentangPreset('bulan')");
  const q1 = terakhir("getAgregatVerifikasi");
  cek("SAYA: panel terbuka berjudul 'Hasil Kerja Saya'", /Hasil Kerja Saya/.test(teks), teks.slice(0, 120));
  cek("SAYA: permintaan memuat token sesi, rentang bulan ini (WIB), dan tim kosong", !!q1 && q1.args[0] === "TOKEN-UJI" && q1.args[1] === harapan.dari && q1.args[2] === harapan.sampai && q1.args[3] === "", JSON.stringify({ q1, harapan }));
  cek("SAYA: angka dari server tampil (142 data; 96 jam kerja; 46 luar jam kerja)", /Data diverifikasi\s*142/.test(teks) && /Jam kerja\s*96/.test(teks) && /Luar jam kerja \(lembur\)\s*46/.test(teks), teks.slice(0, 300));
  cek("SAYA: rincian per status tampil", /Memenuhi Syarat 101/.test(teks) && /Berkas Tidak Lengkap 29/.test(teks) && /Tidak Memenuhi Syarat 12/.test(teks));
  cek("SAYA: dua baris status: 'Hasil verifikator' (dasar hitungan) dan 'Status data sekarang' (informasi), lengkap dengan 'Dikoreksi Admin 8' dan catatan bahwa lembur tidak berubah",
    /Hasil verifikator\s*Memenuhi Syarat\s*101/.test(teks) && /Status data sekarang\s*Memenuhi Syarat\s*105/.test(teks) && /Tidak Memenuhi Syarat\s*5/.test(teks) && /Lainnya\s*2/.test(teks) && /Dikoreksi Admin\s*8/.test(teks) && /lembur dihitung dari hasil verifikator/.test(teks), teks.slice(300, 900));
  cek("SAYA: aturan jam kerja selalu terlihat", /Senin.Kamis 08\.00.16\.30/.test(teks) && /Jumat 08\.00.17\.00/.test(teks));
  cek("SAYA: TANPA tabel anggota/tim (hanya dirinya)", !/Anggota tim/.test(teks) && !/Semua verifikator/.test(teks) && !/Per tim/.test(teks));
  await cekPonselTerbuka("verifikator biasa / SAYA");
  cek("SAYA: tabel harian dan bagan ada", /Rincian harian/.test(teks) && (await js("!!" + OV + ".querySelector('.agr-bagan')")) === true);
  await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(path.join(os.tmpdir(), "djpm_agregat_saya.png"), Buffer.from(s.result.data, "base64")));

  // periode
  const n0 = hitung("getAgregatVerifikasi");
  await klik("button[data-p='hari']");
  await tungguSampai("document.querySelector('#djpm-agr-overlay button[data-p=\"hari\"]').getAttribute('aria-pressed') === 'true'", "chip hari ini");
  await tidur(700);
  const qh = terakhir("getAgregatVerifikasi"), hariIni = await js("djpmAgregatVerifikasi.rentangPreset('hari')");
  cek("Periode 'Hari ini' mengirim permintaan baru dengan dari = sampai = hari ini (WIB)", hitung("getAgregatVerifikasi") === n0 + 1 && qh.args[1] === hariIni.dari && qh.args[2] === hariIni.sampai, JSON.stringify(qh));
  await klik("button[data-p='lalu']"); await tidur(700);
  const ql = terakhir("getAgregatVerifikasi"), lalu = await js("djpmAgregatVerifikasi.rentangPreset('lalu')");
  cek("Periode 'Bulan lalu' = tanggal 1 sampai akhir bulan lalu", ql.args[1] === lalu.dari && ql.args[2] === lalu.sampai && /^\d{4}-\d{2}-01$/.test(lalu.dari), JSON.stringify({ ql, lalu }));
  await klik("button[data-p='rentang']"); await tidur(300);
  await js("document.getElementById('agr-dari').value = '2026-11-09'; document.getElementById('agr-sampai').value = '2026-11-15'; true");
  await klik("#agr-terapkan"); await tidur(700);
  const qr = terakhir("getAgregatVerifikasi");
  cek("Rentang sendiri: tanggal yang diisi terkirim apa adanya", qr.args[1] === "2026-11-09" && qr.args[2] === "2026-11-15", JSON.stringify(qr));
  cek("Rentang sendiri: bagan harian memuat 7 hari", (await js(OV + ".querySelectorAll('.agr-hari').length")) === 7);

  // Excel
  await klik("#agr-unduh"); await tidur(900);
  const qx = terakhir("unduhRekapLemburVerifikasi");
  cek("Unduh Excel memanggil unduhRekapLemburVerifikasi dengan token dan periode yang sedang tampil", !!qx && qx.args[0] === "TOKEN-UJI" && qx.args[1] === "2026-11-09" && qx.args[2] === "2026-11-15", JSON.stringify(qx));
  cek("Tombol Unduh Excel kembali aktif sesudah selesai", (await js("!document.getElementById('agr-unduh').disabled")) === true);

  // Esc menutup; fokus kembali
  await js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
  await tidur(200);
  cek("Tombol Esc menutup panel", (await adaPanel()) === false);

  // keadaan kosong dan galat
  agregatKosong = true;
  await klik("#djpm-badge-verifikasi [data-agr]"); await tungguPanel();
  cek("Keadaan kosong: pesan 'Belum ada data yang diberi hasil verifikasi' dan angka 0", /Belum ada data yang diberi hasil verifikasi/.test(await teksPanel()) && /Data diverifikasi\s*0/.test(await teksPanel()));
  await tutupPanel(); agregatKosong = false;
  agregatGagal = true;
  await klik("#djpm-badge-verifikasi [data-agr]");
  await tungguSampai("!!document.getElementById('agr-ulang')", "tombol coba lagi", 40);
  cek("Galat server: pesan galat dan tombol 'Coba lagi' tampil (tanpa angka palsu)", /Galat uji dari server/.test(await teksPanel()) && !/Data diverifikasi/.test(await teksPanel()));
  agregatGagal = false;
  await klik("#agr-ulang"); await tungguPanel();
  cek("'Coba lagi' memulihkan tampilan setelah server normal", /Data diverifikasi\s*142/.test(await teksPanel()));
  await tutupPanel();

  const luarDaftar = [...aksiDipanggil.keys()].filter((a) => !AKSI_VERIFIKATOR.has(a));
  cek("VERIFIKATOR: seluruh aksi yang dipanggil ada di daftar-putih server", luarDaftar.length === 0, luarDaftar.join(", "));

  // ============================ KOORDINATOR (cakupan TIM) ============================
  modeKoordinator = true; agregatNamaJahat = true;
  await masuk("VERIFIKATOR");
  await klik("#djpm-badge-verifikasi [data-agr]"); await tungguPanel();
  teks = await teksPanel();
  cek("TIM: panel berjudul 'Hasil Tim II' dengan tabel anggota", /Hasil Tim II/.test(teks) && /Anggota tim/.test(teks), teks.slice(0, 100));
  cek("TIM: tiga anggota tampil; baris sendiri diberi tanda 'saya' dan 'koordinator'", (await js(OV + ".querySelectorAll('tbody tr').length")) >= 3 && (await js("!!" + OV + ".querySelector('tr.agr-saya')")) === true && /koordinator/.test(teks) && /saya/.test(teks));
  cek("TIM: tanpa kartu per tim (itu khusus Admin Utama)", !/Per tim/.test(teks));
  cek("KEAMANAN: nama berisi HTML tidak diterjemahkan jadi elemen (tidak ada <img>, tidak ada eksekusi)", (await js("!" + OV + ".querySelector('img') && !window.__xss")) === true);
  await cekPonselTerbuka("koordinator / TIM");
  await tutupPanel(); agregatNamaJahat = false;

  // ============================ ADMIN UTAMA (cakupan SEMUA) ============================
  await masuk("UTAMA");
  cek("UTAMA: modul agregat dimuat dan tombol 'Agregat Verifikasi' muncul tepat sesudah tombol toolbar", (await js("!!document.getElementById('btn-agregat-verifikasi') && !!document.getElementById('btn-agregat-verifikasi').previousElementSibling")) === true);
  cek("UTAMA: badge verifikator TIDAK ada", (await js("!document.getElementById('djpm-badge-verifikasi')")) === true);
  await klik("#btn-agregat-verifikasi"); await tungguPanel();
  teks = await teksPanel();
  cek("SEMUA: panel berjudul 'Agregat Semua Tim' dengan kartu per tim dan tabel semua verifikator", /Agregat Semua Tim/.test(teks) && /Per tim/.test(teks) && /Semua verifikator/.test(teks), teks.slice(0, 120));
  cek("SEMUA: kartu Tim I, II, III, IV dan 'Tanpa tim' tampil", (await js("Array.from(" + OV + ".querySelectorAll('button[data-tim]')).map((b) => b.getAttribute('data-tim')).join(',')")) === "I,II,III,IV,-" && /Tanpa tim/.test(teks), teks.slice(0, 400));
  cek("SEMUA: baris Admin Utama tampil sebagai informasi terpisah (tidak dihitung ke tim)", /Admin Utama \(informasi, tidak dihitung ke tim\)/.test(teks));
  cek("SEMUA: pada keadaan awal (semua tim) tombol 'Tampilkan semua tim' TIDAK ada", (await js("!" + OV + ".querySelector('button[data-semua]')")) === true);
  const urutan = await js("Array.from(" + OV + ".querySelectorAll('tbody tr')).map((r) => (r.cells[0].querySelector('.agr-tag') || {}).textContent)");
  cek("SEMUA: tabel verifikator DIURUTKAN per tim (I, II, III, IV, tanpa tim), koordinator di atas tiap tim, lalu username", JSON.stringify(urutan.slice(0, 7)) === JSON.stringify(["verif_andi", "verif_a2", "verif_b2", "verif_budi", "verif_c1", "verif_zz4", "verif_baru"]), JSON.stringify(urutan));
  cek("SEMUA: garis pemisah di awal tiap tim (bukan di baris pertama)", (await js(OV + ".querySelectorAll('tr.agr-awal-tim').length")) === 4 && (await js("!" + OV + ".querySelector('tbody tr:first-child').classList.contains('agr-awal-tim')")) === true);
  cek("SEMUA: kolom 'Dikoreksi' ada di tabel dan menampilkan jumlah per verifikator (Andi = 3)", (await js("(() => { const th = Array.from(" + OV + ".querySelector('.agr-gulir table').querySelectorAll('thead th')).map((x) => x.textContent); const tr = Array.from(" + OV + ".querySelectorAll('tbody tr')).find((r) => /verif_andi/.test(r.textContent)); return th[th.length - 1] === 'Dikoreksi' && !!tr && tr.cells[tr.cells.length - 1].textContent.trim() === '3'; })()")) === true);
  cek("SEMUA: akun tanpa tim tampil dengan strip", (await js("Array.from(" + OV + ".querySelectorAll('tbody tr')).some((r) => /verif_baru/.test(r.textContent) && /–/.test(r.cells[1].textContent))")) === true);
  await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(path.join(os.tmpdir(), "djpm_agregat_semua.png"), Buffer.from(s.result.data, "base64")));
  await klik("button[data-tim='II']"); await tidur(800);
  const qt = terakhir("getAgregatVerifikasi");
  cek("SEMUA: mengetuk kartu Tim II mengirim saringan tim 'II' ke server (server yang menyaring)", qt.args[3] === "II", JSON.stringify(qt));
  cek("SEMUA: judul menjadi 'Agregat Tim II' dan kartu terpilih ditandai", /Agregat Tim II/.test(await teksPanel()) && (await js(OV + ".querySelector('button[data-tim=\"II\"]').getAttribute('aria-pressed')")) === "true");
  await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(path.join(os.tmpdir(), "djpm_agregat_tim_terpilih.png"), Buffer.from(s.result.data, "base64")));
  await cekPonselTerbuka("Admin Utama dengan saringan tim aktif + tombol semua tim");
  cek("SEMUA: fokus keyboard tetap di kartu tim yang baru diketuk (tidak jatuh ke halaman)", (await js("document.activeElement && document.activeElement.getAttribute('data-tim')")) === "II", String(await js("document.activeElement && document.activeElement.outerHTML.slice(0, 80)")));
  cek("SEMUA: tombol 'Tampilkan semua tim' muncul selama satu tim dipilih", (await js("!!" + OV + ".querySelector('button[data-semua]')")) === true && /Tampilkan semua tim/.test(await teksPanel()));
  await klik("button[data-semua]"); await tidur(800);
  cek("SEMUA: sesudah 'Tampilkan semua tim', fokus pindah ke kartu tim (tombol yang ditekan sudah hilang)", (await js("!!document.activeElement && document.activeElement.hasAttribute('data-tim')")) === true, String(await js("document.activeElement && document.activeElement.outerHTML.slice(0, 80)")));
  cek("SEMUA: tombol 'Tampilkan semua tim' mengembalikan ke semua tim (saringan kosong, judul semula, tombol hilang)", terakhir("getAgregatVerifikasi").args[3] === "" && /Agregat Semua Tim/.test(await teksPanel()) && (await js("!" + OV + ".querySelector('button[data-semua]')")) === true, JSON.stringify(terakhir("getAgregatVerifikasi")));
  await klik("button[data-tim='II']"); await tidur(800);   // pilih lagi untuk uji ketuk-ulang di bawah
  await klik("button[data-tim='II']"); await tidur(800);
  cek("SEMUA: mengetuk lagi mengembalikan ke semua tim (saringan kosong)", terakhir("getAgregatVerifikasi").args[3] === "");
  await klik("#agr-unduh"); await tidur(900);
  cek("SEMUA: Unduh Excel mengirim token, periode, dan saringan tim", !!terakhir("unduhRekapLemburVerifikasi") && terakhir("unduhRekapLemburVerifikasi").args[0] === "TOKEN-UJI");
  await tutupPanel();

  // ============ Tampilan PONSEL: tidak boleh ada isi terpotong di kanan / gulir horizontal (laporan user: kartu dan teks terpotong) ============
  for (const lebar of [320, 360, 390]) {
    await kirim("Emulation.setDeviceMetricsOverride", { width: lebar, height: 844, deviceScaleFactor: 2, mobile: true });
    await tidur(500);
    await klik("#btn-agregat-verifikasi"); await tungguPanel();
    await tidur(300);
    const hp = await js("(() => { const o = document.getElementById('djpm-agr-overlay'); const W = document.documentElement.clientWidth; const kotak = o.querySelector('.agr-kotak').getBoundingClientRect(); const lewat = []; o.querySelectorAll('.agr-kartu, .agr-aturan, .agr-periode, .agr-pil-baris, .agr-kepala, .agr-bagan').forEach((e) => { const r = e.getBoundingClientRect(); if (r.right > W + 1 || r.left < -1) lewat.push((e.className || e.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right)); }); return { W, kotakKanan: Math.round(kotak.right), gulirHalaman: document.documentElement.scrollWidth > W + 1, gulirOverlay: o.scrollWidth > o.clientWidth + 1, lewat }; })()");
    cek("PONSEL " + lebar + "px: panel pas di layar, tanpa kartu/teks terpotong dan tanpa gulir horizontal halaman", hp.kotakKanan <= hp.W + 1 && hp.lewat.length === 0 && !hp.gulirHalaman && !hp.gulirOverlay, JSON.stringify(hp));
    cek("PONSEL " + lebar + "px: tabel verifikator tetap dapat digulir ke samping di dalam wadahnya (bukan memperlebar halaman)", (await js("(() => { const g = document.querySelector('#djpm-agr-overlay .agr-gulir'); return !!g && g.scrollWidth > g.clientWidth; })()")) === true);
    if (lebar === 360) await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(path.join(os.tmpdir(), "djpm_agregat_hp.png"), Buffer.from(s.result.data, "base64")));
    await tutupPanel();
    await kirim("Emulation.clearDeviceMetricsOverride");
    await tidur(300);
  }

  // Pergantian akun tanpa muat ulang: Admin Utama -> VERIFIKATOR: tombol toolbar harus hilang
  await js("dataPengguna.role = 'VERIFIKATOR'; true");
  await tidur(2600);
  cek("Pergantian akun tanpa muat ulang (UTAMA -> VERIFIKATOR): tombol 'Agregat Verifikasi' di toolbar dihapus", (await js("!document.getElementById('btn-agregat-verifikasi')")) === true);
  await js("dataPengguna.role = 'UTAMA'; true");

  // ============================ GMM (regresi): tidak ada akses ============================
  await masuk("GURU MAGHRIB MENGAJI");
  cek("GMM (regresi): modul agregat TIDAK dimuat; tidak ada tombol maupun badge", !skripDimuat.some((u) => /app-agregat-verifikasi\.js/.test(u)) && (await js("!document.getElementById('btn-agregat-verifikasi') && !document.getElementById('djpm-badge-verifikasi') && typeof window.bukaAgregatVerifikasi === 'undefined'")) === true);

  cek("Tidak ada galat JavaScript selama pengujian", galatJs.length === 0, galatJs.slice(0, 3).join(" | "));
} catch (err) { console.log("GALAT HARNESS: " + err.message); gagal++; }
finally { try { ws && ws.close(); } catch { /* abaikan */ } chrome.kill(); await tidur(500); try { fs.rmSync(profil, { recursive: true, force: true }); } catch { /* abaikan */ } }
console.log(gagal === 0 ? "\nSEMUA LULUS" : `\n${gagal} GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
