// Formulir input koordinat Guru Maghrib Mengaji (kolom manual): tautan Street View tanpa titik DITOLAK di layar; tautan sah diterima. Chrome sungguhan.
// Jalankan: node scripts/uji/layar/koordinat-street-view-gmm.mjs   (Chrome + npx vite --port 3123 --strictPort)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:3123";
const PORT = 9356;
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=1100,900", "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map(); const galatJs = [];
async function sambung() {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch { /* tunggu */ } await tidur(250); }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); }
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

const SV_PANJANG = "https://www.google.com/maps/@3.595200,98.672200,34a,75y,26.65h,88.21t/data=!3m7!1e1!3m5!1s" + "A".repeat(520) + "!2e0!7i16384!8i8192";
const SV_PENDEK = "https://www.google.com/maps/@3.5,98.6,34a,75y/data=!3m5!1e1";
const SV_ADA_TITIK = "https://www.google.com/maps/@3.5,98.6,34a,75y/data=!3m5!1e1!8m2!3d3.5952!4d98.6722";
const SV_ADA_ID_TEMPAT = "https://www.google.com/maps/place/JJ84%2BP3V+PuFood/@3.6,98.67,3a,75y/data=!3m5!1e1!4m6!3m5!1s0x3031:0xabc";
const SAH = "https://www.google.com/maps?q=3.595200,98.672200";

// Mengisi kolom manual mode 'plank' (GMM) atau 'ibadah' (Guru lain) lalu membaca hasilnya.
const coba = (mode, nilai) => js(`(() => {
  const idIn = ${JSON.stringify(mode)} === 'plank' ? 'input-koordinat-manual' : 'input-koordinat-manual-ibadah';
  const idHid = ${JSON.stringify(mode)} === 'plank' ? 'hidden-koordinat-link' : 'hidden-koordinat-link-ibadah';
  const idPesan = ${JSON.stringify(mode)} === 'plank' ? 'pesan-koordinat-manual' : 'pesan-koordinat-manual-ibadah';
  document.getElementById(idIn).value = ${JSON.stringify(nilai)};
  window.djpmKoordinat.periksaManual(${JSON.stringify(mode)});
  const p = document.getElementById(idPesan);
  return { hidden: document.getElementById(idHid).value, pesan: p && !p.classList.contains('hidden') ? p.textContent : '' };
})()`);

try {
  await sambung();
  await kirim("Runtime.enable"); await kirim("Page.enable");
  await kirim("Page.navigate", { url: BASE + "/" });
  await tungguSampai("!!window.djpmKoordinat && !!document.getElementById('input-koordinat-manual') && document.readyState==='complete'", "formulir siap");

  let r = await coba("plank", SV_PANJANG);
  cek("GMM: Street View PANJANG (yang normalizer ubah jadi ?q=) ditolak; tidak ada nilai tersimpan", r.hidden === "" && /Street View tidak dapat dipakai/.test(r.pesan), JSON.stringify(r).slice(0, 200));
  r = await coba("plank", SV_PENDEK);
  cek("GMM: Street View biasa ditolak", r.hidden === "" && /posisi kamera/.test(r.pesan), JSON.stringify(r).slice(0, 200));
  r = await coba("plank", SV_ADA_TITIK);
  cek("GMM: tampilan Street View yang memuat titik penanda (!3d!4d) diterima (aturan sama dengan server)", r.hidden !== "" && r.pesan === "", JSON.stringify(r).slice(0, 200));
  r = await coba("plank", SV_ADA_ID_TEMPAT);
  cek("GMM: tempat ber-ID dalam tampilan Street View diterima", r.hidden !== "" && r.pesan === "", JSON.stringify(r).slice(0, 200));
  r = await coba("plank", SAH);
  cek("GMM: tautan koordinat sah diterima dan disimpan di kolom tersembunyi", r.hidden === SAH && r.pesan === "", JSON.stringify(r));
  r = await coba("plank", "3.595200, 98.672200");
  cek("GMM: angka koordinat polos diterima", /maps\?q=3\.595200,98\.672200/.test(r.hidden) && r.pesan === "", JSON.stringify(r));
  r = await coba("plank", SV_PANJANG);
  cek("GMM: sesudah ditolak, nilai lama dikosongkan (tidak tertinggal tautan sah sebelumnya)", r.hidden === "", JSON.stringify(r).slice(0, 200));
  r = await coba("ibadah", SV_PENDEK);
  cek("Guru LAIN (bukan GMM): aturan lama tidak berubah (tidak ditolak di layar)", r.hidden !== "" && r.pesan === "", JSON.stringify(r).slice(0, 200));

  cek("TANPA galat JavaScript di halaman", galatJs.length === 0, galatJs.join(" | "));
} catch (e) { console.log("GALAT UJI: " + e.message); gagal++; }
finally { try { ws.close(); } catch { /* abaikan */ } chrome.kill(); }
console.log(gagal === 0 ? "\nSEMUA LULUS" : "\nGAGAL: " + gagal);
process.exit(gagal === 0 ? 0 : 1);
