/**
 * public/js/app-pembagian-awal-admin.js
 * Panel Admin Utama untuk PEMBAGIAN VERIFIKASI AWAL (bagi rata otomatis). Rencana: plans/plan-verifikasi-awal-bagi-rata.md.
 * Dimuat malas hanya untuk role UTAMA (SKRIP_PER_PERAN di app-pesan-periode.js).
 *
 * Isi: status saklar (NYALA/MATI), jumlah data menunggu, tabel per verifikator (jumlah, selesai, sisa), pratinjau pembagian, tombol
 * Nyalakan / Matikan / Bagikan sekarang, dan riwayat penyisiran. SERVER yang menegakkan semua aturan (Admin Utama saja, sama jumlah,
 * pimpinan tidak menerima); modul ini hanya menampilkan dan memanggil. Semua teks dari server dipasang lewat esc().
 */
(function (akar, pabrik) {
  var api = pabrik(akar);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else akar.djpmPembagianAwalAdmin = api;
})(typeof self !== 'undefined' ? self : this, function (akar) {
  'use strict';

  // ------------------------------------------------------------------ bagian murni (diuji di Node)
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return (Number(n) || 0).toLocaleString('id-ID'); }

  /** Akun yang ikut dibagi (bukan pimpinan/akun khusus dan masih aktif); hanya mereka yang dibandingkan jumlahnya. */
  function akunPenerima(akun) { return (akun || []).filter(function (a) { return a && a.aktif !== false && !a.dikecualikan; }); }

  /** Selisih jumlah terbesar - terkecil di antara akun penerima (angka keadilan yang ditampilkan). */
  function selisihJumlah(akun) {
    var n = akunPenerima(akun).map(function (a) { return Number(a.jumlah) || 0; });
    return n.length ? Math.max.apply(null, n) - Math.min.apply(null, n) : 0;
  }

  /** Urutan tabel: penerima dulu (jumlah terbesar di atas), lalu yang tidak menerima. */
  function urutAkun(akun) {
    return (akun || []).slice().sort(function (a, b) {
      var pa = a.aktif !== false && !a.dikecualikan ? 0 : 1, pb = b.aktif !== false && !b.dikecualikan ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (Number(b.jumlah) || 0) - (Number(a.jumlah) || 0) || String(a.username).localeCompare(String(b.username));
    });
  }

  /** Apakah tombol Nyalakan boleh ditekan: saklar MATI dan pratinjau sudah dilihat. */
  function bolehNyalakan(status, pratinjau) { return !!(status && status.aktif === false && pratinjau && pratinjau.sukses === true); }

  var api = { esc: esc, fmt: fmt, akunPenerima: akunPenerima, selisihJumlah: selisihJumlah, urutAkun: urutAkun, bolehNyalakan: bolehNyalakan, buka: function () { /* diganti di browser */ } };
  if (!akar || !akar.document) return api;

  // ------------------------------------------------------------------ tampilan
  var dok = akar.document;
  var ID = 'djpm-pba-overlay', ID_STYLE = 'djpm-pba-style', ID_TOMBOL = 'btn-pembagian-awal';
  var BATAS_TUNGGU_MS = 60000;
  var st = { status: null, ambil: 'idle', pesan: '', pratinjau: null, sibuk: '', info: '', konfirmasi: '', pembuka: null };

  function pengguna() { return (typeof dataPengguna !== 'undefined') ? dataPengguna : null; }
  function berhak() { var p = pengguna(); return !!(p && p.token && String(p.role || '').trim().toUpperCase() === 'UTAMA'); }
  function toast(pesan, jenis) { try { if (typeof tampilkanToast === 'function') tampilkanToast(pesan, jenis || 'gagal', { durasi: 6000 }); } catch (_e) { /* abaikan */ } }

  function rpc(nama, args) {
    var p = pengguna(); var token = p && p.token;
    return new Promise(function (resolve, reject) {
      if (!token) { reject(new Error('Sesi tidak ditemukan.')); return; }
      var selesai = false;
      var timer = setTimeout(function () { akhir(reject, new Error('Waktu tunggu server habis. Coba lagi.')); }, BATAS_TUNGGU_MS);
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
    s.textContent = [
      '#' + ID + '{position:fixed;inset:0;z-index:9500;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:max(12px,env(safe-area-inset-top,0px)) max(12px,env(safe-area-inset-right,0px)) max(12px,env(safe-area-inset-bottom,0px)) max(12px,env(safe-area-inset-left,0px));font-family:inherit}',
      '#' + ID + ' *{box-sizing:border-box}',
      '#' + ID + ' .pba-kotak{background:#fff;color:#0f172a;border-radius:16px;width:100%;max-width:980px;margin:8px auto;box-shadow:0 20px 50px rgba(0,0,0,.3);overflow:hidden}',
      '#' + ID + ' .pba-kepala{display:flex;gap:10px 16px;align-items:center;justify-content:space-between;padding:16px 18px;background:#f1f5f9;border-bottom:1px solid #dbe1ea}',
      '#' + ID + ' .pba-kepala h2{margin:0;font-size:1.15rem;font-weight:700}',
      '#' + ID + ' .pba-sub{font-size:.78rem;color:#5a6879;margin-top:2px}',
      '#' + ID + ' .pba-tutup{border:1px solid #cbd5e1;background:#fff;border-radius:8px;min-height:40px;min-width:40px;cursor:pointer;font-size:1.1rem}',
      '#' + ID + ' .pba-isi{padding:18px;display:grid;gap:16px;grid-template-columns:minmax(0,1fr)}',
      '#' + ID + ' .pba-isi>*{min-width:0}',
      '#' + ID + ' h3{margin:0 0 6px;font-size:.95rem;font-weight:700}',
      '#' + ID + ' .pba-cat{font-size:.8rem;color:#5a6879}',
      '#' + ID + ' .pba-status{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center}',
      '#' + ID + ' .pba-lencana{display:inline-block;padding:3px 12px;border-radius:99px;font-weight:700;font-size:.8rem;border:1px solid #cbd5e1}',
      '#' + ID + ' .pba-lencana.nyala{background:#e1f4ea;color:#15803d;border-color:#9bd3b4}#' + ID + ' .pba-lencana.mati{background:#f1f5f9;color:#475569}',
      '#' + ID + ' .pba-aksi{display:flex;flex-wrap:wrap;gap:8px}',
      '#' + ID + ' button{font:inherit}',
      '#' + ID + ' .pba-btn{border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:8px;padding:8px 14px;min-height:40px;font-weight:600;cursor:pointer}',
      '#' + ID + ' .pba-btn.utama{background:#17365d;color:#fff;border-color:#17365d}',
      '#' + ID + ' .pba-btn.bahaya{background:#b3261e;color:#fff;border-color:#b3261e}',
      '#' + ID + ' .pba-btn[disabled]{opacity:.45;cursor:not-allowed}',
      '#' + ID + ' button:focus-visible{outline:3px solid #0f766e;outline-offset:2px}',
      '#' + ID + ' .pba-tabel{overflow-x:auto;border:1px solid #dbe1ea;border-radius:10px}',
      '#' + ID + ' table{width:100%;border-collapse:collapse;font-size:.85rem}',
      '#' + ID + ' th,#' + ID + ' td{padding:7px 10px;border-bottom:1px solid #e5e9f0;text-align:left;white-space:nowrap}',
      '#' + ID + ' th{background:#f8fafc;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:#5a6879}',
      '#' + ID + ' td.n,#' + ID + ' th.n{text-align:right;font-variant-numeric:tabular-nums}',
      '#' + ID + ' tr.tidak td{color:#94a3b8}',
      '#' + ID + ' .pba-pesan{border-radius:8px;padding:8px 12px;font-size:.85rem;overflow-wrap:anywhere}',
      '#' + ID + ' .pba-pesan.info{background:#eef3fb;color:#17365d}#' + ID + ' .pba-pesan.ok{background:#e1f4ea;color:#15803d}#' + ID + ' .pba-pesan.gagal{background:#fde7e5;color:#b3261e}#' + ID + ' .pba-pesan.peringatan{background:#fff0d4;color:#7c4a00}',
    ].join('\n');
    dok.head.appendChild(s);
  }

  function tabelAkun(akun) {
    return '<div class="pba-tabel"><table><thead><tr><th>Verifikator</th><th>Tim</th><th class="n">Jumlah</th><th class="n">Titik awal</th><th class="n">Ditugaskan</th><th class="n">Selesai</th><th class="n">Sisa</th><th>Keterangan</th></tr></thead><tbody>' +
      urutAkun(akun).map(function (a) {
        var tidak = a.aktif === false || a.dikecualikan;
        return '<tr class="' + (tidak ? 'tidak' : '') + '"><td>' + esc(a.namaLengkap || a.username) + '<div class="pba-cat">' + esc(a.username) + '</div></td><td>' + esc(a.tim) + '</td><td class="n"><b>' + fmt(a.jumlah) + '</b></td><td class="n">' + fmt(a.dasar) + '</td><td class="n">' + fmt(a.ditugaskan) + '</td><td class="n">' + fmt(a.selesai) + '</td><td class="n">' + fmt(a.sisa) + '</td><td>' + (a.dikecualikan ? 'Tidak menerima (pimpinan/khusus)' : (a.aktif === false ? 'Akun nonaktif' : '')) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function tabelPratinjau(p) {
    return '<div class="pba-tabel"><table><thead><tr><th>Verifikator</th><th class="n">Jumlah sekarang</th><th class="n">Akan menerima</th><th class="n">Jumlah akhir</th></tr></thead><tbody>' +
      p.perAkun.map(function (a) { return '<tr><td>' + esc(a.username) + '</td><td class="n">' + fmt(a.jumlahAwal) + '</td><td class="n">' + fmt(a.diterima) + '</td><td class="n"><b>' + fmt(a.jumlahAkhir) + '</b></td></tr>'; }).join('') + '</tbody></table></div>';
  }

  function gambar() {
    var o = dok.getElementById(ID); if (!o) return;
    var s = st.status, h = '';
    if (st.ambil === 'muat' && !s) h = '<div class="pba-pesan info" role="status">Memuat…</div>';
    else if (st.ambil === 'gagal' && !s) h = '<div class="pba-pesan gagal" role="alert">' + esc(st.pesan) + ' <button type="button" class="pba-btn" data-aksi="muat">Coba lagi</button></div>';
    else if (s) {
      var nyala = s.aktif === true;
      h += '<div class="pba-status"><span class="pba-lencana ' + (nyala ? 'nyala' : 'mati') + '">' + (nyala ? 'NYALA' : 'MATI') + '</span><span>Menunggu dibagikan: <b>' + fmt(s.menunggu) + '</b> data</span><span>Selisih jumlah antar verifikator: <b>' + fmt(selisihJumlah(s.akun)) + '</b></span></div>';
      h += '<div class="pba-cat">' + (nyala
        ? 'Data baru dibagikan otomatis (tiap ±10 menit) kepada verifikator dengan jumlah paling sedikit. Verifikator hanya dapat memberi hasil pada data yang ditugaskan kepadanya; data tetap di akunnya sampai selesai.'
        : 'Pembagian MATI: verifikator memilih sendiri data yang dikerjakan. Lihat pratinjau lebih dulu sebelum menyalakan.') + '</div>';
      h += '<div class="pba-aksi">';
      if (!nyala) {
        h += '<button type="button" class="pba-btn" data-aksi="pratinjau"' + (st.sibuk ? ' disabled' : '') + '>' + (st.sibuk === 'pratinjau' ? 'Menghitung…' : 'Lihat pratinjau pembagian') + '</button>';
        h += '<button type="button" class="pba-btn utama" data-aksi="nyalakan"' + (bolehNyalakan(s, st.pratinjau) && !st.sibuk ? '' : ' disabled') + '>Nyalakan pembagian</button>';
      } else {
        h += '<button type="button" class="pba-btn utama" data-aksi="bagi"' + (st.sibuk ? ' disabled' : '') + '>' + (st.sibuk === 'bagi' ? 'Membagikan…' : 'Bagikan sekarang') + '</button>';
        h += '<button type="button" class="pba-btn" data-aksi="matikan"' + (st.sibuk ? ' disabled' : '') + '>Matikan pembagian</button>';
      }
      h += '<button type="button" class="pba-btn" data-aksi="muat"' + (st.sibuk ? ' disabled' : '') + '>Segarkan</button></div>';
      if (st.konfirmasi === 'nyalakan') h += '<div class="pba-pesan peringatan" role="alert">Menyalakan akan langsung membagikan ' + fmt(st.pratinjau ? st.pratinjau.dibagi : 0) + ' data dan mulai membatasi verifikator pada data tugasnya. <button type="button" class="pba-btn utama" data-aksi="nyalakan-ya">Ya, nyalakan</button> <button type="button" class="pba-btn" data-aksi="batal-konfirmasi">Batal</button></div>';
      if (st.konfirmasi === 'matikan') h += '<div class="pba-pesan peringatan" role="alert">Mematikan mengembalikan cara lama: verifikator memilih data sendiri. Tugas yang sudah dibagikan tetap tersimpan. <button type="button" class="pba-btn bahaya" data-aksi="matikan-ya">Ya, matikan</button> <button type="button" class="pba-btn" data-aksi="batal-konfirmasi">Batal</button></div>';
      if (st.info) h += '<div class="pba-pesan ' + (st.infoGagal ? 'gagal' : 'ok') + '" role="status">' + esc(st.info) + '</div>';
      if (st.pratinjau && !nyala) {
        var p = st.pratinjau;
        h += '<div><h3>Pratinjau pembagian</h3><div class="pba-cat">' + fmt(p.dibagi) + ' data akan dibagikan. Jumlah akhir tiap verifikator yang menerima: selisih ' + fmt(p.selisih) + '. Tidak ada yang ditulis sebelum Anda menyalakan.</div>' + tabelPratinjau(p) + '</div>';
      }
      h += '<div><h3>Per verifikator</h3><div class="pba-cat">Jumlah = titik awal (Verifikasi Awal yang sudah dikerjakan saat dinyalakan) + data yang ditugaskan sejak itu, tidak termasuk tugas yang ditutup (datanya diverifikasi pihak lain).</div>' + tabelAkun(s.akun) + '</div>';
      if (s.sapuan && s.sapuan.length) {
        h += '<div><h3>Riwayat pembagian</h3><div class="pba-tabel"><table><thead><tr><th>Waktu</th><th>Jenis</th><th>Oleh</th><th class="n">Dibagi</th><th class="n">Ditutup</th></tr></thead><tbody>' +
          s.sapuan.map(function (x) { return '<tr><td>' + esc(String(x.waktu || '').replace('T', ' ').slice(0, 19)) + '</td><td>' + esc(x.jenis) + '</td><td>' + esc(x.oleh) + '</td><td class="n">' + fmt(x.dibagi) + '</td><td class="n">' + fmt(x.ditutup) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
      }
    }
    o.querySelector('#pba-isi').innerHTML = h;
  }

  function muat() {
    st.ambil = 'muat'; st.pesan = ''; gambar();
    return rpc('getStatusPembagianAwal', []).then(function (res) {
      if (!res || res.sukses !== true) { st.ambil = 'gagal'; st.pesan = (res && res.pesan) || 'Gagal memuat status.'; gambar(); return; }
      st.ambil = 'siap'; st.status = res; gambar();
    }).catch(function (e) { st.ambil = 'gagal'; st.pesan = e.message; gambar(); });
  }

  function jalankan(nama, args, kunciSibuk, pesanSukses) {
    st.sibuk = kunciSibuk; st.info = ''; st.infoGagal = false; st.konfirmasi = ''; gambar();
    return rpc(nama, args || []).then(function (res) {
      st.sibuk = '';
      if (!res || res.sukses !== true) { st.info = (res && res.pesan) || 'Gagal.'; st.infoGagal = true; gambar(); return null; }
      return res;
    }).catch(function (e) { st.sibuk = ''; st.info = e.message; st.infoGagal = true; gambar(); return null; })
      .then(function (res) { if (res) { st.info = res.pesan || pesanSukses || 'Selesai.'; return muat().then(function () { return res; }); } return null; });
  }

  function pratinjau() {
    st.sibuk = 'pratinjau'; st.info = ''; st.infoGagal = false; st.konfirmasi = ''; gambar();
    rpc('pratinjauPembagianAwal', []).then(function (res) {
      st.sibuk = '';
      if (!res || res.sukses !== true) { st.pratinjau = null; st.info = (res && res.pesan) || 'Gagal menghitung pratinjau.'; st.infoGagal = true; }
      else if (res.dilewati) { st.pratinjau = null; st.info = res.dilewati; st.infoGagal = true; }
      else st.pratinjau = res;
      gambar();
    }).catch(function (e) { st.sibuk = ''; st.pratinjau = null; st.info = e.message; st.infoGagal = true; gambar(); });
  }

  function tutup() {
    var o = dok.getElementById(ID); if (o && o.parentNode) o.parentNode.removeChild(o);
    dok.removeEventListener('keydown', saatTombol, true);
    if (st.pembuka && st.pembuka.focus) { try { st.pembuka.focus(); } catch (_e) { /* abaikan */ } }
    st.pembuka = null;
  }
  function saatTombol(e) { if (e.key === 'Escape') { e.preventDefault(); tutup(); } }

  function bukaPanel(pembuka) {
    if (!berhak()) { toast('Fitur ini khusus Admin Utama.'); return; }
    suntikStyle();
    if (dok.getElementById(ID)) return;
    st.pembuka = pembuka || dok.activeElement; st.status = null; st.pratinjau = null; st.info = ''; st.infoGagal = false; st.konfirmasi = ''; st.sibuk = '';
    var o = dok.createElement('div'); o.id = ID; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-labelledby', 'pba-judul');
    o.innerHTML = '<div class="pba-kotak"><div class="pba-kepala"><div><h2 id="pba-judul">Pembagian Awal</h2><div class="pba-sub">Verifikasi Awal dibagi rata otomatis, sama jumlah per verifikator</div></div><button type="button" class="pba-tutup" id="pba-tutup" aria-label="Tutup">✕</button></div><div class="pba-isi" id="pba-isi"></div></div>';
    dok.body.appendChild(o);
    o.addEventListener('mousedown', function (e) { if (e.target === o) tutup(); });
    o.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-aksi], #pba-tutup') : null; if (!t) return;
      if (t.id === 'pba-tutup') { tutup(); return; }
      var a = t.getAttribute('data-aksi');
      if (a === 'muat') muat();
      else if (a === 'pratinjau') pratinjau();
      else if (a === 'nyalakan') { st.konfirmasi = 'nyalakan'; gambar(); }
      else if (a === 'matikan') { st.konfirmasi = 'matikan'; gambar(); }
      else if (a === 'batal-konfirmasi') { st.konfirmasi = ''; gambar(); }
      else if (a === 'nyalakan-ya') jalankan('aturPembagianAwal', [true], 'nyalakan', 'Pembagian dinyalakan.').then(function (r) { if (r) st.pratinjau = null; });
      else if (a === 'matikan-ya') jalankan('aturPembagianAwal', [false], 'matikan', 'Pembagian dimatikan.');
      else if (a === 'bagi') jalankan('bagiSekarangAwal', [], 'bagi', 'Selesai.');
    });
    dok.addEventListener('keydown', saatTombol, true);
    gambar(); muat();
    var b = dok.getElementById('pba-tutup'); if (b) b.focus();
  }
  api.buka = bukaPanel;
  akar.bukaPembagianAwalAdmin = bukaPanel;

  // ------------------------------------------------------------------ pintu masuk Admin Utama + penyelarasan
  function selaras() {
    var tombol = dok.getElementById(ID_TOMBOL);
    if (!berhak()) { if (tombol && tombol.parentNode) tombol.parentNode.removeChild(tombol); if (dok.getElementById(ID)) tutup(); return; }
    if (tombol) { tombol.hidden = false; return; }
    var acuan = dok.getElementById('btn-verifikasi-ulang') || dok.getElementById('btn-agregat-verifikasi') || dok.getElementById('btn-progres-kuota') || dok.getElementById('btn-dashboard-progres');
    if (!acuan || !acuan.parentNode) return;
    var b = dok.createElement('button'); b.id = ID_TOMBOL; b.type = 'button';
    var cls = (dok.getElementById('btn-progres-kuota') || acuan).className;
    b.className = cls.replace(/\bhidden\b/g, '').replace(/\s+/g, ' ').trim();
    b.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" style="color:#0f766e" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-4.13a4 4 0 100-8 4 4 0 000 8zm6 0a3 3 0 100-6M3 9a3 3 0 106 0"/></svg><span>Pembagian Awal</span>';
    b.addEventListener('click', function () { bukaPanel(b); });
    acuan.parentNode.insertBefore(b, acuan.nextSibling);
  }
  setInterval(function () { try { selaras(); } catch (_e) { /* abaikan */ } }, 2000);
  selaras();
  return api;
});
