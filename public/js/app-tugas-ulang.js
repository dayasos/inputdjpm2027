/**
 * public/js/app-tugas-ulang.js
 * Layar petugas verifikator untuk VERIFIKASI ULANG ("Tugas Ulang"). Rencana: plans/plan-verifikasi-ulang.md (T5).
 * Dimuat malas hanya untuk role VERIFIKATOR (SKRIP_PER_PERAN di app-pesan-periode.js).
 *
 * Yang dikerjakan petugas: membuka tugas miliknya, mengklik tiap berkas yang diunggah, mencentang berkas yang sudah diperiksa,
 * lalu memilih "Sesuai" atau "Koreksi status". SERVER yang menegakkan semua aturan (pemilik tugas, berkas wajib diklik, centang lengkap,
 * status yang boleh, waktu tersimpan); modul ini hanya menampilkan dan meniru pesan agar petugas tahu apa yang kurang sebelum menekan Simpan.
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
    isiTemplat: isiTemplat, validasiPeriksa: validasiPeriksa, kemajuan: kemajuan, esc: esc, buka: function () { /* diganti di browser */ }
  };
  if (!akar || !akar.document) return api;   // lingkungan uji Node: hanya bagian murni

  // ------------------------------------------------------------------ tampilan
  var dok = akar.document;
  var ID = 'djpm-tul-overlay', ID_STYLE = 'djpm-tul-style', ID_PIL = 'djpm-tul-pil';
  var BATAS_TUNGGU_MS = 40000, SEGARKAN_HITUNG_MS = 180000;
  var st = { daftar: null, status: 'idle', pesan: '', aktif: 0, detail: null, detailStatus: 'idle', detailPesan: '', centang: {}, mode: 'sesuai', statusBaru: '', alasan: '',
    simpan: false, pesanSimpan: '', templat: null, pembuka: null, hitung: null, hitungToken: '', hitungWaktu: 0, hitungMuat: false, bukaAntrean: 0 };

  function pengguna() { return (typeof dataPengguna !== 'undefined') ? dataPengguna : null; }
  function berhak() { var p = pengguna(); return !!(p && p.token && String(p.role || '').trim().toUpperCase() === 'VERIFIKATOR'); }
  function toast(pesan, jenis) { try { if (typeof tampilkanToast === 'function') tampilkanToast(pesan, jenis || 'gagal', { durasi: 6000 }); } catch (_e) { /* abaikan */ } }

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
      '#' + ID + '{position:fixed;inset:0;z-index:9500;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:max(12px,env(safe-area-inset-top,0px)) max(12px,env(safe-area-inset-right,0px)) max(12px,env(safe-area-inset-bottom,0px)) max(12px,env(safe-area-inset-left,0px));font-family:inherit}',
      '#' + ID + ' *{box-sizing:border-box}',
      '#' + ID + ' .tul-kotak{background:#fff;color:#0f172a;border-radius:16px;width:100%;max-width:1040px;margin:8px auto;box-shadow:0 20px 50px rgba(0,0,0,.3);overflow:hidden}',
      '#' + ID + ' .tul-kepala{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;justify-content:space-between;padding:16px 18px;background:#f1f5f9;border-bottom:1px solid #dbe1ea}',
      '#' + ID + ' .tul-kepala h2{margin:0;font-size:1.15rem;font-weight:700}',
      '#' + ID + ' .tul-sub{font-size:.78rem;color:#5a6879;margin-top:2px}',
      '#' + ID + ' .tul-tutup{border:1px solid #cbd5e1;background:#fff;border-radius:8px;min-height:40px;min-width:40px;cursor:pointer;font-size:1.1rem}',
      '#' + ID + ' .tul-kemajuan{flex:1 1 220px;max-width:340px;min-width:0}',
      '#' + ID + ' .tul-bar{height:8px;border-radius:99px;background:#dbe1ea;overflow:hidden;margin-top:6px}',
      '#' + ID + ' .tul-bar i{display:block;height:100%;background:#17365d;border-radius:99px}',
      '#' + ID + ' .tul-isi{padding:18px;display:grid;grid-template-columns:minmax(0,320px) minmax(0,1fr);gap:16px;align-items:start}',
      '@media (max-width:820px){#' + ID + ' .tul-isi{grid-template-columns:minmax(0,1fr)}}',
      '#' + ID + ' .tul-isi>*{min-width:0}',
      '#' + ID + ' h3{margin:0 0 6px;font-size:.95rem;font-weight:700}',
      '#' + ID + ' h2{font-weight:700}',
      // gaya dasar aplikasi memaksa huruf kapital pada isian; di sini teks isian dan petunjuk tampil apa adanya
      '#' + ID + ' input,#' + ID + ' textarea,#' + ID + ' select{text-transform:none}',
      '#' + ID + ' .tul-cat{font-size:.78rem;color:#5a6879}',
      '#' + ID + ' .tul-daftar{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:8px}',
      '#' + ID + ' .tul-daftar button{width:100%;text-align:left;border:1px solid #dbe1ea;background:#fff;border-radius:10px;padding:10px 12px;display:grid;gap:3px;font:inherit;color:inherit;cursor:pointer;min-height:44px}',
      '#' + ID + ' .tul-daftar button[aria-current="true"]{border-color:#17365d;background:#eef3fb;box-shadow:inset 0 0 0 1px #17365d}',
      '#' + ID + ' .tul-baris{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;justify-content:space-between}',
      '#' + ID + ' .tul-pil{display:inline-block;padding:2px 9px;border-radius:99px;font-size:.72rem;font-weight:700;white-space:nowrap;border:1px solid #cbd5e1}',
      '#' + ID + ' .tul-pil.ms{background:#e1f4ea;color:#15803d;border-color:#9bd3b4}#' + ID + ' .tul-pil.btl{background:#fff0d4;color:#9a5b00;border-color:#e8c27a}#' + ID + ' .tul-pil.tms{background:#fde7e5;color:#b3261e;border-color:#f0aaa4}',
      '#' + ID + ' .tul-berkas{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:8px}',
      '#' + ID + ' .tul-berkas li{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:center;border:1px solid #dbe1ea;border-radius:10px;padding:8px 12px}',
      '#' + ID + ' .tul-berkas li.belum{background:#f1f5f9}',
      '#' + ID + ' .tul-berkas input[type=checkbox]{width:20px;height:20px}',
      '#' + ID + ' button,#' + ID + ' input,#' + ID + ' select,#' + ID + ' textarea{font:inherit}',
      '#' + ID + ' .tul-btn{border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:8px;padding:8px 14px;min-height:40px;font-weight:600;cursor:pointer}',
      '#' + ID + ' .tul-btn.utama{background:#17365d;color:#fff;border-color:#17365d}',
      '#' + ID + ' .tul-btn[disabled]{opacity:.45;cursor:not-allowed}',
      '#' + ID + ' .tul-btn.kecil{padding:4px 10px;min-height:34px;font-size:.8rem}',
      '#' + ID + ' button:focus-visible,#' + ID + ' input:focus-visible,#' + ID + ' select:focus-visible,#' + ID + ' textarea:focus-visible{outline:3px solid #0f766e;outline-offset:2px}',
      '#' + ID + ' select,#' + ID + ' textarea{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;background:#fff;color:#0f172a}',
      '#' + ID + ' textarea{min-height:76px;resize:vertical}',
      '#' + ID + ' .tul-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}',
      '#' + ID + ' .tul-chip{border:1px solid #cbd5e1;background:#f1f5f9;border-radius:99px;padding:4px 12px;font-size:.8rem;cursor:pointer;min-height:34px}',
      '#' + ID + ' .tul-pesan{border-radius:8px;padding:8px 12px;font-size:.85rem;margin-top:12px;overflow-wrap:anywhere}',
      '#' + ID + ' .tul-pesan.info{background:#eef3fb;color:#17365d}#' + ID + ' .tul-pesan.ok{background:#e1f4ea;color:#15803d}#' + ID + ' .tul-pesan.gagal{background:#fde7e5;color:#b3261e}#' + ID + ' .tul-pesan.peringatan{background:#fff0d4;color:#9a5b00}',
      '#' + ID + ' .tul-kosong{text-align:center;padding:28px 12px;color:#5a6879;border:1px dashed #cbd5e1;border-radius:10px}',
      '#' + ID + ' .tul-opsi{display:grid;gap:10px;margin-top:10px}',
      '#' + ID + ' .tul-radio{display:flex;gap:18px;flex-wrap:wrap;margin-top:6px}',
      '#' + ID + ' .tul-radio label{display:flex;gap:6px;align-items:center;min-height:40px}',
      '#' + ID + ' .tul-radio input{width:18px;height:18px}',
      '#' + ID + ' .tul-data{font-size:.85rem;color:#475569;overflow-wrap:anywhere}',
      '#' + ID + ' .tul-banding{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-top:10px}',
      '#' + ID + ' .tul-grup{border:1px solid #dbe1ea;border-radius:10px;padding:10px 12px;background:#f8fafc;min-width:0}',
      '#' + ID + ' .tul-grup h4{margin:0 0 6px;font-size:.8rem;font-weight:700}',
      '#' + ID + ' .tul-grup h4 span{font-weight:400;color:#5a6879}',
      '#' + ID + ' .tul-grup dl{margin:0;display:grid;grid-template-columns:minmax(0,auto) minmax(0,1fr);gap:3px 10px;font-size:.85rem}',
      '#' + ID + ' .tul-grup dt{color:#5a6879}',
      '#' + ID + ' .tul-grup dd{margin:0;font-weight:600;overflow-wrap:anywhere}',
      '#' + ID + ' .tul-grup dd.kosong{color:#b3261e;font-weight:500;font-style:italic}',
      '#' + ID_PIL + '{position:fixed;left:16px;bottom:76px;z-index:60;background:#17365d;color:#fff;border:1px solid #0f2744;border-radius:14px;padding:8px 14px;font:600 13px/1.35 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);cursor:pointer;max-width:calc(100vw - 32px);min-height:40px}',
      '#' + ID_PIL + ':focus-visible{outline:3px solid #0f766e;outline-offset:2px}'
    ].join('\n');
    dok.head.appendChild(s);
  }

  function pilStatus(s) { return '<span class="tul-pil ' + kelasStatus(s) + '">' + esc(s) + '</span>'; }

  function aktifTugas() { return st.daftar && st.daftar.tugas ? st.daftar.tugas[st.aktif] || null : null; }

  function gambarKepala() {
    var o = dok.getElementById(ID); if (!o) return;
    var d = st.daftar, k = kemajuan(d ? d.sisa : 0, d ? d.selesai : 0);
    var paket = d && d.tugas && d.tugas[0] ? d.tugas[0].namaPaket : '';
    var batas = d && d.tugas && d.tugas[0] && d.tugas[0].batasSelesai ? String(d.tugas[0].batasSelesai).slice(0, 10) : '';
    o.querySelector('#tul-sub').textContent = paket ? (paket + (batas ? ' · batas selesai ' + batas : '')) : 'Pemeriksaan ulang data yang sudah terverifikasi';
    o.querySelector('#tul-kemajuan').innerHTML = d
      ? '<div class="tul-baris" style="font-size:.8rem"><span>Selesai ' + fmt(d.selesai) + ' dari ' + fmt(k.total) + '</span><span style="color:#5a6879">' + fmt(d.dikoreksi) + ' dikoreksi</span></div><div class="tul-bar"><i style="width:' + k.persen + '%"></i></div>'
      : '';
  }

  function gambarDaftar() {
    var d = st.daftar, h = '<h3>Daftar tugas</h3><div class="tul-cat">Hanya data yang dibagikan kepada Anda. Data yang berubah sebelum diperiksa ditarik otomatis.</div>';
    if (st.status === 'muat' && !d) h += '<div class="tul-kosong" role="status">Memuat…</div>';
    else if (st.status === 'gagal' && !d) h += '<div class="tul-pesan gagal" role="alert">' + esc(st.pesan) + '<br><button type="button" class="tul-btn kecil" data-aksi="muat" style="margin-top:8px">Coba lagi</button></div>';
    else if (d) {
      if (d.ditarikBaruSaja) h += '<div class="tul-pesan peringatan" role="status">' + fmt(d.ditarikBaruSaja) + ' tugas ditarik karena datanya berubah sebelum diperiksa.</div>';
      if (!d.tugas.length) h += '<div class="tul-kosong" style="margin-top:10px">' + (d.selesai ? 'Semua tugas sudah selesai. Terima kasih.' : 'Belum ada tugas ulang untuk Anda.') + '</div>';
      else {
        h += '<ul class="tul-daftar">' + d.tugas.map(function (t, i) {
          return '<li><button type="button" data-aksi="pilih" data-i="' + i + '" aria-current="' + (i === st.aktif) + '"><span class="tul-baris"><b>' + esc(t.nama) + '</b>' + pilStatus(t.status) + '</span><span class="tul-cat">' + esc(t.layanan) + ' · ' + esc(t.kelurahan) + '</span></button></li>';
        }).join('') + '</ul>';
        if (d.adaBerikutnya) h += '<div class="tul-cat" style="margin-top:8px">Menampilkan 50 tugas pertama; sisanya muncul setelah ini selesai.</div>';
      }
    }
    dok.getElementById('tul-daftar').innerHTML = h;
  }

  function berkasDetail() { return st.detail && st.detail.berkas ? st.detail.berkas : []; }
  function cekValid() {
    return validasiPeriksa({ berkas: berkasDetail(), centang: st.centang, mode: st.mode, statusSaatIni: st.detail ? st.detail.status : '', statusBaru: st.statusBaru, alasan: st.alasan });
  }

  function htmlBanding(data) {
    var koord = String((data && data.koordinat) || '').trim();
    return '<div class="tul-banding">' + kelompokData(data).map(function (g) {
      return '<div class="tul-grup"><h4>' + esc(g.judul) + ' <span>· ' + esc(g.petunjuk) + '</span></h4><dl>' + g.baris.map(function (r) {
        return '<dt>' + esc(r.label) + '</dt><dd' + (r.nilai ? '' : ' class="kosong"') + '>' + (r.nilai ? esc(r.nilai) : 'kosong') + '</dd>';
      }).join('') + (g.judul === 'Penugasan' ? '<dt>Koordinat</dt><dd' + (koord ? '' : ' class="kosong"') + '>' + (koord ? (urlBolehDibuka(koord) ? '<a href="' + esc(koord) + '" target="_blank" rel="noopener noreferrer">Buka peta ↗</a>' : esc(koord)) : 'kosong') + '</dd>' : '') + '</dl></div>';
    }).join('') + '</div>';
  }

  function gambarDetail() {
    var w = dok.getElementById('tul-detail'); if (!w) return;
    var t = aktifTugas();
    if (!t) { w.innerHTML = '<div class="tul-kosong">' + (st.daftar && st.daftar.selesai && !st.daftar.sisa ? 'Semua tugas selesai.' : 'Pilih satu tugas di daftar.') + '</div>'; return; }
    if (st.detailStatus === 'muat') { w.innerHTML = '<div class="tul-kosong" role="status">Membuka data…</div>'; return; }
    if (st.detailStatus === 'gagal') { w.innerHTML = '<div class="tul-pesan gagal" role="alert">' + esc(st.detailPesan) + '<br><button type="button" class="tul-btn kecil" data-aksi="muat" style="margin-top:8px">Muat ulang daftar tugas</button></div>'; return; }
    var d = st.detail; if (!d) { w.innerHTML = ''; return; }
    var v = cekValid(), tujuan = statusTujuan(d.status);
    if (st.mode === 'koreksi' && !st.statusBaru) st.statusBaru = tujuan[0] || '';
    var h = '<div class="tul-baris"><div><h2 style="margin:0;font-size:1.05rem">' + esc(d.data.nama) + '</h2><div class="tul-data">' + esc(d.data.layanan) + ' · ' + esc(d.data.kelurahan) + ', ' + esc(d.data.kecamatan) + '</div></div>' + pilStatus(d.status) + '</div>' +
      '<h3 style="margin-top:14px">Data input untuk dicocokkan</h3><div class="tul-cat">Bandingkan setiap isian dengan isi berkas yang dibuka. Isian yang kosong ditulis merah.</div>' + htmlBanding(d.data) +
      '<div class="tul-cat" style="margin-top:6px">Diverifikasi pertama oleh ' + esc(d.diverifikasiOleh || '-') + (d.keteranganVerifikasi ? ' · keterangan: ' + esc(d.keteranganVerifikasi) : '') + '. Status hanya bisa diubah lewat tugas ini.</div>' +
      '<h3 style="margin-top:16px">Berkas yang diunggah (' + fmt(d.berkas.length) + ')</h3><div class="tul-cat">Klik "Buka berkas" lebih dulu. Kotak centang baru aktif setelah berkasnya dibuka.</div>';
    h += d.berkas.length ? '<ul class="tul-berkas">' + d.berkas.map(function (b) {
      return '<li class="' + (b.dibuka ? '' : 'belum') + '"><input type="checkbox" data-aksi="centang" data-kunci="' + esc(b.kunci) + '"' + (b.dibuka ? '' : ' disabled') + (st.centang[b.kunci] === true ? ' checked' : '') + ' aria-label="Sudah diperiksa: ' + esc(b.label) + '">' +
        '<div><b>' + esc(b.label) + '</b> <span class="tul-cat">· ' + (b.dibuka ? 'sudah dibuka' : 'belum dibuka') + '</span></div>' +
        '<button type="button" class="tul-btn kecil" data-aksi="buka-berkas" data-kunci="' + esc(b.kunci) + '">Buka berkas ↗</button></li>';
    }).join('') + '</ul>' : '<div class="tul-pesan info">Data ini tidak memiliki berkas unggahan.</div>';
    h += '<h3 style="margin-top:16px">Hasil pemeriksaan</h3><div class="tul-radio" role="radiogroup" aria-label="Hasil pemeriksaan"><label><input type="radio" name="tul-mode" value="sesuai"' + (st.mode === 'sesuai' ? ' checked' : '') + '> Sesuai</label>' +
      (tujuan.length ? '<label><input type="radio" name="tul-mode" value="koreksi"' + (st.mode === 'koreksi' ? ' checked' : '') + '> Koreksi status</label>' : '') + '</div>';
    if (st.mode === 'koreksi') {
      var chips = templatUntuk(st.templat, st.statusBaru, d.data.layanan);
      h += '<div class="tul-opsi"><label>Status baru<select id="tul-status">' + tujuan.map(function (s) { return '<option' + (s === st.statusBaru ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></label>' +
        '<div><div class="tul-cat">Alasan cepat</div><div class="tul-chips">' + (chips.length ? chips.map(function (c, i) { return '<button type="button" class="tul-chip" data-aksi="templat" data-i="' + i + '">' + esc(c.judul) + '</button>'; }).join('') : '<span class="tul-cat">' + (st.templat ? 'Tidak ada templat untuk status ini.' : 'Memuat…') + '</span>') + '</div>' +
        '<textarea id="tul-alasan" placeholder="Alasan koreksi (wajib)">' + esc(st.alasan) + '</textarea></div>' +
        '<div class="tul-pesan peringatan">' + esc(dampakKoreksi(d.status, st.statusBaru)) + '</div></div>';
    }
    h += '<div class="tul-pesan ' + (v.ok ? 'ok' : 'info') + '" id="tul-valid" role="status">' + esc(v.pesan) + '</div>';
    if (st.pesanSimpan) h += '<div class="tul-pesan gagal" role="alert">' + esc(st.pesanSimpan) + '</div>';
    h += '<div class="tul-baris" style="margin-top:12px"><button type="button" class="tul-btn utama" id="tul-simpan" data-aksi="simpan"' + (v.ok && !st.simpan ? '' : ' disabled') + '>' + (st.simpan ? 'Menyimpan…' : 'Simpan &amp; berikutnya') + '</button><span class="tul-cat">Waktu tersimpan dicatat server dan ikut hitungan lembur. Satu data dihitung satu kali.</span></div>';
    w.innerHTML = h;
  }

  function gambar() { gambarKepala(); gambarDaftar(); gambarDetail(); }

  // ------------------------------------------------------------------ aliran data
  function muatDaftar(bukaPertama) {
    if (!berhak()) return Promise.resolve();
    st.status = 'muat'; if (!st.daftar) gambar();
    return rpc('getTugasUlangSaya', [1]).then(function (res) {
      if (!res || res.sukses !== true) throw new Error((res && res.pesan) || 'Gagal memuat tugas.');
      st.daftar = res; st.status = 'ok'; st.pesan = '';
      st.hitung = { sisa: res.sisa, selesai: res.selesai }; st.hitungWaktu = Date.now(); st.hitungToken = pengguna() ? pengguna().token : ''; selarasPil();
      st.aktif = 0; st.detail = null; st.detailStatus = 'idle';
      gambar();
      if (bukaPertama && res.tugas.length) return pilih(0);
    }).catch(function (e) { st.status = 'gagal'; st.pesan = e.message; gambar(); });
  }

  function pilih(i) {
    var t = st.daftar && st.daftar.tugas[i]; if (!t) return Promise.resolve();
    st.aktif = i; st.detail = null; st.detailStatus = 'muat'; st.centang = {}; st.mode = 'sesuai'; st.statusBaru = ''; st.alasan = ''; st.pesanSimpan = '';
    gambar();
    var saya = ++st.bukaAntrean;
    return rpc('bukaTugasUlang', [t.tugasId]).then(function (res) {
      if (saya !== st.bukaAntrean) return;
      if (!res || res.sukses !== true) throw new Error((res && res.pesan) || 'Gagal membuka data.');
      st.detail = res; st.detailStatus = 'ok'; gambar();
    }).catch(function (e) { if (saya !== st.bukaAntrean) return; st.detailStatus = 'gagal'; st.detailPesan = e.message; gambar(); });
  }

  function muatTemplat() {
    if (st.templat) return;
    rpc('getTemplatAlasan', []).then(function (res) { st.templat = (res && res.sukses === true && Array.isArray(res.templat)) ? res.templat : []; gambarDetail(); })
      .catch(function () { st.templat = []; gambarDetail(); });
  }

  function bukaBerkas(kunci) {
    var d = st.detail; if (!d) return;
    var b = d.berkas.filter(function (x) { return x.kunci === kunci; })[0]; if (!b) return;
    // window.open harus terjadi langsung di dalam klik pengguna
    if (urlBolehDibuka(b.url)) { try { akar.open(b.url, '_blank', 'noopener'); } catch (_e) { /* diblokir: petugas dapat mengklik lagi */ } }
    else { toast('Tautan berkas tidak valid.'); return; }
    var tugasId = d.tugasId;
    rpc('catatBerkasDibuka', [tugasId, kunci]).then(function (res) {
      if (!res || res.sukses !== true) throw new Error((res && res.pesan) || 'Gagal mencatat berkas.');
      if (st.detail && st.detail.tugasId === tugasId) { b.dibuka = true; gambarDetail(); }
    }).catch(function (e) { toast(e.message); });
  }

  function simpan() {
    var d = st.detail, v = cekValid(); if (!d || !v.ok || st.simpan) return;
    st.simpan = true; st.pesanSimpan = ''; gambarDetail();
    var masuk = { hasil: st.mode === 'sesuai' ? 'SESUAI' : 'DIKOREKSI', centang: st.centang };
    if (st.mode === 'koreksi') { masuk.statusSesudah = st.statusBaru; masuk.alasan = st.alasan; }
    rpc('simpanHasilUlang', [d.tugasId, masuk]).then(function (res) {
      st.simpan = false;
      if (!res || res.sukses !== true) {
        st.pesanSimpan = (res && res.pesan) || 'Gagal menyimpan.'; gambarDetail();
        // Tugas sudah tidak berlaku (data berubah, ditarik, selesai di tab lain, paket dibatalkan): daftar dimuat ulang dan tugas berikutnya dibuka.
        // Pesannya ditampilkan sebagai toast karena panel detail diganti oleh tugas berikutnya.
        if (res && (res.konflik || /Muat ulang|ditarik|tidak aktif|sudah selesai/.test(st.pesanSimpan))) { toast(st.pesanSimpan); muatDaftar(true); }
        return;
      }
      toast(res.pesan || 'Tersimpan.', 'sukses');
      return muatDaftar(true);
    }).catch(function (e) { st.simpan = false; st.pesanSimpan = e.message; gambarDetail(); });
  }

  // ------------------------------------------------------------------ jendela
  function tutup() {
    var o = dok.getElementById(ID); if (o && o.parentNode) o.parentNode.removeChild(o);
    st.bukaAntrean++; st.detail = null; st.detailStatus = 'idle'; st.simpan = false;
    dok.removeEventListener('keydown', saatTombol, true);
    if (st.pembuka && st.pembuka.focus) { try { st.pembuka.focus(); } catch (_e) { /* abaikan */ } }
    st.pembuka = null;
    segarkanHitung(true);
  }
  function saatTombol(e) { if (e.key === 'Escape') { e.preventDefault(); tutup(); } }

  function bukaPanel(pembuka) {
    if (!berhak()) { toast('Fitur ini khusus akun Verifikator.'); return; }
    suntikStyle();
    if (dok.getElementById(ID)) return;
    st.pembuka = pembuka || dok.activeElement; st.daftar = null; st.templat = null; st.status = 'muat';
    var o = dok.createElement('div'); o.id = ID; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-labelledby', 'tul-judul');
    o.innerHTML = '<div class="tul-kotak"><div class="tul-kepala"><div><h2 id="tul-judul">Tugas Ulang</h2><div class="tul-sub" id="tul-sub"></div></div><div class="tul-kemajuan" id="tul-kemajuan"></div><button type="button" class="tul-tutup" id="tul-tutup" aria-label="Tutup">✕</button></div>' +
      '<div class="tul-isi"><div id="tul-daftar"></div><div id="tul-detail"></div></div></div>';
    dok.body.appendChild(o);
    o.addEventListener('mousedown', function (e) { if (e.target === o) tutup(); });
    o.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-aksi], #tul-tutup') : null; if (!t) return;
      if (t.id === 'tul-tutup') { tutup(); return; }
      var a = t.getAttribute('data-aksi');
      if (a === 'pilih') pilih(Number(t.getAttribute('data-i')));
      else if (a === 'buka-berkas') bukaBerkas(t.getAttribute('data-kunci'));
      else if (a === 'simpan') simpan();
      else if (a === 'muat') muatDaftar(true);
      else if (a === 'templat') {
        var c = templatUntuk(st.templat, st.statusBaru, st.detail.data.layanan)[Number(t.getAttribute('data-i'))];
        if (c) { st.alasan = isiTemplat(c.isi, st.detail.data.layanan); gambarDetail(); }
      }
    });
    o.addEventListener('change', function (e) {
      var t = e.target;
      if (t.getAttribute('data-aksi') === 'centang') { st.centang[t.getAttribute('data-kunci')] = t.checked; gambarDetail(); }
      else if (t.name === 'tul-mode') { st.mode = t.value; st.pesanSimpan = ''; if (st.mode === 'koreksi') { st.statusBaru = ''; muatTemplat(); } gambarDetail(); }
      else if (t.id === 'tul-status') { st.statusBaru = t.value; gambarDetail(); }
    });
    o.addEventListener('input', function (e) {
      if (e.target.id !== 'tul-alasan') return;
      st.alasan = e.target.value;
      var v = cekValid(), vp = dok.getElementById('tul-valid'), tb = dok.getElementById('tul-simpan');
      if (vp) { vp.textContent = v.pesan; vp.className = 'tul-pesan ' + (v.ok ? 'ok' : 'info'); }
      if (tb) tb.disabled = !(v.ok && !st.simpan);
    });
    dok.addEventListener('keydown', saatTombol, true);
    gambar();
    muatDaftar(true);
    var b = dok.getElementById('tul-tutup'); if (b) b.focus();
  }
  api.buka = bukaPanel;
  akar.bukaTugasUlang = bukaPanel;

  // ------------------------------------------------------------------ tombol melayang + penyelarasan (logout tidak memuat ulang halaman)
  function selarasPil() {
    var pil = dok.getElementById(ID_PIL), p = pengguna();
    var h = st.hitung && st.hitungToken === (p && p.token) ? st.hitung : null;
    if (!berhak() || !h || (!h.sisa && !h.selesai)) { if (pil && pil.parentNode) pil.parentNode.removeChild(pil); return; }
    suntikStyle();
    if (!pil) {
      pil = dok.createElement('button'); pil.id = ID_PIL; pil.type = 'button';
      pil.addEventListener('click', function () { bukaPanel(pil); });
      dok.body.appendChild(pil);
    }
    var teks = h.sisa ? '📋 Tugas Ulang · sisa ' + fmt(h.sisa) : '📋 Tugas Ulang · selesai';
    if (pil.textContent !== teks) pil.textContent = teks;
  }

  function segarkanHitung(paksa) {
    var p = pengguna(); if (!berhak() || st.hitungMuat) return;
    if (st.hitungToken !== p.token) { st.hitung = null; st.hitungToken = p.token; st.hitungWaktu = 0; }
    if (!paksa && (Date.now() - st.hitungWaktu < SEGARKAN_HITUNG_MS || dok.hidden)) return;
    if (dok.getElementById(ID)) return;   // panel terbuka: daftar sudah dimuat panel
    st.hitungMuat = true;
    rpc('getTugasUlangSaya', [1]).then(function (res) {
      if (res && res.sukses === true) { st.hitung = { sisa: res.sisa, selesai: res.selesai }; }
    }).catch(function () { /* diam: tombol tetap seperti sebelumnya */ }).then(function () { st.hitungMuat = false; st.hitungWaktu = Date.now(); selarasPil(); });
  }

  setInterval(function () {
    try {
      if (!berhak()) { var pil = dok.getElementById(ID_PIL); if (pil && pil.parentNode) pil.parentNode.removeChild(pil); if (dok.getElementById(ID)) tutup(); st.hitung = null; return; }
      selarasPil(); segarkanHitung(false);
    } catch (_e) { /* abaikan */ }
  }, 2000);
  try { segarkanHitung(false); } catch (_e) { /* abaikan */ }
  return api;
});
