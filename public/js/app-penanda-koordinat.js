/**
 * public/js/app-penanda-koordinat.js
 * Penanda koordinat lokasi Guru Maghrib Mengaji untuk Admin Utama dan Verifikator (TAHAP A: hanya penanda, tidak menolak apa pun).
 * Dimuat malas oleh app-pesan-periode.js (SKRIP_PER_PERAN) untuk peran UTAMA dan VERIFIKATOR; peran dicek lagi di sini.
 *
 * Isi:
 *  - lencana kecil di sel status setiap baris Lihat Data (juga tab Verifikasi Awal/Ulang, karena tabelnya sama): hijau = koordinat valid,
 *    merah = bermasalah (alasan di tooltip), abu = belum dicek. Baris layanan lain tidak diberi apa pun.
 *  - banner di Detail data (modal) dengan alasan yang jelas bila bermasalah.
 * Hasil penilaian datang dari SERVER (aksi getPenandaKoordinat: id + kode alasan; tanpa data pribadi) dan di-cache sebentar. Teks dari
 * server selalu lewat esc(). Gaya disuntik skrip ini sendiri sehingga CSS Tailwind tidak perlu dibangun ulang.
 * Gagal memuat penanda tidak mengganggu apa pun: tabel dan Detail tampil seperti biasa tanpa penanda.
 */
(function (akar, pabrik) {
  var api = pabrik(akar);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else akar.djpmPenandaKoordinat = api;
})(typeof self !== 'undefined' ? self : this, function (akar) {
  'use strict';

  // ------------------------------------------------------------------ bagian murni (diuji di Node)
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function peranBerhak(role) { var r = String(role || '').trim().toUpperCase(); return r === 'UTAMA' || r === 'VERIFIKATOR'; }

  /** Ubah jawaban server menjadi peta cepat id -> {s:'valid'|'salah'|'tunggu', alasan}. Jawaban tak sah -> null (tidak ada penanda). */
  function susunPeta(res) {
    if (!res || res.sukses !== true) return null;
    var peta = {}, i, id;
    (Array.isArray(res.v) ? res.v : []).forEach(function (x) { peta[String(x)] = { s: 'valid', alasan: '' }; });
    (Array.isArray(res.b) ? res.b : []).forEach(function (x) { peta[String(x)] = { s: 'tunggu', alasan: '' }; });
    var teks = (res.teks && typeof res.teks === 'object') ? res.teks : {};
    var x = (res.x && typeof res.x === 'object') ? res.x : {};
    for (id in x) { if (Object.prototype.hasOwnProperty.call(x, id)) { i = String(x[id] || ''); peta[String(id)] = { s: 'salah', alasan: Object.prototype.hasOwnProperty.call(teks, i) ? String(teks[i]) : 'Koordinat tidak dapat dipastikan sebagai titik lokasi' }; } }
    return peta;
  }

  /** Tanda untuk satu id; null bila id tidak ada di peta (bukan layanan GMM / belum dimuat). */
  function tandaUntuk(peta, id) {
    if (!peta || id == null) return null;
    var t = peta[String(id)];
    return t || null;
  }

  function teksLencana(t) {
    if (!t) return '';
    if (t.s === 'valid') return 'Koordinat valid';
    if (t.s === 'salah') return 'Koordinat bermasalah';
    return 'Koordinat belum dicek';
  }
  function judulLencana(t) {
    if (!t) return '';
    if (t.s === 'valid') return 'Tautan koordinat berisi titik lokasi di Kota Medan.';
    if (t.s === 'salah') return t.alasan;
    return 'Tautan koordinat belum sempat diperiksa sistem (akan dicoba lagi otomatis).';
  }
  /** Kalimat banner di Detail; kosong bila tidak perlu (valid atau tak ada penanda tidak membuat banner). */
  function teksBanner(t, role) {
    if (!t) return '';
    if (t.s === 'salah') {
      // Tahap B: server menolak Memenuhi Syarat dari verifikator pada koordinat bermasalah; Admin Utama tidak diblokir.
      var admin = String(role || '').trim().toUpperCase() === 'UTAMA';
      return 'Koordinat bermasalah: ' + t.alasan + '. ' + (admin
        ? 'Verifikator tidak dapat memberi Memenuhi Syarat pada data ini. Anda (Admin Utama) tidak diblokir, tetapi sebaiknya jadikan Berkas Tidak Lengkap dengan keterangan koordinat agar petugas lapangan mengirim titik yang benar.'
        : 'Data ini tidak dapat diberi Memenuhi Syarat. Pilih Berkas Tidak Lengkap dan tulis alasan koordinat di keterangan; petugas lapangan yang mengirim titik yang benar.');
    }
    if (t.s === 'tunggu') return 'Koordinat belum dicek sistem. Hasil pemeriksaan akan muncul otomatis.';
    return '';
  }

  var api = { esc: esc, peranBerhak: peranBerhak, susunPeta: susunPeta, tandaUntuk: tandaUntuk, teksLencana: teksLencana, judulLencana: judulLencana, teksBanner: teksBanner };
  if (!akar || !akar.document) return api;

  // ------------------------------------------------------------------ tampilan
  var dok = akar.document;
  var ID_STYLE = 'djpm-penanda-koord-style', KELAS_LENCANA = 'djpm-pk-lencana', ID_BANNER = 'djpm-pk-banner';
  var BATAS_TUNGGU_MS = 40000, CACHE_MS = 90000, COBA_ULANG_MS = 60000;
  var st = { peta: null, waktu: 0, muat: false, token: '', gagalPada: 0, idDetail: null };

  function pengguna() { return (typeof dataPengguna !== 'undefined') ? dataPengguna : null; }
  function berhak() { var p = pengguna(); return !!(p && p.token && peranBerhak(p.role)); }

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
      '.' + KELAS_LENCANA + '{display:inline-block;margin-top:4px;padding:1px 8px;border-radius:6px;font-size:10px;font-weight:700;border:1px solid;white-space:nowrap}' +
      '.' + KELAS_LENCANA + '[data-s=valid]{background:#ecfdf5;color:#065f46;border-color:#6ee7b7}' +
      '.' + KELAS_LENCANA + '[data-s=salah]{background:#fef2f2;color:#991b1b;border-color:#fca5a5}' +
      '.' + KELAS_LENCANA + '[data-s=tunggu]{background:#f1f5f9;color:#475569;border-color:#cbd5e1}' +
      '#' + ID_BANNER + '{margin:0 0 12px;padding:10px 14px;border-radius:10px;font-size:.8rem;border:1px solid}' +
      '#' + ID_BANNER + '[data-s=salah]{background:#fef2f2;color:#7f1d1d;border-color:#fca5a5}' +
      '#' + ID_BANNER + '[data-s=tunggu]{background:#f1f5f9;color:#334155;border-color:#cbd5e1}';
    dok.head.appendChild(s);
  }

  /** Muat peta dari server (di-cache; satu permintaan sekaligus). Gagal: peta lama tetap dipakai, dicoba lagi setelah jeda. */
  function muat(paksa) {
    var p = pengguna(); if (!berhak() || !p) return Promise.resolve();
    if (st.muat) return Promise.resolve();
    var sekarang = Date.now();
    if (st.token !== p.token) { st.token = p.token; st.peta = null; st.waktu = 0; st.gagalPada = 0; }
    if (!paksa && st.peta && sekarang - st.waktu < CACHE_MS) return Promise.resolve();
    if (st.gagalPada && sekarang - st.gagalPada < COBA_ULANG_MS) return Promise.resolve();
    st.muat = true;
    return rpc('getPenandaKoordinat', []).then(function (res) {
      var peta = susunPeta(res);
      if (peta) { st.peta = peta; st.waktu = Date.now(); st.gagalPada = 0; } else { st.gagalPada = Date.now(); }
    }).catch(function () { st.gagalPada = Date.now(); }).then(function () { st.muat = false; terapkan(); });
  }

  function idDariTombol(btn) {
    var m = /tampilkanDetailKeModalOnDemand\(\s*['"]?(\d+)['"]?\s*\)/.exec(btn.getAttribute('onclick') || '');
    return m ? m[1] : null;
  }

  /** Pasang/perbarui lencana di sel status tiap baris; idempoten. */
  function terapkanTabel() {
    var tb = dok.getElementById('body-tabel-lihat'); if (!tb) return;
    var tombol = tb.querySelectorAll('button[onclick*="tampilkanDetailKeModalOnDemand"]');
    Array.prototype.forEach.call(tombol, function (btn) {
      var td = btn.closest('td'); var sel = td && td.previousElementSibling; if (!sel) return;
      var ada = sel.querySelector('.' + KELAS_LENCANA);
      var t = berhak() ? tandaUntuk(st.peta, idDariTombol(btn)) : null;
      if (!t) { if (ada) ada.parentNode.removeChild(ada); return; }
      if (!ada) { ada = dok.createElement('div'); ada.className = KELAS_LENCANA; sel.appendChild(ada); }
      var teks = '● ' + teksLencana(t), judul = judulLencana(t);
      if (ada.getAttribute('data-s') !== t.s) ada.setAttribute('data-s', t.s);
      if (ada.textContent !== teks) ada.textContent = teks;
      if (ada.title !== judul) ada.title = judul;
    });
  }

  /** Banner di bagian atas Detail untuk data yang sedang dibuka. */
  function terapkanDetail() {
    var isi = dok.getElementById('isi-konten-detail'); if (!isi) return;
    var lama = dok.getElementById(ID_BANNER);
    var t = berhak() && st.idDetail != null ? tandaUntuk(st.peta, st.idDetail) : null;
    var kalimat = t ? teksBanner(t, (pengguna() || {}).role) : '';
    var terisi = isi.children.length > 0 && !(isi.children.length === 1 && isi.firstElementChild === lama);
    if (!kalimat || !terisi) { if (lama && lama.parentNode) lama.parentNode.removeChild(lama); return; }
    if (lama && lama.getAttribute('data-id') === String(st.idDetail) && lama.getAttribute('data-s') === t.s && lama.textContent === kalimat && lama === isi.firstElementChild) return;
    if (lama && lama.parentNode) lama.parentNode.removeChild(lama);
    var b = dok.createElement('div'); b.id = ID_BANNER; b.setAttribute('role', 'status');
    b.setAttribute('data-s', t.s); b.setAttribute('data-id', String(st.idDetail)); b.textContent = kalimat;
    isi.insertBefore(b, isi.firstChild);
  }

  function terapkan() { try { suntikStyle(); terapkanTabel(); terapkanDetail(); } catch (_e) { /* penanda bersifat tambahan */ } }

  /** Catat id data yang dibuka di Detail (pembungkus tipis; fungsi aslinya tetap dipanggil apa adanya). */
  function pasangPembungkus() {
    if (akar.__djpmPenandaKoordDibungkus || typeof akar.tampilkanDetailKeModalOnDemand !== 'function') return;
    var asli = akar.tampilkanDetailKeModalOnDemand;
    akar.tampilkanDetailKeModalOnDemand = function (nomorBaris) {
      st.idDetail = nomorBaris;
      var hasil = asli.apply(this, arguments);
      try { muat(false); } catch (_e) { /* abaikan */ }
      return hasil;
    };
    akar.__djpmPenandaKoordDibungkus = true;
  }

  var MO = akar.MutationObserver;
  var pengamat = { tabel: null, detail: null };
  function pasangPengamat() {
    if (!MO) return;
    var tb = dok.getElementById('body-tabel-lihat');
    if (tb && tb !== pengamat.tabel) { pengamat.tabel = tb; new MO(function () { terapkanTabel(); }).observe(tb, { childList: true }); terapkanTabel(); }
    var d = dok.getElementById('isi-konten-detail');
    if (d && d !== pengamat.detail) { pengamat.detail = d; new MO(function () { terapkanDetail(); }).observe(d, { childList: true }); }
  }

  function bersihkan() {
    Array.prototype.forEach.call(dok.querySelectorAll('.' + KELAS_LENCANA + ', #' + ID_BANNER), function (e) { if (e.parentNode) e.parentNode.removeChild(e); });
    st.peta = null; st.waktu = 0; st.token = ''; st.idDetail = null;
  }

  function putaran() {
    try {
      if (!berhak()) { if (st.peta || dok.querySelector('.' + KELAS_LENCANA + ', #' + ID_BANNER)) bersihkan(); return; }
      pasangPembungkus(); pasangPengamat();
      if (!dok.hidden) muat(false);
      terapkan();
    } catch (_e) { /* abaikan */ }
  }
  // Pintu uji: memuat ulang peta tanpa menunggu cache.
  api.muatUlangUntukUji = function () { return muat(true); };
  /** Tanda koordinat data ini (dibaca modul Verifikasi Ulang): {s:'valid'|'salah'|'tunggu', alasan} atau null bila bukan data GMM / belum dimuat. */
  api.tandaSekarang = function (id) { return berhak() ? tandaUntuk(st.peta, id) : null; };
  api.terapkanUntukUji = terapkan;
  setInterval(putaran, 2000);
  putaran();
  return api;
});
