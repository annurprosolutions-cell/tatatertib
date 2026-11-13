/**
 * Code.gs - titik masuk web app (doGet) dan fungsi yang dipanggil dari browser.
 */

function doGet() {
  try {
    const auth = checkAdmin();
    if (!auth.ok) return renderDenied_(auth);

    logAudit_(auth.emel, TINDAKAN.LOG_MASUK, '', '');
    const tpl = HtmlService.createTemplateFromFile('Index');
    tpl.appName = APP_NAME;
    tpl.nama = auth.nama;
    tpl.emel = auth.emel;
    return tpl.evaluate()
      .setTitle(APP_NAME)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (err) {
    Logger.log('doGet ralat: ' + err.message);
    return renderMessage_('Sistem tidak tersedia', RESPONSE_ERROR.BELUM_DISEDIAKAN);
  }
}

/** S-01 paparan akses ditolak. Tidak dedahkan isi whitelist. */
function renderDenied_(auth) {
  const tpl = HtmlService.createTemplateFromFile('Denied');
  tpl.appName = APP_NAME;
  tpl.emel = auth.emel;
  tpl.tiadaEmel = auth.sebab === 'TIADA_EMEL';
  return tpl.evaluate()
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function renderMessage_(tajuk, mesej) {
  const tpl = HtmlService.createTemplateFromFile('Message');
  tpl.appName = APP_NAME;
  tpl.tajuk = tajuk;
  tpl.mesej = mesej;
  return tpl.evaluate()
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Untuk template: <?!= include_('Styles') ?> */
function include_(nama) {
  return HtmlService.createHtmlOutputFromFile(nama).getContent();
}

/** Dipanggil browser selepas halaman dimuat. Sahkan sesi masih sah di server. */
function api_whoami() {
  const auth = requireAdmin_();
  return { nama: auth.nama, emel: auth.emel };
}
