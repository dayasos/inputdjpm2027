/**
 * public/js/app-pengingat-koordinat-gmm.js
 * Pengingat koordinat lokasi untuk petugas Guru Maghrib Mengaji (GMM). Rencana: plans/plan-pengingat-koordinat-gmm.md
 *
 * Latar: koordinat dipakai aplikasi monitoring kegiatan GMM. Koordinat yang salah/perkiraan membuat guru tidak ditemukan saat
 * monitoring dan dapat masuk data monev. Dua pengingat (hanya tampilan; tidak mengubah/menolak data apa pun):
 *   1. Kotak "PENTING: Koordinat Lokasi" di bagian foto plank formulir input (wadah #wrapper-foto-plank, yang memang hanya tampil
 *      untuk layanan GMM).
 *   2. Banner berjalan PERMANEN di bawah header untuk data yang SUDAH diinput (tanpa tombol tutup; muncul lagi tiap muat/login).
 *
 * Dimuat malas oleh app-pesan-periode.js (SKRIP_PER_PERAN) hanya untuk peran GURU MAGHRIB MENGAJI, dan tetap memeriksa peran
 * di dalam skrip. Logout aplikasi TIDAK memuat ulang halaman, jadi elemen yang disuntik dibuang bila peran/sesi berganti.
 * Gaya (termasuk animasi) disuntik skrip ini sendiri, sehingga CSS Tailwind tidak perlu dibangun ulang.
 *
 * Dipakai sebagai window.djpmPengingatKoordinat di browser, dan lewat require() di uji Node (bagian murni: teks + penentuan sasaran).
 */
(function (akar, pabrik) {
  var api = pabrik(akar);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else akar.djpmPengingatKoordinat = api;
})(typeof self !== 'undefined' ? self : this, function (akar) {
  'use strict';

  var PERAN_SASARAN = 'GURU MAGHRIB MENGAJI';
  var JUDUL_FORMULIR = 'PENTING: Koordinat Lokasi.';
  var ISI_FORMULIR = 'Koordinat dipakai Tim Monitoring untuk menemukan lokasi guru. Koordinat yang salah atau hanya perkiraan membuat guru ' +
    'dianggap tidak ditemukan saat monitoring dan dapat berdampak pada pembayaran Dana Jasa yang bersangkutan.';
  var PESAN_BANNER = 'Cek dan Pastikan kembali Koordinat terhadap data yang SUDAH diinput adalah BENAR dan menunjukkan alamat tugas Guru Maghrib Mengaji.';

  var ID_BANNER = 'pk-banner';
  var ID_KOTAK = 'pk-kotak-formulir';
  var ID_GAYA = 'pk-gaya';
  var ID_WADAH_FOTO_PLANK = 'wrapper-foto-plank';
  var KECEPATAN_PX_PER_DETIK = 55;   // kecepatan gerak teks (sedang)
  var DURASI_MIN = 14, DURASI_MAKS = 60;
  var PERIKSA_BERKALA_MS = 2000;

  function rapi(teks) { return String(teks == null ? '' : teks).replace(/\s+/g, ' ').trim().toUpperCase(); }

  /** Peran sasaran: hanya akun GURU MAGHRIB MENGAJI (huruf besar/kecil dan spasi tambahan diabaikan). */
  function peranSasaran(peran) { return rapi(peran) === PERAN_SASARAN; }

  /** Pengingat dipasang hanya untuk sesi yang masuk (ada token) dengan peran sasaran. */
  function perluDipasang(pengguna) {
    return !!pengguna && !!pengguna.token && peranSasaran(pengguna.role);
  }

  var api = {
    PERAN_SASARAN: PERAN_SASARAN,
    JUDUL_FORMULIR: JUDUL_FORMULIR,
    ISI_FORMULIR: ISI_FORMULIR,
    PESAN_BANNER: PESAN_BANNER,
    peranSasaran: peranSasaran,
    perluDipasang: perluDipasang,
    selaraskan: function () { /* diganti di browser */ }
  };

  var dok = akar && akar.document;
  if (!dok || !dok.createElement) return api;     // Node (uji): hanya bagian murni

  // ---------------------------------------------------------------------------------------------
  // Gaya
  // ---------------------------------------------------------------------------------------------
  var CSS =
    // Menempel tepat di bawah header (yang juga menempel, z-50) saat halaman digulir; "top" diisi skrip sesuai tinggi header.
    // z-index 45: di atas konten halaman, di bawah header (50) dan semua jendela/pop-up (>= 100).
    '.pk-banner{display:flex;align-items:center;gap:8px;position:sticky;top:0;z-index:45;background:#fffbeb;border-bottom:1px solid #fcd34d;color:#78350f;' +
    'padding:6px 12px;font-size:12px;line-height:1.4;font-weight:600}' +
    '.pk-banner:focus-visible{outline:2px solid #d97706;outline-offset:-2px}' +
    '.pk-ikon{flex:none;width:18px;height:18px;color:#d97706}' +
    '.pk-jendela{flex:1;min-width:0;overflow:hidden;white-space:nowrap}' +
    '.pk-jalur{display:inline-flex;white-space:nowrap;will-change:transform;animation:pk-geser var(--pk-durasi,22s) linear infinite}' +
    '.pk-teks{display:inline-block;padding-right:56px}' +
    // Satu aturan per pemicu: peramban lama yang tak mengenal salah satu pemilih (mis. :focus-within) tidak boleh membatalkan yang lain.
    '.pk-banner:hover .pk-jalur{animation-play-state:paused}' +
    '.pk-banner:focus-within .pk-jalur{animation-play-state:paused}' +
    '.pk-banner.pk-jeda .pk-jalur{animation-play-state:paused}' +
    // Jalur digeser tepat SATU salinan teks (px, diukur skrip) sehingga pengulangan tak terlihat putus pada lebar layar berapa pun.
    '@keyframes pk-geser{from{transform:translateX(0)}to{transform:translateX(var(--pk-geser,-50%))}}' +
    '@media (prefers-reduced-motion:reduce){' +
    '.pk-jalur{animation:none;display:block;white-space:normal}.pk-jendela{white-space:normal}' +
    '.pk-teks{display:block;padding-right:0}.pk-teks + .pk-teks{display:none}}' +
    '.pk-kotak{margin-bottom:10px;padding:8px 10px;border:1px solid #f59e0b;border-left-width:4px;background:#fef3c7;color:#78350f;' +
    'border-radius:8px;font-size:12px;line-height:1.45}' +
    '.pk-kotak strong{font-weight:800}';

  function pasangGaya() {
    if (dok.getElementById(ID_GAYA)) return;
    var s = dok.createElement('style');
    s.id = ID_GAYA;
    s.appendChild(dok.createTextNode(CSS));
    (dok.head || dok.documentElement).appendChild(s);
  }

  // ---------------------------------------------------------------------------------------------
  // Banner berjalan permanen
  // ---------------------------------------------------------------------------------------------
  var timerLepasSentuh = null;
  var pengamatHeader = null;

  /**
   * Susun jumlah salinan teks dan ukur geseran/durasi. Jalur harus selalu MENUTUPI seluruh lebar jendela di setiap fase gerak:
   * dengan hanya dua salinan, layar yang lebih lebar dari satu salinan (±940 px, yaitu hampir semua laptop/desktop) menampilkan
   * ruang kosong di kanan. Salinan = ceil(lebar jendela / lebar satu salinan) + 1; geseran = tepat satu salinan.
   * Aman dipanggil berulang (hanya membangun ulang bila jumlah salinan berubah).
   */
  function susunSalinan() {
    var b = dok.getElementById(ID_BANNER);
    if (!b) return;
    var jalur = b.querySelector('.pk-jalur'), jendela = b.querySelector('.pk-jendela');
    var pertama = jalur && jalur.querySelector('.pk-teks');
    if (!jalur || !jendela || !pertama) return;
    var lebar = pertama.offsetWidth;                    // satu salinan teks (termasuk jarak)
    var lebarJendela = jendela.clientWidth;
    if (!lebar || !lebarJendela) return;                // belum tampil (mis. tersembunyi): coba lagi nanti
    var perlu = Math.max(2, Math.ceil(lebarJendela / lebar) + 1);
    if (jalur.querySelectorAll('.pk-teks').length !== perlu) {
      while (jalur.children.length > 1) jalur.removeChild(jalur.lastChild);
      for (var i = 1; i < perlu; i++) {
        var salinan = dok.createElement('span');
        salinan.className = 'pk-teks';
        salinan.setAttribute('aria-hidden', 'true');    // hanya salinan pertama yang dibaca pembaca layar
        salinan.textContent = PESAN_BANNER;
        jalur.appendChild(salinan);
      }
    }
    b.style.setProperty('--pk-geser', (-lebar) + 'px');
    var detik = Math.min(DURASI_MAKS, Math.max(DURASI_MIN, Math.round(lebar / KECEPATAN_PX_PER_DETIK)));
    b.style.setProperty('--pk-durasi', detik + 's');
  }

  /**
   * Letakkan banner tepat di bawah header yang menempel. Tinggi header berubah-ubah (layar sempit melipatnya jadi beberapa baris,
   * lencana status muncul/hilang), jadi diukur ulang. Dikurangi 1 px agar tidak ada celah tipis akibat pembulatan: banner (z-45)
   * boleh menyelip di bawah header (z-50) sebanyak 1 px.
   */
  function selarasTinggiHeader() {
    var b = dok.getElementById(ID_BANNER);
    var header = dok.querySelector('header');
    if (!b || !header) return;
    var atas = Math.max(0, Math.ceil(header.getBoundingClientRect().height) - 1);
    if (b.style.top !== atas + 'px') b.style.top = atas + 'px';
  }

  function pasangBanner() {
    if (dok.getElementById(ID_BANNER)) return;
    var header = dok.querySelector('header');
    if (!header || !header.parentNode) return;
    var b = dok.createElement('div');
    b.id = ID_BANNER;
    b.className = 'pk-banner';
    b.setAttribute('role', 'note');
    b.setAttribute('aria-label', 'Pengingat koordinat lokasi Guru Maghrib Mengaji');
    b.setAttribute('tabindex', '0');                    // fokus keyboard menghentikan gerak
    b.innerHTML =
      '<svg class="pk-ikon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>' +
      '<div class="pk-jendela"><div class="pk-jalur"><span class="pk-teks"></span></div></div>';
    b.querySelector('.pk-teks').textContent = PESAN_BANNER;   // salinan tambahan untuk gerak tanpa putus disusun oleh susunSalinan()
    // Layar sentuh: sentuhan menghentikan gerak sebentar (":hover" tidak andal di HP).
    b.addEventListener('touchstart', function () { clearTimeout(timerLepasSentuh); b.classList.add('pk-jeda'); }, { passive: true });
    var lepas = function () { clearTimeout(timerLepasSentuh); timerLepasSentuh = setTimeout(function () { b.classList.remove('pk-jeda'); }, 2500); };
    b.addEventListener('touchend', lepas, { passive: true });
    b.addEventListener('touchcancel', lepas, { passive: true });
    header.parentNode.insertBefore(b, header.nextSibling);
    selarasTinggiHeader();
    susunSalinan();
    // Header berubah tinggi (lencana status, lipatan baris, huruf selesai dimuat): banner mengikuti seketika.
    // Pengamat dibuat SEKALI untuk seumur halaman (banner bisa dipasang ulang berkali-kali saat akun berganti).
    if (!pengamatHeader && typeof akar.ResizeObserver === 'function') {
      // border-box: tinggi header bisa berubah lewat padding/border tanpa mengubah ukuran isinya (bawaan pengamat hanya isi). Peramban yang
      // belum mengenal opsi ini memakai bawaan; selebihnya pemeriksaan berkala 2 detik tetap menyusul.
      try {
        pengamatHeader = new akar.ResizeObserver(selarasTinggiHeader);
        try { pengamatHeader.observe(header, { box: 'border-box' }); } catch (_e2) { pengamatHeader.observe(header); }
      } catch (_e) { pengamatHeader = null; }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Kotak peringatan di formulir (foto plank)
  // ---------------------------------------------------------------------------------------------
  function pasangKotak() {
    if (dok.getElementById(ID_KOTAK)) return;
    var wadah = dok.getElementById(ID_WADAH_FOTO_PLANK);
    if (!wadah) return;
    var k = dok.createElement('div');
    k.id = ID_KOTAK;
    k.className = 'pk-kotak';
    k.setAttribute('role', 'note');
    var judul = dok.createElement('strong');
    judul.textContent = JUDUL_FORMULIR;
    k.appendChild(judul);
    k.appendChild(dok.createTextNode(' ' + ISI_FORMULIR));
    wadah.insertBefore(k, wadah.firstChild);
  }

  function buang(id) {
    var e = dok.getElementById(id);
    if (e && e.parentNode) e.parentNode.removeChild(e);
  }

  function bersihkan() {
    clearTimeout(timerLepasSentuh);
    buang(ID_BANNER);
    buang(ID_KOTAK);
  }

  /** Selaraskan tampilan dengan sesi sekarang: pasang untuk peran GMM, buang untuk selainnya (logout tidak memuat ulang halaman). */
  function selaraskan() {
    var pengguna = (typeof dataPengguna !== 'undefined') ? dataPengguna : null;
    if (perluDipasang(pengguna)) {
      pasangGaya();
      pasangBanner();
      selarasTinggiHeader();
      susunSalinan();       // murah: hanya mengubah isi bila lebar layar berubah (putar layar, zoom, ubah ukuran jendela)
      pasangKotak();
    } else {
      bersihkan();
    }
  }
  api.selaraskan = selaraskan;

  // Setiap kali hak akses diterapkan (login, pulihkan sesi, penyegaran) -> selaraskan.
  if (typeof akar.terapkanHakAkses === 'function' && !akar.terapkanHakAkses.__djpmPengingatKoordinat) {
    var asli = akar.terapkanHakAkses;
    var bungkus = function () {
      var hasil = asli.apply(this, arguments);
      try { selaraskan(); } catch (_e) { /* pengingat bersifat tambahan */ }
      return hasil;
    };
    bungkus.__djpmPengingatKoordinat = true;
    // Salinan penanda dari pembungkus lain (app-pesan-periode.js) dipertahankan.
    for (var nama in asli) { if (Object.prototype.hasOwnProperty.call(asli, nama)) bungkus[nama] = asli[nama]; }
    akar.terapkanHakAkses = bungkus;
  }

  // Pengaman: keluar-masuk akun tanpa muat ulang, atau elemen yang terhapus oleh pengaturan ulang formulir.
  setInterval(function () { try { selaraskan(); } catch (_e) { /* abaikan */ } }, PERIKSA_BERKALA_MS);
  var timerUkur = null;
  akar.addEventListener('resize', function () { selarasTinggiHeader(); clearTimeout(timerUkur); timerUkur = setTimeout(susunSalinan, 250); });
  if (dok.fonts && dok.fonts.ready) dok.fonts.ready.then(function () { selarasTinggiHeader(); susunSalinan(); });

  selaraskan();
  return api;
});
