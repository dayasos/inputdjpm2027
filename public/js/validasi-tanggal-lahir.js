/**
 * public/js/validasi-tanggal-lahir.js
 * Pemeriksa tanggal lahir di sisi layar. ATURANNYA HARUS SAMA dengan server:
 * supabase/functions/api/_shared/validasiPenerima.ts (periksaTanggalLahir). Kesetaraan keduanya dijaga oleh uji
 * scripts/uji/validasi-tanggal-lahir-layar.test.mjs (membandingkan ribuan masukan). Server tetap penegak utama;
 * berkas ini hanya mencegah kesalahan lebih dini (plan: plans/plan-perbaikan-validasi-data-penerima.md, bagian 5.3).
 *
 * Aturan: tanggal kalender sah; tahun 4 digit dan >= 1900; tidak di masa depan (WIB); umur pada patokan
 * 1 Januari tahun aktif antara 18 dan 100. Bentuk masukan: 'yyyy-MM-dd', 'dd-MM-yyyy', 'dd/MM/yyyy'.
 *
 * Dipakai sebagai window.djpmTanggalLahir di browser, dan lewat require() di uji Node.
 */
(function (akar, pabrik) {
  var api = pabrik();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else akar.djpmTanggalLahir = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var UMUR_MIN = 18;
  var UMUR_MAKS = 100;
  var TAHUN_LAHIR_MIN = 1900;
  var TAHUN_AKTIF_BAWAAN = 2027;

  var PESAN_WAJIB = 'Tanggal lahir wajib diisi.';
  var PESAN_TIDAK_VALID = 'Tanggal lahir tidak valid.';
  var PESAN_TIDAK_WAJAR = 'Tanggal lahir tidak wajar. Pastikan tahun lahir 4 digit (mis. 1990) dan usia antara ' +
    UMUR_MIN + ' sampai ' + UMUR_MAKS + ' tahun.';
  var PESAN_DI_BAWAH_UMUR = 'Usia di bawah ' + UMUR_MIN + ' tahun tidak memenuhi syarat.';

  function dua(n) { return (n < 10 ? '0' : '') + n; }

  /** Tanggal hari ini menurut WIB, 'YYYY-MM-DD' (sama dengan sisi server, bukan jam perangkat). */
  function hariIniWIB() {
    return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  }

  /**
   * Tahun anggaran aktif menurut aplikasi (app-core.js: window._tahunAktifGetter), supaya tidak ada angka tahun kedua yang
   * perlu diubah saat pergantian periode. Di luar browser (uji Node) atau bila tak tersedia -> 0 (pakai TAHUN_AKTIF_BAWAAN).
   * Saat TAHUN_AKTIF berganti: ubah app-core.js (tahunAktif) dan env TAHUN_AKTIF di server (config.ts).
   */
  function tahunAktifAplikasi() {
    try {
      var g = typeof self !== 'undefined' ? self._tahunAktifGetter : null;
      var n = typeof g === 'function' ? Number(g()) : 0;
      return n > 1999 && n < 3000 ? n : 0;
    } catch (e) { return 0; }
  }

  function kalenderValid(y, m, d) {
    if (m < 1 || m > 12 || d < 1) return false;
    // setUTCFullYear (bukan Date.UTC): Date.UTC memetakan tahun 0-99 ke 1900-1999 sehingga tahun 0089 salah dinilai tidak valid.
    var dt = new Date(0);
    dt.setUTCFullYear(y, m - 1, d);
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  /**
   * periksa(mentah, opsi) -> { ok:true, iso, umur } | { ok:false, pesan, jenis, umur? }  (umur hanya bila umur di luar 18-100)
   * jenis: 'wajib' | 'tidak_valid' | 'tidak_wajar' | 'di_bawah_umur'
   * opsi (opsional): { tahunAktif, hariIni }  -- hariIni hanya untuk uji.
   */
  function periksa(mentah, opsi) {
    opsi = opsi || {};
    var tahunAktif = opsi.tahunAktif || tahunAktifAplikasi() || TAHUN_AKTIF_BAWAAN;
    var hariIni = opsi.hariIni || hariIniWIB();
    var t = mentah == null ? '' : String(mentah).trim();
    if (t === '') return { ok: false, pesan: PESAN_WAJIB, jenis: 'wajib' };

    var y, m, d, cocok = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
    if (cocok) {
      y = Number(cocok[1]); m = Number(cocok[2]); d = Number(cocok[3]);
    } else if ((cocok = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(t))) {
      d = Number(cocok[1]); m = Number(cocok[2]); y = Number(cocok[3]);
    } else if (/^\d+[-/]\d{1,2}[-/]\d{1,2}$/.test(t) || /^\d{1,2}[-/]\d{1,2}[-/]\d+$/.test(t)) {
      // Bentuknya tanggal, tetapi tahunnya bukan 4 digit (mis. 04-02-199 yang kehilangan satu angka).
      return { ok: false, pesan: PESAN_TIDAK_WAJAR, jenis: 'tidak_wajar' };
    } else {
      return { ok: false, pesan: PESAN_TIDAK_VALID, jenis: 'tidak_valid' };
    }

    if (!kalenderValid(y, m, d)) return { ok: false, pesan: PESAN_TIDAK_VALID, jenis: 'tidak_valid' };
    var iso = ('000' + y).slice(-4) + '-' + dua(m) + '-' + dua(d);
    if (y < TAHUN_LAHIR_MIN || iso > hariIni) return { ok: false, pesan: PESAN_TIDAK_WAJAR, jenis: 'tidak_wajar' };

    var umur = tahunAktif - y - (m > 1 || d > 1 ? 1 : 0);
    if (umur < UMUR_MIN) return { ok: false, pesan: PESAN_DI_BAWAH_UMUR, jenis: 'di_bawah_umur', umur: umur };
    if (umur > UMUR_MAKS) return { ok: false, pesan: PESAN_TIDAK_WAJAR, jenis: 'tidak_wajar', umur: umur };
    return { ok: true, iso: iso, umur: umur };
  }

  return {
    periksa: periksa,
    hariIniWIB: hariIniWIB,
    UMUR_MIN: UMUR_MIN,
    UMUR_MAKS: UMUR_MAKS,
    TAHUN_LAHIR_MIN: TAHUN_LAHIR_MIN
  };
});
