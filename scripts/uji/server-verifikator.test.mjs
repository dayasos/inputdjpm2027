// Uji role VERIFIKATOR (tim verifikator). Rencana: plans/plan-tim-verifikator.md.
// Menjalankan kode server APA ADANYA (dibundel; tanpa Deno) dengan database tiruan; data KARANGAN, tanpa koneksi database/jaringan.
// Jalankan: npm run uji:verifikator     (Node 24+)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { db, muatServer } from "./_harness-server.mjs";
import { AKSI_VERIFIKATOR, ditolakUntukVerifikator, bolehVerifikasiSatuData, adalahVerifikator, PESAN_VERIFIKATOR_DITOLAK } from "../../supabase/functions/api/_shared/gerbangPeran.ts";

const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const verifikasi = await muatServer("supabase/functions/api/domains/verifikasi.ts");
const penerima = await muatServer("supabase/functions/api/domains/penerima.ts");
const templat = await muatServer("supabase/functions/api/domains/templatAlasan.ts");
const dashboard = await muatServer("supabase/functions/api/domains/dashboard.ts");
const akses = await muatServer("supabase/functions/api/_shared/akses.ts");
const akun = await muatServer("supabase/functions/api/domains/akun.ts");

const SESI = {
  UTAMA: { akun_id: "a1", username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN" },
  VERIF: { akun_id: "a9", username: "verif_andi", role: "VERIFIKATOR", kecamatan: "", user_id: "" },
  KEC: { akun_id: "a2", username: "kec_medan_kota", role: "KECAMATAN", kecamatan: "MEDAN KOTA", user_id: "KECAMATAN MEDAN KOTA" },
  GMM: { akun_id: "a3", username: "gmm_timur", role: "GURU MAGHRIB MENGAJI", kecamatan: "MEDAN TIMUR", user_id: "GMM MEDAN TIMUR" },
};
let sesiAktif = SESI.VERIFIKATOR;
let barisPenerima = null;
let statusAwal = "Proses Verifikasi";
const BARIS = (lebih = {}) => ({
  id: 1, tahun: 2027, nomor_urut: 1, nama: "ANI", nik: "1271010101900001", jenis_kelamin: "PEREMPUAN", tempat_lahir: "MEDAN",
  tanggal_lahir: new Date("1989-02-04T00:00:00Z"), alamat: "JL X", layanan: "IMAM MASJID", tempat_tugas: "MASJID A", alamat_tugas: "JL Y",
  kecamatan: "MEDAN KOTA", kelurahan: "SITI REJO", nama_rekening: "A", nomor_rekening: "12345678901234", kantor_cabang: "B", no_kontak: "0812345678",
  status_bpjs_tk: "TIDAK", umur: 37, status_verifikasi: "Proses Verifikasi", keterangan_verifikasi: "", tanggal_verifikasi: null, diverifikasi_oleh: "",
  link_koordinat_lokasi: "", diperbarui_at: new Date("2026-10-26T00:00:00Z"), dibuat_oleh_akun_id: null, id_folder_berkas: "x", tanggal_berkas_diubah: null, ...lebih,
});
function pasang() {
  db().panggilan.length = 0;
  db().handler = (q, v) => {
    if (q.includes("from sesi_login")) return [sesiAktif];
    if (q.includes("select status_verifikasi from penerima where id")) return [{ status_verifikasi: statusAwal }];
    if (q.includes("update penerima set")) return [{ id: 1 }];
    if (q.includes("select 1 from penerima where tahun")) return [{ "?column?": 1 }];   // pemeriksaan layanan dikenal (verifikasi massal)
    if (q.includes("select * from penerima where id") || q.includes("from penerima where id")) return barisPenerima ? [barisPenerima] : [];
    if (q.includes("from akun where id")) return [{ nama_lengkap: "Andi Saputra" }];
    if (q.includes("from akun where lower(username)")) return String(v[0]).toLowerCase() === "verif_andi" ? [{ nama_lengkap: "Andi Saputra" }] : [];
    if (q.includes("from kuota_katolik")) return [];
    if (q.includes("from kuota")) return [{ kecamatan: "MEDAN KOTA", layanan: "IMAM MASJID", kuota_maks: 10 }];
    if (q.includes("group by")) return [{ layanan: "IMAM MASJID", kecamatan: "MEDAN KOTA", kelurahan: "SITI REJO", katolik: false, status_verifikasi: "Memenuhi Syarat", jumlah: 3 }];
    return [];
  };
}
const token = (() => { let n = 0; return () => "token-verif-" + (++n); })();
const pakai = (peran) => { sesiAktif = SESI[peran]; pasang(); };
const tulisan = (awal) => db().panggilan.filter((p) => p.teks.toLowerCase().includes(awal));
const riwayat = () => tulisan("insert into riwayat_verifikasi");

// ====================================================== gerbang daftar-putih (murni)
test("GERBANG: hanya role VERIFIKATOR yang dibatasi; role lain tidak pernah ditolak oleh gerbang", () => {
  for (const peran of ["UTAMA", "KECAMATAN", "MUI", "GURU MAGHRIB MENGAJI", "IMAM MASJID", "", null, undefined, "VERIFIKATOR2", "verif"]) {
    assert.equal(ditolakUntukVerifikator(peran, "hapusUser"), false, String(peran));
    assert.equal(ditolakUntukVerifikator(peran, "aksiApaSaja"), false, String(peran));
  }
  for (const peran of ["VERIFIKATOR", "verifikator", "  Verifikator  "]) assert.equal(adalahVerifikator(peran), true, peran);
  assert.equal(ditolakUntukVerifikator("VERIFIKATOR", undefined), true);
  assert.equal(ditolakUntukVerifikator("VERIFIKATOR", 123), true);
});

test("GERBANG: seluruh aksi di ALLOWED index.ts DITOLAK untuk VERIFIKATOR kecuali daftar-putih; daftar-putih tidak memuat aksi tulis/kelola", () => {
  const sumber = baca("supabase/functions/api/index.ts");
  const mulai = sumber.indexOf("const ALLOWED");
  const akhir = sumber.indexOf("\n};", mulai);
  assert.ok(mulai > 0 && akhir > mulai, "blok ALLOWED ditemukan");
  const semua = [...sumber.slice(mulai, akhir).matchAll(/^\s{2}([A-Za-z0-9_]+)\s*[,:]/gm)].map((m) => m[1]);
  assert.ok(semua.length > 80, "banyak aksi terdeteksi: " + semua.length);
  for (const aksi of AKSI_VERIFIKATOR) assert.ok(semua.includes(aksi), "aksi daftar-putih ada di ALLOWED: " + aksi);
  const ditolak = semua.filter((a) => ditolakUntukVerifikator("VERIFIKATOR", a));
  assert.equal(ditolak.length, semua.length - AKSI_VERIFIKATOR.size);
  // Aksi yang TIDAK BOLEH ada di daftar-putih.
  const terlarang = ["ambilStatusPeriode", "simpanDataKeSheet", "editDataPenerima", "validasiDataBaru", "mintaUrlUploadBerkas", "konfirmasiUploadBerkas", "mulaiUnggahBerkas", "adminUbahData",
    "adminHapusData", "adminHapusDataMassal", "adminHapusBerkasMassal", "verifikasiMassalMemenuhiSyarat", "ringkasanVerifikasiMassal", "getDaftarBerkasTidakLengkapUntukWA",
    "simpanTemplatAlasan", "ubahAktifTemplatAlasan", "hapusTemplatAlasan", "urutkanTemplatAlasan", "tambahUserBaru", "hapusUser", "resetPasswordUser", "ubahDataUserOlehAdmin",
    "ambilDaftarAkun", "ambilDaftarAkunLengkap", "simpanKuota", "getSemuaKuota", "buatBatchPembayaran", "setInputKecKem", "aturJadwalPeriode", "terbitkanPesanAdmin",
    "tambahRumahIbadah", "ubahRumahIbadah", "hapusRumahIbadah", "sinkronDataSheet2026", "eksporDataKeSpreadsheet", "laporkanPerbaikanBerkas", "simpanCatatanRekomendasiMui",
    "ambilDataDetail", "cekNikRealtime", "buatTokenSSORetur", "cekBatasWaktuVerifikasi", "ubahProfilUser"];
  for (const aksi of terlarang) {
    assert.equal(AKSI_VERIFIKATOR.has(aksi), false, "TIDAK boleh di daftar-putih: " + aksi);
    assert.equal(ditolakUntukVerifikator("VERIFIKATOR", aksi), true, aksi);
  }
});

test("KABEL: index.ts memasang gerbang SEBELUM menjalankan fungsi aksi, memeriksa token header DAN args[0], dan tidak membebani aksi publik", () => {
  const s = baca("supabase/functions/api/index.ts");
  assert.match(s, /import \{ ditolakUntukVerifikator, PESAN_VERIFIKATOR_DITOLAK \} from "\.\/_shared\/gerbangPeran\.ts";/);
  const iGerbang = s.indexOf("ditolakUntukVerifikator(sesiGerbang.role, action)");
  const iJalan = s.indexOf("const hasil = await fn(...args);");
  assert.ok(iGerbang > 0 && iJalan > iGerbang, "gerbang sebelum fn(...args)");
  assert.match(s, /for \(const tk of \[sessionTokenFromHeader, typeof args\[0\] === "string" \? args\[0\] : null\]\)/, "dua token diperiksa");
  assert.match(s, /if \(!aksiPublikTanpaGerbang\(action\) && !AKSI_HANYA_JALUR_SECRET\.has\(action\)\) \{\s*for \(const tk of/, "aksi publik dan aksi khusus jalur _secret dilewati");
});

test("HAK: verifikasi satu data boleh UTAMA dan VERIFIKATOR saja; verifikasi massal tidak memakai helper ini", () => {
  for (const ya of ["UTAMA", "VERIFIKATOR", "verifikator"]) assert.equal(bolehVerifikasiSatuData(ya), true, ya);
  for (const tidak of ["KECAMATAN", "MUI", "GURU MAGHRIB MENGAJI", "", null, undefined]) assert.equal(bolehVerifikasiSatuData(tidak), false, String(tidak));
  const v = baca("supabase/functions/api/domains/verifikasi.ts");
  const iMassal = v.indexOf("export async function verifikasiMassalMemenuhiSyarat");
  const iWA = v.indexOf("export async function getDaftarBerkasTidakLengkapUntukWA");
  assert.ok(!v.slice(iMassal, iMassal + 1500).includes("bolehVerifikasiSatuData"), "massal tetap khusus UTAMA");
  assert.ok(!v.slice(iWA, iWA + 1200).includes("bolehVerifikasiSatuData"), "daftar WA tetap khusus UTAMA");
});

// ====================================================== akses baca
test("AKSES: VERIFIKATOR dipetakan ke instansi baca-semua; role lain tidak berubah", async () => {
  pakai("VERIFIKATOR");
  const v = await akses.resolveInstansiPengguna("VERIFIKATOR");
  assert.equal(v.instansiPengguna, "VERIFIKATOR");
  assert.equal((await akses.resolveInstansiPengguna("UTAMA")).instansiPengguna, "SUPERADMIN");
  assert.equal((await akses.resolveInstansiPengguna("KECAMATAN")).instansiPengguna, "KECAMATAN");
  assert.equal((await akses.resolveInstansiPengguna("VERIFIKATOR2")).instansiPengguna, null, "role tak dikenal tetap ditolak");
  const baris = { layananSheet: "IMAM MASJID", kecamatanSheet: "MEDAN TIMUR", kelurahanSheet: "X", tempatTugasSheet: "Y" };
  const umum = { namaKecamatanPengguna: "", kelurahanTerkunci: "", subFilterGsm: "", listLayananKemenag: ["GURU MAGHRIB MENGAJI"], layananPengguna: "" };
  assert.equal(akses.lolosAksesBarisLihatData({ ...umum, instansiPengguna: "VERIFIKATOR", ...baris }), true);
  assert.equal(akses.lolosAksesBarisLihatData({ ...umum, instansiPengguna: "VERIFIKATOR", ...baris, layananSheet: "GURU MAGHRIB MENGAJI" }), true);
  assert.equal(akses.lolosAksesBarisLihatData({ ...umum, instansiPengguna: null, ...baris }), false);
});

test("DETAIL: VERIFIKATOR dapat membuka detail; indeks 54 berisi nama lengkap pemverifikator (kosong bila otomatis/akun tak ada/belum diverifikasi)", async () => {
  for (const [oleh, diharap] of [["VERIF_ANDI", "Andi Saputra"], ["SISTEM (OTOMATIS)", ""], ["HANTU", ""], ["", ""]]) {
    barisPenerima = BARIS({ status_verifikasi: oleh ? "Memenuhi Syarat" : "Proses Verifikasi", diverifikasi_oleh: oleh, tanggal_verifikasi: oleh ? new Date("2026-11-05T05:11:31Z") : null });
    for (const peran of ["VERIF", "UTAMA"]) {
      pakai(peran);
      const h = JSON.parse(await penerima.ambilDetailPenerimaPerBaris(token(), 1));
      assert.equal(h.sukses, true, peran + " " + JSON.stringify(h));
      assert.equal(h.dataLengkap[54], diharap, peran + " " + oleh);
      assert.equal(h.dataLengkap[32], barisPenerima.status_verifikasi);
    }
  }
  pakai("VERIF");
  barisPenerima = BARIS({ diverifikasi_oleh: "SISTEM (OTOMATIS)" });
  await penerima.ambilDetailPenerimaPerBaris(token(), 1);
  assert.equal(db().panggilan.filter((p) => p.teks.includes("from akun where lower(username)")).length, 0, "pemverifikasi otomatis tidak dicari ke tabel akun");
});

test("DETAIL: nama lengkap pemverifikator TIDAK dikirim ke petugas (Kecamatan/GMM), hanya ke UTAMA dan VERIFIKATOR", async () => {
  barisPenerima = BARIS({ status_verifikasi: "Memenuhi Syarat", diverifikasi_oleh: "VERIF_ANDI", tanggal_verifikasi: new Date("2026-11-05T05:11:31Z") });
  for (const [peran, diharap] of [["UTAMA", "Andi Saputra"], ["VERIF", "Andi Saputra"], ["KEC", ""], ["GMM", ""]]) {
    pakai(peran);
    const h = JSON.parse(await penerima.ambilDetailPenerimaPerBaris(token(), 1));
    if (!h.sukses) continue;   // data di luar wilayah petugas ditolak: tidak ada yang dikirim sama sekali
    assert.equal(h.dataLengkap[54], diharap, peran);
    assert.equal(h.dataLengkap[35], "VERIF_ANDI", "username tetap tampil seperti sebelumnya (" + peran + ")");
  }
  pakai("KEC");
  const k = JSON.parse(await penerima.ambilDetailPenerimaPerBaris(token(), 1));
  assert.equal(k.sukses, true, "Kecamatan wilayahnya sendiri: detail terbuka");
  assert.equal(db().panggilan.filter((p) => p.teks.includes("from akun where lower(username)")).length, 0, "petugas: tidak ada kueri nama lengkap");
});

test("DETAIL: keterangan penginput TIDAK dikirim ke VERIFIKATOR (indeks 48-50 kosong)", async () => {
  barisPenerima = BARIS({ dibuat_oleh_akun_id: "akun-penginput", dibuat_at: new Date("2026-10-01T00:00:00Z") });
  pakai("VERIF");
  const h = JSON.parse(await penerima.ambilDetailPenerimaPerBaris(token(), 1));
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.equal(h.dataLengkap[48] + h.dataLengkap[49] + h.dataLengkap[50], "");
});

test("DASHBOARD: VERIFIKATOR melihat dashboard seluruh kota persis seperti UTAMA (bukan sebagai akun layanan)", async () => {
  pakai("UTAMA");
  const u = await dashboard.getDashboardProgresVerifikasi(token());
  pakai("VERIF");
  const v = await dashboard.getDashboardProgresVerifikasi(token());
  assert.equal(u.sukses, true, JSON.stringify(u));
  assert.deepEqual(v, u);
  assert.equal(v.bisaFilterKecamatan, true);
  pakai("GMM");
  const g = await dashboard.getDashboardProgresVerifikasi(token());
  assert.notDeepEqual(g.kartu.map((k) => k.layanan), v.kartu.map((k) => k.layanan), "akun GMM tetap berbeda (perilaku lama utuh)");
});

// ====================================================== verifikasi
const verif = (...a) => verifikasi.verifikasiSatuData(token(), 1, ...a);
for (const peran of ["VERIF", "UTAMA"]) {
  test(`VERIFIKASI [${peran}]: tiga status dapat diberikan; username tercatat di diverifikasi_oleh DAN riwayat_verifikasi`, async () => {
    for (const [status, ket, batas, sumberKet] of [["Memenuhi Syarat", "", "", ""], ["Berkas Tidak Lengkap", "KTP buram", "2026-11-30", "KTP buram"], ["Tidak Memenuhi Syarat", "Bukan warga", "", "Bukan warga"]]) {
      pakai(peran); statusAwal = "Proses Verifikasi";
      const h = await verif(status, ket, batas);
      assert.equal(h.sukses, true, status + " " + JSON.stringify(h));
      const oleh = SESI[peran].username.toUpperCase();
      assert.equal(h.verifikator, oleh);
      assert.equal(h.namaLengkap, "Andi Saputra", "nama lengkap pemverifikator ikut dikembalikan (agar layar tidak menampilkan nama lama)");
      const up = tulisan("update penerima set");
      assert.equal(up.length, 1);
      assert.ok(up[0].nilai.includes(oleh), "diverifikasi_oleh = username");
      assert.ok(up[0].nilai.includes(status));
      const r = riwayat();
      assert.equal(r.length, 1, "satu baris riwayat");
      assert.deepEqual(r[0].nilai.slice(0, 6), [1, 2027, "Proses Verifikasi", status, sumberKet, oleh]);
      assert.equal(r[0].nilai[6], "SATU");
    }
  });
}

test("VERIFIKASI: alasan wajib untuk Berkas Tidak Lengkap dan Tidak Memenuhi Syarat (verifikator tidak bisa melewatinya); tanpa menulis", async () => {
  pakai("VERIF");
  for (const status of ["Berkas Tidak Lengkap", "Tidak Memenuhi Syarat"]) {
    const h = await verif(status, "   ", "2026-11-30");
    assert.equal(h.sukses, false, status);
    assert.match(h.pesan, /Keterangan hasil verifikasi wajib diisi/);
  }
  assert.equal(tulisan("update penerima set").length, 0);
  assert.equal(riwayat().length, 0);
  // Batas waktu perbaikan kini SERAGAM (ditetapkan server): tanpa tanggal dari browser tetap sukses.
  const h2 = await verif("Berkas Tidak Lengkap", "alasan", "");
  assert.equal(h2.sukses, true);
});

test("VERIFIKASI: peran selain UTAMA/VERIFIKATOR ditolak (Kecamatan, GMM), tanpa menulis apa pun", async () => {
  for (const peran of ["KEC", "GMM"]) {
    pakai(peran);
    const h = await verif("Memenuhi Syarat", "", "");
    assert.equal(h.sukses, false, peran);
    assert.match(h.pesan, /khusus Admin Utama dan Verifikator/);
    const h2 = await verifikasi.tandaiSudahDiperbaiki(token(), 1);
    assert.equal(h2.sukses, false, peran);
    assert.equal(tulisan("update penerima set").length, 0);
    assert.equal(riwayat().length, 0);
  }
});

test("VERIFIKASI: konflik (status sudah berubah oleh verifikator lain) tidak menulis riwayat", async () => {
  pakai("VERIF");
  db().handler = ((asli) => (q, v) => (q.includes("update penerima set") ? [] : q.includes("select status_verifikasi from penerima") ? [{ status_verifikasi: "Memenuhi Syarat" }] : asli(q, v)))(db().handler);
  const h = await verifikasi.verifikasiSatuData(token(), 1, "Berkas Tidak Lengkap", "alasan", "2026-11-30", "Proses Verifikasi");
  assert.equal(h.sukses, false);
  assert.equal(h.konflik, true);
  assert.equal(riwayat().length, 0);
});

test("TANDAI SUDAH DIPERBAIKI (D9): khusus Admin Utama; VERIFIKATOR ditolak tanpa menulis; UTAMA sukses dengan riwayat DIPERBAIKI atas namanya", async () => {
  pakai("VERIF");
  const t = await verifikasi.tandaiSudahDiperbaiki(token(), 1);
  assert.equal(t.sukses, false, JSON.stringify(t));
  assert.match(t.pesan, /khusus Admin Utama/);
  assert.equal(tulisan("update penerima set").length, 0);
  assert.equal(riwayat().length, 0);
  pakai("UTAMA");
  const h = await verifikasi.tandaiSudahDiperbaiki(token(), 1);
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.equal(h.verifikator, "ADMIN");
  const r = riwayat();
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].nilai, [1, 2027, "Berkas Tidak Lengkap", "Memenuhi Syarat", "", "ADMIN", "DIPERBAIKI"]);
});

test("RIWAYAT (D8): untuk VERIFIKATOR riwayat WAJIB satu transaksi dengan pembaruan status; bila riwayat gagal, verifikasi gagal dan pembaruan DIBATALKAN", async () => {
  pakai("VERIF");
  const asli = db().handler;
  db().handler = (q, v) => { if (q.includes("insert into riwayat_verifikasi")) throw new Error('relation "riwayat_verifikasi" does not exist'); return asli(q, v); };
  const h = await verif("Memenuhi Syarat", "", "");
  assert.equal(h.sukses, false, JSON.stringify(h));
  const up = tulisan("update penerima set");
  assert.equal(up.length, 1);
  assert.equal(up[0].dibatalkan, true, "pembaruan status ikut dibatalkan (rollback)");
});

test("RIWAYAT: untuk Admin Utama tetap NON-BLOCKING (riwayat gagal tidak menghambat verifikasi)", async () => {
  pakai("UTAMA");
  const asli = db().handler;
  db().handler = (q, v) => { if (q.includes("insert into riwayat_verifikasi")) throw new Error('relation "riwayat_verifikasi" does not exist'); return asli(q, v); };
  const galat = console.error; console.error = () => {};
  try {
    const h = await verif("Memenuhi Syarat", "", "");
    assert.equal(h.sukses, true, JSON.stringify(h));
    assert.notEqual(tulisan("update penerima set")[0].dibatalkan, true);
  } finally { console.error = galat; }
});

test("D9: VERIFIKATOR hanya boleh memberi hasil pada data yang masih Proses Verifikasi (syarat ada di UPDATE); Admin Utama tidak dibatasi", async () => {
  pakai("VERIF");
  await verif("Memenuhi Syarat", "", "");
  let up = tulisan("update penerima set")[0];
  assert.ok(up.teks.includes("upper(trim(status_verifikasi)) = 'PROSES VERIFIKASI'"), "predikat Proses Verifikasi");
  assert.equal(up.nilai[up.nilai.length - 1], true, "parameter terakhir (pelaku verifikator) = true");
  pakai("UTAMA");
  await verif("Memenuhi Syarat", "", "");
  up = tulisan("update penerima set")[0];
  assert.equal(up.nilai[up.nilai.length - 1], false, "parameter terakhir (pelaku verifikator) = false untuk Admin Utama");
});

test("D9: data sudah berstatus -> VERIFIKATOR mendapat pesan 'perubahan hanya oleh Admin Utama' (konflik), tanpa riwayat; Admin Utama mendapat pesan konflik biasa", async () => {
  for (const [peran, pola] of [["VERIF", /Perubahan hanya dapat dilakukan oleh Admin Utama/], ["UTAMA", /diverifikasi\/diubah oleh admin lain/]]) {
    pakai(peran);
    const asli = db().handler;
    db().handler = (q, v) => (q.includes("update penerima set") ? [] : q.includes("select status_verifikasi from penerima") ? [{ status_verifikasi: "Memenuhi Syarat" }] : asli(q, v));
    const h = await verif("Berkas Tidak Lengkap", "alasan", "", "Proses Verifikasi");
    assert.equal(h.sukses, false, peran);
    assert.equal(h.konflik, true, peran);
    assert.match(h.pesan, pola, peran);
    assert.equal(riwayat().length, 0, peran);
  }
});

test("VERIFIKASI MASSAL dan daftar WA tetap KHUSUS Admin Utama: VERIFIKATOR ditolak tanpa menulis; UTAMA tetap bisa", async () => {
  pakai("VERIF");
  const m = await verifikasi.verifikasiMassalMemenuhiSyarat(token(), "IMAM MASJID", null, false);
  assert.equal(m.sukses, false, JSON.stringify(m));
  const w = await verifikasi.getDaftarBerkasTidakLengkapUntukWA(token(), "");
  assert.equal(w.sukses, false, JSON.stringify(w));
  const r = await verifikasi.ringkasanVerifikasiMassal(token());
  assert.equal(r.sukses, false);
  assert.equal(tulisan("update penerima set").length, 0);
  pakai("UTAMA");
  const mu = await verifikasi.verifikasiMassalMemenuhiSyarat(token(), "IMAM MASJID", null, false);
  assert.equal(mu.sukses, true, JSON.stringify(mu));
});

// ====================================================== templat alasan
test("TEMPLAT: VERIFIKATOR boleh MEMBACA templat; mengelola (simpan/ubah/hapus/urut) tetap khusus Admin Utama", async () => {
  pakai("VERIF");
  const baca1 = await templat.getTemplatAlasan(token());
  assert.equal(baca1.sukses, true, JSON.stringify(baca1));
  for (const [nama, ...arg] of [["simpanTemplatAlasan", { judul: "x", isi: "y", statusBerlaku: "Berkas Tidak Lengkap" }], ["ubahAktifTemplatAlasan", 1, false], ["hapusTemplatAlasan", 1], ["urutkanTemplatAlasan", "Berkas Tidak Lengkap", [1, 2]]]) {
    const h = await templat[nama](token(), ...arg);
    assert.equal(h.sukses, false, nama);
    assert.match(h.pesan, /khusus Admin Utama/, nama);
  }
  assert.equal(db().panggilan.filter((p) => /insert into templat_alasan|update templat_alasan|delete from templat_alasan/i.test(p.teks)).length, 0);
  pakai("KEC");
  assert.equal((await templat.getTemplatAlasan(token())).sukses, false, "Kecamatan tetap tidak boleh");
});

// ====================================================== lapis kedua: tidak boleh menulis data penerima
test("LAPIS KEDUA: editDataPenerima dan simpanDataKeSheet menolak VERIFIKATOR sendiri (selain gerbang di index.ts), tanpa menulis", async () => {
  barisPenerima = BARIS();
  pakai("VERIF");
  const e = await penerima.editDataPenerima(token(), 1, { teks: { 1: "NAMA BARU" } });
  assert.equal(e.sukses, false);
  assert.equal(e.pesan, PESAN_VERIFIKATOR_DITOLAK);
  const s = await penerima.simpanDataKeSheet(token(), { inputNama: "Budi", inputNik: "1271010101900002", selectLayanan: "IMAM MASJID" });
  assert.equal(s.sukses, false);
  assert.equal(s.pesan, PESAN_VERIFIKATOR_DITOLAK);
  assert.equal(db().panggilan.filter((p) => /^UNSAFE update penerima|insert into penerima|update penerima set/i.test(p.teks)).length, 0);
  // Kontrol: peran lain tetap lolos ke pemeriksaan berikutnya (tidak terkena lapis kedua).
  pakai("UTAMA");
  const ok = await penerima.editDataPenerima(token(), 1, { teks: { 1: "NAMA BARU" } });
  assert.notEqual(ok.pesan, PESAN_VERIFIKATOR_DITOLAK);
});

test("AKUN: Verifikator TIDAK dapat mengganti username sendiri (jejak verifikasi memakai username); role lain tidak terkena larangan ini", async () => {
  pakai("VERIF");
  const h = await akun.ubahAkunSendiri(token(), "sandiLama1", "verif_baru", "", "");
  assert.equal(h.sukses, false);
  assert.match(h.pesan, /Username akun Verifikator tidak dapat diubah/);
  const h2 = await akun.ubahAkunSendiri(token(), "sandiLama1", "verif_baru", "sandiBaru12", "sandiBaru12");
  assert.match(h2.pesan, /Username akun Verifikator tidak dapat diubah/, "juga saat bersama ganti sandi");
  assert.equal(db().panggilan.filter((p) => /update akun|from akun where username/i.test(p.teks)).length, 0, "tidak menyentuh tabel akun");
  pakai("UTAMA");
  const u = await akun.ubahAkunSendiri(token(), "sandiLama1", "admin_baru", "", "");
  assert.doesNotMatch(String(u.pesan), /Verifikator/, "UTAMA tidak terkena larangan");
  pakai("VERIF");
  const p = await akun.ubahAkunSendiri(token(), "sandiLama1", "", "sandiBaru12", "sandiBaru12");
  assert.doesNotMatch(String(p.pesan), /Username akun Verifikator/, "ganti sandi saja tidak terkena larangan");
});

test("AKUN: role VERIFIKATOR terdaftar sebagai role resmi Manajemen Pengguna dan tanpa kecamatan", () => {
  const a = baca("supabase/functions/api/domains/akun.ts");
  assert.match(a, /"MUI",\s*\n\s*"VERIFIKATOR"/);
  assert.doesNotMatch(a, /ROLE_WAJIB_KECAMATAN = new Set\([^)]*VERIFIKATOR/);
  assert.doesNotMatch(a, /ROLE_DENGAN_KECAMATAN = new Set\([^)]*VERIFIKATOR/);
  const k = baca("public/js/app-kelola-user.js");
  assert.match(k, /nilai: 'VERIFIKATOR'/);
});

test("MIGRASI: riwayat_verifikasi aman (tabel baru, RLS aktif, hak anon/authenticated dicabut, tanpa mengubah data lama)", () => {
  const m = baca("supabase/migrations/20261112100000_riwayat_verifikasi.sql");
  assert.match(m, /create table if not exists public\.riwayat_verifikasi/);
  assert.match(m, /enable row level security/);
  assert.match(m, /revoke all on table public\.riwayat_verifikasi from anon, authenticated/);
  const tanpaKomentar = m.split("\n").filter((g) => !g.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(tanpaKomentar, /\b(update\s+public|delete\s+from|drop\s+table|truncate|alter\s+table\s+public\.(penerima|akun))\b/i, "tidak menyentuh data lama");
});

test("BADGE: ringkasan verifikasi saya hanya milik akun yang login, hanya UTAMA/VERIFIKATOR, hanya membaca", async () => {
  pakai("VERIF");
  let kueri = null;
  const dasar = db().handler;
  db().handler = (q, v) => {
    if (q.includes("count(*)") && q.includes("from riwayat_verifikasi")) { kueri = { q, v }; return [{ total: 7, hari_ini: 2, ms: 4, btl: 2, tms: 1 }]; }
    return dasar(q, v);
  };
  const h = await verifikasi.getRingkasanVerifikasiSaya(token());
  assert.deepEqual(h, { sukses: true, total: 7, hariIni: 2, memenuhiSyarat: 4, berkasTidakLengkap: 2, tidakMemenuhiSyarat: 1 });
  assert.ok(kueri.v.includes("VERIF_ANDI"), "disaring menurut username akun yang login (huruf besar)");
  assert.ok(kueri.v.includes(2027), "tahun aktif");
  assert.ok(kueri.q.includes("oleh = ") && kueri.q.includes("sumber = 'SATU'"), "disaring menurut pemverifikator dan hanya pemberian hasil (SATU)");
  assert.ok(kueri.q.includes("distinct on (penerima_id)"), "satu data dihitung 1 kali");
  assert.ok(kueri.q.includes("'Proses Verifikasi'"), "hanya pemberian hasil PERTAMA (status sebelumnya Proses Verifikasi)");
  assert.ok(!kueri.q.includes("diverifikasi_oleh"), "bukan lagi dari kolom pemverifikator terakhir (sumber sama dengan agregat)");
  assert.equal(db().panggilan.filter((p) => /^\s*(insert|update|delete)/i.test(p.teks)).length, 0, "tidak menulis");
  // Akun lain tidak boleh.
  for (const peran of ["KEC", "GMM"]) {
    pakai(peran);
    const t = await verifikasi.getRingkasanVerifikasiSaya(token());
    assert.equal(t.sukses, false, peran);
  }
  pakai("UTAMA");
  assert.equal((await verifikasi.getRingkasanVerifikasiSaya(token())).sukses, true);
});

test("BADGE: aksi terdaftar di ALLOWED dan daftar-putih Verifikator", () => {
  assert.equal(AKSI_VERIFIKATOR.has("getRingkasanVerifikasiSaya"), true);
  assert.match(baca("supabase/functions/api/index.ts"), /^\s*getRingkasanVerifikasiSaya,$/m);
});

test("BATAS SERAGAM: Berkas Tidak Lengkap memakai batas dari server (tanggal kiriman browser diabaikan); status lain tanpa batas", async () => {
  const seragam = baca("supabase/functions/api/_shared/config.ts").match(/BATAS_PERBAIKAN_SERAGAM = "(\d{4}-\d{2}-\d{2})"/)[1];
  const klien = baca("public/js/app-transaksi.js").match(/const BATAS_PERBAIKAN_SERAGAM = "(\d{4}-\d{2}-\d{2})"/)[1];
  assert.equal(klien, seragam, "konstanta layar harus sama dengan server");
  pakai("VERIF");
  const a = await verifikasi.verifikasiSatuData(token(), 1, "Berkas Tidak Lengkap", "alasan", "2099-01-01", "Proses Verifikasi");
  assert.equal(a.sukses, true);
  assert.equal(a.batasWaktu, seragam, "bukan 2099-01-01");
  const u = tulisan("update penerima set").pop();
  assert.ok(u.nilai ? u.nilai.includes(seragam) : JSON.stringify(u).includes(seragam), "yang DISIMPAN juga batas seragam");
  assert.ok(!JSON.stringify(u).includes("2099-01-01"));
  const b = await verifikasi.verifikasiSatuData(token(), 1, "Tidak Memenuhi Syarat", "alasan", "2099-01-01", "Proses Verifikasi");
  assert.equal(b.batasWaktu, "", "status lain tanpa batas");
});

test("LOGIN PERTAMA: simpanProfilUser (profil awal) menolak tanpa sandi baru / sandi lemah, tanpa menulis; sandi baru valid tersimpan sebagai hash", async () => {
  pakai("VERIF");
  for (const [pb, pola] of [["", /Password baru wajib/], ["abc12", /minimal 6/], ["abcdefgh", /huruf dan angka/]]) {
    db().panggilan.length = 0;
    const h = await akun.simpanProfilUser(token(), "Uga Deba", "081234567890", "Verifikator Tim IV", pb);
    assert.equal(h.sukses, false);
    assert.match(h.pesan, pola);
    assert.equal(db().panggilan.filter((p) => /update akun/i.test(p.teks)).length, 0, "tidak menulis: " + JSON.stringify(pb));
  }
  db().panggilan.length = 0;
  const ok = await akun.simpanProfilUser(token(), "Uga Deba", "081234567890", "Verifikator Tim IV", "Sandi2027baru");
  const tulis = db().panggilan.filter((p) => /update akun set password_hash/i.test(p.teks));
  assert.ok(ok.sukses === true || tulis.length > 0, JSON.stringify(ok));
  assert.ok(!JSON.stringify(db().panggilan).includes("Sandi2027baru"), "sandi tidak tersimpan sebagai teks biasa");
});

test("TAMBAH AKUN: Admin Utama dapat membuat akun VERIFIKATOR (tanpa kecamatan, profil kosong, aktif, sandi ter-hash); non-UTAMA tidak bisa", async () => {
  pakai("UTAMA");
  const h = await akun.tambahUserBaru(token(), { username: "verif_budi_santoso", password: "admin123", role: "VERIFIKATOR", kecamatan: "MEDAN KOTA", namaLengkap: "", nomorHp: "", jabatan: "" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  const ins = db().panggilan.find((p) => /insert into akun/i.test(p.teks));
  assert.ok(ins, "akun ditulis");
  const nilai = JSON.stringify(ins.nilai || ins.values || ins);
  assert.ok(nilai.includes("VERIFIKATOR") && nilai.includes("verif_budi_santoso"));
  assert.ok(!nilai.includes("admin123"), "sandi tidak tersimpan sebagai teks biasa");
  assert.ok(!nilai.includes("MEDAN KOTA"), "kecamatan yang terkirim diabaikan untuk role ini");
  for (const peran of ["VERIF", "KEC", "GMM"]) {
    pakai(peran);
    const t = await akun.tambahUserBaru(token(), { username: "verif_lain", password: "admin123", role: "VERIFIKATOR" });
    assert.equal(t.sukses, false, peran);
    assert.equal(db().panggilan.filter((p) => /insert into akun/i.test(p.teks)).length, 0, "tidak menulis: " + peran);
  }
});

test("EDIT AKUN: Admin Utama dapat menyunting profil akun VERIFIKATOR tanpa mengubah role/kecamatan/user_id (dan tanpa mencabut sesi)", async () => {
  pakai("UTAMA");
  const dasar = db().handler;
  db().handler = (q, v) => (q.includes("select id, role, kecamatan, user_id from akun") ? [{ id: "a9", role: "VERIFIKATOR", kecamatan: "", user_id: "" }] : dasar(q, v));
  const h = await akun.ubahDataUserOlehAdmin(token(), "verif_andi", { role: "VERIFIKATOR", kecamatan: "MEDAN KOTA", namaLengkap: "Andi Saputra", nomorHp: "081234567890", jabatan: "Verifikator Tim I" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.doesNotMatch(h.pesan, /login ulang/, "penugasan tidak berubah -> sesi tidak dicabut");
  const up = db().panggilan.find((p) => /update akun set\s+role/i.test(p.teks));
  assert.ok(up, "akun diperbarui");
  assert.ok(!JSON.stringify(up).includes("MEDAN KOTA"), "kecamatan yang terkirim diabaikan untuk role ini");
  assert.equal(db().panggilan.filter((p) => /delete from sesi_login/i.test(p.teks)).length, 0);
});

test("KESESUAIAN: daftar role resmi di server (akun.ts), dropdown app-admin.js dan layar Kelola User (app-kelola-user.js) SAMA (kelalaian satu daftar tidak boleh terulang)", () => {
  const nilai = (src, awal, akhir) => {
    const i = src.indexOf(awal); const j = src.indexOf(akhir, i);
    assert.ok(i >= 0 && j > i, "blok tidak ditemukan: " + awal);
    return [...src.slice(i, j).matchAll(/(?:nilai:\s*|^\s*)["']([A-Z][A-Z ]+)["']/gm)].map((m) => m[1]).sort();
  };
  const server = nilai(baca("supabase/functions/api/domains/akun.ts"), "const ROLE_PENGGUNA_VALID", "]);");
  const admin = nilai(baca("public/js/app-admin.js"), "const PILIHAN_ROLE_PENGGUNA", "];");
  const kelola = nilai(baca("public/js/app-kelola-user.js"), "var PILIHAN_ROLE = [", "];");
  assert.ok(server.includes("VERIFIKATOR") && server.length >= 10, JSON.stringify(server));
  assert.deepEqual(admin, server, "app-admin.js vs server");
  assert.deepEqual(kelola, server, "app-kelola-user.js vs server");
});
