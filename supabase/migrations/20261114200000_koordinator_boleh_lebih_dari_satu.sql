-- Koordinator tim verifikator boleh LEBIH DARI SATU per tim (2026-11-14).
--
-- Sebelumnya indeks unik tim_verifikator_satu_koordinator membatasi satu koordinator per tim. Kode tidak bergantung pada batasan itu
-- (tentukanCakupan memakai penanda koordinator per akun), jadi cukup indeksnya dilepas.
-- Perubahan data: verif_eva_sefti (Tim III) dijadikan koordinator, mendampingi verif_reynold_sianturi (tetap koordinator).
--
-- AMAN & IDEMPOTEN: drop index if exists; update hanya menyentuh satu baris dan hanya bila akunnya VERIFIKATOR yang sudah punya tim.
-- Berlaku seketika tanpa deploy (cakupan dibaca server dari tabel ini setiap permintaan).
-- Membatalkan:  update public.tim_verifikator set koordinator = false where akun_id = (select id from public.akun where lower(username) = 'verif_eva_sefti');

drop index if exists public.tim_verifikator_satu_koordinator;

update public.tim_verifikator t
set koordinator = true
from public.akun a
where a.id = t.akun_id and lower(a.username) = 'verif_eva_sefti' and a.role = 'VERIFIKATOR' and t.koordinator = false;

