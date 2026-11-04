// Login, ganti sandi sendiri, dan reset sandi oleh admin dengan modul sandi baru (auth.ts, akun.ts) -- database tiruan yang MENCATAT setiap tulisan.
// Memeriksa apa yang ditulis ke database pada fase A (saklar mati: tidak ada yang berubah) dan fase B (HASH_SANDI_BARU=1).
// Jalankan: npm run uji:sandi. Kode server dibundel dan dijalankan APA ADANYA (tanpa Deno, tanpa jaringan).
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { db, muatServer } from "./_harness-server.mjs";

const auth = await muatServer("supabase/functions/api/domains/auth.ts");
const akun = await muatServer("supabase/functions/api/domains/akun.ts");
const S = await import("../../supabase/functions/api/_shared/sandi.ts");

const ENV = {};
globalThis.Deno = { env: { get: (k) => ENV[k] } };   // setelah muatServer (harness memasang Deno bawaan)
const matikan = () => { delete ENV.HASH_SANDI_BARU; };
const nyalakan = () => { ENV.HASH_SANDI_BARU = "1"; };

const sha256Hex = (t) => crypto.createHash("sha256").update(t, "utf8").digest("hex");
const ID = "11111111-1111-1111-1111-111111111111";
let barisAkun = null;       // baris akun yang dikembalikan untuk pencarian username (null = tidak ada)
let terkunci = false;
let gagalUpdateHash = false;
let barisSesi = null;       // baris sesi_login untuk wajibSesi
let reset = { ada: true };

function pasang() {
  db().panggilan.length = 0;
  db().handler = (q, v) => {
    if (q.includes("from login_percobaan_gagal")) return terkunci ? [{ "?column?": 1 }] : [];
    if (q.includes("from akun") && q.includes("upper(username)")) return barisAkun ? [barisAkun] : [];
    if (q.includes("from sesi_login")) return barisSesi ? [barisSesi] : [];
    if (q.includes("select id, password_hash from akun")) return barisAkun ? [{ id: ID, password_hash: barisAkun.password_hash }] : [];
    if (q.includes("update akun set password_hash")) {
      if (gagalUpdateHash) throw new Error("uji: UPDATE hash sengaja gagal");
      return [{ id: ID }];
    }
    return [];
  };
}
const penulisanHash = () => db().panggilan.filter((p) => p.teks.includes("update akun set") && p.teks.includes("password_hash"));
const catatGagal = () => db().panggilan.filter((p) => p.teks.includes("insert into login_percobaan_gagal")).length;
const akunSehat = (hash, o = {}) => ({ id: ID, username: "admin", password_hash: hash, role: "UTAMA", kecamatan: "", user_id: "ADMIN UTAMA DEDI", nama_lengkap: "DEDI", nomor_hp: "08", jabatan: "X", ...o });
const login = async (u, p) => { pasang(); return await auth.loginPengguna(u, p); };

// ═══════════════════════════════ LOGIN ═══════════════════════════════
test("FASE A, hash LAMA, sandi benar: login berhasil dan TIDAK ADA tulisan hash (perilaku sama seperti sebelumnya)", async () => {
  matikan(); terkunci = false; gagalUpdateHash = false;
  barisAkun = akunSehat(sha256Hex("Rahasia123"));
  const r = await login("admin", "Rahasia123");
  assert.equal(r.sukses, true, JSON.stringify(r));
  assert.equal(r.role, "UTAMA");
  assert.ok(typeof r.token === "string" && r.token.length > 20);
  assert.equal(penulisanHash().length, 0, "fase A tidak menulis hash");
});

test("SANDI SALAH: ditolak, pesan sama persis, tercatat sebagai percobaan gagal, tanpa tulisan hash (kedua fase)", async () => {
  for (const fase of [matikan, nyalakan]) {
    fase(); terkunci = false;
    barisAkun = akunSehat(sha256Hex("Rahasia123"));
    const r = await login("admin", "salahsalah1");
    assert.equal(r.sukses, false);
    assert.equal(r.pesan, "Username atau password salah.");
    assert.equal(catatGagal(), 1);
    assert.equal(penulisanHash().length, 0);
    assert.equal(r.token, undefined);
  }
  matikan();
});

test("USERNAME TAK ADA: pesan sama dengan sandi salah (tidak membocorkan keberadaan akun), tercatat gagal", async () => {
  matikan(); barisAkun = null;
  const r = await login("tidakada", "apasaja123");
  assert.equal(r.sukses, false);
  assert.equal(r.pesan, "Username atau password salah.");
  assert.equal(catatGagal(), 1);
});

test("AKUN TERKUNCI: ditolak SEBELUM menghitung hash apa pun, dan tidak membaca akun", async () => {
  matikan(); terkunci = true;
  barisAkun = akunSehat(sha256Hex("Rahasia123"));
  const r = await login("admin", "Rahasia123");
  assert.equal(r.sukses, false);
  assert.match(r.pesan, /Terlalu banyak percobaan login gagal/);
  assert.equal(db().panggilan.filter((p) => p.teks.includes("from akun")).length, 0);
  terkunci = false;
});

test("FASE A, hash BARU sudah ada di database (jalan balik dari fase B): login tetap berhasil, tanpa tulisan", async () => {
  matikan();
  const hashBaru = await S.buatHashBaru("Rahasia123");
  barisAkun = akunSehat(hashBaru);
  const r = await login("admin", "Rahasia123");
  assert.equal(r.sukses, true, JSON.stringify(r));
  assert.equal(penulisanHash().length, 0);
  assert.equal((await login("admin", "Rahasia124")).sukses, false);
});

test("FASE B, hash LAMA, sandi benar: login berhasil DAN hash ditingkatkan sekali (UPDATE bersyarat pada hash lama), hasilnya bisa dipakai login", async () => {
  nyalakan(); gagalUpdateHash = false;
  const lama = sha256Hex("Rahasia123");
  barisAkun = akunSehat(lama);
  const r = await login("admin", "Rahasia123");
  assert.equal(r.sukses, true, JSON.stringify(r));
  const w = penulisanHash();
  assert.equal(w.length, 1, "tepat satu penulisan");
  assert.match(w[0].teks, /where id = \?\s+and password_hash = \?/, "bersyarat pada hash lama (anti-timpa)");
  assert.doesNotMatch(w[0].teks, /diperbarui_at/, "tidak mengubah diperbarui_at");
  const [hashBaru, idAkun, hashLamaDiSyarat] = w[0].nilai;
  assert.ok(S.adalahHashBaru(hashBaru));
  assert.equal(idAkun, ID);
  assert.equal(hashLamaDiSyarat, lama);
  assert.equal(await S.verifikasiSandi("Rahasia123", hashBaru), true, "hash baru cocok dengan sandi yang dipakai login");
  matikan();
});

test("FASE B, hash BARU standar: login berhasil, tidak ada tulisan (tidak ditingkatkan berulang)", async () => {
  nyalakan();
  barisAkun = akunSehat(await S.buatHashBaru("Rahasia123"));
  const r = await login("admin", "Rahasia123");
  assert.equal(r.sukses, true, JSON.stringify(r));
  assert.equal(penulisanHash().length, 0);
  matikan();
});

test("FASE B, UPDATE hash GAGAL: login TETAP berhasil (peningkatan tidak boleh menggagalkan login)", async () => {
  nyalakan(); gagalUpdateHash = true;
  barisAkun = akunSehat(sha256Hex("Rahasia123"));
  const r = await login("admin", "Rahasia123");
  assert.equal(r.sukses, true, JSON.stringify(r));
  assert.equal(r.pesan, "Login berhasil.");
  gagalUpdateHash = false; matikan();
});

test("SPASI: sandi di-trim seperti sebelumnya (' Rahasia123 ' = 'Rahasia123'), format lama dan baru", async () => {
  matikan();
  barisAkun = akunSehat(sha256Hex("Rahasia123"));
  assert.equal((await login("admin", "  Rahasia123  ")).sukses, true);
  barisAkun = akunSehat(await S.buatHashBaru("Rahasia123"));
  assert.equal((await login("admin", "  Rahasia123  ")).sukses, true);
});

test("PENCEGAHAN: sandi kosong/null/undefined tidak pernah lolos, bahkan bila hash di database kosong", async () => {
  matikan();
  for (const hashDb of [sha256Hex("Rahasia123"), "", null]) {
    barisAkun = akunSehat(hashDb);
    for (const p of ["", null, undefined, "   "]) {
      const r = await login("admin", p);
      assert.equal(r.sukses, false, `hash=${JSON.stringify(hashDb)} sandi=${JSON.stringify(p)}`);
    }
  }
});

// ═══════════════════════════════ GANTI SANDI SENDIRI ═══════════════════════════════
const sesiUtama = () => ({ akun_id: ID, username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN UTAMA DEDI" });
const ubahSendiri = async (token, verif, baru) => { pasang(); return await akun.ubahAkunSendiri(token, verif, "", baru, baru); };
let n = 0;

test("GANTI SANDI SENDIRI, fase A: verifikasi sandi lama (format LAMA), menulis hash format LAMA", async () => {
  matikan(); gagalUpdateHash = false;
  barisSesi = sesiUtama(); barisAkun = akunSehat(sha256Hex("Lama12345"));
  const r = await ubahSendiri("tok-" + (++n), "Lama12345", "Baru12345");
  assert.equal(r.sukses, true, JSON.stringify(r));
  const w = penulisanHash();
  assert.equal(w.length, 1);
  assert.equal(w[0].nilai[0], sha256Hex("Baru12345"), "fase A menulis SHA-256 persis seperti sebelumnya");
});

test("GANTI SANDI SENDIRI, fase B: menulis format BARU; sandi lama berformat BARU juga terverifikasi", async () => {
  nyalakan();
  barisSesi = sesiUtama(); barisAkun = akunSehat(sha256Hex("Lama12345"));
  let r = await ubahSendiri("tok-" + (++n), "Lama12345", "Baru12345");
  assert.equal(r.sukses, true, JSON.stringify(r));
  assert.ok(S.adalahHashBaru(penulisanHash()[0].nilai[0]));
  assert.equal(await S.verifikasiSandi("Baru12345", penulisanHash()[0].nilai[0]), true);
  // sandi lama sudah berformat baru
  barisAkun = akunSehat(await S.buatHashBaru("Lama12345"));
  r = await ubahSendiri("tok-" + (++n), "Lama12345", "Baru54321");
  assert.equal(r.sukses, true, JSON.stringify(r));
  matikan();
});

test("GANTI SANDI SENDIRI: sandi lama SALAH ditolak ('Password salah.'), tanpa tulisan, di kedua fase dan kedua format", async () => {
  for (const fase of [matikan, nyalakan]) {
    fase();
    for (const hashDb of [sha256Hex("Lama12345"), await S.buatHashBaru("Lama12345")]) {
      barisSesi = sesiUtama(); barisAkun = akunSehat(hashDb);
      const r = await ubahSendiri("tok-" + (++n), "Salah12345", "Baru12345");
      assert.equal(r.sukses, false);
      assert.equal(r.pesan, "Password salah.");
      assert.equal(penulisanHash().length, 0);
    }
  }
  matikan();
});

// ═══════════════════════════════ RESET OLEH ADMIN ═══════════════════════════════
test("RESET OLEH ADMIN: fase A menulis format LAMA, fase B format BARU; sesi akun target dicabut", async () => {
  for (const [fase, cek] of [[matikan, (h) => h === sha256Hex("Sementara1")], [nyalakan, (h) => S.adalahHashBaru(h)]]) {
    fase();
    barisSesi = sesiUtama(); barisAkun = akunSehat(sha256Hex("x"));
    pasang();
    const r = await akun.resetPasswordUser("tok-" + (++n), "petugas1", "Sementara1");
    assert.equal(r.sukses, true, JSON.stringify(r));
    const w = penulisanHash();
    assert.equal(w.length, 1);
    assert.ok(cek(w[0].nilai[0]));
    assert.ok(db().panggilan.some((p) => p.teks.includes("delete from sesi_login")), "sesi akun target dicabut");
  }
  matikan();
});
