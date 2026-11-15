/**
 * AuditView.gs - paparan S-08 (F-07). Log ditulis oleh logAudit_() di Auth.gs, bukan di sini.
 * Log hanya boleh dibaca melalui fungsi ini. Tiada fungsi untuk edit atau padam.
 */

function tarikhIso_(teks) {
  const t = String(teks === null || teks === undefined ? '' : teks).trim();
  if (t === '') return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m || !buatTarikh_(+m[1], +m[2], +m[3])) return null;
  return t;
}

/**
 * tapis: { halaman, tindakan, emel, kata, dari, hingga } dengan dari/hingga dalam bentuk YYYY-MM-DD.
 * Hasil terbaru dahulu, 25 baris setiap halaman.
 */
function auditLogData_(tapis) {
  const t = tapis && typeof tapis === 'object' ? tapis : {};
  const tindakan = String(t.tindakan || '').trim();
  if (tindakan && !Object.prototype.hasOwnProperty.call(TINDAKAN, tindakan)) {
    return gagal_('VALIDASI', 'Jenis tindakan tidak sah');
  }
  const dari = tarikhIso_(t.dari);
  const hingga = tarikhIso_(t.hingga);
  if (dari === null || hingga === null) return gagal_('VALIDASI', 'Tarikh tidak sah');
  if (dari && hingga && dari > hingga) return gagal_('VALIDASI', 'Tarikh "dari" mesti sebelum "hingga"');

  const emelCari = normKey_(t.emel);
  const kata = normKey_(t.kata);
  const saiz = HAD.AUDIT_SAIZ_HALAMAN;
  const halaman = Math.max(parseInt(t.halaman, 10) || 1, 1);

  const sheet = getSheet_(SHEETS.AUDIT);
  const lastRow = sheet.getLastRow();
  const padan = [];
  if (lastRow >= 2) {
    const mula = Math.max(2, lastRow - HAD.AUDIT_BACA_MAKS + 1);
    const nilai = sheet.getRange(mula, 1, lastRow - mula + 1, 5).getValues();
    for (let i = nilai.length - 1; i >= 0; i--) {
      const b = nilai[i];
      const masa = b[0];
      if (dari || hingga) {
        if (isDate_(masa)) {
          const hari = Utilities.formatDate(masa, tz_(), 'yyyy-MM-dd');
          if (hingga && hari > hingga) continue;
          if (dari && hari < dari) break;   // baris disusun ikut masa, yang lebih lama tak perlu disemak
        }
      }
      const tind = String(b[2]);
      if (tindakan && tind !== tindakan) continue;
      if (emelCari && normKey_(b[1]).indexOf(emelCari) === -1) continue;
      if (kata && (normKey_(b[4]) + ' ' + normKey_(b[3])).indexOf(kata) === -1) continue;
      padan.push(b);
    }
  }

  const jumlah = padan.length;
  const jumlahHalaman = Math.max(Math.ceil(jumlah / saiz), 1);
  const hal = Math.min(halaman, jumlahHalaman);
  const potong = padan.slice((hal - 1) * saiz, hal * saiz);

  // Nama rekod dicari semasa paparan sahaja, supaya log tidak menyimpan salinan data peribadi.
  const nama = new Map();
  if (potong.some(function (b) { return String(b[3]) !== ''; })) {
    bacaSemuaRekod_().rekod.forEach(function (r) { nama.set(r.id, r.nama); });
  }

  return {
    ok: true,
    jumlah: jumlah,
    halaman: hal,
    jumlahHalaman: jumlahHalaman,
    baris: potong.map(function (b) {
      return {
        masa: isDate_(b[0]) ? formatMasa_(b[0]) : String(b[0]),
        emel: String(b[1]),
        tindakan: String(b[2]),
        rekod_id: String(b[3]),
        namaRekod: nama.has(String(b[3])) ? nama.get(String(b[3])) : '',
        butiran: String(b[4])
      };
    })
  };
}
