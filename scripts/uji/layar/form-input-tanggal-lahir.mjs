// Form input utama: kolom tanggal lahir (min/max, pesan, kunci blok).
// Uji MANUAL di Chrome sungguhan (BUKAN bagian dari "npm run uji:validasi-penerima"). Plan: plans/plan-perbaikan-validasi-data-penerima.md, P2.
// Jalankan:  node scripts/uji/layar/form-input-tanggal-lahir.mjs
// Menulis tangkapan layar ke folder temp bila perlu (lihat bagian akhir berkas).
// Syarat: Chrome terpasang (atau set env CHROME_PATH), dan server lokal berjalan:  npx vite --port 3123 --strictPort
// Aman: tidak ada permintaan ke server asli (jaringan dicegat), WebSocket realtime dimatikan.
// Opsional: BASE_URL=https://djpmkotamedan.web.id untuk memeriksa tampilan versi yang SUDAH LIVE (hanya memanipulasi kolom di layar; tanpa login, tanpa data).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=420,900", "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map();
async function sambung() {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch {} await tidur(250); }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${process.env.BASE_URL || "http://localhost:3123"}/`, { method: "PUT" })).json();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); } };
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
  await kirim("Runtime.enable");
  for (let i = 0; i < 40; i++) { if (await js("!!(window.djpmTanggalLahir && document.getElementById('input-tgl-lahir') && document.readyState==='complete')")) break; await tidur(500); }
  const ada = await js("!!window.djpmTanggalLahir");
  cek("modul pemeriksa tanggal lahir termuat di browser", ada);
  const setTgl = (v) => js(`(()=>{const e=document.getElementById('input-tgl-lahir'); e.value='${v}'; e.dispatchEvent(new Event('input',{bubbles:true})); const p=document.getElementById('pesan-tgl-lahir'); return JSON.stringify({umur:document.getElementById('input-umur').value, pesan:p?p.textContent:'', pesanTampil:p?!p.classList.contains('hidden'):false, merah:p?(!p.classList.contains('hidden')&&p.classList.contains('text-red-700')):false, amber:p?(!p.classList.contains('hidden')&&p.classList.contains('text-amber-700')):false, invalid:e.getAttribute('aria-invalid'), modalUsia:(typeof modalUsia!=='undefined' && !!modalUsia)?!modalUsia.classList.contains('hidden'):'?'})})()`).then(JSON.parse);
  cek("atribut min=1900-01-01 terpasang", (await js("document.getElementById('input-tgl-lahir').min")) === "1900-01-01");
  const mx = await js("document.getElementById('input-tgl-lahir').max");
  cek("atribut max = hari ini (WIB)", /^\d{4}-\d{2}-\d{2}$/.test(mx), mx);

  let r = await setTgl("0199-02-04");
  cek("tahun 0199: petunjuk lembut (amber), umur dikosongkan, tanpa tanda error", r.pesanTampil && r.amber && !r.merah && r.umur === "" && /4 digit/.test(r.pesan), JSON.stringify(r));
  r = await setTgl("1899-02-04");
  cek("tahun 1899: pesan merah 'tidak wajar', umur kosong, aria-invalid", r.pesanTampil && r.merah && /tidak wajar/.test(r.pesan) && r.umur === "" && r.invalid === "true", JSON.stringify(r));
  r = await setTgl("1925-06-15");
  cek("usia 101 tahun: pesan merah, umur kosong (bukan angka 101)", r.merah && r.umur === "", JSON.stringify(r));
  r = await setTgl("2999-01-01");
  cek("tanggal masa depan: pesan merah", r.merah && /tidak wajar/.test(r.pesan), JSON.stringify(r));
  r = await setTgl("1989-02-04");
  cek("1989-02-04 sah: tanpa pesan, umur 37", !r.pesanTampil && r.umur === "37" && r.invalid === null, JSON.stringify(r));
  r = await setTgl("2009-06-01");
  cek("usia 17: modal usia muncul, umur tampil 17, tanpa pesan merah", r.modalUsia === true && r.umur === "17" && !r.merah, JSON.stringify(r));
  r = await setTgl("");
  cek("dikosongkan: pesan hilang dan umur kosong", !r.pesanTampil && r.umur === "", JSON.stringify(r));
  r = await setTgl("0199-02-04"); r = await setTgl("1990-02-04");
  cek("0199 lalu diketik jadi 1990: pesan hilang, umur 36", !r.pesanTampil && r.umur === "36", JSON.stringify(r));
  const lock = await js("typeof kunciDariBlokSetelah==='function' && typeof tetapkanTanggalLahirTidakWajar==='function'");
  cek("fungsi kunci blok tersedia", lock);
  const e = await js("document.getElementById('input-tgl-lahir').outerHTML.includes('min=\"1900-01-01\"')");
  cek("HTML kolom memuat min", e);

  // --- kunci blok & tampilan ---
  const kunciUsia = () => js("'USIA' in window._kuncianAktif");
  await setTgl("1989-02-04");
  cek("tanggal sah: kunci USIA tidak aktif", (await kunciUsia()) === false);
  await setTgl("1899-02-04");
  cek("tahun 1899: kunci USIA AKTIF (blok setelahnya terkunci)", (await kunciUsia()) === true);
  await setTgl("1989-02-04");
  cek("diperbaiki ke 1989: kunci USIA dilepas", (await kunciUsia()) === false);
  await setTgl("1925-06-15");
  cek("usia 101: kunci USIA aktif", (await kunciUsia()) === true);
  await setTgl("2009-06-01");
  cek("usia 17: kunci USIA aktif (perilaku lama tetap)", (await kunciUsia()) === true);
  await setTgl("1989-02-04");
  await setTgl("0199-02-04");
  cek("tahun masih diketik (0199): kunci USIA TIDAK aktif (tidak berkedip)", (await kunciUsia()) === false);
  await setTgl("");
  cek("dikosongkan: kunci USIA tidak aktif", (await kunciUsia()) === false);
  // tangkapan layar
  await js("(()=>{document.getElementById('modal-login').classList.add('hidden'); document.documentElement.classList.add('is-logged-in'); const e=document.getElementById('input-tgl-lahir'); e.scrollIntoView({block:'center'});})()");
  for (const [nama, nilai] of [["a_0199", "0199-02-04"], ["b_1899", "1899-02-04"], ["c_sah", "1989-02-04"]]) {
    await setTgl(nilai);
    await tidur(300);
    const shot = await kirim("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(os.tmpdir(), "djpm_tgl_" + nama + ".png"), Buffer.from(shot.result.data, "base64"));
  }
} catch (err) { console.log("GALAT HARNESS: " + err.message); gagal++; }
finally { try { ws && ws.close(); } catch {} chrome.kill(); await tidur(500); try { fs.rmSync(profil, { recursive: true, force: true }); } catch {} }
console.log(gagal === 0 ? "\nSEMUA LULUS" : `\n${gagal} GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
