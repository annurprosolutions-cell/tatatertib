// Persekitaran mock Apps Script untuk ujian. Cuba meniru tingkah laku sebenar yang pernah menyebabkan bug:
//  - Range.insertCheckboxes() menetapkan semua sel kepada FALSE (sel jadi "ada isi")
//  - setValues pada sel format "General" menukar rentetan digit kepada nombor (sifar di depan hilang)
//  - rentetan bermula "=" jadi formula; apostrof di depan dimakan; format "@" kekalkan teks
//  - sel berformat tarikh dipulangkan sebagai Date (tengah malam zon masa Sheet)
//  - LockService tidak boleh disarang
//  - kaedah yang tidak wujud dalam API sebenar melempar TypeError (bukan senyap)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const SRC = path.join(__dirname, '..', 'src');
const SS_TZ = 'Asia/Kuala_Lumpur';

// ---------- tarikh dan zon masa ----------
const _fmt = new Map();
function formatter(tz) {
  if (!_fmt.has(tz)) {
    _fmt.set(tz, new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }));
  }
  return _fmt.get(tz);
}
function offsetMs(tz, instant) {
  const p = formatter(tz).formatToParts(new Date(instant)).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return wall - Math.floor(instant / 1000) * 1000;
}
function formatDate(date, tz, fmt) {
  const p = formatter(tz).formatToParts(date).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  const map = { yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second, SSS: String(date.getMilliseconds()).padStart(3, '0') };
  return fmt.replace(/yyyy|MM|dd|HH|mm|ss|SSS/g, (t) => map[t]);
}
const isDateFmt = (f) => /d{1,2}\/m{1,2}\/y{4}/i.test(f || '');
function serialToInstant(serial, tz) {
  const utcMidnight = Date.UTC(1970, 0, 1) + (serial - 25569) * 86400000;
  return new Date(utcMidnight - offsetMs(tz, utcMidnight));
}

// ---------- Sheets ----------
class Range {
  constructor(sheet, r, c, nr, nc) { this.sheet = sheet; this.r = r; this.c = c; this.nr = nr; this.nc = nc; this._check(); }
  _check() {
    const s = this.sheet;
    if (this.r < 1 || this.c < 1 || this.nr < 1 || this.nc < 1 ||
        this.r + this.nr - 1 > s.maxRows || this.c + this.nc - 1 > s.maxCols) {
      throw new Error('The coordinates or dimensions of the range are invalid (' + s.name + ').');
    }
  }
  _each(fn) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) fn(this.r + i, this.c + j, i, j); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) row.push(this.sheet._read(this.r + i, this.c + j));
      out.push(row);
    }
    return out;
  }
  getValue() { return this.sheet._read(this.r, this.c); }
  setValues(vals) {
    if (!Array.isArray(vals) || vals.length !== this.nr) throw new Error('Number of rows in data does not match range');
    vals.forEach((row, i) => {
      if (!Array.isArray(row) || row.length !== this.nc) throw new Error('Number of columns in data does not match range');
      row.forEach((v, j) => this.sheet._write(this.r + i, this.c + j, v));
    });
    return this;
  }
  setValue(v) { this._each((r, c) => this.sheet._write(r, c, v)); return this; }
  setNumberFormat(f) { this._each((r, c) => { this.sheet._cell(r, c).f = f; }); return this; }
  setDataValidation(rule) { this._each((r, c) => { this.sheet._cell(r, c).dv = rule; }); return this; }
  clearDataValidations() { this._each((r, c) => { this.sheet._cell(r, c).dv = null; }); return this; }
  insertCheckboxes() {
    this._each((r, c) => { const x = this.sheet._cell(r, c); x.v = false; x.dv = { type: 'checkbox' }; });
    return this;
  }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
}

class Protection {
  constructor() { this.desc = ''; this.editors = ['owner@gmail.com', 'b@x.com', 'c@x.com']; }
  setDescription(d) { this.desc = d; return this; }
  getDescription() { return this.desc; }
  addEditor() { return this; }
  getEditors() { return this.editors.map((e) => ({ getEmail: () => e })); }
  removeEditors(list) { this.editors = this.editors.filter((e) => !list.some((u) => u.getEmail() === e)); return this; }
  canDomainEdit() { return false; }
  setDomainEdit() { return this; }
}

class Sheet {
  constructor(name, ss) {
    this.name = name; this.ss = ss; this.cells = new Map();
    this.maxRows = 1000; this.maxCols = 26; this.frozen = 0; this.protections = [];
  }
  _cell(r, c) {
    const k = r + ',' + c;
    if (!this.cells.has(k)) this.cells.set(k, { v: undefined, f: 'General', dv: null });
    return this.cells.get(k);
  }
  _read(r, c) {
    const x = this.cells.get(r + ',' + c);
    if (!x || x.v === undefined || x.v === null) return '';
    if (typeof x.v === 'number' && isDateFmt(x.f)) return serialToInstant(x.v, this.ss.tz);
    if (x.v && x.v.formula) return '#FORMULA:' + x.v.formula;
    return x.v;
  }
  _write(r, c, val) {
    if (r > this.maxRows || c > this.maxCols) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
    const x = this._cell(r, c);
    let v = val;
    if (typeof v === 'string' && x.f !== '@') {
      if (v.startsWith("'")) v = v.slice(1);
      else if (v.startsWith('=')) v = { formula: v };
      else if (/^\d+(\.\d+)?$/.test(v)) v = Number(v);
    }
    if (v === '') v = undefined;
    x.v = v;
  }
  getName() { return this.name; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  getLastRow() {
    let m = 0;
    for (const [k, x] of this.cells) if (x.v !== undefined && x.v !== null && x.v !== '') m = Math.max(m, +k.split(',')[0]);
    return m;
  }
  getLastColumn() {
    let m = 0;
    for (const [k, x] of this.cells) if (x.v !== undefined && x.v !== null && x.v !== '') m = Math.max(m, +k.split(',')[1]);
    return m;
  }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  appendRow(arr) {
    const r = this.getLastRow() + 1;
    if (r > this.maxRows) this.maxRows = r;
    arr.forEach((v, j) => this._write(r, j + 1, v));
    return this;
  }
  insertRowsAfter(pos, n) { this.maxRows += n; return this; }
  setFrozenRows(n) { this.frozen = n; return this; }
  getProtections() { return this.protections; }
  protect() { const p = new Protection(); this.protections.push(p); return p; }
}

class Spreadsheet {
  constructor() { this.sheets = new Map(); this.tz = SS_TZ; this.id = 'SS_ID'; this.parentFolder = null; }
  getId() { return this.id; }
  getSheetByName(n) { return this.sheets.get(n) || null; }
  insertSheet(n) { const s = new Sheet(n, this); this.sheets.set(n, s); return s; }
  getSheets() { return Array.from(this.sheets.values()); }
  deleteSheet(s) { this.sheets.delete(s.getName()); }
  getSpreadsheetTimeZone() { return this.tz; }
  setSpreadsheetTimeZone(tz) { this.tz = tz; }
}

// ---------- Drive dan Docs ----------
class Blob {
  constructor(bytes, name, type) { this.bytes = bytes; this.name = name || ''; this.type = type || ''; }
  getBytes() { return Array.from(this.bytes); }
  setName(n) { this.name = n; return this; }
  getName() { return this.name; }
  getContentType() { return this.type; }
}
function iter(arr) {
  let i = 0;
  return { hasNext: () => i < arr.length, next: () => arr[i++] };
}

class Drive {
  constructor() {
    this.items = new Map();
    this.failPdf = false;
    this.rootRaw = { kind: 'folder', id: 'ROOT', name: 'Root', parent: null, trashed: false };
    this.items.set('ROOT', this.rootRaw);
  }
  folder(name, parent) {
    const f = { kind: 'folder', id: 'F' + crypto.randomUUID().slice(0, 8), name, parent: parent && parent._raw ? parent._raw : parent, trashed: false };
    this.items.set(f.id, f);
    return folderApi(this, f);
  }
  file(name, parent, doc, bytes, type, id) {
    const f = { kind: 'file', id: id || 'D' + crypto.randomUUID().slice(0, 8), name, parent: parent && parent._raw ? parent._raw : parent, trashed: false, doc, bytes, type };
    this.items.set(f.id, f);
    return fileApi(this, f);
  }
}
function folderApi(d, f) {
  return {
    _raw: f,
    getId: () => f.id, getName: () => f.name,
    getFoldersByName: (n) => iter(Array.from(d.items.values()).filter((x) => x.kind === 'folder' && x.parent === f && x.name === n && !x.trashed).map((x) => folderApi(d, x))),
    createFolder: (n) => d.folder(n, f),
    getFilesByName: (n) => iter(Array.from(d.items.values()).filter((x) => x.kind === 'file' && x.parent === f && x.name === n && !x.trashed).map((x) => fileApi(d, x))),
    createFile: (blob) => d.file(blob.getName(), f, null, Buffer.from(blob.bytes), blob.getContentType())
  };
}
function fileApi(d, f) {
  return {
    _raw: f,
    getId: () => f.id, getName: () => f.name,
    getParents: () => iter(f.parent ? [folderApi(d, f.parent)] : []),
    makeCopy: (name, dest) => d.file(name, dest || f.parent, f.doc ? JSON.parse(JSON.stringify(f.doc)) : null, f.bytes, f.type),
    getAs: (mime) => {
      if (mime !== 'application/pdf') throw new Error('Unsupported conversion ' + mime);
      if (d.failPdf) throw new Error('Service invoked too many times');
      const teks = f.doc ? docText(f.doc) : '';
      return new Blob(Buffer.from('%PDF-1.4\n' + teks), f.name + '.pdf', 'application/pdf');
    },
    getBlob: () => new Blob(f.bytes || Buffer.from(''), f.name, f.type),
    setTrashed: (t) => { f.trashed = !!t; return fileApi(d, f); },
    moveTo: (folder) => { f.parent = folder._raw; return fileApi(d, f); },
    getUrl: () => 'https://drive.example/' + f.id
  };
}
function docText(doc) {
  const out = [];
  doc.children.forEach((c) => {
    if (c.type === 'p') out.push(c.text);
    else c.rows.forEach((row) => out.push(row.map((cell) => cell.text).join(' | ')));
  });
  return out.join('\n');
}
function javaReplace(text, pattern, repl) {
  const re = new RegExp(pattern, 'g');
  return text.replace(re, (...m) => {
    const groups = m.slice(1, m.length - 2).filter((x) => typeof x === 'string' || x === undefined);
    let out = '';
    for (let i = 0; i < repl.length; i++) {
      const ch = repl[i];
      if (ch === '\\') { out += repl[++i] || ''; }
      else if (ch === '$' && /\d/.test(repl[i + 1] || '')) { out += groups[+repl[++i] - 1] || ''; }
      else out += ch;
    }
    return out;
  });
}
function bodyApi(doc) {
  const self = {
    clear() { doc.children = []; return self; },
    setPageWidth() { return self; }, setPageHeight() { return self; },
    setMarginTop() { return self; }, setMarginBottom() { return self; },
    setMarginLeft() { return self; }, setMarginRight() { return self; },
    appendParagraph(text) {
      const p = { type: 'p', text: String(text) };
      doc.children.push(p);
      const api = {
        setAlignment() { return api; }, setBold() { return api; },
        setFontSize() { return api; }, setSpacingAfter() { return api; }
      };
      return api;
    },
    appendTable(cells) {
      const t = { type: 't', rows: cells.map((r) => r.map((x) => ({ text: String(x) }))) };
      doc.children.push(t);
      const api = {
        setColumnWidth() { return api; }, setBorderWidth() { return api; },
        getRow(i) {
          return {
            getCell(j) { return { editAsText: () => ({ setBold() { return this; } }), setBackgroundColor() { return this; } }; },
            setMinimumHeight() { return this; }
          };
        }
      };
      return api;
    },
    replaceText(pattern, repl) {
      doc.children.forEach((c) => {
        if (c.type === 'p') c.text = javaReplace(c.text, pattern, repl);
        else c.rows.forEach((row) => row.forEach((cell) => { cell.text = javaReplace(cell.text, pattern, repl); }));
      });
      return self;
    }
  };
  return self;
}

// ---------- persekitaran ----------
function makeEnv(opts = {}) {
  const state = {
    activeEmail: opts.activeEmail, ownerEmail: opts.ownerEmail || 'owner@gmail.com',
    props: {}, logs: [], cache: new Map(), lockHeld: false, lockCalls: 0,
    ss: new Spreadsheet(), drive: new Drive()
  };
  if (opts.defaultSheet) state.ss.insertSheet('Sheet1');
  state.ss.parentFolder = state.drive.folder('RuzTatatertib', state.drive.rootRaw);
  state.drive.file('Sistem Tatatertib (Sheet)', state.ss.parentFolder, null, Buffer.from(''), 'sheet', 'SS_ID');

  const docs = {
    create(name) {
      const d = { children: [] };
      const f = state.drive.file(name, state.drive.rootRaw, d, null, 'doc');
      return docApi(f, d);
    },
    openById(id) {
      if (state.gagalBuka > 0) { state.gagalBuka--; throw new Error('Document is missing (perhaps it was deleted?)'); }
      const f = state.drive.items.get(id);
      if (!f || !f.doc) throw new Error('Document is missing (perhaps it was deleted?)');
      return docApi(fileApi(state.drive, f), f.doc);
    },
    HorizontalAlignment: { CENTER: 'CENTER', LEFT: 'LEFT', RIGHT: 'RIGHT' }
  };
  function docApi(file, d) {
    return {
      getId: () => file.getId(), getBody: () => bodyApi(d),
      getHeader: () => null, getFooter: () => null, saveAndClose() {}
    };
  }

  const ctx = {
    console,
    Logger: { log: (m) => state.logs.push(String(m)) },
    Session: {
      getEffectiveUser: () => ({ getEmail: () => state.ownerEmail }),
      getActiveUser: () => ({ getEmail: () => state.activeEmail || '' }),
      getScriptTimeZone: () => state.scriptTz || SS_TZ
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in state.props ? state.props[k] : null),
        setProperty: (k, v) => { state.props[k] = v; }
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (state.cache.has(k) ? state.cache.get(k) : null),
        put: (k, v) => { state.cache.set(k, v); }
      })
    },
    LockService: {
      getScriptLock: () => ({
        waitLock() {
          state.lockCalls++;
          if (state.lockHeld) throw new Error('Lock timeout: Could not obtain lock (kunci disarang)');
          state.lockHeld = true;
        },
        releaseLock() { state.lockHeld = false; }
      })
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate,
      base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
      sleep: () => { state.tidur = (state.tidur || 0) + 1; }
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => state.ss,
      openById: (id) => { if (id !== state.ss.id) throw new Error('No spreadsheet with id ' + id); return state.ss; },
      ProtectionType: { SHEET: 'SHEET' },
      newDataValidation: () => {
        const v = {};
        v.requireValueInList = (list, dd) => { v.type = 'list'; v.list = list; return v; };
        v.requireCheckbox = () => { v.type = 'checkbox'; return v; };
        v.setAllowInvalid = (a) => { v.allowInvalid = a; return v; };
        v.build = () => v;
        return v;
      }
    },
    DriveApp: {
      getFolderById: (id) => {
        const f = state.drive.items.get(id);
        if (!f || f.kind !== 'folder') throw new Error('No item with the given ID could be found, or you do not have permission to access it.');
        return folderApi(state.drive, f);
      },
      getFileById: (id) => {
        const f = state.drive.items.get(id);
        if (!f || f.kind !== 'file') throw new Error('No item with the given ID could be found, or you do not have permission to access it.');
        return fileApi(state.drive, f);
      },
      getRootFolder: () => folderApi(state.drive, state.drive.rootRaw)
    },
    DocumentApp: docs,
    __readFile: (name) => fs.readFileSync(path.join(SRC, name), 'utf8')
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'htmlservice-ctx.js'), 'utf8'), ctx);

  let fail = fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).sort();
  if (opts.reverse) fail = fail.reverse();
  fail.forEach((f) => vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f }));

  const env = {
    state, ctx,
    /** Jalankan ungkapan dan pulangkan hasil sebagai JSON biasa (tiada isu merentas realm). */
    run(expr) {
      const json = vm.runInContext('JSON.stringify((function(){ return (' + expr + '); })())', ctx);
      return json === undefined ? undefined : JSON.parse(json);
    },
    /** Panggil fungsi seperti google.script.run: argumen dan hasil diserialisasi JSON. */
    call(fn, ...args) {
      ctx.__argsJson = JSON.stringify(args);
      const json = vm.runInContext(
        'JSON.stringify(' + fn + '.apply(null, JSON.parse(__argsJson)))', ctx);
      return json === undefined ? undefined : JSON.parse(json);
    },
    asUser(email) { state.activeEmail = email; return env; },
    sheet(n) { return state.ss.getSheetByName(n); },
    /** Baris data (tanpa header) sebagai tatasusunan nilai baca. */
    rows(n) {
      const s = state.ss.getSheetByName(n);
      const lr = s.getLastRow(); const lc = s.getLastColumn();
      if (lr < 2) return [];
      return s.getRange(2, 1, lr - 1, lc).getValues();
    },
    /** Sediakan sistem sebagai pemilik, kemudian bertukar kepada pengguna tertentu. */
    setup(asEmail) {
      env.asUser(state.ownerEmail);
      env.call('setupSystem');
      env.asUser(asEmail === undefined ? state.ownerEmail : asEmail);
      return env;
    }
  };
  return env;
}

module.exports = { makeEnv, SRC, SS_TZ };
