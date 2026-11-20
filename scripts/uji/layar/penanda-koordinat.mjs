// Penanda koordinat GMM di Chrome sungguhan, server TIRUAN: Admin Utama, Verifikator, peran lain, dan server gagal.
// Jalankan: node scripts/uji/layar/penanda-koordinat.mjs   (Chrome + npx vite --port 3123 --strictPort)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:3123";
const PORT = 9352;
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=1200,1000", "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map(); const galatJs = []; const skripDimuat = []; const panggilan = [];
const CORS = [{ name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Headers", value: "*" }, { name: "Access-Control-Allow-Methods", value: "*" }];

let peran = "UTAMA";
let gagalPenanda = false;
const ALASAN = { TANPA_PENANDA: "Tautan hanya menampilkan tampilan peta, tanpa titik penanda", STREET_VIEW: '<img src=x onerror="window.__xss=1">Street View' };
const NAMA = { 701: "Budi", 702: "Sri Wahyuni", 703: "Ahmad Fauzi", 704: "Rahmat Hidayat", 705: "Marlina Sitorus", 706: "Dewi Lestari" };
// 701 valid, 702 salah, 703 belum dicek, 704 salah (alasan berbahaya), 705/706 bukan GMM (tidak ada di peta)
const barisLihat = () => [701, 702, 703, 704, 705, 706].map((i) => { const r = new Array(26).fill(""); r[0] = i; r[1] = NAMA[i]; r[2] = "12010000000" + i; r[7] = i <= 704 ? "GURU MAGHRIB MENGAJI" : "GURU SEKOLAH MINGGU"; r[10] = "MEDAN KOTA"; r[11] = "SEI SIKAMBING B"; r[18] = "Proses Verifikasi"; return r; });
function detailUntuk(nomor) {
  const d = new Array(60).fill("");
  Object.assign(d, { 0: nomor, 1: NAMA[nomor], 2: "12010000000" + nomor, 3: "PEREMPUAN", 4: "MEDAN", 5: "04-02-1989", 6: "JL X NO 1", 7: nomor <= 704 ? "GURU MAGHRIB MENGAJI" : "GURU SEKOLAH MINGGU", 8: "RUMAH", 9: "JL. MARELAN", 10: "MEDAN KOTA", 11: "SEI SIKAMBING B", 12: NAMA[nomor], 13: "12345678901234", 14: "SUMUT", 15: "0812345678", 16: "YA", 32: "Proses Verifikasi", 51: false });
  return d;
}
let titikAda = true;
function jawab(aksi, args) {
  if (aksi === "pulihkanSesi") return { sukses: true, token: "TOKEN-UJI", username: peran === "VERIFIKATOR" ? "verif_x" : "admin", role: peran, kecamatan: "MEDAN KOTA", userId: "", profileBelumDiisi: false, profil: { namaLengkap: "UJI", nomorHp: "0800", jabatan: "X" } };
  if (aksi === "getMasterLayanan") return { kecamatan: ["IMAM MASJID"], kemenag: ["GURU MAGHRIB MENGAJI"] };
  if (aksi === "ambilDataLihatDataHakAkses") return { sukses: true, rows: barisLihat() };
  if (aksi === "ambilDetailPenerimaPerBaris") return { sukses: true, dataLengkap: detailUntuk(args[1]) };
  if (aksi === "ambilRiwayatEdit") return { sukses: true, riwayat: [] };
  if (aksi === "getTugasAwalSaya") return { sukses: true, aktif: false, ditugaskan: 0, selesai: 0, sisa: 0, ids: [], daftar: [], halaman: 1, totalHalaman: 1 };
  if (aksi === "getTugasUlangSaya") return { sukses: true, sisa: 0, selesai: 0, semua: [], tugas: [] };
  if (aksi === "getTitikKoordinatData") return titikAda ? { sukses: true, ada: true, lat: 3.6173294, lng: 98.6838672 } : { sukses: true, ada: false };
  if (aksi === "getPenandaKoordinat") {
    if (gagalPenanda) return { sukses: false, pesan: "Tiruan: gagal." };
    return { sukses: true, v: [701], b: [703], x: { 702: "TANPA_PENANDA", 704: "STREET_VIEW" }, teks: ALASAN, jumlah: { valid: 1, tidakValid: 2, belumDicek: 1 } };
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
const hitung = (a) => panggilan.filter((x) => x.aksi === a).length;
const klik = (sel) => js("(() => { const e = document.querySelector(" + JSON.stringify(sel) + "); if (!e || e.disabled) return false; e.click(); return true; })()");
const lencanaBaris = (n) => js("(() => { const b = document.querySelector('#body-tabel-lihat button[onclick*=\"(" + n + ")\"]'); if (!b) return null; const td = b.closest('td').previousElementSibling; const l = td.querySelector('.djpm-pk-lencana'); return l ? { teks: l.textContent.trim(), s: l.getAttribute('data-s'), judul: l.title } : false; })()");

async function masuk(peranBaru) {
  peran = peranBaru;
  await kirim("Page.navigate", { url: "about:blank" }); await tidur(400);   // hentikan halaman sesi sebelumnya (pewaktunya masih bisa memanggil server)
  panggilan.length = 0; skripDimuat.length = 0;
  await kirim("Page.navigate", { url: BASE + "/" });
  await tungguSampai("!!document.getElementById('tab-rekap') && document.readyState==='complete'", "halaman siap");
  await js(`sessionStorage.setItem('dana_jasa_sesi', JSON.stringify({ token: 'TOKEN-UJI', username: ${JSON.stringify(peranBaru === "VERIFIKATOR" ? "verif_x" : "admin")}, role: ${JSON.stringify(peranBaru)}, kecamatan: 'MEDAN KOTA', userId: '', namaLengkap: 'UJI' })); true`);
  skripDimuat.length = 0; panggilan.length = 0;   // pemuatan pertama masih memakai sesi lama di sessionStorage
  await kirim("Page.reload");
  await tungguSampai("!!document.getElementById('tab-rekap') && document.readyState==='complete'", "halaman siap setelah muat ulang");
  await tungguSampai("document.getElementById('modal-login') && document.getElementById('modal-login').classList.contains('hidden')", "sesi tiruan diterima", 60);
  await tidur(2500);
}
async function bukaLihatData() {
  await klik("#tab-rekap");
  await tungguSampai("document.querySelectorAll('#body-tabel-lihat tr').length >= 6", "tabel Lihat Data terisi");
}

try {
  await sambung();
  await kirim("Runtime.enable"); await kirim("Page.enable"); await kirim("Network.enable");
  await kirim("Fetch.enable", { patterns: [{ urlPattern: "*supabase.co*" }, { urlPattern: "*api/gas*" }] });

  // ======================== ADMIN UTAMA ========================
  await masuk("UTAMA");
  cek("UTAMA: modul penanda dimuat", skripDimuat.some((u) => /app-penanda-koordinat\.js/.test(u)));
  await bukaLihatData();
  await tungguSampai("!!document.querySelector('.djpm-pk-lencana')", "lencana muncul");
  const l701 = await lencanaBaris(701), l702 = await lencanaBaris(702), l703 = await lencanaBaris(703), l704 = await lencanaBaris(704), l705 = await lencanaBaris(705);
  cek("UTAMA: 701 hijau 'Koordinat valid'", l701 && l701.s === "valid" && /Koordinat valid/.test(l701.teks), JSON.stringify(l701));
  cek("UTAMA: 702 merah 'Koordinat bermasalah' dengan alasan di tooltip", l702 && l702.s === "salah" && /Koordinat bermasalah/.test(l702.teks) && /tanpa titik penanda/.test(l702.judul), JSON.stringify(l702));
  cek("UTAMA: 703 abu 'belum dicek'", l703 && l703.s === "tunggu" && /belum dicek/.test(l703.teks), JSON.stringify(l703));
  cek("UTAMA: alasan berbahaya tampil sebagai teks (tidak dieksekusi)", l704 && l704.s === "salah" && (await js("window.__xss === undefined && !document.querySelector('#body-tabel-lihat img')")) === true, JSON.stringify(l704));
  cek("UTAMA: baris layanan lain (705) TANPA penanda", l705 === false, JSON.stringify(l705));
  cek("UTAMA: peta dimuat sekali (cache)", hitung("getPenandaKoordinat") === 1, String(hitung("getPenandaKoordinat")));
  await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(path.join(os.tmpdir(), "djpm_penanda_koordinat.png"), Buffer.from(s.result.data, "base64")));

  // Detail
  await klik('#body-tabel-lihat button[onclick*="(702)"]');
  await tungguSampai("!document.getElementById('modal-detail-penerima').classList.contains('hidden') && /Sri Wahyuni/.test(document.getElementById('isi-konten-detail').textContent) && !!document.getElementById('djpm-pk-banner')", "banner Detail 702");
  const b702 = await js("(() => { const b = document.getElementById('djpm-pk-banner'); return { teks: b.textContent, s: b.dataset.s, pertama: b === document.getElementById('isi-konten-detail').firstElementChild, jumlah: document.querySelectorAll('#djpm-pk-banner').length }; })()");
  cek("UTAMA Detail 702 (bermasalah): TANPA bilah 'Buka titik'", (await js("!document.getElementById('djpm-pk-titik')")) === true);
  cek("UTAMA Detail 702: banner merah di paling atas, alasan jelas, Admin Utama diberi tahu tidak diblokir", b702.s === "salah" && b702.pertama && b702.jumlah === 1 && /^Koordinat bermasalah: Tautan hanya menampilkan tampilan peta/.test(b702.teks) && /Admin Utama\) tidak diblokir/.test(b702.teks), JSON.stringify(b702));
  await js("document.getElementById('tutup-modal-detail').click(); true");
  await klik('#body-tabel-lihat button[onclick*="(701)"]');
  await tungguSampai("!document.getElementById('modal-detail-penerima').classList.contains('hidden') && /Budi/.test(document.getElementById('isi-konten-detail').textContent)", "detail 701");
  await tidur(600);
  cek("UTAMA Detail 701 (valid): tanpa banner", (await js("!document.getElementById('djpm-pk-banner')")) === true);
  cek("UTAMA Detail 701 (valid): bilah 'Buka titik' tampil di atas Detail, satu saja", (await js("document.querySelectorAll('#djpm-pk-titik').length === 1 && document.getElementById('djpm-pk-titik') === document.getElementById('isi-konten-detail').firstElementChild")) === true);
  await js("window.__jendela = []; window.open = function (u, n, f) { var j = { location: { href: '' }, opener: 1, ditutup: false, close: function () { this.ditutup = true; }, u: u }; window.__jendela.push(j); return j; }; true");
  await js("document.querySelector('#djpm-pk-titik button').click(); true");
  await tungguSampai("window.__jendela.length === 1 && window.__jendela[0].location.href !== ''", "jendela titik terisi");
  const jd = await js("JSON.stringify({ n: window.__jendela.length, href: window.__jendela[0].location.href, op: window.__jendela[0].opener, tutup: window.__jendela[0].ditutup })");
  cek("UTAMA 'Buka titik': jendela dibuka lebih dulu lalu diarahkan ke koordinat langsung (selalu bermarka), tanpa opener, server dipanggil dengan id 701", JSON.parse(jd).href === 'https://www.google.com/maps?q=3.6173294,98.6838672' && JSON.parse(jd).op === null && JSON.parse(jd).tutup === false && panggilan.some((p) => p.aksi === 'getTitikKoordinatData' && String(p.args[1]) === '701'), jd);
  titikAda = false;
  await js("document.querySelector('#djpm-pk-titik button').click(); true");
  await tungguSampai("window.__jendela.length === 2 && window.__jendela[1].ditutup === true", "jendela ditutup bila titik tak ada");
  cek("UTAMA 'Buka titik' tanpa titik dari server: jendela ditutup, tidak diarahkan ke mana pun, tombol aktif kembali", (await js("window.__jendela[1].location.href === '' && !document.querySelector('#djpm-pk-titik button').disabled")) === true);
  titikAda = true;
  await js("document.getElementById('tutup-modal-detail').click(); true");
  await klik('#body-tabel-lihat button[onclick*="(705)"]');
  await tungguSampai("!document.getElementById('modal-detail-penerima').classList.contains('hidden') && /Marlina/.test(document.getElementById('isi-konten-detail').textContent)", "detail 705");
  await tidur(600);
  cek("UTAMA Detail 705 (bukan GMM): tanpa banner dan tanpa bilah 'Buka titik'", (await js("!document.getElementById('djpm-pk-banner') && !document.getElementById('djpm-pk-titik')")) === true);
  await js("document.getElementById('tutup-modal-detail').click(); true");

  // Gambar ulang tabel (filter/halaman) tidak menggandakan lencana
  await js("saringDanTampilkanTabel(); true"); await tidur(500);
  cek("UTAMA: gambar ulang tabel tidak menggandakan lencana", (await js("document.querySelectorAll('#body-tabel-lihat .djpm-pk-lencana').length")) === 4);

  // ======================== VERIFIKATOR ========================
  await masuk("VERIFIKATOR");
  cek("VERIFIKATOR: modul penanda dimuat", skripDimuat.some((u) => /app-penanda-koordinat\.js/.test(u)));
  await bukaLihatData();
  await tungguSampai("!!document.querySelector('.djpm-pk-lencana')", "lencana verifikator");
  cek("VERIFIKATOR: lencana tampil (4 baris GMM)", (await js("document.querySelectorAll('#body-tabel-lihat .djpm-pk-lencana').length")) === 4);

  // ======================== PERAN LAIN ========================
  await masuk("KECAMATAN");
  cek("KECAMATAN: modul penanda TIDAK dimuat dan server tidak dipanggil", !skripDimuat.some((u) => /app-penanda-koordinat\.js/.test(u)) && hitung("getPenandaKoordinat") === 0, "skrip=" + JSON.stringify(skripDimuat.filter((u) => /penanda/.test(u))) + " panggilan=" + hitung("getPenandaKoordinat"));
  await bukaLihatData();
  cek("KECAMATAN: tanpa lencana", (await js("document.querySelectorAll('.djpm-pk-lencana').length")) === 0);

  // ======================== SERVER GAGAL ========================
  gagalPenanda = true;
  await masuk("UTAMA");
  await bukaLihatData();
  await tidur(2500);
  cek("GAGAL: tabel tetap tampil (6 baris) tanpa lencana", (await js("document.querySelectorAll('#body-tabel-lihat tr').length")) === 6 && (await js("document.querySelectorAll('.djpm-pk-lencana').length")) === 0);
  gagalPenanda = false;

  cek("TANPA galat JavaScript di halaman", galatJs.length === 0, galatJs.join(" | "));
} catch (e) { console.log("GALAT UJI: " + e.message); gagal++; }
finally { try { ws.close(); } catch { /* abaikan */ } chrome.kill(); }
console.log(gagal === 0 ? "\nSEMUA LULUS" : "\nGAGAL: " + gagal);
process.exit(gagal === 0 ? 0 : 1);
