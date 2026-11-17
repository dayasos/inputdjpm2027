// Layar koreksi koordinat oleh SISTEM (khusus Admin Utama) di Chrome sungguhan, server TIRUAN.
// Jalankan: node scripts/uji/layar/koreksi-koordinat.mjs   (Chrome + npx vite --port 3123 --strictPort)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:3123";
const PORT = 9354;
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=1200,1000", "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map(); const galatJs = []; const skripDimuat = []; const panggilan = [];
const CORS = [{ name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Headers", value: "*" }, { name: "Access-Control-Allow-Methods", value: "*" }];

let peran = "UTAMA";
let jumlahKandidat = 3;
let gagalServer = false;
const DATA = () => [
  { id: 801, nama: "Budi", kecamatan: "MEDAN AREA", kelurahan: "KOTAMATSUM I", alasan: "Tautan Street View, bukan titik penanda", keterangan: "K1" },
  { id: 802, nama: '<img src=x onerror="window.__xss=1">Sri', kecamatan: "MEDAN DENAI", kelurahan: "BINJAI", alasan: "Tautan hasil pencarian teks, bukan titik penanda", keterangan: "K2" },
  { id: 803, nama: "Ahmad", kecamatan: "MEDAN HELVETIA", kelurahan: "DWI KORA", alasan: "Tautan petunjuk arah (rute), bukan titik lokasi", keterangan: "K3" },
].slice(0, jumlahKandidat);
function jawab(aksi, args) {
  if (aksi === "pulihkanSesi") return { sukses: true, token: "TOKEN-UJI", username: peran === "VERIFIKATOR" ? "verif_x" : "admin", role: peran, kecamatan: "", userId: "", profileBelumDiisi: false, profil: { namaLengkap: "UJI", nomorHp: "0800", jabatan: "X" } };
  if (aksi === "getMasterLayanan") return { kecamatan: ["IMAM MASJID"], kemenag: ["GURU MAGHRIB MENGAJI"] };
  if (aksi === "ambilDataLihatDataHakAkses") return { sukses: true, rows: [] };
  if (aksi === "getPenandaKoordinat") return { sukses: true, v: [], b: [], x: {}, teks: {}, jumlah: {} };
  if (aksi === "getTugasAwalSaya") return { sukses: true, aktif: false, ditugaskan: 0, selesai: 0, sisa: 0, ids: [], daftar: [], halaman: 1, totalHalaman: 1 };
  if (aksi === "getTugasUlangSaya") return { sukses: true, sisa: 0, selesai: 0, semua: [], tugas: [] };
  if (aksi === "koreksiKoordinatBermasalah") {
    if (gagalServer) return { sukses: false, pesan: "Tiruan: server gagal." };
    if (args[1] !== true) return { sukses: true, dryRun: true, jumlah: DATA().length, melebihiBatas: false, data: DATA() };
    return { sukses: true, dryRun: false, diubah: args[2].length, dilewati: [], pesan: args[2].length + " data diubah ke Berkas Tidak Lengkap oleh SISTEM." };
  }
  return { sukses: true };
}
async function dialihkan(p) {
  const url = p.request.url;
  if (!/supabase\.co|\/api\/gas/.test(url)) { await kirim("Fetch.continueRequest", { requestId: p.requestId }); return; }
  if (p.request.method === "OPTIONS") { await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 204, responseHeaders: CORS, body: "" }); return; }
  let aksi = "?", args = []; try { const b = JSON.parse(p.request.postData || "{}"); aksi = b.action; args = b.args || []; } catch { /* abaikan */ }
  panggilan.push({ aksi, args });
  await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200, responseHeaders: [...CORS, { name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify({ result: jawab(aksi, args) })).toString("base64") });
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
const hitung = (a) => panggilan.filter((x) => x.aksi === a);
const ada = (sel) => js("!!document.querySelector(" + JSON.stringify(sel) + ")");
const klik = (sel) => js("(() => { const e = document.querySelector(" + JSON.stringify(sel) + "); if (!e || e.disabled) return false; e.click(); return true; })()");
const teks = (sel) => js("(() => { const e = document.querySelector(" + JSON.stringify(sel) + "); return e ? e.textContent.replace(/\\s+/g, ' ').trim() : ''; })()");

async function masuk(peranBaru) {
  peran = peranBaru;
  await kirim("Page.navigate", { url: "about:blank" }); await tidur(400);
  panggilan.length = 0; skripDimuat.length = 0;
  await kirim("Page.navigate", { url: BASE + "/" });
  await tungguSampai("!!document.getElementById('tab-rekap') && document.readyState==='complete'", "halaman siap");
  await js(`sessionStorage.setItem('dana_jasa_sesi', JSON.stringify({ token: 'TOKEN-UJI', username: ${JSON.stringify(peranBaru === "VERIFIKATOR" ? "verif_x" : "admin")}, role: ${JSON.stringify(peranBaru)}, kecamatan: '', userId: '', namaLengkap: 'UJI' })); true`);
  skripDimuat.length = 0; panggilan.length = 0;
  await kirim("Page.reload");
  await tungguSampai("!!document.getElementById('tab-rekap') && document.readyState==='complete'", "halaman siap setelah muat ulang");
  await tungguSampai("document.getElementById('modal-login') && document.getElementById('modal-login').classList.contains('hidden')", "sesi tiruan diterima", 60);
  await tidur(2800);
}

try {
  await sambung();
  await kirim("Runtime.enable"); await kirim("Page.enable"); await kirim("Network.enable");
  await kirim("Fetch.enable", { patterns: [{ urlPattern: "*supabase.co*" }, { urlPattern: "*api/gas*" }] });

  // ======================== ADMIN UTAMA ========================
  await masuk("UTAMA");
  cek("UTAMA: modul dimuat dan tombol muncul", skripDimuat.some((u) => /app-koreksi-koordinat\.js/.test(u)) && (await ada("#djpm-kk-tombol")));
  cek("UTAMA: membuka halaman TIDAK memanggil aksi koreksi", hitung("koreksiKoordinatBermasalah").length === 0);
  await klik("#djpm-kk-tombol");
  await tungguSampai("!!document.querySelector('#djpm-kk-overlay table')", "pratinjau tampil");
  const pr = hitung("koreksiKoordinatBermasalah");
  cek("PRATINJAU: dipanggil sekali TANPA argumen tulis", pr.length === 1 && pr[0].args.length === 1, JSON.stringify(pr));
  cek("PRATINJAU: tiga baris, kecamatan dan masalah tampil, nama berbahaya sebagai teks", (await js("document.querySelectorAll('#djpm-kk-overlay tbody tr').length")) === 3 && /MEDAN DENAI/.test(await teks("#djpm-kk-overlay")) && (await js("window.__xss === undefined && !document.querySelector('#djpm-kk-overlay img')")) === true);
  cek("PRATINJAU: menjelaskan SISTEM, hitungan verifikator tidak berubah", /oleh SISTEM/.test(await teks("#djpm-kk-overlay")) && /tidak berubah/.test(await teks("#djpm-kk-overlay")));
  cek("PRATINJAU: tombol Jalankan NONAKTIF sebelum daftar diperiksa", (await js("document.querySelector('[data-kk=jalan]').disabled")) === true);
  await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(path.join(os.tmpdir(), "djpm_koreksi_koordinat.png"), Buffer.from(s.result.data, "base64")));
  await klik("[data-kk=tutup]");
  cek("BATAL: tutup tanpa menjalankan (tidak ada panggilan kedua)", !(await ada("#djpm-kk-overlay")) && hitung("koreksiKoordinatBermasalah").length === 1);

  await klik("#djpm-kk-tombol");
  await tungguSampai("!!document.querySelector('#djpm-kk-overlay table')", "pratinjau kedua");
  await js("(() => { const c = document.querySelector('[data-kk=setuju]'); c.checked = true; c.dispatchEvent(new Event('change')); return true; })()");
  cek("PRATINJAU: tombol Jalankan aktif setelah dicentang, berlabel jumlah", (await js("!document.querySelector('[data-kk=jalan]').disabled")) === true && /\(3 data\)/.test(await teks("[data-kk=jalan]")));
  await klik("[data-kk=jalan]");
  await tungguSampai("/3 data diubah/.test(document.getElementById('djpm-kk-overlay').textContent)", "hasil tampil");
  const ex = hitung("koreksiKoordinatBermasalah").pop();
  cek("JALANKAN: mengirim persis daftar id dari pratinjau [801,802,803] dengan jalankan=true", ex.args[1] === true && JSON.stringify(ex.args[2]) === "[801,802,803]", JSON.stringify(ex.args));
  cek("JALANKAN: pesan hasil tampil", /3 data diubah ke Berkas Tidak Lengkap oleh SISTEM/.test(await teks("#djpm-kk-overlay")));
  await klik("[data-kk=tutup]");

  // server gagal
  gagalServer = true;
  await klik("#djpm-kk-tombol");
  await tungguSampai("/server gagal/.test((document.getElementById('djpm-kk-overlay')||{textContent:''}).textContent)", "pesan galat");
  cek("GAGAL: pesan galat tampil, tanpa tombol Jalankan", !(await ada("[data-kk=jalan]")));
  await klik("[data-kk=tutup]"); gagalServer = false;

  // tidak ada kandidat
  jumlahKandidat = 0;
  await klik("#djpm-kk-tombol");
  await tungguSampai("/Tidak ada data yang perlu dikoreksi/.test((document.getElementById('djpm-kk-overlay')||{textContent:''}).textContent)", "tanpa kandidat");
  cek("KOSONG: pesan 'tidak ada data', tanpa tombol Jalankan", !(await ada("[data-kk=jalan]")));
  await klik("[data-kk=tutup]"); jumlahKandidat = 3;

  // ======================== PERAN LAIN ========================
  for (const p of ["VERIFIKATOR", "KECAMATAN"]) {
    await masuk(p);
    cek(p + ": modul TIDAK dimuat, tanpa tombol, tanpa panggilan koreksi", !skripDimuat.some((u) => /app-koreksi-koordinat\.js/.test(u)) && !(await ada("#djpm-kk-tombol")) && hitung("koreksiKoordinatBermasalah").length === 0);
  }
  cek("TANPA galat JavaScript di halaman", galatJs.length === 0, galatJs.join(" | "));
} catch (e) { console.log("GALAT UJI: " + e.message); gagal++; }
finally { try { ws.close(); } catch { /* abaikan */ } chrome.kill(); }
console.log(gagal === 0 ? "\nSEMUA LULUS" : "\nGAGAL: " + gagal);
process.exit(gagal === 0 ? 0 : 1);
