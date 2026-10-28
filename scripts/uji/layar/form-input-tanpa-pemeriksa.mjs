// Form input utama: perilaku CADANGAN bila berkas pemeriksa tanggal lahir GAGAL dimuat (jaringan putus sesaat).
// Uji MANUAL di Chrome sungguhan (BUKAN bagian dari "npm run uji:validasi-penerima"). Plan: plans/plan-perbaikan-validasi-data-penerima.md, P2.
// Jalankan:  node scripts/uji/layar/form-input-tanpa-pemeriksa.mjs
// Syarat: Chrome terpasang (atau set env CHROME_PATH), dan server lokal berjalan:  npx vite --port 3123 --strictPort
// Aman: berkas pemeriksa DIBLOKIR di Chrome (404); tidak ada permintaan ke server asli (jaringan API juga dicegat).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9335;
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=900,1200", "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map();
const galatKonsol = [];

async function dialihkan(p) {
  const url = p.request.url;
  if (/validasi-tanggal-lahir\.js/.test(url)) {
    await kirim("Fetch.failRequest", { requestId: p.requestId, errorReason: "Failed" });   // seolah jaringan putus
  } else if (/supabase\.co|api\/gas/.test(url)) {
    const jawab = p.request.method === "OPTIONS" ? "" : JSON.stringify({ result: { sukses: false } });
    await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: p.request.method === "OPTIONS" ? 204 : 200, responseHeaders: [{ name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Headers", value: "*" }, { name: "Content-Type", value: "application/json" }], body: Buffer.from(jawab).toString("base64") });
  } else {
    await kirim("Fetch.continueRequest", { requestId: p.requestId });
  }
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
    else if (m.method === "Runtime.exceptionThrown") galatKonsol.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
}
function kirim(method, params = {}) { return new Promise((r) => { const i = ++id; tunggu.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function js(ekspresi) {
  const m = await kirim("Runtime.evaluate", { expression: ekspresi, returnByValue: true, awaitPromise: true });
  if (m.result.exceptionDetails) throw new Error("JS galat: " + JSON.stringify(m.result.exceptionDetails).slice(0, 300));
  return m.result.result.value;
}
let gagal = 0;
function cek(nama, kondisi, rinci = "") { console.log((kondisi ? "LULUS  " : "GAGAL  ") + nama + (kondisi ? "" : "  -> " + rinci)); if (!kondisi) gagal++; }

try {
  await sambung();
  await kirim("Runtime.enable"); await kirim("Page.enable");
  await kirim("Fetch.enable", { patterns: [{ urlPattern: "*validasi-tanggal-lahir*" }, { urlPattern: "*supabase.co*" }, { urlPattern: "*api/gas*" }] });
  await kirim("Page.addScriptToEvaluateOnNewDocument", { source: "if (location.origin === 'http://localhost:3123') { window.WebSocket = class { constructor(){ this.readyState = 3; } send(){} close(){} addEventListener(){} removeEventListener(){} }; }" });
  await kirim("Page.navigate", { url: "http://localhost:3123/" });
  for (let i = 0; i < 60; i++) { if (await js("document.readyState==='complete' && typeof kunciDariBlokSetelah==='function' && !!document.getElementById('input-tgl-lahir')")) break; await tidur(250); }
  await tidur(1000);

  cek("berkas pemeriksa benar-benar tidak termuat (simulasi jaringan putus)", (await js("typeof window.djpmTanggalLahir")) === "undefined");
  const setTgl = (v) => js(`(()=>{const e=document.getElementById('input-tgl-lahir'); e.value='${v}'; e.dispatchEvent(new Event('input',{bubbles:true})); return JSON.stringify({umur:document.getElementById('input-umur').value, modalUsia:(typeof modalUsia!=='undefined'&&!!modalUsia)?!modalUsia.classList.contains('hidden'):'?', kunciUsia:'USIA' in window._kuncianAktif})})()`).then(JSON.parse);

  let r = await setTgl("1989-02-04");
  cek("tanpa pemeriksa: umur tetap dihitung (37) dan tanpa kunci", r.umur === "37" && r.kunciUsia === false, JSON.stringify(r));
  r = await setTgl("2009-06-01");
  cek("tanpa pemeriksa: usia 17 tetap memunculkan modal dan mengunci (perilaku lama terjaga)", r.umur === "17" && r.modalUsia === true && r.kunciUsia === true, JSON.stringify(r));
  r = await setTgl("");
  cek("dikosongkan: umur kosong dan kunci dilepas", r.umur === "" && r.kunciUsia === false, JSON.stringify(r));
  cek("tidak ada galat JavaScript akibat pemeriksa hilang", galatKonsol.length === 0, galatKonsol.join(" | ").slice(0, 300));
} catch (err) { console.log("GALAT HARNESS: " + err.message); gagal++; }
finally { try { ws && ws.close(); } catch { /* abaikan */ } chrome.kill(); await tidur(500); try { fs.rmSync(profil, { recursive: true, force: true }); } catch { /* abaikan */ } }
console.log(gagal === 0 ? "\nSEMUA LULUS" : `\n${gagal} GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
