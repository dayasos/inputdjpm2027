// Uji SQL Cek Status di Postgres sungguhan (PGlite, WebAssembly) -- tanpa menyentuh database produksi. Plan bagian 12.1.
// SQL ambilJatah/resetPercobaan/fiturAktif diambil LANGSUNG dari domains/cekStatusPublik.ts (bukan salinan).
// Tidak menguji pg_cron (tidak ada di PGlite) dan tidak menguji kunci baris antar-koneksi (PGlite satu koneksi);
// atomisitas bertumpu pada SATU pernyataan INSERT ... ON CONFLICT DO UPDATE ... RETURNING (dijamin Postgres).
// MANUAL, bukan bagian dari npm test. Jalankan dari folder proyek:
//   npm install --no-save @electric-sql/pglite@0.3.14
//   node scripts/uji/sql-cek-status.mjs supabase/migrations/20261026100000_cek_status_publik.sql supabase/functions/api/domains/cekStatusPublik.ts
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const penuh = fs.readFileSync(process.argv[2], 'utf8');
const PENANDA = 'select\n  cron.schedule(';
const norm = penuh.replace(/\r\n/g, '\n');
if (!norm.includes(PENANDA)) throw new Error('penanda blok pg_cron tidak ditemukan di migrasi -- perbarui PENANDA di skrip ini');
const mig = norm.split(PENANDA)[0]; // bagian pg_cron tak ada di PGlite
const dom = fs.readFileSync(process.argv[3], 'utf8').replace(/\r\n/g, '\n');

const db = new PGlite();
await db.exec('create role anon; create role authenticated;');
await db.exec(mig);
await db.exec(mig); // idempoten: dijalankan dua kali tanpa galat
let ok = 0, bad = 0;
const cek = (n, c, i = '') => { c ? ok++ : bad++; console.log(`${c ? '  OK  ' : ' GAGAL'} ${n}${c ? '' : ' -> ' + i}`); };

const ambilSql = (nama) => {
  const m = new RegExp(`async ${nama}\\([^)]*\\) \\{\\s*(?:const rows = )?await sql\`([\\s\\S]*?)\`;`).exec(dom);
  if (!m) throw new Error(`SQL ${nama} tidak ditemukan di kode`);
  return m[1];
};
const bangun = (sqlTeks, peta) => {
  const nilai = [];
  const q = sqlTeks.replace(/\$\{([^}]+)\}/g, (_, e) => { nilai.push(e.trim()); return `$${nilai.length}`; });
  return (ubah = {}) => ({ q, param: nilai.map((e) => ({ ...peta, ...ubah })[e]) });
};
const BATAS = Number(/BATAS_GAGAL = (\d+)/.exec(fs.readFileSync(process.argv[3].replace('domains/cekStatusPublik.ts', '_shared/cekStatusInti.ts'), 'utf8'))[1]);

const jatahSql = bangun(ambilSql('ambilJatah'), { JENDELA_DETIK: 900 });
// Meniru kode: boleh = jumlah_gagal <= BATAS_GAGAL.
const jatah = async (k = 'nik:uji') => {
  const { q, param } = jatahSql();
  param[0] = k;
  const r = (await db.query(q, param)).rows;
  return r.length > 0 && Number(r[0].jumlah_gagal) <= BATAS;
};
const baris = async (k = 'nik:uji') => (await db.query('select jumlah_gagal, jendela_mulai, terkunci_sampai from public.cek_status_percobaan where kunci=$1', [k])).rows[0];

cek('saklar bawaan MATI, satu baris', JSON.stringify((await db.query('select aktif from public.cek_status_pengaturan')).rows) === '[{"aktif":false}]');
cek('baris kedua saklar ditolak (id harus true)', await db.query('insert into public.cek_status_pengaturan (id) values (false)').then(() => false, () => true));

cek('BATAS_GAGAL terbaca dari kode = 5', BATAS === 5, String(BATAS));
for (let i = 1; i <= BATAS; i++) cek(`percobaan ke-${i}: diizinkan, hitungan ${i}`, (await jatah()) === true && (await baris()).jumlah_gagal === i);
cek('percobaan ke-6: DITOLAK', (await jatah()) === false);
cek('percobaan ke-7: DITOLAK', (await jatah()) === false);
const awal = (await baris()).jendela_mulai.getTime();
cek('jendela TIDAK bergeser saat ditolak (kunci tak bisa diperpanjang terus)', (await baris()).jendela_mulai.getTime() === awal);
cek('kolom terkunci_sampai tidak dipakai (NULL)', (await baris()).terkunci_sampai === null);
cek('NIK lain tidak terpengaruh', (await baris('nik:lain')) === undefined && (await jatah('nik:lain')) === true);

await db.query("update public.cek_status_percobaan set jendela_mulai = now() - interval '16 minutes' where kunci='nik:uji'");
cek('jendela lewat 15 menit: percobaan diizinkan lagi, hitungan mulai dari 1', (await jatah()) === true && (await baris()).jumlah_gagal === 1);
await db.query("update public.cek_status_percobaan set jendela_mulai = now() - interval '14 minutes' where kunci='nik:uji'");
for (let i = 0; i < 3; i++) await jatah(); // 2,3,4 ... masih dalam jendela
cek('jendela belum lewat (14 mnt): hitungan lanjut, bukan mulai ulang', (await baris()).jumlah_gagal === 4);

await db.query("update public.cek_status_percobaan set jumlah_gagal = 999 where kunci='nik:uji'");
await jatah(); await jatah(); await jatah();
cek('hitungan dibatasi (least 1000), tidak tumbuh tanpa batas saat diserang', (await baris()).jumlah_gagal === 1000);

// reset setelah sukses (SQL persis dari kode)
const rs = bangun(ambilSql('resetPercobaan'), {})();
await db.query(rs.q, ['nik:uji']);
cek('resetPercobaan menghapus baris; percobaan berikutnya diizinkan', (await baris()) === undefined && (await jatah()) === true);

// fiturAktif() persis dari kode
const mf = ambilSql('fiturAktif');
let r = (await db.query(mf)).rows; cek('fiturAktif: false saat bawaan', r.length === 1 && r[0].aktif === false);
await db.query('update public.cek_status_pengaturan set aktif = true'); r = (await db.query(mf)).rows; cek('fiturAktif: true setelah dihidupkan', r[0].aktif === true);
await db.query('update public.cek_status_pengaturan set aktif = false'); await db.query('delete from public.cek_status_pengaturan'); r = (await db.query(mf)).rows;
cek('baris saklar hilang -> tidak ada baris (kode menganggap MATI)', r.length === 0);

// hak akses: anon/authenticated tidak punya hak
const hak = (await db.query("select grantee, privilege_type from information_schema.role_table_grants where table_name in ('cek_status_pengaturan','cek_status_percobaan') and grantee in ('anon','authenticated')")).rows;
cek('anon/authenticated tidak punya hak apa pun', hak.length === 0, JSON.stringify(hak));
const rls = (await db.query("select relname, relrowsecurity from pg_class where relname in ('cek_status_pengaturan','cek_status_percobaan')")).rows;
cek('RLS aktif di kedua tabel', rls.length === 2 && rls.every((x) => x.relrowsecurity));
console.log(`\n${ok} lulus, ${bad} gagal`); process.exit(bad ? 1 : 0);
