/**
 * public/js/app-templat-kelola.js
 * Layar "Kelola Templat Alasan" -- HANYA Admin Utama. Dimuat saat tombol "⚙ Kelola" di Alasan Cepat diklik
 * (app-templat-alasan.js), jadi tidak ikut diunduh bila tidak dipakai.
 * Rancangan: plans/plan-templat-alasan-berkas-tidak-lengkap.md (§3d). Server: supabase/functions/api/domains/templatAlasan.ts
 * (semua aksi dicek ulang di server: khusus UTAMA; judul/kalimat/layanan divalidasi di sana juga).
 * Semua teks dari server/pengguna dipasang lewat textContent (tanpa innerHTML).
 */
(function () {
  'use strict';

  var BTL = 'Berkas Tidak Lengkap';
  var TMS = 'Tidak Memenuhi Syarat';
  var MAKS_JUDUL = 40;
  var MAKS_ISI = 400;
  var ID_OVERLAY = 'tk-overlay';
  var ID_STYLE = 'tk-style';

  var data = null;            // {templat, layananKecamatan, layananKemenag}
  var statusAktif = BTL;
  var mode = 'daftar';        // 'daftar' | 'form'
  var editId = 0;             // 0 = templat baru
  var sibuk = false;
  var berubah = false;        // ada perubahan yang tersimpan sejak dibuka
  var opsiBuka = null;
  var pesanMuat = '';         // keterangan saat data gagal dimuat
  var formKotor = false;      // isian form berubah sejak dibuka (untuk konfirmasi sebelum dibuang)
  var BATAS_TUNGGU_MS = 45000;

  function $(id) { return document.getElementById(id); }
  function utama() {
    return typeof dataPengguna !== 'undefined' && !!dataPengguna && !!dataPengguna.token &&
      String(dataPengguna.role || '').toUpperCase() === 'UTAMA';
  }
  function buat(tag, kelas, teks) {
    var e = document.createElement(tag);
    if (kelas) e.className = kelas;
    if (teks != null) e.textContent = teks;
    return e;
  }
  function toast(pesan, jenis) { if (typeof tampilkanToast === 'function') tampilkanToast(pesan, jenis || 'info', { durasi: 6000 }); }
  function rapat(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }

  function suntikStyle() {
    if ($(ID_STYLE)) return;
    var s = document.createElement('style');
    s.id = ID_STYLE;
    s.textContent = [
      '#tk-overlay{position:fixed;inset:0;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:.5rem}',
      '.tk-kotak{background:#fff;border-radius:1rem;width:100%;max-width:46rem;max-height:92vh;max-height:92dvh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.35);overflow:hidden}',
      '.tk-kepala{display:flex;align-items:flex-start;gap:.75rem;padding:.9rem 1.1rem;border-bottom:1px solid #e2e8f0}',
      '.tk-kepala h3{margin:0;font-size:.95rem;font-weight:800;color:#0f172a}',
      '.tk-kepala p{margin:.1rem 0 0;font-size:.72rem;color:#64748b}',
      '.tk-tutup{margin-left:auto;border:0;background:#f1f5f9;color:#334155;border-radius:.5rem;width:2rem;height:2rem;font-size:1.1rem;cursor:pointer;flex:none}',
      '.tk-tutup:hover{background:#e2e8f0}',
      '.tk-tab{display:flex;gap:.4rem;padding:.6rem 1.1rem 0;border-bottom:1px solid #e2e8f0;flex-wrap:wrap}',
      '.tk-tab button{border:0;background:transparent;font-size:.78rem;font-weight:700;color:#64748b;padding:.45rem .8rem;border-radius:.6rem .6rem 0 0;cursor:pointer;border-bottom:3px solid transparent}',
      '.tk-tab button.tk-on{color:#92400e;border-bottom-color:#f59e0b;background:#fffbeb}',
      '.tk-tab button.tk-on.tk-merah{color:#9f1239;border-bottom-color:#e11d48;background:#fff1f2}',
      '.tk-isi{padding:.9rem 1.1rem 1.1rem;overflow:auto;flex:1 1 auto;min-height:8rem}',
      '.tk-bar{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-bottom:.7rem}',
      '.tk-info{font-size:.7rem;color:#475569;flex:1 1 12rem}',
      '.tk-tbl{border:0;border-radius:.5rem;font-size:.75rem;font-weight:800;padding:.45rem .85rem;cursor:pointer;background:#d97706;color:#fff}',
      '.tk-tbl:hover{background:#b45309}',
      '.tk-tbl:disabled,.tk-mini:disabled{opacity:.45;cursor:not-allowed}',
      '.tk-tbl.tk-abu{background:#e2e8f0;color:#334155}',
      '.tk-tbl.tk-abu:hover{background:#cbd5e1}',
      '.tk-kartu{border:1px solid #e2e8f0;border-radius:.75rem;padding:.65rem .8rem;margin-bottom:.55rem;background:#fff}',
      '.tk-kartu.tk-mati{background:#f8fafc;opacity:.78}',
      '.tk-baris1{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem}',
      '.tk-judul{font-weight:800;font-size:.82rem;color:#0f172a}',
      '.tk-lencana{font-size:.62rem;font-weight:800;padding:.1rem .45rem;border-radius:999px;background:#e2e8f0;color:#334155}',
      '.tk-lencana.tk-hijau{background:#dcfce7;color:#166534}',
      '.tk-lencana.tk-kuning{background:#fef3c7;color:#92400e}',
      '.tk-kalimat{font-size:.74rem;color:#1e293b;margin-top:.3rem;line-height:1.35;word-break:break-word}',
      '.tk-var{background:#fde68a;color:#78350f;border-radius:.25rem;padding:0 .2rem;font-weight:800}',
      '.tk-layanan{font-size:.66rem;color:#64748b;margin-top:.2rem}',
      '.tk-aksi{display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.5rem}',
      '.tk-mini{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:.45rem;font-size:.68rem;font-weight:700;padding:.25rem .55rem;cursor:pointer}',
      '.tk-mini:hover{background:#f1f5f9}',
      '.tk-mini.tk-bahaya{border-color:#fecdd3;color:#be123c}',
      '.tk-mini.tk-bahaya:hover{background:#fff1f2}',
      '.tk-kosong{padding:1.2rem;text-align:center;font-size:.78rem;color:#64748b;border:1px dashed #cbd5e1;border-radius:.75rem}',
      '.tk-galat{padding:.8rem;font-size:.78rem;color:#9f1239;background:#fff1f2;border:1px solid #fecdd3;border-radius:.6rem}',
      '.tk-f{margin-bottom:.8rem}',
      '.tk-f label.tk-lab{display:block;font-size:.72rem;font-weight:800;color:#334155;margin-bottom:.25rem}',
      '.tk-f input[type=text],.tk-f textarea,.tk-f select{width:100%;font-size:.8rem;padding:.45rem .55rem;border:1px solid #cbd5e1;border-radius:.5rem;box-sizing:border-box;background:#fff}',
      '.tk-f textarea{min-height:5rem;text-transform:uppercase;resize:vertical}',
      '.tk-hitung{font-size:.65rem;color:#64748b;text-align:right;margin-top:.15rem}',
      '.tk-grup{border:1px solid #e2e8f0;border-radius:.6rem;padding:.5rem .65rem;margin-top:.4rem}',
      '.tk-grup b{display:block;font-size:.66rem;text-transform:uppercase;letter-spacing:.05em;color:#475569;margin-bottom:.3rem}',
      '.tk-cek{display:inline-flex;align-items:center;gap:.35rem;font-size:.74rem;color:#1e293b;margin:.15rem .8rem .15rem 0}',
      '.tk-prev{background:#fffbeb;border:1px solid #fde68a;border-radius:.6rem;padding:.55rem .7rem;font-size:.76rem;color:#78350f;margin-top:.4rem;word-break:break-word}',
      '.tk-prev.tk-merah{background:#fff1f2;border-color:#fecdd3;color:#881337}',
      '.tk-foot{display:flex;gap:.5rem;justify-content:flex-end;margin-top:.9rem;flex-wrap:wrap}'
    ].join('');
    document.head.appendChild(s);
  }

  // ---------------------------------------------------------------------------------------------
  // Server
  // ---------------------------------------------------------------------------------------------
  function panggil(nama) {
    var args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (resolve, reject) {
      if (!utama()) { reject(new Error('Fitur ini khusus Admin Utama.')); return; }
      var selesai = false;
      var timer = setTimeout(function () { if (!selesai) { selesai = true; reject(new Error('Waktu tunggu server habis. Periksa koneksi, lalu coba lagi.')); } }, BATAS_TUNGGU_MS);
      function akhir(fn, v) { if (selesai) return; selesai = true; clearTimeout(timer); fn(v); }
      try {
        var r = google.script.run
          .withSuccessHandler(function (res) {
            if (!res || res.sukses !== true) { akhir(reject, new Error((res && res.pesan) || 'Permintaan gagal.')); return; }
            akhir(resolve, res);
          })
          .withFailureHandler(function (e) { akhir(reject, e instanceof Error ? e : new Error(String(e && e.message ? e.message : e))); });
        r[nama].apply(r, [dataPengguna.token].concat(args));
      } catch (e) { akhir(reject, e); }
    });
  }

  function muat() {
    pesanMuat = '';
    // Argumen tambahan membentuk kunci cache baru -> selalu data segar (server mengabaikannya).
    return panggil('getTemplatAlasan', 'k' + Date.now()).then(function (res) { data = res; }).catch(function (e) { pesanMuat = (e && e.message) || 'Gagal memuat.'; });
  }

  function daftarStatus(status) {
    return ((data && data.templat) || []).filter(function (t) { return t.status === status; })
      .sort(function (a, b) { return (a.urutan - b.urutan) || (a.id - b.id); });
  }

  // ---------------------------------------------------------------------------------------------
  // Tampilan
  // ---------------------------------------------------------------------------------------------
  function tutup() {
    var o = $(ID_OVERLAY);
    if (o && o.parentNode) o.parentNode.removeChild(o);
    document.removeEventListener('keydown', tekanKunci, true);
    var cb = opsiBuka && opsiBuka.setelahTutup;
    var ada = berubah;
    opsiBuka = null; mode = 'daftar'; editId = 0; sibuk = false; formKotor = false;
    if (ada && window.djpmTemplatAlasan && window.djpmTemplatAlasan.buangCache) window.djpmTemplatAlasan.buangCache();
    if (typeof cb === 'function') { try { cb(ada); } catch (_e) { /* pemanggil tidak boleh menggagalkan penutupan */ } }
  }

  function tekanKunci(e) {
    if (e.key !== 'Escape' || !$(ID_OVERLAY)) return;
    // Jangan ikut menutup Detail di belakang; konfirmasi universal yang sedang terbuka menanganinya sendiri.
    var k = $('modal-konfirmasi-universal');
    if (k && !k.classList.contains('hidden') && !k.classList.contains('pointer-events-none')) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (mode === 'form') kembaliKeDaftar(); else mintaTutup();
  }

  /** Menjalankan `lanjut` bila form tidak berisi isian yang belum disimpan; selain itu minta konfirmasi dulu. */
  function denganKonfirmasiBuang(lanjut) {
    if (sibuk) return;
    if (mode !== 'form' || !formKotor) { lanjut(); return; }
    if (typeof konfirmasiAksi !== 'function') { lanjut(); return; }
    konfirmasiAksi({ judul: 'Buang isian?', pesan: 'Isian templat yang belum disimpan akan dibuang.', tipe: 'warning', teksBatal: 'Lanjut mengisi', teksKonfirmasi: 'Buang' })
      .then(function (ya) { if (ya && $(ID_OVERLAY)) lanjut(); });
  }
  function kembaliKeDaftar() { denganKonfirmasiBuang(function () { mode = 'daftar'; editId = 0; formKotor = false; render(); }); }
  function mintaTutup() { denganKonfirmasiBuang(tutup); }

  function render() {
    var o = $(ID_OVERLAY);
    if (!o) return;
    o.textContent = '';
    var kotak = buat('div', 'tk-kotak');

    var kepala = buat('div', 'tk-kepala');
    var tk = buat('div');
    var judulDlg = buat('h3', '', '⚙ Kelola Templat Alasan');
    judulDlg.id = 'tk-dlg-judul';      // id tetap: label dialog (aria-labelledby di overlay) tidak putus saat layar digambar ulang
    tk.appendChild(judulDlg);
    tk.appendChild(buat('p', '', 'Kalimat siap pakai untuk keterangan verifikasi. Perubahan di sini tidak mengubah keterangan yang sudah tersimpan.'));
    kepala.appendChild(tk);
    var x = buat('button', 'tk-tutup', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Tutup');
    x.addEventListener('click', mintaTutup);
    kepala.appendChild(x);
    kotak.appendChild(kepala);

    var tab = buat('div', 'tk-tab');
    [[BTL, ''], [TMS, ' tk-merah']].forEach(function (g) {
      var b = buat('button', (statusAktif === g[0] ? 'tk-on' : '') + g[1], g[0] + (data ? ' (' + daftarStatus(g[0]).length + ')' : ''));
      b.type = 'button';
      b.disabled = sibuk;
      b.addEventListener('click', function () { if (sibuk || statusAktif === g[0] && mode === 'daftar') return; denganKonfirmasiBuang(function () { statusAktif = g[0]; mode = 'daftar'; editId = 0; formKotor = false; render(); }); });
      tab.appendChild(b);
    });
    kotak.appendChild(tab);

    var isi = buat('div', 'tk-isi');
    if (!data) isi.appendChild(buat('div', pesanMuat ? 'tk-galat' : 'tk-kosong', pesanMuat ? 'Gagal memuat templat: ' + pesanMuat : 'Memuat…'));
    else if (mode === 'form') isiForm(isi);
    else isiDaftar(isi);
    kotak.appendChild(isi);
    o.appendChild(kotak);
  }

  function teksDenganVariabel(el, teks) {
    var bagian = String(teks).split('{LAYANAN}');
    bagian.forEach(function (b, i) {
      if (i > 0) el.appendChild(buat('span', 'tk-var', '{LAYANAN}'));
      if (b) el.appendChild(document.createTextNode(b));
    });
  }

  function jalankan(janji, pesanSukses) {
    if (sibuk) return Promise.resolve();
    sibuk = true; render();
    return janji().then(function () {
      berubah = true;
      if (pesanSukses) toast(pesanSukses, 'sukses');
      return muat();
    }).catch(function (e) {
      toast((e && e.message) || 'Gagal.', 'gagal');
    }).then(function () { sibuk = false; render(); });
  }

  function isiDaftar(isi) {
    var daftar = daftarStatus(statusAktif);
    var bar = buat('div', 'tk-bar');
    bar.appendChild(buat('div', 'tk-info', 'Variabel: {LAYANAN} diganti nama layanan penerima saat dipakai.'));
    var tambah = buat('button', 'tk-tbl', '+ Tambah templat'); tambah.type = 'button'; tambah.disabled = sibuk;
    tambah.addEventListener('click', function () { mode = 'form'; editId = 0; formKotor = false; render(); });
    bar.appendChild(tambah);
    isi.appendChild(bar);

    if (!daftar.length) {
      isi.appendChild(buat('div', 'tk-kosong', statusAktif === TMS
        ? 'Belum ada templat untuk Tidak Memenuhi Syarat. Tambahkan saat hasil verifikasi eksternal sudah ada; chip-nya baru tampil di form verifikasi setelah ada templat aktif.'
        : 'Belum ada templat. Klik "+ Tambah templat".'));
      return;
    }

    daftar.forEach(function (t, i) {
      var kartu = buat('div', 'tk-kartu' + (t.aktif ? '' : ' tk-mati'));
      var b1 = buat('div', 'tk-baris1');
      b1.appendChild(buat('span', 'tk-judul', t.judul));
      b1.appendChild(buat('span', 'tk-lencana ' + (t.aktif ? 'tk-hijau' : ''), t.aktif ? 'Aktif' : 'Nonaktif'));
      b1.appendChild(buat('span', 'tk-lencana tk-kuning', t.layanan.length ? t.layanan.length + ' layanan' : 'Semua layanan'));
      kartu.appendChild(b1);
      var k = buat('div', 'tk-kalimat'); teksDenganVariabel(k, t.isi); kartu.appendChild(k);
      if (t.layanan.length) kartu.appendChild(buat('div', 'tk-layanan', 'Berlaku untuk: ' + t.layanan.join(', ')));

      var aksi = buat('div', 'tk-aksi');
      var naik = buat('button', 'tk-mini', '▲'); naik.type = 'button'; naik.title = 'Naikkan'; naik.disabled = sibuk || i === 0;
      var turun = buat('button', 'tk-mini', '▼'); turun.type = 'button'; turun.title = 'Turunkan'; turun.disabled = sibuk || i === daftar.length - 1;
      function geser(arah) {
        var ids = daftar.map(function (x) { return x.id; });
        var j = i + arah, tmp = ids[i]; ids[i] = ids[j]; ids[j] = tmp;
        jalankan(function () { return panggil('urutkanTemplatAlasan', statusAktif, ids); });
      }
      naik.addEventListener('click', function () { geser(-1); });
      turun.addEventListener('click', function () { geser(1); });
      var sakelar = buat('button', 'tk-mini', t.aktif ? 'Nonaktifkan' : 'Aktifkan'); sakelar.type = 'button'; sakelar.disabled = sibuk;
      sakelar.addEventListener('click', function () {
        jalankan(function () { return panggil('ubahAktifTemplatAlasan', t.id, !t.aktif); }, t.aktif ? 'Templat dinonaktifkan.' : 'Templat diaktifkan.');
      });
      var ubah = buat('button', 'tk-mini', '✎ Ubah'); ubah.type = 'button'; ubah.disabled = sibuk;
      ubah.addEventListener('click', function () { mode = 'form'; editId = t.id; formKotor = false; render(); });
      var hapus = buat('button', 'tk-mini tk-bahaya', '🗑 Hapus'); hapus.type = 'button'; hapus.disabled = sibuk;
      hapus.addEventListener('click', function () {
        var lanjut = function () { jalankan(function () { return panggil('hapusTemplatAlasan', t.id); }, 'Templat dihapus.'); };
        if (typeof konfirmasiAksi === 'function') {
          konfirmasiAksi({ judul: 'Hapus templat?', pesan: 'Templat "' + t.judul + '" akan dihapus. Keterangan yang sudah tersimpan pada data penerima tidak terpengaruh.', tipe: 'danger', teksKonfirmasi: 'Hapus' })
            .then(function (ya) { if (ya) lanjut(); });
        } else lanjut();
      });
      [naik, turun, sakelar, ubah, hapus].forEach(function (b) { aksi.appendChild(b); });
      kartu.appendChild(aksi);
      isi.appendChild(kartu);
    });
  }

  function isiForm(isi) {
    var t = null;
    if (editId) {
      t = ((data && data.templat) || []).filter(function (x) { return x.id === editId; })[0] || null;
      if (!t) { mode = 'daftar'; editId = 0; isiDaftar(isi); return; }
    }
    var semuaLayanan = (data.layananKecamatan || []).concat(data.layananKemenag || []);
    var terpilih = {};
    (t ? t.layanan : []).forEach(function (l) { terpilih[l] = true; });
    var semua = !t || !t.layanan.length;   // templat baru: bawaan = semua layanan

    isi.appendChild(buat('h4', 'tk-judul', (t ? 'Ubah templat' : 'Tambah templat') + ' — ' + statusAktif));
    isi.lastChild.style.margin = '0 0 .7rem';

    // Judul
    var fJ = buat('div', 'tk-f');
    var lJ = buat('label', 'tk-lab', 'Judul chip (singkat)'); lJ.setAttribute('for', 'tk-judul');
    var iJ = buat('input'); iJ.type = 'text'; iJ.id = 'tk-judul'; iJ.maxLength = MAKS_JUDUL; iJ.value = t ? t.judul : '';
    iJ.placeholder = 'mis. Domisili Kelurahan salah';
    var cJ = buat('div', 'tk-hitung');
    fJ.appendChild(lJ); fJ.appendChild(iJ); fJ.appendChild(cJ);
    isi.appendChild(fJ);

    // Kalimat
    var fK = buat('div', 'tk-f');
    var lK = buat('label', 'tk-lab', 'Kalimat (otomatis HURUF BESAR)'); lK.setAttribute('for', 'tk-isi');
    var iK = buat('textarea'); iK.id = 'tk-isi'; iK.maxLength = MAKS_ISI; iK.value = t ? t.isi : '';
    iK.placeholder = 'mis. DOMISILI KELURAHAN SALAH, LAMPIRKAN SURAT KETERANGAN DOMISILI DARI KELURAHAN';
    var cK = buat('div', 'tk-hitung');
    var sisip = buat('button', 'tk-mini', 'Sisipkan {LAYANAN}'); sisip.type = 'button';
    sisip.title = 'Diganti nama layanan penerima saat dipakai (mis. NAZIR MUSHOLLA)';
    sisip.addEventListener('click', function () {
      var a = iK.selectionStart == null ? iK.value.length : iK.selectionStart, z = iK.selectionEnd == null ? a : iK.selectionEnd;
      iK.value = iK.value.slice(0, a) + '{LAYANAN}' + iK.value.slice(z);
      iK.focus(); iK.setSelectionRange(a + 9, a + 9); segarkan();
    });
    fK.appendChild(lK); fK.appendChild(iK); fK.appendChild(cK); fK.appendChild(sisip);
    isi.appendChild(fK);

    // Layanan
    var fL = buat('div', 'tk-f');
    fL.appendChild(buat('label', 'tk-lab', 'Berlaku untuk layanan'));
    var cekSemua = buat('label', 'tk-cek');
    var iSemua = buat('input'); iSemua.type = 'checkbox'; iSemua.checked = semua;
    cekSemua.appendChild(iSemua); cekSemua.appendChild(buat('b', '', 'Semua layanan'));
    fL.appendChild(cekSemua);
    var kotakCek = [];
    function grup(judul, daftar) {
      if (!daftar.length) return;
      var g = buat('div', 'tk-grup'); g.appendChild(buat('b', '', judul));
      daftar.forEach(function (nama) {
        var l = buat('label', 'tk-cek'); var c = buat('input'); c.type = 'checkbox'; c.value = nama; c.checked = !!terpilih[nama];
        c.addEventListener('change', segarkan);
        l.appendChild(c); l.appendChild(buat('span', '', nama)); g.appendChild(l); kotakCek.push(c);
      });
      fL.appendChild(g);
    }
    grup('Layanan Kecamatan', data.layananKecamatan || []);
    grup('Layanan Kemenag', data.layananKemenag || []);
    isi.appendChild(fL);

    // Pratinjau
    var fP = buat('div', 'tk-f');
    fP.appendChild(buat('label', 'tk-lab', 'Pratinjau (contoh layanan)'));
    var sP = buat('select'); sP.setAttribute('aria-label', 'Layanan contoh pratinjau');
    var prev = buat('div', 'tk-prev' + (statusAktif === TMS ? ' tk-merah' : ''));
    fP.appendChild(sP); fP.appendChild(prev);
    isi.appendChild(fP);

    // Aktif
    var fA = buat('div', 'tk-f');
    var lA = buat('label', 'tk-cek'); var iA = buat('input'); iA.type = 'checkbox'; iA.checked = t ? t.aktif : true;
    lA.appendChild(iA); lA.appendChild(buat('span', '', 'Aktif (tampil sebagai chip di form verifikasi)'));
    fA.appendChild(lA); isi.appendChild(fA);

    // Tombol
    var foot = buat('div', 'tk-foot');
    var batal = buat('button', 'tk-tbl tk-abu', 'Batal'); batal.type = 'button';
    batal.addEventListener('click', kembaliKeDaftar);
    var simpan = buat('button', 'tk-tbl', 'Simpan'); simpan.type = 'button';
    foot.appendChild(batal); foot.appendChild(simpan);
    isi.appendChild(foot);

    function layananDipilih() { return kotakCek.filter(function (c) { return c.checked; }).map(function (c) { return c.value; }); }
    function segarkan() {
      cJ.textContent = iJ.value.length + ' / ' + MAKS_JUDUL;
      cK.textContent = iK.value.length + ' / ' + MAKS_ISI;
      kotakCek.forEach(function (c) { c.disabled = iSemua.checked; });
      var pilihan = iSemua.checked ? semuaLayanan : layananDipilih();
      var lama = sP.value;
      sP.textContent = '';
      (pilihan.length ? pilihan : semuaLayanan).forEach(function (nama) { var o = buat('option', '', nama); o.value = nama; sP.appendChild(o); });
      if (lama && Array.prototype.some.call(sP.options, function (o) { return o.value === lama; })) sP.value = lama;
      var nm = sP.value || '';
      var hasil = rapat(String(iK.value).split('{LAYANAN}').join(nm)).toUpperCase();
      prev.textContent = hasil || '(kalimat masih kosong)';
    }
    function tandaiKotor() { formKotor = true; }
    [iJ, iK, iA, iSemua].concat(kotakCek).forEach(function (el) { el.addEventListener('input', tandaiKotor); el.addEventListener('change', tandaiKotor); });
    sisip.addEventListener('click', tandaiKotor);
    iJ.addEventListener('input', segarkan); iK.addEventListener('input', segarkan);
    iSemua.addEventListener('change', function () { if (iSemua.checked) kotakCek.forEach(function (c) { c.checked = false; }); segarkan(); });
    sP.addEventListener('change', segarkan);
    segarkan();

    simpan.addEventListener('click', function () {
      var judul = rapat(iJ.value), kalimat = rapat(iK.value);
      if (!judul) { toast('Judul wajib diisi.', 'peringatan'); iJ.focus(); return; }
      if (!kalimat) { toast('Kalimat wajib diisi.', 'peringatan'); iK.focus(); return; }
      var dipilih = layananDipilih();
      if (!iSemua.checked && !dipilih.length) { toast('Pilih minimal satu layanan, atau centang "Semua layanan".', 'peringatan'); return; }
      var payload = { judul: judul, isi: kalimat, layanan: iSemua.checked ? [] : dipilih, aktif: iA.checked };
      if (t) payload.id = t.id; else payload.status = statusAktif;
      if (sibuk) return;
      sibuk = true; simpan.disabled = true; simpan.textContent = 'Menyimpan…';
      panggil('simpanTemplatAlasan', payload).then(function (res) {
        berubah = true;
        toast(res.pesan || 'Templat disimpan.', 'sukses');
        mode = 'daftar'; editId = 0; formKotor = false;
        return muat().then(function () { sibuk = false; render(); });
      }, function (e) {
        // Gagal: form TIDAK digambar ulang supaya isian yang sudah diketik tidak hilang; cukup aktifkan lagi tombolnya.
        toast((e && e.message) || 'Gagal menyimpan.', 'gagal');
        sibuk = false; simpan.disabled = false; simpan.textContent = 'Simpan';
      });
    });
    setTimeout(function () { try { iJ.focus(); } catch (_e) { /* abaikan */ } }, 0);
  }

  // ---------------------------------------------------------------------------------------------
  // Pintu masuk
  // ---------------------------------------------------------------------------------------------
  function buka(opsi) {
    if (!utama()) { toast('Fitur ini khusus Admin Utama.', 'gagal'); return; }
    if ($(ID_OVERLAY)) return;
    suntikStyle();
    opsiBuka = opsi || {};
    data = null; mode = 'daftar'; editId = 0; sibuk = false; berubah = false; pesanMuat = ''; statusAktif = BTL; formKotor = false;
    // Kelas `fixed inset-0 z-[100]` (lapisan 100: di atas Detail (50), di bawah dialog konfirmasi (350) dan toast (500); kelasnya sudah ada di CSS) + id membuat modal-a11y.js mengenalinya sebagai modal teratas (focus trap Tab, kunci scroll,
    // fokus dikembalikan saat ditutup). `data-esc-sendiri`: tombol Esc ditangani di sini (form -> kembali ke daftar), bukan oleh modal-a11y.
    var o = buat('div', 'fixed inset-0 z-[100]'); o.id = ID_OVERLAY;
    o.setAttribute('data-esc-sendiri', '');
    o.setAttribute('aria-labelledby', 'tk-dlg-judul');
    o.addEventListener('mousedown', function (e) { if (e.target === o) mintaTutup(); });
    document.body.appendChild(o);
    document.addEventListener('keydown', tekanKunci, true);
    render();
    muat().then(function () { if ($(ID_OVERLAY)) render(); });
  }

  window.djpmTemplatKelola = { buka: buka };
})();
