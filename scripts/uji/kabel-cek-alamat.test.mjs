// KABEL Cek Alamat Tugas GMM: server (ALLOWED), jembatan API, pemuat malas, dan versi skrip harus konsisten. Plan: plans/plan-cek-alamat-tugas-gmm.md.
// Jalankan: npm run uji:cek-alamat   (Node 24+, tanpa dependensi, tanpa database).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8").split("\r\n").join("\n");
const AKSI = ["cekAlamatLencana", "cekAlamatRingkasan", "cekAlamatDaftar", "cekAlamatUtas", "cekAlamatBuka", "cekAlamatJawab",
  "cekAlamatPerbaiki", "cekAlamatBalas", "cekAlamatKembalikan", "cekAlamatSelesai"];

test("SERVER: kesepuluh aksi diekspor domain, diimpor index.ts, dan terdaftar di ALLOWED", () => {
  const dom = baca("supabase/functions/api/domains/cekAlamatTugas.ts");
  const idx = baca("supabase/functions/api/index.ts");
  const impor = /import \{([^}]*)\} from "\.\/domains\/cekAlamatTugas\.ts";/.exec(idx);
  assert.ok(impor, "impor dari domains/cekAlamatTugas.ts");
  const diimpor = impor[1].split(",").map((x) => x.trim()).filter(Boolean).sort();
  assert.deepEqual(diimpor, [...AKSI].sort(), "daftar impor = daftar aksi");
  const iAllowed = idx.indexOf("const ALLOWED: Record<string, Handler> = {");
  const blok = idx.slice(iAllowed, idx.indexOf("\n};", iAllowed));
  for (const a of AKSI) {
    assert.match(dom, new RegExp(`export (async )?function ${a}\\(`), "diekspor domain: " + a);
    assert.match(blok, new RegExp(`^\\s*${a},$`, "m"), "terdaftar di ALLOWED: " + a);
  }
  assert.equal([...dom.matchAll(/^export (?:async )?function (cekAlamat\w+)\(/gm)].length, AKSI.length, "tidak ada aksi publik lain yang terlewat");
});

test("SERVER: setiap aksi memeriksa sesi & peran lewat aksesCek()/jalankanTransisi (tidak ada jalur tanpa pemeriksaan hak akses)", () => {
  const dom = baca("supabase/functions/api/domains/cekAlamatTugas.ts");
  for (const a of AKSI) {
    const mulai = dom.indexOf(`export async function ${a}(`) >= 0 ? dom.indexOf(`export async function ${a}(`) : dom.indexOf(`export function ${a}(`);
    assert.ok(mulai > 0, a);
    const berikut = dom.indexOf("\nexport ", mulai + 10);
    const badan = dom.slice(mulai, berikut > 0 ? berikut : dom.length);
    assert.ok(/aksesCek\(token\)|jalankanTransisi\(/.test(badan), `${a} harus memanggil aksesCek()/jalankanTransisi()`);
  }
  // Satu-satunya jalur tulis ke penerima adalah editDataPenerima dengan indeks 9 (Alamat Tugas) saja.
  assert.equal([...dom.matchAll(/await editDataPenerima\(/g)].length, 1, "tepat satu pemanggilan editDataPenerima");
  assert.match(dom, /teks: \{ "9": al\.alamat \}/);
  assert.doesNotMatch(dom, /\b(update|delete from|insert into)\s+penerima\b/i, "tidak menulis ke penerima langsung");
  assert.doesNotMatch(dom, /\b(update|delete from|insert into)\s+data_detail\b/i);
});

test("FRONTEND: aksi yang dipanggil modul = daftar aksi server; semuanya terdaftar; hasil baca tidak di-cache (bukan SWR)", () => {
  const js = baca("public/js/app-cek-alamat.js");
  const dipanggil = new Set([...js.matchAll(/panggil\('(cekAlamat\w+)'/g)].map((m) => m[1]));
  for (const a of dipanggil) assert.ok(AKSI.includes(a), "aksi tak dikenal di server: " + a);
  for (const a of AKSI) assert.ok(dipanggil.has(a) || js.includes(`aksi = '${a}'`), "aksi tidak dipakai modul: " + a);
  const bridge = baca("public/js/api-bridge.js");
  const iSwr = bridge.indexOf("const SWR_CONFIG");
  assert.ok(iSwr > 0);
  const blokSwr = bridge.slice(iSwr, bridge.indexOf("\n};", iSwr));
  assert.doesNotMatch(blokSwr, /cekAlamat/, "data Cek Alamat tidak boleh di-cache SWR (pribadi dan harus segar)");
  assert.match(bridge, /cekAlamatPerbaiki: \['penerima', 'penerima_detail', 'data_detail', 'riwayat'\]/, "perbaikan alamat membuang cache penerima");
  assert.doesNotMatch(bridge.slice(bridge.indexOf("const MUTATION_INVALIDATIONS")), /cekAlamat(Jawab|Balas|Kembalikan|Selesai|Buka|Lencana|Daftar|Ringkasan|Utas): \[/, "aksi lain tidak menyiarkan invalidasi ke semua klien");
});

test("PEMUAT MALAS: hanya UTAMA dan GURU MAGHRIB MENGAJI yang mengunduh modul; peran lain dan halaman awal tidak", () => {
  const pp = baca("public/js/app-pesan-periode.js");
  const m = /var SKRIP_PER_PERAN = \{([\s\S]*?)\n  \};/.exec(pp);
  assert.ok(m, "SKRIP_PER_PERAN");
  const peta = new Function("return {" + m[1] + "}")();
  const punya = Object.keys(peta).filter((r) => peta[r].includes("/js/app-cek-alamat.js")).sort();
  assert.deepEqual(punya, ["GURU MAGHRIB MENGAJI", "UTAMA"]);
  assert.ok(!("KECAMATAN" in peta) && !peta.MUI.includes("/js/app-cek-alamat.js"));
  const html = baca("index.html");
  assert.ok(!html.includes("app-cek-alamat.js"), "dimuat malas, tidak statis di index.html");
});

test("VERSI: versi skrip yang berubah dinaikkan (cache-busting); skrip peran memakai versi app-pesan-periode.js", () => {
  const html = baca("index.html");
  const v = (nama) => Number((new RegExp(`/js/${nama}\\.js\\?v=(\\d+)`).exec(html) || [])[1]);
  assert.ok(v("app-pesan-periode") >= 20271059, "app-pesan-periode.js");
  assert.ok(v("api-bridge") >= 20271059, "api-bridge.js");
  assert.match(baca("public/js/app-pesan-periode.js"), /document\.currentScript[\s\S]{0,200}\[\?&\]v=/, "VERSI diambil dari ?v= skrip ini");
});

test("MODUL: tautan peta hanya http(s); teks server selalu lewat esc; panel dikosongkan saat ditutup; tanpa eval/document.write", () => {
  const js = baca("public/js/app-cek-alamat.js");
  assert.match(js, /function tautanAman\(u\) \{ return \/\^https\?:\\\/\\\/\/i\.test/);
  assert.match(js, /href="' \+ esc2\(peta\)/);
  assert.match(js, /rel="noopener noreferrer"/);
  assert.doesNotMatch(js, /\beval\(|new Function\(|document\.write\(|\.outerHTML\s*=/);
  const tutup = js.slice(js.indexOf("function tutup() {"), js.indexOf("// Pintu masuk dan pemicu"));
  for (const id of ["cka-daftar", "cka-ringkasan", "cka-buka", "cka-halaman"]) assert.ok(tutup.includes(`'${id}'`), "dikosongkan saat ditutup: " + id);
  assert.match(tutup, /data = null; ringkasan = null; ui = \{\}/);
});

test("MIGRASI: nomor berkas unik dan berurutan setelah migrasi terakhir; tidak ada migrasi lain di commit ini yang menyentuh tabel lama", () => {
  const daftar = fs.readdirSync(new URL("../../supabase/migrations/", import.meta.url)).filter((x) => x.endsWith(".sql")).sort();
  const mine = daftar.filter((x) => x.includes("cek_alamat_tugas"));
  assert.deepEqual(mine, ["20261031100000_cek_alamat_tugas_gmm.sql"]);
  assert.equal(daftar.at(-1), mine[0], "migrasi ini yang terbaru");
  const sql = baca("supabase/migrations/" + mine[0]).toLowerCase();
  assert.doesNotMatch(sql, /\b(alter|drop)\s+table\s+(if exists\s+)?(public\.)?penerima/);
  assert.doesNotMatch(sql, /\bupdate\s+(public\.)?(penerima|data_detail|akun)\b/);
  assert.doesNotMatch(sql, /references\s+(public\.)?penerima/, "tanpa FK ke penerima (pola Retur)");
  assert.ok((sql.match(/enable row level security/g) || []).length === 3, "RLS aktif di 3 tabel");
});

test("MODUL: ESC/aksesibilitas diserahkan ke modal-a11y.js (tanpa role sendiri, tanpa handler ESC ganda); penutupan menjaga isian; gangguan sementara tidak menyembunyikan fitur", () => {
  const js = baca("public/js/app-cek-alamat.js");
  assert.doesNotMatch(js, /setAttribute\('role', 'dialog'\)/, "role dialog dipasang modal-a11y.js; bila dipasang sendiri, ESC diabaikan modal-a11y");
  assert.doesNotMatch(js, /setAttribute\('aria-modal'/, "aria-modal juga dipasang modal-a11y.js");
  assert.doesNotMatch(js, /e\.key === 'Escape'/, "tidak ada handler ESC sendiri (ganda dengan modal-a11y.js)");
  assert.match(js, /\$\('cka-x'\)\.addEventListener\('click', mintaTutup\)/);
  assert.match(js, /\$\('cka-tutup'\)\.addEventListener\('click', mintaTutup\)/);
  assert.match(js, /if \(e\.target === modal\) \{ if \(!adaIsian\(\)\) tutup\(\); return; \}/, "klik di luar tidak menutup bila ada isian");
  const m = /var p = \(res && res\.pesan\) \|\| '';([\s\S]*?)percobaanUlang = 0;/.exec(js);
  assert.ok(m, "cabang kegagalan lencana");
  assert.match(m[1], /Aksi tidak diizinkan\|does not exist\|belum tersedia/, "hanya 'tidak didukung' yang menyembunyikan fitur");
  assert.match(m[1], /percobaanUlang < 3/, "percobaan ulang dibatasi");
  assert.match(m[1], /terapkanLencana\(\)/, "tab tetap dibuat saat gangguan sementara");
  // Header: baris navigasi atas lebarnya tetap 485 px dan sudah penuh untuk Admin Utama (tombol di sana saling menimpa di desktop).
  // Tombol Cek Alamat harus di baris 2 (sebelum tombol Akun) dan hanya ikon, di semua lebar layar.
  assert.match(js, /var acuan = \$\('fab-ganti-password'\)/, "disisipkan di baris 2 header");
  assert.match(js, /insertBefore\(ada, acuan\);/, "sebelum tombol Akun");
  assert.doesNotMatch(js, /\$\('tab-rekap'\)/, "tidak lagi di baris navigasi atas");
  assert.match(js, /relative h-9 w-9 rounded-lg/, "tombol hanya ikon (w-9)");
  assert.doesNotMatch(js, /sm:inline">Cek Alamat</, "tanpa label teks yang melebarkan tombol");
});
