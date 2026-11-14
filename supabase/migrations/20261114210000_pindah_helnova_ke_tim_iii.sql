-- Pindah verif_helnova_parhusip dari Tim II ke Tim III (2026-11-14).
--
-- Perubahan data satu baris, SUDAH diterapkan ke produksi (salinan agar repo sama dengan database).
-- Hasil kerja lama tidak berubah (riwayat_verifikasi berdasarkan akun, bukan tim); di panel agregat hasilnya kini masuk Tim III.
--
-- AMAN & IDEMPOTEN: hanya menyentuh baris yang masih di Tim II dan bukan koordinator; dijalankan ulang tidak berefek.
-- Membatalkan:  update public.tim_verifikator set tim = 'II' where akun_id = (select id from public.akun where lower(username) = 'verif_helnova_parhusip');

update public.tim_verifikator t
set tim = 'III'
from public.akun a
where a.id = t.akun_id and lower(a.username) = 'verif_helnova_parhusip' and a.role = 'VERIFIKATOR'
  and t.tim = 'II' and t.koordinator = false;
