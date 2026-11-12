/**
 * public/js/app-verifikator.js
 * Tampilan khusus akun ber-role VERIFIKATOR (tim verifikator). Rencana: plans/plan-tim-verifikator.md.
 *
 * Dimuat malas HANYA untuk role VERIFIKATOR (SKRIP_PER_PERAN di app-pesan-periode.js); peran lain tidak mengunduhnya.
 * Tugasnya murni tampilan (tanpa permintaan ke server):
 *   - menutup halaman Input (tab dan panelnya) -- verifikator tidak menginput data;
 *   - menjadikan "Lihat Data" tampilan awal;
 *   - menyembunyikan tombol/menu yang bukan untuk verifikator (retur, Data Detail, kuota, alat, kelola).
 * Hak sebenarnya DITEGAKKAN SERVER (gerbang daftar-putih di index.ts + pemeriksaan role per aksi); modul ini hanya merapikan layar.
 *
 * Logout tidak memuat ulang halaman, jadi tampilan disinkronkan lagi setiap hak akses diterapkan dan secara berkala.
 */
(function (akar, pabrik) {
  var api = pabrik(akar);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else akar.djpmVerifikator = api;
})(typeof self !== 'undefined' ? self : this, function (akar) {
  'use strict';

  var PERAN = 'VERIFIKATOR';
  var PERIKSA_BERKALA_MS = 2000;

  // Elemen yang HARUS tersembunyi bagi verifikator (selain yang sudah disembunyikan terapkanHakAkses untuk peran non-UTAMA).
  var ID_SEMBUNYI = [
    'tab-input', 'panel-input',
    'btn-retur-kematian', 'btn-data-detail',
    'btn-progres-kuota', 'btn-kelola-kuota', 'tab-tools', 'tab-kelola-data', 'panel-kelola-data',
    'btn-kelola-user', 'btn-kelola-rumah-ibadah', 'btn-sync-sheet-2026',
    'btn-verifikasi-massal', 'btn-cek-rumah-ibadah', 'btn-salin-wa-kecamatan', 'btn-salin-wa-kemenag'
  ];

  function rapi(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toUpperCase(); }

  /** Sesi yang MASUK dengan role VERIFIKATOR. */
  function perluDipasang(pengguna) {
    return !!pengguna && !!pengguna.token && rapi(pengguna.role) === PERAN;
  }

  var api = { PERAN: PERAN, ID_SEMBUNYI: ID_SEMBUNYI, perluDipasang: perluDipasang, selaraskan: function () { /* diganti di browser */ } };
  if (!akar || !akar.document) return api;   // lingkungan uji Node: hanya bagian murni

  var dok = akar.document;

  function sembunyikan(id) {
    var e = dok.getElementById(id);
    if (!e) return;
    e.classList.add('hidden');
    if ('disabled' in e) e.disabled = true;
    if (e.style) { e.style.pointerEvents = 'none'; e.style.setProperty('display', 'none', 'important'); }   // sebagian tombol (kelas auth-show/flex) tidak hilang hanya dengan 'hidden'
  }

  // Username verifikator TIDAK boleh diubah (dipakai sebagai jejak verifikasi; server juga menolaknya). Kolomnya dikunci supaya tidak dicoba.
  function kunciUsername() {
    var el = dok.getElementById('gp-username');
    if (!el) return;
    if (el.value) el.value = '';
    if (!el.__djpmDikunci) {
      var label = el.parentNode && el.parentNode.querySelector('label');
      el.__djpmDikunci = { placeholder: el.placeholder, bg: el.style.backgroundColor, warna: el.style.color, kursor: el.style.cursor, label: label ? label.textContent : null };
      el.placeholder = 'Username tidak dapat diubah';
      el.style.backgroundColor = '#f1f5f9'; el.style.color = '#94a3b8'; el.style.cursor = 'not-allowed';
      if (label) label.textContent = 'Username (dikunci, dipakai sebagai jejak verifikasi)';
    }
    el.disabled = true; el.readOnly = true;   // ditegaskan ulang setiap pemeriksaan (bila dibuka lewat alat pengembang, dikunci lagi)
  }

  /** Logout tidak memuat ulang halaman: bila akun lain (mis. Admin Utama) masuk sesudah verifikator, kolom dikembalikan seperti semula. */
  function bukaKunciUsername() {
    var el = dok.getElementById('gp-username');
    if (!el || !el.__djpmDikunci) return;
    var a = el.__djpmDikunci;
    el.disabled = false; el.readOnly = false;
    el.placeholder = a.placeholder;
    el.style.backgroundColor = a.bg; el.style.color = a.warna; el.style.cursor = a.kursor;
    var label = el.parentNode && el.parentNode.querySelector('label');
    if (label && a.label !== null) label.textContent = a.label;
    el.__djpmDikunci = null;
  }

  function selaraskan() {
    // dataPengguna adalah variabel `let` global (bukan properti window), jadi dibaca lewat nama, bukan akar.dataPengguna.
    var pengguna = (typeof dataPengguna !== 'undefined') ? dataPengguna : null;
    if (!perluDipasang(pengguna)) { bukaKunciUsername(); return; }
    // terapkanHakAkses membuka tab Input lebih dulu; verifikator dipindah ke "Lihat Data" bila panel Input masih terlihat
    // (DIPERIKSA sebelum panel disembunyikan, supaya perpindahan tab benar-benar terjadi).
    var panelInput = dok.getElementById('panel-input');
    var tabRekap = dok.getElementById('tab-rekap');
    var perluPindah = !!panelInput && !panelInput.classList.contains('hidden') && !!tabRekap;
    if (perluPindah) { try { tabRekap.click(); } catch (_e) { /* abaikan */ } }
    ID_SEMBUNYI.forEach(sembunyikan);
    kunciUsername();
    if (typeof selarasBadge === 'function') selarasBadge();
  }
  api.selaraskan = selaraskan;

  // ── Badge melayang: agregat verifikasi akun yang login (getRingkasanVerifikasiSaya, hanya baca) ──
  var BADGE_ID = 'djpm-badge-verifikasi';
  var SEGARKAN_MS = 20000;
  var terakhirDimuat = 0, sedangMuat = false, ulangSetelahMuat = false, tokenBadge = '', ringkasan = null, terbuka = false, gagalMuat = false;

  function angka(n) { return (Number(n) || 0).toLocaleString('id-ID'); }

  function gambarBadge() {
    var pengguna = (typeof dataPengguna !== 'undefined') ? dataPengguna : null;
    var el = dok.getElementById(BADGE_ID);
    if (!perluDipasang(pengguna)) { if (el && el.parentNode) el.parentNode.removeChild(el); ringkasan = null; tokenBadge = ''; gagalMuat = false; terakhirDimuat = 0; terbuka = false; return; }
    if (!el) {
      el = dok.createElement('div');
      el.id = BADGE_ID;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:60;background:#0f172a;color:#f8fafc;border:1px solid #334155;' +
        'border-radius:14px;padding:8px 12px;font:600 13px/1.35 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);cursor:pointer;' +
        'max-width:calc(100vw - 32px);user-select:none';
      el.addEventListener('click', function (e) {
        var tautan = e.target && e.target.closest ? e.target.closest('[data-agr]') : null;
        if (tautan) {   // "Lihat hasil kerja": buka panel agregat (app-agregat-verifikasi.js, dimuat bersama modul ini)
          e.preventDefault(); e.stopPropagation();
          if (typeof akar.bukaAgregatVerifikasi === 'function') akar.bukaAgregatVerifikasi(el);
          else if (typeof tampilkanToast === 'function') tampilkanToast('Fitur belum siap dimuat. Muat ulang halaman lalu coba lagi.', 'gagal');
          return;
        }
        if (!ringkasan) { muatBadge(true); return; }
        terbuka = !terbuka; gambarBadge();
      });
      dok.body.appendChild(el);
    }
    var nama = String(pengguna.username || '').toUpperCase();
    if (!ringkasan) {
      var pesan = gagalMuat ? 'Verifikasi saya: gagal dimuat · ketuk untuk ulang' : 'Verifikasi saya: memuat…';
      if (el.__isi !== '#' + pesan) { el.textContent = pesan; el.__isi = '#' + pesan; }
      return;
    }
    var kepala = '<div>✔ Verifikasi saya: <b>' + angka(ringkasan.total) + '</b> · Hari ini: <b>' + angka(ringkasan.hariIni) + '</b></div>' +
      '<div style="margin-top:2px;font-weight:500"><a href="#" data-agr="1" style="color:#8fd3ff;text-decoration:underline">Lihat hasil kerja \u2192</a></div>';
    var rinci = terbuka
      ? '<div style="margin-top:6px;font-weight:500;color:#cbd5e1">' +
        '<div>Memenuhi Syarat: ' + angka(ringkasan.memenuhiSyarat) + '</div>' +
        '<div>Berkas Tidak Lengkap: ' + angka(ringkasan.berkasTidakLengkap) + '</div>' +
        '<div>Tidak Memenuhi Syarat: ' + angka(ringkasan.tidakMemenuhiSyarat) + '</div>' +
        '<div style="margin-top:4px;font-size:11px;color:#94a3b8">Akun: ' + nama.replace(/[<>&"']/g, '') + ' · ketuk untuk menutup</div></div>'
      : '';
    var isi = kepala + rinci;
    if (el.__isi !== isi) { el.innerHTML = isi; el.__isi = isi; }
  }

  function muatBadge(paksa) {
    var pengguna = (typeof dataPengguna !== 'undefined') ? dataPengguna : null;
    if (!perluDipasang(pengguna)) return;
    if (sedangMuat) { if (paksa) ulangSetelahMuat = true; return; }   // permintaan berjalan: muat ulang sesudahnya (angka bisa sudah usang)
    if (!paksa && Date.now() - terakhirDimuat < SEGARKAN_MS) return;
    if (!paksa && dok.hidden) return;   // tab tidak terlihat: jangan membebani server
    if (typeof google === 'undefined' || !google.script || !google.script.run) return;
    var token = pengguna.token;
    sedangMuat = true;
    var selesai = false;
    var timer = setTimeout(function () { akhir(false); }, 30000);   // jaga-jaga bila jawaban tak pernah datang
    function akhir(ok) {
      if (selesai) return;
      selesai = true; clearTimeout(timer);
      sedangMuat = false; terakhirDimuat = Date.now();
      if (!ok) { gagalMuat = true; gambarBadge(); }
      if (ulangSetelahMuat) { ulangSetelahMuat = false; setTimeout(function () { muatBadge(true); }, 300); }
    }
    try {
      google.script.run
        .withSuccessHandler(function (res) {
          var kini = (typeof dataPengguna !== 'undefined') ? dataPengguna : null;
          if (!perluDipasang(kini) || kini.token !== token) { akhir(true); return; }   // sesi berganti selama menunggu: buang jawaban
          if (res && res.sukses === true) { ringkasan = res; tokenBadge = token; gagalMuat = false; gambarBadge(); akhir(true); }
          else akhir(false);
        })
        .withFailureHandler(function () { akhir(false); })
        .getRingkasanVerifikasiSaya(token);
    } catch (_e) { akhir(false); }
  }

  function selarasBadge() {
    var pengguna = (typeof dataPengguna !== 'undefined') ? dataPengguna : null;
    if (perluDipasang(pengguna) && tokenBadge && tokenBadge !== pengguna.token) { ringkasan = null; tokenBadge = ''; gagalMuat = false; terakhirDimuat = 0; }   // akun lain masuk
    gambarBadge();
    muatBadge(false);
  }
  api.selarasBadge = selarasBadge;
  var timerKlik = null;
  dok.addEventListener('click', function (e) {
    var t = e && e.target && e.target.closest ? e.target.closest('button[id^="btn-tandai-"]') : null;
    if (!t) return;
    clearTimeout(timerKlik);
    timerKlik = setTimeout(function () { try { muatBadge(true); } catch (_e) { /* abaikan */ } }, 2000);
  }, true);
  api.muatBadge = muatBadge;
  api.angka = angka;

  // Setiap kali hak akses diterapkan (login, pulihkan sesi, penyegaran) -> selaraskan.
  if (typeof akar.terapkanHakAkses === 'function' && !akar.terapkanHakAkses.__djpmVerifikator) {
    var asli = akar.terapkanHakAkses;
    var bungkus = function () {
      var hasil = asli.apply(this, arguments);
      try { selaraskan(); } catch (_e) { /* tampilan tambahan */ }
      return hasil;
    };
    bungkus.__djpmVerifikator = true;
    // Salinan penanda dari pembungkus lain dipertahankan.
    for (var nama in asli) { if (Object.prototype.hasOwnProperty.call(asli, nama)) bungkus[nama] = asli[nama]; }
    akar.terapkanHakAkses = bungkus;
  }

  setInterval(function () { try { selaraskan(); } catch (_e) { /* abaikan */ } }, PERIKSA_BERKALA_MS);
  selaraskan();
  return api;
});
