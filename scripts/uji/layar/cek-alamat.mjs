// Cek Alamat Tugas GMM: tampilan di Chrome sungguhan dengan server TIRUAN berstatus (bentuk jawaban meniru domains/cekAlamatTugas.ts).
// Uji MANUAL (bukan bagian dari npm test). Plan: plans/plan-cek-alamat-tugas-gmm.md.
// Jalankan:  node scripts/uji/layar/cek-alamat.mjs        (opsional: OUT_DIR=<folder tangkapan layar>)
// Syarat: Chrome terpasang (atau CHROME_PATH), dan server lokal berjalan:  node node_modules/vite/bin/vite.js --port 3123 --strictPort
// Aman: tidak ada permintaan ke server asli (jaringan dicegat), WebSocket realtime dimatikan. Data karangan.
// Yang diuji: tampilan dan sambungan aksi/argumen; aturan akses dan alur status diuji di server-cek-alamat-tugas.test.mjs (Postgres sungguhan).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:3123";
const OUT = process.env.OUT_DIR || os.tmpdir();
const PORT = 9337;
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=390,900", "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map(); const galatJs = [];
const log = { aksi: [] };
const CORS = [{ name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Headers", value: "*" }, { name: "Access-Control-Allow-Methods", value: "*" }];

// ---------------------------------------------- server tiruan ----------------------------------------------
const SESI = {
  "T-GMM": { token: "T-GMM", username: "gmm_labuhan", role: "GURU MAGHRIB MENGAJI", kecamatan: "MEDAN LABUHAN", userId: "", namaLengkap: "GURU LABUHAN" },
  "T-UTAMA": { token: "T-UTAMA", username: "utama1", role: "UTAMA", kecamatan: "", userId: "", namaLengkap: "ADMIN UTAMA" },
  "T-KEC": { token: "T-KEC", username: "kec1", role: "KECAMATAN", kecamatan: "MEDAN LABUHAN", userId: "", namaLengkap: "KECAMATAN" },
  "T-MUI": { token: "T-MUI", username: "mui1", role: "MUI", kecamatan: "", userId: "", namaLengkap: "MUI" },
};
const item = (id, o) => ({ id, penerimaId: 100 + id, status: "BELUM", menunggu: "GMM", dataDihapus: false, kecamatan: "MEDAN LABUHAN", kelurahan: "KEL X", tempatTugas: "RUMAH", masihRumah: true,
  alamatAwal: o.alamatTugas, samaSaatDibuka: !!o.samaAlamatRumah, linkPeta: "https://maps.google.com/?q=3.5,98.6", jumlahPesan: 1, diperbaruiPada: "31 Okt 2026 10.00", ...o });
let ITEMS = [];
let UTAS = {};
let SUDAH_DIBUKA = false;
let MODE_LENCANA = "normal";   // 'gangguan' (DB penuh, sementara) | 'belum_ada' (migrasi belum diterapkan)
function resetServer(terbuka) {
  SUDAH_DIBUKA = terbuka;
  ITEMS = terbuka ? [
    item(11, { nama: "ANI", alamatTugas: "JL. A NO 1", alamatRumah: "JL. A NO 1", samaAlamatRumah: true }),
    item(12, { nama: "BUDI", alamatTugas: "JL. B NO 2", alamatRumah: "JL. Z NO 9", samaAlamatRumah: false }),
    item(13, { nama: "<img src=x onerror=window.__xss=1>CICI", kelurahan: "<b onclick=window.__xss=3>KELX</b>", tempatTugas: "RUMAH<svg onload=window.__xss=4>", alamatTugas: "JL C NO 3<img src=x onerror=window.__xss=5>", alamatRumah: "<script>window.__xss=6</script>JL C NO 3", samaAlamatRumah: true, linkPeta: "javascript:window.__xss=2" }),
  ] : [];
  UTAS = { 11: [{ id: 1, jenis: "BUKA", oleh: "ADMIN UTAMA", peran: "UTAMA", statusSesudah: "BELUM", isi: "", alamatSesudah: "", waktu: "31 Okt 2026 10.00" }, { id: 2, jenis: "BALAS", oleh: "<svg onload=window.__xss=8>NN", peran: "UTAMA", statusSesudah: "BELUM", isi: "<img src=x onerror=window.__xss=7>cek", alamatSesudah: "<i onclick=window.__xss=9>A</i>", waktu: "31 Okt 2026 10.30" }], 12: [], 13: [] };
}
const sesiDari = (token) => SESI[token] || null;
const menungguUntuk = (s) => ITEMS.filter((x) => x.menunggu === (s.role === "UTAMA" ? "UTAMA" : "GMM")).length;
const lingkup = (s) => ITEMS.filter((x) => s.role === "UTAMA" || !s.kecamatan || x.kecamatan === s.kecamatan);
function tambahUtas(i, jenis, s, isi, alamat) {
  (UTAS[i.id] = UTAS[i.id] || []).push({ id: Date.now() + Math.random(), jenis, oleh: s.namaLengkap, peran: s.role === "UTAMA" ? "UTAMA" : "GMM", statusSesudah: i.status, isi: isi || "", alamatSesudah: alamat || "", waktu: "31 Okt 2026 11.00" });
  i.jumlahPesan = UTAS[i.id].length;
}
function jawab(aksi, args) {
  aksi = String(aksi || "?");
  const s = sesiDari(args[0]);
  const A = (nama) => nama === aksi;
  if (A("pulihkanSesi")) return s ? { sukses: true, ...s, profileBelumDiisi: false, profil: { namaLengkap: s.namaLengkap, nomorHp: "0800", jabatan: "X" } } : { sukses: false, pesan: "Sesi tidak valid" };
  if (A("getMasterLayanan")) return { kecamatan: ["IMAM MASJID"], kemenag: ["GURU MAGHRIB MENGAJI"] };
  if (!aksi.startsWith("cekAlamat")) return { sukses: true };
  if (!s || (s.role !== "UTAMA" && s.role !== "GURU MAGHRIB MENGAJI")) return { sukses: false, pesan: "Akses ditolak: fitur Cek Alamat hanya untuk Admin Utama dan akun Guru Maghrib Mengaji." };
  const utama = s.role === "UTAMA";
  const cari = (id) => lingkup(s).find((x) => x.id === Number(id));
  if (A("cekAlamatLencana") && MODE_LENCANA === "gangguan") return { sukses: false, pesan: "Gagal memuat Cek Alamat: sorry, too many clients already" };
  if (A("cekAlamatLencana") && MODE_LENCANA === "belum_ada") return { sukses: false, pesan: 'Gagal memuat Cek Alamat: relation "cek_alamat_tugas" does not exist' };
  if (A("cekAlamatLencana")) return { sukses: true, peran: utama ? "UTAMA" : "GMM", kecamatan: s.kecamatan, menunggu: menungguUntuk(s), total: lingkup(s).length };
  if (A("cekAlamatRingkasan")) {
    const l = lingkup(s), n = (st) => l.filter((x) => x.status === st).length;
    return { sukses: true, peran: utama ? "UTAMA" : "GMM", kecamatan: s.kecamatan, daftar: l.length ? [{ kecamatan: "MEDAN LABUHAN", total: l.length, belum: n("BELUM"), sudahBenar: n("SUDAH_BENAR"), diperbaiki: n("DIPERBAIKI"), tidakPasti: n("TIDAK_PASTI"), dikembalikan: n("DIKEMBALIKAN"), selesai: n("SELESAI"),
      menungguGmm: l.filter((x) => x.menunggu === "GMM").length, menungguUtama: l.filter((x) => x.menunggu === "UTAMA").length, ...(utama ? { pertamaDilihat: null, terakhirDilihat: null } : {}) }] : [] };
  }
  if (A("cekAlamatDaftar")) {
    const f = args[1] || {};
    let l = lingkup(s);
    if (f.status === "MENUNGGU_SAYA") l = l.filter((x) => x.menunggu === (utama ? "UTAMA" : "GMM"));
    else if (f.status === "SEMUA") { /* semua termasuk selesai */ }
    else if (f.status) l = l.filter((x) => x.status === f.status);
    else l = l.filter((x) => x.status !== "SELESAI");   // bawaan: yang selesai disembunyikan
    if (f.cari) l = l.filter((x) => (x.nama + x.kelurahan + x.alamatTugas).toUpperCase().includes(String(f.cari).toUpperCase()));
    return { sukses: true, peran: utama ? "UTAMA" : "GMM", total: l.length, halaman: 1, ukuranHalaman: 25, daftar: JSON.parse(JSON.stringify(l)) };
  }
  if (A("cekAlamatUtas")) { const i = cari(args[1]); return i ? { sukses: true, pesan: UTAS[i.id] || [] } : { sukses: false, pesan: "Permintaan tidak ditemukan." }; }
  if (A("cekAlamatBuka")) {
    if (!utama) return { sukses: false, pesan: "Hanya Admin Utama yang dapat membuka permintaan cek." };
    const baru = SUDAH_DIBUKA ? 0 : 3;
    if (args[1] === "eksekusi") { resetServer(true); return { sukses: true, mode: "eksekusi", memenuhi: 3, sudahAda: 0, baru, pesan: baru + " permintaan baru dibuka (0 sudah ada sebelumnya)." }; }
    return { sukses: true, mode: "pratinjau", memenuhi: 3, sudahAda: 3 - baru, baru, perKecamatan: [], pesan: baru + " guru akan dibuka permintaannya (" + (3 - baru) + " sudah ada dari total 3)." };
  }
  const i = cari(args[1]);
  if (!i) return { sukses: false, pesan: "Permintaan tidak ditemukan." };
  if (A("cekAlamatJawab")) {
    if (args[2] === "SUDAH_BENAR" && args[4] !== true) return { sukses: false, pesan: "Centang pernyataan bahwa alamat tugas sudah dicocokkan dengan berkas guru." };
    i.status = args[2]; i.menunggu = "UTAMA"; tambahUtas(i, "JAWAB", s, args[3]);
    return { sukses: true, pesan: "Terjawab.", status: i.status, menunggu: i.menunggu };
  }
  if (A("cekAlamatPerbaiki")) {
    if (String(args[2]).trim().toUpperCase() === i.alamatTugas) return { sukses: false, pesan: "Alamat tugas yang diisi sama dengan yang tercatat sekarang. Isi alamat tugas yang benar sesuai berkas, atau pilih Sudah Benar." };
    i.alamatTugas = String(args[2]).trim().toUpperCase(); i.samaAlamatRumah = i.alamatTugas === i.alamatRumah; i.status = "DIPERBAIKI"; i.menunggu = "UTAMA"; tambahUtas(i, "JAWAB", s, args[3], i.alamatTugas);
    return { sukses: true, pesan: "Alamat tugas berhasil diperbaiki dan dicatat.", alamat: i.alamatTugas };
  }
  if (A("cekAlamatBalas")) { i.menunggu = utama ? "GMM" : "UTAMA"; tambahUtas(i, "BALAS", s, args[2]); return { sukses: true, pesan: "Catatan terkirim.", status: i.status, menunggu: i.menunggu }; }
  if (A("cekAlamatKembalikan")) { i.status = "DIKEMBALIKAN"; i.menunggu = "GMM"; tambahUtas(i, "KEMBALIKAN", s, args[2]); return { sukses: true, pesan: "Permintaan dikembalikan ke admin GMM." }; }
  if (A("cekAlamatSelesai")) { i.status = "SELESAI"; i.menunggu = null; tambahUtas(i, "SELESAI", s, args[2]); return { sukses: true, pesan: "Permintaan ditandai selesai." }; }
  return { sukses: false, pesan: "Aksi tidak diizinkan: " + aksi };
}
async function dialihkan(p) {
  const url = p.request.url;
  if (!/supabase\.co|\/api\/gas/.test(url)) { await kirim("Fetch.continueRequest", { requestId: p.requestId }); return; }
  if (p.request.method === "OPTIONS") { await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 204, responseHeaders: CORS, body: "" }); return; }
  let aksi = "?", args = [];
  try { const b = JSON.parse(p.request.postData || "{}"); aksi = b.action; args = b.args || []; } catch { /* abaikan */ }
  log.aksi.push({ aksi, args });
  const isi = JSON.stringify({ result: jawab(aksi, args) });
  await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200, responseHeaders: [...CORS, { name: "Content-Type", value: "application/json" }], body: Buffer.from(isi).toString("base64") });
}

// ---------------------------------------------- CDP ----------------------------------------------
async function sambung() {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch { /* tunggu */ } await tidur(250); }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); }
    else if (m.method === "Fetch.requestPaused") dialihkan(m.params);
    else if (m.method === "Runtime.exceptionThrown") galatJs.push(((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text || "?").split("\n")[0]);
  };
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
const hitung = (nama) => log.aksi.filter((a) => a.aksi === nama).length;
const tungguLog = async (nama, n, maks = 40) => { for (let i = 0; i < maks; i++) { if (hitung(nama) >= n) return true; await tidur(250); } return false; };
const terakhir = (nama) => [...log.aksi].reverse().find((a) => a.aksi === nama);

async function masukSebagai(token) {
  await kirim("Page.navigate", { url: BASE + "/robots.txt" });   // halaman statis: tidak menjalankan aplikasi dengan sesi peran sebelumnya
  await tidur(400);
  log.aksi.length = 0;
  await js(`sessionStorage.setItem('dana_jasa_sesi', JSON.stringify(${JSON.stringify(SESI[token])})); true`);
  await kirim("Page.navigate", { url: BASE + "/" });
  await tungguSampai("!!document.getElementById('tab-rekap') && document.readyState === 'complete'", "halaman siap");
  await tungguSampai("document.getElementById('modal-login').classList.contains('hidden')", "sesi tiruan diterima", 40);
  await tidur(700);
}
const teksPanel = () => js("(document.getElementById('modal-cek-alamat') || { innerText: '' }).innerText");
const klik = (sel) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
const klikTeks = (sel, teks) => js(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find(x => x.textContent.trim().includes(${JSON.stringify(teks)})); if (!e) return false; e.click(); return true; })()`);
const isiField = (sel, v) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const ukurHeader = () => js(`(() => {
  const nav = document.querySelector('nav');
  const row2 = nav.nextElementSibling;
  const t = document.getElementById('tab-cek-alamat');
  const rect = (e) => { const r = e.getBoundingClientRect(); return { kiri: Math.round(r.left), kanan: Math.round(r.right), atas: Math.round(r.top), bawah: Math.round(r.bottom) }; };
  const tampak = (b) => b.getBoundingClientRect().width > 0;
  const tombolNav = [...nav.querySelectorAll('button')].filter(tampak).map((b) => ({ id: b.id, terpotong: b.scrollWidth > b.clientWidth + 1, ...rect(b) }));
  const tombolRow2 = [...row2.querySelectorAll('button')].filter(tampak).map((b) => ({ id: b.id, ...rect(b) }));
  let tanpa = row2.scrollWidth; if (t) { const d = t.style.display; t.style.display = 'none'; tanpa = row2.scrollWidth; t.style.display = d; }
  const tumpang = (a) => { const h = []; for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) { const x = a[i], y = a[j]; if (x.kiri < y.kanan - 1 && y.kiri < x.kanan - 1 && x.atas < y.bawah - 1 && y.atas < x.bawah - 1) h.push(x.id + '|' + y.id); } return h; };
  return JSON.stringify({ lebar: innerWidth, saya: t ? rect(t) : null, dalamNav: !!(t && nav.contains(t)), nav: { tumpang: tumpang(tombolNav), terpotong: tombolNav.filter((b) => b.terpotong).map((b) => b.id), tombol: tombolNav.length }, row2: { scroll: row2.scrollWidth, klien: row2.clientWidth, tanpa, tumpang: tumpang(tombolRow2), klienKiri: Math.round(row2.getBoundingClientRect().left), klienKanan: Math.round(row2.getBoundingClientRect().right) } });
})()`).then(JSON.parse);
const fotoHeader = async (nama) => { const r = await js("(() => { const h = document.querySelector('header') || document.querySelector('nav').parentElement; const b = h.getBoundingClientRect(); return JSON.stringify({ x: 0, y: Math.max(0, Math.round(b.top)), width: innerWidth, height: Math.min(Math.round(b.height) + 8, 400), scale: 1 }); })()").then(JSON.parse); const sh = await kirim("Page.captureScreenshot", { format: "png", clip: r }); fs.writeFileSync(path.join(OUT, nama), Buffer.from(sh.result.data, "base64")); };
// Header diukur di 3 lebar layar (390 ponsel, 768 tablet, 1280 desktop): tidak ada tombol yang saling menimpa/terpotong, dan tombol baru
// berada di baris 2 (bukan baris navigasi atas yang lebarnya tetap 485 px).
const cekHeader = async (peran, foto) => {
  for (const [lebar, tinggi, mobile] of [[390, 900, true], [768, 900, false], [1280, 800, false]]) {
    await kirim("Emulation.setDeviceMetricsOverride", { width: lebar, height: tinggi, deviceScaleFactor: lebar === 390 ? 2 : 1, mobile });
    await tidur(400);
    const h = await ukurHeader();
    const tag = peran + " " + lebar + " px";
    cek("HEADER " + tag + ": tombol Cek Alamat ada di baris 2 header, bukan di baris navigasi atas", !!h.saya && !h.dalamNav, JSON.stringify(h));
    cek("HEADER " + tag + ": tidak ada tombol yang saling menimpa (baris navigasi dan baris 2)", h.nav.tumpang.length === 0 && h.row2.tumpang.length === 0, JSON.stringify(h));
    cek("HEADER " + tag + ": teks tombol di baris navigasi tidak terpotong (mis. 'Input Data' utuh)", h.nav.terpotong.length === 0, JSON.stringify(h));
    cek("HEADER " + tag + ": tombol baru menambah lebar baris 2 tidak lebih dari lebar tombolnya (<= 44 px)", h.row2.scroll - h.row2.tanpa <= 44, JSON.stringify(h));
    if (peran === "GMM") cek("HEADER " + tag + ": tombol baru terlihat penuh di dalam layar (akun GMM)", h.saya.kiri >= 0 && h.saya.kanan <= h.lebar, JSON.stringify(h));
    if (foto && lebar === 1280) await fotoHeader(foto);
  }
  await kirim("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 2, mobile: true });
  await tidur(300);
};
async function tutupSemuaOverlay() { await js(`(() => { const p = document.getElementById('modal-cek-alamat-popup'); if (p) p.remove(); return true; })()`); }

try {
  await sambung();
  await kirim("Runtime.enable"); await kirim("Page.enable");
  await kirim("Fetch.enable", { patterns: [{ urlPattern: "*supabase.co*" }, { urlPattern: "*api/gas*" }] });
  await kirim("Page.addScriptToEvaluateOnNewDocument", { source: `
    if (location.origin === ${JSON.stringify(BASE)}) {
      window.WebSocket = class { constructor(){ this.readyState = 3; } send(){} close(){} addEventListener(){} removeEventListener(){} };
      window.confirm = function(){ return window.__konfirmasi !== false; };
    }` });
  await kirim("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 2, mobile: true });

  // ======================= akun GMM (Labuhan) =======================
  resetServer(true);
  await masukSebagai("T-GMM");
  await tungguSampai("!!document.getElementById('tab-cek-alamat')", "tab Cek Alamat muncul", 40);
  cek("GMM: modul dimuat malas dan tab 'Cek Alamat' muncul", true);
  cek("GMM: lencana tab menampilkan 3", (await js("document.getElementById('tab-cek-alamat-angka').textContent")) === "3");
  cek("GMM: lencana tab terlihat (bukan tersembunyi)", await js("!document.getElementById('tab-cek-alamat-angka').classList.contains('hidden')"));
  cek("GMM: pita pengingat tampil dengan jumlah", await js("(() => { const p = document.getElementById('pita-cek-alamat'); return !!p && !p.classList.contains('hidden') && /3 guru menunggu/.test(p.textContent); })()"));
  await tungguSampai("!!document.getElementById('modal-cek-alamat-popup')", "pop-up muncul", 30);
  cek("GMM: pop-up saat masuk menyebut 3 guru dan kecamatan", await js("(() => { const t = document.getElementById('modal-cek-alamat-popup').innerText; return /3\\s+guru Maghrib Mengaji/.test(t) && /MEDAN LABUHAN/.test(t); })()"));
  await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(path.join(OUT, "cek-alamat-1-popup.png"), Buffer.from(s.result.data, "base64")));
  // Kedua tombol pop-up harus TERLIHAT (latar tidak transparan, ukuran wajar), di ponsel maupun desktop.
  for (const [lebar, tinggi, mobile] of [[390, 900, true], [1280, 800, false]]) {
    await kirim("Emulation.setDeviceMetricsOverride", { width: lebar, height: tinggi, deviceScaleFactor: 1, mobile });
    await tidur(300);
    const tb = await js("(() => { const gaya = (id) => { const b = document.getElementById(id); if (!b) return null; const cs = getComputedStyle(b); const r = b.getBoundingClientRect(); return { lebar: Math.round(r.width), tinggi: Math.round(r.height), latar: cs.backgroundColor, warna: cs.color, tampil: cs.display + '/' + cs.visibility + '/' + cs.opacity }; }; return JSON.stringify({ nanti: gaya('modal-cek-alamat-popup-nanti'), buka: gaya('modal-cek-alamat-popup-buka') }); })()").then(JSON.parse);
    console.log("INFO tombol pop-up " + lebar + " px:", JSON.stringify(tb));
    cek("Pop-up " + lebar + " px: tombol 'Buka Cek Alamat' TERLIHAT (latar berwarna, tidak transparan)", !!tb.buka && tb.buka.lebar > 60 && tb.buka.tinggi > 20 && tb.buka.latar !== "rgba(0, 0, 0, 0)" && tb.buka.latar !== "transparent", JSON.stringify(tb));
    if (lebar === 1280) await kirim("Page.captureScreenshot", { format: "png" }).then((sh) => fs.writeFileSync(path.join(OUT, "cek-alamat-6-popup-desktop.png"), Buffer.from(sh.result.data, "base64")));
  }
  await kirim("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 2, mobile: true });
  await klik("#modal-cek-alamat-popup-nanti");
  await cekHeader("GMM", "cek-alamat-4-header-gmm.png");
  cek("GMM: 'Nanti' menutup pop-up", await js("!document.getElementById('modal-cek-alamat-popup')"));
  await kirim("Page.navigate", { url: BASE + "/" });
  await tungguSampai("!!document.getElementById('tab-cek-alamat')", "tab setelah muat ulang", 40);
  await tidur(1500);
  cek("GMM: pop-up TIDAK muncul lagi di sesi yang sama setelah muat ulang", await js("!document.getElementById('modal-cek-alamat-popup')"));

  await klik("#tab-cek-alamat");
  await tungguSampai("document.querySelectorAll('#cka-daftar article').length === 3", "3 kartu guru", 40);
  cek("GMM: panel menampilkan 3 kartu", true);
  cek("GMM: membuka panel mencatat 'dilihat' (cekAlamatLencana dengan catatDilihat=true)", log.aksi.some((a) => a.aksi === "cekAlamatLencana" && a.args[1] === true));
  cek("GMM: pilihan kecamatan disembunyikan (akun satu kecamatan)", await js("document.getElementById('cka-kec-bungkus').classList.contains('hidden')"));
  cek("GMM: tombol 'Buka Permintaan Cek' TIDAK ada", !(await teksPanel()).includes("Buka Permintaan Cek"));
  cek("GMM: pilihan filter bernama 'Perlu saya cek' (bukan 'Menunggu saya')", (await js("[...document.querySelectorAll('#cka-status option')].map(o => o.value + '=' + o.textContent.trim()).join('|')")).includes("MENUNGGU_SAYA=Perlu saya cek") && !(await js("document.getElementById('cka-status').innerText")).includes("Menunggu saya"));
  let t = await teksPanel();
  cek("GMM: kartu memuat tempat tugas, alamat tugas, dan alamat rumah pembanding", /Tempat tugas/.test(t) && /JL\. A NO 1/.test(t) && /Alamat rumah \(pembanding\)/.test(t) && /JL\. Z NO 9/.test(t), t.slice(0, 300));
  cek("GMM: penanda 'SAMA dengan alamat tugas' pada guru yang alamatnya sama (2 dari 3)", ((t.match(/SAMA dengan alamat tugas/g)) || []).length === 2, String((t.match(/SAMA dengan alamat tugas/g) || []).length));
  cek("XSS: nama berisi HTML tampil sebagai TEKS dan tidak dieksekusi", t.includes("<img src=x onerror=window.__xss=1>CICI") && (await js("window.__xss === undefined")));
  cek("XSS: SEMUA kolom teks kartu (kelurahan, tempat tugas, alamat tugas, alamat rumah) tampil sebagai teks, tidak dieksekusi", t.includes("<b onclick=window.__xss=3>KELX</b>") && t.includes("RUMAH<svg onload=window.__xss=4>") && t.includes("JL C NO 3<img src=x onerror=window.__xss=5>") && t.includes("<script>window.__xss=6</script>JL C NO 3") && (await js("window.__xss === undefined && !document.querySelector('#cka-daftar script, #cka-daftar svg[onload], #cka-daftar b[onclick]')")));
  cek("XSS: tautan peta 'javascript:' TIDAK dirender; tautan https dirender dengan rel noopener", await js(`(() => { const a = [...document.querySelectorAll('#cka-daftar a')]; return a.length === 2 && a.every(x => /^https:/.test(x.href) && /noopener/.test(x.rel) && x.target === '_blank'); })()`));
  cek("GMM: tombol aksi Utama (Kembalikan/Selesai) TIDAK tampil", !/Kembalikan|Selesai/.test(await js("[...document.querySelectorAll('#cka-daftar button')].map(b => b.textContent).join('|')")));
  cek("tampilan 390 px: tidak ada gulir mendatar", await js("document.documentElement.scrollWidth <= innerWidth"));
  await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(path.join(OUT, "cek-alamat-2-panel-gmm.png"), Buffer.from(s.result.data, "base64")));

  // --- Sudah benar ---
  await klikTeks("#cka-daftar article:nth-of-type(1) button", "Sudah benar");
  await klikTeks("#cka-daftar article:nth-of-type(1) button", "Kirim: sudah benar");
  cek("Sudah benar tanpa centang: kesalahan di layar dan TANPA panggilan ke server", /Centang pernyataan/.test(await teksPanel()) && hitung("cekAlamatJawab") === 0);
  await klik("#cka-daftar article:nth-of-type(1) input[type=checkbox]");
  await klikTeks("#cka-daftar article:nth-of-type(1) button", "Kirim: sudah benar");
  await tungguLog("cekAlamatJawab", 1);
  await tungguSampai("[...document.querySelectorAll('#cka-daftar article:nth-of-type(1) span')].some(x => x.className.includes('rounded-full') && x.textContent.trim() === 'Sudah benar')", "lencana status sudah benar", 30);
  const j = terakhir("cekAlamatJawab");
  cek("Sudah benar dikirim dengan argumen tepat [id, 'SUDAH_BENAR', catatan, true]", j && j.args[1] === 11 && j.args[2] === "SUDAH_BENAR" && j.args[4] === true, JSON.stringify(j));
  await tungguSampai("document.getElementById('tab-cek-alamat-angka').textContent === '2'", "lencana turun menjadi 2", 30).catch(() => {});
  cek("lencana turun menjadi 2 setelah menjawab", (await js("document.getElementById('tab-cek-alamat-angka').textContent")) === "2");

  // --- Perbaiki alamat tugas ---
  await klikTeks("#cka-daftar article:nth-of-type(2) button", "Perbaiki alamat tugas");
  await isiField("#cka-daftar article:nth-of-type(2) input[data-field=alamat]", "jl. b no 2");
  await klikTeks("#cka-daftar article:nth-of-type(2) button", "Simpan perbaikan alamat tugas");
  await tungguSampai("/sama dengan yang tercatat/.test(document.getElementById('modal-cek-alamat').innerText)", "galat server tampil", 30);
  cek("Perbaiki dengan alamat yang sama: pesan galat dari server tampil di kartu; status tidak berubah", (await js("document.querySelector('#cka-daftar article:nth-of-type(2)').innerText")).includes("Belum dicek"));
  await isiField("#cka-daftar article:nth-of-type(2) input[data-field=alamat]", "jl. mandor no 5");
  await klikTeks("#cka-daftar article:nth-of-type(2) button", "Simpan perbaikan alamat tugas");
  await tungguSampai("document.querySelector('#cka-daftar article:nth-of-type(2)').innerText.includes('JL. MANDOR NO 5')", "alamat berubah di kartu", 30);
  const pb = terakhir("cekAlamatPerbaiki");
  cek("Perbaikan dikirim [id, alamat, catatan] dan kartu menampilkan alamat baru + status 'Sudah diperbaiki'", pb && pb.args[1] === 12 && pb.args[2] === "jl. mandor no 5" && (await js("document.querySelector('#cka-daftar article:nth-of-type(2)').innerText")).includes("Sudah diperbaiki"), JSON.stringify(pb));
  {
    await js("window.__konfirmasi = false; true");
    await klikTeks("#cka-daftar article:nth-of-type(3) button", "Perbaiki alamat tugas");
    await isiField("#cka-daftar article:nth-of-type(3) input[data-field=alamat]", "jl. baru no 9");
    const sebelum = hitung("cekAlamatPerbaiki");
    await klikTeks("#cka-daftar article:nth-of-type(3) button", "Simpan perbaikan alamat tugas");
    await tidur(500);
    cek("Menolak dialog konfirmasi 'Dari ... Menjadi ...': TIDAK ada panggilan ke server", hitung("cekAlamatPerbaiki") === sebelum);
    await js("window.__konfirmasi = true; true");
    await klikTeks("#cka-daftar article:nth-of-type(3) button", "Batal");
  }

  // --- Belum pasti: alasan wajib ---
  await klikTeks("#cka-daftar article:nth-of-type(3) button", "Belum pasti");
  await klikTeks("#cka-daftar article:nth-of-type(3) button", "Kirim: belum pasti");
  cek("Belum pasti tanpa alasan: kesalahan di layar, tanpa panggilan", /Alasan wajib diisi/.test(await teksPanel()) && hitung("cekAlamatJawab") === 1);
  await isiField("#cka-daftar article:nth-of-type(3) textarea", "berkas guru belum ada");
  await klikTeks("#cka-daftar article:nth-of-type(3) button", "Kirim: belum pasti");
  await tungguLog("cekAlamatJawab", 2);
  await tungguSampai("[...document.querySelectorAll('#cka-daftar article:nth-of-type(3) span')].some(x => x.className.includes('rounded-full') && x.textContent.trim() === 'Belum pasti')", "lencana status belum pasti", 30);
  cek("Belum pasti terkirim dengan alasan", terakhir("cekAlamatJawab").args[2] === "TIDAK_PASTI" && terakhir("cekAlamatJawab").args[3] === "berkas guru belum ada");
  await tungguSampai("document.getElementById('tab-cek-alamat-angka').classList.contains('hidden')", "lencana hilang", 30).catch(() => {});
  cek("lencana GMM menjadi 0 (semua sudah dijawab)", await js("document.getElementById('tab-cek-alamat-angka').classList.contains('hidden')"));

  // --- Utas dua arah ---
  await klikTeks("#cka-daftar article:nth-of-type(1) button", "Utas (");
  await tungguSampai("/membuka permintaan/.test(document.querySelector('#cka-daftar article:nth-of-type(1)').innerText)", "utas termuat", 30);
  cek("XSS: isi/nama pengirim/alamat di UTAS tampil sebagai teks, tidak dieksekusi", /<img src=x onerror=window.__xss=7>cek/.test(await teksPanel()) && /<svg onload=window.__xss=8>NN/.test(await teksPanel()) && (await js("window.__xss === undefined && !document.querySelector('#cka-daftar article:nth-of-type(1) i[onclick], #cka-daftar article:nth-of-type(1) svg[onload]')")));
  cek("Utas menampilkan 'ADMIN UTAMA (Admin Utama) membuka permintaan' dan jawaban GMM", /ADMIN UTAMA \(Admin Utama\) membuka permintaan/.test(await teksPanel()) && /GURU LABUHAN \(Admin GMM\) menjawab/.test(await teksPanel()));
  await klikTeks("#cka-daftar article:nth-of-type(1) button", "Tulis catatan");
  await klikTeks("#cka-daftar article:nth-of-type(1) button", "Kirim catatan");
  cek("Catatan kosong ditolak di layar (tanpa panggilan)", /Catatan wajib diisi/.test(await teksPanel()) && hitung("cekAlamatBalas") === 0);
  await isiField("#cka-daftar article:nth-of-type(1) textarea", "Alamat di berkas halaman 2");
  await klikTeks("#cka-daftar article:nth-of-type(1) button", "Kirim catatan");
  await tungguSampai("/Alamat di berkas halaman 2/.test(document.querySelector('#cka-daftar article:nth-of-type(1)').innerText)", "catatan muncul di utas", 30);
  cek("Catatan balasan terkirim [id, isi] dan muncul di utas", terakhir("cekAlamatBalas").args[1] === 11 && terakhir("cekAlamatBalas").args[2] === "Alamat di berkas halaman 2");
  // --- penjaga isian yang belum dikirim ---
  await klikTeks("#cka-daftar article:nth-of-type(2) button", "Tulis catatan");
  await isiField("#cka-daftar article:nth-of-type(2) textarea", "catatan yang belum dikirim");
  await js("document.getElementById('modal-cek-alamat').click(); true");
  cek("Klik di luar panel saat ada isian yang belum dikirim: panel TETAP terbuka", await js("!document.getElementById('modal-cek-alamat').classList.contains('hidden')"));
  await js("window.__konfirmasi = false; true");
  await klik("#cka-tutup");
  cek("Tombol Tutup dengan isian belum dikirim lalu menolak konfirmasi: panel TETAP terbuka dan isian masih ada", (await js("!document.getElementById('modal-cek-alamat').classList.contains('hidden')")) && (await js("document.querySelector('#cka-daftar article:nth-of-type(2) textarea').value")) === "catatan yang belum dikirim");
  await js("window.__konfirmasi = true; true");
  await tutupSemuaOverlay();
  await klik("#cka-tutup");
  cek("Tombol Tutup setelah menyetujui konfirmasi: panel tertutup", await js("document.getElementById('modal-cek-alamat').classList.contains('hidden')"));
  await klik("#tab-cek-alamat");
  await tungguSampai("document.querySelectorAll('#cka-daftar article').length === 3", "panel dibuka lagi", 40);
  cek("Panel dibuka lagi: isian lama TIDAK tersisa (kartu bersih)", (await js("document.querySelectorAll('#cka-daftar textarea').length")) === 0);
  cek("Fokus dipindah ke dalam panel saat dibuka (modal-a11y)", await js("document.getElementById('modal-cek-alamat').contains(document.activeElement)"));
  await tutupSemuaOverlay();
  await klik("#cka-tutup");
  cek("Menutup panel: data guru dibuang dari memori halaman (tidak tersisa di DOM)", await js("!/ANI|BUDI/.test(document.getElementById('modal-cek-alamat').innerText.replace(/Cek Alamat Tugas Guru Maghrib Mengaji/,''))"));

  // ======================= Admin Utama =======================
  resetServer(false);
  MODE_LENCANA = "gangguan";
  await masukSebagai("T-UTAMA");
  await tungguSampai("typeof window.bukaCekAlamat === 'function'", "modul dimuat saat gangguan", 40);
  await tidur(1500);
  cek("Gangguan SEMENTARA (DB penuh): tab Admin Utama TIDAK hilang", await js("!!document.getElementById('tab-cek-alamat')"));
  MODE_LENCANA = "belum_ada";
  await masukSebagai("T-UTAMA");
  await tungguSampai("typeof window.bukaCekAlamat === 'function'", "modul dimuat saat migrasi belum ada", 40);
  await tidur(1500);
  cek("Migrasi belum diterapkan ('does not exist'): tab disembunyikan, tanpa toast galat", (await js("!document.getElementById('tab-cek-alamat')")) && !(await js("document.body.innerText.includes('does not exist')")));
  MODE_LENCANA = "normal";
  await masukSebagai("T-UTAMA");
  await tungguSampai("!!document.getElementById('tab-cek-alamat')", "tab untuk UTAMA (walau belum ada permintaan)", 40);
  cek("UTAMA: tab 'Cek Alamat' ada walau belum ada permintaan; tanpa lencana", await js("document.getElementById('tab-cek-alamat-angka').classList.contains('hidden')"));
  await cekHeader("UTAMA", "cek-alamat-5-header-utama.png");
  cek("UTAMA: tidak ada pop-up (khusus akun GMM)", await js("!document.getElementById('modal-cek-alamat-popup')"));
  await klik("#tab-cek-alamat");
  await tungguSampai("/Belum ada permintaan/.test(document.getElementById('modal-cek-alamat').innerText)", "keadaan kosong", 30);
  cek("UTAMA: keadaan kosong mengarahkan ke 'Buka Permintaan Cek'", true);
  cek("UTAMA: pilihan filter bernama 'Perlu saya tinjau' (bukan 'Menunggu saya')", (await js("[...document.querySelectorAll('#cka-status option')].map(o => o.value + '=' + o.textContent.trim()).join('|')")).includes("MENUNGGU_SAYA=Perlu saya tinjau") && !(await js("document.getElementById('cka-status').innerText")).includes("Menunggu saya"));
  await klikTeks("#modal-cek-alamat button", "Buka Permintaan Cek");
  await klikTeks("#cka-buka button", "Pratinjau");
  await tungguSampai("/3 guru akan dibuka/.test(document.getElementById('cka-buka').innerText)", "pratinjau", 30);
  cek("UTAMA: pratinjau tidak menulis (mode 'pratinjau'), menampilkan jumlah, dan tombol konfirmasi", terakhir("cekAlamatBuka").args[1] === "pratinjau" && /Ya, buka 3 permintaan/.test(await teksPanel()));
  await klikTeks("#cka-buka button", "Ya, buka 3 permintaan");
  await tungguSampai("document.querySelectorAll('#cka-daftar article').length === 3", "3 kartu setelah dibuka", 40);
  cek("UTAMA: eksekusi dikirim sebagai mode 'eksekusi' dan daftar terisi 3 kartu", terakhir("cekAlamatBuka").args[1] === "eksekusi");
  cek("UTAMA: tabel ringkasan per kecamatan menampilkan 'belum pernah' dibuka", /belum pernah/.test(await js("document.getElementById('cka-ringkasan').innerHTML")));
  cek("UTAMA: tombol Perbaiki/Sudah benar (khusus GMM) TIDAK tampil", !/Perbaiki alamat tugas|Sudah benar|Belum pasti/.test(await js("[...document.querySelectorAll('#cka-daftar button')].map(b => b.textContent).join('|')")));
  // GMM telah menjawab satu data (keadaan server tiruan): UTAMA meninjau
  ITEMS[0].status = "SUDAH_BENAR"; ITEMS[0].menunggu = "UTAMA";
  await klik("#cka-tampil");
  await tungguSampai("document.querySelector('#cka-daftar article:nth-of-type(1)').innerText.includes('Sudah benar')", "status terbaru", 30);
  await klikTeks("#cka-daftar article:nth-of-type(1) button", "Kembalikan");
  await klikTeks("#cka-daftar article:nth-of-type(1) button", "Kembalikan ke admin GMM");
  cek("UTAMA: Kembalikan tanpa alasan ditolak di layar (tanpa panggilan)", /Alasan wajib diisi/.test(await teksPanel()) && hitung("cekAlamatKembalikan") === 0);
  await isiField("#cka-daftar article:nth-of-type(1) textarea", "Alamat masih sama dengan rumah");
  await klikTeks("#cka-daftar article:nth-of-type(1) button", "Kembalikan ke admin GMM");
  await tungguSampai("document.querySelector('#cka-daftar article:nth-of-type(1)').innerText.includes('Dikembalikan')", "dikembalikan", 30);
  cek("UTAMA: Kembalikan terkirim dengan alasan; status 'Dikembalikan', menunggu admin GMM", terakhir("cekAlamatKembalikan").args[2] === "Alamat masih sama dengan rumah" && /Menunggu admin GMM/.test(await teksPanel()));
  await klikTeks("#cka-daftar article:nth-of-type(2) button", "Selesai");
  await klikTeks("#cka-daftar article:nth-of-type(2) button", "Tandai selesai");
  cek("UTAMA: menutup tanpa jawaban wajib beralasan (kesalahan di layar, tanpa panggilan)", /Alasan wajib diisi/.test(await teksPanel()) && hitung("cekAlamatSelesai") === 0);
  // --- Tandai selesai: kartu HILANG dari layar (daftar bawaan), tetap dapat dilihat lewat filter 'Selesai'/'Semua' ---
  await isiField("#cka-daftar article:nth-of-type(2) textarea", "bukan guru GMM lagi");
  await klikTeks("#cka-daftar article:nth-of-type(2) button", "Tandai selesai");
  await tungguLog("cekAlamatSelesai", 1);
  await tungguSampai("document.querySelectorAll('#cka-daftar article').length === 2", "kartu selesai hilang dari layar", 30);
  const sesudahSelesai = await teksPanel();
  cek("Tandai selesai terkirim [id, catatan] dan kartu guru itu HILANG dari layar (daftar turun dari 3 ke 2 kartu)", terakhir("cekAlamatSelesai").args[1] === 12 && terakhir("cekAlamatSelesai").args[2] === "bukan guru GMM lagi" && !sesudahSelesai.includes("BUDI") && /2 guru/.test(sesudahSelesai), sesudahSelesai.slice(0, 200));
  cek("Filter bawaan bernama 'Belum selesai' dan pilihan 'Semua (termasuk selesai)' tersedia", (await js("[...document.querySelectorAll('#cka-status option')].map(o => o.value + '=' + o.textContent.trim()).join('|')")).includes("=Belum selesai") && (await js("document.getElementById('cka-status').innerText")).includes("Semua (termasuk selesai)"));
  await js("(() => { const e = document.getElementById('cka-status'); e.value = 'SELESAI'; e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()");
  await tungguSampai("document.querySelectorAll('#cka-daftar article').length === 1", "filter Selesai", 30);
  cek("Filter 'Selesai' menampilkan guru yang sudah selesai (BUDI) dengan tombol Kembalikan untuk membuka ulang", /BUDI/.test(await teksPanel()) && (await js("[...document.querySelectorAll('#cka-daftar article button')].some(b => b.textContent.trim() === 'Kembalikan')")));
  await js("(() => { const e = document.getElementById('cka-status'); e.value = 'SEMUA'; e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()");
  await tungguSampai("document.querySelectorAll('#cka-daftar article').length === 3", "filter Semua", 30);
  cek("Filter 'Semua (termasuk selesai)' menampilkan ketiga guru", true);
  await js("(() => { const e = document.getElementById('cka-status'); e.value = ''; e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()");
  await tungguSampai("document.querySelectorAll('#cka-daftar article').length === 2", "kembali ke bawaan", 30);
  cek("Daftar bawaan menyebut jumlah 'belum selesai' (bukan total seluruh permintaan)", /2 guru belum selesai/.test(await js("document.getElementById('cka-info').innerText")));
  // Mencari guru yang sudah selesai di daftar bawaan: bukan "tidak ada data" yang menyesatkan, melainkan petunjuk memakai 'Semua'.
  await isiField("#cka-cari", "BUDI");
  await klik("#cka-tampil");
  await tungguSampai("document.querySelectorAll('#cka-daftar article').length === 0", "pencarian guru yang selesai", 30);
  cek("Mencari guru yang sudah selesai di daftar bawaan: muncul petunjuk 'coba filter Semua (termasuk selesai)', bukan 'tidak ada data' polos", (await js("document.getElementById('cka-daftar').innerText")).includes("coba filter") && (await js("document.getElementById('cka-daftar').innerText")).includes("disembunyikan"));
  await isiField("#cka-cari", "");
  await klik("#cka-tampil");
  await tungguSampai("document.querySelectorAll('#cka-daftar article').length === 2", "pencarian dikosongkan", 30);
  await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(path.join(OUT, "cek-alamat-3-panel-utama.png"), Buffer.from(s.result.data, "base64")));
  cek("UTAMA 390 px: tidak ada gulir mendatar", await js("document.documentElement.scrollWidth <= innerWidth"));
  await klikTeks("#cka-daftar article:nth-of-type(2) button", "Batal");
  const lencanaSebelumEsc = hitung("cekAlamatLencana");
  await kirim("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await kirim("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await tidur(400);
  cek("ESC menutup panel (lewat modal-a11y), dan penutupan berjalan TEPAT sekali (satu penyegaran lencana)", (await js("document.getElementById('modal-cek-alamat').classList.contains('hidden')")) && hitung("cekAlamatLencana") - lencanaSebelumEsc === 1, "delta=" + (hitung("cekAlamatLencana") - lencanaSebelumEsc));


  // ======================= peran lain: tidak ada fitur =======================
  for (const token of ["T-KEC", "T-MUI"]) {
    resetServer(true);
    await masukSebagai(token);
    await tidur(1500);
    cek(`${SESI[token].role}: tidak ada tab, tidak ada pita, modul tidak dimuat, dan tidak memanggil aksi cekAlamat*`,
      (await js("!document.getElementById('tab-cek-alamat') && !document.getElementById('pita-cek-alamat') && typeof window.bukaCekAlamat === 'undefined'")) && log.aksi.every((a) => !a.aksi.startsWith("cekAlamat")));
  }
  cek("tidak ada galat JavaScript tak tertangani selama seluruh uji", galatJs.length === 0, galatJs.join(" | "));
} catch (err) { console.log("GALAT HARNESS: " + err.message); gagal++; }
finally { try { ws && ws.close(); } catch { /* abaikan */ } chrome.kill(); await tidur(500); try { fs.rmSync(profil, { recursive: true, force: true }); } catch { /* abaikan */ } }
console.log(gagal === 0 ? "\nSEMUA LULUS" : `\n${gagal} GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
