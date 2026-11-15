// Ujian UI hujung-ke-hujung dengan Chromium (Playwright) terhadap halaman sebenar dan logic server mock.
// Jalankan: node test/e2e.js
// Pilihan: CHARTJS_PATH=/laluan/ke/chart.umd.js (ganti CDN dalam ujian), SHOT_DIR=/laluan untuk tangkapan skrin.
process.env.TZ = 'Asia/Kuala_Lumpur';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { makeEnv } = require('./mockenv');
const { startServer } = require('./e2e-server');

const OWNER = 'owner@gmail.com';
const PORT = 8765;
const BASE = 'http://localhost:' + PORT + '/';
const CHART = process.env.CHARTJS_PATH && fs.existsSync(process.env.CHARTJS_PATH) ? process.env.CHARTJS_PATH : null;
const AXE = process.env.AXE_PATH && fs.existsSync(process.env.AXE_PATH) ? process.env.AXE_PATH : null;
const SHOT = process.env.SHOT_DIR || '';
if (SHOT) fs.mkdirSync(SHOT, { recursive: true });

let lulus = 0;
let gagal = 0;
async function langkah(nama, fn) {
  try { await fn(); lulus++; console.log('  ok  ' + nama); }
  catch (e) { gagal++; console.log('FAIL  ' + nama + '\n      ' + String(e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}

const CSV = [
  'NAMA,NO. K/P,GRED,SKIM,TEMPAT BERTUGAS,NEGERI,SALAH LAKU,BUTIRAN,TAHUN,HUKUMAN,TARIKH KUAT KUASA,RAYUAN,STATUS',
  'Siti binti Omar,850505105050,N41,Pegawai Tadbir,PD Hulu Langat,SELANGOR,Lewat masuk,x,2013,Amaran,5/3/2013,Tiada,Aktif',
  'Ali bin Abu,100000000002,N44,Pegawai Tadbir,PD Kluang,Johor,lewat masuk,x,2014,Denda,2014-04-09,Tiada,Aktif',
  'Abu Duplikat,900101145678,N41,Pegawai Tadbir,PD X,Selangor,Ponteng,x,2013,Amaran,01/01/2013,Tiada,Aktif',
  'Siti Dua,850505105050,N41,Pegawai Tadbir,PD X,Selangor,Ponteng,x,2013,Amaran,01/01/2013,Tiada,Aktif',
  'Salah IC,123,N41,Pegawai Tadbir,PD X,Selangor,Ponteng,x,2013,Amaran,01/01/2013,Tiada,Aktif',
  'Negeri Pelik,100000000006,N41,Pegawai Tadbir,PD X,W.P.K.L,Ponteng,x,2013,Amaran,01/01/2013,Tiada,Aktif',
  'Tarikh Salah,100000000007,N41,Pegawai Tadbir,PD X,Perak,Ponteng,x,2013,Amaran,31/02/2013,Tiada,Aktif',
  'Rasuah Orang,100000000008,N52,Pegawai Tadbir,PD Y,Perak,Rasuah,x,2015,Buang kerja,10/10/2015,Ada,Aktif'
].join('\n');

async function main() {
  const env = makeEnv({});
  env.setup(OWNER);
  env.asUser(OWNER);
  env.call('setupOpr');
  const tambahAdmin = (emel, nama, aktif) => {
    const s = env.sheet('admin_whitelist');
    const baris = env.rows('admin_whitelist').filter((r) => String(r[0]) !== '').length + 2;
    s.getRange(baris, 1).setValue(emel); s.getRange(baris, 2).setValue(nama); s.getRange(baris, 3).setValue(aktif);
  };
  tambahAdmin('b@gmail.com', 'Admin B', true);
  const server = await startServer(env, PORT);
  const browser = await chromium.launch();
  const ralatKonsol = [];

  async function konteks(emel, viewport, opsyen) {
    const ctx = await browser.newContext(Object.assign({ viewport: viewport || { width: 1280, height: 900 } }, opsyen || {}));
    await ctx.addCookies([{ name: 'u', value: encodeURIComponent(emel), url: BASE }]);
    await ctx.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    const cdn = (r) => (CHART ? r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(CHART) }) : r.abort());
    await ctx.route('**/cdnjs.cloudflare.com/**', cdn);
    await ctx.route('**/cdn.jsdelivr.net/**', cdn);
    return ctx;
  }
  async function halaman(ctx) {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => ralatKonsol.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') ralatKonsol.push('console: ' + m.text()); });
    return p;
  }
  const shot = async (p, nama) => { if (SHOT) await p.screenshot({ path: path.join(SHOT, nama + '.png'), fullPage: true }); };
  const teksH1 = (p) => p.locator('#paparan h1').first().textContent();
  async function pergi(p, hash, h1) {
    await p.goto(BASE + hash);
    if (h1) await p.waitForFunction((t) => { const e = document.querySelector('#paparan h1'); return e && e.textContent === t; }, h1, { timeout: 8000 });
  }
  async function isiBorang(p, o) {
    for (const [k, v] of Object.entries(o)) {
      const el = p.locator('#f-' + k);
      const tag = await el.evaluate((e) => e.tagName);
      if (tag === 'SELECT') await el.selectOption(v); else await el.fill(v);
    }
  }
  const rekodAsas = {
    nama: 'Ahmad bin Ali', ic: '900101145678', gred: 'N41', skim: 'Pegawai Tadbir', tpt_bertugas: 'Pejabat Daerah X',
    negeri: 'Selangor', salahlaku: 'Lewat masuk', butiran_kes: 'Lewat 10 kali', tahun: '2013', keputusan_tatatertib: 'Amaran',
    tarikh_kuatkuasa: '15/3/2013', rayuan_tatatertib: 'Tiada', status_semasa: 'Aktif'
  };

  // ---------------------------------------------------------------- S-01
  await langkah('S-01: emel bukan whitelist nampak Tiada kebenaran, tiada menu, tiada data', async () => {
    const c = await konteks('orang@gmail.com');
    const p = await halaman(c);
    await p.goto(BASE);
    assert.strictEqual(await p.locator('h1').textContent(), 'Tiada kebenaran');
    assert.strictEqual(await p.locator('nav.menu').count(), 0);
    assert.ok((await p.content()).includes('orang@gmail.com'));
    assert.ok(!(await p.content()).includes(OWNER));
    await shot(p, '01-ditolak');
    await c.close();
  });

  // ---------------------------------------------------------------- S-02 kosong
  const ctxAdmin = await konteks(OWNER);
  const pg = await halaman(ctxAdmin);
  await langkah('S-02: admin masuk, nama dipaparkan, tanda UJIAN (MOD=dev), keadaan kosong "Belum ada rekod"', async () => {
    await pergi(pg, '', 'Carian rekod');
    assert.strictEqual((await pg.locator('#nama').textContent()).trim(), 'Pemilik');
    assert.strictEqual(await pg.locator('.lencana-uji').count(), 1);
    assert.ok((await pg.locator('.kosong').textContent()).includes('Belum ada rekod'));
    assert.strictEqual(await pg.locator('nav.menu a').count(), 5);
    assert.strictEqual(await pg.locator('nav.menu a.aktif').textContent(), 'Carian');
    await shot(pg, '02-cari-kosong');
    env.sheet('config').getRange(4, 2).setValue('production');
  });

  // ---------------------------------------------------------------- S-05
  await langkah('S-05: validasi: medan wajib, IC 11 digit dengan ralat di bawah medan, tarikh salah', async () => {
    await pg.click('nav.menu a[data-nav="tambah"]');
    await pg.waitForSelector('#f-nama');
    await pg.click('button[type=submit]');
    assert.ok((await pg.locator('#banner-borang').textContent()).includes('Sila betulkan'));
    assert.ok((await pg.locator('#ralat-nama').textContent()).includes('wajib'));
    assert.strictEqual(await pg.locator('#f-nama').getAttribute('aria-invalid'), 'true');
    await pg.fill('#f-ic', '90010114567');
    await pg.locator('#f-ic').blur();
    assert.strictEqual(await pg.locator('#ralat-ic').textContent(), 'IC mesti 12 digit');
    await pg.fill('#f-tarikh_kuatkuasa', '31/02/2013');
    await pg.locator('#f-tarikh_kuatkuasa').blur();
    assert.strictEqual(await pg.locator('#ralat-tarikh_kuatkuasa').textContent(), 'Tarikh tidak sah');
    await pg.fill('#f-tarikh_kuatkuasa', '2013-03-15');
    await pg.locator('#f-tarikh_kuatkuasa').blur();
    assert.strictEqual(await pg.locator('#ralat-tarikh_kuatkuasa').textContent(), 'Tarikh mesti dalam format DD/MM/YYYY');
    assert.strictEqual(await pg.locator('#f-status_semasa').inputValue(), 'Aktif');
    await shot(pg, '03-borang-ralat');
  });
  await langkah('S-05: simpan rekod baharu: toast "Rekod disimpan", profil dipaparkan, tarikh dinormalkan', async () => {
    await isiBorang(pg, Object.assign({}, rekodAsas, { ic: '900101-14-5678' }));
    await pg.locator('#f-tarikh_kuatkuasa').blur();
    assert.strictEqual(await pg.locator('#f-tarikh_kuatkuasa').inputValue(), '15/03/2013');
    await pg.click('button[type=submit]');
    await pg.waitForFunction(() => document.querySelector('#paparan h1') && document.querySelector('#paparan h1').textContent === 'Ahmad bin Ali');
    assert.ok((await pg.locator('#toasts').textContent()).includes('Rekod disimpan'));
    const dd = await pg.locator('dl.kv dd').allTextContents();
    ['900101145678', 'N41', 'Selangor', 'Lewat masuk', '15/03/2013', 'Amaran', 'Tiada', 'Aktif'].forEach((x) => assert.ok(dd.includes(x), 'tiada ' + x + ' dalam ' + dd.join('|')));
    assert.ok((await pg.locator('main').textContent()).includes('Lewat 10 kali'));
    assert.strictEqual(env.rows('rekod_tatatertib').length, 1);
    await shot(pg, '04-profil');
  });
  await langkah('S-05: IC duplikat ditolak dengan pautan ke rekod sedia ada', async () => {
    await pg.click('nav.menu a[data-nav="tambah"]');
    await pg.waitForSelector('#f-nama');
    await isiBorang(pg, Object.assign({}, rekodAsas, { nama: 'Orang Lain' }));
    await pg.click('button[type=submit]');
    await pg.waitForFunction(() => document.querySelector('#ralat-ic') && document.querySelector('#ralat-ic').textContent.includes('sudah wujud'));
    assert.strictEqual(await pg.locator('#ralat-ic a').textContent(), 'Buka rekod itu');
    assert.strictEqual(env.rows('rekod_tatatertib').length, 1);
    await shot(pg, '05-duplikat');
  });

  // ---------------------------------------------------------------- S-02/03/04
  await langkah('S-03: carian nama, hasil dalam jadual, klik baris buka profil', async () => {
    await pg.click('nav.menu a[data-nav="cari"]');
    await pg.waitForSelector('#q');
    await pg.fill('#q', 'ahmad');
    await pg.press('#q', 'Enter');
    await pg.waitForSelector('table.data tbody tr');
    assert.strictEqual(await pg.locator('table.data tbody tr').count(), 1);
    assert.ok((await pg.locator('.ringkasan-hasil').textContent()).startsWith('1 rekod dijumpai'));
    await shot(pg, '06-cari-hasil');
    await pg.click('table.data tbody tr td:nth-child(2)');
    await pg.waitForFunction(() => document.querySelector('#paparan h1') && document.querySelector('#paparan h1').textContent === 'Ahmad bin Ali');
  });
  await langkah('S-03: carian IC separa dan tiada hasil; terlalu pendek diberi amaran', async () => {
    await pg.click('nav.menu a[data-nav="cari"]');
    await pg.waitForSelector('#q');
    await pg.fill('#q', '5678');
    await pg.press('#q', 'Enter');
    await pg.waitForSelector('table.data tbody tr');
    await pg.fill('#q', 'zzzz');
    await pg.press('#q', 'Enter');
    await pg.waitForSelector('.kosong');
    assert.ok((await pg.locator('.kosong').textContent()).includes('Tiada rekod dijumpai'));
    await pg.fill('#q', 'a');
    await pg.press('#q', 'Enter');
    assert.ok((await pg.locator('#hasil .banner').textContent()).includes('sekurang-kurangnya 2'));
  });
  await langkah('S-05: edit rekod: ubah gred, simpan, profil dan senarai carian dikemas kini', async () => {
    await pg.fill('#q', 'ahmad');
    await pg.press('#q', 'Enter');
    await pg.waitForSelector('table.data tbody tr');
    await pg.click('table.data tbody tr td:nth-child(2)');
    await pg.waitForSelector('a:has-text("Edit")');
    await pg.click('a:has-text("Edit")');
    await pg.waitForSelector('#f-gred');
    assert.strictEqual(await pg.locator('#f-nama').inputValue(), 'Ahmad bin Ali');
    assert.strictEqual(await pg.locator('#f-negeri').inputValue(), 'Selangor');
    await pg.fill('#f-gred', 'N44');
    await pg.click('button[type=submit]');
    await pg.waitForFunction(() => document.querySelector('dl.kv') && document.body.textContent.includes('N44'));
    assert.ok((await pg.locator('#toasts').textContent()).includes('Rekod disimpan'));
    assert.ok((await pg.locator('main').textContent()).includes('Dikemas kini pada'));
    await pg.click('a:has-text("Kembali")');
    await pg.waitForSelector('table.data tbody tr');
    assert.ok((await pg.locator('table.data tbody tr').first().textContent()).includes('N44'));
  });
  await langkah('S-05: konflik versi dipaparkan jika rekod diubah admin lain', async () => {
    await pg.fill('#q', 'ahmad');
    await pg.press('#q', 'Enter');
    await pg.waitForSelector('table.data tbody tr');
    await pg.click('table.data tbody tr td:nth-child(2)');
    await pg.click('a:has-text("Edit")');
    await pg.waitForSelector('#f-gred');
    // Admin B mengubah rekod yang sama semasa borang terbuka.
    const id = env.rows('rekod_tatatertib')[0][0];
    env.asUser('b@gmail.com');
    const v = env.call('api_lihatRekod', id).rekod.versi;
    await new Promise((r) => setTimeout(r, 5));
    const hasilB = env.call('api_simpanRekod', Object.assign({}, rekodAsas, { ic: '900101145678', gred: 'N48', id, versi: v }));
    assert.strictEqual(hasilB.ok, true);
    env.asUser(OWNER);
    await pg.fill('#f-gred', 'N52');
    await pg.click('button[type=submit]');
    await pg.waitForSelector('#banner-borang .banner');
    assert.ok((await pg.locator('#banner-borang').textContent()).includes('diubah oleh pengguna lain'));
    await pg.click('button:has-text("Muat semula rekod")');
    await pg.waitForFunction(() => document.querySelector('#f-gred') && document.querySelector('#f-gred').value === 'N48');
  });

  // ---------------------------------------------------------------- S-07 OPR
  await langkah('S-07: pratonton OPR, jana PDF, muat turun; butiran kes tiada dalam PDF; audit CETAK_OPR', async () => {
    const id = env.rows('rekod_tatatertib')[0][0];
    await pergi(pg, '#/opr/' + id, 'Cetak OPR');
    const teks = await pg.locator('main').textContent();
    assert.ok(teks.includes('Ahmad bin Ali') && teks.includes('Butiran kes tidak dimasukkan'));
    assert.ok(!teks.includes('Lewat 10 kali'));
    await pg.click('#btn-jana');
    await pg.waitForSelector('#btn-muat-turun', { timeout: 8000 });
    assert.ok((await pg.locator('#kawasan-pdf .banner').textContent()).includes('OPR_900101145678_'));
    const [muat] = await Promise.all([pg.waitForEvent('download'), pg.click('#btn-muat-turun')]);
    assert.ok(/^OPR_900101145678_\d{8}\.pdf$/.test(muat.suggestedFilename()));
    const isi = fs.readFileSync(await muat.path(), 'utf8');
    assert.ok(isi.startsWith('%PDF') && isi.includes('Ahmad bin Ali') && !isi.includes('Lewat 10 kali'));
    assert.strictEqual(env.rows('audit_log').filter((r) => r[2] === 'CETAK_OPR').length, 1);
    await shot(pg, '07-opr');
  });

  // ---------------------------------------------------------------- S-09 Import
  await langkah('S-09: import: muat naik CSV, pemetaan automatik, semak (tiada tulis), laporan duplikat dan ralat', async () => {
    await pg.click('nav.menu a[data-nav="import"]');
    await pg.waitForSelector('#fail-csv');
    await pg.setInputFiles('#fail-csv', { name: 'data2013.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf8') });
    await pg.waitForSelector('#peta-nama');
    assert.strictEqual(await pg.locator('#peta-ic').inputValue(), '1');
    assert.strictEqual(await pg.locator('#peta-salahlaku').inputValue(), '6');
    assert.strictEqual(await pg.locator('#peta-tarikh_kuatkuasa').inputValue(), '10');
    await shot(pg, '08-import-peta');
    const sebelum = env.rows('rekod_tatatertib').length;
    await pg.click('#btn-semak');
    await pg.waitForSelector('#jubin-semak');
    const angka = await pg.locator('#jubin-semak .angka').allTextContents();
    assert.deepStrictEqual(angka, ['8', '3', '3', '1', '1']);
    assert.strictEqual(env.rows('rekod_tatatertib').length, sebelum);
    assert.ok((await pg.locator('#paparan').textContent()).includes('Perlu dipadankan'));
    assert.strictEqual(await pg.locator('#btn-import').isEnabled(), true);
    assert.ok((await pg.locator('#paparan').textContent()).includes('5/3/2013 → 05/03/2013'));
    await shot(pg, '09-import-laporan');
  });
  await langkah('S-09: padankan nilai negeri melalui alias; import dilumpuhkan sehingga semak semula', async () => {
    const sel = pg.locator('select[aria-label="Standardkan W.P.K.L"]');
    await sel.selectOption('W.P. Kuala Lumpur');
    assert.strictEqual(await pg.locator('#btn-import').isDisabled(), true);
    assert.ok((await pg.locator('#paparan').textContent()).includes('Tekan Semak data semula'));
    await pg.click('#btn-semak-semula');
    await pg.waitForFunction(() => document.querySelector('#jubin-semak .angka') && document.querySelectorAll('#jubin-semak .angka')[1].textContent === '4');
    const angka = await pg.locator('#jubin-semak .angka').allTextContents();
    assert.deepStrictEqual(angka, ['8', '4', '2', '1', '1']);
    assert.strictEqual(await pg.locator('#btn-import').isEnabled(), true);
  });
  await langkah('S-09: muat turun laporan baris bermasalah (CSV)', async () => {
    const [muat] = await Promise.all([pg.waitForEvent('download'), pg.click('#btn-laporan')]);
    assert.strictEqual(muat.suggestedFilename(), 'laporan-semakan-import.csv');
    const isi = fs.readFileSync(await muat.path(), 'utf8');
    assert.ok(isi.includes('Salah IC') && isi.includes('Duplikat dalam fail') && isi.includes('Sudah wujud dalam sistem'));
  });
  await langkah('S-09: import: pengesahan modal, jumlah sebelum/selepas sepadan', async () => {
    await pg.click('#btn-import');
    await pg.waitForSelector('.modal');
    assert.ok((await pg.locator('.modal').textContent()).includes('4 rekod baharu'));
    await shot(pg, '10-import-modal');
    await pg.click('.modal .btn-primary');
    await pg.waitForSelector('#jubin-hasil', { timeout: 8000 });
    assert.deepStrictEqual(await pg.locator('#jubin-hasil .angka').allTextContents(), ['1', '4', '5']);
    assert.ok((await pg.locator('#paparan').textContent()).includes('1 + 4 = 5'));
    assert.strictEqual(env.rows('rekod_tatatertib').length, 5);
    const negeri = env.rows('rekod_tatatertib').map((r) => r[6]).sort();
    assert.deepStrictEqual(negeri, ['Johor', 'Perak', 'Selangor', 'Selangor', 'W.P. Kuala Lumpur']);
    const salah = env.rows('rekod_tatatertib').map((r) => r[7]);
    assert.ok(salah.filter((x) => x === 'Lewat masuk').length >= 2);
    await shot(pg, '11-import-selesai');
  });

  // ---------------------------------------------------------------- S-06 Dashboard
  await langkah('S-06: dashboard: 4 carta, jumlah setiap carta = bilangan baris dalam Sheet, jadual angka ada', async () => {
    await pg.click('nav.menu a[data-nav="dashboard"]');
    await pg.waitForSelector('.carta-grid canvas', { timeout: 8000 });
    assert.strictEqual(await pg.locator('#jumlah-rekod').textContent(), '5');
    const jumlah = await pg.evaluate(() => Array.from(document.querySelectorAll('.carta-grid canvas')).map((c) => {
      const ch = window.Chart.getChart(c);
      return ch.data.datasets[0].data.reduce((a, b) => a + b, 0);
    }));
    assert.deepStrictEqual(jumlah, [5, 5, 5, 5]);
    assert.strictEqual(await pg.locator('.carta-grid details table').count(), 4);
    const labels = await pg.evaluate(() => window.Chart.getChart(document.querySelector('[data-carta="negeri"] canvas')).data.labels);
    assert.deepStrictEqual(labels.slice().sort(), ['Johor', 'Perak', 'Selangor', 'W.P. Kuala Lumpur']);
    await shot(pg, '12-dashboard');
  });
  await langkah('S-06: tapis tahun 2013 mengubah angka dan carta', async () => {
    const tahun = await pg.locator('#tahun option').allTextContents();
    assert.deepStrictEqual(tahun, ['Semua tahun', '2015', '2014', '2013']);
    await pg.selectOption('#tahun', '2013');
    await pg.waitForFunction(() => document.querySelector('#jumlah-rekod') && document.querySelector('#jumlah-rekod').textContent === '3');
    await pg.waitForSelector('.carta-grid canvas');
    const jumlah = await pg.evaluate(() => Array.from(document.querySelectorAll('.carta-grid canvas')).map((c) => window.Chart.getChart(c).data.datasets[0].data.reduce((a, b) => a + b, 0)));
    assert.deepStrictEqual(jumlah, [3, 3, 3, 3]);
    await pg.selectOption('#tahun', '');
  });
  await langkah('S-06: jika CDN Chart.js disekat, carta jatuh kepada bar ringkas + jadual (jumlah masih betul)', async () => {
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await c.addCookies([{ name: 'u', value: encodeURIComponent(OWNER), url: BASE }]);
    await c.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await c.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
    await c.route('**/cdn.jsdelivr.net/**', (r) => r.abort());
    const p = await c.newPage();
    await p.goto(BASE + '#/dashboard');
    await p.waitForSelector('.bar-css', { timeout: 15000 });
    assert.strictEqual(await p.locator('canvas').count(), 0);
    assert.strictEqual(await p.locator('#jumlah-rekod').textContent(), '5');
    assert.strictEqual(await p.locator('details[open]').count(), 4);
    await shot(p, '13-dashboard-tanpa-cdn');
    await c.close();
  });
  await langkah('S-06: cdnjs gagal tetapi jsDelivr (dengan SRI) berjaya: hash integriti betul', async () => {
    if (!CHART) return;
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await c.addCookies([{ name: 'u', value: encodeURIComponent(OWNER), url: BASE }]);
    await c.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await c.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
    await c.route('**/cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(CHART) }));
    const p = await c.newPage();
    await p.goto(BASE + '#/dashboard');
    await p.waitForSelector('.carta-grid canvas', { timeout: 15000 });
    await c.close();
  });

  // ---------------------------------------------------------------- S-08 Audit
  await langkah('S-08: audit log: baris terbaru dahulu, tapis tindakan, halaman, pautan ke rekod', async () => {
    await pg.click('nav.menu a[data-nav="audit"]');
    await pg.waitForSelector('#jadual-audit tbody tr');
    const n = await pg.locator('#jadual-audit tbody tr').count();
    assert.ok(n > 0 && n <= 25);
    await pg.selectOption('#a-tindakan', 'CETAK_OPR');
    await pg.click('button:has-text("Tapis")');
    await pg.waitForFunction(() => document.querySelectorAll('#jadual-audit tbody tr').length === 1);
    const baris = await pg.locator('#jadual-audit tbody tr').first().textContent();
    assert.ok(baris.includes('CETAK_OPR') && baris.includes('Ahmad bin Ali') && baris.includes('OPR_900101145678_'));
    await pg.selectOption('#a-tindakan', 'TAMBAH');
    await pg.click('button:has-text("Tapis")');
    await pg.waitForFunction(() => document.querySelector('#jadual-audit') && document.querySelector('#jadual-audit').textContent.includes('IMPORT: 4 rekod ditambah'));
    await pg.click('button:has-text("Set semula")');
    await pg.waitForFunction(() => document.querySelectorAll('#jadual-audit tbody tr').length > 1);
    // tarikh DD/MM/YYYY: format salah ditolak di bawah medan; julat luar memberi "tiada entri"; julat luas memberi hasil
    await pg.fill('#a-dari', '2013-01-01');
    await pg.click('button:has-text("Tapis")');
    assert.strictEqual(await pg.locator('#ralat-dari').textContent(), 'Tarikh mesti dalam format DD/MM/YYYY');
    await pg.fill('#a-dari', '1/1/2099');
    await pg.click('button:has-text("Tapis")');
    await pg.waitForSelector('.kosong');
    assert.ok((await pg.locator('.kosong').textContent()).includes('Tiada entri'));
    await pg.fill('#a-dari', '01/01/2000');
    await pg.fill('#a-hingga', '31/12/2099');
    await pg.click('button:has-text("Tapis")');
    await pg.waitForSelector('#jadual-audit tbody tr');
    assert.strictEqual(await pg.locator('#ralat-dari').textContent(), '');
    // emel tidak dipecahkan di tengah perkataan pada desktop
    const tinggi = await pg.evaluate(() => { const td = document.querySelector('#jadual-audit tbody tr td:nth-child(2)'); return td.getBoundingClientRect().height; });
    assert.ok(tinggi < 60, 'sel emel terpecah baris: ' + tinggi);
    await pg.click('button:has-text("Set semula")');
    await pg.waitForFunction(() => document.querySelectorAll('#jadual-audit tbody tr').length > 1);
    await shot(pg, '14-audit');
  });

  // ---------------------------------------------------------------- keselamatan sesi
  await langkah('Sesi: admin dinyahaktifkan semasa sesi, tindakan seterusnya disekat dengan paparan Tiada kebenaran', async () => {
    const c = await konteks('b@gmail.com');
    const p = await halaman(c);
    await pergi(p, '', 'Carian rekod');
    env.sheet('admin_whitelist').getRange(3, 3).setValue(false);
    await p.fill('#q', 'ahmad');
    await p.press('#q', 'Enter');
    await p.waitForSelector('#sekat:not([hidden])');
    assert.ok((await p.locator('#sekat').textContent()).includes('Tiada kebenaran'));
    env.sheet('admin_whitelist').getRange(3, 3).setValue(true);
    await c.close();
  });
  await langkah('Import: admin yang tidak disenaraikan dalam EMEL_IMPORT tidak nampak menu Import dan ditolak jika masuk terus', async () => {
    env.sheet('config').getRange(5, 2).setValue('owner@gmail.com');
    const c = await konteks('b@gmail.com');
    const p = await halaman(c);
    await pergi(p, '', 'Carian rekod');
    assert.strictEqual(await p.locator('nav.menu a[data-nav="import"]').count(), 0);
    await p.goto(BASE + '#/import');
    await p.waitForSelector('#paparan .banner');
    assert.ok((await p.locator('#paparan .banner').textContent()).includes('tidak dibenarkan'));
    assert.strictEqual(await p.locator('.lencana-uji').count(), 0);
    await c.close();
    env.sheet('config').getRange(5, 2).setValue('');
  });

  // ---------------------------------------------------------------- mobile
  await langkah('Mobile 375px: tiada skrol mendatar pada semua skrin; jadual jadi kad', async () => {
    const c = await konteks(OWNER, { width: 375, height: 800 }, { deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const p = await halaman(c);
    const id = env.rows('rekod_tatatertib')[0][0];
    const lebihan = async (nama) => {
      const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, bw: document.body.scrollWidth }));
      assert.ok(o.sw <= o.iw + 1 && o.bw <= o.iw + 1, nama + ': skrol mendatar ' + JSON.stringify(o));
    };
    await pergi(p, '', 'Carian rekod');
    await lebihan('cari-kosong');
    await p.fill('#q', 'a b');
    await p.fill('#q', 'ahmad');
    await p.press('#q', 'Enter');
    await p.waitForSelector('table.data tbody tr');
    assert.strictEqual(await p.locator('table.data thead').evaluate((e) => getComputedStyle(e).position), 'absolute');
    assert.strictEqual(await p.locator('table.data tbody tr').first().evaluate((e) => getComputedStyle(e).display), 'block');
    await lebihan('cari-hasil');
    await shot(p, 'm1-cari');
    await pergi(p, '#/rekod/' + id, 'Ahmad bin Ali'); await lebihan('profil'); await shot(p, 'm2-profil');
    await pergi(p, '#/rekod/' + id + '/edit', 'Edit rekod'); await p.waitForSelector('#f-nama'); await lebihan('edit'); await shot(p, 'm3-borang');
    await pergi(p, '#/tambah', 'Tambah rekod'); await p.waitForSelector('#f-nama'); await lebihan('tambah');
    await pergi(p, '#/dashboard', 'Dashboard'); await p.waitForSelector('.carta-grid canvas', { timeout: 8000 }); await lebihan('dashboard'); await shot(p, 'm4-dashboard');
    await pergi(p, '#/audit', 'Audit log'); await p.waitForSelector('#jadual-audit'); await lebihan('audit'); await shot(p, 'm5-audit');
    await pergi(p, '#/opr/' + id, 'Cetak OPR'); await lebihan('opr');
    await pergi(p, '#/import', 'Import data sedia ada'); await p.waitForSelector('#fail-csv');
    await p.setInputFiles('#fail-csv', { name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV.replace(/Siti binti Omar,850505105050/, 'Siti Baru,850505105051'), 'utf8') });
    await p.waitForSelector('#peta-nama'); await lebihan('import-peta');
    await p.click('#btn-semak'); await p.waitForSelector('#jubin-semak'); await lebihan('import-laporan'); await shot(p, 'm6-import');
    await c.close();
  });
  await langkah('Tablet 800px dan desktop 1280px: tiada skrol mendatar', async () => {
    for (const w of [800, 1280]) {
      const c = await konteks(OWNER, { width: w, height: 900 });
      const p = await halaman(c);
      for (const r of ['#/cari', '#/dashboard', '#/audit', '#/tambah']) {
        await p.goto(BASE + r);
        await p.waitForSelector('#paparan h1');
        const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
        assert.ok(o.sw <= o.iw + 1, w + ' ' + r + ' ' + JSON.stringify(o));
      }
      await c.close();
    }
  });

  await langkah('Aksesibiliti (axe-core, WCAG 2.1 A/AA): tiada pelanggaran pada semua skrin, desktop dan mudah alih', async () => {
    if (!AXE) { console.log('      (dilangkau: tetapkan AXE_PATH ke axe.min.js)'); return; }
    const id = env.rows('rekod_tatatertib')[0][0];
    const laluan = [['#/cari', 'cari'], ['#/rekod/' + id, 'profil'], ['#/rekod/' + id + '/edit', 'edit'], ['#/tambah', 'tambah'],
      ['#/dashboard', 'dashboard'], ['#/audit', 'audit'], ['#/opr/' + id, 'opr'], ['#/import', 'import']];
    const semua = [];
    let dilulus = 0;
    for (const vp of [{ width: 1280, height: 900 }, { width: 375, height: 800 }]) {
      const c = await konteks(OWNER, vp);
      const p = await halaman(c);
      await p.goto(BASE);
      await p.waitForSelector('#paparan h1');
      await p.addScriptTag({ content: fs.readFileSync(AXE, 'utf8') });
      for (const [hash, nama] of laluan) {
        await p.evaluate((h) => { location.hash = h; }, hash);
        await p.waitForTimeout(150);
        await p.waitForSelector('#paparan h1');
        if (nama === 'dashboard') await p.waitForSelector('.carta-grid canvas', { timeout: 8000 });
        if (nama === 'cari') { await p.fill('#q', 'ahmad'); await p.press('#q', 'Enter'); await p.waitForSelector('table.data tbody tr'); }
        if (nama === 'audit') await p.waitForSelector('#jadual-audit');
        if (nama === 'edit' || nama === 'tambah') await p.waitForSelector('#f-nama');
        if (nama === 'import') {
          await p.setInputFiles('#fail-csv', { name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf8') });
          await p.waitForSelector('#peta-nama'); await p.click('#btn-semak'); await p.waitForSelector('#jubin-semak');
        }
        if (nama === 'tambah') { await p.click('button[type=submit]'); await p.waitForSelector('#banner-borang .banner'); }
        const hasil = await p.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
        dilulus += hasil.passes.length;
        hasil.violations.forEach((v) => semua.push(vp.width + 'px ' + nama + ': [' + v.impact + '] ' + v.id + ' - ' + v.help + ' (' + v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ') + ')'));
      }
      await c.close();
    }
    assert.deepStrictEqual(semua, [], '\n' + semua.join('\n'));
    assert.ok(dilulus > 200, 'axe tidak menjalankan pemeriksaan sebenar');
    console.log('      (axe: ' + dilulus + ' pemeriksaan lulus merentas 16 paparan)');
  });

  await langkah('XSS: nilai rekod berbentuk skrip dipaparkan sebagai teks, tidak dijalankan', async () => {
    const x = '<img src=x onerror="window.__xss=1">';
    env.asUser(OWNER);
    const r = env.call('api_simpanRekod', Object.assign({}, rekodAsas, { nama: x, ic: '111111111110' }));
    assert.strictEqual(r.ok, true);
    await pg.goto(BASE + '#/rekod/' + r.id);
    await pg.waitForFunction((t) => { const e = document.querySelector('#paparan h1'); return e && e.textContent === t; }, x);
    assert.strictEqual(await pg.evaluate(() => window.__xss), undefined);
    assert.strictEqual(await pg.locator('#paparan img').count(), 0);
    await pg.click('nav.menu a[data-nav="audit"]');
    await pg.waitForSelector('#jadual-audit');
    assert.strictEqual(await pg.evaluate(() => window.__xss), undefined);
    await pg.click('nav.menu a[data-nav="dashboard"]');
    await pg.waitForSelector('.carta-grid');
    assert.strictEqual(await pg.evaluate(() => window.__xss), undefined);
  });

  await langkah('Konsol: tiada ralat JavaScript atau permintaan gagal yang tidak dijangka', async () => {
    const abaikan = (m) => /Failed to load resource|net::ERR_FAILED|ERR_BLOCKED/.test(m);   // CDN sengaja disekat dalam satu ujian
    const sebenar = ralatKonsol.filter((m) => !abaikan(m));
    assert.deepStrictEqual(sebenar, [], sebenar.join('\n'));
  });

  await browser.close();
  server.close();
  console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal');
  process.exit(gagal ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
