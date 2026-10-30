/**
 * public/js/app-cek-alamat.js
 * "Cek Alamat Tugas" Guru Maghrib Mengaji: komunikasi dua arah antara Admin Utama dan akun Guru Maghrib Mengaji (per kecamatan; tanpa kecamatan = se-Kota).
 * Dimuat malas oleh app-pesan-periode.js (muatSkripAdmin) hanya untuk peran UTAMA dan GURU MAGHRIB MENGAJI. Rencana: plans/plan-cek-alamat-tugas-gmm.md
 *
 * Isi: tab "Cek Alamat" + lencana jumlah yang menunggu, pop-up saat masuk (GMM), pita pengingat, dan panel (ringkasan, daftar guru, utas, jawab,
 * perbaiki alamat tugas, kembalikan, selesai). Hak akses SELALU ditegakkan server (domains/cekAlamatTugas.ts); tampilan hanya mengikuti.
 * Semua teks dari server lewat esc(); tautan peta hanya http(s). Tanpa sinyal realtime (lencana disegarkan saat masuk, saat panel dibuka, dan saat
 * tab kembali terlihat dengan jeda minimal 2 menit).
 */
(function () {
  'use strict';

  var ID_MODAL = 'modal-cek-alamat';
  var ID_TAB = 'tab-cek-alamat';
  var ID_PITA = 'pita-cek-alamat';
  var ID_POPUP = 'modal-cek-alamat-popup';
  var JEDA_LENCANA = 2 * 60 * 1000;

  var LABEL_STATUS = {
    BELUM: 'Belum dicek', SUDAH_BENAR: 'Sudah benar', DIPERBAIKI: 'Sudah diperbaiki', TIDAK_PASTI: 'Belum pasti', DIKEMBALIKAN: 'Dikembalikan', SELESAI: 'Selesai'
  };
  var KELAS_STATUS = {
    BELUM: 'bg-slate-100 text-slate-700 border-slate-200', SUDAH_BENAR: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    DIPERBAIKI: 'bg-sky-50 text-sky-700 border-sky-200', TIDAK_PASTI: 'bg-amber-50 text-amber-800 border-amber-200',
    DIKEMBALIKAN: 'bg-rose-50 text-rose-700 border-rose-200', SELESAI: 'bg-slate-100 text-slate-500 border-slate-200'
  };
  var KELAS_INPUT = 'w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-slate-700';

  var modal = null;
  var terbuka = false;
  var seq = 0;                     // nomor permintaan daftar; jawaban lama diabaikan
  var tahap = 'awal';              // 'memuat' | 'siap' | 'galat'
  var pesanGalat = '';
  var data = null;                 // jawaban daftar terakhir
  var ringkasan = null;            // jawaban ringkasan terakhir
  var q = { status: '', kec: '', cari: '', page: 1 };
  var ui = {};                     // keadaan per kartu: { mode, utas, utasBuka, sibuk, nilai: {} }
  var panelBuka = { tampil: false, kec: '', pratinjau: null, sibuk: false };
  var lencana = null;              // { peran, kecamatan, menunggu, total }
  var tersedia = true;             // false bila server belum mendukung (frontend tayang lebih dulu)
  var terakhirLencana = 0;
  var timerUlang = null;           // percobaan ulang lencana setelah gangguan sementara
  var percobaanUlang = 0;

  function $(id) { return document.getElementById(id); }
  function esc2(v) {
    if (typeof window.esc === 'function') return window.esc(v);
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function angka(n) { return Number(n || 0).toLocaleString('id-ID'); }
  function peranSaya() {
    var r = (typeof dataPengguna !== 'undefined' && dataPengguna) ? String(dataPengguna.role || '').trim().toUpperCase() : '';
    return r === 'UTAMA' ? 'UTAMA' : (r === 'GURU MAGHRIB MENGAJI' ? 'GMM' : '');
  }
  function bacaJawaban(res) {
    if (typeof res === 'string') { try { return JSON.parse(res); } catch (_e) { return null; } }
    return res;
  }
  function toast(pesan, jenis) {
    if (typeof tampilkanToast === 'function') tampilkanToast(pesan, jenis || 'info');
  }
  function pesanRamah(res, cadangan) {
    var p = (res && res.pesan) || cadangan || 'Gagal memproses.';
    return /Aksi tidak diizinkan/i.test(p) ? 'Fitur ini belum tersedia di server. Muat ulang halaman, lalu coba lagi nanti.' : p;
  }
  /** Memanggil aksi server; selalu resolve (tidak pernah reject) dengan objek { sukses, ... }. */
  function panggil(aksi, args) {
    return new Promise(function (resolve) {
      try {
        var r = google.script.run
          .withSuccessHandler(function (res) { resolve(bacaJawaban(res) || { sukses: false, pesan: 'Jawaban server tidak terbaca.' }); })
          .withFailureHandler(function (err) {
            resolve({ sukses: false, pesan: typeof pesanErrorRamah === 'function' ? pesanErrorRamah(err) : 'Gagal menghubungi server.' });
          });
        r[aksi].apply(r, [dataPengguna.token].concat(args || []));
      } catch (e) {
        resolve({ sukses: false, pesan: 'Gagal menghubungi server.' });
      }
    });
  }
  function tautanAman(u) { return /^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : ''; }
  function keadaan(id) { return ui[id] || (ui[id] = { mode: '', utas: null, utasBuka: false, sibuk: false, nilai: {}, galat: '' }); }

  // ---------------------------------------------------------------------------------------------
  // Lencana, tab, pita, pop-up
  // ---------------------------------------------------------------------------------------------
  function perluTab() {
    if (!tersedia || !peranSaya()) return false;
    if (peranSaya() === 'UTAMA') return true;
    return !!lencana && lencana.total > 0;      // akun GMM: tab baru ada setelah Admin Utama membuka permintaan
  }

  function pastikanTab() {
    var ada = $(ID_TAB);
    if (!perluTab()) { if (ada) ada.remove(); return; }
    if (!ada) {
      var acuan = $('fab-ganti-password');   // baris 2 header (sebelum tombol Akun): baris navigasi atas sudah penuh
      if (!acuan || !acuan.parentNode) return;
      ada = document.createElement('button');
      ada.id = ID_TAB;
      ada.type = 'button';
      // Hanya ikon + lencana di SEMUA lebar layar, dan di baris 2 header (bukan baris navigasi atas yang lebarnya tetap 485 px dan sudah penuh
      // untuk Admin Utama: tombol di sana saling menimpa). Nama tersedia lewat title dan aria-label.
      ada.className = 'relative h-9 w-9 rounded-lg border border-orange-400/40 text-orange-200 hover:bg-orange-400/10 hover:text-orange-100 outline-none font-semibold text-xs transition flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0';
      ada.title = 'Cek Alamat Tugas Guru Maghrib Mengaji';
      ada.innerHTML = '<svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
        '<path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z"/>' +
        '<path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>' +
        '<span id="' + ID_TAB + '-angka" class="hidden absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold items-center justify-center"></span>';
      ada.addEventListener('click', function () { window.bukaCekAlamat(); });
      acuan.parentNode.insertBefore(ada, acuan);
    }
    var angkaEl = $(ID_TAB + '-angka');
    var n = lencana ? lencana.menunggu : 0;
    if (angkaEl) {
      angkaEl.textContent = n > 99 ? '99+' : String(n);
      angkaEl.classList.toggle('hidden', n <= 0);
      angkaEl.classList.toggle('inline-flex', n > 0);
    }
    ada.setAttribute('aria-label', 'Cek Alamat' + (n > 0 ? ', ' + n + ' menunggu' : ''));
  }

  function pastikanPita() {
    var ada = $(ID_PITA);
    var n = lencana ? lencana.menunggu : 0;
    if (!tersedia || !peranSaya() || n <= 0 || terbuka) { if (ada) ada.classList.add('hidden'); return; }
    if (!ada) {
      var utama = document.querySelector('main');
      if (!utama) return;
      ada = document.createElement('div');
      ada.id = ID_PITA;
      ada.setAttribute('role', 'status');
      ada.className = 'hidden mb-3 flex items-center justify-between gap-3 bg-orange-50 border border-orange-200 text-orange-900 rounded-xl px-4 py-2 text-xs sm:text-sm';
      ada.innerHTML = '<span id="' + ID_PITA + '-teks" class="min-w-0"></span>' +
        '<button type="button" id="' + ID_PITA + '-buka" class="shrink-0 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-semibold transition">Buka</button>';
      utama.insertBefore(ada, utama.firstChild);
      $(ID_PITA + '-buka').addEventListener('click', function () { window.bukaCekAlamat(); });
    }
    $(ID_PITA + '-teks').textContent = peranSaya() === 'UTAMA'
      ? angka(n) + ' permintaan Cek Alamat menunggu tinjauan Admin Utama.'
      : angka(n) + ' guru menunggu cek alamat tugas.';
    ada.classList.remove('hidden');
  }

  function kunciPopup() { return 'djpm_cek_alamat_popup_' + (dataPengguna && dataPengguna.username ? dataPengguna.username : ''); }
  function sudahPopup() { try { return sessionStorage.getItem(kunciPopup()) === '1'; } catch (_e) { return false; } }
  function tandaiPopup() { try { sessionStorage.setItem(kunciPopup(), '1'); } catch (_e) { /* abaikan */ } }
  function modalLainTerbuka() {
    return ['modal-pesan-admin', 'modal-notif-tutup'].some(function (id) { var e = $(id); return e && !e.classList.contains('hidden'); });
  }

  /** Pop-up sekali per sesi untuk akun GMM yang punya permintaan menunggu. Menunggu modal pesan admin ditutup dulu (maks. ±40 dtk). */
  function mungkinPopup(percobaan) {
    if (peranSaya() !== 'GMM' || !lencana || lencana.menunggu <= 0 || sudahPopup() || terbuka) return;
    if (modalLainTerbuka()) {
      if ((percobaan || 0) < 20) setTimeout(function () { mungkinPopup((percobaan || 0) + 1); }, 2000);
      return;
    }
    tandaiPopup();
    var p = $(ID_POPUP);
    if (p) p.remove();
    p = document.createElement('div');
    p.id = ID_POPUP;
    p.className = 'fixed inset-0 z-[360] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4';
    p.innerHTML =
      '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden max-h-[92vh] max-h-[92dvh] overflow-y-auto">' +
      '  <div class="px-5 py-4 bg-orange-500"><div id="' + ID_POPUP + '-judul" class="text-white font-bold text-sm tracking-wide uppercase">Cek Alamat Tugas</div></div>' +
      '  <div class="px-5 py-4 text-sm text-slate-800 leading-relaxed">Admin Utama meminta Anda mengecek alamat tugas <strong>' + angka(lencana.menunggu) +
      ' guru Maghrib Mengaji</strong>' + (lencana.kecamatan ? ' di ' + esc2(lencana.kecamatan) : '') +
      '. Cocokkan dengan berkas guru, lalu jawab atau perbaiki alamatnya.</div>' +
      '  <div class="px-5 pb-5 flex gap-3">' +
      '    <button type="button" id="' + ID_POPUP + '-nanti" class="flex-1 py-2.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">Nanti saja</button>' +
      '    <button type="button" id="' + ID_POPUP + '-buka" class="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition">Buka Cek Alamat</button>' +
      '  </div></div>';
    document.body.appendChild(p);
    $(ID_POPUP + '-nanti').addEventListener('click', function () { p.remove(); });
    $(ID_POPUP + '-buka').addEventListener('click', function () { p.remove(); window.bukaCekAlamat(); });
    $(ID_POPUP + '-buka').focus();
  }

  function terapkanLencana() {
    pastikanTab();
    pastikanPita();
  }

  function muatLencana(catatDilihat) {
    if (!peranSaya() || typeof dataPengguna === 'undefined' || !dataPengguna || !dataPengguna.token) return Promise.resolve();
    terakhirLencana = Date.now();
    return panggil('cekAlamatLencana', [catatDilihat === true]).then(function (res) {
      if (!res || res.sukses !== true) {
        var p = (res && res.pesan) || '';
        if (/Aksi tidak diizinkan|does not exist|belum tersedia/i.test(p)) {
          // Server belum mendukung / migrasi belum diterapkan: sembunyikan tanpa mengganggu pengguna. Dicoba lagi pada pemicu berikutnya.
          tersedia = false; lencana = null; terapkanLencana();
          return;
        }
        // Gangguan SEMENTARA (koneksi basis data penuh, jaringan): pertahankan tampilan yang ada (tab tidak boleh hilang
        // sendiri) dan coba lagi paling banyak 3 kali dengan jeda 30 detik.
        terapkanLencana();   // Admin Utama: tab tetap dibuat walau panggilan PERTAMA gagal (tanpa lencana)
        if (!timerUlang && percobaanUlang < 3) {
          percobaanUlang++;
          timerUlang = setTimeout(function () { timerUlang = null; if (!terbuka) muatLencana(false); }, 30000);
        }
        return;
      }
      percobaanUlang = 0;
      tersedia = true;
      lencana = { peran: res.peran, kecamatan: res.kecamatan || '', menunggu: Number(res.menunggu) || 0, total: Number(res.total) || 0 };
      terapkanLencana();
      mungkinPopup(0);
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Panel
  // ---------------------------------------------------------------------------------------------
  function opsiKecamatan(semua) {
    var daftar = (typeof DAFTAR_KECAMATAN_MEDAN !== 'undefined' && Array.isArray(DAFTAR_KECAMATAN_MEDAN)) ? DAFTAR_KECAMATAN_MEDAN : [];
    return '<option value="">' + semua + '</option>' + daftar.map(function (k) { return '<option value="' + esc2(k) + '">' + esc2(k) + '</option>'; }).join('');
  }
  function opsiStatus() {
    var o = [['', 'Semua status'], ['MENUNGGU_SAYA', 'Menunggu saya'], ['BELUM', 'Belum dicek'], ['SUDAH_BENAR', 'Sudah benar'], ['DIPERBAIKI', 'Sudah diperbaiki'],
      ['TIDAK_PASTI', 'Belum pasti'], ['DIKEMBALIKAN', 'Dikembalikan'], ['SELESAI', 'Selesai']];
    return o.map(function (x) { return '<option value="' + x[0] + '">' + esc2(x[1]) + '</option>'; }).join('');
  }

  function buatModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.id = ID_MODAL;
    // role/aria-modal/aria-labelledby SENGAJA tidak dipasang di sini: modal-a11y.js menambahkannya otomatis, dan hanya modal yang
    // begitu yang menutup lewat ESC (modal ber-role sendiri dianggap mengatur ESC-nya sendiri).
    modal.className = 'hidden fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 md:p-6 overflow-hidden';
    modal.innerHTML =
      '<div class="bg-white rounded-2xl sm:rounded-3xl max-w-5xl w-full shadow-2xl border border-slate-200/80 flex flex-col max-h-[94vh] max-h-[94dvh]">' +
      '  <div class="shrink-0 flex justify-between items-start gap-3 px-4 sm:px-7 py-4 border-b border-slate-100">' +
      '    <div class="min-w-0"><h3 id="cka-judul" class="text-sm sm:text-base font-bold text-slate-800 tracking-wide uppercase">Cek Alamat Tugas Guru Maghrib Mengaji</h3>' +
      '      <p id="cka-sub" class="text-xs text-slate-500 mt-0.5"></p></div>' +
      '    <button type="button" id="cka-x" aria-label="Tutup" class="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg text-xl font-semibold leading-none transition">&times;</button>' +
      '  </div>' +
      '  <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-7 py-4">' +
      '    <div id="cka-ringkasan" class="mb-3"></div>' +
      '    <div id="cka-buka" class="mb-3"></div>' +
      '    <div class="grid grid-cols-1 sm:grid-cols-4 gap-2.5 mb-3">' +
      '      <div><label for="cka-status" class="block text-xs font-medium text-slate-600 mb-1">Status</label><select id="cka-status" class="' + KELAS_INPUT + '">' + opsiStatus() + '</select></div>' +
      '      <div id="cka-kec-bungkus"><label for="cka-kec" class="block text-xs font-medium text-slate-600 mb-1">Kecamatan</label><select id="cka-kec" class="' + KELAS_INPUT + '">' + opsiKecamatan('Semua kecamatan') + '</select></div>' +
      '      <div class="sm:col-span-2"><label for="cka-cari" class="block text-xs font-medium text-slate-600 mb-1">Cari nama / kelurahan / alamat tugas</label>' +
      '        <div class="flex gap-2"><input type="text" id="cka-cari" maxlength="60" autocomplete="off" class="' + KELAS_INPUT + '" />' +
      '        <button type="button" id="cka-tampil" class="shrink-0 px-4 py-2 bg-sky-600 hover:bg-sky-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-semibold transition">Tampilkan</button></div></div>' +
      '    </div>' +
      '    <p id="cka-info" class="text-xs text-slate-500 font-medium mb-2" aria-live="polite"></p>' +
      '    <div id="cka-daftar" class="space-y-3"></div>' +
      '  </div>' +
      '  <div class="shrink-0 px-4 sm:px-7 py-3 bg-slate-50/90 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 rounded-b-2xl sm:rounded-b-3xl">' +
      '    <div id="cka-halaman" class="flex items-center gap-2"></div>' +
      '    <button type="button" id="cka-tutup" class="ml-auto px-4 py-2.5 bg-slate-200 hover:bg-slate-300 active:scale-95 text-slate-700 rounded-xl text-xs font-semibold transition">Tutup</button>' +
      '  </div></div>';
    document.body.appendChild(modal);
    pasangPendengar();
  }

  function pasangPendengar() {
    modal.addEventListener('click', function (e) {
      // Klik di luar panel TIDAK menutup bila ada isian yang belum dikirim (mudah terjadi tanpa sengaja di ponsel).
      if (e.target === modal) { if (!adaIsian()) tutup(); return; }
      var el = e.target.closest ? e.target.closest('[data-cka]') : null;
      if (!el || el.disabled) return;
      aksiKlik(el.getAttribute('data-cka'), Number(el.getAttribute('data-id')) || 0, el);
    });
    modal.addEventListener('input', function (e) {
      var t = e.target;
      var id = Number(t.getAttribute && t.getAttribute('data-id')) || 0;
      var f = t.getAttribute && t.getAttribute('data-field');
      if (!id || !f) return;
      keadaan(id).nilai[f] = t.type === 'checkbox' ? t.checked : t.value;
    });
    modal.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'cka-buka-kec') { panelBuka.kec = t.value; panelBuka.pratinjau = null; renderBuka(); return; }
      var id = Number(t.getAttribute && t.getAttribute('data-id')) || 0;
      var f = t.getAttribute && t.getAttribute('data-field');
      if (id && f && t.type === 'checkbox') keadaan(id).nilai[f] = t.checked;
    });
    $('cka-x').addEventListener('click', mintaTutup);   // ESC ditangani modal-a11y.js (menekan tombol ini)
    $('cka-tutup').addEventListener('click', mintaTutup);
    $('cka-tampil').addEventListener('click', terapkanFilter);
    $('cka-cari').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); terapkanFilter(); } });
    $('cka-status').addEventListener('change', terapkanFilter);
    $('cka-kec').addEventListener('change', terapkanFilter);
  }

  function terapkanFilter() {
    q.status = $('cka-status').value;
    q.kec = $('cka-kec').value;
    q.cari = $('cka-cari').value.trim();
    q.page = 1;
    muat();
  }

  function sub() {
    var el = $('cka-sub');
    if (!el) return;
    el.textContent = peranSaya() === 'UTAMA'
      ? 'Buka permintaan cek, pantau jawaban per kecamatan, dan berkomunikasi dengan admin GMM pada tiap data guru.'
      : 'Cocokkan alamat tugas tiap guru dengan berkasnya. Jawab, perbaiki alamat tugas, atau tulis catatan untuk Admin Utama.';
  }

  // ---- Ringkasan ----
  function renderRingkasan() {
    var el = $('cka-ringkasan');
    if (!el) return;
    if (!ringkasan || !ringkasan.daftar) { el.innerHTML = ''; return; }
    var utama = peranSaya() === 'UTAMA';
    var jumlah = function (k) { return ringkasan.daftar.reduce(function (s, r) { return s + (Number(r[k]) || 0); }, 0); };
    var chip = function (judul, nilai, kelas) {
      return '<div class="rounded-xl border px-2 py-1.5 sm:px-3 sm:py-2 ' + kelas + '"><div class="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide opacity-80">' + judul + '</div><div class="text-base sm:text-lg font-bold">' + angka(nilai) + '</div></div>';
    };
    var h = '<div class="grid grid-cols-3 sm:grid-cols-6 gap-2">' +
      chip('Total', jumlah('total'), 'bg-slate-50 border-slate-200 text-slate-700') +
      chip('Belum dicek', jumlah('belum') + jumlah('dikembalikan'), 'bg-orange-50 border-orange-200 text-orange-800') +
      chip('Sudah benar', jumlah('sudahBenar'), 'bg-emerald-50 border-emerald-200 text-emerald-700') +
      chip('Diperbaiki', jumlah('diperbaiki'), 'bg-sky-50 border-sky-200 text-sky-700') +
      chip('Belum pasti', jumlah('tidakPasti'), 'bg-amber-50 border-amber-200 text-amber-800') +
      chip('Selesai', jumlah('selesai'), 'bg-slate-50 border-slate-200 text-slate-500') + '</div>';
    if (utama && ringkasan.daftar.length > 0) {
      h += '<details class="mt-3 rounded-xl border border-slate-200 bg-white"><summary class="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700">Ringkasan per kecamatan (' + ringkasan.daftar.length + ')</summary>' +
        '<div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-slate-50 text-slate-500"><tr>' +
        '<th class="text-left px-3 py-2">Kecamatan</th><th class="px-2 py-2">Total</th><th class="px-2 py-2">Belum</th><th class="px-2 py-2">Dijawab</th><th class="px-2 py-2">Dikembalikan</th><th class="px-2 py-2">Selesai</th><th class="text-left px-3 py-2">Panel dibuka</th></tr></thead><tbody>' +
        ringkasan.daftar.map(function (r) {
          var dijawab = (Number(r.sudahBenar) || 0) + (Number(r.diperbaiki) || 0) + (Number(r.tidakPasti) || 0);
          var dibuka = r.terakhirDilihat ? esc2(r.terakhirDilihat) : '<span class="text-rose-600 font-semibold">belum pernah</span>';
          return '<tr class="border-t border-slate-100"><td class="px-3 py-1.5 font-medium text-slate-700">' + esc2(r.kecamatan) + '</td>' +
            '<td class="px-2 py-1.5 text-center">' + angka(r.total) + '</td><td class="px-2 py-1.5 text-center">' + angka(r.belum) + '</td><td class="px-2 py-1.5 text-center">' + angka(dijawab) +
            '</td><td class="px-2 py-1.5 text-center">' + angka(r.dikembalikan) + '</td><td class="px-2 py-1.5 text-center">' + angka(r.selesai) + '</td><td class="px-3 py-1.5 text-slate-600">' + dibuka + '</td></tr>';
        }).join('') + '</tbody></table></div></details>';
    }
    el.innerHTML = h;
  }

  // ---- Buka permintaan (UTAMA) ----
  function renderBuka() {
    var el = $('cka-buka');
    if (!el) return;
    if (peranSaya() !== 'UTAMA') { el.innerHTML = ''; return; }
    if (!panelBuka.tampil) {
      el.innerHTML = '<button type="button" data-cka="buka-tampil" class="px-4 py-2 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-semibold transition">Buka Permintaan Cek</button>';
      return;
    }
    var p = panelBuka.pratinjau;
    var info = '';
    if (p) {
      info = '<p class="mt-2 text-xs text-slate-700">' + esc2(p.pesan || '') + '</p>' +
        (p.baru > 0
          ? '<button type="button" data-cka="buka-eksekusi" ' + (panelBuka.sibuk ? 'disabled ' : '') + 'class="mt-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50">Ya, buka ' + angka(p.baru) + ' permintaan</button>'
          : '<p class="mt-1 text-xs text-slate-500">Tidak ada permintaan baru yang perlu dibuka.</p>');
    }
    el.innerHTML = '<div class="rounded-xl border border-orange-200 bg-orange-50/60 p-3">' +
      '<p class="text-xs font-semibold text-orange-900">Buka permintaan cek alamat tugas untuk Guru Maghrib Mengaji yang bertempat tugas &quot;RUMAH&quot;.</p>' +
      '<div class="mt-2 flex flex-col sm:flex-row gap-2 sm:items-end"><div class="sm:w-64"><label for="cka-buka-kec" class="block text-xs font-medium text-slate-600 mb-1">Kecamatan</label>' +
      '<select id="cka-buka-kec" class="' + KELAS_INPUT + '">' + opsiKecamatan('Semua kecamatan') + '</select></div>' +
      '<button type="button" data-cka="buka-pratinjau" ' + (panelBuka.sibuk ? 'disabled ' : '') + 'class="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50">Pratinjau</button>' +
      '<button type="button" data-cka="buka-tutup" class="px-4 py-2 bg-white border border-slate-300 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition">Batal</button></div>' + info + '</div>';
    var s = $('cka-buka-kec');
    if (s) s.value = panelBuka.kec;
  }

  // ---- Kartu guru ----
  function lencanaStatus(st) {
    return '<span class="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold ' + (KELAS_STATUS[st] || KELAS_STATUS.BELUM) + '">' + esc2(LABEL_STATUS[st] || st) + '</span>';
  }

  function formAksi(r, k) {
    var id = r.id;
    var v = function (f) { return esc2(k.nilai[f] || ''); };
    var catatan = function (judul, wajib) {
      return '<label class="block text-xs font-medium text-slate-600 mt-2 mb-1" for="cka-c-' + id + '">' + judul + (wajib ? ' <span class="text-rose-600">*</span>' : '') + '</label>' +
        '<textarea id="cka-c-' + id + '" data-id="' + id + '" data-field="catatan" rows="2" maxlength="500" class="' + KELAS_INPUT + '">' + v('catatan') + '</textarea>';
    };
    var kirim = function (aksi, label) {
      return '<div class="mt-2 flex gap-2"><button type="button" data-cka="' + aksi + '" data-id="' + id + '" ' + (k.sibuk ? 'disabled ' : '') +
        'class="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50">' + label + '</button>' +
        '<button type="button" data-cka="batal" data-id="' + id + '" class="px-4 py-2 bg-white border border-slate-300 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition">Batal</button></div>';
    };
    var galat = k.galat ? '<p class="mt-2 text-xs font-semibold text-rose-600" role="alert">' + esc2(k.galat) + '</p>' : '';
    var h = '';
    if (k.mode === 'benar') {
      h = '<label class="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" data-id="' + id + '" data-field="cocok" class="mt-0.5" ' + (k.nilai.cocok ? 'checked' : '') + '>' +
        '<span>Saya sudah mencocokkan alamat tugas ini dengan berkas guru.</span></label>' + catatan('Catatan (opsional)', false) + kirim('kirim-benar', 'Kirim: sudah benar');
    } else if (k.mode === 'perbaiki') {
      h = '<p class="text-xs text-slate-600">Alamat tugas sekarang: <strong>' + esc2(r.alamatTugas) + '</strong></p>' +
        '<label class="block text-xs font-medium text-slate-600 mt-2 mb-1" for="cka-a-' + id + '">Alamat tugas yang benar (sesuai berkas guru) <span class="text-rose-600">*</span></label>' +
        '<input type="text" id="cka-a-' + id + '" data-id="' + id + '" data-field="alamat" maxlength="100" autocomplete="off" class="' + KELAS_INPUT + ' uppercase" value="' + v('alamat') + '">' +
        catatan('Catatan (opsional)', false) + kirim('kirim-perbaiki', 'Simpan perbaikan alamat tugas');
    } else if (k.mode === 'tidak') {
      h = catatan('Alasan belum bisa dipastikan', true) + kirim('kirim-tidak', 'Kirim: belum pasti');
    } else if (k.mode === 'balas') {
      h = catatan('Catatan untuk ' + (peranSaya() === 'UTAMA' ? 'admin GMM' : 'Admin Utama'), true) + kirim('kirim-balas', 'Kirim catatan');
    } else if (k.mode === 'kembalikan') {
      h = catatan('Alasan dikembalikan', true) + kirim('kirim-kembalikan', 'Kembalikan ke admin GMM');
    } else if (k.mode === 'selesai') {
      var wajib = r.status === 'BELUM' || r.status === 'DIKEMBALIKAN';
      h = catatan(wajib ? 'Alasan ditutup tanpa jawaban' : 'Catatan penutup (opsional)', wajib) + kirim('kirim-selesai', 'Tandai selesai');
    }
    return h ? '<div class="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-3">' + h + galat + '</div>' : '';
  }

  function tombolAksi(r) {
    var peran = peranSaya();
    var b = function (aksi, label, gelap) {
      return '<button type="button" data-cka="' + aksi + '" data-id="' + r.id + '" class="px-3 py-1.5 rounded-lg text-xs font-semibold transition ' +
        (gelap ? 'bg-sky-600 hover:bg-sky-700 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50') + '">' + label + '</button>';
    };
    var t = [];
    var bisaJawab = (r.status === 'BELUM' || r.status === 'DIKEMBALIKAN') && r.masihRumah && !r.dataDihapus;
    if (peran === 'GMM' && bisaJawab) { t.push(b('mode-benar', 'Sudah benar', true), b('mode-perbaiki', 'Perbaiki alamat tugas', false), b('mode-tidak', 'Belum pasti', false)); }
    if (r.status !== 'SELESAI' && !r.dataDihapus) t.push(b('mode-balas', 'Tulis catatan', false));
    if (peran === 'UTAMA') {
      if (r.status === 'SUDAH_BENAR' || r.status === 'DIPERBAIKI' || r.status === 'TIDAK_PASTI' || r.status === 'SELESAI') t.push(b('mode-kembalikan', 'Kembalikan', false));
      if (r.status !== 'SELESAI') t.push(b('mode-selesai', 'Selesai', true));
    }
    return t.join('');
  }

  function htmlUtas(k) {
    if (!k.utasBuka) return '';
    if (!k.utas) return '<p class="mt-3 text-xs text-slate-500">Memuat utas...</p>';
    if (k.utas.length === 0) return '<p class="mt-3 text-xs text-slate-500">Belum ada catatan.</p>';
    return '<ol class="mt-3 space-y-2">' + k.utas.map(function (m) {
      var utama = m.peran === 'UTAMA';
      var judul = { BUKA: 'membuka permintaan', JAWAB: 'menjawab', BALAS: 'menulis catatan', KEMBALIKAN: 'mengembalikan', SELESAI: 'menandai selesai' }[m.jenis] || m.jenis;
      return '<li class="rounded-xl border px-3 py-2 text-xs ' + (utama ? 'bg-orange-50 border-orange-100' : 'bg-sky-50 border-sky-100') + '">' +
        '<div class="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500"><span><strong class="text-slate-700">' + esc2(m.oleh) + '</strong> (' + (utama ? 'Admin Utama' : 'Admin GMM') + ') ' + esc2(judul) + '</span><span>' + esc2(m.waktu) + '</span></div>' +
        (m.statusSesudah ? '<div class="mt-1">' + lencanaStatus(m.statusSesudah) + '</div>' : '') +
        (m.alamatSesudah ? '<div class="mt-1 text-slate-700">Alamat tugas menjadi: <strong>' + esc2(m.alamatSesudah) + '</strong></div>' : '') +
        (m.isi ? '<div class="mt-1 text-slate-800 whitespace-pre-line break-words">' + esc2(m.isi) + '</div>' : '') + '</li>';
    }).join('') + '</ol>';
  }

  function kartu(r) {
    var k = keadaan(r.id);
    var peta = tautanAman(r.linkPeta);
    var menunggu = r.menunggu === 'GMM' ? 'Menunggu admin GMM' : (r.menunggu === 'UTAMA' ? 'Menunggu Admin Utama' : '');
    var untukSaya = r.menunggu === peranSaya();
    return '<article class="rounded-2xl border ' + (untukSaya ? 'border-orange-300 bg-orange-50/30' : 'border-slate-200 bg-white') + ' p-3 sm:p-4 shadow-2xs">' +
      '<div class="flex flex-wrap items-start justify-between gap-2">' +
      '<div class="min-w-0"><div class="text-sm font-bold text-slate-800 break-words">' + esc2(r.nama || '(data dihapus)') + '</div>' +
      '<div class="text-xs text-slate-500">' + esc2([r.kelurahan, r.kecamatan].filter(Boolean).join(' · ')) + '</div></div>' +
      '<div class="flex flex-wrap items-center gap-1.5">' + lencanaStatus(r.status) +
      (menunggu ? '<span class="text-[11px] ' + (untukSaya ? 'text-orange-700 font-semibold' : 'text-slate-500') + '">' + menunggu + '</span>' : '') + '</div></div>' +
      (r.dataDihapus ? '<p class="mt-2 text-xs font-semibold text-rose-600">Data penerima sudah dihapus. Admin Utama dapat menutup permintaan ini.</p>' : '') +
      '<dl class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">' +
      '<div><dt class="text-slate-500">Tempat tugas</dt><dd class="font-semibold text-slate-800 break-words">' + esc2(r.tempatTugas || '-') + (r.masihRumah ? '' : ' <span class="text-rose-600">(sudah bukan RUMAH)</span>') + '</dd></div>' +
      '<div><dt class="text-slate-500">Alamat tugas</dt><dd class="font-semibold text-slate-800 break-words">' + esc2(r.alamatTugas || '-') + '</dd></div>' +
      '<div class="sm:col-span-2"><dt class="text-slate-500">Alamat rumah (pembanding)</dt><dd class="text-slate-700 break-words">' + esc2(r.alamatRumah || '-') +
      (r.samaAlamatRumah ? ' <span class="ml-1 inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-semibold">SAMA dengan alamat tugas, cek berkasnya</span>' : '') + '</dd></div></dl>' +
      '<div class="mt-3 flex flex-wrap items-center gap-2">' + tombolAksi(r) +
      '<button type="button" data-cka="utas" data-id="' + r.id + '" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition">Utas (' + angka(r.jumlahPesan) + ')</button>' +
      (peta ? '<a href="' + esc2(peta) + '" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-700 underline">Lihat peta</a>' : '') + '</div>' +
      formAksi(r, k) + htmlUtas(k) + '</article>';
  }

  function renderDaftar() {
    var daftarEl = $('cka-daftar'), info = $('cka-info'), hal = $('cka-halaman');
    if (!daftarEl) return;
    if (tahap === 'memuat' && !data) { daftarEl.innerHTML = '<p class="py-8 text-center text-sm text-slate-500">Memuat...</p>'; info.textContent = ''; hal.innerHTML = ''; return; }
    if (tahap === 'galat') {
      daftarEl.innerHTML = '<div class="py-6 text-center"><p class="text-sm text-rose-600 font-semibold mb-3" role="alert">' + esc2(pesanGalat) + '</p>' +
        '<button type="button" data-cka="ulang" class="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold transition">Coba lagi</button></div>';
      info.textContent = ''; hal.innerHTML = ''; return;
    }
    if (!data) return;
    info.textContent = angka(data.total) + ' guru' + (tahap === 'memuat' ? ' · memperbarui...' : '');
    daftarEl.innerHTML = data.daftar.length === 0
      ? '<p class="py-8 text-center text-sm text-slate-500">' + (data.total === 0 && !q.status && !q.kec && !q.cari
        ? (peranSaya() === 'UTAMA' ? 'Belum ada permintaan. Klik "Buka Permintaan Cek".' : 'Belum ada permintaan cek untuk kecamatan Anda.')
        : 'Tidak ada data yang cocok dengan filter.') + '</p>'
      : data.daftar.map(kartu).join('');
    var total = Math.max(1, Math.ceil(data.total / (data.ukuranHalaman || 25)));
    hal.innerHTML = total <= 1 ? '' :
      '<button type="button" data-cka="sebelumnya" ' + (q.page <= 1 ? 'disabled ' : '') + 'class="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold disabled:opacity-40">Sebelumnya</button>' +
      '<span class="text-xs text-slate-600">Halaman ' + q.page + ' / ' + total + '</span>' +
      '<button type="button" data-cka="berikutnya" ' + (q.page >= total ? 'disabled ' : '') + 'class="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold disabled:opacity-40">Berikutnya</button>';
  }

  function render() { sub(); renderRingkasan(); renderBuka(); renderDaftar(); }

  // ---- Muat data ----
  function muat() {
    if (!terbuka) return Promise.resolve();
    var nomor = ++seq;
    tahap = 'memuat';
    renderDaftar();
    var filter = { status: q.status, kecamatan: q.kec, cari: q.cari, halaman: q.page };
    return Promise.all([panggil('cekAlamatDaftar', [filter]), panggil('cekAlamatRingkasan', [])]).then(function (h) {
      if (nomor !== seq || !terbuka) return;
      var d = h[0], rg = h[1];
      if (!d || d.sukses !== true) { pesanGalat = pesanRamah(d, 'Gagal memuat daftar.'); tahap = 'galat'; renderDaftar(); return; }
      d.daftar = Array.isArray(d.daftar) ? d.daftar : [];
      d.total = Number(d.total) || 0;
      var maks = Math.max(1, Math.ceil(d.total / (d.ukuranHalaman || 25)));
      if (d.daftar.length === 0 && d.total > 0 && q.page > maks) { q.page = maks; return muat(); }
      data = d;
      ringkasan = rg && rg.sukses === true ? rg : ringkasan;
      tahap = 'siap';
      render();
    });
  }

  function segarkanSemua() {
    return Promise.all([muat(), muatLencana(false)]);
  }

  function muatUtas(id) {
    var k = keadaan(id);
    return panggil('cekAlamatUtas', [id]).then(function (res) {
      k.utas = res && res.sukses === true && Array.isArray(res.pesan) ? res.pesan : [];
      if (!(res && res.sukses === true)) k.galat = pesanRamah(res, 'Gagal memuat utas.');
      if (terbuka) renderDaftar();
    });
  }

  // ---- Aksi ----
  function aksiKlik(aksi, id, el) {
    var k = id ? keadaan(id) : null;
    if (aksi === 'ulang') { muat(); return; }
    if (aksi === 'sebelumnya') { if (q.page > 1) { q.page--; muat(); } return; }
    if (aksi === 'berikutnya') { q.page++; muat(); return; }
    if (aksi === 'buka-tampil') { panelBuka.tampil = true; panelBuka.pratinjau = null; renderBuka(); return; }
    if (aksi === 'buka-tutup') { panelBuka.tampil = false; renderBuka(); return; }
    if (aksi === 'buka-pratinjau' || aksi === 'buka-eksekusi') { bukaPermintaan(aksi === 'buka-eksekusi' ? 'eksekusi' : 'pratinjau'); return; }
    if (!k) return;
    if (aksi === 'utas') {
      k.utasBuka = !k.utasBuka;
      if (k.utasBuka && !k.utas) muatUtas(id);
      renderDaftar();
      return;
    }
    if (aksi.indexOf('mode-') === 0) { k.mode = aksi.slice(5); k.galat = ''; renderDaftar(); return; }
    if (aksi === 'batal') { k.mode = ''; k.galat = ''; renderDaftar(); return; }
    if (aksi.indexOf('kirim-') === 0) kirimAksi(aksi.slice(6), id, k);
  }

  function bukaPermintaan(mode) {
    if (panelBuka.sibuk) return;
    panelBuka.sibuk = true; renderBuka();
    panggil('cekAlamatBuka', [mode, panelBuka.kec]).then(function (res) {
      panelBuka.sibuk = false;
      if (!res || res.sukses !== true) { toast(pesanRamah(res, 'Gagal membuka permintaan.'), 'gagal'); renderBuka(); return; }
      if (mode === 'pratinjau') { panelBuka.pratinjau = res; renderBuka(); return; }
      toast(res.pesan || 'Permintaan dibuka.', 'sukses');
      panelBuka.tampil = false; panelBuka.pratinjau = null;
      q.page = 1;
      segarkanSemua();
    });
  }

  function kirimAksi(jenis, id, k) {
    if (k.sibuk) return;
    var cat = (k.nilai.catatan || '').trim();
    var r = null;
    if (data) data.daftar.forEach(function (x) { if (x.id === id) r = x; });
    var galat = '', aksi = '', args = [];
    if (jenis === 'benar') {
      if (!k.nilai.cocok) galat = 'Centang pernyataan bahwa alamat tugas sudah dicocokkan dengan berkas guru.';
      aksi = 'cekAlamatJawab'; args = [id, 'SUDAH_BENAR', cat, k.nilai.cocok === true];
    } else if (jenis === 'tidak') {
      if (cat.length < 5) galat = 'Alasan wajib diisi (minimal 5 karakter).';
      aksi = 'cekAlamatJawab'; args = [id, 'TIDAK_PASTI', cat, false];
    } else if (jenis === 'perbaiki') {
      var al = (k.nilai.alamat || '').trim();
      if (al.length < 5) galat = 'Alamat tugas yang benar wajib diisi (minimal 5 karakter).';
      else if (r && !window.confirm('Alamat tugas akan diganti:\n\nDari: ' + r.alamatTugas + '\nMenjadi: ' + al.toUpperCase() + '\n\nLanjutkan?')) return;
      aksi = 'cekAlamatPerbaiki'; args = [id, al, cat];
    } else if (jenis === 'balas') {
      if (cat.length < 5) galat = 'Catatan wajib diisi (minimal 5 karakter).';
      aksi = 'cekAlamatBalas'; args = [id, cat];
    } else if (jenis === 'kembalikan') {
      if (cat.length < 5) galat = 'Alasan wajib diisi (minimal 5 karakter).';
      aksi = 'cekAlamatKembalikan'; args = [id, cat];
    } else if (jenis === 'selesai') {
      var wajib = r && (r.status === 'BELUM' || r.status === 'DIKEMBALIKAN');
      if (wajib && cat.length < 5) galat = 'Alasan wajib diisi (minimal 5 karakter).';
      aksi = 'cekAlamatSelesai'; args = [id, cat];
    }
    if (galat) { k.galat = galat; renderDaftar(); return; }
    if (!aksi) return;
    k.sibuk = true; k.galat = ''; renderDaftar();
    panggil(aksi, args).then(function (res) {
      k.sibuk = false;
      if (!res || res.sukses !== true) { k.galat = pesanRamah(res, 'Gagal menyimpan.'); if (terbuka) renderDaftar(); return; }
      toast(res.pesan || 'Tersimpan.', 'sukses');
      k.mode = ''; k.nilai = {}; k.galat = ''; k.utas = null;
      if (k.utasBuka) muatUtas(id);
      segarkanSemua();
    });
  }

  /** Ada kartu dengan formulir terbuka yang sudah diisi (belum dikirim)? */
  function adaIsian() {
    return Object.keys(ui).some(function (id) {
      var k = ui[id];
      return !!k.mode && Object.keys(k.nilai || {}).some(function (f) { var v = k.nilai[f]; return v === true || (typeof v === 'string' && v.trim() !== ''); });
    });
  }
  /** Tombol Tutup / X / ESC: bila ada isian yang belum dikirim, minta konfirmasi dulu. */
  function mintaTutup() {
    if (adaIsian() && !window.confirm('Ada isian yang belum dikirim. Tutup dan buang isian?')) return;
    tutup();
  }

  function tutup() {
    terbuka = false;
    seq++;
    data = null; ringkasan = null; ui = {};   // nama/alamat tidak disimpan di memori setelah ditutup; dibuka lagi = dimuat segar
    panelBuka = { tampil: false, kec: '', pratinjau: null, sibuk: false };
    if (modal) {
      // Kosongkan juga isi DOM: nama dan alamat guru tidak boleh tertinggal di halaman yang tersembunyi (perangkat bersama).
      ['cka-daftar', 'cka-ringkasan', 'cka-buka', 'cka-halaman'].forEach(function (id) { var e = $(id); if (e) e.innerHTML = ''; });
      var info = $('cka-info'); if (info) info.textContent = '';
      modal.classList.add('hidden');
    }
    muatLencana(false);
  }

  // ---------------------------------------------------------------------------------------------
  // Pintu masuk dan pemicu
  // ---------------------------------------------------------------------------------------------
  window.bukaCekAlamat = function () {
    if (typeof pastikanLogin === 'function' && !pastikanLogin()) return;
    if (!peranSaya() || terbuka) return;
    buatModal();
    terbuka = true;
    q = { status: '', kec: '', cari: '', page: 1 };
    $('cka-status').value = ''; $('cka-kec').value = ''; $('cka-cari').value = '';
    // Akun GMM berkecamatan hanya mengurus satu kecamatan: pilihan kecamatan tidak ditampilkan.
    $('cka-kec-bungkus').classList.toggle('hidden', !!(lencana && lencana.peran === 'GMM' && lencana.kecamatan));
    var popup = $(ID_POPUP); if (popup) popup.remove();
    modal.classList.remove('hidden');
    pastikanPita();
    muatLencana(true);          // mencatat "kecamatan ini sudah membuka panel" (hanya akun GMM berkecamatan)
    muat();
  };

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Date.now() - terakhirLencana > JEDA_LENCANA && !terbuka) muatLencana(false);
  });
  window.addEventListener('online', function () { if (Date.now() - terakhirLencana > JEDA_LENCANA && !terbuka) muatLencana(false); });

  muatLencana(false);
})();
