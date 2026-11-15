// Pembaca nilai jsonb yang TAHAN terhadap data yang terlanjur tersimpan sebagai TEKS JSON (terenkode ganda).
//
// Latar: paket verifikasi ulang pertama (2026-11-14) tertulis dengan `${JSON.stringify(x)}::jsonb`, sehingga postgres.js menyimpannya sebagai teks JSON,
// bukan objek/larik. Penulisan sudah diperbaiki (trx.json), tetapi baris lama tetap ada; pembaca memakai fungsi ini supaya keduanya terbaca sama.
// MODUL MURNI (tanpa Deno.*, tanpa database).

export function keObjek(v: unknown): unknown {
  let x = v;
  for (let i = 0; i < 3 && typeof x === "string"; i++) {
    try { x = JSON.parse(x); } catch (_e) { break; }
  }
  return x;
}
