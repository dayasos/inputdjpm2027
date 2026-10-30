/**
 * public/js/pengingat-alamat-rumah.js
 * Pengingat di form Input: layanan GURU MAGHRIB MENGAJI dengan tempat tugas "RUMAH". Petugas sering menyalin alamat
 * domisili ke "Alamat Tempat Tugas" padahal berkas guru menulis tempat tugas lain (plans/plan-pengingat-alamat-rumah-gmm.md).
 * Hanya PENGINGAT: tidak pernah memblokir penyimpanan (guru yang memang mengajar di rumahnya tetap bisa disimpan).
 *
 * Aturan "tempat tugas = RUMAH" (kata utuh, bukan sekadar mengandung huruf): diawali RUMAH atau RMH, tidak diikuti angka/huruf
 * lain, dan BUKAN "RUMAH IBADAH ..." (itu lembaga; pemisah apa pun antara kedua kata diterima: spasi, "-", ".", "/").
 * Contoh: "RUMAH", " rmh ", "RUMAH SENDIRI" ya; "RUMAHKU", "RUMAH IBADAH X", "RUMAH-IBADAH X" tidak.
 *
 * Dipakai sebagai window.djpmPengingatAlamat di browser, dan lewat require() di uji Node (scripts/uji/pengingat-alamat-rumah.test.mjs).
 */
(function (akar, pabrik) {
  var api = pabrik();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else akar.djpmPengingatAlamat = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LAYANAN = 'GURU MAGHRIB MENGAJI';
  var PESAN = 'Pastikan alamat tugas sudah benar karena akan berpengaruh ketika Tim Verifikasi dari Dinas Sosial akan melakukan monitoring.';

  function rapi(teks) {
    return String(teks == null ? '' : teks).replace(/\s+/g, ' ').replace(/^ | $/g, '').toUpperCase();
  }

  function layananGmm(layanan) {
    return rapi(layanan) === LAYANAN;
  }

  function tempatTugasRumah(tempatTugas) {
    var t = rapi(tempatTugas);
    return /^(RUMAH|RMH)(?![A-Z0-9])/.test(t) && !/^RUMAH[^A-Z0-9]*IBADAH(?![A-Z0-9])/.test(t);
  }

  function perluPengingat(layanan, tempatTugas) {
    return layananGmm(layanan) && tempatTugasRumah(tempatTugas);
  }

  /** Bandingkan alamat tanpa peduli huruf besar/kecil, spasi, dan tanda baca ("JL. A NO.5" = "jl a no 5"). */
  function sama(alamatA, alamatB) {
    var a = rapi(alamatA).replace(/[^A-Z0-9]/g, '');
    var b = rapi(alamatB).replace(/[^A-Z0-9]/g, '');
    return a !== '' && a === b;
  }

  return {
    LAYANAN: LAYANAN,
    PESAN: PESAN,
    layananGmm: layananGmm,
    tempatTugasRumah: tempatTugasRumah,
    perluPengingat: perluPengingat,
    sama: sama
  };
});
