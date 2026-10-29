/**
 * public/js/app-capaian-input-pdf.js
 * Penggambar PDF "Laporan Capaian Input" (jsPDF, vektor). Dimuat malas oleh app-capaian-input.js hanya saat
 * tombol Unduh PDF diklik (HANYA Admin Utama). Murni fungsi: terima model getCapaianInput -> kembalikan doc.
 * Isi, urutan, warna & ambang SAMA dengan layar (app-capaian-input.js). Rancangan: plans/plan-progres-capaian-input.md
 *
 * PDF = persis apa yang sedang TERBUKA di layar (tanpa pilihan cakupan terpisah). Parameter `tampilan`:
 *   { bagian: 'A' | 'B', kec: '' | 'MEDAN X', terbuka: ['MEDAN Y', ...] }
 *   - kec '' + A : ringkasan + matriks A (+ satu halaman rincian kelurahan untuk tiap kecamatan yang sedang dibuka)
 *   - kec '' + B : ringkasan + matriks B
 *   - kec X  + A : ringkasan kecamatan X + tabel seluruh kelurahannya
 *   - kec X  + B : ringkasan kecamatan X + satu baris Kemenag kecamatan X
 * Selalu A4 landscape.
 * Gotcha jsPDF: warna isi & teks memakai operator berbeda tetapi isi() harus dipanggil tepat sebelum tiap bentuk.
 */
(function () {
  'use strict';

  var NAMA_PROGRAM = 'Data Penerima Dana Jasa Pelayanan Kepada Warga Pelayan Masyarakat Kota Medan Tahun 2027';

  // [warna isi, warna teks] -- ambang sama dengan warnaProgresKuota (app-admin.js)
  var WARNA = {
    w0: ['#fef2f2', '#b91c1c'], w1: ['#fff7ed', '#c2410c'], w2: ['#fefce8', '#a16207'],
    w3: ['#f0fdf4', '#16a34a'], w4: ['#dcfce7', '#15803d'], abu: ['#f1f5f9', '#64748b'],
    biasa: ['#ffffff', '#0f172a'], total: ['#f1f5f9', '#0f172a'], nol: ['#ffffff', '#b91c1c'], belum: ['#fef2f2', '#b91c1c']
  };

  function latin(v) { return String(v == null ? '' : v).replace(/[^\x20-\x7E -ÿ]/g, ''); }
  function rgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function angka(n) {
    var x = Math.round(Number(n) || 0);
    return (x < 0 ? '-' : '') + String(Math.abs(x)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function persenDari(i, k) { return k > 0 ? Math.round((i / k) * 1000) / 10 : 0; }
  function tPersen(p) { return String(p).replace('.', ',') + '%'; }
  function kelasWarna(p) { return p >= 100 ? 'w4' : p >= 75 ? 'w3' : p >= 50 ? 'w2' : p >= 25 ? 'w1' : 'w0'; }
  function ada(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /** Waktu server -> WIB (UTC+7) tanpa bergantung zona waktu perangkat. */
  function wib(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) d = new Date();
    var g = new Date(d.getTime() + 7 * 3600000), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return { tgl: p(g.getUTCDate()) + '/' + p(g.getUTCMonth() + 1) + '/' + g.getUTCFullYear(), jam: p(g.getUTCHours()) + ':' + p(g.getUTCMinutes()),
      iso: g.getUTCFullYear() + '-' + p(g.getUTCMonth() + 1) + '-' + p(g.getUTCDate()) };
  }
  function slug(t) { return String(t || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  function namaBerkas(model, tampilan) {
    var kec = tampilan && tampilan.kec && model.kecamatan.indexOf(tampilan.kec) >= 0 ? slug(tampilan.kec) : 'SEMUA-KECAMATAN';   // sama dengan normalisasi di gambar()
    var bag = tampilan && tampilan.bagian === 'B' ? 'LAYANAN-KEMENAG' : 'LAYANAN-KECAMATAN';
    return 'Laporan-Capaian-Input-DJPM-2027_' + kec + '_' + bag + '_' + wib(model.diperbarui).iso + '.pdf';
  }

  function gambar(lib, model, tampilan, pencetak) {
    tampilan = tampilan || {};
    var bagian = tampilan.bagian === 'B' ? 'B' : 'A';
    var kecT = tampilan.kec && model.kecamatan.indexOf(tampilan.kec) >= 0 ? tampilan.kec : '';
    var terbuka = model.kecamatan.filter(function (k) { return (tampilan.terbuka || []).indexOf(k) >= 0; });   // urutan resmi, tanpa duplikat
    var doc = new lib.jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape', compress: true });
    var judulDoc = namaBerkas(model, { bagian: bagian, kec: kecT }).replace(/\.pdf$/, '');
    doc.setProperties({ title: judulDoc, subject: 'Laporan Capaian Input DJPM 2027', creator: 'Aplikasi DJPM 2027' });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    var ML = 30, CW = W - 2 * ML, ATAS = 30, BAWAH = H - 36;
    var waktu = wib(model.diperbarui);
    var y = ATAS;

    function isi(h) { var c = rgb(h); doc.setFillColor(c[0], c[1], c[2]); }
    function garis(h) { var c = rgb(h); doc.setDrawColor(c[0], c[1], c[2]); }
    function tinta(h) { var c = rgb(h); doc.setTextColor(c[0], c[1], c[2]); }
    function huruf(tebal, ukuran, miring) { doc.setFont('helvetica', miring ? 'italic' : (tebal ? 'bold' : 'normal')); doc.setFontSize(ukuran); }

    function kepalaHalaman(judul, sub) {
      huruf(true, 12.5); tinta('#0f172a'); doc.text(latin(judul), ML, y + 10);
      huruf(false, 7.5); tinta('#475569');
      var ket = NAMA_PROGRAM + '  |  Data per ' + waktu.tgl + ' ' + waktu.jam + ' WIB' + (sub ? '  |  ' + sub : '');
      doc.text(latin(ket), ML, y + 21);
      y += 28; garis('#0f172a'); doc.setLineWidth(1.2); doc.line(ML, y, W - ML, y); y += 8;
    }
    function halamanBaru() { doc.addPage(); y = ATAS; }

    /** Sel berwarna: dua baris (utama + kecil) bila ada `kecil`, selain itu satu baris. */
    function sel(x, yy, w, h, c, ukuran) {
      var wr = WARNA[c.k || 'biasa'];
      isi(wr[0]); garis('#cbd5e1'); doc.setLineWidth(0.4); doc.rect(x, yy, w, h, 'FD');
      tinta(wr[1]);
      var rata = c.kiri ? 'left' : 'center', tx = c.kiri ? x + 4 : x + w / 2;
      huruf(c.tebal !== false && (c.tebal || c.kecil || c.k === 'total'), ukuran);
      var t = latin(c.t);
      if (c.kiri) {
        var uk = ukuran;
        while (uk > 5.2 && doc.getTextWidth(t) > w - 7) { uk -= 0.3; doc.setFontSize(uk); }
        if (doc.getTextWidth(t) > w - 7) { while (t.length > 3 && doc.getTextWidth(t + '..') > w - 7) t = t.slice(0, -1); t += '..'; }
      }
      if (c.kecil) {
        doc.text(t, tx, yy + h * 0.46, { align: rata });
        huruf(false, ukuran - 1.3); doc.text(latin(c.kecil), tx, yy + h * 0.86, { align: rata });
      } else {
        doc.text(t, tx, c.sub ? yy + 8.2 : yy + h / 2 + ukuran * 0.35, { align: rata });
      }
      if (c.sub) { huruf(false, 5.6); doc.text(latin(c.sub), tx, yy + h - 3, { align: rata }); }
    }

    /** Tabel dengan kepala berulang di tiap halaman. baris: [[sel,...],...]; tinggi baris per elemen (tinggi). */
    function tabel(kepala, lebar, baris, opsi) {
      var uk = opsi.ukuran || 6.8, hk;
      kepala = kepala.map(function (t) { return String(t).split('/').join('/ '); });   // titik putus baris setelah garis miring
      function gambarKepala() {
        huruf(true, 6.4);
        var maks = 1;
        kepala.forEach(function (t, i) { maks = Math.max(maks, doc.splitTextToSize(latin(t), lebar[i] - 4).length); });
        hk = maks * 7.6 + 7;
        var x = ML;
        kepala.forEach(function (t, i) {
          isi('#1e293b'); garis('#1e293b'); doc.setLineWidth(0.4); doc.rect(x, y, lebar[i], hk, 'FD');
          tinta('#ffffff'); huruf(true, 6.4);
          var baris2 = doc.splitTextToSize(latin(t), lebar[i] - 4);
          var ty = y + (hk - baris2.length * 7.6) / 2 + 6.2;
          baris2.forEach(function (b, bi) { doc.text(b, i === 0 ? x + 4 : x + lebar[i] / 2, ty + bi * 7.6, { align: i === 0 ? 'left' : 'center' }); });
          x += lebar[i];
        });
        y += hk;
      }
      gambarKepala();
      baris.forEach(function (b) {
        var h = b.tinggi || opsi.tinggi;
        if (y + h > BAWAH) { halamanBaru(); gambarKepala(); }
        var x = ML;
        b.sel.forEach(function (c, i) { sel(x, y, lebar[i], h, c, uk); x += lebar[i]; });
        y += h;
      });
    }

    function legenda(pakai) {
      if (y + 24 > BAWAH) halamanBaru();      // keterangan (±23 pt) tidak boleh menimpa kaki halaman
      y += 7; huruf(false, 6.6);
      var x = ML;
      function kotak(k, teks) {
        isi(WARNA[k][0]); garis('#94a3b8'); doc.setLineWidth(0.4); doc.rect(x, y - 5.6, 7, 7, 'FD');
        tinta('#475569'); huruf(false, 6.6); doc.text(latin(teks), x + 10, y);
        x += 10 + doc.getTextWidth(latin(teks)) + 9;
      }
      if (pakai.kuota) { kotak('w0', 'Di bawah 25%'); kotak('w1', '25-49%'); kotak('w2', '50-74%'); kotak('w3', '75-99%'); kotak('w4', '100% ke atas'); }
      if (pakai.tanpaKuota) kotak('abu', 'Tanpa kuota (layanan ini tidak memiliki kuota di kecamatan tersebut)');
      if (pakai.kelurahan) kotak('belum', 'Merah = kelurahan belum ada input sama sekali');
      y += 10; tinta('#475569'); huruf(false, 6.6);
      doc.text(pakai.kelurahan
        ? 'Angka = jumlah input (semua status verifikasi). Kuota hanya tersedia di tingkat kecamatan.'
        : pakai.catatan || latin('"0" = belum ada input. Format sel: input/kuota, di bawahnya persen capaian.'), ML, y);
      y += 6;
    }

    // ---- sel dari model (sama dengan layar) ----
    function sKuota(input, kuota, kuotaAda, tebal) {
      if (!kuotaAda) return { t: angka(input), k: 'abu', tebal: !!tebal };
      var p = persenDari(input, kuota);
      return { t: angka(input) + '/' + angka(kuota), kecil: tPersen(p), k: kelasWarna(p), tebal: true };
    }
    function agg(kec, daftar) {
      var t = { i: 0, q: 0, ada: false };
      daftar.forEach(function (l) {
        var k = l + '||' + kec; t.i += model.input[k] || 0;
        if (ada(model.kuota, k)) { t.q += model.kuota[k]; t.ada = true; }
      });
      return t;
    }
    function aggLay(l) {
      var t = { i: 0, q: 0, ada: false };
      model.kecamatan.forEach(function (kec) {
        var k = l + '||' + kec; t.i += model.input[k] || 0;
        if (ada(model.kuota, k)) { t.q += model.kuota[k]; t.ada = true; }
      });
      return t;
    }
    function lebarMatriks(n, lebarNama, lebarTotal) { var sisa = CW - lebarNama - lebarTotal, w = [lebarNama]; for (var i = 0; i < n; i++) w.push(sisa / n); w.push(lebarTotal); return w; }

    function matriks(layanan, hanya) {
      var barisT = [], adaTanpa = false;
      (hanya ? [hanya] : model.kecamatan).forEach(function (kec) {
        var sels = [{ t: kec, kiri: true, tebal: true }];
        layanan.forEach(function (l) {
          var k = l + '||' + kec, a = ada(model.kuota, k);
          if (!a) adaTanpa = true;
          sels.push(sKuota(model.input[k] || 0, model.kuota[k] || 0, a));
        });
        var tk = agg(kec, layanan); sels.push(sKuota(tk.i, tk.q, tk.ada));
        barisT.push({ sel: sels });
      });
      if (!hanya) {       // satu kecamatan: barisnya sendiri sudah totalnya (sama dengan layar)
        var tot = [{ t: 'TOTAL KOTA', kiri: true, k: 'total' }], semua = { i: 0, q: 0, ada: false };
        layanan.forEach(function (l) {
          var t = aggLay(l); semua.i += t.i; semua.q += t.q; semua.ada = semua.ada || t.ada;
          tot.push(sKuota(t.i, t.q, t.ada));
        });
        tot.push(sKuota(semua.i, semua.q, semua.ada));
        barisT.push({ sel: tot });
      }
      tabel(['KECAMATAN'].concat(layanan).concat(['TOTAL']), lebarMatriks(layanan.length, 92, 62), barisT, { tinggi: 17, ukuran: 6.8 });
      legenda({ kuota: true, tanpaKuota: adaTanpa });
    }

    function rincian(kec) {
      var layanan = model.layananKecamatan;
      var daftar = (model.kelurahan[kec] || []).concat((model.tidakTerdaftar && model.tidakTerdaftar[kec]) || []);
      var barisT = daftar.map(function (kel) {
        var belum = kel.total === 0;
        var sels = [{ t: kel.nama, kiri: true, tebal: true, k: belum ? 'belum' : 'biasa', sub: belum ? 'Belum ada input' : (kel.tidakTerdaftar ? 'Tidak ada di daftar kelurahan' : '') }];
        layanan.forEach(function (l) {
          var n = kel.perLayanan[l] || 0;
          sels.push({ t: angka(n), k: belum ? 'belum' : (n === 0 ? 'nol' : 'biasa'), tebal: n === 0 });
        });
        sels.push({ t: angka(kel.total), k: belum ? 'belum' : 'biasa', tebal: belum });
        return { sel: sels, tinggi: belum ? 20 : 15 };
      });
      var adaTanpa = false, tot = [{ t: 'TOTAL KECAMATAN', kiri: true, k: 'total' }];
      layanan.forEach(function (l) {
        var k = l + '||' + kec, a = ada(model.kuota, k);
        if (!a) adaTanpa = true;
        tot.push(sKuota(model.input[k] || 0, model.kuota[k] || 0, a));
      });
      var tk = agg(kec, layanan); tot.push(sKuota(tk.i, tk.q, tk.ada));
      barisT.push({ sel: tot, tinggi: 19 });
      tabel(['KELURAHAN'].concat(layanan).concat(['TOTAL']), lebarMatriks(layanan.length, 96, 62), barisT, { tinggi: 15, ukuran: 6.8 });
      legenda({ kuota: true, kelurahan: true, tanpaKuota: adaTanpa });
    }

    function kpi(kec) {
      // seluruh kota, atau HANYA kecamatan terpilih (rumus sama dengan layar)
      var a, b, belum, jml;
      if (kec) {
        var ta = agg(kec, model.layananKecamatan), tb = agg(kec, model.layananKemenag), dk = model.kelurahan[kec] || [];
        a = { totalInput: ta.i, totalKuota: ta.q, persen: persenDari(ta.i, ta.q) };
        b = { totalInput: tb.i, totalKuota: tb.q, persen: persenDari(tb.i, tb.q) };
        belum = dk.filter(function (k) { return k.total === 0; }).length; jml = dk.length;
      } else {
        a = model.ringkasan.kecamatan; b = model.ringkasan.kemenag; belum = model.ringkasan.kelurahanBelumInput; jml = model.ringkasan.jumlahKelurahan;
      }
      var totI = a.totalInput + b.totalInput, totQ = a.totalKuota + b.totalKuota;
      var isiKpi = [[angka(totI), 'TOTAL INPUT'], [angka(totQ), 'TOTAL KUOTA'], [tPersen(persenDari(totI, totQ)), kec ? 'CAPAIAN KECAMATAN' : 'CAPAIAN KESELURUHAN'],
        [tPersen(a.persen), 'LAYANAN KECAMATAN'], [tPersen(b.persen), 'LAYANAN KEMENAG'],
        [angka(belum) + ' dari ' + angka(jml), 'KELURAHAN BELUM ADA INPUT']];
      var gap = 6, w = (CW - gap * (isiKpi.length - 1)) / isiKpi.length;
      isiKpi.forEach(function (d, i) {
        var x = ML + i * (w + gap);
        isi('#f8fafc'); garis('#e2e8f0'); doc.setLineWidth(0.5); doc.roundedRect(x, y, w, 32, 3, 3, 'FD');
        huruf(true, 12.5); tinta('#0f172a'); doc.text(latin(d[0]), x + 7, y + 14);
        huruf(true, 5.8); tinta('#64748b'); doc.text(latin(d[1]), x + 7, y + 25);
      });
      y += 32 + 9;
    }

    function subJudul(t) { huruf(true, 9); tinta('#0f172a'); doc.text(latin(t), ML, y + 8); y += 13; }

    // ---- Susun sesuai tampilan layar ----
    kepalaHalaman('LAPORAN CAPAIAN INPUT', kecT ? 'Cakupan: ' + kecT : 'Cakupan: Seluruh Kecamatan');
    kpi(kecT);
    if (bagian === 'A') {
      subJudul('A. LAYANAN KECAMATAN');
      if (kecT) {
        rincian(kecT);                       // satu kecamatan: seluruh kelurahannya
      } else {
        matriks(model.layananKecamatan, '');
        terbuka.forEach(function (kec) {     // rincian kecamatan yang sedang dibuka di layar
          halamanBaru();
          kepalaHalaman('RINCIAN KELURAHAN - ' + kec, 'Layanan Kecamatan');
          rincian(kec);
        });
      }
    } else {
      subJudul('B. LAYANAN KEMENAG');
      matriks(model.layananKemenag, kecT);
    }

    // Kaki halaman di setiap halaman
    var n = doc.getNumberOfPages();
    var kaki = 'Dicetak dari Aplikasi DJPM 2027' + (pencetak ? ' oleh ' + latin(pencetak).slice(0, 40) : '') + ' | ' + waktu.tgl + ' ' + waktu.jam + ' WIB';
    for (var p = 1; p <= n; p++) {
      doc.setPage(p); huruf(false, 7); tinta('#475569');
      doc.text(kaki, ML, H - 20);
      doc.text('Halaman ' + p + ' dari ' + n, W - ML, H - 20, { align: 'right' });
    }
    return doc;
  }

  window.DJPMCapaianPdf = { gambar: gambar, namaBerkas: namaBerkas };
})();
