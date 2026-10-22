/**
 * public/js/app-wajib-lapor.js
 * Wajib "Laporkan Sudah Diperbaiki" sebelum menutup Detail data berstatus Berkas Tidak Lengkap.
 * Rancangan: plans/plan-wajib-lapor-perbaikan-berkas.md (K1-K9 disetujui 2026-10-22).
 *
 * Latar belakang: user (Kecamatan / Kemenag / MUI-pemilik-data) bisa mengganti berkas lewat Edit Data lalu menutup Detail tanpa
 * menekan "Laporkan Sudah Diperbaiki", sehingga Admin Utama tidak tahu berkasnya sudah diperbaiki.
 *
 * Isi:
 *  - GERBANG: selama "perlu lapor" aktif, tombol x, "Tutup Detail" dan Esc tidak menutup Detail (hanya toast + sorotan pada tombol
 *    laporan), plus peringatan browser saat menutup tab/refresh (upaya terbaik);
 *  - kotak peringatan di Detail (user) dan kotak informasi + petunjuk "Kembalikan ke Berkas Tidak Lengkap" (Admin Utama);
 *  - lencana "Berkas diubah . belum dilaporkan" di baris Lihat Data (semua peran; hanya muncul bila server menandainya).
 *
 * Sumber kebenaran ada di SERVER: baris daftar indeks 25 dan detail [53] = boolean "perlu lapor", [52] = waktu berkas diganti
 * (penerima.tanggal_berkas_diubah, diisi editDataPenerima). Gerbang tetap aktif walau Detail dibuka ulang/halaman dimuat ulang. Jika user
 * memaksa keluar (tutup tab), Admin Utama tetap melihat lencana. Fungsi di sini hanya MENAMPILKAN/MENCEGAH di layar, bukan sumber data.
 * Tanpa polling dan tanpa panggilan jaringan sendiri. Teks dari server selalu lewat esc().
 *
 * Kait di app-transaksi.js (semuanya mengubah baris yang sudah ada, tanpa menambah baris): window.djpmWajibLapor.htmlDetail(d) di
 * renderBaca, window.badgePerluLapor(row) di sel status tabel, dan indeks 25 pada filter "Perlu Dilaporkan".
 */
(function () {
  'use strict';

  var ID_MODAL = 'modal-detail-penerima';
  var ID_X = 'tutup-modal-detail';
  var ID_TUTUP = 'btn-tutup-detail';
  var ID_LAPOR = 'btn-lapor-perbaikan';
  var PESAN_TOLAK = "Tekan 'Laporkan Sudah Diperbaiki' dulu sebelum menutup Detail.";

  var BATAS_MUAT_ULANG_MS = 10000;   // gerbang yang dipasang lebih awal dilepas bila Detail tak kunjung dirender (mis. pemuatan ulang gagal)
  // Kegagalan laporan yang PASTI (tidak akan berhasil bila diulang): status data sudah diubah admin, tidak berhak, data tak ada. Galat
  // sementara (jaringan/server) sengaja TIDAK termasuk: gerbang tetap, user bisa mengulang.
  var GAGAL_PASTI = /bukan berstatus|tidak berhak|hanya dapat melapor|tidak ditemukan|tidak valid/i;

  var aktif = false;        // gerbang aktif untuk Detail yang sedang terbuka
  var butuhSorot = false;   // gerbang dipasang lebih awal (setelahSimpanBerkas): sorot tombol laporan saat Detail selesai dirender
  var timerRender = null;   // pengaman gerbang yang dipasang lebih awal

  function $(id) { return document.getElementById(id); }
  function esc2(v) {
    if (typeof window.esc === 'function') return window.esc(v);
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function peran() {
    return (typeof dataPengguna !== 'undefined' && dataPengguna) ? String(dataPengguna.role || '').trim().toUpperCase() : '';
  }
  /** Pengguna yang boleh/ harus melapor: Kecamatan & Kemenag, atau MUI untuk data yang DIA input (d[51] dari server). Bukan Admin Utama. */
  function penggunaWajib(d) {
    if (peran() === 'UTAMA') return false;
    if (peran() === 'MUI') return d[51] === true;
    return typeof isRoleKecKem_ === 'function' && isRoleKecKem_(dataPengguna.role);
  }
  function perluLapor(d) {
    return !!d && (d[32] || '') === 'Berkas Tidak Lengkap' && d[53] === true;
  }
  /** Gerbang hanya untuk Detail yang TERLIHAT: respons/penyimpanan yang selesai SESUDAH user menutup Detail tidak boleh memasangnya. */
  function modalTerlihat() {
    var m = $(ID_MODAL);
    return !!m && !m.classList.contains('hidden');
  }

  // ---------------------------------------------------------------------------------------------
  // Tampilan gerbang
  // ---------------------------------------------------------------------------------------------
  function tombolTutup() {
    return [$(ID_X), $(ID_TUTUP)].filter(Boolean);
  }
  function terapkanTampilan() {
    tombolTutup().forEach(function (b) {
      b.classList.toggle('opacity-40', aktif);
      b.classList.toggle('cursor-not-allowed', aktif);
      if (aktif) { b.setAttribute('aria-disabled', 'true'); b.title = PESAN_TOLAK; }
      else { b.removeAttribute('aria-disabled'); if (b.title === PESAN_TOLAK) b.removeAttribute('title'); }
    });
  }
  /** Sorot tombol laporan dan gulirkan ke tampilan (dipanggil saat gerbang baru aktif atau saat user mencoba menutup). */
  function sorot() {
    var b = $(ID_LAPOR);
    if (!b) return;
    b.classList.add('ring-2', 'ring-offset-2', 'ring-amber-400');
    try { b.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_e) { /* peramban lama */ }
  }
  function hentikanTimer() {
    if (timerRender) { clearTimeout(timerRender); timerRender = null; }
  }
  function setAktif(nilai) {
    aktif = nilai;
    if (!nilai) { butuhSorot = false; hentikanTimer(); }
    terapkanTampilan();
  }
  /**
   * PRINSIP FAIL-OPEN: gerbang hanya boleh aktif selama user MEMILIKI jalan keluar (tombol "Laporkan Sudah Diperbaiki" ada di layar).
   * Tanpa tombol itu (render gagal, kasus tak terduga) user bisa terkunci -> gerbang dilepas. Server tetap menandai data itu, jadi
   * Admin Utama tidak kehilangan informasi.
   */
  function pastikanJalanKeluar(alasan) {
    if (!aktif || $(ID_LAPOR)) return;
    setAktif(false);
    try { console.warn('[wajib-lapor] gerbang dilepas (tanpa tombol laporan di layar):', alasan); } catch (_e) { /* abaikan */ }
  }

  // ---------------------------------------------------------------------------------------------
  // Dipanggil app-transaksi.js
  // ---------------------------------------------------------------------------------------------
  window.djpmWajibLapor = {
    /**
     * Dipanggil segera setelah "Simpan Perubahan" berhasil mengganti berkas (res.berkasDiubah > 0). Memasang gerbang tanpa menunggu Detail
     * dimuat ulang dari server (±1-2 dtk), supaya user tidak sempat menutup Detail pada jeda itu. Render berikutnya memastikan keadaan
     * sebenarnya dari server: bila ternyata tidak perlu lapor (mis. status diubah admin), gerbang dilepas.
     */
    setelahSimpanBerkas: function (d, res) {
      try {
        if (d && res && res.berkasDiubah > 0 && (d[32] || '') === 'Berkas Tidak Lengkap' && penggunaWajib(d) && modalTerlihat()) {
          butuhSorot = true;
          setAktif(true);
          hentikanTimer();
          timerRender = setTimeout(function () { timerRender = null; pastikanJalanKeluar('Detail tidak dimuat ulang'); }, BATAS_MUAT_ULANG_MS);
        }
      } catch (_e) { /* abaikan: server tetap menandai */ }
    },
    /**
     * Laporan DITOLAK server (res = hasil laporkanPerbaikanBerkas). Bila penolakannya pasti (mis. admin sudah mengubah status data), gerbang
     * dilepas agar user tidak terkunci oleh sesuatu yang tidak akan pernah berhasil. Galat sementara: gerbang tetap, user mengulang.
     */
    laporGagal: function (res) {
      try {
        if (aktif && res && GAGAL_PASTI.test(String(res.pesan || ''))) {
          setAktif(false);
          if (typeof tampilkanToast === 'function') tampilkanToast('Status data sudah berubah. Detail boleh ditutup; buka kembali untuk melihat keadaan terbaru.', 'info', { durasi: 6000 });
        }
      } catch (_e) { /* abaikan */ }
    },
    /** HTML tambahan untuk Detail (d = dataLengkap dari server) + menetapkan keadaan gerbang. */
    htmlDetail: function (d) {
      try {
        hentikanTimer();   // Detail dirender: pengaman gerbang-awal tidak diperlukan lagi
        if (!d) { setAktif(false); return ''; }
        var waktu = String(d[52] || '').trim();
        if (peran() === 'UTAMA') {
          setAktif(false);
          if ((d[32] || '') !== 'Berkas Tidak Lengkap') return '';
          var h = '';
          if (d[53] === true) {
            h += '<div class="mb-4 bg-amber-50 border border-amber-300 rounded-lg px-4 py-2.5 text-xs text-amber-900">' +
              'Pengguna <strong>mengganti berkas</strong>' + (waktu ? ' pada ' + esc2(waktu) : '') + ' tetapi <strong>belum menekan</strong> ' +
              '&quot;Laporkan Sudah Diperbaiki&quot;. Periksa berkasnya.</div>';
          }
          if (d[53] === true || d[38]) {
            h += '<div class="mb-4 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-xs text-slate-700">' +
              'Perbaikan belum benar? Isi <strong>keterangan</strong> dan <strong>batas waktu baru</strong> di bawah, lalu klik ' +
              '&quot;Kembalikan ke Berkas Tidak Lengkap&quot;. Tanda laporan lama dihapus sehingga pengguna bisa melapor ulang.</div>';
          }
          return h;
        }
        var perlu = penggunaWajib(d) && perluLapor(d);
        // Render yang terlambat ke Detail yang SUDAH ditutup user tidak boleh memasang gerbang (peringatan "tinggalkan halaman?" tanpa Detail).
        var gerbang = perlu && modalTerlihat();
        // Sorot tombol laporan saat gerbang BARU aktif (atau sudah dipasang lebih awal oleh setelahSimpanBerkas). DOM isi Detail baru
        // diganti SETELAH fungsi ini mengembalikan HTML, jadi sorotan dijalankan di giliran berikutnya.
        var sorotkan = gerbang && (!aktif || butuhSorot);
        setAktif(gerbang);
        // Setelah isi Detail diganti (giliran berikutnya): sorot, lalu pastikan tombol laporan benar-benar ada (fail-open).
        if (gerbang) setTimeout(function () { if (sorotkan) sorot(); pastikanJalanKeluar('render selesai'); }, 0);
        if (!perlu) return '';
        return '<div id="kotak-wajib-lapor" role="alert" class="mb-4 bg-amber-50 border-2 border-amber-400 rounded-lg px-4 py-3">' +
          '<p class="text-xs font-bold text-amber-900 mb-1">Laporkan perbaikan berkas dulu</p>' +
          '<p class="text-xs text-amber-800 leading-relaxed">Berkas sudah Anda ganti' + (waktu ? ' pada ' + esc2(waktu) : '') +
          '. Agar Admin Utama tahu data ini sudah diperbaiki, klik tombol <strong>Laporkan Sudah Diperbaiki</strong> di bawah. ' +
          'Detail baru bisa ditutup setelah laporan terkirim.</p></div>';
      } catch (e) {
        try { console.warn('[wajib-lapor] dilewati:', e); } catch (_e) { /* abaikan */ }
        setAktif(false);
        return '';
      }
    }
  };

  /** Lencana kecil di sel status baris Lihat Data. */
  window.badgePerluLapor = function (row) {
    if (!row || row[25] !== true) return '';
    return '<div class="mt-1"><span title="' + esc2('Berkas sudah diganti pengguna, tetapi belum dilaporkan sudah diperbaiki') + '" ' +
      'class="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-md shadow-2xs">' +
      'Berkas diubah · belum dilaporkan</span></div>';
  };

  // ---------------------------------------------------------------------------------------------
  // Pencegat penutupan: satu titik di fase TANGKAP pada modal. Semua jalur tutup (x, "Tutup Detail", dan Esc -> x lewat modal-a11y.js)
  // berupa klik pada salah satu tombol itu, jadi klik dihentikan sebelum sampai ke tombolnya (onclick bawaan tidak tersentuh).
  // ---------------------------------------------------------------------------------------------
  function pasang() {
    var modal = $(ID_MODAL);
    if (!modal || modal.__wajibLapor) return;
    modal.__wajibLapor = true;
    modal.addEventListener('click', function (e) {
      if (!aktif) return;
      var t = e.target && e.target.closest ? e.target.closest('#' + ID_X + ',#' + ID_TUTUP) : null;
      if (!t) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (typeof tampilkanToast === 'function') tampilkanToast(PESAN_TOLAK, 'gagal', { durasi: 5000 });
      sorot();
    }, true);
    // Detail ditutup/dibuka (lewat jalur apa pun, mis. logout atau pindah akun): gerbang dilepas sampai Detail berikutnya dirender.
    new MutationObserver(function () { if (aktif) setAktif(false); else terapkanTampilan(); })
      .observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

  // Peringatan peramban saat menutup tab / memuat ulang selagi gerbang aktif. Hanya upaya terbaik: server tetap menandai data itu.
  window.addEventListener('beforeunload', function (e) {
    if (!aktif) return;
    e.preventDefault();
    e.returnValue = '';
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pasang);
  else pasang();
})();
