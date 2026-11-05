/**
 * public/js/alamat-tugas.js
 * Aturan "Alamat Tugas tidak boleh berupa tautan (URL)" sisi layar. Rencana: plans/plan-alamat-tugas-tautan-gmm.md.
 * SALINAN IDENTIK dari supabase/functions/api/_shared/alamatTugas.ts (pola, normalisasi, pesan) -- dijaga scripts/uji/alamat-tugas.test.mjs.
 * Server tetap penentu; layar hanya memberi umpan balik lebih cepat dan menentukan kapan kolom Alamat Tugas boleh diedit.
 *
 * Pola TANPA lookbehind (Android/Chrome lama tidak mendukung). Dipakai sebagai window.djpmAlamatTugas, dan lewat require() di uji Node.
 */
(function (akar, pabrik) {
  var api = pabrik();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else akar.djpmAlamatTugas = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var POLA_TAUTAN = [
    /\bHTTPS?\s*:/,
    /\bHTTPS?\s*\/\//,
    /\bWWW\s*\./,
    /(?:^|[^A-Z0-9])(?:GOO\.GL|MAPS\.APP|BIT\.LY|TINYURL\.COM|WA\.ME|T\.ME|SHARE\.GOOGLE|MAPS\.GOOGLE|TIMEMARK\.COM|GOOGLE\.[A-Z]{2,3})(?![A-Z0-9])/,
    /(?:^|[^A-Z0-9-])[A-Z0-9][A-Z0-9-]*(?:\.[A-Z0-9-]+)*\.(?:COM|NET|ORG|APP|LINK|GL|LY|CO\.ID|GO\.ID|WEB\.ID|OR\.ID|SCH\.ID)(?![A-Z0-9])/
  ];

  var PESAN_TAUTAN =
    'GAGAL: Alamat Tugas tidak boleh berupa tautan (https://...). Tulis alamat sebenarnya (jalan, nomor, lingkungan). ' +
    'Tautan Google Maps diisi di kolom Koordinat Lokasi.';
  var PESAN_KOSONG =
    'GAGAL: Alamat Tugas wajib diisi dengan alamat sebenarnya (jalan, nomor, lingkungan; minimal 5 karakter, memuat huruf).';

  function normalkan(teks) {
    var t = teks == null ? '' : String(teks);
    try { t = t.normalize('NFKC'); } catch (_e) { /* peramban sangat lama */ }
    t = t.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[­​-‏⁠﻿]/g, '');
    return t.toUpperCase();
  }

  var JENDELA_PERIKSA = 1000;
  var TUMPANG_JENDELA = 200;
  var MAKS_ALAMAT_PENGGANTI = 100;
  var PESAN_PANJANG = 'GAGAL: Alamat Tugas terlalu panjang (maksimal ' + MAKS_ALAMAT_PENGGANTI + ' karakter).';

  /** Pemeriksaan per jendela 1.000 karakter yang saling tumpang 200 (pola domain kuadratik pada teks panjang; identik dengan server). */
  function mengandungTautan(teks) {
    var t = normalkan(teks);
    if (!t) return false;
    for (var awal = 0; ; awal += JENDELA_PERIKSA - TUMPANG_JENDELA) {
      var potong = t.slice(awal, awal + JENDELA_PERIKSA);
      for (var i = 0; i < POLA_TAUTAN.length; i++) if (POLA_TAUTAN[i].test(potong)) return true;
      if (awal + JENDELA_PERIKSA >= t.length) return false;
    }
  }

  /** Kolom Alamat Tugas pada Detail > Edit hanya terbuka bila alamat TERSIMPAN masih berupa tautan. */
  function bolehDiperbaiki(alamatTersimpan) {
    return mengandungTautan(alamatTersimpan);
  }

  /** '' = sah; selain itu pesan galat. Untuk alamat pengganti (perbaikan): bukan tautan, tidak kosong, >= 5 karakter, memuat huruf. */
  function galatPengganti(nilai) {
    if (mengandungTautan(nilai)) return PESAN_TAUTAN;
    var t = (nilai == null ? '' : String(nilai)).replace(/\s+/g, ' ').replace(/^ | $/g, '');
    if (t.length > MAKS_ALAMAT_PENGGANTI) return PESAN_PANJANG;
    if (t.length < 5 || !/[A-Za-z]/.test(t)) return PESAN_KOSONG;
    return '';
  }

  /** '' = sah; untuk input biasa (tidak mewajibkan panjang): hanya menolak tautan. */
  function galatInput(nilai) {
    return mengandungTautan(nilai) ? PESAN_TAUTAN : '';
  }

  return {
    POLA_TAUTAN: POLA_TAUTAN,
    PESAN_TAUTAN: PESAN_TAUTAN,
    PESAN_KOSONG: PESAN_KOSONG,
    PESAN_PANJANG: PESAN_PANJANG,
    JENDELA_PERIKSA: JENDELA_PERIKSA,
    TUMPANG_JENDELA: TUMPANG_JENDELA,
    normalkan: normalkan,
    mengandungTautan: mengandungTautan,
    bolehDiperbaiki: bolehDiperbaiki,
    galatPengganti: galatPengganti,
    galatInput: galatInput
  };
});
