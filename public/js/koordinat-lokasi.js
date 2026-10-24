/**
 * public/js/koordinat-lokasi.js
 * Penerjemah "koordinat lokasi" untuk layanan Guru (Maghrib Mengaji, Sekolah Minggu/Buddha/Hindu/Kong Hu Chu).
 * Rancangan: plans/plan-koordinat-lokasi-pintar.md
 *
 * Petugas boleh menempel BENTUK APA PUN dari Google Maps -- tautan, angka koordinat, derajat-menit-detik, atau Plus Code (hasil
 * "salin alamat") -- lalu aplikasi menerjemahkannya menjadi koordinat yang benar. Selain itu DITOLAK dengan petunjuk.
 *
 * BAGIAN INTI (di antara penanda KOORDINAT-INTI) adalah fungsi murni dan WAJIB identik dengan salinan server
 * supabase/functions/api/_shared/koordinat.ts. Jangan diubah sendiri-sendiri: ubah di sini lalu jalankan
 *     node scripts/sinkron-koordinat.js
 * (`--cek` hanya memeriksa kesamaan, dipakai di uji). Bagian sesudahnya (layar) hanya ada di berkas ini.
 */
(function (akar) {
  'use strict';

  // <<KOORDINAT-INTI
  var ALFABET = '23456789CFGHJMPQRVWX';
  var BATAS_MEDAN = { latMin: 3.35, latMax: 3.85, lngMin: 98.50, lngMax: 98.85 };
  var ACUAN_MEDAN = { lat: 3.5952, lng: 98.6722 };
  var MAKS_PANJANG = 2000; // batas masukan mentah (tautan Maps panjang bisa ratusan karakter)
  var MAKS_TAUTAN = 500; // batas tautan yang DISIMPAN; lebih panjang -> disimpan sebagai tautan koordinat ringkas
  var PETUNJUK = 'Cara paling mudah: buka Google Maps, tekan lama pada titik lokasi, pilih Bagikan, lalu Salin tautan dan tempel di sini.';

  // Karakter non-ASCII dibangun dari kode angka (bukan literal) supaya inti tetap ASCII murni dan aman terhadap pengodean berkas.
  var RE_SPASI_ANEH = new RegExp('[' + String.fromCharCode(0xA0, 0x200B) + '-' + String.fromCharCode(0x200D, 0x2060, 0xFEFF) + ']', 'g'); // NBSP, zero-width
  var RE_DERAJAT = new RegExp('[' + String.fromCharCode(0xB0, 0xBA, 0x2DA) + ']', 'g');   // tanda derajat dan mirip
  var RE_MENIT = new RegExp('[' + String.fromCharCode(0x2032, 0x2019, 0x2018, 0xB4) + '`]', 'g');   // tanda menit/apostrof
  var RE_DETIK = new RegExp('[' + String.fromCharCode(0x2033, 0x201D, 0x201C) + ']', 'g');   // tanda detik/kutip

  function hasil(ok, jenis, lat, lng, tautan, pesan) {
    return { ok: ok, jenis: jenis, lat: lat, lng: lng, tautan: tautan, pesan: pesan };
  }
  function tolak(pesan) { return hasil(false, '', null, null, '', pesan); }

  function bersihkan(t) {
    return String(t === null || t === undefined ? '' : t)
      .replace(RE_SPASI_ANEH, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function dalamMedan(lat, lng) {
    return lat >= BATAS_MEDAN.latMin && lat <= BATAS_MEDAN.latMax && lng >= BATAS_MEDAN.lngMin && lng <= BATAS_MEDAN.lngMax;
  }
  function tautanDariKoordinat(lat, lng) {
    return 'https://www.google.com/maps?q=' + lat.toFixed(6) + ',' + lng.toFixed(6);
  }
  // Koordinat sah (angka, rentang dunia) dan di Kota Medan -> hasil sukses; jika tidak -> penolakan dengan pesan.
  function terimaKoordinat(jenis, lat, lng, tautanAsli) {
    if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) {
      return tolak('Angka koordinat tidak valid. ' + PETUNJUK);
    }
    if (!dalamMedan(lat, lng)) {
      return tolak('Lokasi ' + lat.toFixed(5) + ', ' + lng.toFixed(5) + ' berada di luar Kota Medan. Periksa kembali lokasi tersebut.');
    }
    return hasil(true, jenis, lat, lng, tautanAsli || tautanDariKoordinat(lat, lng), '');
  }
  function angkaDesimal(s) {
    var x = String(s).replace(/\s+/g, '').replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(x)) return NaN;
    return parseFloat(x);
  }

  // ---- Plus Code (Open Location Code) -------------------------------------------------------------------------------
  function indeksAlfabet(c) { return ALFABET.indexOf(c); }
  // Kode LENGKAP (8+ karakter sebelum '+') -> titik tengah area; null bila tidak valid.
  function dekodePlus(kode) {
    var k = String(kode).toUpperCase().replace('+', '').replace(/0+$/, '');
    var n = Math.min(k.length, 10);
    if (n < 2 || n % 2 !== 0) return null;
    var lat = 0, lng = 0, i, d;
    for (i = 0; i < n; i += 2) {
      var res = 20 / Math.pow(20, i / 2);
      var dl = indeksAlfabet(k.charAt(i)), dg = indeksAlfabet(k.charAt(i + 1));
      if (dl < 0 || dg < 0) return null;
      if (i === 0 && (dl > 8 || dg > 17)) return null;
      lat += dl * res;
      lng += dg * res;
    }
    var tinggi = 20 / Math.pow(20, n / 2 - 1), lebar = tinggi;
    for (i = 10; i < k.length; i++) {
      d = indeksAlfabet(k.charAt(i));
      if (d < 0) return null;
      tinggi = tinggi / 5;
      lebar = lebar / 4;
      lat += Math.floor(d / 4) * tinggi;
      lng += (d % 4) * lebar;
    }
    return { lat: lat - 90 + tinggi / 2, lng: lng - 180 + lebar / 2 };
  }
  // Awalan kode (pasangan lintang-bujur) dari titik acuan, sepanjang `panjang` karakter (genap, 2..6).
  function awalanKode(lat, lng, panjang) {
    var la = lat + 90, lo = lng + 180, h = '', i;
    for (i = 0; i < panjang; i += 2) {
      var res = 20 / Math.pow(20, i / 2);
      var dl = Math.min(19, Math.floor(la / res + 1e-9)), dg = Math.min(19, Math.floor(lo / res + 1e-9));
      h += ALFABET.charAt(dl) + ALFABET.charAt(dg);
      la -= dl * res;
      lo -= dg * res;
    }
    return h;
  }
  // Kode PENDEK (mis. "MMPV+794") dipulihkan terhadap titik acuan terdekat (resep resmi OLC recoverNearest).
  function pulihkanPlus(kode, acuanLat, acuanLng) {
    var k = String(kode).toUpperCase();
    var posisi = k.indexOf('+');
    var pad = 8 - posisi;
    if (pad <= 0) return dekodePlus(k);
    var resolusi = Math.pow(20, 2 - pad / 2), setengah = resolusi / 2;
    var area = dekodePlus(awalanKode(acuanLat, acuanLng, pad) + k);
    if (!area) return null;
    var lat = area.lat, lng = area.lng;
    if (acuanLat + setengah < lat && lat - resolusi >= -90) lat -= resolusi;
    else if (acuanLat - setengah > lat && lat + resolusi <= 90) lat += resolusi;
    if (acuanLng + setengah < lng) lng -= resolusi;
    else if (acuanLng - setengah > lng) lng += resolusi;
    return { lat: lat, lng: lng };
  }
  function cariPlus(teks) {
    var t = teks.toUpperCase();
    var re = /([23456789CFGHJMPQRVWX]{4,8})\+([23456789CFGHJMPQRVWX]{2,6})/g;
    var m;
    while ((m = re.exec(t)) !== null) {
      var sebelum = t.charAt(m.index - 1), sesudah = t.charAt(m.index + m[0].length);
      if ((sebelum && /[0-9A-Z]/.test(sebelum)) || (sesudah && /[0-9A-Z+]/.test(sesudah))) continue;
      if (m[1].length !== 4 && m[1].length !== 6 && m[1].length !== 8) continue;
      return m[0];
    }
    return '';
  }

  // ---- Tautan Google Maps -------------------------------------------------------------------------------------------
  // Mengembalikan null bila teks tidak memuat tautan; selain itu { sah, hasil } (sah=false -> tautan ditolak).
  function bacaTautan(teks) {
    var m = teks.match(/https?:\/\/[^\s<>"']+/i);
    if (!m) return null;
    var url = m[0].replace(/[.,;:)\]}]+$/, '');
    var u;
    try { u = new URL(url); } catch (e) { return { sah: false, hasil: tolak('Tautan tidak valid. ' + PETUNJUK) }; }
    if (u.protocol !== 'https:' || u.username || u.password) {
      return { sah: false, hasil: tolak('Gunakan tautan https dari Google Maps. ' + PETUNJUK) };
    }
    var host = u.hostname.toLowerCase();
    var jalur = u.pathname || '/';
    if (((host === 'maps.app.goo.gl' && jalur.length > 1) || (host === 'goo.gl' && /^\/maps/i.test(jalur))) && url.length <= MAKS_TAUTAN) {
      return { sah: true, hasil: hasil(true, 'tautan-maps-pendek', null, null, url, '') };
    }
    var hostPanjang = /^(www\.)?google\.(com|co\.id)$/.test(host) && /^\/maps/i.test(jalur);
    if (hostPanjang || /^maps\.google\.(com|co\.id)$/.test(host)) {
      var teksUrl = url;
      try { teksUrl = decodeURIComponent(url); } catch (e2) { teksUrl = url; }
      var p = teksUrl.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) || teksUrl.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      var lat = NaN, lng = NaN;
      if (p) { lat = parseFloat(p[1]); lng = parseFloat(p[2]); }
      else {
        var kunci = ['q', 'll', 'query', 'center', 'destination'], i;
        for (i = 0; i < kunci.length && !p; i++) {
          var v = u.searchParams.get(kunci[i]);
          var mm = v ? v.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/) : null;
          if (mm) { p = mm; lat = parseFloat(mm[1]); lng = parseFloat(mm[2]); }
        }
      }
      if (p) {
        var h = terimaKoordinat('tautan-maps', lat, lng, url.length <= MAKS_TAUTAN ? url : '');
        return { sah: h.ok, hasil: h };
      }
      if (url.length > MAKS_TAUTAN) return { sah: false, hasil: tolak('Tautan terlalu panjang dan koordinatnya tidak terbaca. ' + PETUNJUK) };
      return { sah: true, hasil: hasil(true, 'tautan-maps', null, null, url, '') };
    }
    var asal = host.indexOf('share.google') >= 0
      ? 'Tautan share.google tidak dapat dipastikan sebagai lokasi. '
      : 'Tautan ini bukan tautan Google Maps. ';
    return { sah: false, hasil: tolak(asal + PETUNJUK) };
  }

  // ---- Angka koordinat: desimal dan derajat-menit-detik --------------------------------------------------------------
  function nilaiDms(angka, belahan) {
    var d = angka[0], mnt = angka.length > 1 ? angka[1] : 0, dt = angka.length > 2 ? angka[2] : 0;
    if (angka.length > 1 && (d !== Math.floor(d) || mnt >= 60)) return NaN;
    if (angka.length > 2 && (mnt !== Math.floor(mnt) || dt >= 60)) return NaN;
    var v = d + mnt / 60 + dt / 3600;
    return (belahan === 'S' || belahan === 'W') ? -v : v;
  }
  // Mengembalikan { lat, lng } atau null (bukan bentuk koordinat). Hanya bentuk yang TIDAK ambigu yang diterima.
  function bacaAngka(teks) {
    var s = teks.toUpperCase()
      .replace(RE_DERAJAT, ' ')
      .replace(RE_MENIT, "'")
      .replace(RE_DETIK, '"')
      .replace(/''/g, '"');
    var bentuk = 'desimal';
    var lat, lng, angka;
    if (!/[NSEW]/.test(s)) {
      // Desimal polos: tepat dua bilangan, dipisah koma/titik koma/spasi.
      if (!/^[\s\d.,;+\-]+$/.test(s)) return null;
      angka = s.match(/[+-]?\d+(?:[.,]\d+)?/g) || [];
      if (angka.length !== 2) return null;
      if (s.replace(/[+-]?\d+(?:[.,]\d+)?/g, '').replace(/[\s,;]/g, '') !== '') return null;
      lat = angkaDesimal(angka[0].replace(/^[+-]/, '')); lng = angkaDesimal(angka[1].replace(/^[+-]/, ''));
      if (/^-/.test(angka[0])) lat = -lat;
      if (/^-/.test(angka[1])) lng = -lng;
      if ((lat < -90 || lat > 90) && lng >= -90 && lng <= 90 && lat >= -180 && lat <= 180) { var t = lat; lat = lng; lng = t; }
      return { lat: lat, lng: lng, jenis: bentuk };
    }
    // Dengan huruf arah (N/S/E/W): derajat[-menit[-detik]] per sumbu; huruf di depan ATAU di belakang, tidak campur.
    var token = [], re = /([NSEW])|(\d+(?:[.,]\s*\d+)?)|(['",;:.\s])|(.)/g, mt;
    while ((mt = re.exec(s)) !== null) {
      if (mt[4] !== undefined) return null;
      if (mt[1]) token.push({ h: mt[1] });
      else if (mt[2]) token.push({ n: angkaDesimal(mt[2]) });
    }
    var huruf = token.filter(function (x) { return x.h; });
    if (huruf.length !== 2 || token.length < 4) return null;
    var awalHuruf = !!token[0].h, kel = [], cur = { h: '', n: [] }, j;
    for (j = 0; j < token.length; j++) {
      if (token[j].h) {
        if (awalHuruf) { if (cur.h || cur.n.length) kel.push(cur); cur = { h: token[j].h, n: [] }; }
        else { cur.h = token[j].h; kel.push(cur); cur = { h: '', n: [] }; }
      } else { cur.n.push(token[j].n); }
    }
    if (awalHuruf) kel.push(cur);
    else if (cur.n.length) return null;
    if (kel.length !== 2) return null;
    for (j = 0; j < 2; j++) if (kel[j].n.length < 1 || kel[j].n.length > 3 || kel[j].n.some(isNaN)) return null;
    var sumbuLat = kel.filter(function (x) { return x.h === 'N' || x.h === 'S'; });
    var sumbuLng = kel.filter(function (x) { return x.h === 'E' || x.h === 'W'; });
    if (sumbuLat.length !== 1 || sumbuLng.length !== 1) return null;
    lat = nilaiDms(sumbuLat[0].n, sumbuLat[0].h);
    lng = nilaiDms(sumbuLng[0].n, sumbuLng[0].h);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat: lat, lng: lng, jenis: 'dms' };
  }

  // ---- Pintu masuk -----------------------------------------------------------------------------------------------------
  function normalisasiKoordinat(masukan) {
    var t = bersihkan(masukan).replace(/(https?:\/\/)\s*maps\.\s*app\.\s*goo\.\s*gl\s*\//i, '$1maps.app.goo.gl/');
    if (!t) return tolak('Koordinat lokasi wajib diisi.');
    if (t.length > MAKS_PANJANG) {
      return tolak('Isian terlalu panjang. Tempel hanya tautan Google Maps, angka koordinat, atau kode lokasi. ' + PETUNJUK);
    }
    var tanpaTautan = t;
    var tautan = bacaTautan(t);
    if (tautan) {
      if (tautan.sah) return tautan.hasil;
      tanpaTautan = bersihkan(t.replace(/https?:\/\/[^\s<>"']+/i, ' '));
    }
    var kode = cariPlus(tanpaTautan);
    if (kode) {
      var titik = pulihkanPlus(kode, ACUAN_MEDAN.lat, ACUAN_MEDAN.lng);
      if (!titik) return tolak('Kode lokasi (Plus Code) tidak valid. ' + PETUNJUK);
      return terimaKoordinat('pluscode', titik.lat, titik.lng, '');
    }
    var angka = bacaAngka(tanpaTautan);
    if (angka) return terimaKoordinat(angka.jenis, angka.lat, angka.lng, '');
    if (tautan) return tautan.hasil;
    if (/[A-Za-z]{3,}/.test(t)) return tolak('Itu alamat atau teks biasa, bukan koordinat. ' + PETUNJUK);
    return tolak('Itu bukan koordinat yang dikenali. ' + PETUNJUK);
  }

  // Layanan yang WAJIB menyertakan koordinat lokasi (satu-satunya daftar; server memakai salinan yang sama).
  var LAYANAN_WAJIB = [
    'GURU MAGHRIB MENGAJI', 'GURU SEKOLAH MINGGU', 'GURU SEKOLAH BUDDHA', 'GURU SEKOLAH HINDU', 'GURU SEKOLAH KONG HU CHU'
  ];
  function layananWajib(layanan) {
    return LAYANAN_WAJIB.indexOf(String(layanan || '').toUpperCase().trim()) !== -1;
  }
  // KOORDINAT-INTI>>

  var api = { normalisasi: normalisasiKoordinat, layananWajib: layananWajib, LAYANAN_WAJIB: LAYANAN_WAJIB };
  akar.djpmKoordinat = api;
  if (typeof document === 'undefined') return;

  // ===============================================================================================================
  // LAYAR (hanya di browser)
  // ===============================================================================================================
  function $(id) { return document.getElementById(id); }
  function esc2(v) {
    if (typeof akar.esc === 'function') return akar.esc(v);
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function bukaPeta(tautan) {
    var w = akar.open(tautan, '_blank', 'noopener,noreferrer');
    if (w) w.opener = null;
  }
  function teksTitik(h) {
    return h.lat !== null ? h.lat.toFixed(6) + ', ' + h.lng.toFixed(6) : 'tautan Google Maps';
  }
  var ID = {
    plank: { manual: 'manual-koordinat-plank', tombol: 'tombol-manual-koordinat-plank', pesan: 'pesan-koordinat-manual' },
    ibadah: { manual: 'manual-koordinat-ibadah', tombol: 'tombol-manual-koordinat-ibadah', pesan: 'pesan-koordinat-manual-ibadah' }
  };

  /** Tampilkan/sembunyikan kolom isian manual (otomatis saat foto tanpa GPS; atau lewat tombol "Isi lokasi manual"). */
  api.tampilkanManual = function (mode, tampil, pesan) {
    var w = $(ID[mode].manual), b = $(ID[mode].tombol), p = $(ID[mode].pesan);
    if (w) w.classList.toggle('hidden', !tampil);
    if (b) b.classList.toggle('hidden', !!tampil);
    if (p && pesan) { p.textContent = pesan; p.classList.remove('hidden'); }
    if (tampil) { var el = $(KONFIG_KOORDINAT[mode].idInputManual); if (el && el.focus) el.focus(); }
  };
  /** Dipanggil resetStatusKoordinat: sembunyikan kolom manual + pesan. */
  api.reset = function (mode) {
    var w = $(ID[mode].manual), b = $(ID[mode].tombol), p = $(ID[mode].pesan);
    var pg = $(KONFIG_KOORDINAT[mode].idGagal);
    if (pg) pg.removeAttribute('data-disembunyikan');
    if (w) w.classList.add('hidden');
    if (b) b.classList.remove('hidden');
    if (p) { p.classList.add('hidden'); p.textContent = ''; }
  };
  /** Koordinat GPS dari foto (tautan koordinat): '' bila sah, selain itu pesan galat (mis. di luar Kota Medan). */
  api.periksaGps = function (tautan) {
    var h = normalisasiKoordinat(tautan);
    return h.ok ? '' : 'Lokasi GPS pada foto tidak dapat dipakai. ' + h.pesan + ' Isi lokasi yang benar secara manual di bawah ini.';
  };
  /** Dipanggil saat petugas mengetik/menempel di kolom manual. */
  api.periksaManual = function (mode) {
    var cfg = KONFIG_KOORDINAT[mode];
    var nilai = $(cfg.idInputManual).value;
    var pesanEl = $(ID[mode].pesan), okEl = $(cfg.idOk), hidden = $(cfg.idHidden);
    var peringatan = $(cfg.idGagal);
    okEl.classList.add('hidden');
    pesanEl.classList.add('hidden');
    hidden.value = '';
    cfg.siap = false;
    if (peringatan && peringatan.getAttribute('data-disembunyikan') === '1') { peringatan.classList.remove('hidden'); peringatan.removeAttribute('data-disembunyikan'); }
    if (nilai.trim()) {
      var h = normalisasiKoordinat(nilai);
      if (h.ok) {
        hidden.value = h.tautan;
        cfg.siap = true;
        $(cfg.idTeksOk).textContent = teksTitik(h);
        $(cfg.idLinkOk).onclick = function () { bukaPeta(h.tautan); };
        okEl.classList.remove('hidden');
        if (peringatan && !peringatan.classList.contains('hidden')) { peringatan.classList.add('hidden'); peringatan.setAttribute('data-disembunyikan', '1'); }
      } else {
        pesanEl.textContent = h.pesan;
        pesanEl.classList.remove('hidden');
      }
    }
    if (typeof akar.updateStatusTombolSimpan === 'function') akar.updateStatusTombolSimpan();
  };

  // ---- Detail & Edit Data ---------------------------------------------------------------------------------------------
  function potong(t, n) { t = String(t); return t.length > n ? t.slice(0, n - 1) + '...' : t; }
  /** Uraian ringkas untuk isi koordinat yang SALAH berupa TAUTAN (agar tautan panjang tidak membanjiri layar); null bila bukan tautan. */
  function uraianSalah(nilai) {
    var m = String(nilai).match(/https?:\/\/[^\s<>"']+/i);
    if (!m) return null;
    var awalan = bersihkan(String(nilai).replace(m[0], ' ')).length > 3 ? 'alamat disertai ' : '';
    var host = '', jalur = '', u;
    try { u = new URL(m[0].replace(/[.,;:)\]}]+$/, '')); host = u.hostname.toLowerCase(); jalur = u.pathname.toLowerCase(); }
    catch (e) { return awalan + 'tautan yang tidak valid dan bukan tautan lokasi dari Google Maps'; }
    var isi;
    if (/^(www\.)?google\.[a-z.]+$/.test(host) && /^\/search/.test(jalur)) isi = 'tautan hasil pencarian Google dan bukan tautan lokasi dari Google Maps';
    else if (host.indexOf('share.google') >= 0) isi = 'tautan bagikan Google (share.google) dan bukan tautan lokasi dari Google Maps';
    else if (host.indexOf('timemark') >= 0) isi = 'tautan aplikasi kamera Timemark dan bukan tautan lokasi dari Google Maps';
    else if (normalisasiKoordinat(nilai).pesan.indexOf('luar Kota Medan') >= 0) isi = 'tautan Google Maps yang lokasinya berada di luar Kota Medan';
    else isi = 'tautan dari ' + host + ' dan bukan tautan lokasi dari Google Maps';
    return awalan + isi;
  }

  // Kelas disusun sebagai LITERAL utuh (bukan dirangkai) supaya terbaca oleh pemindai Tailwind saat build.
  var IKON_PERINGATAN = '<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>';
  var KOTAK = {
    netral: 'mt-5 border-t border-slate-200/80 pt-4',
    merah: 'mt-5 rounded-xl border-2 border-red-400 bg-red-50 p-3.5',
    hijau: 'mt-5 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3.5'
  };
  var JUDUL = {
    netral: 'text-[10px] font-bold text-sky-600 uppercase tracking-wider mb-1 flex items-center gap-1.5',
    merah: 'text-[11px] font-bold text-red-700 uppercase tracking-wider mb-1 flex items-center gap-1.5',
    hijau: 'text-[11px] font-bold text-emerald-700 uppercase tracking-wider mb-1 flex items-center gap-1.5'
  };
  var INPUT = {
    netral: 'w-full border border-slate-300 rounded-lg p-2 text-xs sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition',
    merah: 'w-full border-2 border-red-500 rounded-lg p-2 text-xs sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-300 transition',
    hijau: 'w-full border-2 border-emerald-500 rounded-lg p-2 text-xs sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 transition'
  };
  var TEKS_JUDUL = {
    netral: 'Koordinat Lokasi',
    merah: IKON_PERINGATAN + '<span>Koordinat Lokasi &mdash; HARUS DIPERBAIKI</span>',
    hijau: 'Koordinat Lokasi &mdash; sudah benar'
  };
  var PETUNJUK_PERBAIKI = 'Cara memperbaiki: klik tombol <b>Edit</b>, lalu isi kolom Koordinat Lokasi dengan tautan Google Maps (buka Google Maps, tekan lama pada titik lokasi, Bagikan, Salin tautan), angka koordinat, atau kode lokasi (Plus Code).';

  /** HTML baris "Koordinat Lokasi" di Detail (d[31]); kosong untuk layanan yang tidak memakainya. Salah/kosong -> kotak MERAH. */
  api.htmlDetail = function (d) {
    if (!layananWajib(d[7])) return '';
    var nilai = bersihkan(d[31]);
    var h = nilai ? normalisasiKoordinat(nilai) : null;
    if (h && h.ok) {
      return '<div class="' + KOTAK.netral + '" id="detail-koordinat-lokasi">' +
        '<p class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Koordinat Lokasi</p><div>' +
        '<span class="text-sm font-semibold text-slate-800">' + esc2(teksTitik(h)) + '</span> ' +
        '<a href="' + esc2(h.tautan) + '" target="_blank" rel="noopener noreferrer" class="ml-2 text-xs font-semibold text-sky-700 underline">Buka di Google Maps &#8599;</a></div></div>';
    }
    var saatIni = nilai
      ? '<p class="text-xs text-red-700">Yang tercatat sekarang (<b>salah</b>):</p><p class="mt-0.5 text-sm font-bold text-red-800 break-words" id="detail-koordinat-isi" title="' + esc2(nilai) + '">' + esc2(uraianSalah(nilai) || potong(nilai, 160)) + '</p>'
      : '<p class="text-sm font-bold text-red-800" id="detail-koordinat-isi">Belum diisi</p>';
    return '<div class="' + KOTAK.merah + '" id="detail-koordinat-lokasi" data-perlu-perbaikan="1">' +
      '<p class="' + JUDUL.merah + '">' + TEKS_JUDUL.merah + '</p>' + saatIni +
      '<p class="mt-2 text-[11px] leading-relaxed text-red-700">' + PETUNJUK_PERBAIKI + '</p></div>';
  };
  /** HTML kolom edit "Koordinat Lokasi" (id edit-31, ikut alur simpanEdit); kosong untuk layanan lain. Salah/kosong -> kotak MERAH. */
  api.htmlEdit = function (d) {
    if (!layananWajib(d[7])) return '';
    var nilai = bersihkan(d[31]);
    var salah = !nilai || !normalisasiKoordinat(nilai).ok;
    var s = salah ? 'merah' : 'netral';
    return '<div class="' + KOTAK[s] + '" id="edit-31-kotak">' +
      '<p class="' + JUDUL[s] + '" id="edit-31-judul">' + TEKS_JUDUL[s] + '</p>' +
      '<p class="mb-1.5 text-[11px] text-slate-500">Tempel tautan Google Maps, angka koordinat, atau kode lokasi (Plus Code).</p>' +
      '<input id="edit-31" type="text" autocomplete="off" style="text-transform:none" value="' + esc2(nilai) + '" class="' + INPUT[s] + '" ' +
      'oninput="djpmKoordinat.periksaEdit()" onchange="djpmKoordinat.periksaEdit()">' +
      '<p id="edit-31-info" class="' + (salah ? 'mt-1 text-[11px] font-semibold text-red-700' : 'hidden mt-1 text-[11px]') + '">' +
      (salah ? (nilai ? 'Isi saat ini salah. Ganti dengan koordinat yang benar.' : 'Koordinat belum diisi. Isi dengan koordinat yang benar.') : '') + '</p></div>';
  };
  /** Umpan balik langsung di kolom edit: merah bila salah/kosong, hijau bila sah. */
  api.periksaEdit = function () {
    var el = $('edit-31'), info = $('edit-31-info'), kotak = $('edit-31-kotak'), judul = $('edit-31-judul');
    if (!el || !info) return;
    var nilai = el.value.trim();
    var h = nilai ? normalisasiKoordinat(nilai) : null;
    var s = h && h.ok ? 'hijau' : 'merah';
    if (kotak) kotak.className = KOTAK[s];
    if (judul) { judul.className = JUDUL[s]; judul.innerHTML = TEKS_JUDUL[s]; }
    el.className = INPUT[s];
    info.className = 'mt-1 text-[11px] font-semibold ' + (s === 'hijau' ? 'text-emerald-700' : 'text-red-700');
    info.textContent = !nilai ? 'Koordinat belum diisi. Isi dengan koordinat yang benar.' : (h.ok ? 'Koordinat terdeteksi: ' + teksTitik(h) : h.pesan);
  };
  /** Dipanggil tombol "Laporkan Sudah Diperbaiki": pesan peringatan bila koordinat data (layanan Guru) MASIH salah/kosong; '' = tidak perlu. */
  api.peringatanLapor = function (d) {
    if (!d || !layananWajib(d[7])) return '';
    var nilai = bersihkan(d[31]);
    if (nilai && normalisasiKoordinat(nilai).ok) return '';
    var isi = nilai ? 'Koordinat lokasi data ini masih SALAH: ' + (uraianSalah(nilai) || '"' + potong(nilai, 80) + '"') + '.' : 'Koordinat lokasi data ini masih BELUM DIISI.';
    return isi + '\n\nYakin sudah diperbaiki dan ingin melaporkan? Bila belum, pilih "Kembali", klik Edit, lalu isi koordinat yang benar.';
  };
  /** Dipanggil simpanEdit(nilaiTersimpan): pesan galat bila kolom koordinat DIUBAH menjadi tidak valid ('' = boleh lanjut). */
  api.galatEdit = function (nilaiTersimpan) {
    var el = $('edit-31');
    if (!el) return '';
    var nilai = el.value.trim();
    if (nilai === bersihkan(nilaiTersimpan)) return '';
    if (!nilai) return 'Koordinat lokasi wajib diisi.';
    var h = normalisasiKoordinat(nilai);
    return h.ok ? '' : h.pesan;
  };
})(typeof window !== 'undefined' ? window : globalThis);
