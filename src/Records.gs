/**
 * Records.gs - rekod_tatatertib: baca, validasi, carian dan simpan (F-02, F-03).
 * Semua fungsi di sini private (berakhir _). Fungsi awam ada dalam Api.gs.
 */

function kiraRekod_() {
  return Math.max(getSheet_(SHEETS.REKOD).getLastRow() - 1, 0);
}

function infoRekod_() {
  const sheet = getSheet_(SHEETS.REKOD);
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) throw new Error('BELUM_DISEDIAKAN');
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const idx = {};
  header.forEach(function (h, i) { if (!Object.prototype.hasOwnProperty.call(idx, h)) idx[h] = i; });
  HEADERS.rekod_tatatertib.forEach(function (k) {
    if (!Object.prototype.hasOwnProperty.call(idx, k)) throw new Error('BELUM_DISEDIAKAN');
  });
  return { sheet: sheet, header: header, idx: idx, lastCol: lastCol };
}

/** Tukar nilai sel kepada teks untuk dipaparkan dan dibandingkan. */
function nilaiKeTeks_(kunci, v) {
  if (v === null || v === undefined) return '';
  if (kunci === 'tarikh_kuatkuasa') return isDate_(v) ? formatTarikh_(v) : String(v).trim();
  if (kunci === 'created_at' || kunci === 'updated_at') return isDate_(v) ? formatMasa_(v) : String(v).trim();
  if (kunci === 'ic') return typeof v === 'number' ? pad_(v, 12) : String(v).trim();
  if (kunci === 'butiran_kes') return String(v).replace(/\r\n/g, '\n').trim();
  if (isDate_(v)) return formatTarikh_(v);
  return String(v).trim();
}

// Medan tarikh diformat secara malas (lengkapkan_) kerana Utilities.formatDate mahal dan carian/dashboard
// membaca semua baris tetapi tidak memerlukan tarikh.
const MEDAN_TARIKH = ['tarikh_kuatkuasa', 'created_at', 'updated_at'];

/** Token versi untuk kesan konflik suntingan: cap masa terakhir pada resolusi milisaat. */
function versiDariSel_(v) {
  if (v === null || v === undefined || v === '') return '';
  return isDate_(v) ? Utilities.formatDate(v, tz_(), 'yyyyMMddHHmmssSSS') : String(v).trim();
}

function barisKeRekod_(baris, idx, noBaris) {
  const r = { _baris: noBaris, _lengkap: false, _mentah: {} };
  HEADERS.rekod_tatatertib.forEach(function (k) {
    if (MEDAN_TARIKH.indexOf(k) !== -1) { r._mentah[k] = baris[idx[k]]; r[k] = ''; }
    else r[k] = nilaiKeTeks_(k, baris[idx[k]]);
  });
  return r;
}

/** Format medan tarikh dan token versi. Wajib dipanggil sebelum memaparkan, membanding atau menyimpan. */
function lengkapkan_(r) {
  if (r._lengkap) return r;
  MEDAN_TARIKH.forEach(function (k) { r[k] = nilaiKeTeks_(k, r._mentah[k]); });
  r._versi = versiDariSel_(r._mentah.updated_at) || versiDariSel_(r._mentah.created_at);
  r._lengkap = true;
  return r;
}

/** Baca semula satu baris daripada Sheet supaya respons sama dengan apa yang tersimpan. */
function bacaBaris_(info, noBaris) {
  const nilai = info.sheet.getRange(noBaris, 1, 1, info.lastCol).getValues()[0];
  return lengkapkan_(barisKeRekod_(nilai, info.idx, noBaris));
}

/**
 * Baca semua rekod. Baris yang ditaip terus dalam Sheet tanpa id diberi id baharu supaya
 * tidak terlepas daripada carian (id ditulis balik; jika gagal, id sementara digunakan).
 */
function bacaSemuaRekod_() {
  const info = infoRekod_();
  const lastRow = info.sheet.getLastRow();
  const rekod = [];
  const tanpaId = [];
  if (lastRow >= 2) {
    const nilai = info.sheet.getRange(2, 1, lastRow - 1, info.lastCol).getValues();
    for (let i = 0; i < nilai.length; i++) {
      const r = barisKeRekod_(nilai[i], info.idx, i + 2);
      if (r.id === '' && r.nama === '' && r.ic === '') continue;
      if (r.id === '') {
        r.id = Utilities.getUuid();
        tanpaId.push(r);
      }
      rekod.push(r);
    }
  }
  if (tanpaId.length) {
    try {
      tanpaId.forEach(function (r) {
        info.sheet.getRange(r._baris, info.idx.id + 1).setNumberFormat('@').setValue(r.id);
      });
    } catch (err) {
      Logger.log('Gagal tulis id baharu: ' + err.message);
    }
  }
  info.rekod = rekod;
  return info;
}

function cariDenganId_(rekod, id) {
  const cari = String(id === null || id === undefined ? '' : id);
  if (!cari) return null;
  for (let i = 0; i < rekod.length; i++) if (rekod[i].id === cari) return rekod[i];
  return null;
}

function versi_(r) { return lengkapkan_(r)._versi || ''; }

function ringkas_(r) {
  return {
    id: r.id, nama: r.nama, ic: r.ic, gred: r.gred, negeri: r.negeri, tahun: r.tahun,
    salahlaku: r.salahlaku, keputusan_tatatertib: r.keputusan_tatatertib, status_semasa: r.status_semasa
  };
}

function penuh_(r) {
  lengkapkan_(r);
  const o = {};
  HEADERS.rekod_tatatertib.forEach(function (k) { o[k] = r[k]; });
  o.versi = versi_(r);
  return o;
}

// ---------- pilihan dropdown ----------

function ejaanTerbanyak_(ejaan) {
  let terbaik = '';
  let n = -1;
  ejaan.forEach(function (kiraan, teks) {
    if (kiraan > n || (kiraan === n && bandingTeks_(teks, terbaik) < 0)) { terbaik = teks; n = kiraan; }
  });
  return terbaik;
}

/**
 * Bina senarai pilihan setiap dropdown.
 * peta: normKey -> ejaan kanonik (senarai rasmi didahulukan, kemudian ejaan paling kerap dalam data
 * untuk senarai yang belum disahkan). Dipakai untuk menyatukan ejaan yang beza huruf/ruang sahaja.
 */
function binaPilihan_(rekodList) {
  const hasil = {};
  Object.keys(DROPDOWNS).forEach(function (medan) {
    const def = DROPDOWNS[medan];
    const peta = new Map();
    const senarai = [];
    def.nilai.forEach(function (v) {
      const teks = normSpace_(v);
      const k = normKey_(teks);
      if (teks && !peta.has(k)) { peta.set(k, teks); senarai.push(teks); }
    });
    if (!def.disahkan) {
      const kumpul = new Map();
      rekodList.forEach(function (r) {
        const teks = normSpace_(r[medan]);
        if (!teks) return;
        const k = normKey_(teks);
        if (!kumpul.has(k)) kumpul.set(k, new Map());
        const e = kumpul.get(k);
        e.set(teks, (e.get(teks) || 0) + 1);
      });
      const tambahan = [];
      kumpul.forEach(function (ejaan, k) {
        if (peta.has(k)) return;
        let jumlah = 0;
        ejaan.forEach(function (n) { jumlah += n; });
        const mod = ejaanTerbanyak_(ejaan);
        peta.set(k, mod);
        tambahan.push({ teks: mod, n: jumlah });
      });
      tambahan.sort(function (a, b) { return (b.n - a.n) || bandingTeks_(normKey_(a.teks), normKey_(b.teks)); });
      tambahan.forEach(function (t) { senarai.push(t.teks); });
    }
    hasil[medan] = { disahkan: def.disahkan, senarai: senarai, peta: peta };
  });
  return hasil;
}

function borangMeta_() {
  const data = bacaSemuaRekod_();
  const pilihan = binaPilihan_(data.rekod);
  const untukPelanggan = {};
  Object.keys(pilihan).forEach(function (k) {
    untukPelanggan[k] = { disahkan: pilihan[k].disahkan, senarai: pilihan[k].senarai.slice(0, 300) };
  });
  return {
    ok: true,
    medan: FIELDS.map(function (f) {
      return { key: f.key, label: f.label, jenis: f.jenis, wajib: f.wajib, maks: f.maks || 0, lalai: f.lalai || '' };
    }),
    pilihan: untukPelanggan,
    tahunMin: HAD.TAHUN_MIN,
    tahunMaks: new Date().getFullYear() + 1
  };
}

// ---------- validasi ----------

/**
 * Sahkan dan normalkan input. opsyen: { baru, longgar }.
 * longgar (import): medan wajib selain nama dan IC boleh kosong.
 * Hasil: { ok, ralat: {medan: mesej}, nilai: {medan: teks ternormal} }
 */
function sahkanRekod_(input, pilihan, opsyen) {
  const op = opsyen || {};
  const ralat = {};
  const nilai = {};
  const tahunMaks = new Date().getFullYear() + 1;
  FIELDS.forEach(function (f) {
    const mentah = input[f.key] === undefined || input[f.key] === null ? '' : String(input[f.key]);
    const wajib = f.wajib && !(op.longgar && f.key !== 'nama' && f.key !== 'ic');
    let t;
    if (f.jenis === 'ic') t = normIc_(mentah);
    else if (f.jenis === 'textarea') t = mentah.replace(/\r\n/g, '\n').trim();
    else if (f.jenis === 'tahun' || f.jenis === 'tarikh') t = mentah.trim();
    else t = normSpace_(mentah);

    if (t === '' && f.lalai && op.baru) t = f.lalai;
    if (t === '') {
      nilai[f.key] = '';
      if (wajib) ralat[f.key] = f.label + ' wajib diisi';
      return;
    }

    if (f.jenis === 'ic') {
      if (!/^\d{12}$/.test(t)) ralat[f.key] = 'IC mesti 12 digit';
    } else if (f.jenis === 'tahun') {
      if (!/^\d{4}$/.test(t)) ralat[f.key] = 'Tahun mesti 4 digit';
      else if (+t < HAD.TAHUN_MIN || +t > tahunMaks) ralat[f.key] = 'Tahun mesti antara ' + HAD.TAHUN_MIN + ' dan ' + tahunMaks;
    } else if (f.jenis === 'tarikh') {
      const s = semakTarikh_(t);
      if (s.ok) t = s.teks; else ralat[f.key] = s.ralat;
    } else if (f.jenis === 'pilihan') {
      const p = pilihan[f.key];
      const kanon = p.peta.get(normKey_(t));
      if (kanon !== undefined) t = kanon;
      else if (p.disahkan) ralat[f.key] = '"' + t + '" tiada dalam senarai ' + f.label.toLowerCase();
      else if (t.length > HAD.PILIHAN_TEKS_MAKS) ralat[f.key] = 'Maksimum ' + HAD.PILIHAN_TEKS_MAKS + ' aksara';
    } else if (f.maks && t.length > f.maks) {
      ralat[f.key] = 'Maksimum ' + f.maks + ' aksara';
    }
    nilai[f.key] = t;
  });
  return { ok: Object.keys(ralat).length === 0, ralat: ralat, nilai: nilai };
}

// ---------- carian (F-02) ----------

function cariDalam_(rekod, q) {
  const semuaDigit = /^[\d\s-]+$/.test(q);
  const digit = normIc_(q);
  const tokens = normKey_(q).split(' ').filter(function (t) { return t !== ''; });
  const padanan = [];
  rekod.forEach(function (r) {
    const nama = normKey_(r.nama);
    const ic = normIc_(r.ic);
    let padan;
    if (semuaDigit) {
      padan = ic.indexOf(digit) !== -1;
    } else {
      padan = tokens.every(function (t) {
        if (nama.indexOf(t) !== -1) return true;
        if (/^[\d-]+$/.test(t)) {
          const d = t.replace(/-/g, '');
          return d !== '' && ic.indexOf(d) !== -1;
        }
        return false;
      });
    }
    if (!padan) return;
    let skor = 2;
    if (semuaDigit && ic === digit) skor = 0;
    else if (!semuaDigit && nama.indexOf(tokens[0]) === 0) skor = 1;
    padanan.push({ r: r, skor: skor, nama: nama });
  });
  padanan.sort(function (a, b) { return (a.skor - b.skor) || bandingTeks_(a.nama, b.nama); });
  return padanan.map(function (x) { return x.r; });
}

function cariRekodProses_(auth, keyword) {
  const q = normSpace_(keyword);
  if (q.length < HAD.CARIAN_MIN) {
    return gagal_('VALIDASI', 'Taip sekurang-kurangnya ' + HAD.CARIAN_MIN + ' aksara');
  }
  if (q.length > HAD.CARIAN_MAKS_AKSARA) {
    return gagal_('VALIDASI', 'Kata carian terlalu panjang');
  }
  if (/^[\d\s-]+$/.test(q) && normIc_(q).length < HAD.CARIAN_MIN) {
    return gagal_('VALIDASI', 'Taip sekurang-kurangnya ' + HAD.CARIAN_MIN + ' digit');
  }
  const data = bacaSemuaRekod_();
  const padan = cariDalam_(data.rekod, q);
  logAudit_(auth.emel, TINDAKAN.CARIAN, '', q + ' (' + padan.length + ' hasil)');
  return {
    ok: true,
    kosong: data.rekod.length === 0,
    jumlah: padan.length,
    terhad: padan.length > HAD.CARIAN_MAKS_HASIL,
    hasil: padan.slice(0, HAD.CARIAN_MAKS_HASIL).map(ringkas_)
  };
}

function lihatRekodProses_(auth, id) {
  const data = bacaSemuaRekod_();
  const r = cariDenganId_(data.rekod, id);
  if (!r) return gagal_('TIADA_REKOD', 'Rekod tidak dijumpai');
  logAudit_(auth.emel, TINDAKAN.LIHAT, r.id, '');
  return { ok: true, rekod: penuh_(r) };
}

// ---------- simpan (F-03) ----------

/** Pastikan IC kekal teks, teks kekal teks (bukan formula) dan tarikh/nombor betul sebelum tulis. */
function aturFormatSel_(info, baris, bil) {
  const sheet = info.sheet;
  sheet.getRange(baris, 1, bil, info.lastCol).setNumberFormat('@');
  sheet.getRange(baris, info.idx.tarikh_kuatkuasa + 1, bil, 1).setNumberFormat('dd/mm/yyyy');
  sheet.getRange(baris, info.idx.created_at + 1, bil, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
  sheet.getRange(baris, info.idx.updated_at + 1, bil, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
  sheet.getRange(baris, info.idx.tahun + 1, bil, 1).setNumberFormat('0');
}

function nilaiUntukSel_(kunci, t) {
  if (t === '' || t === undefined || t === null) return '';
  if (kunci === 'tahun') return Number(t);
  if (kunci === 'tarikh_kuatkuasa') return siriTarikh_(t);
  return t;
}

/** Tulis medan rekod + meta ke dalam tatasusunan baris. dasar = baris sedia ada (kemas kini) atau null. */
function binaBaris_(info, nilai, dasar, meta) {
  const baris = [];
  for (let i = 0; i < info.lastCol; i++) baris.push(dasar ? dasar[i] : '');
  FIELDS.forEach(function (f) { baris[info.idx[f.key]] = nilaiUntukSel_(f.key, nilai[f.key]); });
  Object.keys(meta).forEach(function (k) { baris[info.idx[k]] = meta[k]; });
  return baris;
}

function lajurTerjauh_(info) {
  let maks = 0;
  HEADERS.rekod_tatatertib.forEach(function (k) { if (info.idx[k] + 1 > maks) maks = info.idx[k] + 1; });
  return maks;
}

function medanBerubah_(sedia, nilai) {
  return FIELDS.filter(function (f) {
    const a = f.key === 'ic' ? normIc_(sedia.ic) : String(sedia[f.key]);
    return a !== String(nilai[f.key]);
  }).map(function (f) { return f.key; });
}

function simpanRekodProses_(auth, payload) {
  if (!payload || typeof payload !== 'object') return gagal_('VALIDASI', 'Data tidak sah');
  return withLock_(function () {
    const data = bacaSemuaRekod_();
    const id = payload.id ? String(payload.id) : '';
    const sedia = id ? cariDenganId_(data.rekod, id) : null;
    if (id && !sedia) return gagal_('TIADA_REKOD', 'Rekod tidak dijumpai');
    if (sedia) lengkapkan_(sedia);

    const pilihan = binaPilihan_(data.rekod);
    const sah = sahkanRekod_(payload, pilihan, { baru: !sedia });
    const ralat = sah.ralat;
    let duplikatId = '';
    if (!ralat.ic && sah.nilai.ic) {
      const diri = sedia ? sedia.id : '';
      for (let i = 0; i < data.rekod.length; i++) {
        const r = data.rekod[i];
        if (r.id !== diri && normIc_(r.ic) === sah.nilai.ic) {
          ralat.ic = 'IC ini sudah wujud dalam sistem (' + r.nama + ')';
          duplikatId = r.id;
          break;
        }
      }
    }
    if (Object.keys(ralat).length) {
      return gagal_('VALIDASI', 'Sila betulkan medan yang bertanda.', { ralat: ralat, duplikatId: duplikatId });
    }

    const sekarang = new Date();
    const lajur = lajurTerjauh_(data);

    if (sedia) {
      if (String(payload.versi || '') !== versi_(sedia)) {
        return gagal_('KONFLIK', 'Rekod ini telah diubah oleh pengguna lain. Muat semula halaman dan cuba semula.');
      }
      const ubah = medanBerubah_(sedia, sah.nilai);
      if (!ubah.length) return { ok: true, id: sedia.id, tiadaUbah: true, rekod: penuh_(sedia) };

      const dasar = data.sheet.getRange(sedia._baris, 1, 1, data.lastCol).getValues()[0];
      const baris = binaBaris_(data, sah.nilai, dasar, { updated_at: sekarang });
      aturFormatSel_(data, sedia._baris, 1);
      data.sheet.getRange(sedia._baris, 1, 1, lajur).setValues([baris.slice(0, lajur)]);
      logAudit_(auth.emel, TINDAKAN.KEMAS_KINI, sedia.id, 'Medan: ' + ubah.join(', '));

      return { ok: true, id: sedia.id, baru: false, rekod: penuh_(bacaBaris_(data, sedia._baris)) };
    }

    const idBaru = Utilities.getUuid();
    const noBaris = Math.max(data.sheet.getLastRow(), 1) + 1;
    pastikanBaris_(data.sheet, noBaris);
    const baris = binaBaris_(data, sah.nilai, null, {
      id: idBaru, created_at: sekarang, created_by: auth.emel, updated_at: ''
    });
    aturFormatSel_(data, noBaris, 1);
    data.sheet.getRange(noBaris, 1, 1, lajur).setValues([baris.slice(0, lajur)]);
    logAudit_(auth.emel, TINDAKAN.TAMBAH, idBaru, 'Rekod baharu');

    return { ok: true, id: idBaru, baru: true, rekod: penuh_(bacaBaris_(data, noBaris)) };
  });
}
