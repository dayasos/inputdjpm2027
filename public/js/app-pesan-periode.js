/**
 * public/js/app-pesan-periode.js
 * Sisi PENGGUNA (Kecamatan, Kemenag, MUI) untuk timer penutupan periode input dan Pesan Admin Utama:
 *   - banner hitung mundur (mulai H-3; biru > 24 jam, kuning <= 24 jam, merah <= 1 jam) + toast bertahap
 *   - penguncian otomatis tepat waktu TANPA refresh (status diambil ulang dari server, bukan dari jam HP)
 *   - kotak "Pesan dari Admin Utama" di modal penutupan + modal pesan untuk pesan lain, tombol Mengerti
 *   - izin unggah berkas (mulaiUnggahBerkas) sebelum unggah ke Drive, dasar masa tenggang 5 menit
 * Rancangan: plans/plan-timer-tutup-periode-input.md (§8.2, §8.3). Teks pesan SELALU lewat textContent.
 *
 * Semua pembacaan status memakai aksi alias `ambilStatusPeriode` yang TIDAK di-cache bridge, sehingga
 * `waktuServer` selalu segar dan tidak perlu membuang cache (yang akan memicu pemeriksaan berantai).
 */
(function () {
  'use strict';

  var MS_JAM = 3600000;
  var MS_HARI = 24 * MS_JAM;
  var BATAS_BANNER = 3 * MS_HARI;                    // banner mulai H-3
  var KUNCI_DRAF = 'djpm_form_draft_2027';           // draf formulir lokal (app-transaksi.js)
  var JEDA_ULANG = [0, 1500, 4000, 10000, 30000];    // percobaan ulang saat hitung mundur habis

  // Versi skrip ini (?v=...) dipakai juga untuk memuat skrip admin, jadi menaikkan satu angka di index.html
  // sudah cukup untuk membuang cache keduanya.
  var VERSI = '';
  try { VERSI = ((document.currentScript && /[?&]v=([^&]+)/.exec(document.currentScript.src)) || [])[1] || ''; } catch (_e) { VERSI = ''; }

  var NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // Semua perhitungan waktu tampilan dilakukan di WIB (UTC+7), apa pun zona waktu perangkat.
  function komponenWIB(tanggal) {
    var w = new Date(tanggal.getTime() + 7 * MS_JAM);
    return { y: w.getUTCFullYear(), mo: w.getUTCMonth(), d: w.getUTCDate(), h: w.getUTCHours(), mi: w.getUTCMinutes(), s: w.getUTCSeconds(), hari: w.getUTCDay() };
  }
  /** "Senin, 30 November 2026 pukul 23.59 WIB" */
  function fmtPanjang(iso) {
    var t = new Date(iso);
    if (isNaN(t.getTime())) return '';
    var k = komponenWIB(t);
    return NAMA_HARI[k.hari] + ', ' + k.d + ' ' + NAMA_BULAN[k.mo] + ' ' + k.y + ' pukul ' + pad(k.h) + '.' + pad(k.mi) + ' WIB';
  }
  /** "2 hari 04:12:09" / "04:12:09" */
  function fmtSisa(ms) {
    if (ms <= 0) return 'Sedang diproses…';
    var total = Math.floor(ms / 1000);
    var hari = Math.floor(total / 86400);
    var jam = Math.floor((total % 86400) / 3600);
    var mnt = Math.floor((total % 3600) / 60);
    var dtk = total % 60;
    return (hari > 0 ? hari + ' hari ' : '') + pad(jam) + ':' + pad(mnt) + ':' + pad(dtk);
  }

  /**
   * Tampilkan isi pesan sebagai TEKS. Hanya alamat https:// yang dijadikan tautan, dibuat lewat
   * createElement (bukan innerHTML) dengan rel="noopener noreferrer". Dipakai juga oleh skrip admin.
   */
  function renderIsi(el, teks) {
    el.textContent = '';
    var isi = teks == null ? '' : String(teks);
    var re = /https:\/\/[^\s<>"'`]+/g;
    var akhir = 0, m;
    while ((m = re.exec(isi)) !== null) {
      var url = m[0], sisa = '';
      var tutup = /[.,;:!?)\]]+$/.exec(url);
      if (tutup) { sisa = tutup[0]; url = url.slice(0, url.length - sisa.length); }
      el.appendChild(document.createTextNode(isi.slice(akhir, m.index)));
      var sah = false;
      try { sah = new URL(url).protocol === 'https:'; } catch (_e) { sah = false; }
      if (sah) {
        var a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'text-sky-700 underline break-all';
        a.textContent = url;
        el.appendChild(a);
        if (sisa) el.appendChild(document.createTextNode(sisa));
      } else {
        el.appendChild(document.createTextNode(m[0]));
      }
      akhir = m.index + m[0].length;
    }
    el.appendChild(document.createTextNode(isi.slice(akhir)));
  }
  // Sumber tunggal untuk skrip admin (app-jadwal-pesan.js), yang dimuat malas hanya untuk UTAMA.
  window.djpmRenderIsiPesan = renderIsi;
  window.djpmWaktu = { komponenWIB: komponenWIB, panjangWIB: fmtPanjang, sisa: fmtSisa };

  function $(id) { return document.getElementById(id); }
  // Kunci penanda disertai username: satu tab bisa dipakai bergantian beberapa akun, dan penanda
  // "sudah dibaca" milik akun A tidak boleh menyembunyikan pesan dari akun B.
  function kunciU(k) { return k + '@' + ((typeof dataPengguna !== 'undefined' && dataPengguna && dataPengguna.username) || ''); }
  function simpan(k, v) { try { sessionStorage.setItem(kunciU(k), v); } catch (_e) { /* mode privat / diblokir */ } }
  function baca(k) { try { return sessionStorage.getItem(kunciU(k)); } catch (_e) { return null; } }
  function bacaMentah(k) { try { return sessionStorage.getItem(k); } catch (_e) { return null; } }
  function toast(pesan, jenis, durasi) {
    if (typeof tampilkanToast === 'function') tampilkanToast(pesan, jenis || 'info', { durasi: durasi || 6000 });
  }
  function panggil(aksi, args) {
    return new Promise(function (resolve, reject) {
      google.script.run
        .withSuccessHandler(function (r) { resolve(r); })
        .withFailureHandler(function (e) { reject(e); })[aksi].apply(null, args);
    });
  }
  function isiTeks(el, teks) { if (el) el.textContent = teks == null ? '' : String(teks); }

  // ---------------------------------------------------------------------------------------------
  // Keadaan
  // ---------------------------------------------------------------------------------------------
  var st = null;               // respons ambilStatusPeriode terakhir
  var selisihMs = 0;           // jam server - jam perangkat, dari respons SEGAR
  var timerTik = null;
  var timerDebounce = null;
  var sedangSinkron = false;
  var antrean = false;
  var dalamHook = false;       // true saat modul ini sendiri memanggil terapkanHakAkses
  var kunciTerakhir = '';      // identitas penutupan terakhir yang dilihat (untuk "sekali per sesi")
  var percobaan = {};          // kunci jadwal -> { n, terakhir } untuk penguncian saat hitung mundur habis
  var pesanSedangTampil = null;

  function role() { return (typeof dataPengguna !== 'undefined' && dataPengguna) ? dataPengguna.role : ''; }
  function peranTerbatas() {
    return typeof dataPengguna !== 'undefined' && !!dataPengguna && !!dataPengguna.token && !!dataPengguna.role && dataPengguna.role !== 'UTAMA';
  }
  // Akun MUI ikut penutupan periode seperti Kecamatan/Kemenag sejak bisa menginput (2026-10-20): tidak ada
  // lagi pengecualian MUI di banner, toast, modal penutupan, maupun penguncian layar.
  function sekarangServer() { return Date.now() + selisihMs; }

  function sudahDibaca(p) { return !!(p && (p.sudahDibaca || baca('djpm_pesan_dibaca_' + p.id))); }
  function sudahDitutupSesi(p) { return !!(p && baca('djpm_pesan_x_' + p.id)); }
  function perluTampil(p) { return !!p && !sudahDibaca(p) && !sudahDitutupSesi(p); }

  // ---------------------------------------------------------------------------------------------
  // Pembacaan status dari server
  // ---------------------------------------------------------------------------------------------
  function sinkron() {
    if (!peranTerbatas()) { bersihkan(); return Promise.resolve(); }
    if (sedangSinkron) { antrean = true; return Promise.resolve(); }
    sedangSinkron = true;
    return panggil('ambilStatusPeriode', [dataPengguna.token]).then(function (r) {
      if (!r || !r.sukses) return;            // diam: pertahankan keadaan terakhir
      terakhirSinkron = Date.now();
      st = r;
      selisihMs = Date.parse(r.waktuServer) - Date.now();
      terapkanStatus();
    }).catch(function () { /* diam: koneksi putus, coba lagi di sinyal berikutnya */ }).then(function () {
      sedangSinkron = false;
      if (antrean) { antrean = false; setTimeout(sinkron, 300); }
    });
  }

  // Dipicu sinyal realtime / terapkanHakAkses: SEMUA pengguna menerimanya hampir bersamaan saat admin
  // mengubah jadwal atau pesan. Jeda acak 0,25-1,5 detik menyebar beban ke database (jauh, di Tokyo).
  function jadwalkanSinkron() {
    clearTimeout(timerDebounce);
    timerDebounce = setTimeout(sinkron, 250 + Math.random() * 1250);
  }

  // Pemicu "latar" (tab aktif lagi, online, berkala): lewati bila baru saja disinkronkan.
  var terakhirSinkron = 0;
  function sinkronBerkala() {
    if (!peranTerbatas() || Date.now() - terakhirSinkron < 20000) return;
    sinkron();
  }

  function bersihkan() {
    st = null;
    var b = $('banner-hitung-mundur');
    if (b) b.classList.add('hidden');
    berhentiTik();
  }

  function terapkanStatus() {
    // Samakan penguncian layar dengan status server (mis. jadwal tutup baru saja berjalan, atau dibuka lagi).
    if (typeof terapkanHakAkses === 'function' && typeof inputDitutupGlobal !== 'undefined' &&
      !!st.ditutup !== !!inputDitutupGlobal) {
      // Buang cache lokal 'setelan' (tanpa disiarkan) SEKALI saat status berubah: jalur lama (periksaStatusAkses)
      // membaca statusInputKecKem yang di-cache sampai 2 menit, jadi tanpa ini ia bisa sesaat membuka kunci lagi
      // dengan data usang sebelum jalur ini mengunci ulang (layar berkedip). Tidak berantai: setelah kunci
      // selaras dengan server, cabang ini tidak dijalankan lagi.
      if (window.djpmCache && typeof window.djpmCache.invalidate === 'function') window.djpmCache.invalidate(['setelan'], false);
      dalamHook = true;
      try { terapkanHakAkses(dataPengguna.role, dataPengguna.kecamatan, !!st.ditutup); } finally { dalamHook = false; }
    }
    renderBannerHitung();
    renderBannerTutupPesan();
    mungkinTampilkanPesan();
    aturTik();
  }

  // ---------------------------------------------------------------------------------------------
  // Banner hitung mundur
  // ---------------------------------------------------------------------------------------------
  var TINGKAT = {
    biru: { banner: 'mb-4 rounded-xl px-4 py-3 border flex items-start gap-3 bg-sky-50 border-sky-200 text-sky-900', ikon: 'w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 bg-sky-100 border-sky-200 text-sky-700' },
    kuning: { banner: 'mb-4 rounded-xl px-4 py-3 border flex items-start gap-3 bg-amber-50 border-amber-200 text-amber-900', ikon: 'w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 bg-amber-100 border-amber-200 text-amber-700' },
    merah: { banner: 'mb-4 rounded-xl px-4 py-3 border flex items-start gap-3 bg-red-50 border-red-200 text-red-900', ikon: 'w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 bg-red-100 border-red-200 text-red-700' },
  };

  function buatBanner() {
    var b = $('banner-hitung-mundur');
    if (b) return b;
    var utama = document.querySelector('main');
    if (!utama) return null;
    b = document.createElement('div');
    b.id = 'banner-hitung-mundur';
    b.setAttribute('role', 'status');
    b.setAttribute('aria-live', 'polite');
    b.className = 'hidden';
    b.innerHTML = '' +
      '<div id="hm-ikon"><svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>' +
      '<div class="flex-1 min-w-0">' +
      '  <p class="text-sm font-bold leading-tight">Periode input ditutup dalam <span id="hm-sisa" class="tabular-nums" aria-hidden="true"></span></p>' +
      '  <span id="hm-sr" class="sr-only"></span>' +
      '  <p id="hm-waktu" class="text-xs leading-relaxed mt-0.5"></p>' +
      '  <p id="hm-pesan" class="hidden text-xs mt-1.5 break-words"><span class="font-semibold">Pesan Admin Utama:</span> <span id="hm-judul"></span> <button type="button" id="hm-baca" class="underline font-semibold">Baca pesan</button></p>' +
      '</div>';
    utama.insertBefore(b, utama.firstChild);
    $('hm-baca').addEventListener('click', function () { if (st && st.pesan) tampilkanPesanModal(st.pesan, true); });
    return b;
  }

  function levelDari(sisa) { return sisa <= MS_JAM ? 'merah' : (sisa <= MS_HARI ? 'kuning' : 'biru'); }
  var levelSekarang = '';
  var menitSr = -1;

  function renderBannerHitung() {
    var j = st && st.jadwalTutup;
    var tampil = !!st && !st.ditutup && !!j && peranTerbatas();
    var sisa = tampil ? Date.parse(j.waktuISO) - sekarangServer() : 0;
    if (!tampil || sisa <= 0 || sisa > BATAS_BANNER) {
      var ada = $('banner-hitung-mundur');
      if (ada) ada.classList.add('hidden');
      levelSekarang = '';
      return;
    }
    var b = buatBanner();
    if (!b) return;
    var level = levelDari(sisa);
    if (level !== levelSekarang) {
      b.className = TINGKAT[level].banner;
      $('hm-ikon').className = TINGKAT[level].ikon;
      levelSekarang = level;
    }
    isiTeks($('hm-sisa'), fmtSisa(sisa));
    isiTeks($('hm-waktu'), fmtPanjang(j.waktuISO) + '. Selesaikan dan kirim data Anda sebelum waktu habis.');

    var menit = Math.floor(sisa / 60000);
    if (menit !== menitSr) {            // pembaca layar: perbarui per menit, bukan per detik
      menitSr = menit;
      var hari = Math.floor(menit / 1440), jam = Math.floor((menit % 1440) / 60), mnt = menit % 60;
      isiTeks($('hm-sr'), 'Periode input ditutup dalam ' + (hari ? hari + ' hari ' : '') + (jam ? jam + ' jam ' : '') + mnt + ' menit.');
    }

    var p = st.pesan;
    var tampilPesan = !!p && (p.tipe === 'TUTUP' || p.tipe === 'INFO');
    $('hm-pesan').classList.toggle('hidden', !tampilPesan);
    if (tampilPesan) isiTeks($('hm-judul'), p.judul);
    b.classList.remove('hidden');
  }

  // ---------------------------------------------------------------------------------------------
  // Toast bertahap: H-1, 1 jam, 15 menit. Sekali per sesi per jadwal; yang sudah terlewati saat
  // login tidak ditumpuk (hanya yang paling mendesak).
  // ---------------------------------------------------------------------------------------------
  var AMBANG = [
    { ms: MS_HARI, id: '24j', teks: 'Periode input akan ditutup dalam kurang dari 24 jam.', durasi: 8000 },
    { ms: MS_JAM, id: '1j', teks: 'Periode input akan ditutup dalam kurang dari 1 jam.', durasi: 10000 },
    { ms: 15 * 60000, id: '15m', teks: 'Periode input akan ditutup dalam kurang dari 15 menit!', durasi: 14000 },
  ];

  function cekToast(sisa, kunciJadwal) {
    if (sisa <= 0) return;
    var terlewat = null;
    for (var i = 0; i < AMBANG.length; i++) if (sisa <= AMBANG[i].ms) terlewat = AMBANG[i];
    if (!terlewat) return;
    var kunci = 'djpm_toast_tutup_' + kunciJadwal + '_' + terlewat.id;
    if (baca(kunci)) return;
    for (var k = 0; k < AMBANG.length; k++) {
      if (AMBANG[k].ms >= terlewat.ms) simpan('djpm_toast_tutup_' + kunciJadwal + '_' + AMBANG[k].id, '1');
    }
    toast(terlewat.teks + ' Selesaikan dan kirim data Anda sebelum ' + fmtPanjang(kunciJadwal) + '.', 'peringatan', terlewat.durasi);
  }

  // ---------------------------------------------------------------------------------------------
  // Detak 1 detik: hitung mundur, toast, dan penguncian saat waktu habis
  // ---------------------------------------------------------------------------------------------
  function aturTik() {
    var perlu = peranTerbatas() && !!st && !st.ditutup && !!st.jadwalTutup && !document.hidden;
    if (perlu && !timerTik) timerTik = setInterval(tik, 1000);
    if (!perlu) berhentiTik();
  }
  function berhentiTik() {
    if (timerTik) { clearInterval(timerTik); timerTik = null; }
  }

  function tik() {
    if (!peranTerbatas()) { bersihkan(); return; }
    if (!st || st.ditutup || !st.jadwalTutup) { berhentiTik(); return; }
    var kunci = st.jadwalTutup.waktuISO;
    var sisa = Date.parse(kunci) - sekarangServer();
    renderBannerHitung();
    cekToast(sisa, kunci);
    if (sisa > 0) return;

    // Waktu habis menurut jam SERVER. Ambil ulang status; bila server belum menutup (selisih
    // jam beberapa ratus milidetik), coba lagi dengan jeda bertahap.
    var p = percobaan[kunci] || (percobaan[kunci] = { n: 0, terakhir: 0 });
    var jeda = JEDA_ULANG[Math.min(p.n, JEDA_ULANG.length - 1)];
    if (p.n < 12 && Date.now() - p.terakhir >= jeda && !sedangSinkron) {
      p.n++;
      p.terakhir = Date.now();
      sinkron();
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Banner "Periode Input Telah Ditutup" yang sudah ada: tambah cuplikan pesan + "Baca lagi"
  // ---------------------------------------------------------------------------------------------
  function renderBannerTutupPesan() {
    var banner = $('banner-tutup');
    if (!banner) return;
    var p = $('banner-tutup-pesan');
    if (!p) {
      var teks = banner.querySelector('.flex-1');
      if (!teks) return;
      p = document.createElement('p');
      p.id = 'banner-tutup-pesan';
      p.className = 'hidden text-xs text-amber-900 mt-1.5 break-words';
      p.innerHTML = '<span class="font-semibold">Pesan Admin Utama:</span> <span id="bt-judul"></span> <button type="button" id="bt-baca" class="underline font-semibold">Baca lagi</button>';
      teks.appendChild(p);
      $('bt-baca').addEventListener('click', function () { tampilkanModalTutupPeriode(null, true); });
    }
    var tampil = !!st && !!st.pesan && !!st.ditutup;
    p.classList.toggle('hidden', !tampil);
    if (tampil) isiTeks($('bt-judul'), st.pesan.judul);
  }

  // ---------------------------------------------------------------------------------------------
  // Modal penutupan yang sudah ada (#modal-notif-tutup): kotak pesan + catatan draf + meta timer
  // ---------------------------------------------------------------------------------------------
  function pasangKotakModalTutup() {
    if ($('notif-tutup-pesan')) return;
    var meta = $('notif-tutup-meta');
    if (!meta || !meta.parentNode) return;
    var kotak = document.createElement('div');
    kotak.id = 'notif-tutup-pesan';
    kotak.className = 'hidden bg-white border border-amber-300 rounded-xl px-4 py-3 mb-3 space-y-1.5';
    kotak.innerHTML = '' +
      '<p class="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Pesan dari Admin Utama</p>' +
      '<p id="ntp-judul" class="text-sm font-bold text-slate-800 break-words"></p>' +
      '<div id="ntp-isi" class="text-sm text-slate-700 leading-relaxed whitespace-pre-line break-words"></div>' +
      '<p id="ntp-oleh" class="text-[11px] text-slate-500"></p>';
    var draf = document.createElement('div');
    draf.id = 'notif-tutup-draf';
    draf.className = 'hidden text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 mb-3 leading-relaxed';
    draf.textContent = 'Isian formulir yang belum Anda kirim masih tersimpan sementara di perangkat ini, tetapi BELUM terkirim ke server. Hubungi Admin Utama Dinas Sosial Kota Medan bila data tersebut perlu dimasukkan.';
    meta.parentNode.insertBefore(kotak, meta);
    meta.parentNode.insertBefore(draf, meta);
  }

  function kunciPenutupan(res) {
    if (res && res.terakhirUbah) return (res.terakhirUbah.waktu || '') + '|' + (res.terakhirUbah.username || '');
    return kunciTerakhir;
  }

  function modalTutupTerbuka() {
    var m = $('modal-notif-tutup');
    return !!m && !m.classList.contains('hidden');
  }

  function isiModalTutup(res) {
    pasangKotakModalTutup();
    var p = (st && st.pesan) || (res && res.pesan) || null;
    var kotak = $('notif-tutup-pesan');
    if (kotak) {
      kotak.classList.toggle('hidden', !p);
      if (p) {
        isiTeks($('ntp-judul'), p.judul);
        renderIsi($('ntp-isi'), p.isi);
        isiTeks($('ntp-oleh'), '— ' + p.oleh + (p.waktuTerbit ? ', ' + p.waktuTerbit + ' WIB' : ''));
      }
    }
    pesanSedangTampil = p;

    // Penutupan oleh jadwal otomatis: sebut nama pengatur jadwalnya.
    var meta = $('notif-tutup-meta');
    var tu = res && res.terakhirUbah;
    if (meta && tu && tu.waktu && tu.username === 'SISTEM (TIMER)') {
      var m = /oleh (.+)$/.exec(tu.keterangan || '');
      var esk = typeof esc === 'function' ? esc : function (x) { return String(x); };
      meta.classList.remove('hidden');
      meta.innerHTML = '<div class="flex justify-between gap-3 text-[11px]"><span class="text-slate-500 font-semibold">Ditutup pada:</span><span class="text-slate-800 font-bold text-right">' + esk(tu.waktu) + '</span></div>' +
        '<div class="flex justify-between gap-3 text-[11px]"><span class="text-slate-500 font-semibold">Penutupan:</span><span class="text-slate-800 font-bold text-right">Otomatis' + (m ? ' (dijadwalkan ' + esk(m[1]) + ')' : '') + '</span></div>';
    }

    var draf = $('notif-tutup-draf');
    if (draf) draf.classList.toggle('hidden', !bacaMentah(KUNCI_DRAF));
  }

  /**
   * Dipanggil terapkanHakAkses() (app-core.js) saat periode tertutup, menggantikan pembukaan modal
   * langsung. Dengan `paksa` (tombol "Baca lagi") modal selalu dibuka. Tanpa `paksa`, modal hanya
   * dibuka sekali per sesi per penutupan, atau bila ada pesan yang belum dibaca.
   */
  function tampilkanModalTutupPeriode(res, paksa) {
    var modal = $('modal-notif-tutup');
    if (!modal) return;
    if (res) kunciTerakhir = kunciPenutupan(res);
    if (!paksa) {
      if (modalTutupTerbuka()) { isiModalTutup(res); return; }
      var p = (st && st.pesan) || (res && res.pesan) || null;
      if (p) { if (!perluTampil(p)) return; }
      else if (kunciTerakhir && baca('djpm_tutup_dilihat') === kunciTerakhir) return;
    }
    isiModalTutup(res);
    modal.classList.remove('hidden');
  }
  window.tampilkanModalTutupPeriode = tampilkanModalTutupPeriode;

  function tandaiDibaca(p) {
    if (!p) return Promise.resolve();
    simpan('djpm_pesan_dibaca_' + p.id, '1');
    if (st && st.pesan && st.pesan.id === p.id) st.pesan.sudahDibaca = true;
    return panggil('tandaiPesanDibaca', [dataPengguna.token, p.id]).then(function (r) {
      if (!r || !r.sukses) toast('Pesan belum tercatat sebagai dibaca. Pesan mungkin tampil lagi saat Anda masuk kembali.', 'peringatan');
    }, function () {
      toast('Pesan belum tercatat sebagai dibaca (koneksi bermasalah).', 'peringatan');
    });
  }

  // "Mengerti" pada modal penutupan: catat dibaca di server, lalu sembunyikan.
  window.mengertiModalNotifTutup = function () {
    var p = pesanSedangTampil;
    if (kunciTerakhir) simpan('djpm_tutup_dilihat', kunciTerakhir);
    var m = $('modal-notif-tutup');
    if (m) m.classList.add('hidden');
    tandaiDibaca(p);
    pesanSedangTampil = null;
  };

  // Tombol X: sembunyikan saja. TIDAK menandai dibaca (pesan akan tampil lagi di sesi berikutnya),
  // tetapi tidak dimunculkan ulang oleh penyegaran realtime selama sesi ini.
  window.tutupModalNotifTutup = function () {
    var m = $('modal-notif-tutup');
    if (m) m.classList.add('hidden');
    if (kunciTerakhir) simpan('djpm_tutup_dilihat', kunciTerakhir);
    if (pesanSedangTampil) simpan('djpm_pesan_x_' + pesanSedangTampil.id, '1');
    pesanSedangTampil = null;
  };

  // ---------------------------------------------------------------------------------------------
  // Modal pesan umum (periode masih terbuka, pesan INFO/BUKA)
  // ---------------------------------------------------------------------------------------------
  var GAYA_PESAN = {
    TUTUP: { header: 'px-5 py-4 flex items-start gap-3 shrink-0 bg-amber-500', tombol: 'w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm rounded-xl transition', sub: 'Mengenai penutupan periode input' },
    BUKA: { header: 'px-5 py-4 flex items-start gap-3 shrink-0 bg-emerald-600', tombol: 'w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-xl transition', sub: 'Periode input dibuka' },
    INFO: { header: 'px-5 py-4 flex items-start gap-3 shrink-0 bg-sky-600', tombol: 'w-full py-2.5 bg-sky-700 hover:bg-sky-800 text-white font-bold text-sm rounded-xl transition', sub: 'Informasi dari Admin Utama' },
  };

  function buatModalPesan() {
    var m = $('modal-pesan-admin');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'modal-pesan-admin';
    m.className = 'hidden fixed inset-0 z-[370] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4';
    m.innerHTML = '' +
      '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden max-h-[92vh] max-h-[92dvh] flex flex-col">' +
      '  <div id="pa-header" class="px-5 py-4 flex items-start gap-3 shrink-0 bg-sky-600">' +
      '    <div class="min-w-0 flex-1"><div id="pa-judul" class="text-white font-bold text-sm tracking-wide uppercase break-words"></div><div id="pa-sub" class="text-white/80 text-xs mt-0.5"></div></div>' +
      '    <button type="button" id="pa-x" data-modal-close aria-label="Tutup" class="text-white/90 hover:text-white hover:bg-white/10 p-1.5 rounded-lg text-2xl leading-none shrink-0">&times;</button>' +
      '  </div>' +
      '  <div class="px-5 pt-4 pb-2 overflow-y-auto overscroll-contain">' +
      '    <div class="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Pesan dari Admin Utama</div>' +
      '    <div id="pa-isi" class="text-sm text-slate-800 leading-relaxed whitespace-pre-line break-words"></div>' +
      '    <div id="pa-oleh" class="text-[11px] text-slate-500 mt-3"></div>' +
      '  </div>' +
      '  <div class="px-5 pb-5 pt-3 shrink-0"><button type="button" id="pa-mengerti" class="w-full py-2.5 bg-sky-700 text-white font-bold text-sm rounded-xl transition">Mengerti</button></div>' +
      '</div>';
    document.body.appendChild(m);
    $('pa-x').addEventListener('click', function () {
      m.classList.add('hidden');
      if (pesanSedangTampil) simpan('djpm_pesan_x_' + pesanSedangTampil.id, '1');
      pesanSedangTampil = null;
    });
    $('pa-mengerti').addEventListener('click', function () {
      var p = pesanSedangTampil;
      m.classList.add('hidden');
      pesanSedangTampil = null;
      tandaiDibaca(p).then(function () { renderBannerHitung(); });
    });
    return m;
  }

  function tampilkanPesanModal(p, paksa) {
    if (!p) return;
    var m = buatModalPesan();
    if (!paksa && !m.classList.contains('hidden')) return;
    var gaya = GAYA_PESAN[p.tipe] || GAYA_PESAN.INFO;
    $('pa-header').className = gaya.header;
    $('pa-mengerti').className = gaya.tombol;
    isiTeks($('pa-judul'), p.judul);
    isiTeks($('pa-sub'), gaya.sub);
    renderIsi($('pa-isi'), p.isi);
    isiTeks($('pa-oleh'), '— ' + p.oleh + (p.waktuTerbit ? ', ' + p.waktuTerbit + ' WIB' : ''));
    pesanSedangTampil = p;
    m.classList.remove('hidden');
  }

  function mungkinTampilkanPesan() {
    var p = st && st.pesan;
    if (!perluTampil(p)) return;
    if (st.ditutup) {
      // Periode tertutup: pesan dibawa modal penutupan yang sudah ada.
      if (!modalTutupTerbuka()) tampilkanModalTutupPeriode(null, false);
    } else if (p.tipe !== 'TUTUP') {
      // Pesan penutupan hanya jadi banner sebelum periode ditutup; INFO/BUKA langsung tampil.
      tampilkanPesanModal(p, false);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Izin unggah berkas (dipanggil app-transaksi.js lewat unggahBerkasDenganIzin)
  // ---------------------------------------------------------------------------------------------
  function mulaiUnggah() {
    if (typeof dataPengguna === 'undefined' || !dataPengguna || !dataPengguna.token) return Promise.resolve({ sukses: true });
    return panggil('mulaiUnggahBerkas', [dataPengguna.token]).then(function (r) {
      // Hanya penolakan resmi dari aturan periode ({sukses:false, pesan}) yang menghalangi. Galat teknis
      // (ada field `error`, mis. server belum diperbarui dan menjawab "Aksi tidak diizinkan") tidak boleh
      // mematikan unggah berkas, apa pun urutan deploy frontend dan fungsi.
      if (r && r.sukses === false && !r.error) return { sukses: false, pesan: r.pesan || 'Periode input sudah ditutup.' };
      if (r && r.tenggang) toast('Periode input baru saja berakhir. Kiriman Anda masih diterima dalam masa tenggang (maksimal 5 menit).', 'peringatan', 9000);
      return { sukses: true };
    }, function (e) {
      // Gagal menghubungi server: jangan menghalangi pengguna di sini. Penyimpanan data tetap
      // diperiksa penuh di server, jadi ini tidak melonggarkan penutupan.
      if (window.console) console.warn('mulaiUnggahBerkas gagal, dilanjutkan:', e);
      return { sukses: true };
    });
  }
  window.unggahBerkasDenganIzin = function (konteks, berkas) {
    return mulaiUnggah().then(function (izin) {
      if (!izin.sukses) return { sukses: false, pesan: izin.pesan };
      return unggahBerkasKeDriveGAS(konteks, berkas);
    });
  };

  // ---------------------------------------------------------------------------------------------
  // Pemicu: login/pemulihan sesi/penyegaran (lewat terapkanHakAkses), tab aktif lagi, online, berkala
  // ---------------------------------------------------------------------------------------------
  // Skrip khusus peran, dimuat malas setelah login. UTAMA: modal Jadwal & Pesan (±15 KB gzip), laporan PDF Dashboard
  // Progres (plans/plan-pdf-dashboard-progres.md), dan penanda "diinput oleh MUI", serta Verifikasi Massal per layanan. MUI: hanya penanda
  // (plans/plan-akun-mui-bisa-input.md). Peran lain tidak mengunduh satu pun. Gagal muat satu skrip tidak
  // memengaruhi yang lain, dan masing-masing dicoba lagi pada pemicu berikutnya.
  var SKRIP_PER_PERAN = {
    UTAMA: ['/js/app-jadwal-pesan.js', '/js/app-laporan-progres.js', '/js/app-capaian-input.js', '/js/app-penanda-mui.js', '/js/app-verifikasi-massal.js', '/js/app-cek-rumah-ibadah.js', '/js/app-templat-alasan.js', '/js/app-cek-alamat.js'],
    'GURU MAGHRIB MENGAJI': ['/js/app-cek-alamat.js'],
    MUI: ['/js/app-penanda-mui.js']
  };
  var skripAdminDimuat = {};
  function muatSkripAdmin() {
    var daftarSkrip = Object.prototype.hasOwnProperty.call(SKRIP_PER_PERAN, role()) ? SKRIP_PER_PERAN[role()] : null;
    if (!daftarSkrip || typeof dataPengguna === 'undefined' || !dataPengguna.token) return;
    daftarSkrip.forEach(function (url) {
      if (skripAdminDimuat[url]) return;
      skripAdminDimuat[url] = true;
      var s = document.createElement('script');
      s.src = url + (VERSI ? '?v=' + VERSI : '');
      s.async = true;
      s.onerror = function () { skripAdminDimuat[url] = false; };
      document.head.appendChild(s);
    });
  }

  // Cover berkas penerima (plans/plan-cover-berkas-penerima.md): dimuat malas, hanya saat Data Detail dibuka
  // (semua peran yang punya tombol Data Detail; MUI tidak). Gagal muat tidak mengganggu Data Detail.
  var coverBerkasDimuat = false;
  function muatCoverBerkas() {
    if (coverBerkasDimuat || role() === 'MUI' || typeof dataPengguna === 'undefined' || !dataPengguna || !dataPengguna.token) return;
    coverBerkasDimuat = true;
    var s = document.createElement('script');
    s.src = '/js/app-cover-berkas.js' + (VERSI ? '?v=' + VERSI : '');
    s.async = true;
    s.onerror = function () { coverBerkasDimuat = false; };
    document.head.appendChild(s);
  }
  if (typeof window.tampilkanDataDetail === 'function' && !window.tampilkanDataDetail.__djpmCover) {
    var asliDataDetail = window.tampilkanDataDetail;
    var bungkusDataDetail = function () {
      var hasil = asliDataDetail.apply(this, arguments);
      try { muatCoverBerkas(); } catch (_e) { /* cover opsional */ }
      return hasil;
    };
    bungkusDataDetail.__djpmCover = true;
    window.tampilkanDataDetail = bungkusDataDetail;
  }

  function sesiDiterapkan() {
    muatSkripAdmin();
    if (!dalamHook) jadwalkanSinkron();
  }

  if (typeof terapkanHakAkses === 'function' && !terapkanHakAkses.__djpmPesanPeriode) {
    var asli = terapkanHakAkses;
    var bungkus = function () {
      var hasil = asli.apply(this, arguments);
      sesiDiterapkan();
      return hasil;
    };
    bungkus.__djpmPesanPeriode = true;
    window.terapkanHakAkses = bungkus;
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { berhentiTik(); return; }
    // HP yang tertidur menghentikan penghitung: periksa ulang setelah aktif kembali.
    sinkronBerkala();
  });
  window.addEventListener('online', sinkronBerkala);
  setInterval(function () { if (!document.hidden) sinkronBerkala(); }, 5 * 60000);

  // Halaman dimuat ulang dengan sesi tersimpan: app-core sudah memanggil terapkanHakAkses (optimistik)
  // SEBELUM skrip ini terpasang, jadi picu sekali di sini.
  if (typeof dataPengguna !== 'undefined' && dataPengguna && dataPengguna.token) sesiDiterapkan();
})();
