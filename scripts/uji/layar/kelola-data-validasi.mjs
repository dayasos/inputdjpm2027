// Kelola Data: validasi tanggal lahir dan kelurahan wajib pada form edit (dengan server TIRUAN).
// Uji MANUAL di Chrome sungguhan (BUKAN bagian dari "npm run uji:validasi-penerima"). Plan: plans/plan-perbaikan-validasi-data-penerima.md, P2.
// Jalankan:  node scripts/uji/layar/kelola-data-validasi.mjs
// Syarat: Chrome terpasang (atau set env CHROME_PATH), dan server lokal berjalan:  npx vite --port 3123 --strictPort
// Aman: tidak ada permintaan ke server asli (jaringan dicegat), WebSocket realtime dimatikan.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9334, OUT = os.tmpdir();
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=1100,1000", "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map();
const log = { aksi: [] };

const CORS = [{ name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Headers", value: "*" }, { name: "Access-Control-Allow-Methods", value: "*" }];
const DETAIL = { id: 1, tahun: 2027, nomorUrut: 1575, nama: "ANDI SYAHPUTRA", nik: "1271010101900001", jenisKelamin: "LAKI-LAKI", tempatLahir: "MEDAN", tanggalLahir: "04-02-1989", alamat: "JL X", layanan: "GURU MAGHRIB MENGAJI", tempatTugas: "MUSHOLLA X", alamatTugas: "JL Y", kecamatan: "MEDAN SELAYANG", kelurahan: "TANJUNG SARI", namaRekening: "ANDI", nomorRekening: "12345678901234", kantorCabang: "BANK", noKontak: "0812345678", statusBpjs: "YA", status: "Memenuhi Syarat" };
function jawab(aksi, args) {
  switch (aksi) {
    case "pulihkanSesi": return { sukses: true, token: "TOKEN-UJI", username: "admin", role: "UTAMA", kecamatan: "", userId: "", profileBelumDiisi: false, profil: { namaLengkap: "ADMIN UJI", nomorHp: "0800", jabatan: "X" } };
    case "adminDaftarData": return { sukses: true, daftar: [{ id: 1, tahun: 2027, nomorUrut: 1575, nama: "ANDI SYAHPUTRA", nik: "1271010101900001", layanan: "GURU MAGHRIB MENGAJI", kecamatan: "MEDAN SELAYANG", kelurahan: "TANJUNG SARI", tempatTugas: "MUSHOLLA X", status: "Memenuhi Syarat", jumlahBerkas: 0, kategori: "KEMENAG" }], total: 1, totalHalaman: 1, page: 1, limit: 20, tahun: 2027, tahunAktif: 2027, tahunTersedia: [2027], bolehUbah: true, opsi: { layananKecamatan: ["IMAM MASJID"], layananKemenag: ["GURU MAGHRIB MENGAJI"], kecamatan: ["MEDAN SELAYANG", "MEDAN BELAWAN"] } };
    case "adminDetailData": return { sukses: true, data: DETAIL, berkas: [], versi: "v1", bolehUbah: true, jumlahBatchPembayaran: 0 };
    case "getKelurahanByKecamatan": return args[1] === "MEDAN BELAWAN" ? ["BELAWAN BAHARI", "BELAWAN II"] : ["TANJUNG SARI", "SEMPAKATA"];
    case "adminUbahData": return { sukses: true, pesan: "Data berhasil diperbarui.", jumlahBerubah: 1 };
    case "getMasterLayanan": return { kecamatan: ["IMAM MASJID"], kemenag: ["GURU MAGHRIB MENGAJI"] };
    default: return { sukses: true };
  }
}
async function dialihkan(p) {
  const url = p.request.url;
  const aman = /supabase\.co|\/api\/gas/.test(url);
  if (!aman) { await kirim("Fetch.continueRequest", { requestId: p.requestId }); return; }
  if (p.request.method === "OPTIONS") { await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 204, responseHeaders: CORS, body: "" }); return; }
  let aksi = "?", args = [];
  try { const b = JSON.parse(p.request.postData || "{}"); aksi = b.action; args = b.args || []; } catch { /* abaikan */ }
  log.aksi.push({ aksi, args });
  const isi = JSON.stringify({ result: jawab(aksi, args) });
  await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200, responseHeaders: [...CORS, { name: "Content-Type", value: "application/json" }], body: Buffer.from(isi).toString("base64") });
}
async function sambung() {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch { /* tunggu */ } await tidur(250); }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); } else if (m.method === "Fetch.requestPaused") dialihkan(m.params); };
}
function kirim(method, params = {}) { return new Promise((r) => { const i = ++id; tunggu.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function js(ekspresi) {
  const m = await kirim("Runtime.evaluate", { expression: ekspresi, returnByValue: true, awaitPromise: true });
  if (m.result.exceptionDetails) throw new Error("JS galat: " + JSON.stringify(m.result.exceptionDetails).slice(0, 400));
  return m.result.result.value;
}
async function tungguSampai(ekspresi, label, maks = 60) { for (let i = 0; i < maks; i++) { if (await js(ekspresi)) return true; await tidur(250); } throw new Error("Timeout menunggu: " + label); }
let gagal = 0;
function cek(nama, kondisi, rinci = "") { console.log((kondisi ? "LULUS  " : "GAGAL  ") + nama + (kondisi ? "" : "  -> " + rinci)); if (!kondisi) gagal++; }
const set = (k, v) => js(`(()=>{const e=document.getElementById('kd-f-${k}'); e.value=${JSON.stringify(v)}; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true})()`);
const keadaan = () => js(`(()=>{const q=(i)=>document.getElementById(i); const g=(k)=>{const p=q('kd-galat-'+k); return p?p.textContent:null}; return JSON.stringify({simpanNonaktif:q('kd-btn-simpan').disabled, galatTgl:g('tanggal_lahir'), galatKel:g('kelurahan'), invalidTgl:q('kd-f-tanggal_lahir').getAttribute('aria-invalid'), invalidKel:q('kd-f-kelurahan').getAttribute('aria-invalid'), info:q('kd-info-ubah').textContent, kel:q('kd-f-kelurahan').value, kec:q('kd-f-kecamatan').value})})()`).then(JSON.parse);
const jumlahSimpan = () => log.aksi.filter((a) => a.aksi === "adminUbahData").length;

try {
  await sambung();
  await kirim("Runtime.enable"); await kirim("Page.enable");
  await kirim("Fetch.enable", { patterns: [{ urlPattern: "*supabase.co*" }, { urlPattern: "*api/gas*" }] });
  await kirim("Page.addScriptToEvaluateOnNewDocument", { source: `
    if (location.origin === 'http://localhost:3123') {
      window.WebSocket = class { constructor(){ this.readyState = 3; } send(){} close(){} addEventListener(){} removeEventListener(){} };
      sessionStorage.setItem('dana_jasa_sesi', JSON.stringify({ token: 'TOKEN-UJI', username: 'admin', role: 'UTAMA', kecamatan: '', userId: '', namaLengkap: 'ADMIN UJI' }));
    }` });
  await kirim("Page.navigate", { url: "http://localhost:3123/" });
  await tungguSampai("!!(window.djpmTanggalLahir && document.getElementById('tab-kelola-data'))", "halaman siap");
  await tungguSampai("document.getElementById('modal-login').classList.contains('hidden')", "modal login tertutup (sesi tiruan diterima)", 40);
  await js("document.getElementById('tab-kelola-data').click(); true");
  await tungguSampai("!!document.querySelector('button[data-kd=\"kelola\"]')", "baris Kelola Data");
  cek("sesi tiruan diterima dan panel Kelola Data menampilkan 1 baris", true);
  await js("document.querySelector('button[data-kd=\"kelola\"]').click(); true");
  await tungguSampai("!!document.getElementById('kd-f-tanggal_lahir') && document.getElementById('kd-f-kelurahan').value === 'TANJUNG SARI'", "form detail");

  let k = await keadaan();
  cek("awal: tombol Simpan nonaktif, tanpa pesan galat", k.simpanNonaktif && k.galatTgl === null && k.galatKel === null, JSON.stringify(k));

  await set("tanggal_lahir", "04-02-0199"); k = await keadaan();
  cek("tanggal 04-02-0199: pesan 'tidak wajar', Simpan nonaktif, aria-invalid, info 'bertanda merah'", k.simpanNonaktif && /tidak wajar/.test(k.galatTgl || "") && k.invalidTgl === "true" && /merah/.test(k.info), JSON.stringify(k));
  await set("tanggal_lahir", "04-02-199"); k = await keadaan();
  cek("tanggal 04-02-199 (kehilangan satu angka): pesan 4 digit", /4 digit/.test(k.galatTgl || "") && k.simpanNonaktif, JSON.stringify(k));
  await set("tanggal_lahir", "31-02-1990"); k = await keadaan();
  cek("tanggal 31-02-1990: 'tidak valid'", k.galatTgl === "Tanggal lahir tidak valid." && k.simpanNonaktif, JSON.stringify(k));
  await set("tanggal_lahir", "01-01-1900"); k = await keadaan();
  cek("tanggal tahun 1900 (umur 127): ditolak", !!k.galatTgl && k.simpanNonaktif, JSON.stringify(k));
  await set("tanggal_lahir", "05-02-1989"); k = await keadaan();
  cek("tanggal sah yang berubah: galat hilang, Simpan AKTIF", k.galatTgl === null && !k.simpanNonaktif && k.invalidTgl === null && /1 perubahan/.test(k.info), JSON.stringify(k));
  await set("tanggal_lahir", "04-02-1989"); k = await keadaan();
  cek("kembali ke nilai awal: tak ada perubahan, Simpan nonaktif", k.simpanNonaktif && k.galatTgl === null, JSON.stringify(k));

  // kecamatan diganti -> kelurahan dikosongkan (perilaku lama); sekarang harus MEMBLOKIR simpan
  await js(`(()=>{const s=document.getElementById('kd-f-kecamatan'); if(![...s.options].some(o=>o.value==='MEDAN BELAWAN')){const o=document.createElement('option');o.value='MEDAN BELAWAN';o.textContent='MEDAN BELAWAN';s.appendChild(o)} return true})()`);
  await set("kecamatan", "MEDAN BELAWAN");
  await tungguSampai("[...document.getElementById('kd-f-kelurahan').options].some(o=>o.value==='BELAWAN BAHARI')", "daftar kelurahan Belawan");
  k = await keadaan();
  cek("kecamatan diganti & kelurahan belum dipilih: 'Kelurahan wajib dipilih', Simpan NONAKTIF", k.simpanNonaktif && k.galatKel === "Kelurahan wajib dipilih." && k.invalidKel === "true" && k.kel === "", JSON.stringify(k));
  // paksa simpan (tombol diaktifkan paksa): penjaga di simpanPerubahan harus menolak, tanpa panggilan ke server
  const sebelum = jumlahSimpan();
  await js("(()=>{const b=document.getElementById('kd-btn-simpan'); b.disabled=false; b.click(); return true})()");
  await tidur(600);
  cek("simpan dipaksa saat kelurahan kosong: TIDAK ada panggilan adminUbahData ke server", jumlahSimpan() === sebelum, `sebelum=${sebelum} sesudah=${jumlahSimpan()}`);
  cek("pengguna diberi tahu 'Kelurahan wajib dipilih'", await js("document.body.innerText.includes('Kelurahan wajib dipilih')"));
  await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(`${OUT}/djpm_kd_kelurahan_kosong.png`, Buffer.from(s.result.data, "base64")));

  await set("kelurahan", "BELAWAN BAHARI"); k = await keadaan();
  cek("kelurahan dipilih: galat hilang, Simpan AKTIF", k.galatKel === null && !k.simpanNonaktif && k.invalidKel === null, JSON.stringify(k));
  await js("document.getElementById('kd-btn-simpan').click(); true");
  for (let i = 0; i < 24 && jumlahSimpan() === sebelum; i++) await tidur(250);
  cek("simpan sah: tepat 1 panggilan adminUbahData", jumlahSimpan() === sebelum + 1, `jumlah=${jumlahSimpan()}`);
  const perubahan = log.aksi.filter((a) => a.aksi === "adminUbahData").slice(-1)[0]?.args?.[3] || {};
  cek("perubahan terkirim = kecamatan + kelurahan (tanpa tanggal lahir)", perubahan.kecamatan === "MEDAN BELAWAN" && perubahan.kelurahan === "BELAWAN BAHARI" && !("tanggal_lahir" in perubahan), JSON.stringify(perubahan));
  console.log("  (aksi yang dicegat dan dijawab tiruan: " + [...new Set(log.aksi.map((a) => a.aksi))].join(", ") + ")");
} catch (err) { console.log("GALAT HARNESS: " + err.message); gagal++; }
finally { try { ws && ws.close(); } catch { /* abaikan */ } chrome.kill(); await tidur(500); try { fs.rmSync(profil, { recursive: true, force: true }); } catch { /* abaikan */ } }
console.log(gagal === 0 ? "\nSEMUA LULUS" : `\n${gagal} GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
