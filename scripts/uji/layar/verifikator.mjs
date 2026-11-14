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
const PORT = 9341;
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
  if (aksi === "ubahAkunSendiri") { panggilan.push({ aksi, args }); return { sukses: true, pesan: "Password berhasil diperbarui." }; }
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

try {
  await sambung();
  await kirim("Runtime.enable"); await kirim("Page.enable"); await kirim("Network.enable");
  await kirim("Fetch.enable", { patterns: [{ urlPattern: "*supabase.co*" }, { urlPattern: "*api/gas*" }] });

  // ============================ VERIFIKATOR ============================
  await masuk("VERIFIKATOR");
  cek("VERIFIKATOR: modul khusus (app-verifikator.js) dan alasan cepat dimuat; modul admin UTAMA TIDAK dimuat",
    skripDimuat.some((u) => /app-verifikator\.js/.test(u)) && skripDimuat.some((u) => /app-templat-alasan\.js/.test(u)) && !skripDimuat.some((u) => /app-jadwal-pesan|app-laporan-progres|app-cek-rumah-ibadah|app-templat-kelola/.test(u)), JSON.stringify(skripDimuat.map((u) => u.split("/").pop())));
  const keadaan = { tabInput: await tampil("tab-input"), panelInput: await tampil("panel-input"), panelRekap: await tampil("panel-rekap"), tabRekap: await tampil("tab-rekap"), dashboard: await tampil("btn-dashboard-progres") };
  cek("VERIFIKATOR: tab Input tersembunyi dan panel Input tidak terlihat", keadaan.tabInput === "tersembunyi" && keadaan.panelInput === "tersembunyi", JSON.stringify(keadaan));
  cek("VERIFIKATOR: tab Input tidak bisa diklik (nonaktif)", await js("(() => { const t = document.getElementById('tab-input'); return !!t && (t.disabled === true || t.style.pointerEvents === 'none'); })()"));
  cek("VERIFIKATOR: tampilan awal = Lihat Data", keadaan.panelRekap === "tampil", JSON.stringify(keadaan));
  for (const idEl of ["btn-data-detail", "btn-retur-kematian", "tab-tools", "tab-kelola-data", "btn-kelola-kuota", "btn-progres-kuota", "btn-kelola-user", "btn-kelola-rumah-ibadah", "btn-cek-rumah-ibadah"]) {
    const s = await tampil(idEl);
    cek(`VERIFIKATOR: ${idEl} tidak terlihat`, s !== "tampil", s);
  }
  cek("VERIFIKATOR: tombol Dashboard Progres terlihat (diizinkan)", keadaan.dashboard === "tampil", JSON.stringify(keadaan));

  // Detail data Proses Verifikasi: panel verifikasi, tanpa Edit
  let k = await bukaDetail({ status: "Proses Verifikasi" });
  cek("VERIFIKATOR: panel verifikasi tampil berjudul 'Verifikasi' (bukan 'Verifikasi Admin Utama')", k.judulPanel === "Verifikasi", JSON.stringify(k));
  cek("VERIFIKATOR: tiga tombol status tersedia", ["btn-tandai-memenuhi", "btn-tandai-berkas-tidak-lengkap", "btn-tandai-tidak-memenuhi"].every((i) => k.tombol.includes(i)), JSON.stringify(k.tombol));
  cek("VERIFIKATOR: tombol Edit Data TIDAK tampil", k.editTampil === false, JSON.stringify(k));
  cek("VERIFIKATOR: alasan cepat tampil (chip templat) tanpa tombol Kelola", k.chips.some((c) => /KTP buram/i.test(c)) && !k.tombolAc.some((t) => /Kelola/.test(t)), JSON.stringify({ chips: k.chips, tombolAc: k.tombolAc }));
  await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(path.join(os.tmpdir(), "djpm_verifikator_detail.png"), Buffer.from(s.result.data, "base64")));

  // Memberi status: permintaan ke server memuat token dan status yang benar
  panggilan.length = 0;
  await js("document.getElementById('btn-tandai-memenuhi').click(); true");
  await tidur(1500);
  const p1 = panggilan.find((x) => x.aksi === "verifikasiSatuData");
  cek("VERIFIKATOR: 'Tandai Memenuhi Syarat' memanggil verifikasiSatuData dengan status Memenuhi Syarat", !!p1 && p1.args[0] === "TOKEN-UJI" && p1.args[2] === "Memenuhi Syarat", JSON.stringify(p1));
  const sesudah = await js(`(() => { const k = document.getElementById('isi-konten-detail').querySelector('.mt-2.rounded-lg'); return k ? k.textContent.replace(/\\s+/g, ' ').trim() : null; })()`);
  cek("VERIFIKATOR: sesudah verifikasi, kotak status langsung memuat username DAN nama lengkap pemverifikator baru", sesudah === "Diverifikasi oleh VERIF_ANDI (Andi Saputra) · 12-11-2026 10:00", JSON.stringify(sesudah));

  // D9: data yang SUDAH berstatus tidak dapat diubah verifikator: tanpa panel/tombol hasil, hanya keterangan
  for (const st of ["Berkas Tidak Lengkap", "Memenuhi Syarat", "Tidak Memenuhi Syarat"]) {
    const kk = await bukaDetail({ status: st, ket: st === "Memenuhi Syarat" ? "" : "alasan", tgl: "01-11-2026 08:00", oleh: "BUDI_LAMA", nama: "Budi Lama" });
    const adaCatatan = await js("/Hasil verifikasi sudah diberikan\\. Perubahan hanya dapat dilakukan oleh Admin Utama/.test(document.getElementById('isi-konten-detail').textContent)");
    cek("VERIFIKATOR (D9): data berstatus '" + st + "' tanpa panel verifikasi dan tanpa tombol hasil/perbaikan, ada catatan 'perubahan hanya Admin Utama'",
      kk.judulPanel === null && kk.tombol.length === 0 && adaCatatan === true, JSON.stringify({ kk, adaCatatan }));
  }

  // Tampilan pemverifikator dengan nama lengkap (K5)
  k = await bukaDetail({ status: "Memenuhi Syarat", tgl: "12-11-2026 10:00", oleh: "VERIF_ANDI", nama: "Andi Saputra" });
  cek("VERIFIKATOR: tampil 'Diverifikasi oleh VERIF_ANDI (Andi Saputra) · 12-11-2026 10:00'", k.kotakStatus === "Diverifikasi oleh VERIF_ANDI (Andi Saputra) · 12-11-2026 10:00", JSON.stringify(k.kotakStatus));
  k = await bukaDetail({ status: "Memenuhi Syarat", tgl: "05-11-2026 12:11", oleh: "ADMIN", nama: "" });
  cek("Tanpa nama lengkap: tampil username saja ('Diverifikasi oleh ADMIN · ...')", k.kotakStatus === "Diverifikasi oleh ADMIN · 05-11-2026 12:11", JSON.stringify(k.kotakStatus));
  k = await bukaDetail({ status: "Berkas Tidak Lengkap", ket: "KTP buram", tgl: "01-11-2026 08:00", oleh: "VERIF_ANDI", nama: "Andi Saputra" });
  cek("VERIFIKATOR (D9): data Berkas Tidak Lengkap TIDAK menampilkan 'Tandai Sudah Diperbaiki', tetapi keterangan tetap terbaca", !k.tombol.includes("btn-tandai-sudah-diperbaiki") && /Keterangan: KTP buram/.test(k.kotakStatus || ""), JSON.stringify(k));

  cek("VERIFIKATOR: tidak ikut timer/pesan periode input (ambilStatusPeriode TIDAK dipanggil)", !aksiDipanggil.has("ambilStatusPeriode"), [...aksiDipanggil.keys()].join(", "));

  // Kolom username di "Ganti Password/Username" dikunci untuk Verifikator
  await js("document.getElementById('fab-ganti-password').click(); true");
  await tidur(400);
  await js("(() => { const e = document.getElementById('gp-username'); e.disabled = false; e.readOnly = false; e.value = 'verif_baru'; return true; })()");   // simulasi upaya mengisi
  await tidur(2600);   // pemeriksaan berkala modul verifikator mengunci ulang dan mengosongkan
  const kunci = await js("(() => { const e = document.getElementById('gp-username'); return { ada: !!e, disabled: e.disabled, readOnly: e.readOnly, nilai: e.value, label: (e.parentNode.querySelector('label') || {}).textContent || '' }; })()");
  cek("VERIFIKATOR: kolom username di Ganti Password dikunci (nonaktif), kosong, dan berlabel dikunci", kunci.ada && kunci.disabled && kunci.readOnly && kunci.nilai === '' && /dikunci/.test(kunci.label), JSON.stringify(kunci));
  await js("document.getElementById('gp-lama').value = 'x'; document.getElementById('gp-baru').value = 'Baru2027abc'; document.getElementById('gp-konfirm').value = 'Baru2027abc'; document.getElementById('gp-simpan').click(); true");
  await tidur(900);
  const ua = panggilan.filter((x) => x.aksi === 'ubahAkunSendiri');
  cek("VERIFIKATOR: ganti password saja tetap terkirim dengan username baru KOSONG", ua.length === 1 && ua[0].args[2] === '', JSON.stringify(ua));
  await js("document.getElementById('modal-ganti-password') && document.getElementById('modal-ganti-password').classList.add('hidden'); true");

  // Badge melayang: agregat verifikasi akun yang login
  await tidur(1200);
  const badge = await js("(() => { const e = document.getElementById('djpm-badge-verifikasi'); if (!e) return null; const r = e.getBoundingClientRect(); return { teks: e.textContent.replace(/\\s+/g, ' ').trim(), tetap: getComputedStyle(e).position, terlihat: r.width > 0 && r.height > 0 }; })()");
  cek("VERIFIKATOR: badge melayang tampil (posisi tetap) dengan total dan hari ini dari server", !!badge && badge.tetap === 'fixed' && badge.terlihat && /Verifikasi saya: 12/.test(badge.teks) && /Hari ini: 3/.test(badge.teks), JSON.stringify(badge));
  await js("document.getElementById('djpm-badge-verifikasi').click(); true");
  const badge2 = await js("document.getElementById('djpm-badge-verifikasi').textContent.replace(/\\s+/g, ' ')");
  cek("VERIFIKATOR: ketuk badge membuka rincian per status", /Memenuhi Syarat: 8/.test(badge2) && /Berkas Tidak Lengkap: 3/.test(badge2) && /Tidak Memenuhi Syarat: 1/.test(badge2), JSON.stringify(badge2));
  await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(path.join(os.tmpdir(), "djpm_verifikator_badge.png"), Buffer.from(s.result.data, "base64")));
  const tumpang = await js(`(() => { const b = document.getElementById('djpm-badge-verifikasi').getBoundingClientRect(); const out = [];
    document.querySelectorAll('button, a, input, select, textarea').forEach((e) => { if (e.closest('#djpm-badge-verifikasi')) return; const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return; const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none') return;
      const x = Math.min(r.right, b.right) - Math.max(r.left, b.left), y = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top); if (x > 1 && y > 1 && document.elementFromPoint(Math.max(r.left, b.left) + x / 2, Math.max(r.top, b.top) + y / 2) === document.getElementById('djpm-badge-verifikasi') || x > 1 && y > 1 && document.getElementById('djpm-badge-verifikasi').contains(document.elementFromPoint(Math.max(r.left, b.left) + x / 2, Math.max(r.top, b.top) + y / 2))) out.push(e.id || e.tagName + ':' + (e.textContent || '').trim().slice(0, 20)); });
    return out; })()`);
  cek("VERIFIKATOR: badge (terbuka) tidak menutupi tombol/isian apa pun di jendela Detail", Array.isArray(tumpang) && tumpang.length === 0, JSON.stringify(tumpang));
  // Penyegaran sesudah klik tombol verifikasi, dan ketahanan saat server gagal
  const sebelum = aksiDipanggil.get('getRingkasanVerifikasiSaya') || 0;
  ringkasanTotal = 13;
  await js("(() => { const b = document.createElement('button'); b.id = 'btn-tandai-uji'; b.textContent = 'x'; b.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0'; document.body.appendChild(b); b.click(); return true; })()");
  await tidur(3500);
  const segar = await js("document.getElementById('djpm-badge-verifikasi').textContent.replace(/\\s+/g, ' ')");
  cek("VERIFIKATOR: sesudah klik tombol verifikasi angka badge disegarkan dari server (13)", /Verifikasi saya: 13/.test(segar) && (aksiDipanggil.get('getRingkasanVerifikasiSaya') || 0) > sebelum, JSON.stringify(segar));
  ringkasanGagal = true;
  await js("document.getElementById('btn-tandai-uji').click(); true");
  await tidur(3500);
  const tahan = await js("document.getElementById('djpm-badge-verifikasi').textContent.replace(/\\s+/g, ' ')");
  cek("VERIFIKATOR: server gagal -> badge tetap menampilkan angka terakhir yang benar (tidak kosong/rusak)", /Verifikasi saya: 13/.test(tahan), JSON.stringify(tahan));
  ringkasanGagal = false; ringkasanTotal = 12;
  // Jawaban untuk sesi LAMA (akun berganti saat permintaan berjalan) harus dibuang
  tundaRingkasanMs = 2500; ringkasanTotal = 99;
  await js("document.getElementById('btn-tandai-uji').click(); true");
  await tidur(2600);   // permintaan sudah terkirim dan sedang menunggu
  await js("window.__tokenAsli = dataPengguna.token; dataPengguna.token = 'TOKEN-LAIN'; true");
  await tidur(2500);
  const basi = await js("document.getElementById('djpm-badge-verifikasi').textContent.replace(/\\s+/g, ' ')");
  await js("dataPengguna.token = window.__tokenAsli; true");
  tundaRingkasanMs = 0; ringkasanTotal = 12;
  cek("VERIFIKATOR: jawaban untuk token sesi lama dibuang (angka 99 tidak tampil)", !/99/.test(basi), JSON.stringify(basi));
  const pos = await js("(() => { const r = document.getElementById('djpm-badge-verifikasi').getBoundingClientRect(); return { kiri: r.left, bawah: innerHeight - r.bottom }; })()");
  cek("VERIFIKATOR: badge di pojok kiri-bawah (tidak menutupi tombol aksi kanan-bawah)", pos.kiri <= 24 && pos.bawah <= 24, JSON.stringify(pos));
  cek("VERIFIKATOR: badge memanggil getRingkasanVerifikasiSaya dengan token sesi", (aksiDipanggil.get('getRingkasanVerifikasiSaya') || 0) >= 1);

  // Semua aksi yang dipanggil layar selama sesi verifikator HARUS ada di daftar-putih server
  const luarDaftar = [...aksiDipanggil.keys()].filter((a) => !AKSI_VERIFIKATOR.has(a));
  cek("VERIFIKATOR: SELURUH aksi yang dipanggil layar ada di daftar-putih server (tidak ada yang akan ditolak)", luarDaftar.length === 0, "di luar daftar: " + luarDaftar.join(", ") + " | dipanggil: " + [...aksiDipanggil.keys()].join(", "));

  // Logout tidak memuat ulang halaman: akun lain (UTAMA) yang masuk sesudah verifikator HARUS mendapat kolom username kembali normal
  await js("dataPengguna.role = 'UTAMA'; true");
  await tidur(2600);
  const terbuka = await js("(() => { const e = document.getElementById('gp-username'); return { disabled: e.disabled, label: (e.parentNode.querySelector('label') || {}).textContent || '', ph: e.placeholder }; })()");
  cek("Pergantian akun tanpa muat ulang (Verifikator -> UTAMA): kolom username dibuka kembali dan label dipulihkan", terbuka.disabled === false && /Username Baru/.test(terbuka.label) && /Min\. 4 karakter/.test(terbuka.ph), JSON.stringify(terbuka));
  await js("dataPengguna.role = 'VERIFIKATOR'; true");
  await tidur(2600);
  const terkunciLagi = await js("(() => { const e = document.getElementById('gp-username'); return { disabled: e.disabled, label: (e.parentNode.querySelector('label') || {}).textContent || '', ph: e.placeholder }; })()");
  cek("Kembali ke Verifikator: kolom username terkunci lagi", terkunciLagi.disabled === true && /dikunci/.test(terkunciLagi.label), JSON.stringify(terkunciLagi));

  // ============================ UTAMA (regresi) ============================
  await masuk("UTAMA");
  k = await bukaDetail({ status: "Proses Verifikasi" });
  cek("UTAMA (regresi): panel tetap berjudul 'Verifikasi Admin Utama' dan tombol Kelola alasan cepat ada", k.judulPanel === "Verifikasi Admin Utama" && k.tombolAc.some((t) => /Kelola/.test(t)), JSON.stringify(k));
  cek("UTAMA (regresi): tab Input tetap terlihat", (await tampil("tab-input")) === "tampil");
  cek("UTAMA (regresi): badge verifikasi TIDAK tampil", (await js("!document.getElementById('djpm-badge-verifikasi')")) === true);
  await js("document.getElementById('fab-ganti-password').click(); true");
  await tidur(400);
  const kunciUtama = await js("(() => { const e = document.getElementById('gp-username'); return { ada: !!e, disabled: e.disabled, readOnly: e.readOnly, nilai: e.value, label: (e.parentNode.querySelector('label') || {}).textContent || '' }; })()");
  cek("UTAMA (regresi): kolom username TIDAK dikunci", kunciUtama.ada && !kunciUtama.disabled && !/dikunci/.test(kunciUtama.label), JSON.stringify(kunciUtama));
  // UTAMA: tampilan optimistik: saat "menyimpan...", nama pemverifikator LAMA tidak boleh tampil di samping username baru; setelah sukses nama baru tampil
  tundaVerifikasiMs = 1600;
  await bukaDetail({ status: "Berkas Tidak Lengkap", ket: "KTP buram", tgl: "01-11-2026 08:00", oleh: "BUDI_LAMA", nama: "Budi Lama" });
  await js("document.getElementById('btn-tandai-memenuhi').click(); true");
  await tidur(500);
  const kotakJs = `(() => { const k = document.getElementById('isi-konten-detail').querySelector('.mt-2.rounded-lg'); return k ? k.textContent.replace(/\\s+/g, ' ').trim() : null; })()`;
  const saatMenyimpan = await js(kotakJs);
  cek("UTAMA: saat 'menyimpan...' tampil username baru TANPA nama pemverifikator lama", !!saatMenyimpan && /PETUGAS/.test(saatMenyimpan) && !/Budi Lama|BUDI_LAMA/.test(saatMenyimpan), JSON.stringify(saatMenyimpan));
  await tidur(1800);
  const sesudahLambat = await js(kotakJs);
  cek("UTAMA: sesudah sukses tampil nama lengkap pemverifikator baru", sesudahLambat === "Diverifikasi oleh VERIF_ANDI (Andi Saputra) · 12-11-2026 10:00", JSON.stringify(sesudahLambat));
  tundaVerifikasiMs = 0;

  k = await bukaDetail({ status: "Berkas Tidak Lengkap", ket: "KTP buram", tgl: "01-11-2026 08:00", oleh: "VERIF_ANDI", nama: "Andi Saputra" });
  cek("UTAMA (D9): tetap menampilkan panel hasil dan tombol 'Tandai Sudah Diperbaiki' pada data Berkas Tidak Lengkap", k.judulPanel === "Verifikasi Admin Utama" && k.tombol.includes("btn-tandai-sudah-diperbaiki") && k.tombol.includes("btn-tandai-memenuhi"), JSON.stringify(k));
  const rolePil = await js("(() => { const ops = (id) => Array.from((document.getElementById(id) || { options: [] }).options).map((o) => o.value); const s = document.getElementById('tu-role'); s.value = 'VERIFIKATOR'; s.dispatchEvent(new Event('change', { bubbles: true })); const dk = document.getElementById('tu-div-kecamatan'); return { tambah: ops('tu-role'), edit: ops('eu-role'), filter: ops('filter-role-kelola-user'), kecamatanTersembunyi: !!dk && dk.classList.contains('hidden') }; })()");
  cek("UTAMA: role Verifikator ada di dropdown Tambah Pengguna Baru, Edit, dan filter Kelola User", rolePil.tambah.includes('VERIFIKATOR') && rolePil.edit.includes('VERIFIKATOR') && rolePil.filter.includes('VERIFIKATOR'), JSON.stringify(rolePil));
  cek("UTAMA: memilih Verifikator menyembunyikan isian kecamatan", rolePil.kecamatanTersembunyi === true, JSON.stringify(rolePil));
  cek("UTAMA: daftar role lain tetap lengkap (UTAMA, KECAMATAN, MUI, 6 jenis guru/penatua)", ['UTAMA', 'KECAMATAN', 'MUI', 'GURU SEKOLAH BUDDHA', 'GURU SEKOLAH HINDU', 'GURU SEKOLAH KONG HU CHU', 'GURU SEKOLAH MINGGU', 'PENATUA GEREJA', 'GURU MAGHRIB MENGAJI'].every((r) => rolePil.tambah.includes(r)), JSON.stringify(rolePil.tambah));
  cek("UTAMA (regresi): modul verifikator TIDAK dimuat", !skripDimuat.some((u) => /app-verifikator\.js/.test(u)));

  // ============================ GMM (regresi) ============================
  await masuk("GURU MAGHRIB MENGAJI");
  k = await bukaDetail({ status: "Proses Verifikasi", layanan: "GURU MAGHRIB MENGAJI" });
  cek("GMM (regresi): TIDAK ada panel verifikasi dan tidak ada tombol status", k.judulPanel === null && k.tombol.length === 0, JSON.stringify(k));
  cek("GMM (regresi): tab Input tetap terlihat; modul verifikator tidak dimuat", (await tampil("tab-input")) === "tampil" && !skripDimuat.some((u) => /app-verifikator\.js/.test(u)));

  cek("Tidak ada galat JavaScript selama pengujian", galatJs.length === 0, galatJs.slice(0, 3).join(" | "));
} catch (err) { console.log("GALAT HARNESS: " + err.message); gagal++; }
finally { try { ws && ws.close(); } catch { /* abaikan */ } chrome.kill(); await tidur(500); try { fs.rmSync(profil, { recursive: true, force: true }); } catch { /* abaikan */ } }
console.log(gagal === 0 ? "\nSEMUA LULUS" : `\n${gagal} GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
