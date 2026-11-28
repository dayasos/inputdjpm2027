// Uji aksi server verifikasi ulang (peran, pemilik tugas, pemeriksaan nyata, atomik, aturan status). Rencana: plans/plan-verifikasi-ulang.md
// Menjalankan kode server APA ADANYA (dibundel; tanpa Deno) dengan database tiruan; data KARANGAN. Jalankan: npm run uji:verifikasi-ulang
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { db, muatServer } from "./_harness-server.mjs";
import { AKSI_VERIFIKATOR, ditolakUntukVerifikator } from "../../supabase/functions/api/_shared/gerbangPeran.ts";
import { berkasDibukaSah, cekSimpanHasil, daftarBerkasDariBaris, peralihanStatusDiizinkan } from "../../supabase/functions/api/_shared/verifikasiUlangInti.ts";
import { nilaiStatusVerifikasi } from "../../supabase/functions/api/_shared/statusVerifikasi.ts";

const baca = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const ulang = await muatServer("supabase/functions/api/domains/verifikasiUlang.ts");

const SESI = {
  UTAMA: { akun_id: "u1", username: "admin", role: "UTAMA", kecamatan: "", user_id: "ADMIN" },
  VERIF: { akun_id: "a2", username: "verif_a2", role: "VERIFIKATOR", kecamatan: "", user_id: "" },
  KEC: { akun_id: "k1", username: "kec_x", role: "KECAMATAN", kecamatan: "MEDAN KOTA", user_id: "KECAMATAN MEDAN KOTA" },
};
let sesiAktif = SESI.VERIF;

// keadaan tiruan
let tugas, penerima, dibayar, selesaiBaris, updPenerimaBaris, gagalRiwayat;
function pasang(opsi = {}) {
  db().panggilan.length = 0;
  tugas = { id: 11, penerima_id: 501, tahun: 2027, status_saat_dibagi: "Memenuhi Syarat", dibuka_pada: new Date(), berkas_dibuka: ["link_ktp", "link_buku_rekening"], berkas_url: { link_ktp: "https://x/ktp", link_buku_rekening: "https://x/bk" }, selesai_pada: null, ditarik_pada: null, status_paket: "AKTIF", ...opsi.tugas };
  penerima = { id: 501, tahun: 2027, nik: "1201000000000001", nama: "FULAN", layanan: "IMAM MASJID", status_verifikasi: "Memenuhi Syarat", link_ktp: "https://x/ktp", link_buku_rekening: "https://x/bk", link_surat_permohonan: "", link_koordinat_lokasi: "https://maps/x", ...opsi.penerima };
  dibayar = !!opsi.dibayar;
  selesaiBaris = opsi.selesaiBaris ?? [{ id: 11 }];
  updPenerimaBaris = opsi.updPenerimaBaris ?? [{ id: 501 }];
  gagalRiwayat = !!opsi.gagalRiwayat;
  db().handler = (q, v) => {
    if (q.includes("from sesi_login")) return [sesiAktif];
    if (q.includes("where t.id = ? and t.akun_id")) return tugas.akun_salah ? [] : [tugas];
    if (q.includes("select * from penerima where id = ?")) return [penerima];
    if (q.includes("update tugas_verifikasi_ulang t set ditarik_pada")) return [];
    if (q.includes("from pembayaran_baris where tahun")) return dibayar ? [{ "?column?": 1 }] : [];
    if (q.includes("update tugas_verifikasi_ulang set selesai_pada = now()")) return selesaiBaris;
    if (q.includes("update penerima set")) return updPenerimaBaris;
    if (q.includes("insert into riwayat_verifikasi")) { if (gagalRiwayat) throw new Error("riwayat gagal"); return []; }
    return [];
  };
}
const pakai = (p, opsi) => { sesiAktif = SESI[p]; pasang(opsi); };
const tok = (() => { let n = 0; return () => "t-" + (++n); })();
const tulis = (potong) => db().panggilan.filter((p) => p.teks.replace(/\s+/g, " ").includes(potong));   // beda spasi/baris baru tak memengaruhi
const SESUAI_LENGKAP = { hasil: "SESUAI", centang: { link_ktp: true, link_buku_rekening: true } };

test("PERAN: aksi Admin ditolak untuk verifikator & peran lain; aksi verifikator ditolak untuk Admin Utama; tak ada tulis", async () => {
  for (const p of ["VERIF", "KEC"]) {
    pakai(p);
    for (const [nama, panggil] of [
      ["pratinjau", () => ulang.pratinjauBatchUlang(tok(), {})],
      ["buat", () => ulang.buatBatchUlang(tok(), { benih: "x", nama: "n" })],
      ["daftar", () => ulang.daftarBatchUlang(tok())],
      ["batal", () => ulang.batalkanBatchUlang(tok(), 1)],
      ["cek", () => ulang.cekPembagianBatchUlang(tok(), 1)],
      ["koreksi", () => ulang.getDaftarKoreksiUlang(tok())],
      ["batalKoreksi", () => ulang.batalkanKoreksiUlang(tok(), 1, "x")],
    ]) {
      const h = await panggil();
      assert.equal(h.sukses, false, p + " " + nama + " harus ditolak: " + JSON.stringify(h));
    }
    assert.equal(db().panggilan.filter((x) => /^(insert|update|delete)/i.test(x.teks.trim())).length, 0, "tidak ada penulisan");
  }
  for (const p of ["UTAMA", "KEC"]) {
    pakai(p);
    for (const h of [await ulang.getTugasUlangSaya(tok()), await ulang.bukaTugasUlang(tok(), 11), await ulang.catatBerkasDibuka(tok(), 11, "link_ktp"), await ulang.simpanHasilUlang(tok(), 11, SESUAI_LENGKAP)]) {
      assert.equal(h.sukses, false, p + ": " + JSON.stringify(h));
    }
    assert.equal(tulis("update tugas_verifikasi_ulang").length, 0);
  }
});

test("GERBANG: verifikator hanya boleh 4 aksi tugas sendiri; aksi Admin ulang tertolak oleh daftar-putih", () => {
  for (const a of ["getTugasUlangSaya", "bukaTugasUlang", "catatBerkasDibuka", "simpanHasilUlang"]) assert.equal(AKSI_VERIFIKATOR.has(a), true, a);
  for (const a of ["pratinjauBatchUlang", "buatBatchUlang", "daftarBatchUlang", "batalkanBatchUlang", "cekPembagianBatchUlang", "getDaftarKoreksiUlang", "batalkanKoreksiUlang"]) {
    assert.equal(ditolakUntukVerifikator("VERIFIKATOR", a), true, a);
    assert.equal(AKSI_VERIFIKATOR.has(a), false, a);
  }
  const idx = baca("supabase/functions/api/index.ts");
  for (const a of ["pratinjauBatchUlang", "buatBatchUlang", "getTugasUlangSaya", "simpanHasilUlang", "catatBerkasDibuka", "bukaTugasUlang", "daftarBatchUlang", "batalkanBatchUlang", "cekPembagianBatchUlang", "getDaftarKoreksiUlang", "batalkanKoreksiUlang"]) {
    assert.ok(new RegExp("^  " + a + ",$", "m").test(idx), a + " harus ada di ALLOWED index.ts");
  }
});

test("PEMILIK: tugas milik orang lain tidak bisa dibuka/dicatat/disimpan", async () => {
  pakai("VERIF", { tugas: { akun_salah: true } });
  for (const h of [await ulang.bukaTugasUlang(tok(), 11), await ulang.catatBerkasDibuka(tok(), 11, "link_ktp"), await ulang.simpanHasilUlang(tok(), 11, SESUAI_LENGKAP)]) {
    assert.equal(h.sukses, false);
    assert.match(h.pesan, /tidak ditemukan/);
  }
  assert.equal(tulis("update tugas_verifikasi_ulang").length, 0);
  assert.equal(tulis("update penerima").length, 0);
  const sql = db().panggilan.find((p) => p.teks.includes("where t.id = ? and t.akun_id"));
  assert.ok(sql, "pemilik diperiksa di kueri (akun_id)");
});

test("PEMERIKSAAN NYATA: belum dibuka / berkas belum diklik / belum dicentang -> ditolak, tanpa tulis", async () => {
  pakai("VERIF", { tugas: { dibuka_pada: null } });
  let h = await ulang.simpanHasilUlang(tok(), 11, SESUAI_LENGKAP);
  assert.equal(h.sukses, false); assert.match(h.pesan, /Buka data/);

  pakai("VERIF", { tugas: { berkas_dibuka: ["link_ktp"] } });
  h = await ulang.simpanHasilUlang(tok(), 11, SESUAI_LENGKAP);
  assert.equal(h.sukses, false); assert.match(h.pesan, /Klik dan periksa.*Buku Rekening/);

  pakai("VERIF");
  h = await ulang.simpanHasilUlang(tok(), 11, { hasil: "SESUAI", centang: { link_ktp: true } });
  assert.equal(h.sukses, false); assert.match(h.pesan, /Centang.*Buku Rekening/);
  h = await ulang.simpanHasilUlang(tok(), 11, { hasil: "SESUAI" });
  assert.equal(h.sukses, false);
  h = await ulang.simpanHasilUlang(tok(), 11, { hasil: "SESUAI", centang: { link_ktp: "true", link_buku_rekening: 1 } });
  assert.equal(h.sukses, false, "hanya boolean true yang dihitung");

  assert.equal(tulis("update tugas_verifikasi_ulang").length, 0);
  assert.equal(tulis("insert into riwayat_verifikasi").length, 0);
});

test("BERKAS DIGANTI sesudah diklik (kelurahan mengunggah ulang): klik lama tidak sah; Sesuai ditolak sampai berkas baru diklik; tautan hilang juga tidak sah", async () => {
  pakai("VERIF", { penerima: { link_ktp: "https://x/ktp-BARU" } });   // tautan KTP berubah, tugas masih mencatat tautan lama
  let h = await ulang.simpanHasilUlang(tok(), 11, SESUAI_LENGKAP);
  assert.equal(h.sukses, false); assert.match(h.pesan, /Belum dibuka: KTP/);
  assert.equal(tulis("update tugas_verifikasi_ulang set selesai_pada").length, 0);
  const b = await ulang.bukaTugasUlang(tok(), 11);
  assert.deepEqual(b.berkas.map((x) => [x.kunci, x.dibuka]), [["link_ktp", false], ["link_buku_rekening", true]], "layar ikut melihat KTP belum dibuka lagi");
  pakai("VERIF", { tugas: { berkas_url: {} } });                       // tugas tanpa catatan tautan (mis. data lama) -> tidak sah
  h = await ulang.simpanHasilUlang(tok(), 11, SESUAI_LENGKAP);
  assert.equal(h.sukses, false);
  pakai("VERIF", { tugas: { berkas_url: null } });
  h = await ulang.simpanHasilUlang(tok(), 11, SESUAI_LENGKAP);
  assert.equal(h.sukses, false, "null aman");
});

test("MODUL MURNI: berkasDibukaSah hanya menghitung klik yang tautannya sama dengan sekarang", () => {
  const berkas = [{ kunci: "a", label: "A", url: "u1" }, { kunci: "b", label: "B", url: "u2" }, { kunci: "c", label: "C", url: "u3" }];
  assert.deepEqual(berkasDibukaSah(berkas, ["a", "b", "c"], { a: "u1", b: "LAMA", c: "u3" }), ["a", "c"]);
  assert.deepEqual(berkasDibukaSah(berkas, ["a"], { a: "u1", b: "u2" }), ["a"], "yang tak diklik tidak sah walau tautan tercatat");
  assert.deepEqual(berkasDibukaSah(berkas, ["a", "x"], { a: "u1", x: "u9" }), ["a"], "kunci asing diabaikan");
  assert.deepEqual(berkasDibukaSah(berkas, ["a"], null), []); assert.deepEqual(berkasDibukaSah(berkas, ["a"], {}), []);
  assert.deepEqual(berkasDibukaSah(berkas, undefined, undefined), []);
});

test("SESUAI: tugas selesai + riwayat ULANG dalam SATU transaksi; status data TIDAK diubah; koordinat bukan berkas", async () => {
  pakai("VERIF");
  const h = await ulang.simpanHasilUlang(tok(), 11, SESUAI_LENGKAP);
  assert.equal(h.sukses, true, JSON.stringify(h));
  assert.equal(h.hasil, "SESUAI");
  assert.equal(tulis("update penerima set").length, 0, "SESUAI tidak mengubah status data");
  const upd = tulis("update tugas_verifikasi_ulang set selesai_pada = now()");
  assert.equal(upd.length, 1);
  assert.match(upd[0].teks, /selesai_pada is null and ditarik_pada is null/, "hanya tulis sekali");
  const r = tulis("insert into riwayat_verifikasi");
  assert.equal(r.length, 1);
  assert.ok(r[0].nilai.includes("ULANG") && r[0].nilai.includes("SESUAI") && r[0].nilai.includes("VERIF_A2"), JSON.stringify(r[0].nilai));
  assert.ok(!upd[0].dibatalkan && !r[0].dibatalkan);
  assert.deepEqual(daftarBerkasDariBaris(penerima).map((b) => b.kunci), ["link_ktp", "link_buku_rekening"], "koordinat dan kolom kosong bukan berkas");
});

test("NAMA BERKAS: untuk Ustadz/Ustadzah kolom berkas pendukung bernama 'Rekomendasi MUI' (sama dengan Detail); layanan lain tetap 'Berkas Pendukung'; kunci tidak berubah", () => {
  const baris = (layanan) => ({ layanan, link_ktp: "https://x/ktp", link_berkas_pendukung: "https://x/bp" });
  for (const l of ["USTADZ", "USTADZAH", " ustadz ", "Ustadzah"]) {
    const b = daftarBerkasDariBaris(baris(l));
    assert.deepEqual(b.map((x) => x.kunci), ["link_ktp", "link_berkas_pendukung"], "kunci sama: " + l);
    assert.equal(b.find((x) => x.kunci === "link_berkas_pendukung").label, "Rekomendasi MUI", l);
    assert.equal(b.find((x) => x.kunci === "link_ktp").label, "KTP", "berkas lain tidak ikut berganti nama");
  }
  for (const l of ["IMAM MASJID", "GURU SEKOLAH MINGGU", "PENGURUS GEREJA", "", undefined]) {
    assert.equal(daftarBerkasDariBaris(baris(l)).find((x) => x.kunci === "link_berkas_pendukung").label, "Berkas Pendukung", String(l));
  }
  // pesan penolakan menyebut nama yang sama dengan yang tampil
  const berkas = daftarBerkasDariBaris(baris("USTADZ"));
  const r = cekSimpanHasil({ hasil: "SESUAI", statusSebelum: "Memenuhi Syarat", berkas, berkasDibuka: ["link_ktp"], centang: {}, sudahDibuka: true });
  assert.equal(r.ok, false);
  assert.match(r.pesan, /Belum dibuka: Rekomendasi MUI\./);
});

test("DIKOREKSI MS -> BTL: status data ikut berubah (batas seragam), riwayat ULANG; MS->TMS tanpa batas", async () => {
  pakai("VERIF");
  let h = await ulang.simpanHasilUlang(tok(), 11, { hasil: "DIKOREKSI", statusSesudah: "Berkas Tidak Lengkap", alasan: "KTP buram", centang: { link_ktp: false, link_buku_rekening: true } });
  assert.equal(h.sukses, true, JSON.stringify(h));
  const u = tulis("update penerima set");
  assert.equal(u.length, 1);
  assert.match(u[0].teks, /status_verifikasi = \?/);
  assert.match(u[0].teks, /and status_verifikasi = \?/, "pemeriksaan konflik terhadap status yang dilihat pemeriksa");
  assert.ok(u[0].nilai.includes("Berkas Tidak Lengkap") && u[0].nilai.includes("KTP buram"));
  assert.ok(u[0].nilai.includes("2026-12-11"), "BTL memakai batas perbaikan seragam");
  assert.ok(u[0].nilai.includes("VERIF_A2"));
  const r = tulis("insert into riwayat_verifikasi")[0];
  assert.ok(r.nilai.includes("DIKOREKSI: KTP buram") && r.nilai.includes("ULANG") && r.nilai.includes("Memenuhi Syarat") && r.nilai.includes("Berkas Tidak Lengkap"));

  pakai("VERIF");
  h = await ulang.simpanHasilUlang(tok(), 11, { hasil: "DIKOREKSI", statusSesudah: "Tidak Memenuhi Syarat", alasan: "Bukan warga Medan" });
  assert.equal(h.sukses, true, JSON.stringify(h));
  const utms = tulis("update penerima set")[0];
  assert.ok(utms.nilai.includes("Tidak Memenuhi Syarat") && utms.nilai.includes("Bukan warga Medan") && !utms.nilai.includes("2026-12-11"), "TMS tanpa batas perbaikan");
});

test("ATURAN STATUS (K13): tidak boleh naik ke Memenuhi Syarat; status sama, tidak dikenal, alasan kosong ditolak", async () => {
  pakai("VERIF", { penerima: { status_verifikasi: "Berkas Tidak Lengkap" }, tugas: { status_saat_dibagi: "Berkas Tidak Lengkap" } });
  let h = await ulang.simpanHasilUlang(tok(), 11, { hasil: "DIKOREKSI", statusSesudah: "Memenuhi Syarat", alasan: "x" });
  assert.equal(h.sukses, false); assert.match(h.pesan, /hanya dapat dilakukan Admin Utama/);
  pakai("VERIF");
  for (const s of ["Memenuhi Syarat", "Proses Verifikasi", "", "ASAL", "memenuhi syarat"]) {
    h = await ulang.simpanHasilUlang(tok(), 11, { hasil: "DIKOREKSI", statusSesudah: s, alasan: "x" });
    assert.equal(h.sukses, false, "status " + s);
  }
  h = await ulang.simpanHasilUlang(tok(), 11, { hasil: "DIKOREKSI", statusSesudah: "Berkas Tidak Lengkap", alasan: "   " });
  assert.equal(h.sukses, false); assert.match(h.pesan, /Alasan/);
  h = await ulang.simpanHasilUlang(tok(), 11, { hasil: "LAIN" });
  assert.equal(h.sukses, false);
  assert.equal(tulis("update penerima").length, 0);
  assert.equal(peralihanStatusDiizinkan("Berkas Tidak Lengkap", "Tidak Memenuhi Syarat"), true);
  assert.equal(peralihanStatusDiizinkan("Tidak Memenuhi Syarat", "Berkas Tidak Lengkap"), true);
  assert.equal(peralihanStatusDiizinkan("Proses Verifikasi", "Berkas Tidak Lengkap"), false);
  for (const s of ["Memenuhi Syarat", "Berkas Tidak Lengkap", "Tidak Memenuhi Syarat"]) assert.equal(peralihanStatusDiizinkan(s, s), false, "status sama bukan koreksi: " + s);
  pakai("VERIF", { penerima: { status_verifikasi: "Berkas Tidak Lengkap" }, tugas: { status_saat_dibagi: "Berkas Tidak Lengkap" } });
  const sama = await ulang.simpanHasilUlang(tok(), 11, { hasil: "DIKOREKSI", statusSesudah: "Berkas Tidak Lengkap", alasan: "x" });
  assert.equal(sama.sukses, false, "DIKOREKSI ke status yang sama ditolak server");
  assert.equal(tulis("update penerima").length, 0);
});

test("K15: data yang sudah masuk batch pembayaran tidak boleh dikoreksi (SESUAI tetap boleh)", async () => {
  pakai("VERIF", { dibayar: true });
  let h = await ulang.simpanHasilUlang(tok(), 11, { hasil: "DIKOREKSI", statusSesudah: "Berkas Tidak Lengkap", alasan: "x" });
  assert.equal(h.sukses, false); assert.match(h.pesan, /batch pembayaran/);
  assert.equal(tulis("update penerima").length, 0);
  h = await ulang.simpanHasilUlang(tok(), 11, SESUAI_LENGKAP);
  assert.equal(h.sukses, true);
});

test("ATOMIK: riwayat gagal -> seluruh penulisan dibatalkan (hasil tidak tersimpan); status berubah saat diperiksa -> konflik + rollback", async () => {
  pakai("VERIF", { gagalRiwayat: true });
  let h = await ulang.simpanHasilUlang(tok(), 11, SESUAI_LENGKAP);
  assert.equal(h.sukses, false);
  assert.ok(db().panggilan.filter((p) => p.teks.includes("update tugas_verifikasi_ulang set selesai_pada")).every((p) => p.dibatalkan === true), "tugas ikut dibatalkan");

  pakai("VERIF", { updPenerimaBaris: [] });
  h = await ulang.simpanHasilUlang(tok(), 11, { hasil: "DIKOREKSI", statusSesudah: "Berkas Tidak Lengkap", alasan: "x" });
  assert.equal(h.sukses, false); assert.equal(h.konflik, true);
  assert.ok(db().panggilan.filter((p) => p.teks.includes("update tugas_verifikasi_ulang set selesai_pada")).every((p) => p.dibatalkan === true));
  assert.equal(tulis("insert into riwayat_verifikasi").length, 0, "riwayat tidak ditulis bila status gagal diubah");
});

test("TIDAK BISA DUA KALI: tugas selesai/ditarik/paket tak aktif ditolak; penulisan kedua yang kalah (0 baris) ditolak", async () => {
  for (const [ket, tg, pesan] of [
    ["selesai", { selesai_pada: new Date() }, /sudah selesai/],
    ["ditarik", { ditarik_pada: new Date() }, /ditarik/],
    ["paket batal", { status_paket: "DIBATALKAN" }, /tidak aktif/],
  ]) {
    pakai("VERIF", { tugas: tg });
    const h = await ulang.simpanHasilUlang(tok(), 11, SESUAI_LENGKAP);
    assert.equal(h.sukses, false, ket); assert.match(h.pesan, pesan, ket);
    assert.equal(tulis("update tugas_verifikasi_ulang set selesai_pada").length, 0, ket);
  }
  pakai("VERIF", { selesaiBaris: [] });  // balapan: orang/tab lain menyelesaikan lebih dulu
  const h = await ulang.simpanHasilUlang(tok(), 11, SESUAI_LENGKAP);
  assert.equal(h.sukses, false);
  assert.equal(tulis("insert into riwayat_verifikasi").length, 0);
});

test("DATA BERUBAH SEBELUM DIPERIKSA (K11): status tak sama dengan saat dibagi -> tugas ditarik, tidak bisa disimpan", async () => {
  pakai("VERIF", { penerima: { status_verifikasi: "Berkas Tidak Lengkap" } });  // Admin menurunkan status sesudah dibagi
  const h = await ulang.simpanHasilUlang(tok(), 11, SESUAI_LENGKAP);
  assert.equal(h.sukses, false); assert.match(h.pesan, /berubah/);
  assert.ok(tulis("update tugas_verifikasi_ulang t set ditarik_pada").length >= 1, "tugas ditarik otomatis");
  assert.equal(tulis("update tugas_verifikasi_ulang set selesai_pada").length, 0);
});

test("CATAT BERKAS: hanya berkas yang benar-benar ada, hanya setelah dibuka, idempoten di SQL", async () => {
  pakai("VERIF");
  let h = await ulang.catatBerkasDibuka(tok(), 11, "link_surat_permohonan");
  assert.equal(h.sukses, false, "kolom kosong bukan berkas");
  h = await ulang.catatBerkasDibuka(tok(), 11, "nama; drop table x");
  assert.equal(h.sukses, false);
  h = await ulang.catatBerkasDibuka(tok(), 11, "link_koordinat_lokasi");
  assert.equal(h.sukses, false, "link koordinat bukan berkas");
  assert.equal(tulis("update tugas_verifikasi_ulang set berkas_dibuka").length, 0);
  h = await ulang.catatBerkasDibuka(tok(), 11, "link_ktp");
  assert.equal(h.sukses, true);
  const u = tulis("update tugas_verifikasi_ulang set berkas_dibuka")[0];
  assert.match(u.teks, /case when berkas_dibuka @>/, "tidak menumpuk duplikat");
  assert.match(u.teks, /berkas_url = berkas_url \|\| jsonb_build_object/, "tautan saat diklik dicatat");
  assert.ok(u.nilai.includes("https://x/ktp"), "yang dicatat adalah tautan berkas SAAT ini: " + JSON.stringify(u.nilai));
  assert.match(u.teks, /selesai_pada is null/);
  pakai("VERIF", { tugas: { dibuka_pada: null } });
  h = await ulang.catatBerkasDibuka(tok(), 11, "link_ktp");
  assert.equal(h.sukses, false);
});

test("MODUL MURNI: cekSimpanHasil — data tanpa berkas boleh SESUAI; kunci centang asing diabaikan; berkas dibuka asing tidak membantu", () => {
  const dasar = { statusSebelum: "Memenuhi Syarat", berkas: [], berkasDibuka: [], sudahDibuka: true };
  assert.equal(cekSimpanHasil({ ...dasar, hasil: "SESUAI" }).ok, true);
  const satu = [{ kunci: "link_ktp", label: "KTP", url: "u" }];
  assert.equal(cekSimpanHasil({ ...dasar, berkas: satu, berkasDibuka: ["link_lain"], hasil: "SESUAI", centang: { link_ktp: true, link_lain: true } }).ok, false);
  const ok = cekSimpanHasil({ ...dasar, berkas: satu, berkasDibuka: ["link_ktp"], hasil: "SESUAI", centang: { link_ktp: true, lain: true } });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.daftarPeriksa, { link_ktp: true });
});

test("T4a: nilai status dipakai BERSAMA (verifikasi pertama dan ulang) dan aturannya tetap", () => {
  assert.deepEqual(nilaiStatusVerifikasi("Memenuhi Syarat", "abaikan", "2026-11-30"), { keterangan: "", putaranBaru: true, batasWaktu: "" });
  assert.deepEqual(nilaiStatusVerifikasi("Berkas Tidak Lengkap", "  KTP  ", "2026-11-30"), { keterangan: "KTP", putaranBaru: true, batasWaktu: "2026-11-30" });
  assert.deepEqual(nilaiStatusVerifikasi("Tidak Memenuhi Syarat", "alasan", "2026-11-30"), { keterangan: "alasan", putaranBaru: false, batasWaktu: "" });
  assert.match(baca("supabase/functions/api/domains/verifikasi.ts"), /nilaiStatusVerifikasi\(/);
  assert.match(baca("supabase/functions/api/domains/verifikasiUlang.ts"), /nilaiStatusVerifikasi\(/);
});

test("ADMIN: pratinjau tidak menulis apa pun; pembuatan paket = satu transaksi dengan kunci, tabel tugas hanya lewat satu INSERT massal", async () => {
  pakai("UTAMA");
  db().handler = (q) => {
    if (q.includes("from sesi_login")) return [sesiAktif];
    if (q.includes("select id, username from akun where role = 'VERIFIKATOR'")) {
      return ["verif_p01", "verif_p02", "verif_p03", "verif_ronald_fredy", "verif_uga_deba"].map((u, i) => ({ id: "id" + i, username: u }));
    }
    if (q.includes("select distinct nik from pembayaran_baris")) return [{ nik: "N5" }];   // data 5 sudah masuk batch pembayaran
    if (q.includes("from penerima p")) {
      return [
        { id: 1, nik: "N1", tahun: 2027, layanan: "IMAM MASJID", status: "Memenuhi Syarat", diverifikasi_oleh: "ADMIN", sudah_diperiksa: false, sedang: false },
        { id: 2, tahun: 2027, layanan: "IMAM MASJID", status: "Memenuhi Syarat", diverifikasi_oleh: "VERIF_P01", sudah_dibayar: false, sudah_diperiksa: false, sedang: false },
        { id: 3, nik: "N3", tahun: 2027, layanan: "PENDETA", status: "Memenuhi Syarat", diverifikasi_oleh: "ADMIN", sudah_diperiksa: true, sedang: false },
        { id: 4, nik: "N4", tahun: 2027, layanan: "PENDETA", status: "Berkas Tidak Lengkap", diverifikasi_oleh: "ADMIN", sudah_diperiksa: false, sedang: false },
        { id: 5, nik: "N5", tahun: 2027, layanan: "PENDETA", status: "Memenuhi Syarat", diverifikasi_oleh: "ADMIN", sudah_diperiksa: false, sedang: false },
        { id: 6, nik: "N6", tahun: 2027, layanan: "PENDETA", status: "Memenuhi Syarat", diverifikasi_oleh: "ADMIN", sudah_diperiksa: false, sedang: true },
      ];
    }
    if (q.includes("returning id") && q.includes("insert into batch_verifikasi_ulang")) return [{ id: 77 }];
    if (q.includes("insert into tugas_verifikasi_ulang")) return [{ id: 1 }, { id: 2 }, { id: 3 }];
    return [];
  };
  const p = await ulang.pratinjauBatchUlang(tok(), { benih: "B1", sertakanHasilVerifikator: true });   // V12 dimatikan di uji ini; diuji terpisah di server-verifikasi-ulang-pg
  assert.equal(p.sukses, true, JSON.stringify(p));
  assert.equal(p.benih, "B1");
  assert.deepEqual(p.dikeluarkan, { sudahDibayar: 1, sudahDiperiksaUlang: 1, sedangDitugaskan: 1, hasilVerifikator: 0 });
  assert.ok(!db().panggilan.some((x) => x.teks.includes("exists (select 1 from pembayaran_baris")), "pembayaran dicek lewat SATU kueri himpunan NIK, bukan subkueri per baris");
  assert.equal(p.jumlahTugas, 3, "id 1, 2 (MS) dan 4 (BTL)");
  assert.equal(p.akunKhusus, "verif_uga_deba");
  const jumlahMS = p.perAkun.filter((a) => a.username !== "VERIF_UGA_DEBA").reduce((s, a) => s + a.jumlah, 0);
  assert.equal(jumlahMS, 2, "dua data MS dibagi ke pemeriksa biasa");
  assert.ok(p.perAkun.every((a) => ["VERIF_P01", "VERIF_P02", "VERIF_P03", "VERIF_UGA_DEBA"].includes(a.username)));
  assert.ok(!p.perAkun.some((a) => a.username === "VERIF_RONALD_FREDY"), "pimpinan tidak menerima tugas");
  assert.equal(p.perAkun.find((a) => a.username === "VERIF_UGA_DEBA").jumlah, 1, "BTL ke akun khusus");
  assert.equal(db().panggilan.filter((x) => /^(insert|update|delete)/i.test(x.teks.trim())).length, 0, "pratinjau tidak menulis");

  // V1 pada data 2: diverifikasi VERIF_P01 -> tidak jatuh ke P01
  const p2 = await ulang.pratinjauBatchUlang(tok(), { benih: "B1", sertakanHasilVerifikator: true });
  assert.deepEqual(p2.perAkun, p.perAkun, "benih sama -> hasil sama");

  const b = await ulang.buatBatchUlang(tok(), { benih: "B1", nama: "Uji", sertakanHasilVerifikator: true });
  assert.equal(b.sukses, true, JSON.stringify(b));
  assert.equal(b.batchId, 77);
  const urut = db().panggilan.map((x) => x.teks);
  assert.ok(urut.some((t) => t.includes("pg_advisory_xact_lock")), "kunci pembuatan paket");
  assert.equal(db().panggilan.filter((x) => x.teks.includes("insert into tugas_verifikasi_ulang")).length, 1, "satu INSERT massal");
  assert.ok(db().panggilan.filter((x) => /^(insert|update|delete)/i.test(x.teks.trim()) || x.teks.includes("insert into")).every((x) => !x.dibatalkan));

  const tanpaBenih = await ulang.buatBatchUlang(tok(), { nama: "Uji" });
  assert.equal(tanpaBenih.sukses, false);
  const tanpaNama = await ulang.buatBatchUlang(tok(), { benih: "B1" });
  assert.equal(tanpaNama.sukses, false);
});

test("ADMIN: pembuatan paket batal bila ada data yang terlanjur ditugaskan di paket lain (jumlah masuk tidak sama)", async () => {
  pakai("UTAMA");
  db().handler = (q) => {
    if (q.includes("from sesi_login")) return [sesiAktif];
    if (q.includes("select id, username from akun where role = 'VERIFIKATOR'")) return ["verif_p01", "verif_p02"].map((u, i) => ({ id: "id" + i, username: u }));
    if (q.includes("from penerima p")) return [1, 2, 3].map((id) => ({ id, nik: "N" + id, tahun: 2027, layanan: "L", status: "Memenuhi Syarat", diverifikasi_oleh: "ADMIN", sudah_diperiksa: false, sedang: false }));
    if (q.includes("insert into batch_verifikasi_ulang")) return [{ id: 78 }];
    if (q.includes("insert into tugas_verifikasi_ulang")) return [{ id: 1 }, { id: 2 }];   // satu data terlewat
    return [];
  };
  const b = await ulang.buatBatchUlang(tok(), { benih: "B", nama: "Uji" });
  assert.equal(b.sukses, false); assert.match(b.pesan, /dibatalkan/);
  assert.ok(db().panggilan.filter((x) => x.teks.includes("insert into batch_verifikasi_ulang")).every((x) => x.dibatalkan === true), "paket ikut dibatalkan");
});

test("ADMIN: batal paket hanya menghapus tugas BELUM selesai; batal koreksi mencatat riwayat dan menolak bila status sudah berubah", async () => {
  pakai("UTAMA");
  db().handler = (q) => {
    if (q.includes("from sesi_login")) return [sesiAktif];
    if (q.includes("update batch_verifikasi_ulang set status = 'DIBATALKAN'")) return [{ id: 5 }];
    if (q.includes("delete from tugas_verifikasi_ulang")) return [{ id: 1 }, { id: 2 }];
    return [];
  };
  const h = await ulang.batalkanBatchUlang(tok(), 5);
  assert.equal(h.sukses, true); assert.equal(h.tugasDihapus, 2);
  assert.match(tulis("delete from tugas_verifikasi_ulang")[0].teks, /selesai_pada is null/);

  db().handler = (q) => {
    if (q.includes("from sesi_login")) return [sesiAktif];
    if (q.includes("from tugas_verifikasi_ulang t") && q.includes("hasil = 'DIKOREKSI'")) return [{ id: 9, penerima_id: 501, tahun: 2027, status_sebelum: "Memenuhi Syarat", status_sesudah: "Berkas Tidak Lengkap" }];
    if (q.includes("update penerima set")) return [];   // status sudah berubah lagi
    return [];
  };
  let k = await ulang.batalkanKoreksiUlang(tok(), 9, "salah koreksi");
  assert.equal(k.sukses, false);
  assert.equal(tulis("insert into pembatalan_koreksi_ulang").length, 0);
  assert.match(tulis("update penerima set")[0].teks, /and status_verifikasi = ?/, "pembatalan hanya bila status masih sama dengan hasil koreksi");
  k = await ulang.batalkanKoreksiUlang(tok(), 9, "  ");
  assert.equal(k.sukses, false); assert.match(k.pesan, /Alasan/);

  db().handler = (q) => {
    if (q.includes("from sesi_login")) return [sesiAktif];
    if (q.includes("from tugas_verifikasi_ulang t") && q.includes("hasil = 'DIKOREKSI'")) return [{ id: 9, penerima_id: 501, tahun: 2027, status_sebelum: "Memenuhi Syarat", status_sesudah: "Berkas Tidak Lengkap" }];
    if (q.includes("update penerima set")) return [{ id: 501 }];
    return [];
  };
  db().panggilan.length = 0;
  k = await ulang.batalkanKoreksiUlang(tok(), 9, "salah koreksi");
  assert.equal(k.sukses, true, JSON.stringify(k));
  assert.equal(tulis("insert into pembatalan_koreksi_ulang").length, 1);
  const r = tulis("insert into riwayat_verifikasi")[0];
  assert.ok(r.nilai.includes("BATAL_ULANG"));
});

test("PENJAGA: tidak ada parameter jsonb yang dibuat dengan JSON.stringify(...)::jsonb di kode server (terenkode GANDA oleh postgres.js; pakai sql.json / trx.json)", () => {
  const dirs = ["supabase/functions/api/domains", "supabase/functions/api/_shared"];
  const berkas = dirs.flatMap((d) => fs.readdirSync(new URL("../../" + d, import.meta.url)).filter((f) => f.endsWith(".ts")).map((f) => d + "/" + f));
  assert.ok(berkas.length > 20, "berkas yang diperiksa: " + berkas.length);
  const pola = /\$\{\s*JSON\.stringify\([\s\S]{0,800}?\)\s*\}\s*::jsonb/;
  const melanggar = berkas.filter((f) => pola.test(baca(f).split("\n").filter((b) => !b.trim().startsWith("//")).join("\n")));
  assert.deepEqual(melanggar, [], "gunakan sql.json(x) / trx.json(x): " + melanggar.join(", "));
  const v = baca("supabase/functions/api/domains/verifikasiUlang.ts");
  assert.ok((v.match(/\.json\(/g) || []).length >= 4, "kriteria, pemeriksa, pengecualian, dan daftar_periksa memakai .json()");
});

test("SKEMA: migrasi memuat pagar tugas selesai (pemicu) dan RLS tanpa kebijakan + hak anon dicabut", () => {
  const m = baca("supabase/migrations/20261114100000_verifikasi_ulang.sql");
  assert.match(m, /unique \(batch_id, penerima_id\)/);
  assert.match(m, /raise exception 'tugas verifikasi ulang yang sudah selesai tidak boleh diubah'/);
  assert.match(m, /raise exception 'tugas verifikasi ulang yang sudah selesai tidak boleh dihapus'/);
  for (const t of ["batch_verifikasi_ulang", "tugas_verifikasi_ulang", "pembatalan_koreksi_ulang"]) {
    assert.match(m, new RegExp("alter table public\\." + t + "\\s+enable row level security"));
  }
  assert.match(m, /revoke all on table public\.batch_verifikasi_ulang, public\.tugas_verifikasi_ulang, public\.pembatalan_koreksi_ulang from anon, authenticated/);
  assert.doesNotMatch(m, /create policy/i);
});
