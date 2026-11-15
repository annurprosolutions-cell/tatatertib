/**
 * Api.gs - SEMUA fungsi yang boleh dipanggil dari browser (google.script.run) selain doGet dan checkAdmin.
 * Setiap fungsi mesti bermula dengan apiRun_() yang menyemak whitelist di server.
 * Fungsi lain dalam projek berakhir _ dan tidak boleh dipanggil dari browser.
 * Hasil: { ok: true, ... } atau { ok: false, kod, mesej, ... }.
 */

/** Dipanggil browser selepas halaman dimuat. Sahkan sesi masih sah di server. */
function api_whoami() {
  return apiRun_(function (auth) {
    return {
      ok: true,
      nama: auth.nama,
      emel: auth.emel,
      bolehImport: bolehImport_(auth),
      jumlahRekod: kiraRekod_(),
      mod: modSistem_()
    };
  });
}

/** F-02: cari ikut nama atau IC. Setiap carian direkod dalam audit_log. */
function cariRekod(keyword) {
  return apiRun_(function (auth) { return cariRekodProses_(auth, keyword); });
}

function api_lihatRekod(id) {
  return apiRun_(function (auth) { return lihatRekodProses_(auth, id); });
}

function api_borangMeta() {
  return apiRun_(function () { return borangMeta_(); });
}

/** F-03: tambah (tiada payload.id) atau kemas kini (ada payload.id dan payload.versi). */
function api_simpanRekod(payload) {
  return apiRun_(function (auth) { return simpanRekodProses_(auth, payload); });
}

function api_dashboard(tahun) {
  return apiRun_(function () { return dashboardData_(tahun); });
}

function api_auditLog(tapis) {
  return apiRun_(function () { return auditLogData_(tapis); });
}

function api_importAnalisis(csv) {
  return apiRun_(function (auth) { return importDibenarkan_(auth) || importAnalisis_(csv); });
}

function api_importSemak(csv, pemetaan, alias, opsyen) {
  return apiRun_(function (auth) { return importDibenarkan_(auth) || importSemak_(csv, pemetaan, alias, opsyen); });
}

function api_importLaksana(csv, pemetaan, alias, opsyen, namaFail) {
  return apiRun_(function (auth) {
    return importDibenarkan_(auth) || importLaksana_(auth, csv, pemetaan, alias, opsyen, namaFail);
  });
}

function api_janaOpr(id) {
  return apiRun_(function (auth) { return janaOpr_(auth, id); });
}
