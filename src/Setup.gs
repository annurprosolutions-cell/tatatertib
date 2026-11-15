/**
 * Setup.gs - setupSystem() (BSD seksyen 6).
 * Run SEKALI dari editor Apps Script oleh pemilik Sheet. Selamat dijalankan semula (idempotent):
 * tab sedia ada tidak dipadam, data tidak disentuh, hanya yang kurang ditambah.
 */

function setupSystem() {
  pastikanPemilik_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Projek ini mesti dibuka melalui Extensions > Apps Script dari dalam Google Sheet.');
  }
  PropertiesService.getScriptProperties().setProperty(PROP_SPREADSHEET_ID, ss.getId());

  const laporan = [];
  try {
    // Sejajarkan zon masa supaya cap masa audit dan tarikh dipaparkan ikut waktu Malaysia.
    if (ss.getSpreadsheetTimeZone() !== TZ_SISTEM) {
      ss.setSpreadsheetTimeZone(TZ_SISTEM);
      laporan.push('Zon masa Sheet ditetapkan: ' + TZ_SISTEM);
    }
  } catch (err) {
    laporan.push('AMARAN: zon masa Sheet tidak dapat ditetapkan (' + err.message + '). Tetapkan di File > Settings.');
  }
  // Tarikh dibaca melalui Date; jika zon masa skrip dan Sheet berbeza, hari boleh teranjak.
  const zonSkrip = Session.getScriptTimeZone();
  if (zonSkrip && zonSkrip !== TZ_SISTEM) {
    laporan.push('AMARAN: zon masa skrip (' + zonSkrip + ') berbeza daripada ' + TZ_SISTEM +
      '. Dalam editor: Project Settings > tanda "Show appsscript.json" > tetapkan "timeZone": "' + TZ_SISTEM + '".');
  }

  const sheets = {};
  Object.keys(HEADERS).forEach(function (nama) {
    sheets[nama] = ensureSheet_(ss, nama, HEADERS[nama], laporan);
  });

  setupRekodFormat_(sheets[SHEETS.REKOD]);
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
    laporan.push('CATATAN: senarai dropdown belum disahkan klien (teks bebas diterima): ' + belumSah.join(', '));
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

function setupRekodFormat_(sheet) {
  const baris = Math.max(sheet.getMaxRows() - 1, 1);
  // Semua lajur teks (termasuk IC supaya sifar di depan tidak hilang, dan nama yang bermula "=")
  // berformat teks. Lajur tarikh dan nombor ditetapkan semula di bawah.
  sheet.getRange(2, 1, baris, sheet.getLastColumn()).setNumberFormat('@');
  sheet.getRange(2, colIndex_(sheet, 'tarikh_kuatkuasa'), baris, 1).setNumberFormat('dd/mm/yyyy');
  sheet.getRange(2, colIndex_(sheet, 'created_at'), baris, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
  sheet.getRange(2, colIndex_(sheet, 'updated_at'), baris, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
  sheet.getRange(2, colIndex_(sheet, 'tahun'), baris, 1).setNumberFormat('0');
}

function setupDropdowns_(sheet, laporan) {
  const baris = Math.max(sheet.getMaxRows() - 1, 1);
  const dipasang = [];
  Object.keys(DROPDOWNS).forEach(function (medan) {
    const def = DROPDOWNS[medan];
    const julat = sheet.getRange(2, colIndex_(sheet, medan), baris, 1);
    if (!def.nilai.length) {
      julat.clearDataValidations();   // senarai belum ada: teks bebas
      return;
    }
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(def.nilai, true)
      .setAllowInvalid(!def.disahkan)
      .build();
    julat.setDataValidation(rule);
    dipasang.push(medan);
  });
  laporan.push('Dropdown dipasang: ' + (dipasang.join(', ') || '(tiada)'));
}

function setupAuditFormat_(sheet) {
  const baris = Math.max(sheet.getMaxRows() - 1, 1);
  sheet.getRange(2, 1, baris, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
}

/**
 * Seed admin pertama (pemilik) jika belum ada sebarang emel.
 * PENTING: jangan guna Range.insertCheckboxes() di sini. Ia menetapkan semula semua sel kepada
 * "tidak ditanda" (FALSE), jadi run kali kedua akan menyahaktifkan semua admin. Guna peraturan
 * pengesahan data checkbox, yang tidak mengubah nilai sedia ada.
 */
function seedWhitelist_(sheet, laporan) {
  const emelCol = colIndex_(sheet, 'emel');
  const namaCol = colIndex_(sheet, 'nama');
  const aktifCol = colIndex_(sheet, 'aktif');
  const baris = Math.max(sheet.getMaxRows() - 1, 1);

  // Baiki baki FALSE pada baris tanpa emel (contoh: daripada setupSystem versi lama).
  const aktifJulat = sheet.getRange(2, aktifCol, baris, 1);
  const emelNilai = sheet.getRange(2, emelCol, baris, 1).getValues();
  const aktifNilai = aktifJulat.getValues();
  let diubah = false;
  for (let i = 0; i < baris; i++) {
    if (String(emelNilai[i][0]).trim() === '' && aktifNilai[i][0] === false) {
      aktifNilai[i][0] = '';
      diubah = true;
    }
  }
  if (diubah) aktifJulat.setValues(aktifNilai);

  const adaAdmin = emelNilai.some(function (r) { return String(r[0]).trim() !== ''; });
  if (!adaAdmin) {
    // setupSystem dijalankan manual oleh pemilik, jadi effective user = pemilik.
    const emel = String(Session.getEffectiveUser().getEmail() || Session.getActiveUser().getEmail() || '')
      .trim().toLowerCase();
    if (!emel) {
      laporan.push('AMARAN: emel pemilik tidak dapat dikesan. Isi baris pertama admin_whitelist secara manual.');
    } else {
      sheet.getRange(2, emelCol).setValue(emel);
      sheet.getRange(2, namaCol).setValue('Pemilik');
      sheet.getRange(2, aktifCol).setValue(true);
      laporan.push('Whitelist di-seed dengan 1 admin (pemilik). Tambah admin lain secara manual dan tanda aktif.');
    }
  }

  // Kotak tanda untuk 50 baris pertama (4 admin sahaja, jadi mencukupi).
  const peraturan = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  sheet.getRange(2, aktifCol, Math.min(baris, 50), 1).setDataValidation(peraturan);
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
