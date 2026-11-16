/**
 * public/js/app-tab-tugas.js
 * Tab "Verifikasi Awal" dan "Verifikasi Ulang" untuk akun VERIFIKATOR. Rencana: plans/plan-verifikasi-awal-bagi-rata.md.
 * Dimuat malas hanya untuk role VERIFIKATOR (SKRIP_PER_PERAN di app-pesan-periode.js).
 *
 * Cara kerja: tab membuka tabel Lihat Data yang SAMA (kolom, filter, pencarian, halaman, tombol) tetapi hanya memuat data tugas verifikator itu.
 * Pembatasan lewat satu kait di saringDanTampilkanTabel (window.djpmLolosTugas). Verifikasi Awal: tombol Detail membuka Detail biasa lalu verifikator
 * memberi hasil seperti sekarang. Verifikasi Ulang: tombol menjadi "Periksa" dan membuka panel pemeriksaan berkas (app-tugas-ulang.js), karena
 * pemeriksaan ulang wajib mengklik dan mencentang setiap berkas. SERVER yang menegakkan semua aturan (hanya data tugasnya yang bisa diberi hasil);
 * modul ini tidak menyimpan apa pun. Saat pembagian dimatikan Admin, tab Verifikasi Awal tidak tampil.
 */
(function (akar, pabrik) {
  var api = pabrik(akar);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else akar.djpmTabTugas = api;
})(typeof self !== 'undefined' ? self : this, function (akar) {
  'use strict';

  // ------------------------------------------------------------------ bagian murni (diuji di Node)
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return (Number(n) || 0).toLocaleString('id-ID'); }

  /** Tab Verifikasi Awal tampil hanya saat pembagian NYALA dan akun pernah menerima tugas. null = sembunyikan. */
  function teksTabAwal(h) {
    if (!h || h.aktif !== true) return null;
    var sisa = Number(h.sisa) || 0, ditugaskan = Number(h.ditugaskan) || 0;
    if (!sisa && !ditugaskan) return null;
    return 'Verifikasi Awal' + (sisa ? ' · ' + fmt(sisa) : ' ✓');
  }

  /** Tab Verifikasi Ulang tampil bila masih ada tugas atau sudah ada yang diselesaikan. null = sembunyikan. */
  function teksTabUlang(h) {
    if (!h) return null;
    var sisa = Number(h.sisa) || 0, selesai = Number(h.selesai) || 0;
    if (!sisa && !selesai) return null;
    return 'Verifikasi Ulang' + (sisa ? ' · ' + fmt(sisa) : ' ✓');
  }

  /** Penyaring baris Lihat Data: baris[0] = id penerima. Mode kosong = tidak membatasi. */
  function buatPenyaring(mode, ids) {
    if (!mode) return null;
    var s = {};
    (ids || []).forEach(function (i) { s[Number(i)] = true; });
    return function (row) { return !!(row && s[Number(row[0])] === true); };
  }

  /** Teks banner di atas tabel. */
  function teksBanner(mode, jumlah) {
    if (mode === 'awal') return 'Menampilkan ' + fmt(jumlah) + ' data Verifikasi Awal yang ditugaskan kepada Anda. Tekan Detail untuk memberi hasil verifikasi.';
    if (mode === 'ulang') return 'Menampilkan ' + fmt(jumlah) + ' data Verifikasi Ulang yang ditugaskan kepada Anda. Tekan Periksa untuk memeriksa berkasnya.';
    return '';
  }

  var api = { esc: esc, fmt: fmt, teksTabAwal: teksTabAwal, teksTabUlang: teksTabUlang, buatPenyaring: buatPenyaring, teksBanner: teksBanner };
  if (!akar || !akar.document) return api;

  // ------------------------------------------------------------------ tampilan
  var dok = akar.document;
  var ID_AWAL = 'tab-verif-awal', ID_ULANG = 'tab-verif-ulang', ID_BANNER = 'djpm-tab-tugas-banner', ID_STYLE = 'djpm-tab-tugas-style';
  var BATAS_TUNGGU_MS = 40000, SEGARKAN_MS = 15000, SEGARKAN_HITUNG_MS = 120000;
  var st = { mode: '', ids: [], awal: null, ulang: null, waktu: 0, muat: false, tokenData: '', klikSendiri: false, overlayUlangTerbuka: false };

  function pengguna() { return (typeof dataPengguna !== 'undefined') ? dataPengguna : null; }
  function berhak() { var p = pengguna(); return !!(p && p.token && String(p.role || '').trim().toUpperCase() === 'VERIFIKATOR'); }

  function rpc(nama, args) {
    var p = pengguna(); var token = p && p.token;
    return new Promise(function (resolve, reject) {
      if (!token) { reject(new Error('Sesi tidak ditemukan.')); return; }
      var selesai = false;
      var timer = setTimeout(function () { akhir(reject, new Error('Waktu tunggu server habis.')); }, BATAS_TUNGGU_MS);
      function akhir(fn, v) { if (selesai) return; selesai = true; clearTimeout(timer); var k = pengguna(); if (!k || k.token !== token) { reject(new Error('Sesi berganti.')); return; } fn(v); }
      try {
        var r = akar.google.script.run
          .withSuccessHandler(function (res) { akhir(resolve, res); })
          .withFailureHandler(function (e) { akhir(reject, e instanceof Error ? e : new Error(String((e && e.message) || e || 'Gagal.'))); });
        r[nama].apply(r, [token].concat(args || []));
      } catch (e) { akhir(reject, e); }
    });
  }

  function suntikStyle() {
    if (dok.getElementById(ID_STYLE)) return;
    var s = dok.createElement('style'); s.id = ID_STYLE;
    s.textContent = '#' + ID_BANNER + '{margin:0 0 12px;padding:10px 14px;border-radius:10px;background:#eef3fb;color:#17365d;border:1px solid #c9d7ee;font-size:.85rem;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;justify-content:space-between}';
    dok.head.appendChild(s);
  }

  function setAktif(el, aktif) {
    if (!el) return;
    if (typeof akar.setTabAktif === 'function' && typeof akar.setTabTidakAktif === 'function') { if (aktif) akar.setTabAktif(el); else akar.setTabTidakAktif(el); return; }
    el.classList.toggle('bg-white', aktif); el.classList.toggle('text-slate-900', aktif);
  }

  function buatTab(id, ikon) {
    var rekap = dok.getElementById('tab-rekap'); if (!rekap || !rekap.parentNode) return null;
    var b = dok.createElement('button'); b.id = id; b.type = 'button';
    b.className = rekap.className.replace(/\b(bg-white|text-slate-900|shadow-sm|tab-nav-aktif)\b/g, '').replace(/\s+/g, ' ').trim() + ' text-slate-200 hover:text-white hover:bg-slate-700/70';
    b.innerHTML = '<span class="shrink-0" aria-hidden="true">' + ikon + '</span><span></span>';
    b.addEventListener('click', function () { bukaMode(id === ID_AWAL ? 'awal' : 'ulang'); });
    rekap.parentNode.insertBefore(b, rekap.nextSibling);
    return b;
  }

  function selarasTab() {
    var p = pengguna();
    var tAwal = berhak() ? teksTabAwal(st.awal) : null, tUlang = berhak() ? teksTabUlang(st.ulang) : null;
    var elAwal = dok.getElementById(ID_AWAL), elUlang = dok.getElementById(ID_ULANG);
    if (tAwal === null) { if (elAwal && elAwal.parentNode) elAwal.parentNode.removeChild(elAwal); if (st.mode === 'awal') keluarMode(); }
    else { if (!elAwal) elAwal = buatTab(ID_AWAL, '📌'); if (elAwal) { var s1 = elAwal.lastChild; if (s1.textContent !== tAwal) s1.textContent = tAwal; setAktif(elAwal, st.mode === 'awal'); } }
    if (tUlang === null) { if (elUlang && elUlang.parentNode) elUlang.parentNode.removeChild(elUlang); if (st.mode === 'ulang') keluarMode(); }
    else { if (!elUlang) elUlang = buatTab(ID_ULANG, '🔁'); if (elUlang) { var s2 = elUlang.lastChild; if (s2.textContent !== tUlang) s2.textContent = tUlang; setAktif(elUlang, st.mode === 'ulang'); } }
    void p;
  }

  // masterDataLihat adalah `let` global (bukan properti window): dibaca lewat nama. saringDanTampilkanTabel adalah deklarasi fungsi global.
  function tampilUlang() { try { if (typeof saringDanTampilkanTabel === 'function' && typeof masterDataLihat !== 'undefined' && Array.isArray(masterDataLihat) && masterDataLihat.length) saringDanTampilkanTabel(); } catch (_e) { /* abaikan */ } }

  function pasangBanner() {
    var panel = dok.getElementById('panel-rekap'); if (!panel) return;
    suntikStyle();
    var b = dok.getElementById(ID_BANNER);
    if (!st.mode) { if (b && b.parentNode) b.parentNode.removeChild(b); return; }
    if (!b) { b = dok.createElement('div'); b.id = ID_BANNER; b.setAttribute('role', 'status'); panel.insertBefore(b, panel.firstChild); }
    b.innerHTML = '<span>' + esc(teksBanner(st.mode, st.ids.length)) + '</span>';
  }

  function ubahLabelTombol() {
    var tb = dok.getElementById('body-tabel-lihat'); if (!tb) return;
    var label = st.mode === 'ulang' ? 'Periksa' : 'Detail';
    Array.prototype.forEach.call(tb.querySelectorAll('button[onclick*="tampilkanDetailKeModalOnDemand"] span'), function (s) { if (s.textContent !== label) s.textContent = label; });
  }

  /** Muat id tugas sesuai mode dari server. */
  function muatIds(mode) {
    if (st.muat) return new Promise(function (r) { setTimeout(function () { r(muatIds(mode)); }, 300); });
    st.muat = true;
    var aksi = mode === 'awal' ? 'getTugasAwalSaya' : 'getTugasUlangSaya';
    return rpc(aksi, [1]).then(function (res) {
      if (!res || res.sukses !== true) return;
      if (mode === 'awal') { st.awal = { aktif: res.aktif, sisa: res.sisa, ditugaskan: res.ditugaskan }; }
      else { st.ulang = { sisa: res.sisa, selesai: res.selesai }; }
      if (st.mode === mode) {
        // Ulang: SEMUA tugas aktif (res.semua), bukan hanya 50 pertama; cadangan ke daftar bila server lama belum mengirim `semua`
        st.ids = mode === 'awal' ? (res.ids || []) : (Array.isArray(res.semua) ? res.semua : (res.tugas || [])).map(function (t) { return t.penerimaId; });
        akar.djpmLolosTugas = buatPenyaring(mode, st.ids);
        pasangBanner(); tampilUlang();
      }
    }).catch(function () { /* diam: tampilan tetap seperti sebelumnya */ }).then(function () { st.muat = false; st.waktu = Date.now(); selarasTab(); });
  }

  function bukaMode(mode) {
    if (!berhak()) return;
    st.mode = mode; st.ids = [];
    akar.djpmLolosTugas = buatPenyaring(mode, st.ids);   // sementara: tabel kosong sampai id tiba (tidak sempat menampilkan data yang bukan tugasnya)
    st.klikSendiri = true;
    var rekap = dok.getElementById('tab-rekap');
    try { if (rekap) rekap.click(); } finally { st.klikSendiri = false; }
    // tab Lihat Data baru saja diberi gaya aktif oleh aplikasi; tab milik kita yang harus tampak aktif
    setAktif(rekap, false);
    selarasTab(); pasangBanner();
    muatIds(mode);
  }

  function keluarMode() {
    st.mode = ''; st.ids = []; akar.djpmLolosTugas = null;
    pasangBanner(); selarasTab(); ubahLabelTombol(); tampilUlang();
  }

  // Klik tab lain (Input Data, Lihat Data, Tools, ...) keluar dari mode tugas.
  dok.addEventListener('click', function (e) {
    if (!st.mode || st.klikSendiri) return;
    var t = e.target && e.target.closest ? e.target.closest('#nav, nav button, button[id^="tab-"]') : null;
    if (t && t.id && t.id !== ID_AWAL && t.id !== ID_ULANG && /^tab-/.test(t.id)) keluarMode();
  }, true);

  // Detail pada mode Verifikasi Ulang membuka panel pemeriksaan berkas (bukan Detail biasa).
  function pasangPembungkus() {
    if (akar.__djpmTabTugasDibungkus || typeof akar.tampilkanDetailKeModalOnDemand !== 'function') return;
    var asli = akar.tampilkanDetailKeModalOnDemand;
    akar.tampilkanDetailKeModalOnDemand = function (nomorBaris) {
      if (st.mode === 'ulang' && typeof akar.bukaTugasUlangUntukPenerima === 'function') { akar.bukaTugasUlangUntukPenerima(Number(nomorBaris)); return; }
      return asli.apply(this, arguments);
    };
    akar.__djpmTabTugasDibungkus = true;
  }

  function segarkan() {
    if (!berhak()) return;
    var sekarang = Date.now();
    if (st.mode) {
      var overlay = !!dok.getElementById('djpm-tul-overlay');
      var modal = dok.getElementById('modal-detail-penerima');
      var modalTerbuka = !!modal && !modal.classList.contains('hidden');
      var baruTutup = st.overlayUlangTerbuka && !overlay;
      st.overlayUlangTerbuka = overlay;
      if (!overlay && !modalTerbuka && (baruTutup || sekarang - st.waktu >= SEGARKAN_MS) && !dok.hidden) muatIds(st.mode);
    } else if (sekarang - st.waktu >= SEGARKAN_HITUNG_MS && !dok.hidden) {
      muatIds('awal').then(function () { return muatIds('ulang'); });
    }
  }

  var MO = akar.MutationObserver;
  if (MO) {
    var tb = null;
    setInterval(function () {
      var el = dok.getElementById('body-tabel-lihat');
      if (el && el !== tb) { tb = el; new MO(function () { ubahLabelTombol(); }).observe(el, { childList: true }); }
    }, 1000);
  }

  setInterval(function () {
    try {
      if (!berhak()) { ['tab-verif-awal', 'tab-verif-ulang', ID_BANNER].forEach(function (i) { var e = dok.getElementById(i); if (e && e.parentNode) e.parentNode.removeChild(e); }); if (st.mode) keluarMode(); st.awal = st.ulang = null; return; }
      pasangPembungkus(); selarasTab(); segarkan();
    } catch (_e) { /* abaikan */ }
  }, 2000);
  try {
    if (berhak()) { muatIds('awal').then(function () { return muatIds('ulang'); }); }
  } catch (_e) { /* abaikan */ }
  return api;
});
