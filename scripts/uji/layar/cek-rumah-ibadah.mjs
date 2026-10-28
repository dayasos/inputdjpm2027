// Uji LAYAR (Chrome headless + server tiruan) untuk modal "Cek Rumah Ibadah" (khusus Admin Utama).
// Plan: plans/plan-cari-rumah-ibadah-pengurus.md, F3. Uji MANUAL (BUKAN bagian dari uji otomatis npm).
// Butuh Vite dev:  npx vite --port 3123 --strictPort     lalu:  node scripts/uji/layar/cek-rumah-ibadah.mjs
// Env opsional: BASE_URL (bawaan http://localhost:3123), CHROME (jalur chrome.exe), FOTO=1 (simpan tangkapan layar ke folder temp).
// Tanpa koneksi ke database/server sungguhan: semua permintaan ke Supabase / proxy dicegat dan dijawab data KARANGAN; WebSocket dimatikan.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3123";
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9343;
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=1200,900", "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map();
const CORS = [{ name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Headers", value: "*" }, { name: "Access-Control-Allow-Methods", value: "*" }];

// ---- server tiruan: 45 rumah ibadah, sebagian punya pengurus ----
const KELURAHAN = { "MEDAN KOTA": ["PASAR BARU", "SEI RENGAS"], "MEDAN AREA": ["TEGAL SARI I"] };
const RUMAH = [];
for (let i = 1; i <= 45; i++) {
  const kec = i <= 30 ? "MEDAN KOTA" : "MEDAN AREA";
  const kel = kec === "MEDAN AREA" ? "TEGAL SARI I" : (i % 2 ? "PASAR BARU" : "SEI RENGAS");
  RUMAH.push({ id: i, jenis: i % 5 === 0 ? "GEREJA" : i % 2 ? "MASJID" : "MUSHOLLA", kecamatan: kec, kelurahan: kel, nama: "RUMAH IBADAH " + String(i).padStart(2, "0"), alamat: "JL CONTOH " + i });
}
RUMAH[0].nama = "MASJID AL-IKHLAS";
RUMAH[1].nama = "MUSHOLLA <b>XSS</b> <img src=x onerror=window.__xss=1>";
const PENGURUS = {};
for (let i = 2; i <= 45; i += 2) PENGURUS[i] = [{ id: 1000 + i, nama: "PENGURUS " + i, layanan: "IMAM MASJID", statusVerifikasi: i % 4 ? "Memenuhi Syarat" : "Proses Verifikasi" }];
PENGURUS[4] = [{ id: 2001, nama: "BUDI SANTOSO", layanan: "NAZIR MASJID", statusVerifikasi: "Memenuhi Syarat" }, { id: 2002, nama: "SITI <i>AMINAH</i>", layanan: "KHATIB JUMAT", statusVerifikasi: "Berkas Tidak Lengkap" }];
const GRUP_JENIS = { MASJID_MUSHOLLA: ["MASJID", "MUSHOLLA"], GEREJA_ALL: ["GEREJA", "GEREJA_KATOLIK"] };
const panggilan = [];   // { aksi, args }
let modeGalat = false;
let tundaCari = {};     // { "<cari>": ms } -> jawaban sengaja dilambatkan (uji jawaban basi)

function cariMock(p) {
  const kata = String(p.cari || "").toUpperCase().split(/\s+/).filter(Boolean);
  const daftarJenis = p.jenis ? (GRUP_JENIS[p.jenis] || [p.jenis]) : null;
  const lolos = RUMAH.filter((r) => {
    if (daftarJenis && !daftarJenis.includes(r.jenis)) return false;
    if (p.kecamatan && r.kecamatan !== p.kecamatan) return false;
    if (p.kelurahan && r.kelurahan !== p.kelurahan) return false;
    if (kata.length) {
      const teksRi = [r.nama, r.alamat, r.kelurahan, r.kecamatan].join(" ").toUpperCase();
      const teksPeng = (PENGURUS[r.id] || []).map((x) => (x.nama + " " + x.layanan).toUpperCase());
      const cocokRi = kata.every((k) => teksRi.includes(k));
      const cocokPeng = teksPeng.some((t) => kata.every((k) => t.includes(k)));
      if (!cocokRi && !cocokPeng) return false;
    }
    return true;
  });
  const ada = lolos.filter((r) => PENGURUS[r.id]).length;
  const ringkasan = { total: lolos.length, ada, belum: lolos.length - ada };
  const saring = p.status === "ADA" ? lolos.filter((r) => PENGURUS[r.id]) : p.status === "BELUM" ? lolos.filter((r) => !PENGURUS[r.id]) : lolos;
  const limit = p.limit || 20, halaman = p.page || 1;
  const potong = saring.slice((halaman - 1) * limit, halaman * limit);
  return {
    sukses: true, tahun: 2027, total: saring.length, halaman, totalHalaman: Math.ceil(saring.length / limit) || 1, limit, ringkasan,
    daftar: potong.map((r) => ({ ...r, jumlahPengurus: (PENGURUS[r.id] || []).length, pengurus: PENGURUS[r.id] || [] })),
  };
}
function jawab(aksi, args) {
  panggilan.push({ aksi, args });
  switch (aksi) {
    case "pulihkanSesi": return { sukses: true, token: "TOKEN-UJI", username: "admin", role: "UTAMA", kecamatan: "", userId: "", profileBelumDiisi: false, profil: { namaLengkap: "ADMIN UJI", nomorHp: "0800", jabatan: "X" } };
    case "getKelurahanByKecamatan": return KELURAHAN[String(args[1] || "").toUpperCase()] || [];
    case "cariRumahIbadahPengurus": if (modeGalat === "lama") return { sukses: false, pesan: "Aksi tidak diizinkan: cariRumahIbadahPengurus" }; if (modeGalat === "rusak") return { sukses: true }; if (modeGalat) return { sukses: false, pesan: "Gagal mengambil data Cek Rumah Ibadah: uji" }; return cariMock(args[1] || {});
    case "getMasterLayanan": return { kecamatan: ["IMAM MASJID"], kemenag: ["GURU MAGHRIB MENGAJI"] };
    default: return { sukses: true };
  }
}
async function dialihkan(p) {
  if (!/supabase\.co|\/api\/gas/.test(p.request.url)) { await kirim("Fetch.continueRequest", { requestId: p.requestId }); return; }
  if (p.request.method === "OPTIONS") { await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 204, responseHeaders: CORS, body: "" }); return; }
  let aksi = "?", args = [];
  try { const j = JSON.parse(p.request.postData || "{}"); aksi = j.action; args = j.args || []; } catch { /* abaikan */ }
  const hasil = jawab(aksi, args);
  if (aksi === "cariRumahIbadahPengurus" && args[1] && tundaCari[args[1].cari]) { const d = tundaCari[args[1].cari]; delete tundaCari[args[1].cari]; await tidur(d); }   // sekali pakai
  await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200, responseHeaders: [...CORS, { name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify({ result: hasil })).toString("base64") });
}
async function sambung() {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch { /* tunggu */ } await tidur(250); }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); } else if (m.method === "Fetch.requestPaused") dialihkan(m.params); };
}
function kirim(method, params = {}) { return new Promise((r) => { const i = ++id; tunggu.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function js(e) { const m = await kirim("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (m.result.exceptionDetails) throw new Error("JS galat: " + JSON.stringify(m.result.exceptionDetails).slice(0, 600)); return m.result.result.value; }
async function tungguSampai(e, label, maks = 80) { for (let i = 0; i < maks; i++) { try { if (await js(e)) return true; } catch { /* halaman belum siap */ } await tidur(250); } throw new Error("Timeout: " + label); }

let gagal = 0;
const cek = (nama, ok, rinci = "") => { console.log((ok ? "LULUS  " : "GAGAL  ") + nama + (ok ? "" : "  -> " + rinci)); if (!ok) gagal++; };
const foto = async (nama) => { if (!process.env.FOTO) return; const f = await kirim("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(os.tmpdir(), "djpm_cri_" + nama + ".png"), Buffer.from(f.result.data, "base64")); };

const M = "document.getElementById('modal-cek-rumah-ibadah')";
const terbuka = () => js(`!!${M} && !${M}.classList.contains('hidden')`);
const jumlahBaris = () => js("document.querySelectorAll('#cri-daftar > div').length");
const teks = (sel) => js(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`);
const panggilanCari = () => panggilan.filter((p) => p.aksi === "cariRumahIbadahPengurus");
const terakhir = () => { const c = panggilanCari(); return c.length ? c[c.length - 1].args[1] : null; };
const ketik = (v) => js(`(()=>{const e=document.getElementById('cri-cari'); e.value=${JSON.stringify(v)}; e.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
const pilih = (idEl, v) => js(`(()=>{const s=document.getElementById(${JSON.stringify(idEl)}); s.value=${JSON.stringify(v)}; s.dispatchEvent(new Event('change',{bubbles:true})); return s.value})()`);
const klik = (sel) => js(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true})()`);
const siapMuat = () => tungguSampai("document.getElementById('cri-daftar') && document.getElementById('cri-daftar').getAttribute('aria-busy') !== 'true' && !/Memuat data/.test(document.getElementById('cri-daftar').textContent)", "data termuat");

try {
  await sambung();
  await kirim("Runtime.enable"); await kirim("Page.enable");
  await kirim("Fetch.enable", { patterns: [{ urlPattern: "*supabase.co*" }, { urlPattern: "*api/gas*" }] });
  await kirim("Page.addScriptToEvaluateOnNewDocument", { source: `if (location.origin === '${new URL(BASE).origin}') { window.WebSocket = class { constructor(){ this.readyState = 3; } send(){} close(){} addEventListener(){} removeEventListener(){} }; sessionStorage.setItem('dana_jasa_sesi', JSON.stringify({ token: 'TOKEN-UJI', username: 'admin', role: 'UTAMA', kecamatan: '', userId: '', namaLengkap: 'ADMIN UJI' })); }` });
  try { await js("sessionStorage.clear(); true"); } catch { /* halaman kosong */ }
  await kirim("Page.navigate", { url: BASE + "/" });
  await tungguSampai("!!(document.getElementById('btn-cek-rumah-ibadah')) && document.getElementById('modal-login').classList.contains('hidden')", "app siap");
  // Klik pertama bisa tertelan bila aplikasi belum selesai memasang pendengar tab: ulangi sampai panel Lihat Data terbuka.
  for (let k = 0; k < 20 && !(await js("typeof panelAktif !== 'undefined' && panelAktif === 'rekap'")); k++) { await js("document.getElementById('tab-rekap').click(); true"); await tidur(400); }
  await tidur(500);

  // ---- tombol & pemuatan malas ----
  let tampil = true;
  await tungguSampai("!document.getElementById('btn-cek-rumah-ibadah').classList.contains('hidden')", "tombol tampil", 20).catch(() => { tampil = false; });
  cek("tombol 'Cek Rumah Ibadah' tampil untuk UTAMA (dan benar-benar terlihat, display bukan none)", tampil && (await js("getComputedStyle(document.getElementById('btn-cek-rumah-ibadah')).display")) !== "none");
  await tungguSampai("typeof window.bukaCekRumahIbadah === 'function'", "skrip dimuat malas");
  cek("skrip app-cek-rumah-ibadah.js dimuat malas untuk UTAMA", true);

  // ---- buka: keadaan awal, BELUM ada permintaan data ----
  const tampil_ = async () => { await klik("#cri-tampil"); await tidur(150); await siapMuat(); };
  const nilaiKontrol = () => js("JSON.stringify({j:document.getElementById('cri-jenis').value,k:document.getElementById('cri-kec').value,l:document.getElementById('cri-kel').value,c:document.getElementById('cri-cari').value,kDis:document.getElementById('cri-kec').disabled,lDis:document.getElementById('cri-kel').disabled,tDis:document.getElementById('cri-tampil').disabled})");
  await klik("#btn-cek-rumah-ibadah");
  await tungguSampai(`!!${M} && !${M}.classList.contains('hidden')`, "modal terbuka");
  await tidur(600);
  await foto("desktop_awal");
  cek("terbuka: TIDAK ada permintaan data ke server (menunggu tombol Tampilkan Data)", panggilanCari().length === 0, JSON.stringify(panggilanCari()));
  cek("terbuka: petunjuk 'Pilih jenis ... klik Tampilkan Data', tanpa kartu ringkasan, tanpa paginasi", /Tampilkan Data/.test(await teks("#cri-daftar")) && (await jumlahBaris()) === 0 && (await js("document.getElementById('cri-ringkasan').children.length")) === 0 && (await js("document.getElementById('cri-halaman').children.length")) === 0);
  const awal = JSON.parse(await nilaiKontrol());
  cek("terbuka: Jenis kosong; Kecamatan, Kelurahan, dan Tampilkan Data nonaktif", awal.j === "" && awal.kDis === true && awal.lDis === true && awal.tDis === true, JSON.stringify(awal));

  const opsiJenis = await js("JSON.stringify([...document.getElementById('cri-jenis').options].map(o=>o.value))");
  cek("daftar Jenis: tanpa jenis gabungan Vihara/Klenteng/Kuil; Vihara, Klenteng, Kuil tetap ada masing-masing", !/VIHARA_KLENTENG_KUIL/.test(opsiJenis) && ["VIHARA","KLENTENG","KUIL","MASJID_MUSHOLLA","GEREJA_ALL"].every((v) => opsiJenis.includes('"' + v + '"')), opsiJenis);

  // ---- bertahap: Jenis -> Kecamatan -> Kelurahan ----
  await pilih("cri-jenis", "MASJID_MUSHOLLA"); await tidur(200);
  const s1 = JSON.parse(await nilaiKontrol());
  cek("pilih Jenis: Kecamatan & Tampilkan Data aktif; Kelurahan masih nonaktif; belum ada permintaan data", s1.kDis === false && s1.tDis === false && s1.lDis === true && panggilanCari().length === 0, JSON.stringify(s1));
  // Dibaca SEKARANG juga dalam satu ekspresi (sebelum jawaban kelurahan datang), supaya tidak bergantung pada kecepatan server tiruan.
  const saatMemuat = await js("(()=>{const s=document.getElementById('cri-kec'); s.value='MEDAN KOTA'; s.dispatchEvent(new Event('change',{bubbles:true})); return JSON.stringify({tDis:document.getElementById('cri-tampil').disabled,lDis:document.getElementById('cri-kel').disabled})})()");
  cek("saat kelurahan sedang dimuat, Tampilkan Data & Kelurahan nonaktif (mencegah tampil tanpa kelurahan)", saatMemuat === JSON.stringify({ tDis: true, lDis: true }), saatMemuat);
  await tungguSampai("!document.getElementById('cri-kel').disabled", "kelurahan termuat");
  const opsiKel = await js("JSON.stringify([...document.getElementById('cri-kel').options].map(o=>o.value))");
  cek("pilih Kecamatan: Kelurahan aktif berisi kelurahan kecamatan itu; Tampilkan Data aktif lagi; belum ada permintaan data", opsiKel === JSON.stringify(["", "PASAR BARU", "SEI RENGAS"]) && (await js("document.getElementById('cri-tampil').disabled")) === false && panggilanCari().length === 0, opsiKel);

  // ---- Tampilkan Data ----
  await pilih("cri-kel", "SEI RENGAS");
  await tampil_();
  const hrp1 = cariMock({ jenis: "MASJID_MUSHOLLA", kecamatan: "MEDAN KOTA", kelurahan: "SEI RENGAS", page: 1, limit: 20 });
  const a1 = terakhir();
  cek("Tampilkan Data: tepat 1 permintaan membawa token + jenis + kecamatan + kelurahan, halaman 1, limit 20", panggilanCari().length === 1 && panggilanCari()[0].args[0] === "TOKEN-UJI" && a1.jenis === "MASJID_MUSHOLLA" && a1.kecamatan === "MEDAN KOTA" && a1.kelurahan === "SEI RENGAS" && a1.page === 1 && a1.limit === 20 && !a1.status && !a1.cari, JSON.stringify(panggilanCari()));
  cek("hasil sesuai wilayah: jumlah baris & info cocok jawaban server", (await jumlahBaris()) === Math.min(20, hrp1.total) && new RegExp(hrp1.total + " rumah ibadah ditemukan").test(await teks("#cri-info")), await teks("#cri-info"));
  const kartu = await js("JSON.stringify([...document.querySelectorAll('#cri-ringkasan button')].map(b=>b.textContent.replace(/\\s+/g,' ').trim()))");
  cek("kartu ringkasan tampil setelah Tampilkan Data (total / ada / belum sesuai server)", kartu.includes(String(hrp1.ringkasan.total)) && kartu.includes(String(hrp1.ringkasan.ada)) && kartu.includes(String(hrp1.ringkasan.belum)), kartu);

  cek("info menyebut filter yang sedang ditampilkan (jenis, kecamatan, kelurahan)", /Masjid & Musholla/.test(await teks("#cri-info")) && /MEDAN KOTA/.test(await teks("#cri-info")) && /SEI RENGAS/.test(await teks("#cri-info")), await teks("#cri-info"));

  // ---- mengubah pilihan TIDAK memuat ulang sendiri ----
  const nSebelumUbah = panggilanCari().length;
  await pilih("cri-jenis", "GEREJA_ALL"); await tidur(600);
  const s2 = JSON.parse(await nilaiKontrol());
  cek("ganti Jenis: Kecamatan & Kelurahan dikosongkan, Kelurahan nonaktif, tidak ada permintaan sendiri", s2.k === "" && s2.l === "" && s2.lDis === true && panggilanCari().length === nSebelumUbah, JSON.stringify(s2));
  cek("hasil lama tetap tampil sampai Tampilkan Data diklik lagi, dan info tetap menyebut filter LAMA (bukan pilihan baru)", (await jumlahBaris()) === Math.min(20, hrp1.total) && /Masjid & Musholla/.test(await teks("#cri-info")) && !/Semua Gereja/.test(await teks("#cri-info")), await teks("#cri-info"));
  await pilih("cri-jenis", "MASJID_MUSHOLLA");
  await pilih("cri-kec", "MEDAN KOTA"); await tungguSampai("!document.getElementById('cri-kel').disabled", "kel 2");
  await pilih("cri-kel", "PASAR BARU");
  await pilih("cri-kec", "MEDAN AREA"); await tungguSampai("!document.getElementById('cri-kel').disabled", "kel 3");
  cek("ganti Kecamatan mengosongkan Kelurahan lama", (await js("document.getElementById('cri-kel').value")) === "");

  // ---- Jenis saja (kecamatan & kelurahan = semua) + paginasi ----
  await pilih("cri-kec", ""); await tidur(200);
  const s3 = JSON.parse(await nilaiKontrol());
  cek("Kecamatan 'Semua' mengosongkan & menonaktifkan Kelurahan", s3.k === "" && s3.lDis === true, JSON.stringify(s3));
  await tampil_();
  const hrpSemua = cariMock({ jenis: "MASJID_MUSHOLLA", page: 1, limit: 20 });
  cek("Jenis saja: kecamatan/kelurahan kosong dikirim; halaman 1 dari " + hrpSemua.totalHalaman, terakhir().kecamatan === "" && terakhir().kelurahan === "" && (await jumlahBaris()) === 20 && new RegExp("Halaman 1 dari " + hrpSemua.totalHalaman).test(await teks("#cri-halaman")), JSON.stringify(terakhir()));
  cek("Sebelumnya nonaktif di halaman pertama", (await js("document.querySelector('[data-cri-aksi=sebelumnya]').disabled")) === true);
  await klik("[data-cri-aksi=berikutnya]"); await siapMuat();
  cek("Berikutnya: halaman 2 diminta dengan filter yang SAMA yang ditampilkan", terakhir().page === 2 && terakhir().jenis === "MASJID_MUSHOLLA" && (await jumlahBaris()) === hrpSemua.total - 20, JSON.stringify(terakhir()));
  cek("halaman terakhir: Berikutnya nonaktif", (await js("document.querySelector('[data-cri-aksi=berikutnya]').disabled")) === true);
  await pilih("cri-jenis", "GEREJA_ALL");   // diubah tanpa Tampilkan Data
  await klik("[data-cri-aksi=sebelumnya]"); await siapMuat();
  cek("paginasi memakai filter yang SUDAH ditampilkan, bukan pilihan yang baru diubah-ubah", terakhir().page === 1 && terakhir().jenis === "MASJID_MUSHOLLA", JSON.stringify(terakhir()));
  await pilih("cri-jenis", "MASJID_MUSHOLLA");

  // ---- Enter sebelum jenis dipilih: tidak mengirim apa pun, fokus ke Jenis ----
  await pilih("cri-jenis", ""); const nEnterKosong = panggilanCari().length;
  await js("document.getElementById('cri-cari').focus(); document.getElementById('cri-cari').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); true"); await tidur(200);
  cek("Enter di kotak cari saat Jenis belum dipilih: tidak ada permintaan, fokus pindah ke Jenis", panggilanCari().length === nEnterKosong && (await js("document.activeElement.id")) === "cri-jenis");
  await pilih("cri-jenis", "MASJID_MUSHOLLA");

  // ---- keamanan tampilan (XSS), pencarian opsional, Enter ----
  await ketik("xss"); await tidur(700);
  cek("mengetik di kotak cari TIDAK memicu permintaan (menunggu Tampilkan Data)", terakhir().cari !== "xss");
  await tampil_();
  const aman = await js("(()=>{const d=document.getElementById('cri-daftar'); return JSON.stringify({b:d.querySelectorAll('b').length, img:d.querySelectorAll('img').length, xss:window.__xss||0, teks:/<b>XSS<\\/b>/.test(d.textContent)})})()");
  cek("teks server di-escape: tidak ada elemen <b>/<img> dari data; onerror tidak jalan; tag tampil sebagai teks", JSON.parse(aman).b === 0 && JSON.parse(aman).img === 0 && JSON.parse(aman).xss === 0 && JSON.parse(aman).teks === true, aman);
  await ketik("ikhlas");
  const nEnter = panggilanCari().length;
  await js("document.getElementById('cri-cari').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); true"); await tidur(150); await siapMuat();
  cek("Enter di kotak cari = Tampilkan Data (1 permintaan, kata kunci terbawa) -> hanya MASJID AL-IKHLAS", panggilanCari().length - nEnter === 1 && terakhir().cari === "ikhlas" && (await jumlahBaris()) === 1 && /MASJID AL-IKHLAS/.test(await teks("#cri-daftar")) && /Belum ada DJPM/.test(await teks("#cri-daftar")), await teks("#cri-daftar"));
  await ketik("budi santoso"); await tampil_();
  const hasilOrang = await teks("#cri-daftar");
  cek("cari dari sisi orang: 'budi santoso' -> rumah ibadah-nya + nama & layanan pengurus tampil", (await jumlahBaris()) === 1 && /RUMAH IBADAH 04/.test(hasilOrang) && /BUDI SANTOSO/.test(hasilOrang) && /NAZIR MASJID/.test(hasilOrang) && /KHATIB JUMAT/.test(hasilOrang) && /Ada DJPM \(2\)/.test(hasilOrang), hasilOrang);
  await ketik("tidak ada yang cocok"); await tampil_();
  cek("tanpa hasil: pesan kosong ramah, halaman 1 dari 1", /Tidak ada rumah ibadah yang sesuai/.test(await teks("#cri-daftar")) && /Halaman 1 dari 1/.test(await teks("#cri-halaman")));

  // ---- jawaban basi diabaikan ----
  tundaCari = { lambat: 1400 };
  await ketik("lambat"); await klik("#cri-tampil"); await tidur(400);   // permintaan 'lambat' sedang di jalan
  await ketik("ikhlas"); await klik("#cri-tampil"); await tidur(600);   // permintaan baru yang cepat
  await tidur(1500);                                                    // jawaban 'lambat' tiba terlambat
  await siapMuat();
  cek("jawaban lambat yang tiba belakangan TIDAK menimpa hasil terbaru", /MASJID AL-IKHLAS/.test(await teks("#cri-daftar")) && (await jumlahBaris()) === 1, await teks("#cri-daftar"));
  tundaCari = {};

  // ---- kartu status ----
  await ketik(""); await tampil_();
  const hrpAll = cariMock({ jenis: "MASJID_MUSHOLLA", page: 1, limit: 20 });
  await klik("[data-cri-aksi=status][data-cri-nilai=BELUM]"); await tidur(200); await siapMuat();
  const argBelum = terakhir();
  cek("klik kartu 'Belum ada DJPM': status=BELUM, halaman 1, hanya baris 'Belum ada DJPM'", argBelum.status === "BELUM" && argBelum.page === 1 && argBelum.jenis === "MASJID_MUSHOLLA" && !/Ada pengurus \(/.test(await teks("#cri-daftar")) && (await jumlahBaris()) === Math.min(20, hrpAll.ringkasan.belum), JSON.stringify(argBelum));
  cek("kartu aktif bertanda aria-pressed", (await js("document.querySelector('[data-cri-aksi=status][data-cri-nilai=BELUM]').getAttribute('aria-pressed')")) === "true");
  await klik("[data-cri-aksi=status][data-cri-nilai=ADA]"); await siapMuat();
  cek("kartu 'Sudah ada DJPM': hanya baris berpengurus", !/Belum ada DJPM/.test(await teks("#cri-daftar")) && (await jumlahBaris()) === Math.min(20, hrpAll.ringkasan.ada), await teks("#cri-halaman"));
  await tampil_();
  cek("Tampilkan Data lagi mengembalikan kartu ke 'Semua' (status kosong)", terakhir().status === "");

  // ---- Reset ----
  await klik("#cri-reset"); await tidur(300);
  const r1 = JSON.parse(await nilaiKontrol());
  cek("Reset Filter: semua kontrol kosong, Kecamatan/Kelurahan/Tampilkan nonaktif, kembali ke petunjuk (tanpa data)", r1.j === "" && r1.k === "" && r1.l === "" && r1.c === "" && r1.kDis && r1.lDis && r1.tDis && /Tampilkan Data/.test(await teks("#cri-daftar")) && (await jumlahBaris()) === 0, JSON.stringify(r1));

  // ---- galat & coba lagi ----
  await pilih("cri-jenis", "MASJID_MUSHOLLA");
  modeGalat = true;
  await ketik("galat"); await klik("#cri-tampil");
  await tungguSampai("/Gagal mengambil data/.test(document.getElementById('cri-daftar').textContent)", "pesan galat");
  cek("galat server: pesan tampil + tombol 'Coba lagi'", (await js("!!document.querySelector('#cri-daftar [data-cri-aksi=ulang]')")) === true);
  modeGalat = false;
  await klik("#cri-daftar [data-cri-aksi=ulang]"); await siapMuat();
  cek("'Coba lagi' memuat ulang dengan filter yang sama", terakhir().cari === "galat" && terakhir().jenis === "MASJID_MUSHOLLA" && /Tidak ada rumah ibadah yang sesuai/.test(await teks("#cri-daftar")), JSON.stringify(terakhir()));

  // ---- ketahanan: server lama, jawaban rusak ----
  modeGalat = "lama";
  await ketik("lama1"); await klik("#cri-tampil");
  await tungguSampai("/belum tersedia di server/.test(document.getElementById('cri-daftar').textContent)", "pesan server lama");
  cek("server belum diperbarui ('Aksi tidak diizinkan'): pesan ramah, bukan teks teknis", !/Aksi tidak diizinkan/.test(await teks("#cri-daftar")));
  modeGalat = "rusak";
  await ketik("rusak1"); await tampil_();
  cek("jawaban server rusak (tanpa daftar): tidak macet di 'Memuat', tampil kosong", /Tidak ada rumah ibadah yang sesuai/.test(await teks("#cri-daftar")) && (await js("document.getElementById('cri-daftar').getAttribute('aria-busy')")) === "false", await teks("#cri-daftar"));
  modeGalat = false;
  await ketik(""); await tampil_();

  // ---- fokus papan ketik tetap di tombol yang sama setelah gambar ulang ----
  await js("document.querySelector('[data-cri-aksi=status][data-cri-nilai=BELUM]').focus(); document.querySelector('[data-cri-aksi=status][data-cri-nilai=BELUM]').click(); true");
  await tidur(200); await siapMuat();
  cek("setelah klik kartu lewat papan ketik, fokus tetap di kartu itu (bukan lompat ke body)", (await js("(document.activeElement.getAttribute('data-cri-nilai')||'')+'|'+(document.activeElement.getAttribute('data-cri-aksi')||'')")) === "BELUM|status");
  await klik("[data-cri-aksi=status][data-cri-nilai='']"); await siapMuat();
  await js("document.querySelector('[data-cri-aksi=berikutnya]').focus(); document.querySelector('[data-cri-aksi=berikutnya]').click(); true");
  await tidur(200); await siapMuat();
  cek("halaman terakhir (Berikutnya nonaktif): fokus pindah ke 'Sebelumnya', tidak hilang ke body", (await js("document.activeElement.getAttribute('data-cri-aksi')")) === "sebelumnya", await js("document.activeElement.tagName"));
  await klik("[data-cri-aksi=sebelumnya]"); await siapMuat();

  // ---- sinyal data berubah SAAT sedang memuat -> dimuat ulang sekali lagi sesudahnya ----
  const nSlow0 = panggilanCari().filter((p) => p.args[1].cari === "slow2").length;
  tundaCari = { slow2: 2600 };
  await ketik("slow2"); await klik("#cri-tampil"); await tidur(700);
  await js("window.djpmCache.invalidate(['penerima'], false); true");
  await tidur(5200);
  cek("sinyal saat sedang memuat: setelah jawaban tiba, dimuat ulang tepat 1x lagi (total 2 permintaan)", panggilanCari().filter((p) => p.args[1].cari === "slow2").length - nSlow0 === 2, String(panggilanCari().filter((p) => p.args[1].cari === "slow2").length - nSlow0));
  await ketik(""); await tampil_();

  // ---- sinyal realtime ----
  const nSebelumSinyal = panggilanCari().length;
  await js("window.djpmCache.invalidate(['penerima'], false); window.djpmCache.invalidate(['penerima'], false); true");
  await tidur(2600);
  cek("sinyal realtime (domain penerima) selagi data tampil: muat ulang 1x (digabung), filter tetap", panggilanCari().length - nSebelumSinyal === 1 && terakhir().jenis === "MASJID_MUSHOLLA", String(panggilanCari().length - nSebelumSinyal));
  const nSetelahDomainLain = panggilanCari().length;
  await js("window.djpmCache.invalidate(['kuota'], false); true"); await tidur(2200);
  cek("sinyal domain lain (kuota) diabaikan", panggilanCari().length === nSetelahDomainLain);

  // ---- tampilan HP ----
  await kirim("Emulation.setDeviceMetricsOverride", { width: 390, height: 780, deviceScaleFactor: 2, mobile: true });
  await tidur(500);
  await foto("hp");
  const hp = await js("(()=>{const m=document.getElementById('modal-cek-rumah-ibadah'); const kotak=m.firstElementChild; const sc=m.querySelector('.overflow-y-auto'); return JSON.stringify({kotakLebar:kotak.getBoundingClientRect().width, layar:innerWidth, geserX: sc.scrollWidth>sc.clientWidth+1, halamanGeserX: document.documentElement.scrollWidth>innerWidth+1, tinggiKotak:kotak.getBoundingClientRect().height, tinggiLayar:innerHeight})})()");
  const h = JSON.parse(hp);
  cek("HP 390px: modal muat lebar layar, tanpa gulir horizontal di dalam modal", h.kotakLebar <= h.layar && h.geserX === false, hp);
  cek("HP: tinggi modal tidak melebihi layar", h.tinggiKotak <= h.tinggiLayar, hp);
  const barisHp = await js("(()=>{const r=document.querySelector('#cri-daftar > div'); return r? getComputedStyle(r).flexDirection : ''})()");
  cek("HP: baris tersusun menumpuk (kolom), bukan tabel lebar", barisHp === "column", barisHp);
  const susunHp = await js("(()=>{const a=document.getElementById('cri-jenis').getBoundingClientRect(), b=document.getElementById('cri-kec').getBoundingClientRect(); return b.top>a.top})()");
  cek("HP: Jenis, Kecamatan, Kelurahan tersusun ke bawah berurutan", susunHp === true);
  await kirim("Emulation.clearDeviceMetricsOverride");

  // ---- tutup: tombol, ESC, klik luar; dibuka ulang = keadaan awal ----
  await klik("#cri-tutup");
  cek("tombol Tutup menutup modal", (await terbuka()) === false);
  const nBuka = panggilanCari().length;
  await klik("#btn-cek-rumah-ibadah"); await tungguSampai(`!${M}.classList.contains('hidden')`, "buka ulang"); await tidur(500);
  const r2 = JSON.parse(await nilaiKontrol());
  cek("dibuka ulang: kembali ke keadaan awal (filter kosong, petunjuk tampil, tanpa data lama, tanpa permintaan)", r2.j === "" && r2.k === "" && r2.c === "" && r2.tDis === true && /Tampilkan Data/.test(await teks("#cri-daftar")) && (await jumlahBaris()) === 0 && panggilanCari().length === nBuka, JSON.stringify(r2));
  await js("window.djpmCache.invalidate(['penerima'], false); true"); await tidur(2200);
  cek("sinyal realtime sebelum Tampilkan Data diklik: tidak memuat apa pun", panggilanCari().length === nBuka);
  await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); true"); await tidur(400);
  cek("ESC menutup modal (modal-a11y)", (await terbuka()) === false);
  await klik("#btn-cek-rumah-ibadah"); await tungguSampai(`!${M}.classList.contains('hidden')`, "buka lagi");
  await js(`${M}.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); ${M}.click(); true`); await tidur(300);
  cek("klik di luar kotak menutup modal", (await terbuka()) === false);
  // tutup saat memuat: jawaban yang masih di jalan tidak boleh memunculkan apa pun
  await klik("#btn-cek-rumah-ibadah"); await tungguSampai(`!${M}.classList.contains('hidden')`, "buka lagi 3");
  await pilih("cri-jenis", "MASJID"); tundaCari = { tutup1: 900 }; await ketik("tutup1"); await klik("#cri-tampil"); await tidur(200);
  await klik("#cri-tutup"); await tidur(1500);
  const nTutup = panggilanCari().length;
  await tidur(2000);
  cek("ditutup saat memuat / setelah ditutup: tidak ada permintaan susulan", panggilanCari().length === nTutup);
  tundaCari = {};

  // ---- bukan UTAMA ----
  await js("dataPengguna.role='KECAMATAN'; inisialisasiMenuLihatData(); true"); await tidur(300);
  cek("peran selain UTAMA: tombol tersembunyi", (await js("document.getElementById('btn-cek-rumah-ibadah').classList.contains('hidden')")) === true);
  const nSebelumLain = panggilanCari().length;
  await js("window.bukaCekRumahIbadah(); true"); await tidur(500);
  cek("peran selain UTAMA: pemanggilan langsung tidak membuka modal dan tidak menghubungi server", (await terbuka()) === false && panggilanCari().length === nSebelumLain);
} catch (err) { console.log("GALAT HARNESS: " + err.message); gagal++; }
finally { try { ws && ws.close(); } catch { /* abaikan */ } chrome.kill(); await tidur(500); try { fs.rmSync(profil, { recursive: true, force: true }); } catch { /* abaikan */ } }
console.log(gagal === 0 ? "\nSEMUA LULUS" : `\n${gagal} GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
