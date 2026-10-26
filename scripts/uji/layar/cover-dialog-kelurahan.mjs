// Dialog "Unduh Cover Berkas Penerima": dropdown Kelurahan (berantai, pasangan kecamatan||kelurahan), unduhan, regresi, layar HP.
// Uji MANUAL di Chrome sungguhan (BUKAN bagian dari "npm run uji:cover"). Plan: plans/plan-perbaikan-unduh-cover-dan-dropdown-kelurahan.md.
// Jalankan:  node scripts/uji/layar/cover-dialog-kelurahan.mjs
// Syarat: Chrome terpasang (atau set env CHROME_PATH), dan server lokal berjalan:  npx vite --port 3123 --strictPort
// Aman: server TIRUAN (jaringan dicegat; tidak ada permintaan ke server asli), WebSocket realtime dimatikan.
// Opsional: BASE_URL=https://djpmkotamedan.web.id memeriksa versi yang sudah live (data tetap tiruan; sesi tiruan hanya di browser uji).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9337, BASE = process.env.BASE_URL || "http://localhost:3123";
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-chrome-"));
const unduhan = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-unduh-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=1200,1000", "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map();
const CORS = [{ name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Headers", value: "*" }, { name: "Access-Control-Allow-Methods", value: "*" }];

// Data tiruan: dua kecamatan memiliki kelurahan BERNAMA SAMA ("KELURAHAN KEMBAR"); satu kelurahan kosong.
const KELOMPOK = [["MEDAN SELAYANG", "TANJUNG SARI", 120], ["MEDAN SELAYANG", "SEMPAKATA", 90], ["MEDAN SELAYANG", "PADANG BULAN", 40], ["MEDAN MAIMUN", "KELURAHAN KEMBAR", 100], ["MEDAN LABUHAN", "KELURAHAN KEMBAR", 50], ["MEDAN LABUHAN", "", 7]];
function buatBaris(kelompok) {
  const out = []; let n = 0;
  for (const [kec, kel, jml] of kelompok) for (let i = 0; i < jml; i++) { n++; out.push({ nama: "PENERIMA " + n, nik: String(1271010000000000 + n), jenisKelamin: "LAKI-LAKI", tempatLahir: "MEDAN", tanggalLahir: "01-01-1980", alamat: "JL CONTOH " + n, layanan: n % 2 ? "IMAM MASJID" : "GURU MAGHRIB MENGAJI", tempatTugas: "TEMPAT " + n, alamatTugas: "JL TUGAS " + n, kecamatan: kec, kelurahan: kel, namaRekening: "NAMA " + n, nomorRekening: "12345678901234", kantorCabang: "BANK", noKontak: "0812345678", statusBpjsTk: "YA", umur: 46, status: "Memenuhi Syarat", tglStatus: "01-01-2027" }); }
  return out;
}
let BARIS_AKTIF = buatBaris(KELOMPOK);
function jawab(aksi) {
  switch (aksi) {
    case "pulihkanSesi": return { sukses: true, token: "TOKEN-UJI", username: "admin", role: "UTAMA", kecamatan: "", userId: "", profileBelumDiisi: false, profil: { namaLengkap: "ADMIN UJI", nomorHp: "0800", jabatan: "X" } };
    case "ambilDataDetail": return { sukses: true, rows: BARIS_AKTIF, tahun: 2027 };
    case "getMasterLayanan": return { kecamatan: ["IMAM MASJID"], kemenag: ["GURU MAGHRIB MENGAJI"] };
    default: return { sukses: true };
  }
}
async function dialihkan(p) {
  if (!/supabase\.co|\/api\/gas/.test(p.request.url)) { await kirim("Fetch.continueRequest", { requestId: p.requestId }); return; }
  if (p.request.method === "OPTIONS") { await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 204, responseHeaders: CORS, body: "" }); return; }
  let aksi = "?"; try { aksi = JSON.parse(p.request.postData || "{}").action; } catch { /* abaikan */ }
  await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200, responseHeaders: [...CORS, { name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify({ result: jawab(aksi) })).toString("base64") });
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
  if (m.result.exceptionDetails) throw new Error("JS galat: " + JSON.stringify(m.result.exceptionDetails).slice(0, 300));
  return m.result.result.value;
}
async function tungguSampai(ekspresi, label, maks = 80) { for (let i = 0; i < maks; i++) { if (await js(ekspresi)) return true; await tidur(250); } throw new Error("Timeout: " + label); }
let gagal = 0;
function cek(nama, kondisi, rinci = "") { console.log((kondisi ? "LULUS  " : "GAGAL  ") + nama + (kondisi ? "" : "  -> " + rinci)); if (!kondisi) gagal++; }
const halamanPdf = (berkas) => (fs.readFileSync(berkas, "latin1").match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
const sebelumUnduh = () => new Set(fs.readdirSync(unduhan));
// Hanya PDF yang dihitung (Chrome kadang menulis berkas pembantu seperti downloads.htm atau *.crdownload ke folder unduhan).
const berkasBaru = (awal) => fs.readdirSync(unduhan).filter((f) => !awal.has(f) && f.endsWith(".pdf"));

// FOTO=1: simpan tangkapan layar dialog ke folder temp (djpm_cover_*.png) untuk diperiksa dengan mata.
const foto = async (nama) => { if (!process.env.FOTO) return; const f = await kirim("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(os.tmpdir(), "djpm_cover_" + nama + ".png"), Buffer.from(f.result.data, "base64")); };
const dlg = (ekspr) => js(`(()=>{const d=document.getElementById('dialog-cover-berkas'); if(!d) return null; ${ekspr}})()`);
const labelSelect = () => dlg(`return JSON.stringify([...d.querySelectorAll('label')].map(l=>l.firstChild.textContent))`).then(JSON.parse);
const opsi = (i) => dlg(`return JSON.stringify([...d.querySelectorAll('select')[${i}].options].map(o=>({t:o.textContent,v:o.value})))`).then(JSON.parse);
const nilaiSel = (i) => dlg(`return d.querySelectorAll('select')[${i}].value`);
const pilih = (i, v) => dlg(`const s=d.querySelectorAll('select')[${i}]; s.value=${JSON.stringify(v)}; s.dispatchEvent(new Event('change',{bubbles:true})); return s.value`);
const ringkasan = () => dlg(`return d.querySelector('p.text-xs.font-semibold').textContent`);
async function bukaDialog() {
  await js("tampilkanDataDetail(); true");
  // Tombol sudah ada saat tabel masih memuat; aplikasi menolak membuka dialog bila data belum ada ("Belum ada data..."), jadi tunggu data.
  await tungguSampai("!!document.getElementById('btn-unduh-cover-semua') && typeof _ddRows !== 'undefined' && _ddRows.length > 0", "tombol Unduh Cover PDF dan data Data Detail");
  await js("document.getElementById('btn-unduh-cover-semua').click(); true");
  await tungguSampai("!!document.getElementById('dialog-cover-berkas')", "dialog");
}
async function unduhDanTunggu() {
  const awal = sebelumUnduh();
  await dlg("[...d.querySelectorAll('button')].find(b=>b.textContent.trim()==='Unduh').click(); return true");
  for (let i = 0; i < 160; i++) { if (!(await js("!!document.getElementById('dialog-cover-berkas')"))) break; await tidur(250); }
  await tidur(1200);
  return berkasBaru(awal);
}
async function siapkanHalaman() {
  // Aplikasi menyimpan cache data (SWR) di sessionStorage; bersihkan agar data tiruan baru dipakai (sesi tiruan dipasang ulang oleh skrip awal).
  try { await js("sessionStorage.clear(); true"); } catch { /* halaman kosong */ }
  await kirim("Page.navigate", { url: BASE + "/" });
  await tungguSampai("!!(document.getElementById('btn-data-detail')) && document.getElementById('modal-login').classList.contains('hidden')", "app siap");
  await js("document.getElementById('tab-rekap').click(); true"); await tidur(600);
}

try {
  await sambung();
  await kirim("Runtime.enable"); await kirim("Page.enable");
  await kirim("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: unduhan, eventsEnabled: true });
  await kirim("Fetch.enable", { patterns: [{ urlPattern: "*supabase.co*" }, { urlPattern: "*api/gas*" }] });
  await kirim("Page.addScriptToEvaluateOnNewDocument", { source: `if (location.origin === '${new URL(BASE).origin}') { window.WebSocket = class { constructor(){ this.readyState = 3; } send(){} close(){} addEventListener(){} removeEventListener(){} }; sessionStorage.setItem('dana_jasa_sesi', JSON.stringify({ token: 'TOKEN-UJI', username: 'admin', role: 'UTAMA', kecamatan: '', userId: '', namaLengkap: 'ADMIN UJI' })); }` });
  await siapkanHalaman();
  await bukaDialog();

  // ---- struktur dialog ----
  cek("dialog memuat tiga dropdown berurutan: Kecamatan, Kelurahan, Layanan", JSON.stringify(await labelSelect()) === JSON.stringify(["Kecamatan", "Kelurahan", "Layanan"]), JSON.stringify(await labelSelect()));
  let ok = await opsi(1);
  cek("Kecamatan 'Semua': Kelurahan memuat semua pasangan (+ 'Semua kelurahan'); kembar berlabel kecamatan; kosong di akhir", ok[0].t === "Semua kelurahan" && ok.length === 1 + 6 && ok.some((o) => o.t === "KELURAHAN KEMBAR (MEDAN MAIMUN)") && ok.some((o) => o.t === "KELURAHAN KEMBAR (MEDAN LABUHAN)") && ok[ok.length - 1].t === "(TANPA KELURAHAN)", JSON.stringify(ok.map((o) => o.t)));
  await foto("desktop_awal");
  cek("awal: ringkasan = total 407 penerima", /^407 penerima/.test(await ringkasan()), await ringkasan());

  // ---- berantai ----
  await pilih(0, "MEDAN SELAYANG");
  ok = await opsi(1);
  cek("Kecamatan MEDAN SELAYANG: Kelurahan dibatasi 3 kelurahan miliknya; label polos; kembali ke 'Semua kelurahan'", ok.length === 4 && ok.map((o) => o.t).join("|") === "Semua kelurahan|PADANG BULAN|SEMPAKATA|TANJUNG SARI" && (await nilaiSel(1)) === "", JSON.stringify(ok.map((o) => o.t)));
  cek("ringkasan MEDAN SELAYANG = 250", /^250 penerima/.test(await ringkasan()), await ringkasan());
  await pilih(1, "MEDAN SELAYANG||TANJUNG SARI");
  await foto("desktop_tanjung_sari");
  cek("pilih TANJUNG SARI: ringkasan = 120", /^120 penerima/.test(await ringkasan()), await ringkasan());
  await pilih(0, "MEDAN LABUHAN");
  cek("ganti Kecamatan (yang punya >1 kelurahan) mereset Kelurahan ke 'Semua kelurahan'; tidak tersisa pilihan kecamatan lain", (await nilaiSel(1)) === "" && /^57 penerima/.test(await ringkasan()), (await nilaiSel(1)) + " | " + (await ringkasan()));
  await pilih(0, "MEDAN MAIMUN");
  cek("kecamatan yang hanya punya SATU kelurahan: kelurahan terpilih otomatis, ringkasan = 100", (await nilaiSel(1)) === "MEDAN MAIMUN||KELURAHAN KEMBAR" && /^100 penerima/.test(await ringkasan()), (await nilaiSel(1)) + " | " + (await ringkasan()));

  // ---- unduhan: satu kelurahan ----
  await pilih(0, "MEDAN SELAYANG"); await pilih(1, "MEDAN SELAYANG||TANJUNG SARI");
  let baru = await unduhDanTunggu();
  cek("unduh TANJUNG SARI: tepat 1 berkas PDF", baru.length === 1 && baru[0].endsWith(".pdf"), JSON.stringify(baru));
  cek("nama berkas memuat kecamatan + kelurahan; halaman = 120", baru.length === 1 && /^Cover-Berkas_MEDAN-SELAYANG_TANJUNG-SARI_SEMUA-LAYANAN_\d{4}-\d{2}-\d{2}\.pdf$/.test(baru[0]) && halamanPdf(path.join(unduhan, baru[0])) === 120, JSON.stringify(baru));

  // ---- kelurahan KEMBAR tidak tercampur ----
  await bukaDialog();
  await pilih(1, "MEDAN MAIMUN||KELURAHAN KEMBAR");
  cek("kembar (Maimun) dipilih saat Kecamatan 'Semua': ringkasan = 100 (bukan 150)", /^100 penerima/.test(await ringkasan()), await ringkasan());
  baru = await unduhDanTunggu();
  cek("unduh kembar Maimun: 100 halaman; nama berkas memakai kecamatan DARI PASANGAN", baru.length === 1 && halamanPdf(path.join(unduhan, baru[0])) === 100 && /^Cover-Berkas_MEDAN-MAIMUN_KELURAHAN-KEMBAR_/.test(baru[0]), JSON.stringify(baru));
  await bukaDialog();
  await pilih(1, "MEDAN LABUHAN||KELURAHAN KEMBAR");
  baru = await unduhDanTunggu();
  cek("unduh kembar Labuhan: 50 halaman (kelurahan sama nama, kecamatan lain)", baru.length === 1 && halamanPdf(path.join(unduhan, baru[0])) === 50 && /^Cover-Berkas_MEDAN-LABUHAN_KELURAHAN-KEMBAR_/.test(baru[0]), JSON.stringify(baru));

  // ---- kelurahan kosong + kombinasi dengan Layanan ----
  await bukaDialog();
  await pilih(1, "MEDAN LABUHAN||");
  cek("'(TANPA KELURAHAN)' dapat dipilih: ringkasan = 7", /^7 penerima/.test(await ringkasan()), await ringkasan());
  await pilih(1, "MEDAN SELAYANG||SEMPAKATA"); await pilih(2, "IMAM MASJID");
  const esperado = BARIS_AKTIF.filter((r) => r.kelurahan === "SEMPAKATA" && r.layanan === "IMAM MASJID").length;
  cek("Kelurahan + Layanan digabung: ringkasan sesuai", new RegExp("^" + esperado + " penerima").test(await ringkasan()), await ringkasan() + " vs " + esperado);
  await dlg("[...d.querySelectorAll('button')].find(b=>b.textContent.trim()==='Batal').click(); return true");

  // ---- "Semua": perilaku lama utuh (pemecahan 150 halaman) ----
  await bukaDialog();
  cek("'Semua' tetap dipecah per 150 halaman (407 -> 3 berkas)", /dipecah menjadi 3 berkas/.test(await ringkasan()), await ringkasan());
  baru = await unduhDanTunggu();
  const hal = baru.map((b) => halamanPdf(path.join(unduhan, b))).sort((a, b) => b - a);
  cek("unduh 'Semua': 3 berkas, 150 + 150 + 107 halaman; nama memuat SEMUA-KELURAHAN", baru.length === 3 && hal.join(",") === "150,150,107" && baru.every((b) => /^Cover-Berkas_SEMUA-KECAMATAN_SEMUA-KELURAHAN_SEMUA-LAYANAN_/.test(b)), JSON.stringify(baru) + " " + hal.join(","));

  // ---- regresi: tombol 'Cover' per baris ----
  const awalSatu = sebelumUnduh();
  await js("document.querySelector('[data-cover-nik]').click(); true");
  await tidur(2500);
  const satu = berkasBaru(awalSatu);
  cek("tombol 'Cover' per baris masih berfungsi: 1 PDF, 1 halaman", satu.length === 1 && halamanPdf(path.join(unduhan, satu[0])) === 1 && /^Cover-Berkas_PENERIMA-/.test(satu[0]), JSON.stringify(satu));

  // ---- layar HP ----
  for (const [lebar, tinggi] of [[390, 800], [360, 560], [640, 360]]) {
    await kirim("Emulation.setDeviceMetricsOverride", { width: lebar, height: tinggi, deviceScaleFactor: 2, mobile: true });
    await tidur(400);
    await bukaDialog();
    const g = await dlg(`const k=d.firstChild.getBoundingClientRect(); const bt=[...d.querySelectorAll('button')].map(b=>b.getBoundingClientRect()); return JSON.stringify({kiri:Math.round(k.left),kanan:Math.round(k.right),atas:Math.round(k.top),bawah:Math.round(k.bottom),lebar:innerWidth,tinggi:innerHeight,tombolBawah:Math.round(Math.max(...bt.map(r=>r.bottom))),scrollW:document.documentElement.scrollWidth,sel:d.querySelectorAll('select').length})`).then(JSON.parse);
    await foto("hp_" + lebar + "x" + tinggi);
    cek(`HP ${lebar}x${tinggi}: dialog muat lebar layar, tanpa gulir mendatar`, g.kiri >= 0 && g.kanan <= g.lebar && g.scrollW <= g.lebar + 1 && g.sel === 3, JSON.stringify(g));
    // Keterjangkauan SUNGGUHAN: gulirkan ke judul lalu ke tombol; keduanya harus bisa tampil penuh di dalam layar.
    const jangkau = await dlg(`const t=d.querySelector('h3'); const u=[...d.querySelectorAll('button')].find(b=>b.textContent.trim()==='Unduh'); t.scrollIntoView({block:'start'}); const rt=t.getBoundingClientRect(); u.scrollIntoView({block:'end'}); const ru=u.getBoundingClientRect(); return JSON.stringify({judulAtas:Math.round(rt.top), tombolAtas:Math.round(ru.top), tombolBawah:Math.round(ru.bottom), tinggi:innerHeight})`).then(JSON.parse);
    cek(`HP ${lebar}x${tinggi}: judul dan tombol Unduh dapat dijangkau (digulirkan ke dalam layar)`, jangkau.judulAtas >= 0 && jangkau.tombolAtas >= 0 && jangkau.tombolBawah <= jangkau.tinggi, JSON.stringify(jangkau));
    await dlg("[...d.querySelectorAll('button')].find(b=>b.textContent.trim()==='Batal').click(); return true");
  }
  await kirim("Emulation.clearDeviceMetricsOverride");

  // ---- akun satu kecamatan + satu kelurahan: terpilih otomatis ----
  BARIS_AKTIF = buatBaris([["MEDAN SELAYANG", "TANJUNG SARI", 30]]);
  await siapkanHalaman();
  await bukaDialog();
  cek("hanya satu kelurahan pada data: Kecamatan dan Kelurahan terpilih otomatis", (await nilaiSel(0)) === "MEDAN SELAYANG" && (await nilaiSel(1)) === "MEDAN SELAYANG||TANJUNG SARI" && /^30 penerima/.test(await ringkasan()), (await nilaiSel(0)) + " | " + (await nilaiSel(1)) + " | " + (await ringkasan()));
  BARIS_AKTIF = buatBaris([["MEDAN SELAYANG", "TANJUNG SARI", 30], ["MEDAN SELAYANG", "SEMPAKATA", 20]]);
  await dlg("[...d.querySelectorAll('button')].find(b=>b.textContent.trim()==='Batal').click(); return true");
  await siapkanHalaman(); await bukaDialog();
  cek("satu kecamatan, dua kelurahan: Kecamatan otomatis, Kelurahan tetap 'Semua kelurahan' (pengguna memilih)", (await nilaiSel(0)) === "MEDAN SELAYANG" && (await nilaiSel(1)) === "" && (await opsi(1)).length === 3, (await nilaiSel(1)));
} catch (err) { console.log("GALAT HARNESS: " + err.message); gagal++; }
finally { try { ws && ws.close(); } catch { /* abaikan */ } chrome.kill(); await tidur(500); for (const d of [profil, unduhan]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* abaikan */ } } }
console.log(gagal === 0 ? "\nSEMUA LULUS" : `\n${gagal} GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
