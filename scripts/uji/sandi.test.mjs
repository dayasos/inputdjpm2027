// Modul sandi (supabase/functions/api/_shared/sandi.ts): format LAMA (SHA-256 polos) dan BARU (PBKDF2 + garam), dua fase, saklar HASH_SANDI_BARU.
// Jalankan: npm run uji:sandi. Kode server dijalankan APA ADANYA (Node 24 membaca .ts); Deno.env ditiru lewat tabel env di bawah.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const ENV = {};
globalThis.Deno = { env: { get: (k) => ENV[k] } };
const S = await import("../../supabase/functions/api/_shared/sandi.ts");
const H = await import("../../supabase/functions/api/_shared/hash.ts");

const sha256Hex = (t) => crypto.createHash("sha256").update(t, "utf8").digest("hex");
const b64u = (buf) => Buffer.from(buf).toString("base64url");
/** Hash BARU dibuat dengan implementasi PBKDF2 yang BERBEDA (node:crypto), untuk membuktikan kebenaran, bukan sekadar konsistensi. */
const hashIndependen = (sandi, iterasi = 210000, garam = crypto.randomBytes(16)) =>
  `pbkdf2$sha256$${iterasi}$${b64u(garam)}$${b64u(crypto.pbkdf2Sync(sandi, garam, iterasi, 32, "sha256"))}`;
const matikan = () => { delete ENV.HASH_SANDI_BARU; };

test("FORMAT LAMA: SHA-256 heksadesimal tetap terverifikasi; sandi salah ditolak", async () => {
  matikan();
  const lama = sha256Hex("Rahasia123");
  assert.equal(lama.length, 64);
  assert.equal(await S.verifikasiSandi("Rahasia123", lama), true);
  assert.equal(await S.verifikasiSandi("rahasia123", lama), false, "peka huruf besar/kecil");
  assert.equal(await S.verifikasiSandi("Rahasia123 ", lama), false);
  assert.equal(await H.hashString("Rahasia123"), lama, "hashString lama tidak berubah");
});

test("FORMAT BARU: dibuat modul ini, terverifikasi; sandi salah ditolak; garam acak membuat hash berbeda", async () => {
  const a = await S.buatHashBaru("Rahasia123");
  const b = await S.buatHashBaru("Rahasia123");
  assert.match(a, /^pbkdf2\$sha256\$210000\$[A-Za-z0-9_-]{20,}\$[A-Za-z0-9_-]{40,}$/);
  assert.notEqual(a, b, "sandi sama + garam acak -> hash berbeda");
  assert.equal(await S.verifikasiSandi("Rahasia123", a), true);
  assert.equal(await S.verifikasiSandi("Rahasia124", a), false);
  assert.equal(await S.verifikasiSandi("", a), false);
});

test("KEBENARAN: hash buatan implementasi LAIN (node:crypto) terverifikasi, dan hash buatan modul ini cocok dengan turunan node:crypto", async () => {
  const independen = hashIndependen("Sandi-Uji-9");
  assert.equal(await S.verifikasiSandi("Sandi-Uji-9", independen), true);
  assert.equal(await S.verifikasiSandi("Sandi-Uji-8", independen), false);
  const buatan = await S.buatHashBaru("Sandi-Uji-9");
  const [, , iter, garam, hasil] = buatan.split("$");
  const harapan = b64u(crypto.pbkdf2Sync("Sandi-Uji-9", Buffer.from(garam, "base64url"), Number(iter), 32, "sha256"));
  assert.equal(hasil, harapan);
});

test("UNICODE & PANJANG: sandi berhuruf non-ASCII dan sangat panjang tetap benar", async () => {
  for (const sandi of ["päss🔒wörd-Ü1", "密码Pass1234", "x".repeat(500) + "9"]) {
    const h = await S.buatHashBaru(sandi);
    assert.equal(await S.verifikasiSandi(sandi, h), true, sandi.slice(0, 10));
    assert.equal(await S.verifikasiSandi(sandi + "a", h), false);
    assert.equal(await S.verifikasiSandi(sandi, hashIndependen(sandi)), true, "setara implementasi independen");
  }
});

test("TAHAN NILAI RUSAK: format tak valid/kosong/bukan teks -> false tanpa melempar galat", async () => {
  const rusak = [
    "", null, undefined, 12345, {}, [],
    "pbkdf2$sha256$abc$AAAA$BBBB",                 // iterasi bukan angka
    "pbkdf2$sha256$5$AAAAAAAAAAAA$BBBBBBBBBBBB",   // iterasi di bawah batas
    "pbkdf2$sha256$99999999$AAAAAAAAAAAA$BBBB",    // iterasi di atas batas (pagar CPU)
    "pbkdf2$sha256$210000$AAAAAAAAAAAA",           // bagian kurang
    "pbkdf2$sha256$210000$AAAAAAAAAAAA$BBBB$CCCC", // bagian lebih
    "pbkdf2$sha1$210000$AAAAAAAAAAAA$BBBBBBBBBBBB",// algoritma lain
    "pbkdf2$sha256$210000$!!!$???",                // bukan base64url
    "pbkdf2$sha256$210000$AA$BBBBBBBBBBBB",        // garam terlalu pendek
  ];
  for (const r of rusak) assert.equal(await S.verifikasiSandi("apa-saja", r), false, JSON.stringify(r));
});

test("HASIL BERBEDA PANJANG tidak lolos (hash terpotong atau diperpanjang)", async () => {
  const h = await S.buatHashBaru("Rahasia123");
  const bagian = h.split("$");
  assert.equal(await S.verifikasiSandi("Rahasia123", [...bagian.slice(0, 4), bagian[4].slice(0, -3)].join("$")), false);
  assert.equal(await S.verifikasiSandi("Rahasia123", [...bagian.slice(0, 4), bagian[4] + "AAA"].join("$")), false);
});

test("SAKLAR FASE: hashUntukSimpan menulis format LAMA saat mati dan BARU saat hidup (nilai selain '1' = mati)", async () => {
  matikan();
  assert.equal(await S.hashUntukSimpan("Rahasia123"), sha256Hex("Rahasia123"), "fase A: format lama persis seperti sebelumnya");
  assert.equal(S.hashSandiBaruAktif(), false);
  for (const nilai of ["0", "true", "yes", " 2 ", ""]) { ENV.HASH_SANDI_BARU = nilai; assert.equal(S.hashSandiBaruAktif(), false, JSON.stringify(nilai)); }
  ENV.HASH_SANDI_BARU = " 1 ";
  assert.equal(S.hashSandiBaruAktif(), true, "spasi di tepi diabaikan");
  const baru = await S.hashUntukSimpan("Rahasia123");
  assert.ok(S.adalahHashBaru(baru));
  assert.equal(await S.verifikasiSandi("Rahasia123", baru), true);
  matikan();
});

test("KEMBALI KE FASE A AMAN: hash baru tetap terverifikasi saat saklar dimatikan (jalan balik tidak mengunci pengguna)", async () => {
  ENV.HASH_SANDI_BARU = "1";
  const baru = await S.hashUntukSimpan("Rahasia123");
  matikan();
  assert.equal(await S.verifikasiSandi("Rahasia123", baru), true);
  assert.equal(await S.verifikasiSandi("salah", baru), false);
});

test("PENINGKATAN: hanya pada fase B; format lama atau iterasi di bawah standar -> perlu; hash baru standar -> tidak", async () => {
  const lama = sha256Hex("x");
  const baruStandar = await S.buatHashBaru("x");
  const baruLemah = hashIndependen("x", 100000);
  matikan();
  assert.equal(S.perluUpgradeHash(lama), false, "fase A: tidak pernah meningkatkan");
  assert.equal(S.perluUpgradeHash(baruLemah), false);
  ENV.HASH_SANDI_BARU = "1";
  assert.equal(S.perluUpgradeHash(lama), true);
  assert.equal(S.perluUpgradeHash(baruLemah), true);
  assert.equal(S.perluUpgradeHash(baruStandar), false);
  assert.equal(S.perluUpgradeHash(null), false);
  assert.equal(S.perluUpgradeHash(undefined), false);
  assert.equal(S.perluUpgradeHash("pbkdf2$sha256$rusak"), false, "berawalan format baru tetapi isi rusak: tak ditingkatkan (dan tak pernah bisa diverifikasi)");
  // Teks tanpa awalan format baru dianggap format LAMA. Aman: peningkatan hanya dipanggil SETELAH verifikasi sukses,
  // dan teks yang lolos verifikasi pasti SHA-256 yang cocok persis.
  assert.equal(S.perluUpgradeHash("bukan-hash-apa-apa"), true);
  matikan();
});

test("IMBANGAN BIAYA: format baru jauh lebih lambat daripada SHA-256 (itulah tujuannya) namun tetap di bawah 1 detik di mesin ini", async () => {
  const t0 = performance.now();
  await S.buatHashBaru("Rahasia123");
  const baru = performance.now() - t0;
  const t1 = performance.now();
  await H.hashString("Rahasia123");
  const lama = performance.now() - t1;
  assert.ok(baru > lama * 50, `baru ${baru.toFixed(1)} ms vs lama ${lama.toFixed(2)} ms`);
  assert.ok(baru < 1000, `terlalu lambat: ${baru.toFixed(0)} ms`);
});
