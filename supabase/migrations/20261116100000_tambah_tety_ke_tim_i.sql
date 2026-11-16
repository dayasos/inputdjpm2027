-- Masukkan verif_tety_agustina (akun baru 2026-11-16) ke Tim I, bukan koordinator.
--
-- Perubahan data satu baris, SUDAH diterapkan ke produksi (salinan agar repo sama dengan database).
-- Akun belum punya hasil kerja; kelak hasilnya masuk hitungan Tim I di panel agregat.
--
-- AMAN & IDEMPOTEN: on conflict do nothing; dijalankan ulang tidak berefek.
-- Membatalkan:  delete from public.tim_verifikator where akun_id = (select id from public.akun where lower(username) = 'verif_tety_agustina');

insert into public.tim_verifikator (akun_id, tim, koordinator)
select id, 'I', false from public.akun where lower(username) = 'verif_tety_agustina' and role = 'VERIFIKATOR'
on conflict (akun_id) do nothing;
