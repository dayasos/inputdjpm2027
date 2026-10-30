/**
 * public/js/app-templat-alasan.js
 * "Alasan Cepat": chip kalimat siap pakai di bawah kotak keterangan form "Verifikasi Admin Utama" -- HANYA Admin Utama.
 * Dimuat malas oleh app-pesan-periode.js (SKRIP_PER_PERAN.UTAMA), jadi peran lain tidak pernah mengunduh berkas ini.
 * Rancangan: plans/plan-templat-alasan-berkas-tidak-lengkap.md
 *
 * Yang dilakukan berkas ini HANYA mengisi kotak #input-keterangan-verifikasi (teks biasa). Jalur simpan keterangan
 * (jalankanVerifikasi -> verifikasiSatuData) tidak berubah. Semua teks dari server dipasang lewat textContent.
 * Layar "Kelola Templat" ada di app-templat-kelola.js (dimuat saat tombol Kelola diklik).
 */
(function () {
  'use strict';

  var BTL = 'Berkas Tidak Lengkap';
  var TMS = 'Tidak Memenuhi Syarat';
  var ID_TA = 'input-keterangan-verifikasi';
  var ID_WADAH = 'ac-wadah';
  var ID_STYLE = 'ac-style';
  var MUI_AWAL = /^\s*\[CATATAN REKOMENDASI MUI\]/i;

  // Versi (?v=) skrip ini, dipakai juga untuk memuat skrip Kelola agar cache ikut terbuang bersama-sama.
  var VERSI = '';
  try { VERSI = ((document.currentScript && /[?&]v=([^&]+)/.exec(document.currentScript.src)) || [])[1] || ''; } catch (_e) { VERSI = ''; }

  var cache = null;          // hasil getTemplatAlasan terakhir
  var cacheToken = '';       // token sesi pemilik `cache` (tidak boleh terbawa ke sesi/peran lain)
  var daftarBerkas = [];     // berkas wajib layanan penerima yang sedang dibuka: [{label}]
  var taDengar = null, fnDengar = null;   // pendengar 'input' kotak keterangan (satu saja; dilepas saat chip digambar ulang)

  // Masalah bawaan untuk "Berkas lain" (tidak disimpan di database).
  var MASALAH = [
    { kode: 'belum', label: 'Belum diunggah', f: function (b) { return b + ' BELUM DIUNGGAH, MOHON DILENGKAPI'; } },
    { kode: 'buram', label: 'Buram / tidak terbaca', f: function (b) { return b + ' BURAM / TIDAK TERBACA, MOHON UNGGAH ULANG ' + b + ' YANG JELAS'; } },
    { kode: 'salah', label: 'Salah / tidak sesuai', f: function (b) { return b + ' SALAH / TIDAK SESUAI, MOHON UNGGAH ULANG ' + b + ' YANG BENAR'; } }
  ];

  // ---------------------------------------------------------------------------------------------
  // Fungsi murni (diuji terpisah)
  // ---------------------------------------------------------------------------------------------
  function rapat(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  /** Kunci pembanding: tanpa nomor di awal, spasi dirapatkan, HURUF BESAR. */
  function kunci(t) { return rapat(t).replace(/^\d+[.)]\s+/, '').toUpperCase(); }

  /** Kalimat templat -> kalimat final (variabel {LAYANAN} diganti nama layanan penerima). */
  function isiKalimat(isi, layanan) {
    return rapat(String(isi || '').split('{LAYANAN}').join(String(layanan || '').toUpperCase())).toUpperCase();
  }

  /** Nama berkas untuk kalimat: tanpa keterangan dalam kurung di ujung. */
  function namaBerkas(label) { return rapat(String(label || '').replace(/\s*\([^)]*\)\s*$/, '')).toUpperCase(); }

  function kalimatBerkas(label, kodeMasalah) {
    var b = namaBerkas(label);
    if (!b) return '';
    for (var i = 0; i < MASALAH.length; i++) if (MASALAH[i].kode === kodeMasalah) return MASALAH[i].f(b);
    return '';
  }

  /** Templat yang boleh tampil: aktif, status sama, dan (berlaku untuk semua layanan ATAU layanan penerima termasuk daftarnya). */
  function tersedia(t, layananUpper, status) {
    if (!t || t.aktif !== true || t.status !== status) return false;
    var daftar = Array.isArray(t.layanan) ? t.layanan : [];
    return daftar.length === 0 || daftar.indexOf(String(layananUpper || '').toUpperCase()) !== -1;
  }

  /** Teks kotak -> daftar baris tak kosong: {mui: baris catatan MUI (tidak dinomori), isi: teks tanpa nomor lama}. */
  function pecah(teks) {
    return String(teks == null ? '' : teks).split(/\r?\n/)
      .map(function (b) { return b.trim(); })
      .filter(function (b) { return b !== ''; })
      .map(function (b) {
        var mui = MUI_AWAL.test(b);
        return { mui: mui, isi: mui ? b : b.replace(/^\d+[.)]\s+/, '') };
      });
  }

  function sudahAda(teks, kalimat) {
    var k = kunci(kalimat);
    return pecah(teks).some(function (it) { return !it.mui && kunci(it.isi) === k; });
  }

  /**
   * Menambahkan satu kalimat ke teks kotak. Satu alasan = tanpa nomor; dua atau lebih = "1. ..." per baris
   * (baris catatan MUI tidak dinomori dan tidak dihitung). Alasan yang sama tidak digandakan.
   * Mengembalikan {teks, hasil: 'tambah' | 'sudah' | 'kosong'}.
   */
  function gabung(teks, kalimat) {
    var baru = rapat(kalimat).toUpperCase();
    if (!baru) return { teks: String(teks == null ? '' : teks), hasil: 'kosong' };
    if (sudahAda(teks, baru)) return { teks: String(teks == null ? '' : teks), hasil: 'sudah' };
    var it = pecah(teks), akhir = -1;
    it.forEach(function (x, i) { if (!x.mui) akhir = i; });
    it.splice(akhir < 0 ? it.length : akhir + 1, 0, { mui: false, isi: baru });
    var banyak = it.filter(function (x) { return !x.mui; }).length, n = 0;
    return {
      teks: it.map(function (x) {
        if (x.mui) return x.isi;
        n++;
        return banyak > 1 ? n + '. ' + x.isi : x.isi;
      }).join('\n'),
      hasil: 'tambah'
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Pembantu
  // ---------------------------------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function utama() {
    return typeof dataPengguna !== 'undefined' && !!dataPengguna && !!dataPengguna.token &&
      String(dataPengguna.role || '').toUpperCase() === 'UTAMA';
  }
  function buat(tag, kelas, teks) {
    var e = document.createElement(tag);
    if (kelas) e.className = kelas;
    if (teks != null) e.textContent = teks;
    return e;
  }
  function toast(pesan, jenis) {
    if (typeof tampilkanToast === 'function') tampilkanToast(pesan, jenis || 'info');
  }
  /** Tinggi kotak mengikuti isi (termasuk baris yang terbungkus), maksimal ±12 baris; sesudah itu menggulir. */
  function ukurTinggi(t) {
    if (!t || !t.style) return;
    t.style.height = 'auto';
    if (t.scrollHeight > 0) t.style.height = Math.min(t.scrollHeight + 2, 260) + 'px';
  }
  function layananDari(d) { return String((d && d[7]) || '').trim().toUpperCase(); }

  function suntikStyle() {
    if ($(ID_STYLE)) return;
    var s = document.createElement('style');
    s.id = ID_STYLE;
    s.textContent = [
      '.ac-wadah{margin:.1rem 0 .75rem;padding:.6rem .7rem;border-radius:.75rem;background:#fff;border:1.5px dashed #f59e0b}',
      '.ac-kepala{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .6rem;margin-bottom:.45rem}',
      '.ac-judul{font-weight:800;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:#92400e}',
      '.ac-hint{font-size:.68rem;color:#475569}',
      '.ac-spasi{flex:1 1 auto}',
      '.ac-tombol{font-size:.68rem;font-weight:700;padding:.25rem .6rem;border-radius:.5rem;border:1px solid #cbd5e1;background:#fff;color:#334155;cursor:pointer}',
      '.ac-tombol:hover{background:#f1f5f9}',
      '.ac-label{font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#334155;margin:.45rem 0 .25rem}',
      '.ac-chips{display:flex;flex-wrap:wrap;gap:.4rem}',
      '.ac-chip{display:inline-flex;align-items:center;gap:.4rem;font-size:.74rem;font-weight:700;padding:.35rem .75rem .35rem .4rem;border-radius:999px;',
      'border:1.5px solid #f59e0b;background:#fffbeb;color:#78350f;cursor:pointer;transition:transform .08s,box-shadow .12s,background .12s;text-align:left;line-height:1.2}',
      '.ac-chip:hover{background:#fef3c7;box-shadow:0 2px 6px rgba(245,158,11,.35);transform:translateY(-1px)}',
      '.ac-chip:active{transform:scale(.97)}',
      '.ac-ikon{display:inline-flex;align-items:center;justify-content:center;width:1.15rem;height:1.15rem;border-radius:50%;background:#f59e0b;color:#fff;font-size:.8rem;line-height:1;font-weight:900;flex:none}',
      '.ac-chip.ac-tms{border-color:#e11d48;background:#fff1f2;color:#881337}',
      '.ac-chip.ac-tms:hover{background:#ffe4e6;box-shadow:0 2px 6px rgba(225,29,72,.3)}',
      '.ac-chip.ac-tms .ac-ikon{background:#e11d48}',
      '.ac-chip.ac-ada{border-color:#94a3b8;background:#f1f5f9;color:#475569;box-shadow:none;transform:none}',
      '.ac-chip.ac-ada .ac-ikon{background:#64748b}',
      '.ac-lain{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;margin-top:.55rem;padding-top:.5rem;border-top:1px solid #fde68a}',
      '.ac-lain select{font-size:.72rem;padding:.3rem .4rem;border:1px solid #cbd5e1;border-radius:.4rem;background:#fff;max-width:100%}',
      '.ac-tambah{font-size:.72rem;font-weight:800;padding:.32rem .7rem;border-radius:.5rem;border:0;background:#d97706;color:#fff;cursor:pointer}',
      '.ac-tambah:hover{background:#b45309}',
      '.ac-kosong{font-size:.72rem;color:#64748b}',
      '.ac-galat{font-size:.72rem;color:#9f1239;font-weight:600}'
    ].join('');
    document.head.appendChild(s);
  }

  // ---------------------------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------------------------
  function bersihkanCacheJikaPerlu() {
    if (!utama() || cacheToken !== dataPengguna.token) { cache = null; cacheToken = ''; }
  }

  /** Mengambil templat (dari cache modul bila ada). `paksa` = abaikan cache (mis. sesudah Kelola). */
  function ambil(paksa) {
    bersihkanCacheJikaPerlu();
    if (cache && !paksa) return Promise.resolve(cache);
    var token = dataPengguna.token;
    return new Promise(function (resolve, reject) {
      var selesai = false;
      var timer = setTimeout(function () { if (!selesai) { selesai = true; reject(new Error('waktu tunggu server habis')); } }, 30000);
      function akhir(fn, v) { if (selesai) return; selesai = true; clearTimeout(timer); fn(v); }
      try {
        var r = google.script.run
          .withSuccessHandler(function (res) {
            if (!res || res.sukses !== true) { akhir(reject, new Error((res && res.pesan) || 'Templat gagal dimuat.')); return; }
            if (!utama() || dataPengguna.token !== token) { akhir(reject, new Error('Sesi berganti.')); return; }
            cache = res; cacheToken = token;
            akhir(resolve, res);
          })
          .withFailureHandler(function (e) { akhir(reject, e instanceof Error ? e : new Error(String(e && e.message ? e.message : e))); });
        r.getTemplatAlasan(token);
      } catch (e) { akhir(reject, e); }
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Tampilan
  // ---------------------------------------------------------------------------------------------
  // html() dan pasang() dipanggil di tengah render Detail penerima: apa pun yang salah di sini TIDAK boleh menggagalkan render itu
  // (form verifikasi harus tetap utuh), jadi keduanya dibungkus try/catch.
  function html(d, berkas) {
    try {
      bersihkanCacheJikaPerlu();
      if (!utama()) return '';
      suntikStyle();
      daftarBerkas = Array.isArray(berkas) ? berkas.map(function (b) { return { label: String((b && b.label) || '') }; }) : [];
      return '<div id="' + ID_WADAH + '" class="ac-wadah"><span class="ac-kosong">⚡ Memuat alasan cepat…</span></div>';
    } catch (e) {
      try { console.warn('Alasan Cepat: html gagal', e); } catch (_e) { /* abaikan */ }
      return '';
    }
  }

  function pasang(d) {
    try {
      var w = $(ID_WADAH);
      if (!w || !utama()) return;
      var token = dataPengguna.token, layanan = layananDari(d);
      ambil(false).then(function (data) {
        if (!w.isConnected || !utama() || dataPengguna.token !== token) return;
        gambar(w, data, layanan, d);
      }).catch(function (e) {
        if (!w.isConnected) return;
        gambarGalat(w, e, d);
      });
    } catch (e) {
      try { console.warn('Alasan Cepat: pasang gagal', e); } catch (_e) { /* abaikan */ }
    }
  }

  function gambarGalat(w, e, d) {
    w.textContent = '';
    w.appendChild(buat('span', 'ac-galat', 'Templat gagal dimuat (' + ((e && e.message) || 'tidak diketahui') + '). Keterangan tetap bisa diketik manual. '));
    var u = buat('button', 'ac-tombol', 'Coba lagi');
    u.type = 'button';
    u.addEventListener('click', function () { w.textContent = ''; w.appendChild(buat('span', 'ac-kosong', '⚡ Memuat alasan cepat…')); ambil(true).then(function (data) { if (w.isConnected) gambar(w, data, layananDari(d), d); }).catch(function (e2) { if (w.isConnected) gambarGalat(w, e2, d); }); });
    w.appendChild(u);
  }

  function muatSkripKelola() {
    return new Promise(function (resolve, reject) {
      if (window.djpmTemplatKelola) { resolve(); return; }
      var s = document.createElement('script'), timer = setTimeout(function () { reject(new Error('Layar Kelola gagal dimuat.')); }, 20000);
      s.onload = function () { clearTimeout(timer); window.djpmTemplatKelola ? resolve() : reject(new Error('Layar Kelola gagal dimuat.')); };
      s.onerror = function () { clearTimeout(timer); reject(new Error('Layar Kelola gagal dimuat. Periksa koneksi, lalu coba lagi.')); };
      s.async = true;
      s.src = '/js/app-templat-kelola.js' + (VERSI ? '?v=' + VERSI : '');
      document.head.appendChild(s);
    });
  }

  function gambar(w, data, layanan, d) {
    var ta = $(ID_TA);
    w.textContent = '';

    // Kepala
    var kepala = buat('div', 'ac-kepala');
    kepala.appendChild(buat('span', 'ac-judul', '⚡ Alasan cepat'));
    kepala.appendChild(buat('span', 'ac-hint', 'Klik untuk menambahkan ke kotak keterangan di atas'));
    kepala.appendChild(buat('span', 'ac-spasi'));
    var bKelola = buat('button', 'ac-tombol', '⚙ Kelola'); bKelola.type = 'button'; bKelola.title = 'Tambah / ubah / hapus templat';
    var bBersih = buat('button', 'ac-tombol', 'Bersihkan'); bBersih.type = 'button'; bBersih.title = 'Kosongkan kotak keterangan';
    kepala.appendChild(bKelola); kepala.appendChild(bBersih);
    w.appendChild(kepala);

    var chips = [];    // {el, ikon, kalimat}
    function segarkan() {
      var t = $(ID_TA);
      chips.forEach(function (c) {
        var ada = !!t && sudahAda(t.value, c.kalimat);
        c.el.classList.toggle('ac-ada', ada);
        c.ikon.textContent = ada ? '✓' : '+';
        c.el.setAttribute('aria-pressed', ada ? 'true' : 'false');
      });
    }
    function tambah(kalimat) {
      var t = $(ID_TA);
      if (!t) return;
      var r = gabung(t.value, kalimat);
      if (r.hasil === 'sudah') { toast('Alasan ini sudah ada di kotak keterangan.', 'info'); return; }
      if (r.hasil !== 'tambah') return;
      t.value = r.teks;
      ukurTinggi(t);
      t.dispatchEvent(new Event('input', { bubbles: true }));
      t.focus();
      try { t.setSelectionRange(t.value.length, t.value.length); } catch (_e) { /* tidak penting */ }
      segarkan();
    }
    function buatChip(status, tpl) {
      var kalimat = isiKalimat(tpl.isi, layanan);
      var b = buat('button', 'ac-chip' + (status === TMS ? ' ac-tms' : ''));
      b.type = 'button';
      b.title = kalimat;
      var ikon = buat('span', 'ac-ikon', '+');
      b.appendChild(ikon);
      b.appendChild(buat('span', '', tpl.judul));
      b.addEventListener('click', function () { tambah(kalimat); });
      chips.push({ el: b, ikon: ikon, kalimat: kalimat });
      return b;
    }

    // Berkas lain (bawaan): berkas wajib layanan x masalah. Hanya untuk Berkas Tidak Lengkap (dipasang tepat di bawah chip-nya).
    function barisLain() {
      if (!daftarBerkas.length) return null;
      var lain = buat('div', 'ac-lain');
      lain.appendChild(buat('span', 'ac-label', 'Berkas lain:'));
      var sB = buat('select'); sB.setAttribute('aria-label', 'Pilih berkas');
      var o0 = buat('option', '', '— pilih berkas —'); o0.value = ''; sB.appendChild(o0);
      daftarBerkas.forEach(function (b, i) { var o = buat('option', '', b.label); o.value = String(i); sB.appendChild(o); });
      var sM = buat('select'); sM.setAttribute('aria-label', 'Pilih masalah');
      MASALAH.forEach(function (m) { var o = buat('option', '', m.label); o.value = m.kode; sM.appendChild(o); });
      var bT = buat('button', 'ac-tambah', '+ Tambah'); bT.type = 'button';
      bT.addEventListener('click', function () {
        if (sB.value === '') { toast('Pilih berkasnya dulu.', 'peringatan'); sB.focus(); return; }
        tambah(kalimatBerkas(daftarBerkas[Number(sB.value)].label, sM.value));
      });
      lain.appendChild(sB); lain.appendChild(sM); lain.appendChild(bT);
      return lain;
    }

    var templat = (data && Array.isArray(data.templat)) ? data.templat : [];
    [[BTL, 'Untuk Berkas Tidak Lengkap'], [TMS, 'Untuk Tidak Memenuhi Syarat']].forEach(function (g) {
      var daftar = templat.filter(function (t) { return tersedia(t, layanan, g[0]); });
      if (g[0] === TMS && !daftar.length) return;      // Tidak Memenuhi Syarat belum dipakai: tampil hanya bila sudah ada templatnya
      w.appendChild(buat('div', 'ac-label', g[1]));
      if (!daftar.length) {
        w.appendChild(buat('div', 'ac-kosong', 'Belum ada templat untuk layanan ini. Tambahkan lewat tombol ⚙ Kelola' + (g[0] === BTL && daftarBerkas.length ? ', atau pilih "Berkas lain" di bawah.' : '.')));
      } else {
        var baris = buat('div', 'ac-chips');
        daftar.forEach(function (t) { baris.appendChild(buatChip(g[0], t)); });
        w.appendChild(baris);
      }
      if (g[0] === BTL) { var lain = barisLain(); if (lain) w.appendChild(lain); }
    });


    bBersih.addEventListener('click', function () {
      var t = $(ID_TA);
      if (!t || !t.value.trim()) return;
      var kosongkan = function () { t.value = ''; t.style.height = ''; t.dispatchEvent(new Event('input', { bubbles: true })); t.focus(); segarkan(); };
      if (typeof konfirmasiAksi === 'function') {
        konfirmasiAksi({ judul: 'Kosongkan keterangan?', pesan: 'Seluruh isi kotak keterangan akan dihapus.', tipe: 'warning', teksKonfirmasi: 'Kosongkan' })
          .then(function (ya) { if (ya) kosongkan(); });
      } else kosongkan();
    });
    bKelola.addEventListener('click', function () {
      bKelola.disabled = true;
      muatSkripKelola().then(function () {
        bKelola.disabled = false;
        window.djpmTemplatKelola.buka({
          setelahTutup: function (berubah) {
            if (!berubah) return;
            cache = null;
            var w2 = $(ID_WADAH);
            if (!w2) return;
            ambil(true).then(function (data2) { if (w2.isConnected) gambar(w2, data2, layanan, d); }).catch(function (e) { if (w2.isConnected) gambarGalat(w2, e, d); });
          }
        });
      }).catch(function (e) { bKelola.disabled = false; toast((e && e.message) || 'Layar Kelola gagal dimuat.', 'gagal'); });
    });

    if (taDengar && fnDengar) taDengar.removeEventListener('input', fnDengar);
    taDengar = ta; fnDengar = segarkan;
    if (ta) ta.addEventListener('input', segarkan);
    segarkan();
  }

  window.djpmTemplatAlasan = {
    html: html,
    pasang: pasang,
    // dipakai layar Kelola agar cache modul ini ikut dibuang
    buangCache: function () { cache = null; cacheToken = ''; },
    _uji: { gabung: gabung, sudahAda: sudahAda, isiKalimat: isiKalimat, kalimatBerkas: kalimatBerkas, namaBerkas: namaBerkas, tersedia: tersedia, pecah: pecah, MASALAH: MASALAH }
  };
})();
