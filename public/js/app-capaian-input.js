/**
 * public/js/app-capaian-input.js
 * Tab "Capaian Input" di modal Dashboard -- HANYA Admin Utama. Dimuat malas oleh app-pesan-periode.js
 * (muatSkripAdmin), jadi peran lain tidak pernah mengunduh berkas ini.
 * Rancangan: plans/plan-progres-capaian-input.md
 *
 * Isi dashboard lama (filter + #isi-dashboard-progres) hanya DIBUNGKUS, tidak diubah. Data dari
 * getCapaianInput (satu model untuk layar dan PDF). Semua teks dipasang lewat textContent.
 * Ambang warna sama dengan warnaProgresKuota (app-admin.js); sel tanpa kuota = abu-abu netral (D10).
 */
(function () {
  'use strict';

  var ID_MODAL = 'modal-dashboard-progres';
  var ID_TAB = 'ci-tabbar';
  var ID_PANEL = 'panel-capaian-input';
  var ID_PEMBUNGKUS_LAMA = 'panel-dashboard-verifikasi';
  var ID_STYLE = 'ci-style';
  var KELAS_AKTIF = 'ci-aktif';

  var model = null;            // hasil getCapaianInput terakhir
  var tabAktif = 'verifikasi'; // 'verifikasi' | 'capaian'
  var bagianAktif = 'A';       // 'A' kecamatan | 'B' kemenag
  var kecamatanTerbuka = {};   // { "MEDAN AREA": true }
  var sedangMemuat = false;
  var pemuatUlang = null;
  var cakupanPdf = 'SEMUA';    // 'SEMUA' | 'KEC:<nama>' | 'LAY:<nama>'
  var sedangUnduh = false;
  // Versi (?v=) skrip ini, dipakai juga untuk memuat skrip PDF & pustaka agar cache ikut terbuang bersama-sama.
  var VERSI = '';
  try { VERSI = ((document.currentScript && /[?&]v=([^&]+)/.exec(document.currentScript.src)) || [])[1] || ''; } catch (_e) { VERSI = ''; }
  var BATAS_TUNGGU_MS = 45000;
  var BATAS_PUSTAKA_MS = 30000;

  function $(id) { return document.getElementById(id); }
  function adalahUtama() {
    return typeof dataPengguna !== 'undefined' && !!dataPengguna && !!dataPengguna.token &&
      String(dataPengguna.role || '').toUpperCase() === 'UTAMA';
  }
  function buat(tag, kelas, teks) {
    var e = document.createElement(tag);
    if (kelas) e.className = kelas;
    if (teks != null) e.textContent = teks;
    return e;
  }
  function angka(n) {
    var x = Math.round(Number(n) || 0);
    return String(Math.abs(x)).replace(/\B(?=(\d{3})+(?!\d))/g, '.').replace(/^/, x < 0 ? '-' : '');
  }
  function persenDari(input, kuota) { return kuota > 0 ? Math.round((input / kuota) * 1000) / 10 : 0; }
  function teksPersen(p) { return String(p).replace('.', ',') + '%'; }

  // Ambang sama dengan warnaProgresKuota (app-admin.js). Kelas ci-w0..ci-w4 (merah..hijau tua).
  function kelasWarna(persen) {
    if (persen >= 100) return 'ci-w4';
    if (persen >= 75) return 'ci-w3';
    if (persen >= 50) return 'ci-w2';
    if (persen >= 25) return 'ci-w1';
    return 'ci-w0';
  }

  var CSS = [
    '#' + ID_MODAL + '.' + KELAS_AKTIF + ' > div{max-width:min(96vw,84rem)}',
    '#' + ID_MODAL + '.' + KELAS_AKTIF + ' #btn-cetak-laporan-progres,#' + ID_MODAL + '.' + KELAS_AKTIF + ' #btn-unduh-laporan-progres{display:none}',
    '#' + ID_TAB + '{display:flex;gap:.5rem;padding:.75rem 1.5rem 0;border-bottom:1px solid #f1f5f9}',
    '.ci-tab{padding:.5rem 1rem;font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border-radius:.5rem .5rem 0 0;color:#64748b;background:transparent;border:0;cursor:pointer}',
    '.ci-tab:hover{background:#f1f5f9}.ci-tab.ci-on{background:#1e293b;color:#fff}',
    '#' + ID_PANEL + '{padding:1.25rem 1.5rem;overflow-y:auto}',
    '.ci-kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr));gap:.75rem;margin-bottom:1rem}',
    '.ci-kartu{border:1px solid #e2e8f0;border-radius:.75rem;padding:.6rem .8rem;background:#f8fafc}',
    '.ci-kartu b{display:block;font-size:1.25rem;color:#0f172a;line-height:1.3}.ci-kartu span{font-size:.65rem;font-weight:700;color:#64748b;text-transform:uppercase}',
    '.ci-sub{display:flex;gap:.5rem;margin:.25rem 0 .75rem;flex-wrap:wrap;align-items:center}',
    '.ci-stempel{margin-left:auto;font-size:.68rem;color:#94a3b8}',
    '.ci-pdf{display:inline-flex;gap:.4rem;align-items:center}',
    '.ci-pilih{max-width:17rem;font-size:.72rem;padding:.4rem .5rem;border:1px solid #cbd5e1;border-radius:.5rem;background:#fff;color:#0f172a}',
    '.ci-unduh{background:#059669;color:#fff;font-size:.72rem;font-weight:600;padding:.45rem .9rem;border-radius:.6rem;border:0;cursor:pointer}',
    '.ci-unduh:hover{background:#047857}.ci-unduh:disabled{opacity:.6;cursor:not-allowed}',
    '.ci-gulir{overflow-x:auto;border:1px solid #e2e8f0;border-radius:.6rem}',
    '.ci-tabel{border-collapse:collapse;width:100%;font-size:.72rem;min-width:max-content}',
    '.ci-tabel th,.ci-tabel td{border:1px solid #e2e8f0;padding:.35rem .45rem;text-align:center;white-space:nowrap}',
    '.ci-tabel thead th{background:#1e293b;color:#fff;font-weight:700;font-size:.66rem;white-space:normal;min-width:5.2rem;vertical-align:middle}',
    '.ci-tabel td.ci-nama,.ci-tabel th.ci-nama{text-align:left;position:sticky;left:0;background:#fff;font-weight:600;color:#0f172a;z-index:1;min-width:8.5rem}',
    '.ci-tabel thead th.ci-nama{background:#1e293b;color:#fff}',
    '.ci-tabel tr.ci-total td{background:#f1f5f9;font-weight:700}.ci-tabel tr.ci-total td.ci-nama{background:#f1f5f9}',
    '.ci-tabel .ci-sel b{display:block;font-size:.78rem}.ci-tabel .ci-sel i{display:block;font-style:normal;font-size:.62rem;opacity:.85}',
    '.ci-w0{background:#fef2f2;color:#b91c1c}.ci-w1{background:#fff7ed;color:#c2410c}.ci-w2{background:#fefce8;color:#a16207}',
    '.ci-w3{background:#f0fdf4;color:#16a34a}.ci-w4{background:#dcfce7;color:#15803d}.ci-abu{background:#f1f5f9;color:#64748b}',
    '.ci-klik{cursor:pointer}.ci-klik:hover td.ci-nama{background:#e0f2fe}.ci-klik .ci-panah{display:inline-block;width:1rem;color:#0284c7}',
    '.ci-rinci td{padding:.6rem;background:#f8fafc;text-align:left;white-space:normal}',
    '.ci-rinci .ci-judul{font-size:.72rem;font-weight:700;color:#0f172a;margin-bottom:.4rem}',
    '.ci-belum td.ci-nama{color:#b91c1c}.ci-belum td{background:#fef2f2}.ci-tabel td.ci-nama small{display:block;font-weight:400;font-size:.62rem}',
    '.ci-nol{color:#b91c1c;font-weight:700}',
    '.ci-ket{display:flex;flex-wrap:wrap;gap:.35rem .9rem;margin:.55rem 0 0;font-size:.66rem;color:#475569;align-items:center}',
    '.ci-ket span.ci-k{display:inline-flex;align-items:center;gap:.3rem}',
    '.ci-ket em{display:inline-block;width:.8rem;height:.8rem;border-radius:.2rem;border:1px solid rgba(0,0,0,.15)}',
    '.ci-ket p{flex-basis:100%;margin:0}',
    '.ci-pesan{padding:2rem 0;text-align:center;font-size:.8rem;color:#94a3b8}.ci-pesan.ci-err{color:#dc2626}'
  ].join('\n');

  // ---------------------------------------------------------------------------------------------
  // Sel & keterangan
  // ---------------------------------------------------------------------------------------------
  /** Sel "input/kuota" + persen. kuotaAda=false -> abu-abu netral (D10), tampil jumlah input saja. */
  function selKuota(input, kuota, kuotaAda) {
    var td = buat('td', 'ci-sel');
    if (!kuotaAda) {
      td.className += ' ci-abu';
      td.appendChild(buat('b', '', angka(input)));
      return td;
    }
    var p = persenDari(input, kuota);
    td.className += ' ' + kelasWarna(p);
    td.appendChild(buat('b', '', angka(input) + '/' + angka(kuota)));
    td.appendChild(buat('i', '', teksPersen(p)));
    return td;
  }

  function item(kelasKotak, teks) {
    var s = buat('span', 'ci-k');
    s.appendChild(buat('em', kelasKotak));
    s.appendChild(document.createTextNode(teks));
    return s;
  }

  /** Keterangan di bawah tabel (D10): hanya butir yang dipakai tabel itu yang tampil. */
  function keterangan(opsi) {
    var k = buat('div', 'ci-ket');
    if (opsi.kuota) {
      k.appendChild(item('ci-w0', 'Di bawah 25%'));
      k.appendChild(item('ci-w1', '25–49%'));
      k.appendChild(item('ci-w2', '50–74%'));
      k.appendChild(item('ci-w3', '75–99%'));
      k.appendChild(item('ci-w4', '100% ke atas'));
    }
    if (opsi.adaTanpaKuota) k.appendChild(item('ci-abu', 'Tanpa kuota (layanan ini tidak memiliki kuota di kecamatan tersebut)'));
    if (opsi.kelurahan) k.appendChild(item('ci-w0', 'Merah = kelurahan belum ada input sama sekali'));
    k.appendChild(buat('p', '', opsi.kelurahan
      ? 'Angka = jumlah input (semua status verifikasi). Kuota hanya tersedia di tingkat kecamatan.'
      : '"0" = belum ada input. Format sel: input/kuota, di bawahnya persen capaian.'));
    return k;
  }

  // ---------------------------------------------------------------------------------------------
  // Tabel
  // ---------------------------------------------------------------------------------------------
  function headTabel(judulPertama, layanan, adaTotal) {
    var thead = buat('thead');
    var tr = buat('tr');
    tr.appendChild(buat('th', 'ci-nama', judulPertama));
    layanan.forEach(function (l) { tr.appendChild(buat('th', '', l)); });
    if (adaTotal) tr.appendChild(buat('th', '', 'TOTAL'));
    thead.appendChild(tr);
    return thead;
  }

  /** Total per kecamatan atas daftar layanan: { input, kuota, kuotaAda }. */
  function totalKec(kec, layanan) {
    var t = { input: 0, kuota: 0, kuotaAda: false };
    layanan.forEach(function (l) {
      var kunci = l + '||' + kec;
      t.input += model.input[kunci] || 0;
      if (Object.prototype.hasOwnProperty.call(model.kuota, kunci)) { t.kuota += model.kuota[kunci]; t.kuotaAda = true; }
    });
    return t;
  }
  function totalLay(lay) {
    var t = { input: 0, kuota: 0, kuotaAda: false };
    model.kecamatan.forEach(function (kec) {
      var kunci = lay + '||' + kec;
      t.input += model.input[kunci] || 0;
      if (Object.prototype.hasOwnProperty.call(model.kuota, kunci)) { t.kuota += model.kuota[kunci]; t.kuotaAda = true; }
    });
    return t;
  }
  function selDari(t) { return selKuota(t.input, t.kuota, t.kuotaAda); }

  /** Matriks kecamatan x layanan. bisaBuka=true (bagian A): klik kecamatan membuka rincian kelurahan. */
  function matriksKecamatan(layanan, bisaBuka) {
    var tabel = buat('table', 'ci-tabel');
    tabel.appendChild(headTabel('KECAMATAN', layanan, true));
    var tbody = buat('tbody');
    var adaTanpaKuota = false;
    model.kecamatan.forEach(function (kec) {
      var tr = buat('tr', bisaBuka ? 'ci-klik' : '');
      var nm = buat('td', 'ci-nama');
      if (bisaBuka) {
        nm.appendChild(buat('span', 'ci-panah', kecamatanTerbuka[kec] ? '▾' : '▸'));
        tr.setAttribute('role', 'button');
        tr.setAttribute('aria-expanded', kecamatanTerbuka[kec] ? 'true' : 'false');
        tr.tabIndex = 0;
        tr.setAttribute('data-kec', kec);
        var buka = function (dariPapanKetik) {
          kecamatanTerbuka[kec] = !kecamatanTerbuka[kec];
          render();
          if (!dariPapanKetik) return;
          // render() membangun ulang tabel: kembalikan fokus papan ketik ke baris yang sama
          var baru = Array.prototype.filter.call($(ID_PANEL).querySelectorAll('tr.ci-klik'), function (t) { return t.getAttribute('data-kec') === kec; })[0];
          if (baru) baru.focus();
        };
        tr.addEventListener('click', function () { buka(false); });
        tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); buka(true); } });
      }
      nm.appendChild(document.createTextNode(kec));
      tr.appendChild(nm);
      layanan.forEach(function (l) {
        var kunci = l + '||' + kec;
        var ada = Object.prototype.hasOwnProperty.call(model.kuota, kunci);
        if (!ada) adaTanpaKuota = true;
        tr.appendChild(selKuota(model.input[kunci] || 0, model.kuota[kunci] || 0, ada));
      });
      tr.appendChild(selDari(totalKec(kec, layanan)));
      tbody.appendChild(tr);
      if (bisaBuka && kecamatanTerbuka[kec]) {
        var rinci = buat('tr', 'ci-rinci');
        var td = buat('td'); td.colSpan = layanan.length + 2;
        td.appendChild(rincianKelurahan(kec, layanan));
        rinci.appendChild(td);
        tbody.appendChild(rinci);
      }
    });
    var trTot = buat('tr', 'ci-total');
    trTot.appendChild(buat('td', 'ci-nama', 'TOTAL KOTA'));
    var semua = { input: 0, kuota: 0, kuotaAda: false };
    layanan.forEach(function (l) {
      var t = totalLay(l);
      semua.input += t.input; semua.kuota += t.kuota; semua.kuotaAda = semua.kuotaAda || t.kuotaAda;
      trTot.appendChild(selDari(t));
    });
    trTot.appendChild(selDari(semua));
    tbody.appendChild(trTot);
    tabel.appendChild(tbody);
    return { tabel: tabel, adaTanpaKuota: adaTanpaKuota };
  }

  /** Rincian satu kecamatan: kelurahan x layanan Kecamatan (angka input saja) + baris total kecamatan. */
  function rincianKelurahan(kec, layanan) {
    var wrap = buat('div');
    wrap.appendChild(buat('div', 'ci-judul', 'Rincian kelurahan — ' + kec));
    var gulir = buat('div', 'ci-gulir');
    var tabel = buat('table', 'ci-tabel');
    tabel.appendChild(headTabel('KELURAHAN', layanan, true));
    var tbody = buat('tbody');
    var daftar = (model.kelurahan[kec] || []).concat((model.tidakTerdaftar && model.tidakTerdaftar[kec]) || []);
    daftar.forEach(function (kel) {
      var tr = buat('tr', kel.total === 0 ? 'ci-belum' : '');
      var nm = buat('td', 'ci-nama', kel.nama);
      if (kel.total === 0) nm.appendChild(buat('small', '', 'Belum ada input'));
      else if (kel.tidakTerdaftar) nm.appendChild(buat('small', '', 'Tidak ada di daftar kelurahan'));
      tr.appendChild(nm);
      layanan.forEach(function (l) {
        var n = kel.perLayanan[l] || 0;
        tr.appendChild(buat('td', n === 0 ? 'ci-nol' : '', angka(n)));
      });
      tr.appendChild(buat('td', kel.total === 0 ? 'ci-nol' : '', angka(kel.total)));
      tbody.appendChild(tr);
    });
    var trTot = buat('tr', 'ci-total');
    trTot.appendChild(buat('td', 'ci-nama', 'TOTAL KECAMATAN'));
    layanan.forEach(function (l) {
      var kunci = l + '||' + kec;
      trTot.appendChild(selKuota(model.input[kunci] || 0, model.kuota[kunci] || 0, Object.prototype.hasOwnProperty.call(model.kuota, kunci)));
    });
    trTot.appendChild(selDari(totalKec(kec, layanan)));
    tbody.appendChild(trTot);
    tabel.appendChild(tbody);
    gulir.appendChild(tabel);
    wrap.appendChild(gulir);
    var adaTanpaKuota = layanan.some(function (l) { return !Object.prototype.hasOwnProperty.call(model.kuota, l + '||' + kec); });
    wrap.appendChild(keterangan({ kuota: true, kelurahan: true, adaTanpaKuota: adaTanpaKuota }));
    return wrap;
  }

  // ---------------------------------------------------------------------------------------------
  // Panel
  // ---------------------------------------------------------------------------------------------
  function kartuKpi(nilai, label) {
    var k = buat('div', 'ci-kartu');
    k.appendChild(buat('b', '', nilai));
    k.appendChild(buat('span', '', label));
    return k;
  }

  function stempel() {
    var d = new Date(model.diperbarui);
    if (isNaN(d.getTime())) return '';
    var g = new Date(d.getTime() + 7 * 3600000);     // WIB (UTC+7), sama dengan PDF, tak bergantung zona waktu perangkat
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return 'Data per ' + p(g.getUTCDate()) + '/' + p(g.getUTCMonth() + 1) + '/' + g.getUTCFullYear() + ' ' + p(g.getUTCHours()) + ':' + p(g.getUTCMinutes()) + ' WIB';
  }

  function pesanPanel(teks, galat) {
    var panel = $(ID_PANEL);
    if (!panel) return;
    panel.textContent = '';
    panel.appendChild(buat('p', 'ci-pesan' + (galat ? ' ci-err' : ''), teks));
  }

  function render() {
    var panel = $(ID_PANEL);
    if (!panel || !model) return;
    var posisi = panel.scrollTop;
    panel.textContent = '';
    var r = model.ringkasan;
    var totInput = r.kecamatan.totalInput + r.kemenag.totalInput;
    var totKuota = r.kecamatan.totalKuota + r.kemenag.totalKuota;

    var kpi = buat('div', 'ci-kpi');
    kpi.appendChild(kartuKpi(angka(totInput), 'Total input'));
    kpi.appendChild(kartuKpi(angka(totKuota), 'Total kuota'));
    kpi.appendChild(kartuKpi(teksPersen(persenDari(totInput, totKuota)), 'Capaian keseluruhan'));
    kpi.appendChild(kartuKpi(teksPersen(r.kecamatan.persen), 'Layanan Kecamatan'));
    kpi.appendChild(kartuKpi(teksPersen(r.kemenag.persen), 'Layanan Kemenag'));
    kpi.appendChild(kartuKpi(angka(r.kelurahanBelumInput) + ' dari ' + angka(r.jumlahKelurahan), 'Kelurahan belum ada input'));
    panel.appendChild(kpi);

    var sub = buat('div', 'ci-sub');
    [['A', 'A. Layanan Kecamatan'], ['B', 'B. Layanan Kemenag']].forEach(function (d) {
      var b = buat('button', 'ci-tab' + (bagianAktif === d[0] ? ' ci-on' : ''), d[1]);
      b.type = 'button';
      b.addEventListener('click', function () { bagianAktif = d[0]; render(); });
      sub.appendChild(b);
    });
    sub.appendChild(buat('span', 'ci-stempel', stempel()));
    sub.appendChild(kontrolPdf());
    panel.appendChild(sub);

    var layanan = bagianAktif === 'A' ? model.layananKecamatan : model.layananKemenag;
    if (!layanan.length) {
      panel.appendChild(buat('p', 'ci-pesan', 'Belum ada layanan untuk bagian ini.'));
    } else {
      var m = matriksKecamatan(layanan, bagianAktif === 'A');
      var gulir = buat('div', 'ci-gulir');
      gulir.appendChild(m.tabel);
      panel.appendChild(gulir);
      panel.appendChild(keterangan({ kuota: true, adaTanpaKuota: m.adaTanpaKuota }));
      if (bagianAktif === 'A') panel.appendChild(buat('p', 'ci-stempel', 'Klik nama kecamatan untuk melihat rincian per kelurahan.')).style.margin = '.5rem 0 0';
    }
    panel.scrollTop = posisi;
  }

  // ---------------------------------------------------------------------------------------------
  // Unduh PDF: data SEGAR (melewati cache) -> pustaka jsPDF + skrip penggambar dimuat malas -> simpan.
  // ---------------------------------------------------------------------------------------------
  function toast(pesan, jenis, durasi) {
    if (typeof tampilkanToast === 'function') tampilkanToast(pesan, jenis || 'info', { durasi: durasi || 6000 });
  }

  function kontrolPdf() {
    var wrap = buat('span', 'ci-pdf');
    var pilih = buat('select', 'ci-pilih');
    pilih.setAttribute('aria-label', 'Cakupan PDF');
    function opsi(parent, nilai, teks) { var o = buat('option', '', teks); o.value = nilai; parent.appendChild(o); }
    opsi(pilih, 'SEMUA', 'PDF: Semua (ringkasan + rincian semua kecamatan)');
    var gk = buat('optgroup'); gk.label = 'Satu kecamatan (rincian kelurahan)';
    model.kecamatan.forEach(function (k) { opsi(gk, 'KEC:' + k, k); });
    pilih.appendChild(gk);
    var gl = buat('optgroup'); gl.label = 'Satu layanan Kemenag (21 kecamatan)';
    model.layananKemenag.forEach(function (l) { opsi(gl, 'LAY:' + l, l); });
    pilih.appendChild(gl);
    pilih.value = cakupanPdf;
    if (pilih.value !== cakupanPdf) { cakupanPdf = 'SEMUA'; pilih.value = 'SEMUA'; }
    pilih.addEventListener('change', function () { cakupanPdf = pilih.value; });
    var tombol = buat('button', 'ci-unduh', sedangUnduh ? 'Menyiapkan…' : 'Unduh PDF');
    tombol.type = 'button';
    tombol.id = 'btn-unduh-capaian-input';
    tombol.disabled = sedangUnduh;
    tombol.addEventListener('click', unduhPdf);
    wrap.appendChild(pilih);
    wrap.appendChild(tombol);
    return wrap;
  }

  function panggilSegar(token, penanda) {
    return new Promise(function (resolve, reject) {
      var selesai = false;
      var timer = setTimeout(function () { if (!selesai) { selesai = true; reject(new Error('Waktu tunggu server habis.')); } }, BATAS_TUNGGU_MS);
      function akhir(fn, v) { if (selesai) return; selesai = true; clearTimeout(timer); fn(v); }
      try {
        // Argumen tambahan membentuk kunci cache baru -> selalu permintaan baru; server mengabaikannya.
        google.script.run
          .withSuccessHandler(function (r) { akhir(resolve, r); })
          .withFailureHandler(function (e) { akhir(reject, e); })
          .getCapaianInput(token, penanda);
      } catch (e) { akhir(reject, e); }
    });
  }

  function muatSkrip(url, siap) {
    return new Promise(function (resolve, reject) {
      if (siap()) { resolve(); return; }
      var s = document.createElement('script'), timer = null;
      function gagal() {
        clearTimeout(timer);
        if (s.parentNode) s.parentNode.removeChild(s);
        reject(new Error('Pustaka PDF gagal dimuat. Periksa koneksi, lalu coba lagi.'));
      }
      timer = setTimeout(gagal, BATAS_PUSTAKA_MS);
      s.onload = function () { clearTimeout(timer); if (siap()) resolve(); else gagal(); };
      s.onerror = gagal;
      s.async = true;
      s.src = url + (VERSI ? '?v=' + VERSI : '');
      document.head.appendChild(s);
    });
  }

  function aturTombolUnduh(sibuk) {
    var t = $('btn-unduh-capaian-input');
    if (!t) return;
    t.disabled = sibuk;
    t.textContent = sibuk ? 'Menyiapkan…' : 'Unduh PDF';
  }

  function unduhPdf() {
    if (sedangUnduh) return;
    if (!adalahUtama()) { toast('Laporan hanya dapat dibuat oleh Admin Utama.', 'gagal'); return; }
    var tokenAwal = dataPengguna.token;
    var cakupan = { jenis: 'SEMUA' };
    if (cakupanPdf.indexOf('KEC:') === 0) cakupan = { jenis: 'KECAMATAN', nama: cakupanPdf.slice(4) };
    else if (cakupanPdf.indexOf('LAY:') === 0) cakupan = { jenis: 'LAYANAN', nama: cakupanPdf.slice(4) };
    sedangUnduh = true;
    aturTombolUnduh(true);
    var pustaka = Promise.all([
      muatSkrip('/js/vendor/jspdf.umd.min.js', function () { return !!(window.jspdf && window.jspdf.jsPDF); }),
      muatSkrip('/js/app-capaian-input-pdf.js', function () { return !!window.DJPMCapaianPdf; })
    ]);
    pustaka.catch(function () { /* galatnya ditangani di rantai utama */ });
    Promise.all([panggilSegar(tokenAwal, 'ci' + Date.now()), pustaka]).then(function (h) {
      var res = h[0];
      if (!res || res.sukses === false || !Array.isArray(res.kecamatan)) throw new Error((res && res.pesan) || 'Data capaian input tidak valid.');
      if (!adalahUtama() || dataPengguna.token !== tokenAwal) return;           // sesi berganti selagi menunggu
      if (cakupan.jenis === 'KECAMATAN' && res.kecamatan.indexOf(cakupan.nama) < 0) throw new Error('Kecamatan tidak ditemukan.');
      if (cakupan.jenis === 'LAYANAN' && res.layananKemenag.indexOf(cakupan.nama) < 0) throw new Error('Layanan tidak ditemukan.');
      model = res;                                                              // layar ikut menampilkan angka yang sama dengan PDF
      if (tabAktif === 'capaian') render();
      var nama = window.DJPMCapaianPdf.namaBerkas(res, cakupan);
      var doc = window.DJPMCapaianPdf.gambar(window.jspdf, res, cakupan, (dataPengguna && dataPengguna.username) || '');
      doc.save(nama);
      toast('Laporan PDF diunduh: ' + nama, 'sukses', 7000);
    }).catch(function (e) {
      toast('Gagal membuat PDF: ' + ((e && e.message) || e), 'gagal', 8000);
    }).then(function () {
      sedangUnduh = false;
      aturTombolUnduh(false);
    });
  }

  function muat(tanpaSkeleton) {
    if (!adalahUtama() || typeof google === 'undefined' || !google.script || !google.script.run) return;
    if (sedangMemuat) return;
    sedangMemuat = true;
    if (!tanpaSkeleton && !model) pesanPanel('Memuat data…');
    google.script.run
      .withSuccessHandler(function (res) {
        sedangMemuat = false;
        if (!res || !res.sukses) {
          if (!model) pesanPanel('Gagal memuat: ' + (res && res.pesan ? res.pesan : 'tidak diketahui'), true);
          return;
        }
        model = res;
        render();
      })
      .withFailureHandler(function (err) {
        sedangMemuat = false;
        if (!model) pesanPanel('Error: ' + ((err && err.message) || err), true);
      })
      .getCapaianInput(dataPengguna.token);
  }

  // ---------------------------------------------------------------------------------------------
  // Pemasangan tab
  // ---------------------------------------------------------------------------------------------
  function pilihTab(nama) {
    tabAktif = nama;
    var modal = $(ID_MODAL);
    var lama = $(ID_PEMBUNGKUS_LAMA);
    var panel = $(ID_PANEL);
    if (!modal || !lama || !panel) return;
    var capaian = nama === 'capaian';
    modal.classList.toggle(KELAS_AKTIF, capaian);
    lama.classList.toggle('hidden', capaian);
    panel.classList.toggle('hidden', !capaian);
    var bar = $(ID_TAB);
    if (bar) Array.prototype.forEach.call(bar.children, function (b) {
      b.classList.toggle('ci-on', b.getAttribute('data-tab') === nama);
      b.setAttribute('aria-selected', b.getAttribute('data-tab') === nama ? 'true' : 'false');
    });
    if (capaian) muat(false);
  }

  function pasang() {
    if (!adalahUtama() || $(ID_TAB)) return;
    var modal = $(ID_MODAL);
    var kotak = modal && modal.firstElementChild;
    var isiLama = $('isi-dashboard-progres');
    var filterLama = $('filter-dashboard-wrap');
    if (!kotak || !isiLama || !filterLama || !kotak.lastElementChild) return;

    if (!$(ID_STYLE)) { var st = buat('style'); st.id = ID_STYLE; st.textContent = CSS; document.head.appendChild(st); }

    // Dashboard lama dibungkus (tidak diubah): render ulang realtime-nya tak bisa menampilkan filter saat tab lain aktif.
    var bungkus = buat('div'); bungkus.id = ID_PEMBUNGKUS_LAMA;
    bungkus.style.cssText = 'display:flex;flex-direction:column;min-height:0;overflow:hidden;flex:1 1 auto';
    kotak.insertBefore(bungkus, filterLama);
    bungkus.appendChild(filterLama);
    bungkus.appendChild(isiLama);
    isiLama.style.overflowY = 'auto';
    isiLama.style.minHeight = '0';
    isiLama.style.flex = '1 1 auto';

    var panel = buat('div', 'hidden'); panel.id = ID_PANEL;
    panel.style.flex = '1 1 auto';
    panel.style.minHeight = '0';
    kotak.insertBefore(panel, kotak.lastElementChild);

    var bar = buat('div'); bar.id = ID_TAB; bar.setAttribute('role', 'tablist');
    [['verifikasi', 'Progres Verifikasi'], ['capaian', 'Capaian Input']].forEach(function (d) {
      var b = buat('button', 'ci-tab' + (d[0] === 'verifikasi' ? ' ci-on' : ''), d[1]);
      b.type = 'button'; b.setAttribute('data-tab', d[0]); b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', d[0] === 'verifikasi' ? 'true' : 'false');
      b.addEventListener('click', function () { pilihTab(d[0]); });
      bar.appendChild(b);
    });
    kotak.insertBefore(bar, bungkus);

    // Tombol Dashboard selalu membuka tab pertama (perilaku lama tidak berubah).
    var tombol = $('btn-dashboard-progres');
    if (tombol) tombol.addEventListener('click', function () { if (tabAktif !== 'verifikasi') pilihTab('verifikasi'); });

    // Sinyal realtime (domain kuota/penerima): segarkan hanya bila tab ini sedang tampil.
    window.addEventListener('djpm:swr-invalidated', function (ev) {
      var dom = (ev.detail && ev.detail.domains) || [];
      if (!(dom.indexOf('*') !== -1 || dom.indexOf('kuota') !== -1 || dom.indexOf('penerima') !== -1)) return;
      if (tabAktif !== 'capaian' || modal.classList.contains('hidden')) return;
      clearTimeout(pemuatUlang);
      pemuatUlang = setTimeout(function () { muat(true); }, 800);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pasang);
  else pasang();
})();
