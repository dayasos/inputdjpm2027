// Tombol peta koordinat di halaman /cek-status (khusus GMM). Plan: plans/plan-cek-status-koordinat-gmm.md.
// Uji MANUAL di Chrome sungguhan (BUKAN bagian dari "npm run uji:*").
// Jalankan:  node scripts/uji/layar/cek-status-koordinat.mjs      (opsional LEBAR=1280)
// Syarat: Chrome terpasang (atau CHROME_PATH) dan server lokal:  npx vite --port 3123 --strictPort
// Aman: /api/cek-status dan Turnstile DITIRUKAN lewat intersepsi jaringan (tidak ada permintaan ke server asli).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:3123";
const LEBAR = Number(process.env.LEBAR || 360);
const PORT = 9338;
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-cekpeta-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, `--window-size=${LEBAR},900`, "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map(); const galatJs = []; const permintaanKeluar = [];
let lulus = 0, gagal = 0;
const cek = (nama, ok, info = "") => { (ok ? lulus++ : gagal++); console.log(`${ok ? "  OK  " : " GAGAL"} ${nama}${ok ? "" : "  -> " + info}`); };

const Q = "https://www.google.com/maps?q=3.595200,98.672200";
const DATA = {
  "1111111111111111": { nama: "SITI AMINAH", layanan: "GURU MAGHRIB MENGAJI", kecamatan: "MEDAN KOTA", kelurahan: "SITI REJO", status: "Memenuhi Syarat", tautanPeta: Q },
  "2222222222222222": { nama: "RUKIAH", layanan: "GURU MAGHRIB MENGAJI", kecamatan: "MEDAN KOTA", kelurahan: "SITI REJO", status: "Proses Verifikasi" },
  "3333333333333333": { nama: "HASAN", layanan: "GURU MAGHRIB MENGAJI", kecamatan: "MEDAN KOTA", kelurahan: "SITI REJO", status: "Tidak Memenuhi Syarat" },
  "4444444444444444": { nama: "BUDI", layanan: "IMAM MASJID", kecamatan: "MEDAN KOTA", kelurahan: "SITI REJO", status: "Memenuhi Syarat", tautanPeta: Q },
  // Pertahanan lapis ketiga: bila (misalnya karena galat) server/Worker meloloskan tautan jahat, halaman tetap tidak membuat tombol.
  "5555555555555555": { nama: "JAHAT", layanan: "GURU MAGHRIB MENGAJI", kecamatan: "MEDAN KOTA", kelurahan: "SITI REJO", status: "Memenuhi Syarat", tautanPeta: "javascript:alert(1)" },
};
// reset() (dipanggil halaman setelah "Hapus hasil") memberi token baru, seperti widget asli.
const STUB_TURNSTILE = "var cbU;window.turnstile={render:function(el,o){cbU=o.callback;setTimeout(function(){cbU('token-uji')},30);return 'w1'},reset:function(){setTimeout(function(){cbU('token-uji')},30)},remove:function(){}};setTimeout(function(){window.onloadTurnstile&&window.onloadTurnstile()},0);";

async function sambung() {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch {} await tidur(250); }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); }
    else if (m.method === "Fetch.requestPaused") dialihkan(m.params);
    else if (m.method === "Runtime.exceptionThrown") galatJs.push(m.params.exceptionDetails?.text + " " + (m.params.exceptionDetails?.exception?.description || ""));
    else if (m.method === "Network.requestWillBeSent") permintaanKeluar.push(m.params.request.url);
  };
}
const kirim = (method, params = {}) => new Promise((res) => { const i = ++id; tunggu.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (ekspresi) => { const r = await kirim("Runtime.evaluate", { expression: ekspresi, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
const tungguSampai = async (ekspresi, ms = 15000) => { const s = Date.now(); while (Date.now() - s < ms) { if (await js(ekspresi)) return true; await tidur(150); } return false; };

async function dialihkan(p) {
  const url = p.request.url;
  if (/challenges\.cloudflare\.com/.test(url)) {
    await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/javascript" }], body: Buffer.from(STUB_TURNSTILE).toString("base64") });
    return;
  }
  if (/\/api\/cek-status/.test(url)) {
    let badan = {}; try { badan = JSON.parse(p.request.postData || "{}"); } catch {}
    const d = DATA[badan.nik];
    const jawab = d ? { sukses: true, data: d } : { sukses: false, kode: "TIDAK_TERDATA" };
    await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "Cache-Control", value: "no-store" }], body: Buffer.from(JSON.stringify(jawab)).toString("base64") });
    return;
  }
  await kirim("Fetch.continueRequest", { requestId: p.requestId });
}

async function periksaNik(nik) {
  await js(`(() => { const n=document.getElementById('nik'), t=document.getElementById('tgl');
    n.value=${JSON.stringify(nik)}; n.dispatchEvent(new Event('input',{bubbles:true}));
    t.value='01011990'; t.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
  await tungguSampai(`!document.getElementById('kirim').disabled`);
  await js(`document.getElementById('kirim').click()`);
  return await tungguSampai(`!document.getElementById('hasil').classList.contains('tersembunyi')`);
}
const ringkas = () => js(`(() => {
  const h = document.getElementById('isi-hasil'); const peta = h.querySelector('.peta'); const a = h.querySelector('a');
  const w = h.querySelector('.peringatan'); const r = a ? a.getBoundingClientRect() : null;
  return { peta: !!peta, jumlahTautan: h.querySelectorAll('a').length, href: a ? a.getAttribute('href') : null, teksTombol: a ? a.textContent : null,
    target: a ? a.target : null, rel: a ? a.rel : null, peringatan: w ? w.textContent : null, role: w ? w.getAttribute('role') : null,
    teksSemua: h.innerText, adaGambar: h.querySelectorAll('img,iframe,svg,canvas,input,textarea,button').length,
    tombolDalamLayar: r ? (r.left >= 0 && r.right <= document.documentElement.clientWidth && r.width >= 44 && r.height >= 40) : null,
    gulirMendatar: document.documentElement.scrollWidth > document.documentElement.clientWidth };
})()`);

const PERINGATAN = "Perhatikan apakah titik sudah sesuai. Jika belum sesuai, segera hubungi KUA masing-masing, karena kesalahan titik akan berdampak pada tidak ditemukannya alamat tugas ketika Tim Monitoring melakukan Monitoring dan Evaluasi ke alamat tugas Guru Maghrib Mengaji.";

try {
  await sambung();
  await kirim("Page.enable"); await kirim("Runtime.enable"); await kirim("Network.enable");
  await kirim("Fetch.enable", { patterns: [{ urlPattern: "*challenges.cloudflare.com*" }, { urlPattern: "*api/cek-status*" }] });
  await kirim("Emulation.setDeviceMetricsOverride", { width: LEBAR, height: 900, deviceScaleFactor: 2, mobile: LEBAR < 600 });
  await kirim("Page.navigate", { url: `${BASE}/cek-status.html` });
  await tungguSampai(`document.readyState==='complete' && !!document.getElementById('nik')`);

  // 1. GMM Memenuhi Syarat: tombol + peringatan
  cek("(1) pengecekan GMM menampilkan hasil", await periksaNik("1111111111111111"));
  let r = await ringkas();
  cek("(1) ada kotak peta dengan TEPAT satu tautan", r.peta && r.jumlahTautan === 1, JSON.stringify(r));
  cek("(1) tombol bertuliskan 'Buka titik di Google Maps'", r.teksTombol === "Buka titik di Google Maps", r.teksTombol);
  cek("(1) href = tautan tersimpan apa adanya", r.href === Q, r.href);
  cek("(1) tab baru + noopener noreferrer", r.target === "_blank" && /noopener/.test(r.rel) && /noreferrer/.test(r.rel), r.target + " " + r.rel);
  cek("(1) peringatan persis kalimat yang disepakati", r.peringatan === PERINGATAN, r.peringatan);
  cek("(1) peringatan berperan 'note'", r.role === "note");
  cek("(1) tidak ada angka koordinat di layar", !/3\.5952|98\.6722|maps\?q|google\.com/i.test(r.teksSemua), r.teksSemua);
  cek("(1) tidak ada gambar/iframe/kanvas/kolom isian/tombol lain di hasil", r.adaGambar === 0, String(r.adaGambar));
  cek("(1) tombol di dalam layar, cukup besar disentuh", r.tombolDalamLayar === true);
  cek("(1) tanpa gulir mendatar", r.gulirMendatar === false);
  cek("(1) tombol bisa difokus lewat papan ketik", await js(`(() => { const a=document.querySelector('#isi-hasil a'); a.focus(); return document.activeElement===a; })()`));
  const dilarikan = permintaanKeluar.filter((u) => /google\.com\/maps/.test(u));
  cek("(1) halaman TIDAK memuat peta sendiri (tak ada permintaan ke google maps)", dilarikan.length === 0, dilarikan.join(","));

  // Hapus hasil membuang kotak peta
  await js(`document.getElementById('hapus').click()`);
  cek("(1) Hapus hasil mengosongkan kotak peta", await js(`document.getElementById('isi-hasil').children.length === 0 && !document.querySelector('.peta')`));

  // 2. GMM Proses Verifikasi tanpa tautan: pesan K4 + peringatan, tanpa tombol
  await periksaNik("2222222222222222");
  r = await ringkas();
  cek("(2) tanpa tautan: tidak ada tombol, ada pesan 'belum dapat ditampilkan' + peringatan", r.peta && r.jumlahTautan === 0 && /Titik koordinat belum dapat ditampilkan\./.test(r.teksSemua) && r.peringatan === PERINGATAN, JSON.stringify(r));
  await js(`document.getElementById('hapus').click()`);

  // 3. GMM Tidak Memenuhi Syarat: tanpa kotak peta sama sekali
  await periksaNik("3333333333333333");
  r = await ringkas();
  cek("(3) Tidak Memenuhi Syarat: tanpa kotak peta, tanpa peringatan", !r.peta && r.jumlahTautan === 0 && !/Perhatikan apakah titik/.test(r.teksSemua), JSON.stringify(r));
  await js(`document.getElementById('hapus').click()`);

  // 4. Layanan lain: tampilan identik dengan sebelumnya (tanpa kotak peta)
  await periksaNik("4444444444444444");
  r = await ringkas();
  cek("(4) layanan lain (IMAM MASJID): tanpa kotak peta/peringatan/tautan, status tetap tampil", !r.peta && r.jumlahTautan === 0 && !/Perhatikan apakah titik|Google Maps/.test(r.teksSemua) && /Memenuhi Syarat/.test(r.teksSemua), JSON.stringify(r));
  await js(`document.getElementById('hapus').click()`);

  // 5. Tautan jahat lolos ke halaman: tidak jadi tombol
  await periksaNik("5555555555555555");
  r = await ringkas();
  cek("(5) tautan 'javascript:' TIDAK menjadi tombol (pesan 'belum dapat ditampilkan' + peringatan)", r.jumlahTautan === 0 && /belum dapat ditampilkan/.test(r.teksSemua) && r.peringatan === PERINGATAN, JSON.stringify(r));
  await js(`document.getElementById('hapus').click()`);

  // 6. Hasil tidak masuk URL/penyimpanan
  cek("(6) URL halaman bersih (tanpa NIK/tautan)", !/1111|maps|google/.test(await js(`location.href`)));
  cek("(6) tidak ada galat JavaScript", galatJs.length === 0, galatJs.join(" | "));
} catch (e) {
  cek("uji berjalan tanpa pengecualian", false, String(e?.stack || e));
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
  try { fs.rmSync(profil, { recursive: true, force: true }); } catch {}
  console.log(`\nLEBAR ${LEBAR}px: ${lulus} lulus, ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
}
