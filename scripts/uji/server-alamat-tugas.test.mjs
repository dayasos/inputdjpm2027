// Uji PERILAKU server untuk aturan Alamat Tugas (plans/plan-alamat-tugas-tautan-gmm.md): input baru, edit Detail, Kelola Data.
// Menjalankan kode server APA ADANYA (dibundel; tanpa Deno) dengan database tiruan; data KARANGAN.
// Jalankan: npm run uji:alamat-tugas   (Node 24+; tanpa koneksi database/jaringan).
import test from "node:test";
import assert from "node:assert/strict";
import { db, muatServer } from "./_harness-server.mjs";
import { PESAN_ALAMAT_KOSONG, PESAN_ALAMAT_PANJANG, PESAN_ALAMAT_TAUTAN, PESAN_ALAMAT_TERKUNCI, PESAN_TEMPAT_TERKUNCI } from "../../supabase/functions/api/_shared/alamatTugas.ts";

const penerima = await muatServer("supabase/functions/api/domains/penerima.ts");
const kelola = await muatServer("supabase/functions/api/domains/kelolaData.ts");

const URL_PETA = "HTTPS://MAPS.APP.GOO.GL/ABC123";
const SESI = {
  UTAMA: { akun_id: "a1", username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN" },
  GMM: { akun_id: "a2", username: "gmm_timur", role: "GURU MAGHRIB MENGAJI", kecamatan: "MEDAN TIMUR", user_id: "GURU MAGHRIB MENGAJI MEDAN TIMUR" },
};
const BARIS = (lebih = {}) => ({
  id: 1, tahun: 2027, nomor_urut: 1, nama: "ANI", nik: "1271010101900001", jenis_kelamin: "PEREMPUAN", tempat_lahir: "MEDAN",
  tanggal_lahir: new Date("1989-02-04T00:00:00Z"), alamat: "JL X", layanan: "GURU MAGHRIB MENGAJI", tempat_tugas: "RUMAH",
  alamat_tugas: URL_PETA, kecamatan: "MEDAN TIMUR", kelurahan: "GLUGUR DARAT I", nama_rekening: "A", nomor_rekening: "12345678901234",
  kantor_cabang: "B", no_kontak: "0812345678", status_bpjs_tk: "TIDAK", umur: 37, status_verifikasi: "Berkas Tidak Lengkap",
  link_koordinat_lokasi: "https://maps.google.com/?q=3.59,98.67", diperbarui_at: new Date("2026-10-26T00:00:00Z"), dibuat_oleh_akun_id: null,
  id_folder_berkas: "x", tanggal_berkas_diubah: null, ...lebih,
});
let sesiAktif = SESI.UTAMA;
let baris = BARIS();
function pasang() {
  db().panggilan.length = 0;
  db().handler = (q, v) => {
    if (q.includes("from sesi_login")) return [sesiAktif];
    if (q.includes("select * from penerima where id") || q.includes("from penerima where id")) return [baris];
    if (q.includes("from wilayah")) return [{ ada: 1 }];
    if (q.includes("from kuota")) return [{ kuota_maks: 100 }];
    if (q.includes("count(*)::int as n")) return [{ n: 0 }];
    return [];
  };
}
const token = (() => { let n = 0; return () => "token-at-" + (++n); })();
const edit = async (teks, peran = "UTAMA", berkas = {}) => {
  sesiAktif = SESI[peran]; pasang();
  return await penerima.editDataPenerima(token(), 1, { teks, berkas, idFolderBerkas: "" });
};
const tulis = (tabel) => db().panggilan.filter((p) => p.teks.startsWith("UNSAFE update " + tabel + " set"));
const kolomDari = (teks) => [...teks.matchAll(/(\w+) = \$\d+/g)].map((m) => m[1]);
const riwayat = () => db().panggilan.filter((p) => p.teks.includes("insert into riwayat_edit"));
const PERAN = ["UTAMA", "GMM"];   // GMM = akun petugas layanan Guru Maghrib Mengaji (per kecamatan)

// ────────────────────────────────────── Detail > Edit ──────────────────────────────────────
for (const peran of PERAN) {
  test(`[${peran}] EDIT: alamat tersimpan berupa tautan -> boleh diperbaiki; tersimpan ke penerima + data_detail + riwayat edit`, async () => {
    baris = BARIS();
    const h = await edit({ 9: "jl. marelan raya no 5" }, peran);
    assert.equal(h.sukses, true, JSON.stringify(h));
    const p = tulis("penerima"), d = tulis("data_detail");
    assert.equal(p.length, 1);
    assert.ok(p[0].nilai.includes("JL. MARELAN RAYA NO 5"), "disimpan HURUF BESAR");
    assert.equal(d.length, 1, "data_detail ikut disinkronkan");
    assert.ok(kolomDari(d[0].teks).includes("alamat_tugas"));
    assert.equal(riwayat().length, 1, "riwayat edit tercatat");
    assert.ok(riwayat()[0].nilai.includes("Alamat Tugas") && riwayat()[0].nilai.includes(URL_PETA) && riwayat()[0].nilai.includes("JL. MARELAN RAYA NO 5"));
  });

  test(`[${peran}] EDIT: perbaikan alamat pada data "Berkas Tidak Lengkap" -> ${peran === "UTAMA" ? "UTAMA tidak menandai" : "non-UTAMA menandai tanggal_berkas_diubah"} dan berkasDiubah=${peran === "UTAMA" ? 1 : 1}`, async () => {
    baris = BARIS();
    const h = await edit({ 9: "JL. MARELAN RAYA NO 5" }, peran);
    assert.equal(h.sukses, true, JSON.stringify(h));
    const kolom = kolomDari(tulis("penerima")[0].teks);
    assert.equal(kolom.includes("tanggal_berkas_diubah"), peran !== "UTAMA", "pemicu wajib-lapor hanya untuk non-UTAMA");
    assert.equal(h.berkasDiubah, 1, "klien memasang gerbang laporan lewat berkasDiubah > 0");
  });

  test(`[${peran}] EDIT: perbaikan alamat pada data BUKAN "Berkas Tidak Lengkap" tidak menandai wajib-lapor`, async () => {
    baris = BARIS({ status_verifikasi: "Memenuhi Syarat" });
    const h = await edit({ 9: "JL. MARELAN RAYA NO 5" }, peran);
    assert.equal(h.sukses, true, JSON.stringify(h));
    assert.ok(!kolomDari(tulis("penerima")[0].teks).includes("tanggal_berkas_diubah"));
  });

  test(`[${peran}] EDIT: alamat BARU berupa tautan ditolak (apa pun alamat lamanya), tanpa menulis`, async () => {
    for (const lama of [URL_PETA, "JL LAMA NO 1"]) {
      baris = BARIS({ alamat_tugas: lama });
      for (const baru of ["https://goo.gl/maps/xyz", "HTTPS:", "www.alamat.com", "JL A\nHTTPS://GOO.GL/X"]) {
        const h = await edit({ 9: baru }, peran);
        assert.equal(h.sukses, false, `lama=${lama} baru=${baru}`);
        assert.equal(h.pesan, PESAN_ALAMAT_TAUTAN);
        assert.equal(tulis("penerima").length, 0);
      }
    }
  });

  // Tempat tugas MASJID (bukan RUMAH): tetap terkunci untuk semua peran. Kasus RUMAH + akun GMM dibuka SEMENTARA (uji terpisah di bawah).
  test(`[${peran}] EDIT: alamat tersimpan SAH (tempat tugas bukan RUMAH) -> terkunci (ubah Alamat Tugas saja ditolak), tanpa menulis`, async () => {
    baris = BARIS({ alamat_tugas: "JL. MARELAN RAYA NO 5", tempat_tugas: "MASJID X" });
    for (const baru of ["JL LAIN NO 9", "JL. MARELAN RAYA NO 6", ""]) {
      const h = await edit({ 9: baru }, peran);
      assert.equal(h.sukses, false, baru);
      assert.equal(h.pesan, PESAN_ALAMAT_TERKUNCI);
      assert.equal(tulis("penerima").length, 0);
    }
  });

  test(`[${peran}] EDIT: siklus lengkap -- tautan diperbaiki sekali, lalu kolom TERKUNCI kembali (tersimpan = alamat sah; tempat tugas bukan RUMAH)`, async () => {
    baris = BARIS({ tempat_tugas: "MASJID X" });
    let h = await edit({ 9: "JL. MARELAN RAYA NO 5" }, peran);
    assert.equal(h.sukses, true, JSON.stringify(h));
    baris = BARIS({ alamat_tugas: "JL. MARELAN RAYA NO 5", tanggal_berkas_diubah: new Date(), tempat_tugas: "MASJID X" });   // keadaan sesudah tersimpan
    h = await edit({ 9: "JL. SALAH KETIK NO 5" }, peran);
    assert.equal(h.sukses, false);
    assert.equal(h.pesan, PESAN_ALAMAT_TERKUNCI);
  });

  test(`[${peran}] EDIT: alamat pengganti kosong / terlalu pendek / tanpa huruf ditolak (kolom terbuka tidak boleh dikosongkan)`, async () => {
    baris = BARIS();
    for (const baru of ["", "   ", "JL A", "12345"]) {
      const h = await edit({ 9: baru }, peran);
      assert.equal(h.sukses, false, JSON.stringify(baru));
      assert.equal(h.pesan, PESAN_ALAMAT_KOSONG);
      assert.equal(tulis("penerima").length, 0);
    }
  });

  test(`[${peran}] EDIT: data beralamat-tautan tetap bisa diedit KOLOM LAIN (nama, koordinat) tanpa menyentuh alamat`, async () => {
    baris = BARIS();
    let h = await edit({ 1: "ANI BARU" }, peran);
    assert.equal(h.sukses, true, JSON.stringify(h));
    assert.ok(!kolomDari(tulis("penerima")[0].teks).includes("alamat_tugas"));
    h = await edit({ 31: "3.5952,98.6722" }, peran);
    assert.equal(h.sukses, true, JSON.stringify(h));
    assert.ok(!kolomDari(tulis("penerima")[0].teks).includes("alamat_tugas"));
  });

  test(`[${peran}] EDIT: mengirim Alamat Tugas yang SAMA (tanpa perubahan, termasuk beda huruf besar/kecil) tidak kena kunci`, async () => {
    for (const lama of ["JL. MARELAN RAYA NO 5", URL_PETA]) {
      baris = BARIS({ alamat_tugas: lama });
      const h = await edit({ 9: lama.toLowerCase(), 1: "ANI BARU" }, peran);
      assert.equal(h.sukses, true, lama + " " + JSON.stringify(h));
      assert.ok(!kolomDari(tulis("penerima")[0].teks).includes("alamat_tugas"), "alamat tidak ditulis ulang");
    }
  });
}

for (const peran of PERAN) {
  test(`[${peran}] EDIT: Tempat Tugas TERKUNCI di server -- diubah (sendiri atau bersama alamat) ditolak, tanpa menulis`, async () => {
    for (const lama of ["RUMAH", "MASJID X"]) {
      for (const alamatLama of [URL_PETA, "JL LAMA NO 1"]) {
        baris = BARIS({ tempat_tugas: lama, alamat_tugas: alamatLama });
        for (const teks of [{ 8: "TEMPAT LAIN" }, { 8: "tempat lain", 9: "JL BARU NO 2" }, { 8: "" }]) {
          const h = await edit(teks, peran);
          assert.equal(h.sukses, false, JSON.stringify([lama, alamatLama, teks]));
          assert.equal(h.pesan, PESAN_TEMPAT_TERKUNCI);
          assert.equal(tulis("penerima").length, 0);
        }
      }
    }
  });

  test(`[${peran}] EDIT: Tempat Tugas yang SAMA (beda huruf besar/kecil) dikirim ulang bersama kolom lain -> tidak kena kunci`, async () => {
    baris = BARIS({ tempat_tugas: "RUMAH" });
    const h = await edit({ 8: "rumah", 1: "ANI BARU" }, peran);
    assert.equal(h.sukses, true, JSON.stringify(h));
    assert.ok(!kolomDari(tulis("penerima")[0].teks).includes("tempat_tugas"));
  });
}

// ───────── SEMENTARA sampai masa input selesai: akun GMM boleh mengubah Alamat Tugas data GMM bertempat tugas RUMAH ─────────
// (plans/plan-alamat-gmm-rumah-sementara.md). Peran lain dan tempat tugas lain tetap terkunci seperti semula.
test("RUMAH GMM: akun GMM boleh mengubah Alamat Tugas yang tersimpan SAH; tersimpan ke penerima + data_detail + riwayat; status tidak berubah", async () => {
  for (const status of ["Memenuhi Syarat", "Proses Verifikasi", "Berkas Tidak Lengkap"]) {
    baris = BARIS({ alamat_tugas: "JL. MARELAN RAYA NO 5", status_verifikasi: status });
    const h = await edit({ 9: "jl. marelan raya no 6 lingkungan 3" }, "GMM");
    assert.equal(h.sukses, true, status + " " + JSON.stringify(h));
    const p = tulis("penerima"), d = tulis("data_detail");
    assert.equal(p.length, 1);
    assert.ok(p[0].nilai.includes("JL. MARELAN RAYA NO 6 LINGKUNGAN 3"), "disimpan HURUF BESAR");
    assert.equal(d.length, 1, "data_detail ikut disinkronkan");
    assert.ok(!kolomDari(p[0].teks).includes("status_verifikasi"), "status TIDAK diubah (naik maupun turun) -- " + status);
    assert.ok(!kolomDari(p[0].teks).includes("tanggal_berkas_diubah"), "perubahan alamat rumah biasa TIDAK memicu wajib-lapor perbaikan");
    assert.equal(h.berkasDiubah, 0);
    assert.equal(riwayat().length, 1);
    assert.ok(riwayat()[0].nilai.includes("Alamat Tugas") && riwayat()[0].nilai.includes("JL. MARELAN RAYA NO 5"));
  }
});

test("RUMAH GMM: alamat baru tetap diperiksa (tautan, kosong, pendek, tanpa huruf, > 100) dan tidak boleh dikosongkan", async () => {
  baris = BARIS({ alamat_tugas: "JL. MARELAN RAYA NO 5" });
  for (const [baru, pesan] of [["https://goo.gl/maps/x", PESAN_ALAMAT_TAUTAN], ["www.rumah.com", PESAN_ALAMAT_TAUTAN], ["", PESAN_ALAMAT_KOSONG], ["JL A", PESAN_ALAMAT_KOSONG], ["12345", PESAN_ALAMAT_KOSONG], ["A".repeat(101), PESAN_ALAMAT_PANJANG]]) {
    const h = await edit({ 9: baru }, "GMM");
    assert.equal(h.sukses, false, JSON.stringify(baru));
    assert.equal(h.pesan, pesan, JSON.stringify(baru));
    assert.equal(tulis("penerima").length, 0);
  }
});

test("RUMAH GMM: Tempat Tugas tetap terkunci walau alamat dibuka (diubah bersama alamat ditolak)", async () => {
  baris = BARIS({ alamat_tugas: "JL. MARELAN RAYA NO 5" });
  const h = await edit({ 8: "MASJID BARU", 9: "JL. BARU NO 7" }, "GMM");
  assert.equal(h.sukses, false);
  assert.equal(h.pesan, PESAN_TEMPAT_TERKUNCI);
  assert.equal(tulis("penerima").length, 0);
});

test("RUMAH GMM: TIDAK berlaku untuk Admin Utama (tetap terkunci di Detail > Edit, seperti semula)", async () => {
  baris = BARIS({ alamat_tugas: "JL. MARELAN RAYA NO 5" });
  const h = await edit({ 9: "JL. LAIN NO 9" }, "UTAMA");
  assert.equal(h.sukses, false);
  assert.equal(h.pesan, PESAN_ALAMAT_TERKUNCI);
  assert.equal(tulis("penerima").length, 0);
});

test("RUMAH GMM: tempat tugas BUKAN rumah (masjid, lainnya) tetap terkunci untuk akun GMM", async () => {
  for (const tempat of ["MASJID AL IKHLAS", "LAINNYA", "RUMAHKU", "RUMAH IBADAH X"]) {
    baris = BARIS({ alamat_tugas: "JL. MARELAN RAYA NO 5", tempat_tugas: tempat });
    const h = await edit({ 9: "JL. LAIN NO 9" }, "GMM");
    assert.equal(h.sukses, false, tempat);
    assert.equal(h.pesan, PESAN_ALAMAT_TERKUNCI, tempat);
    assert.equal(tulis("penerima").length, 0, tempat);
  }
});

test("RUMAH GMM: tempat tugas 'rumah' beda huruf/spasi tetap dianggap RUMAH (data lama)", async () => {
  baris = BARIS({ alamat_tugas: "JL. MARELAN RAYA NO 5", tempat_tugas: "  rumah " });
  const h = await edit({ 9: "JL. LAIN NO 9" }, "GMM");
  assert.equal(h.sukses, true, JSON.stringify(h));
});

test("RUMAH GMM: PERIODE INPUT DITUTUP -> edit akun GMM ditolak lebih dulu (pelonggaran berakhir sendiri), tanpa menulis", async () => {
  baris = BARIS({ alamat_tugas: "JL. MARELAN RAYA NO 5" });
  globalThis.__izinInputUji = () => ({ izin: false, respons: { sukses: false, pesan: "PERIODE DITUTUP (uji)" } });
  try {
    const h = await edit({ 9: "JL. LAIN NO 9" }, "GMM");
    assert.equal(h.sukses, false);
    assert.equal(h.pesan, "PERIODE DITUTUP (uji)");
    assert.equal(tulis("penerima").length, 0);
  } finally {
    delete globalThis.__izinInputUji;
  }
  const h2 = await edit({ 9: "JL. LAIN NO 9" }, "GMM");   // dibuka lagi: berlaku lagi
  assert.equal(h2.sukses, true, JSON.stringify(h2));
});

test("RUMAH GMM: perbaikan TAUTAN pada data rumah GMM tetap memicu wajib-lapor untuk non-UTAMA (perilaku lama utuh)", async () => {
  baris = BARIS({ alamat_tugas: URL_PETA, status_verifikasi: "Berkas Tidak Lengkap" });
  const h = await edit({ 9: "JL. MARELAN RAYA NO 5" }, "GMM");
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.ok(kolomDari(tulis("penerima")[0].teks).includes("tanggal_berkas_diubah"));
  assert.equal(h.berkasDiubah, 1);
});

test("RUMAH GMM: izin ini tidak membuka Kelola Data maupun jalur lain (kabel: hanya satu pemakaian di penerima.ts)", async () => {
  const fs = await import("node:fs");
  const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
  for (const p of ["supabase/functions/api/domains/kelolaData.ts", "supabase/functions/api/domains/validasi.ts", "supabase/functions/api/index.ts"]) {
    assert.doesNotMatch(baca(p), /alamatRumahGmmTerbuka/, p);
  }
  const pen = baca("supabase/functions/api/domains/penerima.ts");
  assert.equal((pen.match(/alamatRumahGmmTerbuka\(/g) || []).length, 1, "satu panggilan");
  assert.ok(pen.indexOf('periksaIzinInput(sesi, "edit"') < pen.indexOf("alamatRumahGmmTerbuka("), "gerbang periode input diperiksa SEBELUM pelonggaran");
});

test("EDIT (izin internal bolehPindahTempat, hanya untuk uji pagar perpindahan): pindah tempat bersama alamat diproses pagar lama; tautan tetap ditolak", async () => {
  const inti = async (teks) => { sesiAktif = SESI.UTAMA; pasang(); return await penerima.editDataPenerimaInti(token(), 1, { teks }, { bolehPindahTempat: true }); };
  baris = BARIS({ layanan: "BILAL JENAZAH", tempat_tugas: "MUSHOLLA LAMA", alamat_tugas: "JL LAMA" });
  let h = await inti({ 8: "MUSHOLLA BARU", 9: "JL BARU" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  baris = BARIS({ layanan: "BILAL JENAZAH", tempat_tugas: "MUSHOLLA LAMA", alamat_tugas: "JL LAMA" });
  h = await inti({ 8: "MUSHOLLA BARU", 9: URL_PETA });
  assert.equal(h.sukses, false);
  assert.equal(h.pesan, PESAN_ALAMAT_TAUTAN);
  assert.equal(tulis("penerima").length, 0);
});

test("KABEL: izin bolehPindahTempat TIDAK dipakai kode produksi (hanya uji); Tempat Tugas tetap lewat Kelola Data untuk Admin Utama", async () => {
  const fs = await import("node:fs");
  const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
  for (const p of ["supabase/functions/api/domains/kelolaData.ts", "supabase/functions/api/index.ts"]) {
    assert.doesNotMatch(baca(p), /bolehPindahTempat/, p);
  }
  assert.match(baca("supabase/functions/api/domains/kelolaData.ts"), /tempat_tugas: \{ label: "Tempat Tugas"/, "Kelola Data tetap bisa mengubah Tempat Tugas");
});

test("EDIT: argumen ke-4 dari klien diabaikan (opsi internal tidak dapat dipalsukan) -- Tempat Tugas dan alamat sah tetap terkunci", async () => {
  baris = BARIS({ alamat_tugas: "JL. MARELAN RAYA NO 5" });
  sesiAktif = SESI.UTAMA; pasang();
  let h = await penerima.editDataPenerima(token(), 1, { teks: { 9: "JL LAIN NO 9" } }, { bolehPindahTempat: true });
  assert.equal(h.sukses, false);
  assert.equal(h.pesan, PESAN_ALAMAT_TERKUNCI);
  pasang();
  h = await penerima.editDataPenerima(token(), 1, { teks: { 8: "TEMPAT LAIN" } }, { bolehPindahTempat: true });
  assert.equal(h.sukses, false);
  assert.equal(h.pesan, PESAN_TEMPAT_TERKUNCI);
  assert.equal(tulis("penerima").length, 0);
});

// ────────────────────────────────────── Input baru ──────────────────────────────────────
const FORM = (lebih = {}) => ({
  inputNama: "Budi", inputNik: "1271010101900002", selectGender: "LAKI-LAKI", inputTempatLahir: "Medan", inputTglLahir: "04-02-1989",
  inputAlamat: "Jl X", selectLayanan: "GURU MAGHRIB MENGAJI", inputTempatTugas: "RUMAH", inputAlamatTugas: "Jl. Marelan Raya No 5",
  controlKecamatan: "MEDAN TIMUR", controlKelurahan: "GLUGUR DARAT I", inputNamaRekening: "Budi", inputNoRekening: "12345678901234",
  inputKantorCabang: "B", inputNoKontak: "0812345678", selectBpjs: "TIDAK", koordinatLink: "3.5952,98.6722", ...lebih,
});
const insertPenerima = () => db().panggilan.filter((p) => p.teks.includes("insert into penerima"));

test("INPUT BARU: Alamat Tugas berupa tautan ditolak SEBELUM menyentuh database tulis (tanpa INSERT)", async () => {
  sesiAktif = SESI.UTAMA;
  for (const t of [URL_PETA, "https://goo.gl/maps/abc", "www.alamat.com", "HTTPS:"]) {
    pasang();
    const h = await penerima.simpanDataKeSheet(token(), FORM({ inputAlamatTugas: t }));
    assert.equal(h.sukses, false, t);
    assert.equal(h.pesan, PESAN_ALAMAT_TAUTAN);
    assert.equal(insertPenerima().length, 0);
  }
});

test("INPUT BARU (kontrol): alamat sah TIDAK ditolak oleh aturan tautan (lanjut ke pemeriksaan berikutnya)", async () => {
  sesiAktif = SESI.UTAMA; pasang();
  const h = await penerima.simpanDataKeSheet(token(), FORM());
  assert.notEqual(h.pesan, PESAN_ALAMAT_TAUTAN, JSON.stringify(h));
});

// ────────────────────────────────────── Kelola Data (Admin Utama) ──────────────────────────────────────
const ubah = async (perubahan) => { sesiAktif = SESI.UTAMA; pasang(); return await kelola.adminUbahData(token(), 1, 2027, perubahan); };

test("KELOLA DATA: mengubah Alamat Tugas menjadi tautan ditolak, tanpa menulis; alamat sah diterima", async () => {
  baris = BARIS({ alamat_tugas: "JL LAMA NO 1" });
  let h = await ubah({ alamat_tugas: URL_PETA });
  assert.equal(h.sukses, false);
  assert.equal(h.pesan, PESAN_ALAMAT_TAUTAN);
  assert.equal(tulis("penerima").length, 0);
  h = await ubah({ alamat_tugas: "jl baru no 2" });
  assert.equal(h.sukses, true, JSON.stringify(h));
});

test("KELOLA DATA: data beralamat-tautan yang kolom LAIN-nya diubah tidak terhalang (hanya nilai yang berubah diperiksa)", async () => {
  baris = BARIS();
  const h = await ubah({ nama: "ANI BARU" });
  assert.equal(h.sukses, true, JSON.stringify(h));
});

// ────────────────────────────────────── Pengaman biaya pemeriksaan (teks sangat panjang) ──────────────────────────────────────
test("EDIT / INPUT BARU: Alamat Tugas > 1.000 karakter ditolak cepat (pesan panjang), tanpa menulis; pengganti > 100 karakter ditolak", async () => {
  baris = BARIS();
  let h = await edit({ 9: "A.".repeat(30000) });
  assert.equal(h.sukses, false);
  assert.equal(h.pesan, PESAN_ALAMAT_PANJANG);
  h = await edit({ 9: "JL. MAWAR ".repeat(11) });                    // 110 karakter, di bawah 1.000 tetapi di atas batas pengganti
  assert.equal(h.sukses, false);
  assert.equal(h.pesan, PESAN_ALAMAT_PANJANG);
  assert.equal(tulis("penerima").length, 0);
  sesiAktif = SESI.UTAMA; pasang();
  h = await penerima.simpanDataKeSheet(token(), FORM({ inputAlamatTugas: "A.".repeat(30000) }));
  assert.equal(h.sukses, false);
  assert.equal(h.pesan, PESAN_ALAMAT_PANJANG);
  assert.equal(insertPenerima().length, 0);
});
