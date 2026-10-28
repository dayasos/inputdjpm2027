// Uji LAYAR (Chrome headless + server tiruan) untuk halaman Data Ibadah: dialog konfirmasi saat mengubah nama/alamat/wilayah
// rumah ibadah yang dipakai penerima (plan: plans/plan-penautan-rumah-ibadah-id.md, F5; keputusan D1-D2).
// Butuh Vite dev:  npx vite --port 3123 --strictPort     lalu:  node scripts/uji/layar/ibadah-konfirmasi-tautan.mjs
// Env opsional: BASE_URL (bawaan http://localhost:3123), CHROME (jalur chrome.exe). Tanpa koneksi ke database/server sungguhan:
// semua permintaan ke Supabase / proxy dicegat dan dijawab data KARANGAN; WebSocket dimatikan.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3123";
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9341;
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=1200,900", "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map();
const CORS = [{ name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Headers", value: "*" }, { name: "Access-Control-Allow-Methods", value: "*" }];

// ---- server tiruan ----
const BARIS = { id: 5, jenis: "MASJID", kecamatan: "MEDAN KOTA", kelurahan: "PASAR BARU", nama: "MASJID LAMA", alamat: "JL LAMA" };
const KELURAHAN = { "MEDAN KOTA": ["PASAR BARU", "SEI RENGAS"], "MEDAN AREA": ["TEGAL SARI I"] };
let pemakaian = { sukses: true, id: 5, tahun: 2027, jumlah: 3, perLayanan: [{ layanan: "IMAM MASJID", jumlah: 2 }, { layanan: "KHATIB JUMAT", jumlah: 1 }] };
let gagalHitung = false;
let galatHitung = null;   // null | pesan galat tingkat-API (mis. server lama: "Aksi tidak diizinkan: ...") -> diteruskan sebagai { error }
const panggilan = [];   // { aksi, args }
function jawab(aksi, args) {
  panggilan.push({ aksi, args });
  switch (aksi) {
    case "pulihkanSesi": return { sukses: true, token: "TOKEN-UJI", username: "admin", role: "UTAMA", kecamatan: "", userId: "", profileBelumDiisi: false, profil: { namaLengkap: "ADMIN UJI", nomorHp: "0800", jabatan: "X" } };
    case "ambilDaftarRumahIbadahAdmin": return { sukses: true, total: 1, halaman: 1, totalHalaman: 1, limit: 20, stats: { total: 1, masjid: 1, gereja: 0, vihara: 0 }, daftar: [BARIS] };
    case "getKelurahanByKecamatan": return KELURAHAN[String(args[1] || "").toUpperCase()] || [];
    case "hitungPemakaianRumahIbadah": if (galatHitung) return { __galat: galatHitung }; return gagalHitung ?{ sukses: false, pesan: "Gagal menghitung pemakaian rumah ibadah: uji" } : pemakaian;
    case "ubahRumahIbadah": return { sukses: true, pesan: 'Data rumah ibadah "' + args[1].nama + '" berhasil diperbarui.', jumlahPenerimaDiperbarui: 0 };
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
  const isi = hasil && hasil.__galat ? { error: hasil.__galat, sukses: false, pesan: hasil.__galat } : { result: hasil };   // bentuk galat API sama dengan index.ts
  await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200, responseHeaders: [...CORS, { name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify(isi)).toString("base64") });
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
async function tungguSampai(e, label, maks = 160) { for (let i = 0; i < maks; i++) { try { if (await js(e)) return true; } catch { /* halaman belum siap */ } await tidur(250); } throw new Error("Timeout: " + label); }

let gagal = 0;
const cek = (nama, ok, rinci = "") => { console.log((ok ? "LULUS  " : "GAGAL  ") + nama + (ok ? "" : "  -> " + rinci)); if (!ok) gagal++; };
const aksiTercatat = (nama) => panggilan.filter((p) => p.aksi === nama);
const dialogTampil = () => js("(()=>{const m=document.getElementById('modal-konfirmasi-universal'); return !!m && !m.classList.contains('hidden');})()");
const teksDialog = () => js("(document.getElementById('modal-konfirm-judul')||{}).textContent + ' || ' + (document.getElementById('modal-konfirm-pesan')||{}).textContent");

async function bukaEdit(ubah) {
  panggilan.length = 0;
  await js("window.bukaModalEditRumahIbadah(5); true");
  await tungguSampai("!document.getElementById('modal-form-rumah-ibadah').classList.contains('hidden') && document.getElementById('mri-kelurahan').options.length > 1", "form edit & kelurahan");
  const set = (idEl, nilai) => js(`(()=>{const e=document.getElementById('${idEl}'); e.value=${JSON.stringify(nilai)}; e.dispatchEvent(new Event('change',{bubbles:true})); return e.value;})()`);
  if (ubah.kecamatan !== undefined) { await set("mri-kecamatan", ubah.kecamatan); await tungguSampai(`document.getElementById('mri-kelurahan').options.length > 1`, "kelurahan kecamatan baru"); }
  if (ubah.kelurahan !== undefined) await set("mri-kelurahan", ubah.kelurahan);
  if (ubah.nama !== undefined) await set("mri-nama", ubah.nama);
  if (ubah.alamat !== undefined) await set("mri-alamat", ubah.alamat);
}
async function simpan() { await js("window.simpanRumahIbadahBaru(); true"); await tidur(900); }
async function tutupSemua() {
  if (await dialogTampil()) await js("document.getElementById('modal-konfirm-btn-batal').click(); true");
  await js("document.getElementById('modal-form-rumah-ibadah').classList.add('hidden'); true");
  await tidur(300);
}

try {
  await sambung();
  await kirim("Runtime.enable"); await kirim("Page.enable");
  await kirim("Fetch.enable", { patterns: [{ urlPattern: "*supabase.co*" }, { urlPattern: "*api/gas*" }] });
  await kirim("Page.addScriptToEvaluateOnNewDocument", { source: `if (location.origin === '${new URL(BASE).origin}') { window.WebSocket = class { constructor(){ this.readyState = 3; } send(){} close(){} addEventListener(){} removeEventListener(){} }; sessionStorage.setItem('dana_jasa_sesi', JSON.stringify({ token: 'TOKEN-UJI', username: 'admin', role: 'UTAMA', kecamatan: '', userId: '', namaLengkap: 'ADMIN UJI' })); }` });
  await kirim("Page.navigate", { url: BASE + "/" });
  await tungguSampai("!!document.getElementById('btn-kelola-rumah-ibadah') && (!document.getElementById('modal-login') || document.getElementById('modal-login').classList.contains('hidden'))", "app siap");
  // Skrip pengelola dimuat 'defer' dan sesi dipulihkan async: tunggu fungsi tab siap DAN peran UTAMA terpasang, baru buka panel.
  await tungguSampai("typeof window.bukaTabKelolaIbadah === 'function' && typeof dataPengguna !== 'undefined' && dataPengguna && dataPengguna.role === 'UTAMA'", "tab Data Ibadah siap");
  await js("window.bukaTabKelolaIbadah(); true");
  await tungguSampai("document.getElementById('panel-kelola-ibadah').innerText.includes('MASJID LAMA')", "daftar rumah ibadah tampil di panel");

  // 1. Ubah NAMA, 3 penerima terdampak -> dialog konfirmasi menyebut jumlah + rincian layanan; BATAL -> tidak ada panggilan ubah
  await bukaEdit({ nama: "Masjid Baru" });
  await simpan();
  cek("ubah nama + ada penerima terdampak: memanggil hitungPemakaianRumahIbadah dengan id yang benar", aksiTercatat("hitungPemakaianRumahIbadah").length === 1 && aksiTercatat("hitungPemakaianRumahIbadah")[0].args[1] === 5, JSON.stringify(panggilan));
  cek("dialog konfirmasi tampil", await dialogTampil());
  const teks = await teksDialog();
  cek("dialog menyebut 3 penerima, rincian layanan, dan tombol 'Ya, Perbarui 3 Penerima'", /3 penerima/.test(teks) && /IMAM MASJID: 2/.test(teks) && /KHATIB JUMAT: 1/.test(teks) && /IKUT DIPERBARUI/.test(teks) && /Ya, Perbarui 3 Penerima/.test(await js("document.getElementById('modal-konfirm-btn-ya').textContent")), teks);
  await js("document.getElementById('modal-konfirm-btn-batal').click(); true"); await tidur(500);
  cek("BATAL: ubahRumahIbadah TIDAK dipanggil dan tombol Simpan aktif kembali", aksiTercatat("ubahRumahIbadah").length === 0 && (await js("!document.getElementById('btn-submit-mri').disabled")));
  await tutupSemua();

  // 2. Konfirmasi YA -> ubahRumahIbadah dikirim dengan jumlahDikonfirmasi = 3
  await bukaEdit({ nama: "Masjid Baru", alamat: "Jl Baru" });
  await simpan();
  await js("document.getElementById('modal-konfirm-btn-ya').click(); true"); await tidur(900);
  const ubahPanggil = aksiTercatat("ubahRumahIbadah");
  cek("YA: ubahRumahIbadah dipanggil sekali dengan jumlahDikonfirmasi = 3 dan id 5", ubahPanggil.length === 1 && ubahPanggil[0].args[1].jumlahDikonfirmasi === 3 && ubahPanggil[0].args[1].id === 5, JSON.stringify(ubahPanggil));
  cek("form ditutup setelah sukses", await js("document.getElementById('modal-form-rumah-ibadah').classList.contains('hidden')"));
  await tutupSemua();

  // 3. Tidak ada penerima terdampak -> langsung simpan tanpa dialog
  pemakaian = { sukses: true, id: 5, tahun: 2027, jumlah: 0, perLayanan: [] };
  await bukaEdit({ nama: "Masjid Baru Lagi" });
  await simpan();
  cek("tanpa penerima terdampak: tidak ada dialog dan ubahRumahIbadah langsung dipanggil", !(await dialogTampil()) && aksiTercatat("ubahRumahIbadah").length === 1 && aksiTercatat("ubahRumahIbadah")[0].args[1].jumlahDikonfirmasi === undefined, JSON.stringify(panggilan.map((p) => p.aksi)));
  await tutupSemua();

  // 4. Ubah WILAYAH dengan penerima terdampak -> ditolak di layar, tidak memanggil ubah
  pemakaian = { sukses: true, id: 5, tahun: 2027, jumlah: 3, perLayanan: [{ layanan: "IMAM MASJID", jumlah: 3 }] };
  await bukaEdit({ kelurahan: "SEI RENGAS" });
  await simpan();
  cek("ubah kelurahan saat dipakai 3 penerima: ubahRumahIbadah TIDAK dipanggil dan tidak ada dialog konfirmasi", aksiTercatat("ubahRumahIbadah").length === 0 && !(await dialogTampil()), JSON.stringify(panggilan.map((p) => p.aksi)));
  cek("pesan penolakan wilayah muncul", /tidak dapat diubah: rumah ibadah ini masih dipakai 3 penerima/.test(await js("document.body.innerText")));
  await tutupSemua();

  // 5. Hanya JENIS berubah (nama/alamat/wilayah sama) -> langsung simpan, tanpa menghitung pemakaian
  await bukaEdit({});
  await js("(()=>{const e=document.getElementById('mri-jenis'); e.value='MUSHOLLA'; e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await simpan();
  cek("hanya jenis berubah: tidak menghitung pemakaian, langsung ubahRumahIbadah", aksiTercatat("hitungPemakaianRumahIbadah").length === 0 && aksiTercatat("ubahRumahIbadah").length === 1, JSON.stringify(panggilan.map((p) => p.aksi)));
  await tutupSemua();

  // 6. Gagal menghitung pemakaian -> TIDAK menyimpan (aman), pesan tampil
  gagalHitung = true;
  await bukaEdit({ nama: "Masjid Gagal Hitung" });
  await simpan();
  cek("gagal menghitung pemakaian: ubahRumahIbadah TIDAK dipanggil dan pesan galat tampil", aksiTercatat("ubahRumahIbadah").length === 0 && /Gagal menghitung pemakaian/.test(await js("document.body.innerText")), JSON.stringify(panggilan.map((p) => p.aksi)));
  gagalHitung = false;
  await tutupSemua();

  // 6b. Server LAMA (aksi penghitung belum dikenal) -> simpan seperti perilaku lama, tanpa dialog; galat jaringan -> TIDAK menyimpan
  galatHitung = "Aksi tidak diizinkan: hitungPemakaianRumahIbadah";
  await bukaEdit({ nama: "Masjid Server Lama" });
  await simpan();
  cek("server lama (aksi tidak dikenal): ubahRumahIbadah dipanggil sekali tanpa dialog dan tanpa jumlahDikonfirmasi", !(await dialogTampil()) && aksiTercatat("ubahRumahIbadah").length === 1 && aksiTercatat("ubahRumahIbadah")[0].args[1].jumlahDikonfirmasi === undefined, JSON.stringify(panggilan.map((p) => p.aksi)));
  await tutupSemua();
  galatHitung = "Terjadi kesalahan koneksi antara server aplikasi dan Supabase Edge Function.";
  await bukaEdit({ nama: "Masjid Gagal Jaringan" });
  await simpan();
  cek("galat jaringan saat menghitung: ubahRumahIbadah TIDAK dipanggil dan pesan galat tampil", aksiTercatat("ubahRumahIbadah").length === 0 && /kesalahan koneksi/.test(await js("document.body.innerText")), JSON.stringify(panggilan.map((p) => p.aksi)));
  galatHitung = null;
  await tutupSemua();

  // 7. Perubahan spasi/huruf besar-kecil saja (setelah normalisasi sama) dianggap tidak berubah
  pemakaian = { sukses: true, id: 5, tahun: 2027, jumlah: 3, perLayanan: [{ layanan: "IMAM MASJID", jumlah: 3 }] };
  await bukaEdit({ nama: "  masjid   lama ", alamat: "jl  lama" });
  await simpan();
  cek("beda hanya huruf/spasi: tidak dianggap perubahan (tanpa dialog, tanpa hitung)", !(await dialogTampil()) && aksiTercatat("hitungPemakaianRumahIbadah").length === 0, JSON.stringify(panggilan.map((p) => p.aksi)));
} catch (err) { console.log("GALAT HARNESS: " + err.message); gagal++; }
finally { try { ws && ws.close(); } catch { /* abaikan */ } chrome.kill(); await tidur(500); try { fs.rmSync(profil, { recursive: true, force: true }); } catch { /* abaikan */ } }
console.log(gagal === 0 ? "\nSEMUA LULUS" : `\n${gagal} GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
