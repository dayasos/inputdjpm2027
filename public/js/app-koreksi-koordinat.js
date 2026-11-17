/**
 * public/js/app-koreksi-koordinat.js
 * Layar kecil KHUSUS Admin Utama untuk koreksi koordinat sekali pakai oleh SISTEM: data Guru Maghrib Mengaji yang sudah Memenuhi Syarat oleh akun verifikator
 * tetapi koordinatnya tidak valid diturunkan ke Berkas Tidak Lengkap oleh "SISTEM" (tidak memengaruhi hitungan verifikator). Server: domains/koreksiKoordinat.ts.
 * Dua langkah: tombol membuka PRATINJAU (tanpa perubahan); "Jalankan" mengirim persis daftar id yang tampil. Dimuat malas oleh app-pesan-periode.js (peran UTAMA saja).
 * Gaya disuntik sendiri. Teks dari server selalu lewat esc().
 */
(function (akar, pabrik) {
  var api = pabrik(akar);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else akar.djpmKoreksiKoordinat = api;
})(typeof self !== 'undefined' ? self : this, function (akar) {
  'use strict';

  // ------------------------------------------------------------------ bagian murni (diuji di Node)
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /** Jawaban pratinjau server -> {ok, jumlah, ids, baris, pesan}. Jawaban tak sah -> ok false. */
  function susunPratinjau(res) {
    if (!res || res.sukses !== true || res.dryRun !== true || !Array.isArray(res.data)) return { ok: false, jumlah: 0, ids: [], baris: [], pesan: (res && res.pesan) || 'Pratinjau gagal dimuat.' };
    var baris = res.data.filter(function (r) { return r && Number(r.id) > 0; });
    return { ok: true, jumlah: baris.length, ids: baris.map(function (r) { return Number(r.id); }), baris: baris, melebihiBatas: res.melebihiBatas === true, pesan: '' };
  }
  function teksHasil(res) {
    if (!res || res.sukses !== true) return { ok: false, teks: (res && res.pesan) || 'Pelaksanaan gagal.' };
    return { ok: true, teks: String(res.pesan || (Number(res.diubah) || 0) + ' data diubah.') };
  }
  function teksTombol(jumlah) { return 'Jalankan koreksi oleh SISTEM (' + (Number(jumlah) || 0) + ' data)'; }

  var api = { esc: esc, susunPratinjau: susunPratinjau, teksHasil: teksHasil, teksTombol: teksTombol };
  if (!akar || !akar.document) return api;

  // ------------------------------------------------------------------ tampilan
  var dok = akar.document;
  var ID_TOMBOL = 'djpm-kk-tombol', ID_OVERLAY = 'djpm-kk-overlay', ID_STYLE = 'djpm-kk-style';
  var BATAS_TUNGGU_MS = 60000;
  var st = { pratinjau: null, sibuk: false };

  function pengguna() { return (typeof dataPengguna !== 'undefined') ? dataPengguna : null; }
  function berhak() { var p = pengguna(); return !!(p && p.token && String(p.role || '').trim().toUpperCase() === 'UTAMA'); }

  function rpc(nama, args) {
    var p = pengguna(); var token = p && p.token;
    return new Promise(function (resolve, reject) {
      if (!token) { reject(new Error('Sesi tidak ditemukan.')); return; }
      var selesai = false;
      var timer = setTimeout(function () { akhir(reject, new Error('Waktu tunggu server habis.')); }, BATAS_TUNGGU_MS);
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
    s.textContent =
      '#' + ID_TOMBOL + '{margin-top:8px;padding:5px 12px;border-radius:8px;border:1px solid #fca5a5;background:#fef2f2;color:#991b1b;font-size:11px;font-weight:700;cursor:pointer}' +
      '#' + ID_OVERLAY + '{position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px}' +
      '#' + ID_OVERLAY + ' .kk-kotak{background:#fff;color:#0f172a;border-radius:14px;max-width:760px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.3)}' +
      '#' + ID_OVERLAY + ' .kk-kepala{padding:14px 18px;border-bottom:1px solid #e2e8f0;font-weight:700}' +
      '#' + ID_OVERLAY + ' .kk-isi{padding:14px 18px;overflow:auto;font-size:13px;line-height:1.5}' +
      '#' + ID_OVERLAY + ' .kk-kaki{padding:12px 18px;border-top:1px solid #e2e8f0;display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;align-items:center}' +
      '#' + ID_OVERLAY + ' table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}' +
      '#' + ID_OVERLAY + ' th,#' + ID_OVERLAY + ' td{border-bottom:1px solid #e2e8f0;padding:4px 6px;text-align:left;vertical-align:top}' +
      '#' + ID_OVERLAY + ' button{padding:7px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#f8fafc;font-weight:600;cursor:pointer}' +
      '#' + ID_OVERLAY + ' button.kk-bahaya{background:#b91c1c;border-color:#b91c1c;color:#fff}' +
      '#' + ID_OVERLAY + ' button:disabled{opacity:.45;cursor:not-allowed}';
    dok.head.appendChild(s);
  }

  function tutup() { var o = dok.getElementById(ID_OVERLAY); if (o && o.parentNode) o.parentNode.removeChild(o); st.pratinjau = null; st.sibuk = false; }

  function gambar(judulIsi, isiHtml, kakiHtml) {
    var o = dok.getElementById(ID_OVERLAY);
    if (!o) { o = dok.createElement('div'); o.id = ID_OVERLAY; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); dok.body.appendChild(o); }
    o.innerHTML = '<div class="kk-kotak"><div class="kk-kepala">' + esc(judulIsi) + '</div><div class="kk-isi">' + isiHtml + '</div><div class="kk-kaki">' + kakiHtml + '</div></div>';
    var t = o.querySelector('[data-kk=tutup]'); if (t) t.onclick = tutup;
    return o;
  }

  function tampilPratinjau(p) {
    st.pratinjau = p;
    if (!p.ok) { gambar('Koreksi koordinat oleh SISTEM', '<p>' + esc(p.pesan) + '</p>', '<button data-kk="tutup">Tutup</button>'); return; }
    if (p.jumlah === 0) { gambar('Koreksi koordinat oleh SISTEM', '<p>Tidak ada data yang perlu dikoreksi.</p>', '<button data-kk="tutup">Tutup</button>'); return; }
    var baris = p.baris.map(function (r) { return '<tr><td>' + esc(r.nama) + '</td><td>' + esc(r.kecamatan) + '</td><td>' + esc(r.kelurahan) + '</td><td>' + esc(r.alasan) + '</td></tr>'; }).join('');
    var isi = '<p>Data Guru Maghrib Mengaji yang <b>sudah Memenuhi Syarat oleh akun verifikator</b> tetapi koordinatnya tidak valid. Bila dijalankan, tiap data diubah ke ' +
      '<b>Berkas Tidak Lengkap oleh SISTEM</b> dengan keterangan koordinat dan batas perbaikan seragam. Hitungan pekerjaan/lembur verifikator <b>tidak berubah</b>, dan data ini tidak menjadi tugas Verifikasi Ulang.</p>' +
      '<p><b>' + p.jumlah + ' data.</b> Periksa daftar berikut:</p><table><thead><tr><th>Nama</th><th>Kecamatan</th><th>Kelurahan</th><th>Masalah koordinat</th></tr></thead><tbody>' + baris + '</tbody></table>' +
      (p.melebihiBatas ? '<p style="color:#b91c1c"><b>Jumlah melebihi batas satu pelaksanaan.</b> Hubungi pengembang.</p>' : '');
    var kaki = '<label style="margin-right:auto;font-size:12px"><input type="checkbox" data-kk="setuju"> Saya sudah memeriksa daftar</label>' +
      '<button data-kk="tutup">Batal</button><button class="kk-bahaya" data-kk="jalan" disabled>' + esc(teksTombol(p.jumlah)) + '</button>';
    var o = gambar('Koreksi koordinat oleh SISTEM (pratinjau)', isi, kaki);
    var cb = o.querySelector('[data-kk=setuju]'), tb = o.querySelector('[data-kk=jalan]');
    cb.onchange = function () { tb.disabled = !cb.checked || p.melebihiBatas; };
    tb.onclick = function () { jalankan(p); };
  }

  function jalankan(p) {
    if (st.sibuk) return; st.sibuk = true;
    gambar('Koreksi koordinat oleh SISTEM', '<p>Sedang dijalankan... jangan tutup halaman.</p>', '');
    rpc('koreksiKoordinatBermasalah', [true, p.ids]).then(function (res) {
      var h = teksHasil(res);
      var rincian = '';
      if (res && Array.isArray(res.dilewati) && res.dilewati.length) rincian = '<p style="font-size:12px">Dilewati: ' + res.dilewati.map(function (x) { return esc(x.id) + ' (' + esc(x.alasan) + ')'; }).join('; ') + '</p>';
      if (h.ok) rincian += '<p style="font-size:12px">Muat ulang halaman (F5) agar status terbaru tampil di tabel.</p>';
      gambar('Koreksi koordinat oleh SISTEM', '<p>' + esc(h.teks) + '</p>' + rincian, '<button data-kk="tutup">Tutup</button>');
      st.sibuk = false;
    }).catch(function (e) { st.sibuk = false; gambar('Koreksi koordinat oleh SISTEM', '<p>' + esc(e && e.message ? e.message : 'Gagal.') + '</p>', '<button data-kk="tutup">Tutup</button>'); });
  }

  function buka() {
    if (!berhak()) return;
    suntikStyle();
    gambar('Koreksi koordinat oleh SISTEM', '<p>Memuat pratinjau...</p>', '<button data-kk="tutup">Tutup</button>');
    rpc('koreksiKoordinatBermasalah', []).then(function (res) { tampilPratinjau(susunPratinjau(res)); })
      .catch(function (e) { tampilPratinjau({ ok: false, jumlah: 0, ids: [], baris: [], pesan: e && e.message ? e.message : 'Gagal.' }); });
  }

  function pasang() {
    var ada = dok.getElementById(ID_TOMBOL);
    if (!berhak()) { if (ada && ada.parentNode) ada.parentNode.removeChild(ada); var o = dok.getElementById(ID_OVERLAY); if (o) tutup(); return; }
    if (ada) return;
    var info = dok.getElementById('info-total-penerima'); if (!info || !info.parentNode) return;
    suntikStyle();
    var b = dok.createElement('button'); b.id = ID_TOMBOL; b.type = 'button'; b.textContent = 'Koreksi koordinat (SISTEM)';
    b.title = 'Pratinjau dan koreksi koordinat tidak valid pada data yang sudah Memenuhi Syarat oleh verifikator';
    b.onclick = buka;
    (info.previousElementSibling || info.parentNode).appendChild(b);
  }

  setInterval(function () { try { pasang(); } catch (_e) { /* abaikan */ } }, 2000);
  try { pasang(); } catch (_e) { /* abaikan */ }
  api.bukaUntukUji = buka;
  return api;
});
