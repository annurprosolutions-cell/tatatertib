/**
 * Setup.gs - setupSystem() (BSD seksyen 6).
 * Run SEKALI dari editor Apps Script oleh pemilik Sheet. Selamat dijalankan semula (idempotent):
 * tab sedia ada tidak dipadam, data tidak disentuh, hanya yang kurang ditambah.
 */

function setupSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Projek ini mesti dibuka melalui Extensions > Apps Script dari dalam Google Sheet.');
  }
  PropertiesService.getScriptProperties().setProperty(PROP_SPREADSHEET_ID, ss.getId());

  const laporan = [];
  const sheets = {};
  Object.keys(HEADERS).forEach(function (nama) {
    sheets[nama] = ensureSheet_(ss, nama, HEADERS[nama], laporan);
  });

  setupRekodFormat_(sheets[SHEETS.REKOD], laporan);
  setupDropdowns_(sheets[SHEETS.REKOD], laporan);
  setupAuditFormat_(sheets[SHEETS.AUDIT]);
  seedWhitelist_(sheets[SHEETS.WHITELIST], laporan);
  seedConfig_(sheets[SHEETS.CONFIG], laporan);
  removeDefaultSheet_(ss, laporan);

  [SHEETS.WHITELIST, SHEETS.AUDIT, SHEETS.CONFIG].forEach(function (nama) {
    protectSheet_(sheets[nama], laporan);
  });

  const belumSah = Object.keys(DROPDOWNS).filter(function (k) { return !DROPDOWNS[k].disahkan; });
  if (belumSah.length) {
    laporan.push('AMARAN: senarai dropdown masih PLACEHOLDER (perlu daripada klien): ' + belumSah.join(', '));
  }

  const teks = laporan.join('\n');
  Logger.log(teks);
  return teks;
}

function ensureSheet_(ss, nama, headers, laporan) {
  let sheet = ss.getSheetByName(nama);
  if (!sheet) {
    sheet = ss.insertSheet(nama);
    laporan.push('Tab dicipta: ' + nama);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    // Tab sudah ada: tambah header yang kurang di hujung, jangan ubah susunan sedia ada.
    const lastCol = Math.max(sheet.getLastColumn(), 1);
    const sedia = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
    const kurang = headers.filter(function (h) { return sedia.indexOf(h) === -1; });
    if (kurang.length) {
      const mula = sedia.filter(function (h) { return h !== ''; }).length + 1;
      sheet.getRange(1, mula, 1, kurang.length).setValues([kurang]);
      laporan.push('Header ditambah dalam ' + nama + ': ' + kurang.join(', '));
    }
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#1F3A5F')
    .setFontColor('#FFFFFF');
  return sheet;
}

function colIndex_(sheet, nama) {
  const lastCol = sheet.getLastColumn();
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const i = header.indexOf(nama);
  if (i === -1) throw new Error('Header tiada: ' + nama);
  return i + 1;
}

function setupRekodFormat_(sheet, laporan) {
  const baris = Math.max(sheet.getMaxRows() - 1, 1);
  // IC sebagai teks supaya sifar di depan tidak hilang.
  sheet.getRange(2, colIndex_(sheet, 'ic'), baris, 1).setNumberFormat('@');
  sheet.getRange(2, colIndex_(sheet, 'tarikh_kuatkuasa'), baris, 1).setNumberFormat('dd/mm/yyyy');
  sheet.getRange(2, colIndex_(sheet, 'created_at'), baris, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
  sheet.getRange(2, colIndex_(sheet, 'updated_at'), baris, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
  sheet.getRange(2, colIndex_(sheet, 'tahun'), baris, 1).setNumberFormat('0');
}

function setupDropdowns_(sheet, laporan) {
  const baris = Math.max(sheet.getMaxRows() - 1, 1);
  Object.keys(DROPDOWNS).forEach(function (medan) {
    const def = DROPDOWNS[medan];
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(def.nilai, true)
      .setAllowInvalid(!def.disahkan)
      .build();
    sheet.getRange(2, colIndex_(sheet, medan), baris, 1).setDataValidation(rule);
  });
  laporan.push('Dropdown dipasang: ' + Object.keys(DROPDOWNS).join(', '));
}

function setupAuditFormat_(sheet) {
  const baris = Math.max(sheet.getMaxRows() - 1, 1);
  sheet.getRange(2, 1, baris, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
}

function seedWhitelist_(sheet, laporan) {
  const aktifCol = colIndex_(sheet, 'aktif');
  sheet.getRange(2, aktifCol, Math.max(sheet.getMaxRows() - 1, 1), 1).insertCheckboxes();
  if (sheet.getLastRow() >= 2) return;
  // setupSystem dijalankan manual oleh pemilik, jadi effective user = pemilik.
  const emel = (Session.getEffectiveUser().getEmail() || Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!emel) {
    laporan.push('AMARAN: emel pemilik tidak dapat dikesan. Isi baris pertama admin_whitelist secara manual.');
    return;
  }
  sheet.appendRow([emel, 'Pemilik', true]);
  laporan.push('Whitelist di-seed dengan 1 admin (pemilik). Tambah 3 admin lain secara manual.');
}

function seedConfig_(sheet, laporan) {
  const ada = sheet.getLastRow() >= 2
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); })
    : [];
  CONFIG_SEED.forEach(function (par) {
    if (ada.indexOf(par[0]) === -1) {
      sheet.appendRow(par);
      laporan.push('Config ditambah: ' + par[0]);
    }
  });
}

function removeDefaultSheet_(ss, laporan) {
  const lazim = ['Sheet1', 'Helaian1'];
  const semua = ss.getSheets();
  if (semua.length <= 1) return;
  semua.forEach(function (s) {
    if (lazim.indexOf(s.getName()) !== -1 && s.getLastRow() === 0 && s.getLastColumn() === 0) {
      ss.deleteSheet(s);
      laporan.push('Tab kosong lalai dibuang: ' + s.getName());
    }
  });
}

/** Hanya pemilik boleh edit tab. Server (Execute as: Me) tetap boleh tulis. */
function protectSheet_(sheet, laporan) {
  const desc = 'Dilindungi oleh setupSystem';
  try {
    const sedia = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)
      .filter(function (p) { return p.getDescription() === desc; });
    if (sedia.length) return;
    const p = sheet.protect().setDescription(desc);
    const saya = Session.getEffectiveUser();
    p.addEditor(saya);
    const lain = p.getEditors().filter(function (u) { return u.getEmail() !== saya.getEmail(); });
    if (lain.length) p.removeEditors(lain);
    if (p.canDomainEdit()) p.setDomainEdit(false);
    laporan.push('Perlindungan dipasang: ' + sheet.getName());
  } catch (err) {
    laporan.push('AMARAN: gagal pasang perlindungan pada ' + sheet.getName() + ' (' + err.message + '). Pasang manual: Data > Protect sheets.');
  }
}
