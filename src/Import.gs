/**
 * Import.gs - import data sedia ada (F-04, BSD seksyen 7, IPD Fasa 3).
 *
 * Aliran: analisis fail -> pemetaan lajur -> semak (tiada tulis) -> laksana (tulis).
 * Peraturan: rekod sedia ada TIDAK pernah diubah atau dipadam. Baris duplikat IC dilangkau dan
 * dilaporkan. Setiap panggilan mengesahkan semula semua baris di server.
 */

// Nama lajur lama yang lazim (selepas huruf kecil dan buang simbol) -> medan baharu.
const ALIAS_LAJUR = {
  nama: ['nama', 'namapenuh', 'namapegawai', 'namapesalah'],
  ic: ['ic', 'noic', 'nokp', 'nokadpengenalan', 'nopengenalan', 'nomborkp', 'nomborkadpengenalan',
    'nomborpengenalan', 'nokpbaru', 'nomykad', 'mykad'],
  gred: ['gred', 'gredjawatan'],
  skim: ['skim', 'skimperkhidmatan', 'skimjawatan'],
  tpt_bertugas: ['tptbertugas', 'tempatbertugas', 'tempatkhidmat', 'jabatan', 'pejabat', 'agensi', 'bahagian'],
  negeri: ['negeri'],
  salahlaku: ['salahlaku', 'kesalahan', 'jeniskesalahan', 'kategorikesalahan', 'jenissalahlaku'],
  butiran_kes: ['butirankes', 'butiran', 'ringkasankes', 'catatan', 'keterangan'],
  tahun: ['tahun', 'tahunkes', 'tahunkesalahan'],
  keputusan_tatatertib: ['keputusantatatertib', 'keputusan', 'hukuman', 'jenishukuman', 'hukumanyangdikenakan'],
  tarikh_kuatkuasa: ['tarikhkuatkuasa', 'tarikhkuasa', 'tarikhberkuatkuasa', 'tarikhkuatkuasahukuman', 'kuatkuasa'],
  rayuan_tatatertib: ['rayuantatatertib', 'rayuan', 'keputusanrayuan'],
  status_semasa: ['statussemasa', 'status']
};

function normHeader_(s) {
  return String(s === null || s === undefined ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function importDibenarkan_(auth) {
  if (!bolehImport_(auth)) return gagal_('DILARANG', 'Anda tidak dibenarkan menggunakan fungsi import.');
  return null;
}

function semakSaizCsv_(csv) {
  if (typeof csv !== 'string' || csv.trim() === '') return gagal_('CSV_KOSONG', 'Fail kosong atau tidak dapat dibaca.');
  if (csv.length > HAD.CSV_MAKS_AKSARA) return gagal_('CSV_BESAR', 'Fail terlalu besar (maksimum 5 juta aksara).');
  return null;
}

// ---------- CSV ----------

function kesanPemisah_(t) {
  const kira = { ',': 0, ';': 0, '\t': 0 };
  let petik = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '"') petik = !petik;
    else if (!petik) {
      if (c === '\n' || c === '\r') break;
      if (c === ',' || c === ';' || c === '\t') kira[c]++;
    }
  }
  let terbaik = ',';
  [';', '\t'].forEach(function (c) { if (kira[c] > kira[terbaik]) terbaik = c; });
  return terbaik;
}

/** Parser CSV (RFC 4180): petik, petik berganda, baris baharu dalam petik, CRLF, BOM. */
function parseCsv_(teks) {
  let t = String(teks);
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  const pemisah = kesanPemisah_(t);
  const baris = [];
  let rekod = [];
  let medan = '';
  let dalamPetik = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (dalamPetik) {
      if (c === '"') {
        if (t[i + 1] === '"') { medan += '"'; i++; } else { dalamPetik = false; }
      } else {
        medan += c;
      }
    } else if (c === '"' && medan === '') {
      dalamPetik = true;
    } else if (c === pemisah) {
      rekod.push(medan);
      medan = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      rekod.push(medan);
      medan = '';
      baris.push(rekod);
      rekod = [];
    } else {
      medan += c;
    }
  }
  if (medan !== '' || rekod.length) { rekod.push(medan); baris.push(rekod); }
  return { baris: baris, pemisah: pemisah };
}

function barisKosong_(sel) {
  return sel.every(function (c) { return String(c).trim() === ''; });
}

function indeksPengepala_(baris) {
  for (let i = 0; i < baris.length; i++) if (!barisKosong_(baris[i])) return i;
  return -1;
}

function autoPeta_(pengepala) {
  const norm = pengepala.map(normHeader_);
  const guna = new Set();
  const peta = {};
  FIELDS.forEach(function (f) {
    peta[f.key] = -1;
    const calon = [normHeader_(f.key)].concat(ALIAS_LAJUR[f.key] || []);
    for (let i = 0; i < norm.length; i++) {
      if (!guna.has(i) && norm[i] !== '' && calon.indexOf(norm[i]) !== -1) {
        peta[f.key] = i;
        guna.add(i);
        break;
      }
    }
  });
  return peta;
}

function gabungMesej_(ralat) {
  const label = {};
  FIELDS.forEach(function (f) { label[f.key] = f.label; });
  return Object.keys(ralat).map(function (k) {
    const m = ralat[k];
    return m.indexOf(label[k]) === 0 ? m : label[k] + ': ' + m;
  }).join('; ');
}

// ---------- langkah 1: analisis ----------

function importAnalisis_(csv) {
  const salah = semakSaizCsv_(csv);
  if (salah) return salah;
  const p = parseCsv_(csv);
  const h = indeksPengepala_(p.baris);
  if (h === -1) return gagal_('CSV_KOSONG', 'Fail tidak mengandungi data.');
  const pengepala = p.baris[h].map(function (c) { return String(c).trim(); });
  const data = p.baris.slice(h + 1).filter(function (b) { return !barisKosong_(b); });
  return {
    ok: true,
    pemisah: p.pemisah === '\t' ? 'tab' : p.pemisah,
    pengepala: pengepala,
    cadangan: autoPeta_(pengepala),
    jumlahBaris: data.length,
    contoh: data.slice(0, 3).map(function (b) { return b.map(function (c) { return String(c); }); })
  };
}

// ---------- langkah 2 dan 3: proses ----------

/**
 * Proses penuh tanpa menulis. Pulang { laporan, sah } atau { gagal }.
 * pemetaan: { medan: indeksLajur } (null = cadangan automatik)
 * alias:    { medan: { kunciNilaiAsal: nilaiBaharu } } untuk standardkan nilai dropdown
 * opsyen:   { benarkanKosong, padIc }
 */
function prosesImport_(csv, pemetaanMentah, aliasMentah, opsyenMentah, rekodSedia) {
  const op = {
    benarkanKosong: !!(opsyenMentah && opsyenMentah.benarkanKosong),
    padIc: !!(opsyenMentah && opsyenMentah.padIc)
  };
  const p = parseCsv_(csv);
  const hIdx = indeksPengepala_(p.baris);
  if (hIdx === -1) return { gagal: gagal_('CSV_KOSONG', 'Fail tidak mengandungi data.') };
  const pengepala = p.baris[hIdx].map(function (c) { return String(c).trim(); });

  let pemetaan;
  if (pemetaanMentah && typeof pemetaanMentah === 'object') {
    pemetaan = {};
    FIELDS.forEach(function (f) {
      const v = pemetaanMentah[f.key];
      const n = (v === undefined || v === null || v === '') ? -1 : parseInt(v, 10);
      pemetaan[f.key] = (n >= 0 && n < pengepala.length) ? n : -1;
    });
  } else {
    pemetaan = autoPeta_(pengepala);
  }
  if (pemetaan.nama < 0 || pemetaan.ic < 0) {
    return { gagal: gagal_('PETA', 'Medan Nama dan No. kad pengenalan mesti dipetakan kepada lajur dalam fail.') };
  }
  const dipakai = {};
  for (let i = 0; i < FIELDS.length; i++) {
    const k = FIELDS[i].key;
    const n = pemetaan[k];
    if (n < 0) continue;
    if (Object.prototype.hasOwnProperty.call(dipakai, n)) {
      return { gagal: gagal_('PETA', 'Lajur "' + pengepala[n] + '" dipetakan kepada lebih daripada satu medan.') };
    }
    dipakai[n] = k;
  }

  const alias = {};
  Object.keys(DROPDOWNS).forEach(function (k) {
    alias[k] = new Map();
    const a = aliasMentah && typeof aliasMentah === 'object' ? aliasMentah[k] : null;
    if (a && typeof a === 'object') {
      Object.keys(a).forEach(function (kunci) { alias[k].set(normKey_(kunci), normSpace_(a[kunci])); });
    }
  });

  const dataBaris = [];
  for (let i = hIdx + 1; i < p.baris.length; i++) {
    if (barisKosong_(p.baris[i])) continue;
    dataBaris.push({ no: i + 1, sel: p.baris[i] });
  }
  if (dataBaris.length > HAD.CSV_MAKS_BARIS) {
    return { gagal: gagal_('CSV_BESAR', 'Terlalu banyak baris (maksimum ' + HAD.CSV_MAKS_BARIS + ').') };
  }

  const ambil = function (b, k) {
    const n = pemetaan[k];
    return n >= 0 && n < b.sel.length ? String(b.sel[n]) : '';
  };

  // Senarai pilihan: asal (sebelum dilanjutkan) dan kerja (dilanjutkan dengan ejaan dalam fail).
  const asal = binaPilihan_(rekodSedia);
  const kerja = binaPilihan_(rekodSedia);

  // Kumpul nilai dropdown: sebelum alias (untuk laporan) dan selepas alias (untuk penyatuan ejaan).
  const varian = {};
  const selepasAlias = {};
  Object.keys(DROPDOWNS).forEach(function (k) {
    if (pemetaan[k] < 0) return;
    varian[k] = new Map();
    selepasAlias[k] = new Map();
    dataBaris.forEach(function (b) {
      const mentah = normSpace_(ambil(b, k));
      if (!mentah) { b['_' + k] = ''; return; }
      const kk = normKey_(mentah);
      if (!varian[k].has(kk)) varian[k].set(kk, { ejaan: new Map(), n: 0 });
      const v = varian[k].get(kk);
      v.n++;
      v.ejaan.set(mentah, (v.ejaan.get(mentah) || 0) + 1);
      const ganti = alias[k].has(kk) ? alias[k].get(kk) : mentah;
      b['_' + k] = ganti;
      if (ganti) {
        const k2 = normKey_(ganti);
        if (!selepasAlias[k].has(k2)) selepasAlias[k].set(k2, new Map());
        const e = selepasAlias[k].get(k2);
        e.set(ganti, (e.get(ganti) || 0) + 1);
      }
    });
  });
  Object.keys(kerja).forEach(function (k) {
    if (kerja[k].disahkan || !selepasAlias[k]) return;
    selepasAlias[k].forEach(function (ejaan, k2) {
      if (!kerja[k].peta.has(k2)) kerja[k].peta.set(k2, ejaanTerbanyak_(ejaan));
    });
  });

  const sedia = new Map();
  rekodSedia.forEach(function (r) {
    const ic = normIc_(r.ic);
    if (ic && !sedia.has(ic)) sedia.set(ic, r.nama);
  });
  const dilihat = new Map();

  const sah = [];
  const ralat = [];
  const duplikatFail = [];
  const duplikatSedia = [];
  let jumlahRalat = 0;
  let bilDuplikatFail = 0;
  let bilDuplikatSedia = 0;
  let terbalik = 0;
  let ic11 = 0;
  const contohTarikh = [];
  const contohDilihat = new Set();
  const had = HAD.LAPORAN_SENARAI_MAKS;

  dataBaris.forEach(function (b) {
    const input = {};
    FIELDS.forEach(function (f) { input[f.key] = ambil(b, f.key); });
    Object.keys(DROPDOWNS).forEach(function (k) {
      if (pemetaan[k] >= 0) input[k] = b['_' + k] !== undefined ? b['_' + k] : '';
    });

    let ic = normIc_(input.ic);
    if (/^\d{11}$/.test(ic)) {
      if (op.padIc) ic = '0' + ic; else ic11++;
    }
    input.ic = ic;
    input.tahun = String(input.tahun).trim().replace(/^(\d{4})\.0+$/, '$1');

    let ralatTarikh = '';
    const tarikhMentah = String(input.tarikh_kuatkuasa).trim();
    if (tarikhMentah !== '') {
      const s = semakTarikhLonggar_(tarikhMentah);
      if (s.ok) {
        input.tarikh_kuatkuasa = s.teks;
        if (s.teks !== tarikhMentah && contohTarikh.length < 5 && !contohDilihat.has(tarikhMentah)) {
          contohDilihat.add(tarikhMentah);
          contohTarikh.push({ asal: tarikhMentah, hasil: s.teks });
        }
      } else {
        ralatTarikh = s.ralat;
        if (s.terbalik) terbalik++;
        input.tarikh_kuatkuasa = '';
      }
    }

    const sahan = sahkanRekod_(input, kerja, { baru: true, longgar: op.benarkanKosong });
    const ralatMedan = sahan.ralat;
    if (ralatTarikh) ralatMedan.tarikh_kuatkuasa = ralatTarikh;

    if (Object.keys(ralatMedan).length) {
      jumlahRalat++;
      if (ralat.length < had) ralat.push({ baris: b.no, nama: input.nama, ic: input.ic, mesej: gabungMesej_(ralatMedan) });
      return;
    }
    const icSah = sahan.nilai.ic;
    if (sedia.has(icSah)) {
      bilDuplikatSedia++;
      if (duplikatSedia.length < had) duplikatSedia.push({ baris: b.no, ic: icSah, nama: sahan.nilai.nama, namaSedia: sedia.get(icSah) });
      return;
    }
    if (dilihat.has(icSah)) {
      bilDuplikatFail++;
      if (duplikatFail.length < had) {
        duplikatFail.push({ baris: b.no, ic: icSah, nama: sahan.nilai.nama, barisAsal: dilihat.get(icSah).no, namaAsal: dilihat.get(icSah).nama });
      }
      return;
    }
    dilihat.set(icSah, { no: b.no, nama: sahan.nilai.nama });
    sah.push({ no: b.no, nilai: sahan.nilai });
  });

  // Laporan nilai dropdown untuk skrin standardisasi.
  const nilaiVarian = {};
  Object.keys(varian).forEach(function (k) {
    const strict = kerja[k].disahkan;
    const senarai = [];
    varian[k].forEach(function (v, kk) {
      const paparan = ejaanTerbanyak_(v.ejaan);
      const dikenali = asal[k].peta.get(kk);
      let cadangan;
      if (alias[k].has(kk)) cadangan = alias[k].get(kk);
      else if (dikenali !== undefined) cadangan = dikenali;
      else if (strict) cadangan = '';
      else cadangan = kerja[k].peta.get(kk) || paparan;
      const padan = cadangan !== '' && (!strict || asal[k].peta.has(normKey_(cadangan)));
      senarai.push({ kunci: kk, paparan: paparan, kiraan: v.n, cadangan: cadangan, padan: padan, rasmi: dikenali !== undefined });
    });
    senarai.sort(function (a, b) { return (b.kiraan - a.kiraan) || bandingTeks_(a.kunci, b.kunci); });
    nilaiVarian[k] = senarai.slice(0, 300);
  });
  const pilihanUI = {};
  Object.keys(asal).forEach(function (k) {
    pilihanUI[k] = { disahkan: asal[k].disahkan, senarai: asal[k].senarai.slice(0, 300) };
  });

  const amaran = [];
  if (terbalik > 0) {
    amaran.push(terbalik + ' tarikh nampak seperti format MM/DD/YYYY (bulan melebihi 12). Semak format tarikh dalam fail sumber.');
  }
  if (ic11 > 0) {
    amaran.push(ic11 + ' IC mempunyai 11 digit (sifar di depan mungkin hilang). Tandakan "Tambah sifar di depan IC 11 digit" jika betul.');
  }
  FIELDS.forEach(function (f) {
    if (f.wajib && pemetaan[f.key] < 0 && f.key !== 'status_semasa') {
      amaran.push('Medan "' + f.label + '" tidak dipetakan. ' + (op.benarkanKosong
        ? 'Rekod akan diimport dengan medan ini kosong.'
        : 'Semua baris akan ditolak kecuali pilihan "Benarkan medan wajib kosong" ditanda.'));
    }
  });

  return {
    laporan: {
      pengepala: pengepala,
      pemetaan: pemetaan,
      jumlahBaris: dataBaris.length,
      sah: sah.length,
      jumlahRalat: jumlahRalat,
      bilDuplikatFail: bilDuplikatFail,
      bilDuplikatSedia: bilDuplikatSedia,
      ralat: ralat,
      duplikatFail: duplikatFail,
      duplikatSedia: duplikatSedia,
      nilaiVarian: nilaiVarian,
      pilihan: pilihanUI,
      contohTarikh: contohTarikh,
      amaran: amaran
    },
    sah: sah
  };
}

function importSemak_(csv, pemetaan, alias, opsyen) {
  const salah = semakSaizCsv_(csv);
  if (salah) return salah;
  const data = bacaSemuaRekod_();
  const h = prosesImport_(csv, pemetaan, alias, opsyen, data.rekod);
  if (h.gagal) return h.gagal;
  return { ok: true, sebelum: data.rekod.length, laporan: h.laporan };
}

// ---------- langkah 4: laksana ----------

function bersihkanNamaFail_(teks) {
  return String(teks === null || teks === undefined ? '' : teks)
    .replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100);
}

function importLaksana_(auth, csv, pemetaan, alias, opsyen, namaFail) {
  const salah = semakSaizCsv_(csv);
  if (salah) return salah;
  return withLock_(function () {
    const data = bacaSemuaRekod_();
    const sebelum = data.rekod.length;
    const h = prosesImport_(csv, pemetaan, alias, opsyen, data.rekod);
    if (h.gagal) return h.gagal;
    const laporan = h.laporan;
    if (h.sah.length === 0) {
      return gagal_('TIADA_BARIS', 'Tiada baris sah untuk diimport. Semak laporan.', { laporan: laporan });
    }

    const sekarang = new Date();
    const mula = Math.max(data.sheet.getLastRow(), 1) + 1;
    pastikanBaris_(data.sheet, mula + h.sah.length - 1);
    const lajur = lajurTerjauh_(data);
    const baris = h.sah.map(function (s) {
      return binaBaris_(data, s.nilai, null, {
        id: Utilities.getUuid(), created_at: sekarang, created_by: auth.emel, updated_at: ''
      }).slice(0, lajur);
    });
    aturFormatSel_(data, mula, h.sah.length);
    data.sheet.getRange(mula, 1, h.sah.length, lajur).setValues(baris);

    const selepas = bacaSemuaRekod_().rekod.length;
    logAudit_(auth.emel, TINDAKAN.TAMBAH, '',
      'IMPORT: ' + h.sah.length + ' rekod ditambah; ' + (laporan.bilDuplikatFail + laporan.bilDuplikatSedia) +
      ' duplikat dilangkau; ' + laporan.jumlahRalat + ' ralat; fail: ' + bersihkanNamaFail_(namaFail));
    return {
      ok: true,
      sebelum: sebelum,
      selepas: selepas,
      ditambah: h.sah.length,
      sepadan: selepas - sebelum === h.sah.length,
      laporan: laporan
    };
  });
}
