/**
 * Auth.gs - checkAdmin(), audit log dan akses Sheet (TRD seksyen 5, BSD seksyen 4).
 * Semakan role hanya di server. Kegagalan sentiasa menolak akses (fail closed).
 */

function getSheet_(nama) {
  const id = PropertiesService.getScriptProperties().getProperty(PROP_SPREADSHEET_ID);
  if (!id) throw new Error('BELUM_DISEDIAKAN');
  const sheet = SpreadsheetApp.openById(id).getSheetByName(nama);
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
    logAudit_('(tidak dikesan)', TINDAKAN.AKSES_DITOLAK, '', 'Emel tidak dapat dikesan');
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
          logAudit_(emel, TINDAKAN.AKSES_DITOLAK, '', 'Admin tidak aktif');
          return { ok: false, emel: emel, nama: '', sebab: 'TIDAK_AKTIF' };
        }
        return { ok: true, emel: emel, nama: String(data[i][iNama]), sebab: '' };
      }
    }
  }
  logAudit_(emel, TINDAKAN.AKSES_DITOLAK, '', 'Emel tiada dalam whitelist');
  return { ok: false, emel: emel, nama: '', sebab: 'TIADA_DALAM_WHITELIST' };
}

/** Panggil di permulaan setiap fungsi server yang boleh dipanggil dari browser. */
function requireAdmin_() {
  const auth = checkAdmin();
  if (!auth.ok) throw new Error(RESPONSE_ERROR.TIADA_KEBENARAN);
  return auth;
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
