// Halaman publik /cek-status (plan bagian 12.3). Uji MANUAL di Chrome sungguhan, bukan bagian dari uji Node.
// Jalankan:  node scripts/uji/layar/cek-status-halaman.mjs
// Syarat: Chrome terpasang (atau CHROME_PATH), Worker lokal berjalan di BASE_URL (bawaan http://localhost:8787) dengan
//   .dev.vars berisi kunci UJI Turnstile (1x00...AA) dan SUPABASE_EDGE_FUNCTION_URL ke backend tiruan, dengan data:
//   NIK 1111111111111111 + 1990-01-01 = Memenuhi Syarat; NIK 2222222222222222 = Berkas Tidak Lengkap; lainnya TIDAK_TERDATA.
// Tangkapan layar ditulis ke folder OUT_DIR (bawaan: folder temp).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:8787";
const OUT = process.env.OUT_DIR || os.tmpdir();
const PORT = 9334;
const LEBAR = Number(process.env.LEBAR || 390);
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-cek-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, `--window-size=${LEBAR},900`, "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map();
let lulus = 0, gagal = 0;
const cek = (nama, ok, info = "") => { (ok ? lulus++ : gagal++); console.log(`${ok ? "  OK  " : " GAGAL"} ${nama}${ok ? "" : "  -> " + info}`); };

async function sambung() {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch {} await tidur(250); }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); } };
}
const kirimCdp = (method, params = {}) => new Promise((res) => { const i = ++id; tunggu.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (ekspresi) => { const r = await kirimCdp("Runtime.evaluate", { expression: ekspresi, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
const foto = async (nama) => { const r = await kirimCdp("Page.captureScreenshot", { format: "png" }); const f = path.join(OUT, `cek-status-${LEBAR}-${nama}.png`); fs.writeFileSync(f, Buffer.from(r.result.data, "base64")); return f; };
const tungguSampai = async (ekspresi, ms = 20000) => { const s = Date.now(); while (Date.now() - s < ms) { if (await js(ekspresi)) return true; await tidur(200); } return false; };
const isi = (nik, tgl) => js(`(() => { const n=document.getElementById('nik'), t=document.getElementById('tgl');
  n.value=${JSON.stringify(nik)}; n.dispatchEvent(new Event('input',{bubbles:true}));
  t.value=${JSON.stringify(tgl.split('-').reverse().join(''))}; t.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
// Pengetikan SUNGGUHAN (satu karakter per peristiwa, seperti papan ketik HP) dan tombol hapus.
const ketik = async (teks) => { for (const c of teks) await kirimCdp("Input.insertText", { text: c }); };
const hapus = async (n = 1) => { for (let i = 0; i < n; i++) { for (const type of ["keyDown", "keyUp"]) await kirimCdp("Input.dispatchKeyEvent", { type, key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 }); } };
const nilaiTgl = () => js(`document.getElementById('tgl').value`);
const infoTgl = () => js(`document.getElementById('tgl-info').textContent`);

try {
  await sambung();
  await kirimCdp("Page.enable"); await kirimCdp("Runtime.enable");
  await kirimCdp("Emulation.setDeviceMetricsOverride", { width: LEBAR, height: 900, deviceScaleFactor: 2, mobile: LEBAR < 600 });
  await kirimCdp("Page.navigate", { url: `${BASE}/cek-status` });
  await tungguSampai(`document.readyState==='complete'`);

  cek("judul halaman", (await js(`document.title`)).startsWith("Cek Status Penerima"));
  cek("robots: index, follow (go-live)", (await js(`document.querySelector('meta[name=robots]').content`)) === "index, follow");
  cek("canonical ke alamat halaman", (await js(`document.querySelector('link[rel=canonical]').href`)) === "https://djpmkotamedan.web.id/cek-status");
  cek("tidak ada gulir mendatar", await js(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`));
  cek("tombol nonaktif di awal", await js(`document.getElementById('kirim').disabled`));
  cek("huruf kolom >= 16px (cegah zoom iOS)", (await js(`parseFloat(getComputedStyle(document.getElementById('nik')).fontSize)`)) >= 16);

  // Tanggal lahir DIKETIK, bukan dipilih dari kalender.
  cek("kolom tanggal lahir berupa teks angka (bukan pemilih kalender)", await js(`(() => { const t = document.getElementById('tgl'); return t.type === 'text' && t.inputMode === 'numeric'; })()`));
  await js(`document.getElementById('tgl').focus()`);
  await ketik("31121990");
  cek("mengetik 31121990 -> 31-12-1990", (await nilaiTgl()) === "31-12-1990", await nilaiTgl());
  cek("konfirmasi ramah '31 Desember 1990'", (await infoTgl()).includes("31 Desember 1990"), await infoTgl());
  await hapus(3);
  cek("Backspace 3x -> 31-12-1 (tidak tersangkut di tanda pisah)", (await nilaiTgl()) === "31-12-1", await nilaiTgl());
  await hapus(2);
  cek("Backspace lagi -> 31-12 lalu 31-1", (await nilaiTgl()) === "31-1", await nilaiTgl());
  await hapus(5);
  cek("dihapus sampai kosong", (await nilaiTgl()) === "");
  await ketik("1/2/1990");
  cek("mengetik manual 1/2/1990 -> 01-02-1990", (await nilaiTgl()) === "01-02-1990", await nilaiTgl());
  await js(`(() => { const t = document.getElementById('tgl'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await ketik("3112199"); // 7 angka -> 31-12-199 (kolom penuh 10 karakter menolak sisipan, jadi sisakan ruang)
  await js(`document.getElementById('tgl').setSelectionRange(2, 2)`);
  await ketik("5");
  const kursorTengah = await js(`document.getElementById('tgl').selectionStart`);
  cek("menyisipkan angka di tengah: nilai dirapikan & kursor TIDAK melompat ke akhir", (await nilaiTgl()) === "31-51-2199" && kursorTengah === 4, (await nilaiTgl()) + " / kursor " + kursorTengah);
  await js(`(() => { const t = document.getElementById('tgl'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await ketik("31022000");
  cek("31-02-2000 -> pesan 'tidak ada di kalender'", (await infoTgl()).includes("tidak ada di kalender"), await infoTgl());
  await isi("1111111111111111", "2999-01-01");
  cek("tanggal masa depan -> pesan + tombol tetap nonaktif", (await infoTgl()).includes("masa depan") && (await js(`document.getElementById('kirim').disabled`)));
  await js(`(() => { const t=document.getElementById('tgl'); t.value='1990-01-01'; t.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  cek("tempel format ISO 1990-01-01 -> 01-01-1990", (await nilaiTgl()) === "01-01-1990", await nilaiTgl());
  await js(`(() => { const t=document.getElementById('tgl'); t.value='1/1/1990'; t.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  cek("tempel 1/1/1990 -> 01-01-1990", (await nilaiTgl()) === "01-01-1990", await nilaiTgl());
  await foto("0-tanggal-diketik");

  // Menempel NIK berspasi/bertanda baca dibersihkan.
  await isi("1111 1111-1111.1111abc999", "1990-01-01");
  cek("NIK dibersihkan & dipotong 16 digit", (await js(`document.getElementById('nik').value`)) === "1111111111111111");
  cek("penghitung 16/16", (await js(`document.getElementById('hitung').textContent`)) === "16/16");
  await foto("1-terisi");

  cek("Turnstile (kunci uji) memberi token -> tombol aktif", await tungguSampai(`!document.getElementById('kirim').disabled`, 30000));

  // Tanggal masa depan tidak lolos.
  await isi("1111111111111111", "2999-01-01");
  cek("tanggal masa depan -> tombol nonaktif", await js(`document.getElementById('kirim').disabled`));
  await isi("1111111111111111", "1990-01-01");

  // Sukses.
  await js(`document.getElementById('kirim').click()`);
  cek("hasil muncul", await tungguSampai(`!document.getElementById('hasil').classList.contains('tersembunyi')`));
  const teks = await js(`document.getElementById('isi-hasil').innerText`);
  cek("menampilkan nama, layanan, wilayah, status", ["BUDI UJI", "GURU MAGHRIB MENGAJI", "MEDAN KOTA", "SITI REJO I", "Memenuhi Syarat"].every((s) => teks.includes(s)), teks);
  cek("tidak ada data di luar 5 kolom", !teks.includes("BOCOR") && !teks.includes("1111111111111111"));
  cek("kolom NIK & tanggal dikosongkan setelah hasil", (await js(`document.getElementById('nik').value + document.getElementById('tgl').value`)) === "");
  cek("catatan kaki 'bukan jaminan pencairan'", teks.includes("bukan jaminan pencairan"));
  cek("formulir disembunyikan saat hasil tampil", await js(`document.getElementById('form').classList.contains('tersembunyi')`));
  cek("tidak ada NIK di URL", !(await js(`location.href`)).includes("1111"));
  cek("tidak ada localStorage/sessionStorage/cookie", (await js(`localStorage.length + sessionStorage.length + document.cookie.length`)) === 0);
  await foto("2-hasil-hijau");

  // Hapus hasil.
  await js(`document.getElementById('hapus').click()`);
  cek("Hapus hasil: kartu hilang, formulir kembali, kolom kosong", await js(`document.getElementById('hasil').classList.contains('tersembunyi') && !document.getElementById('form').classList.contains('tersembunyi') && document.getElementById('nik').value===''`));
  cek("isi hasil benar-benar dikosongkan dari DOM", (await js(`document.getElementById('isi-hasil').textContent`)) === "");

  // Berkas tidak lengkap (merah).
  await tungguSampai(`!document.getElementById('kirim').disabled || (isi=false)`, 1);
  await isi("2222222222222222", "1980-05-05");
  cek("Turnstile direset lalu lolos lagi", await tungguSampai(`!document.getElementById('kirim').disabled`, 30000));
  await js(`document.getElementById('kirim').click()`);
  await tungguSampai(`!document.getElementById('hasil').classList.contains('tersembunyi')`);
  const t2 = await js(`document.getElementById('isi-hasil').innerText`);
  cek("Berkas Tidak Lengkap + anjuran hubungi petugas", t2.includes("Berkas Tidak Lengkap") && t2.includes("Hubungi petugas"), t2);
  await foto("3-hasil-merah");
  await js(`document.getElementById('hapus').click()`);

  // Tidak Memenuhi Syarat (status sah yang diset otomatis setelah batas waktu perbaikan).
  await isi("4444444444444444", "1970-03-04");
  await tungguSampai(`!document.getElementById('kirim').disabled`, 30000);
  await js(`document.getElementById('kirim').click()`);
  await tungguSampai(`!document.getElementById('hasil').classList.contains('tersembunyi')`);
  const t4 = await js(`document.getElementById('isi-hasil').innerText`);
  cek("Tidak Memenuhi Syarat: lencana + anjuran hubungi petugas", t4.includes("Tidak Memenuhi Syarat") && t4.includes("belum memenuhi syarat") && t4.includes("Hubungi petugas"), t4);
  await foto("3b-hasil-tidak-memenuhi");
  await js(`document.getElementById('hapus').click()`);

  // Tidak terdata: pesan seragam.
  await isi("9999999999999999", "1990-01-01");
  await tungguSampai(`!document.getElementById('kirim').disabled`, 30000);
  await js(`document.getElementById('kirim').click()`);
  await tungguSampai(`!document.getElementById('hasil').classList.contains('tersembunyi')`);
  const t3 = await js(`document.getElementById('isi-hasil').innerText`);
  cek("pesan Tidak Terdata (seragam)", t3.includes("Tidak Terdata atau Belum ada di database Penerima Dana Jasa Pelayanan") && t3.includes("Tahun Anggaran 2027"), t3);
  await foto("4-tidak-terdata");
  await js(`document.getElementById('hapus').click()`);

  // Terkunci: pesan galat di bawah tombol, formulir tetap terlihat.
  await isi("3333333333333333", "1990-01-01");
  await tungguSampai(`!document.getElementById('kirim').disabled`, 30000);
  await js(`document.getElementById('kirim').click()`);
  cek("pesan terkunci tampil", await tungguSampai(`document.getElementById('galat').textContent.includes('Terlalu banyak percobaan')`));
  await foto("5-terkunci");

  // Tombol Kembali / bfcache tidak memunculkan hasil lama (disimulasikan lewat pageshow persisted).
  await js(`window.dispatchEvent(Object.assign(new Event('pageshow'),{persisted:true}))`);
  cek("pageshow(persisted) mengosongkan formulir & galat", await js(`document.getElementById('nik').value==='' && document.getElementById('galat').classList.contains('tersembunyi')`));
} catch (e) {
  gagal++; console.log(" GALAT uji:", e);
} finally {
  console.log(`\n${lulus} lulus, ${gagal} gagal. Tangkapan layar di: ${OUT}`);
  try { ws?.close(); } catch {}
  chrome.kill();
  process.exit(gagal ? 1 : 0);
}
