// Gerbang aksi khusus jalur _secret (Edge Function). Jalankan: npm run uji:gerbang-aksi
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { AKSI_HANYA_JALUR_SECRET, ditolakTanpaSecret } from "../../supabase/functions/api/_shared/gerbangAksi.ts";

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

test("KABEL: index.ts memakai ditolakTanpaSecret SEBELUM mencari aksi di ALLOWED, dan aksinya terdaftar", () => {
  const src = fs.readFileSync(new URL("../../supabase/functions/api/index.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /import \{ ditolakTanpaSecret \} from "\.\/_shared\/gerbangAksi\.ts";/);
  const iGerbang = src.indexOf("ditolakTanpaSecret(action, isValidSecret)");
  const iCari = src.indexOf("const fn = ALLOWED[action];");
  assert.ok(iGerbang > 0 && iCari > 0 && iGerbang < iCari, "gerbang harus sebelum ALLOWED[action]");
  assert.match(src, /^\s*cekStatusPublik,$/m);
  // Aksi khusus tidak boleh ikut aksi publik tanpa gerbang.
  assert.match(src, /const isAksiPublikTanpaGerbang = action === "loginPengguna";/);
});
