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

  test(`[${peran}] EDIT: alamat tersimpan SAH -> terkunci (ubah Alamat Tugas saja ditolak), tanpa menulis`, async () => {
    baris = BARIS({ alamat_tugas: "JL. MARELAN RAYA NO 5" });
    for (const baru of ["JL LAIN NO 9", "JL. MARELAN RAYA NO 6", ""]) {
      const h = await edit({ 9: baru }, peran);
      assert.equal(h.sukses, false, baru);
      assert.equal(h.pesan, PESAN_ALAMAT_TERKUNCI);
      assert.equal(tulis("penerima").length, 0);
    }
  });

  test(`[${peran}] EDIT: siklus lengkap -- tautan diperbaiki sekali, lalu kolom TERKUNCI kembali (tersimpan = alamat sah)`, async () => {
    baris = BARIS();
    let h = await edit({ 9: "JL. MARELAN RAYA NO 5" }, peran);
    assert.equal(h.sukses, true, JSON.stringify(h));
    baris = BARIS({ alamat_tugas: "JL. MARELAN RAYA NO 5", tanggal_berkas_diubah: new Date() });   // keadaan sesudah tersimpan
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
  for (const p of ["supabase/functions/api/domains/cekAlamatTugas.ts", "supabase/functions/api/domains/kelolaData.ts", "supabase/functions/api/index.ts"]) {
    assert.doesNotMatch(baca(p), /bolehPindahTempat/, p);
  }
  assert.match(baca("supabase/functions/api/domains/kelolaData.ts"), /tempat_tugas: \{ label: "Tempat Tugas"/, "Kelola Data tetap bisa mengubah Tempat Tugas");
});

test("EDIT: argumen ke-4 dari klien diabaikan (opsi internal tidak dapat dipalsukan) -- alamat sah di data beralamat sah tetap terkunci", async () => {
  baris = BARIS({ alamat_tugas: "JL. MARELAN RAYA NO 5" });
  sesiAktif = SESI.UTAMA; pasang();
  const h = await penerima.editDataPenerima(token(), 1, { teks: { 9: "JL LAIN NO 9" } }, { dariCekAlamat: true });
  assert.equal(h.sukses, false);
  assert.equal(h.pesan, PESAN_ALAMAT_TERKUNCI);
});

test("EDIT (jalur internal Cek Alamat): alamat sah boleh menggantikan alamat sah, tautan tetap ditolak", async () => {
  baris = BARIS({ alamat_tugas: "JL. MARELAN RAYA NO 5" });
  sesiAktif = SESI.UTAMA; pasang();
  let h = await penerima.editDataPenerimaInti(token(), 1, { teks: { 9: "JL LAIN NO 9" } }, { dariCekAlamat: true });
  assert.equal(h.sukses, true, JSON.stringify(h));
  pasang();
  h = await penerima.editDataPenerimaInti(token(), 1, { teks: { 9: URL_PETA } }, { dariCekAlamat: true });
  assert.equal(h.sukses, false);
  assert.equal(h.pesan, PESAN_ALAMAT_TAUTAN);
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
