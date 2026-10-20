/**
 * public/js/app-laporan-progres.js
 * Laporan PDF "Progres Verifikasi" untuk pimpinan -- HANYA Admin Utama. Dimuat malas oleh
 * app-pesan-periode.js (muatSkripAdmin), jadi peran lain tidak pernah mengunduh berkas ini.
 * Rancangan lengkap: plans/plan-pdf-dashboard-progres.md
 *
 * Dua hal yang dikerjakan:
 *  1. Layar dashboard UTAMA dibagi "A. Layanan Kecamatan" dan "B. Layanan Kemenag" (membungkus
 *     renderDashboardProgres tanpa mengubah app-transaksi.js; bila gagal, tampilan asli dibiarkan).
 *  2. Tombol "Cetak Laporan PDF": ambil data SEGAR -> susun #area-laporan-cetak -> window.print()
 *     (tujuan "Simpan sebagai PDF"). Kartu di laporan disalin dari kartu di layar, jadi identik.
 * Laporan hanya berisi angka agregat per layanan (tanpa data pribadi). Semua teks dipasang lewat
 * textContent; kartu disalin dari HTML aplikasi yang sudah di-escape.
 */
(function () {
  'use strict';

  var NAMA_PROGRAM = 'Data Penerima Dana Jasa Pelayanan Kepada Warga Pelayan Masyarakat Kota Medan Tahun 2027';
  var ID_AREA = 'area-laporan-cetak';
  var ID_STYLE_STATIS = 'lp-style-statis';
  var ID_STYLE_HALAMAN = 'lp-style-halaman';
  var ID_TOMBOL = 'btn-cetak-laporan-progres';
  var ID_TOMBOL_UNDUH = 'btn-unduh-laporan-progres';
  // Versi (?v=) skrip ini, dipakai juga untuk memuat pustaka PDF supaya cache ikut terbuang bersama-sama.
  var VERSI = '';
  try { VERSI = ((document.currentScript && /[?&]v=([^&]+)/.exec(document.currentScript.src)) || [])[1] || ''; } catch (_e) { VERSI = ''; }
  var BATAS_TUNGGU_MS = 45000;
  var BATAS_BERSIH_MS = 5 * 60 * 1000;
  var BATAS_PUSTAKA_MS = 30000;

  var sedangMenyiapkan = false;
  var pembersihTerakhir = null;

  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function adalahUtama() {
    return typeof dataPengguna !== 'undefined' && !!dataPengguna && !!dataPengguna.token &&
      String(dataPengguna.role || '').toUpperCase() === 'UTAMA';
  }
  function toast(pesan, jenis, durasi) {
    if (typeof tampilkanToast === 'function') tampilkanToast(pesan, jenis || 'info', { durasi: durasi || 6000 });
  }
  function norm(v) { return (v == null ? '' : String(v)).trim().toUpperCase().replace(/\s+/g, ' '); }
  /** 1254 -> "1.254" (tanpa bergantung pada data locale perangkat). */
  function angka(n) {
    var x = Math.round(Number(n) || 0);
    var s = String(Math.abs(x)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (x < 0 ? '-' : '') + s;
  }
  function buat(tag, kelas, teks) {
    var e = document.createElement(tag);
    if (kelas) e.className = kelas;
    if (teks != null) e.textContent = teks;
    return e;
  }

  // ---------------------------------------------------------------------------------------------
  // Perhitungan (murni)
  // ---------------------------------------------------------------------------------------------
  function jumlahkan(daftar) {
    var j = { layanan: 0, kuota: 0, total: 0, sisa: 0, proses: 0, ms: 0, btl: 0, tms: 0, persen: 0 };
    (daftar || []).forEach(function (k) {
      j.layanan += 1;
      j.kuota += Number(k.kuota) || 0;
      j.total += Number(k.total) || 0;
      j.sisa += Number(k.sisaKuota) || 0;
      j.proses += Number(k.prosesVerifikasi) || 0;
      j.ms += Number(k.memenuhiSyarat) || 0;
      j.btl += Number(k.berkasTidakLengkap) || 0;
      j.tms += Number(k.tidakMemenuhiSyarat) || 0;
    });
    j.persen = j.total > 0 ? Math.round(((j.ms + j.tms) / j.total) * 100) : 0;
    return j;
  }

  /** Indeks kartu per kelompok. B = layanan yang ada di master Kemenag; selain itu A. */
  function kelompokkan(kartu, master) {
    var daftarKemenag = {};
    ((master && master.kemenag) || []).forEach(function (l) { daftarKemenag[norm(l)] = true; });
    var hasil = { A: [], B: [] };
    var dikenal = {};
    ((master && master.kecamatan) || []).forEach(function (l) { dikenal[norm(l)] = true; });
    (kartu || []).forEach(function (k, i) {
      var nama = norm(k.layanan);
      if (daftarKemenag[nama]) { hasil.B.push(i); return; }
      if (!dikenal[nama]) {
        try { console.warn('[laporan-progres] layanan tidak ada di master, dimasukkan ke A:', k.layanan); } catch (_e) { /* abaikan */ }
      }
      hasil.A.push(i);
    });
    return hasil;
  }

  function masterAktif(cadangan) {
    var m = cadangan;
    if (!m || !Array.isArray(m.kecamatan) || !Array.isArray(m.kemenag)) {
      m = (typeof masterLayanan !== 'undefined') ? masterLayanan : null;
    }
    return m || { kecamatan: [], kemenag: [] };
  }

  function namaBerkas(kecFilter, tanggalWIB) {
    var cakupan = kecFilter ? norm(kecFilter).replace(/[^A-Z0-9 ]/g, '').replace(/ /g, '-') : 'SEMUA';
    if (!cakupan) cakupan = 'SEMUA';
    return 'Laporan-Progres-Verifikasi-DJPM-2027_' + cakupan + '_' + tanggalWIB;
  }

  // ---------------------------------------------------------------------------------------------
  // Waktu (WIB) -- memakai helper app-pesan-periode.js bila ada, dengan cadangan sendiri
  // ---------------------------------------------------------------------------------------------
  var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  function komponenWIB(t) {
    var w = new Date(t.getTime() + 7 * 3600000);
    return { y: w.getUTCFullYear(), mo: w.getUTCMonth(), d: w.getUTCDate(), h: w.getUTCHours(), mi: w.getUTCMinutes(), hari: w.getUTCDay() };
  }
  function waktuPanjang(t) {
    if (window.djpmWaktu && typeof window.djpmWaktu.panjangWIB === 'function') {
      var s = window.djpmWaktu.panjangWIB(t.toISOString());
      if (s) return s;
    }
    var k = komponenWIB(t);
    return HARI[k.hari] + ', ' + k.d + ' ' + BULAN[k.mo] + ' ' + k.y + ' pukul ' + pad(k.h) + '.' + pad(k.mi) + ' WIB';
  }
  function waktuPendek(t) {
    var k = komponenWIB(t);
    return pad(k.d) + '-' + pad(k.mo + 1) + '-' + k.y + ' ' + pad(k.h) + '.' + pad(k.mi) + ' WIB';
  }
  function tanggalIso(t) {
    var k = komponenWIB(t);
    return k.y + '-' + pad(k.mo + 1) + '-' + pad(k.d);
  }

  // ---------------------------------------------------------------------------------------------
  // Layar: bagi kartu menjadi A dan B (khusus UTAMA)
  // ---------------------------------------------------------------------------------------------
  function teksSubtotal(el, j) {
    el.textContent = '';
    function tebal(t) { var b = document.createElement('b'); b.className = 'text-slate-700'; b.textContent = t; return b; }
    el.appendChild(document.createTextNode('Total '));
    el.appendChild(tebal(angka(j.total)));
    el.appendChild(document.createTextNode(' · Sisa Kuota '));
    el.appendChild(tebal(angka(j.sisa)));
    el.appendChild(document.createTextNode(' · '));
    el.appendChild(tebal(j.persen + '%'));
    el.appendChild(document.createTextNode(' sudah diverifikasi'));
  }

  function pisahkanAB(res) {
    var isi = $('isi-dashboard-progres');
    if (!isi || !res || !Array.isArray(res.kartu) || res.kartu.length === 0) return;
    var grid = isi.firstElementChild;
    if (!grid || !grid.classList || !grid.classList.contains('grid')) return;
    var kartuEl = Array.prototype.slice.call(grid.children);
    if (kartuEl.length !== res.kartu.length) return;               // tidak yakin sama -> biarkan tampilan asli

    var kel = kelompokkan(res.kartu, masterAktif());
    kartuEl.forEach(function (el, i) { el.setAttribute('data-lp-i', String(i)); });

    var pembungkus = buat('div');
    [['A', 'A. Layanan Kecamatan', 'Kecamatan'], ['B', 'B. Layanan Kemenag', 'Kemenag']].forEach(function (b, n) {
      var idx = kel[b[0]];
      var j = jumlahkan(idx.map(function (i) { return res.kartu[i]; }));
      var bagian = buat('section', '');
      bagian.setAttribute('data-lp-bagian', b[0]);
      if (n > 0) bagian.style.marginTop = '1.5rem';
      var kepala = buat('div', 'flex flex-wrap items-baseline justify-between gap-2 mb-3 pb-1 border-b border-slate-200');
      kepala.appendChild(buat('h4', 'text-sm font-bold text-slate-800 uppercase', b[1]));
      var sub = buat('p', 'text-[11px] text-slate-500');
      teksSubtotal(sub, j);
      kepala.appendChild(sub);
      bagian.appendChild(kepala);
      if (idx.length === 0) {
        bagian.appendChild(buat('p', 'text-slate-400 italic text-sm py-2', 'Belum ada data untuk layanan ' + b[2] + '.'));
      } else {
        var g = buat('div', grid.className);
        idx.forEach(function (i) { g.appendChild(kartuEl[i]); });
        bagian.appendChild(g);
      }
      pembungkus.appendChild(bagian);
    });
    isi.textContent = '';
    isi.appendChild(pembungkus);
  }

  function pasangPembungkusRender() {
    if (typeof window.renderDashboardProgres !== 'function' || window.renderDashboardProgres.__lp) return;
    var asli = window.renderDashboardProgres;
    var bungkus = function (res) {
      var hasil = asli.apply(this, arguments);
      try {
        sinkronTombol();
        if (adalahUtama()) pisahkanAB(res);
      } catch (e) {
        try { console.warn('[laporan-progres] pemisah A/B dilewati:', e); } catch (_e) { /* abaikan */ }
      }
      return hasil;
    };
    bungkus.__lp = true;
    window.renderDashboardProgres = bungkus;
  }

  // ---------------------------------------------------------------------------------------------
  // Tombol
  // ---------------------------------------------------------------------------------------------
  var IKON_CETAK = '<svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"/></svg>';

  var IKON_UNDUH = '<svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>';

  // Urutan di footer: [Unduh PDF] [Cetak] [Tutup]
  var DEF_TOMBOL = [
    { id: ID_TOMBOL_UNDUH, ikon: IKON_UNDUH, label: 'Unduh PDF', warna: 'bg-emerald-600 hover:bg-emerald-700', judul: 'Unduh laporan sebagai file PDF.', mode: 'unduh' },
    { id: ID_TOMBOL, ikon: IKON_CETAK, label: 'Cetak', warna: 'bg-sky-600 hover:bg-sky-700', judul: 'Cetak laporan. Di dialog cetak pilih Tujuan: Simpan sebagai PDF.', mode: 'cetak' }
  ];

  function semuaTombol() {
    return DEF_TOMBOL.map(function (d) { return $(d.id); }).filter(Boolean);
  }

  function aturTombol(tombol, menyiapkan) {
    var def = tombol.__lp;
    tombol.disabled = !!menyiapkan;
    var label = tombol.querySelector('.lp-label');
    if (!label) {
      tombol.innerHTML = def.ikon;
      label = document.createElement('span');
      label.className = 'lp-label';
      tombol.appendChild(label);
    }
    label.textContent = menyiapkan ? 'Menyiapkan…' : def.label;
  }

  function sinkronTombol() {
    var modal = $('modal-dashboard-progres');
    if (!adalahUtama()) { semuaTombol().forEach(function (t) { t.classList.add('hidden'); }); return; }
    if (!modal) return;
    var kotak = modal.firstElementChild;
    var footer = kotak && kotak.lastElementChild;
    for (var i = DEF_TOMBOL.length - 1; i >= 0; i--) {
      var def = DEF_TOMBOL[i];
      var tombol = $(def.id);
      if (!tombol) {
        if (!footer) return;
        tombol = buat('button', 'px-4 py-2 mr-2 ' + def.warna + ' text-white rounded-xl text-xs font-medium transition inline-flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed');
        tombol.id = def.id;
        tombol.type = 'button';
        tombol.title = def.judul;
        tombol.__lp = def;
        aturTombol(tombol, false);
        tombol.addEventListener('click', def.mode === 'unduh' ? unduhLaporan : cetakLaporan);
        footer.insertBefore(tombol, footer.firstChild);
      }
      tombol.classList.remove('hidden');
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Pengambilan data segar
  // ---------------------------------------------------------------------------------------------
  function panggilSekali(aksi, args) {
    return new Promise(function (resolve, reject) {
      var selesai = false;
      var timer = setTimeout(function () { if (!selesai) { selesai = true; reject(new Error('Waktu tunggu server habis.')); } }, BATAS_TUNGGU_MS);
      function akhir(fn, v) { if (selesai) return; selesai = true; clearTimeout(timer); fn(v); }
      try {
        google.script.run
          .withSuccessHandler(function (r) { akhir(resolve, r); })
          .withFailureHandler(function (e) { akhir(reject, e); })[aksi].apply(null, args);
      } catch (e) { akhir(reject, e); }
    });
  }

  function ambilSegar(kecFilter) {
    // Melewati cache SWR api-bridge TANPA memanggil invalidate(): invalidate() memancarkan event
    // 'djpm:swr-invalidated' yang di app-admin.js memuat ulang dashboard yang sedang terbuka (skeleton
    // berkedip + permintaan ganda). Argumen tambahan ikut membentuk kunci cache (dan kunci permintaan yang
    // sedang berjalan), jadi tiap cetak PASTI memicu permintaan baru ke server, tidak pernah memakai salinan
    // lama maupun menumpang permintaan lain. Server mengabaikan argumen kelebihan (fn(...args)).
    var penanda = 'lp' + Date.now();
    var token = dataPengguna.token;
    return Promise.all([
      panggilSekali('getDashboardProgresVerifikasi', [token, kecFilter, penanda]),
      panggilSekali('getMasterLayanan', [penanda]).catch(function () { return null; }),
      panggilSekali('ambilStatusPeriode', [token]).catch(function () { return null; })
    ]).then(function (h) {
      var res = h[0];
      if (!res || res.sukses === false || !Array.isArray(res.kartu)) {
        throw new Error((res && res.pesan) || 'Data dashboard tidak valid.');
      }
      var t = new Date();
      if (h[2] && h[2].waktuServer) {
        var ts = new Date(h[2].waktuServer);
        if (!isNaN(ts.getTime())) t = ts;                  // jam server lebih tepercaya daripada jam perangkat
      }
      return { res: res, master: masterAktif(h[1]), waktu: t };
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Susun area cetak
  // ---------------------------------------------------------------------------------------------
  function salinKartu(sumber) {
    var k = sumber.cloneNode(true);
    k.classList.remove('kartu-dashboard-animasi', 'hover:border-sky-400', 'hover:shadow-md', 'transition', 'shadow-sm');
    k.classList.add('lp-kartu');
    k.removeAttribute('style');
    k.removeAttribute('data-lp-i');
    Array.prototype.forEach.call(k.querySelectorAll('.bar-progres-animasi'), function (bar) {
      var p = Number(bar.getAttribute('data-target-width')) || 0;
      bar.classList.remove('bar-progres-animasi');
      bar.style.width = Math.max(0, Math.min(100, p)) + '%';
    });
    return k;
  }

  function ambilKartuLayar(res) {
    var isi = $('isi-dashboard-progres');
    var els = isi ? Array.prototype.slice.call(isi.querySelectorAll('.kartu-dashboard-animasi')) : [];
    if (els.length !== res.kartu.length) return null;
    var urut = new Array(els.length);
    for (var n = 0; n < els.length; n++) {
      var penanda = els[n].getAttribute('data-lp-i');
      var i = penanda === null ? n : Number(penanda);        // tanpa penanda (pemisah gagal): urutan DOM = urutan data
      if (!(i >= 0 && i < els.length) || urut[i]) return null;
      urut[i] = els[n];
    }
    // Pemeriksaan akhir: nama layanan di kartu harus sama dengan data pada indeks itu.
    for (var m = 0; m < urut.length; m++) {
      var p = urut[m].querySelector('p');
      var teks = norm(p ? p.textContent : '');
      if (teks.indexOf(norm(res.kartu[m].layanan)) === -1) return null;
    }
    return urut;
  }

  function barisRingkasan(label, j, tebal) {
    var tr = document.createElement('tr');
    if (tebal) tr.className = 'lp-jumlah';
    var sel = [label, j.layanan, j.kuota, j.total, j.sisa, j.proses, j.ms, j.btl, j.tms, j.persen + '%'];
    sel.forEach(function (v, i) {
      var td = document.createElement('td');
      td.textContent = i === 0 ? v : (i === 9 ? v : angka(v));
      if (i > 0) td.className = 'lp-angka';
      tr.appendChild(td);
    });
    return tr;
  }

  function bagianLaporan(kode, judul, namaKosong, kartuSalinan, j) {
    var s = buat('section', 'lp-bagian' + (kode === 'B' ? ' lp-bagian-b' : ''));
    var kepala = buat('div', 'lp-judul-bagian');
    kepala.appendChild(buat('h2', '', judul));
    kepala.appendChild(buat('p', '', 'Total ' + angka(j.total) + ' · Sisa Kuota ' + angka(j.sisa) + ' · ' + j.persen + '% sudah diverifikasi'));
    s.appendChild(kepala);
    if (kartuSalinan.length === 0) {
      s.appendChild(buat('p', 'lp-kosong', 'Belum ada data untuk layanan ' + namaKosong + '.'));
    } else {
      var g = buat('div', 'lp-grid');
      kartuSalinan.forEach(function (k) { g.appendChild(k); });
      s.appendChild(g);
    }
    return s;
  }

  function susunArea(data, kecFilter, kartuLayar) {
    var res = data.res;
    var kel = kelompokkan(res.kartu, data.master);
    var daftarA = kel.A.map(function (i) { return res.kartu[i]; });
    var daftarB = kel.B.map(function (i) { return res.kartu[i]; });
    var jA = jumlahkan(daftarA), jB = jumlahkan(daftarB), jT = jumlahkan(res.kartu);
    var pencetak = (dataPengguna && dataPengguna.username) ? String(dataPengguna.username) : '';

    var area = buat('div');
    area.id = ID_AREA;

    // Bukan <header>: index.html/tailwind.input.css punya aturan global `header { background: #0f172a !important }`.
    var kepala = buat('div', 'lp-kepala');
    kepala.appendChild(buat('h1', '', 'LAPORAN PROGRES VERIFIKASI'));
    kepala.appendChild(buat('p', 'lp-program', NAMA_PROGRAM));
    var meta = buat('dl', 'lp-meta');
    [['Cakupan', kecFilter ? 'Kecamatan ' + kecFilter : 'Seluruh Kecamatan'], ['Data per', waktuPanjang(data.waktu)]].forEach(function (p) {
      meta.appendChild(buat('dt', '', p[0]));
      meta.appendChild(buat('dd', '', ': ' + p[1]));
    });
    kepala.appendChild(meta);
    area.appendChild(kepala);

    var ring = buat('section', 'lp-ringkasan');
    ring.appendChild(buat('h2', '', 'RINGKASAN'));
    var tabel = buat('table', 'lp-tabel');
    var thead = document.createElement('thead');
    var trh = document.createElement('tr');
    ['Kelompok', 'Jumlah Layanan', 'Kuota', 'Total Data', 'Sisa Kuota', 'Proses Verifikasi', 'Memenuhi Syarat', 'Berkas Tidak Lengkap', 'Tidak Memenuhi Syarat', '% Terverifikasi'].forEach(function (t) {
      trh.appendChild(buat('th', '', t));
    });
    thead.appendChild(trh);
    tabel.appendChild(thead);
    var tbody = document.createElement('tbody');
    tbody.appendChild(barisRingkasan('A. Kecamatan', jA, false));
    tbody.appendChild(barisRingkasan('B. Kemenag', jB, false));
    tbody.appendChild(barisRingkasan('JUMLAH', jT, true));
    tabel.appendChild(tbody);
    ring.appendChild(tabel);
    var jalur = buat('div', 'lp-jalur');
    var isiJalur = buat('div', 'lp-jalur-isi');
    isiJalur.style.width = jT.persen + '%';
    jalur.appendChild(isiJalur);
    ring.appendChild(jalur);
    ring.appendChild(buat('p', 'lp-jalur-teks', jT.persen + '% sudah diverifikasi (gabungan A + B)'));
    area.appendChild(ring);

    area.appendChild(bagianLaporan('A', 'A. LAYANAN KECAMATAN', 'Kecamatan', kel.A.map(function (i) { return salinKartu(kartuLayar[i]); }), jA));
    area.appendChild(bagianLaporan('B', 'B. LAYANAN KEMENAG', 'Kemenag', kel.B.map(function (i) { return salinKartu(kartuLayar[i]); }), jB));

    area.appendChild(buat('p', 'lp-penutup', 'Dicetak dari Aplikasi DJPM 2027' + (pencetak ? ' oleh ' + pencetak : '') + ' pada ' + waktuPendek(data.waktu) + '.'));
    return area;
  }

  // ---------------------------------------------------------------------------------------------
  // CSS
  // ---------------------------------------------------------------------------------------------
  function pasangStyleStatis() {
    if ($(ID_STYLE_STATIS)) return;
    var css = [
      '#' + ID_AREA + '{display:none}',
      '@media print{',
      // Semua aturan di bawah hanya berlaku selagi <html> bertanda: Ctrl+P biasa di aplikasi tidak terpengaruh.
      'html.mode-cetak-laporan,html.mode-cetak-laporan body{height:auto!important;min-height:0!important;overflow:visible!important;position:static!important;background:#fff!important}',
      'html.mode-cetak-laporan body>*:not(#' + ID_AREA + '){display:none!important}',
      'html.mode-cetak-laporan #' + ID_AREA + '{display:block!important;color:#0f172a;font-size:11px;line-height:1.35}',
      '#' + ID_AREA + ',#' + ID_AREA + ' *{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}',
      '#' + ID_AREA + ' .lp-kepala{text-align:center;border-bottom:2px solid #0f172a;padding-bottom:8px;margin-bottom:12px}',
      '#' + ID_AREA + ' .lp-kepala h1{font-size:17px;font-weight:800;letter-spacing:.04em;margin:0}',
      '#' + ID_AREA + ' .lp-program{font-size:11px;margin:3px 0 8px;color:#334155}',
      '#' + ID_AREA + ' .lp-meta{display:grid;grid-template-columns:auto 1fr;gap:1px 4px;justify-content:center;text-align:left;margin:0;font-size:11px}',
      '#' + ID_AREA + ' .lp-meta dt{font-weight:700}',
      '#' + ID_AREA + ' .lp-meta dd{margin:0}',
      '#' + ID_AREA + ' h2{font-size:12px;font-weight:800;letter-spacing:.03em;margin:0}',
      '#' + ID_AREA + ' .lp-ringkasan{margin-bottom:14px;break-inside:avoid}',
      '#' + ID_AREA + ' .lp-ringkasan h2{margin-bottom:5px}',
      '#' + ID_AREA + ' .lp-tabel{width:100%;border-collapse:collapse;font-size:9px}',
      '#' + ID_AREA + ' .lp-tabel th,#' + ID_AREA + ' .lp-tabel td{border:1px solid #94a3b8;padding:3px 4px}',
      '#' + ID_AREA + ' .lp-tabel th{background:#e2e8f0;font-weight:700;text-align:center;vertical-align:middle}',
      '#' + ID_AREA + ' .lp-tabel td.lp-angka{text-align:right;font-variant-numeric:tabular-nums}',
      '#' + ID_AREA + ' .lp-tabel td:first-child{white-space:nowrap;font-weight:600}',
      '#' + ID_AREA + ' .lp-tabel tr.lp-jumlah td{background:#e0f2fe;font-weight:800}',
      '#' + ID_AREA + ' .lp-tabel tr{break-inside:avoid}',
      '#' + ID_AREA + ' .lp-jalur{height:9px;background:#e2e8f0;border-radius:99px;overflow:hidden;margin-top:8px}',
      '#' + ID_AREA + ' .lp-jalur-isi{height:100%;background:#0d9488}',
      '#' + ID_AREA + ' .lp-jalur-teks{font-size:9px;color:#475569;margin:2px 0 0}',
      '#' + ID_AREA + ' .lp-bagian{margin-bottom:12px}',
      '#' + ID_AREA + ' .lp-bagian-b{break-before:page}',
      '#' + ID_AREA + ' .lp-judul-bagian{display:flex;justify-content:space-between;align-items:baseline;gap:8px;border-bottom:1px solid #94a3b8;padding-bottom:3px;margin-bottom:8px;break-after:avoid}',
      '#' + ID_AREA + ' .lp-judul-bagian p{margin:0;font-size:10px;color:#475569}',
      '#' + ID_AREA + ' .lp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}',
      // zoom .8: kartu sama persis dengan layar tetapi 11 layanan Kecamatan muat di halaman 1 bersama ringkasan
      '#' + ID_AREA + ' .lp-kartu{break-inside:avoid;box-shadow:none!important;margin:0;zoom:.8}',
      '#' + ID_AREA + ' .lp-kosong{font-style:italic;color:#64748b;margin:4px 0}',
      '#' + ID_AREA + ' .lp-penutup{font-size:9px;color:#64748b;margin:10px 0 0}',
      '}'
    ].join('\n');
    var st = document.createElement('style');
    st.id = ID_STYLE_STATIS;
    st.textContent = css;
    document.head.appendChild(st);
  }

  function pasangStyleHalaman(pencetak, waktu) {
    var aman = String(pencetak || '').replace(/[^A-Za-z0-9 ._@-]/g, '').slice(0, 40);
    var kaki = 'Dicetak dari Aplikasi DJPM 2027' + (aman ? ' oleh ' + aman : '') + ' · ' + waktuPendek(waktu);
    var st = document.createElement('style');
    st.id = ID_STYLE_HALAMAN;
    st.textContent = '@page{size:A4 portrait;margin:12mm 12mm 16mm;' +
      '@bottom-left{content:"' + kaki + '";font-size:8px;color:#475569}' +
      '@bottom-right{content:"Halaman " counter(page) " dari " counter(pages);font-size:8px;color:#475569}}';
    document.head.appendChild(st);
  }

  // ---------------------------------------------------------------------------------------------
  // Unduh PDF: digambar langsung dengan jsPDF (vektor: tajam, teks bisa dicari, ±50-100 KB), bukan dari
  // tangkapan layar. Pustaka disimpan di proyek (public/js/vendor, MIT) dan baru dimuat saat tombol diklik.
  // ---------------------------------------------------------------------------------------------
  var janjiJsPdf = null;
  function muatJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf);
    if (janjiJsPdf) return janjiJsPdf;
    janjiJsPdf = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      var timer = null;
      function gagal() {
        clearTimeout(timer);
        janjiJsPdf = null;                                  // percobaan berikutnya memuat ulang
        if (s.parentNode) s.parentNode.removeChild(s);
        reject(new Error('Pustaka PDF gagal dimuat. Periksa koneksi, lalu coba lagi.'));
      }
      timer = setTimeout(gagal, BATAS_PUSTAKA_MS);
      s.onload = function () {
        clearTimeout(timer);
        if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf); else gagal();
      };
      s.onerror = gagal;
      s.async = true;
      s.src = '/js/vendor/jspdf.umd.min.js' + (VERSI ? '?v=' + VERSI : '');
      document.head.appendChild(s);
    });
    return janjiJsPdf;
  }

  /** Huruf standar PDF (Helvetica) hanya mengenal Latin-1: buang karakter lain agar tidak jadi sandi acak. */
  function latin(v) { return String(v == null ? '' : v).replace(/[^\x20-\x7E -ÿ]/g, ''); }
  function rgb(hex) { return [parseInt(hex.substr(1, 2), 16), parseInt(hex.substr(3, 2), 16), parseInt(hex.substr(5, 2), 16)]; }

  function gambarPdf(lib, data, kecFilter, nama) {
    var res = data.res;
    var kel = kelompokkan(res.kartu, data.master);
    var daftarA = kel.A.map(function (i) { return res.kartu[i]; });
    var daftarB = kel.B.map(function (i) { return res.kartu[i]; });
    var jA = jumlahkan(daftarA), jB = jumlahkan(daftarB), jT = jumlahkan(res.kartu);
    var pencetak = latin((dataPengguna && dataPengguna.username) || '').slice(0, 40);

    var doc = new lib.jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true });
    doc.setProperties({ title: nama.replace(/\.pdf$/, ''), subject: 'Laporan Progres Verifikasi DJPM 2027', creator: 'Aplikasi DJPM 2027' });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    var ML = 34, CW = W - 2 * ML, ATAS = 40, BAWAH = H - 48;
    var y = ATAS;

    function isi(h) { var c = rgb(h); doc.setFillColor(c[0], c[1], c[2]); }
    function garis(h) { var c = rgb(h); doc.setDrawColor(c[0], c[1], c[2]); }
    function tinta(h) { var c = rgb(h); doc.setTextColor(c[0], c[1], c[2]); }
    function huruf(tebal, ukuran, miring) { doc.setFont('helvetica', miring ? 'italic' : (tebal ? 'bold' : 'normal')); doc.setFontSize(ukuran); }

    // --- Judul & identitas ---
    huruf(true, 16); tinta('#0f172a');
    doc.text('LAPORAN PROGRES VERIFIKASI', W / 2, y, { align: 'center' });
    y += 14; huruf(false, 8.5); tinta('#334155');
    doc.text(NAMA_PROGRAM, W / 2, y, { align: 'center' });
    y += 20;
    var x0 = W / 2 - 120;
    [['Cakupan', kecFilter ? 'Kecamatan ' + kecFilter : 'Seluruh Kecamatan'], ['Data per', waktuPanjang(data.waktu)]].forEach(function (m) {
      huruf(true, 9); tinta('#0f172a'); doc.text(m[0], x0, y);
      huruf(false, 9); doc.text(': ' + latin(m[1]), x0 + 46, y);
      y += 12;
    });
    y += 2; garis('#0f172a'); doc.setLineWidth(1.5); doc.line(ML, y, W - ML, y);
    y += 16;

    // --- Ringkasan ---
    huruf(true, 9.5); tinta('#0f172a'); doc.text('RINGKASAN', ML, y);
    y += 6;
    var skala = CW / 527;
    var lebar = [83, 40, 44, 44, 44, 52, 52, 54, 56, 58].map(function (v) { return v * skala; });   // jumlah 527
    var judulKolom = ['Kelompok', 'Jumlah Layanan', 'Kuota', 'Total Data', 'Sisa Kuota', 'Proses Verifikasi', 'Memenuhi Syarat', 'Berkas Tidak Lengkap', 'Tidak Memenuhi Syarat', '% Terverifikasi'];
    huruf(true, 7);
    var barisKepala = judulKolom.map(function (t, i) { return doc.splitTextToSize(t, lebar[i] - 4); });
    var maksBaris = barisKepala.reduce(function (m, b) { return Math.max(m, b.length); }, 1);
    var hk = maksBaris * 8.5 + 6;
    doc.setLineWidth(0.5); garis('#94a3b8');
    var cx = ML;
    barisKepala.forEach(function (b, i) {
      // Warna isi HARUS ditetapkan tepat sebelum tiap bentuk: di PDF warna teks & warna isi memakai operator yang
      // sama, jadi setTextColor() di sel sebelumnya menimpa warna isi sel berikutnya.
      isi('#e2e8f0'); doc.rect(cx, y, lebar[i], hk, 'FD');
      tinta('#0f172a');
      b.forEach(function (t, n) { doc.text(t, cx + lebar[i] / 2, y + 9 + n * 8.5, { align: 'center' }); });
      cx += lebar[i];
    });
    y += hk;
    [['A. Kecamatan', jA, false], ['B. Kemenag', jB, false], ['JUMLAH', jT, true]].forEach(function (r) {
      var j = r[1];
      var nilai = [r[0], angka(j.layanan), angka(j.kuota), angka(j.total), angka(j.sisa), angka(j.proses), angka(j.ms), angka(j.btl), angka(j.tms), j.persen + '%'];
      var px = ML;
      nilai.forEach(function (v, i) {
        isi(r[2] ? '#e0f2fe' : '#ffffff'); doc.rect(px, y, lebar[i], 15, 'FD');
        huruf(r[2] || i === 0, 8); tinta('#0f172a');
        if (i === 0) doc.text(v, px + 4, y + 10.5); else doc.text(v, px + lebar[i] - 4, y + 10.5, { align: 'right' });
        px += lebar[i];
      });
      y += 15;
    });
    y += 10;
    isi('#e2e8f0'); doc.roundedRect(ML, y, CW, 7, 3.5, 3.5, 'F');
    if (jT.persen > 0) { isi('#0d9488'); doc.roundedRect(ML, y, Math.max(7, CW * jT.persen / 100), 7, 3.5, 3.5, 'F'); }
    y += 17; huruf(false, 7.5); tinta('#475569');
    doc.text(jT.persen + '% sudah diverifikasi (gabungan A + B)', ML, y);
    y += 22;

    // --- Kartu (sama dengan layar) ---
    function siapKartu(k, cw) {
      huruf(true, 7);
      var teksKuota = 'Kuota: ' + (Number(k.kuota) || 0);
      var bw = doc.getTextWidth(teksKuota) + 10;
      huruf(true, 8.5);
      var judul = doc.splitTextToSize(latin(k.layanan).toUpperCase(), cw - 16 - bw - 6);
      if (k.kecamatanLabel) judul.push(latin(k.kecamatanLabel).toUpperCase());
      return { teksKuota: teksKuota, bw: bw, judul: judul };
    }

    function kartu(k, s, x, y0, cw, L, tinggi) {
      var P = 8;
      var total = Number(k.total) || 0;
      var persen = total > 0 ? Math.round((((Number(k.memenuhiSyarat) || 0) + (Number(k.tidakMemenuhiSyarat) || 0)) / total) * 100) : 0;
      isi('#f8fafc'); garis('#bae6fd'); doc.setLineWidth(1.2);
      doc.roundedRect(x, y0, cw, tinggi, 7, 7, 'FD');
      huruf(true, 7);
      isi('#e0f2fe'); doc.roundedRect(x + cw - P - s.bw, y0 + P - 1, s.bw, 12, 6, 6, 'F');
      tinta('#0369a1'); doc.text(s.teksKuota, x + cw - P - s.bw / 2, y0 + P + 7.5, { align: 'center' });
      huruf(true, 8.5); tinta('#1e293b');
      s.judul.forEach(function (t, n) { doc.text(t, x + P, y0 + P + 8 + n * 10); });
      var ty = y0 + P + L * 10 + 11;
      huruf(false, 8); tinta('#64748b'); doc.text('Total: ', x + P, ty);
      var px = x + P + doc.getTextWidth('Total: ');
      huruf(true, 8); tinta('#0f172a'); doc.text(String(total), px, ty);
      px += doc.getTextWidth(String(total));
      huruf(false, 8); tinta('#64748b'); doc.text(' data', px, ty);
      var sisa = Number(k.sisaKuota) || 0;
      huruf(true, 8); tinta(sisa <= 0 ? '#dc2626' : '#059669');
      doc.text('Sisa Kuota: ' + sisa, x + cw - P, ty, { align: 'right' });
      var baris = [['Proses Verifikasi', k.prosesVerifikasi, '#64748b', '#0f172a'], ['Memenuhi Syarat', k.memenuhiSyarat, '#059669', '#047857'],
        ['Berkas Tidak Lengkap', k.berkasTidakLengkap, '#d97706', '#b45309'], ['Tidak Memenuhi Syarat', k.tidakMemenuhiSyarat, '#ef4444', '#dc2626']];
      var ry = ty + 16;
      baris.forEach(function (b) {
        huruf(false, 8); tinta(b[2]); doc.text(b[0], x + P, ry);
        huruf(true, 8); tinta(b[3]); doc.text(String(Number(b[1]) || 0), x + cw - P, ry, { align: 'right' });
        ry += 12;
      });
      var by = ry - 5;
      isi('#f1f5f9'); doc.roundedRect(x + P, by, cw - 2 * P, 5, 2.5, 2.5, 'F');
      if (persen > 0) { isi('#0d9488'); doc.roundedRect(x + P, by, Math.max(5, (cw - 2 * P) * persen / 100), 5, 2.5, 2.5, 'F'); }
      huruf(false, 7); tinta('#94a3b8'); doc.text(persen + '% sudah diverifikasi', x + P, by + 13);
    }

    function bagian(judul, namaKosong, daftar, j, halamanBaru) {
      var GAP = 8, cw = (CW - 2 * GAP) / 3;
      var siap = daftar.map(function (k) { return siapKartu(k, cw); });
      function ukuranBaris(i) {
        var L = 1;
        for (var c = i; c < Math.min(i + 3, siap.length); c++) L = Math.max(L, siap[c].judul.length);
        return { L: L, h: 100 + 10 * L };
      }
      if (halamanBaru || (daftar.length && y + 30 + ukuranBaris(0).h > BAWAH)) { doc.addPage(); y = ATAS; }
      huruf(true, 10.5); tinta('#0f172a'); doc.text(judul, ML, y);
      huruf(false, 8); tinta('#475569');
      doc.text('Total ' + angka(j.total) + ' · Sisa Kuota ' + angka(j.sisa) + ' · ' + j.persen + '% sudah diverifikasi', W - ML, y, { align: 'right' });
      y += 5; garis('#94a3b8'); doc.setLineWidth(0.6); doc.line(ML, y, W - ML, y);
      y += 10;
      if (!daftar.length) {
        huruf(false, 9, true); tinta('#64748b');
        doc.text('Belum ada data untuk layanan ' + namaKosong + '.', ML, y + 9);
        y += 24;
        return;
      }
      for (var i = 0; i < daftar.length; i += 3) {
        var u = ukuranBaris(i);
        if (y + u.h > BAWAH) { doc.addPage(); y = ATAS; }
        for (var c = 0; c < 3 && i + c < daftar.length; c++) kartu(daftar[i + c], siap[i + c], ML + c * (cw + GAP), y, cw, u.L, u.h);
        y += u.h + GAP;
      }
    }

    bagian('A. LAYANAN KECAMATAN', 'Kecamatan', daftarA, jA, false);
    bagian('B. LAYANAN KEMENAG', 'Kemenag', daftarB, jB, true);

    // --- Kaki halaman di setiap halaman ---
    var jumlahHalaman = doc.getNumberOfPages();
    var kaki = 'Dicetak dari Aplikasi DJPM 2027' + (pencetak ? ' oleh ' + pencetak : '') + ' · ' + waktuPendek(data.waktu);
    for (var p = 1; p <= jumlahHalaman; p++) {
      doc.setPage(p);
      huruf(false, 7.5); tinta('#475569');
      doc.text(kaki, ML, H - 24);
      doc.text('Halaman ' + p + ' dari ' + jumlahHalaman, W - ML, H - 24, { align: 'right' });
    }
    return doc;
  }

  function unduhPdf(janjiPustaka, data, kecFilter, tokenAwal) {
    return janjiPustaka.then(function (lib) {
      if (!adalahUtama() || dataPengguna.token !== tokenAwal) return;      // sesi berganti selagi memuat pustaka
      var nama = namaBerkas(kecFilter, tanggalIso(data.waktu)) + '.pdf';
      var doc = gambarPdf(lib, data, kecFilter, nama);
      doc.save(nama);
      toast('Laporan PDF diunduh: ' + nama, 'sukses', 7000);
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Alur cetak
  // ---------------------------------------------------------------------------------------------
  function bersihkanHasilCetak() {
    if (pembersihTerakhir) { var f = pembersihTerakhir; pembersihTerakhir = null; f(); }
  }

  function cetakLaporan() { jalankan('cetak'); }
  function unduhLaporan() { jalankan('unduh'); }

  // Alur bersama: periksa peran -> kunci tombol/filter -> ambil data SEGAR -> (unduh: gambar & simpan PDF)
  // atau (cetak: susun area cetak & window.print()). Satu penjaga (sedangMenyiapkan) untuk kedua tombol.
  function jalankan(mode) {
    if (sedangMenyiapkan) return;
    if (!adalahUtama()) {
      toast('Laporan hanya dapat dibuat oleh Admin Utama.', 'gagal');
      semuaTombol().forEach(function (t) { t.classList.add('hidden'); });
      return;
    }
    var tombol = $(mode === 'unduh' ? ID_TOMBOL_UNDUH : ID_TOMBOL);
    var pilih = $('filter-dashboard-kecamatan');
    var kecFilter = pilih ? String(pilih.value || '') : '';
    var tokenAwal = dataPengguna.token;

    sedangMenyiapkan = true;
    bersihkanHasilCetak();
    semuaTombol().forEach(function (t) { t.disabled = true; });
    if (tombol) aturTombol(tombol, true);
    if (pilih) pilih.disabled = true;
    function pulih() {
      sedangMenyiapkan = false;
      semuaTombol().forEach(function (t) { aturTombol(t, false); });
      var p = $('filter-dashboard-kecamatan'); if (p) p.disabled = false;
    }

    // Pustaka PDF dimuat bersamaan dengan pengambilan data (hanya untuk unduh).
    var janjiPustaka = mode === 'unduh' ? muatJsPdf() : null;
    if (janjiPustaka) janjiPustaka.catch(function () { /* galatnya ditangani di rantai utama */ });

    ambilSegar(kecFilter).then(function (data) {
      if (!adalahUtama() || dataPengguna.token !== tokenAwal) { pulih(); return; }   // sesi berganti selagi menunggu
      try {
        if (typeof cacheDashboardProgres !== 'undefined' && cacheDashboardProgres) {
          cacheDashboardProgres[kecFilter] = { res: data.res, waktu: Date.now() };
        }
      } catch (_e) { /* abaikan */ }
      if (typeof window.renderDashboardProgres === 'function') window.renderDashboardProgres(data.res, kecFilter);

      if (mode === 'unduh') return unduhPdf(janjiPustaka, data, kecFilter, tokenAwal).then(pulih);

      var kartuLayar = ambilKartuLayar(data.res);
      if (!kartuLayar) throw new Error('Kartu di layar tidak sesuai dengan data. Muat ulang dashboard lalu coba lagi.');

      var area = susunArea(data, kecFilter, kartuLayar);
      pasangStyleStatis();
      var lama = $(ID_AREA); if (lama && lama.parentNode) lama.parentNode.removeChild(lama);
      document.body.appendChild(area);
      pasangStyleHalaman(dataPengguna.username, data.waktu);

      var judulAsal = document.title;
      document.title = namaBerkas(kecFilter, tanggalIso(data.waktu));
      document.documentElement.classList.add('mode-cetak-laporan');

      var selesai = false, timerAman = null, mql = null, pernahCetak = false, dialogTerbuka = false;
      function sebelumCetak() { dialogTerbuka = true; }
      function bersih() {
        if (selesai) return;
        selesai = true;
        clearTimeout(timerAman);
        window.removeEventListener('afterprint', bersih);
        window.removeEventListener('beforeprint', sebelumCetak);
        if (mql && mql.removeEventListener) { try { mql.removeEventListener('change', onMql); } catch (_e) { /* abaikan */ } }
        document.documentElement.classList.remove('mode-cetak-laporan');
        document.title = judulAsal;
        var s = $(ID_STYLE_HALAMAN); if (s && s.parentNode) s.parentNode.removeChild(s);
        var a = $(ID_AREA); if (a && a.parentNode) a.parentNode.removeChild(a);
        if (pembersihTerakhir === bersih) pembersihTerakhir = null;
      }
      function onMql(e) { if (e.matches) pernahCetak = true; else if (pernahCetak) bersih(); }   // abaikan "false" yang datang sebelum cetak dimulai
      pembersihTerakhir = bersih;
      window.addEventListener('afterprint', bersih);
      window.addEventListener('beforeprint', sebelumCetak);
      try { mql = window.matchMedia && window.matchMedia('print'); if (mql && mql.addEventListener) mql.addEventListener('change', onMql); } catch (_e) { mql = null; }
      timerAman = setTimeout(bersih, BATAS_BERSIH_MS);

      toast('Di dialog cetak pilih Tujuan: Simpan sebagai PDF, lalu klik Simpan.', 'info', 6000);
      setTimeout(function () {
        if (selesai) { pulih(); return; }                                              // sudah dibersihkan (mis. cetak ulang)
        if (!adalahUtama() || dataPengguna.token !== tokenAwal) { bersih(); pulih(); return; }   // sesi berganti dalam jeda 250 ms
        try { window.print(); } catch (e) { bersih(); toast('Gagal membuka dialog cetak: ' + (e && e.message || e), 'gagal'); }
        pulih();
        // Peramban bisa menolak print() yang dipanggil setelah jeda jaringan (tanpa gestur pengguna). Bila tidak
        // ada tanda dialog terbuka, beri tahu: laporan tetap siap, jadi Ctrl+P / menu Cetak langsung mencetaknya.
        setTimeout(function () {
          if (!selesai && !dialogTerbuka) toast('Dialog cetak belum terbuka. Tekan Ctrl+P (atau menu Cetak peramban), lalu pilih Tujuan: Simpan sebagai PDF.', 'info', 10000);
        }, 700);
      }, 250);
    }).catch(function (err) {
      pulih();
      toast('Gagal menyiapkan laporan: ' + (err && err.message ? err.message : err), 'gagal', 7000);
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Pasang
  // ---------------------------------------------------------------------------------------------
  pasangStyleStatis();
  pasangPembungkusRender();
  sinkronTombol();

  window.djpmLaporanProgres = { jumlahkan: jumlahkan, kelompokkan: kelompokkan, namaBerkas: namaBerkas, angka: angka };
})();
