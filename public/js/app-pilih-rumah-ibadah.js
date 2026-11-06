/**
 * public/js/app-pilih-rumah-ibadah.js
 * Pop-up "Pilih Rumah Ibadah" untuk Kelola Data (khusus Admin Utama). Rencana: plans/plan-pilih-rumah-ibadah-kelola-data.md
 *
 * Menggantikan ketik manual Tempat Tugas + Alamat Tugas pada layanan wajib-daftar: daftar dibatasi ke KECAMATAN dan KELURAHAN
 * penerima serta jenis rumah ibadah yang sesuai layanan; yang dipilih mengisi nama + alamat PERSIS seperti di daftar.
 * Penegak aturan tetap server (kelolaData.ts: pasangan harus ada di daftar dan sewilayah dengan penerima).
 *
 * Dimuat malas oleh app-pesan-periode.js (muatSkripAdmin) hanya untuk peran UTAMA. app-kelola-data.js memanggil
 * window.djpmPilihRI.layananWajib(...) dan window.djpmPilihRI.buka(...); bila skrip ini belum/gagal dimuat, kolom tetap isian teks biasa.
 * Semua teks dari server lewat esc2().
 */
(function () {
  'use strict';

  var ID_MODAL = 'pri-modal';
  var LIMIT = 8;
  var TUNDA_CARI = 300;

  // Layanan yang tempat tugasnya WAJIB rumah ibadah terdaftar (sama dengan LAYANAN_WAJIB_RUMAH_IBADAH di server) -> filter jenis
  // yang diterima ambilDaftarRumahIbadahAdmin. Pemetaan mengikuti pop-up pilih rumah ibadah di formulir input (app-admin.js):
  // Guru Sekolah Minggu = gereja Protestan ATAU Katolik; Pengurus Vihara/Klenteng/Kuil = ketiganya.
  var JENIS_LAYANAN = {
    'IMAM MASJID': 'MASJID',
    'KHATIB JUMAT': 'MASJID',
    'NAZIR MASJID': 'MASJID',
    'NAZIR MUSHOLLA': 'MUSHOLLA',
    'PENGURUS GEREJA': 'GEREJA',
    'PENATUA GEREJA': 'GEREJA',
    'PETUGAS GEREJA KATOLIK': 'GEREJA_KATOLIK',
    'GURU SEKOLAH MINGGU': 'GEREJA_ALL',
    'PENGURUS VIHARA/KLENTENG/KUIL': 'VIHARA_KLENTENG_KUIL',
    'GURU SEKOLAH BUDDHA': 'VIHARA',
    'GURU SEKOLAH HINDU': 'KUIL',
    'GURU SEKOLAH KONG HU CHU': 'KLENTENG'
  };
  var NAMA_JENIS = {
    MASJID: 'Masjid', MUSHOLLA: 'Musholla', MUSHOLA: 'Musholla', GEREJA: 'Gereja', GEREJA_KATOLIK: 'Gereja Katolik',
    VIHARA: 'Vihara', KLENTENG: 'Klenteng', KUIL: 'Kuil', VIHARA_KLENTENG_KUIL: 'Vihara/Klenteng/Kuil'
  };
  var NAMA_FILTER = {
    MASJID: 'Masjid', MUSHOLLA: 'Musholla', GEREJA: 'Gereja', GEREJA_KATOLIK: 'Gereja Katolik', GEREJA_ALL: 'Gereja (Protestan dan Katolik)',
    VIHARA: 'Vihara', KLENTENG: 'Klenteng', KUIL: 'Kuil', VIHARA_KLENTENG_KUIL: 'Vihara, Klenteng, dan Kuil'
  };

  var modal = null;
  var seq = 0;                  // nomor permintaan; jawaban dengan nomor lama diabaikan
  var timerCari = null;
  var kon = null;               // konteks pembukaan: { layanan, jenis, kecamatan, kelurahan, tempat, alamat, onPilih }
  var q = { cari: '', page: 1 };
  var data = null;              // jawaban server terakhir
  var tahap = 'memuat';         // 'memuat' | 'siap' | 'galat'
  var pesanGalat = '';
  var pemicu = null;            // elemen yang memicu pembukaan (fokus dikembalikan saat ditutup)

  function $(id) { return document.getElementById(id); }
  function esc2(v) {
    if (typeof window.esc === 'function') return window.esc(v);
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function rapikan(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toUpperCase(); }
  function adalahUtama() {
    return typeof dataPengguna !== 'undefined' && dataPengguna && String(dataPengguna.role || '').trim().toUpperCase() === 'UTAMA';
  }
  function bacaJawaban(res) {
    if (typeof res === 'string') { try { return JSON.parse(res); } catch (_e) { return null; } }
    return res;
  }

  function jenisFilterDari(layanan) {
    var k = rapikan(layanan);
    return Object.prototype.hasOwnProperty.call(JENIS_LAYANAN, k) ? JENIS_LAYANAN[k] : '';
  }

  var KELAS_INPUT = 'w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-slate-700 shadow-2xs transition';

  function buatModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.id = ID_MODAL;
    modal.className = 'hidden fixed inset-0 z-[180] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 md:p-6 overflow-hidden';
    modal.innerHTML =
      '<div class="bg-white rounded-2xl sm:rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-200/80 flex flex-col max-h-[94vh] max-h-[94dvh]">' +
      '  <div class="shrink-0 flex justify-between items-start gap-3 px-4 sm:px-6 py-4 border-b border-slate-100">' +
      '    <div class="min-w-0">' +
      '      <h3 id="pri-judul" class="text-sm sm:text-base font-bold text-slate-800 tracking-wide uppercase">Pilih Rumah Ibadah</h3>' +
      '      <p id="pri-sub" class="text-xs text-slate-500 mt-0.5"></p>' +
      '    </div>' +
      '    <button type="button" id="pri-x" aria-label="Tutup" class="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg text-xl font-semibold leading-none transition">&times;</button>' +
      '  </div>' +
      '  <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4">' +
      '    <label for="pri-cari" class="block text-xs font-medium text-slate-600 mb-1">Cari nama atau alamat <span class="text-slate-400 font-normal">(opsional)</span></label>' +
      '    <input type="text" id="pri-cari" autocomplete="off" placeholder="mis. al ikhlas" class="' + KELAS_INPUT + ' mb-3" />' +
      '    <p id="pri-info" class="text-xs text-slate-500 font-medium mb-2" aria-live="polite"></p>' +
      '    <div id="pri-daftar" class="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden"></div>' +
      '    <p class="mt-3 text-[11px] text-slate-400 leading-relaxed">Hanya rumah ibadah di kecamatan dan kelurahan penerima yang ditampilkan. Untuk memilih rumah ibadah di wilayah lain, ubah dulu Kecamatan/Kelurahan penerima di formulir.</p>' +
      '  </div>' +
      '  <div class="shrink-0 px-4 sm:px-6 py-3 bg-slate-50/90 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 rounded-b-2xl sm:rounded-b-3xl">' +
      '    <div id="pri-halaman" class="flex items-center gap-2"></div>' +
      '    <button type="button" id="pri-tutup" class="ml-auto px-4 py-2.5 bg-slate-200 hover:bg-slate-300 active:scale-95 text-slate-700 rounded-xl text-xs font-semibold transition">Batal</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) {
      if (e.target === modal) { tutup(); return; }
      var el = e.target.closest ? e.target.closest('[data-pri]') : null;
      if (!el || el.disabled) return;
      var aksi = el.getAttribute('data-pri');
      if (aksi === 'pilih') pilih(Number(el.getAttribute('data-i')));
      else if (aksi === 'sebelumnya') { if (q.page > 1) { q.page--; muat(); } }
      else if (aksi === 'berikutnya') { if (data && q.page < data.totalHalaman) { q.page++; muat(); } }
      else if (aksi === 'ulang') muat();
    });
    $('pri-x').addEventListener('click', tutup);
    $('pri-tutup').addEventListener('click', tutup);
    $('pri-cari').addEventListener('input', function () {
      clearTimeout(timerCari);
      timerCari = setTimeout(function () { q.cari = $('pri-cari').value.trim(); q.page = 1; muat(); }, TUNDA_CARI);
    });
    $('pri-cari').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timerCari); q.cari = $('pri-cari').value.trim(); q.page = 1; muat(); }
    });
  }

  function tutup() {
    seq++;
    clearTimeout(timerCari);
    if (modal) modal.classList.add('hidden');
    var kembali = pemicu;
    pemicu = null; kon = null; data = null;
    if (kembali && typeof kembali.focus === 'function' && document.body.contains(kembali)) { try { kembali.focus(); } catch (_e) { /* abaikan */ } }
  }

  function terbuka() { return !!modal && !modal.classList.contains('hidden'); }

  // ---------------------------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------------------------
  function muat() {
    if (!kon) return;
    var nomor = ++seq;
    tahap = 'memuat';
    render();
    var token = (typeof dataPengguna !== 'undefined' && dataPengguna && dataPengguna.token) || '';
    google.script.run
      .withSuccessHandler(function (res) {
        if (nomor !== seq || !kon) return;
        var j = bacaJawaban(res);
        if (!j || j.sukses === false) { tahap = 'galat'; pesanGalat = (j && j.pesan) || 'Gagal memuat daftar rumah ibadah.'; data = null; render(); return; }
        // Lapis kedua di sisi layar: hanya rumah ibadah se-kecamatan + se-kelurahan penerima yang boleh dipilih. Dengan fungsi server baru
        // ini tidak mengubah apa pun; bila fungsi server lama masih aktif (belum mengenal filter kelurahan) pilihan di luar wilayah tak tampil.
        if (Array.isArray(j.daftar)) {
          var sewilayah = j.daftar.filter(function (r) { return rapikan(r.kecamatan) === kon.kecamatan && rapikan(r.kelurahan) === kon.kelurahan; });
          j = Object.assign({}, j, { daftar: sewilayah });   // salinan: objek asli bisa dipakai bersama oleh cache api-bridge
        }
        data = j; tahap = 'siap'; render();
      })
      .withFailureHandler(function (err) {
        if (nomor !== seq || !kon) return;
        tahap = 'galat'; pesanGalat = (err && err.message) ? err.message : 'Gagal memuat daftar rumah ibadah.'; data = null; render();
      })
      .ambilDaftarRumahIbadahAdmin(token, {
        cari: q.cari, jenis: kon.jenis, kecamatan: kon.kecamatan, kelurahan: kon.kelurahan, page: q.page, limit: LIMIT
      });
  }

  // ---------------------------------------------------------------------------------------------
  // Tampilan
  // ---------------------------------------------------------------------------------------------
  function sudahDipakai(r) {
    return !!kon && rapikan(r.nama) === rapikan(kon.tempat) && rapikan(r.alamat) === rapikan(kon.alamat);
  }

  function htmlBaris(r, i) {
    var dipakai = sudahDipakai(r);
    return '<button type="button" data-pri="pilih" data-i="' + i + '" class="w-full text-left px-3 sm:px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-sky-50 focus:outline-none focus-visible:bg-sky-50 transition flex flex-col gap-0.5">' +
      '<span class="flex flex-wrap items-center gap-2">' +
      '<span class="font-semibold text-slate-800 break-words">' + esc2(r.nama) + '</span>' +
      '<span class="bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-semibold">' + esc2(NAMA_JENIS[r.jenis] || r.jenis) + '</span>' +
      (dipakai ? '<span class="bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] px-2 py-0.5 rounded-full font-bold">Pilihan saat ini</span>' : '') +
      '</span>' +
      '<span class="text-xs text-slate-500 break-words">' + esc2(r.alamat || '-') + '</span>' +
      '</button>';
  }

  function render() {
    if (!modal || !kon) return;
    $('pri-sub').textContent = 'Layanan ' + kon.layanan + ' · Kec. ' + kon.kecamatan + ' · Kel. ' + kon.kelurahan +
      ' · Jenis: ' + (NAMA_FILTER[kon.jenis] || kon.jenis);
    var daftar = $('pri-daftar'), info = $('pri-info'), hal = $('pri-halaman');
    if (tahap === 'memuat') {
      info.textContent = 'Memuat...';
      daftar.innerHTML = '<div class="px-4 py-8 text-center text-sm text-slate-400">Memuat daftar rumah ibadah...</div>';
      hal.innerHTML = '';
      return;
    }
    if (tahap === 'galat') {
      info.textContent = '';
      daftar.innerHTML = '<div class="px-4 py-6 text-center"><p class="text-sm font-semibold text-red-700 break-words">' + esc2(pesanGalat) + '</p>' +
        '<button type="button" data-pri="ulang" class="mt-3 px-4 py-2 bg-sky-600 hover:bg-sky-700 active:scale-95 text-white rounded-xl text-xs font-semibold transition">Coba lagi</button></div>';
      hal.innerHTML = '';
      return;
    }
    var baris = (data && data.daftar) || [];
    var total = Number((data && data.total) || 0);
    if (!baris.length) {
      info.textContent = '0 rumah ibadah';
      daftar.innerHTML = '<div class="px-4 py-8 text-center text-sm text-slate-500">' + (q.cari
        ? 'Tidak ada rumah ibadah yang cocok dengan pencarian di wilayah ini.'
        : 'Belum ada rumah ibadah jenis ini di Kel. ' + esc2(kon.kelurahan) + ', Kec. ' + esc2(kon.kecamatan) +
        '. Tambahkan lebih dulu di Manajemen Data Rumah Ibadah, atau ubah Kecamatan/Kelurahan penerima.') + '</div>';
      hal.innerHTML = '';
      return;
    }
    info.textContent = total.toLocaleString('id-ID') + ' rumah ibadah · klik untuk memilih';
    daftar.innerHTML = baris.map(htmlBaris).join('');
    var totalHal = Number(data.totalHalaman || 1);
    hal.innerHTML = totalHal > 1
      ? '<button type="button" data-pri="sebelumnya"' + (q.page <= 1 ? ' disabled' : '') + ' class="px-3 py-1.5 bg-white hover:bg-slate-100 active:scale-95 text-slate-600 border border-slate-300 rounded-xl text-xs font-semibold shadow-2xs transition disabled:opacity-40 disabled:cursor-not-allowed">&laquo; Sebelumnya</button>' +
      '<span class="text-xs text-slate-500">Hal. ' + q.page + ' / ' + totalHal + '</span>' +
      '<button type="button" data-pri="berikutnya"' + (q.page >= totalHal ? ' disabled' : '') + ' class="px-3 py-1.5 bg-white hover:bg-slate-100 active:scale-95 text-slate-600 border border-slate-300 rounded-xl text-xs font-semibold shadow-2xs transition disabled:opacity-40 disabled:cursor-not-allowed">Berikutnya &raquo;</button>'
      : '';
  }

  function pilih(i) {
    var r = data && data.daftar && data.daftar[i];
    if (!r || !kon) return;
    var onPilih = kon.onPilih;
    tutup();
    if (typeof onPilih === 'function') onPilih({ id: r.id, nama: r.nama, alamat: r.alamat, kecamatan: r.kecamatan, kelurahan: r.kelurahan, jenis: r.jenis });
  }

  // ---------------------------------------------------------------------------------------------
  // API untuk app-kelola-data.js
  // ---------------------------------------------------------------------------------------------
  /** Apakah layanan ini wajib memilih rumah ibadah terdaftar (dan pop-up ini bisa dipakai)? */
  function layananWajib(layanan) { return adalahUtama() && jenisFilterDari(layanan) !== ''; }

  /**
   * Buka pop-up. opsi = { layanan, kecamatan, kelurahan, tempat, alamat, onPilih(rumahIbadah), pemicu }.
   * Mengembalikan '' bila dibuka, selain itu pesan mengapa tidak bisa dibuka.
   */
  function buka(opsi) {
    opsi = opsi || {};
    if (!adalahUtama()) return 'Fitur ini khusus Admin Utama.';
    var jenis = jenisFilterDari(opsi.layanan);
    if (!jenis) return 'Layanan ini tidak memakai daftar rumah ibadah.';
    var kec = rapikan(opsi.kecamatan), kel = rapikan(opsi.kelurahan);
    if (!kec || !kel) return 'Pilih Kecamatan dan Kelurahan penerima terlebih dahulu.';
    buatModal();
    kon = { layanan: rapikan(opsi.layanan), jenis: jenis, kecamatan: kec, kelurahan: kel, tempat: opsi.tempat || '', alamat: opsi.alamat || '', onPilih: opsi.onPilih };
    pemicu = opsi.pemicu || (document.activeElement && document.activeElement !== document.body ? document.activeElement : null);
    q = { cari: '', page: 1 };
    $('pri-cari').value = '';
    modal.classList.remove('hidden');
    muat();
    return '';
  }

  window.djpmPilihRI = { layananWajib: layananWajib, jenisFilterDari: jenisFilterDari, buka: buka, tutup: tutup, terbuka: terbuka };
})();
