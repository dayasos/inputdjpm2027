// Detail > Edit Data: Alamat Tugas SEMENTARA terbuka untuk akun GMM pada data GMM bertempat tugas RUMAH (server TIRUAN).
// Rencana: plans/plan-alamat-gmm-rumah-sementara.md. Uji MANUAL di Chrome sungguhan (BUKAN bagian dari "npm run uji:*").
// Jalankan:  node scripts/uji/layar/alamat-rumah-gmm.mjs
// Syarat: Chrome terpasang (atau CHROME_PATH), dan server lokal berjalan:  npx vite --port 3123 --strictPort
// Aman: tidak ada permintaan ke server asli (jaringan dicegat), WebSocket realtime dimatikan.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:3123";
const PORT = 9339;
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=1100,900", "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map(); const galatJs = []; const panggilan = [];

let peran = "GURU MAGHRIB MENGAJI";
let detail = null;           // dataLengkap yang dikembalikan server tiruan
let nomorBaris = 100;        // nomor baris berbeda tiap skenario: jawaban detail di-cache klien 2 menit per nomor baris
const CORS = [{ name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Headers", value: "*" }, { name: "Access-Control-Allow-Methods", value: "*" }];

// Indeks dataLengkap: 0 no, 1 nama, 2 nik, 3 jk, 4 tempat lahir, 5 tgl lahir, 6 alamat, 7 layanan, 8 tempat tugas, 9 alamat tugas, 10 kecamatan,
// 11 kelurahan, 12 nama rek, 13 no rek, 14 kantor, 15 kontak, 16 bpjs, 31 koordinat, 32 status, 51 milik sendiri (MUI).
function buatDetail({ layanan = "GURU MAGHRIB MENGAJI", tempat = "RUMAH", alamat = "JL. MARELAN RAYA NO 5", status = "Memenuhi Syarat" } = {}) {
  const d = new Array(60).fill("");
  Object.assign(d, { 0: 1, 1: "SITI AMINAH", 2: "1271010101900001", 3: "PEREMPUAN", 4: "MEDAN", 5: "04-02-1989", 6: "JL X NO 1", 7: layanan, 8: tempat, 9: alamat,
    10: "MEDAN MARELAN", 11: "RUGEMUK", 12: "SITI AMINAH", 13: "12345678901234", 14: "SUMUT", 15: "0812345678", 16: "YA",
    31: "https://www.google.com/maps?q=3.595200,98.672200", 32: status, 51: false });
  return d;
}
function jawab(aksi, args) {
  if (aksi === "pulihkanSesi") return { sukses: true, token: "TOKEN-UJI", username: "petugas", role: peran, kecamatan: "MEDAN MARELAN", userId: "", profileBelumDiisi: false, profil: { namaLengkap: "PETUGAS UJI", nomorHp: "0800", jabatan: "X" } };
  if (aksi === "getMasterLayanan") return { kecamatan: ["IMAM MASJID"], kemenag: ["GURU MAGHRIB MENGAJI"] };
  if (aksi === "ambilDetailPenerimaPerBaris") return { sukses: true, dataLengkap: detail };
  if (aksi === "ambilRiwayatEdit") return { sukses: true, riwayat: [] };
  if (aksi === "editDataPenerima") { panggilan.push({ aksi, args }); return { sukses: true, pesan: "Data berhasil diperbarui (1 kolom diubah).", berkasDiubah: 0 }; }
  return { sukses: true };
}
async function dialihkan(p) {
  const url = p.request.url;
  if (!/supabase\.co|\/api\/gas/.test(url)) { await kirim("Fetch.continueRequest", { requestId: p.requestId }); return; }
  if (p.request.method === "OPTIONS") { await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 204, responseHeaders: CORS, body: "" }); return; }
  let aksi = "?", args = []; try { const b = JSON.parse(p.request.postData || "{}"); aksi = b.action; args = b.args || []; } catch { /* abaikan */ }
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
  peran = peranBaru;
  await kirim("Page.navigate", { url: BASE + "/" });
  await tungguSampai("!!document.getElementById('tab-rekap') && document.readyState==='complete'", "halaman siap");
  await js(`sessionStorage.setItem('dana_jasa_sesi', JSON.stringify({ token: 'TOKEN-UJI', username: 'petugas', role: ${JSON.stringify(peranBaru)}, kecamatan: 'MEDAN MARELAN', userId: '', namaLengkap: 'PETUGAS UJI' })); true`);
  await kirim("Page.reload");
  await tungguSampai("!!document.getElementById('tab-rekap') && document.readyState==='complete'", "halaman siap setelah muat ulang");
  await tungguSampai("document.getElementById('modal-login') && document.getElementById('modal-login').classList.contains('hidden')", "sesi tiruan diterima", 60);
}
// Buka detail baris 1 lalu (bila tombol ada) masuk mode edit. Mengembalikan keadaan kolom Alamat Tugas.
async function bukaEdit(peranBaru, opsiDetail, { ditutup = false } = {}) {
  await masuk(peranBaru);
  detail = buatDetail(opsiDetail);
  await js(`inputDitutupGlobal = ${ditutup ? "true" : "false"}; true`);
  await js("window.tampilkanDetailKeModalOnDemand(" + (++nomorBaris) + "); true");
  await tungguSampai("!document.getElementById('modal-detail-penerima').classList.contains('hidden') && /SITI AMINAH/.test(document.getElementById('isi-konten-detail').textContent)", "detail termuat");
  const adaTombol = await js("!document.getElementById('btn-edit-detail').classList.contains('hidden')");
  if (!adaTombol) return { adaTombol };
  await js("document.getElementById('btn-edit-detail').click(); true");
  await tungguSampai("!!document.getElementById('edit-1')", "mode edit aktif");
  return await js(`(() => { const e = document.getElementById('edit-9'); return {
    adaTombol: true, adaKolom: !!e, nilai: e ? e.value : null, bolehDiketik: !!e && !e.disabled && !e.readOnly,
    catatanTautan: /Alamat Tugas masih berupa tautan/.test(document.getElementById('isi-konten-detail').textContent) }; })()`);
}

try {
  await sambung();
  await kirim("Runtime.enable"); await kirim("Page.enable"); await kirim("Network.enable");
  await kirim("Fetch.enable", { patterns: [{ urlPattern: "*supabase.co*" }, { urlPattern: "*api/gas*" }] });

  // 1. Akun GMM + data GMM bertempat tugas RUMAH + alamat sah: kolom TERBUKA (tanpa catatan "masih berupa tautan")
  let k = await bukaEdit("GURU MAGHRIB MENGAJI", {});
  cek("GMM + RUMAH + alamat sah: kolom Alamat Tugas terbuka dan bisa diketik", k.adaKolom && k.bolehDiketik && k.nilai === "JL. MARELAN RAYA NO 5", JSON.stringify(k));
  cek("GMM + RUMAH + alamat sah: catatan 'masih berupa tautan' TIDAK tampil (bukan kasus tautan)", k.catatanTautan === false, JSON.stringify(k));

  await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(path.join(os.tmpdir(), "djpm_alamat_rumah_gmm_edit.png"), Buffer.from(s.result.data, "base64")));

  // 2. Mengubah alamat lalu simpan: yang dikirim ke server hanya kolom 9, nilai baru
  await js("(() => { const e = document.getElementById('edit-9'); e.value = 'jl. marelan raya no 6 lingkungan 3'; e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()");
  panggilan.length = 0;
  await js("document.getElementById('btn-simpan-edit').click(); true");
  await tungguSampai("true", "tunda", 2);
  await tidur(800);
  const kirimEdit = panggilan[0];
  const teks = kirimEdit && kirimEdit.args && kirimEdit.args[2] && kirimEdit.args[2].teks;
  cek("Simpan: server menerima TEPAT satu kolom (Alamat Tugas) dengan nilai baru", !!teks && Object.keys(teks).join(",") === "9" && teks[9] === "jl. marelan raya no 6 lingkungan 3", JSON.stringify(kirimEdit));

  // 3. Alamat baru berupa tautan / terlalu pendek: ditolak di layar, TIDAK dikirim ke server
  await bukaEdit("GURU MAGHRIB MENGAJI", {});
  panggilan.length = 0;
  for (const salah of ["https://maps.app.goo.gl/abc", "JL A"]) {
    await js(`(() => { const e = document.getElementById('edit-9'); e.value = ${JSON.stringify(salah)}; return true; })()`);
    await js("document.getElementById('btn-simpan-edit').click(); true");
    await tidur(500);
  }
  cek("Alamat tautan / terlalu pendek ditolak di layar (tidak ada permintaan ke server)", panggilan.length === 0, JSON.stringify(panggilan));

  // 4. Tempat tugas BUKAN rumah: terkunci
  k = await bukaEdit("GURU MAGHRIB MENGAJI", { tempat: "MASJID AL IKHLAS" });
  cek("GMM + tempat tugas MASJID: kolom Alamat Tugas TERKUNCI", k.adaKolom === false, JSON.stringify(k));

  // 5. Admin Utama + RUMAH + alamat sah: tetap terkunci di Detail > Edit (seperti semula)
  k = await bukaEdit("UTAMA", {});
  cek("UTAMA + RUMAH + alamat sah: kolom Alamat Tugas tetap TERKUNCI", k.adaKolom === false, JSON.stringify(k));

  // 6. Perilaku lama utuh: alamat berupa tautan terbuka + catatan tampil (untuk GMM dan UTAMA)
  for (const p of ["GURU MAGHRIB MENGAJI", "UTAMA"]) {
    k = await bukaEdit(p, { tempat: "MASJID AL IKHLAS", alamat: "HTTPS://MAPS.APP.GOO.GL/ABC" });
    cek(`${p} + alamat berupa tautan: kolom terbuka dan catatan 'masih berupa tautan' tampil (perilaku lama)`, k.adaKolom && k.bolehDiketik && k.catatanTautan, JSON.stringify(k));
  }

  // 7. Layanan lain (akun yang sama tak bisa, tetapi cek aturan di layar): peran GMM melihat data layanan lain RUMAH -> terkunci
  k = await bukaEdit("GURU MAGHRIB MENGAJI", { layanan: "USTADZ", tempat: "RUMAH" });
  cek("Data layanan LAIN (USTADZ) bertempat tugas RUMAH: kolom tetap TERKUNCI", k.adaKolom === false, JSON.stringify(k));

  // 8. Periode input DITUTUP: tombol Edit Data hilang untuk akun GMM (pelonggaran berakhir sendiri)
  k = await bukaEdit("GURU MAGHRIB MENGAJI", {}, { ditutup: true });
  cek("Periode input DITUTUP: tombol Edit Data tidak tampil bagi akun GMM", k.adaTombol === false, JSON.stringify(k));

  cek("Tidak ada galat JavaScript selama pengujian", galatJs.length === 0, galatJs.slice(0, 3).join(" | "));
} catch (err) { console.log("GALAT HARNESS: " + err.message); gagal++; }
finally { try { ws && ws.close(); } catch { /* abaikan */ } chrome.kill(); await tidur(500); try { fs.rmSync(profil, { recursive: true, force: true }); } catch { /* abaikan */ } }
console.log(gagal === 0 ? "\nSEMUA LULUS" : `\n${gagal} GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
