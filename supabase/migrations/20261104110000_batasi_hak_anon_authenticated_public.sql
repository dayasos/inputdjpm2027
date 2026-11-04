-- Batasi hak peran anon/authenticated di schema public (pertahanan berlapis di atas RLS).
-- Latar: setiap tabel baru yang dibuat migrasi (peran postgres) otomatis mendapat hak PENUH untuk anon/authenticated (hak bawaan Supabase).
-- Itu sebabnya log_arsip_data_detail ikut terbuka begitu RLS-nya terlewat (lihat 20261104100000_rls_log_arsip_data_detail.sql).
-- Aplikasi TIDAK memakai REST API Supabase untuk data: fungsi server memakai koneksi database langsung (peran postgres) dan Storage memakai
-- service_role; frontend hanya memakai supabase-js untuk Realtime (postgres_changes pada public.realtime_event_bus).
--
-- Kini: semua tabel dan sequence di public tidak dapat diakses anon/authenticated KECUALI SELECT pada realtime_event_bus (tabel sinyal tanpa data
-- pribadi: id, domain, aksi, entitas_id, created_at; RLS + policy anon_select_realtime_event_bus tetap berlaku). Tabel/sequence BARU tidak lagi
-- otomatis diberi hak itu (hak bawaan peran postgres di schema public dicabut).
--
-- DITERAPKAN ke produksi 2026-11-04 lewat alat migrasi (nama batasi_hak_anon_authenticated_public). Terverifikasi: hanya realtime_event_bus:SELECT
-- yang tersisa; REST publik 401 untuk tabel lain; Realtime tetap menyampaikan sinyal (uji WebSocket sebelum dan sesudah); aplikasi sehat.
-- TIDAK diubah: hak EXECUTE fungsi (PUBLIC masih boleh mengeksekusi fungsi baru secara bawaan). Fungsi SECURITY DEFINER baru WAJIB
--   `revoke execute on function ... from public, anon, authenticated;` secara eksplisit (pola set_master_periode/terapkan_jadwal_periode).
--
-- PEMULIHAN (hanya bila ada komponen yang ternyata membutuhkan hak lama):
--   grant all on all tables in schema public to anon, authenticated;
--   grant all on all sequences in schema public to anon, authenticated;
--   alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
--   alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on table public.realtime_event_bus to anon, authenticated;

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
