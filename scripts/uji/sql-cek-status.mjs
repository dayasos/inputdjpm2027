// Uji SQL Cek Status di Postgres sungguhan (PGlite, WebAssembly) -- tanpa menyentuh database produksi. Plan bagian 12.1.
// SQL catatGagal/resetPercobaan/fiturAktif diambil LANGSUNG dari domains/cekStatusPublik.ts (bukan salinan).
// Tidak menguji pg_cron (tidak ada di PGlite). MANUAL, bukan bagian dari npm test. Jalankan dari folder proyek:
//   npm install --no-save @electric-sql/pglite@0.3.14
//   node scripts/uji/sql-cek-status.mjs supabase/migrations/20261026100000_cek_status_publik.sql supabase/functions/api/domains/cekStatusPublik.ts
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const mig = fs.readFileSync(process.argv[2], 'utf8').split('-- Pembersihan harian')[0]; // bagian pg_cron tak ada di PGlite
const dom = fs.readFileSync(process.argv[3], 'utf8');
const db = new PGlite();
await db.exec('create role anon; create role authenticated;');
await db.exec(mig);
await db.exec(mig); // idempoten: dijalankan dua kali tanpa galat
let ok = 0, bad = 0;
const cek = (n, c, i = '') => { c ? ok++ : bad++; console.log(`${c ? '  OK  ' : ' GAGAL'} ${n}${c ? '' : ' -> ' + i}`); };

// Ambil SQL catatGagal PERSIS dari kode (bukan salinan), ganti ${...} dengan parameter posisi.
const m = /async catatGagal\(kunci: string\) \{\s*await sql`([\s\S]*?)`;/.exec(dom);
let q = m[1];
const nilai = [];
q = q.replace(/\$\{([^}]+)\}/g, (_, e) => { nilai.push(e.trim()); return `$${nilai.length}`; });
const peta = { kunci: 'nik:uji', JENDELA_DETIK: 900, BATAS_GAGAL: 5, DURASI_KUNCI_DETIK: 900 };
const param = () => nilai.map((e) => peta[e]);
console.log('parameter terdeteksi:', nilai.join(', '));
const gagal = (k = 'nik:uji') => { peta.kunci = k; return db.query(q, param()); };
const baris = async (k = 'nik:uji') => (await db.query('select jumlah_gagal, terkunci_sampai, (terkunci_sampai > now()) as terkunci from public.cek_status_percobaan where kunci=$1', [k])).rows[0];
const terkunciSql = async (k) => (await db.query('select 1 from public.cek_status_percobaan where kunci=$1 and terkunci_sampai > now() limit 1', [k])).rows.length > 0;

cek('saklar bawaan MATI, satu baris', JSON.stringify((await db.query('select aktif from public.cek_status_pengaturan')).rows) === '[{"aktif":false}]');
cek('baris kedua saklar ditolak (id harus true)', await db.query('insert into public.cek_status_pengaturan (id) values (false)').then(() => false, () => true));

for (let i = 1; i <= 4; i++) { await gagal(); const b = await baris(); cek(`gagal ke-${i}: hitungan ${i}, belum terkunci`, b.jumlah_gagal === i && !b.terkunci, JSON.stringify(b)); }
await gagal(); let b = await baris();
cek('gagal ke-5: terkunci', b.jumlah_gagal === 5 && b.terkunci === true, JSON.stringify(b));
cek('kueri terkunci() benar saat terkunci', await terkunciSql('nik:uji'));
const kunciAwal = (await baris()).terkunci_sampai.getTime();
await gagal(); b = await baris();
cek('gagal ke-6: kunci TIDAK diperpanjang', b.terkunci_sampai.getTime() === kunciAwal && b.jumlah_gagal === 6);
const sisa = (kunciAwal - Date.now()) / 1000;
cek('lama kunci ~15 menit', sisa > 880 && sisa <= 900, String(sisa));
cek('NIK lain tidak terpengaruh', !(await terkunciSql('nik:lain')) && (await baris('nik:lain')) === undefined);

await db.query("update public.cek_status_percobaan set jendela_mulai = now() - interval '20 minutes', terkunci_sampai = now() - interval '5 minutes' where kunci='nik:uji'");
cek('kunci kedaluwarsa tidak dianggap terkunci', !(await terkunciSql('nik:uji')));
await gagal(); b = await baris();
cek('jendela lewat: hitungan mulai lagi dari 1, tanpa kunci', b.jumlah_gagal === 1 && b.terkunci_sampai === null, JSON.stringify(b));

// jendela masih berlaku tetapi baru 3 gagal lalu 20 menit berlalu -> tidak terkunci diam-diam
await db.query("delete from public.cek_status_percobaan");
await gagal('nik:b'); await gagal('nik:b'); await gagal('nik:b');
await db.query("update public.cek_status_percobaan set jendela_mulai = now() - interval '16 minutes' where kunci='nik:b'");
await gagal('nik:b'); await gagal('nik:b');
b = await baris('nik:b'); cek('3 gagal + jeda >15 mnt + 2 gagal = hitungan 1 lalu 2, tidak terkunci', b.jumlah_gagal === 2 && !b.terkunci, JSON.stringify(b));

// reset setelah sukses (SQL persis dari kode)
const mr = /async resetPercobaan\(kunci: string\) \{\s*await sql`([\s\S]*?)`;/.exec(dom)[1].replace(/\$\{kunci\}/, '$1');
await db.query(mr, ['nik:b']);
cek('resetPercobaan menghapus baris', (await baris('nik:b')) === undefined);

// fiturAktif() persis dari kode
const mf = /async fiturAktif\(\) \{\s*const rows = await sql`([\s\S]*?)`;/.exec(dom)[1];
let r = (await db.query(mf)).rows; cek('fiturAktif: false saat bawaan', r.length === 1 && r[0].aktif === false);
await db.query("update public.cek_status_pengaturan set aktif = true"); r = (await db.query(mf)).rows; cek('fiturAktif: true setelah dihidupkan', r[0].aktif === true);
await db.query("update public.cek_status_pengaturan set aktif = false"); await db.query("delete from public.cek_status_pengaturan"); r = (await db.query(mf)).rows;
cek('baris saklar hilang -> tidak ada baris (kode menganggap MATI)', r.length === 0);

// hak akses: anon/authenticated tidak punya hak
const hak = (await db.query("select grantee, privilege_type from information_schema.role_table_grants where table_name in ('cek_status_pengaturan','cek_status_percobaan') and grantee in ('anon','authenticated')")).rows;
cek('anon/authenticated tidak punya hak apa pun', hak.length === 0, JSON.stringify(hak));
const rls = (await db.query("select relname, relrowsecurity from pg_class where relname in ('cek_status_pengaturan','cek_status_percobaan')")).rows;
cek('RLS aktif di kedua tabel', rls.length === 2 && rls.every((x) => x.relrowsecurity));
console.log(`\n${ok} lulus, ${bad} gagal`); process.exit(bad ? 1 : 0);
