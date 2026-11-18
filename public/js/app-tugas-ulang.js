/**
 * public/js/app-tugas-ulang.js
 * Verifikasi ULANG untuk akun VERIFIKATOR, di dalam halaman DETAIL biasa (dibuka dengan mengklik nama di tab Verifikasi Ulang; app-tab-tugas.js). Rencana: plans/plan-verifikasi-ulang.md.
 * Dimuat malas hanya untuk role VERIFIKATOR (SKRIP_PER_PERAN di app-pesan-periode.js).
 *
 * Yang dikerjakan petugas: membuka Detail data tugasnya, mengklik tiap berkas yang diunggah, mencentang berkas yang sudah diperiksa,
 * lalu memilih "Sesuai" atau "Koreksi status" di kotak Verifikasi Ulang pada bagian bawah Detail. SERVER yang menegakkan semua aturan (pemilik tugas,
 * berkas wajib diklik, centang lengkap, status yang boleh, waktu tersimpan); modul ini hanya menampilkan dan meniru pesan agar petugas tahu apa yang kurang sebelum menekan Simpan.
 * Satu data dihitung satu kali. Semua teks dari server dipasang lewat esc().
 */
(function (akar, pabrik) {
  var api = pabrik(akar);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else akar.djpmTugasUlang = api;
})(typeof self !== 'undefined' ? self : this, function (akar) {
  'use strict';

  // ------------------------------------------------------------------ bagian murni (diuji di Node)
  var MS = 'Memenuhi Syarat', BTL = 'Berkas Tidak Lengkap', TMS = 'Tidak Memenuhi Syarat';
  var BATAS_PERBAIKAN = '30-11-2026';   // sama dengan BATAS_PERBAIKAN_SERAGAM di server (config.ts); hanya untuk teks dampak

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return (Number(n) || 0).toLocaleString('id-ID'); }

  /** Status tujuan yang boleh dipilih pemeriksa (naik ke Memenuhi Syarat hanya Admin Utama). */
  function statusTujuan(dari) {
    if (dari === MS) return [BTL, TMS];
    if (dari === BTL) return [TMS];
    if (dari === TMS) return [BTL];
    return [];
  }

  function kelasStatus(s) { return s === MS ? 'ms' : (s === BTL ? 'btl' : (s === TMS ? 'tms' : '')); }

  /** Hanya tautan http(s) yang dibuka dari layar ini. */
  function urlBolehDibuka(url) { return /^https?:\/\//i.test(String(url || '').trim()); }

  function dampakKoreksi(dari, ke) {
    if (!ke || ke === dari) return '';
    var t = dari === MS ? 'Data keluar dari calon pembayaran. ' : '';
    if (ke === BTL) return t + 'Penerima diberi batas perbaikan berkas sampai ' + BATAS_PERBAIKAN + '; lewat batas, data otomatis menjadi Tidak Memenuhi Syarat.';
    if (ke === TMS) return t + 'Data dinyatakan Tidak Memenuhi Syarat. Menaikkan kembali hanya dapat dilakukan Admin Utama.';
    return '';
  }

  /** Templat alasan yang boleh tampil: aktif, status sama, dan (semua layanan ATAU layanan penerima termasuk daftarnya). */
  function templatUntuk(daftar, status, layanan) {
    var lay = String(layanan || '').toUpperCase();
    return (daftar || []).filter(function (t) {
      if (!t || t.aktif !== true || t.status !== status) return false;
      var l = Array.isArray(t.layanan) ? t.layanan : [];
      return l.length === 0 || l.indexOf(lay) !== -1;
    });
  }
  function isiTemplat(isi, layanan) { return String(isi || '').split('{LAYANAN}').join(String(layanan || '').toUpperCase()).replace(/\s+/g, ' ').trim(); }

  /**
   * Kesiapan menyimpan (cermin pesan server; server tetap penentu).
   * m: { berkas:[{kunci,label,dibuka}], centang:{kunci:true}, mode:'sesuai'|'koreksi', statusSaatIni, statusBaru, alasan }
   */
  function validasiPeriksa(m) {
    var berkas = m.berkas || [], centang = m.centang || {};
    var belumBuka = berkas.filter(function (b) { return !b.dibuka; });
    if (belumBuka.length) return { ok: false, pesan: 'Klik dan periksa setiap berkas terlebih dahulu. Belum dibuka: ' + belumBuka.map(function (b) { return b.label; }).join(', ') + '.' };
    if (m.mode === 'koreksi') {
      if (statusTujuan(m.statusSaatIni).indexOf(m.statusBaru) === -1) return { ok: false, pesan: 'Pilih status baru.' };
      if (!String(m.alasan || '').trim()) return { ok: false, pesan: 'Alasan koreksi wajib diisi.' };
      return { ok: true, pesan: 'Siap disimpan sebagai koreksi.' };
    }
    var belumCentang = berkas.filter(function (b) { return centang[b.kunci] !== true; });
    if (belumCentang.length) return { ok: false, pesan: 'Centang setiap berkas yang sudah diperiksa. Belum dicentang: ' + belumCentang.map(function (b) { return b.label; }).join(', ') + '.' };
    return { ok: true, pesan: berkas.length ? 'Siap disimpan: semua ' + berkas.length + ' berkas sudah dibuka dan dicentang.' : 'Data ini tidak memiliki berkas unggahan. Siap disimpan.' };
  }

  function kemajuan(sisa, selesai) {
    var total = (Number(sisa) || 0) + (Number(selesai) || 0);
    return { total: total, persen: total ? Math.round((Number(selesai) || 0) * 100 / total) : 0 };
  }

  /** Data input yang harus dicocokkan petugas, dikelompokkan menurut berkas pembandingnya. Nilai kosong ditampilkan sebagai kosong (bukan disembunyikan). */
  function kelompokData(d) {
    d = d || {};
    function b(label, nilai) { return { label: label, nilai: String(nilai == null ? '' : nilai).trim() }; }
    return [
      { judul: 'Identitas', petunjuk: 'cocokkan dengan KTP', baris: [b('Nama', d.nama), b('NIK', d.nik), b('Tempat lahir', d.tempatLahir), b('Tanggal lahir', d.tanggalLahir), b('Umur', d.umur), b('Jenis kelamin', d.jenisKelamin), b('Alamat', d.alamat)] },
      { judul: 'Rekening', petunjuk: 'cocokkan dengan Buku Rekening', baris: [b('Nama rekening', d.namaRekening), b('Nomor rekening', d.nomorRekening), b('Kantor cabang', d.kantorCabang)] },
      { judul: 'Penugasan', petunjuk: 'cocokkan dengan surat, foto, dan rekomendasi', baris: [b('Layanan', d.layanan), b('Tempat tugas', d.tempatTugas), b('Alamat tugas', d.alamatTugas), b('Kecamatan', d.kecamatan), b('Kelurahan', d.kelurahan), b('No. kontak', d.noKontak)] }
    ];
  }

  var api = {
    kelompokData: kelompokData, statusTujuan: statusTujuan, kelasStatus: kelasStatus, urlBolehDibuka: urlBolehDibuka, dampakKoreksi: dampakKoreksi, templatUntuk: templatUntuk,
    isiTemplat: isiTemplat, validasiPeriksa: validasiPeriksa, kemajuan: kemajuan, esc: esc
  };
  if (!akar || !akar.document) return api;   // lingkungan uji Node: hanya bagian murni

  // ------------------------------------------------------------------ tampilan: kotak "Verifikasi Ulang" di halaman Detail
  // Verifikator mengklik nama di tab Verifikasi Ulang -> halaman Detail biasa terbuka (app-transaksi.js). Modul ini menambahkan kotak pemeriksaan di bagian bawah Detail
  // dan kotak centang "Sudah diperiksa" pada tiap baris berkas. Aturan lama tetap: setiap berkas harus DIBUKA (klik "Buka", dicatat server) sebelum bisa dicentang.
  var dok = akar.document;
  var ID_KOTAK = 'djpm-uld-kotak', ID_ATAS = 'djpm-uld-atas', ID_STYLE = 'djpm-uld-style';
  var BATAS_TUNGGU_MS = 40000;
  var st = { penerima: 0, tugasId: 0, detail: null, status: 'idle', pesan: '', centang: {}, mode: 'sesuai', statusBaru: '', alasan: '', simpan: false, pesanSimpan: '', templat: null, antrean: 0, sigTanda: '' };

  function pengguna() { return (typeof dataPengguna !== 'undefined') ? dataPengguna : null; }
  function berhak() { var p = pengguna(); return !!(p && p.token && String(p.role || '').trim().toUpperCase() === 'VERIFIKATOR'); }
  function toast(pesan, jenis) { try { if (typeof tampilkanToast === 'function') tampilkanToast(pesan, jenis || 'gagal', { durasi: 6000 }); } catch (_e) { /* abaikan */ } }
  function tab() { return akar.djpmTabTugas || null; }
  function modeUlang() { var t = tab(); return !!(t && typeof t.modeSekarang === 'function' && t.modeSekarang() === 'ulang'); }
  function tugasIdUntuk(penerima) { var t = tab(); return t && typeof t.tugasIdUntuk === 'function' ? (Number(t.tugasIdUntuk(penerima)) || 0) : 0; }
  function isiDetail() { return dok.getElementById('isi-konten-detail'); }
  function modalTerbuka() { var m = dok.getElementById('modal-detail-penerima'); return !!m && !m.classList.contains('hidden'); }

  /** Satu panggilan server -> Promise; sesi yang berganti selama menunggu dibuang. */
  function rpc(nama, args) {
    var p = pengguna(); var token = p && p.token;
    return new Promise(function (resolve, reject) {
      if (!token) { reject(new Error('Sesi tidak ditemukan.')); return; }
      var selesai = false;
      var timer = setTimeout(function () { akhir(reject, new Error('Waktu tunggu server habis. Coba lagi.')); }, BATAS_TUNGGU_MS);
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
    s.textContent = [
      '#' + ID_KOTAK + '{margin:16px 0;padding:14px 16px;border:2px solid #17365d;border-radius:12px;background:#f5f8fc;color:#0f172a;font-size:.85rem;line-height:1.5}',
      '#' + ID_KOTAK + ' h3{margin:0 0 4px;font-size:.95rem;font-weight:700;color:#17365d}',
      '#' + ID_KOTAK + ' .uld-sub{font-size:.75rem;color:#475569;margin-bottom:8px}',
      '#' + ID_KOTAK + ' .uld-pil{display:inline-block;padding:1px 9px;border-radius:99px;font-size:.72rem;font-weight:600;border:1px solid #cbd5e1;background:#fff}',
      '#' + ID_KOTAK + ' .uld-pil.ms{background:#e7f6ec;border-color:#9fd5b0;color:#14532d}#' + ID_KOTAK + ' .uld-pil.btl{background:#fff4dc;border-color:#f0cd86;color:#7a4b00}#' + ID_KOTAK + ' .uld-pil.tms{background:#fde8e8;border-color:#f1a6a6;color:#7f1d1d}',
      '#' + ID_KOTAK + ' .uld-pesan{margin:8px 0;padding:8px 10px;border-radius:8px;font-size:.8rem;border:1px solid #cbd5e1;background:#fff}',
      '#' + ID_KOTAK + ' .uld-pesan.ok{background:#e7f6ec;border-color:#9fd5b0}#' + ID_KOTAK + ' .uld-pesan.info{background:#eef3fb;border-color:#c9d7ee}',
      '#' + ID_KOTAK + ' .uld-pesan.gagal{background:#fde8e8;border-color:#f1a6a6;color:#7f1d1d}#' + ID_KOTAK + ' .uld-pesan.peringatan{background:#fff4dc;border-color:#f0cd86}',
      '#' + ID_KOTAK + ' .uld-radio{display:flex;flex-wrap:wrap;gap:6px 18px;margin:6px 0}#' + ID_KOTAK + ' .uld-radio label{display:inline-flex;align-items:center;gap:6px;min-height:36px;cursor:pointer}',
      '#' + ID_KOTAK + ' select,#' + ID_KOTAK + ' textarea{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font:inherit;background:#fff}',
      '#' + ID_KOTAK + ' textarea{min-height:72px;resize:vertical}',
      '#' + ID_KOTAK + ' .uld-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}',
      '#' + ID_KOTAK + ' .uld-chip,#' + ID_KOTAK + ' .uld-btn{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:6px 10px;min-height:36px;font:inherit;cursor:pointer}',
      '#' + ID_KOTAK + ' .uld-btn.utama{background:#17365d;border-color:#17365d;color:#fff;font-weight:600;min-height:42px;padding:8px 16px}',
      '#' + ID_KOTAK + ' .uld-btn[disabled]{opacity:.5;cursor:not-allowed}',
      '#' + ID_KOTAK + ' .uld-lain{margin:6px 0;padding:6px 0;border-top:1px dashed #cbd5e1;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;justify-content:space-between}',
      '#' + ID_ATAS + '{margin:0 0 12px;padding:8px 12px;border:1px solid #17365d;border-radius:10px;background:#eef3fb;color:#17365d;font-size:.8rem;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;justify-content:space-between}',
      '#' + ID_ATAS + ' button{border:1px solid #17365d;background:#17365d;color:#fff;border-radius:8px;padding:6px 12px;min-height:36px;font:inherit;font-weight:600;cursor:pointer}',
      '.uld-cek{display:inline-flex;align-items:center;gap:5px;font-size:11px;white-space:nowrap;color:#475569}.uld-cek input{width:18px;height:18px}',
      'a.uld-dibuka{background:#047857 !important}',
    ].join('');
    dok.head.appendChild(s);
  }

  function berkas() { return st.detail && st.detail.berkas ? st.detail.berkas : []; }
  function cekValid() {
    return validasiPeriksa({ berkas: berkas(), centang: st.centang, mode: st.mode, statusSaatIni: st.detail ? st.detail.status : '', statusBaru: st.statusBaru, alasan: st.alasan });
  }
  /** Tanda koordinat data ini dari modul penanda (hanya data GMM; null bila belum dimuat/bukan GMM). */
  function tandaKoordinat() { var p = akar.djpmPenandaKoordinat; return p && typeof p.tandaSekarang === 'function' ? p.tandaSekarang(st.penerima) : null; }
  /** Keterangan baku (sama dengan yang disarankan server pada penolakan): "Koordinat tidak valid: <alasan>. Mohon kirim ulang ...". */
  function keteranganKoordinat(t) {
    var a = String((t && t.alasan) || ''); a = a.charAt(0).toLowerCase() + a.slice(1);
    return 'Koordinat tidak valid: ' + a + '. Mohon kirim ulang titik lokasi yang benar (tekan lama titik di Google Maps, pilih Bagikan, lalu Salin tautan).';
  }
  function pilStatus(s) { return '<span class="uld-pil ' + kelasStatus(s) + '">' + esc(s) + '</span>'; }

  function normUrl(u) { try { return new URL(String(u || '').trim()).href; } catch (_e) { return String(u || '').trim(); } }
  /** Tautan "Buka" pada baris berkas di Detail yang menunjuk ke berkas ini (dicocokkan lewat alamatnya; bukan lewat nama berkas). */
  function tautanDetail(b, terklaim) {
    var isi = isiDetail(); if (!isi) return null;
    var daftar = isi.querySelectorAll('a[href]'), tujuan = normUrl(b.url), i;
    for (i = 0; i < daftar.length; i++) {
      var a = daftar[i];
      if (a.closest('#' + ID_KOTAK) || a.closest('#' + ID_ATAS)) continue;
      if (terklaim && terklaim.indexOf(a) !== -1) continue;   // sudah dipakai berkas lain yang beralamat sama
      if (a.getAttribute('href') === String(b.url).trim() || normUrl(a.getAttribute('href')) === tujuan) return a;
    }
    return null;
  }

  /** Pasang/perbarui kotak centang pada tiap baris berkas di Detail; berkas yang tautannya tidak ditemukan dicatat untuk dibuka dari kotak. */
  function hiasiBerkas() {
    var terklaim = [];
    berkas().forEach(function (b) {
      var a = tautanDetail(b, terklaim);
      b.tanpaTautan = !a;
      if (!a) return;
      terklaim.push(a);
      a.setAttribute('data-uld-kunci', b.kunci);
      a.classList.toggle('uld-dibuka', !!b.dibuka);
      var baris = a.parentNode, cek = baris.querySelector('label.uld-cek[data-uld-kunci="' + b.kunci + '"]');
      if (!cek) {
        cek = dok.createElement('label'); cek.className = 'uld-cek'; cek.setAttribute('data-uld-kunci', b.kunci);
        cek.innerHTML = '<input type="checkbox" data-uld-centang="' + esc(b.kunci) + '" aria-label="Sudah diperiksa: ' + esc(b.label) + '"><span></span>';
        baris.insertBefore(cek, a);
      }
      var inp = cek.querySelector('input'), tek = cek.querySelector('span');
      if (inp.disabled !== !b.dibuka) inp.disabled = !b.dibuka;
      var dicentang = st.centang[b.kunci] === true; if (inp.checked !== dicentang) inp.checked = dicentang;
      var teks = b.dibuka ? 'Diperiksa' : 'Buka dulu'; if (tek.textContent !== teks) tek.textContent = teks;
    });
    // Detail biasa menulis "Perubahan hanya dapat dilakukan oleh Admin Utama" untuk data yang sudah punya hasil; pada tugas ini petugas memang boleh mengoreksi lewat kotak.
    var isi = isiDetail();
    if (isi) Array.prototype.forEach.call(isi.querySelectorAll('p'), function (p) {
      if (!p.closest('#' + ID_KOTAK) && /^Hasil verifikasi sudah diberikan\. Perubahan hanya dapat dilakukan oleh Admin Utama\.$/.test(p.textContent.trim())) {
        p.textContent = 'Hasil verifikasi awal sudah diberikan. Ini tugas Verifikasi Ulang: isi hasil pemeriksaan pada kotak "Verifikasi Ulang" di bagian bawah halaman ini.';
      }
    });
  }

  function htmlKotak() {
    if (st.status === 'muat') return '<h3>Verifikasi Ulang</h3><div class="uld-pesan info" role="status">Membuka tugas…</div>';
    if (st.status === 'gagal') return '<h3>Verifikasi Ulang</h3><div class="uld-pesan gagal" role="alert">' + esc(st.pesan) + '<br><button type="button" class="uld-btn" data-uld="muat" style="margin-top:8px">Coba lagi</button></div>';
    var d = st.detail; if (!d) return '';
    var v = cekValid(), tujuan = statusTujuan(d.status), bk = berkas(), tk = tandaKoordinat(), koordSalah = !!(tk && tk.s === 'salah');
    if (st.mode === 'koreksi' && !st.statusBaru) st.statusBaru = tujuan[0] || '';
    var dibuka = bk.filter(function (b) { return b.dibuka; }).length, dicentang = bk.filter(function (b) { return st.centang[b.kunci] === true; }).length;
    var h = '<h3>Verifikasi Ulang</h3><div class="uld-sub">Status saat ini ' + pilStatus(d.status) + ' · diverifikasi awal oleh ' + esc(d.diverifikasiOleh || '-') + (d.keteranganVerifikasi ? ' · keterangan: ' + esc(d.keteranganVerifikasi) : '') + '</div>' +
      '<div class="uld-pesan info">Cocokkan data di atas dengan isi tiap berkas. Pada bagian <b>Berkas &amp; Dokumen Pendukung</b>, klik <b>Buka</b> pada setiap berkas, lalu centang <b>Diperiksa</b> pada berkas itu.</div>' +
      '<div class="uld-sub" id="uld-hitung">Berkas dibuka ' + fmt(dibuka) + ' dari ' + fmt(bk.length) + ' · dicentang ' + fmt(dicentang) + ' dari ' + fmt(bk.length) + '</div>';
    var lain = bk.filter(function (b) { return b.tanpaTautan; });
    if (lain.length) h += lain.map(function (b) {
      return '<div class="uld-lain"><span><b>' + esc(b.label) + '</b> · ' + (b.dibuka ? 'sudah dibuka' : 'belum dibuka') + '</span><span><button type="button" class="uld-btn" data-uld="buka" data-kunci="' + esc(b.kunci) + '">Buka berkas ↗</button> ' +
        '<label class="uld-cek"><input type="checkbox" data-uld-centang="' + esc(b.kunci) + '"' + (b.dibuka ? '' : ' disabled') + (st.centang[b.kunci] === true ? ' checked' : '') + '> Diperiksa</label></span></div>';
    }).join('');
    if (!bk.length) h += '<div class="uld-pesan info">Data ini tidak memiliki berkas unggahan.</div>';
    h += '<h3 style="margin-top:12px">Hasil pemeriksaan</h3><div class="uld-radio" role="radiogroup" aria-label="Hasil pemeriksaan"><label><input type="radio" name="uld-mode" value="sesuai"' + (st.mode === 'sesuai' ? ' checked' : '') + '> Sesuai (status tetap)</label>' +
      (tujuan.length ? '<label><input type="radio" name="uld-mode" value="koreksi"' + (st.mode === 'koreksi' ? ' checked' : '') + '> Koreksi status</label>' : '') + '</div>';
    if (koordSalah && d.status === MS && st.mode === 'sesuai') {
      h += '<div class="uld-pesan peringatan" role="alert">Koordinat lokasi data ini <b>bermasalah</b>: ' + esc(tk.alasan) + '. Hasil <b>Sesuai</b> akan ditolak sistem karena status Memenuhi Syarat tidak boleh dipertahankan pada koordinat yang salah. Pilih <b>Koreksi status</b> &rarr; Berkas Tidak Lengkap dan sebutkan masalah koordinat.</div>';
    }
    if (st.mode === 'koreksi') {
      var chips = templatUntuk(st.templat, st.statusBaru, d.data.layanan);
      var chipKoordinat = koordSalah && st.statusBaru === BTL;
      h += '<div><label>Status baru<select id="uld-status">' + tujuan.map(function (s) { return '<option' + (s === st.statusBaru ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></label>' +
        '<div class="uld-sub" style="margin-top:6px">Alasan cepat</div><div class="uld-chips">' + (chips.length ? chips.map(function (c, i) { return '<button type="button" class="uld-chip" data-uld="templat" data-i="' + i + '">' + esc(c.judul) + '</button>'; }).join('') : (chipKoordinat ? '' : '<span class="uld-sub">Tidak ada alasan cepat untuk status ini.</span>')) +
        (chipKoordinat ? '<button type="button" class="uld-chip" data-uld="koordinat">Koordinat tidak valid</button>' : '') + '</div>' +
        '<textarea id="uld-alasan" placeholder="Alasan koreksi (wajib)">' + esc(st.alasan) + '</textarea>' +
        '<div class="uld-pesan peringatan">' + esc(dampakKoreksi(d.status, st.statusBaru)) + '</div></div>';
    }
    h += '<div class="uld-pesan ' + (v.ok ? 'ok' : 'info') + '" id="uld-valid" role="status">' + esc(v.pesan) + '</div>';
    if (st.pesanSimpan) h += '<div class="uld-pesan gagal" role="alert">' + esc(st.pesanSimpan) + '</div>';
    h += '<div style="margin-top:10px"><button type="button" class="uld-btn utama" id="uld-simpan" data-uld="simpan"' + (v.ok && !st.simpan ? '' : ' disabled') + '>' + (st.simpan ? 'Menyimpan…' : 'Simpan &amp; berikutnya') + '</button></div>';
    return h;
  }

  /** Gambar ulang kotak + hiasan baris berkas (idempoten). Fokus dan isian yang sedang diketik dipertahankan. */
  function gambar() {
    var kotak = dok.getElementById(ID_KOTAK); if (!kotak) return;
    var fokus = dok.activeElement && kotak.contains(dok.activeElement) ? dok.activeElement.id : '';
    var pos = fokus === 'uld-alasan' ? dok.activeElement.selectionStart : 0;
    hiasiBerkas();   // lebih dulu: menentukan berkas yang tak punya tautan di Detail (baris cadangan di kotak)
    kotak.innerHTML = htmlKotak();
    if (fokus) { var el = dok.getElementById(fokus); if (el && el.focus) { el.focus(); if (fokus === 'uld-alasan') { try { el.setSelectionRange(pos, pos); } catch (_e) { /* abaikan */ } } } }
    hiasiBerkas();
  }

  function lepasKotak() {
    var k = dok.getElementById(ID_KOTAK); if (k && k.parentNode) k.parentNode.removeChild(k);
    var at = dok.getElementById(ID_ATAS); if (at && at.parentNode) at.parentNode.removeChild(at);
    Array.prototype.forEach.call(dok.querySelectorAll('label.uld-cek[data-uld-kunci]'), function (e) { if (e.parentNode) e.parentNode.removeChild(e); });
  }

  function muatTugas(tugasId) {
    st.tugasId = tugasId; st.detail = null; st.status = 'muat'; st.centang = {}; st.mode = 'sesuai'; st.statusBaru = ''; st.alasan = ''; st.pesanSimpan = '';
    var saya = ++st.antrean; gambar();
    return rpc('bukaTugasUlang', [tugasId]).then(function (res) {
      if (saya !== st.antrean) return;
      if (!res || res.sukses !== true) throw new Error((res && res.pesan) || 'Gagal membuka tugas.');
      st.detail = res; st.status = 'ok'; st.pesan = ''; gambar();
    }).catch(function (e) { if (saya !== st.antrean) return; st.status = 'gagal'; st.pesan = e.message; gambar(); });
  }

  function muatTemplat() {
    if (st.templat) return;
    rpc('getTemplatAlasan', []).then(function (res) { st.templat = (res && res.sukses === true && Array.isArray(res.templat)) ? res.templat : []; gambar(); })
      .catch(function () { st.templat = []; gambar(); });
  }

  function catatDibuka(kunci) {
    var d = st.detail; if (!d) return;
    var b = d.berkas.filter(function (x) { return x.kunci === kunci; })[0]; if (!b) return;
    var tugasId = d.tugasId;
    rpc('catatBerkasDibuka', [tugasId, kunci]).then(function (res) {
      if (!res || res.sukses !== true) throw new Error((res && res.pesan) || 'Gagal mencatat berkas.');
      if (st.detail && st.detail.tugasId === tugasId) { b.dibuka = true; gambar(); }
    }).catch(function (e) { toast(e.message); });
  }

  function bukaDariKotak(kunci) {
    var b = berkas().filter(function (x) { return x.kunci === kunci; })[0]; if (!b) return;
    if (!urlBolehDibuka(b.url)) { toast('Tautan berkas tidak valid.'); return; }
    try { akar.open(b.url, '_blank', 'noopener'); } catch (_e) { /* diblokir: petugas dapat mengklik lagi */ }   // harus langsung di dalam klik pengguna
    catatDibuka(kunci);
  }

  function lanjutKeBerikutnya() {
    var t = tab();
    var tutupDetail = dok.getElementById('tutup-modal-detail'); if (tutupDetail) tutupDetail.click();
    if (!t || typeof t.setelahUlangSelesai !== 'function') return;
    t.setelahUlangSelesai().then(function (berikut) {
      if (berikut && typeof akar.tampilkanDetailKeModalOnDemand === 'function') akar.tampilkanDetailKeModalOnDemand(berikut);
      else toast('Semua tugas Verifikasi Ulang sudah selesai. Terima kasih.', 'sukses');
    });
  }

  function simpan() {
    var d = st.detail, v = cekValid(); if (!d || !v.ok || st.simpan) return;
    st.simpan = true; st.pesanSimpan = ''; gambar();
    var masuk = { hasil: st.mode === 'sesuai' ? 'SESUAI' : 'DIKOREKSI', centang: st.centang };
    if (st.mode === 'koreksi') { masuk.statusSesudah = st.statusBaru; masuk.alasan = st.alasan; }
    rpc('simpanHasilUlang', [d.tugasId, masuk]).then(function (res) {
      st.simpan = false;
      if (!res || res.sukses !== true) {
        st.pesanSimpan = (res && res.pesan) || 'Gagal menyimpan.'; gambar();
        // Tugas tidak berlaku lagi (data berubah, ditarik, selesai di tab lain, paket dibatalkan): Detail ditutup dan daftar dimuat ulang; pesan lewat toast.
        if (res && (res.konflik || /Muat ulang|ditarik|tidak aktif|sudah selesai/.test(st.pesanSimpan))) {
          toast(st.pesanSimpan);
          var tutupDetail = dok.getElementById('tutup-modal-detail'); if (tutupDetail) tutupDetail.click();
          var t = tab(); if (t && typeof t.setelahUlangSelesai === 'function') t.setelahUlangSelesai();
        }
        return;
      }
      toast(res.pesan || 'Tersimpan.', 'sukses');
      lanjutKeBerikutnya();
    }).catch(function (e) { st.simpan = false; st.pesanSimpan = e.message; gambar(); });
  }

  // ------------------------------------------------------------------ pemasangan di Detail
  /** Pastikan kotak ada di Detail yang sedang tampil (bila data ini tugas Verifikasi Ulang milik verifikator) atau dibuang bila tidak. */
  function sinkron() {
    if (!berhak() || !modeUlang() || !modalTerbuka()) { if (dok.getElementById(ID_KOTAK)) lepasKotak(); return; }
    var tugasId = tugasIdUntuk(st.penerima);
    var riwayat = dok.getElementById('riwayat-edit-wrap');
    if (!tugasId || !riwayat) { if (!tugasId && dok.getElementById(ID_KOTAK)) lepasKotak(); return; }   // belum selesai digambar, atau bukan tugas ulang
    suntikStyle();
    var kotak = dok.getElementById(ID_KOTAK);
    if (!kotak) {
      kotak = dok.createElement('div'); kotak.id = ID_KOTAK; kotak.setAttribute('role', 'region'); kotak.setAttribute('aria-label', 'Verifikasi Ulang');
      riwayat.parentNode.insertBefore(kotak, riwayat);
      var isi = isiDetail();
      if (isi && !dok.getElementById(ID_ATAS)) {
        var atas = dok.createElement('div'); atas.id = ID_ATAS;
        atas.innerHTML = '<span><b>Verifikasi Ulang</b> · periksa data dan berkasnya, lalu isi hasilnya di kotak pada bagian bawah halaman ini.</span><button type="button" data-uld="gulir">Ke kotak Verifikasi Ulang ↓</button>';
        isi.insertBefore(atas, isi.firstChild);
      }
      if (st.tugasId === tugasId && st.status !== 'idle') gambar();
    }
    if (st.tugasId !== tugasId || st.status === 'idle') muatTugas(tugasId);
    else {
      var tk = tandaKoordinat(), sig = tk ? tk.s + '|' + tk.alasan : '';
      if (sig !== st.sigTanda) { st.sigTanda = sig; gambar(); } else hiasiBerkas();
    }
  }

  /** Detail dibuka untuk data lain: keadaan pemeriksaan direset. */
  function pasangPembungkus() {
    if (akar.__djpmUlangDetailDibungkus || typeof akar.tampilkanDetailKeModalOnDemand !== 'function') return;
    var asli = akar.tampilkanDetailKeModalOnDemand;
    akar.tampilkanDetailKeModalOnDemand = function (nomorBaris) {
      st.penerima = Number(nomorBaris) || 0; st.tugasId = 0; st.detail = null; st.status = 'idle'; st.centang = {}; st.mode = 'sesuai'; st.statusBaru = ''; st.alasan = ''; st.pesanSimpan = ''; st.simpan = false; st.antrean++; st.sigTanda = '';
      lepasKotak();
      var hasil = asli.apply(this, arguments);
      try { sinkron(); } catch (_e) { /* abaikan */ }
      return hasil;
    };
    akar.__djpmUlangDetailDibungkus = true;
  }

  // Klik pada tautan "Buka" berkas di Detail: dicatat server (browser tetap membuka tab baru seperti biasa)
  dok.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var a = t.closest('a[data-uld-kunci]'); if (a && modeUlang() && berhak()) { catatDibuka(a.getAttribute('data-uld-kunci')); return; }
    var ap = t.closest('[data-uld]'); if (!ap || !(t.closest('#' + ID_KOTAK) || t.closest('#' + ID_ATAS))) return;
    var aksi = ap.getAttribute('data-uld');
    if (aksi === 'gulir') { var kt = dok.getElementById(ID_KOTAK); if (kt && kt.scrollIntoView) kt.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (aksi === 'simpan') simpan();
    else if (aksi === 'buka') bukaDariKotak(ap.getAttribute('data-kunci'));
    else if (aksi === 'muat') { var tid = tugasIdUntuk(st.penerima); if (tid) muatTugas(tid); }
    else if (aksi === 'koordinat') { var tkk = tandaKoordinat(); if (tkk && tkk.s === 'salah') { st.alasan = keteranganKoordinat(tkk); gambar(); } }
    else if (aksi === 'templat') {
      var c = st.detail ? templatUntuk(st.templat, st.statusBaru, st.detail.data.layanan)[Number(ap.getAttribute('data-i'))] : null;
      if (c) { st.alasan = isiTemplat(c.isi, st.detail.data.layanan); gambar(); }
    }
  });
  dok.addEventListener('change', function (e) {
    var t = e.target; if (!t || !t.closest || !modeUlang()) return;
    if (t.getAttribute && t.getAttribute('data-uld-centang')) { st.centang[t.getAttribute('data-uld-centang')] = t.checked; gambar(); return; }
    if (!t.closest('#' + ID_KOTAK)) return;
    if (t.name === 'uld-mode') { st.mode = t.value; st.pesanSimpan = ''; if (st.mode === 'koreksi') { st.statusBaru = ''; muatTemplat(); } gambar(); }
    else if (t.id === 'uld-status') { st.statusBaru = t.value; gambar(); }
  });
  dok.addEventListener('input', function (e) {
    if (!e.target || e.target.id !== 'uld-alasan') return;
    st.alasan = e.target.value;
    var v = cekValid(), vp = dok.getElementById('uld-valid'), tb = dok.getElementById('uld-simpan');
    if (vp) { vp.textContent = v.pesan; vp.className = 'uld-pesan ' + (v.ok ? 'ok' : 'info'); }
    if (tb) tb.disabled = !(v.ok && !st.simpan);
  });

  var MO = akar.MutationObserver, diamati = null;
  function pasangPengamat() {
    var isi = isiDetail();
    if (MO && isi && isi !== diamati) { diamati = isi; new MO(function () { try { sinkron(); } catch (_e) { /* abaikan */ } }).observe(isi, { childList: true }); }
  }
  setInterval(function () { try { pasangPembungkus(); pasangPengamat(); sinkron(); } catch (_e) { /* abaikan */ } }, 1500);
  try { pasangPembungkus(); pasangPengamat(); } catch (_e) { /* abaikan */ }
  api.sinkronUntukUji = sinkron;
  return api;
});
