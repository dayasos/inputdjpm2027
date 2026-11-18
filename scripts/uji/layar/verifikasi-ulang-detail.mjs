// Verifikasi Ulang di halaman DETAIL (Chrome sungguhan, server TIRUAN): klik nama -> Detail biasa + kotak "Verifikasi Ulang"; berkas dibuka lalu dicentang; Sesuai/Koreksi; berikutnya.
// Jalankan: node scripts/uji/layar/verifikasi-ulang-detail.mjs   (Chrome + npx vite --port 3123 --strictPort)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cekSimpanHasil } from "../../../supabase/functions/api/_shared/verifikasiUlangInti.ts";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:3123";
const PORT = 9358;
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "djpm-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=1100,1000", "about:blank"], { stdio: "ignore" });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const tunggu = new Map(); const galatJs = []; const skripDimuat = []; const panggilan = [];
const CORS = [{ name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Headers", value: "*" }, { name: "Access-Control-Allow-Methods", value: "*" }];

let peran = "VERIFIKATOR";
const MS = "Memenuhi Syarat";
let tugas, berkas, selesai, dikoreksi, simpanGagal, duplikat = false, sembunyi = false, koordSiap = true;
const NAMA = { 1: "Sri Wahyuni", 2: "Ahmad Fauzi", 3: "Marlina Sitorus", 4: "Rahmat Hidayat" };
function reset() {
  selesai = 0; dikoreksi = 0; simpanGagal = "";
  tugas = [1, 2, 3, 4].map((i) => ({ tugasId: 100 + i, penerimaId: 500 + i, nama: NAMA[i], dibuka: false }));
  berkas = { 101: ["ktp", "buku_rekening", "surat"], 102: ["ktp", "buku_rekening"], 103: ["ktp"], 104: [] };
  if (duplikat) berkas[103] = ['ktp', 'buku_rekening'];
  for (const k of Object.keys(berkas)) berkas[k] = berkas[k].map((x) => ({ kunci: "link_" + x, label: { ktp: "KTP", buku_rekening: "Buku Rekening", surat: "Surat Permohonan" }[x], url: "https://berkas.example/" + k + "/" + (duplikat && k === '103' ? 'sama' : x), dibuka: false }));
}
reset();
const sisa = () => tugas.filter((t) => !t.selesaiDi);
const tugasDari = (penerima) => tugas.find((t) => t.penerimaId === penerima);
const barisLihat = () => [501, 502, 503, 504, 505].map((i) => { const r = new Array(26).fill(""); r[0] = i; r[1] = NAMA[i - 500] || "Dewi Lestari"; r[2] = "12010000000" + i; r[7] = "IMAM MASJID"; r[10] = "MEDAN KOTA"; r[11] = "SEI SIKAMBING B"; r[18] = MS; return r; });
function detailUntuk(nomor) {
  const d = new Array(60).fill("");
  const t = tugasDari(nomor), bk = t ? berkas[t.tugasId] : [];
  Object.assign(d, { 0: nomor, 1: NAMA[nomor - 500] || "Dewi Lestari", 2: "12010000000" + nomor, 3: "PEREMPUAN", 4: "MEDAN", 5: "04-02-1989", 6: "JL X NO 1", 7: "IMAM MASJID", 8: "RUMAH", 9: "JL MARELAN", 10: "MEDAN KOTA", 11: "SEI SIKAMBING B",
    12: "SITI", 13: "12345678901234", 14: "SUMUT", 15: "0812345678", 16: "YA", 32: MS, 33: "", 34: "12-11-2026 10:00", 35: "ADMIN", 51: false });
  const idx = { link_ktp: 18, link_buku_rekening: 19, link_surat: 20 };
  if (!sembunyi) for (const b of bk) d[idx[b.kunci]] = b.url;   // sembunyi: Detail tak menampilkan tautan berkas sama sekali
  return d;
}
function jawab(aksi, args) {
  const [, a1, a2] = args;
  if (aksi === "pulihkanSesi") return { sukses: true, token: "TOKEN-UJI", username: peran === "VERIFIKATOR" ? "verif_helda_melani" : "admin", role: peran, kecamatan: "", userId: "", profileBelumDiisi: false, profil: { namaLengkap: "UJI", nomorHp: "0800", jabatan: "X" } };
  if (aksi === "getMasterLayanan") return { kecamatan: ["IMAM MASJID"], kemenag: ["GURU MAGHRIB MENGAJI"] };
  if (aksi === "getRingkasanVerifikasiSaya") return { sukses: true, total: 12, hariIni: 3, memenuhiSyarat: 8, berkasTidakLengkap: 3, tidakMemenuhiSyarat: 1 };
  if (aksi === "getTugasAwalSaya") return { sukses: true, aktif: false, ditugaskan: 0, selesai: 0, sisa: 0, ids: [], daftar: [], halaman: 1, totalHalaman: 1 };
  if (aksi === "getTugasUlangSaya") { const s = sisa(); return { sukses: true, sisa: s.length, selesai, dikoreksi, ditarikBaruSaja: 0, halaman: 1, adaBerikutnya: false, semua: s.map((t) => ({ tugasId: t.tugasId, penerimaId: t.penerimaId })), tugas: s.map((t) => ({ tugasId: t.tugasId, penerimaId: t.penerimaId, nama: t.nama })) }; }
  if (aksi === "ambilDataLihatDataHakAkses") return { sukses: true, rows: barisLihat() };
  if (aksi === "ambilDetailPenerimaPerBaris") return { sukses: true, dataLengkap: detailUntuk(a1) };
  if (aksi === "ambilRiwayatEdit") return { sukses: true, riwayat: [] };
  if (aksi === "getPenandaKoordinat") return { sukses: true, v: [501, 503], b: [], x: koordSiap ? { 502: "STREET_VIEW" } : {}, teks: { STREET_VIEW: "Tautan Street View, bukan titik penanda" }, jumlah: { valid: 2, tidakValid: 1, belumDicek: 0 } };
  if (aksi === "getTemplatAlasan") return { sukses: true, templat: [{ id: 1, status: "Berkas Tidak Lengkap", judul: "KTP tidak terbaca", isi: "KTP {LAYANAN} tidak terbaca", layanan: [], urutan: 1, aktif: true }, { id: 2, status: "Tidak Memenuhi Syarat", judul: "Data ganda", isi: "Data ganda", layanan: [], urutan: 2, aktif: true }] };
  if (aksi === "bukaTugasUlang") {
    const t = tugas.find((x) => x.tugasId === a1); if (!t || t.selesaiDi) return { sukses: false, pesan: "Tugas tidak ditemukan." };
    t.dibuka = true;
    return { sukses: true, tugasId: t.tugasId, penerimaId: t.penerimaId, status: MS, keteranganVerifikasi: namaJahat ? '<img src=x onerror="window.__xss=1">' : "", diverifikasiOleh: "ADMIN",
      data: { nama: t.nama, nik: "1201000000000" + (t.tugasId % 10), jenisKelamin: "PEREMPUAN", tempatLahir: "MEDAN", tanggalLahir: "04-02-1989", umur: "37", alamat: "JL MARELAN NO 5", namaRekening: "SITI AMINAH", nomorRekening: "1234567890", kantorCabang: "", layanan: "IMAM MASJID", tempatTugas: "RUMAH", alamatTugas: "JL X", kecamatan: "MEDAN KOTA", kelurahan: "SEI SIKAMBING B", noKontak: "0812", koordinat: "" },
      berkas: berkas[t.tugasId].map((b) => ({ ...b })) };
  }
  if (aksi === "catatBerkasDibuka") { const b = (berkas[a1] || []).find((x) => x.kunci === a2); if (!b) return { sukses: false, pesan: "Berkas tidak dikenal pada data ini." }; b.dibuka = true; return { sukses: true }; }
  if (aksi === "simpanHasilUlang") {
    if (simpanGagal) return simpanGagal.startsWith("KONFLIK:") ? { sukses: false, konflik: true, pesan: simpanGagal.slice(8) } : { sukses: false, pesan: simpanGagal };
    const t = tugas.find((x) => x.tugasId === a1), bk = berkas[a1];
    const cek = cekSimpanHasil({ hasil: a2.hasil, statusSebelum: MS, statusSesudah: a2.statusSesudah, alasan: a2.alasan, berkas: bk, berkasDibuka: bk.filter((b) => b.dibuka).map((b) => b.kunci), centang: a2.centang, sudahDibuka: t.dibuka });
    if (!cek.ok) return { sukses: false, pesan: cek.pesan };
    t.selesaiDi = true; selesai++; if (cek.hasil === "DIKOREKSI") dikoreksi++;
    return { sukses: true, hasil: cek.hasil, statusSesudah: cek.statusSesudah, pesan: cek.hasil === "SESUAI" ? "Hasil Sesuai tersimpan." : "Koreksi tersimpan: status menjadi " + cek.statusSesudah + "." };
  }
  return { sukses: true };
}
let namaJahat = false;
async function dialihkan(p) {
  const url = p.request.url;
  if (!/supabase\.co|\/api\/gas/.test(url)) { await kirim("Fetch.continueRequest", { requestId: p.requestId }); return; }
  if (p.request.method === "OPTIONS") { await kirim("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 204, responseHeaders: CORS, body: "" }); return; }
  let aksi = "?", args = []; try { const b = JSON.parse(p.request.postData || "{}"); aksi = b.action; args = b.args || []; } catch { /* abaikan */ }
  panggilan.push({ aksi, args });
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
const klik = (sel) => js("(() => { const e = document.querySelector(" + JSON.stringify(sel) + "); if (!e || e.disabled) return false; e.click(); return true; })()");
const ada = (sel) => js("!!document.querySelector(" + JSON.stringify(sel) + ")");
const teks = (sel) => js("(() => { const e = document.querySelector(" + JSON.stringify(sel) + "); return e ? e.textContent.replace(/\\s+/g, ' ').trim() : ''; })()");
const nonaktif = (sel) => js("(() => { const e = document.querySelector(" + JSON.stringify(sel) + "); return e ? e.disabled : null; })()");
const KOTAK = "#djpm-uld-kotak";

async function masuk(peranBaru) {
  peran = peranBaru;
  await kirim("Page.navigate", { url: "about:blank" }); await tidur(400);
  try { await kirim("Storage.clearDataForOrigin", { origin: BASE, storageTypes: "all" }); } catch (_e) { /* abaikan */ }   // cache Detail antar skenario tak boleh bocor
  panggilan.length = 0; skripDimuat.length = 0;
  await kirim("Page.navigate", { url: BASE + "/" });
  await tungguSampai("!!document.getElementById('tab-rekap') && document.readyState==='complete'", "halaman siap");
  await js(`sessionStorage.setItem('dana_jasa_sesi', JSON.stringify({ token: 'TOKEN-UJI', username: ${JSON.stringify(peranBaru === "VERIFIKATOR" ? "verif_helda_melani" : "admin")}, role: ${JSON.stringify(peranBaru)}, kecamatan: '', userId: '', namaLengkap: 'UJI' })); true`);
  skripDimuat.length = 0; panggilan.length = 0;
  await kirim("Page.reload");
  await tungguSampai("!!document.getElementById('tab-rekap') && document.readyState==='complete'", "halaman siap setelah muat ulang");
  await tungguSampai("document.getElementById('modal-login') && document.getElementById('modal-login').classList.contains('hidden')", "sesi tiruan diterima", 60);
  await tidur(2800);
  // klik pada tautan berkas tidak boleh benar-benar membuka tab baru di uji
  await js("document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a[target=_blank]')) e.preventDefault(); }, true); window.open = (u) => { (window.__dibuka = window.__dibuka || []).push(u); return null; }; true");
}
const modalTerbuka = () => js("!document.getElementById('modal-detail-penerima').classList.contains('hidden')");
const klikNama = (nama) => js(`(() => { const td = Array.from(document.querySelectorAll('#body-tabel-lihat td')).find((x) => x.textContent.trim() === ${JSON.stringify(nama)}); if (!td) return false; td.click(); return true; })()`);
const berkasTeruji = (kunci) => js(`document.querySelector('input[data-uld-centang="${kunci}"]')`);

async function ukurPonsel(lebar) {
  await kirim("Emulation.setDeviceMetricsOverride", { width: lebar, height: 844, deviceScaleFactor: 2, mobile: true });
  await tidur(500);
  const r = await js(`(() => { const W = document.documentElement.clientWidth; const k = document.querySelector('${KOTAK}'); if (!k) return { tidakAda: true };
    const b = k.getBoundingClientRect(); const lewat = [];
    k.querySelectorAll('button, textarea, select, h3, label').forEach((e) => { const x = e.getBoundingClientRect(); if (x.width && (x.right > W + 1 || x.left < -1)) lewat.push((e.id || e.tagName) + ':' + Math.round(x.left) + '-' + Math.round(x.right)); });
    return { W, kanan: Math.round(b.right), kiri: Math.round(b.left), gulirHalaman: document.documentElement.scrollWidth > W + 1, lewat: lewat.slice(0, 5) }; })()`);
  await kirim("Emulation.clearDeviceMetricsOverride"); await tidur(300);
  return r;
}

try {
  await sambung();
  await kirim("Runtime.enable"); await kirim("Page.enable"); await kirim("Network.enable");
  await kirim("Fetch.enable", { patterns: [{ urlPattern: "*supabase.co*" }, { urlPattern: "*api/gas*" }] });

  // ============================ VERIFIKATOR ============================
  namaJahat = true; reset();
  await masuk("VERIFIKATOR");
  cek("PETUGAS: modul Verifikasi Ulang dimuat; panel lama TIDAK ada", skripDimuat.some((u) => /app-tugas-ulang\.js/.test(u)) && !(await ada("#djpm-tul-overlay")) && !(await ada("#djpm-tul-pil")));
  await tungguSampai("!!document.getElementById('tab-verif-ulang')", "tab Verifikasi Ulang");
  cek("PETUGAS: tab 'Verifikasi Ulang · 4' muncul", /Verifikasi Ulang · 4/.test(await teks("#tab-verif-ulang")), await teks("#tab-verif-ulang"));
  await klik("#tab-verif-ulang");
  await tungguSampai("document.querySelectorAll('#body-tabel-lihat tr').length === 4 && !!document.getElementById('djpm-tab-tugas-banner')", "tabel 4 tugas");
  cek("PETUGAS: banner mengajak klik nama dan menyebut kotak Verifikasi Ulang", /Klik nama atau tekan Periksa/.test(await teks("#djpm-tab-tugas-banner")) && /Verifikasi Ulang/.test(await teks("#djpm-tab-tugas-banner")), await teks("#djpm-tab-tugas-banner"));
  cek("PETUGAS: banner menampilkan progres seperti panel lama: 'Selesai 0 dari 4'", /Selesai 0 dari 4/.test(await teks("#djpm-tab-tugas-banner")), await teks("#djpm-tab-tugas-banner"));
  cek("PETUGAS: baris tabel berkursor tangan (dapat diklik)", (await js("getComputedStyle(document.querySelector('#body-tabel-lihat tr')).cursor")) === "pointer");

  // --- klik NAMA -> Detail
  await klikNama("Sri Wahyuni");
  await tungguSampai("!document.getElementById('modal-detail-penerima').classList.contains('hidden') && !!document.querySelector('" + KOTAK + " input[name=uld-mode]')", "Detail + kotak terbuka");
  cek("PETUGAS: mengklik NAMA membuka halaman DETAIL biasa (ambilDetailPenerimaPerBaris id 501), bukan panel", panggilan.some((x) => x.aksi === "ambilDetailPenerimaPerBaris" && x.args[1] === 501) && !(await ada("#djpm-tul-overlay")) && (await modalTerbuka()));
  cek("PETUGAS: kotak 'Verifikasi Ulang' ada di Detail (sebelum Riwayat Perubahan) dan tugas dibuka di server (bukaTugasUlang 101)", (await js("document.querySelector('" + KOTAK + "').nextElementSibling && document.querySelector('" + KOTAK + "').nextElementSibling.id")) === "riwayat-edit-wrap" && hitung("bukaTugasUlang") === 1 && panggilan.find((x) => x.aksi === "bukaTugasUlang").args[1] === 101);
  cek("PETUGAS: teks bawaan Detail 'Perubahan hanya dapat dilakukan oleh Admin Utama' DIGANTI menjadi petunjuk tugas Verifikasi Ulang (tidak bertentangan dengan kotak)", !/Perubahan hanya dapat dilakukan oleh Admin Utama/.test(await teks("#isi-konten-detail")) && /Ini tugas Verifikasi Ulang/.test(await teks("#isi-konten-detail")), (await teks("#isi-konten-detail")).slice(0, 300));
  cek("PETUGAS: data input lengkap tetap tampil di Detail (nama) dan tidak ada panel pembanding terpisah", /Sri Wahyuni/.test(await teks("#isi-konten-detail")) && !(await ada(".tul-grup")));
  cek("PETUGAS: penanda di BAGIAN ATAS Detail mengarahkan ke kotak; tombol 'Ke kotak' menggulir kotak ke layar",
    (await js("document.getElementById('isi-konten-detail').firstElementChild.id")) === "djpm-uld-atas" && /Ke kotak Verifikasi Ulang/.test(await teks("#djpm-uld-atas"))
    && (await js("(async () => { document.querySelector('#djpm-uld-atas button').click(); await new Promise((r) => setTimeout(r, 1200)); const r = document.querySelector('#djpm-uld-kotak').getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; })()")) === true);
  cek("PETUGAS: keterangan berbahaya dari server tampil sebagai teks (tidak dieksekusi)", (await js("window.__xss === undefined && !document.querySelector('" + KOTAK + " img')")) === true);
  cek("PETUGAS: tiga kotak centang muncul pada baris berkas di Detail, semuanya NONAKTIF ('Buka dulu'); Simpan nonaktif", (await js("document.querySelectorAll('#isi-konten-detail label.uld-cek input[data-uld-centang]').length")) === 3 && (await js("Array.from(document.querySelectorAll('input[data-uld-centang]')).every((c) => c.disabled)")) === true && (await nonaktif("#uld-simpan")) === true && /Belum dibuka: KTP, Buku Rekening, Surat Permohonan/i.test(await teks("#uld-valid")), await teks("#uld-valid"));
  cek("PETUGAS: kotak centang berada DI BARIS berkas yang sama dengan tombol Buka", (await js("(() => { const c = document.querySelector('input[data-uld-centang=\"link_ktp\"]'); const baris = c.closest('div.flex'); return !!baris.querySelector('a[href=\"https://berkas.example/101/ktp\"]') && /KTP/.test(baris.textContent); })()")) === true);

  // --- buka berkas dari Detail
  await klik('a[href="https://berkas.example/101/ktp"]');
  await tungguSampai("!document.querySelector('input[data-uld-centang=\"link_ktp\"]').disabled", "centang KTP aktif");
  cek("PETUGAS: mengklik 'Buka' pada berkas di Detail dicatat server (catatBerkasDibuka 101/link_ktp) dan HANYA centang berkas itu yang aktif", hitung("catatBerkasDibuka") === 1 && panggilan.find((x) => x.aksi === "catatBerkasDibuka").args[2] === "link_ktp" && (await nonaktif('input[data-uld-centang="link_buku_rekening"]')) === true);
  await klik('input[data-uld-centang="link_ktp"]');
  cek("PETUGAS: berkas belum lengkap -> Simpan tetap nonaktif", (await nonaktif("#uld-simpan")) === true && /Belum dibuka/.test(await teks("#uld-valid")));
  for (const k of ["buku_rekening", "surat"]) {
    await klik(`a[href="https://berkas.example/101/${k}"]`);
    await tungguSampai(`!document.querySelector('input[data-uld-centang="link_${k}"]').disabled`, "centang " + k);
  }
  cek("PETUGAS: semua dibuka tetapi belum dicentang -> Simpan nonaktif, pesan menyebut yang belum dicentang", (await nonaktif("#uld-simpan")) === true && /Belum dicentang: Buku Rekening/i.test(await teks("#uld-valid")), await teks("#uld-valid"));
  cek("PETUGAS: ringkasan 'Berkas dibuka 3 dari 3 · dicentang 1 dari 3'", /Berkas dibuka 3 dari 3 · dicentang 1 dari 3/.test(await teks("#uld-hitung")), await teks("#uld-hitung"));
  await klik('input[data-uld-centang="link_buku_rekening"]'); await klik('input[data-uld-centang="link_surat"]');
  cek("PETUGAS: semua dibuka dan dicentang -> Simpan AKTIF", (await nonaktif("#uld-simpan")) === false && /Siap disimpan/.test(await teks("#uld-valid")));
  await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(path.join(os.tmpdir(), "djpm_ulang_detail.png"), Buffer.from(s.result.data, "base64")));
  await js("document.querySelector('#djpm-uld-kotak').scrollIntoView({ block: 'start' }); true"); await tidur(500);
  await kirim("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(path.join(os.tmpdir(), "djpm_ulang_kotak.png"), Buffer.from(s.result.data, "base64")));
  for (const lebar of [320, 390]) {
    const hp = await ukurPonsel(lebar);
    cek("PONSEL " + lebar + "px: kotak Verifikasi Ulang pas di layar, tanpa elemen terpotong atau gulir mendatar", !hp.tidakAda && hp.kanan <= hp.W + 1 && hp.kiri >= -1 && hp.lewat.length === 0 && !hp.gulirHalaman, JSON.stringify(hp));
  }

  // --- gagal simpan biasa: pesan di kotak, Detail tetap
  simpanGagal = "Gagal menyimpan: galat contoh dari server.";
  const daftar0 = hitung("getTugasUlangSaya");
  await klik("#uld-simpan");
  await tungguSampai("/galat contoh dari server/.test(document.querySelector('" + KOTAK + "').textContent)", "pesan galat");
  cek("PETUGAS: penolakan biasa tampil di kotak; Detail tetap terbuka dan daftar tidak dimuat ulang", (await modalTerbuka()) && hitung("getTugasUlangSaya") === daftar0);
  // --- konflik: Detail ditutup + daftar dimuat ulang
  simpanGagal = "KONFLIK:Status data berubah saat Anda memeriksa. Muat ulang daftar tugas.";
  await klik("#uld-simpan");
  await tungguSampai("document.getElementById('modal-detail-penerima').classList.contains('hidden')", "Detail tertutup oleh konflik");
  for (let i = 0; i < 20 && hitung("getTugasUlangSaya") <= daftar0; i++) await tidur(250);
  cek("PETUGAS: konflik dari server menutup Detail dan memuat ulang daftar tugas (data basi tidak dibiarkan terbuka)", hitung("getTugasUlangSaya") > daftar0);

  // --- simpan Sesuai -> Detail berikutnya otomatis
  simpanGagal = "";
  await klikNama("Sri Wahyuni");
  await tungguSampai("!!document.querySelector('" + KOTAK + " input[name=uld-mode]') && document.querySelectorAll('input[data-uld-centang]').length === 3", "kotak terbuka lagi");
  for (const k of ["ktp", "buku_rekening", "surat"]) { await klik(`a[href="https://berkas.example/101/${k}"]`); await tungguSampai(`!document.querySelector('input[data-uld-centang="link_${k}"]').disabled`, "centang " + k); }
  cek("PETUGAS: berkas yang sudah dibuka tercatat server -> status 'Sudah diperiksa' saat Detail dibuka ulang (centang masih harus dilakukan)", (await nonaktif('input[data-uld-centang="link_ktp"]')) === false && (await js("document.querySelector('input[data-uld-centang=\"link_ktp\"]').checked")) === false);
  for (const k of ["ktp", "buku_rekening", "surat"]) await klik(`input[data-uld-centang="link_${k}"]`);
  const bukaSebelum = hitung("ambilDetailPenerimaPerBaris");
  await klik("#uld-simpan");
  await tungguSampai("document.querySelectorAll('input[data-uld-centang]').length === 2 && !document.getElementById('modal-detail-penerima').classList.contains('hidden') && /Ahmad Fauzi/.test(document.getElementById('isi-konten-detail').textContent)", "Detail berikutnya terbuka");
  const s1 = panggilan.filter((x) => x.aksi === "simpanHasilUlang").pop();
  cek("PETUGAS: simpan 'Sesuai' mengirim hasil SESUAI + centang; Detail data berikutnya (Ahmad Fauzi, 2 berkas) terbuka otomatis dengan kotaknya", s1.args[2].hasil === "SESUAI" && s1.args[2].centang.link_ktp === true && hitung("ambilDetailPenerimaPerBaris") > bukaSebelum && panggilan.filter((x) => x.aksi === "bukaTugasUlang").pop().args[1] === 102, JSON.stringify(s1.args));
  cek("PETUGAS: tab menunjukkan sisa 3 dan banner mencatat 1 selesai", /Verifikasi Ulang · 3/.test(await teks("#tab-verif-ulang")), await teks("#tab-verif-ulang"));
  // Ahmad Fauzi (502) berkoordinat bermasalah (Street View): peringatan + alasan cepat koordinat; penanda koordinat Detail tampil berdampingan
  await tungguSampai("!!document.querySelector('#djpm-pk-banner') && /bermasalah/.test(document.querySelector('" + KOTAK + "').textContent)", "peringatan koordinat di kotak", 40);
  cek("PETUGAS: data berkoordinat bermasalah -> kotak memperingatkan bahwa 'Sesuai' akan ditolak dan menyebut alasannya; banner penanda koordinat dan penanda atas tampil berdampingan", /Hasil Sesuai akan ditolak sistem/.test(await teks(KOTAK)) && /Tautan Street View, bukan titik penanda/.test(await teks(KOTAK)) && (await ada("#djpm-pk-banner")) && (await ada("#djpm-uld-atas")), await teks(KOTAK));

  // --- koreksi
  await js("document.querySelector('" + KOTAK + " input[name=uld-mode][value=koreksi]').click(); true");
  await tungguSampai("!!document.querySelector('#uld-status')", "form koreksi");
  cek("PETUGAS: pilihan status baru hanya BTL dan TMS (tidak ada Memenuhi Syarat)", JSON.stringify(await js("Array.from(document.querySelectorAll('#uld-status option')).map((o) => o.textContent)")) === JSON.stringify(["Berkas Tidak Lengkap", "Tidak Memenuhi Syarat"]));
  cek("PETUGAS: dampak koreksi (keluar calon pembayaran, batas 30-11-2026) tampil", /calon pembayaran/.test(await teks(KOTAK)) && /30-11-2026/.test(await teks(KOTAK)));
  for (const k of ["ktp", "buku_rekening"]) { await klik(`a[href="https://berkas.example/102/${k}"]`); await tungguSampai(`!document.querySelector('input[data-uld-centang="link_${k}"]').disabled`, "centang " + k); }
  cek("PETUGAS: koreksi tanpa alasan -> Simpan nonaktif; centang tidak diwajibkan untuk koreksi", (await nonaktif("#uld-simpan")) === true && /Alasan koreksi wajib/.test(await teks("#uld-valid")));
  cek("PETUGAS: pada koreksi ke Berkas Tidak Lengkap muncul alasan cepat 'Koordinat tidak valid' (di samping alasan cepat biasa)", /Koordinat tidak valid/.test(await teks(KOTAK + " .uld-chips")) && (await ada('[data-uld="koordinat"]')) && (await ada('[data-uld="templat"]')));
  await klik('[data-uld="koordinat"]');
  cek("PETUGAS: alasan cepat koordinat mengisi kalimat baku yang SAMA dengan saran server ('Koordinat tidak valid: tautan Street View, bukan titik penanda. Mohon kirim ulang ...')", (await js("document.getElementById('uld-alasan').value")) === "Koordinat tidak valid: tautan Street View, bukan titik penanda. Mohon kirim ulang titik lokasi yang benar (tekan lama titik di Google Maps, pilih Bagikan, lalu Salin tautan).", await js("document.getElementById('uld-alasan').value"));
  await klik('[data-uld="templat"][data-i="0"]');
  cek("PETUGAS: klik alasan cepat mengisi alasan (layanan terisi) dan mengaktifkan Simpan", /KTP IMAM MASJID tidak terbaca/.test(await js("document.getElementById('uld-alasan').value")) && (await nonaktif("#uld-simpan")) === false);
  await js("(() => { const t = document.getElementById('uld-alasan'); t.focus(); t.value += ' (lengkap)'; t.dispatchEvent(new Event('input', { bubbles: true })); return true; })()");
  cek("PETUGAS: mengetik di kolom alasan tidak menghilangkan fokus/isian (kotak tidak digambar ulang saat mengetik)", (await js("document.activeElement.id")) === "uld-alasan" && /\(lengkap\)/.test(await js("document.getElementById('uld-alasan').value")));
  await klik("#uld-simpan");
  await tungguSampai("document.querySelectorAll('input[data-uld-centang]').length === 1 && /Marlina Sitorus/.test(document.getElementById('isi-konten-detail').textContent)", "Detail berikutnya (Marlina)");
  const s2 = panggilan.filter((x) => x.aksi === "simpanHasilUlang").pop();
  cek("PETUGAS: koreksi mengirim DIKOREKSI + status baru + alasan; Detail berikutnya terbuka", s2.args[2].hasil === "DIKOREKSI" && s2.args[2].statusSesudah === "Berkas Tidak Lengkap" && /KTP IMAM MASJID tidak terbaca/.test(s2.args[2].alasan), JSON.stringify(s2.args));

  // --- Marlina (1 berkas) lalu Rahmat (tanpa berkas)
  await klik('a[href="https://berkas.example/103/ktp"]');
  await tungguSampai("!document.querySelector('input[data-uld-centang=\"link_ktp\"]').disabled", "centang KTP Marlina");
  await klik('input[data-uld-centang="link_ktp"]'); await klik("#uld-simpan");
  await tungguSampai("/Rahmat Hidayat/.test(document.getElementById('isi-konten-detail').textContent) && !!document.querySelector('" + KOTAK + " input[name=uld-mode]')", "Detail Rahmat");
  cek("PETUGAS: data tanpa berkas unggahan: kotak menyebut tidak ada berkas dan boleh langsung disimpan Sesuai", /tidak memiliki berkas/.test(await teks(KOTAK)) && (await nonaktif("#uld-simpan")) === false);
  await klik("#uld-simpan");
  await tungguSampai("document.getElementById('modal-detail-penerima').classList.contains('hidden')", "Detail tertutup setelah tugas terakhir");
  await tidur(800);
  cek("PETUGAS: setelah tugas terakhir Detail tertutup, tidak ada Detail lain terbuka, dan tab menjadi 'Verifikasi Ulang ✓'", !(await modalTerbuka()) && /Verifikasi Ulang ✓/.test(await teks("#tab-verif-ulang")), await teks("#tab-verif-ulang"));

  // --- keluar dari mode Verifikasi Ulang saat Detail masih terbuka: kotak ikut hilang
  reset(); selesai = 0;
  await masuk("VERIFIKATOR");
  await tungguSampai("!!document.getElementById('tab-verif-ulang')", "tab Ulang");
  await klik("#tab-verif-ulang");
  await tungguSampai("document.querySelectorAll('#body-tabel-lihat tr').length === 4", "tabel Ulang");
  await klikNama("Sri Wahyuni");
  await tungguSampai("!!document.querySelector('" + KOTAK + " input[name=uld-mode]')", "kotak terbuka");
  await js("document.getElementById('tab-rekap').click(); true");   // keluar dari mode tugas sementara Detail masih terbuka
  await tungguSampai("!document.querySelector('" + KOTAK + "')", "kotak dibuang", 20);
  cek("PETUGAS: keluar dari mode Verifikasi Ulang saat Detail terbuka membuang kotak dan penanda atas (tidak tertinggal tombol Simpan yang basi)", !(await ada(KOTAK)) && !(await ada("#djpm-uld-atas")) && !(await ada("label.uld-cek")));
  await js("document.getElementById('tutup-modal-detail').click(); true");

  // --- menutup Detail tanpa menyimpan menyegarkan daftar (progres) tanpa menunggu 15 detik
  reset(); selesai = 0;
  await masuk("VERIFIKATOR");
  await tungguSampai("!!document.getElementById('tab-verif-ulang')", "tab Ulang");
  await klik("#tab-verif-ulang");
  await tungguSampai("document.querySelectorAll('#body-tabel-lihat tr').length === 4", "tabel Ulang");
  await klikNama("Marlina Sitorus");
  await tungguSampai("!!document.querySelector('" + KOTAK + " input[name=uld-mode]')", "kotak terbuka");
  await tidur(1200);   // pemantau Detail berdetak tiap 0,5 dtk: beri kesempatan melihat Detail terbuka (menutup <0,5 dtk memang jatuh ke penyegaran 15 dtk)
  const daftarSebelumTutup = hitung("getTugasUlangSaya");
  await js("document.getElementById('tutup-modal-detail').click(); true");
  for (let i = 0; i < 24 && hitung("getTugasUlangSaya") <= daftarSebelumTutup; i++) await tidur(250);
  cek("PETUGAS: menutup Detail tanpa menyimpan memuat ulang daftar tugas segera", hitung("getTugasUlangSaya") > daftarSebelumTutup);

  // --- dua berkas beralamat SAMA: masing-masing mendapat tautan dan kotak centangnya sendiri
  duplikat = true; reset();
  await masuk("VERIFIKATOR");
  await tungguSampai("!!document.getElementById('tab-verif-ulang')", "tab Ulang");
  await klik("#tab-verif-ulang");
  await tungguSampai("document.querySelectorAll('#body-tabel-lihat tr').length === 4", "tabel Ulang");
  await klikNama("Marlina Sitorus");
  await tungguSampai("document.querySelectorAll('input[data-uld-centang]').length === 2", "dua kotak centang");
  const kembar = await js("Array.from(document.querySelectorAll('a[data-uld-kunci]')).map((a) => a.getAttribute('data-uld-kunci') + '|' + a.getAttribute('href'))");
  cek("PETUGAS: dua berkas beralamat sama -> dua tautan berbeda diberi tanda berkasnya masing-masing (tidak berebut satu tautan)", kembar.length === 2 && kembar[0] !== kembar[1] && kembar.every((x) => x.endsWith("|https://berkas.example/103/sama")) && (await ada('#djpm-uld-kotak .uld-lain') === false), JSON.stringify(kembar));
  await js("document.querySelectorAll('a[data-uld-kunci]')[1].click(); true");
  await tungguSampai("!document.querySelector('input[data-uld-centang=\"link_buku_rekening\"]').disabled", "centang berkas kedua aktif");
  cek("PETUGAS: mengklik tautan KEDUA hanya mengaktifkan centang berkas kedua (berkas pertama tetap terkunci sampai tautannya sendiri diklik)", (await nonaktif('input[data-uld-centang="link_ktp"]')) === true && (await nonaktif('input[data-uld-centang="link_buku_rekening"]')) === false);
  await js("document.querySelectorAll('a[data-uld-kunci]')[0].click(); true");
  await tungguSampai("!document.querySelector('input[data-uld-centang=\"link_ktp\"]').disabled", "centang berkas pertama aktif");
  cek("PETUGAS: kedua tautan dicatat server (catatBerkasDibuka untuk link_ktp dan link_buku_rekening)", panggilan.filter((x) => x.aksi === "catatBerkasDibuka").map((x) => x.args[2]).sort().join() === "link_buku_rekening,link_ktp");
  duplikat = false;

  // --- berkas yang tautannya TIDAK tampil di Detail: baris cadangan di kotak (tombol Buka + centang) sejak gambar pertama
  sembunyi = true; reset();
  await masuk("VERIFIKATOR");
  await tungguSampai("!!document.getElementById('tab-verif-ulang')", "tab Ulang");
  await klik("#tab-verif-ulang");
  await tungguSampai("document.querySelectorAll('#body-tabel-lihat tr').length === 4", "tabel Ulang");
  await klikNama("Marlina Sitorus");
  await tungguSampai("!!document.querySelector('" + KOTAK + " input[name=uld-mode]')", "kotak terbuka");
  cek("PETUGAS: berkas tanpa tautan di Detail -> kotak memuat baris cadangan dengan tombol 'Buka berkas' dan centang (centang terkunci sampai dibuka)", (await ada(KOTAK + ' .uld-lain [data-uld="buka"]')) && (await nonaktif(KOTAK + ' input[data-uld-centang="link_ktp"]')) === true, await teks(KOTAK));
  await klik(KOTAK + ' [data-uld="buka"]');
  await tungguSampai("!document.querySelector('#djpm-uld-kotak input[data-uld-centang=\"link_ktp\"]').disabled", "centang cadangan aktif", 40);
  cek("PETUGAS: tombol 'Buka berkas' cadangan dicatat server dan membuka centang berkas itu", hitung("catatBerkasDibuka") === 1);
  sembunyi = false;

  // --- tanda koordinat tiba TERLAMBAT (setelah kotak tergambar): kotak digambar ulang dan memperingatkan
  koordSiap = false; reset();
  await masuk("VERIFIKATOR");
  await tungguSampai("!!document.getElementById('tab-verif-ulang')", "tab Ulang");
  await klik("#tab-verif-ulang");
  await tungguSampai("document.querySelectorAll('#body-tabel-lihat tr').length === 4", "tabel Ulang");
  await klikNama("Ahmad Fauzi");
  await tungguSampai("!!document.querySelector('" + KOTAK + " input[name=uld-mode]')", "kotak Ahmad terbuka");
  cek("PETUGAS: sebelum tanda koordinat tiba, kotak tidak memperingatkan apa pun", !/bermasalah/.test(await teks(KOTAK)));
  koordSiap = true;
  await js("window.djpmPenandaKoordinat.muatUlangUntukUji(); true");
  await tungguSampai("/Hasil Sesuai akan ditolak sistem/.test(document.querySelector('" + KOTAK + "').textContent)", "peringatan muncul setelah tanda tiba", 40);
  cek("PETUGAS: tanda koordinat yang tiba terlambat membuat kotak digambar ulang dengan peringatan", /Hasil Sesuai akan ditolak sistem/.test(await teks(KOTAK)));
  koordSiap = true;

  // --- data yang BUKAN tugas ulang / bukan di tab Ulang: tanpa kotak
  reset(); selesai = 0;
  await masuk("VERIFIKATOR");
  await tungguSampai("!!document.getElementById('tab-rekap')", "siap");
  await klik("#tab-rekap");
  await tungguSampai("document.querySelectorAll('#body-tabel-lihat tr').length >= 5", "Lihat Data biasa");
  await js("window.tampilkanDetailKeModalOnDemand(501); true");
  await tungguSampai("!document.getElementById('modal-detail-penerima').classList.contains('hidden') && /Sri Wahyuni/.test(document.getElementById('isi-konten-detail').textContent)", "Detail dari Lihat Data biasa");
  await tidur(2200);
  cek("PETUGAS: Detail dari Lihat Data BIASA (bukan tab Verifikasi Ulang) tidak memuat kotak Verifikasi Ulang dan tidak memanggil bukaTugasUlang", !(await ada(KOTAK)) && hitung("bukaTugasUlang") === 0);
  await js("document.getElementById('tutup-modal-detail').click(); true");
  await klik("#tab-verif-ulang");
  await tungguSampai("document.querySelectorAll('#body-tabel-lihat tr').length === 4", "tab Ulang lagi");
  await js("window.tampilkanDetailKeModalOnDemand(505); true");   // data lain (bukan tugasnya)
  await tungguSampai("!document.getElementById('modal-detail-penerima').classList.contains('hidden') && /Dewi Lestari/.test(document.getElementById('isi-konten-detail').textContent)", "Detail data lain");
  await tidur(2200);
  cek("PETUGAS: Detail data yang BUKAN tugasnya (505) tidak memuat kotak walau berada di tab Ulang", !(await ada(KOTAK)));

  // ============================ ADMIN UTAMA ============================
  namaJahat = false; reset();
  await masuk("UTAMA");
  await klik("#tab-rekap");
  await tungguSampai("document.querySelectorAll('#body-tabel-lihat tr').length >= 5", "Lihat Data Admin");
  await js("window.tampilkanDetailKeModalOnDemand(501); true");
  await tungguSampai("!document.getElementById('modal-detail-penerima').classList.contains('hidden') && /Sri Wahyuni/.test(document.getElementById('isi-konten-detail').textContent)", "Detail Admin");
  await tidur(2200);
  cek("ADMIN: modul petugas TIDAK dimuat dan tidak ada kotak Verifikasi Ulang di Detail", !skripDimuat.some((u) => /app-tugas-ulang\.js/.test(u)) && !(await ada(KOTAK)));

  cek("TANPA galat JavaScript di halaman", galatJs.length === 0, galatJs.join(" | "));
} catch (e) { console.log("GALAT UJI: " + e.message); gagal++; }
finally { try { ws.close(); } catch { /* abaikan */ } chrome.kill(); }
console.log(gagal === 0 ? "\nSEMUA LULUS" : "\nGAGAL: " + gagal);
process.exit(gagal === 0 ? 0 : 1);
