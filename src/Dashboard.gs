/**
 * Dashboard.gs - agregat untuk S-06 (F-05). Pelanggan hanya terima angka, bukan rekod.
 * Setiap carta menjumlahkan kepada bilangan rekod yang ditapis (nilai kosong dikira sebagai "(Tiada data)").
 */

const DASHBOARD_CARTA = [
  { kunci: 'negeri', tajuk: 'Ikut negeri' },
  { kunci: 'gred', tajuk: 'Ikut gred' },
  { kunci: 'keputusan_tatatertib', tajuk: 'Ikut jenis hukuman' },
  { kunci: 'salahlaku', tajuk: 'Ikut jenis kesalahan' }
];

/** Kumpul ikut nilai. Ejaan yang beza huruf/ruang sahaja disatukan. */
function kumpulNilai_(rekod, medan, peta) {
  const kumpul = new Map();
  rekod.forEach(function (r) {
    const teks = normSpace_(r[medan]);
    const k = normKey_(teks);
    if (!kumpul.has(k)) kumpul.set(k, { ejaan: new Map(), n: 0 });
    const e = kumpul.get(k);
    e.n++;
    if (teks) e.ejaan.set(teks, (e.ejaan.get(teks) || 0) + 1);
  });
  const senarai = [];
  kumpul.forEach(function (e, k) {
    let label = '(Tiada data)';
    if (k !== '') label = peta.has(k) ? peta.get(k) : ejaanTerbanyak_(e.ejaan);
    senarai.push({ label: label, kiraan: e.n });
  });
  senarai.sort(function (a, b) { return (b.kiraan - a.kiraan) || bandingTeks_(normKey_(a.label), normKey_(b.label)); });
  return senarai;
}

function dashboardData_(tahunTapis) {
  const tahun = String(tahunTapis === undefined || tahunTapis === null ? '' : tahunTapis).trim();
  if (tahun !== '' && !/^\d{4}$/.test(tahun)) return gagal_('VALIDASI', 'Tahun tidak sah');

  const data = bacaSemuaRekod_();
  const semua = data.rekod;
  const pilihan = binaPilihan_(semua);

  const tahunAda = new Set();
  semua.forEach(function (r) { if (/^\d{4}$/.test(r.tahun)) tahunAda.add(r.tahun); });
  const senaraiTahun = Array.from(tahunAda).sort().reverse();

  const tapis = tahun === '' ? semua : semua.filter(function (r) { return r.tahun === tahun; });
  return {
    ok: true,
    tahun: tahun,
    jumlah: tapis.length,
    jumlahSemua: semua.length,
    senaraiTahun: senaraiTahun,
    carta: DASHBOARD_CARTA.map(function (c) {
      const peta = pilihan[c.kunci] ? pilihan[c.kunci].peta : new Map();
      return { kunci: c.kunci, tajuk: c.tajuk, data: kumpulNilai_(tapis, c.kunci, peta) };
    })
  };
}
