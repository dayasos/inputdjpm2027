-- Amankan log_arsip_data_detail (88 baris berisi NIK + nama): RLS MATI dan hak penuh untuk anon/authenticated sehingga terbaca
-- lewat REST API publik dengan kunci anon (terbukti 2026-11-04: HEAD /rest/v1/log_arsip_data_detail -> 206 Content-Range 0-0/88).
-- Kini: RLS aktif tanpa policy (tolak semua, sama seperti 42 tabel lain) + hak anon/authenticated dicabut.
-- Tidak mengganggu aplikasi: satu-satunya penulis adalah Edge Function (dataDetail.ts, koneksi langsung sebagai pemilik DB).
-- Sudah DITERAPKAN ke produksi 2026-11-04 lewat alat migrasi (tercatat dengan nama rls_log_arsip_data_detail); berkas ini = salinan untuk repo.
-- Pemulihan (tidak disarankan): alter table public.log_arsip_data_detail disable row level security; lalu grant ... to anon, authenticated;

alter table public.log_arsip_data_detail enable row level security;

revoke all on table public.log_arsip_data_detail from anon, authenticated;

do $$
begin
  if to_regclass('public.log_arsip_data_detail_id_seq') is not null then
    execute 'revoke all on sequence public.log_arsip_data_detail_id_seq from anon, authenticated';
  end if;
end $$;
