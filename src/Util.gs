/**
 * Util.gs - fungsi bantu umum. Semua nama berakhir _ supaya tidak boleh dipanggil dari browser.
 */

let _tzCache = null;

function isDate_(v) {
  // Guna tag objek, bukan instanceof, supaya betul merentas konteks.
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

/** Zon masa Sheet. Semua tarikh dipaparkan ikut zon ini. */
function tz_() {
  if (!_tzCache) {
    try { _tzCache = getSpreadsheet_().getSpreadsheetTimeZone(); } catch (err) { _tzCache = ''; }
    if (!_tzCache) _tzCache = Session.getScriptTimeZone() || TZ_SISTEM;
  }
  return _tzCache;
}

function pad_(n, lebar) {
  let s = String(n);
  while (s.length < lebar) s = '0' + s;
  return s;
}

function formatTarikh_(d) { return Utilities.formatDate(d, tz_(), 'dd/MM/yyyy'); }
function formatMasa_(d) { return Utilities.formatDate(d, tz_(), 'dd/MM/yyyy HH:mm:ss'); }
function teksTarikh_(p) { return pad_(p.d, 2) + '/' + pad_(p.m, 2) + '/' + p.y; }

/** Pulangkan {y,m,d} jika tarikh wujud dalam kalendar, jika tidak null. */
function buatTarikh_(y, m, d) {
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return { y: y, m: m, d: d };
}

/** Borang: format DD/MM/YYYY sahaja. */
function semakTarikh_(teks) {
  const t = String(teks === null || teks === undefined ? '' : teks).trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return { ok: false, ralat: 'Tarikh mesti dalam format DD/MM/YYYY' };
  const p = buatTarikh_(+m[3], +m[2], +m[1]);
  if (!p) return { ok: false, ralat: 'Tarikh tidak sah' };
  return { ok: true, teks: teksTarikh_(p) };
}

/**
 * Import: terima D/M/YYYY, D-M-YYYY, D.M.YYYY dan YYYY-MM-DD (dengan atau tanpa masa).
 * terbalik=true bila tarikh hanya sah jika bulan dan hari ditukar (tanda fail format MM/DD/YYYY).
 */
function semakTarikhLonggar_(teks) {
  let t = String(teks === null || teks === undefined ? '' : teks).trim();
  t = t.replace(/[ T]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(am|pm)?\s*$/i, '').trim();
  let m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(t);
  if (m) {
    const p = buatTarikh_(+m[3], +m[2], +m[1]);
    if (p) return { ok: true, teks: teksTarikh_(p) };
    const terbalik = +m[2] > 12 && !!buatTarikh_(+m[3], +m[1], +m[2]);
    return { ok: false, terbalik: terbalik, ralat: 'Tarikh tidak sah' };
  }
  m = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/.exec(t);
  if (m) {
    const p = buatTarikh_(+m[1], +m[2], +m[3]);
    if (p) return { ok: true, teks: teksTarikh_(p) };
    return { ok: false, terbalik: false, ralat: 'Tarikh tidak sah' };
  }
  return { ok: false, terbalik: false, ralat: 'Format tarikh tidak dikenali' };
}

/** DD/MM/YYYY -> nombor siri Sheets (tiada kaitan zon masa). */
function siriTarikh_(teks) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(teks);
  if (!m) return '';
  return Math.round(Date.UTC(+m[3], +m[2] - 1, +m[1]) / 86400000) + 25569;
}

function normSpace_(s) {
  return String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' ').trim();
}
function normKey_(s) { return normSpace_(s).toLowerCase(); }
function normIc_(s) { return String(s === null || s === undefined ? '' : s).replace(/[\s-]/g, ''); }

function gagal_(kod, mesej, tambahan) {
  const out = { ok: false, kod: kod, mesej: mesej };
  if (tambahan) Object.keys(tambahan).forEach(function (k) { out[k] = tambahan[k]; });
  return out;
}

/** Jalankan fn dengan kunci skrip supaya dua admin tidak menulis serentak. */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    throw new Error('SIBUK');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Pastikan Sheet ada sekurang-kurangnya `perlu` baris. */
function pastikanBaris_(sheet, perlu) {
  const maks = sheet.getMaxRows();
  if (maks < perlu) sheet.insertRowsAfter(maks, perlu - maks);
}

function bandingTeks_(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
