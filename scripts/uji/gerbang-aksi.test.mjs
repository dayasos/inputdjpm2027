// Gerbang aksi khusus jalur _secret (Edge Function). Jalankan: npm run uji:gerbang-aksi
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { AKSI_HANYA_JALUR_SECRET, AKSI_PUBLIK_TANPA_GERBANG, aksiPublikTanpaGerbang, ditolakTanpaSecret } from "../../supabase/functions/api/_shared/gerbangAksi.ts";
import { aksiKhususCekStatus } from "../../worker/cek-status.js";

test("cekStatusPublik ditolak tanpa _secret sah, diterima dengan _secret sah", () => {
  assert.equal(ditolakTanpaSecret("cekStatusPublik", false), true);
  assert.equal(ditolakTanpaSecret("cekStatusPublik", true), false);
});

test("aksi lain tidak terpengaruh (login, aksi petugas, aksi tak dikenal)", () => {
  for (const a of ["loginPengguna", "cekNikRealtime", "pulihkanSesi", "", "tidakAda"]) {
    assert.equal(ditolakTanpaSecret(a, false), false, a);
    assert.equal(ditolakTanpaSecret(a, true), false, a);
  }
});

test("daftar aksi khusus persis satu: cekStatusPublik", () => {
  assert.deepEqual([...AKSI_HANYA_JALUR_SECRET], ["cekStatusPublik"]);
});

test("KESESUAIAN: setiap aksi khusus di Edge Function juga ditolak oleh Worker /api/gas (dua daftar tidak boleh menyimpang)", () => {
  for (const a of AKSI_HANYA_JALUR_SECRET) {
    for (const v of [a, a.toUpperCase(), a.toLowerCase(), " " + a + " "]) assert.equal(aksiKhususCekStatus(v), true, JSON.stringify(v));
  }
});

test("KABEL: proxy dev vite (yang juga menyuntikkan _secret) memakai penolakan yang sama dengan Worker", () => {
  const src = fs.readFileSync(new URL("../../vite.config.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /import \{ aksiKhususCekStatus \} from '\.\/worker\/cek-status\.js';/);
  const iTolak = src.indexOf("aksiKhususCekStatus(payload.action)");
  const iSecret = src.indexOf("payload._secret = secretToken;");
  assert.ok(iTolak > 0 && iSecret > 0 && iTolak < iSecret, "penolakan harus sebelum _secret disuntikkan");
});

test("KABEL: index.ts memakai ditolakTanpaSecret SEBELUM mencari aksi di ALLOWED, dan aksinya terdaftar", () => {
  const src = fs.readFileSync(new URL("../../supabase/functions/api/index.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /import \{ AKSI_HANYA_JALUR_SECRET, aksiPublikTanpaGerbang, ditolakTanpaSecret \} from "\.\/_shared\/gerbangAksi\.ts";/);
  const iGerbang = src.indexOf("ditolakTanpaSecret(action, isValidSecret)");
  const iCari = src.indexOf("const fn = ALLOWED[action];");
  assert.ok(iGerbang > 0 && iCari > 0 && iGerbang < iCari, "gerbang harus sebelum ALLOWED[action]");
  assert.match(src, /^\s*cekStatusPublik,$/m);
  // Aksi khusus tidak boleh ikut aksi publik tanpa gerbang.
  assert.match(src, /const isAksiPublikTanpaGerbang = aksiPublikTanpaGerbang\(action\);/);
  // Dan pemeriksaan akses memakai penanda itu sebelum aksi dicari.
  assert.match(src, /if \(!isValidSecret && !isValidSessionHeader && !isAksiPublikTanpaGerbang\) \{/);
});

// ───────────── Aksi publik tanpa gerbang (loginPengguna + getMasterLayanan) ─────────────
const bacaKlien = () => fs.readFileSync(new URL("../../public/js/api-bridge.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("PUBLIK: daftar aksi publik persis loginPengguna + getMasterLayanan (menambah aksi harus disengaja dan melewati uji ini)", () => {
  assert.deepEqual([...AKSI_PUBLIK_TANPA_GERBANG].sort(), ["getMasterLayanan", "loginPengguna"]);
  assert.equal(aksiPublikTanpaGerbang("getMasterLayanan"), true);
  assert.equal(aksiPublikTanpaGerbang("loginPengguna"), true);
});

test("PUBLIK: aksi lain TIDAK publik (aksi data, admin, sesi, dan aksi khusus jalur _secret)", () => {
  for (const a of ["ambilDataLihatDataHakAkses", "adminDaftarData", "getProgresKuota", "ambilDaftarAkun", "ambilDaftarAkunLengkap", "pulihkanSesi",
    "logoutPengguna", "ping", "cekStatusPublik", "getKelurahanByKecamatan", "", "GETMASTERLAYANAN", "getMasterLayanan ", "tidakAda"]) {
    assert.equal(aksiPublikTanpaGerbang(a), false, JSON.stringify(a));
  }
});

test("PUBLIK: tidak tumpang tindih dengan aksi khusus jalur _secret", () => {
  for (const a of AKSI_PUBLIK_TANPA_GERBANG) assert.equal(AKSI_HANYA_JALUR_SECRET.has(a), false, a);
});

test("KESESUAIAN KLIEN-SERVER: _AKSI_PUBLIK_LANGSUNG di api-bridge.js sama persis dengan AKSI_PUBLIK_TANPA_GERBANG di server", () => {
  const src = bacaKlien();
  const m = src.match(/const _AKSI_PUBLIK_LANGSUNG = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(m, "set _AKSI_PUBLIK_LANGSUNG tidak ditemukan");
  const klien = [...m[1].replace(/\/\/[^\n]*/g, "").matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
  assert.deepEqual(klien, [...AKSI_PUBLIK_TANPA_GERBANG].sort());
});

test("KLIEN: aksi publik dipilih jalur LANGSUNG walau belum ada token; PROXY_ONLY tidak memuat aksi publik", () => {
  const src = bacaKlien();
  assert.match(src, /const pakaiDirect = !_PROXY_ONLY_ACTIONS\.has\(action\) &&\s*\(Boolean\(sessionToken\) \|\| _AKSI_PUBLIK_LANGSUNG\.has\(action\)\);/);
  const p = src.match(/const _PROXY_ONLY_ACTIONS = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(p, "set _PROXY_ONLY_ACTIONS tidak ditemukan");
  assert.doesNotMatch(p[1], /getMasterLayanan|loginPengguna/);
});

test("DATA: getMasterLayanan hanya membaca nama/kategori layanan, tanpa kolom pribadi, dan terdaftar sebagai aksi", () => {
  const master = fs.readFileSync(new URL("../../supabase/functions/api/domains/master.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const mulai = master.indexOf("export async function getMasterLayanan()");
  assert.ok(mulai > 0, "fungsi tidak ditemukan");
  const badan = master.slice(mulai, master.indexOf("\n}\n", mulai));
  assert.match(badan, /select kategori, nama_layanan\s+from layanan_master/);
  assert.doesNotMatch(badan, /\bnik\b|nama_rekening|nomor_rekening|no_kontak|password|\bakun\b|wajibSesi/i);
  const idx = fs.readFileSync(new URL("../../supabase/functions/api/index.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(idx, /^\s*getMasterLayanan,$/m, "getMasterLayanan harus terdaftar di ALLOWED");
});
