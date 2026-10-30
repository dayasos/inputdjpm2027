// Form input: pengingat alamat tugas (Guru Maghrib Mengaji + tempat tugas RUMAH) -- catatan di bawah kolom dan penegasan di jendela konfirmasi.
// Uji MANUAL di Chrome sungguhan (BUKAN bagian dari "npm run uji:pengingat-alamat"). Plan: plans/plan-pengingat-alamat-rumah-gmm.md.
// Jalankan:  node scripts/uji/layar/form-input-pengingat-alamat.mjs      (opsional: OUT_DIR=<folder tangkapan layar>)
// Syarat: Chrome terpasang (atau CHROME_PATH), dan server lokal berjalan:  npx vite --port 3123 --strictPort
// Aman: hanya memanipulasi kolom di layar; tanpa login, tanpa data penerima, tanpa permintaan simpan.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:3123";
const OUT = process.env.OUT_DIR || os.tmpdir();
const PORT = 9336;
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=390,900", "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map(); const galatJs = [];
async function sambung() {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch {} await tidur(250); }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') galatJs.push(((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text || '?').split('\n')[0]); };
}
function kirim(method, params = {}) { return new Promise((r) => { const i = ++id; tunggu.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function js(ekspresi) {
  const m = await kirim("Runtime.evaluate", { expression: ekspresi, returnByValue: true, awaitPromise: true });
  if (m.result.exceptionDetails) throw new Error("JS galat: " + JSON.stringify(m.result.exceptionDetails).slice(0, 300));
  return m.result.result.value;
}
let gagal = 0;
function cek(nama, kondisi, rinci = "") { console.log((kondisi ? "LULUS  " : "GAGAL  ") + nama + (kondisi ? "" : "  -> " + rinci)); if (!kondisi) gagal++; }

const PESAN = "Pastikan alamat tugas sudah benar karena akan berpengaruh ketika Tim Verifikasi dari Dinas Sosial akan melakukan monitoring.";
// Mengisi kolom seperti pengetikan petugas (data uji fiktif).
const isi = (layanan, tempat, alamatTugas, domisili) => js(`(() => {
  const sel = document.getElementById('input-layanan');
  if (![...sel.options].some(o => o.value === ${JSON.stringify(layanan)})) { const o = document.createElement('option'); o.value = ${JSON.stringify(layanan)}; o.textContent = ${JSON.stringify(layanan)}; sel.appendChild(o); }
  sel.value = ${JSON.stringify(layanan)}; sel.dispatchEvent(new Event('change', { bubbles: true }));
  const t = document.getElementById('input-tempat-tugas'); t.readOnly = false; t.value = ${JSON.stringify(tempat)}; t.dispatchEvent(new Event('input', { bubbles: true }));
  const a = document.getElementById('input-almt-tugas'); a.readOnly = false; a.value = ${JSON.stringify(alamatTugas)};
  document.getElementById('input-alamat').value = ${JSON.stringify(domisili)};
  return true; })()`);
const catatan = () => js(`(() => { const e = document.getElementById('pengingat-alamat-rumah'); const r = e.getBoundingClientRect(); return { tampil: !e.classList.contains('hidden') && r.height > 0, teks: e.textContent, meluber: e.scrollWidth > e.clientWidth + 1, lebar: Math.round(r.width) }; })()`);
const konfirmasi = () => js(`(() => { isiPengingatKonfirmasiSimpan(); const k = document.getElementById('pengingat-alamat-rumah-konfirmasi'); const sm = document.getElementById('pengingat-alamat-rumah-sama'); return { tampil: !k.classList.contains('hidden'), pesan: document.getElementById('pengingat-alamat-rumah-pesan').textContent, nilai: document.getElementById('pengingat-alamat-rumah-nilai').textContent, sama: !sm.classList.contains('hidden') }; })()`);

try {
  await sambung();
  await kirim("Runtime.enable"); await kirim("Page.enable");
  await kirim("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 2, mobile: true });
  await kirim("Page.navigate", { url: BASE + "/" });
  for (let i = 0; i < 60; i++) { if (await js("!!(window.djpmPengingatAlamat && typeof perbaruiPengingatAlamatRumah==='function' && document.getElementById('input-almt-tugas') && document.readyState==='complete')").catch(() => false)) break; await tidur(500); }
  cek("modul pengingat dan fungsi pemicu termuat di browser", await js("!!window.djpmPengingatAlamat && typeof isiPengingatKonfirmasiSimpan==='function'"));

  let c = await js(`(() => { const e = document.getElementById('pengingat-alamat-rumah'); return e && e.classList.contains('hidden'); })()`);
  cek("bawaan: catatan tersembunyi", c === true);

  await isi("GURU MAGHRIB MENGAJI", "RUMAH", "JL. MANDOR NO 5", "JL. MADIO SANTOSO NO 9");
  c = await catatan();
  cek("GMM + tempat tugas RUMAH, alamat BERBEDA: catatan tampil dengan pesan persis", c.tampil && c.teks === PESAN, JSON.stringify(c));
  cek("catatan tidak meluber di 390 px", c.meluber === false && c.lebar > 250, JSON.stringify(c));
  let k = await konfirmasi();
  cek("jendela konfirmasi, alamat BERBEDA: pesan tampil + alamat tugas ditampilkan, tanpa peringatan 'SAMA'", k.tampil && k.pesan === PESAN && k.nilai === "JL. MANDOR NO 5" && k.sama === false, JSON.stringify(k));

  await isi("GURU MAGHRIB MENGAJI", "RUMAH", "jl. madio santoso no.9", "JL. MADIO SANTOSO NO 9");
  c = await catatan(); k = await konfirmasi();
  cek("alamat SAMA dengan domisili: catatan tetap tampil", c.tampil && c.teks === PESAN, JSON.stringify(c));
  cek("alamat SAMA: jendela konfirmasi menambahkan peringatan 'SAMA dengan alamat domisili'", k.tampil && k.sama === true && k.nilai === "JL. MADIO SANTOSO NO.9", JSON.stringify(k));

  await isi("GURU MAGHRIB MENGAJI", "rmh", "JL X", "JL Y");
  cek("singkatan 'rmh' huruf kecil juga memicu", (await catatan()).tampil === true);

  await isi("GURU MAGHRIB MENGAJI", "MASJID AL IKHLAS", "JL. MANDOR NO 5", "JL. MANDOR NO 5");
  c = await catatan(); k = await konfirmasi();
  cek("GMM tetapi tempat tugas masjid: catatan dan kotak konfirmasi tersembunyi (walau alamat sama dgn domisili)", !c.tampil && !k.tampil, JSON.stringify({ c, k }));

  await isi("GURU MAGHRIB MENGAJI", "RUMAH IBADAH AL AMIN", "JL X", "JL Y");
  cek("'RUMAH IBADAH ...' (lembaga) tidak memicu", !(await catatan()).tampil);

  await isi("BILAL JENAZAH", "RUMAH", "JL X", "JL X");
  c = await catatan(); k = await konfirmasi();
  cek("layanan LAIN (Bilal Jenazah) dengan RUMAH: tidak memicu", !c.tampil && !k.tampil, JSON.stringify({ c, k }));

  await isi("GURU MAGHRIB MENGAJI", "RUMAH", "JL X", "JL Y");
  await isi("IMAM MASJID", "RUMAH", "JL X", "JL Y");
  cek("berganti layanan dari GMM ke lain: catatan hilang seketika", !(await catatan()).tampil);

  await isi("GURU MAGHRIB MENGAJI", "RUMAH", "JL X", "JL Y");
  await js(`(() => { const t = document.getElementById('input-tempat-tugas'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  cek("tempat tugas dikosongkan: catatan hilang", !(await catatan()).tampil);

  // Jendela "Pilih Data" GMM: jenis RUMAH memuat pengingat (tempat petugas mengetik alamat), jenis LAINNYA tidak.
  const modalGmm = (jenis) => js(`(() => { renderGmmContent(${JSON.stringify(jenis)}); const p = document.getElementById('pengingat-alamat-rumah-modal'); const a = document.getElementById('manual-alamat'); return { ada: !!p, teks: p ? p.textContent : '', placeholder: a ? a.placeholder : '' }; })()`);
  let m = await modalGmm("RUMAH");
  cek("jendela GMM jenis RUMAH: pengingat tampil dengan pesan persis", m.ada && m.teks === PESAN, JSON.stringify(m));
  cek("jendela GMM jenis RUMAH: placeholder tidak lagi 'Alamat Rumah Lengkap'", m.placeholder === "Alamat tempat guru mengajar, sesuai berkas", m.placeholder);
  m = await modalGmm("LAINNYA");
  cek("jendela GMM jenis LAINNYA: tanpa pengingat", m.ada === false, JSON.stringify(m));
  // Simpan lewat jendela itu (submitManual) -> kolom form terisi -> catatan di bawah kolom muncul otomatis.
  await isi("GURU MAGHRIB MENGAJI", "", "", "");
  await js(`(() => { renderGmmContent('RUMAH'); document.getElementById('manual-alamat').value = 'jl. contoh uji no 7'; })()`);
  const sesudahSimpan = await js(`(() => { try { submitManual(); } catch (e) { return { galat: String(e) }; } const t = document.getElementById('input-tempat-tugas').value; const a = document.getElementById('input-almt-tugas').value; const c = document.getElementById('pengingat-alamat-rumah'); return { t, a, catatan: !c.classList.contains('hidden') }; })()`);
  cek("setelah Simpan Data di jendela RUMAH: tempat tugas=RUMAH, alamat terisi, catatan di bawah kolom muncul", sesudahSimpan.t === "RUMAH" && sesudahSimpan.a === "JL. CONTOH UJI NO 7" && sesudahSimpan.catatan === true, JSON.stringify(sesudahSimpan));

  // Celah jalur tanpa event: 'Ganti Pilihan' mengosongkan kolom lewat kode -> catatan harus ikut hilang.
  await isi("GURU MAGHRIB MENGAJI", "RUMAH", "JL X", "JL Y");
  const sebelumGanti = (await catatan()).tampil;
  await js(`bukaKunciTempatTugas()`);
  cek("'Ganti Pilihan' (kolom dikosongkan lewat kode): catatan tampil sebelumnya, lalu HILANG", sebelumGanti === true && (await catatan()).tampil === false);
  // Pemulihan draf: nilai diisi lewat kode tanpa event -> catatan harus muncul.
  await isi("GURU MAGHRIB MENGAJI", "", "", "");
  await js(`(() => { sessionStorage.setItem('djpm_form_draft_2027', JSON.stringify({ selectLayanan: 'GURU MAGHRIB MENGAJI', inputTempatTugas: 'RUMAH', inputAlamatTugas: 'JL DRAF UJI 3', inputNama: 'UJI' })); pulihkanDrafLokalForm(); })()`);
  await tidur(700);
  const sesudahDraf = await js(`(() => ({ t: document.getElementById('input-tempat-tugas').value, catatan: !document.getElementById('pengingat-alamat-rumah').classList.contains('hidden') }))()`);
  cek("pemulihan draf GMM + RUMAH: catatan muncul tanpa perlu mengetik lagi", sesudahDraf.t === "RUMAH" && sesudahDraf.catatan === true, JSON.stringify(sesudahDraf));
  await js(`sessionStorage.removeItem('djpm_form_draft_2027')`);

  // Tidak memblokir: tombol Simpan tidak ikut terkunci karena pengingat.
  await isi("GURU MAGHRIB MENGAJI", "RUMAH", "JL X", "JL X");
  cek("pengingat tidak memasang kunci blok dan tidak mengunci tombol Simpan", await js(`(() => { const b = document.getElementById('btn-simpan-data'); const kunci = Object.keys(window._kuncianAktif || {}); return !kunci.some(x => /ALAMAT|RUMAH|PENGINGAT/i.test(x)) && !(b && b.title && /alamat/i.test(b.title)); })()`));

  // Tangkapan layar (data uji fiktif).
  await js(`(() => { const sembunyi = (e) => e && e.style.setProperty('display', 'none', 'important'); sembunyi(document.getElementById('modal-login')); [...document.querySelectorAll('div')].filter(d => /Instal Aplikasi DJPM/.test(d.textContent) && d.children.length < 4 && getComputedStyle(d).position === 'fixed').forEach(sembunyi); document.documentElement.classList.add('is-logged-in'); document.getElementById('input-almt-tugas').scrollIntoView({ block: 'center' }); })()`);
  await isi("GURU MAGHRIB MENGAJI", "RUMAH", "JL. CONTOH UJI NO 5", "JL. CONTOH UJI NO 5");
  await js(`(() => { document.querySelectorAll('.fixed.inset-0').forEach(e => { if (e.id !== 'modal-konfirmasi-simpan') e.style.setProperty('display', 'none', 'important'); }); document.querySelectorAll('[id*=toast]').forEach(e => e.style.setProperty('display', 'none', 'important')); document.getElementById('input-almt-tugas').scrollIntoView({ block: 'center' }); })()`);
  await tidur(300);
  let shot = await kirim("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, "pengingat-alamat-1-catatan.png"), Buffer.from(shot.result.data, "base64"));
  await konfirmasi();
  await js(`document.getElementById('modal-konfirmasi-simpan').classList.remove('hidden')`);
  await tidur(300);
  const tinggi = await js(`(() => { const m = document.querySelector('#modal-konfirmasi-simpan > div'); const r = m.getBoundingClientRect(); return { atas: Math.round(r.top), bawah: Math.round(r.bottom), tinggiLayar: innerHeight, btnOk: (() => { const b = document.getElementById('btn-konfirmasi-ok').getBoundingClientRect(); return Math.round(b.bottom); })() }; })()`);
  cek("jendela konfirmasi muat di layar 390x900 dan tombol Konfirmasi terlihat", tinggi.atas >= 0 && tinggi.bawah <= tinggi.tinggiLayar && tinggi.btnOk <= tinggi.tinggiLayar, JSON.stringify(tinggi));
  shot = await kirim("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, "pengingat-alamat-2-konfirmasi.png"), Buffer.from(shot.result.data, "base64"));
  // Tangkapan jendela GMM jenis RUMAH (tempat petugas mengetik alamat).
  await js(`(() => { document.getElementById('modal-konfirmasi-simpan').classList.add('hidden'); const t = document.getElementById('modal-toast') || null; document.querySelectorAll('[id*=toast]').forEach(e => e.style.setProperty('display', 'none', 'important')); const mk = document.getElementById('modal-kemenag'); mk.classList.remove('hidden'); renderGmmContent('RUMAH'); document.getElementById('manual-alamat').value = 'JL. CONTOH UJI NO 7'; })()`);
  await tidur(300);
  shot = await kirim("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, "pengingat-alamat-3-jendela-rumah.png"), Buffer.from(shot.result.data, "base64"));
  // Layar kecil: jendela konfirmasi (dengan peringatan SAMA yang paling panjang) harus tetap muat / bisa digulir sehingga tombol terjangkau.
  for (const [lebar, tinggi] of [[360, 640], [320, 568]]) {
    await kirim("Emulation.setDeviceMetricsOverride", { width: lebar, height: tinggi, deviceScaleFactor: 2, mobile: true });
    await isi("GURU MAGHRIB MENGAJI", "RUMAH", "JL. CONTOH UJI NO 5 GG. PANJANG SEKALI LK. XIII KEL. TANJUNG SARI", "JL. CONTOH UJI NO 5 GG. PANJANG SEKALI LK. XIII KEL. TANJUNG SARI");
    await js(`(() => { document.querySelectorAll('.fixed.inset-0').forEach(e => { if (e.id !== 'modal-konfirmasi-simpan') e.style.setProperty('display', 'none', 'important'); }); isiPengingatKonfirmasiSimpan(); document.getElementById('modal-konfirmasi-simpan').classList.remove('hidden'); })()`);
    await tidur(250);
    const u = await js(`(() => { const w = document.querySelector('#modal-konfirmasi-simpan > div'); w.scrollTop = w.scrollHeight; const c = w.getBoundingClientRect(); const b = document.getElementById('btn-konfirmasi-ok').getBoundingClientRect(); const k = document.getElementById('btn-konfirmasi-kembali').getBoundingClientRect(); return { atas: Math.round(c.top), bawah: Math.round(c.bottom), tinggiLayar: innerHeight, tombolOkAtas: Math.round(b.top), tombolOkBawah: Math.round(b.bottom), tombolKembaliBawah: Math.round(k.bottom), lebarDok: document.documentElement.scrollWidth, lebarLayar: innerWidth }; })()`);
    // Setelah digulir ke dasar jendela, KEDUA tombol harus berada di dalam layar (bukan sekadar 'bisa digulir'), dan jendela tidak terpotong di atas.
    const terjangkau = u.atas >= 0 && u.bawah <= u.tinggiLayar && u.tombolOkAtas >= 0 && u.tombolOkBawah <= u.tinggiLayar && u.tombolKembaliBawah <= u.tinggiLayar;
    cek(`layar ${lebar}x${tinggi}: jendela konfirmasi (peringatan SAMA aktif) muat atau bisa digulir, tombol terjangkau`, terjangkau, JSON.stringify(u));
    cek(`layar ${lebar}x${tinggi}: tidak ada gulir mendatar halaman`, u.lebarDok <= u.lebarLayar, JSON.stringify(u));
    await js(`document.getElementById('modal-konfirmasi-simpan').classList.add('hidden')`);
  }
  // Jendela Pilih Data jenis RUMAH (ikut bertambah tinggi karena pengingat) di layar terkecil: tombol Simpan Data terjangkau setelah digulir.
  await kirim("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  const pd = await js(`(() => { document.querySelectorAll('.fixed.inset-0').forEach(e => e.style.removeProperty('display')); const mk = document.getElementById('modal-kemenag'); mk.classList.remove('hidden'); renderGmmContent('RUMAH'); const w = mk.firstElementChild; w.scrollTop = w.scrollHeight; const b = document.querySelector('#modal-content-area button').getBoundingClientRect(); const c = w.getBoundingClientRect(); return { bisaGulir: /auto|scroll/.test(getComputedStyle(w).overflowY), atas: Math.round(c.top), bawah: Math.round(c.bottom), tinggiLayar: innerHeight, tombolBawah: Math.round(b.bottom), tombolAtas: Math.round(b.top) }; })()`);
  cek("layar 320x568: jendela Pilih Data (RUMAH + pengingat) bisa digulir dan tombol Simpan Data terjangkau", pd.bisaGulir && pd.atas >= 0 && pd.bawah <= pd.tinggiLayar && pd.tombolAtas >= 0 && pd.tombolBawah <= pd.tinggiLayar, JSON.stringify(pd));
  cek("tidak ada galat JavaScript tak tertangani selama seluruh uji", galatJs.length === 0, galatJs.join(" | "));
} catch (err) { console.log("GALAT HARNESS: " + err.message); gagal++; }
finally { try { ws && ws.close(); } catch {} chrome.kill(); await tidur(500); try { fs.rmSync(profil, { recursive: true, force: true }); } catch {} }
console.log(gagal === 0 ? "\nSEMUA LULUS" : `\n${gagal} GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
