// Detail Lengkap Data Penerima: baris "Diverifikasi oleh ..." kini juga tampil untuk status MEMENUHI SYARAT (seperti Berkas Tidak Lengkap / Tidak Memenuhi Syarat).
// Uji MANUAL di Chrome sungguhan (BUKAN bagian dari "npm run uji:*"), server TIRUAN.
// Jalankan:  node scripts/uji/layar/detail-diverifikasi-oleh.mjs
// Syarat: Chrome terpasang (atau CHROME_PATH), dan server lokal berjalan:  npx vite --port 3123 --strictPort
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:3123";
const PORT = 9340;
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=1100,900", "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map(); const galatJs = [];

let peran = "UTAMA";
let detail = null;
let nomorBaris = 200;   // jawaban detail di-cache klien 2 menit per nomor baris
const CORS = [{ name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Headers", value: "*" }, { name: "Access-Control-Allow-Methods", value: "*" }];

// Indeks dataLengkap: 1 nama, 2 nik, 7 layanan, 8 tempat, 32 status, 33 keterangan, 34 tanggal verifikasi, 35 diverifikasi oleh, 36 batas waktu.
function buatDetail({ status, ket = "", tgl = "", oleh = "", batas = "" }) {
  const d = new Array(60).fill("");
  Object.assign(d, { 0: 1, 1: "SITI AMINAH", 2: "1271010101900001", 3: "PEREMPUAN", 4: "MEDAN", 5: "04-02-1989", 6: "JL X NO 1", 7: "GURU MAGHRIB MENGAJI", 8: "RUMAH", 9: "JL. MARELAN RAYA NO 5",
    10: "MEDAN MARELAN", 11: "RUGEMUK", 12: "SITI AMINAH", 13: "12345678901234", 14: "SUMUT", 15: "0812345678", 16: "YA",
    31: "https://www.google.com/maps?q=3.595200,98.672200", 32: status, 33: ket, 34: tgl, 35: oleh, 36: batas, 51: false });
  return d;
}
function jawab(aksi) {
  if (aksi === "pulihkanSesi") return { sukses: true, token: "TOKEN-UJI", username: "petugas", role: peran, kecamatan: "MEDAN MARELAN", userId: "", profileBelumDiisi: false, profil: { namaLengkap: "PETUGAS UJI", nomorHp: "0800", jabatan: "X" } };
  if (aksi === "getMasterLayanan") return { kecamatan: ["IMAM MASJID"], kemenag: ["GURU MAGHRIB MENGAJI"] };
  if (aksi === "ambilDetailPenerimaPerBaris") return { sukses: true, dataLengkap: detail };
  if (aksi === "ambilRiwayatEdit") return { sukses: true, riwayat: [] };
  return { sukses: true };
}
async function dialihkan(p) {
  const url = p.request.url;
  if (!/supabase\.co|\/api\/gas/.test(url)) { await kirim("Fetch.continueRequest", { requestId: p.requestId }); return; }
  if (p.request.method === "OPTIONS") { await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 204, responseHeaders: CORS, body: "" }); return; }
  let aksi = "?"; try { aksi = JSON.parse(p.request.postData || "{}").action; } catch { /* abaikan */ }
  await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200, responseHeaders: [...CORS, { name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify({ result: jawab(aksi) })).toString("base64") });
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
  peran = peranBaru;
  await kirim("Page.navigate", { url: BASE + "/" });
  await tungguSampai("!!document.getElementById('tab-rekap') && document.readyState==='complete'", "halaman siap");
  await js(`sessionStorage.setItem('dana_jasa_sesi', JSON.stringify({ token: 'TOKEN-UJI', username: 'petugas', role: ${JSON.stringify(peranBaru)}, kecamatan: 'MEDAN MARELAN', userId: '', namaLengkap: 'PETUGAS UJI' })); true`);
  await kirim("Page.reload");
  await tungguSampai("!!document.getElementById('tab-rekap') && document.readyState==='complete'", "halaman siap setelah muat ulang");
  await tungguSampai("document.getElementById('modal-login') && document.getElementById('modal-login').classList.contains('hidden')", "sesi tiruan diterima", 60);
}
// Buka detail (mode baca) lalu laporkan kotak status di bagian atas.
async function bukaDetail(opsi) {
  detail = buatDetail(opsi);
  await js("window.tampilkanDetailKeModalOnDemand(" + (++nomorBaris) + "); true");
  await tungguSampai("!document.getElementById('modal-detail-penerima').classList.contains('hidden') && /SITI AMINAH/.test(document.getElementById('isi-konten-detail').textContent)", "detail termuat");
  return await js(`(() => {
    const isi = document.getElementById('isi-konten-detail');
    const kotak = isi.querySelector('.mt-2.rounded-lg');
    return { adaKotak: !!kotak, teks: kotak ? kotak.textContent.replace(/\\s+/g, ' ').trim() : null, kelas: kotak ? kotak.className : '',
      adaKeterangan: !!kotak && /Keterangan:/.test(kotak.textContent), semua: isi.textContent.replace(/\\s+/g, ' ') };
  })()`);
}

try {
  await sambung();
  await kirim("Runtime.enable"); await kirim("Page.enable"); await kirim("Network.enable");
  await kirim("Fetch.enable", { patterns: [{ urlPattern: "*supabase.co*" }, { urlPattern: "*api/gas*" }] });
  await masuk("UTAMA");

  // 1. Memenuhi Syarat: baris "Diverifikasi oleh", tanpa "Keterangan:", kotak hijau
  let k = await bukaDetail({ status: "Memenuhi Syarat", tgl: "05-11-2026 12:11", oleh: "ADMIN" });
  cek("Memenuhi Syarat: tampil 'Diverifikasi oleh ADMIN · 05-11-2026 12:11'", k.adaKotak && k.teks === "Diverifikasi oleh ADMIN · 05-11-2026 12:11", JSON.stringify(k));
  cek("Memenuhi Syarat: tanpa baris 'Keterangan:' (keterangan kosong)", k.adaKeterangan === false, JSON.stringify(k));
  cek("Memenuhi Syarat: kotak berwarna hijau (emerald)", /bg-emerald-50/.test(k.kelas) && /border-emerald-200/.test(k.kelas), k.kelas);
  await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(path.join(os.tmpdir(), "djpm_diverifikasi_ms.png"), Buffer.from(s.result.data, "base64")));

  // 2. Memenuhi Syarat dengan nama petugas biasa (bukan ADMIN) + HTML berbahaya di nama: tidak dieksekusi
  k = await bukaDetail({ status: "Memenuhi Syarat", tgl: "06-11-2026 09:00", oleh: "<img src=x onerror=window.__xss=1>verif" });
  cek("Nama pemverifikasi dibersihkan (tidak menjalankan HTML)", k.adaKotak && (await js("window.__xss === undefined")) && /verif/.test(k.teks), JSON.stringify(k));

  // 3. Memenuhi Syarat tanpa pemverifikasi dan tanggal (data lama): tidak ada kotak
  k = await bukaDetail({ status: "Memenuhi Syarat" });
  cek("Memenuhi Syarat tanpa pemverifikasi/tanggal: tidak ada kotak (tidak menampilkan baris kosong)", k.adaKotak === false, JSON.stringify(k));

  // 4. Memenuhi Syarat dengan keterangan: keterangan + baris diverifikasi (digabung)
  k = await bukaDetail({ status: "Memenuhi Syarat", ket: "Berkas lengkap.", tgl: "05-11-2026 12:11", oleh: "ADMIN" });
  cek("Memenuhi Syarat + keterangan: tampil 'Keterangan: Berkas lengkap.' dan 'Diverifikasi oleh ...'", k.adaKotak && /^Keterangan: Berkas lengkap\. Diverifikasi oleh ADMIN · 05-11-2026 12:11$/.test(k.teks), JSON.stringify(k));

  // 5. Perilaku lama utuh: Berkas Tidak Lengkap (amber, keterangan + batas waktu) dan Tidak Memenuhi Syarat (merah)
  k = await bukaDetail({ status: "Berkas Tidak Lengkap", ket: "KTP buram.", tgl: "01-11-2026 08:00", oleh: "ADMIN", batas: "25-12-2026" });
  cek("Berkas Tidak Lengkap: tetap amber dengan Keterangan + Diverifikasi oleh + batas waktu", /bg-amber-50/.test(k.kelas) && /Keterangan: KTP buram\./.test(k.teks) && /Diverifikasi oleh ADMIN · 01-11-2026 08:00/.test(k.teks) && /Batas waktu perbaikan: 25-12-2026/.test(k.teks), JSON.stringify(k));
  k = await bukaDetail({ status: "Tidak Memenuhi Syarat", ket: "Hasil monev.", tgl: "07-11-2026 19:14", oleh: "ADMIN" });
  cek("Tidak Memenuhi Syarat: tetap merah dengan Keterangan + Diverifikasi oleh", /bg-red-50/.test(k.kelas) && /Keterangan: Hasil monev\./.test(k.teks) && /Diverifikasi oleh ADMIN/.test(k.teks), JSON.stringify(k));

  // 6. Proses Verifikasi: tidak ada kotak (belum diverifikasi)
  k = await bukaDetail({ status: "Proses Verifikasi" });
  cek("Proses Verifikasi: tidak ada kotak", k.adaKotak === false, JSON.stringify(k));

  // 7. Peran petugas (Kecamatan, GMM) juga melihatnya
  for (const p of ["KECAMATAN", "GURU MAGHRIB MENGAJI"]) {
    await masuk(p);
    k = await bukaDetail({ status: "Memenuhi Syarat", tgl: "05-11-2026 12:11", oleh: "ADMIN" });
    cek(`Peran ${p}: juga melihat 'Diverifikasi oleh ADMIN'`, k.adaKotak && /Diverifikasi oleh ADMIN/.test(k.teks), JSON.stringify(k));
  }

  cek("Tidak ada galat JavaScript selama pengujian", galatJs.length === 0, galatJs.slice(0, 3).join(" | "));
} catch (err) { console.log("GALAT HARNESS: " + err.message); gagal++; }
finally { try { ws && ws.close(); } catch { /* abaikan */ } chrome.kill(); await tidur(500); try { fs.rmSync(profil, { recursive: true, force: true }); } catch { /* abaikan */ } }
console.log(gagal === 0 ? "\nSEMUA LULUS" : `\n${gagal} GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
