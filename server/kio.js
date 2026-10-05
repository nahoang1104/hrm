/* Lớp persistence phía server. KIO_MODE=kio: chạy NGUYÊN VĂN vendor/kio-api.js (không sửa) trong Node,
 * với shim thay cho list.js/krud.js (gọi cùng endpoint list.php / krud.php). KIO_MODE=mem: giả lập để test. */
const vm = require('vm'), fs = require('fs'), path = require('path');
const BASE = process.env.KIO_URL || 'https://kio.dvqt.vn', PREFIX = process.env.KIO_PREFIX || 'hrm_';
const clone = x => JSON.parse(JSON.stringify(x));

function memStore() {
  const t = {}, L = n => t[n] || (t[n] = []);
  return {
    listCollection: async n => clone(L(n)),
    appendCollection: async (n, a) => { L(n).push(...clone(a)); return true; },
    syncCollection: async (n, a) => { for (const x of a) { const i = L(n).findIndex(y => y.id === x.id); i < 0 ? L(n).push(clone(x)) : (L(n)[i] = clone(x)); } return true; },
    deleteKeys: async (n, k) => { k = [].concat(k).map(String); t[n] = L(n).filter(y => !k.includes(String(y.id))); return true; },
  };
}

function kioStore() {
  const forms = new Map();
  const post = async (url, body) => {
    try {
      const r = await fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error('HTTP error ' + r.status);
      const j = await r.json(); if (j.error) throw new Error(j.error); return j;
    } catch (e) { return { success: false, error: e.message, data: [], total: 0 }; }
  };
  const g = {
    getKrudList: ({ table, page = 1, limit = 10, sort = {}, where = [] }) => post('/list.php', { table, page, limit, sort, where }),
    krud: (action, table, data = {}, id = null) => post('/krud.php', id !== null ? { action, table, data, id } : { action, table, data }),
    document: {
      createElement: () => { const f = { id: '', style: {}, _el: { value: '' }, set innerHTML(v) {}, querySelector: () => f._el, remove: () => forms.delete(f.id) }; return f; },
      body: { appendChild: f => forms.set(f.id, f) },
    },
  };
  // giống krud.js: gom field .data-element thành { payload: {value,type} }
  g.sendFormDataKRUD = (action, table, id, sel) => g.krud(action, table, { payload: { value: forms.get(String(sel).slice(1))._el.value, type: 'string' } }, id);
  const ctx = vm.createContext({ ...g, console, setTimeout });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'vendor/kio-api.js'), 'utf8') + '\n;this.KioStore = KioStore;', ctx);
  return ctx.KioStore;
}

const S = process.env.KIO_MODE === 'kio' ? kioStore() : memStore();
const T = n => PREFIX + n;
module.exports = {
  list: async n => clone(await S.listCollection(T(n))),
  sync: (n, a) => S.syncCollection(T(n), a),
  append: (n, a) => S.appendCollection(T(n), a),
  del: (n, k) => (k.length ? S.deleteKeys(T(n), k) : true),
};
