/**
 * public/js/app-agregat-verifikasi.js
 * Panel "Hasil Kerja Verifikator": agregat jumlah data yang diberi hasil verifikasi, dipisah JAM KERJA dan LUAR JAM KERJA (lembur).
 * Rencana: plans/plan-agregat-verifikator.md. Dimuat malas hanya untuk UTAMA dan VERIFIKATOR (SKRIP_PER_PERAN di app-pesan-periode.js).
 *
 * Cakupan ditentukan SERVER (verifikator = dirinya; koordinator = timnya; Admin Utama = semua tim); modul ini hanya menampilkan
 * apa yang dikirim server dan tidak pernah menentukan hak. Tanpa data pribadi penerima. Semua teks dari server dipasang lewat esc().
 *
 * Pintu masuk: tautan "Lihat hasil kerja" di badge verifikator (app-verifikator.js) dan tombol "Agregat Verifikasi" di toolbar Admin Utama.
 */
(function (akar, pabrik) {
  var api = pabrik(akar);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else akar.djpmAgregatVerifikasi = api;
})(typeof self !== 'undefined' ? self : this, function (akar) {
  'use strict';

  // ------------------------------------------------------------------ bagian murni (diuji di Node)
  var OFFSET_WIB_MS = 7 * 3600 * 1000;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function tanggalWib(d) { var t = new Date(d.getTime() + OFFSET_WIB_MS); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }
  function geser(tgl, n) { var d = new Date(tgl + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return (Number(n) || 0).toLocaleString('id-ID'); }
  function persen(a, b) { return b ? Math.round((a * 100) / b) + '%' : '0%'; }

  /** Rentang siap kirim ke server (tanggal WIB, inklusif) untuk pilihan cepat. */
  function rentangPreset(kode, sekarang) {
    var hari = tanggalWib(sekarang || new Date());
    if (kode === 'hari') return { dari: hari, sampai: hari };
    if (kode === '7') return { dari: geser(hari, -6), sampai: hari };
    if (kode === 'lalu') {
      var awalIni = hari.slice(0, 8) + '01';
      var akhirLalu = geser(awalIni, -1);
      return { dari: akhirLalu.slice(0, 8) + '01', sampai: akhirLalu };
    }
    return { dari: hari.slice(0, 8) + '01', sampai: hari };   // 'bulan' (bawaan)
  }

  function judulPanel(cakupan, tim) {
    if (cakupan === 'SAYA') return 'Hasil Kerja Saya';
    if (cakupan === 'TIM') return 'Hasil Tim ' + (tim || '');
    return tim && tim !== '-' ? 'Agregat Tim ' + tim : (tim === '-' ? 'Agregat Tanpa Tim' : 'Agregat Semua Tim');
  }

  var api = { rentangPreset: rentangPreset, judulPanel: judulPanel, tanggalWib: tanggalWib, geser: geser, esc: esc, fmt: fmt, persen: persen, bukaPanel: function () { /* diganti di browser */ } };
  if (!akar || !akar.document) return api;   // lingkungan uji Node: hanya bagian murni

  // ------------------------------------------------------------------ tampilan
  var dok = akar.document;
  var ID = 'djpm-agr-overlay', ID_STYLE = 'djpm-agr-style', ID_TOMBOL = 'btn-agregat-verifikasi';
  var TEKS_ATURAN = 'Jam kerja (WIB): Senin–Kamis 08.00–16.30 · Jumat 08.00–17.00. Sabtu, Minggu, dan tanggal merah dihitung luar jam kerja.';
  var BATAS_TUNGGU_MS = 40000;
  var st = { preset: 'bulan', dari: '', sampai: '', tim: '', data: null, status: 'idle', pesan: '', idPermintaan: 0, pembuka: null, unduh: false };

  function pengguna() { return (typeof dataPengguna !== 'undefined') ? dataPengguna : null; }
  function peran() { var p = pengguna(); return p && p.token ? String(p.role || '').trim().toUpperCase() : ''; }
  function berhak() { var r = peran(); return r === 'UTAMA' || r === 'VERIFIKATOR'; }
  function toast(pesan, jenis) { try { if (typeof tampilkanToast === 'function') tampilkanToast(pesan, jenis || 'gagal', { durasi: 6000 }); } catch (_e) { /* abaikan */ } }

  function suntikStyle() {
    if (dok.getElementById(ID_STYLE)) return;
    var s = dok.createElement('style'); s.id = ID_STYLE;
    s.textContent = [
      '#' + ID + '{position:fixed;inset:0;z-index:9500;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:max(12px,env(safe-area-inset-top,0px)) max(12px,env(safe-area-inset-right,0px)) max(12px,env(safe-area-inset-bottom,0px)) max(12px,env(safe-area-inset-left,0px));font-family:inherit}',
      '#' + ID + ' *{box-sizing:border-box}',
      '#' + ID + ' .agr-kotak{background:#fff;color:#0f172a;border-radius:16px;width:100%;max-width:1040px;margin:8px auto;box-shadow:0 20px 50px rgba(0,0,0,.3);overflow:hidden}',
      '#' + ID + ' .agr-kepala{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;justify-content:space-between;padding:16px 18px;background:#f1f5f9;border-bottom:1px solid #dbe1ea}',
      '#' + ID + ' .agr-kepala h2{margin:0;font-size:1.15rem;font-weight:700}',
      '#' + ID + ' .agr-sub{font-size:.78rem;color:#5a6879;margin-top:2px}',
      '#' + ID + ' .agr-tutup{border:1px solid #cbd5e1;background:#fff;border-radius:8px;min-height:40px;min-width:40px;cursor:pointer;font-size:1.1rem}',
      '#' + ID + ' .agr-isi{padding:18px;display:grid;grid-template-columns:minmax(0,1fr);gap:18px}',
      '#' + ID + ' .agr-isi>*,#' + ID + ' .agr-kartu,#' + ID + ' .agr-aturan,#' + ID + ' .agr-periode,#' + ID + ' .agr-rentang{min-width:0}',
      '#' + ID + ' .agr-aturan{overflow-wrap:anywhere}',
      '#' + ID + ' .agr-periode{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
      '#' + ID + ' .agr-chip{border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:8px;padding:8px 14px;min-height:40px;cursor:pointer;font:inherit;font-size:.85rem}',
      '#' + ID + ' .agr-chip[aria-pressed="true"]{background:#17365d;color:#fff;border-color:#17365d;font-weight:600}',
      '#' + ID + ' .agr-rentang{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:.85rem}',
      '#' + ID + ' .agr-rentang input{border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;min-height:40px;font:inherit}',
      '#' + ID + ' button:focus-visible,#' + ID + ' input:focus-visible{outline:3px solid #0f766e;outline-offset:2px}',
      '#' + ID + ' .agr-aturan{background:#f1f5f9;border-radius:10px;padding:10px 12px;font-size:.8rem;color:#475569}',
      '#' + ID + ' .agr-aturan b{color:#0f172a}',
      '#' + ID + ' .agr-kartu-baris{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}',
      '#' + ID + ' .agr-kartu{border:2px solid #17365d;border-radius:12px;padding:14px 16px;background:#fff;min-width:0;text-align:left;font:inherit;color:inherit;box-shadow:0 1px 3px rgba(15,23,42,.12)}',
      '#' + ID + ' .agr-lbl{font-size:.74rem;text-transform:uppercase;letter-spacing:.06em;color:#5a6879;display:flex;align-items:center;gap:8px}',
      '#' + ID + ' .agr-angka{font-weight:700;font-size:2rem;line-height:1.15;font-variant-numeric:tabular-nums;margin-top:4px}',
      '#' + ID + ' .agr-ket{font-size:.78rem;color:#5a6879;margin-top:2px}',
      '#' + ID + ' .agr-kartu.kerja{border-color:#0f766e;background:#f0fbf9}#' + ID + ' .agr-kartu.kerja .agr-angka{color:#0f766e}',
      '#' + ID + ' .agr-kartu.luar{border-color:#b45309;background:#fff8ee}#' + ID + ' .agr-kartu.luar .agr-angka{color:#b45309}',
      '#' + ID + ' .agr-sw{display:inline-block;width:14px;height:14px;border-radius:3px;flex:none}',
      '#' + ID + ' .agr-sw.kerja,#' + ID + ' .agr-b-kerja{background:#0f766e}',
      '#' + ID + ' .agr-sw.luar,#' + ID + ' .agr-b-luar{background:repeating-linear-gradient(135deg,#b45309 0 3px,#fdebd3 3px 6px);border:1px solid #b45309}',
      '#' + ID + ' .agr-pil-baris{display:flex;flex-wrap:wrap;gap:8px}',
      '#' + ID + ' .agr-pil{display:inline-flex;gap:6px;align-items:baseline;border:1px solid #dbe1ea;border-radius:999px;padding:4px 12px;font-size:.85rem}',
      '#' + ID + ' .agr-pil.ms b{color:#15803d}#' + ID + ' .agr-pil.btl b{color:#b45309}#' + ID + ' .agr-pil.tms b{color:#b91c1c}',
      '#' + ID + ' h3{margin:0 0 8px;font-size:.95rem}',
      '#' + ID + ' .agr-legenda{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:.8rem;color:#5a6879;margin-bottom:8px}',
      '#' + ID + ' .agr-legenda span{display:inline-flex;align-items:center;gap:6px}',
      '#' + ID + ' .agr-bagan{display:flex;align-items:flex-end;gap:6px;height:190px;padding:8px 4px 0;border-bottom:1px solid #dbe1ea;overflow-x:auto}',
      '#' + ID + ' .agr-hari{flex:1 0 30px;min-width:30px;display:flex;flex-direction:column;justify-content:flex-end;height:100%;gap:2px}',
      '#' + ID + ' .agr-nilai{text-align:center;font-size:.7rem;color:#5a6879;font-variant-numeric:tabular-nums}',
      '#' + ID + ' .agr-batang{display:flex;flex-direction:column;justify-content:flex-end}',
      '#' + ID + ' .agr-b-luar{border-bottom:0}',
      '#' + ID + ' .agr-sumbu{display:flex;gap:6px;padding:6px 4px 0;overflow-x:auto}',
      '#' + ID + ' .agr-sumbu div{flex:1 0 30px;min-width:30px;text-align:center;font-size:.68rem;color:#5a6879}',
      '#' + ID + ' .agr-sumbu .libur{color:#b91c1c;font-weight:600}',
      '#' + ID + ' .agr-gulir{overflow-x:auto;border:1px solid #dbe1ea;border-radius:10px}',
      '#' + ID + ' table{border-collapse:collapse;width:100%;font-size:.85rem;min-width:620px}',
      '#' + ID + ' th,#' + ID + ' td{padding:9px 12px;text-align:right;border-bottom:1px solid #dbe1ea;white-space:nowrap;font-variant-numeric:tabular-nums}',
      '#' + ID + ' th:first-child,#' + ID + ' td:first-child{text-align:left}',
      '#' + ID + ' thead th{background:#f1f5f9;font-weight:600;font-size:.74rem;text-transform:uppercase;letter-spacing:.04em;color:#5a6879}',
      '#' + ID + ' tbody tr:last-child td{border-bottom:0}',
      '#' + ID + ' tr.agr-saya td{background:#d7f0ec;font-weight:600}',
      '#' + ID + ' tr.agr-luartim td{color:#64748b;font-style:italic}',
      '#' + ID + ' .agr-tag{font-size:.66rem;border:1px solid #cbd5e1;border-radius:4px;padding:1px 6px;margin-left:6px;color:#64748b;font-style:normal}',
      '#' + ID + ' .agr-tim-baris{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}',
      '#' + ID + ' .agr-tim-baris .agr-kartu{cursor:pointer}',
      '#' + ID + ' .agr-tim-baris .agr-kartu[aria-pressed="true"]{outline:3px solid #17365d;outline-offset:2px}',
      // penanda TEKS pada kartu terpilih (tidak hanya mengandalkan warna/garis)
      '#' + ID + ' .agr-tim-baris .agr-kartu[aria-pressed="true"] .agr-lbl span:first-child::after{content:" ✓ dipilih";font-weight:700;color:#17365d}',
      // tiap tim punya warna garis sendiri (bukan warna jam kerja/luar jam kerja), supaya kartu mudah dibedakan
      '#' + ID + ' .agr-tim-baris .agr-kartu[data-tim="I"]{border-color:#2563eb;background:#f3f7ff}#' + ID + ' .agr-tim-baris .agr-kartu[data-tim="I"] .agr-lbl{color:#1d4ed8}',
      '#' + ID + ' .agr-tim-baris .agr-kartu[data-tim="II"]{border-color:#7c3aed;background:#f7f3ff}#' + ID + ' .agr-tim-baris .agr-kartu[data-tim="II"] .agr-lbl{color:#6d28d9}',
      '#' + ID + ' .agr-tim-baris .agr-kartu[data-tim="III"]{border-color:#be185d;background:#fff3f8}#' + ID + ' .agr-tim-baris .agr-kartu[data-tim="III"] .agr-lbl{color:#9d174d}',
      '#' + ID + ' .agr-tim-baris .agr-kartu[data-tim="IV"]{border-color:#475569;background:#f4f6f9}#' + ID + ' .agr-tim-baris .agr-kartu[data-tim="IV"] .agr-lbl{color:#334155}',
      '#' + ID + ' .agr-tim-baris .agr-kartu[data-tim="-"]{border-color:#94a3b8;border-style:dashed}',
      '#' + ID + ' .agr-pesan{text-align:center;padding:28px 12px;color:#5a6879;border:1px dashed #cbd5e1;border-radius:10px}',
      '#' + ID + ' .agr-pesan.galat{color:#b91c1c;border-color:#fca5a5}',
      '#' + ID + ' .agr-unduh{border:1px solid #17365d;color:#17365d;background:transparent;border-radius:8px;padding:8px 14px;min-height:40px;font:inherit;font-weight:600;cursor:pointer}',
      '#' + ID + ' .agr-unduh[disabled]{opacity:.5;cursor:wait}',
      '#' + ID + ' .agr-kaki{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;font-size:.8rem;color:#5a6879}',
      '@media (max-width:520px){#' + ID + ' .agr-angka{font-size:1.6rem}#' + ID + ' .agr-isi,#' + ID + ' .agr-kepala{padding:14px}}',
    ].join('\n');
    dok.head.appendChild(s);
  }

  function kartu(total, kerja, luar) {
    return '<div class="agr-kartu-baris">' +
      '<div class="agr-kartu"><div class="agr-lbl">Data diverifikasi</div><div class="agr-angka">' + fmt(total) + '</div><div class="agr-ket">tiap data dihitung 1 kali</div></div>' +
      '<div class="agr-kartu kerja"><div class="agr-lbl"><span class="agr-sw kerja"></span>Jam kerja</div><div class="agr-angka">' + fmt(kerja) + '</div><div class="agr-ket">' + persen(kerja, total) + ' dari total</div></div>' +
      '<div class="agr-kartu luar"><div class="agr-lbl"><span class="agr-sw luar"></span>Luar jam kerja (lembur)</div><div class="agr-angka">' + fmt(luar) + '</div><div class="agr-ket">' + persen(luar, total) + ' dari total</div></div></div>';
  }
  function pil(r) {
    return '<div class="agr-pil-baris"><span class="agr-pil ms">Memenuhi Syarat <b>' + fmt(r.memenuhiSyarat) + '</b></span><span class="agr-pil btl">Berkas Tidak Lengkap <b>' + fmt(r.berkasTidakLengkap) + '</b></span><span class="agr-pil tms">Tidak Memenuhi Syarat <b>' + fmt(r.tidakMemenuhiSyarat) + '</b></span></div>';
  }
  function bagan(perHari) {
    var maks = 1; perHari.forEach(function (h) { if (h.total > maks) maks = h.total; });
    var skala = 150 / maks, b = '', s = '';
    perHari.forEach(function (h) {
      b += '<div class="agr-hari" title="' + esc(h.hari + ' ' + h.tanggal) + ': ' + h.jamKerja + ' jam kerja, ' + h.luarJamKerja + ' luar jam kerja"><div class="agr-nilai">' + (h.total || '') + '</div><div class="agr-batang">' +
        '<div class="agr-b-luar" style="height:' + (h.luarJamKerja ? Math.max(h.luarJamKerja * skala, 3) : 0) + 'px"></div><div class="agr-b-kerja" style="height:' + (h.jamKerja * skala) + 'px"></div></div></div>';
      s += '<div class="' + (h.libur ? 'libur' : '') + '">' + esc(String(h.hari || '').slice(0, 3)) + '<br>' + esc(String(h.tanggal).slice(8)) + '</div>';
    });
    return '<div><h3>Per hari</h3><div class="agr-legenda"><span><span class="agr-sw kerja"></span>Jam kerja</span><span><span class="agr-sw luar"></span>Luar jam kerja</span><span style="color:#b91c1c">Merah = Sabtu, Minggu, atau tanggal merah</span></div>' +
      '<div class="agr-bagan" role="img" aria-label="Bagan batang harian jumlah data diverifikasi: jam kerja dan luar jam kerja">' + b + '</div><div class="agr-sumbu">' + s + '</div></div>';
  }
  function tabelHari(perHari) {
    var rows = perHari.slice().reverse().map(function (h) {
      return '<tr><td>' + esc(h.hari) + ', ' + esc(h.tanggal) + (h.libur ? '<span class="agr-tag">libur</span>' : '') + '</td><td>' + fmt(h.total) + '</td><td>' + fmt(h.jamKerja) + '</td><td>' + fmt(h.luarJamKerja) + '</td></tr>';
    }).join('');
    return '<div><h3>Rincian harian</h3><div class="agr-gulir"><table style="min-width:420px"><thead><tr><th>Tanggal</th><th>Data</th><th>Jam kerja</th><th>Luar jam kerja</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }
  function tabelOrang(daftar, saya, luarTim) {
    var rows = daftar.map(function (o) {
      var ini = String(o.username).toUpperCase() === saya;
      return '<tr class="' + (ini ? 'agr-saya' : '') + '"><td>' + esc(o.namaLengkap || o.username) + '<span class="agr-tag">' + esc(o.username) + '</span>' + (o.koordinator ? '<span class="agr-tag">koordinator</span>' : '') + (ini ? '<span class="agr-tag">saya</span>' : '') + (o.aktif ? '' : '<span class="agr-tag">nonaktif</span>') +
        '</td><td>' + (o.tim ? 'Tim ' + esc(o.tim) : '–') + '</td><td>' + fmt(o.total) + '</td><td>' + fmt(o.jamKerja) + '</td><td>' + fmt(o.luarJamKerja) + '</td><td>' + fmt(o.memenuhiSyarat) + '</td><td>' + fmt(o.berkasTidakLengkap) + '</td><td>' + fmt(o.tidakMemenuhiSyarat) + '</td></tr>';
    }).join('');
    if (luarTim) rows += '<tr class="agr-luartim"><td>Admin Utama (informasi, tidak dihitung ke tim)</td><td>–</td><td>' + fmt(luarTim.total) + '</td><td>' + fmt(luarTim.jamKerja) + '</td><td>' + fmt(luarTim.luarJamKerja) + '</td><td>–</td><td>–</td><td>–</td></tr>';
    return '<div class="agr-gulir"><table><thead><tr><th>Verifikator</th><th>Tim</th><th>Data</th><th>Jam kerja</th><th>Luar jam kerja</th><th>MS</th><th>BTL</th><th>TMS</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  function kartuTim(perTim, timAktif) {
    return '<div><h3>Per tim <span style="font-weight:400;color:#5a6879;font-size:.78rem">· ketuk kartu untuk menyaring, ketuk lagi untuk semua tim</span></h3><div class="agr-tim-baris">' +
      perTim.map(function (t) {
        return '<button type="button" class="agr-kartu" data-tim="' + esc(t.tim) + '" aria-pressed="' + (timAktif === t.tim) + '"><div class="agr-lbl" style="justify-content:space-between"><span>' + (t.tim === '-' ? 'Tanpa tim' : 'Tim ' + esc(t.tim)) + '</span><span>' + fmt(t.anggota) + ' orang</span></div>' +
          '<div class="agr-angka" style="font-size:1.7rem">' + fmt(t.total) + '</div><div class="agr-ket"><span class="agr-sw kerja"></span> ' + fmt(t.jamKerja) + ' &nbsp; <span class="agr-sw luar"></span> ' + fmt(t.luarJamKerja) + '</div></button>';
      }).join('') + '</div></div>';
  }

  function periodeHtml() {
    var p = [['hari', 'Hari ini'], ['7', '7 hari'], ['bulan', 'Bulan ini'], ['lalu', 'Bulan lalu'], ['rentang', 'Rentang…']];
    return '<div class="agr-periode" role="group" aria-label="Periode">' + p.map(function (x) { return '<button type="button" class="agr-chip" data-p="' + x[0] + '" aria-pressed="' + (st.preset === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      (st.preset === 'rentang' ? '<div class="agr-rentang"><label>Dari <input type="date" id="agr-dari" value="' + esc(st.dari) + '"></label><label>Sampai <input type="date" id="agr-sampai" value="' + esc(st.sampai) + '"></label><button type="button" class="agr-chip" id="agr-terapkan">Terapkan</button></div>' : '');
  }

  function gambar() {
    var o = dok.getElementById(ID); if (!o) return;
    var d = st.data, h = '';
    var judul = d ? judulPanel(d.cakupan, d.tim) : 'Hasil Kerja Verifikator';
    o.querySelector('#agr-judul').textContent = judul;
    o.querySelector('#agr-sub').textContent = d ? (d.rentang.dari + ' s/d ' + d.rentang.sampai + ' · ' + d.rentang.jumlahHari + ' hari · WIB') : '';
    h += periodeHtml();
    h += '<div class="agr-aturan"><b>Aturan jam kerja.</b> ' + esc(TEKS_ATURAN) + (d ? ' Dihitung sejak ' + esc(d.mulaiDihitung) + '. Yang dihitung hanya hasil verifikasi pertama pada tiap data; perbaikan dan pemeriksaan ulang oleh Admin Utama tidak dihitung.' : '') + '</div>';
    if (st.status === 'muat' && !d) h += '<div class="agr-pesan" role="status">Memuat…</div>';
    else if (st.status === 'gagal' && !d) h += '<div class="agr-pesan galat" role="alert">' + esc(st.pesan || 'Gagal memuat.') + '<br><button type="button" class="agr-chip" id="agr-ulang" style="margin-top:10px">Coba lagi</button></div>';
    else if (d) {
      var r = d.ringkasan;
      h += kartu(r.total, r.jamKerja, r.luarJamKerja) + pil(r);
      if (d.cakupan === 'SEMUA' && d.perTim) h += kartuTim(d.perTim, d.tim || '');
      if (d.cakupan !== 'SAYA') h += '<div><h3>' + (d.cakupan === 'TIM' ? 'Anggota tim' : 'Semua verifikator') + '</h3>' + tabelOrang(d.perOrang, d.saya, d.luarTim) + '</div>';
      if (r.total === 0) h += '<div class="agr-pesan">Belum ada data yang diberi hasil verifikasi pada periode ini.</div>';
      h += bagan(d.perHari) + tabelHari(d.perHari);
      if (st.status === 'gagal') h += '<div class="agr-pesan galat" role="alert">' + esc(st.pesan) + ' (menampilkan data terakhir)</div>';
    }
    h += '<div class="agr-kaki"><span>' + (d ? 'Diperbarui ' + esc(new Date(d.diperbaruiPada).toLocaleString('id-ID')) : '') + '</span><button type="button" class="agr-unduh" id="agr-unduh"' + (st.unduh || !d ? ' disabled' : '') + '>' + (st.unduh ? 'Membuat file…' : 'Unduh Excel') + '</button></div>';
    o.querySelector('#agr-isi').innerHTML = h;
  }

  function muat() {
    var p = pengguna(); if (!p || !p.token || !berhak()) return;
    var token = p.token, id = ++st.idPermintaan, selesai = false;
    st.status = 'muat'; gambar();
    function akhir(fn) { if (selesai || id !== st.idPermintaan) return; selesai = true; clearTimeout(timer); var kini = pengguna(); if (!kini || kini.token !== token) return; fn(); gambar(); }
    var timer = setTimeout(function () { akhir(function () { st.status = 'gagal'; st.pesan = 'Waktu tunggu server habis. Coba lagi.'; }); }, BATAS_TUNGGU_MS);
    try {
      google.script.run
        .withSuccessHandler(function (res) {
          akhir(function () {
            if (res && res.sukses === true) { st.data = res; st.status = 'ok'; st.pesan = ''; }
            else { st.status = 'gagal'; st.pesan = (res && res.pesan) || 'Gagal memuat.'; }
          });
        })
        .withFailureHandler(function (e) { akhir(function () { st.status = 'gagal'; st.pesan = (e && e.message) || 'Gagal memuat.'; }); })
        .getAgregatVerifikasi(token, st.dari, st.sampai, st.tim);
    } catch (e) { akhir(function () { st.status = 'gagal'; st.pesan = String((e && e.message) || e); }); }
  }

  function unduhBerkas(base64, namaFile) {
    if (typeof unduhFileBase64 === 'function') { unduhFileBase64(base64, namaFile); return; }
    var bin = atob(base64), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    var url = akar.URL.createObjectURL(new Blob([u8], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    var a = dok.createElement('a'); a.href = url; a.download = namaFile; dok.body.appendChild(a); a.click(); dok.body.removeChild(a);
    setTimeout(function () { akar.URL.revokeObjectURL(url); }, 4000);
  }
  function unduhExcel() {
    var p = pengguna(); if (!p || !p.token || st.unduh) return;
    var token = p.token; st.unduh = true; gambar();
    function selesai() { st.unduh = false; gambar(); }
    try {
      google.script.run
        .withSuccessHandler(function (res) {
          var kini = pengguna(); if (!kini || kini.token !== token) { st.unduh = false; return; }
          selesai();
          if (res && res.sukses === true) { unduhBerkas(res.base64, res.namaFile); try { if (typeof tampilkanToast === 'function') tampilkanToast('File diunduh: ' + res.namaFile, 'sukses'); } catch (_e) { /* abaikan */ } }
          else toast((res && res.pesan) || 'Gagal membuat file.');
        })
        .withFailureHandler(function (e) { selesai(); toast((e && e.message) || 'Gagal membuat file.'); })
        .unduhRekapLemburVerifikasi(token, st.dari, st.sampai, st.tim);
    } catch (e) { selesai(); toast(String((e && e.message) || e)); }
  }

  function tutup() {
    var o = dok.getElementById(ID); if (o && o.parentNode) o.parentNode.removeChild(o);
    st.idPermintaan++; st.data = null; st.status = 'idle'; st.tim = '';
    dok.removeEventListener('keydown', saatTombol, true);
    if (st.pembuka && st.pembuka.focus) { try { st.pembuka.focus(); } catch (_e) { /* abaikan */ } }
    st.pembuka = null;
  }
  function saatTombol(e) { if (e.key === 'Escape') { e.preventDefault(); tutup(); } }

  function terapkanPreset(kode) {
    st.preset = kode;
    if (kode !== 'rentang') { var r = rentangPreset(kode); st.dari = r.dari; st.sampai = r.sampai; muat(); }
    else gambar();
  }

  function bukaPanel(pembuka) {
    if (!berhak()) { toast('Fitur ini khusus Admin Utama dan Verifikator.'); return; }
    suntikStyle();
    if (dok.getElementById(ID)) return;
    st.pembuka = pembuka || dok.activeElement; st.data = null; st.tim = '';
    var r = rentangPreset('bulan'); st.preset = 'bulan'; st.dari = r.dari; st.sampai = r.sampai;
    var o = dok.createElement('div'); o.id = ID; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-labelledby', 'agr-judul');
    o.innerHTML = '<div class="agr-kotak"><div class="agr-kepala"><div><h2 id="agr-judul">Hasil Kerja Verifikator</h2><div class="agr-sub" id="agr-sub"></div></div><button type="button" class="agr-tutup" id="agr-tutup" aria-label="Tutup">✕</button></div><div class="agr-isi" id="agr-isi"></div></div>';
    dok.body.appendChild(o);
    o.addEventListener('mousedown', function (e) { if (e.target === o) tutup(); });
    o.addEventListener('click', function (e) {
      var t = e.target;
      var chip = t.closest && t.closest('button[data-p]'), tim = t.closest && t.closest('button[data-tim]');
      if (t.closest && t.closest('#agr-tutup')) tutup();
      else if (chip) terapkanPreset(chip.getAttribute('data-p'));
      else if (t.id === 'agr-terapkan') {
        var d = dok.getElementById('agr-dari'), s = dok.getElementById('agr-sampai');
        if (!d || !s || !d.value || !s.value) { toast('Isi tanggal awal dan akhir.'); return; }
        st.dari = d.value; st.sampai = s.value; muat();
      }
      else if (tim) { var k = tim.getAttribute('data-tim'); st.tim = st.tim === k ? '' : k; muat(); }
      else if (t.id === 'agr-ulang') muat();
      else if (t.id === 'agr-unduh') unduhExcel();
    });
    dok.addEventListener('keydown', saatTombol, true);
    gambar();
    muat();
    var b = dok.getElementById('agr-tutup'); if (b) b.focus();
  }
  api.bukaPanel = bukaPanel;
  akar.bukaAgregatVerifikasi = bukaPanel;

  // ------------------------------------------------------------------ pintu masuk Admin Utama + penyelarasan (logout tidak memuat ulang halaman)
  function selaras() {
    var tombol = dok.getElementById(ID_TOMBOL);
    var utama = peran() === 'UTAMA';
    if (!utama) { if (tombol && tombol.parentNode) tombol.parentNode.removeChild(tombol); }
    else if (!tombol) {
      var acuan = dok.getElementById('btn-progres-kuota') || dok.getElementById('btn-dashboard-progres');
      if (acuan && acuan.parentNode) {
        var b = dok.createElement('button'); b.id = ID_TOMBOL; b.type = 'button';
        b.className = (dok.getElementById('btn-progres-kuota') ? dok.getElementById('btn-progres-kuota').className : acuan.className).replace(/\bhidden\b/g, '').replace(/\s+/g, ' ').trim();
        b.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.6-1.6a9 9 0 11-12.7 0"/></svg><span>Agregat Verifikasi</span>';
        b.addEventListener('click', function () { bukaPanel(b); });
        acuan.parentNode.insertBefore(b, acuan.nextSibling);
      }
    }
    if (tombol) tombol.hidden = false;
    if (dok.getElementById(ID) && !berhak()) tutup();
  }
  setInterval(function () { try { selaras(); } catch (_e) { /* abaikan */ } }, 2000);
  selaras();
  return api;
});
