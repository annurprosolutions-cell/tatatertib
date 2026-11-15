// Ujian logic server (Fasa 0 hingga 6) dengan mock Apps Script. Jalankan: node test/run.js
process.env.TZ = 'Asia/Kuala_Lumpur';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { makeEnv, SRC, SS_TZ } = require('./mockenv');

const OWNER = 'owner@gmail.com';
let lulus = 0;
let gagal = 0;
function test(nama, fn) {
  try { fn(); lulus++; console.log('  ok  ' + nama); }
  catch (e) { gagal++; console.log('FAIL  ' + nama + '\n      ' + String(e.stack || e).split('\n').slice(0, 5).join('\n      ')); }
}
function seksyen(t) { console.log('\n# ' + t); }

// ---------- pembantu ----------
function siap(email, opts) {
  const e = makeEnv(opts || {});
  e.setup(email === undefined ? OWNER : email);
  return e;
}
function tambahAdmin(e, emel, nama, aktif) {
  const s = e.sheet('admin_whitelist');
  const baris = e.rows('admin_whitelist').filter((r) => String(r[0]) !== '').length + 2;
  s.getRange(baris, 1).setValue(emel);
  s.getRange(baris, 2).setValue(nama);
  s.getRange(baris, 3).setValue(aktif === undefined ? true : aktif);
}
const tunggu1ms = () => { const t = Date.now(); while (Date.now() === t) { /* tunggu */ } };
const asas = (o) => Object.assign({
  nama: 'Ahmad bin Ali', ic: '900101145678', gred: 'N41', skim: 'Pegawai Tadbir',
  tpt_bertugas: 'Pejabat Daerah X', negeri: 'Selangor', salahlaku: 'Lewat masuk',
  butiran_kes: 'Lewat 10 kali dalam sebulan', tahun: '2013', keputusan_tatatertib: 'Amaran',
  tarikh_kuatkuasa: '15/03/2013', rayuan_tatatertib: 'Tiada', status_semasa: 'Aktif'
}, o || {});
const simpan = (e, o) => e.call('api_simpanRekod', asas(o));
const auditRows = (e) => e.rows('audit_log').map((r) => ({ tindakan: r[2], emel: r[1], rekod: r[3], butiran: r[4] }));
const tindakanAudit = (e) => auditRows(e).map((r) => r.tindakan);
const hariIni = () => new Date();
const fmtHari = (d, f) => require('./mockenv') && new Intl.DateTimeFormat('en-GB', { timeZone: SS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
  .formatToParts(d).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
const yyyymmdd = (d) => { const p = fmtHari(d); return p.year + p.month + p.day; };
const iso = (d) => { const p = fmtHari(d); return p.year + '-' + p.month + '-' + p.day; };

const CSV_HEADER = 'NAMA,NO. K/P,GRED,SKIM,TEMPAT BERTUGAS,NEGERI,SALAH LAKU,BUTIRAN,TAHUN,HUKUMAN,TARIKH KUAT KUASA,RAYUAN,STATUS';
function csvBaris(o) {
  const b = Object.assign({
    nama: 'Siti binti Omar', ic: '850505105050', gred: 'N41', skim: 'Pegawai Tadbir', tpt: 'PD Hulu Langat',
    negeri: 'Selangor', salah: 'Lewat masuk', butiran: 'x', tahun: '2013', hukuman: 'Amaran', tarikh: '01/02/2013', rayuan: 'Tiada', status: 'Aktif'
  }, o || {});
  return [b.nama, b.ic, b.gred, b.skim, b.tpt, b.negeri, b.salah, b.butiran, b.tahun, b.hukuman, b.tarikh, b.rayuan, b.status]
    .map((x) => (/[",\n;]/.test(x) ? '"' + String(x).replace(/"/g, '""') + '"' : x)).join(',');
}
const buatCsv = (baris) => [CSV_HEADER].concat(baris.map(csvBaris)).join('\n');

// =====================================================================
seksyen('Fasa 0: setupSystem');
// =====================================================================
test('cipta 4 tab, header betul, buang Sheet1 kosong, zon masa, freeze', () => {
  const e = makeEnv({ defaultSheet: true });
  e.state.ss.tz = 'UTC';
  e.asUser(OWNER).call('setupSystem');
  assert.deepStrictEqual(Array.from(e.state.ss.sheets.keys()).sort(), ['admin_whitelist', 'audit_log', 'config', 'rekod_tatatertib']);
  const h = e.rows('rekod_tatatertib');
  assert.strictEqual(e.sheet('rekod_tatatertib').getRange(1, 1, 1, 17).getValues()[0].length, 17);
  assert.strictEqual(e.sheet('rekod_tatatertib').getRange(1, 1).getValue(), 'id');
  assert.strictEqual(e.sheet('rekod_tatatertib').getRange(1, 17).getValue(), 'updated_at');
  assert.strictEqual(e.sheet('rekod_tatatertib').frozen, 1);
  assert.strictEqual(e.state.ss.tz, SS_TZ);
  assert.strictEqual(e.state.props.SPREADSHEET_ID, 'SS_ID');
  assert.strictEqual(h.length, 0);
});
test('seed whitelist (pemilik, aktif TRUE) dan config (4 kunci)', () => {
  const e = siap();
  const w = e.rows('admin_whitelist');
  assert.deepStrictEqual([w[0][0], w[0][1], w[0][2]], [OWNER, 'Pemilik', true]);
  assert.deepStrictEqual(e.rows('config').map((r) => r[0]), ['TEMPLATE_OPR_ID', 'FOLDER_PDF_ID', 'MOD', 'EMEL_IMPORT']);
});
test('idempotent: run semula TIDAK menyahaktifkan admin atau memadam data (regresi insertCheckboxes)', () => {
  const e = siap();
  tambahAdmin(e, 'b@gmail.com', 'B', true);
  simpan(e);
  e.asUser(OWNER).call('setupSystem');
  e.call('setupSystem');
  const w = e.rows('admin_whitelist').filter((r) => String(r[0]) !== '');
  assert.deepStrictEqual(w.map((r) => [r[0], r[2]]), [[OWNER, true], ['b@gmail.com', true]]);
  assert.strictEqual(e.rows('rekod_tatatertib').length, 1);
  assert.strictEqual(e.rows('config').length, 4);
  assert.strictEqual(e.sheet('audit_log').protections.length, 1);
  assert.strictEqual(e.sheet('admin_whitelist').protections.length, 1);
  assert.strictEqual(e.asUser(OWNER).call('checkAdmin').ok, true);
});
test('baiki keadaan lama: FALSE berselerak dan tiada admin -> seed pemilik, FALSE dibersihkan', () => {
  const e = makeEnv({});
  e.asUser(OWNER).call('setupSystem');
  // Simulasi setupSystem versi lama: insertCheckboxes pada seluruh lajur aktif dan tiada admin.
  const s = e.sheet('admin_whitelist');
  s.getRange(2, 1, 1, 3).setValues([['', '', '']]);
  s.getRange(2, 3, 999, 1).insertCheckboxes();
  assert.strictEqual(s.getLastRow(), 1000);
  e.call('setupSystem');
  assert.strictEqual(s.getLastRow(), 2);
  assert.deepStrictEqual([s.getRange(2, 1).getValue(), s.getRange(2, 3).getValue()], [OWNER, true]);
  assert.strictEqual(e.call('checkAdmin').ok, true);
});
test('setupSystem dan setupOpr ditolak untuk pelawat bukan pemilik', () => {
  const e = makeEnv({});
  e.asUser(OWNER).call('setupSystem');
  e.asUser('orang@gmail.com');
  assert.throws(() => e.call('setupSystem'), /Tiada kebenaran/);
  assert.throws(() => e.call('setupOpr'), /Tiada kebenaran/);
  e.asUser('');
  assert.throws(() => e.call('setupSystem'), /Tiada kebenaran/);
});
test('dropdown: negeri strict (16), status_semasa dibenarkan teks lain, senarai kosong tiada validasi', () => {
  const e = siap();
  const rekod = e.sheet('rekod_tatatertib');
  const col = (n) => e.run('HEADERS.rekod_tatatertib').indexOf(n) + 1;
  const dvNegeri = rekod._cell(2, col('negeri')).dv;
  assert.strictEqual(dvNegeri.list.length, 16);
  assert.strictEqual(dvNegeri.allowInvalid, false);
  assert.strictEqual(rekod._cell(2, col('status_semasa')).dv.allowInvalid, true);
  assert.strictEqual(rekod._cell(2, col('gred')).dv, null);
});
test('format sel: IC teks, tarikh dd/mm/yyyy, nama teks', () => {
  const e = siap();
  const r = e.sheet('rekod_tatatertib');
  const col = (n) => e.run('HEADERS.rekod_tatatertib').indexOf(n) + 1;
  assert.strictEqual(r._cell(5, col('ic')).f, '@');
  assert.strictEqual(r._cell(5, col('nama')).f, '@');
  assert.strictEqual(r._cell(5, col('tarikh_kuatkuasa')).f, 'dd/mm/yyyy');
});
test('header yang hilang ditambah tanpa padam data', () => {
  const e = siap();
  e.sheet('admin_whitelist').getRange(1, 3).setValue('');
  e.asUser(OWNER).call('setupSystem');
  assert.strictEqual(e.sheet('admin_whitelist').getRange(1, 3).getValue(), 'aktif');
  assert.strictEqual(e.sheet('admin_whitelist').getRange(2, 1).getValue(), OWNER);
});
test('amaran jika zon masa skrip berbeza daripada Sheet; tiada amaran jika sama', () => {
  const a = makeEnv({}); a.state.scriptTz = 'America/New_York';
  assert.ok(a.asUser(OWNER).call('setupSystem').includes('AMARAN: zon masa skrip (America/New_York)'));
  const b = makeEnv({});
  assert.ok(!b.asUser(OWNER).call('setupSystem').includes('zon masa skrip'));
});
test('tiada kebergantungan urutan fail (muat fail terbalik)', () => {
  const e = makeEnv({ reverse: true });
  e.setup(OWNER);
  assert.strictEqual(e.call('api_whoami').ok, true);
});
test('hanya fungsi yang dijangka boleh dipanggil dari browser', () => {
  const dibenarkan = ['doGet', 'setupSystem', 'setupOpr', 'checkAdmin', 'cariRekod', 'api_whoami', 'api_lihatRekod',
    'api_borangMeta', 'api_simpanRekod', 'api_dashboard', 'api_auditLog', 'api_importAnalisis', 'api_importSemak',
    'api_importLaksana', 'api_janaOpr'].sort();
  const awam = [];
  fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).forEach((f) => {
    const t = fs.readFileSync(path.join(SRC, f), 'utf8');
    (t.match(/^function\s+([A-Za-z0-9_$]+)/gm) || []).forEach((m) => {
      const n = m.replace(/^function\s+/, '');
      if (!n.endsWith('_')) awam.push(n);
    });
  });
  assert.deepStrictEqual(awam.sort(), dibenarkan);
});
test('semua fungsi api_* bermula dengan apiRun_ (semakan whitelist)', () => {
  const t = fs.readFileSync(path.join(SRC, 'Api.gs'), 'utf8');
  const fungsi = t.match(/^function\s+\w+\([^)]*\)\s*\{\n[^\n]*/gm);
  assert.ok(fungsi.length >= 11);
  fungsi.forEach((f) => assert.ok(/return apiRun_\(/.test(f), 'Tiada apiRun_: ' + f));
});

// =====================================================================
seksyen('Fasa 1: login, whitelist, akses ditolak');
// =====================================================================
test('admin dalam whitelist: masuk, log LOG_MASUK, paparan Index dengan nama dan emel', () => {
  const e = siap();
  const out = e.ctx.doGet ? require('vm').runInContext('doGet()', e.ctx) : null;
  assert.strictEqual(out.template.file, 'Index');
  assert.strictEqual(out.template.nama, 'Pemilik');
  assert.deepStrictEqual(tindakanAudit(e), ['LOG_MASUK']);
  assert.ok(out.html.includes('Pemilik') && out.html.includes(OWNER));
  assert.ok(!out.html.includes('<?'), 'scriptlet tidak diproses');
});
test('emel tidak sensitif huruf besar/kecil dan ruang kosong', () => {
  const e = siap('  Ahmad@Gmail.com ');
  tambahAdmin(e, ' ahmad@gmail.com', 'Ahmad', 'TRUE');
  assert.strictEqual(e.call('checkAdmin').ok, true);
});
test('bukan whitelist: paparan Denied, log AKSES_DITOLAK, tiada data bocor', () => {
  const e = siap('orang@gmail.com');
  const out = require('vm').runInContext('doGet()', e.ctx);
  assert.strictEqual(out.template.file, 'Denied');
  assert.ok(out.html.includes('orang@gmail.com'));
  assert.ok(!out.html.includes(OWNER));
  assert.deepStrictEqual(auditRows(e).map((r) => [r.tindakan, r.emel]), [['AKSES_DITOLAK', 'orang@gmail.com']]);
});
test('akses ditolak berulang dalam masa dekat dicatat sekali sahaja (elak banjir log)', () => {
  const e = siap('orang@gmail.com');
  for (let i = 0; i < 5; i++) e.call('api_whoami');
  assert.strictEqual(auditRows(e).length, 1);
});
test('admin aktif=FALSE ditolak, dan "sah" tidak boleh diubah kepada kenyataan palsu', () => {
  const e = siap('x@gmail.com');
  tambahAdmin(e, 'x@gmail.com', 'X', false);
  const r = e.call('checkAdmin');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.sebab, 'TIDAK_AKTIF');
});
test('emel tidak dikesan: ditolak, bukan jatuh ke emel pemilik', () => {
  const e = siap('');
  const r = e.call('checkAdmin');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.sebab, 'TIADA_EMEL');
  assert.strictEqual(require('vm').runInContext('doGet()', e.ctx).template.tiadaEmel, true);
});
test('sebelum setupSystem: doGet papar mesej tidak tersedia (tiada kebocoran)', () => {
  const e = makeEnv({ activeEmail: OWNER });
  assert.strictEqual(require('vm').runInContext('doGet()', e.ctx).template.file, 'Message');
});
test('semua API menolak bukan admin dan tidak menulis apa-apa selain log akses ditolak', () => {
  const e = siap();
  const r = simpan(e);
  assert.strictEqual(r.ok, true);
  e.asUser('penceroboh@gmail.com');
  const panggilan = [
    ['api_whoami'], ['cariRekod', 'ahmad'], ['api_lihatRekod', r.id], ['api_borangMeta'], ['api_simpanRekod', asas({ ic: '111111111111' })],
    ['api_dashboard', ''], ['api_auditLog', {}], ['api_importAnalisis', buatCsv([{}])], ['api_importSemak', buatCsv([{}]), null, {}, {}],
    ['api_importLaksana', buatCsv([{}]), null, {}, {}, 'x.csv'], ['api_janaOpr', r.id]
  ];
  panggilan.forEach((p) => {
    const hasil = e.call(...p);
    assert.strictEqual(hasil.ok, false, p[0]);
    assert.strictEqual(hasil.kod, 'TIADA_KEBENARAN', p[0]);
    assert.ok(!JSON.stringify(hasil).includes('Ahmad'), 'data bocor: ' + p[0]);
  });
  assert.strictEqual(e.rows('rekod_tatatertib').length, 1);
  assert.deepStrictEqual(tindakanAudit(e).filter((t) => t !== 'TAMBAH'), ['AKSES_DITOLAK']);
});
test('admin dinyahaktifkan semasa sesi: panggilan seterusnya ditolak', () => {
  const e = siap();
  tambahAdmin(e, 'b@gmail.com', 'B', true);
  e.asUser('b@gmail.com');
  assert.strictEqual(e.call('api_whoami').ok, true);
  e.sheet('admin_whitelist').getRange(3, 3).setValue(false);
  assert.strictEqual(e.call('api_whoami').kod, 'TIADA_KEBENARAN');
});
test('ralat dalaman tidak didedahkan kepada pelanggan', () => {
  const e = siap();
  e.state.ss.sheets.delete('rekod_tatatertib');
  const r = e.call('cariRekod', 'ahmad');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.kod, 'BELUM_DISEDIAKAN');
  assert.ok(!/at |Error:/.test(JSON.stringify(r)));
});
test('log audit: nilai bermula "=" dineutralkan', () => {
  const e = siap();
  e.run("logAudit_('owner@gmail.com','CARIAN','','=HYPERLINK(\"x\")')");
  const sel = e.sheet('audit_log').getRange(2, 5).getValue();
  assert.ok(!String(sel).startsWith('#FORMULA'), 'jadi formula');
  assert.ok(String(sel).includes('HYPERLINK'));
});

// =====================================================================
seksyen('Fasa 2: carian, tambah, kemas kini');
// =====================================================================
test('tambah rekod: 13 medan betul, id uuid, created_by, tarikh disimpan sebagai tarikh DD/MM/YYYY', () => {
  const e = siap();
  const r = simpan(e);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.baru, true);
  assert.match(r.id, /^[0-9a-f-]{36}$/);
  const row = e.rows('rekod_tatatertib')[0];
  const h = e.run('HEADERS.rekod_tatatertib');
  const v = (k) => row[h.indexOf(k)];
  assert.strictEqual(v('nama'), 'Ahmad bin Ali');
  assert.strictEqual(v('ic'), '900101145678');
  assert.strictEqual(v('tahun'), 2013);
  assert.strictEqual(v('created_by'), OWNER);
  assert.strictEqual(v('updated_at'), '');
  const tarikh = v('tarikh_kuatkuasa');
  assert.ok(tarikh instanceof Date);
  assert.strictEqual(new Intl.DateTimeFormat('en-GB', { timeZone: SS_TZ }).format(tarikh), '15/03/2013');
  assert.strictEqual(e.call('api_lihatRekod', r.id).rekod.tarikh_kuatkuasa, '15/03/2013');
  assert.deepStrictEqual(tindakanAudit(e), ['TAMBAH', 'LIHAT']);
});
test('IC dengan sifar di depan kekal 12 digit (tidak jadi nombor)', () => {
  const e = siap();
  const r = simpan(e, { ic: '050101145678' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(e.rows('rekod_tatatertib')[0][2], '050101145678');
  assert.strictEqual(e.call('cariRekod', '050101145678').hasil.length, 1);
});
test('IC dengan sengkang dinormalkan kepada 12 digit', () => {
  const e = siap();
  const r = simpan(e, { ic: '900101-14-5678' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.rekod.ic, '900101145678');
});
test('validasi: IC 11 digit, tarikh salah format, tarikh mustahil, tahun, wajib, negeri luar senarai', () => {
  const e = siap();
  let r = simpan(e, { ic: '90010114567' });
  assert.strictEqual(r.kod, 'VALIDASI');
  assert.strictEqual(r.ralat.ic, 'IC mesti 12 digit');
  r = simpan(e, { tarikh_kuatkuasa: '2013-03-15' });
  assert.strictEqual(r.ralat.tarikh_kuatkuasa, 'Tarikh mesti dalam format DD/MM/YYYY');
  r = simpan(e, { tarikh_kuatkuasa: '31/02/2013' });
  assert.strictEqual(r.ralat.tarikh_kuatkuasa, 'Tarikh tidak sah');
  r = simpan(e, { tahun: '201' });
  assert.strictEqual(r.ralat.tahun, 'Tahun mesti 4 digit');
  r = simpan(e, { tahun: '1800' });
  assert.ok(r.ralat.tahun.startsWith('Tahun mesti antara'));
  r = simpan(e, { negeri: 'Atlantis' });
  assert.ok(r.ralat.negeri.includes('tiada dalam senarai'));
  r = simpan(e, { nama: '', gred: '', ic: '' });
  assert.deepStrictEqual(Object.keys(r.ralat).sort(), ['gred', 'ic', 'nama']);
  assert.strictEqual(e.rows('rekod_tatatertib').length, 0);
});
test('tarikh 29 Feb: sah tahun lompat, tidak sah tahun biasa', () => {
  const e = siap();
  assert.strictEqual(simpan(e, { tarikh_kuatkuasa: '29/02/2016' }).ok, true);
  assert.strictEqual(simpan(e, { ic: '900101145679', tarikh_kuatkuasa: '29/02/2015' }).ralat.tarikh_kuatkuasa, 'Tarikh tidak sah');
});
test('medan pilihan sahaja (butiran_kes, rayuan) boleh kosong; status lalai Aktif', () => {
  const e = siap();
  const r = simpan(e, { butiran_kes: '', rayuan_tatatertib: '', status_semasa: '' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.rekod.status_semasa, 'Aktif');
});
test('IC duplikat ditolak semasa tambah, dengan rujukan rekod sedia ada', () => {
  const e = siap();
  const a = simpan(e);
  const r = simpan(e, { nama: 'Orang Lain' });
  assert.strictEqual(r.kod, 'VALIDASI');
  assert.ok(r.ralat.ic.includes('Ahmad bin Ali'));
  assert.strictEqual(r.duplikatId, a.id);
  assert.strictEqual(e.rows('rekod_tatatertib').length, 1);
});
test('kemas kini: medan berubah direkod, updated_at diisi, created kekal, nilai lain tidak terusik', () => {
  const e = siap();
  const a = simpan(e);
  const asal = e.call('api_lihatRekod', a.id).rekod;
  const r = e.call('api_simpanRekod', Object.assign({}, asas({ gred: 'N44', keputusan_tatatertib: 'Denda' }), { id: a.id, versi: asal.versi }));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.baru, false);
  const baru = e.call('api_lihatRekod', a.id).rekod;
  assert.strictEqual(baru.gred, 'N44');
  assert.strictEqual(baru.created_by, OWNER);
  assert.strictEqual(baru.created_at, asal.created_at);
  assert.ok(baru.updated_at !== '');
  assert.strictEqual(baru.nama, 'Ahmad bin Ali');
  assert.strictEqual(e.rows('rekod_tatatertib').length, 1);
  const log = auditRows(e).find((x) => x.tindakan === 'KEMAS_KINI');
  assert.strictEqual(log.butiran, 'Medan: gred, keputusan_tatatertib');
  assert.strictEqual(log.rekod, a.id);
});
test('kemas kini tanpa perubahan: tiada tulis dan tiada log', () => {
  const e = siap();
  const a = simpan(e);
  const asal = e.call('api_lihatRekod', a.id).rekod;
  const r = e.call('api_simpanRekod', Object.assign({}, asas(), { id: a.id, versi: asal.versi }));
  assert.strictEqual(r.tiadaUbah, true);
  assert.ok(!tindakanAudit(e).includes('KEMAS_KINI'));
});
test('kemas kini: boleh simpan IC sendiri, tetapi tidak boleh ambil IC rekod lain', () => {
  const e = siap();
  const a = simpan(e);
  const b = simpan(e, { nama: 'Siti', ic: '850505105050' });
  const va = e.call('api_lihatRekod', a.id).rekod.versi;
  const ok = e.call('api_simpanRekod', Object.assign({}, asas({ gred: 'N48' }), { id: a.id, versi: va }));
  assert.strictEqual(ok.ok, true);
  const va2 = e.call('api_lihatRekod', a.id).rekod.versi;
  const dup = e.call('api_simpanRekod', Object.assign({}, asas({ ic: '850505105050' }), { id: a.id, versi: va2 }));
  assert.strictEqual(dup.kod, 'VALIDASI');
  assert.strictEqual(dup.duplikatId, b.id);
});
test('konflik versi: dua admin edit rekod sama, yang kedua ditolak', () => {
  const e = siap();
  tambahAdmin(e, 'b@gmail.com', 'B', true);
  const a = simpan(e);
  const versiAsal = e.call('api_lihatRekod', a.id).rekod.versi;
  tunggu1ms();
  e.asUser('b@gmail.com');
  const b = e.call('api_simpanRekod', Object.assign({}, asas({ gred: 'N44' }), { id: a.id, versi: versiAsal }));
  assert.strictEqual(b.ok, true);
  e.asUser(OWNER);
  const r = e.call('api_simpanRekod', Object.assign({}, asas({ gred: 'N52' }), { id: a.id, versi: versiAsal }));
  assert.strictEqual(r.kod, 'KONFLIK');
  assert.strictEqual(e.call('api_lihatRekod', a.id).rekod.gred, 'N44');
});
test('id tidak wujud: TIADA_REKOD untuk lihat dan kemas kini', () => {
  const e = siap();
  assert.strictEqual(e.call('api_lihatRekod', 'tiada').kod, 'TIADA_REKOD');
  assert.strictEqual(e.call('api_simpanRekod', Object.assign(asas(), { id: 'tiada', versi: '' })).kod, 'TIADA_REKOD');
});
test('nama bermula "=" disimpan sebagai teks biasa, bukan formula', () => {
  const e = siap();
  const r = simpan(e, { nama: '=1+1', tpt_bertugas: '@SUM(A1)', rayuan_tatatertib: '-cmd' });
  assert.strictEqual(r.ok, true);
  const row = e.rows('rekod_tatatertib')[0];
  assert.strictEqual(row[1], '=1+1');
  assert.strictEqual(row[5], '@SUM(A1)');
  assert.strictEqual(e.call('api_lihatRekod', r.id).rekod.nama, '=1+1');
});
test('ejaan dropdown (belum disahkan) disatukan: "lewat masuk " guna ejaan sedia ada', () => {
  const e = siap();
  simpan(e, { salahlaku: 'Lewat Masuk' });
  const r = simpan(e, { ic: '850505105050', salahlaku: '  lewat   masuk ' });
  assert.strictEqual(r.rekod.salahlaku, 'Lewat Masuk');
  const meta = e.call('api_borangMeta');
  assert.deepStrictEqual(meta.pilihan.salahlaku.senarai, ['Lewat Masuk']);
  assert.strictEqual(meta.pilihan.negeri.disahkan, true);
  assert.strictEqual(meta.pilihan.negeri.senarai.length, 16);
  assert.strictEqual(meta.medan.length, 13);
});
test('negeri strict: huruf kecil diterima dan dikanonkan', () => {
  const e = siap();
  const r = simpan(e, { negeri: 'selangor' });
  assert.strictEqual(r.rekod.negeri, 'Selangor');
});
test('baris yang ditaip terus dalam Sheet (tanpa id) diberi id dan boleh dicari', () => {
  const e = siap();
  const s = e.sheet('rekod_tatatertib');
  s.getRange(2, 2).setValue('Pegawai Manual');
  s.getRange(2, 3).setValue('770707075555');
  const hasil = e.call('cariRekod', 'manual');
  assert.strictEqual(hasil.jumlah, 1);
  assert.match(hasil.hasil[0].id, /^[0-9a-f-]{36}$/);
  assert.strictEqual(s.getRange(2, 1).getValue(), hasil.hasil[0].id);
  assert.strictEqual(e.call('api_lihatRekod', hasil.hasil[0].id).ok, true);
});
test('sistem sibuk (kunci tidak dapat diperoleh): mesej mesra, tiada penulisan, kunci tidak bocor', () => {
  const e = siap();
  e.state.lockHeld = true;   // admin lain sedang menulis
  const r = simpan(e);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.kod, 'SIBUK');
  assert.ok(r.mesej.includes('admin lain'));
  assert.strictEqual(e.rows('rekod_tatatertib').length, 0);
  e.state.lockHeld = false;
  assert.strictEqual(simpan(e).ok, true);
});
test('kunci dilepaskan dan tidak disarang selepas tambah/kemas kini/import', () => {
  const e = siap();
  const a = simpan(e);
  const v = e.call('api_lihatRekod', a.id).rekod.versi;
  e.call('api_simpanRekod', Object.assign(asas({ gred: 'N1' }), { id: a.id, versi: v }));
  e.call('api_importLaksana', buatCsv([{ ic: '111111111111' }]), null, {}, {}, 'a.csv');
  assert.strictEqual(e.state.lockHeld, false);
  assert.ok(e.state.lockCalls >= 3);
});

test('carian: nama (sebahagian, tidak sensitif huruf), IC penuh, IC separa, IC bersengkang, gabungan nama+IC', () => {
  const e = siap();
  simpan(e);
  simpan(e, { nama: 'Siti binti Omar', ic: '850505105050' });
  simpan(e, { nama: 'Ali bin Ahmad', ic: '700707075678' });
  assert.deepStrictEqual(e.call('cariRekod', 'AHMAD').hasil.map((x) => x.nama), ['Ahmad bin Ali', 'Ali bin Ahmad']);
  assert.strictEqual(e.call('cariRekod', 'siti omar').jumlah, 1);
  assert.strictEqual(e.call('cariRekod', '850505105050').hasil[0].nama, 'Siti binti Omar');
  assert.strictEqual(e.call('cariRekod', '5678').jumlah, 2);
  assert.strictEqual(e.call('cariRekod', '850505-10-5050').jumlah, 1);
  assert.strictEqual(e.call('cariRekod', 'ahmad 5678').jumlah, 2);
  assert.strictEqual(e.call('cariRekod', 'ali 900101').jumlah, 1);
  assert.strictEqual(e.call('cariRekod', 'tiada siapa').jumlah, 0);
});
test('carian: nama bermula dengan kata carian didahulukan; IC tepat didahulukan', () => {
  const e = siap();
  simpan(e, { nama: 'Zainal Ahmad', ic: '600101015555' });
  simpan(e, { nama: 'Ahmad Zaki', ic: '610101015555' });
  assert.deepStrictEqual(e.call('cariRekod', 'ahmad').hasil.map((x) => x.nama), ['Ahmad Zaki', 'Zainal Ahmad']);
});
test('carian: terlalu pendek ditolak; digit sahaja kurang 2 ditolak; terlalu panjang ditolak', () => {
  const e = siap();
  assert.strictEqual(e.call('cariRekod', 'a').kod, 'VALIDASI');
  assert.strictEqual(e.call('cariRekod', ' - ').kod, 'VALIDASI');
  assert.strictEqual(e.call('cariRekod', 'x'.repeat(101)).kod, 'VALIDASI');
  assert.strictEqual(tindakanAudit(e).length, 0);
});
test('carian: setiap carian direkod dengan kata kunci dan bilangan hasil', () => {
  const e = siap();
  simpan(e);
  e.call('cariRekod', 'ahmad');
  e.call('cariRekod', 'zzz');
  const log = auditRows(e).filter((x) => x.tindakan === 'CARIAN').map((x) => x.butiran);
  assert.deepStrictEqual(log, ['ahmad (1 hasil)', 'zzz (0 hasil)']);
});
test('carian: Sheet kosong -> kosong=true; kata carian "=cmd" tidak jadi formula dalam log', () => {
  const e = siap();
  const r = e.call('cariRekod', '=cmd|x');
  assert.strictEqual(r.kosong, true);
  assert.strictEqual(r.jumlah, 0);
  assert.ok(!String(e.sheet('audit_log').getRange(2, 5).getValue()).startsWith('#FORMULA'));
});
test('carian: hasil tidak mengandungi butiran_kes; profil penuh ada butiran_kes', () => {
  const e = siap();
  const a = simpan(e);
  const hasil = e.call('cariRekod', 'ahmad').hasil[0];
  assert.ok(!('butiran_kes' in hasil));
  assert.strictEqual(e.call('api_lihatRekod', a.id).rekod.butiran_kes, 'Lewat 10 kali dalam sebulan');
});
// Kod 5 huruf daripada abjad yang tiada dalam perkataan "pegawai", supaya nama unik dan carian tepat.
const kodHuruf = (i) => { const a = 'qxzjk'; let s = ''; for (let n = 0; n < 5; n++) { s += a[i % 5]; i = Math.floor(i / 5); } return s; };
test('F-02: 1,000 rekod uji, setiap IC dan nama memulangkan rekod yang betul dalam masa singkat', () => {
  const e = siap();
  const baris = [];
  for (let i = 0; i < 1000; i++) {
    const ic = String(900000000000 + i * 7919).padStart(12, '0');
    baris.push({ nama: 'Pegawai ' + kodHuruf(i), ic: ic, tahun: String(2013 + (i % 12)) });
  }
  const imp = e.call('api_importLaksana', buatCsv(baris), null, {}, {}, 'uji.csv');
  assert.strictEqual(imp.ok, true, JSON.stringify(imp).slice(0, 300));
  assert.strictEqual(imp.ditambah, 1000);
  const mula = Date.now();
  for (let i = 0; i < 1000; i += 37) {
    const r = e.call('cariRekod', baris[i].ic);
    assert.strictEqual(r.hasil[0].nama, baris[i].nama);
    assert.strictEqual(r.hasil[0].ic, baris[i].ic);
    const n = e.call('cariRekod', baris[i].nama);
    assert.strictEqual(n.jumlah, 1);
  }
  assert.ok(Date.now() - mula < 5000, 'terlalu perlahan: ' + (Date.now() - mula));
  const semua = e.call('cariRekod', 'pegawai');
  assert.strictEqual(semua.terhad, true);
  assert.strictEqual(semua.hasil.length, 500);
  assert.strictEqual(semua.jumlah, 1000);
});

// =====================================================================
seksyen('Fasa 3: import data sedia ada');
// =====================================================================
test('parser CSV: petik, koma dan baris baharu dalam petik, CRLF, BOM, baris kosong', () => {
  const e = siap();
  const csv = '﻿a,b,c\r\n1,"x, y","baris1\nbaris2"\r\n\r\n"say ""hi""",2,3\r\n';
  const p = e.run('parseCsv_(' + JSON.stringify(csv) + ')');
  assert.deepStrictEqual(p.baris, [['a', 'b', 'c'], ['1', 'x, y', 'baris1\nbaris2'], [''], ['say "hi"', '2', '3']]);
});
test('parser CSV: pemisah koma-bertitik dan tab dikesan', () => {
  const e = siap();
  assert.strictEqual(e.run("parseCsv_('a;b;c\\n1;2;3').pemisah"), ';');
  assert.strictEqual(e.run("parseCsv_('a\\tb\\tc\\n1\\t2\\t3').pemisah"), '\t');
  assert.deepStrictEqual(e.run("parseCsv_('a;b;c\\n1;2;3').baris[1]"), ['1', '2', '3']);
});
test('analisis: cadangan pemetaan automatik untuk nama lajur lama', () => {
  const e = siap();
  const r = e.call('api_importAnalisis', buatCsv([{}, {}]));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.jumlahBaris, 2);
  assert.strictEqual(r.pengepala.length, 13);
  const c = r.cadangan;
  assert.deepStrictEqual([c.nama, c.ic, c.gred, c.skim, c.tpt_bertugas, c.negeri, c.salahlaku, c.butiran_kes, c.tahun, c.keputusan_tatatertib, c.tarikh_kuatkuasa, c.rayuan_tatatertib, c.status_semasa],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});
test('semak: tiada tulis, jumlah baris = sah + ralat + duplikat, format tarikh ditukar', () => {
  const e = siap();
  simpan(e, { ic: '111111111111' });
  const baris = [
    { nama: 'A', ic: '100000000001', tarikh: '5/3/2013' },
    { nama: 'B', ic: '100000000002', tarikh: '2013-04-09' },
    { nama: 'C', ic: '100000000003', tarikh: '07-08-2013' },
    { nama: 'D', ic: '1000000004', tarikh: '01/01/2013' },
    { nama: 'E', ic: '100000000001', tarikh: '01/01/2013' },
    { nama: 'F', ic: '111111111111', tarikh: '01/01/2013' },
    { nama: 'G', ic: '100000000007', tarikh: '31/02/2013' },
    { nama: 'H', ic: '100000000008', negeri: 'Atlantis' }
  ];
  const sebelum = e.rows('rekod_tatatertib').length;
  const r = e.call('api_importSemak', buatCsv(baris), null, {}, {});
  assert.strictEqual(r.ok, true);
  const l = r.laporan;
  assert.strictEqual(l.jumlahBaris, 8);
  assert.strictEqual(l.sah, 3);
  assert.strictEqual(l.jumlahRalat, 3);
  assert.strictEqual(l.bilDuplikatFail, 1);
  assert.strictEqual(l.bilDuplikatSedia, 1);
  assert.strictEqual(l.sah + l.jumlahRalat + l.bilDuplikatFail + l.bilDuplikatSedia, l.jumlahBaris);
  assert.deepStrictEqual(l.ralat.map((x) => x.baris), [5, 8, 9]);
  assert.ok(l.ralat[0].mesej.includes('IC mesti 12 digit'));
  assert.ok(l.ralat[1].mesej.includes('Tarikh tidak sah'));
  assert.ok(l.ralat[2].mesej.includes('tiada dalam senarai negeri'));
  assert.strictEqual(l.duplikatFail[0].baris, 6);
  assert.strictEqual(l.duplikatFail[0].barisAsal, 2);
  assert.strictEqual(l.duplikatSedia[0].namaSedia, 'Ahmad bin Ali');
  assert.deepStrictEqual(l.contohTarikh.map((x) => [x.asal, x.hasil]), [['5/3/2013', '05/03/2013'], ['2013-04-09', '09/04/2013'], ['07-08-2013', '07/08/2013']]);
  assert.strictEqual(e.rows('rekod_tatatertib').length, sebelum);
  assert.ok(!tindakanAudit(e).includes('TAMBAH') || tindakanAudit(e).filter((t) => t === 'TAMBAH').length === 1);
});
test('semak: amaran format bulan/hari terbalik dan IC 11 digit', () => {
  const e = siap();
  const r = e.call('api_importSemak', buatCsv([{ ic: '10000000001', tarikh: '03/25/2013' }, { ic: '100000000002', tarikh: '12/31/2013' }]), null, {}, {});
  assert.ok(r.laporan.amaran.some((a) => a.includes('MM/DD/YYYY')));
  assert.ok(r.laporan.amaran.some((a) => a.includes('11 digit')));
});
test('laksana: baris ditulis, jumlah sebelum/selepas sepadan, IC sifar di depan kekal, audit TAMBAH IMPORT', () => {
  const e = siap();
  simpan(e, { ic: '111111111111' });
  const baris = [
    { nama: 'A', ic: '050505050505', tarikh: '5/3/2013' },
    { nama: 'B', ic: '100000000002', salah: 'Lewat masuk' },
    { nama: 'Duplikat', ic: '111111111111' },
    { nama: 'Salah', ic: '123' }
  ];
  const r = e.call('api_importLaksana', buatCsv(baris), null, {}, {}, 'data2013.csv');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.sebelum, 1);
  assert.strictEqual(r.selepas, 3);
  assert.strictEqual(r.ditambah, 2);
  assert.strictEqual(r.sepadan, true);
  const rows = e.rows('rekod_tatatertib');
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(rows[1][2], '050505050505');
  assert.strictEqual(e.call('api_lihatRekod', rows[1][0]).rekod.tarikh_kuatkuasa, '05/03/2013');
  assert.strictEqual(e.call('api_lihatRekod', rows[1][0]).rekod.created_by, OWNER);
  const log = auditRows(e).find((x) => x.butiran && x.butiran.startsWith('IMPORT'));
  assert.strictEqual(log.tindakan, 'TAMBAH');
  assert.strictEqual(log.butiran, 'IMPORT: 2 rekod ditambah; 1 duplikat dilangkau; 1 ralat; fail: data2013.csv');
});
test('laksana kali kedua dengan fail sama: tiada baris ditambah, semua duplikat dilaporkan', () => {
  const e = siap();
  const csv = buatCsv([{ ic: '100000000001' }, { ic: '100000000002' }]);
  assert.strictEqual(e.call('api_importLaksana', csv, null, {}, {}, 'a.csv').ok, true);
  const r = e.call('api_importLaksana', csv, null, {}, {}, 'a.csv');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.kod, 'TIADA_BARIS');
  assert.strictEqual(r.laporan.bilDuplikatSedia, 2);
  assert.strictEqual(e.rows('rekod_tatatertib').length, 2);
});
test('standardisasi nilai: ejaan beza huruf/ruang disatukan automatik dan alias menggabungkan variasi', () => {
  const e = siap();
  const baris = [
    { ic: '100000000001', salah: 'Lewat masuk' }, { ic: '100000000002', salah: 'lewat masuk' },
    { ic: '100000000003', salah: 'LEWAT  MASUK' }, { ic: '100000000004', salah: 'lewat' },
    { ic: '100000000005', salah: 'Lewat' }, { ic: '100000000006', salah: 'Ponteng' }
  ];
  const semak = e.call('api_importSemak', buatCsv(baris), null, {}, {});
  const v = semak.laporan.nilaiVarian.salahlaku;
  assert.deepStrictEqual(v.map((x) => [x.kunci, x.kiraan]), [['lewat masuk', 3], ['lewat', 2], ['ponteng', 1]]);
  // Standardkan "lewat" kepada "Lewat masuk" melalui alias.
  const alias = { salahlaku: { lewat: 'Lewat masuk' } };
  const r = e.call('api_importLaksana', buatCsv(baris), null, alias, {}, 'x.csv');
  assert.strictEqual(r.ok, true);
  const nilai = e.rows('rekod_tatatertib').map((row) => row[7]);
  assert.deepStrictEqual(nilai.sort(), ['Lewat masuk', 'Lewat masuk', 'Lewat masuk', 'Lewat masuk', 'Lewat masuk', 'Ponteng']);
});
test('senarai strict (negeri): nilai tidak sepadan ditolak sehingga dipetakan melalui alias', () => {
  const e = siap();
  const baris = [{ ic: '100000000001', negeri: 'SELANGOR' }, { ic: '100000000002', negeri: 'W.P.K.L' }, { ic: '100000000003', negeri: 'W.P.K.L' }];
  const semak = e.call('api_importSemak', buatCsv(baris), null, {}, {});
  assert.strictEqual(semak.laporan.sah, 1);
  const v = semak.laporan.nilaiVarian.negeri;
  const wpkl = v.find((x) => x.kunci === 'w.p.k.l');
  assert.strictEqual(wpkl.padan, false);
  assert.strictEqual(wpkl.kiraan, 2);
  assert.strictEqual(v.find((x) => x.kunci === 'selangor').padan, true);
  const semak2 = e.call('api_importSemak', buatCsv(baris), null, { negeri: { 'w.p.k.l': 'W.P. Kuala Lumpur' } }, {});
  assert.strictEqual(semak2.laporan.sah, 3);
  assert.strictEqual(semak2.laporan.nilaiVarian.negeri.find((x) => x.kunci === 'w.p.k.l').padan, true);
});
test('pemetaan manual menimpa cadangan; pemetaan dua medan kepada satu lajur ditolak; nama/IC wajib dipetakan', () => {
  const e = siap();
  const csv = 'col1,col2,col3\nAli,100000000001,N41';
  assert.strictEqual(e.call('api_importSemak', csv, { nama: 0, ic: 1, gred: 1 }, {}, {}).kod, 'PETA');
  assert.strictEqual(e.call('api_importSemak', csv, { gred: 2 }, {}, {}).kod, 'PETA');
  const r = e.call('api_importSemak', csv, { nama: 0, ic: 1, gred: 2 }, {}, { benarkanKosong: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.laporan.sah, 1);
});
test('medan wajib kosong: ditolak secara lalai, diterima dengan benarkanKosong (nama dan IC tetap wajib)', () => {
  const e = siap();
  const csv = 'nama,ic,gred\nAli,100000000001,\n,100000000002,N41';
  const ketat = e.call('api_importSemak', csv, null, {}, {});
  assert.strictEqual(ketat.laporan.sah, 0);
  const longgar = e.call('api_importSemak', csv, null, {}, { benarkanKosong: true });
  assert.strictEqual(longgar.laporan.sah, 1);
  assert.strictEqual(longgar.laporan.jumlahRalat, 1);
  assert.ok(longgar.laporan.amaran.some((a) => a.includes('tidak dipetakan')));
  const r = e.call('api_importLaksana', csv, null, {}, { benarkanKosong: true }, 'p.csv');
  assert.strictEqual(r.ditambah, 1);
  assert.strictEqual(e.rows('rekod_tatatertib')[0][3], '');
});
test('padIc menambah sifar pada IC 11 digit; tahun "2013.0" dibetulkan', () => {
  const e = siap();
  const csv = buatCsv([{ ic: '50101145678', tahun: '2013.0' }]);
  assert.strictEqual(e.call('api_importSemak', csv, null, {}, {}).laporan.sah, 0);
  const r = e.call('api_importSemak', csv, null, {}, { padIc: true });
  assert.strictEqual(r.laporan.sah, 1);
  e.call('api_importLaksana', csv, null, {}, { padIc: true }, 'a.csv');
  assert.strictEqual(e.rows('rekod_tatatertib')[0][2], '050101145678');
  assert.strictEqual(e.rows('rekod_tatatertib')[0][9], 2013);
});
test('import: sekatan EMEL_IMPORT, fail kosong dan terlalu besar ditolak', () => {
  const e = siap();
  tambahAdmin(e, 'b@gmail.com', 'B', true);
  e.sheet('config').getRange(5, 2).setValue('b@gmail.com');
  assert.strictEqual(e.call('api_whoami').bolehImport, false);
  assert.strictEqual(e.call('api_importAnalisis', buatCsv([{}])).kod, 'DILARANG');
  assert.strictEqual(e.call('api_importLaksana', buatCsv([{}]), null, {}, {}, 'a').kod, 'DILARANG');
  e.asUser('b@gmail.com');
  assert.strictEqual(e.call('api_whoami').bolehImport, true);
  assert.strictEqual(e.call('api_importAnalisis', '').kod, 'CSV_KOSONG');
  assert.strictEqual(e.call('api_importAnalisis', 'x'.repeat(5000001)).kod, 'CSV_BESAR');
  assert.strictEqual(e.call('api_importAnalisis', buatCsv([{}])).ok, true);
});
test('import 650 rekod (saiz sebenar): semua masuk, kiraan sepadan', () => {
  const e = siap();
  const baris = [];
  for (let i = 0; i < 650; i++) baris.push({ nama: 'P' + i, ic: String(800000000000 + i).padStart(12, '0'), salah: ['Lewat', 'Ponteng', 'Rasuah'][i % 3], negeri: ['Selangor', 'Johor', 'Perak'][i % 3] });
  const r = e.call('api_importLaksana', buatCsv(baris), null, {}, {}, 'bulk.csv');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.selepas, 650);
  assert.strictEqual(r.sepadan, true);
  assert.strictEqual(e.call('api_whoami').jumlahRekod, 650);
});
test('nama fail dalam log import dibersihkan (aksara kawalan dibuang, dipotong 100)', () => {
  const e = siap();
  e.call('api_importLaksana', buatCsv([{}]), null, {}, {}, 'a\nb\u0000' + 'x'.repeat(200));
  const b = auditRows(e).find((x) => x.butiran && x.butiran.startsWith('IMPORT')).butiran;
  assert.ok(!/[\u0000-\u001f]/.test(b));
  assert.ok(b.length < 200);
});

// =====================================================================
seksyen('Fasa 4: dashboard');
// =====================================================================
function isiData(e) {
  const baris = [
    { ic: '100000000001', negeri: 'Selangor', gred: 'N41', salah: 'Lewat', hukuman: 'Amaran', tahun: '2013' },
    { ic: '100000000002', negeri: 'Selangor', gred: 'N41', salah: 'lewat', hukuman: 'Amaran', tahun: '2013' },
    { ic: '100000000003', negeri: 'Johor', gred: 'N44', salah: 'Ponteng', hukuman: 'Denda', tahun: '2014' },
    { ic: '100000000004', negeri: 'Perak', gred: 'N41', salah: 'Rasuah', hukuman: 'Buang kerja', tahun: '2014' },
    { ic: '100000000005', negeri: 'Johor', gred: 'N44', salah: 'Lewat', hukuman: 'Amaran', tahun: '2015' }
  ];
  const r = e.call('api_importLaksana', buatCsv(baris), null, {}, {}, 'd.csv');
  assert.strictEqual(r.ok, true);
  return baris;
}
test('jumlah setiap carta sama dengan bilangan baris dalam Sheet (semua tahun)', () => {
  const e = siap();
  isiData(e);
  const d = e.call('api_dashboard', '');
  assert.strictEqual(d.jumlah, 5);
  assert.strictEqual(d.jumlahSemua, 5);
  d.carta.forEach((c) => assert.strictEqual(c.data.reduce((a, x) => a + x.kiraan, 0), 5, c.kunci));
  assert.deepStrictEqual(d.senaraiTahun, ['2015', '2014', '2013']);
  assert.deepStrictEqual(d.carta.find((c) => c.kunci === 'negeri').data, [{ label: 'Johor', kiraan: 2 }, { label: 'Selangor', kiraan: 2 }, { label: 'Perak', kiraan: 1 }]);
  assert.deepStrictEqual(d.carta.find((c) => c.kunci === 'salahlaku').data.map((x) => [x.label, x.kiraan]), [['Lewat', 3], ['Ponteng', 1], ['Rasuah', 1]]);
});
test('filter tahun: carta dan jumlah ikut tahun terpilih', () => {
  const e = siap();
  isiData(e);
  const d = e.call('api_dashboard', '2014');
  assert.strictEqual(d.jumlah, 2);
  d.carta.forEach((c) => assert.strictEqual(c.data.reduce((a, x) => a + x.kiraan, 0), 2));
  assert.deepStrictEqual(d.carta.find((c) => c.kunci === 'keputusan_tatatertib').data.map((x) => x.label).sort(), ['Buang kerja', 'Denda']);
  assert.strictEqual(e.call('api_dashboard', '1999').jumlah, 0);
  assert.strictEqual(e.call('api_dashboard', 'abc').kod, 'VALIDASI');
});
test('nilai kosong dikira "(Tiada data)" supaya jumlah tetap sama', () => {
  const e = siap();
  e.call('api_importLaksana', 'nama,ic,gred\nA,100000000001,\nB,100000000002,N41', null, {}, { benarkanKosong: true }, 'a.csv');
  const d = e.call('api_dashboard', '');
  const gred = d.carta.find((c) => c.kunci === 'gred').data;
  assert.deepStrictEqual(gred.map((x) => [x.label, x.kiraan]).sort(), [['(Tiada data)', 1], ['N41', 1]]);
  assert.strictEqual(d.carta.find((c) => c.kunci === 'negeri').data[0].label, '(Tiada data)');
});
test('Sheet kosong: dashboard pulang jumlah 0 dan carta kosong', () => {
  const e = siap();
  const d = e.call('api_dashboard', '');
  assert.strictEqual(d.jumlah, 0);
  assert.deepStrictEqual(d.carta.map((c) => c.data.length), [0, 0, 0, 0]);
});
test('dashboard hanya angka: tiada nama atau IC dalam respons', () => {
  const e = siap();
  isiData(e);
  const t = JSON.stringify(e.call('api_dashboard', ''));
  assert.ok(!t.includes('Siti') && !/\d{12}/.test(t));
});

// =====================================================================
seksyen('Fasa 5: cetak OPR');
// =====================================================================
function siapOpr() {
  const e = siap();
  e.asUser(OWNER);
  e.call('setupOpr');
  return e;
}
const cfg = (e, k) => e.rows('config').find((r) => r[0] === k)[1];
test('setupOpr: cipta folder OPR dan template, simpan ID dalam config, idempotent', () => {
  const e = siapOpr();
  const folderId = cfg(e, 'FOLDER_PDF_ID');
  const templateId = cfg(e, 'TEMPLATE_OPR_ID');
  assert.ok(folderId && templateId);
  const folder = e.state.drive.items.get(folderId);
  assert.strictEqual(folder.name, 'OPR');
  assert.strictEqual(folder.parent.name, 'RuzTatatertib');
  const doc = e.state.drive.items.get(templateId);
  assert.strictEqual(doc.parent.name, 'RuzTatatertib');
  const teks = doc.doc.children.map((c) => (c.type === 'p' ? c.text : c.rows.map((r) => r.map((x) => x.text).join('|')).join('\n'))).join('\n');
  ['{{nama}}', '{{ic}}', '{{gred}}', '{{skim}}', '{{tpt_bertugas}}', '{{negeri}}', '{{salahlaku}}', '{{tahun}}',
    '{{keputusan_tatatertib}}', '{{tarikh_kuatkuasa}}', '{{rayuan_tatatertib}}', '{{status_semasa}}', '{{tarikh_cetak}}']
    .forEach((p) => assert.ok(teks.includes(p), 'tiada ' + p));
  assert.ok(!teks.includes('{{butiran_kes}}'));
  e.call('setupOpr');
  assert.strictEqual(cfg(e, 'FOLDER_PDF_ID'), folderId);
  assert.strictEqual(cfg(e, 'TEMPLATE_OPR_ID'), templateId);
  assert.strictEqual(Array.from(e.state.drive.items.values()).filter((x) => x.name === 'OPR').length, 1);
});
test('janaOpr: PDF mengandungi maklumat asas, TANPA butiran kes, ruang tandatangan kosong, nama fail betul', () => {
  const e = siapOpr();
  const r0 = simpan(e);
  const r = e.call('api_janaOpr', r0.rekod.id);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.namaFail, 'OPR_900101145678_' + yyyymmdd(hariIni()) + '.pdf');
  const pdf = Buffer.from(r.pdfBase64, 'base64').toString('utf8');
  assert.ok(pdf.startsWith('%PDF'));
  ['Ahmad bin Ali', '900101145678', 'N41', 'Pegawai Tadbir', 'Pejabat Daerah X', 'Selangor', 'Lewat masuk', '2013', 'Amaran', '15/03/2013', 'Tiada', 'Aktif']
    .forEach((x) => assert.ok(pdf.includes(x), 'PDF tiada: ' + x));
  assert.ok(!pdf.includes('Lewat 10 kali'), 'butiran kes bocor ke OPR');
  assert.ok(!pdf.includes('{{'), 'tempat letak tidak diganti');
  assert.ok(pdf.includes('Tandatangan pegawai pengesah | Cop rasmi jabatan'));
  assert.ok(/Tarikh cetak: \d{2}\/\d{2}\/\d{4}/.test(pdf));
  const tersimpan = Array.from(e.state.drive.items.values()).filter((x) => x.name === r.namaFail && !x.trashed);
  assert.strictEqual(tersimpan.length, 1);
  assert.strictEqual(tersimpan[0].parent.id, cfg(e, 'FOLDER_PDF_ID'));
  assert.ok(Array.from(e.state.drive.items.values()).filter((x) => x.name.startsWith('TEMP_')).every((x) => x.trashed));
  const log = auditRows(e).find((x) => x.tindakan === 'CETAK_OPR');
  assert.strictEqual(log.rekod, r0.rekod.id);
  assert.strictEqual(log.butiran, 'Fail: ' + r.namaFail);
});
test('janaOpr: dokumen salinan belum boleh dibuka serta-merta: cuba semula dan berjaya; jika terus gagal, mesej mesra', () => {
  const e = siapOpr();
  const a = simpan(e);
  e.state.gagalBuka = 2;
  assert.strictEqual(e.call('api_janaOpr', a.id).ok, true);
  assert.strictEqual(e.state.tidur, 2);
  e.state.gagalBuka = 5;
  assert.strictEqual(e.call('api_janaOpr', a.id).kod, 'OPR_GAGAL');
  assert.ok(Array.from(e.state.drive.items.values()).filter((x) => x.name.startsWith('TEMP_')).every((x) => x.trashed));
});
test('janaOpr: butiran_kes tidak masuk walaupun template pengguna ada {{butiran_kes}}', () => {
  const e = siapOpr();
  const t = e.state.drive.items.get(cfg(e, 'TEMPLATE_OPR_ID'));
  t.doc.children.push({ type: 'p', text: 'Catatan: {{butiran_kes}}' });
  const r0 = simpan(e);
  const pdf = Buffer.from(e.call('api_janaOpr', r0.id).pdfBase64, 'base64').toString('utf8');
  assert.ok(pdf.includes('Catatan: '));
  assert.ok(!pdf.includes('Lewat 10 kali'));
});
test('janaOpr: jana kali kedua pada hari sama tidak menimpa fail (akhiran _2)', () => {
  const e = siapOpr();
  const a = simpan(e);
  const r1 = e.call('api_janaOpr', a.id);
  const r2 = e.call('api_janaOpr', a.id);
  assert.ok(r2.namaFail.endsWith('_2.pdf'));
  assert.notStrictEqual(r1.namaFail, r2.namaFail);
  assert.strictEqual(tindakanAudit(e).filter((t) => t === 'CETAK_OPR').length, 2);
});
test('janaOpr: nama mengandungi $ dan \\ dikekalkan literal', () => {
  const e = siapOpr();
  const a = simpan(e, { nama: 'Ali $1 \\ Abu $&' });
  const pdf = Buffer.from(e.call('api_janaOpr', a.id).pdfBase64, 'base64').toString('utf8');
  assert.ok(pdf.includes('Ali $1 \\ Abu $&'), pdf);
});
test('janaOpr: medan kosong dipaparkan "-"', () => {
  const e = siapOpr();
  const a = simpan(e, { rayuan_tatatertib: '' });
  const pdf = Buffer.from(e.call('api_janaOpr', a.id).pdfBase64, 'base64').toString('utf8');
  assert.ok(/Rayuan \| -/.test(pdf));
});
test('janaOpr: template belum disediakan, rekod tiada, folder tidak boleh diakses', () => {
  const e = siap();
  const a = simpan(e);
  assert.strictEqual(e.call('api_janaOpr', a.id).kod, 'OPR_BELUM_SEDIA');
  e.call('setupOpr');
  assert.strictEqual(e.call('api_janaOpr', 'tiada').kod, 'TIADA_REKOD');
  e.sheet('config').getRange(3, 2).setValue('ID_SALAH');
  assert.strictEqual(e.call('api_janaOpr', a.id).kod, 'OPR_AKSES');
  assert.ok(!tindakanAudit(e).includes('CETAK_OPR'));
});
test('janaOpr: jika penukaran PDF gagal, salinan sementara dibuang, tiada log cetakan, mesej mesra', () => {
  const e = siapOpr();
  const a = simpan(e);
  e.state.drive.failPdf = true;
  const r = e.call('api_janaOpr', a.id);
  assert.strictEqual(r.kod, 'OPR_GAGAL');
  assert.ok(Array.from(e.state.drive.items.values()).filter((x) => x.name.startsWith('TEMP_')).every((x) => x.trashed));
  assert.ok(!tindakanAudit(e).includes('CETAK_OPR'));
  assert.ok(!JSON.stringify(r).includes('Service invoked'));
});
test('template rasmi klien: ID sedia ada dalam config dikekalkan oleh setupOpr', () => {
  const e = siap();
  const doc = require('vm').runInContext('DocumentApp.create("Template klien")', e.ctx);
  e.asUser(OWNER);
  e.sheet('config').getRange(2, 2).setValue(e.state.drive.items.size ? Array.from(e.state.drive.items.values()).find((x) => x.name === 'Template klien').id : '');
  const id = cfg(e, 'TEMPLATE_OPR_ID');
  e.call('setupOpr');
  assert.strictEqual(cfg(e, 'TEMPLATE_OPR_ID'), id);
});

// =====================================================================
seksyen('Fasa 6: audit log');
// =====================================================================
test('lima tindakan menghasilkan lima baris audit (carian, lihat, tambah, kemas kini, cetak)', () => {
  const e = siapOpr();
  const sebelum = e.rows('audit_log').length;
  const a = simpan(e);                                           // TAMBAH
  e.call('cariRekod', 'ahmad');                                  // CARIAN
  const l = e.call('api_lihatRekod', a.id);                      // LIHAT
  e.call('api_simpanRekod', Object.assign(asas({ gred: 'N52' }), { id: a.id, versi: l.rekod.versi })); // KEMAS_KINI
  e.call('api_janaOpr', a.id);                                   // CETAK_OPR
  assert.deepStrictEqual(tindakanAudit(e).slice(sebelum), ['TAMBAH', 'CARIAN', 'LIHAT', 'KEMAS_KINI', 'CETAK_OPR']);
  assert.ok(auditRows(e).every((r) => r.emel === OWNER));
});
test('paparan audit: terbaru dahulu, 25 setiap halaman, jumlah halaman betul', () => {
  const e = siap();
  for (let i = 0; i < 60; i++) e.call('cariRekod', 'kata' + String(i).padStart(2, '0'));
  const p1 = e.call('api_auditLog', {});
  assert.strictEqual(p1.jumlah, 60);
  assert.strictEqual(p1.jumlahHalaman, 3);
  assert.strictEqual(p1.baris.length, 25);
  assert.strictEqual(p1.baris[0].butiran, 'kata59 (0 hasil)');
  const p3 = e.call('api_auditLog', { halaman: 3 });
  assert.strictEqual(p3.baris.length, 10);
  assert.strictEqual(p3.baris[9].butiran, 'kata00 (0 hasil)');
  assert.strictEqual(e.call('api_auditLog', { halaman: 99 }).halaman, 3);
  assert.match(p1.baris[0].masa, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
});
test('tapis audit: tindakan, emel, kata kunci, tarikh', () => {
  const e = siap();
  tambahAdmin(e, 'b@gmail.com', 'B', true);
  const a = simpan(e);
  e.call('cariRekod', 'ahmad');
  e.asUser('b@gmail.com');
  e.call('api_lihatRekod', a.id);
  e.call('cariRekod', 'siti');
  assert.strictEqual(e.call('api_auditLog', { tindakan: 'CARIAN' }).jumlah, 2);
  assert.strictEqual(e.call('api_auditLog', { emel: 'B@GMAIL' }).jumlah, 2);
  assert.strictEqual(e.call('api_auditLog', { kata: 'siti' }).jumlah, 1);
  assert.strictEqual(e.call('api_auditLog', { kata: a.id.slice(0, 8) }).jumlah, 2);
  const hari = iso(hariIni());
  assert.strictEqual(e.call('api_auditLog', { dari: hari, hingga: hari }).jumlah, 4);
  assert.strictEqual(e.call('api_auditLog', { dari: '2099-01-01' }).jumlah, 0);
  assert.strictEqual(e.call('api_auditLog', { hingga: '2000-01-01' }).jumlah, 0);
  assert.strictEqual(e.call('api_auditLog', { tindakan: 'PADAM' }).kod, 'VALIDASI');
  assert.strictEqual(e.call('api_auditLog', { dari: '31/12/2013' }).kod, 'VALIDASI');
  assert.strictEqual(e.call('api_auditLog', { dari: '2013-05-02', hingga: '2013-05-01' }).kod, 'VALIDASI');
});
test('paparan audit menunjukkan nama rekod (dicari semasa paparan, tidak disimpan dalam log)', () => {
  const e = siap();
  const a = simpan(e);
  e.call('api_lihatRekod', a.id);
  const r = e.call('api_auditLog', { tindakan: 'LIHAT' });
  assert.strictEqual(r.baris[0].namaRekod, 'Ahmad bin Ali');
  assert.ok(!e.rows('audit_log').some((row) => String(row[4]).includes('Ahmad bin Ali')));
});
test('tiada fungsi untuk edit atau padam log; tab audit_log dilindungi', () => {
  const e = siap();
  assert.strictEqual(e.sheet('audit_log').protections.length, 1);
  const awam = fs.readFileSync(path.join(SRC, 'Api.gs'), 'utf8');
  assert.ok(!/audit.*(padam|delete|clear|edit)/i.test(awam));
});

console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal');
process.exit(gagal ? 1 : 0);
