// Pengingat koordinat GMM: banner berjalan permanen + kotak di formulir foto plank (dengan server TIRUAN).
// Uji MANUAL di Chrome sungguhan (BUKAN bagian dari "npm run uji:*"). Rencana: plans/plan-pengingat-koordinat-gmm.md.
// Jalankan:  node scripts/uji/layar/pengingat-koordinat-gmm.mjs
// Syarat: Chrome terpasang (atau CHROME_PATH), dan server lokal berjalan:  npx vite --port 3123 --strictPort
// Aman: tidak ada permintaan ke server asli (jaringan dicegat), WebSocket realtime dimatikan.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:3123";
const PORT = 9337, OUT = process.env.OUT_DIR || os.tmpdir();
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=1100,900", "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map(); const galatJs = []; const berkasDimuat = [];

const PESAN_BANNER = "Cek dan Pastikan kembali Koordinat terhadap data yang SUDAH diinput adalah BENAR dan menunjukkan alamat tugas Guru Maghrib Mengaji.";
const JUDUL = "PENTING: Koordinat Lokasi.";
const ISI = "Koordinat dipakai Tim Monitoring untuk menemukan lokasi guru. Koordinat yang salah atau hanya perkiraan membuat guru dianggap tidak ditemukan saat monitoring dan dapat berdampak pada pembayaran Dana Jasa yang bersangkutan.";

let peran = "GURU MAGHRIB MENGAJI";
const CORS = [{ name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Headers", value: "*" }, { name: "Access-Control-Allow-Methods", value: "*" }];
function jawab(aksi) {
  if (aksi === "pulihkanSesi") return { sukses: true, token: "TOKEN-UJI", username: "petugas", role: peran, kecamatan: peran === "KECAMATAN" || peran === "GURU MAGHRIB MENGAJI" ? "MEDAN MARELAN" : "", userId: "", profileBelumDiisi: false, profil: { namaLengkap: "PETUGAS UJI", nomorHp: "0800", jabatan: "X" } };
  if (aksi === "getMasterLayanan") return { kecamatan: ["IMAM MASJID"], kemenag: ["GURU MAGHRIB MENGAJI"] };
  return { sukses: true };
}
async function dialihkan(p) {
  const url = p.request.url;
  if (!/supabase\.co|\/api\/gas/.test(url)) { await kirim("Fetch.continueRequest", { requestId: p.requestId }); return; }
  if (p.request.method === "OPTIONS") { await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 204, responseHeaders: CORS, body: "" }); return; }
  let aksi = "?"; try { aksi = JSON.parse(p.request.postData || "{}").action; } catch { /* abaikan */ }
  await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200, responseHeaders: [...CORS, { name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify({ result: jawab(aksi) })).toString("base64") });
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
    else if (m.method === "Network.requestWillBeSent" && /\.js(\?|$)/.test(m.params.request.url)) berkasDimuat.push(m.params.request.url);
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

async function masuk(peranBaru, lebar = 1100) {
  peran = peranBaru;
  berkasDimuat.length = 0;
  await kirim("Emulation.setDeviceMetricsOverride", { width: lebar, height: 900, deviceScaleFactor: 1, mobile: lebar < 600 });
  await kirim("Page.navigate", { url: BASE + "/" });
  await tungguSampai("!!document.getElementById('tab-rekap') && document.readyState==='complete'", "halaman siap");
  await js(`sessionStorage.setItem('dana_jasa_sesi', JSON.stringify({ token: 'TOKEN-UJI', username: 'petugas', role: ${JSON.stringify(peranBaru)}, kecamatan: 'MEDAN MARELAN', userId: '', namaLengkap: 'PETUGAS UJI' })); true`);
  berkasDimuat.length = 0;   // navigasi pertama memakai sesi peran SEBELUMNYA; hitung unduhan hanya sejak sesi baru dipasang
  await kirim("Page.reload");
  await tungguSampai("!!document.getElementById('tab-rekap') && document.readyState==='complete'", "halaman siap setelah muat ulang");
  await tungguSampai("document.getElementById('modal-login') && document.getElementById('modal-login').classList.contains('hidden')", "sesi tiruan diterima", 60);
}
const banner = () => js(`(() => { const b = document.getElementById('pk-banner'); if (!b) return null; const r = b.getBoundingClientRect(); const j = b.querySelector('.pk-jalur'); const cs = getComputedStyle(j);
  return { ada: true, teks: b.querySelector('.pk-teks').textContent, role: b.getAttribute('role'), tombol: b.querySelectorAll('button,[data-tutup],a').length, tinggi: Math.round(r.height), atas: Math.round(r.top), tampil: r.height > 0 && getComputedStyle(b).display !== 'none',
    sebelumnya: b.previousElementSibling && b.previousElementSibling.tagName, anim: cs.animationName, main: cs.animationPlayState, durasi: getComputedStyle(b).getPropertyValue('--pk-durasi').trim(), salinan: b.querySelectorAll('.pk-teks').length,
    salinan2Tampil: getComputedStyle(b.querySelectorAll('.pk-teks')[1]).display, spasi: getComputedStyle(b.querySelector('.pk-jendela')).whiteSpace }; })()`);

// Bekukan animasi pada beberapa fase siklus, ukur apakah jalur teks masih menutupi seluruh jendela banner, lalu pulihkan animasi.
// kananKosong > 0 = ada ruang kosong di kanan jendela; kiriKosong > 0 = ada ruang kosong di kiri.
const cakupanJalur = async (daftarFase) => {
  const hasil = [];
  for (const fraksi of daftarFase) {
    hasil.push(await js(`(() => {
      const j = document.querySelector('#pk-banner .pk-jalur'), w = document.querySelector('#pk-banner .pk-jendela');
      const d = parseFloat(getComputedStyle(document.getElementById('pk-banner')).getPropertyValue('--pk-durasi')) || 22;
      j.style.animationPlayState = 'paused'; j.style.animationDelay = '-' + (d * ${fraksi}) + 's'; void j.offsetWidth;
      const a = j.getBoundingClientRect(), b = w.getBoundingClientRect();
      const salinan = j.querySelectorAll('.pk-teks').length, satu = j.querySelector('.pk-teks').offsetWidth;
      const seharusnya = Math.max(2, Math.ceil(w.clientWidth / satu) + 1);   // jumlah salinan yang tepat untuk lebar jendela sekarang
      return { fase: ${fraksi}, kiriKosong: Math.round(a.left - b.left), kananKosong: Math.round(b.right - a.right), salinan, seharusnya, lebarJendela: Math.round(b.width) };
    })()`));
  }
  await js(`(() => { const j = document.querySelector('#pk-banner .pk-jalur'); j.style.animationPlayState = ''; j.style.animationDelay = ''; return true; })()`);
  return hasil;
};
// Bermasalah bila ada ruang kosong di kiri/kanan jendela, ATAU jumlah salinan tidak sama dengan yang seharusnya (tak menyusut/tak menyesuaikan).
// Banner harus MENEMPEL tepat di bawah header saat halaman digulir: tidak tertimpa header, tidak tertimpa konten, tanpa celah.
const posisiLengket = (gulir) => js(`(async () => {
  window.scrollTo(0, ${gulir}); await new Promise((r) => setTimeout(r, 350));
  const b = document.getElementById('pk-banner'), h = document.querySelector('header');
  const rb = b.getBoundingClientRect(), rh = h.getBoundingClientRect();
  const titikBanner = document.elementFromPoint(rb.left + rb.width / 2, rb.top + rb.height / 2);
  // Titik di tepi kiri-bawah header (tepat di sambungan dengan banner), bukan di tengah: toast "Instal Aplikasi" melayang di tengah atas.
  // y = bawah header - 0,5 px: baris piksel yang BERTUMPUK dengan banner (banner sengaja menyelip 1 px di bawah header); header harus menang.
  const titikHeader = document.elementFromPoint(rh.left + 10, rh.bottom - 0.5);
  return { gulir: Math.round(window.scrollY), tinggiHalaman: document.documentElement.scrollHeight, atasBanner: Math.round(rb.top), bawahHeader: Math.round(rh.bottom),
    selisih: Math.round(rb.top - rh.bottom), tinggiBanner: Math.round(rb.height), bannerTerlihat: rb.bottom > 0 && rb.top < innerHeight,
    bannerDiAtasKonten: !!(titikBanner && titikBanner.closest('#pk-banner')), headerDiAtasBanner: !!(titikHeader && titikHeader.closest('header')), top: b.style.top };
})()`);
const lengketBaik = (p) => p.bannerTerlihat && p.bannerDiAtasKonten && p.headerDiAtasBanner && p.selisih >= -1 && p.selisih <= 1;
const adaRuangKosong = (hasil) => hasil.some((r) => r.kananKosong > 1 || r.kiriKosong > 1 || r.salinan !== r.seharusnya);

try {
  await sambung();
  await kirim("Runtime.enable"); await kirim("Page.enable"); await kirim("Network.enable");
  await kirim("Fetch.enable", { patterns: [{ urlPattern: "*supabase.co*" }, { urlPattern: "*api/gas*" }] });

  // ============================ AKUN GMM ============================
  await masuk("GURU MAGHRIB MENGAJI");
  await tungguSampai("!!document.getElementById('pk-banner')", "banner muncul untuk GMM", 40);
  let b = await banner();
  cek("GMM: banner muncul tepat di bawah header (elemen sebelumnya = HEADER)", b && b.tampil && b.sebelumnya === "HEADER", JSON.stringify(b));
  cek("GMM: teks banner persis kalimat yang disetujui", b.teks === PESAN_BANNER, b.teks);
  cek("GMM: banner permanen = tanpa tombol/tautan penutup, role=note", b.tombol === 0 && b.role === "note", JSON.stringify(b));
  cek("GMM: teks bergerak (animasi pk-geser berjalan), durasi terukur 14-60 detik, ada salinan untuk gerak tanpa putus", b.anim === "pk-geser" && b.main === "running" && /^(1[4-9]|[2-5]\d|60)s$/.test(b.durasi) && b.salinan >= 2, JSON.stringify(b));
  cek("GMM: skrip pengingat diunduh untuk peran GMM", berkasDimuat.some((u) => /app-pengingat-koordinat-gmm\.js/.test(u)));
  await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(`${OUT}/djpm_pk_banner_desktop.png`, Buffer.from(s.result.data, "base64")));

  // muat ulang: tetap muncul (tidak bisa ditutup/diingat)
  await kirim("Page.reload");
  await tungguSampai("document.getElementById('modal-login') && document.getElementById('modal-login').classList.contains('hidden')", "sesi pulih", 60);
  await tungguSampai("!!document.getElementById('pk-banner')", "banner muncul lagi setelah muat ulang", 40);
  cek("GMM: setelah muat ulang banner muncul lagi (permanen)", true);

  // semua tab
  for (const tab of ["tab-rekap", "tab-input"]) {
    await js(`document.getElementById('${tab}').click(); true`); await tidur(300);
    const t = await banner();
    cek(`GMM: banner tetap terlihat di ${tab}`, !!t && t.tampil, JSON.stringify(t));
  }

  // kotak formulir
  await js(`(() => { const sel = document.getElementById('input-layanan'); if (![...sel.options].some(o => o.value === 'GURU MAGHRIB MENGAJI')) { const o = document.createElement('option'); o.value = 'GURU MAGHRIB MENGAJI'; o.textContent = 'GURU MAGHRIB MENGAJI'; sel.appendChild(o); } sel.value = 'GURU MAGHRIB MENGAJI'; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await tidur(500);
  // Memilih layanan GMM membuka pop-up pemilih tempat tugas (modal-kemenag) yang menutupi layar; tutup agar pengujian tampilan tidak terhalang.
  await js("(() => { for (const id of ['modal-kemenag', 'modal-ri']) { const m = document.getElementById(id); if (m) m.classList.add('hidden'); } return true; })()");
  const kotak = () => js(`(() => { const k = document.getElementById('pk-kotak-formulir'); const w = document.getElementById('wrapper-foto-plank'); if (!k) return { ada: false, wadahTampil: w && !w.classList.contains('hidden') }; const r = k.getBoundingClientRect(); return { ada: true, tampil: r.height > 0, judul: k.querySelector('strong').textContent, teks: k.textContent, pertama: w.firstElementChild === k, jumlah: document.querySelectorAll('#pk-kotak-formulir').length, wadahTampil: !w.classList.contains('hidden'), meluber: k.scrollWidth > k.clientWidth + 1 }; })()`);
  let k = await kotak();
  cek("GMM: kotak 'PENTING: Koordinat Lokasi' tampil di bagian foto plank (elemen pertama), teks persis", k.ada && k.tampil && k.pertama && k.judul === JUDUL && k.teks === JUDUL + " " + ISI, JSON.stringify(k));
  await kirim("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }).then((s) => fs.writeFileSync(`${OUT}/djpm_pk_formulir_desktop.png`, Buffer.from(s.result.data, "base64")));
  await js(`(() => { const sel = document.getElementById('input-layanan'); if (![...sel.options].some(o => o.value === 'IMAM MASJID')) { const o = document.createElement('option'); o.value = 'IMAM MASJID'; o.textContent = 'IMAM MASJID'; sel.appendChild(o); } sel.value = 'IMAM MASJID'; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await tidur(400);
  k = await kotak();
  cek("Layanan lain dipilih: wadah foto plank tersembunyi sehingga kotak tidak terlihat", k.ada && !k.wadahTampil && !k.tampil, JSON.stringify(k));
  await js(`document.getElementById('input-layanan').value='GURU MAGHRIB MENGAJI'; document.getElementById('input-layanan').dispatchEvent(new Event('change',{bubbles:true})); true`);
  await tidur(300);
  await js("(() => { for (const id of ['modal-kemenag', 'modal-ri']) { const m = document.getElementById(id); if (m) m.classList.add('hidden'); } return true; })()");

  // idempoten + pemulihan
  await js(`(() => { for (let i = 0; i < 5; i++) window.djpmPengingatKoordinat.selaraskan(); return true; })()`);
  cek("Idempoten: selaraskan berulang tidak menggandakan banner maupun kotak", await js("document.querySelectorAll('#pk-banner').length === 1 && document.querySelectorAll('#pk-kotak-formulir').length === 1"));
  await js("document.getElementById('pk-kotak-formulir').remove(); true");
  await tungguSampai("!!document.getElementById('pk-kotak-formulir')", "kotak dipulihkan setelah terhapus (mis. formulir direset)", 20);
  cek("Kotak yang terhapus (mis. pengaturan ulang formulir) dipulihkan otomatis", true);

  // banner menempel saat halaman digulir (permintaan user 2026-11-08)
  for (const gulir of [0, 600, 5000]) {
    const p = await posisiLengket(gulir);
    cek(`Digulir ke ${gulir}px (posisi nyata ${p.gulir}px dari tinggi halaman ${p.tinggiHalaman}px): banner menempel tepat di bawah header, tidak tertimpa/menimpa`,
      lengketBaik(p) && (gulir === 0 || p.gulir > 100), JSON.stringify(p));
  }
  await js(`(() => { document.querySelector('header').style.paddingBottom = '60px'; return true; })()`);
  await tidur(500);
  const pTinggi = await posisiLengket(600);
  cek("Tinggi header berubah (+60 px): banner ikut turun dan tetap menempel tepat di bawahnya", lengketBaik(pTinggi), JSON.stringify(pTinggi));
  await js(`(() => { document.querySelector('header').style.paddingBottom = ''; return true; })()`);
  await tidur(500);
  const pKembali = await posisiLengket(600);
  cek("Tinggi header kembali: banner ikut naik dan tetap menempel", lengketBaik(pKembali), JSON.stringify(pKembali));
  await js('window.scrollTo(0, 0); true');

  // jeda saat ditunjuk
  await js('window.scrollTo(0, 0); true'); await tidur(200);
  const pos = await js(`(() => { const r = document.getElementById('pk-banner').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await kirim("Input.dispatchMouseEvent", { type: "mouseMoved", x: pos.x, y: pos.y });
  await tidur(200);
  const diag = await js(`(() => { const e = document.elementFromPoint(${pos.x}, ${pos.y}); return { dari: e ? (e.id || e.className || e.tagName) : null, dalamBanner: !!(e && e.closest("#pk-banner")), hover: !!document.querySelector("#pk-banner:hover"), scrollY: window.scrollY, pos: ${JSON.stringify(pos)}, inner: [window.innerWidth, window.innerHeight] }; })()`);
  cek("Kursor di atas banner: gerak BERHENTI", (await banner()).main === "paused", JSON.stringify(diag));
  await kirim("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 880 });
  await tidur(200);
  cek("Kursor pergi: gerak berjalan lagi", (await banner()).main === "running");
  // sentuhan
  await js(`(() => { const b = document.getElementById('pk-banner'); b.dispatchEvent(new Event('touchstart')); return true; })()`);
  cek("Sentuhan: gerak berhenti (kelas jeda)", (await banner()).main === "paused");
  await js(`document.getElementById('pk-banner').dispatchEvent(new Event('touchend')); true`);
  await tidur(2900);
  cek("Setelah sentuhan dilepas ±2,5 dtk: gerak berjalan lagi", (await banner()).main === "running");
  // fokus keyboard
  await js(`document.getElementById('pk-banner').focus(); true`);
  await tidur(150);
  cek("Fokus keyboard pada banner: gerak berhenti", (await banner()).main === "paused");
  await js(`document.getElementById('pk-banner').blur(); true`);

  // kurangi gerakan
  await kirim("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await tidur(200);
  b = await banner();
  cek("Pengaturan 'kurangi gerakan': tidak ada animasi, teks diam & boleh terlipat, salinan kedua disembunyikan", b.anim === "none" && b.spasi === "normal" && b.salinan2Tampil === "none", JSON.stringify(b));
  await kirim("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await tidur(2800);   // pemeriksaan berkala (2 dtk) menyusun ulang salinan setelah kembali dari mode diam
  let c = await cakupanJalur([0.5, 0.9]);
  cek("Kembali dari mode 'kurangi gerakan': jalur kembali menutupi seluruh jendela", !adaRuangKosong(c) && (await banner()).anim === "pk-geser", JSON.stringify(c));
  // Ukuran jendela berubah saat berjalan (putar layar HP, ubah ukuran jendela, zoom): salinan menyesuaikan.
  // Diperiksa ±450 ms setelah perubahan (pendengar resize menunda 250 ms) dan diulang beberapa kali, supaya pemeriksaan berkala
  // 2 detik tidak kebetulan menutupi pendengar resize yang rusak.
  for (const lebar of [2560, 600, 2200, 700, 2560, 600, 1920]) {
    await kirim("Emulation.setDeviceMetricsOverride", { width: lebar, height: 900, deviceScaleFactor: 1, mobile: false });
    await tidur(450);
    c = await cakupanJalur([0.5, 0.9]);
    cek(`Ukuran jendela diubah menjadi ${lebar} px saat berjalan: jumlah salinan menyesuaikan dan jalur menutupi seluruh jendela`, !adaRuangKosong(c), JSON.stringify(c));
  }
  // Banner dipasang saat belum bisa diukur (lebar 0, mis. halaman belum tampil): salinan harus disusun kemudian oleh pemeriksaan berkala.
  await js(`(() => { document.getElementById('pk-banner').remove(); document.documentElement.style.display = 'none'; window.djpmPengingatKoordinat.selaraskan(); return document.querySelectorAll('#pk-banner .pk-teks').length; })()`)
    .then((n) => cek("Dipasang saat belum tampil (tak terukur): awalnya hanya satu salinan", n === 1, String(n)));
  await js("document.documentElement.style.display = ''; true");
  await tidur(2800);
  c = await cakupanJalur([0.5, 0.9, 0.999]);
  cek("Setelah halaman tampil: pemeriksaan berkala menyusun salinan sehingga jalur menutupi seluruh jendela", !adaRuangKosong(c), JSON.stringify(c));
  await kirim("Emulation.setDeviceMetricsOverride", { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
  await tidur(900);

  // pergantian akun tanpa muat ulang (logout tidak memuat ulang halaman)
  await js(`window.__asli = JSON.stringify(dataPengguna); dataPengguna = { username: "", role: "", kecamatan: "", token: "", userId: "", kelurahanTerkunci: "" }; true`);
  await tungguSampai("!document.getElementById('pk-banner') && !document.getElementById('pk-kotak-formulir')", "banner & kotak dibuang saat keluar", 20);
  cek("Keluar (data pengguna dikosongkan): banner dan kotak DIBUANG tanpa muat ulang", true);
  await js(`dataPengguna = Object.assign({}, JSON.parse(window.__asli), { role: "UTAMA", token: "T2" }); true`);
  await tidur(2600);
  cek("Akun UTAMA masuk di peramban yang sama: tidak ada banner/kotak", await js("!document.getElementById('pk-banner') && !document.getElementById('pk-kotak-formulir')"));
  await js(`dataPengguna = Object.assign({}, JSON.parse(window.__asli)); true`);
  await tungguSampai("!!document.getElementById('pk-banner')", "banner kembali untuk GMM", 20);
  cek("Akun GMM masuk lagi: banner kembali", true);

  // ============================ KESINAMBUNGAN GERAK DI LAYAR LEBAR ============================
  // Teks berjalan harus MENUTUPI seluruh lebar jendela di setiap fase siklus (tidak boleh ada ruang kosong di kanan).
  for (const lebar of [1366, 1920, 2560]) {
    await masuk("GURU MAGHRIB MENGAJI", lebar);
    await tungguSampai("!!document.getElementById('pk-banner')", "banner di layar " + lebar, 40);
    await tidur(600);
    const hasil = await cakupanJalur([0, 0.25, 0.5, 0.75, 0.9, 0.999]);
    const adaKosong = adaRuangKosong(hasil);
    cek("Layar " + lebar + " px: teks berjalan menutupi seluruh jendela di semua fase siklus (tanpa ruang kosong)", !adaKosong, JSON.stringify(hasil));
    if (lebar === 1920) await kirim("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 100, width: 1920, height: 80, scale: 0.6 } }).then((x) => fs.writeFileSync(OUT + "/djpm_pk_banner_1920.png", Buffer.from(x.result.data, "base64")));
  }

  // ============================ HP 360 px ============================
  await masuk("GURU MAGHRIB MENGAJI", 360);
  await tungguSampai("!!document.getElementById('pk-banner')", "banner di HP", 40);
  b = await banner();
  const hp = await js(`(() => ({ gulirHorizontal: document.documentElement.scrollWidth > window.innerWidth + 1, lebarHalaman: document.documentElement.scrollWidth, lebarJendela: window.innerWidth, headerBawah: Math.round(document.querySelector('header').getBoundingClientRect().bottom), banyakTombolTerkena: (() => { const t = document.getElementById('tab-rekap').getBoundingClientRect(); const e = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2); return e && e.closest('#tab-rekap') ? 'tab' : (e ? e.tagName + '#' + e.id : 'null'); })() }))()`);
  cek("HP 360 px: tidak ada gulir horizontal, banner satu baris (<= 40 px), tidak menimpa header", !hp.gulirHorizontal && b.tinggi <= 40 && b.atas >= 0, JSON.stringify({ hp, b: { tinggi: b.tinggi, atas: b.atas } }));
  await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(`${OUT}/djpm_pk_banner_hp.png`, Buffer.from(s.result.data, "base64")));
  for (const gulir of [600, 5000]) {
    const p = await posisiLengket(gulir);
    cek(`HP 360 px, digulir ke ${gulir}px (posisi nyata ${p.gulir}px): banner menempel tepat di bawah header`, lengketBaik(p) && p.gulir > 100, JSON.stringify(p));
    if (gulir === 600) await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(`${OUT}/djpm_pk_banner_hp_gulir.png`, Buffer.from(s.result.data, "base64")));
  }
  await js('window.scrollTo(0, 0); true');

  // ============================ PERAN LAIN ============================
  for (const lain of ["UTAMA", "KECAMATAN", "MUI", "IMAM MASJID", "GURU SEKOLAH MINGGU"]) {
    await masuk(lain);
    await tidur(2600);
    const ada = await js("!!document.getElementById('pk-banner') || !!document.getElementById('pk-kotak-formulir') || !!document.getElementById('pk-gaya')");
    const dimuat = berkasDimuat.some((u) => /app-pengingat-koordinat-gmm\.js/.test(u));
    cek(`Peran ${lain}: tidak ada banner/kotak/gaya dan skrip pengingat TIDAK diunduh`, !ada && !dimuat, JSON.stringify({ ada, dimuat }));
  }

  cek("Tidak ada galat JavaScript selama pengujian", galatJs.length === 0, galatJs.slice(0, 3).join(" | "));
} catch (err) { console.log("GALAT HARNESS: " + err.message); gagal++; }
finally { try { ws && ws.close(); } catch { /* abaikan */ } chrome.kill(); await tidur(500); try { fs.rmSync(profil, { recursive: true, force: true }); } catch { /* abaikan */ } }
console.log(gagal === 0 ? "\nSEMUA LULUS" : `\n${gagal} GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
