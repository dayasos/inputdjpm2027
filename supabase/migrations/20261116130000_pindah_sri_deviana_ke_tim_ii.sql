-- Pindah verif_sri_deviana dari Tim I ke Tim II (2026-11-16).
--
-- Perubahan data satu baris, SUDAH diterapkan ke produksi (salinan agar repo sama dengan database).
-- Hasil kerja lama tidak berubah (riwayat_verifikasi berdasarkan akun, bukan tim); di panel agregat hasilnya kini masuk Tim II.
--
-- AMAN & IDEMPOTEN: hanya menyentuh baris yang masih di Tim I dan bukan koordinator; dijalankan ulang tidak berefek.
-- Membatalkan:  update public.tim_verifikator set tim = 'I' where akun_id = (select id from public.akun where lower(username) = 'verif_sri_deviana');

update public.tim_verifikator t
set tim = 'II'
from public.akun a
where a.id = t.akun_id and lower(a.username) = 'verif_sri_deviana' and a.role = 'VERIFIKATOR'
  and t.tim = 'I' and t.koordinator = false;
