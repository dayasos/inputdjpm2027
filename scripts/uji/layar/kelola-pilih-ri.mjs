// Kelola Data: pop-up "Pilih Rumah Ibadah" + aturan isian yang disamakan dengan formulir input (dengan server TIRUAN).
// Uji MANUAL di Chrome sungguhan (BUKAN bagian dari "npm run uji:*"). Plan: plans/plan-pilih-rumah-ibadah-kelola-data.md.
// Jalankan:  node scripts/uji/layar/kelola-pilih-ri.mjs
// Syarat: Chrome terpasang (atau set env CHROME_PATH), dan server lokal berjalan:  npx vite --port 3123 --strictPort
// Aman: tidak ada permintaan ke server asli (jaringan dicegat), WebSocket realtime dimatikan.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9335, OUT = os.tmpdir();
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=1100,1000", "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map();
const log = { aksi: [] };

const CORS = [{ name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Headers", value: "*" }, { name: "Access-Control-Allow-Methods", value: "*" }];
const DETAIL = { id: 1, tahun: 2027, nomorUrut: 1575, nama: "ANDI SYAHPUTRA", nik: "1271010101900001", jenisKelamin: "LAKI-LAKI", tempatLahir: "MEDAN", tanggalLahir: "04-02-1989", alamat: "JL X", layanan: "IMAM MASJID", tempatTugas: "MASJID AL IKHLAS", alamatTugas: "JL A NO 1", kecamatan: "MEDAN SELAYANG", kelurahan: "TANJUNG SARI", namaRekening: "ANDI", nomorRekening: "12345678901234", kantorCabang: "BANK", noKontak: "0812345678", statusBpjs: "YA", status: "Memenuhi Syarat" };
const RUMAH = [
  { id: 1, jenis: "MASJID", kecamatan: "MEDAN SELAYANG", kelurahan: "TANJUNG SARI", nama: "MASJID AL IKHLAS", alamat: "JL A NO 1" },
  { id: 2, jenis: "MASJID", kecamatan: "MEDAN SELAYANG", kelurahan: "TANJUNG SARI", nama: "MASJID NURUL HUDA", alamat: "JL B NO 2" },
  { id: 3, jenis: "MASJID", kecamatan: "MEDAN SELAYANG", kelurahan: "TANJUNG SARI", nama: "MASJID <b>ARRAHMAN</b>", alamat: "JL C NO 3" },
  // Di luar wilayah: server tiruan SENGAJA mengabaikan filter kelurahan (meniru fungsi server lama); layar harus menyembunyikannya.
  { id: 4, jenis: "MASJID", kecamatan: "MEDAN SELAYANG", kelurahan: "SEMPAKATA", nama: "MASJID LUAR WILAYAH", alamat: "JL Z NO 9" },
  { id: 5, jenis: "MASJID", kecamatan: "MEDAN BELAWAN", kelurahan: "BELAWAN II", nama: "MASJID BELAWAN", alamat: "JL Y NO 8" },
];
function jawab(aksi, args) {
  switch (aksi) {
    case "pulihkanSesi": return { sukses: true, token: "TOKEN-UJI", username: "admin", role: "UTAMA", kecamatan: "", userId: "", profileBelumDiisi: false, profil: { namaLengkap: "ADMIN UJI", nomorHp: "0800", jabatan: "X" } };
    case "adminDaftarData": return { sukses: true, daftar: [{ id: 1, tahun: 2027, nomorUrut: 1575, nama: "ANDI SYAHPUTRA", nik: "1271010101900001", layanan: "IMAM MASJID", kecamatan: "MEDAN SELAYANG", kelurahan: "TANJUNG SARI", tempatTugas: "MASJID AL IKHLAS", status: "Memenuhi Syarat", jumlahBerkas: 0, kategori: "KECAMATAN" }], total: 1, totalHalaman: 1, page: 1, limit: 20, tahun: 2027, tahunAktif: 2027, tahunTersedia: [2027], bolehUbah: true, opsi: { layananKecamatan: ["IMAM MASJID", "BILAL JENAZAH"], layananKemenag: ["GURU MAGHRIB MENGAJI"], kecamatan: ["MEDAN SELAYANG", "MEDAN BELAWAN"] } };
    case "adminDetailData": return { sukses: true, data: DETAIL, berkas: [], versi: "v1", bolehUbah: true, jumlahBatchPembayaran: 0 };
    case "getKelurahanByKecamatan": return args[1] === "MEDAN BELAWAN" ? ["BELAWAN BAHARI", "BELAWAN II"] : ["TANJUNG SARI", "SEMPAKATA"];
    case "adminUbahData": return { sukses: true, pesan: "Data berhasil diperbarui.", jumlahBerubah: 1 };
    case "getMasterLayanan": return { kecamatan: ["IMAM MASJID", "BILAL JENAZAH"], kemenag: ["GURU MAGHRIB MENGAJI"] };
    case "ambilDaftarRumahIbadahAdmin": {
      const p = args[1] || {};
      if (p.cari === "galat") return { sukses: false, pesan: "Gagal mengambil data rumah ibadah: uji galat" };
      const cari = String(p.cari || "").toUpperCase();
      let hasil = RUMAH.filter((r) => !cari || (r.nama + " " + r.alamat).toUpperCase().includes(cari));
      if (p.kecamatan === "MEDAN BELAWAN") hasil = [1, 2, 3].map((n) => ({ id: 10 + n, jenis: "MASJID", kecamatan: "MEDAN BELAWAN", kelurahan: "BELAWAN II", nama: "MASJID BELAWAN " + n, alamat: "JL " + n }));
      return { sukses: true, total: hasil.length, halaman: 1, totalHalaman: 1, limit: 8, stats: {}, daftar: hasil };
    }
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
// Galat saat membaca (mis. elemen belum ada karena halaman belum selesai dimuat) dianggap "belum siap", bukan kegagalan uji.
async function tungguSampai(ekspresi, label, maks = 60) { for (let i = 0; i < maks; i++) { if (await js(ekspresi).catch(() => false)) return true; await tidur(250); } throw new Error("Timeout menunggu: " + label); }
let gagal = 0;
function cek(nama, kondisi, rinci = "") { console.log((kondisi ? "LULUS  " : "GAGAL  ") + nama + (kondisi ? "" : "  -> " + rinci)); if (!kondisi) gagal++; }
const set = (k, v) => js(`(()=>{const e=document.getElementById('kd-f-${k}'); e.value=${JSON.stringify(v)}; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true})()`);
const klik = (sel) => js(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true})()`);
const modalTerbuka = () => js("(()=>{const m=document.getElementById('pri-modal'); return !!m && !m.classList.contains('hidden')})()");
const state = () => js(`(()=>{const q=(i)=>document.getElementById(i); const t=q('kd-f-tempat_tugas'), a=q('kd-f-alamat_tugas'); const g=(k)=>{const p=q('kd-galat-'+k); return p?p.textContent:null}; return JSON.stringify({tombol:!!q('kd-btn-pilih-ri'), tRO:t.readOnly, aRO:a.readOnly, tVal:t.value, aVal:a.value, simpanNonaktif:q('kd-btn-simpan').disabled, info:q('kd-info-ubah').textContent, galatAlamat:g('alamat'), galatKontak:g('no_kontak'), galatRek:g('nomor_rekening'), galatTempat:g('tempat_tugas')})})()`).then(JSON.parse);
const panggilanRI = () => log.aksi.filter((a) => a.aksi === "ambilDaftarRumahIbadahAdmin");

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
  await tungguSampai("!!document.getElementById('tab-kelola-data')", "halaman siap");
  await tungguSampai("document.getElementById('modal-login').classList.contains('hidden')", "modal login tertutup (sesi tiruan diterima)", 40);
  await tungguSampai("!!(window.djpmPilihRI && window.djpmPilihRI.layananWajib)", "modul pilih rumah ibadah dimuat malas untuk UTAMA", 60);
  cek("modul djpmPilihRI dimuat untuk UTAMA; layananWajib benar untuk 12 layanan, salah untuk layanan bebas", await js(`(()=>{const w=window.djpmPilihRI.layananWajib; const ya=['IMAM MASJID','KHATIB JUMAT','NAZIR MASJID','NAZIR MUSHOLLA','PENGURUS GEREJA','PENGURUS VIHARA/KLENTENG/KUIL','PETUGAS GEREJA KATOLIK','GURU SEKOLAH BUDDHA','GURU SEKOLAH HINDU','GURU SEKOLAH KONG HU CHU','GURU SEKOLAH MINGGU','PENATUA GEREJA']; const tidak=['BILAL JENAZAH','PENGGALI KUBUR','GURU MAGHRIB MENGAJI','USTADZ','USTADZAH','']; return ya.every(w) && tidak.every(x=>!w(x))})()`));
  await js("document.getElementById('tab-kelola-data').click(); true");
  await tungguSampai("!!document.querySelector('button[data-kd=\"kelola\"]')", "baris Kelola Data");
  await js("document.querySelector('button[data-kd=\"kelola\"]').click(); true");
  await tungguSampai("!!document.getElementById('kd-f-tempat_tugas') && document.getElementById('kd-f-kelurahan').value === 'TANJUNG SARI'", "form detail");

  // ── Layanan wajib-daftar: kolom terkunci + tombol pilih ──
  let k = await state();
  cek("IMAM MASJID: tombol Pilih Rumah Ibadah ada; Tempat & Alamat Tugas hanya-baca; Simpan nonaktif", k.tombol && k.tRO && k.aRO && k.simpanNonaktif, JSON.stringify(k));

  // Transisi CSS dimatikan sebelum membaca: Chrome tanpa layar tidak selalu memajukan transisi, sehingga nilai di tengah animasi membuat uji tidak stabil.
  const warna = (i) => js(`(() => { const e = document.getElementById('kd-f-${i}'); e.style.transition = 'none'; void e.offsetWidth; return getComputedStyle(e).backgroundColor; })()`);
  cek("kolom terkunci tampak abu-abu (berbeda dari kolom yang bisa diketik)", (await warna("tempat_tugas")) === "rgb(241, 245, 249)" && (await warna("alamat_tugas")) === "rgb(241, 245, 249)" && (await warna("nama")) !== "rgb(241, 245, 249)", (await warna("tempat_tugas")) + " / " + (await warna("nama")));
  await kirim("Page.captureScreenshot", { format: "png" }).then((x) => fs.writeFileSync(OUT + "/djpm_pri_form.png", Buffer.from(x.result.data, "base64")));
  await klik("#kd-btn-pilih-ri");
  await tungguSampai("document.querySelectorAll('#pri-daftar button[data-pri=\"pilih\"]').length === 3", "3 rumah ibadah tampil");
  const sub = await js("document.getElementById('pri-sub').textContent");
  cek("pop-up terbuka dan judul menyebut layanan, Kec., Kel., dan jenis", await modalTerbuka() && /IMAM MASJID/.test(sub) && /Kec\. MEDAN SELAYANG/.test(sub) && /Kel\. TANJUNG SARI/.test(sub) && /Jenis: Masjid/.test(sub), sub);
  cek("rumah ibadah di luar kecamatan/kelurahan tidak tampil walau server (lama) mengirimnya", await js("!document.getElementById('pri-daftar').innerText.includes('LUAR WILAYAH') && !document.getElementById('pri-daftar').innerText.includes('MASJID BELAWAN')"));
  const p1 = panggilanRI().slice(-1)[0]?.args?.[1] || {};
  cek("permintaan ke server memakai kecamatan + kelurahan penerima + jenis MASJID", p1.kecamatan === "MEDAN SELAYANG" && p1.kelurahan === "TANJUNG SARI" && p1.jenis === "MASJID", JSON.stringify(p1));
  cek("rumah ibadah yang sedang dipakai diberi tanda 'Pilihan saat ini'", await js("document.querySelector('#pri-daftar').innerText.includes('Pilihan saat ini')"));
  cek("teks dari server di-escape (tidak ada elemen <b> hasil suntikan)", await js("document.querySelectorAll('#pri-daftar b').length === 0 && document.getElementById('pri-daftar').innerText.includes('<b>ARRAHMAN</b>')"));
  await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(`${OUT}/djpm_pri_daftar.png`, Buffer.from(s.result.data, "base64")));

  // ── Cari ──
  await js(`(()=>{const e=document.getElementById('pri-cari'); e.value='nurul'; e.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
  await tungguSampai("document.querySelectorAll('#pri-daftar button[data-pri=\"pilih\"]').length === 1", "hasil pencarian 1");
  cek("pencarian mengirim 'cari' dan menampilkan 1 hasil", panggilanRI().slice(-1)[0]?.args?.[1]?.cari === "nurul");
  await js(`(()=>{const e=document.getElementById('pri-cari'); e.value='tidak ada sama sekali'; e.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
  await tungguSampai("document.getElementById('pri-daftar').innerText.includes('Tidak ada rumah ibadah yang cocok')", "pesan kosong");
  cek("pencarian tanpa hasil: pesan jelas", true);
  await js(`(()=>{const e=document.getElementById('pri-cari'); e.value='galat'; e.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
  await tungguSampai("document.getElementById('pri-daftar').innerText.includes('uji galat')", "pesan galat");
  cek("galat server ditampilkan beserta tombol Coba lagi", await js("!!document.querySelector('#pri-daftar button[data-pri=\"ulang\"]')"));
  await js(`(()=>{const e=document.getElementById('pri-cari'); e.value=''; e.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
  await tungguSampai("document.querySelectorAll('#pri-daftar button[data-pri=\"pilih\"]').length === 3", "kembali 3");

  // ── Pilih ──
  await klik('#pri-daftar button[data-i="1"]');
  await tidur(300);
  k = await state();
  cek("memilih: pop-up tertutup, Tempat+Alamat terisi PERSIS, Simpan aktif, 2 perubahan", !(await modalTerbuka()) && k.tVal === "MASJID NURUL HUDA" && k.aVal === "JL B NO 2" && !k.simpanNonaktif && /2 perubahan/.test(k.info), JSON.stringify(k));

  // ── Escape menutup ──
  await klik("#kd-btn-pilih-ri");
  await tungguSampai("document.querySelectorAll('#pri-daftar button[data-pri=\"pilih\"]').length === 3", "daftar lagi");
  await js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
  await tidur(400);
  cek("tombol Escape menutup pop-up (bukan modal detail di belakangnya)", !(await modalTerbuka()) && await js("!document.getElementById('kd-modal-detail').classList.contains('hidden')"));
  // klik di kolom terkunci membuka pop-up juga
  await js("document.getElementById('kd-f-tempat_tugas').click(); true");
  await tidur(300);
  cek("klik kolom Tempat Tugas yang terkunci membuka pop-up", await modalTerbuka());
  await klik("#pri-tutup");
  await tidur(300);

  // ── Ganti layanan ke layanan bebas ──
  await set("layanan", "BILAL JENAZAH");
  k = await state();
  cek("ganti ke BILAL JENAZAH: tombol hilang, Tempat/Alamat Tugas bisa diketik", !k.tombol && !k.tRO && !k.aRO, JSON.stringify(k));
  await tidur(500); // kelas "transition" pada kolom menganimasikan warna latar (±150 ms)
  cek("layanan bebas: kolom kembali tampak bisa diketik (tidak abu-abu)", (await warna("tempat_tugas")) !== "rgb(241, 245, 249)", await warna("tempat_tugas"));
  await set("layanan", "GURU MAGHRIB MENGAJI");
  k = await state();
  cek("GURU MAGHRIB MENGAJI: tetap bebas diketik", !k.tombol && !k.tRO, JSON.stringify(k));
  await set("layanan", "IMAM MASJID");
  k = await state();
  cek("kembali ke IMAM MASJID: tombol muncul lagi dan kolom terkunci", k.tombol && k.tRO && k.aRO, JSON.stringify(k));

  // ── Kecamatan/kelurahan kosong: pop-up menolak dibuka dengan pesan ──
  await js(`(()=>{const s=document.getElementById('kd-f-kecamatan'); if(![...s.options].some(o=>o.value==='MEDAN BELAWAN')){const o=document.createElement('option');o.value='MEDAN BELAWAN';o.textContent='MEDAN BELAWAN';s.appendChild(o)} return true})()`);
  await set("kecamatan", "MEDAN BELAWAN");
  await tungguSampai("[...document.getElementById('kd-f-kelurahan').options].some(o=>o.value==='BELAWAN BAHARI')", "kelurahan Belawan");
  const sebelumRI = panggilanRI().length;
  await klik("#kd-btn-pilih-ri");
  await tidur(500);
  cek("kelurahan belum dipilih: pop-up TIDAK terbuka, tanpa permintaan ke server, ada pemberitahuan", !(await modalTerbuka()) && panggilanRI().length === sebelumRI && await js("document.body.innerText.includes('Pilih Kecamatan dan Kelurahan')"));
  await set("kelurahan", "BELAWAN II");
  await klik("#kd-btn-pilih-ri");
  await tungguSampai("document.querySelectorAll('#pri-daftar button[data-pri=\"pilih\"]').length === 3", "daftar Belawan");
  const p2 = panggilanRI().slice(-1)[0]?.args?.[1] || {};
  cek("pop-up mengikuti wilayah BARU yang dipilih di formulir (Belawan II)", p2.kecamatan === "MEDAN BELAWAN" && p2.kelurahan === "BELAWAN II", JSON.stringify(p2));
  await klik("#pri-tutup");

  // ── Aturan isian = formulir input ──
  await set("layanan", "BILAL JENAZAH");
  await set("alamat", "");
  k = await state();
  cek("alamat dikosongkan: 'wajib diisi', Simpan nonaktif", /wajib diisi/.test(k.galatAlamat || "") && k.simpanNonaktif, JSON.stringify(k));
  await set("alamat", "JL X");
  await set("no_kontak", "0899");
  k = await state();
  cek("kontak '0899': pesan 08 + 10-13 digit, Simpan nonaktif", /08/.test(k.galatKontak || "") && k.simpanNonaktif, JSON.stringify(k));
  await set("no_kontak", "081234567890");
  await set("nomor_rekening", "1234567890123A");
  k = await state();
  cek("rekening bukan 14 digit angka: pesan, Simpan nonaktif", /14 digit angka/.test(k.galatRek || "") && k.simpanNonaktif, JSON.stringify(k));
  await js("(()=>{const e=document.getElementById('kd-f-no_kontak'); return e.maxLength})()").then((m) => cek("kolom No. Kontak membatasi 13 karakter seperti formulir input", m === 13, String(m)));
  console.log("  (aksi yang dicegat dan dijawab tiruan: " + [...new Set(log.aksi.map((a) => a.aksi))].join(", ") + ")");
} catch (err) { console.log("GALAT HARNESS: " + err.message); gagal++; }
finally { try { ws && ws.close(); } catch { /* abaikan */ } chrome.kill(); await tidur(500); try { fs.rmSync(profil, { recursive: true, force: true }); } catch { /* abaikan */ } }
console.log(gagal === 0 ? "\nSEMUA LULUS" : `\n${gagal} GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
