/**
 * public/js/app-penanda-mui.js
 * Penanda "diinput oleh akun MUI" untuk Admin Utama (dan MUI) di Lihat Data. Dimuat malas oleh
 * app-pesan-periode.js (muatSkripAdmin) hanya untuk peran UTAMA dan MUI. Rancangan: plans/plan-akun-mui-bisa-input.md
 *
 * Isi:
 *  - lencana "Input MUI" di setiap baris yang diinput akun MUI (badgePenginputMui, dipanggil app-transaksi.js);
 *  - filter "Penginput" (Semua / MUI / Kecamatan / Kemenag / Admin Utama) yang berlaku bersama filter lain;
 *  - ringkasan "Diinput MUI: N data (Ustadz x · Ustadzah y)" mengikuti filter yang aktif;
 *  - keterangan "Diinput oleh <nama> (<peran>) pada <waktu>" di Detail data;
 *  - khusus MUI: lencana jumlah data "belum diperiksa" pada tab Lihat Data, agar antrean verifikasi rekomendasi
 *    tidak terlupakan sejak halaman awal MUI adalah tab Input.
 *
 * Data penginput datang dari SERVER (kolom baris daftar indeks 23 = kategori, 24 = nama akun; detail indeks 48-51) dan
 * hanya diisi untuk Admin Utama & MUI. Peran lain menerima string kosong, jadi fungsi di sini otomatis tidak
 * menampilkan apa pun bagi mereka. Teks dari server selalu lewat esc().
 */
(function () {
  'use strict';

  var ID_FILTER = 'filter-penginput';
  var ID_WRAP_FILTER = 'wrap-filter-penginput';
  var ID_RINGKASAN = 'ringkasan-penginput-mui';
  var ID_LENCANA_TAB = 'lencana-belum-diperiksa-mui';
  var LABEL = { MUI: 'MUI', KECAMATAN: 'Kecamatan', KEMENAG: 'Kemenag', UTAMA: 'Admin Utama' };

  function $(id) { return document.getElementById(id); }
  function esc2(v) {
    if (typeof window.esc === 'function') return window.esc(v);
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function peran() {
    return (typeof dataPengguna !== 'undefined' && dataPengguna) ? String(dataPengguna.role || '').toUpperCase() : '';
  }
  function berhak() { var p = peran(); return p === 'UTAMA' || p === 'MUI'; }
  function adalahLayananMui(l) {
    var x = String(l || '').toUpperCase().trim();
    return x === 'USTADZ' || x === 'USTADZAH' || x === 'USTADZ/USTADZAH';
  }

  // ---------------------------------------------------------------------------------------------
  // Dipanggil app-transaksi.js
  // ---------------------------------------------------------------------------------------------
  /** Lencana kecil di bawah status verifikasi pada baris tabel. */
  window.badgePenginputMui = function (row) {
    if (!berhak() || !row || row[23] !== 'MUI') return '';
    var nama = String(row[24] || '').trim();
    return '<div class="mt-1"><span title="' + esc2('Diinput oleh ' + (nama || 'akun MUI') + ' (MUI)') + '" ' +
      'class="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-md shadow-2xs">' +
      'Input MUI</span></div>';
  };

  /** Filter "Penginput": true bila baris lolos. Tanpa pilihan (atau peran tak berhak) selalu lolos. */
  window.lolosFilterPenginputMui = function (row) {
    if (!berhak()) return true;
    var el = $(ID_FILTER);
    var v = el ? el.value : '';
    if (!v) return true;
    return !!row && row[23] === v;
  };

  window.djpmPenandaMui = {
    /** Dipanggil setelah data disaring: ringkasan jumlah (mengikuti filter) + lencana tab MUI (dari seluruh data). */
    setelahSaring: function (daftarLolos) {
      // sinkronTampilan lebih dulu: akun bisa berganti di tab yang sama (UTAMA -> Kecamatan) dan kontrol penanda
      // tidak boleh tersisa untuk peran yang tidak berhak.
      try { sinkronTampilan(); perbaruiRingkasan(daftarLolos); perbaruiLencanaTab(); } catch (e) {
        try { console.warn('[penanda-mui] dilewati:', e); } catch (_e) { /* abaikan */ }
      }
    },
    /** HTML keterangan penginput untuk Detail data (d = dataLengkap dari server). */
    htmlDetail: function (d) {
      if (!berhak() || !d || !d[48]) return '';
      var kat = String(d[48]);
      var nama = String(d[49] || '').trim();
      var waktu = String(d[50] || '').trim();
      var mui = kat === 'MUI';
      var kelas = mui ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-700';
      return '<div class="mb-4 border rounded-lg px-4 py-2.5 text-xs ' + kelas + '">Diinput oleh <strong>' + esc2(nama || '-') + '</strong> (' +
        esc2(LABEL[kat] || kat) + ')' + (waktu ? ' pada ' + esc2(waktu) : '') + '</div>';
    },
    hitungMui: hitungMui
  };

  // ---------------------------------------------------------------------------------------------
  // Hitungan
  // ---------------------------------------------------------------------------------------------
  function hitungMui(daftar) {
    var h = { total: 0, ustadz: 0, ustadzah: 0 };
    (daftar || []).forEach(function (r) {
      if (!r || r[23] !== 'MUI') return;
      h.total++;
      var l = String(r[7] || '').toUpperCase().trim();
      if (l === 'USTADZAH') h.ustadzah++; else h.ustadz++;
    });
    return h;
  }

  function perbaruiRingkasan(daftarLolos) {
    var el = $(ID_RINGKASAN);
    if (!el) return;
    var semua = (typeof masterDataLihat !== 'undefined' && Array.isArray(masterDataLihat)) ? masterDataLihat : [];
    var adaMui = berhak() && semua.some(function (r) { return r && r[23] === 'MUI'; });
    if (!adaMui) { el.classList.add('hidden'); return; }          // belum ada input MUI: tidak perlu menampilkan apa pun
    var h = hitungMui(daftarLolos);
    el.textContent = 'Diinput MUI: ' + h.total + ' data (Ustadz ' + h.ustadz + ' · Ustadzah ' + h.ustadzah + ')';
    el.classList.remove('hidden');
  }

  function perbaruiLencanaTab() {
    var tab = $('tab-rekap');
    if (!tab) return;
    var lencana = $(ID_LENCANA_TAB);
    if (peran() !== 'MUI') { if (lencana) lencana.classList.add('hidden'); return; }
    var semua = (typeof masterDataLihat !== 'undefined' && Array.isArray(masterDataLihat)) ? masterDataLihat : [];
    var n = 0;
    semua.forEach(function (r) {
      if (r && adalahLayananMui(r[7]) && String(r[20] || 'BELUM_DIPERIKSA').toUpperCase() === 'BELUM_DIPERIKSA') n++;
    });
    if (!lencana) {
      lencana = document.createElement('span');
      lencana.id = ID_LENCANA_TAB;
      lencana.className = 'ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-amber-400 text-slate-900 text-[10px] font-bold align-middle';
      tab.appendChild(lencana);
    }
    lencana.textContent = n > 99 ? '99+' : String(n);
    lencana.title = n + ' data Ustadz/Ustadzah belum diperiksa rekomendasinya';
    lencana.classList.toggle('hidden', n === 0);
  }

  // ---------------------------------------------------------------------------------------------
  // Pemasangan UI (idempoten)
  // ---------------------------------------------------------------------------------------------
  function pasangFilter() {
    if ($(ID_WRAP_FILTER)) return;
    var acuan = $('filter-verifikasi');
    var wadah = acuan && acuan.parentNode;
    if (!wadah || !wadah.parentNode) return;
    var wrap = document.createElement('div');
    wrap.id = ID_WRAP_FILTER;
    var label = document.createElement('label');
    label.className = 'block text-xs font-medium text-slate-600 mb-1';
    label.setAttribute('for', ID_FILTER);
    label.textContent = 'Filter Penginput';
    var sel = document.createElement('select');
    sel.id = ID_FILTER;
    sel.className = acuan.className;
    [['', '-- Semua Penginput --'], ['MUI', 'Diinput MUI'], ['KECAMATAN', 'Diinput Kecamatan'], ['KEMENAG', 'Diinput Kemenag'], ['UTAMA', 'Diinput Admin Utama']].forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o[0]; opt.textContent = o[1];
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () {
      if (typeof halamanSekarang !== 'undefined') { try { halamanSekarang = 1; } catch (_e) { /* abaikan */ } }
      if (typeof saringDanTampilkanTabel === 'function') saringDanTampilkanTabel();
    });
    wrap.appendChild(label);
    wrap.appendChild(sel);
    wadah.parentNode.insertBefore(wrap, wadah.nextSibling);
  }

  function pasangRingkasan() {
    if ($(ID_RINGKASAN)) return;
    var info = $('info-total-penerima');
    if (!info || !info.parentNode) return;
    var el = document.createElement('div');
    el.id = ID_RINGKASAN;
    el.className = 'hidden text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 mt-2 inline-block';
    // Kolom kiri (judul + keterangan) agar tidak mengganggu baris flex yang memuat 'Total Data'.
    (info.previousElementSibling || info.parentNode).appendChild(el);
  }

  function pasangResetFilter() {
    if (typeof window.resetSemuaFilter !== 'function' || window.resetSemuaFilter.__penginput) return;
    var asli = window.resetSemuaFilter;
    var bungkus = function () {
      var el = $(ID_FILTER);
      if (el) el.value = '';                       // "Reset" juga mengosongkan filter Penginput
      return asli.apply(this, arguments);
    };
    bungkus.__penginput = true;
    window.resetSemuaFilter = bungkus;
  }

  /** Tampilkan/sembunyikan kontrol sesuai peran sekarang (akun bisa berganti di tab yang sama tanpa muat ulang). */
  function sinkronTampilan() {
    var tampil = berhak();
    var w = $(ID_WRAP_FILTER);
    if (w) w.classList.toggle('hidden', !tampil);
    if (!tampil) {
      var r = $(ID_RINGKASAN); if (r) r.classList.add('hidden');
      var l = $(ID_LENCANA_TAB); if (l) l.classList.add('hidden');
      var f = $(ID_FILTER); if (f) f.value = '';
    }
  }

  function mulai() {
    if (!berhak()) return;
    pasangFilter();
    pasangRingkasan();
    pasangResetFilter();
    sinkronTampilan();
    // Data Lihat Data bisa sudah tampil sebelum skrip ini selesai dimuat: gambar ulang sekali agar lencana muncul.
    if (typeof masterDataLihat !== 'undefined' && Array.isArray(masterDataLihat) && masterDataLihat.length && typeof saringDanTampilkanTabel === 'function') {
      try { saringDanTampilkanTabel(); } catch (_e) { /* abaikan */ }
    }
  }

  window.addEventListener('djpm:swr-invalidated', sinkronTampilan);
  mulai();
})();
