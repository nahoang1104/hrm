const fs = require('fs'), path = require('path'), crypto = require('crypto');
try { fs.readFileSync(path.join(__dirname, '../.env'), 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]; }); } catch {}
const express = require('express'), multer = require('multer'), bc = require('bcryptjs'), db = require('./kio');
const { seedDemo } = require('./seed');
let A; try { A = require('argon2'); } catch {}
const hash = p => (A ? A.hash(p, { type: A.argon2id }) : bc.hash(p, 12));
const verify = async (h, p) => (h.startsWith('$argon2') ? !!A && A.verify(h, p) : bc.compare(p, h));

const ROOT = path.join(__dirname, '..'), UP = path.join(ROOT, 'uploads');
const app = express(); app.use(express.json({ limit: '1mb' }));
const up = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const id = p => p + '_' + crypto.randomBytes(6).toString('hex'), now = () => new Date().toISOString();
const E = (s, m) => Object.assign(new Error(m), { status: s });
const wrap = f => (req, res, next) => f(req, res, next).catch(e => e.status ? res.status(e.status).json({ error: e.message }) : (console.error(e), res.status(500).json({ error: e.code === 'LIMIT_FILE_SIZE' ? 'File quá lớn' : 'Lỗi máy chủ' })));
const sessions = new Map(), fails = new Map();
const ROLES = ['SUPER_ADMIN', 'HR_MANAGER', 'EMPLOYEE'];
const pub = ({ passwordHash, ...u }) => u;
const nameOf = async u => ((await db.list('profiles')).find(p => p.userId === u.id) || {}).fullName || u.username;
const audit = (a, action, target, description) => db.append('audit_logs', [{ id: id('log'), userId: a ? a.id : null, action, targetUserId: target || null, description, createdAt: now() }]);
const pwCheck = p => { if (typeof p !== 'string' || p.length < 8) throw E(400, 'Mật khẩu tối thiểu 8 ký tự'); };

// ---- Phân quyền ----
const canView = (a, t) => a.id === t.id || a.role === 'SUPER_ADMIN' || (a.role === 'HR_MANAGER' && t.role !== 'SUPER_ADMIN');
const canManage = (a, t) => a.role === 'SUPER_ADMIN' || (a.role === 'HR_MANAGER' && t.role === 'EMPLOYEE');
const MODE = { view: canView, manage: canManage, self: (a, t) => a.id === t.id || canManage(a, t) };
async function target(req, mode) {
  const t = (await db.list('users')).find(x => x.id === req.params.id && (x.status !== 'DELETED' || req.user.role === 'SUPER_ADMIN'));
  if (!t || !MODE[mode](req.user, t)) throw E(404, 'Không tìm thấy hoặc không có quyền');
  return t;
}

// ---- File upload ----
const MAGIC = { 'image/jpeg': [0xFF, 0xD8, 0xFF], 'image/png': [0x89, 0x50, 0x4E, 0x47], 'application/pdf': [0x25, 0x50, 0x44, 0x46], 'image/webp': [0x52, 0x49, 0x46, 0x46] };
const EXT = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'application/pdf': ['.pdf'], 'image/webp': ['.webp'] };
function checkFile(f, imageOnly, max) {
  if (!f) throw E(400, 'Thiếu file');
  const ext = path.extname(f.originalname).toLowerCase(), m = MAGIC[f.mimetype];
  if (!m || !EXT[f.mimetype].includes(ext) || !m.every((b, i) => f.buffer[i] === b)) throw E(400, 'File không hợp lệ (chỉ JPG/PNG/WebP/PDF)');
  if (imageOnly && !f.mimetype.startsWith('image/')) throw E(400, 'Ảnh đại diện phải là ảnh');
  if (f.size > max) throw E(400, 'File vượt quá dung lượng cho phép');
}
async function saveFile(owner, type, f, written) { // backend tự quyết định userId/type/tên/thư mục
  const stored = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${EXT[f.mimetype][0]}`, dir = path.join(UP, owner, type);
  fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, stored), f.buffer); written.push(path.join(dir, stored));
  const meta = { id: id('file'), ownerId: owner, type, originalName: path.basename(f.originalname), storedName: stored, mimeType: f.mimetype, size: f.size, path: `/uploads/${owner}/${type}/${stored}`, uploadedAt: now() };
  await db.sync('files', [meta]); return meta;
}
async function dropFile(fid) {
  const f = (await db.list('files')).find(x => x.id === fid); if (!f) return;
  fs.rmSync(path.join(UP, f.ownerId, f.type, f.storedName), { force: true }); await db.del('files', [fid]);
}

// ---- Auth ----
const cookie = req => ((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).find(a => a[0] === 'sid') || [])[1];
const me = async u => ({ ...pub(u), profile: (await db.list('profiles')).find(p => p.userId === u.id) || null });
app.post('/api/auth/login', wrap(async (req, res) => {
  const { username = '', password = '' } = req.body, key = String(username).toLowerCase(), f = fails.get(key);
  if (f && f.until > Date.now()) throw E(429, 'Tạm khóa 15 phút do nhập sai nhiều lần');
  const u = (await db.list('users')).find(x => x.username.toLowerCase() === key);
  if (!(u && u.status === 'ACTIVE' && await verify(u.passwordHash, String(password)))) {
    const n = ((f && f.n) || 0) + 1; fails.set(key, { n, until: n >= 5 ? Date.now() + 15 * 60000 : 0 });
    throw E(401, 'Sai tên đăng nhập/mật khẩu hoặc tài khoản không khả dụng');
  }
  fails.delete(key);
  const sid = crypto.randomBytes(32).toString('hex'); sessions.set(sid, { uid: u.id, exp: Date.now() + 8 * 3600e3 });
  res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`);
  const nu = { ...u, lastLoginAt: now() }; await db.sync('users', [nu]);
  await audit(u, 'LOGIN', null, `${await nameOf(u)} đăng nhập vào hệ thống`); res.json(await me(nu));
}));
const api = express.Router(); app.use('/api', api);
api.use(wrap(async (req, res, next) => {
  const s = sessions.get(cookie(req)); if (!s || s.exp < Date.now()) throw E(401, 'Chưa đăng nhập');
  const u = (await db.list('users')).find(x => x.id === s.uid); if (!u || u.status !== 'ACTIVE') throw E(401, 'Tài khoản không khả dụng');
  req.user = u; if (u.mustChangePassword && !req.path.startsWith('/auth/')) throw E(403, 'Cần đổi mật khẩu trước khi tiếp tục'); next();
}));
api.get('/auth/me', wrap(async (req, res) => res.json(await me(req.user))));
api.post('/auth/logout', wrap(async (req, res) => { sessions.delete(cookie(req)); res.setHeader('Set-Cookie', 'sid=; Max-Age=0; Path=/'); res.json({ ok: true }); }));
api.post('/auth/change-password', wrap(async (req, res) => {
  const { oldPassword, newPassword } = req.body; pwCheck(newPassword);
  if (!(await verify(req.user.passwordHash, String(oldPassword || '')))) throw E(400, 'Mật khẩu cũ không đúng');
  await db.sync('users', [{ ...req.user, passwordHash: await hash(newPassword), mustChangePassword: false, updatedAt: now() }]);
  await audit(req.user, 'CHANGE_PASSWORD', req.user.id, `${await nameOf(req.user)} đổi mật khẩu`); res.json({ ok: true });
}));

// ---- Users ----
const REQ = ['fullName', 'gender', 'nationality', 'dateOfBirth', 'citizenID', 'phone', 'email'];
const PF = [...REQ, 'address'], LOCKED = ['fullName', 'gender', 'nationality', 'dateOfBirth', 'citizenID']; // EMPLOYEE không được sửa LOCKED
const pick = (o, ks) => Object.fromEntries(ks.filter(k => o[k] !== undefined).map(k => [k, typeof o[k] === 'string' ? o[k].trim() : o[k]]));
const PAGE = 25, norm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
api.get('/users', wrap(async (req, res) => { // tìm kiếm + phân trang: ?q=&role=&status=&page=  (25 dòng/trang)
  if (req.user.role === 'EMPLOYEE') throw E(403, 'Không có quyền');
  const [us, ps] = await Promise.all([db.list('users'), db.list('profiles')]), sa = req.user.role === 'SUPER_ADMIN';
  const pr = uid => ps.find(p => p.userId === uid) || null, q = norm(req.query.q).trim(), { role, status } = req.query;
  let rows = us.filter(x => canView(req.user, x) && (sa || x.status !== 'DELETED') && (!role || x.role === role) && (!status || x.status === status))
    .map(x => ({ ...pub(x), profile: pr(x.id), canManage: canManage(req.user, x), deletedByName: sa && x.deletedBy ? (pr(x.deletedBy) || {}).fullName || null : undefined }));
  if (q) rows = rows.filter(x => [x.username, x.profile && x.profile.fullName, x.profile && x.profile.email, x.profile && x.profile.phone, x.profile && x.profile.citizenID].some(v => norm(v).includes(q)));
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const total = rows.length, pages = Math.max(1, Math.ceil(total / PAGE)), page = Math.min(Math.max(parseInt(req.query.page) || 1, 1), pages);
  res.json({ items: rows.slice((page - 1) * PAGE, page * PAGE), total, page, pages, pageSize: PAGE });
}));
api.post('/users', up.any(), wrap(async (req, res) => { // multipart: data(JSON gồm positions/work/degrees/certificates) + avatar + {kind}_{i} (file bằng cấp/chứng chỉ)
  const a = req.user; if (a.role === 'EMPLOYEE') throw E(403, 'Không có quyền');
  const files = Object.fromEntries((req.files || []).map(f => [f.fieldname, f])), d = JSON.parse(req.body.data || '{}');
  if (!ROLES.includes(d.role)) throw E(400, 'Role không hợp lệ');
  if (a.role === 'HR_MANAGER' && d.role !== 'EMPLOYEE') throw E(403, 'HR_MANAGER chỉ được tạo EMPLOYEE');
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(d.username || '')) throw E(400, 'Username 3-32 ký tự (chữ, số, . _ -)');
  pwCheck(d.password); for (const k of REQ) if (!String(d[k] || '').trim()) throw E(400, 'Thiếu trường: ' + k);
  checkFile(files.avatar, true, 2 * 1024 * 1024);
  const subs = {}; // validate TOÀN BỘ trước khi lưu bất kỳ thứ gì
  for (const kk of Object.keys(KIND)) {
    const k = KIND[kk]; subs[kk] = (Array.isArray(d[kk]) ? d[kk] : []).map((x, i) => {
      const r = pick(x || {}, k.f), f = files[`${kk}_${i}`];
      for (const q of k.req) if (!r[q]) throw E(400, `Thiếu trường "${q}" ở mục ${kk} #${i + 1}`);
      if (f) { if (!k.file) throw E(400, `Mục ${kk} không nhận file`); checkFile(f, false, 5 * 1024 * 1024); }
      return { r, f };
    });
  }
  if ((await db.list('users')).some(u => u.username.toLowerCase() === d.username.toLowerCase())) throw E(409, 'Username đã tồn tại');
  const uid = id('user'), written = [], made = { users: [uid], profiles: ['pf_' + uid] };
  const track = (c, i) => (made[c] = made[c] || []).push(i);
  try {
    const af = await saveFile(uid, 'profile', files.avatar, written); track('files', af.id);
    const user = { id: uid, username: d.username, passwordHash: await hash(d.password), role: d.role, status: 'ACTIVE', mustChangePassword: true, createdAt: now(), updatedAt: now(), lastLoginAt: null };
    await db.sync('users', [user]); await db.sync('profiles', [{ id: 'pf_' + uid, userId: uid, ...pick(d, PF), profilePictureFileId: af.id }]);
    for (const kk of Object.keys(KIND)) for (const { r, f } of subs[kk]) {
      const rec = { id: id(kk), userId: uid, ...r }; if (kk === 'positions') rec.isCurrent = true;
      if (f) { const m = await saveFile(uid, KIND[kk].file, f, written); track('files', m.id); rec.fileId = m.id; }
      await db.sync(KIND[kk].c, [rec]); track(KIND[kk].c, rec.id);
    }
    await audit(a, 'CREATE_USER', uid, `${await nameOf(a)} tạo tài khoản ${d.fullName}`); res.json(pub(user));
  } catch (e) { // rollback bù: không để file/bản ghi mồ côi
    written.forEach(p => fs.rmSync(p, { force: true })); fs.rmSync(path.join(UP, uid), { recursive: true, force: true });
    await Promise.allSettled(Object.entries(made).map(([c, ids]) => db.del(c, ids))); throw e;
  }
}));
api.get('/users/:id', wrap(async (req, res) => {
  const t = await target(req, 'view'), m = r => r.userId === t.id;
  const [pf, po, wk, dg, ce] = await Promise.all(['profiles', 'current_positions', 'work_history', 'degrees', 'certificates'].map(c => db.list(c)));
  res.json({ user: pub(t), profile: pf.find(m), positions: po.filter(m), work: wk.filter(m), degrees: dg.filter(m), certificates: ce.filter(m), canManage: canManage(req.user, t), canSelf: MODE.self(req.user, t) });
}));
api.put('/users/:id/profile', up.single('avatar'), wrap(async (req, res) => {
  const t = await target(req, 'self'), d = pick(JSON.parse(req.body.data || '{}'), PF);
  for (const k of REQ) if (k in d && !d[k]) throw E(400, 'Thiếu trường: ' + k);
  const old = (await db.list('profiles')).find(p => p.userId === t.id), written = []; const pf = { ...old, ...d };
  if (req.user.role === 'EMPLOYEE') for (const k of LOCKED) if (k in d && String(d[k]) !== String(old[k] == null ? '' : old[k])) throw E(403, 'Nhân viên không được sửa họ tên, giới tính, quốc tịch, ngày sinh, CCCD');
  if (req.file) { checkFile(req.file, true, 2 * 1024 * 1024); const f = await saveFile(t.id, 'profile', req.file, written); if (old.profilePictureFileId) await dropFile(old.profilePictureFileId); pf.profilePictureFileId = f.id; }
  await db.sync('profiles', [pf]); await audit(req.user, 'UPDATE_PROFILE', t.id, `${await nameOf(req.user)} cập nhật hồ sơ của ${pf.fullName || t.username}`); res.json(pf);
}));
api.put('/users/:id', wrap(async (req, res) => { // tài khoản: status / role / username
  const t = await target(req, 'manage'), b = req.body, nu = { ...t, updatedAt: now() }, all = await db.list('users');
  const lastSA = t.role === 'SUPER_ADMIN' && all.filter(u => u.role === 'SUPER_ADMIN' && u.status === 'ACTIVE').length <= 1;
  if (b.status !== undefined) { if (!['ACTIVE', 'LOCKED'].includes(b.status)) throw E(400, 'Trạng thái không hợp lệ'); if (t.id === req.user.id || (b.status === 'LOCKED' && lastSA)) throw E(400, 'Không thể khóa tài khoản này'); nu.status = b.status; }
  if (b.role !== undefined) { if (req.user.role !== 'SUPER_ADMIN' || !ROLES.includes(b.role)) throw E(403, 'Chỉ SUPER_ADMIN được đổi role'); if (t.id === req.user.id || (lastSA && b.role !== t.role)) throw E(400, 'Không thể đổi role tài khoản này'); nu.role = b.role; }
  if (b.username !== undefined) { if (!/^[a-zA-Z0-9._-]{3,32}$/.test(b.username) || all.some(u => u.id !== t.id && u.username.toLowerCase() === b.username.toLowerCase())) throw E(400, 'Username không hợp lệ hoặc đã tồn tại'); nu.username = b.username; }
  await db.sync('users', [nu]); await audit(req.user, 'UPDATE_USER', t.id, `${await nameOf(req.user)} cập nhật tài khoản ${await nameOf(t)}`); res.json(pub(nu));
}));
api.post('/users/:id/reset-password', wrap(async (req, res) => {
  const t = await target(req, 'manage'); pwCheck(req.body.newPassword);
  await db.sync('users', [{ ...t, passwordHash: await hash(req.body.newPassword), mustChangePassword: true, updatedAt: now() }]);
  await audit(req.user, 'RESET_PASSWORD', t.id, `${await nameOf(req.user)} đặt lại mật khẩu cho ${await nameOf(t)}`); res.json({ ok: true });
}));
api.post('/users/:id/restore', wrap(async (req, res) => { // khai báo TRƯỚC route /:kind
  if (req.user.role !== 'SUPER_ADMIN') throw E(403, 'Chỉ SUPER_ADMIN được khôi phục tài khoản');
  const t = await target(req, 'manage'); if (t.status !== 'DELETED') throw E(400, 'Tài khoản chưa bị xóa');
  await db.sync('users', [{ ...t, status: 'ACTIVE', deletedBy: null, deletedAt: null, updatedAt: now() }]);
  await audit(req.user, 'RESTORE_USER', t.id, `${await nameOf(req.user)} khôi phục tài khoản ${await nameOf(t)}`); res.json({ ok: true });
}));
api.delete('/users/:id', wrap(async (req, res) => {
  const t = await target(req, 'manage'), hard = req.query.hard === '1', all = await db.list('users');
  if (t.id === req.user.id) throw E(400, 'Không thể tự xóa chính mình');
  if (hard && req.user.role !== 'SUPER_ADMIN') throw E(403, 'Chỉ SUPER_ADMIN được xóa cứng');
  if (t.role === 'SUPER_ADMIN' && all.filter(u => u.role === 'SUPER_ADMIN' && u.status !== 'DELETED').length <= 1) throw E(400, 'Không thể xóa SUPER_ADMIN cuối cùng');
  const an = await nameOf(req.user), tn = await nameOf(t);
  for (const [s, v] of sessions) if (v.uid === t.id) sessions.delete(s);
  if (!hard) { await db.sync('users', [{ ...t, status: 'DELETED', deletedBy: req.user.id, deletedAt: now(), updatedAt: now() }]); await audit(req.user, 'SOFT_DELETE_USER', t.id, `${an} xóa (mềm) tài khoản ${tn}`); return res.json({ ok: true }); }
  await audit(req.user, 'DELETE_USER', t.id, `${an} xóa vĩnh viễn tài khoản ${tn}`); // ghi log TRƯỚC khi xóa dữ liệu
  for (const c of ['profiles', 'current_positions', 'work_history', 'degrees', 'certificates', 'files']) await db.del(c, (await db.list(c)).filter(r => (r.userId || r.ownerId) === t.id).map(r => r.id));
  await db.del('users', [t.id]); fs.rmSync(path.join(UP, t.id), { recursive: true, force: true }); res.json({ ok: true });
}));

// ---- Chức vụ / công tác (HR trở lên) · Bằng cấp / chứng chỉ (chính chủ hoặc HR trở lên) ----
const KIND = {
  positions: { c: 'current_positions', m: 'manage', f: ['position', 'fromDate'], req: ['position', 'fromDate'] },
  work: { c: 'work_history', m: 'manage', f: ['company', 'department', 'position', 'fromDate', 'toDate', 'description'], req: ['company', 'position', 'fromDate'] },
  degrees: { c: 'degrees', m: 'self', f: ['name', 'major', 'school', 'issuedDate'], req: ['name', 'school'], file: 'degrees' },
  certificates: { c: 'certificates', m: 'self', f: ['name', 'issuer', 'issuedDate', 'expiredDate', 'certificateNumber'], req: ['name', 'issuer'], file: 'certificates' },
};
api.post('/users/:id/:kind', up.single('file'), wrap(async (req, res) => {
  const k = KIND[req.params.kind]; if (!k) throw E(404, 'Không tìm thấy'); const t = await target(req, k.m), d = pick(JSON.parse(req.body.data || '{}'), k.f);
  for (const r of k.req) if (!d[r]) throw E(400, 'Thiếu trường: ' + r);
  const rec = { id: id(req.params.kind), userId: t.id, ...d }, written = [];
  if (req.params.kind === 'positions') rec.isCurrent = true;
  try {
    if (k.file && req.file) { checkFile(req.file, false, 5 * 1024 * 1024); rec.fileId = (await saveFile(t.id, k.file, req.file, written)).id; }
    await db.sync(k.c, [rec]);
  } catch (e) { written.forEach(p => fs.rmSync(p, { force: true })); if (rec.fileId) await db.del('files', [rec.fileId]); throw e; }
  await audit(req.user, 'ADD_' + req.params.kind.toUpperCase(), t.id, `${await nameOf(req.user)} thêm ${req.params.kind} cho ${await nameOf(t)}`); res.json(rec);
}));
api.put('/users/:id/:kind/:rid', up.single('file'), wrap(async (req, res) => {
  const k = KIND[req.params.kind]; if (!k) throw E(404, 'Không tìm thấy'); const t = await target(req, k.m), d = pick(JSON.parse(req.body.data || '{}'), k.f);
  const old = (await db.list(k.c)).find(x => x.id === req.params.rid && x.userId === t.id); if (!old) throw E(404, 'Không tìm thấy');
  const rec = { ...old, ...d }, written = []; for (const r of k.req) if (!rec[r]) throw E(400, 'Thiếu trường: ' + r);
  try {
    if (k.file && req.file) { checkFile(req.file, false, 5 * 1024 * 1024); rec.fileId = (await saveFile(t.id, k.file, req.file, written)).id; }
    await db.sync(k.c, [rec]);
  } catch (e) { written.forEach(p => fs.rmSync(p, { force: true })); if (rec.fileId && rec.fileId !== old.fileId) await db.del('files', [rec.fileId]); throw e; }
  if (rec.fileId !== old.fileId && old.fileId) await dropFile(old.fileId); // thay file thành công → xóa file cũ
  await audit(req.user, 'UPDATE_' + req.params.kind.toUpperCase(), t.id, `${await nameOf(req.user)} sửa ${req.params.kind} của ${await nameOf(t)}`); res.json(rec);
}));
api.delete('/users/:id/:kind/:rid', wrap(async (req, res) => {
  const k = KIND[req.params.kind]; if (!k) throw E(404, 'Không tìm thấy'); const t = await target(req, k.m);
  const r = (await db.list(k.c)).find(x => x.id === req.params.rid && x.userId === t.id); if (!r) throw E(404, 'Không tìm thấy');
  await db.del(k.c, [r.id]); if (r.fileId) await dropFile(r.fileId);
  await audit(req.user, 'DELETE_' + req.params.kind.toUpperCase(), t.id, `${await nameOf(req.user)} xóa ${req.params.kind} của ${await nameOf(t)}`); res.json({ ok: true });
}));

// ---- File: luôn qua backend kiểm quyền ----
api.get('/files/:fid', wrap(async (req, res) => {
  const f = (await db.list('files')).find(x => x.id === req.params.fid), o = f && (await db.list('users')).find(u => u.id === f.ownerId);
  if (!f || !o || !canView(req.user, o)) throw E(404, 'Không tìm thấy hoặc không có quyền');
  res.type(f.mimeType); res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.originalName)}`);
  res.sendFile(path.join(UP, f.ownerId, f.type, f.storedName));
}));
api.get('/audit', wrap(async (req, res) => {
  if (req.user.role !== 'SUPER_ADMIN') throw E(403, 'Không có quyền');
  res.json((await db.list('audit_logs')).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 500));
}));
api.use((req, res) => res.status(404).json({ error: 'Không tìm thấy' }));

// ---- Static (chỉ index/css/js, KHÔNG phơi uploads) ----
app.use('/css', express.static(path.join(ROOT, 'css'))); app.use('/js', express.static(path.join(ROOT, 'js')));
app.get('/', (q, r) => r.sendFile(path.join(ROOT, 'index.html')));

(async () => {
  try {
    if (!(await db.list('users')).length) {
      if (process.env.SEED_DEMO === '1') {
        const result = await seedDemo(db, id, now);
        if (result.seeded) {
          console.log(`Đã seed ${result.count} tài khoản demo. Mật khẩu chung: ${result.password}`);
        }
      } else {
        const pw = process.env.SEED_ADMIN_PASSWORD, un = process.env.SEED_ADMIN_USER || 'admin';
        if (pw) { const uid = id('user'); await db.sync('users', [{ id: uid, username: un, passwordHash: await hash(pw), role: 'SUPER_ADMIN', status: 'ACTIVE', mustChangePassword: true, createdAt: now(), updatedAt: now(), lastLoginAt: null }]); await db.sync('profiles', [{ id: 'pf_' + uid, userId: uid, fullName: 'Quản trị hệ thống', profilePictureFileId: null }]); console.log('Đã tạo SUPER_ADMIN:', un); }
        else console.warn('Chưa có user. Đặt SEED_ADMIN_PASSWORD để tạo SUPER_ADMIN đầu tiên.');
      }
    }
  } catch (e) { console.error('Lỗi khởi tạo:', e.message); }
  app.listen(process.env.PORT || 3000, () => console.log(`HRM chạy tại http://localhost:${process.env.PORT || 3000} [KIO_MODE=${process.env.KIO_MODE || 'mem'}]`));
})();
