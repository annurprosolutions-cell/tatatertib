/**
 * Opr.gs - cetak OPR (F-06): template Google Docs -> salinan -> PDF -> folder Drive (BSD seksyen 5).
 * OPR hanya maklumat asas. butiran_kes TIDAK PERNAH dimasukkan ke OPR walaupun template ada {{butiran_kes}}.
 * Ruang tandatangan dan cop dibiarkan kosong untuk tandatangan fizikal.
 */

const OPR_MEDAN = [
  'nama', 'ic', 'gred', 'skim', 'tpt_bertugas', 'negeri', 'salahlaku', 'tahun',
  'keputusan_tatatertib', 'tarikh_kuatkuasa', 'rayuan_tatatertib', 'status_semasa'
];

/** Escape aksara khas dalam teks ganti replaceText (\ dan $). */
function escapeGanti_(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\$/g, '\\$');
}

function isiTemplate_(doc, r) {
  const nilai = { tarikh_cetak: formatTarikh_(new Date()), butiran_kes: '' };
  OPR_MEDAN.forEach(function (k) { nilai[k] = r[k] === '' ? '-' : r[k]; });
  const bahagian = [doc.getBody(), doc.getHeader(), doc.getFooter()].filter(function (b) { return !!b; });
  Object.keys(nilai).forEach(function (k) {
    bahagian.forEach(function (b) {
      b.replaceText('\\{\\{' + k + '\\}\\}', escapeGanti_(nilai[k]));
    });
  });
}

function namaFailUnik_(folder, asas) {
  let nama = asas + '.pdf';
  let n = 1;
  while (n < 50 && folder.getFilesByName(nama).hasNext()) {
    n++;
    nama = asas + '_' + n + '.pdf';
  }
  return nama;
}

/** Dokumen yang baru disalin kadangkala belum boleh dibuka serta-merta. Cuba sehingga 3 kali. */
function bukaDokumen_(id) {
  let salah = null;
  for (let i = 0; i < 3; i++) {
    try {
      return DocumentApp.openById(id);
    } catch (err) {
      salah = err;
      Utilities.sleep(700);
    }
  }
  throw salah;
}

function janaOpr_(auth, id) {
  const cfg = bacaConfig_();
  const templateId = cfg.TEMPLATE_OPR_ID || '';
  const folderId = cfg.FOLDER_PDF_ID || '';
  if (!templateId || !folderId) {
    return gagal_('OPR_BELUM_SEDIA', 'Template OPR belum disediakan. Pemilik sistem perlu run setupOpr() sekali.');
  }
  const data = bacaSemuaRekod_();
  const r = cariDenganId_(data.rekod, id);
  if (!r) return gagal_('TIADA_REKOD', 'Rekod tidak dijumpai');
  lengkapkan_(r);

  let folder;
  let templat;
  try {
    folder = DriveApp.getFolderById(folderId);
    templat = DriveApp.getFileById(templateId);
  } catch (err) {
    Logger.log('OPR akses: ' + err.message);
    return gagal_('OPR_AKSES', 'Template atau folder OPR tidak boleh diakses. Semak TEMPLATE_OPR_ID dan FOLDER_PDF_ID dalam tab config.');
  }

  const asas = 'OPR_' + (normIc_(r.ic) || 'TIADA_IC') + '_' + Utilities.formatDate(new Date(), tz_(), 'yyyyMMdd');
  const namaPdf = namaFailUnik_(folder, asas);
  let salinan = null;
  try {
    salinan = templat.makeCopy('TEMP_' + asas, folder);
    const doc = bukaDokumen_(salinan.getId());
    isiTemplate_(doc, r);
    doc.saveAndClose();
    const blob = salinan.getAs('application/pdf').setName(namaPdf);
    folder.createFile(blob);
    const bytes = blob.getBytes();
    logAudit_(auth.emel, TINDAKAN.CETAK_OPR, r.id, 'Fail: ' + namaPdf);
    return { ok: true, namaFail: namaPdf, pdfBase64: Utilities.base64Encode(bytes), saiz: bytes.length };
  } catch (err) {
    Logger.log('OPR gagal: ' + (err && err.stack ? err.stack : err));
    return gagal_('OPR_GAGAL', 'PDF tidak dapat dijana. Cuba lagi, atau hubungi pentadbir jika berterusan.');
  } finally {
    if (salinan) {
      try { salinan.setTrashed(true); } catch (err) { Logger.log('Gagal buang salinan sementara: ' + err.message); }
    }
  }
}

// ---------- setup template (dijalankan sekali oleh pemilik) ----------

/**
 * Cipta folder OPR dan template OPR lalai jika belum ada, dan simpan ID dalam tab config.
 * Run SEKALI selepas setupSystem(). Selamat dijalankan semula (tidak menimpa template sedia ada).
 * Jika klien ada template rasmi: letak ID dokumen Google Docs itu dalam config (TEMPLATE_OPR_ID).
 */
function setupOpr() {
  pastikanPemilik_();
  const laporan = [];
  const ss = getSpreadsheet_();
  const ibu = DriveApp.getFileById(ss.getId()).getParents();
  const induk = ibu.hasNext() ? ibu.next() : DriveApp.getRootFolder();

  let folder = null;
  const folderId = getConfigValue_('FOLDER_PDF_ID');
  if (folderId) {
    try { folder = DriveApp.getFolderById(folderId); } catch (err) { folder = null; }
  }
  if (!folder) {
    const sedia = induk.getFoldersByName('OPR');
    folder = sedia.hasNext() ? sedia.next() : induk.createFolder('OPR');
    setConfigValue_('FOLDER_PDF_ID', folder.getId());
    laporan.push('Folder OPR disediakan di ' + induk.getName() + '/OPR');
  } else {
    laporan.push('Folder OPR sedia ada dikekalkan.');
  }

  let templat = null;
  const templateId = getConfigValue_('TEMPLATE_OPR_ID');
  if (templateId) {
    try { templat = DriveApp.getFileById(templateId); } catch (err) { templat = null; }
  }
  if (!templat) {
    const doc = DocumentApp.create('Template OPR - ' + APP_NAME);
    binaTemplateOpr_(doc);
    doc.saveAndClose();
    const fail = DriveApp.getFileById(doc.getId());
    fail.moveTo(induk);
    setConfigValue_('TEMPLATE_OPR_ID', doc.getId());
    laporan.push('Template OPR lalai dicipta. Buka dan ubah suai jika perlu, kekalkan tempat letak {{...}}.');
  } else {
    laporan.push('Template OPR sedia ada dikekalkan.');
  }
  laporan.push('Kongsi folder OPR dengan 4 admin sahaja (Drive > Share). Jangan guna "anyone with the link".');
  const teks = laporan.join('\n');
  Logger.log(teks);
  return teks;
}

/** Susun atur OPR lalai, satu halaman A4. Tempat letak: {{nama}} dsb. Ruang tandatangan dan cop kosong. */
function binaTemplateOpr_(doc) {
  const body = doc.getBody();
  body.clear();
  body.setPageWidth(595.28).setPageHeight(841.89);
  body.setMarginTop(54).setMarginBottom(54).setMarginLeft(54).setMarginRight(54);

  body.appendParagraph('LAPORAN SATU MUKA SURAT (OPR)')
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER).setBold(true).setFontSize(15).setSpacingAfter(2);
  body.appendParagraph('REKOD TATATERTIB PEGAWAI')
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER).setBold(true).setFontSize(12).setSpacingAfter(18);

  const baris = [
    ['Nama', '{{nama}}'],
    ['No. kad pengenalan', '{{ic}}'],
    ['Gred', '{{gred}}'],
    ['Skim', '{{skim}}'],
    ['Tempat bertugas', '{{tpt_bertugas}}'],
    ['Negeri', '{{negeri}}'],
    ['Salah laku', '{{salahlaku}}'],
    ['Tahun', '{{tahun}}'],
    ['Keputusan tatatertib', '{{keputusan_tatatertib}}'],
    ['Tarikh kuat kuasa', '{{tarikh_kuatkuasa}}'],
    ['Rayuan', '{{rayuan_tatatertib}}'],
    ['Status semasa', '{{status_semasa}}']
  ];
  const jadual = body.appendTable(baris);
  jadual.setColumnWidth(0, 160);
  jadual.setColumnWidth(1, 320);
  jadual.setBorderWidth(1);
  for (let i = 0; i < baris.length; i++) {
    jadual.getRow(i).getCell(0).editAsText().setBold(true);
    jadual.getRow(i).getCell(0).setBackgroundColor('#EEF1F5');
  }

  body.appendParagraph('').setSpacingAfter(30);
  const tandatangan = body.appendTable([
    ['Tandatangan pegawai pengesah', 'Cop rasmi jabatan'],
    ['', '']
  ]);
  tandatangan.setColumnWidth(0, 240);
  tandatangan.setColumnWidth(1, 240);
  tandatangan.setBorderWidth(1);
  tandatangan.getRow(0).getCell(0).editAsText().setBold(true);
  tandatangan.getRow(0).getCell(1).editAsText().setBold(true);
  tandatangan.getRow(1).setMinimumHeight(100);

  body.appendParagraph('').setSpacingAfter(12);
  body.appendParagraph('Tarikh cetak: {{tarikh_cetak}}').setFontSize(9);
}
