/**
 * public/js/app-cek-rumah-ibadah.js
 * "Cek Rumah Ibadah" untuk Admin Utama (tombol di Lihat Data): menjawab "rumah ibadah A sudah ada pengurusnya? atas nama siapa?".
 * Dimuat malas oleh app-pesan-periode.js (muatSkripAdmin) hanya untuk peran UTAMA. Rencana: plans/plan-cari-rumah-ibadah-pengurus.md
 *
 * Sumber data: aksi server cariRumahIbadahPengurus (khusus UTAMA, hanya baca): rumah ibadah digabung penerima tahun aktif
 * yang tertaut lewat rumah_ibadah_id. Pengurus = penerima dengan layanan apa pun yang tertaut. Tanpa NIK/HP/rekening.
 * Pencarian, filter, dan paginasi dikerjakan server (2.874 rumah ibadah tidak dimuat sekaligus).
 *
 * Semua teks dari server lewat esc(). app-transaksi.js hanya memanggil window.bukaCekRumahIbadah(); bila skrip ini
 * belum/gagal dimuat, tombol menampilkan toast.
 */
(function () {
  'use strict';

  var ID_MODAL = 'modal-cek-rumah-ibadah';
  var LIMIT = 20;
  var TUNDA_SINYAL = 1500;     // ms: gabungkan sinyal realtime beruntun menjadi satu muat ulang

  var JENIS_FILTER = [
    ['', 'Pilih jenis...'],
    ['MASJID', 'Masjid'], ['MUSHOLLA', 'Musholla'], ['MASJID_MUSHOLLA', 'Masjid & Musholla'],
    ['GEREJA', 'Gereja Protestan'], ['GEREJA_KATOLIK', 'Gereja Katolik'], ['GEREJA_ALL', 'Semua Gereja'],
    ['VIHARA', 'Vihara'], ['KLENTENG', 'Klenteng'], ['KUIL', 'Kuil']
  ];
  var NAMA_JENIS = {
    MASJID: 'Masjid', MUSHOLLA: 'Musholla', MUSHOLA: 'Musholla', GEREJA: 'Gereja', GEREJA_KATOLIK: 'Gereja Katolik',
    VIHARA: 'Vihara', KLENTENG: 'Klenteng', KUIL: 'Kuil'
  };

  var modal = null;
  var terbuka = false;
  var seq = 0;                 // nomor permintaan; jawaban dengan nomor lama diabaikan
  var seqKel = 0;
  var tahap = 'awal';          // 'awal' (belum Tampilkan Data) | 'memuat' | 'siap' | 'galat'
  var memuatKel = false;       // daftar kelurahan sedang diambil
  var pesanGalat = '';
  var data = null;             // jawaban server terakhir
  var q = { cari: '', jenis: '', kec: '', kel: '', status: '', page: 1 };
  var timerSinyal = null;
  var ulangSetelahMuat = false;

  function $(id) { return document.getElementById(id); }
  function esc2(v) {
    if (typeof window.esc === 'function') return window.esc(v);
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function angka(n) { return Number(n || 0).toLocaleString('id-ID'); }
  function adalahUtama() {
    return typeof dataPengguna !== 'undefined' && dataPengguna && String(dataPengguna.role || '').toUpperCase() === 'UTAMA';
  }
  function bacaJawaban(res) {
    if (typeof res === 'string') { try { return JSON.parse(res); } catch (_e) { return null; } }
    return res;
  }

  // ---------------------------------------------------------------------------------------------
  // Tampilan
  // ---------------------------------------------------------------------------------------------
  var KELAS_INPUT = 'w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-slate-700 shadow-2xs transition';

  function opsiJenis() {
    return JENIS_FILTER.map(function (j) { return '<option value="' + j[0] + '">' + esc2(j[1]) + '</option>'; }).join('');
  }
  function opsiKecamatan() {
    var daftar = (typeof DAFTAR_KECAMATAN_MEDAN !== 'undefined' && Array.isArray(DAFTAR_KECAMATAN_MEDAN)) ? DAFTAR_KECAMATAN_MEDAN : [];
    return '<option value="">Semua kecamatan</option>' +
      daftar.map(function (k) { return '<option value="' + esc2(k) + '">' + esc2(k) + '</option>'; }).join('');
  }

  function buatModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.id = ID_MODAL;
    modal.className = 'hidden fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 md:p-6 overflow-hidden';
    modal.innerHTML =
      '<div class="bg-white rounded-2xl sm:rounded-3xl max-w-5xl w-full shadow-2xl border border-slate-200/80 flex flex-col max-h-[94vh] max-h-[94dvh]">' +
      '  <div class="shrink-0 flex justify-between items-start gap-3 px-4 sm:px-7 py-4 border-b border-slate-100">' +
      '    <div class="min-w-0">' +
      '      <h3 id="cri-judul" class="text-sm sm:text-base font-bold text-slate-800 tracking-wide uppercase">Cek Rumah Ibadah</h3>' +
      '      <p class="text-xs text-slate-500 mt-0.5">Pilih jenis, kecamatan, dan kelurahan, lalu klik Tampilkan Data. DJPM = penerima semua layanan yang tertaut ke rumah ibadah itu.</p>' +
      '    </div>' +
      '    <button type="button" id="cri-x" aria-label="Tutup" class="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg text-xl font-semibold leading-none transition">&times;</button>' +
      '  </div>' +
      '  <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-7 py-4">' +
      '    <div id="cri-ringkasan" class="grid grid-cols-3 gap-2 mb-3"></div>' +
      '    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-2.5">' +
      '      <div><label for="cri-jenis" class="block text-xs font-medium text-slate-600 mb-1">1. Jenis</label>' +
      '        <select id="cri-jenis" class="' + KELAS_INPUT + '">' + opsiJenis() + '</select></div>' +
      '      <div><label for="cri-kec" class="block text-xs font-medium text-slate-600 mb-1">2. Kecamatan</label>' +
      '        <select id="cri-kec" disabled class="' + KELAS_INPUT + ' disabled:bg-slate-100 disabled:cursor-not-allowed">' + opsiKecamatan() + '</select></div>' +
      '      <div><label for="cri-kel" class="block text-xs font-medium text-slate-600 mb-1">3. Kelurahan</label>' +
      '        <select id="cri-kel" disabled class="' + KELAS_INPUT + ' disabled:bg-slate-100 disabled:cursor-not-allowed"><option value="">Pilih kecamatan</option></select></div>' +
      '    </div>' +
      '    <div class="flex flex-col sm:flex-row sm:items-end gap-2.5 mb-3">' +
      '      <div class="flex-1 min-w-0">' +
      '        <label for="cri-cari" class="block text-xs font-medium text-slate-600 mb-1">Cari nama rumah ibadah / alamat / nama DJPM <span class="text-slate-400 font-normal">(opsional)</span></label>' +
      '        <input type="text" id="cri-cari" autocomplete="off" placeholder="mis. al ikhlas, atau nama DJPM..." class="' + KELAS_INPUT + '" />' +
      '      </div>' +
      '      <button type="button" id="cri-tampil" disabled class="inline-flex items-center justify-center px-5 py-2 bg-sky-600 hover:bg-sky-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-2xs transition disabled:opacity-50 disabled:cursor-not-allowed">Tampilkan Data</button>' +
      '    </div>' +
      '    <div class="flex items-center justify-between gap-2 mb-2">' +
      '      <p id="cri-info" class="text-xs text-slate-500 font-medium" aria-live="polite"></p>' +
      '      <button type="button" id="cri-reset" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 active:scale-95 text-slate-600 border border-slate-300 rounded-xl text-xs font-semibold shadow-2xs transition">Reset Filter</button>' +
      '    </div>' +
      '    <div id="cri-daftar" class="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden"></div>' +
      '    <p class="mt-3 text-[11px] text-slate-400 leading-relaxed">Catatan: hanya penerima yang tertaut ke rumah ibadah terdaftar yang dihitung (layanan yang wajib memilih rumah ibadah, dan data lain yang cocok). ' +
      'Penerima Bilal Jenazah, Penggali Kubur, dan Guru Maghrib Mengaji yang bertempat tugas &quot;RUMAH&quot; tidak ikut terhitung. Data tahun aktif.</p>' +
      '  </div>' +
      '  <div class="shrink-0 px-4 sm:px-7 py-3 bg-slate-50/90 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 rounded-b-2xl sm:rounded-b-3xl">' +
      '    <div id="cri-halaman" class="flex items-center gap-2"></div>' +
      '    <button type="button" id="cri-tutup" class="ml-auto px-4 py-2.5 bg-slate-200 hover:bg-slate-300 active:scale-95 text-slate-700 rounded-xl text-xs font-semibold transition">Tutup</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(modal);
    pasangPendengar();
  }

  function pasangPendengar() {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) { tutup(); return; }
      var el = e.target.closest ? e.target.closest('[data-cri-aksi]') : null;
      if (!el || el.disabled) return;
      var aksi = el.getAttribute('data-cri-aksi');
      if (aksi === 'status') { q.status = el.getAttribute('data-cri-nilai') || ''; q.page = 1; muat(); }
      else if (aksi === 'sebelumnya') { if (q.page > 1) { q.page--; muat(); } }
      else if (aksi === 'berikutnya') { if (data && q.page < data.totalHalaman) { q.page++; muat(); } }
      else if (aksi === 'ulang') { muat(); }
    });
    $('cri-x').addEventListener('click', tutup);
    $('cri-tutup').addEventListener('click', tutup);
    $('cri-reset').addEventListener('click', function () { setelAwal(); });
    $('cri-tampil').addEventListener('click', tampilkan);
    $('cri-cari').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); tampilkan(); } });
    $('cri-jenis').addEventListener('change', function () {
      // Jenis dipilih dulu: kecamatan baru bisa dipilih setelahnya; pilihan di bawahnya dikosongkan.
      $('cri-kec').disabled = !this.value;
      $('cri-kec').value = '';
      isiKelurahan('');
      perbaruiTombol();
    });
    $('cri-kec').addEventListener('change', function () { isiKelurahan(this.value); });
  }

  /** Tombol Tampilkan Data aktif bila jenis sudah dipilih dan daftar kelurahan tidak sedang dimuat. */
  function perbaruiTombol() {
    var tombol = $('cri-tampil');
    if (tombol) tombol.disabled = !$('cri-jenis').value || memuatKel;
  }

  /** Ambil pilihan saat ini sebagai filter yang berlaku, lalu muat dari halaman pertama. */
  function tampilkan() {
    if (!$('cri-jenis').value) { $('cri-jenis').focus(); return; } // mis. Enter di kotak cari sebelum jenis dipilih
    if (memuatKel) return;
    q = { cari: $('cri-cari').value, jenis: $('cri-jenis').value, kec: $('cri-kec').value, kel: $('cri-kel').value, status: '', page: 1 };
    muat();
  }

  /** Kembali ke keadaan awal: semua pilihan kosong dan belum ada data yang ditampilkan. */
  function setelAwal() {
    seq++; // abaikan jawaban yang masih di jalan
    ulangSetelahMuat = false;
    clearTimeout(timerSinyal);
    data = null;
    tahap = 'awal';
    q = { cari: '', jenis: '', kec: '', kel: '', status: '', page: 1 };
    $('cri-cari').value = '';
    $('cri-jenis').value = '';
    $('cri-kec').value = '';
    $('cri-kec').disabled = true;
    isiKelurahan('');
    perbaruiTombol();
    render();
  }

  /** Kelurahan hanya bermakna per kecamatan: isi dari tabel wilayah (getKelurahanByKecamatan). */
  function isiKelurahan(kec) {
    var sel = $('cri-kel');
    var nomor = ++seqKel;
    if (!kec) {
      sel.innerHTML = '<option value="">Pilih kecamatan</option>';
      sel.disabled = true;
      memuatKel = false;
      perbaruiTombol();
      return;
    }
    sel.innerHTML = '<option value="">Memuat kelurahan...</option>';
    sel.disabled = true;
    memuatKel = true;
    perbaruiTombol();
    google.script.run
      .withSuccessHandler(function (daftar) {
        if (nomor !== seqKel) return;
        var list = Array.isArray(daftar) ? daftar : [];
        sel.innerHTML = '<option value="">Semua kelurahan</option>' +
          list.map(function (k) { return '<option value="' + esc2(k) + '">' + esc2(k) + '</option>'; }).join('');
        sel.disabled = false;
        memuatKel = false;
        perbaruiTombol();
      })
      .withFailureHandler(function () {
        if (nomor !== seqKel) return;
        sel.innerHTML = '<option value="">Gagal memuat kelurahan</option>';
        sel.disabled = true;
        memuatKel = false; // tetap boleh menampilkan data se-kecamatan
        perbaruiTombol();
      })
      .getKelurahanByKecamatan(dataPengguna.token, kec);
  }

  function kartuRingkasan(nilaiStatus, label, jumlah, kelasAngka) {
    var aktif = q.status === nilaiStatus;
    return '<button type="button" data-cri-aksi="status" data-cri-nilai="' + nilaiStatus + '" aria-pressed="' + (aktif ? 'true' : 'false') + '"' +
      ' class="text-left rounded-xl border px-3 py-2 transition active:scale-95 ' +
      (aktif ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-500/20' : 'border-slate-200 bg-white hover:bg-slate-50') + '">' +
      '<span class="block text-[11px] font-medium text-slate-500">' + esc2(label) + '</span>' +
      '<span class="block text-lg sm:text-xl font-bold ' + kelasAngka + '">' + (jumlah == null ? '-' : angka(jumlah)) + '</span></button>';
  }

  function badgeStatus(status) {
    var s = String(status || '');
    var kelas = s === 'Memenuhi Syarat' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
      : s === 'Tidak Memenuhi Syarat' ? 'bg-red-100 text-red-700 border-red-200'
      : s === 'Berkas Tidak Lengkap' ? 'bg-amber-100 text-amber-800 border-amber-200'
      : 'bg-slate-100 text-slate-600 border-slate-200';
    return '<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ' + kelas + '">' + esc2(s || '-') + '</span>';
  }

  function htmlBaris(r) {
    var ada = r.jumlahPengurus > 0;
    var pengurus = ada
      ? r.pengurus.map(function (p) {
        return '<li class="flex flex-wrap items-center gap-x-2 gap-y-0.5"><span class="font-semibold text-slate-800 break-words">' + esc2(p.nama) + '</span>' +
          '<span class="text-xs text-slate-500">' + esc2(p.layanan) + '</span>' + badgeStatus(p.statusVerifikasi) + '</li>';
      }).join('')
      : '';
    return '<div class="px-3 sm:px-4 py-3 border-b border-slate-100 last:border-b-0 flex flex-col md:flex-row md:items-start gap-2 md:gap-4">' +
      '<div class="md:w-5/12 min-w-0">' +
      '<div class="flex items-center flex-wrap gap-2"><span class="bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-semibold">' + esc2(NAMA_JENIS[r.jenis] || r.jenis) + '</span>' +
      '<span class="font-semibold text-slate-800 break-words">' + esc2(r.nama) + '</span></div>' +
      '<div class="text-xs text-slate-500 mt-0.5 break-words">' + esc2(r.alamat || '-') + '</div>' +
      '<div class="text-[11px] text-slate-400 mt-0.5">' + esc2(r.kelurahan) + ' &middot; ' + esc2(r.kecamatan) + '</div></div>' +
      '<div class="md:w-2/12 shrink-0">' +
      (ada ? '<span class="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border bg-emerald-100 text-emerald-700 border-emerald-200">Ada DJPM (' + angka(r.jumlahPengurus) + ')</span>'
        : '<span class="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border bg-rose-50 text-rose-700 border-rose-200">Belum ada DJPM</span>') + '</div>' +
      '<div class="md:flex-1 min-w-0">' + (ada ? '<ul class="space-y-1.5 text-sm">' + pengurus + '</ul>' : '<span class="hidden md:inline text-xs text-slate-400 italic">-</span>') + '</div>' +
      '</div>';
  }

  /** Gambar ulang; tombol kartu/paginasi dibangun ulang, jadi fokus papan ketik dikembalikan ke tombol yang sama. */
  function render() {
    if (!modal) return;
    var aktif = document.activeElement, kunci = null;
    if (aktif && modal.contains(aktif) && aktif.getAttribute && aktif.getAttribute('data-cri-aksi')) {
      kunci = { aksi: aktif.getAttribute('data-cri-aksi'), nilai: aktif.getAttribute('data-cri-nilai') };
    }
    gambar();
    if (kunci) {
      var baru = modal.querySelector('[data-cri-aksi="' + kunci.aksi + '"]' + (kunci.nilai !== null ? '[data-cri-nilai="' + kunci.nilai + '"]' : ''));
      // Tombol paginasi yang jadi nonaktif (sampai di halaman pertama/terakhir): fokus pindah ke pasangannya, bukan hilang ke body.
      if (baru && baru.disabled) {
        var pasangan = kunci.aksi === 'berikutnya' ? 'sebelumnya' : kunci.aksi === 'sebelumnya' ? 'berikutnya' : null;
        baru = pasangan ? modal.querySelector('[data-cri-aksi="' + pasangan + '"]') : null;
      }
      if (baru && !baru.disabled && baru !== document.activeElement) { try { baru.focus({ preventScroll: true }); } catch (_e) { /* abaikan */ } }
    }
  }

  function ringkasFilter() {
    var nama = '';
    JENIS_FILTER.forEach(function (j) { if (j[0] && j[0] === q.jenis) nama = j[1]; });
    var bagian = [nama, q.kec, q.kel, q.cari ? '"' + q.cari.trim() + '"' : ''].filter(Boolean);
    return bagian.join(' · ');
  }

  function gambar() {
    if (tahap === 'awal') {
      $('cri-ringkasan').innerHTML = '';
      $('cri-daftar').innerHTML = '<p class="px-4 py-10 text-center text-sm text-slate-500">Pilih jenis rumah ibadah, kecamatan, dan kelurahan, lalu klik <b>Tampilkan Data</b>.</p>';
      $('cri-info').textContent = '';
      $('cri-halaman').innerHTML = '';
      return;
    }
    var ring = (data && data.ringkasan) || null;
    $('cri-ringkasan').innerHTML =
      kartuRingkasan('', 'Semua rumah ibadah', ring ? ring.total : null, 'text-slate-800') +
      kartuRingkasan('ADA', 'Sudah ada DJPM', ring ? ring.ada : null, 'text-emerald-700') +
      kartuRingkasan('BELUM', 'Belum ada DJPM', ring ? ring.belum : null, 'text-rose-700');

    var daftar = $('cri-daftar'), info = $('cri-info'), hal = $('cri-halaman');
    if (tahap === 'memuat' && !data) {
      daftar.innerHTML = '<p class="px-4 py-10 text-center text-sm text-slate-500">Memuat data rumah ibadah...</p>';
      info.textContent = '';
      hal.innerHTML = '';
      return;
    }
    if (tahap === 'galat') {
      daftar.innerHTML = '<div class="px-4 py-8 text-center"><p class="text-sm text-red-600 font-semibold">' + esc2(pesanGalat) + '</p>' +
        '<button type="button" data-cri-aksi="ulang" class="mt-3 px-4 py-2 bg-sky-600 hover:bg-sky-700 active:scale-95 text-white rounded-xl text-xs font-semibold transition">Coba lagi</button></div>';
      info.textContent = '';
      hal.innerHTML = '';
      return;
    }
    var rows = (data && data.daftar) || [];
    // Sebut filter yang SEDANG ditampilkan: dropdown bisa diubah tanpa klik Tampilkan Data, jadi daftar bisa berbeda dari pilihan.
    info.textContent = data ? (angka(data.total) + ' rumah ibadah ditemukan' + (ringkasFilter() ? ' (' + ringkasFilter() + ')' : '') + (tahap === 'memuat' ? ' - memperbarui...' : '')) : '';
    daftar.setAttribute('aria-busy', tahap === 'memuat' ? 'true' : 'false');
    daftar.innerHTML = rows.length
      ? rows.map(htmlBaris).join('')
      : '<p class="px-4 py-10 text-center text-sm text-slate-400 italic">Tidak ada rumah ibadah yang sesuai pencarian atau filter.</p>';
    var total = data ? data.totalHalaman : 1;
    var tombolKelas = 'px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-100 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed';
    hal.innerHTML =
      '<button type="button" data-cri-aksi="sebelumnya" class="' + tombolKelas + '"' + (q.page <= 1 ? ' disabled' : '') + ' aria-label="Halaman sebelumnya">&laquo;<span class="hidden sm:inline"> Sebelumnya</span></button>' +
      '<span class="text-xs text-slate-500 font-medium">Halaman ' + angka(q.page) + ' dari ' + angka(total) + '</span>' +
      '<button type="button" data-cri-aksi="berikutnya" class="' + tombolKelas + '"' + (q.page >= total ? ' disabled' : '') + ' aria-label="Halaman berikutnya"><span class="hidden sm:inline">Berikutnya </span>&raquo;</button>';
  }

  // ---------------------------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------------------------
  /** Sinyal data berubah tiba saat muat sedang berjalan: jawabannya bisa sudah basi, jadi muat sekali lagi begitu selesai. */
  function selesaiMuat() {
    if (!ulangSetelahMuat) return;
    ulangSetelahMuat = false;
    muat();
  }

  function muat() {
    if (!terbuka || !adalahUtama()) return;
    var nomor = ++seq;
    ulangSetelahMuat = false;
    tahap = 'memuat';
    render();
    google.script.run
      .withSuccessHandler(function (res) {
        if (nomor !== seq || !terbuka) return; // jawaban lama / modal sudah ditutup
        res = bacaJawaban(res);
        if (!res || !res.sukses) {
          var pesan = (res && res.pesan) || 'Gagal memuat data.';
          // Frontend tayang sebelum fungsi server diperbarui: pesan teknis diganti petunjuk yang bisa dipahami.
          pesanGalat = /Aksi tidak diizinkan/i.test(pesan) ? 'Fitur ini belum tersedia di server. Muat ulang halaman, lalu coba lagi nanti.' : pesan;
          tahap = 'galat';
          render();
          selesaiMuat();
          return;
        }
        // Pastikan bentuk jawaban utuh: server lama/rusak tidak boleh membuat tampilan macet di "Memuat...".
        res.daftar = Array.isArray(res.daftar) ? res.daftar : [];
        res.daftar.forEach(function (r) { if (!Array.isArray(r.pengurus)) r.pengurus = []; });
        res.total = Number(res.total) || 0;
        res.totalHalaman = Number(res.totalHalaman) || 1;
        // Halaman melewati batas (data berkurang selagi terbuka): kembali ke halaman terakhir yang ada.
        if (res.daftar.length === 0 && res.total > 0 && q.page > res.totalHalaman) {
          q.page = res.totalHalaman;
          muat();
          return;
        }
        data = res;
        tahap = 'siap';
        render();
        selesaiMuat();
      })
      .withFailureHandler(function (err) {
        if (nomor !== seq || !terbuka) return;
        pesanGalat = typeof pesanErrorRamah === 'function' ? pesanErrorRamah(err) : 'Gagal menghubungi server.';
        tahap = 'galat';
        render();
        selesaiMuat();
      })
      .cariRumahIbadahPengurus(dataPengguna.token, {
        cari: q.cari, jenis: q.jenis, kecamatan: q.kec, kelurahan: q.kel, status: q.status, page: q.page, limit: LIMIT
      });
  }

  function tutup() {
    terbuka = false;
    seq++;          // abaikan jawaban yang masih di jalan
    ulangSetelahMuat = false;
    clearTimeout(timerSinyal);
    data = null;    // nama pengurus tidak disimpan di memori setelah ditutup; dibuka lagi = dimuat segar
    if (modal) modal.classList.add('hidden');
  }

  // Data berubah (input/edit/verifikasi, atau rumah ibadah diubah) selagi modal terbuka: muat ulang pelan-pelan,
  // filter dan halaman dipertahankan. Perubahan dari tab ini juga membuang cache (domain 'penerima').
  window.addEventListener('djpm:swr-invalidated', function (ev) {
    if (!terbuka || tahap === 'awal') return;
    var domains = (ev.detail && ev.detail.domains) || [];
    if (!(domains.indexOf('*') !== -1 || domains.indexOf('penerima') !== -1 || domains.indexOf('rumah_ibadah') !== -1)) return;
    clearTimeout(timerSinyal);
    timerSinyal = setTimeout(function () {
      if (!terbuka) return;
      if (tahap === 'memuat') { ulangSetelahMuat = true; return; } // jangan menimpa muat yang berjalan; ulangi setelahnya
      muat();
    }, TUNDA_SINYAL);
  });

  // ---------------------------------------------------------------------------------------------
  // Pintu masuk (dipanggil app-transaksi.js)
  // ---------------------------------------------------------------------------------------------
  window.bukaCekRumahIbadah = function () {
    if (typeof pastikanLogin === 'function' && !pastikanLogin()) return;
    if (!adalahUtama()) return;
    if (terbuka) return;
    buatModal();
    terbuka = true;
    modal.classList.remove('hidden');
    setelAwal();
  };
})();
