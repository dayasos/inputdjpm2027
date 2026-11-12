// Login PERTAMA akun VERIFIKATOR (layar profil awal + ganti sandi wajib) di layar (server TIRUAN). Turunan verifikator.mjs.
// Jalankan: node scripts/uji/layar/verifikator-login-awal.mjs   (syarat sama: Chrome + npx vite --port 3123 --strictPort)
// Akun VERIFIKATOR di layar (server TIRUAN). Rencana: plans/plan-tim-verifikator.md.
// Uji MANUAL di Chrome sungguhan (BUKAN bagian dari "npm run uji:*").
// Jalankan:  node scripts/uji/layar/verifikator.mjs
// Syarat: Chrome terpasang (atau CHROME_PATH), dan server lokal berjalan:  npx vite --port 3123 --strictPort
// Aman: tidak ada permintaan ke server asli (jaringan dicegat), WebSocket realtime dimatikan.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AKSI_VERIFIKATOR } from "../../../supabase/functions/api/_shared/gerbangPeran.ts";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:3123";
const PORT = 9342;
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=1100,1000", "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map(); const galatJs = []; const skripDimuat = [];
const aksiDipanggil = new Map();   // nama aksi -> jumlah; dicatat PER PERAN (di-reset tiap masuk)
const panggilan = [];

let peran = "VERIFIKATOR";
let detail = null;
let tundaVerifikasiMs = 0;
let ringkasanGagal = false, ringkasanTotal = 12, tundaRingkasanMs = 0;
let nomorBaris = 300;   // jawaban detail di-cache klien 2 menit per nomor baris
const CORS = [{ name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Headers", value: "*" }, { name: "Access-Control-Allow-Methods", value: "*" }];

function buatDetail({ status = "Proses Verifikasi", ket = "", tgl = "", oleh = "", nama = "", layanan = "IMAM MASJID" } = {}) {
  const d = new Array(60).fill("");
  Object.assign(d, { 0: 1, 1: "SITI AMINAH", 2: "1271010101900001", 3: "PEREMPUAN", 4: "MEDAN", 5: "04-02-1989", 6: "JL X NO 1", 7: layanan, 8: "MASJID AL IKHLAS", 9: "JL. MARELAN RAYA NO 5",
    10: "MEDAN MARELAN", 11: "RUGEMUK", 12: "SITI AMINAH", 13: "12345678901234", 14: "SUMUT", 15: "0812345678", 16: "YA", 31: "", 32: status, 33: ket, 34: tgl, 35: oleh, 51: false, 54: nama });
  return d;
}
function jawab(aksi, args) {
  if (aksi === "pulihkanSesi") return { sukses: true, token: "TOKEN-UJI", username: peran === "VERIFIKATOR" ? "verif_andi" : "petugas", role: peran, kecamatan: peran === "GURU MAGHRIB MENGAJI" ? "MEDAN MARELAN" : "", userId: "", profileBelumDiisi: false, profil: { namaLengkap: "ANDI SAPUTRA", nomorHp: "0800", jabatan: "Verifikator" } };
  if (aksi === "loginPengguna") { panggilan.push({ aksi, args }); return { sukses: true, token: "TOKEN-LOGIN", username: args[0], role: "VERIFIKATOR", kecamatan: "", userId: "", profileBelumDiisi: true, profil: { namaLengkap: "", nomorHp: "", jabatan: "" }, pesan: "Login berhasil." }; }
  if (aksi === "simpanProfilUser") { panggilan.push({ aksi, args }); return { sukses: true, pesan: "ok" }; }
  if (aksi === "getMasterLayanan") return { kecamatan: ["IMAM MASJID"], kemenag: ["GURU MAGHRIB MENGAJI"] };
  if (aksi === "ambilDetailPenerimaPerBaris") return { sukses: true, dataLengkap: detail };
  if (aksi === "ambilRiwayatEdit") return { sukses: true, riwayat: [] };
  if (aksi === "getRingkasanVerifikasiSaya") return ringkasanGagal ? { sukses: false, pesan: "galat uji" } : { sukses: true, total: ringkasanTotal, hariIni: 3, memenuhiSyarat: 8, berkasTidakLengkap: 3, tidakMemenuhiSyarat: 1 };
  if (aksi === "getTemplatAlasan") return { sukses: true, templat: [{ id: 1, status: "Berkas Tidak Lengkap", judul: "KTP buram", isi: "KTP BURAM", layanan: [], urutan: 1, aktif: true }], layananKecamatan: ["IMAM MASJID"], layananKemenag: ["GURU MAGHRIB MENGAJI"] };
  if (aksi === "verifikasiSatuData") { panggilan.push({ aksi, args }); return { sukses: true, pesan: "Status verifikasi berhasil disimpan.", status: args[2], keterangan: args[3], tanggal: "12-11-2026 10:00", verifikator: "VERIF_ANDI", namaLengkap: "Andi Saputra", batasWaktu: args[4] || "" }; }
  return { sukses: true };
}
async function dialihkan(p) {
  const url = p.request.url;
  if (!/supabase\.co|\/api\/gas/.test(url)) { await kirim("Fetch.continueRequest", { requestId: p.requestId }); return; }
  if (p.request.method === "OPTIONS") { await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 204, responseHeaders: CORS, body: "" }); return; }
  let aksi = "?", args = []; try { const b = JSON.parse(p.request.postData || "{}"); aksi = b.action; args = b.args || []; } catch { /* abaikan */ }
  aksiDipanggil.set(aksi, (aksiDipanggil.get(aksi) || 0) + 1);
  const jawaban = jawab(aksi, args);   // dihitung SAAT permintaan tiba, sebelum penundaan (seperti server sungguhan)
  if (aksi === "getRingkasanVerifikasiSaya" && tundaRingkasanMs) await tidur(tundaRingkasanMs);
  if (aksi === "verifikasiSatuData" && tundaVerifikasiMs) await tidur(tundaVerifikasiMs);   // memperlihatkan keadaan "menyimpan..." (tampilan optimistik)
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

async function masuk(peranBaru) {
  peran = peranBaru; aksiDipanggil.clear(); skripDimuat.length = 0;
  await kirim("Page.navigate", { url: BASE + "/" });
  await tungguSampai("!!document.getElementById('tab-rekap') && document.readyState==='complete'", "halaman siap");
  await js(`sessionStorage.setItem('dana_jasa_sesi', JSON.stringify({ token: 'TOKEN-UJI', username: ${JSON.stringify(peranBaru === "VERIFIKATOR" ? "verif_andi" : "petugas")}, role: ${JSON.stringify(peranBaru)}, kecamatan: ${JSON.stringify(peranBaru === "GURU MAGHRIB MENGAJI" ? "MEDAN MARELAN" : "")}, userId: '', namaLengkap: 'ANDI SAPUTRA' })); true`);
  skripDimuat.length = 0;
  await kirim("Page.reload");
  await tungguSampai("!!document.getElementById('tab-rekap') && document.readyState==='complete'", "halaman siap setelah muat ulang");
  await tungguSampai("document.getElementById('modal-login') && document.getElementById('modal-login').classList.contains('hidden')", "sesi tiruan diterima", 60);
  await tidur(2600);   // beri waktu skrip khusus peran dimuat dan pembungkus hak akses berjalan
}
const tampil = (idEl) => js(`(() => { const e = document.getElementById(${JSON.stringify(idEl)}); if (!e) return 'tidak ada'; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return (!e.classList.contains('hidden') && cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0) ? 'tampil' : 'tersembunyi'; })()`);
async function bukaDetail(opsi) {
  detail = buatDetail(opsi);
  await js("window.tampilkanDetailKeModalOnDemand(" + (++nomorBaris) + "); true");
  await tungguSampai("!document.getElementById('modal-detail-penerima').classList.contains('hidden') && /SITI AMINAH/.test(document.getElementById('isi-konten-detail').textContent)", "detail termuat");
  await tidur(900);   // templat alasan dimuat asinkron
  return await js(`(() => { const isi = document.getElementById('isi-konten-detail'); const tombolEdit = document.getElementById('btn-edit-detail');
    const panel = Array.from(isi.querySelectorAll('p')).find((p) => /^Verifikasi/.test(p.textContent.trim()));
    const kotakStatus = isi.querySelector('.mt-2.rounded-lg');
    const chips = Array.from(isi.querySelectorAll('.ac-chips button, .ac-chip')).map((x) => x.textContent.trim());
    const tombolAc = Array.from(isi.querySelectorAll('.ac-kepala button')).map((x) => x.textContent.trim());
    return { judulPanel: panel ? panel.textContent.trim() : null, editTampil: !!tombolEdit && !tombolEdit.classList.contains('hidden'),
      tombol: ['btn-tandai-memenuhi', 'btn-tandai-berkas-tidak-lengkap', 'btn-tandai-tidak-memenuhi', 'btn-tandai-sudah-diperbaiki'].filter((i) => document.getElementById(i)),
      chips, tombolAc, kotakStatus: kotakStatus ? kotakStatus.textContent.replace(/\\s+/g, ' ').trim() : null }; })()`);
}

const isi = (idEl, nilai) => js(`(() => { const e = document.getElementById(${JSON.stringify(idEl)}); e.value = ${JSON.stringify(nilai)}; e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const pesanProfil = () => js("(document.getElementById('profil-pesan') || {}).textContent || ''");
const jumlahSimpan = () => panggilan.filter((x) => x.aksi === "simpanProfilUser").length;

try {
  await sambung();
  await kirim("Runtime.enable"); await kirim("Page.enable"); await kirim("Network.enable");
  await kirim("Fetch.enable", { patterns: [{ urlPattern: "*supabase.co*" }, { urlPattern: "*api/gas*" }] });

  peran = "VERIFIKATOR"; aksiDipanggil.clear(); skripDimuat.length = 0;
  await kirim("Page.navigate", { url: BASE + "/" });
  await tungguSampai("!!document.getElementById('login-username') && document.readyState==='complete'", "halaman login siap");
  await js("sessionStorage.clear(); localStorage.clear(); true");
  await kirim("Page.reload");
  await tungguSampai("!!document.getElementById('login-username') && document.readyState==='complete'", "halaman login siap (bersih)");
  await tidur(800);
  cek("Belum login: formulir masuk tampil", (await tampil("modal-login")) === "tampil");

  await isi("login-username", "verif_uga_deba");
  await isi("login-password", "admin123");
  await js("document.getElementById('btn-login').click(); true");
  await tungguSampai("!document.getElementById('modal-profil-awal').classList.contains('hidden')", "layar profil awal tampil", 60);
  const lg = panggilan.find((x) => x.aksi === "loginPengguna");
  cek("Login memakai username dan sandi dasar yang diketik", !!lg && lg.args[0] === "verif_uga_deba" && lg.args[1] === "admin123", JSON.stringify(lg));
  cek("Login pertama: layar profil awal WAJIB muncul (nama belum terisi)", (await tampil("modal-profil-awal")) === "tampil");
  const tombolModal = await js("Array.from(document.getElementById('modal-profil-awal').querySelectorAll('button')).map((b) => b.id || b.textContent.trim())");
  cek("Layar profil awal tanpa tombol tutup/lewati (hanya SIMPAN & LANJUTKAN)", tombolModal.length === 1 && tombolModal[0] === "profil-simpan", JSON.stringify(tombolModal));
  cek("Kolom sandi baru dan konfirmasi ada di layar profil awal", (await js("!!document.getElementById('profil-pass-baru') && !!document.getElementById('profil-pass-konfirm')")) === true);

  // Validasi bertahap: tidak ada yang sampai ke server sebelum semua benar
  await js("document.getElementById('profil-simpan').click(); true");
  cek("Kosong semua -> 'Nama lengkap wajib diisi', tidak dikirim ke server", /Nama lengkap wajib/.test(await pesanProfil()) && jumlahSimpan() === 0, await pesanProfil());
  await isi("profil-nama", "Uga Deba Syahputra Sembiring");
  await isi("profil-hp", "081234567890");
  await isi("profil-jabatan", "Verifikator Tim IV");
  await js("document.getElementById('profil-simpan').click(); true");
  cek("Tanpa sandi baru -> ditolak layar, tidak dikirim", /Password baru dan konfirmasi wajib/.test(await pesanProfil()) && jumlahSimpan() === 0, await pesanProfil());
  await isi("profil-pass-baru", "Sandi2027baru"); await isi("profil-pass-konfirm", "Beda2027baru");
  await js("document.getElementById('profil-simpan').click(); true");
  cek("Konfirmasi berbeda -> ditolak, tidak dikirim", /tidak sama/.test(await pesanProfil()) && jumlahSimpan() === 0, await pesanProfil());
  await isi("profil-pass-baru", "abcdefgh"); await isi("profil-pass-konfirm", "abcdefgh");
  await js("document.getElementById('profil-simpan').click(); true");
  cek("Sandi tanpa angka -> ditolak, tidak dikirim", /huruf dan angka/.test(await pesanProfil()) && jumlahSimpan() === 0, await pesanProfil());
  await isi("profil-hp", "0712345");
  await isi("profil-pass-baru", "Sandi2027baru"); await isi("profil-pass-konfirm", "Sandi2027baru");
  await js("document.getElementById('profil-simpan').click(); true");
  cek("Nomor HP tidak valid -> ditolak, tidak dikirim", /Nomor HP tidak valid/.test(await pesanProfil()) && jumlahSimpan() === 0, await pesanProfil());

  // Semua benar
  await isi("profil-hp", "081234567890");
  await js("document.getElementById('profil-simpan').click(); true");
  await tungguSampai("document.getElementById('modal-profil-awal').classList.contains('hidden')", "layar profil awal tertutup", 40);
  const sp = panggilan.find((x) => x.aksi === "simpanProfilUser");
  cek("Isian lengkap -> simpanProfilUser dikirim dengan token, nama, HP, jabatan, sandi baru (bukan admin123)",
    !!sp && sp.args[0] === "TOKEN-LOGIN" && sp.args[1] === "Uga Deba Syahputra Sembiring" && sp.args[2] === "081234567890" && sp.args[3] === "Verifikator Tim IV" && sp.args[4] === "Sandi2027baru" && sp.args[4] !== "admin123", JSON.stringify(sp));
  await tidur(2800);   // skrip khusus peran dimuat, hak akses diterapkan
  cek("Sesudah profil: modul verifikator dimuat", skripDimuat.some((u) => /app-verifikator\.js/.test(u)), JSON.stringify(skripDimuat.map((u) => u.split("/").pop())));
  cek("Sesudah profil: tab Input tersembunyi dan Lihat Data tampil", (await tampil("tab-input")) === "tersembunyi" && (await tampil("panel-rekap")) === "tampil");
  const badge = await js("(document.getElementById('djpm-badge-verifikasi') || {}).textContent || ''");
  cek("Sesudah profil: badge 'Verifikasi saya' tampil dengan angka dari server", /Verifikasi saya: 12/.test(badge), JSON.stringify(badge));
  const luar = [...aksiDipanggil.keys()].filter((a) => !AKSI_VERIFIKATOR.has(a));
  cek("Seluruh aksi selama login pertama (login, profil, status input, dst.) ada di daftar-putih server", luar.length === 0, "di luar daftar: " + luar.join(", ") + " | dipanggil: " + [...aksiDipanggil.keys()].join(", "));
  cek("Tidak ada galat JavaScript selama login pertama", galatJs.length === 0, galatJs.slice(0, 3).join(" | "));
} catch (e) {
  console.log("GALAT HARNESS: " + e.message); gagal++;
} finally {
  try { ws && ws.close(); } catch { /* abaikan */ }
  chrome.kill();
  console.log("\n" + (gagal === 0 ? "SEMUA LULUS" : gagal + " GAGAL"));
  process.exit(gagal === 0 ? 0 : 1);
}
