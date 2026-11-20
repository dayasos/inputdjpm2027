// SEMENTARA (2026-11-19): aplikasi Retur & Kematian belum siap -> tidak ada pengguna yang boleh masuk lewat Input.
// Penegak utama: SERVER (buatTokenSSORetur tidak membuat token). Layar hanya memberi informasi "sedang dalam pengembangan".
// Menjalankan kode server APA ADANYA dengan database tiruan. Jalankan: node --test scripts/uji/retur-dalam-pengembangan.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { db, muatServer } from "./_harness-server.mjs";

const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const sso = await muatServer("supabase/functions/api/domains/sso.ts");

const SESI = (role) => ({ akun_id: "a1", username: "pengguna", role, kecamatan: "", user_id: "" });
function pasang(role) {
  db().panggilan.length = 0;
  db().handler = (q) => (q.includes("from sesi_login") ? [SESI(role)] : []);
}

test("SERVER: semua peran (Admin Utama, Verifikator, Kecamatan, Kemenag) ditolak dengan pesan 'sedang dalam pengembangan'; tidak ada token dan tidak ada pembacaan data akun", async () => {
  assert.equal(sso.RETUR_DALAM_PENGEMBANGAN, true);
  for (const role of ["UTAMA", "VERIFIKATOR", "KECAMATAN", "GURU MAGHRIB MENGAJI", "MUI"]) {
    pasang(role);
    const r = await sso.buatTokenSSORetur("token-" + role);
    assert.equal(r.sukses, false, role);
    assert.match(r.pesan, /sedang dalam pengembangan/, role);
    assert.equal(r.url, undefined, "tidak ada url/token SSO untuk " + role);
    assert.equal(db().panggilan.filter((p) => p.teks.toLowerCase().includes("from akun")).length, 0, "nama/jabatan akun tidak dibaca (tidak ada token disusun)");
  }
});

test("SERVER: pengguna tanpa sesi tetap mendapat pesan sesi (bukan informasi pengembangan)", async () => {
  db().panggilan.length = 0;
  db().handler = () => [];
  const r = await sso.buatTokenSSORetur("token-tidak-sah");
  assert.equal(r.sukses, false);
  assert.doesNotMatch(String(r.pesan), /sedang dalam pengembangan/);
});

test("LAYAR: tombol 'Retur & Kematian' hanya menampilkan informasi dan TIDAK memanggil server atau membuka tab baru; pengaman layar dan server sama-sama menyala", () => {
  const js = baca("public/js/app-core.js");
  const mulai = js.indexOf("document.getElementById('btn-retur-kematian')");
  assert.ok(mulai > 0);
  const penangan = js.slice(mulai, js.indexOf("const btnKelolaUserNav", mulai));
  assert.match(js, /const RETUR_DALAM_PENGEMBANGAN = true;/);
  const jaga = penangan.slice(penangan.indexOf("if (RETUR_DALAM_PENGEMBANGAN)"), penangan.indexOf("const btn = this;"));
  assert.match(jaga, /sedang dalam pengembangan/);
  assert.match(jaga, /return;/, "keluar sebelum memanggil server");
  assert.ok(penangan.indexOf("if (RETUR_DALAM_PENGEMBANGAN)") < penangan.indexOf("buatTokenSSORetur"), "penjaga layar mendahului pemanggilan server");
  assert.ok(penangan.indexOf("if (RETUR_DALAM_PENGEMBANGAN)") < penangan.indexOf("window.open"), "penjaga layar mendahului pembukaan tab");
  const server = baca("supabase/functions/api/domains/sso.ts");
  assert.match(server, /export const RETUR_DALAM_PENGEMBANGAN = true;/);
  const badan = server.slice(server.indexOf("export async function buatTokenSSORetur"));
  assert.ok(badan.indexOf("if (RETUR_DALAM_PENGEMBANGAN)") > 0 && badan.indexOf("if (RETUR_DALAM_PENGEMBANGAN)") < badan.indexOf("Deno.env.get(\"SSO_SECRET_KEY\")"), "penolakan server mendahului pembacaan kunci SSO");
  assert.match(baca("index.html"), /id="btn-retur-kematian"[\s\S]{0,400}sedang dalam pengembangan/, "petunjuk (title) pada tombol");
});
