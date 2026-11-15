// Dijalankan DALAM konteks vm. Meniru HtmlService: template scriptlet <? ?>, <?= ?>, <?!= ?>.
// Bergantung pada fungsi hos __readFile(namaFail) yang dibekalkan oleh mockenv.js.
(function (global) {
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function compile(src) {
    var parts = src.split(/(<\?(?:!=|=)?[\s\S]*?\?>)/);
    var code = 'var __o=[];with(__v){';
    parts.forEach(function (p) {
      var m = /^<\?(!=|=)?([\s\S]*?)\?>$/.exec(p);
      if (!m) { code += '__o.push(' + JSON.stringify(p) + ');'; return; }
      if (m[1] === '=') code += '__o.push(__esc(' + m[2] + '));';
      else if (m[1] === '!=') code += '__o.push(' + m[2] + ');';
      else code += m[2] + '\n';
    });
    code += '}return __o.join("");';
    return new Function('__v', '__esc', code);
  }

  function Output(html) { this.html = html; this.title = ''; this.meta = {}; }
  Output.prototype.setTitle = function (t) { this.title = t; return this; };
  Output.prototype.addMetaTag = function (n, c) { this.meta[n] = c; return this; };
  Output.prototype.getContent = function () { return this.html; };

  global.HtmlService = {
    createTemplateFromFile: function (name) {
      var t = { file: name };
      t.evaluate = function () {
        var fn = compile(__readFile(name + '.html'));
        var out = new Output(fn(t, esc));
        out.template = t;
        return out;
      };
      return t;
    },
    createHtmlOutputFromFile: function (name) {
      return new Output(__readFile(name + '.html'));
    }
  };
})(this);
