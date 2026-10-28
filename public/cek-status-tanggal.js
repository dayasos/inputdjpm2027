// Tanggal lahir DIKETIK (bukan dipilih dari kalender) untuk halaman publik /cek-status.
// Dipisah dari cek-status.html agar logikanya bisa diuji di Node (scripts/uji/cek-status-tanggal.test.mjs).
// ES5 sengaja (HP lama / Chrome lama). Tidak menyimpan apa pun dan tidak memanggil jaringan.
//
//   CekTanggal.rapikan(teks)          -> "HH-BB-TTTT" progresif: hanya angka, tanda pisah ditambah otomatis, maks 8 angka.
//                                        Tempelan "31/12/1990", "1.2.1990", "1990-12-31" dipahami dan dirapikan.
//   CekTanggal.periksa(teks, hariIni) -> {status:'kosong'|'belum'|'salah'|'ok', iso, teks, pesan}; hariIni = 'YYYY-MM-DD'.
(function (akar) {
  'use strict';

  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var TAHUN_MIN = 1900;

  function dua(x) { return x.length === 1 ? '0' + x : x; }

  function rapikan(mentah) {
    var s = String(mentah == null ? '' : mentah).replace(/^\s+|\s+$/g, '');
    var m = /^(\d{1,2})\D+(\d{1,2})\D+(\d{4})$/.exec(s);   // 1/2/1990, 01-02-1990, 1.2.1990
    if (m) return dua(m[1]) + '-' + dua(m[2]) + '-' + m[3];
    m = /^(\d{4})\D+(\d{1,2})\D+(\d{1,2})$/.exec(s);        // 1990-02-01 (urutan ISO)
    if (m) return dua(m[3]) + '-' + dua(m[2]) + '-' + m[1];
    var d = s.replace(/\D/g, '').slice(0, 8);
    var hasil = d.slice(0, 2);
    // Pemisah baru muncul saat ada angka sesudahnya, sehingga tombol hapus tidak "tersangkut" di tanda pisah.
    if (d.length > 2) hasil += '-' + d.slice(2, 4);
    if (d.length > 4) hasil += '-' + d.slice(4);
    return hasil;
  }

  function kalenderValid(y, mo, d) {
    var dt = new Date(Date.UTC(2000, 0, 1));
    dt.setUTCFullYear(y, mo - 1, d);
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
  }

  function periksa(nilai, hariIni) {
    var s = String(nilai == null ? '' : nilai);
    var m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
    if (!m) return { status: s ? 'belum' : 'kosong' };
    var d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
    var iso = m[3] + '-' + m[2] + '-' + m[1];
    if (!kalenderValid(y, mo, d)) return { status: 'salah', pesan: 'Tanggal tersebut tidak ada di kalender. Periksa kembali.' };
    if (y < TAHUN_MIN) return { status: 'salah', pesan: 'Tahun lahir tidak valid (sebelum ' + TAHUN_MIN + ').' };
    if (iso > hariIni) return { status: 'salah', pesan: 'Tanggal lahir tidak boleh di masa depan.' };
    return { status: 'ok', iso: iso, teks: d + ' ' + BULAN[mo - 1] + ' ' + y };
  }

  var api = { rapikan: rapikan, periksa: periksa };
  akar.CekTanggal = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
