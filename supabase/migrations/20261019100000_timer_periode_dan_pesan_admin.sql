-- ============================================================================
-- Timer tutup/buka periode input + Pesan Admin Utama (plan: plans/plan-timer-tutup-periode-input.md)
-- ============================================================================
-- Migrasi ADITIF: tiga tabel baru + dua fungsi + satu job pg_cron. Tabel lama tidak diubah
-- strukturnya; satu-satunya objek lama yang disentuh adalah fn_broadcast_realtime_event (ditambah
-- pemetaan dua tabel baru ke domain 'setelan', isi lainnya identik dengan 20260920100100).
--
-- Prinsip: penegakan "periode sudah lewat" dihitung SAAT DIBACA oleh fungsi `api`
-- (now() vs jadwal_periode_input), jadi tidak bergantung pada cron. Job cron di bawah hanya
-- MEWUJUDKAN penutupan: master setelan -> TUTUP/BUKA, riwayat 'SISTEM (TIMER)', auto-cleanup,
-- terbitkan pesan terkait, dan (lewat trigger setelan) sinyal realtime ke semua browser.
--
-- Kembali ke keadaan semula:
--   select cron.unschedule('terapkan-jadwal-periode'); select cron.unschedule('bersihkan-log-jadwal-periode');
--   drop function public.terapkan_jadwal_periode();
--   drop function public.set_master_periode(text, text, text);
--   drop index if exists public.idx_riwayat_setelan_key_waktu;
--   drop table public.upload_berkas_dimulai, public.pesan_admin_dibaca, public.jadwal_periode_input, public.pesan_admin;
--   lalu jalankan ulang isi fn_broadcast_realtime_event dari 20260920100100.
-- ============================================================================

-- ── Pesan Admin Utama (satu baris = satu versi pesan) ──────────────────────
create table if not exists public.pesan_admin (
  id            bigint generated always as identity primary key,
  tahun         int         not null,
  tipe          text        not null check (tipe in ('TUTUP', 'BUKA', 'INFO')),
  judul         text        not null check (char_length(judul) between 3 and 100),
  isi           text        not null check (char_length(isi) between 10 and 1500),
  status        text        not null default 'DRAF'
                check (status in ('DRAF', 'TERJADWAL', 'TERBIT', 'DITARIK', 'DIGANTI')),
  menggantikan  bigint      references public.pesan_admin(id),
  terbit_pada   timestamptz,
  ditarik_pada  timestamptz,
  ditarik_oleh  text,
  dibuat_oleh   text        not null,
  dibuat_pada   timestamptz not null default now(),
  constraint ck_pesan_terbit_berwaktu check (status <> 'TERBIT' or terbit_pada is not null)
);
-- Paling banyak satu pesan TERBIT per tahun.
create unique index if not exists uq_pesan_admin_terbit
  on public.pesan_admin (tahun) where status = 'TERBIT';

-- ── Jadwal otomatis ────────────────────────────────────────────────────────
create table if not exists public.jadwal_periode_input (
  id              bigint generated always as identity primary key,
  tahun           int         not null,
  jenis           text        not null check (jenis in ('BUKA', 'TUTUP')),
  waktu_berlaku   timestamptz not null,
  status          text        not null default 'MENUNGGU'
                  check (status in ('MENUNGGU', 'DIJALANKAN', 'DIBATALKAN')),
  pesan_id        bigint      references public.pesan_admin(id),
  dibuat_oleh     text        not null,
  dibuat_pada     timestamptz not null default now(),
  dijalankan_pada timestamptz,
  dibatalkan_oleh text,
  dibatalkan_pada timestamptz,
  catatan         text        not null default ''
);
-- Paling banyak satu jadwal MENUNGGU per jenis per tahun.
create unique index if not exists uq_jadwal_periode_menunggu
  on public.jadwal_periode_input (tahun, jenis) where status = 'MENUNGGU';
-- Dipakai cron & cek akses: "jadwal menunggu yang sudah jatuh tempo".
create index if not exists idx_jadwal_periode_menunggu_waktu
  on public.jadwal_periode_input (waktu_berlaku) where status = 'MENUNGGU';

-- ── Tanda baca pesan ───────────────────────────────────────────────────────
-- Kunci akun_id (uuid), BUKAN akun.user_id: user_id boleh kosong (default '').
create table if not exists public.pesan_admin_dibaca (
  pesan_id    bigint      not null references public.pesan_admin(id) on delete cascade,
  akun_id     uuid        not null references public.akun(id) on delete cascade,
  username    text        not null,
  dibaca_pada timestamptz not null default now(),
  primary key (pesan_id, akun_id)
);
create index if not exists idx_pesan_admin_dibaca_akun on public.pesan_admin_dibaca (akun_id);

-- ── Penanda "unggah berkas dimulai" (dasar masa tenggang 5 menit setelah jadwal tutup) ──
-- Browser memanggil aksi mulaiUnggahBerkas tepat sebelum mengunggah ke Drive. Unggah berjalan
-- browser -> GAS (tidak lewat server kita), jadi inilah satu-satunya cara server tahu bahwa
-- sebuah kiriman SUDAH berjalan sebelum tenggat. Satu baris per akun (selalu yang terbaru).
-- UNLOGGED seperti sesi_login: data sementara, hilang saat crash = masa tenggang tidak berlaku
-- (gagal ke arah aman: tertutup).
create unlogged table if not exists public.upload_berkas_dimulai (
  akun_id      uuid        primary key references public.akun(id) on delete cascade,
  dimulai_pada timestamptz not null default now()
);

-- Dibaca setiap kali periode tertutup dan ada yang menyimpan/mengedit/mengunggah ("siapa yang terakhir mengubah
-- master?", untuk membedakan penutupan oleh timer vs manual) dan oleh panel status. riwayat_setelan belum punya
-- indeks sama sekali, jadi tanpa ini kueri itu memindai seluruh tabel (tabel ini hanya bertambah).
create index if not exists idx_riwayat_setelan_key_waktu on public.riwayat_setelan (key, waktu desc, id desc);

-- RLS aktif TANPA policy: hanya fungsi server (service role / postgres) yang bisa akses,
-- sama seperti tabel Retur.
alter table public.pesan_admin          enable row level security;
alter table public.jadwal_periode_input enable row level security;
alter table public.pesan_admin_dibaca   enable row level security;
alter table public.upload_berkas_dimulai enable row level security;

-- Pertahanan berlapis: Supabase memberi hak penuh pada tabel/sequence baru untuk anon & authenticated lewat
-- default privileges. RLS tanpa policy sudah menolak semua akses mereka, tetapi hak itu tidak dibutuhkan sama
-- sekali (seluruh akses lewat Edge Function sebagai postgres), jadi cabut.
revoke all on table public.pesan_admin, public.jadwal_periode_input, public.pesan_admin_dibaca, public.upload_berkas_dimulai
  from anon, authenticated;
revoke all on sequence public.pesan_admin_id_seq, public.jadwal_periode_input_id_seq from anon, authenticated;

-- ============================================================================
-- set_master_periode: satu-satunya jalur yang mengubah master INPUT_KECAMATAN_KEMENAG
-- ============================================================================
-- Padanan SQL dari setInputKecKem() (supabase/functions/api/domains/setelan.ts) supaya tombol
-- manual dan timer memakai logika yang sama persis:
--   - nilai lama default 'BUKA' bila key belum ada,
--   - riwayat hanya ditulis bila nilai berubah,
--   - AUTO-CLEANUP sakelar khusus INPUT_USER_* yang nilainya sama dengan master baru.
create or replace function public.set_master_periode(
  p_nilai      text,
  p_username   text,
  p_keterangan text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nilai   text := upper(trim(p_nilai));
  v_lama    text;
  v_cleanup int  := 0;
begin
  if v_nilai not in ('BUKA', 'TUTUP') then
    raise exception 'Nilai harus BUKA atau TUTUP.';
  end if;

  select coalesce(nullif(upper(trim(value)), ''), 'BUKA') into v_lama
  from setelan where key = 'INPUT_KECAMATAN_KEMENAG';
  v_lama := coalesce(v_lama, 'BUKA');

  insert into setelan (key, value) values ('INPUT_KECAMATAN_KEMENAG', v_nilai)
  on conflict (key) do update set value = excluded.value;

  if v_lama <> v_nilai then
    insert into riwayat_setelan (waktu, username, key, nilai_lama, nilai_baru, keterangan)
    values (now(), p_username, 'INPUT_KECAMATAN_KEMENAG', v_lama, v_nilai, coalesce(p_keterangan, ''));

    with dihapus as (
      delete from setelan
      where key like 'INPUT\_USER\_%' and upper(trim(value)) = v_nilai
      returning 1
    )
    select count(*) into v_cleanup from dihapus;

    if v_cleanup > 0 then
      insert into riwayat_setelan (waktu, username, key, nilai_lama, nilai_baru, keterangan)
      values (now(), p_username, 'AUTO_CLEANUP_' || v_nilai,
              v_cleanup || ' sakelar khusus ' || v_nilai, '(dihapus, jadi redundant dgn master)', '');
    end if;
  end if;

  return jsonb_build_object('berubah', v_lama <> v_nilai, 'nilaiLama', v_lama, 'nilaiBaru', v_nilai,
                            'cleanup', v_cleanup);
end;
$$;

-- ============================================================================
-- terapkan_jadwal_periode: dijalankan pg_cron tiap menit, idempoten
-- ============================================================================
create or replace function public.terapkan_jadwal_periode()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  j        record;
  v_jumlah int := 0;
begin
  -- Cegah dua eksekusi bersamaan (cron tumpang tindih / panggilan manual). Kunci dilepas
  -- otomatis di akhir transaksi.
  if not pg_try_advisory_xact_lock(hashtext('terapkan_jadwal_periode')) then
    return 0;
  end if;

  for j in
    select id, tahun, jenis, pesan_id, dibuat_oleh
    from jadwal_periode_input
    where status = 'MENUNGGU' and waktu_berlaku <= now()
    order by waktu_berlaku, id
    for update skip locked
  loop
    perform set_master_periode(j.jenis, 'SISTEM (TIMER)', 'jadwal #' || j.id || ' oleh ' || j.dibuat_oleh);

    if j.pesan_id is not null then
      update pesan_admin set status = 'DIGANTI'
      where tahun = j.tahun and status = 'TERBIT' and id <> j.pesan_id;

      update pesan_admin set status = 'TERBIT', terbit_pada = now()
      where id = j.pesan_id and status in ('TERJADWAL', 'DRAF');
    end if;

    update jadwal_periode_input
    set status = 'DIJALANKAN', dijalankan_pada = now()
    where id = j.id;

    v_jumlah := v_jumlah + 1;
  end loop;

  return v_jumlah;
end;
$$;

revoke execute on function public.set_master_periode(text, text, text) from public, anon, authenticated;
revoke execute on function public.terapkan_jadwal_periode() from public, anon, authenticated;
grant execute on function public.set_master_periode(text, text, text) to postgres, service_role;
grant execute on function public.terapkan_jadwal_periode() to postgres, service_role;

-- ============================================================================
-- Sinyal realtime: jadwal & pesan ikut domain 'setelan'
-- ============================================================================
-- Browser (app-admin.js) sudah menyegarkan status periode & panel sakelar saat domain 'setelan'
-- berubah, jadi cukup petakan dua tabel baru ke domain itu. pesan_admin_dibaca SENGAJA tidak
-- diberi trigger: puluhan klik "Mengerti" tidak perlu jadi puluhan sinyal ke semua klien.
create or replace function public.fn_broadcast_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domain varchar(50);
begin
  if TG_TABLE_NAME in ('penerima_2027', 'penerima', 'penerima_2026') then
    v_domain := 'penerima';
  elsif TG_TABLE_NAME in ('data_detail_2027', 'data_detail') then
    v_domain := 'data_detail';
  elsif TG_TABLE_NAME = 'kuota' or TG_TABLE_NAME = 'kuota_katolik' then
    v_domain := 'kuota';
  elsif TG_TABLE_NAME in ('setelan', 'jadwal_periode_input', 'pesan_admin') then
    v_domain := 'setelan';
  elsif TG_TABLE_NAME = 'akun' then
    v_domain := 'akun';
  else
    v_domain := TG_TABLE_NAME;
  end if;

  insert into public.realtime_event_bus (domain, aksi, entitas_id, created_at)
  values (v_domain, TG_OP, null, now());

  return null; -- diabaikan Postgres utk AFTER STATEMENT trigger
exception when others then
  -- Jangan gagalkan statement utama jika logging sinyal mengalami kendala
  return null;
end;
$$;

revoke execute on function public.fn_broadcast_realtime_event() from public, anon, authenticated;
grant execute on function public.fn_broadcast_realtime_event() to postgres, service_role;

drop trigger if exists trg_event_jadwal_periode_input on public.jadwal_periode_input;
create trigger trg_event_jadwal_periode_input
after insert or update or delete on public.jadwal_periode_input
for each statement execute function public.fn_broadcast_realtime_event();

drop trigger if exists trg_event_pesan_admin on public.pesan_admin;
create trigger trg_event_pesan_admin
after insert or update or delete on public.pesan_admin
for each statement execute function public.fn_broadcast_realtime_event();

-- ============================================================================
-- Job pg_cron: tiap menit. Murni SQL, tanpa pg_net/secret.
-- ============================================================================
do $$
begin
  perform cron.unschedule('terapkan-jadwal-periode');
exception when others then null;
end $$;

select cron.schedule('terapkan-jadwal-periode', '* * * * *', $$select public.terapkan_jadwal_periode()$$);

-- Job per menit menulis satu baris ke cron.job_run_details (±1.440/hari) dan tabel itu TIDAK dibersihkan
-- otomatis. Bersihkan harian, hanya baris milik job ini yang lebih tua dari 3 hari (log job lain tidak disentuh).
do $$
begin
  perform cron.unschedule('bersihkan-log-jadwal-periode');
exception when others then null;
end $$;

select cron.schedule(
  'bersihkan-log-jadwal-periode',
  '17 3 * * *',
  $$delete from cron.job_run_details d using cron.job j
    where d.jobid = j.jobid and j.jobname = 'terapkan-jadwal-periode' and d.end_time < now() - interval '3 days'$$
);
