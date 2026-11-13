// Ujian logic Fasa 0 dan 1 dengan mock Apps Script. Jalankan: node test/run.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const J = (x) => JSON.parse(JSON.stringify(x));
const eq = (a, b) => assert.deepStrictEqual(J(a), J(b));

const SRC = path.join(__dirname, '..', 'src');

function makeSheet(name) {
  const s = { name, rows: [], frozen: 0, protections: [], maxRows: 1000 };
  const range = (r, c, nr, nc) => new Proxy({
    getValues: () => {
      const out = [];
      for (let i = 0; i < (nr || 1); i++) {
        const row = [];
        for (let j = 0; j < (nc || 1); j++) row.push((s.rows[r - 1 + i] || [])[c - 1 + j] ?? '');
        out.push(row);
      }
      return out;
    },
    setValues: (vals) => vals.forEach((row, i) => row.forEach((v, j) => {
      s.rows[r - 1 + i] = s.rows[r - 1 + i] || [];
      s.rows[r - 1 + i][c - 1 + j] = v;
    })),
  }, { get: (t, k) => k in t ? t[k] : function () { return this; } });
  Object.assign(s, {
    getName: () => name,
    getLastRow: () => s.rows.filter(Boolean).length ? s.rows.length : 0,
    getLastColumn: () => s.rows.reduce((m, r) => Math.max(m, (r || []).length), 0),
    getMaxRows: () => s.maxRows,
    setFrozenRows: (n) => { s.frozen = n; },
    getRange: range,
    appendRow: (row) => { s.rows.push(row); },
    getProtections: () => s.protections,
    protect: () => {
      const p = { desc: '', editors: ['a@x', 'b@x'],
        setDescription(d) { p.desc = d; return p; }, getDescription: () => p.desc,
        addEditor() {}, getEditors: () => p.editors.map(e => ({ getEmail: () => e })),
        removeEditors(list) { p.editors = p.editors.filter(e => !list.some(u => u.getEmail() === e)); },
        canDomainEdit: () => false, setDomainEdit() {} };
      s.protections.push(p); return p;
    },
  });
  return s;
}

function makeEnv(opts) {
  const state = { sheets: {}, props: {}, activeEmail: opts.activeEmail, ownerEmail: 'owner@gmail.com', logs: [] };
  if (opts.defaultSheet) state.sheets['Sheet1'] = makeSheet('Sheet1');
  const ss = {
    getId: () => 'SS_ID',
    getSheetByName: (n) => state.sheets[n] || null,
    insertSheet: (n) => (state.sheets[n] = makeSheet(n)),
    getSheets: () => Object.values(state.sheets),
    deleteSheet: (s) => { delete state.sheets[s.getName()]; },
  };
  const ctx = {
    Logger: { log: (m) => state.logs.push(m) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss, openById: () => ss,
      ProtectionType: { SHEET: 'SHEET' },
      newDataValidation: () => { const v = {};
        v.requireValueInList = (l, d) => { v.list = l; return v; };
        v.setAllowInvalid = (a) => { v.allowInvalid = a; return v; };
        v.build = () => v; return v; },
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => state.props[k] ?? null, setProperty: (k, v) => { state.props[k] = v; } }) },
    Session: {
      getEffectiveUser: () => ({ getEmail: () => state.ownerEmail }),
      getActiveUser: () => ({ getEmail: () => state.activeEmail }),
    },
    HtmlService: {
      createTemplateFromFile: (f) => { const t = { file: f, evaluate: () => { const o = { template: t,
        setTitle() { return o; }, addMetaTag() { return o; } }; return o; } }; return t; },
      createHtmlOutputFromFile: () => ({ getContent: () => '' }),
    },
  };
  vm.createContext(ctx);
  const code = fs.readdirSync(SRC).filter(f => f.endsWith('.gs')).map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');
  vm.runInContext(code, ctx);
  return { state, run: (expr) => vm.runInContext(expr, ctx) };
}

let lulus = 0;
function test(nama, fn) { fn(); lulus++; console.log('  ok  ' + nama); }
const auditRows = (st) => (st.sheets.audit_log.rows.slice(1));

// ---------- Fasa 0 ----------
test('setupSystem cipta 4 tab dengan header betul dan buang Sheet1 kosong', () => {
  const e = makeEnv({ defaultSheet: true });
  e.run('setupSystem()');
  eq(Object.keys(e.state.sheets).sort(), ['admin_whitelist', 'audit_log', 'config', 'rekod_tatatertib']);
  const h = e.state.sheets.rekod_tatatertib.rows[0];
  assert.strictEqual(h.length, 17);
  assert.strictEqual(h[0], 'id'); assert.strictEqual(h[16], 'updated_at');
  eq(e.state.sheets.admin_whitelist.rows[0], ['emel', 'nama', 'aktif']);
  eq(e.state.sheets.audit_log.rows[0], ['timestamp', 'emel', 'tindakan', 'rekod_id', 'butiran']);
  assert.strictEqual(e.state.sheets.rekod_tatatertib.frozen, 1);
  assert.strictEqual(e.state.props.SPREADSHEET_ID, 'SS_ID');
});
test('setupSystem seed whitelist (pemilik) dan config', () => {
  const e = makeEnv({});
  e.run('setupSystem()');
  eq(e.state.sheets.admin_whitelist.rows[1], ['owner@gmail.com', 'Pemilik', true]);
  const keys = e.state.sheets.config.rows.slice(1).map(r => r[0]);
  eq(keys, ['TEMPLATE_OPR_ID', 'FOLDER_PDF_ID', 'MOD']);
});
test('setupSystem idempotent: jalan 2 kali, data dan baris tidak berganda', () => {
  const e = makeEnv({});
  e.run('setupSystem()');
  e.state.sheets.rekod_tatatertib.rows.push(['id1', 'Ali']);
  e.state.sheets.admin_whitelist.rows.push(['b@x.com', 'B', true]);
  e.run('setupSystem()');
  assert.strictEqual(e.state.sheets.rekod_tatatertib.rows[1][1], 'Ali');
  assert.strictEqual(e.state.sheets.admin_whitelist.rows.length, 3);
  assert.strictEqual(e.state.sheets.config.rows.length, 4);
  assert.strictEqual(e.state.sheets.audit_log.protections.length, 1);
});
test('setupSystem tambah header yang kurang tanpa padam data', () => {
  const e = makeEnv({});
  e.run('setupSystem()');
  e.state.sheets.admin_whitelist.rows[0] = ['emel', 'nama'];
  e.run('setupSystem()');
  eq(e.state.sheets.admin_whitelist.rows[0], ['emel', 'nama', 'aktif']);
});
test('DROPDOWNS: negeri ada 16 nilai', () => {
  const e = makeEnv({});
  assert.strictEqual(e.run('DROPDOWNS.negeri.nilai.length'), 16);
});

// ---------- Fasa 1 ----------
function setupWith(email, extra) {
  const e = makeEnv({ activeEmail: email });
  e.run('setupSystem()');
  (extra || []).forEach(r => e.state.sheets.admin_whitelist.rows.push(r));
  return e;
}
test('admin dalam whitelist: masuk, log LOG_MASUK, paparan Index', () => {
  const e = setupWith('owner@gmail.com');
  const out = e.run('doGet()');
  assert.strictEqual(out.template.file, 'Index');
  assert.strictEqual(out.template.nama, 'Pemilik');
  assert.strictEqual(auditRows(e.state).length, 1);
  assert.strictEqual(auditRows(e.state)[0][2], 'LOG_MASUK');
});
test('emel tidak sensitif huruf besar/kecil dan ruang kosong', () => {
  const e = setupWith('  Ahmad@Gmail.com ', [[' ahmad@gmail.com', 'Ahmad', 'TRUE']]);
  assert.strictEqual(e.run('checkAdmin()').ok, true);
});
test('emel bukan whitelist: Denied dan log AKSES_DITOLAK', () => {
  const e = setupWith('orang@gmail.com');
  const out = e.run('doGet()');
  assert.strictEqual(out.template.file, 'Denied');
  assert.strictEqual(auditRows(e.state)[0][2], 'AKSES_DITOLAK');
  assert.strictEqual(auditRows(e.state)[0][1], 'orang@gmail.com');
});
test('admin aktif=FALSE ditolak', () => {
  const e = setupWith('x@gmail.com', [['x@gmail.com', 'X', false]]);
  const r = e.run('checkAdmin()');
  assert.strictEqual(r.ok, false); assert.strictEqual(r.sebab, 'TIDAK_AKTIF');
});
test('emel tidak dikesan (kosong): ditolak, bukan jatuh ke emel pemilik', () => {
  const e = setupWith('');
  const r = e.run('checkAdmin()');
  assert.strictEqual(r.ok, false); assert.strictEqual(r.sebab, 'TIADA_EMEL');
  assert.strictEqual(e.run('doGet()').template.tiadaEmel, true);
});
test('requireAdmin_ baling ralat untuk bukan admin, api_whoami pulang data untuk admin', () => {
  const bad = setupWith('orang@gmail.com');
  assert.throws(() => bad.run('api_whoami()'), /Tiada kebenaran/);
  const ok = setupWith('owner@gmail.com');
  assert.strictEqual(ok.run('api_whoami()').emel, 'owner@gmail.com');
});
test('sebelum setupSystem: doGet tidak bocor, papar mesej tidak tersedia', () => {
  const e = makeEnv({ activeEmail: 'owner@gmail.com' });
  assert.strictEqual(e.run('doGet()').template.file, 'Message');
});
test('audit: nilai bermula "=" dineutralkan (formula injection)', () => {
  const e = setupWith('owner@gmail.com');
  e.run("logAudit_('owner@gmail.com','CARIAN','','=HYPERLINK(\"x\")')");
  assert.strictEqual(auditRows(e.state)[0][4][0], "'");
});

console.log('\n' + lulus + ' ujian lulus');
