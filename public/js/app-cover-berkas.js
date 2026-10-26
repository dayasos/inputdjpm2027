/**
 * public/js/app-cover-berkas.js
 * Cover berkas penerima (PDF): logo Pemko Medan, judul resmi, data penerima, tanpa kotak foto dan tanpa tanda tangan.
 * Rancangan lengkap: plans/plan-cover-berkas-penerima.md
 *
 * Dua bagian:
 *  1. INTI (murni, tanpa DOM): gambarCover(), bangunPdf(), bersihkanTeks() -- mudah diuji di Node.
 *  2. LAYAR: tombol "Cover" di tiap baris tabel Data Detail (unduh satu penerima) dan tombol "Unduh Cover PDF"
 *     di footer modal Data Detail (unduh keseluruhan, bisa dipersempit per Kecamatan/Layanan). Dimuat malas oleh
 *     app-pesan-periode.js saat Data Detail dibuka. Data diambil dari tabel Data Detail yang sedang tampil
 *     (sudah dibatasi hak akses oleh server dan disegarkan otomatis lewat realtime), tanpa panggilan server baru.
 */
(function (global) {
  'use strict';

  var ML = 40;                              // margin kiri/kanan
  var LABEL_L = 92;                         // lebar kolom label
  var LOGO_UKURAN = 62;                     // logo Pemko Medan (persegi), di tengah atas judul
  var URL_LOGO = '/logo-medan.png';
  var MAKS_HALAMAN_PER_BERKAS = 150;        // lebih dari ini dipecah agar HP tidak kehabisan memori
  var HALAMAN_PER_JEDA = 10;                // beri napas ke layar tiap sekian halaman
  var BATAS_PUSTAKA_MS = 30000;

  // Versi (?v=) skrip ini, dipakai juga untuk memuat pustaka PDF supaya cache ikut terbuang bersama-sama.
  var VERSI = '';
  try { VERSI = ((document.currentScript && /[?&]v=([^&]+)/.exec(document.currentScript.src)) || [])[1] || ''; } catch (_e) { VERSI = ''; }

  function ch(n) { return String.fromCharCode(n); }

  // Huruf standar PDF (Helvetica) hanya mengenal Latin-1. Padanan ASCII dipakai dahulu agar nama/alamat
  // tidak kehilangan huruf diam-diam; sisanya yang benar-benar tidak dikenal baru dibuang.
  var PADANAN = {};
  PADANAN[8216] = "'"; PADANAN[8217] = "'"; PADANAN[8218] = "'"; PADANAN[8220] = '"'; PADANAN[8221] = '"';
  PADANAN[8211] = '-'; PADANAN[8212] = '-'; PADANAN[8722] = '-'; PADANAN[8230] = '...'; PADANAN[160] = ' ';
  PADANAN[8203] = ''; PADANAN[8204] = ''; PADANAN[8205] = ''; PADANAN[65279] = ''; PADANAN[173] = '';
  function bersihkanTeks(v) {
    var s = String(v == null ? '' : v), out = '', lastSpasi = true;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i), t;
      if (Object.prototype.hasOwnProperty.call(PADANAN, c)) t = PADANAN[c];
      else if (c === 9 || c === 10 || c === 13) t = ' ';
      else if ((c >= 32 && c <= 126) || (c >= 161 && c <= 255)) t = ch(c);
      else t = '';
      for (var k = 0; k < t.length; k++) {
        var x = t.charAt(k);
        if (x === ' ') { if (lastSpasi) continue; lastSpasi = true; } else lastSpasi = false;
        out += x;
      }
    }
    return out.replace(/ +$/, '');
  }
  function nilaiAtauStrip(v) { var t = bersihkanTeks(v); return t === '' ? '-' : t; }

  function tahunJudul(tahun) { var t = parseInt(tahun, 10); return t > 1999 ? String(t) : '2027'; }

  /**
   * Menggambar SATU halaman cover untuk satu penerima pada halaman aktif `doc`.
   * p: objek baris dari ambilDataDetail (nama, nik, jenisKelamin, tempatLahir, tanggalLahir, umur, alamat,
   *    layanan, tempatTugas, alamatTugas, kecamatan, kelurahan, noKontak, statusBpjsTk, namaRekening,
   *    nomorRekening, kantorCabang). opsi: { tahun, pencetak, waktu, logo }.
   */
  function gambarCover(doc, p, opsi) {
    opsi = opsi || {};
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    var CW = W - 2 * ML;
    var BATAS_BAWAH = H - 66;                 // isi tidak boleh melewati garis ini (di atas kaki halaman)
    var TAMBAH_MAKS = 9;                      // tambahan jarak maksimum per baris (pt)

    var umur = (p.umur === '' || p.umur == null) ? '' : String(p.umur) + ' tahun';
    var ttl = [bersihkanTeks(p.tempatLahir), bersihkanTeks(p.tanggalLahir)].filter(function (x) { return x; }).join(', ');
    var SUSUNAN = [
      ['IDENTITAS', [['Nama', p.nama, 3], ['NIK', p.nik, 1], ['Jenis Kelamin', p.jenisKelamin, 1], ['Tempat, Tgl Lahir', ttl, 2], ['Umur', umur, 1], ['Alamat', p.alamat, 6]]],
      ['TUGAS PELAYANAN', [['Layanan', p.layanan, 2], ['Tempat Tugas', p.tempatTugas, 3], ['Alamat Tugas', p.alamatTugas, 4], ['Kecamatan', p.kecamatan, 1], ['Kelurahan', p.kelurahan, 1]]],
      ['KONTAK DAN REKENING', [['No. Kontak', p.noKontak, 1], ['Status BPJS TK', p.statusBpjsTk, 1], ['Nama Rekening', p.namaRekening, 3], ['No. Rekening', p.nomorRekening, 1], ['Kantor Cabang', p.kantorCabang, 3]]]
    ];

    // Satu putaran tata letak. kering=true: hanya mengukur (tidak menggambar) untuk mengetahui sisa ruang halaman;
    // putaran kedua memakai tambahan jarak (extra) agar isi menyebar, bukan menumpuk di atas halaman.
    function jalankan(kering, extra) {
      var noop = function () { };
      var D = kering ? {
        text: noop, rect: noop, line: noop, addImage: noop, setFillColor: noop, setDrawColor: noop, setLineWidth: noop, setTextColor: noop,
        setFont: function (a, b) { doc.setFont(a, b); }, setFontSize: function (n) { doc.setFontSize(n); },
        splitTextToSize: function (t, w) { return doc.splitTextToSize(t, w); }, getTextWidth: function (t) { return doc.getTextWidth(t); }
      } : doc;
      var y = 44;
      var jumlahBaris = 0, jumlahBagian = 0;

      function warnaTeks(r, g, b) { D.setTextColor(r, g, b); }
      function huruf(tebal, ukuran) { D.setFont('helvetica', tebal ? 'bold' : 'normal'); D.setFontSize(ukuran); }

      // --- Logo Pemko Medan (opsional: bila gagal dimuat/digambar, cover tetap jadi tanpa logo) ---
      if (opsi.logo) {
        try {
          D.addImage(opsi.logo, 'PNG', (W - LOGO_UKURAN) / 2, y, LOGO_UKURAN, LOGO_UKURAN, 'logo-pemko-medan', 'FAST');
          y += LOGO_UKURAN + 30;
        } catch (e) { y += 10; }
      } else { y += 10; }

      // --- Judul resmi ---
      huruf(true, 15); warnaTeks(15, 23, 42);
      D.text('PROFIL DATA PENERIMA', W / 2, y, { align: 'center' });
      huruf(true, 12.5);
      y += 22; D.text('DANA JASA PELAYANAN KEPADA WARGA PELAYAN MASYARAKAT', W / 2, y, { align: 'center' });
      y += 19; D.text('KOTA MEDAN TAHUN ANGGARAN ' + tahunJudul(opsi.tahun), W / 2, y, { align: 'center' });
      y += 18;
      D.setDrawColor(15, 23, 42); D.setLineWidth(1.8); D.line(ML, y, W - ML, y);
      D.setLineWidth(0.5); D.line(ML, y + 3, W - ML, y + 3);
      y += 40;

      function lebarSaatIni() { return CW; }

      function bagian(nama) {
        jumlahBagian++;
        var lebar = lebarSaatIni();
        D.setFillColor(226, 232, 240); D.rect(ML, y - 11, lebar, 17, 'F');
        huruf(true, 10); warnaTeks(15, 23, 42);
        D.text(nama, ML + 5, y + 1);
        y += 24 + extra;
      }

      // Baris "Label : nilai". Teks dibungkus; bila melebihi batas baris, huruf diperkecil lalu dipotong ("...").
      function baris(label, nilai, maksBaris) {
        jumlahBaris++;
        var lebar = lebarSaatIni();
        var lebarNilai = lebar - LABEL_L - 10;
        var teks = nilaiAtauStrip(nilai), ukuran = 10, lines;
        huruf(false, ukuran);
        lines = D.splitTextToSize(teks, lebarNilai);
        if (lines.length > maksBaris) { ukuran = 8.5; huruf(false, ukuran); lines = D.splitTextToSize(teks, lebarNilai); }
        if (lines.length > maksBaris) {
          lines = lines.slice(0, maksBaris);
          var akhir = lines[maksBaris - 1];
          while (akhir.length > 1 && D.getTextWidth(akhir + '...') > lebarNilai) akhir = akhir.slice(0, -1);
          lines[maksBaris - 1] = akhir.replace(/ +$/, '') + '...';
        }
        huruf(true, 9.5); warnaTeks(51, 65, 85);
        D.text(label, ML + 5, y);
        D.text(':', ML + LABEL_L, y);
        huruf(false, ukuran); warnaTeks(15, 23, 42);
        for (var i = 0; i < lines.length; i++) D.text(lines[i], ML + LABEL_L + 10, y + i * 12.5);
        y += lines.length * 12.5 + 6 + extra;
      }

      SUSUNAN.forEach(function (bg, n) {
        if (n > 0) y += 8 + extra;
        bagian(bg[0]);
        bg[1].forEach(function (b) { baris(b[0], b[1], b[2]); });
      });
      return { y: y, baris: jumlahBaris, bagian: jumlahBagian };
    }

    var ukur = jalankan(true, 0);
    var sisa = BATAS_BAWAH - ukur.y;
    var unit = ukur.baris + ukur.bagian + 2;          // baris + judul bagian + celah antarbagian
    var tambah = sisa > 0 ? Math.min(TAMBAH_MAKS, sisa / unit) : 0;
    var hasil = jalankan(false, tambah);

    // --- Kaki halaman ---
    var kaki = 'Dicetak dari Aplikasi DJPM 2027' + (opsi.pencetak ? ' oleh ' + bersihkanTeks(opsi.pencetak).slice(0, 40) : '') +
      (opsi.waktu ? ' - ' + bersihkanTeks(opsi.waktu) : '');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
    doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.5); doc.line(ML, H - 40, W - ML, H - 40);
    doc.text(kaki, ML, H - 28);
    return hasil.y;
  }

  function dokumenBaru(lib, judul) {
    var doc = new lib.jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true });
    doc.setProperties({ title: judul || 'Cover Berkas Penerima', subject: 'Cover Berkas Penerima DJPM', creator: 'Aplikasi DJPM 2027' });
    return doc;
  }

  /** Membuat dokumen jsPDF berisi satu halaman cover per penerima. `lib` = window.jspdf (atau modul jsPDF). */
  function bangunPdf(lib, daftar, opsi) {
    opsi = opsi || {};
    var doc = dokumenBaru(lib, opsi.judul);
    for (var i = 0; i < daftar.length; i++) {
      if (i > 0) doc.addPage();
      gambarCover(doc, daftar[i], opsi);
    }
    return doc;
  }

  /** Sama dengan bangunPdf tetapi bertahap (layar tidak membeku) dengan laporan kemajuan dan pembatalan. */
  function bangunPdfBertahap(lib, daftar, opsi, onKemajuan, dibatalkan) {
    opsi = opsi || {};
    return new Promise(function (resolve, reject) {
      var doc = dokumenBaru(lib, opsi.judul), i = 0;
      function langkah() {
        try {
          if (dibatalkan && dibatalkan()) { resolve(null); return; }
          var batas = Math.min(i + HALAMAN_PER_JEDA, daftar.length);
          for (; i < batas; i++) {
            if (i > 0) doc.addPage();
            gambarCover(doc, daftar[i], opsi);
          }
          if (onKemajuan) onKemajuan(i, daftar.length);
          if (i >= daftar.length) resolve(doc); else setTimeout(langkah, 0);
        } catch (e) { reject(e); }
      }
      langkah();
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Pemuatan pustaka dan logo
  // ---------------------------------------------------------------------------------------------
  var janjiJsPdf = null;
  function muatJsPdf() {
    if (global.jspdf && global.jspdf.jsPDF) return Promise.resolve(global.jspdf);
    if (janjiJsPdf) return janjiJsPdf;
    janjiJsPdf = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      var timer = null;
      function gagal() {
        clearTimeout(timer);
        janjiJsPdf = null;                                  // percobaan berikutnya memuat ulang
        if (s.parentNode) s.parentNode.removeChild(s);
        reject(new Error('Pustaka PDF gagal dimuat. Periksa koneksi, lalu coba lagi.'));
      }
      timer = setTimeout(gagal, BATAS_PUSTAKA_MS);
      s.onload = function () {
        clearTimeout(timer);
        if (global.jspdf && global.jspdf.jsPDF) resolve(global.jspdf); else gagal();
      };
      s.onerror = gagal;
      s.async = true;
      s.src = '/js/vendor/jspdf.umd.min.js' + (VERSI ? '?v=' + VERSI : '');
      document.head.appendChild(s);
    });
    return janjiJsPdf;
  }

  var janjiLogo = null;
  /** Memuat logo sekali (data URL) untuk disematkan ke PDF; null bila gagal -- cover tetap dibuat tanpa logo. */
  function muatLogo() {
    if (janjiLogo) return janjiLogo;
    janjiLogo = fetch(URL_LOGO, { cache: 'force-cache' }).then(function (r) {
      if (!r.ok) throw new Error('logo ' + r.status);
      return r.blob();
    }).then(function (b) {
      return new Promise(function (ok, gagal) {
        var fr = new FileReader();
        fr.onload = function () { ok(String(fr.result)); };
        fr.onerror = function () { gagal(new Error('logo')); };
        fr.readAsDataURL(b);
      });
    }).catch(function () { janjiLogo = null; return null; });
    return janjiLogo;
  }

  global.djpmCover = {
    muatLogo: muatLogo,
    bersihkanTeks: bersihkanTeks,
    gambarCover: gambarCover,
    bangunPdf: bangunPdf,
    MAKS_HALAMAN_PER_BERKAS: MAKS_HALAMAN_PER_BERKAS
  };

  // =============================================================================================
  // BAGIAN LAYAR (hanya di peramban pada aplikasi; tidak dijalankan di Node)
  // =============================================================================================
  if (typeof document === 'undefined' || !document.getElementById) return;

  var ID_TOMBOL_SEMUA = 'btn-unduh-cover-semua';
  var ID_DIALOG = 'dialog-cover-berkas';
  var KELAS_TOMBOL_BARIS = 'mr-2 align-middle text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 hover:bg-sky-200 transition';
  var KELAS_TOMBOL_SEMUA = 'px-4 py-2.5 bg-sky-600 hover:bg-sky-700 active:scale-95 text-white rounded-xl text-xs font-semibold transition shadow-sm';
  var KELAS_TOMBOL_TUTUP = 'px-4 py-2.5 bg-slate-200 hover:bg-slate-300 active:scale-95 text-slate-700 rounded-xl text-xs font-semibold transition';

  var sedangMenyusun = false;
  var batalkan = false;
  var pengamat = null;

  function $(id) { return document.getElementById(id); }
  function toast(pesan, jenis, durasi) {
    if (typeof tampilkanToast === 'function') tampilkanToast(pesan, jenis || 'info', { durasi: durasi || 6000 });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function wib() { return new Date(Date.now() + 7 * 3600000); }
  function tanggalIso() { var d = wib(); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function waktuTampil() {
    var d = wib();
    return pad(d.getUTCDate()) + '-' + pad(d.getUTCMonth() + 1) + '-' + d.getUTCFullYear() + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' WIB';
  }
  function sesiAda() { return typeof dataPengguna !== 'undefined' && !!dataPengguna && !!dataPengguna.token; }
  function bolehMemakai() { return sesiAda() && String(dataPengguna.role || '').toUpperCase() !== 'MUI'; }
  function tahunData() {
    var t = null;
    try { if (global._tahunDipilihGetter) t = global._tahunDipilihGetter(); } catch (_e) { t = null; }
    if (!t) { try { if (global._tahunAktifGetter) t = global._tahunAktifGetter(); } catch (_e2) { t = null; } }
    return t || '';
  }
  /** Baris Data Detail yang sedang tampil (sudah dibatasi hak akses oleh server). null bila belum dimuat. */
  function barisLayar() {
    try { return (typeof _ddRows !== 'undefined' && Array.isArray(_ddRows)) ? _ddRows : null; } catch (_e) { return null; }
  }
  function namaAman(t, maks) {
    var s = String(t == null ? '' : t), out = '', adaStrip = true;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i), kode = s.charCodeAt(i);
      var huruf = (kode >= 48 && kode <= 57) || (kode >= 65 && kode <= 90) || (kode >= 97 && kode <= 122);
      if (huruf) { out += c; adaStrip = false; } else if (!adaStrip) { out += '-'; adaStrip = true; }
    }
    out = out.replace(/-+$/, '');
    return out.slice(0, maks || 40).replace(/-+$/, '');
  }

  function simpanPdf(doc, nama) {
    doc.save(nama);
  }

  function siapkan() {
    return Promise.all([muatJsPdf(), muatLogo()]).then(function (h) { return { lib: h[0], logo: h[1] }; });
  }
  function opsiCover(logo, judul) {
    return { tahun: tahunData(), pencetak: (dataPengguna && dataPengguna.username) || '', waktu: waktuTampil(), logo: logo, judul: judul };
  }

  // ------------------------------- Unduh satu penerima -------------------------------
  function unduhSatu(nik, nama, tombol) {
    if (sedangMenyusun) { toast('Sedang menyusun cover lain, tunggu sebentar.', 'info', 3500); return; }
    if (!bolehMemakai()) { toast('Sesi berakhir. Silakan masuk kembali.', 'gagal'); return; }
    var daftar = barisLayar();
    var p = null;
    if (daftar) { for (var i = 0; i < daftar.length; i++) { if (String(daftar[i].nik) === String(nik)) { p = daftar[i]; break; } } }
    if (!p) { toast('Data penerima tidak ditemukan di tabel. Muat ulang Data Detail lalu coba lagi.', 'gagal'); return; }
    // Pengaman salah-orang: NIK dibaca dari kolom tabel, jadi nama di baris harus sama dengan nama data yang ditemukan.
    if (String(p.nama == null ? '' : p.nama).trim() !== String(nama == null ? '' : nama).trim()) { toast('Data di tabel berubah. Muat ulang Data Detail lalu coba lagi.', 'gagal'); return; }
    sedangMenyusun = true; aturTombol(true, tombol);
    var teksAsli = tombol ? tombol.textContent : '';
    if (tombol) tombol.textContent = '...';
    siapkan().then(function (s) {
      if (!bolehMemakai()) throw new Error('Sesi berakhir. Silakan masuk kembali.');
      var nama = 'Cover-Berkas_' + (namaAman(p.nama, 40) || 'PENERIMA') + '_' + (namaAman(p.nik, 20) || 'NIK') + '.pdf';
      var doc = bangunPdf(s.lib, [p], opsiCover(s.logo, nama.replace(/\.pdf$/, '')));
      simpanPdf(doc, nama);
      toast('Cover ' + bersihkanTeks(p.nama) + ' diunduh.', 'sukses', 3500);
    }).catch(function (e) {
      toast('Gagal membuat cover: ' + ((e && e.message) || 'kesalahan tak dikenal'), 'gagal');
    }).then(function () {
      sedangMenyusun = false; aturTombol(false, tombol);
      if (tombol) tombol.textContent = teksAsli;
    });
  }

  function aturTombol(nonaktif, tombolAktif) {
    var semua = document.querySelectorAll('[data-cover-nik], #' + ID_TOMBOL_SEMUA);
    for (var i = 0; i < semua.length; i++) {
      semua[i].disabled = !!nonaktif;
      semua[i].style.opacity = nonaktif ? '0.6' : '';
      semua[i].style.cursor = nonaktif ? 'wait' : '';
    }
  }

  // ------------------------------- Unduh keseluruhan -------------------------------
  function nilaiUnik(daftar, kunci) {
    var peta = {}, hasil = [];
    for (var i = 0; i < daftar.length; i++) {
      var v = String(daftar[i][kunci] == null ? '' : daftar[i][kunci]).trim();
      if (v && !Object.prototype.hasOwnProperty.call(peta, v)) { peta[v] = true; hasil.push(v); }
    }
    hasil.sort(function (a, b) { return a.localeCompare(b, 'id', { sensitivity: 'base', numeric: true }); });
    return hasil;
  }
  function saring(daftar, kec, lay) {
    return daftar.filter(function (r) {
      return (!kec || String(r.kecamatan == null ? '' : r.kecamatan).trim() === kec) &&
             (!lay || String(r.layanan == null ? '' : r.layanan).trim() === lay);
    });
  }
  function el(tag, kelas, teks) {
    var e = document.createElement(tag);
    if (kelas) e.className = kelas;
    if (teks != null) e.textContent = teks;
    return e;
  }
  function isiPilihan(sel, teksSemua, nilai) {
    sel.appendChild(new Option(teksSemua, ''));
    nilai.forEach(function (v) { sel.appendChild(new Option(v, v)); });
  }

  var pembukaDialog = null;      // elemen yang memicu dialog; fokus dikembalikan ke sana saat dialog ditutup
  function tutupDialog() {
    var d = $(ID_DIALOG);
    if (d && d.parentNode) d.parentNode.removeChild(d);
    document.removeEventListener('keydown', tekanTombolDialog, true);
    if (pembukaDialog && pembukaDialog.isConnected && !pembukaDialog.disabled) { try { pembukaDialog.focus(); } catch (_e) { /* abaikan */ } }
    pembukaDialog = null;
  }
  function tekanTombolDialog(e) {
    if (e.key === 'Escape' && !sedangMenyusun) { e.stopPropagation(); tutupDialog(); }
  }

  function bukaDialogSemua() {
    if (!bolehMemakai()) { toast('Sesi berakhir. Silakan masuk kembali.', 'gagal'); return; }
    var daftar = barisLayar();
    if (!daftar || daftar.length === 0) { toast('Belum ada data Data Detail yang bisa dibuatkan cover. Tunggu tabel selesai dimuat.', 'info'); return; }
    if ($(ID_DIALOG)) return;
    pembukaDialog = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;

    var latar = el('div', 'fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4');
    latar.id = ID_DIALOG;
    latar.setAttribute('role', 'dialog');
    latar.setAttribute('aria-modal', 'true');
    latar.setAttribute('aria-labelledby', 'cover-judul');
    var kotak = el('div', 'bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-5');
    kotak.appendChild(el('h3', 'text-sm font-bold text-slate-800 uppercase tracking-wide', 'Unduh Cover Berkas Penerima')).id = 'cover-judul';
    kotak.appendChild(el('p', 'text-xs text-slate-500 mt-1', 'Satu halaman A4 per penerima: judul dan data penerima. Data sesuai tabel Data Detail yang sedang tampil.'));

    var labelKec = el('label', 'block text-xs font-semibold text-slate-600 mt-4', 'Kecamatan');
    var selKec = el('select', 'mt-1 w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-white');
    labelKec.appendChild(selKec);
    var labelLay = el('label', 'block text-xs font-semibold text-slate-600 mt-3', 'Layanan');
    var selLay = el('select', 'mt-1 w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-white');
    labelLay.appendChild(selLay);
    var daftarKec = nilaiUnik(daftar, 'kecamatan'), daftarLay = nilaiUnik(daftar, 'layanan');
    isiPilihan(selKec, 'Semua kecamatan', daftarKec);
    isiPilihan(selLay, 'Semua layanan', daftarLay);
    if (daftarKec.length === 1) selKec.value = daftarKec[0];
    kotak.appendChild(labelKec); kotak.appendChild(labelLay);

    var info = el('p', 'text-xs font-semibold text-slate-700 mt-4');
    var catatan = el('p', 'text-[11px] text-slate-500 mt-1', 'Cetak di kertas A4.');
    var progres = el('p', 'text-[11px] text-sky-700 mt-2 hidden');
    kotak.appendChild(info); kotak.appendChild(catatan); kotak.appendChild(progres);

    var baris = el('div', 'flex justify-end gap-2 mt-5');
    var btnBatal = el('button', KELAS_TOMBOL_TUTUP, 'Batal'); btnBatal.type = 'button';
    var btnUnduh = el('button', KELAS_TOMBOL_SEMUA, 'Unduh'); btnUnduh.type = 'button';
    baris.appendChild(btnBatal); baris.appendChild(btnUnduh);
    kotak.appendChild(baris);
    latar.appendChild(kotak);

    function terpilih() { return saring(daftar, selKec.value, selLay.value); }
    function perbarui() {
      var n = terpilih().length;
      var bagian = Math.ceil(n / MAKS_HALAMAN_PER_BERKAS);
      info.textContent = n === 0 ? 'Tidak ada penerima untuk pilihan ini.'
        : n + ' penerima akan dibuatkan cover' + (bagian > 1 ? ' (dipecah menjadi ' + bagian + ' berkas PDF, maks. ' + MAKS_HALAMAN_PER_BERKAS + ' halaman per berkas). Bila peramban menanyakan izin mengunduh beberapa berkas, pilih Izinkan' : '') + '.';
      btnUnduh.disabled = n === 0 || sedangMenyusun;
      btnUnduh.style.opacity = btnUnduh.disabled ? '0.6' : '';
    }
    selKec.addEventListener('change', perbarui);
    selLay.addEventListener('change', perbarui);
    perbarui();

    btnBatal.addEventListener('click', function () {
      if (sedangMenyusun) { batalkan = true; btnBatal.textContent = 'Membatalkan...'; btnBatal.disabled = true; return; }
      tutupDialog();
    });
    latar.addEventListener('mousedown', function (e) { if (e.target === latar && !sedangMenyusun) tutupDialog(); });
    btnUnduh.addEventListener('click', function () { jalankanSemua(terpilih(), selKec.value, selLay.value, { btnUnduh: btnUnduh, btnBatal: btnBatal, progres: progres, selKec: selKec, selLay: selLay, perbarui: perbarui }); });

    document.body.appendChild(latar);
    document.addEventListener('keydown', tekanTombolDialog, true);
    selKec.focus();
  }

  function jalankanSemua(daftar, kec, lay, ui) {
    if (sedangMenyusun || daftar.length === 0) return;
    if (!bolehMemakai()) { toast('Sesi berakhir. Silakan masuk kembali.', 'gagal'); return; }
    sedangMenyusun = true; batalkan = false; aturTombol(true);
    ui.btnUnduh.disabled = true; ui.selKec.disabled = true; ui.selLay.disabled = true;
    ui.btnBatal.textContent = 'Batalkan';
    ui.progres.classList.remove('hidden');
    ui.progres.textContent = 'Menyiapkan pustaka PDF...';

    var jumlahBagian = Math.ceil(daftar.length / MAKS_HALAMAN_PER_BERKAS);
    var dasarNama = 'Cover-Berkas_' + (kec ? namaAman(kec, 30) : 'SEMUA-KECAMATAN') + '_' + (lay ? namaAman(lay, 30) : 'SEMUA-LAYANAN') + '_' + tanggalIso();
    var totalSelesai = 0;

    function akhiri(pesan, jenis) {
      sedangMenyusun = false; batalkan = false; aturTombol(false);
      tutupDialog();
      if (pesan) toast(pesan, jenis || 'info', 7000);
    }

    siapkan().then(function (s) {
      function bagian(n) {
        if (n >= jumlahBagian) { akhiri('Selesai: ' + totalSelesai + ' cover diunduh' + (jumlahBagian > 1 ? ' dalam ' + jumlahBagian + ' berkas PDF.' : '.'), 'sukses'); return null; }
        if (!bolehMemakai()) { akhiri('Dihentikan: sesi berakhir. ' + totalSelesai + ' cover sudah diunduh.', 'gagal'); return null; }
        var potongan = daftar.slice(n * MAKS_HALAMAN_PER_BERKAS, (n + 1) * MAKS_HALAMAN_PER_BERKAS);
        var nama = dasarNama + (jumlahBagian > 1 ? '_bagian-' + (n + 1) + '-dari-' + jumlahBagian : '') + '.pdf';
        return bangunPdfBertahap(s.lib, potongan, opsiCover(s.logo, nama.replace(/\.pdf$/, '')), function (i) {
          ui.progres.textContent = 'Menyusun cover ' + (totalSelesai + i) + ' dari ' + daftar.length + (jumlahBagian > 1 ? ' (berkas ' + (n + 1) + '/' + jumlahBagian + ')' : '') + '...';
        }, function () { return batalkan; }).then(function (doc) {
          if (!doc) { akhiri('Dibatalkan. ' + totalSelesai + ' cover sudah diunduh.', 'info'); return null; }
          simpanPdf(doc, nama);
          totalSelesai += potongan.length;
          return new Promise(function (ok) { setTimeout(ok, 700); }).then(function () { return bagian(n + 1); });
        });
      }
      return bagian(0);
    }).catch(function (e) {
      akhiri('Gagal membuat cover: ' + ((e && e.message) || 'kesalahan tak dikenal') + (totalSelesai ? ' (' + totalSelesai + ' cover sudah diunduh)' : ''), 'gagal');
    });
  }

  // ------------------------------- Pemasangan ke layar Data Detail -------------------------------
  function hiasBaris(tr) {
    if (!tr || tr.nodeName !== 'TR' || tr.getAttribute('data-cover') === '1') return;
    var sel = tr.children;
    if (!sel || sel.length < 3) return;                         // baris pesan/sentinel (satu sel lebar)
    var nik = String(sel[2].textContent || '').trim();
    if (!nik || nik === '-') return;
    tr.setAttribute('data-cover', '1');
    var b = el('button', KELAS_TOMBOL_BARIS, 'Cover');
    b.type = 'button';
    b.setAttribute('data-cover-nik', nik);
    b.setAttribute('data-cover-nama', String(sel[1].textContent || '').trim());
    b.title = 'Unduh cover berkas PDF untuk penerima ini';
    b.setAttribute('aria-label', 'Unduh cover berkas ' + String(sel[1].textContent || '').trim());
    if (sedangMenyusun) { b.disabled = true; b.style.opacity = '0.6'; }
    // Di AWAL sel Nama (bukan di akhir): sel ini dibatasi lebarnya dan teksnya terpotong, jadi tombol di akhir
    // bisa tergeser keluar sel dan tak bisa diklik pada nama yang panjang.
    sel[1].insertBefore(b, sel[1].firstChild);
  }

  function pasangTombolFooter() {
    if ($(ID_TOMBOL_SEMUA)) return;
    var modal = $('modal-data-detail');
    if (!modal) return;
    var tutup = null, tombol = modal.querySelectorAll('button');
    for (var i = tombol.length - 1; i >= 0; i--) {
      if (String(tombol[i].textContent || '').trim() === 'Tutup') { tutup = tombol[i]; break; }
    }
    if (!tutup || !tutup.parentNode) return;
    var btn = el('button', KELAS_TOMBOL_SEMUA, 'Unduh Cover PDF');
    btn.type = 'button';
    btn.id = ID_TOMBOL_SEMUA;
    btn.title = 'Unduh cover berkas PDF untuk seluruh penerima (bisa dipersempit per kecamatan/layanan)';
    btn.addEventListener('click', bukaDialogSemua);
    var bungkus = el('div', 'ml-auto flex items-center gap-2');
    tutup.parentNode.insertBefore(bungkus, tutup);
    bungkus.appendChild(btn);
    bungkus.appendChild(tutup);
  }

  function pasang() {
    if (!bolehMemakai()) return;
    var tbody = $('body-tabel-data-detail');
    if (!tbody) return;
    pasangTombolFooter();
    var barisAda = tbody.querySelectorAll('tr');
    for (var i = 0; i < barisAda.length; i++) hiasBaris(barisAda[i]);
    if (pengamat) return;
    if (typeof MutationObserver !== 'undefined') {
      pengamat = new MutationObserver(function (catatanPerubahan) {
        for (var a = 0; a < catatanPerubahan.length; a++) {
          var tambah = catatanPerubahan[a].addedNodes;
          for (var b = 0; b < tambah.length; b++) hiasBaris(tambah[b]);
        }
      });
      pengamat.observe(tbody, { childList: true });
    }
    tbody.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-cover-nik]') : null;
      if (!t || t.disabled) return;
      e.preventDefault(); e.stopPropagation();
      unduhSatu(t.getAttribute('data-cover-nik'), t.getAttribute('data-cover-nama'), t);
    });
  }

  pasang();
})(typeof window !== 'undefined' ? window : globalThis);
