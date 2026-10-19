/**
 * public/js/app-jadwal-pesan.js
 * UI admin UTAMA untuk: (1) Jadwal Otomatis tutup/buka periode input, (2) Pesan Admin Utama untuk seluruh
 * pengguna, (3) Status Baca pesan, dan (4) dialog TUTUP/BUKA manual yang bisa membawa pesan (K10).
 * Rancangan lengkap: plans/plan-timer-tutup-periode-input.md
 *
 * Modal dibuat lewat JS (index.html sudah mendekati batas 3.500 baris per berkas). KERANGKA modal dibuat
 * SEKALI; refresh data (termasuk dari sinyal realtime) hanya mengganti bagian dinamis, sehingga ketikan
 * admin di editor pesan / isian jadwal tidak hilang. Teks dari pengguna/server SELALU lewat textContent
 * atau esc(), tidak pernah disisipkan mentah ke HTML.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------------------------
  // Util umum
  // ---------------------------------------------------------------------------------------------
  // Helper waktu & render pesan disediakan app-pesan-periode.js (dimuat lebih dulu, dan yang memuat skrip ini).
  var HLP = window.djpmWaktu;
  var MS_JAM = 3600000;
  var BATAS = { judul: 100, isi: 1500, catatan: 200 };

  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hurufAman(v) {
    return (v == null ? '' : String(v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  var esc2 = hurufAman;
  function jumlahKarakter(s) { return Array.from(s || '').length; }

  var komponenWIB = HLP.komponenWIB;
  var formatPanjangWIB = HLP.panjangWIB;   // "Senin, 30 November 2026 pukul 23.59 WIB"
  var formatSisa = HLP.sisa;               // "2 hari 04:12:09"
  var renderIsiPesan = window.djpmRenderIsiPesan;
  /** Nilai untuk <input type="datetime-local"> yang dibaca server sebagai WIB: "2026-11-30T23:59". */
  function keInputWIB(tanggal) {
    var k = komponenWIB(tanggal);
    return k.y + '-' + pad(k.mo + 1) + '-' + pad(k.d) + 'T' + pad(k.h) + ':' + pad(k.mi);
  }
  function toast(pesan, jenis, durasi) {
    if (typeof tampilkanToast === 'function') tampilkanToast(pesan, jenis || 'info', { durasi: durasi || 5000 });
  }
  function tanya(opsi) {
    if (typeof konfirmasiAksi === 'function') return konfirmasiAksi(opsi);
    return Promise.resolve(window.confirm(opsi.pesan));
  }

  /** Bungkus google.script.run jadi Promise. */
  function panggil(aksi, args) {
    return new Promise(function (resolve, reject) {
      google.script.run
        .withSuccessHandler(function (r) { resolve(r); })
        .withFailureHandler(function (e) { reject(e); })[aksi].apply(null, args);
    });
  }
  function pesanGalat(e) { return (e && e.message) ? e.message : String(e || 'Terjadi kesalahan.'); }

  var abaikanEvent = false;
  /** Buang cache lokal 'setelan' (tanpa disiarkan) supaya pembacaan berikutnya pasti segar. */
  function segarkanCache() {
    if (!window.djpmCache) return;
    abaikanEvent = true;
    try { window.djpmCache.invalidate(['setelan'], false); } finally { abaikanEvent = false; }
  }

  // ---------------------------------------------------------------------------------------------
  // Konfigurasi tampilan (kelas ditulis utuh supaya terpindai Tailwind)
  // ---------------------------------------------------------------------------------------------
  var KARTU = {
    TUTUP: {
      judul: 'Tutup Otomatis',
      keterangan: 'Periode input ditutup sendiri pada waktu ini. Admin Utama tetap bebas.',
      tombol: 'Simpan Jadwal Tutup',
      kelasTombol: 'px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg shadow transition disabled:opacity-50',
      kelasIkon: 'w-7 h-7 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0',
      kelasAktif: 'rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 space-y-1.5',
      kelasHitung: 'text-lg font-bold text-amber-800 tabular-nums',
      ikon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
      bawaanOffset: 24 * MS_JAM, bawaanJam: [23, 59],
    },
    BUKA: {
      judul: 'Buka Otomatis (opsional)',
      keterangan: 'Periode input dibuka kembali pada waktu ini, misalnya untuk gelombang berikutnya.',
      tombol: 'Simpan Jadwal Buka',
      kelasTombol: 'px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow transition disabled:opacity-50',
      kelasIkon: 'w-7 h-7 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0',
      kelasAktif: 'rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 space-y-1.5',
      kelasHitung: 'text-lg font-bold text-emerald-800 tabular-nums',
      ikon: 'M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z',
      bawaanOffset: 7 * 24 * MS_JAM, bawaanJam: [8, 0],
    },
  };

  var TIPE_PESAN = {
    TUTUP: { label: 'Penutupan', kelasHeader: 'bg-amber-500', kelasBadge: 'bg-amber-100 text-amber-800 border-amber-200', sub: 'Sistem dalam mode Lihat Data' },
    BUKA: { label: 'Pembukaan', kelasHeader: 'bg-emerald-600', kelasBadge: 'bg-emerald-100 text-emerald-800 border-emerald-200', sub: 'Periode input dibuka' },
    INFO: { label: 'Informasi', kelasHeader: 'bg-sky-600', kelasBadge: 'bg-sky-100 text-sky-800 border-sky-200', sub: 'Informasi dari Admin Utama' },
  };
  var STATUS_PESAN = {
    DRAF: { label: 'Draf', kelas: 'bg-slate-100 text-slate-700 border-slate-200' },
    TERJADWAL: { label: 'Terjadwal', kelas: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    TERBIT: { label: 'Terbit', kelas: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    DIGANTI: { label: 'Diganti', kelas: 'bg-slate-100 text-slate-500 border-slate-200' },
    DITARIK: { label: 'Ditarik', kelas: 'bg-rose-100 text-rose-700 border-rose-200' },
  };

  var TEMPLATE = {
    TUTUP: {
      judul: 'Periode Input DJPM 2027 Ditutup',
      isi: 'Terima kasih atas partisipasi seluruh admin kecamatan dan Kemenag.\n\nPeriode input data penerima DJPM 2027 telah ditutup. Perubahan data selanjutnya hanya dapat dilakukan oleh Admin Utama Dinas Sosial Kota Medan berdasarkan surat resmi dari instansi.',
    },
    BUKA: {
      judul: 'Periode Input DJPM 2027 Dibuka',
      isi: 'Periode input data penerima DJPM 2027 telah dibuka. Silakan lengkapi dan perbarui data sesuai ketentuan yang berlaku.',
    },
    INFO: {
      judul: 'Informasi dari Admin Utama',
      isi: 'Mohon perhatian seluruh admin kecamatan dan Kemenag.\n\n',
    },
  };

  var KELAS_INPUT = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-sky-500';
  var KELAS_LABEL = 'block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1';
  var KELAS_TOMBOL_KECIL = 'px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-[11px] rounded-lg transition disabled:opacity-50';
  var KELAS_TOMBOL_BAHAYA = 'px-3 py-1.5 bg-white border border-rose-300 hover:bg-rose-50 text-rose-700 font-semibold text-[11px] rounded-lg transition disabled:opacity-50';

  // ---------------------------------------------------------------------------------------------
  // Keadaan
  // ---------------------------------------------------------------------------------------------
  var modal = null;
  var data = null;            // hasil ambilStatusDetailSetelan terakhir
  var selisihMs = 0;          // jam server - jam perangkat (dihitung dari respons SEGAR)
  var tabAktif = 'jadwal';
  var sibuk = false;
  var timerTik = null;
  var timerDebounce = null;
  var idEditor = null;        // id pesan yang sedang diubah (null = pesan baru)
  var modeEditor = 'baru';    // 'baru' | 'draf' | 'versi'
  var editorSentuh = false;
  var daftarBelum = null;     // hasil ambilStatistikBacaPesan bila sudah dimuat
  var sudahPicu = {};         // id jadwal yang sudah memicu penyegaran saat hitung mundur habis

  function sekarangServer() { return Date.now() + selisihMs; }
  function modalTerbuka() { return !!modal && !modal.classList.contains('hidden'); }

  // ---------------------------------------------------------------------------------------------
  // Kerangka modal (dibuat sekali)
  // ---------------------------------------------------------------------------------------------
  function htmlKartuJadwal(jenis) {
    var c = KARTU[jenis];
    return '' +
      '<section class="rounded-xl border border-slate-200 p-4 space-y-3" data-jp-kartu="' + jenis + '">' +
      '  <div class="flex items-start gap-2.5">' +
      '    <div class="' + c.kelasIkon + '"><svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="' + c.ikon + '"/></svg></div>' +
      '    <div class="min-w-0"><h4 class="text-xs font-bold text-slate-800 uppercase tracking-wider">' + c.judul + '</h4><p class="text-[11px] text-slate-500 leading-relaxed">' + c.keterangan + '</p></div>' +
      '  </div>' +
      '  <div id="jp-info-' + jenis + '"></div>' +
      '  <div class="grid gap-3 sm:grid-cols-2">' +
      '    <div><label for="jp-waktu-' + jenis + '" class="' + KELAS_LABEL + '">Tanggal &amp; jam (WIB)</label>' +
      '      <input type="datetime-local" id="jp-waktu-' + jenis + '" class="' + KELAS_INPUT + '"></div>' +
      '    <div><label for="jp-catatan-' + jenis + '" class="' + KELAS_LABEL + '">Catatan (opsional)</label>' +
      '      <input type="text" id="jp-catatan-' + jenis + '" maxlength="' + BATAS.catatan + '" placeholder="Mis. sesuai surat edaran" class="' + KELAS_INPUT + '"></div>' +
      '  </div>' +
      '  <div><label for="jp-pesan-' + jenis + '" class="' + KELAS_LABEL + '">Pesan yang terbit otomatis saat jadwal berjalan</label>' +
      '    <select id="jp-pesan-' + jenis + '" class="' + KELAS_INPUT + ' bg-white"></select>' +
      '    <p class="text-[11px] text-slate-400 mt-1">Hanya pesan berstatus Draf yang bisa dipilih. Tulis dulu di tab Pesan.</p></div>' +
      '  <div class="flex flex-wrap gap-2"><button type="button" id="jp-simpan-' + jenis + '" data-jp-aksi="simpan-jadwal" data-jenis="' + jenis + '" class="' + c.kelasTombol + '">' + c.tombol + '</button></div>' +
      '</section>';
  }

  function htmlKerangka() {
    return '' +
      '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-100 overflow-hidden max-h-[92vh] max-h-[92dvh] flex flex-col">' +
      '  <div class="flex justify-between items-center px-5 py-4 bg-slate-800 text-white shrink-0">' +
      '    <div class="flex items-center gap-2.5 min-w-0">' +
      '      <div class="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/30 flex items-center justify-center shrink-0"><svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-sky-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>' +
      '      <div class="min-w-0"><h3 class="text-sm font-bold tracking-wide uppercase truncate">Jadwal &amp; Pesan Penutupan</h3><p id="jp-jam-server" class="text-[11px] text-slate-300 truncate">Memuat…</p></div>' +
      '    </div>' +
      '    <button type="button" id="jp-x" data-modal-close aria-label="Tutup" class="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg text-2xl leading-none shrink-0">&times;</button>' +
      '  </div>' +
      '  <div class="flex border-b border-slate-200 bg-slate-50 shrink-0 overflow-x-auto" role="tablist">' +
      // Label dipendekkan di layar kecil supaya ketiga tab terlihat tanpa digeser.
      '    <button type="button" role="tab" data-jp-tab="jadwal" class="jp-tab px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap border-b-2">Jadwal<span class="hidden sm:inline"> Otomatis</span></button>' +
      '    <button type="button" role="tab" data-jp-tab="pesan" class="jp-tab px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap border-b-2">Pesan<span class="hidden sm:inline"> Admin Utama</span></button>' +
      '    <button type="button" role="tab" data-jp-tab="baca" class="jp-tab px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap border-b-2">Status Baca</button>' +
      '  </div>' +
      '  <div class="overflow-y-auto overscroll-contain flex-1 p-4 sm:p-5">' +
      // ── Panel Jadwal ──
      '    <div id="jp-panel-jadwal" role="tabpanel" class="space-y-4">' +
      '      <div id="jp-status-periode" class="rounded-xl px-4 py-3 border border-slate-200 bg-slate-50 text-sm text-slate-600">Memuat…</div>' +
      htmlKartuJadwal('TUTUP') + htmlKartuJadwal('BUKA') +
      '    </div>' +
      // ── Panel Pesan ──
      '    <div id="jp-panel-pesan" role="tabpanel" class="hidden space-y-4">' +
      '      <div id="jp-aktif"></div>' +
      '      <section id="jp-editor" class="rounded-xl border border-slate-200 p-4 space-y-3">' +
      '        <div class="flex items-center justify-between gap-2"><h4 id="jp-editor-judul" class="text-xs font-bold text-slate-800 uppercase tracking-wider">Tulis Pesan Baru</h4>' +
      '          <button type="button" id="jp-batal-ubah" data-jp-aksi="batal-ubah" class="hidden ' + KELAS_TOMBOL_KECIL + '">Batal ubah</button></div>' +
      '        <p id="jp-editor-info" class="hidden text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 leading-relaxed"></p>' +
      '        <div class="grid gap-3 sm:grid-cols-3">' +
      '          <div><label for="jp-tipe" class="' + KELAS_LABEL + '">Jenis pesan</label>' +
      '            <select id="jp-tipe" class="' + KELAS_INPUT + ' bg-white"><option value="TUTUP">Penutupan</option><option value="BUKA">Pembukaan</option><option value="INFO">Informasi</option></select></div>' +
      '          <div class="sm:col-span-2"><label for="jp-judul" class="' + KELAS_LABEL + '">Judul <span id="jp-hit-judul" class="normal-case font-normal text-slate-400">0/' + BATAS.judul + '</span></label>' +
      '            <input type="text" id="jp-judul" maxlength="' + BATAS.judul + '" class="' + KELAS_INPUT + '"></div>' +
      '        </div>' +
      '        <div><label for="jp-isi" class="' + KELAS_LABEL + '">Isi pesan <span id="jp-hit-isi" class="normal-case font-normal text-slate-400">0/' + BATAS.isi + '</span></label>' +
      '          <textarea id="jp-isi" rows="6" maxlength="' + BATAS.isi + '" class="' + KELAS_INPUT + ' resize-y"></textarea>' +
      '          <p class="text-[11px] text-slate-400 mt-1">Teks biasa. Baris baru dipertahankan. Alamat https:// otomatis bisa diklik.</p></div>' +
      '        <div class="flex flex-wrap items-center gap-2"><span class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Template:</span>' +
      '          <button type="button" data-jp-aksi="template" data-tipe="TUTUP" class="' + KELAS_TOMBOL_KECIL + '">Penutupan</button>' +
      '          <button type="button" data-jp-aksi="template" data-tipe="BUKA" class="' + KELAS_TOMBOL_KECIL + '">Pembukaan</button>' +
      '          <button type="button" data-jp-aksi="template" data-tipe="INFO" class="' + KELAS_TOMBOL_KECIL + '">Informasi</button></div>' +
      '        <div><div class="' + KELAS_LABEL + '">Pratinjau (tampilan bagi pengguna)</div><div id="jp-preview"></div></div>' +
      '        <div class="flex flex-wrap gap-2 pt-1">' +
      '          <button type="button" id="jp-simpan-draf" data-jp-aksi="simpan-pesan" data-terbit="0" class="px-4 py-2.5 bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs rounded-lg shadow transition disabled:opacity-50">Simpan sebagai Draf</button>' +
      '          <button type="button" id="jp-terbitkan" data-jp-aksi="simpan-pesan" data-terbit="1" class="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-lg shadow transition disabled:opacity-50">Terbitkan Sekarang</button></div>' +
      '        <p class="text-[11px] text-slate-400 leading-relaxed">Untuk menerbitkan pesan otomatis saat jadwal berjalan: simpan sebagai draf, lalu pilih pesan itu di tab Jadwal Otomatis.</p>' +
      '      </section>' +
      '      <div><h4 class="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">Riwayat Pesan</h4><div id="jp-riwayat" class="space-y-2"></div></div>' +
      '    </div>' +
      // ── Panel Status Baca ──
      '    <div id="jp-panel-baca" role="tabpanel" class="hidden space-y-4">' +
      '      <div id="jp-baca"></div>' +
      '      <div id="jp-belum"></div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0">' +
      '    <button type="button" id="jp-tutup" class="px-4 py-2 bg-slate-200 rounded-lg hover:bg-slate-300 transition text-sm font-semibold">Tutup</button>' +
      '  </div>' +
      '</div>';
  }

  function buatModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.id = 'modal-jadwal-pesan';
    modal.setAttribute('data-jaga-isian', '');
    modal.className = 'hidden fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4';
    modal.innerHTML = htmlKerangka();
    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) {
      if (e.target === modal) { tutupModal(); return; }
      var tab = e.target.closest ? e.target.closest('[data-jp-tab]') : null;
      if (tab) { pilihTab(tab.getAttribute('data-jp-tab')); return; }
      var tombol = e.target.closest ? e.target.closest('[data-jp-aksi]') : null;
      if (tombol && !tombol.disabled) tangani(tombol);
    });
    $('jp-x').addEventListener('click', tutupModal);
    $('jp-tutup').addEventListener('click', tutupModal);

    ['jp-tipe', 'jp-judul', 'jp-isi'].forEach(function (id) {
      $(id).addEventListener('input', function () { editorSentuh = true; perbaruiEditor(); });
    });
    ['TUTUP', 'BUKA'].forEach(function (j) {
      ['jp-waktu-', 'jp-catatan-', 'jp-pesan-'].forEach(function (p) {
        $(p + j).addEventListener('input', function () { this.dataset.sentuh = '1'; });
      });
    });
    pilihTab('jadwal');
    perbaruiEditor();
  }

  // ---------------------------------------------------------------------------------------------
  // Buka / tutup / tab / tik
  // ---------------------------------------------------------------------------------------------
  function bukaModal() {
    if (typeof pastikanLogin === 'function' && !pastikanLogin()) return;
    if (dataPengguna.role !== 'UTAMA') return;
    buatModal();
    modal.classList.remove('hidden');
    pilihTab(tabAktif);
    mulaiTik();
    muat(false);
  }

  function editorBerisi() {
    return editorSentuh && ($('jp-judul').value.trim() !== '' || $('jp-isi').value.trim() !== '');
  }

  function tutupModal() {
    if (!modalTerbuka()) return Promise.resolve();
    var lanjut = editorBerisi()
      ? tanya({
        judul: 'Buang isian pesan?',
        pesan: 'Pesan yang sedang Anda tulis belum disimpan. Tutup dan buang isiannya?',
        tipe: 'warning',
        teksBatal: 'Lanjut menulis',
        teksKonfirmasi: 'Buang & Tutup',
      })
      : Promise.resolve(true);
    return lanjut.then(function (ya) {
      if (!ya) return;
      resetEditor();
      modal.classList.add('hidden');
      berhentiTik();
    });
  }

  function pilihTab(nama) {
    tabAktif = nama;
    ['jadwal', 'pesan', 'baca'].forEach(function (t) {
      var panel = $('jp-panel-' + t);
      if (panel) panel.classList.toggle('hidden', t !== nama);
    });
    var tabs = modal.querySelectorAll('[data-jp-tab]');
    for (var i = 0; i < tabs.length; i++) {
      var aktif = tabs[i].getAttribute('data-jp-tab') === nama;
      tabs[i].setAttribute('aria-selected', aktif ? 'true' : 'false');
      tabs[i].className = 'jp-tab px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap border-b-2 ' +
        (aktif ? 'border-sky-600 text-sky-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700');
    }
  }

  function mulaiTik() {
    berhentiTik();
    tik();
    timerTik = setInterval(tik, 1000);
  }
  function berhentiTik() {
    if (timerTik) { clearInterval(timerTik); timerTik = null; }
  }
  function tik() {
    if (!modalTerbuka()) return;
    var jam = $('jp-jam-server');
    if (jam && data) jam.textContent = 'Jam server: ' + formatPanjangWIB(new Date(sekarangServer()).toISOString());
    var els = modal.querySelectorAll('[data-hitung]');
    for (var i = 0; i < els.length; i++) {
      var sampai = Date.parse(els[i].getAttribute('data-hitung'));
      var sisa = sampai - sekarangServer();
      els[i].textContent = formatSisa(sisa);
      var kunci = els[i].getAttribute('data-hitung');
      if (sisa <= 0 && !sudahPicu[kunci]) {
        sudahPicu[kunci] = true;
        // Cron mewujudkan jadwal paling lama satu menit kemudian; periksa ulang dua kali.
        setTimeout(function () { if (modalTerbuka()) muat(false); }, 3000);
        setTimeout(function () { if (modalTerbuka()) muat(false); }, 65000);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Muat & render bagian dinamis
  // ---------------------------------------------------------------------------------------------
  function setSibuk(nilai) {
    sibuk = nilai;
    if (!modal) return;
    var tombol = modal.querySelectorAll('[data-jp-aksi]');
    for (var i = 0; i < tombol.length; i++) tombol[i].disabled = nilai;
  }

  function muat(sudahSegar) {
    clearTimeout(timerDebounce);
    if (!sudahSegar) segarkanCache();
    return panggil('ambilStatusDetailSetelan', [dataPengguna.token]).then(function (r) {
      if (!r || !r.sukses) throw new Error((r && r.pesan) || 'Gagal memuat data.');
      data = r;
      selisihMs = Date.parse(r.waktuServer) - Date.now();
      render();
      if (daftarBelum && tabAktif === 'baca') muatBelum(true);
    }).catch(function (e) {
      var info = $('jp-status-periode');
      if (info && !data) info.textContent = 'Gagal memuat: ' + pesanGalat(e);
      toast('Gagal memuat jadwal & pesan: ' + pesanGalat(e), 'gagal', 6000);
    });
  }

  function render() {
    if (!modal || !data) return;
    renderStatusPeriode();
    renderKartuJadwal('TUTUP');
    renderKartuJadwal('BUKA');
    renderPesanAktif();
    renderRiwayat();
    renderBaca();
    tik();
    setSibuk(sibuk);
  }

  function renderStatusPeriode() {
    var el = $('jp-status-periode');
    var ditutup = !!data.ditutup;
    el.className = 'rounded-xl px-4 py-3 border text-sm ' + (ditutup ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900');
    el.innerHTML = '<span class="text-[10px] font-semibold uppercase tracking-wider block mb-0.5 ' + (ditutup ? 'text-red-600' : 'text-emerald-600') + '">Periode input saat ini</span>' +
      '<span class="font-bold">' + (ditutup ? 'DITUTUP' : 'DIBUKA') + '</span>' +
      '<span class="block text-[11px] mt-1 opacity-80">Tombol BUKA/TUTUP manual ada di panel Kontrol Periode Input. Jadwal di bawah berjalan otomatis.</span>';
  }

  function jadwalAktif(jenis) {
    var j = data.jadwal && (jenis === 'TUTUP' ? data.jadwal.tutup : data.jadwal.buka);
    return j || null;
  }
  function judulPesanDariId(id) {
    var daftar = data.pesanRiwayat || [];
    for (var i = 0; i < daftar.length; i++) if (daftar[i].id === id) return daftar[i].judul;
    return '';
  }

  function renderKartuJadwal(jenis) {
    var c = KARTU[jenis];
    var j = jadwalAktif(jenis);
    var info = $('jp-info-' + jenis);

    if (j) {
      var tambahan = [];
      tambahan.push('Dibuat oleh ' + esc2(j.dibuatOleh) + ' pada ' + esc2(j.dibuatPada));
      if (j.catatan) tambahan.push('Catatan: ' + esc2(j.catatan));
      if (j.pesanId) tambahan.push('Pesan: ' + esc2(judulPesanDariId(j.pesanId) || ('#' + j.pesanId)));
      var perpanjang = jenis === 'TUTUP'
        ? '<button type="button" data-jp-aksi="perpanjang" data-menit="60" class="' + KELAS_TOMBOL_KECIL + '">+1 jam</button>' +
        '<button type="button" data-jp-aksi="perpanjang" data-menit="1440" class="' + KELAS_TOMBOL_KECIL + '">+1 hari</button>' +
        '<button type="button" data-jp-aksi="perpanjang" data-menit="4320" class="' + KELAS_TOMBOL_KECIL + '">+3 hari</button>'
        : '';
      info.innerHTML = '<div class="' + c.kelasAktif + '">' +
        '<div class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Jadwal aktif</div>' +
        '<div class="text-sm font-bold text-slate-800">' + esc2(formatPanjangWIB(j.waktuISO)) + '</div>' +
        '<div class="' + c.kelasHitung + '" data-hitung="' + esc2(j.waktuISO) + '">' + esc2(formatSisa(Date.parse(j.waktuISO) - sekarangServer())) + '</div>' +
        '<div class="text-[11px] text-slate-500 leading-relaxed">' + tambahan.join(' · ') + '</div>' +
        '<div class="flex flex-wrap gap-2 pt-1">' + perpanjang +
        '<button type="button" data-jp-aksi="batal-jadwal" data-jenis="' + jenis + '" class="' + KELAS_TOMBOL_BAHAYA + '">Batalkan jadwal</button></div></div>';
    } else {
      info.innerHTML = '<p class="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">Belum ada jadwal ' + (jenis === 'TUTUP' ? 'tutup' : 'buka') + ' otomatis.</p>';
    }

    // Isian: hanya diisi otomatis bila belum disentuh admin (agar ketikan tidak tertimpa).
    var inW = $('jp-waktu-' + jenis), inC = $('jp-catatan-' + jenis), sel = $('jp-pesan-' + jenis);
    if (!inW.dataset.sentuh) {
      if (j) inW.value = keInputWIB(new Date(j.waktuISO));
      else {
        var calon = new Date(sekarangServer() + c.bawaanOffset);
        var k = komponenWIB(calon);
        inW.value = k.y + '-' + pad(k.mo + 1) + '-' + pad(k.d) + 'T' + pad(c.bawaanJam[0]) + ':' + pad(c.bawaanJam[1]);
      }
    }
    if (!inC.dataset.sentuh) inC.value = j ? (j.catatan || '') : '';
    inW.min = keInputWIB(new Date(sekarangServer() + 5 * 60000));

    // Pilihan pesan: Draf + yang terjadwal untuk jadwal ini.
    var dipilih = sel.dataset.sentuh ? sel.value : (j && j.pesanId ? String(j.pesanId) : '');
    var opsi = '<option value="">Tanpa pesan</option>';
    (data.pesanRiwayat || []).forEach(function (p) {
      var pantas = p.status === 'DRAF' || (p.status === 'TERJADWAL' && j && p.id === j.pesanId);
      if (!pantas) return;
      opsi += '<option value="' + p.id + '">' + esc2(p.judul) + ' (' + esc2((TIPE_PESAN[p.tipe] || TIPE_PESAN.INFO).label) + ')</option>';
    });
    sel.innerHTML = opsi;
    sel.value = dipilih;
    if (sel.value !== dipilih) sel.value = '';
  }

  function badge(teks, kelas) {
    return '<span class="inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ' + kelas + '">' + esc2(teks) + '</span>';
  }

  function renderPesanAktif() {
    var el = $('jp-aktif');
    var p = data.pesan;
    if (!p) {
      el.innerHTML = '<p class="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">Belum ada pesan yang terbit. Pesan yang terbit tampil ke seluruh pengguna.</p>';
      return;
    }
    var st = data.statistikBaca || { sudah: 0, total: 0 };
    el.innerHTML = '<div class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 space-y-1.5">' +
      '<div class="flex flex-wrap items-center gap-2"><span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Pesan yang sedang terbit</span>' +
      badge((TIPE_PESAN[p.tipe] || TIPE_PESAN.INFO).label, (TIPE_PESAN[p.tipe] || TIPE_PESAN.INFO).kelasBadge) + '</div>' +
      '<div class="text-sm font-bold text-slate-800 break-words">' + esc2(p.judul) + '</div>' +
      '<div id="jp-aktif-isi" class="text-xs text-slate-700 leading-relaxed whitespace-pre-line break-words"></div>' +
      '<div class="text-[11px] text-slate-500">Terbit ' + esc2(p.waktuTerbit) + ' oleh ' + esc2(p.oleh) + ' · Dibaca ' + st.sudah + ' dari ' + st.total + ' akun</div>' +
      '<div class="flex flex-wrap gap-2 pt-1"><button type="button" data-jp-aksi="ubah" data-id="' + p.id + '" class="' + KELAS_TOMBOL_KECIL + '">Ubah (versi baru)</button>' +
      '<button type="button" data-jp-aksi="tarik" data-id="' + p.id + '" class="' + KELAS_TOMBOL_BAHAYA + '">Tarik pesan</button></div></div>';
    renderIsiPesan($('jp-aktif-isi'), p.isi);
  }

  function renderRiwayat() {
    var el = $('jp-riwayat');
    var daftar = data.pesanRiwayat || [];
    if (daftar.length === 0) {
      el.innerHTML = '<p class="text-xs text-slate-500">Belum ada pesan.</p>';
      return;
    }
    el.innerHTML = daftar.map(function (p) {
      var st = STATUS_PESAN[p.status] || STATUS_PESAN.DRAF;
      var tp = TIPE_PESAN[p.tipe] || TIPE_PESAN.INFO;
      var aksi = '';
      if (p.status === 'DRAF' || p.status === 'TERJADWAL') {
        aksi += '<button type="button" data-jp-aksi="ubah" data-id="' + p.id + '" class="' + KELAS_TOMBOL_KECIL + '">Ubah</button>' +
          '<button type="button" data-jp-aksi="terbitkan" data-id="' + p.id + '" class="' + KELAS_TOMBOL_KECIL + '">Terbitkan</button>';
      } else if (p.status === 'TERBIT') {
        aksi += '<button type="button" data-jp-aksi="ubah" data-id="' + p.id + '" class="' + KELAS_TOMBOL_KECIL + '">Ubah (versi baru)</button>';
      }
      if (p.status === 'DRAF' || p.status === 'TERJADWAL' || p.status === 'TERBIT') {
        aksi += '<button type="button" data-jp-aksi="tarik" data-id="' + p.id + '" class="' + KELAS_TOMBOL_BAHAYA + '">Tarik</button>';
      }
      var info = [];
      info.push('Dibuat ' + esc2(p.dibuatPada) + ' oleh ' + esc2(p.oleh));
      if (p.waktuTerbit) info.push('Terbit ' + esc2(p.waktuTerbit));
      if (p.status === 'TERBIT' || p.status === 'DIGANTI' || p.status === 'DITARIK') info.push('Dibaca ' + (p.jumlahDibaca || 0) + ' akun');
      if (p.status === 'TERJADWAL' && p.jadwalId) info.push('Terikat jadwal #' + p.jadwalId);
      if (p.menggantikan) info.push('Versi baru dari #' + p.menggantikan);
      return '<div class="rounded-lg border border-slate-200 px-3 py-2.5 space-y-1">' +
        '<div class="flex flex-wrap items-center gap-2">' + badge(st.label, st.kelas) + badge(tp.label, tp.kelasBadge) +
        '<span class="text-xs font-bold text-slate-800 break-words min-w-0">' + esc2(p.judul) + '</span></div>' +
        '<div class="text-[11px] text-slate-500">' + info.join(' · ') + '</div>' +
        (aksi ? '<div class="flex flex-wrap gap-2 pt-0.5">' + aksi + '</div>' : '') + '</div>';
    }).join('');
  }

  function renderBaca() {
    var el = $('jp-baca');
    var p = data.pesan;
    var st = data.statistikBaca;
    if (!p || !st) {
      el.innerHTML = '<p class="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">Belum ada pesan yang terbit, jadi belum ada yang bisa dilacak.</p>';
      $('jp-belum').innerHTML = '';
      return;
    }
    el.innerHTML = '<div class="rounded-xl border border-slate-200 p-4 space-y-2">' +
      '<div class="text-xs font-bold text-slate-800 break-words">' + esc2(p.judul) + '</div>' +
      '<div class="text-sm text-slate-700"><strong>' + st.sudah + '</strong> dari <strong>' + st.total + '</strong> akun sudah membaca (<strong>' + st.persen + '%</strong>)</div>' +
      '<div class="h-2.5 rounded-full bg-slate-200 overflow-hidden"><div class="h-full bg-emerald-500 rounded-full" style="width:' + Math.max(0, Math.min(100, st.persen)) + '%"></div></div>' +
      '<div class="flex flex-wrap gap-2 pt-1"><button type="button" data-jp-aksi="muat-belum" class="' + KELAS_TOMBOL_KECIL + '">' + (st.belum > 0 ? 'Lihat ' + st.belum + ' akun yang belum membaca' : 'Muat ulang daftar') + '</button></div></div>';
  }

  // ---------------------------------------------------------------------------------------------
  // Status baca: daftar yang belum membaca
  // ---------------------------------------------------------------------------------------------
  function normalisasiHp(hp) {
    var d = String(hp || '').replace(/[^0-9]/g, '');
    if (!d) return '';
    if (d.indexOf('0') === 0) return '62' + d.slice(1);
    return d;
  }
  function teksPengingat(orang, judul) {
    return 'Yth. ' + orang.nama + ' (' + orang.role + (orang.kecamatan ? ' ' + orang.kecamatan : '') + '),\n\n' +
      'Mohon membuka aplikasi DJPM 2027 dan membaca pesan dari Admin Utama Dinas Sosial Kota Medan: "' + judul + '".\n\nTerima kasih.';
  }

  function muatBelum(diam) {
    if (!data || !data.pesan) return Promise.resolve();
    if (!diam) segarkanCache();
    return panggil('ambilStatistikBacaPesan', [dataPengguna.token, data.pesan.id]).then(function (r) {
      if (!r || !r.sukses) throw new Error((r && r.pesan) || 'Gagal memuat daftar.');
      daftarBelum = r;
      renderBelum();
    }).catch(function (e) { toast('Gagal memuat daftar: ' + pesanGalat(e), 'gagal', 6000); });
  }

  function renderBelum() {
    var el = $('jp-belum');
    if (!daftarBelum) { el.innerHTML = ''; return; }
    if (daftarBelum.belum === 0) {
      el.innerHTML = '<p class="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">Semua akun sudah membaca pesan ini.</p>';
      return;
    }
    var judul = daftarBelum.pesan ? daftarBelum.pesan.judul : '';
    var baris = daftarBelum.daftarBelum.map(function (o, i) {
      var hp = normalisasiHp(o.hp);
      var teks = teksPengingat(o, judul);
      var wa = hp ? '<a href="https://wa.me/' + hp + '?text=' + encodeURIComponent(teks) + '" target="_blank" rel="noopener noreferrer" class="' + KELAS_TOMBOL_KECIL + ' inline-block">Buka WA</a>' : '';
      return '<div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">' +
        '<div class="min-w-0"><div class="text-xs font-bold text-slate-800 break-words">' + esc2(o.nama) + '</div>' +
        '<div class="text-[11px] text-slate-500 break-words">' + esc2(o.role) + (o.kecamatan ? ' · ' + esc2(o.kecamatan) : '') + (o.hp ? ' · ' + esc2(o.hp) : ' · (tanpa nomor HP)') + '</div></div>' +
        '<div class="flex gap-2 shrink-0"><button type="button" data-jp-aksi="salin-pengingat" data-idx="' + i + '" class="' + KELAS_TOMBOL_KECIL + '">Salin pengingat</button>' + wa + '</div></div>';
    }).join('');
    el.innerHTML = '<div class="space-y-2"><div class="flex flex-wrap items-center justify-between gap-2"><h4 class="text-xs font-bold text-slate-800 uppercase tracking-wider">Belum membaca (' + daftarBelum.belum + ')</h4>' +
      '<button type="button" data-jp-aksi="salin-semua-hp" class="' + KELAS_TOMBOL_KECIL + '">Salin semua nomor HP</button></div>' + baris +
      (daftarBelum.terpotong ? '<p class="text-[11px] text-slate-400">Daftar dipotong 500 akun pertama.</p>' : '') + '</div>';
  }

  function salinKeClipboard(teks, pesanSukses) {
    function cadangan() {
      var ta = document.createElement('textarea');
      ta.value = teks;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (_e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? pesanSukses : 'Gagal menyalin. Salin manual dari tampilan.', ok ? 'sukses' : 'gagal');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(teks).then(function () { toast(pesanSukses, 'sukses'); }, cadangan);
    } else cadangan();
  }

  // ---------------------------------------------------------------------------------------------
  // Editor pesan
  // ---------------------------------------------------------------------------------------------
  function perbaruiEditor() {
    var tipe = $('jp-tipe').value;
    var judul = $('jp-judul').value;
    var isi = $('jp-isi').value;
    $('jp-hit-judul').textContent = jumlahKarakter(judul) + '/' + BATAS.judul;
    $('jp-hit-isi').textContent = jumlahKarakter(isi) + '/' + BATAS.isi;

    var tp = TIPE_PESAN[tipe] || TIPE_PESAN.INFO;
    var pv = $('jp-preview');
    pv.className = 'rounded-xl border border-slate-200 overflow-hidden';
    pv.innerHTML = '<div class="' + tp.kelasHeader + ' px-4 py-3"><div class="text-white font-bold text-sm tracking-wide uppercase break-words" id="jp-pv-judul"></div>' +
      '<div class="text-white/80 text-xs mt-0.5">' + esc2(tp.sub) + '</div></div>' +
      '<div class="px-4 py-3 bg-white"><div class="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Pesan dari Admin Utama</div>' +
      '<div id="jp-pv-isi" class="text-sm text-slate-800 leading-relaxed whitespace-pre-line break-words"></div></div>';
    $('jp-pv-judul').textContent = judul.trim() || 'Judul pesan';
    renderIsiPesan($('jp-pv-isi'), isi.trim() || 'Isi pesan akan tampil di sini.');
  }

  function resetEditor() {
    idEditor = null;
    modeEditor = 'baru';
    editorSentuh = false;
    if (!modal) return;
    $('jp-tipe').value = 'TUTUP';
    $('jp-judul').value = '';
    $('jp-isi').value = '';
    $('jp-editor-judul').textContent = 'Tulis Pesan Baru';
    $('jp-batal-ubah').classList.add('hidden');
    $('jp-editor-info').classList.add('hidden');
    perbaruiEditor();
  }

  function cariPesan(id) {
    if (data && data.pesan && data.pesan.id === id) return data.pesan;
    var daftar = (data && data.pesanRiwayat) || [];
    for (var i = 0; i < daftar.length; i++) if (daftar[i].id === id) return daftar[i];
    return null;
  }

  function mulaiUbah(id) {
    var p = cariPesan(id);
    if (!p) { toast('Pesan tidak ditemukan. Muat ulang panel.', 'gagal'); return; }
    // Isi lengkap ada di pesanRiwayat; data.pesan (terbit) juga membawa isi.
    idEditor = p.id;
    modeEditor = p.status === 'TERBIT' ? 'versi' : 'draf';
    $('jp-tipe').value = p.tipe;
    $('jp-judul').value = p.judul;
    $('jp-isi').value = p.isi;
    editorSentuh = false;
    $('jp-editor-judul').textContent = modeEditor === 'versi' ? 'Ubah Pesan (versi baru)' : 'Ubah Draf';
    var info = $('jp-editor-info');
    info.textContent = modeEditor === 'versi'
      ? 'Pesan ini sedang terbit. Menyimpan membuat VERSI BARU; versi lama tetap tampil sampai versi baru diterbitkan. Pengguna yang sudah membaca versi lama akan melihat pesan lagi.'
      : 'Perubahan disimpan pada draf ini.';
    info.classList.remove('hidden');
    $('jp-batal-ubah').classList.remove('hidden');
    perbaruiEditor();
    pilihTab('pesan');
    $('jp-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('jp-judul').focus();
  }

  function pakaiTemplate(tipe) {
    var t = TEMPLATE[tipe];
    if (!t) return;
    var terisi = $('jp-judul').value.trim() !== '' || $('jp-isi').value.trim() !== '';
    var terapkan = function () {
      $('jp-tipe').value = tipe;
      $('jp-judul').value = t.judul;
      $('jp-isi').value = t.isi;
      editorSentuh = true;
      perbaruiEditor();
    };
    if (!terisi) { terapkan(); return; }
    tanya({ judul: 'Ganti dengan template?', pesan: 'Judul dan isi yang sudah Anda ketik akan diganti dengan template.', tipe: 'warning', teksBatal: 'Batal', teksKonfirmasi: 'Ya, ganti' })
      .then(function (ya) { if (ya) terapkan(); });
  }

  function validasiEditor() {
    var judul = $('jp-judul').value.trim();
    var isi = $('jp-isi').value.trim();
    if (jumlahKarakter(judul) < 3) return 'Judul pesan minimal 3 karakter.';
    if (jumlahKarakter(isi) < 10) return 'Isi pesan minimal 10 karakter.';
    return '';
  }

  function simpanPesan(terbitkan) {
    var galat = validasiEditor();
    if (galat) { toast(galat, 'peringatan'); return; }
    var tipe = $('jp-tipe').value, judul = $('jp-judul').value, isi = $('jp-isi').value;
    var langsung = function () {
      setSibuk(true);
      panggil('simpanPesanAdmin', [dataPengguna.token, tipe, judul, isi, terbitkan, idEditor]).then(function (r) {
        if (!r || !r.sukses) throw new Error((r && r.pesan) || 'Gagal menyimpan pesan.');
        toast(terbitkan ? 'Pesan diterbitkan ke seluruh pengguna.' : 'Pesan disimpan sebagai draf.', 'sukses');
        resetEditor();
        return muat(true);
      }).catch(function (e) { toast(pesanGalat(e), 'gagal', 6000); }).then(function () { setSibuk(false); });
    };
    if (!terbitkan) { langsung(); return; }
    tanya({
      judul: 'Terbitkan pesan sekarang?',
      pesan: 'Pesan "' + judul.trim() + '" akan langsung tampil ke seluruh pengguna (Kecamatan, Kemenag, dan lainnya).' +
        (data && data.pesan ? '\n\nPesan yang sedang terbit akan digantikan.' : ''),
      tipe: 'info', teksBatal: 'Batal', teksKonfirmasi: 'Ya, terbitkan',
    }).then(function (ya) { if (ya) langsung(); });
  }

  function terbitkanPesan(id) {
    var p = cariPesan(id);
    tanya({
      judul: 'Terbitkan pesan sekarang?',
      pesan: 'Pesan "' + (p ? p.judul : '#' + id) + '" akan langsung tampil ke seluruh pengguna.' + (data && data.pesan ? '\n\nPesan yang sedang terbit akan digantikan.' : ''),
      tipe: 'info', teksBatal: 'Batal', teksKonfirmasi: 'Ya, terbitkan',
    }).then(function (ya) {
      if (!ya) return;
      setSibuk(true);
      panggil('terbitkanPesanAdmin', [dataPengguna.token, id]).then(function (r) {
        if (!r || !r.sukses) throw new Error((r && r.pesan) || 'Gagal menerbitkan pesan.');
        toast('Pesan diterbitkan.', 'sukses');
        return muat(true);
      }).catch(function (e) { toast(pesanGalat(e), 'gagal', 6000); }).then(function () { setSibuk(false); });
    });
  }

  function tarikPesan(id) {
    var p = cariPesan(id);
    tanya({
      judul: 'Tarik pesan?',
      pesan: 'Pesan "' + (p ? p.judul : '#' + id) + '" tidak akan tampil lagi ke pengguna. Pesan yang ditarik tidak bisa diterbitkan ulang (buat pesan baru bila perlu).',
      tipe: 'danger', teksBatal: 'Batal', teksKonfirmasi: 'Ya, tarik',
    }).then(function (ya) {
      if (!ya) return;
      setSibuk(true);
      panggil('tarikPesanAdmin', [dataPengguna.token, id]).then(function (r) {
        if (!r || !r.sukses) throw new Error((r && r.pesan) || 'Gagal menarik pesan.');
        toast('Pesan ditarik.', 'sukses');
        if (idEditor === id) resetEditor();
        return muat(true);
      }).catch(function (e) { toast(pesanGalat(e), 'gagal', 6000); }).then(function () { setSibuk(false); });
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Aksi jadwal
  // ---------------------------------------------------------------------------------------------
  function simpanJadwal(jenis) {
    var nilaiWaktu = $('jp-waktu-' + jenis).value;
    if (!nilaiWaktu) { toast('Isi tanggal dan jam terlebih dahulu.', 'peringatan'); return; }
    var catatan = $('jp-catatan-' + jenis).value;
    var pesanId = $('jp-pesan-' + jenis).value || null;
    var lama = jadwalAktif(jenis);

    // Pratinjau waktu dari input (dibaca sebagai WIB), hanya untuk teks konfirmasi.
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(nilaiWaktu);
    var iso = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 7 * MS_JAM).toISOString() : '';
    var sisaMs = iso ? Date.parse(iso) - sekarangServer() : 0;
    if (iso && sisaMs < 5 * 60000) { toast('Waktu jadwal minimal 5 menit dari sekarang (jam server).', 'peringatan', 6000); return; }

    var aksi = jenis === 'TUTUP' ? 'DITUTUP' : 'DIBUKA';
    var pesanKonfirmasi = 'Periode input akan ' + aksi + ' otomatis pada:\n' + (iso ? formatPanjangWIB(iso) : nilaiWaktu) +
      (iso ? '\n(sisa ' + formatSisa(sisaMs) + ')' : '') + '\n\n' +
      (jenis === 'TUTUP'
        ? 'Setelah itu admin kecamatan dan Kemenag tidak bisa menginput atau mengedit data. Admin Utama tetap bebas, dan akun dengan pengecualian BUKA di Kelola Akses tetap boleh.'
        : 'Setelah itu admin kecamatan dan Kemenag bisa menginput dan mengedit data kembali.') +
      '\n\nPesan: ' + (pesanId ? (judulPesanDariId(Number(pesanId)) || '#' + pesanId) : 'tanpa pesan') +
      (lama ? '\n\nJadwal sebelumnya (' + formatPanjangWIB(lama.waktuISO) + ') akan digantikan.' : '');

    tanya({ judul: 'Simpan Jadwal ' + (jenis === 'TUTUP' ? 'Tutup' : 'Buka') + ' Otomatis', pesan: pesanKonfirmasi, tipe: jenis === 'TUTUP' ? 'warning' : 'info', teksBatal: 'Batal', teksKonfirmasi: 'Ya, simpan jadwal' })
      .then(function (ya) {
        if (!ya) return;
        setSibuk(true);
        panggil('aturJadwalPeriode', [dataPengguna.token, jenis, nilaiWaktu, catatan, pesanId]).then(function (r) {
          if (!r || !r.sukses) throw new Error((r && r.pesan) || 'Gagal menyimpan jadwal.');
          toast('Jadwal tersimpan.' + (r.peringatan ? ' ' + r.peringatan : ''), r.peringatan ? 'peringatan' : 'sukses', r.peringatan ? 8000 : 5000);
          ['jp-waktu-', 'jp-catatan-', 'jp-pesan-'].forEach(function (p) { delete $(p + jenis).dataset.sentuh; });
          return muat(true);
        }).catch(function (e) { toast(pesanGalat(e), 'gagal', 6000); }).then(function () { setSibuk(false); });
      });
  }

  function batalJadwal(jenis) {
    var j = jadwalAktif(jenis);
    tanya({
      judul: 'Batalkan jadwal ' + (jenis === 'TUTUP' ? 'tutup' : 'buka') + '?',
      pesan: 'Jadwal ' + (j ? formatPanjangWIB(j.waktuISO) : '') + ' akan dibatalkan dan tidak berjalan.' + (j && j.pesanId ? '\n\nPesan yang terikat kembali menjadi draf.' : ''),
      tipe: 'warning', teksBatal: 'Tidak', teksKonfirmasi: 'Ya, batalkan',
    }).then(function (ya) {
      if (!ya) return;
      setSibuk(true);
      panggil('batalkanJadwalPeriode', [dataPengguna.token, jenis]).then(function (r) {
        if (!r || !r.sukses) throw new Error((r && r.pesan) || 'Gagal membatalkan jadwal.');
        toast('Jadwal dibatalkan.', 'sukses');
        ['jp-waktu-', 'jp-catatan-', 'jp-pesan-'].forEach(function (p) { delete $(p + jenis).dataset.sentuh; });
        return muat(true);
      }).catch(function (e) { toast(pesanGalat(e), 'gagal', 6000); }).then(function () { setSibuk(false); });
    });
  }

  function perpanjang(menit) {
    var j = jadwalAktif('TUTUP');
    if (!j) return;
    var baru = new Date(Date.parse(j.waktuISO) + menit * 60000).toISOString();
    tanya({
      judul: 'Perpanjang jadwal tutup?',
      pesan: 'Penutupan otomatis digeser:\n' + formatPanjangWIB(j.waktuISO) + '\nmenjadi\n' + formatPanjangWIB(baru) + '.',
      tipe: 'info', teksBatal: 'Batal', teksKonfirmasi: 'Ya, perpanjang',
    }).then(function (ya) {
      if (!ya) return;
      setSibuk(true);
      panggil('perpanjangJadwalPeriode', [dataPengguna.token, menit]).then(function (r) {
        if (!r || !r.sukses) throw new Error((r && r.pesan) || 'Gagal memperpanjang jadwal.');
        toast('Jadwal tutup diperpanjang.', 'sukses');
        delete $('jp-waktu-TUTUP').dataset.sentuh;
        return muat(true);
      }).catch(function (e) { toast(pesanGalat(e), 'gagal', 6000); }).then(function () { setSibuk(false); });
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Penyalur klik (delegasi)
  // ---------------------------------------------------------------------------------------------
  function tangani(tombol) {
    var aksi = tombol.getAttribute('data-jp-aksi');
    var id = Number(tombol.getAttribute('data-id'));
    switch (aksi) {
      case 'simpan-jadwal': simpanJadwal(tombol.getAttribute('data-jenis')); break;
      case 'batal-jadwal': batalJadwal(tombol.getAttribute('data-jenis')); break;
      case 'perpanjang': perpanjang(Number(tombol.getAttribute('data-menit'))); break;
      case 'ubah': mulaiUbah(id); break;
      case 'terbitkan': terbitkanPesan(id); break;
      case 'tarik': tarikPesan(id); break;
      case 'simpan-pesan': simpanPesan(tombol.getAttribute('data-terbit') === '1'); break;
      case 'batal-ubah': resetEditor(); break;
      case 'template': pakaiTemplate(tombol.getAttribute('data-tipe')); break;
      case 'muat-belum': muatBelum(false); break;
      case 'salin-pengingat': {
        var orang = daftarBelum && daftarBelum.daftarBelum[Number(tombol.getAttribute('data-idx'))];
        if (orang) salinKeClipboard(teksPengingat(orang, daftarBelum.pesan ? daftarBelum.pesan.judul : ''), 'Teks pengingat disalin. Tempel di WhatsApp.');
        break;
      }
      case 'salin-semua-hp': {
        var nomor = (daftarBelum ? daftarBelum.daftarBelum : []).map(function (o) { return o.hp; }).filter(Boolean);
        if (nomor.length === 0) toast('Tidak ada nomor HP pada daftar ini.', 'peringatan');
        else salinKeClipboard(nomor.join('\n'), nomor.length + ' nomor HP disalin.');
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Tombol pembuka di panel "Kontrol Periode Input"
  // ---------------------------------------------------------------------------------------------
  function pasangTombol() {
    var acuan = $('sakelar-kelola-user');
    if (!acuan || $('sakelar-jadwal-pesan')) return;
    var b = document.createElement('button');
    b.id = 'sakelar-jadwal-pesan';
    b.type = 'button';
    b.className = 'w-full py-2.5 bg-sky-600 hover:bg-sky-700 active:scale-95 text-white font-bold text-xs rounded-lg shadow transition flex items-center justify-center gap-2';
    b.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-sky-200 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span>Jadwal &amp; Pesan Penutupan</span>';
    b.addEventListener('click', bukaModal);
    acuan.parentNode.insertBefore(b, acuan);
  }

  // Penyegaran dari sinyal realtime / tab lain. Diabaikan untuk invalidasi buatan sendiri.
  window.addEventListener('djpm:swr-invalidated', function (e) {
    if (abaikanEvent || !modalTerbuka()) return;
    var d = (e.detail && e.detail.domains) || [];
    if (d.indexOf('setelan') === -1 && d.indexOf('*') === -1) return;
    clearTimeout(timerDebounce);
    timerDebounce = setTimeout(function () { muat(true); }, 400);
  });

  // ---------------------------------------------------------------------------------------------
  // Dialog TUTUP/BUKA manual yang bisa membawa pesan (K10). Dipakai konfirmasiToggleSakelar().
  // Mengembalikan Promise<{ setuju, pesanId, batalkanJadwal }>.
  // ---------------------------------------------------------------------------------------------
  var dlg = null;
  var dlgSelesai = null;
  var dlgData = null;
  var dlgTimer = null;        // pengaman: tombol aksi aktif sendiri bila daftar pesan lambat termuat
  var dlgGen = 0;             // respons terlambat dari dialog sebelumnya tidak boleh mengisi dialog baru

  function buatDialog() {
    if (dlg) return;
    dlg = document.createElement('div');
    dlg.id = 'modal-sakelar-manual';
    dlg.setAttribute('data-jaga-isian', '');
    dlg.className = 'hidden fixed inset-0 z-[210] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4';
    dlg.innerHTML = '' +
      '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden max-h-[92vh] max-h-[92dvh] flex flex-col">' +
      '  <div class="flex justify-between items-center px-5 py-4 bg-slate-800 text-white shrink-0">' +
      '    <h3 id="sm-judul" class="text-sm font-bold tracking-wide uppercase"></h3>' +
      '    <button type="button" id="sm-x" data-modal-close aria-label="Tutup" class="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg text-2xl leading-none">&times;</button>' +
      '  </div>' +
      '  <div class="p-4 sm:p-5 space-y-3 overflow-y-auto overscroll-contain flex-1">' +
      '    <p id="sm-dampak" class="text-sm text-slate-700 leading-relaxed whitespace-pre-line"></p>' +
      '    <div id="sm-jadwal" class="hidden rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 space-y-1.5">' +
      '      <p id="sm-jadwal-teks" class="text-xs text-amber-900 leading-relaxed"></p>' +
      '      <label class="flex items-start gap-2 text-xs text-amber-900 font-semibold cursor-pointer"><input type="checkbox" id="sm-batal-jadwal" class="mt-0.5"> <span>Batalkan jadwal tutup otomatis tersebut</span></label>' +
      '    </div>' +
      '    <div><label for="sm-pesan" class="' + KELAS_LABEL + '">Pesan untuk seluruh pengguna (opsional)</label>' +
      '      <select id="sm-pesan" class="' + KELAS_INPUT + ' bg-white"><option value="">Memuat…</option></select></div>' +
      '    <div id="sm-baru" class="hidden space-y-2">' +
      '      <div><label for="sm-judul-baru" class="' + KELAS_LABEL + '">Judul</label><input type="text" id="sm-judul-baru" maxlength="' + BATAS.judul + '" class="' + KELAS_INPUT + '"></div>' +
      '      <div><label for="sm-isi-baru" class="' + KELAS_LABEL + '">Isi pesan</label><textarea id="sm-isi-baru" rows="5" maxlength="' + BATAS.isi + '" class="' + KELAS_INPUT + ' resize-y"></textarea></div>' +
      '    </div>' +
      '    <p id="sm-galat" class="hidden text-xs font-medium rounded-lg px-3 py-2 border text-red-600 bg-red-50 border-red-200"></p>' +
      '    <p class="text-[11px] text-slate-400">(Catatan: Admin utama tetap bebas kapan saja).</p>' +
      '  </div>' +
      '  <div class="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2 shrink-0">' +
      '    <button type="button" id="sm-batal" class="px-4 py-2 bg-slate-200 rounded-lg hover:bg-slate-300 transition text-sm font-semibold">Batal</button>' +
      '    <button type="button" id="sm-ya" class="px-4 py-2 text-white font-bold text-sm rounded-lg shadow transition disabled:opacity-50"></button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(dlg);

    dlg.addEventListener('click', function (e) { if (e.target === dlg) selesaiDialog({ setuju: false }); });
    $('sm-x').addEventListener('click', function () { selesaiDialog({ setuju: false }); });
    $('sm-batal').addEventListener('click', function () { selesaiDialog({ setuju: false }); });
    $('sm-ya').addEventListener('click', jalankanDialog);
    $('sm-pesan').addEventListener('change', function () {
      var baru = this.value === '__baru';
      $('sm-baru').classList.toggle('hidden', !baru);
      if (baru && !$('sm-judul-baru').value) {
        var t = TEMPLATE[dlgData && dlgData.buka ? 'BUKA' : 'TUTUP'];
        $('sm-judul-baru').value = t.judul;
        $('sm-isi-baru').value = t.isi;
      }
    });
  }

  function selesaiDialog(hasil) {
    if (!dlg) return;
    clearTimeout(dlgTimer);
    dlg.classList.add('hidden');
    var cb = dlgSelesai;
    dlgSelesai = null;
    if (cb) cb(hasil);
  }

  function galatDialog(teks) {
    var el = $('sm-galat');
    el.textContent = teks || '';
    el.classList.toggle('hidden', !teks);
  }

  function jalankanDialog() {
    galatDialog('');
    var pilih = $('sm-pesan').value;
    var batalkanJadwal = !!($('sm-batal-jadwal') && $('sm-batal-jadwal').checked && !$('sm-jadwal').classList.contains('hidden'));
    if (pilih !== '__baru') {
      selesaiDialog({ setuju: true, pesanId: pilih ? Number(pilih) : null, batalkanJadwal: batalkanJadwal });
      return;
    }
    var judul = $('sm-judul-baru').value, isi = $('sm-isi-baru').value;
    if (jumlahKarakter(judul.trim()) < 3) { galatDialog('Judul pesan minimal 3 karakter.'); return; }
    if (jumlahKarakter(isi.trim()) < 10) { galatDialog('Isi pesan minimal 10 karakter.'); return; }
    $('sm-ya').disabled = true;
    // Pesan dibuat sebagai DRAF dulu; penerbitannya ikut transaksi setInputKecKem (atomik).
    panggil('simpanPesanAdmin', [dataPengguna.token, dlgData.buka ? 'BUKA' : 'TUTUP', judul, isi, false, null]).then(function (r) {
      if (!r || !r.sukses) throw new Error((r && r.pesan) || 'Gagal menyimpan pesan.');
      selesaiDialog({ setuju: true, pesanId: r.id, batalkanJadwal: batalkanJadwal });
    }).catch(function (e) { galatDialog(pesanGalat(e)); }).then(function () { $('sm-ya').disabled = false; });
  }

  window.dialogSakelarManual = function (buka) {
    buatDialog();
    if (dlgSelesai) selesaiDialog({ setuju: false }); // dialog sebelumnya masih terbuka
    dlgData = { buka: !!buka };
    var gen = ++dlgGen;
    var aksi = buka ? 'Membuka' : 'Menutup';
    $('sm-judul').textContent = aksi + ' Periode Input Data';
    $('sm-dampak').textContent = 'Anda yakin ingin ' + aksi.toLowerCase() + ' periode input?\n\n' + (buka
      ? 'Semua admin kecamatan dan kemenag akan bisa mulai menginput dan mengedit data.'
      : 'Semua admin kecamatan dan kemenag tidak akan bisa menginput atau mengedit data sampai Anda membuka kembali.');
    var ya = $('sm-ya');
    ya.textContent = 'Ya, ' + aksi;
    ya.className = 'px-4 py-2 text-white font-bold text-sm rounded-lg shadow transition disabled:opacity-50 ' + (buka ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700');
    ya.disabled = true;
    galatDialog('');
    $('sm-baru').classList.add('hidden');
    $('sm-judul-baru').value = '';
    $('sm-isi-baru').value = '';
    $('sm-batal-jadwal').checked = false;
    $('sm-jadwal').classList.add('hidden');
    $('sm-pesan').innerHTML = '<option value="">Memuat…</option>';
    dlg.classList.remove('hidden');

    return new Promise(function (resolve) {
      dlgSelesai = resolve;
      var bantuan = false;
      // Menutup/membuka periode adalah tindakan terpenting: jaringan lambat TIDAK boleh menahannya.
      clearTimeout(dlgTimer);
      dlgTimer = setTimeout(function () {
        if (gen !== dlgGen || !dlgSelesai || !ya.disabled) return;
        bantuan = true;
        $('sm-pesan').innerHTML = '<option value="">Tanpa pesan</option>';
        galatDialog('Daftar pesan belum termuat (koneksi lambat). Anda tetap bisa melanjutkan tanpa pesan.');
        ya.disabled = false;
      }, 8000);
      segarkanCache();
      panggil('ambilStatusDetailSetelan', [dataPengguna.token]).then(function (r) {
        if (gen !== dlgGen || bantuan || !dlgSelesai || !dlg || dlg.classList.contains('hidden')) return;
        clearTimeout(dlgTimer);
        if (!r || !r.sukses) throw new Error((r && r.pesan) || 'Gagal memuat data.');
        var opsi = '<option value="">Tanpa pesan</option>';
        (r.pesanRiwayat || []).forEach(function (p) {
          if (p.status !== 'DRAF' && p.status !== 'TERJADWAL') return;
          opsi += '<option value="' + p.id + '">' + esc2(p.judul) + ' (' + esc2((TIPE_PESAN[p.tipe] || TIPE_PESAN.INFO).label) + (p.status === 'TERJADWAL' ? ', terjadwal' : '') + ')</option>';
        });
        opsi += '<option value="__baru">✎ Tulis pesan baru…</option>';
        $('sm-pesan').innerHTML = opsi;
        // Jadwal tutup yang masih menunggu: tanyakan apakah dibatalkan (hanya relevan saat menutup manual).
        var j = r.jadwal && r.jadwal.tutup;
        if (!buka && j) {
          $('sm-jadwal-teks').textContent = 'Masih ada jadwal tutup otomatis pada ' + formatPanjangWIB(j.waktuISO) + '. Jika dibiarkan, jadwal itu tetap berjalan (tidak mengubah apa pun karena periode sudah tertutup).';
          $('sm-jadwal').classList.remove('hidden');
        }
        ya.disabled = false;
      }).catch(function (e) {
        if (gen !== dlgGen || bantuan) return;
        clearTimeout(dlgTimer);
        $('sm-pesan').innerHTML = '<option value="">Tanpa pesan</option>';
        galatDialog('Daftar pesan tidak dapat dimuat (' + pesanGalat(e) + '). Anda tetap bisa melanjutkan tanpa pesan.');
        ya.disabled = false;
      });
    });
  };

  // ---------------------------------------------------------------------------------------------
  // Mulai
  // ---------------------------------------------------------------------------------------------
  window.bukaJadwalPesan = bukaModal;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pasangTombol);
  else pasangTombol();
})();
