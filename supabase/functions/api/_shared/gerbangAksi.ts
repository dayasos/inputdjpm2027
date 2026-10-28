// Aksi yang HANYA boleh masuk lewat jalur _secret (Worker Cloudflare / cron internal), TIDAK lewat X-Session-Token dan
// tidak sebagai aksi publik. Alasan: token sesi petugas/MUI valid untuk semua aksi lain, sehingga tanpa aturan ini
// pemegang akun mana pun bisa memanggil Edge Function langsung dan melewati Turnstile di Worker (dan aturan
// Rate Limiting Cloudflare untuk /api/cek-status, yang dikonfigurasi di dashboard, bukan di kode).
// Plan: plans/plan-cek-status-penerima-publik.md. Dipisah dari index.ts agar bisa diuji di Node (index.ts memanggil Deno.serve).
export const AKSI_HANYA_JALUR_SECRET: ReadonlySet<string> = new Set(["cekStatusPublik"]);

/** true bila permintaan HARUS ditolak karena aksinya khusus jalur _secret tetapi _secret tidak sah. */
export function ditolakTanpaSecret(action: string, isValidSecret: boolean): boolean {
  return AKSI_HANYA_JALUR_SECRET.has(action) && !isValidSecret;
}
