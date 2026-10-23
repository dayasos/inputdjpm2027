/**
 * public/js/app-verifikasi-massal.js
 * Verifikasi Massal per layanan untuk Admin Utama (tombol "Verifikasi Massal" di Lihat Data). Dimuat malas oleh
 * app-pesan-periode.js (muatSkripAdmin) hanya untuk peran UTAMA. Rancangan: plans/plan-verifikasi-massal-per-layanan.md
 *
 * Alur: klik tombol -> pratinjau dari server (ringkasanVerifikasiMassal: jumlah data "Proses Verifikasi" per layanan)
 *       -> pilih "Semua layanan" atau satu layanan -> konfirmasi menyebut nama layanan + jumlah pasti -> eksekusi
 *       (verifikasiMassalMemenuhiSyarat dengan batasWaktu dari pratinjau, jadi data yang masuk SESUDAH pratinjau tidak ikut).
 *
 * Tidak ada pilihan awal (klik tak sengaja tidak mengarah ke "semua"). Semua teks dari server lewat esc().
 * app-transaksi.js hanya memanggil window.bukaVerifikasiMassal(); bila skrip ini belum/gagal dimuat, tombol menampilkan toast.
 */
(function () {
  'use strict';

  var ID_MODAL = 'modal-verifikasi-massal';
  var LAYANAN_MUI = { 'USTADZ': 1, 'USTADZAH': 1, 'USTADZ/USTADZAH': 1 };

  var modal = null;
  var tahap = 'tutup';          // 'tutup' | 'memuat' | 'pilih' | 'konfirmasi' | 'proses' | 'kosong' | 'galat'
  var ringkasan = null;         // jawaban server terakhir
  var pilihan = null;           // null = belum memilih; '' = semua layanan; selain itu = nama layanan (huruf besar)
  var lewatiMui = true;         // kotak centang "Lewati Perlu Koreksi MUI"
  var pesanGalat = '';

  function $(id) { return document.getElementById(id); }
  function esc2(v) {
    if (typeof window.esc === 'function') return window.esc(v);
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function angka(n) { return Number(n || 0).toLocaleString('id-ID'); }
  function adalahUtama() {
    return typeof dataPengguna !== 'undefined' && dataPengguna && String(dataPengguna.role || '').toUpperCase() === 'UTAMA';
  }

  // ---------------------------------------------------------------------------------------------
  // Hitungan dari pratinjau
  // ---------------------------------------------------------------------------------------------
  function barisTerpilih() {
    if (!ringkasan || !ringkasan.sukses || pilihan === null) return [];
    var semua = ringkasan.perLayanan || [];
    return pilihan === '' ? semua : semua.filter(function (r) { return r.layanan === pilihan; });
  }
  function jumlahTerpilih() {
    return barisTerpilih().reduce(function (a, r) { return a + r.jumlah; }, 0);
  }
  function jumlahMuiKoreksiTerpilih() {
    return barisTerpilih().reduce(function (a, r) { return a + (r.muiPerluKoreksi || 0); }, 0);
  }
  /** Jumlah yang benar-benar akan diubah = terpilih dikurangi yang dilewati (bila kotak centang MUI aktif). */
  function jumlahEfektif() {
    var lewati = lewatiMui && jumlahMuiKoreksiTerpilih() > 0 ? jumlahMuiKoreksiTerpilih() : 0;
    return jumlahTerpilih() - lewati;
  }
  function namaPilihan() { return pilihan === '' ? 'semua layanan' : 'layanan ' + pilihan; }

  // ---------------------------------------------------------------------------------------------
  // Tampilan
  // ---------------------------------------------------------------------------------------------
  function buatModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.id = ID_MODAL;
    modal.className = 'hidden fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4';
    modal.innerHTML =
      '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">' +
      '  <div class="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">' +
      '    <h3 id="vm-judul" class="text-sm font-bold text-slate-900">Verifikasi Massal</h3>' +
      '    <button type="button" id="vm-x" aria-label="Tutup" class="text-slate-400 hover:text-slate-700 text-lg leading-none px-1">&times;</button>' +
      '  </div>' +
      '  <div id="vm-isi" class="px-5 py-4 overflow-y-auto text-sm text-slate-700"></div>' +
      '  <div id="vm-kaki" class="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2 shrink-0"></div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) {
      if (e.target === modal) { if (tahap !== 'proses') tutup(); return; }
      var el = e.target.closest ? e.target.closest('[data-vm-aksi]') : null;
      if (!el || el.disabled) return;
      tangani(el.getAttribute('data-vm-aksi'));
    });
    modal.addEventListener('change', function (e) {
      var t = e.target;
      if (!t) return;
      if (t.name === 'vm-layanan') { pilihan = t.value === '__SEMUA__' ? '' : t.value; render(); return; }
      if (t.id === 'vm-lewati') { lewatiMui = !!t.checked; render(); }
    });
    $('vm-x').addEventListener('click', function () { if (tahap !== 'proses') tutup(); });
  }

  function tombol(aksi, teks, gaya, nonaktif) {
    var kelas = gaya === 'utama'
      ? 'bg-amber-600 hover:bg-amber-700 text-white'
      : 'bg-slate-200 hover:bg-slate-300 text-slate-800';
    return '<button type="button" data-vm-aksi="' + aksi + '"' + (nonaktif ? ' disabled' : '') +
      ' class="px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ' + kelas + '">' + teks + '</button>';
  }

  function htmlDaftarPilihan() {
    var semua = ringkasan.perLayanan || [];
    var h = '<p class="text-xs text-slate-600 mb-3">Pilih layanan yang akan ditandai <b>Memenuhi Syarat</b>:</p><div class="space-y-1.5">';
    function baris(nilai, label, jumlah, aktif) {
      return '<label class="flex items-center justify-between gap-3 border rounded-lg px-3 py-2 cursor-pointer ' +
        (aktif ? 'border-amber-500 bg-amber-50' : 'border-slate-200 hover:bg-slate-50') + '">' +
        '<span class="flex items-center gap-2 min-w-0"><input type="radio" name="vm-layanan" value="' + esc2(nilai) + '"' + (aktif ? ' checked' : '') + '>' +
        '<span class="font-semibold truncate">' + esc2(label) + '</span></span>' +
        '<span class="text-xs font-bold text-slate-600 shrink-0">' + angka(jumlah) + ' data</span></label>';
    }
    h += baris('__SEMUA__', 'Semua layanan', ringkasan.total, pilihan === '');
    semua.forEach(function (r) {
      // Nama kosong berarti "semua" di server: tidak boleh menjadi pilihan tersendiri (hanya masuk hitungan "Semua layanan").
      if (r.layanan) h += baris(r.layanan, r.layanan, r.jumlah, pilihan === r.layanan);
    });
    h += '</div>';
    var koreksi = jumlahMuiKoreksiTerpilih();
    if (koreksi > 0) {
      h += '<label class="mt-3 flex items-start gap-2 text-xs text-slate-700 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 cursor-pointer">' +
        '<input type="checkbox" id="vm-lewati" class="mt-0.5"' + (lewatiMui ? ' checked' : '') + '>' +
        '<span>Lewati <b>' + angka(koreksi) + '</b> data Ustadz/Ustadzah yang rekomendasi MUI-nya <b>Perlu Koreksi</b> ' +
        '(tetap Proses Verifikasi).</span></label>';
    }
    h += '<p class="mt-3 text-[11px] text-slate-500 leading-relaxed">Hanya data berstatus &quot;Proses Verifikasi&quot; yang diubah. ' +
      'Berkas Tidak Lengkap, Tidak Memenuhi Syarat, dan Memenuhi Syarat tidak disentuh. Filter di layar diabaikan.</p>';
    return h;
  }

  function render() {
    if (!modal) return;
    var isi = $('vm-isi'), kaki = $('vm-kaki'), judul = $('vm-judul');
    var h = '', k = '';
    judul.textContent = 'Verifikasi Massal → Memenuhi Syarat';
    $('vm-x').disabled = tahap === 'proses';
    if (tahap === 'memuat') {
      h = '<p class="py-6 text-center text-slate-500">Memuat jumlah data per layanan…</p>';
      k = tombol('tutup', 'Batal', 'sekunder');
    } else if (tahap === 'galat') {
      h = '<p class="py-4 text-rose-700 font-semibold">' + esc2(pesanGalat) + '</p>';
      k = tombol('tutup', 'Tutup', 'sekunder') + tombol('muat', 'Coba lagi', 'utama');
    } else if (tahap === 'kosong') {
      h = '<p class="py-6 text-center text-slate-600">Tidak ada data yang menunggu verifikasi.</p>';
      k = tombol('tutup', 'Tutup', 'sekunder');
    } else if (tahap === 'pilih') {
      h = htmlDaftarPilihan();
      k = tombol('tutup', 'Batal', 'sekunder') + tombol('lanjut', 'Lanjut', 'utama', pilihan === null);
    } else if (tahap === 'konfirmasi' || tahap === 'proses') {
      var n = jumlahEfektif();
      h = '<p class="leading-relaxed">Akan menandai <b class="text-slate-900">' + angka(n) + '</b> data <b class="text-slate-900">' +
        esc2(namaPilihan()) + '</b> menjadi <b>&quot;Memenuhi Syarat&quot;</b>.</p>' +
        (lewatiMui && jumlahMuiKoreksiTerpilih() > 0
          ? '<p class="mt-2 text-xs text-sky-800">' + angka(jumlahMuiKoreksiTerpilih()) + ' data Ustadz/Ustadzah &quot;Perlu Koreksi&quot; dilewati.</p>' : '') +
        '<p class="mt-2 text-xs text-slate-500">Data yang masuk setelah pratinjau ini tidak ikut diverifikasi. Lanjutkan?</p>' +
        (pesanGalat ? '<p class="mt-3 text-xs text-rose-700 font-semibold">' + esc2(pesanGalat) + '</p>' : '');
      var proses = tahap === 'proses';
      k = tombol('kembali', 'Kembali', 'sekunder', proses) +
        tombol('eksekusi', proses ? 'Memproses…' : 'Ya, Verifikasi ' + angka(n) + ' Data', 'utama', proses || n <= 0);
    }
    var fokus = document.activeElement, kunciFokus = null;
    if (fokus && isi.contains(fokus)) kunciFokus = fokus.name === 'vm-layanan' ? 'r:' + fokus.value : (fokus.id === 'vm-lewati' ? 'c' : null);
    isi.innerHTML = h;
    kaki.innerHTML = k;
    if (kunciFokus) {
      var el = kunciFokus === 'c' ? $('vm-lewati') : [].filter.call(isi.querySelectorAll('input[name="vm-layanan"]'), function (x) { return x.value === kunciFokus.slice(2); })[0];
      if (el && el.focus) el.focus();
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Aksi
  // ---------------------------------------------------------------------------------------------
  function tangani(aksi) {
    if (aksi === 'tutup') { tutup(); return; }
    if (aksi === 'muat') { muat(); return; }
    if (aksi === 'lanjut') { if (pilihan === null) return; pesanGalat = ''; tahap = 'konfirmasi'; render(); return; }
    if (aksi === 'kembali') { pesanGalat = ''; tahap = 'pilih'; render(); return; }
    if (aksi === 'eksekusi') { eksekusi(); }
  }

  function tutup() {
    if (tahap === 'proses') return;
    tahap = 'tutup';
    if (modal) modal.classList.add('hidden');
  }

  function muat() {
    tahap = 'memuat';
    pilihan = null;
    ringkasan = null;
    pesanGalat = '';
    render();
    google.script.run
      .withSuccessHandler(function (res) {
        if (tahap !== 'memuat') return;
        if (!res || !res.sukses) { pesanGalat = (res && res.pesan) || 'Gagal memuat pratinjau.'; tahap = 'galat'; render(); return; }
        ringkasan = res;
        tahap = (res.total > 0 && (res.perLayanan || []).length > 0) ? 'pilih' : 'kosong';
        render();
      })
      .withFailureHandler(function (err) {
        if (tahap !== 'memuat') return;
        pesanGalat = typeof pesanErrorRamah === 'function' ? pesanErrorRamah(err) : 'Gagal memuat pratinjau.';
        tahap = 'galat';
        render();
      })
      .ringkasanVerifikasiMassal(dataPengguna.token);
  }

  function segarkanDaftar() {
    if (typeof invalidateCacheDataTransaksi === 'function') invalidateCacheDataTransaksi();
    // Menyinkronkan dengan data resmi server tanpa skeleton: masterDataLihat sudah diisi pembaruan optimistik.
    if (typeof inisialisasiMenuLihatData === 'function') inisialisasiMenuLihatData();
  }

  /** Tandai baris lokal yang SESUAI pilihan; server tetap sumber kebenaran (daftar dimuat ulang sesudahnya). */
  function perbaruiBarisLokal(layanan, lewati) {
    if (typeof masterDataLihat === 'undefined') return;
    for (var i = 0; i < masterDataLihat.length; i++) {
      var r = masterDataLihat[i];
      if ((r[18] || 'Proses Verifikasi') !== 'Proses Verifikasi') continue;
      var lay = String(r[7] || '').toUpperCase().trim();
      if (layanan && lay !== layanan) continue;
      if (lewati && LAYANAN_MUI[lay] && String(r[20] || '').toUpperCase() === 'PERLU_KOREKSI') continue;
      r[18] = 'Memenuhi Syarat';
    }
  }

  function eksekusi() {
    if (tahap !== 'konfirmasi' || pilihan === null) return;
    var layanan = pilihan;
    var lewati = lewatiMui && jumlahMuiKoreksiTerpilih() > 0;
    var batas = ringkasan.batasWaktu;
    pesanGalat = '';
    tahap = 'proses';
    render();
    google.script.run
      .withSuccessHandler(function (res) {
        if (!res || !res.sukses) {
          tahap = 'konfirmasi';
          pesanGalat = 'Gagal: ' + ((res && res.pesan) || 'tidak diketahui');
          render();
          return;
        }
        tahap = 'tutup';
        modal.classList.add('hidden');
        if (res.jumlah > 0) {
          tampilkanToast('Selesai! ' + angka(res.jumlah) + ' data ' + (layanan ? 'layanan ' + layanan : 'semua layanan') +
            ' ditandai "Memenuhi Syarat".', 'sukses');
          perbaruiBarisLokal(layanan, lewati);
          if (typeof saringDanTampilkanTabel === 'function') saringDanTampilkanTabel();
        } else {
          tampilkanToast('Tidak ada data yang diverifikasi (mungkin sudah diubah admin lain).', 'info');
        }
        segarkanDaftar();
      })
      .withFailureHandler(function (err) {
        // Jaringan putus: perubahan MUNGKIN sudah tersimpan -> tutup dan muat ulang dari server, jangan menebak.
        tahap = 'tutup';
        modal.classList.add('hidden');
        tampilkanToast((typeof pesanErrorRamah === 'function' ? pesanErrorRamah(err) : 'Gagal menghubungi server.') +
          ' Daftar dimuat ulang untuk memastikan hasilnya.', 'gagal', { durasi: 7000 });
        segarkanDaftar();
      })
      .verifikasiMassalMemenuhiSyarat(dataPengguna.token, layanan, batas, lewati);
  }

  // ---------------------------------------------------------------------------------------------
  // Pintu masuk (dipanggil app-transaksi.js)
  // ---------------------------------------------------------------------------------------------
  window.bukaVerifikasiMassal = function () {
    if (typeof pastikanLogin === 'function' && !pastikanLogin()) return;
    if (!adalahUtama()) return;
    if (tahap !== 'tutup') return; // sudah terbuka
    buatModal();
    lewatiMui = true;
    modal.classList.remove('hidden');
    muat();
  };
})();
