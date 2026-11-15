/**
 * Auth.gs - checkAdmin(), audit log, akses Sheet dan config (TRD seksyen 5, BSD seksyen 4).
 * Semakan role hanya di server. Kegagalan sentiasa menolak akses (fail closed).
 */

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP_SPREADSHEET_ID);
  if (!id) throw new Error('BELUM_DISEDIAKAN');
  return SpreadsheetApp.openById(id);
}

function getSheet_(nama) {
  const sheet = getSpreadsheet_().getSheetByName(nama);
  if (!sheet) throw new Error('BELUM_DISEDIAKAN');
  return sheet;
}

/** Emel pengguna yang sedang melawat. JANGAN guna getEffectiveUser (itu pemilik skrip). */
function getVisitorEmail_() {
  try {
    return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  } catch (err) {
    return '';
  }
}

function isTrue_(v) {
  return v === true || String(v).trim().toUpperCase() === 'TRUE';
}

/** Hasil: { ok, emel, nama, sebab }. sebab: TIADA_EMEL | TIADA_DALAM_WHITELIST | TIDAK_AKTIF */
function checkAdmin() {
  const emel = getVisitorEmail_();
  if (!emel) {
    logDitolak_('(tidak dikesan)', 'Emel tidak dapat dikesan');
    return { ok: false, emel: '', nama: '', sebab: 'TIADA_EMEL' };
  }

  const sheet = getSheet_(SHEETS.WHITELIST);
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const iEmel = header.indexOf('emel');
    const iNama = header.indexOf('nama');
    const iAktif = header.indexOf('aktif');
    const data = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][iEmel]).trim().toLowerCase() === emel) {
        if (!isTrue_(data[i][iAktif])) {
          logDitolak_(emel, 'Admin tidak aktif');
          return { ok: false, emel: emel, nama: '', sebab: 'TIDAK_AKTIF' };
        }
        return { ok: true, emel: emel, nama: String(data[i][iNama]), sebab: '' };
      }
    }
  }
  logDitolak_(emel, 'Emel tiada dalam whitelist');
  return { ok: false, emel: emel, nama: '', sebab: 'TIADA_DALAM_WHITELIST' };
}

/** Panggil di permulaan setiap fungsi server yang boleh dipanggil dari browser. */
function requireAdmin_() {
  const auth = checkAdmin();
  if (!auth.ok) throw new Error(RESPONSE_ERROR.TIADA_KEBENARAN);
  return auth;
}

/**
 * Fungsi setup dijalankan dari editor oleh pemilik. Ia public (perlu muncul dalam dropdown Run),
 * jadi pelawat web app tidak boleh memanggilnya melalui google.script.run.
 */
function pastikanPemilik_() {
  const aktif = getVisitorEmail_();
  const pemilik = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!aktif || !pemilik || aktif !== pemilik) throw new Error(RESPONSE_ERROR.TIADA_KEBENARAN);
}

/**
 * Bungkus semua fungsi yang dipanggil dari browser. Semak admin dahulu, kemudian jalankan fn(auth).
 * Hasil sentiasa objek { ok: true, ... } atau { ok: false, kod, mesej, ... }. Ralat dalaman tidak didedahkan.
 */
function apiRun_(fn) {
  let auth;
  try {
    auth = requireAdmin_();
  } catch (err) {
    return ralatKeHasil_(err);
  }
  try {
    return fn(auth);
  } catch (err) {
    return ralatKeHasil_(err);
  }
}

function ralatKeHasil_(err) {
  const m = String(err && err.message ? err.message : err);
  if (m === RESPONSE_ERROR.TIADA_KEBENARAN) return gagal_('TIADA_KEBENARAN', m);
  if (m === 'BELUM_DISEDIAKAN') return gagal_('BELUM_DISEDIAKAN', RESPONSE_ERROR.BELUM_DISEDIAKAN);
  if (m === 'SIBUK') return gagal_('SIBUK', RESPONSE_ERROR.SIBUK);
  Logger.log('API ralat: ' + (err && err.stack ? err.stack : m));
  return gagal_('RALAT', RESPONSE_ERROR.RALAT_UMUM);
}

/** Elak formula injection bila kata carian dsb ditulis ke Sheet. */
function safeCell_(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function logAudit_(emel, tindakan, rekodId, butiran) {
  try {
    getSheet_(SHEETS.AUDIT).appendRow([
      new Date(), safeCell_(emel), tindakan, safeCell_(rekodId), safeCell_(butiran)
    ]);
  } catch (err) {
    // Kegagalan log tidak boleh membuka akses. Rekod dalam Apps Script execution log.
    Logger.log('AUDIT GAGAL: ' + tindakan + ' | ' + err.message);
  }
}

/** Akses ditolak: catat sekali seminit bagi setiap emel supaya log tidak dibanjiri. */
function logDitolak_(emel, butiran) {
  try {
    const cache = CacheService.getScriptCache();
    const kunci = 'ditolak:' + String(emel).slice(0, 200);
    if (cache.get(kunci)) return;
    cache.put(kunci, '1', 60);
  } catch (err) {
    // Cache tidak tersedia: catat juga.
  }
  logAudit_(emel, TINDAKAN.AKSES_DITOLAK, '', butiran);
}

// ---------- config ----------

function bacaConfig_() {
  const sheet = getSheet_(SHEETS.CONFIG);
  const out = {};
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, 2).getValues().forEach(function (r) {
      const k = String(r[0]).trim();
      if (k) out[k] = String(r[1] === null || r[1] === undefined ? '' : r[1]).trim();
    });
  }
  return out;
}

function getConfigValue_(kunci) {
  const c = bacaConfig_();
  return Object.prototype.hasOwnProperty.call(c, kunci) ? c[kunci] : '';
}

function setConfigValue_(kunci, nilai) {
  const sheet = getSheet_(SHEETS.CONFIG);
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const kunciSedia = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < kunciSedia.length; i++) {
      if (String(kunciSedia[i][0]).trim() === kunci) {
        sheet.getRange(i + 2, 2).setValue(nilai);
        return;
      }
    }
  }
  sheet.appendRow([kunci, nilai]);
}

function modSistem_() {
  try {
    return getConfigValue_('MOD').toLowerCase() || 'dev';
  } catch (err) {
    return 'dev';
  }
}

/** Kosong = semua admin boleh import. Jika ada senarai, hanya emel dalam senarai. */
function bolehImport_(auth) {
  const senarai = getConfigValue_('EMEL_IMPORT')
    .split(/[,;\s]+/)
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(function (s) { return s !== ''; });
  return senarai.length === 0 || senarai.indexOf(auth.emel) !== -1;
}
