// Pelayan harness untuk ujian UI: menyajikan halaman web app sebenar (doGet) dan meniru google.script.run
// dengan memanggil fungsi server dalam persekitaran mock. Pengguna dikenal pasti melalui kuki "u".
const http = require('http');
const vm = require('vm');

const SHIM = `<script>
(function () {
  function runner(ok, fail) {
    return new Proxy({}, { get: function (_, name) {
      if (name === 'withSuccessHandler') return function (f) { return runner(f, fail); };
      if (name === 'withFailureHandler') return function (f) { return runner(ok, f); };
      return function () {
        var args = Array.prototype.slice.call(arguments);
        fetch('/rpc/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
          .then(function (r) { return r.json(); })
          .then(function (r) { if (r.__error) { if (fail) fail({ message: r.__error }); } else if (ok) ok(r.v); })
          .catch(function (e) { if (fail) fail(e); });
      };
    } });
  }
  window.google = { script: { run: runner(null, null) } };
})();
</script>`;

function startServer(env, port) {
  const awam = new Set(['doGet', 'setupSystem', 'setupOpr', 'checkAdmin', 'cariRekod']);
  const server = http.createServer((req, res) => {
    const kuki = /(?:^|;\s*)u=([^;]*)/.exec(req.headers.cookie || '');
    env.asUser(kuki ? decodeURIComponent(kuki[1]) : '');
    if (req.method === 'GET' && req.url.split('?')[0] === '/') {
      const out = vm.runInContext('doGet()', env.ctx);
      const html = out.html.replace(/<head>/i, '<head>' + SHIM);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
    const m = /^\/rpc\/([A-Za-z0-9_]+)$/.exec(req.url);
    if (req.method === 'POST' && m) {
      const fn = m[1];
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', () => {
        let hasil;
        try {
          // Meniru google.script.run: fungsi berakhir _ tidak boleh dipanggil dari browser.
          if (fn.endsWith('_') || !(fn.startsWith('api_') || awam.has(fn))) throw new Error('Fungsi tidak dibenarkan: ' + fn);
          hasil = { v: env.call(fn, ...JSON.parse(body || '[]')) };
        } catch (e) {
          hasil = { __error: String(e.message || e) };
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(hasil === undefined ? {} : hasil));
      });
      return;
    }
    res.writeHead(404); res.end('tiada');
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

module.exports = { startServer };
