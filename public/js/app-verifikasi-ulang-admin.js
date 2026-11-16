/**
 * public/js/app-verifikasi-ulang-admin.js
 * Layar Admin Utama untuk VERIFIKASI ULANG: buat paket tugas (dengan pratinjau pembagian), pantau paket, dan daftar koreksi. Rencana: plans/plan-verifikasi-ulang.md (T5).
 * Dimuat malas hanya untuk role UTAMA (SKRIP_PER_PERAN di app-pesan-periode.js).
 *
 * Hak dan pembagian ditentukan SERVER (peran Admin, pengecualian akun pimpinan, akun khusus BTL/TMS, aturan V1, selisih maksimal 1);
 * modul ini hanya menampilkan. "Bagikan" hanya aktif bila pratinjau terbaru cocok dengan isian formulir (benih yang sama -> pembagian yang sama).
 * Pembatalan memakai konfirmasi di halaman (bukan dialog bawaan peramban). Semua teks dari server dipasang lewat esc().
 */
(function (akar, pabrik) {
  var api = pabrik(akar);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else akar.djpmVerifikasiUlangAdmin = api;
})(typeof self !== 'undefined' ? self : this, function (akar) {
  'use strict';

  // ------------------------------------------------------------------ bagian murni (diuji di Node)
  var STATUS_SEMUA = ['Memenuhi Syarat', 'Berkas Tidak Lengkap', 'Tidak Memenuhi Syarat'];
  var MAKS_JUMLAH = 5000;

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return (Number(n) || 0).toLocaleString('id-ID'); }
  function persen(a, b) { return b ? Math.round((Number(a) || 0) * 100 / b) : 0; }
  function kelasStatus(s) { return s === 'Memenuhi Syarat' ? 'ms' : (s === 'Berkas Tidak Lengkap' ? 'btl' : (s === 'Tidak Memenuhi Syarat' ? 'tms' : '')); }
  function singkatStatus(s) { return s === 'Memenuhi Syarat' ? 'MS' : (s === 'Berkas Tidak Lengkap' ? 'BTL' : (s === 'Tidak Memenuhi Syarat' ? 'TMS' : s)); }
  function tanggalPendek(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
    return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
  }

  /** Isian formulir -> kriteria untuk server. form: { nama, status:[], layanan:[], jumlah, batasSelesai, benih } */
  function susunKriteria(form) {
    var f = form || {};
    var jumlah = Math.floor(Number(f.jumlah) || 0);
    return {
      nama: String(f.nama || '').trim(),
      status: (f.status || []).filter(function (s) { return STATUS_SEMUA.indexOf(s) !== -1; }),
      layanan: (f.layanan || []).map(function (x) { return String(x).trim(); }).filter(Boolean),
      jumlah: jumlah > 0 ? jumlah : 0,
      batasSelesai: String(f.batasSelesai || '').trim(),
      benih: String(f.benih || '').trim()
    };
  }

  /** Pesan kesalahan isian (kosong = sah). `untukBagi` menambah syarat nama dan benih. */
  function validasiKriteria(k, untukBagi) {
    if (!k.status.length) return 'Pilih minimal satu status yang diverifikasi ulang.';
    if (k.jumlah < 0 || k.jumlah > MAKS_JUMLAH) return 'Jumlah data per paket maksimal ' + MAKS_JUMLAH + '.';
    if (k.batasSelesai && !/^\d{4}-\d{2}-\d{2}$/.test(k.batasSelesai)) return 'Batas selesai tidak valid.';
    if (untukBagi) {
      if (!k.nama) return 'Nama paket wajib diisi.';
      if (!k.benih) return 'Lakukan pratinjau lebih dulu supaya benih tercatat.';
    }
    return '';
  }

  /** Sidik jari isian: "Bagikan" hanya sah bila sama dengan isian saat pratinjau. */
  function sidik(k) { return JSON.stringify([k.status.slice().sort(), k.layanan.slice().sort(), k.jumlah, k.batasSelesai, k.benih]); }

  /**
   * Badge sasaran verifikasi ulang (jawaban getRingkasanSasaranUlang) -> daftar kartu {kunci, label, nilai, catatan}. Sasaran = data hasil Admin (bukan hasil verifikator)
   * yang belum dibayar. "Sisa" = belum diperiksa dan belum ditugaskan (kolam paket berikutnya).
   */
  function kartuSasaran(r) {
    if (!r || r.sukses !== true) return [];
    var n = function (v) { return Math.max(0, Number(v) || 0); };
    return [
      { kunci: 'sasaran', label: 'Data yang akan diverifikasi ulang', nilai: n(r.sasaran), catatan: 'hasil Admin' },
      { kunci: 'ditugaskan', label: 'Sedang ditugaskan', nilai: n(r.sedangDitugaskan), catatan: 'paket aktif' },
      { kunci: 'selesai', label: 'Sudah diperiksa ulang', nilai: n(r.sudahDiperiksa), catatan: '' },
      { kunci: 'sisa', label: 'Sisa belum ditugaskan', nilai: n(r.sisa), catatan: 'untuk paket berikutnya' },
    ];
  }
  /** Catatan di bawah kartu: data yang sengaja tidak ikut. */
  function catatanSasaran(r) {
    if (!r || r.sukses !== true) return '';
    return 'Tidak ikut: ' + fmt(r.hasilVerifikator) + ' data hasil verifikasi petugas verifikator dan ' + fmt(r.sudahDibayar) + ' data yang sudah masuk batch pembayaran.';
  }

  var api = { kartuSasaran: kartuSasaran, catatanSasaran: catatanSasaran, susunKriteria: susunKriteria, validasiKriteria: validasiKriteria, sidik: sidik, persen: persen, tanggalPendek: tanggalPendek, singkatStatus: singkatStatus, esc: esc, fmt: fmt, buka: function () { /* diganti di browser */ } };
  if (!akar || !akar.document) return api;   // lingkungan uji Node: hanya bagian murni

  // ------------------------------------------------------------------ tampilan
  var dok = akar.document;
  var ID = 'djpm-vua-overlay', ID_STYLE = 'djpm-vua-style', ID_TOMBOL = 'btn-verifikasi-ulang';
  var BATAS_TUNGGU_MS = 60000;
  var st = {
    tab: 'buat', pembuka: null,
    form: { nama: '', status: STATUS_SEMUA.slice(), layanan: [], jumlah: 600, batasSelesai: '', benih: '' },
    daftarLayanan: null, pratinjau: null, sidikPratinjau: '', status: 'idle', pesan: '', bagi: false,
    paket: null, paketStatus: 'idle', paketPesan: '', info: {}, konfirmasiBatal: 0, unduh: {},
    koreksi: null, koreksiStatus: 'idle', koreksiPesan: '', halaman: 1, bukaBatalKoreksi: 0, alasanBatal: '', pesanKoreksi: ''
  };

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
      '#' + ID + ' .vua-kotak{background:#fff;color:#0f172a;border-radius:16px;width:100%;max-width:1080px;margin:8px auto;box-shadow:0 20px 50px rgba(0,0,0,.3);overflow:hidden}',
      '#' + ID + ' .vua-kepala{display:flex;gap:10px 16px;align-items:center;justify-content:space-between;padding:16px 18px;background:#f1f5f9;border-bottom:1px solid #dbe1ea}',
      '#' + ID + ' .vua-kepala h2{margin:0;font-size:1.15rem;font-weight:700}',
      '#' + ID + ' .vua-sub{font-size:.78rem;color:#5a6879;margin-top:2px}',
      '#' + ID + ' .vua-tutup{border:1px solid #cbd5e1;background:#fff;border-radius:8px;min-height:40px;min-width:40px;cursor:pointer;font-size:1.1rem}',
      '#' + ID + ' .vua-badge{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;padding:12px 18px 0}',
      '#' + ID + ' .vua-badge .vua-bk{border:1px solid #dbe1ea;border-radius:10px;padding:8px 12px;background:#f8fafc;min-width:0}',
      '#' + ID + ' .vua-badge .vua-bk b{display:block;font-size:1.25rem;line-height:1.2;font-variant-numeric:tabular-nums}',
      '#' + ID + ' .vua-badge .vua-bk.utama{background:#eef3fb;border-color:#9fb7dc}',
      '#' + ID + ' .vua-badge-cat{padding:6px 18px 10px;font-size:.78rem;color:#5a6879}',
      '#' + ID + ' .vua-tab{display:flex;gap:4px;flex-wrap:wrap;padding:0 14px;border-bottom:1px solid #dbe1ea}',
      '#' + ID + ' .vua-tab button{border:0;background:none;padding:12px 14px;font:inherit;font-weight:600;color:#5a6879;border-bottom:3px solid transparent;cursor:pointer;min-height:44px}',
      '#' + ID + ' .vua-tab button[aria-selected="true"]{color:#17365d;border-color:#17365d}',
      '#' + ID + ' .vua-isi{padding:18px;display:grid;grid-template-columns:minmax(0,1fr);gap:16px}',
      '#' + ID + ' .vua-dua{display:grid;grid-template-columns:minmax(0,340px) minmax(0,1fr);gap:16px;align-items:start}',
      '@media (max-width:820px){#' + ID + ' .vua-dua{grid-template-columns:minmax(0,1fr)}}',
      '#' + ID + ' .vua-dua>*,#' + ID + ' .vua-isi>*{min-width:0}',
      '#' + ID + ' .vua-panel{border:1px solid #dbe1ea;border-radius:12px;padding:14px 16px;background:#fff}',
      '#' + ID + ' h3{margin:0 0 6px;font-size:.98rem;font-weight:700}',
      '#' + ID + ' h2{font-weight:700}',
      // gaya dasar aplikasi memaksa huruf kapital pada isian; di sini teks isian dan petunjuk tampil apa adanya
      '#' + ID + ' input,#' + ID + ' textarea,#' + ID + ' select{text-transform:none}',
      '#' + ID + ' .vua-cat{font-size:.78rem;color:#5a6879}',
      '#' + ID + ' .vua-form{display:grid;gap:10px;margin-top:10px}',
      '#' + ID + ' .vua-form label{display:grid;gap:4px;font-size:.85rem;font-weight:600}',
      '#' + ID + ' .vua-cek{display:flex!important;gap:8px;align-items:flex-start;font-weight:500!important;grid-template-columns:none}',
      '#' + ID + ' .vua-cek input{width:18px;height:18px;margin-top:2px;flex:none}',
      '#' + ID + ' input[type=text],#' + ID + ' input[type=number],#' + ID + ' input[type=date],#' + ID + ' select,#' + ID + ' textarea{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;background:#fff;color:#0f172a;font:inherit;min-height:40px}',
      '#' + ID + ' details.vua-lay{border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px}',
      '#' + ID + ' details.vua-lay summary{cursor:pointer;font-weight:600;font-size:.85rem;min-height:30px}',
      '#' + ID + ' .vua-lay-isi{display:grid;gap:4px;margin-top:8px;max-height:200px;overflow:auto}',
      '#' + ID + ' button,#' + ID + ' input,#' + ID + ' select,#' + ID + ' textarea,#' + ID + ' summary{font:inherit}',
      '#' + ID + ' .vua-btn{border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:8px;padding:8px 14px;min-height:40px;font-weight:600;cursor:pointer}',
      '#' + ID + ' .vua-btn.utama{background:#17365d;color:#fff;border-color:#17365d}',
      '#' + ID + ' .vua-btn.bahaya{color:#b3261e;border-color:#f0aaa4}',
      '#' + ID + ' .vua-btn[disabled]{opacity:.45;cursor:not-allowed}',
      '#' + ID + ' .vua-btn.kecil{padding:4px 10px;min-height:34px;font-size:.8rem}',
      '#' + ID + ' button:focus-visible,#' + ID + ' input:focus-visible,#' + ID + ' select:focus-visible,#' + ID + ' textarea:focus-visible,#' + ID + ' summary:focus-visible{outline:3px solid #0f766e;outline-offset:2px}',
      '#' + ID + ' .vua-baris{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}',
      '#' + ID + ' .vua-pesan{border-radius:8px;padding:8px 12px;font-size:.85rem;margin-top:10px;overflow-wrap:anywhere}',
      '#' + ID + ' .vua-pesan.info{background:#eef3fb;color:#17365d}#' + ID + ' .vua-pesan.ok{background:#e1f4ea;color:#15803d}#' + ID + ' .vua-pesan.gagal{background:#fde7e5;color:#b3261e}#' + ID + ' .vua-pesan.peringatan{background:#fff0d4;color:#9a5b00}',
      '#' + ID + ' .vua-kartu3{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:10px}',
      '#' + ID + ' .vua-kartu{border:2px solid #17365d;border-radius:12px;padding:10px 14px;min-width:0}',
      '#' + ID + ' .vua-kartu b{display:block;font-size:1.7rem;line-height:1.15;font-variant-numeric:tabular-nums}',
      '#' + ID + ' .vua-dist{display:grid;gap:4px;margin-top:10px;max-height:320px;overflow:auto}',
      '#' + ID + ' .vua-dist>div{display:grid;grid-template-columns:minmax(0,170px) minmax(0,1fr) 40px;gap:8px;align-items:center;font-size:.8rem}',
      '#' + ID + ' .vua-dist span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#' + ID + ' .vua-bar{height:8px;border-radius:99px;background:#dbe1ea;overflow:hidden}#' + ID + ' .vua-bar i{display:block;height:100%;background:#17365d}',
      '#' + ID + ' .vua-gulir{overflow-x:auto;border:1px solid #dbe1ea;border-radius:10px;margin-top:10px}',
      '#' + ID + ' table{border-collapse:collapse;width:100%;font-size:.85rem;min-width:640px}',
      '#' + ID + ' th,#' + ID + ' td{padding:8px 10px;text-align:left;border-bottom:1px solid #dbe1ea;vertical-align:top;font-variant-numeric:tabular-nums}',
      '#' + ID + ' td.n,#' + ID + ' th.n{text-align:right}',
      '#' + ID + ' thead th{background:#f1f5f9;font-weight:600;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:#5a6879}',
      '#' + ID + ' tbody tr:last-child td{border-bottom:0}',
      '#' + ID + ' .vua-pil{display:inline-block;padding:1px 8px;border-radius:99px;font-size:.72rem;font-weight:700;border:1px solid #cbd5e1;white-space:nowrap}',
      '#' + ID + ' .vua-pil.ms{background:#e1f4ea;color:#15803d;border-color:#9bd3b4}#' + ID + ' .vua-pil.btl{background:#fff0d4;color:#9a5b00;border-color:#e8c27a}#' + ID + ' .vua-pil.tms{background:#fde7e5;color:#b3261e;border-color:#f0aaa4}',
      '#' + ID + ' .vua-kosong{text-align:center;padding:24px 12px;color:#5a6879;border:1px dashed #cbd5e1;border-radius:10px}'
    ].join('\n');
    dok.head.appendChild(s);
  }

  function ambilForm() {
    var f = st.form, o = dok.getElementById(ID); if (!o) return f;
    var v = function (id) { var e = o.querySelector('#' + id); return e ? e.value : null; };
    if (v('vua-nama') !== null) f.nama = v('vua-nama');
    if (v('vua-jumlah') !== null) f.jumlah = v('vua-jumlah');
    if (v('vua-batas') !== null) f.batasSelesai = v('vua-batas');
    if (v('vua-benih') !== null) f.benih = v('vua-benih');
    var stt = o.querySelectorAll('input[data-status]'); if (stt.length) f.status = Array.prototype.filter.call(stt, function (e) { return e.checked; }).map(function (e) { return e.getAttribute('data-status'); });
    var ly = o.querySelectorAll('input[data-layanan]'); if (ly.length) f.layanan = Array.prototype.filter.call(ly, function (e) { return e.checked; }).map(function (e) { return e.getAttribute('data-layanan'); });
    return f;
  }

  // ---- tab: buat paket
  function htmlBuat() {
    var f = st.form, k = susunKriteria(f), salah = validasiKriteria(k, true);
    var pratinjauSah = st.pratinjau && st.sidikPratinjau === sidik(k);
    var lay = (st.daftarLayanan || []).map(function (n) { return '<label class="vua-cek"><input type="checkbox" data-layanan="' + esc(n) + '"' + (f.layanan.indexOf(n) !== -1 ? ' checked' : '') + '> ' + esc(n) + '</label>'; }).join('');
    var h = '<div class="vua-dua"><div class="vua-panel"><h3>Buat paket tugas</h3><div class="vua-cat">Pembagian acak dan merata (selisih antar petugas maksimal 1). Pemverifikasi pertama sebuah data tidak pernah menjadi pemeriksanya.</div><div class="vua-form">' +
      '<label>Nama paket<input type="text" id="vua-nama" value="' + esc(f.nama) + '" maxlength="80" placeholder="mis. Tahap 1"></label>' +
      '<div><div class="vua-cat" style="font-weight:600">Status yang diverifikasi ulang</div>' + STATUS_SEMUA.map(function (s) { return '<label class="vua-cek"><input type="checkbox" data-status="' + esc(s) + '"' + (f.status.indexOf(s) !== -1 ? ' checked' : '') + '> ' + esc(s) + '</label>'; }).join('') + '</div>' +
      '<details class="vua-lay"' + (f.layanan.length ? ' open' : '') + '><summary>Layanan: ' + (f.layanan.length ? fmt(f.layanan.length) + ' dipilih' : 'semua') + '</summary><div class="vua-lay-isi">' + (lay || '<span class="vua-cat">Daftar layanan belum termuat (semua layanan dipakai).</span>') + '</div></details>' +
      '<label>Jumlah data Memenuhi Syarat dalam paket<input type="number" id="vua-jumlah" min="0" max="' + MAKS_JUMLAH + '" value="' + esc(f.jumlah) + '"><span class="vua-cat" style="font-weight:400">0 = semua. Data BTL/TMS selalu ikut seluruhnya. Data yang sudah pernah diverifikasi ulang tidak ikut lagi (1 data = 1 hitungan).</span></label>' +
      '<label>Batas selesai (opsional)<input type="date" id="vua-batas" value="' + esc(f.batasSelesai) + '"></label>' +
      '<label>Benih pengacakan<span class="vua-baris" style="flex-wrap:nowrap"><input type="text" id="vua-benih" value="' + esc(f.benih) + '" placeholder="kosong = dibuat otomatis"><button type="button" class="vua-btn kecil" data-aksi="acak">Acak baru</button></span></label>' +
      '</div><div class="vua-baris" style="margin-top:12px"><button type="button" class="vua-btn utama" data-aksi="pratinjau"' + (st.status === 'muat' ? ' disabled' : '') + '>' + (st.status === 'muat' ? 'Menghitung…' : 'Pratinjau pembagian') + '</button>' +
      '<button type="button" class="vua-btn" data-aksi="bagikan"' + (pratinjauSah && !salah && !st.bagi && st.pratinjau.jumlahTugas > 0 ? '' : ' disabled') + '>' + (st.bagi ? 'Membagikan…' : 'Bagikan') + '</button></div>' +
      '<div class="vua-cat" style="margin-top:8px">' + (st.pratinjau && !pratinjauSah ? 'Isian berubah sejak pratinjau. Lakukan pratinjau lagi sebelum membagikan.' : 'Pratinjau tidak menulis apa pun. Benih yang sama selalu menghasilkan pembagian yang sama.') + '</div>' +
      (st.pesan ? '<div class="vua-pesan ' + (st.status === 'gagal' ? 'gagal' : 'info') + '" role="alert">' + esc(st.pesan) + '</div>' : '') + '</div>';
    h += '<div class="vua-panel" id="vua-hasil"><h3>Pratinjau pembagian</h3>' + (st.pratinjau ? htmlPratinjau(st.pratinjau) : '<div class="vua-kosong">Tekan "Pratinjau pembagian" untuk melihat jumlah tugas per petugas.</div>') + '</div></div>';
    return h;
  }

  function htmlPratinjau(p) {
    var maks = 1; (p.perAkun || []).forEach(function (a) { if (a.jumlah > maks) maks = a.jumlah; });
    var tt = p.tidakTerbagi || { jumlah: 0, contoh: [] }, dk = p.dikeluarkan || {};
    return '<div class="vua-kartu3"><div class="vua-kartu"><div class="vua-cat">Total tugas</div><b>' + fmt(p.jumlahTugas) + '</b></div>' +
      '<div class="vua-kartu"><div class="vua-cat">Petugas data MS</div><b>' + fmt(p.jumlahPemeriksa) + '</b><div class="vua-cat">selisih maksimal ' + fmt(p.selisihMS) + '</div></div>' +
      '<div class="vua-kartu"><div class="vua-cat">Pemeriksa khusus BTL/TMS</div><b style="font-size:1rem;overflow-wrap:anywhere">' + esc(p.akunKhusus || 'tidak ada') + '</b></div></div>' +
      '<div class="vua-pesan info">Akun pimpinan tidak menerima tugas. Kolam sesuai kriteria: ' + fmt(p.kolamCocok) + ' data. Tidak ikut: sudah masuk batch pembayaran ' + fmt(dk.sudahDibayar) + ', sedang di paket lain ' + fmt(dk.sedangDitugaskan) + ', sudah pernah diverifikasi ulang ' + fmt(dk.sudahDiperiksaUlang) + ', hasil verifikasi petugas verifikator ' + fmt(dk.hasilVerifikator) + ' (verifikasi ulang hanya untuk data hasil Admin).</div>' +
      (tt.jumlah ? '<div class="vua-pesan peringatan">' + fmt(tt.jumlah) + ' data tidak dapat dibagikan: ' + esc((tt.contoh || []).slice(0, 3).map(function (c) { return c.alasan; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join('; ')) + '</div>' : '') +
      '<div class="vua-dist" role="list">' + (p.perAkun || []).map(function (a) { return '<div role="listitem"><span title="' + esc(a.username) + '">' + esc(a.username) + '</span><div class="vua-bar"><i style="width:' + persen(a.jumlah, maks) + '%"></i></div><b style="text-align:right">' + fmt(a.jumlah) + '</b></div>'; }).join('') + '</div>' +
      '<div class="vua-cat" style="margin-top:8px">Benih ' + esc(p.benih) + '</div>';
  }

  // ---- tab: paket berjalan
  function htmlPaket() {
    if (st.paketStatus === 'muat' && !st.paket) return '<div class="vua-kosong" role="status">Memuat…</div>';
    if (st.paketStatus === 'gagal' && !st.paket) return '<div class="vua-pesan gagal" role="alert">' + esc(st.paketPesan) + ' <button type="button" class="vua-btn kecil" data-aksi="muat-paket">Coba lagi</button></div>';
    var d = st.paket || [];
    if (!d.length) return '<div class="vua-kosong">Belum ada paket tugas. Buat satu di tab "Buat paket".</div>';
    var h = '<div class="vua-gulir"><table><thead><tr><th>Paket</th><th>Status</th><th class="n">Tugas</th><th class="n">Selesai</th><th class="n">Sesuai</th><th class="n">Dikoreksi</th><th class="n">Ditarik</th><th class="n">Sisa</th><th>Batas</th><th>Tindakan</th></tr></thead><tbody>';
    d.forEach(function (b) {
      var aktif = b.status === 'AKTIF', info = st.info[b.id];
      h += '<tr><td><b>' + esc(b.nama) + '</b><br><span class="vua-cat">' + esc(b.dibuatOleh) + ' · ' + esc(tanggalPendek(b.dibuatPada)) + '</span>' +
        '<details><summary class="vua-cat" style="cursor:pointer">per petugas (' + fmt((b.perAkun || []).length) + ')</summary><div class="vua-cat">' + (b.perAkun || []).map(function (a) { return esc(a.username) + ': ' + fmt(a.selesai) + '/' + fmt(a.tugas) + (a.ditarik ? ' (ditarik ' + fmt(a.ditarik) + ')' : ''); }).join('<br>') + '</div></details></td>' +
        '<td>' + esc(b.status) + '</td><td class="n">' + fmt(b.jumlahTugas) + '</td><td class="n">' + fmt(b.selesai) + ' <span class="vua-cat">(' + persen(b.selesai, b.jumlahTugas) + '%)</span></td><td class="n">' + fmt(b.sesuai) + '</td><td class="n">' + fmt(b.dikoreksi) + '</td><td class="n">' + fmt(b.ditarik) + '</td><td class="n">' + fmt(b.sisa) + '</td><td>' + esc(tanggalPendek(b.batasSelesai) || '–') + '</td><td>' +
        '<button type="button" class="vua-btn kecil" data-aksi="unduh-excel" data-id="' + b.id + '"' + (st.unduh[b.id] ? ' disabled' : '') + ' title="Berisi NIK dan nama penerima: hanya untuk Admin Utama">' + (st.unduh[b.id] ? 'Membuat file…' : 'Unduh Excel pembagian') + '</button> ' +
        (b.status !== 'DIBATALKAN' ? '<button type="button" class="vua-btn kecil" data-aksi="cek" data-id="' + b.id + '">Cek pembagian</button> ' : '') +
        (aktif ? (st.konfirmasiBatal === b.id ? '<div class="vua-pesan peringatan">Batalkan paket? ' + fmt(b.sisa + b.ditarik) + ' tugas yang belum dikerjakan dihapus; ' + fmt(b.selesai) + ' tugas selesai tetap tersimpan.<br><button type="button" class="vua-btn kecil bahaya" data-aksi="batal-ya" data-id="' + b.id + '">Ya, batalkan paket</button> <button type="button" class="vua-btn kecil" data-aksi="batal-tidak">Tidak</button></div>' : '<button type="button" class="vua-btn kecil bahaya" data-aksi="batal" data-id="' + b.id + '">Batalkan sisa</button>') : '') +
        (info ? '<div class="vua-pesan ' + (info.jenis || 'info') + '" role="status">' + esc(info.teks) + '</div>' : '') + '</td></tr>';
    });
    return h + '</tbody></table></div>';
  }

  // ---- tab: daftar koreksi
  function htmlKoreksi() {
    if (st.koreksiStatus === 'muat' && !st.koreksi) return '<div class="vua-kosong" role="status">Memuat…</div>';
    if (st.koreksiStatus === 'gagal' && !st.koreksi) return '<div class="vua-pesan gagal" role="alert">' + esc(st.koreksiPesan) + ' <button type="button" class="vua-btn kecil" data-aksi="muat-koreksi">Coba lagi</button></div>';
    var d = st.koreksi || { koreksi: [], adaBerikutnya: false };
    var h = '<div class="vua-cat">Koreksi berlaku langsung. Anda tidak wajib memeriksa satu per satu; batalkan bila petugas kelurahan melaporkan kesalahan. Membatalkan mengembalikan status data seperti sebelum dikoreksi.</div>';
    if (st.pesanKoreksi) h += '<div class="vua-pesan info" role="status">' + esc(st.pesanKoreksi) + '</div>';
    if (!d.koreksi.length) return h + '<div class="vua-kosong" style="margin-top:10px">Belum ada koreksi dari verifikasi ulang.</div>';
    h += '<div class="vua-gulir"><table><thead><tr><th>Penerima</th><th>Pemeriksa</th><th>Perubahan</th><th>Alasan</th><th>Waktu</th><th></th></tr></thead><tbody>';
    d.koreksi.forEach(function (k) {
      h += '<tr><td><b>' + esc(k.nama) + '</b><br><span class="vua-cat">' + esc(k.layanan) + ' · ' + esc(k.kelurahan) + '</span></td><td>' + esc(k.pemeriksa) + '</td>' +
        '<td><span class="vua-pil ' + kelasStatus(k.statusSebelum) + '">' + esc(singkatStatus(k.statusSebelum)) + '</span> → <span class="vua-pil ' + kelasStatus(k.statusSesudah) + '">' + esc(singkatStatus(k.statusSesudah)) + '</span>' +
        (k.statusSekarang && k.statusSekarang !== k.statusSesudah && !k.dibatalkan ? '<br><span class="vua-cat">sekarang: ' + esc(singkatStatus(k.statusSekarang)) + '</span>' : '') + '</td><td>' + esc(k.alasan) + '</td><td>' + esc(tanggalPendek(k.selesaiPada)) + '</td><td>' +
        (k.dibatalkan ? '<span class="vua-cat">dibatalkan</span>' : (k.statusSekarang && k.statusSekarang !== k.statusSesudah) ? '<span class="vua-cat" title="Pembatalan hanya bisa bila status masih sama dengan hasil koreksi">status sudah diubah lagi oleh Admin</span>' :
          (st.bukaBatalKoreksi === k.tugasId ? '<textarea id="vua-alasan-batal" placeholder="Alasan pembatalan (wajib)" style="min-height:60px">' + esc(st.alasanBatal) + '</textarea><div class="vua-baris" style="margin-top:6px"><button type="button" class="vua-btn kecil bahaya" data-aksi="batal-koreksi-ya" data-id="' + k.tugasId + '">Batalkan koreksi</button><button type="button" class="vua-btn kecil" data-aksi="batal-koreksi-tidak">Tutup</button></div>' :
            '<button type="button" class="vua-btn kecil bahaya" data-aksi="batal-koreksi" data-id="' + k.tugasId + '">Batalkan</button>')) + '</td></tr>';
    });
    h += '</tbody></table></div><div class="vua-baris" style="margin-top:10px"><button type="button" class="vua-btn kecil" data-aksi="hal-sebelum"' + (st.halaman <= 1 ? ' disabled' : '') + '>← Sebelumnya</button><span class="vua-cat">Halaman ' + fmt(st.halaman) + '</span><button type="button" class="vua-btn kecil" data-aksi="hal-berikut"' + (d.adaBerikutnya ? '' : ' disabled') + '>Berikutnya →</button></div>';
    return h;
  }

  function gambarBadge(o) {
    var el = o.querySelector('#vua-badge'), cat = o.querySelector('#vua-badge-cat'); if (!el || !cat) return;
    var s = st.sasaran, html = '', teks = '';
    if (!s) { teks = st.sasaranStatus === 'gagal' ? 'Ringkasan sasaran gagal dimuat: ' + (st.sasaranPesan || '') : 'Memuat ringkasan sasaran…'; }
    else {
      html = kartuSasaran(s).map(function (k) {
        return '<div class="vua-bk' + (k.kunci === 'sasaran' ? ' utama' : '') + '"><div class="vua-cat">' + esc(k.label) + '</div><b>' + fmt(k.nilai) + '</b>' + (k.catatan ? '<div class="vua-cat">' + esc(k.catatan) + '</div>' : '') + '</div>';
      }).join('');
      teks = catatanSasaran(s) + (st.sasaranStatus === 'gagal' ? ' Gagal memperbarui (' + (st.sasaranPesan || 'galat') + '): angka di atas mungkin belum terbaru.' : '');
    }
    // hanya tulis ulang bila berubah (wilayah aria-live tidak diumumkan ulang tiap gambar())
    if (el.__isi !== html) { el.innerHTML = html; el.__isi = html; }
    if (cat.textContent !== teks) cat.textContent = teks;
  }
  function muatSasaran() {
    // Nomor urut: jawaban yang lebih lama (tiba terlambat) tidak boleh menimpa yang lebih baru.
    var urut = st.sasaranUrut = (st.sasaranUrut || 0) + 1;
    return rpc('getRingkasanSasaranUlang', []).then(function (r) {
      if (urut !== st.sasaranUrut) return;
      if (!r || r.sukses !== true) throw new Error((r && r.pesan) || 'Gagal memuat ringkasan sasaran.');
      st.sasaran = r; st.sasaranStatus = 'ok';
    }).catch(function (e) { if (urut !== st.sasaranUrut) return; st.sasaranStatus = 'gagal'; st.sasaranPesan = e.message; }).then(function () { var o = dok.getElementById(ID); if (o) gambarBadge(o); });
  }

  function gambar() {
    var o = dok.getElementById(ID); if (!o) return;
    var aktifEl = dok.activeElement, idFokus = aktifEl && o.contains(aktifEl) ? aktifEl.id : '';
    var pos = aktifEl && aktifEl.selectionStart != null ? aktifEl.selectionStart : null;
    var tab = [['buat', 'Buat paket'], ['paket', 'Paket berjalan'], ['koreksi', 'Daftar koreksi']];
    gambarBadge(o);
    o.querySelector('#vua-tab').innerHTML = tab.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (st.tab === t[0]) + '">' + t[1] + '</button>'; }).join('');
    o.querySelector('#vua-isi').innerHTML = st.tab === 'buat' ? htmlBuat() : (st.tab === 'paket' ? htmlPaket() : htmlKoreksi());
    if (idFokus) { var e = o.querySelector('#' + idFokus); if (e && e.focus) { try { e.focus(); if (pos != null && e.setSelectionRange) e.setSelectionRange(pos, pos); } catch (_e) { /* abaikan */ } } }
  }

  // ------------------------------------------------------------------ aliran data
  function muatLayanan() {
    if (st.daftarLayanan) return;
    rpc('getMasterLayanan', []).then(function (r) {
      var a = []; if (r) a = (r.kecamatan || []).concat(r.kemenag || []);
      st.daftarLayanan = a.map(String).filter(Boolean); if (st.tab === 'buat') gambar();
    }).catch(function () { st.daftarLayanan = []; });
  }
  function muatPaket() {
    st.paketStatus = 'muat'; if (st.tab === 'paket') gambar();
    return rpc('daftarBatchUlang', []).then(function (r) {
      if (!r || r.sukses !== true) throw new Error((r && r.pesan) || 'Gagal memuat paket.');
      st.paket = r.batch; st.paketStatus = 'ok';
    }).catch(function (e) { st.paketStatus = 'gagal'; st.paketPesan = e.message; }).then(function () { if (st.tab === 'paket') gambar(); });
  }
  function muatKoreksi() {
    st.koreksiStatus = 'muat'; if (st.tab === 'koreksi') gambar();
    return rpc('getDaftarKoreksiUlang', [st.halaman]).then(function (r) {
      if (!r || r.sukses !== true) throw new Error((r && r.pesan) || 'Gagal memuat koreksi.');
      st.koreksi = r; st.koreksiStatus = 'ok';
    }).catch(function (e) { st.koreksiStatus = 'gagal'; st.koreksiPesan = e.message; }).then(function () { if (st.tab === 'koreksi') gambar(); });
  }
  function pindahTab(t) {
    st.tab = t; gambar();
    if (t === 'paket') muatPaket(); else if (t === 'koreksi') muatKoreksi(); else muatLayanan();
  }

  function pratinjau() {
    var k = susunKriteria(ambilForm()), salah = validasiKriteria(k, false);
    if (salah) { st.status = 'gagal'; st.pesan = salah; gambar(); return; }
    st.status = 'muat'; st.pesan = ''; gambar();
    rpc('pratinjauBatchUlang', [k]).then(function (r) {
      if (!r || r.sukses !== true) throw new Error((r && r.pesan) || 'Gagal menghitung pratinjau.');
      st.form.benih = r.benih; k.benih = r.benih;   // benih dari server dipakai pada pembagian sungguhan
      st.pratinjau = r; st.sidikPratinjau = sidik(k); st.status = 'ok';
    }).catch(function (e) { st.status = 'gagal'; st.pesan = e.message; }).then(gambar);
  }
  function bagikan() {
    var k = susunKriteria(ambilForm()), salah = validasiKriteria(k, true);
    if (salah) { st.status = 'gagal'; st.pesan = salah; gambar(); return; }
    if (!st.pratinjau || st.sidikPratinjau !== sidik(k)) { st.status = 'gagal'; st.pesan = 'Isian berubah sejak pratinjau. Lakukan pratinjau lagi.'; gambar(); return; }
    st.bagi = true; st.pesan = ''; gambar();
    rpc('buatBatchUlang', [k]).then(function (r) {
      if (!r || r.sukses !== true) throw new Error((r && r.pesan) || 'Gagal membuat paket.');
      toast(r.pesan || 'Paket tugas dibuat.', 'sukses');
      st.pratinjau = null; st.sidikPratinjau = ''; st.form.nama = ''; st.form.benih = ''; st.bagi = false;
      muatSasaran();
      pindahTab('paket');
    }).catch(function (e) { st.bagi = false; st.status = 'gagal'; st.pesan = e.message; gambar(); });
  }
  function cek(id) {
    st.info[id] = { teks: 'Memeriksa…', jenis: 'info' }; gambar();
    rpc('cekPembagianBatchUlang', [id]).then(function (r) {
      st.info[id] = (r && r.sukses === true)
        ? { teks: r.sama ? 'Pembagian dihitung ulang dari benih dan sama persis dengan tugas tersimpan (' + fmt(r.jumlahTugas) + ' tugas).' : 'Ada ' + fmt(r.selisih) + ' penugasan yang berbeda dari hasil hitung ulang.', jenis: r.sama ? 'ok' : 'gagal' }
        : { teks: (r && r.pesan) || 'Gagal memeriksa.', jenis: 'gagal' };
    }).catch(function (e) { st.info[id] = { teks: e.message, jenis: 'gagal' }; }).then(gambar);
  }
  function unduhBerkas(base64, namaFile) {
    if (typeof unduhFileBase64 === 'function') { unduhFileBase64(base64, namaFile); return; }
    var bin = atob(base64), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    var url = akar.URL.createObjectURL(new Blob([u8], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    var a = dok.createElement('a'); a.href = url; a.download = namaFile; dok.body.appendChild(a); a.click(); dok.body.removeChild(a);
    setTimeout(function () { akar.URL.revokeObjectURL(url); }, 4000);
  }
  function unduhExcel(id) {
    if (st.unduh[id]) return;
    st.unduh[id] = true; delete st.info[id]; gambar();
    rpc('unduhRekapPembagianUlang', [id]).then(function (r) {
      st.unduh[id] = false;
      if (!r || r.sukses !== true) { st.info[id] = { teks: (r && r.pesan) || 'Gagal membuat file.', jenis: 'gagal' }; gambar(); return; }
      unduhBerkas(r.base64, r.namaFile);
      st.info[id] = { teks: 'File diunduh: ' + r.namaFile + ' (' + fmt(r.jumlahTugas) + ' tugas). Berisi NIK dan nama penerima, jangan disebarkan.', jenis: 'ok' };
      gambar();
    }).catch(function (e) { st.unduh[id] = false; st.info[id] = { teks: e.message, jenis: 'gagal' }; gambar(); });
  }
  function batalPaket(id) {
    rpc('batalkanBatchUlang', [id]).then(function (r) {
      st.konfirmasiBatal = 0;
      if (!r || r.sukses !== true) { st.info[id] = { teks: (r && r.pesan) || 'Gagal membatalkan.', jenis: 'gagal' }; gambar(); return; }
      toast(r.pesan || 'Paket dibatalkan.', 'sukses'); muatSasaran(); return muatPaket();
    }).catch(function (e) { st.konfirmasiBatal = 0; st.info[id] = { teks: e.message, jenis: 'gagal' }; gambar(); });
  }
  function batalKoreksi(id) {
    var alasan = String(st.alasanBatal || '').trim();
    if (!alasan) { st.pesanKoreksi = 'Alasan pembatalan wajib diisi.'; gambar(); return; }
    rpc('batalkanKoreksiUlang', [id, alasan]).then(function (r) {
      if (!r || r.sukses !== true) { st.pesanKoreksi = (r && r.pesan) || 'Gagal membatalkan koreksi.'; gambar(); return; }
      st.pesanKoreksi = r.pesan || 'Koreksi dibatalkan.'; st.bukaBatalKoreksi = 0; st.alasanBatal = ''; toast(st.pesanKoreksi, 'sukses'); return muatKoreksi();
    }).catch(function (e) { st.pesanKoreksi = e.message; gambar(); });
  }

  // ------------------------------------------------------------------ jendela
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
    st.pembuka = pembuka || dok.activeElement; st.tab = 'buat'; st.pratinjau = null; st.sidikPratinjau = ''; st.status = 'idle'; st.pesan = ''; st.paket = null; st.koreksi = null; st.info = {}; st.konfirmasiBatal = 0; st.bukaBatalKoreksi = 0; st.pesanKoreksi = '';
    var o = dok.createElement('div'); o.id = ID; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-labelledby', 'vua-judul');
    o.innerHTML = '<div class="vua-kotak"><div class="vua-kepala"><div><h2 id="vua-judul">Verifikasi Ulang</h2><div class="vua-sub">Paket tugas verifikasi ulang data yang sudah terverifikasi</div></div><button type="button" class="vua-tutup" id="vua-tutup" aria-label="Tutup">✕</button></div><div class="vua-badge" id="vua-badge" role="status" aria-live="polite"></div><div class="vua-badge-cat" id="vua-badge-cat"></div><div class="vua-tab" id="vua-tab" role="tablist"></div><div class="vua-isi" id="vua-isi"></div></div>';
    dok.body.appendChild(o);
    o.addEventListener('mousedown', function (e) { if (e.target === o) tutup(); });
    o.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-aksi], [data-tab], #vua-tutup') : null; if (!t) return;
      if (t.id === 'vua-tutup') { tutup(); return; }
      if (t.getAttribute('data-tab')) { ambilForm(); pindahTab(t.getAttribute('data-tab')); return; }
      var a = t.getAttribute('data-aksi'), id = Number(t.getAttribute('data-id')) || 0;
      if (a === 'pratinjau') pratinjau();
      else if (a === 'bagikan') bagikan();
      else if (a === 'acak') { ambilForm(); st.form.benih = ''; gambar(); }
      else if (a === 'cek') cek(id);
      else if (a === 'unduh-excel') unduhExcel(id);
      else if (a === 'batal') { st.konfirmasiBatal = id; gambar(); }
      else if (a === 'batal-tidak') { st.konfirmasiBatal = 0; gambar(); }
      else if (a === 'batal-ya') batalPaket(id);
      else if (a === 'muat-paket') muatPaket();
      else if (a === 'muat-koreksi') muatKoreksi();
      else if (a === 'batal-koreksi') { st.bukaBatalKoreksi = id; st.alasanBatal = ''; st.pesanKoreksi = ''; gambar(); }
      else if (a === 'batal-koreksi-tidak') { st.bukaBatalKoreksi = 0; gambar(); }
      else if (a === 'batal-koreksi-ya') batalKoreksi(id);
      else if (a === 'hal-sebelum') { st.halaman = Math.max(1, st.halaman - 1); muatKoreksi(); }
      else if (a === 'hal-berikut') { st.halaman++; muatKoreksi(); }
    });
    o.addEventListener('input', function (e) {
      if (e.target.id === 'vua-alasan-batal') { st.alasanBatal = e.target.value; return; }
      if (st.tab === 'buat') { ambilForm(); var k = susunKriteria(st.form), b = o.querySelector('[data-aksi="bagikan"]'); if (b) b.disabled = !(st.pratinjau && st.sidikPratinjau === sidik(k) && !validasiKriteria(k, true) && !st.bagi && st.pratinjau.jumlahTugas > 0); }
    });
    o.addEventListener('change', function (e) { if (st.tab === 'buat' && e.target && e.target.type === 'checkbox') { ambilForm(); gambar(); } });
    dok.addEventListener('keydown', saatTombol, true);
    st.sasaran = null; st.sasaranStatus = 'muat';
    gambar(); muatLayanan(); muatSasaran();
    var b = dok.getElementById('vua-tutup'); if (b) b.focus();
  }
  api.buka = bukaPanel;
  akar.bukaVerifikasiUlangAdmin = bukaPanel;

  // ------------------------------------------------------------------ pintu masuk Admin Utama + penyelarasan
  function selaras() {
    var tombol = dok.getElementById(ID_TOMBOL);
    if (!berhak()) { if (tombol && tombol.parentNode) tombol.parentNode.removeChild(tombol); if (dok.getElementById(ID)) tutup(); return; }
    if (tombol) { tombol.hidden = false; return; }
    var acuan = dok.getElementById('btn-agregat-verifikasi') || dok.getElementById('btn-progres-kuota') || dok.getElementById('btn-dashboard-progres');
    if (!acuan || !acuan.parentNode) return;
    var b = dok.createElement('button'); b.id = ID_TOMBOL; b.type = 'button';
    var cls = (dok.getElementById('btn-progres-kuota') || acuan).className;
    b.className = cls.replace(/\bhidden\b/g, '').replace(/\s+/g, ' ').trim();
    b.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" style="color:#7c3aed" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h5M20 20v-5h-5M5.6 15A8 8 0 0018 17.7M18.4 9A8 8 0 006 6.3"/></svg><span>Verifikasi Ulang</span>';
    b.addEventListener('click', function () { bukaPanel(b); });
    acuan.parentNode.insertBefore(b, acuan.nextSibling);
  }
  setInterval(function () { try { selaras(); } catch (_e) { /* abaikan */ } }, 2000);
  selaras();
  return api;
});
