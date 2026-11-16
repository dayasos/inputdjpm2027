// Layar Verifikasi Awal bagi rata di Chrome sungguhan (server TIRUAN): petugas verifikator dan Admin Utama. Rencana: plans/plan-verifikasi-awal-bagi-rata.md
// Jalankan: node scripts/uji/layar/verifikasi-awal.mjs   (Chrome + npx vite --port 3123 --strictPort)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:3123";
const PORT = 9346;
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=1100,1000", "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map(); const galatJs = []; const skripDimuat = [];
const panggilan = [];
const CORS = [{ name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Headers", value: "*" }, { name: "Access-Control-Allow-Methods", value: "*" }];

let peran = "VERIFIKATOR";
let aktif = true, gagalAdmin = "";
let namaJahat = false;
const AKUN = [
  { username: "verif_helda_melani", namaLengkap: "Helda Melani", tim: "I", aktif: true, dikecualikan: false, dasar: 103, punyaDasar: true, ditugaskan: 2, selesai: 1, ditutup: 0, sisa: 1, jumlah: 105 },
  { username: "verif_raja_rizki", namaLengkap: "Raja Rizki", tim: "III", aktif: true, dikecualikan: false, dasar: 14, punyaDasar: true, ditugaskan: 91, selesai: 4, ditutup: 0, sisa: 87, jumlah: 105 },
  { username: "verif_ronald_fredy", namaLengkap: "Ronald Fredy", tim: "I", aktif: true, dikecualikan: true, dasar: 0, punyaDasar: false, ditugaskan: 0, selesai: 0, ditutup: 0, sisa: 0, jumlah: 0 },
];
function reset() { aktif = true; gagalAdmin = ""; namaJahat = false; }
const NAMA_DATA = (i) => (namaJahat && i === 701 ? '<img src=x onerror="window.__xss=1">Budi' : { 701: "Budi", 702: "Sri Wahyuni", 703: "Ahmad Fauzi", 704: "Rahmat Hidayat", 705: "Marlina Sitorus", 706: "Dewi Lestari" }[i]);
const barisLihat = () => [701, 702, 703, 704, 705, 706].map((i) => { const r = new Array(26).fill(""); r[0] = i; r[1] = NAMA_DATA(i); r[2] = "12010000000" + i; r[7] = "GURU SEKOLAH MINGGU"; r[10] = "MEDAN KOTA"; r[11] = "SEI SIKAMBING B"; r[18] = i >= 704 ? "Memenuhi Syarat" : "Proses Verifikasi"; return r; }).map((r) => (r[1] === "Rahmat Hidayat" ? (r[1] = "Rahmat Hidayat", r) : r));
function jawab(aksi, args) {
  const [, a1] = args;
  if (aksi === "pulihkanSesi") return { sukses: true, token: "TOKEN-UJI", username: peran === "VERIFIKATOR" ? "verif_helda_melani" : "admin", role: peran, kecamatan: "", userId: "", profileBelumDiisi: false, profil: { namaLengkap: "UJI", nomorHp: "0800", jabatan: "Uji" } };
  if (aksi === "getMasterLayanan") return { kecamatan: ["IMAM MASJID", "PENDETA"], kemenag: ["GURU MAGHRIB MENGAJI"] };
  if (aksi === "getRingkasanVerifikasiSaya") return { sukses: true, total: 12, hariIni: 3, memenuhiSyarat: 8, berkasTidakLengkap: 3, tidakMemenuhiSyarat: 1 };
  if (aksi === "getTugasUlangSaya") return { sukses: true, sisa: 2, selesai: 0, dikoreksi: 0, ditarikBaruSaja: 0, halaman: 1, adaBerikutnya: false, tugas: [{ tugasId: 204, penerimaId: 704, nama: "Rahmat Hidayat", layanan: "GURU SEKOLAH MINGGU", kecamatan: "MEDAN KOTA", kelurahan: "SEI SIKAMBING B", status: "Memenuhi Syarat", dibuka: false, namaPaket: "Tahap uji" }, { tugasId: 205, penerimaId: 705, nama: "Marlina Sitorus", layanan: "GURU SEKOLAH MINGGU", kecamatan: "MEDAN KOTA", kelurahan: "SEI SIKAMBING B", status: "Memenuhi Syarat", dibuka: false, namaPaket: "Tahap uji" }] };
  if (aksi === "ambilDataLihatDataHakAkses") return { sukses: true, rows: barisLihat() };
  if (aksi === "bukaTugasUlang") return { sukses: false, pesan: "Tiruan: tidak dibuka." };
  if (aksi === "getTugasAwalSaya") return aktif
    ? { sukses: true, aktif: true, ditugaskan: 10, selesai: 7, sisa: 3, ids: [701, 702, 703], daftar: [], halaman: a1 || 1, totalHalaman: 1 }
    : { sukses: true, aktif: false, ditugaskan: 0, selesai: 0, sisa: 0, ids: [], daftar: [], halaman: 1, totalHalaman: 1 };
  // ---- Admin
  if (aksi === "getStatusPembagianAwal") return { sukses: true, aktif, menunggu: aktif ? 0 : 1715, akun: AKUN.map((a) => ({ ...a })), sapuan: aktif ? [{ id: 1, waktu: "2026-11-16T03:00:00Z", jenis: "MULAI", oleh: "ADMIN", dibagi: 1715, ditutup: 0 }] : [] };
  if (aksi === "pratinjauPembagianAwal") return { sukses: true, dryRun: true, jenis: "MANUAL", benih: "b", dibagi: 1715, ditutup: 0, menungguSebelum: 1715, selisih: 1, perAkun: [{ username: "verif_helda_melani", jumlahAwal: 103, diterima: 3, jumlahAkhir: 106 }, { username: "verif_raja_rizki", jumlahAwal: 14, diterima: 91, jumlahAkhir: 105 }] };
  if (aksi === "aturPembagianAwal") { if (gagalAdmin) return { sukses: false, pesan: gagalAdmin }; aktif = a1 === true; return { sukses: true, aktif, dibagi: aktif ? 1715 : 0, selisih: 1, pesan: aktif ? "Pembagian Verifikasi Awal dinyalakan. Dibagikan 1715 data." : "Pembagian Verifikasi Awal dimatikan. Verifikator kembali memilih data sendiri." }; }
  if (aksi === "bagiSekarangAwal") return { sukses: true, dibagi: 4, ditutup: 1, selisih: 1, pesan: "Dibagikan 4 data. 1 tugas ditutup karena datanya sudah diverifikasi." };
  return { sukses: true };
}
async function dialihkan(p) {
  const url = p.request.url;
  if (!/supabase\.co|\/api\/gas/.test(url)) { await kirim("Fetch.continueRequest", { requestId: p.requestId }); return; }
  if (p.request.method === "OPTIONS") { await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 204, responseHeaders: CORS, body: "" }); return; }
  let aksi = "?", args = []; try { const b = JSON.parse(p.request.postData || "{}"); aksi = b.action; args = b.args || []; } catch { /* abaikan */ }
  panggilan.push({ aksi, args });
  const jawaban = jawab(aksi, args);
  await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200, responseHeaders: [...CORS, { name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify({ result: jawaban })).toString("base64") });
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
const terakhir = (a) => panggilan.filter((x) => x.aksi === a).pop();
const klik = (sel) => js("(() => { const e = document.querySelector(" + JSON.stringify(sel) + "); if (!e || e.disabled) return false; e.click(); return true; })()");
const ada = (sel) => js("!!document.querySelector(" + JSON.stringify(sel) + ")");
const teks = (sel) => js("(() => { const e = document.querySelector(" + JSON.stringify(sel) + "); return e ? e.textContent.replace(/\\s+/g, ' ').trim() : ''; })()");
const nonaktif = (sel) => js("(() => { const e = document.querySelector(" + JSON.stringify(sel) + "); return e ? e.disabled : null; })()");

async function masuk(peranBaru) {
  peran = peranBaru; panggilan.length = 0; skripDimuat.length = 0;
  await kirim("Page.navigate", { url: BASE + "/" });
  await tungguSampai("!!document.getElementById('tab-rekap') && document.readyState==='complete'", "halaman siap");
  await js(`sessionStorage.setItem('dana_jasa_sesi', JSON.stringify({ token: 'TOKEN-UJI', username: ${JSON.stringify(peranBaru === "VERIFIKATOR" ? "verif_helda_melani" : "admin")}, role: ${JSON.stringify(peranBaru)}, kecamatan: '', userId: '', namaLengkap: 'UJI' })); true`);
  skripDimuat.length = 0;
  await kirim("Page.reload");
  await tungguSampai("!!document.getElementById('tab-rekap') && document.readyState==='complete'", "halaman siap setelah muat ulang");
  await tungguSampai("document.getElementById('modal-login') && document.getElementById('modal-login').classList.contains('hidden')", "sesi tiruan diterima", 60);
  await tidur(2800);
}
async function ukurPonsel(selOverlay, selKotak, lebar) {
  await kirim("Emulation.setDeviceMetricsOverride", { width: lebar, height: 844, deviceScaleFactor: 2, mobile: true });
  await tidur(500);
  const r = await js(`(() => { const o = document.querySelector(${JSON.stringify(selOverlay)}); const W = document.documentElement.clientWidth; const k = o.querySelector(${JSON.stringify(selKotak)}).getBoundingClientRect(); const lewat = [];
    o.querySelectorAll('button, h2, h3, li').forEach((e) => { if (e.closest('.pba-tabel')) return; const b = e.getBoundingClientRect(); if (b.width && (b.right > W + 1 || b.left < -1)) lewat.push((e.className || e.tagName) + ':' + Math.round(b.left) + '-' + Math.round(b.right)); });
    return { W, kotakKanan: Math.round(k.right), gulirHalaman: document.documentElement.scrollWidth > W + 1, lewat: lewat.slice(0, 5) }; })()`);
  await kirim("Emulation.clearDeviceMetricsOverride");
  await tidur(300);
  return r;
}

try {
  await sambung();
  await kirim("Runtime.enable"); await kirim("Page.enable"); await kirim("Network.enable");
  await kirim("Fetch.enable", { patterns: [{ urlPattern: "*supabase.co*" }, { urlPattern: "*api/gas*" }] });

  // ============================ PETUGAS VERIFIKATOR ============================
  reset(); namaJahat = true;
  await masuk("VERIFIKATOR");
  cek("PETUGAS: modul tab dan panel pemeriksaan dimuat; modul Admin TIDAK dimuat", skripDimuat.some((u) => /app-tab-tugas\.js/.test(u)) && skripDimuat.some((u) => /app-tugas-ulang\.js/.test(u)) && !skripDimuat.some((u) => /app-pembagian-awal-admin\.js/.test(u)), JSON.stringify(skripDimuat.map((u) => u.split("/").pop())));
  cek("PETUGAS: tidak ada tombol 'Pembagian Awal' milik Admin", !(await ada("#btn-pembagian-awal")));
  await tungguSampai("!!document.getElementById('tab-verif-awal') && !!document.getElementById('tab-verif-ulang')", "dua tab muncul");
  cek("PETUGAS: tab 'Verifikasi Awal · 3' dan 'Verifikasi Ulang · 2' muncul", /Verifikasi Awal · 3/.test(await teks("#tab-verif-awal")) && /Verifikasi Ulang · 2/.test(await teks("#tab-verif-ulang")), await teks("#tab-verif-awal") + " | " + await teks("#tab-verif-ulang"));
  cek("PETUGAS: tidak ada tombol melayang Tugas Awal maupun Tugas Ulang", !(await ada("#djpm-tau-pil")) && !(await ada("#djpm-tul-pil")));
  cek("PETUGAS: tab Lihat Data dan dua tab baru berdampingan di nav yang sama", (await js("document.getElementById('tab-verif-awal').parentNode === document.getElementById('tab-rekap').parentNode && document.getElementById('tab-verif-ulang').parentNode === document.getElementById('tab-rekap').parentNode")) === true);

  await klik("#tab-verif-awal");
  await tungguSampai("document.querySelectorAll('#body-tabel-lihat tr').length === 3 && !!document.getElementById('djpm-tab-tugas-banner')", "tabel hanya tiga tugas");
  cek("PETUGAS (Awal): tabel Lihat Data yang sama, hanya memuat 3 data tugasnya (bukan 6)", (await js("document.querySelectorAll('#body-tabel-lihat tr').length")) === 3 && /Total Data: 3 Baris/.test(await teks("#info-total-penerima")), await teks("#info-total-penerima"));
  cek("PETUGAS (Awal): panel Lihat Data terlihat dan tab Verifikasi Awal yang tampak aktif (bukan Lihat Data)", (await js("!document.getElementById('panel-rekap').classList.contains('hidden') && document.getElementById('tab-verif-awal').classList.contains('tab-nav-aktif') && !document.getElementById('tab-rekap').classList.contains('tab-nav-aktif')")) === true);
  cek("PETUGAS (Awal): banner menjelaskan isi tabel", /3 data Verifikasi Awal yang ditugaskan kepada Anda/.test(await teks("#djpm-tab-tugas-banner")), await teks("#djpm-tab-tugas-banner"));
  cek("PETUGAS (Awal): nama berbahaya tampil sebagai teks, tidak dieksekusi", (await js("window.__xss === undefined && !document.querySelector('#body-tabel-lihat img')")) === true);
  cek("PETUGAS (Awal): data milik orang lain (Rahmat, Dewi, Hendra) tidak tampil", !/Rahmat Hidayat|Dewi Lestari|Hendra Saputra/.test(await teks("#body-tabel-lihat")));
  cek("PETUGAS (Awal): tombol berlabel 'Detail' seperti di Lihat Data", (await js("Array.from(document.querySelectorAll('#body-tabel-lihat button')).every((b) => /Detail/.test(b.textContent))")) === true);
  await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(path.join(os.tmpdir(), "djpm_tab_awal.png"), Buffer.from(s.result.data, "base64")));
  await klik('#body-tabel-lihat button[onclick*="702"]');
  await tungguSampai("!document.getElementById('modal-detail-penerima').classList.contains('hidden')", "modal Detail terbuka");
  cek("PETUGAS (Awal): Detail membuka modal Detail BIASA untuk data itu (ambilDetailPenerimaPerBaris id 702), bukan panel pemeriksaan ulang", panggilan.some((x) => x.aksi === "ambilDetailPenerimaPerBaris" && x.args[1] === 702) && !(await ada("#djpm-tul-overlay")));
  await js("document.getElementById('modal-detail-penerima').classList.add('hidden'); true");
  const hp = await js("(() => { return { W: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth }; })()");
  cek("PETUGAS (Awal): halaman tidak menggulir mendatar", hp.sw <= hp.W + 1, JSON.stringify(hp));
  for (const lebar of [320, 390]) {
    await kirim("Emulation.setDeviceMetricsOverride", { width: lebar, height: 844, deviceScaleFactor: 2, mobile: true });
    await tidur(500);
    const r = await js("(() => { const W = document.documentElement.clientWidth; return { W, sw: document.documentElement.scrollWidth }; })()");
    cek("PETUGAS PONSEL " + lebar + "px (tab Awal): halaman tidak menggulir mendatar", r.sw <= r.W + 1, JSON.stringify(r));
    await kirim("Emulation.clearDeviceMetricsOverride");
    await tidur(300);
  }

  await klik('#djpm-tab-tugas-banner [data-aksi="semua"]');
  await tungguSampai("document.querySelectorAll('#body-tabel-lihat tr').length === 6 && !document.getElementById('djpm-tab-tugas-banner')", "semua data tampil kembali");
  cek("PETUGAS: 'Tampilkan semua data' mengembalikan seluruh 6 data Lihat Data (hanya baca) dan menghapus banner", (await js("document.querySelectorAll('#body-tabel-lihat tr').length")) === 6 && (await js("document.getElementById('tab-rekap').classList.contains('tab-nav-aktif') && !document.getElementById('tab-verif-awal').classList.contains('tab-nav-aktif')")) === true);

  await klik("#tab-verif-ulang");
  await tungguSampai("document.querySelectorAll('#body-tabel-lihat tr').length === 2 && /Periksa/.test(document.querySelector('#body-tabel-lihat button').textContent)", "tabel dua tugas ulang berlabel Periksa");
  cek("PETUGAS (Ulang): tabel yang sama hanya memuat 2 data tugas ulang dan tombol berlabel 'Periksa'", /Total Data: 2 Baris/.test(await teks("#info-total-penerima")) && (await js("Array.from(document.querySelectorAll('#body-tabel-lihat button')).every((b) => /Periksa/.test(b.textContent))")) === true);
  cek("PETUGAS (Ulang): banner menyebut Periksa dan data tugas ulang", /2 data Verifikasi Ulang.*Periksa/.test(await teks("#djpm-tab-tugas-banner")), await teks("#djpm-tab-tugas-banner"));
  const detailSebelum = panggilan.filter((x) => x.aksi === "ambilDetailPenerimaPerBaris").length;
  await klik('#body-tabel-lihat button[onclick*="705"]');
  await tungguSampai("!!document.getElementById('djpm-tul-overlay')", "panel pemeriksaan terbuka");
  for (let i = 0; i < 20 && hitung("bukaTugasUlang") === 0; i++) await tidur(250);
  cek("PETUGAS (Ulang): Periksa pada data 705 membuka PANEL PEMERIKSAAN BERKAS langsung ke tugasnya (bukaTugasUlang tugas 205), bukan Detail biasa",
    hitung("bukaTugasUlang") >= 1 && terakhir("bukaTugasUlang").args[1] === 205 && panggilan.filter((x) => x.aksi === "ambilDetailPenerimaPerBaris").length === detailSebelum, JSON.stringify(terakhir("bukaTugasUlang")));
  await js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
  await tungguSampai("document.getElementById('djpm-tul-overlay') === null", "panel tertutup");
  cek("PETUGAS: tidak memanggil aksi tulis apa pun dari tab", panggilan.every((x) => !/verifikasiSatuData|aturPembagianAwal|bagiSekarangAwal|simpanHasilUlang/.test(x.aksi)));

  // saklar MATI: tab Verifikasi Awal tidak ada; Verifikasi Ulang tetap
  reset(); aktif = false;
  await masuk("VERIFIKATOR");
  await tungguSampai("!!document.getElementById('tab-verif-ulang')", "tab Ulang tetap ada");
  await tidur(1500);
  cek("PETUGAS (saklar MATI): tab Verifikasi Awal tidak muncul; tab Verifikasi Ulang tetap ada", !(await ada("#tab-verif-awal")) && (await ada("#tab-verif-ulang")));

  // ============================ ADMIN UTAMA ============================
  reset(); aktif = false;
  await masuk("UTAMA");
  cek("ADMIN: modul Pembagian Awal dimuat; modul petugas TIDAK dimuat", skripDimuat.some((u) => /app-pembagian-awal-admin\.js/.test(u)) && !skripDimuat.some((u) => /app-tugas-awal\.js/.test(u)), JSON.stringify(skripDimuat.map((u) => u.split("/").pop())));
  await tungguSampai("!!document.getElementById('btn-pembagian-awal')", "tombol Pembagian Awal");
  cek("ADMIN: tombol 'Pembagian Awal' ada di toolbar", true);
  await klik("#btn-pembagian-awal");
  await tungguSampai("!!document.querySelector('#djpm-pba-overlay .pba-lencana')", "status dimuat");
  cek("ADMIN: lencana MATI, menunggu 1.715 data, tabel per verifikator memuat 3 baris", /MATI/.test(await teks(".pba-lencana")) && /1\.715/.test(await teks(".pba-status")) && (await js("document.querySelectorAll('#djpm-pba-overlay tbody tr').length")) >= 3, await teks(".pba-status"));
  cek("ADMIN: pimpinan ditandai 'Tidak menerima' dan tidak ikut hitungan selisih (selisih 0 dari dua penerima 105/105)", /Tidak menerima/.test(await teks("#pba-isi")) && /Selisih jumlah antar verifikator: 0/.test(await teks(".pba-status")), await teks(".pba-status"));
  cek("ADMIN: 'Nyalakan pembagian' NONAKTIF sebelum pratinjau dilihat", (await nonaktif('[data-aksi="nyalakan"]')) === true);
  await klik('[data-aksi="pratinjau"]');
  await tungguSampai("/Pratinjau pembagian/.test(document.getElementById('pba-isi').textContent)", "pratinjau tampil");
  cek("ADMIN: pratinjau tampil (1.715 data, tabel jumlah sekarang/akan menerima/akhir) dan memberi tahu bahwa belum ada yang ditulis", /1\.715 data akan dibagikan/.test(await teks("#pba-isi")) && /Tidak ada yang ditulis/.test(await teks("#pba-isi")) && hitung("aturPembagianAwal") === 0);
  cek("ADMIN: setelah pratinjau 'Nyalakan pembagian' AKTIF", (await nonaktif('[data-aksi="nyalakan"]')) === false);
  await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(path.join(os.tmpdir(), "djpm_pembagian_awal.png"), Buffer.from(s.result.data, "base64")));
  const hpa = await ukurPonsel("#djpm-pba-overlay", ".pba-kotak", 390);
  cek("ADMIN PONSEL 390px: tanpa gulir mendatar pada halaman (tabel menggulir di dalam kotaknya)", hpa.kotakKanan <= hpa.W && !hpa.gulirHalaman && hpa.lewat.length === 0, JSON.stringify(hpa));
  await klik('[data-aksi="nyalakan"]');
  await tungguSampai("!!document.querySelector('[data-aksi=\"nyalakan-ya\"]')", "konfirmasi");
  cek("ADMIN: menyalakan minta konfirmasi dulu dan tidak langsung memanggil server", hitung("aturPembagianAwal") === 0 && /langsung membagikan 1\.715 data/.test(await teks("#pba-isi")));
  await klik('[data-aksi="batal-konfirmasi"]');
  cek("ADMIN: Batal menutup konfirmasi tanpa memanggil server", !(await ada('[data-aksi="nyalakan-ya"]')) && hitung("aturPembagianAwal") === 0);
  gagalAdmin = "Pembagian dibatalkan: 2 data baru saja ditugaskan oleh proses lain. Coba lagi.";
  await klik('[data-aksi="nyalakan"]'); await klik('[data-aksi="nyalakan-ya"]');
  await tungguSampai("/Pembagian dibatalkan/.test(document.getElementById('pba-isi').textContent)", "pesan gagal");
  cek("ADMIN: kegagalan server tampil di panel dan saklar tetap MATI", /MATI/.test(await teks(".pba-lencana")) && (await ada(".pba-pesan.gagal")));
  gagalAdmin = "";
  await klik('[data-aksi="nyalakan"]'); await klik('[data-aksi="nyalakan-ya"]');
  await tungguSampai("/NYALA/.test((document.querySelector('.pba-lencana') || {}).textContent || '')", "saklar NYALA");
  cek("ADMIN: menyalakan memanggil aturPembagianAwal(true), status dimuat ulang, lencana NYALA, pesan sukses tampil", terakhir("aturPembagianAwal").args[1] === true && /dinyalakan/.test(await teks("#pba-isi")) && (await ada('[data-aksi="bagi"]')) && (await ada('[data-aksi="matikan"]')) && !(await ada('[data-aksi="nyalakan"]')), JSON.stringify(terakhir("aturPembagianAwal")));
  cek("ADMIN: riwayat pembagian tampil (MULAI 1.715)", /Riwayat pembagian/.test(await teks("#pba-isi")) && /MULAI/.test(await teks("#pba-isi")));
  await klik('[data-aksi="bagi"]');
  await tungguSampai("/Dibagikan 4 data/.test(document.getElementById('pba-isi').textContent)", "bagi sekarang");
  cek("ADMIN: 'Bagikan sekarang' memanggil server dan menampilkan hasilnya", hitung("bagiSekarangAwal") === 1 && /1 tugas ditutup/.test(await teks("#pba-isi")));
  await klik('[data-aksi="matikan"]');
  await tungguSampai("!!document.querySelector('[data-aksi=\"matikan-ya\"]')", "konfirmasi matikan");
  await klik('[data-aksi="matikan-ya"]');
  await tungguSampai("/MATI/.test((document.querySelector('.pba-lencana') || {}).textContent || '')", "saklar MATI lagi");
  cek("ADMIN: mematikan (dengan konfirmasi) memanggil aturPembagianAwal(false) dan lencana kembali MATI", terakhir("aturPembagianAwal").args[1] === false);
  await js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
  await tungguSampai("document.getElementById('djpm-pba-overlay') === null", "Escape menutup");

  cek("TIDAK ADA galat JavaScript selama uji", galatJs.length === 0, JSON.stringify(galatJs));
} catch (e) {
  console.log("GAGAL  uji terhenti: " + e.message); gagal++;
} finally {
  try { ws && ws.close(); } catch { /* abaikan */ }
  chrome.kill();
  try { fs.rmSync(profil, { recursive: true, force: true }); } catch { /* abaikan */ }
}
console.log(gagal === 0 ? "\nSEMUA LULUS" : "\n" + gagal + " GAGAL");
process.exit(gagal === 0 ? 0 : 1);
