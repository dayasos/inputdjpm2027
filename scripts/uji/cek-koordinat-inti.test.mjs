// Uji pemeriksa koordinat (modul murni) dengan bentuk tautan NYATA dari data produksi 2026-11-16. Aturan KETAT: hanya titik yang pasti yang sah.
// Jalankan: npm run uji:cek-koordinat
import test from "node:test";
import assert from "node:assert/strict";
import { nilaiTautan, periksaTautan, adalahTautanPendek, ambilTujuanPendek, ALASAN } from "../../supabase/functions/api/_shared/cekKoordinat.ts";

const G = "https://www.google.com";
const kasus = [
  // [nama, url, hasil, alasan]
  ["Windi: place// tanpa penanda (zoom 13)", G + "/maps/place//@3.550244,98.6930693,13z/data=!3m1!4b1?entry=tts&g_ep=EgoyMDI2MTEwOS4wIOC7DCoASAFQAw%3D%3D", "TIDAK_VALID", "TANPA_PENANDA"],
  ["tempat bernama dengan ID tempat", G + "/maps/place/Gg.+Mushola,+Kec.+Medan+Deli,+Kota+Medan,+Sumatera+Utara+20241/data=!4m2!3m1!1s0x3031326ca038f20d:0xf111f7ef40e8b948?utm_source=mstt_1&entry=gps", "VALID", ""],
  ["?q=alamat&ftid (tempat bernama)", "https://maps.google.com?q=Gg.+Sehati,+Binjai,+Kec.+Medan+Denai,+Kota+Medan&ftid=0x303130e5d7c5a7c1:0x44695da1c311bdd9&entry=gps", "VALID", ""],
  ["?ftid saja", "https://maps.google.com?ftid=0x30313198b7066747:0x5395ac57b7c31793&entry=gps", "VALID", ""],
  ["?q=lat,lng di Medan (bentuk buatan aplikasi)", "https://maps.google.com/?q=3.572790,98.724974&entry=gps", "VALID", ""],
  ["/maps?q=lat,lng bentuk aplikasi", G + "/maps?q=3.595200,98.672200", "VALID", ""],
  ["titik penanda !3d!4d di Medan", G + "/maps/place/Masjid+X/@3.60,98.67,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d3.6012!4d98.6712!16s", "VALID", ""],
  ["Street View (3a,90y) [ketat: tidak valid]", G + "/maps/@3.595964,98.6368103,3a,90y,7.9h,58.58t/data=!3m5!1e1!3m3!1sfSmL-MaeU!2e0!6shttps://streetviewpixels-pa.googleapis.com/v1/thumbnail?panoid=x", "TIDAK_VALID", "STREET_VIEW"],
  ["Street View (22a,75y)", G + "/maps/@3.6136035,98.649662,22a,75y,295.83h,62.57t/data=!3m7!1e1!3m5!1sKAJ", "TIDAK_VALID", "STREET_VIEW"],
  ["pin 0,0 pada Street View diabaikan", G + "/maps/@3.5328668,98.721055,34a,75y,285.15h,83.34t/data=!3m7!1e1!8m2!3d0!4d0", "TIDAK_VALID", "STREET_VIEW"],
  ["tampilan peta sangat dekat (87 m) [ketat]", G + "/maps/@3.5454692,98.6047767,87m/data=!3m1!1e3?entry=ttu", "TIDAK_VALID", "TANPA_PENANDA"],
  ["tampilan peta zoom 20.21z", G + "/maps/@3.4949506,98.6016452,20.21z?entry=ttu", "TIDAK_VALID", "TANPA_PENANDA"],
  ["pencarian teks dengan pusat tampilan", G + "/maps/search/Masjid%20Syarifaturrahman/@3.608426570892334,98.6701431274414,17z?hl=en", "TIDAK_VALID", "PENCARIAN"],
  ["pencarian lewat maps.google.com/maps/search", "https://maps.google.com/maps/search/Masjid%20Nurussalam/@3.551276,98.638359,17z?hl=id", "TIDAK_VALID", "PENCARIAN"],
  ["nama tempat tanpa ID tempat (teks terpotong)", G + "/maps/place/Sekolah+Mutiara+Al+Qur", "TIDAK_VALID", "PENCARIAN"],
  ["koordinat DMS terpotong pada tanda petik", G + "/maps/place/3%C2%B031", "TIDAK_VALID", "TERPOTONG"],
  ["petunjuk arah dengan teks", "https://www.google.co.id/maps/dir/3.5913728,98.566144/Masjid+Taqwa+Istiqlal,+Jl.+Pendidikan/@3.5884,98.57,15z", "TIDAK_VALID", "ARAH"],
  ["rute daddr teks", "https://maps.google.com/?geocode=FWNCNwAd&daddr=Al-Huda,+Jl.+Tangkul+I,+Medan+Tembung&saddr=3.62,98.7", "TIDAK_VALID", "ARAH"],
  ["tujuan rute berupa koordinat (daddr) di Medan", "https://maps.google.com/?dirflg=d&daddr=3.6903300,98.6373980&geocode=FVpPOAAd", "VALID", ""],
  ["di luar Medan: Tangerang", G + "/maps/place/Masjid+Al+Hikmah/@-6.2489458,106.6101721,575m/data=!3m1!1e3!4m6!3m5!1s0x2e69fc6bbc20dc27:0xf95903c3b6d65870!8m2!3d-6.2482529!4d106.6097191", "TIDAK_VALID", "LUAR_MEDAN"],
  ["di luar Medan: koordinat telanjang jauh", G + "/maps/place/11.149390,101.786823/data=!4m6!3m5!1s0!7e2!8m2!3d11.1493904!4d101.7868233", "TIDAK_VALID", "LUAR_MEDAN"],
  ["place// dengan ID tempat tanpa nama", G + "/maps/place//data=!4m2!3m1!1s0x30313a73024b4a5b:0xfb9ed792a9744d2c?entry=s&sa=X", "VALID", ""],
  ["bukan Google", "https://example.com/maps/place/x", "TIDAK_VALID", "BUKAN_GOOGLE"],
  ["host mirip Google ditolak", "https://www.google.com.evil.com/maps/place/x/@3.5,98.6,17z", "TIDAK_VALID", "BUKAN_GOOGLE"],
  ["http (bukan https) ditolak", "http://www.google.com/maps?q=3.5,98.6", "TIDAK_VALID", "BUKAN_GOOGLE"],
  ["kosong", "", "TIDAK_VALID", "TANPA_TITIK"],
  ["bukan URL", "3.5952, 98.6722", "TIDAK_VALID", "TANPA_TITIK"],
  ["Google non-peta (jalur lain)", G + "/search?q=masjid", "TIDAK_VALID", "BUKAN_GOOGLE"],
  // --- bentuk sah yang diterima normalizer input dan TIDAK boleh keliru ditolak (tinjauan mendalam 2026-11-17)
  ["place/<lat,lng> desimal tanpa data", G + "/maps/place/3.5952,98.6722", "VALID", ""],
  ["place/<DMS utuh>", G + "/maps/place/3%C2%B035'42.7%22N+98%C2%B040'19.9%22E", "VALID", ""],
  ["place/<lat,lng> di luar Medan", G + "/maps/place/-6.2,106.8", "TIDAK_VALID", "LUAR_MEDAN"],
  ["place/<lat,lng> tetapi Street View tetap tidak sah", G + "/maps/place/3.714626,98.659867/@3.7145638,98.6598358,3a,75y,43.27h,77.26t/data=!3m5!1e1!3m3!1s5gUYZwi4q_YizHAdlYAZ8Q", "TIDAK_VALID", "STREET_VIEW"],
  ["tempat ber-ID dengan nama diawali Plus Code tetap sah (mode Street View)", G + "/maps/place/JJ84%2BP3V+PuFood+Kitchen,+Jl.+Klambir/@3.6,98.67,3a,75y,43.27h,77.26t/data=!3m5!1e1!4m6!3m5!1s0x3031:0xabc", "VALID", ""],
  ["?q=loc:lat,lng (bentuk lama)", "https://maps.google.com/maps?q=loc:3.5952,98.6722", "VALID", ""],
  ["api=1&query=lat,lng (tautan resmi Google)", G + "/maps/search/?api=1&query=3.5952,98.6722", "VALID", ""],
];
for (const [nama, url, hasil, alasan] of kasus) {
  test("NILAI: " + nama, () => {
    const p = nilaiTautan(url);
    assert.equal(p.hasil, hasil, JSON.stringify(p));
    assert.equal(p.alasan, alasan, JSON.stringify(p));
    if (alasan) assert.ok(ALASAN[alasan], "ada teks untuk kode " + alasan);
  });
}

test("NILAI: tautan pendek yang belum dibuka TIDAK pernah dinilai salah (BELUM_DICEK)", () => {
  assert.equal(nilaiTautan("https://maps.app.goo.gl/QRFNTT3Euye4vW4F7").hasil, "BELUM_DICEK");
  assert.equal(nilaiTautan("https://goo.gl/maps/DhrmHmxn2ZygwHty6").hasil, "BELUM_DICEK");
});

test("TAUTAN PENDEK: pengenalan bentuk baru dan lama; yang bukan tautan pendek ditolak", () => {
  for (const u of ["https://maps.app.goo.gl/QRFNTT3Euye4vW4F7", "https://maps.app.goo.gl/abc?g_st=ic", "https://goo.gl/maps/DhrmHmxn2ZygwHty6?g_st=aw"]) assert.equal(adalahTautanPendek(u), true, u);
  for (const u of ["https://maps.app.goo.gl/", "https://goo.gl/", "https://goo.gl/abc", "http://maps.app.goo.gl/x", "https://evil.com/maps.app.goo.gl/x", "https://maps.app.goo.gl.evil.com/x", "", null, 5]) assert.equal(adalahTautanPendek(u), false, String(u));
});

const jawab = (status, location) => ({ status, headers: { get: (n) => (n.toLowerCase() === "location" ? location || null : null) } });
const ambilDari = (urutan) => { const sisa = urutan.slice(); const dipanggil = []; const f = async (url) => { dipanggil.push(url); const x = sisa.shift(); if (x instanceof Error) throw x; return x; }; f.dipanggil = dipanggil; return f; };

test("PERIKSA: tautan pendek -> dibuka, tujuan dinilai (kasus Windi = TIDAK_VALID TANPA_PENANDA)", async () => {
  const f = ambilDari([jawab(302, G + "/maps/place//@3.550244,98.6930693,13z/data=!3m1!4b1?entry=tts")]);
  const r = await periksaTautan("https://maps.app.goo.gl/QRFNTT3Euye4vW4F7", f);
  assert.equal(r.hasil, "TIDAK_VALID"); assert.equal(r.alasan, "TANPA_PENANDA"); assert.match(r.tujuan, /place\/\/@3\.550244/);
  assert.equal(f.dipanggil.length, 1);
});
test("PERIKSA: tautan pendek ke titik di Medan -> VALID dengan koordinat", async () => {
  const f = ambilDari([jawab(302, "https://maps.google.com/?q=3.572790,98.724974&entry=gps")]);
  const r = await periksaTautan("https://goo.gl/maps/DhrmHmxn2ZygwHty6", f);
  assert.deepEqual([r.hasil, r.lat, r.lng], ["VALID", 3.57279, 98.724974]);
});
test("PERIKSA: HTTP 404 -> TIDAK_VALID MATI; 429/5xx/jaringan/halaman persetujuan -> BELUM_DICEK (tidak pernah dianggap salah)", async () => {
  assert.deepEqual((await periksaTautan("https://maps.app.goo.gl/aaaa", ambilDari([jawab(404)]))).alasan, "MATI");
  for (const x of [jawab(429), jawab(503), new Error("ECONNRESET"), jawab(302, "https://consent.google.com/ml?continue=x"), jawab(200), jawab(302)]) {
    const r = await periksaTautan("https://maps.app.goo.gl/aaaa", ambilDari([x]));
    assert.equal(r.hasil, "BELUM_DICEK", x instanceof Error ? x.message : JSON.stringify(x.status));
  }
});
test("PERIKSA: mengikuti pengalihan antar tautan pendek (maks 4); lebih dari itu -> BELUM_DICEK", async () => {
  const f = ambilDari([jawab(302, "https://maps.app.goo.gl/dua"), jawab(302, "https://goo.gl/maps/tiga"), jawab(302, "https://maps.google.com/?q=3.6,98.67")]);
  assert.equal((await periksaTautan("https://maps.app.goo.gl/satu", f)).hasil, "VALID");
  const lingkar = ambilDari(Array.from({ length: 6 }, () => jawab(302, "https://maps.app.goo.gl/lagi")));
  assert.equal((await periksaTautan("https://maps.app.goo.gl/satu", lingkar)).hasil, "BELUM_DICEK");
});
test("PERIKSA: tautan panjang dinilai tanpa jaringan (fungsi ambil tidak dipanggil)", async () => {
  const f = ambilDari([]);
  const r = await periksaTautan(G + "/maps?q=3.6,98.67", f);
  assert.equal(r.hasil, "VALID"); assert.equal(f.dipanggil.length, 0);
  assert.equal((await periksaTautan(null, f)).hasil, "TIDAK_VALID");
});
test("PERIKSA: hanya header pengalihan diminta (redirect manual), dengan pengenal peramban umum", async () => {
  let init;
  const f = async (_u, i) => { init = i; return jawab(302, "https://maps.google.com/?q=3.6,98.67"); };
  await ambilTujuanPendek("https://maps.app.goo.gl/abc", f);
  assert.equal(init.redirect, "manual"); assert.match(init.headers["user-agent"], /Mozilla/);
});
