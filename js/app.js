const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROLE = { SUPER_ADMIN: 'Super Admin', HR_MANAGER: 'Quản lý nhân sự', EMPLOYEE: 'Nhân viên' }, ST = { ACTIVE: 'Hoạt động', LOCKED: 'Đã khóa', DELETED: 'Đã xóa' };
const S = { me: null, view: 'profile', id: null, tab: 'info' };
const toast = (m, bad) => { const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = m; $('#toasts').append(t); setTimeout(() => t.remove(), 3500); };
const run = async f => { try { return await f(); } catch (e) { if (e.status === 401 && S.me) { S.me = null; return boot(); } toast(e.message, true); } };
const av = (fid, cls = '') => fid ? `<img class="av ${cls}" src="/api/files/${fid}" alt="">` : `<span class="av ${cls}"><i class="fa-solid fa-user"></i></span>`;
const fld = (n, l, o = {}) => `<label class="${o.full ? 'full' : ''}">${l}${o.req ? ' *' : ''}${o.opts ? `<select name="${n}" ${o.dis ? 'disabled' : ''}>${o.opts.map(x => `<option value="${x[0]}">${x[1]}</option>`).join('')}</select>`
  : o.area ? `<textarea name="${n}">${esc(o.v)}</textarea>` : `<input name="${n}" type="${o.t || 'text'}" ${o.dis ? 'disabled' : ''} value="${esc(o.v)}" ${o.req ? 'required' : ''} ${o.t === 'file' ? `accept="${n === 'avatar' ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,application/pdf'}"` : ''}>`}</label>`;
const formData = f => Object.fromEntries([...new FormData(f)].filter(([, v]) => typeof v === 'string'));
function modal(title, body, onOk, okText = 'Lưu') {
  const h = $('#modalHost'); h.innerHTML = `<div class="overlay"><form class="modal"><h3>${esc(title)}</h3><div class="mbody">${body}</div><div class="mfoot"><button type="button" class="btn" data-x>Hủy</button><button class="btn pri">${okText}</button></div></form></div>`;
  h.querySelector('[data-x]').onclick = () => h.innerHTML = '';
  h.querySelector('form').onsubmit = async e => { e.preventDefault(); if (await run(() => onOk(e.target))) h.innerHTML = ''; };
}
async function boot() { try { S.me = await HrAPI.me(); } catch { S.me = null; } S.me ? shell() : loginView(); }
function loginView() {
  S.q = ''; S.page = 1;
  $('#app').hidden = true; $('#login').hidden = false;
  $('#login').innerHTML = `<form class="card login-card"><h2><i class="fa-solid fa-users-gear"></i> Quản lý nhân sự</h2>${fld('u', 'Tên đăng nhập', { req: 1 })}${fld('p', 'Mật khẩu', { t: 'password', req: 1 })}<button class="btn pri" style="width:100%">Đăng nhập</button></form>`;
  $('#login form').onsubmit = async e => { e.preventDefault(); const f = e.target; await run(async () => { S.me = await HrAPI.login(f.u.value, f.p.value); S.view = 'profile'; shell(); }); };
}
function changePw() {
  modal('Đổi mật khẩu', fld('o', 'Mật khẩu hiện tại', { t: 'password', req: 1, full: 1 }) + fld('n', 'Mật khẩu mới (≥ 8 ký tự)', { t: 'password', req: 1, full: 1 }),
    async f => { await HrAPI.changePassword(f.o.value, f.n.value); S.me.mustChangePassword = false; toast('Đã đổi mật khẩu'); render(); return true; });
}
function shell() { $('#login').hidden = true; $('#app').hidden = false; render(); if (S.me.mustChangePassword) { toast('Bạn cần đổi mật khẩu trước khi sử dụng', true); changePw(); } }
function go(view, id) { S.view = view; S.id = id || null; S.tab = 'info'; render(); }
function render() {
  const r = S.me.role, nav = [['profile', 'fa-id-card', 'Hồ sơ cá nhân']];
  if (r !== 'EMPLOYEE') nav.push(['users', 'fa-users', 'Nhân sự & tài khoản']); if (r === 'SUPER_ADMIN') nav.push(['audit', 'fa-clipboard-list', 'Nhật ký hệ thống']);
  $('#nav').innerHTML = nav.map(n => `<div class="nav-item ${S.view === n[0] || (S.view === 'detail' && n[0] === 'users') ? 'on' : ''}" data-go="${n[0]}"><i class="fa-solid ${n[1]}"></i><span>${n[2]}</span></div>`).join('');
  const nm = (S.me.profile && S.me.profile.fullName) || S.me.username;
  $('#userbox').innerHTML = `${av(S.me.profile && S.me.profile.profilePictureFileId)}<span><b>${esc(nm)}</b> · ${ROLE[r]}</span><button class="btn sm" data-act="pw">Đổi mật khẩu</button><button class="btn sm" data-act="out">Đăng xuất</button>`;
  $('#title').textContent = ({ profile: 'Hồ sơ cá nhân', users: 'Nhân sự & tài khoản', audit: 'Nhật ký hệ thống', detail: 'Chi tiết nhân sự' })[S.view];
  if (S.me.mustChangePassword) return;
  run(() => ({ profile: () => detail(S.me.id), detail: () => detail(S.id), users: usersView, audit: auditView })[S.view]());
}
let qTimer;
async function usersView(keep) {
  const r = await HrAPI.users({ q: S.q || '', page: S.page || 1 }), sa = S.me.role === 'SUPER_ADMIN', base = (r.page - 1) * r.pageSize; S.page = r.page;
  if (!keep || !$('#q')) $('#view').innerHTML = `<div class="page-head"><h2>Danh sách nhân sự</h2><div class="tools"><input id="q" placeholder="Tìm theo tên, username, email, SĐT, CCCD…" value="${esc(S.q || '')}"><button class="btn pri" data-act="new"><i class="fa-solid fa-plus"></i> Tạo tài khoản</button></div></div><div id="tbl"></div>`;
  $('#tbl').innerHTML = `<table><tr><th>STT</th><th>Ảnh</th><th>Họ tên</th><th>Username</th><th>Role</th><th>Trạng thái</th><th>Ngày tạo</th><th>Thao tác</th></tr>${r.items.map((u, i) => `<tr><td>${base + i + 1}</td><td>${av(u.profile && u.profile.profilePictureFileId)}</td><td>${esc(u.profile && u.profile.fullName)}</td><td>${esc(u.username)}</td><td>${ROLE[u.role]}</td>
  <td><span class="badge ${u.status}" title="${u.deletedByName ? 'Xóa bởi ' + esc(u.deletedByName) : ''}">${ST[u.status]}</span></td><td>${esc(u.createdAt.slice(0, 10))}</td><td><button class="btn sm" data-go="detail" data-id="${u.id}">Xem</button>
  ${u.status === 'DELETED' ? (sa ? `<button class="btn sm" data-act="restore" data-id="${u.id}">Khôi phục</button>` : '') : u.canManage && u.id !== S.me.id ? `<button class="btn sm" data-act="lock" data-id="${u.id}" data-st="${u.status === 'LOCKED' ? 'ACTIVE' : 'LOCKED'}">${u.status === 'LOCKED' ? 'Mở khóa' : 'Khóa'}</button><button class="btn sm dng" data-act="del" data-id="${u.id}">Xóa</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8">Không có kết quả</td></tr>'}</table>
  <div class="pager"><span>Tổng ${r.total} nhân sự</span><button class="btn sm" data-act="page" data-p="${r.page - 1}" ${r.page <= 1 ? 'disabled' : ''}>‹ Trước</button><span>Trang ${r.page}/${r.pages}</span><button class="btn sm" data-act="page" data-p="${r.page + 1}" ${r.page >= r.pages ? 'disabled' : ''}>Sau ›</button></div>`;
}
document.addEventListener('input', e => { if (e.target.id === 'q') { clearTimeout(qTimer); qTimer = setTimeout(() => run(() => { S.q = e.target.value; S.page = 1; return usersView(true); }), 300); } });
async function auditView() {
  const l = await HrAPI.audit();
  $('#view').innerHTML = `<table><tr><th>Thời gian</th><th>Hành động</th><th>Mô tả</th></tr>${l.map(x => `<tr><td>${new Date(x.createdAt).toLocaleString('vi-VN')}</td><td><span class="badge">${esc(x.action)}</span></td><td>${esc(x.description)}</td></tr>`).join('')}</table>`;
}
const TABS = [['info', 'Hồ sơ'], ['positions', 'Chức vụ hiện tại'], ['work', 'Quá trình công tác'], ['degrees', 'Bằng cấp'], ['certificates', 'Chứng chỉ']];
const COLS = {
  positions: [['position', 'Chức vụ'], ['fromDate', 'Từ ngày']], work: [['company', 'Đơn vị'], ['department', 'Phòng ban'], ['position', 'Chức vụ'], ['fromDate', 'Từ'], ['toDate', 'Đến'], ['description', 'Mô tả']],
  degrees: [['name', 'Tên bằng'], ['major', 'Chuyên ngành'], ['school', 'Trường'], ['issuedDate', 'Ngày cấp']], certificates: [['name', 'Tên'], ['issuer', 'Nơi cấp'], ['issuedDate', 'Ngày cấp'], ['expiredDate', 'Hết hạn'], ['certificateNumber', 'Số']],
};
async function detail(id) {
  const d = await HrAPI.user(id), p = d.profile || {}, u = d.user; S.d = d;
  const canEdit = k => (k === 'positions' || k === 'work') ? d.canManage : d.canSelf;
  let body;
  if (S.tab === 'info') body = `<div class="card"><div class="grid">${[['Họ tên', p.fullName], ['Giới tính', p.gender], ['Quốc tịch', p.nationality], ['Ngày sinh', p.dateOfBirth], ['CCCD', p.citizenID], ['Điện thoại', p.phone], ['Email', p.email], ['Địa chỉ', p.address], ['Username', u.username], ['Đăng nhập gần nhất', u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('vi-VN') : '—']].map(x => `<div><small>${x[0]}</small>${esc(x[1]) || '—'}</div>`).join('')}</div>
    ${d.canSelf ? '<p><button class="btn" data-act="editp"><i class="fa-solid fa-pen"></i> Sửa thông tin</button></p>' : ''}</div>`;
  else { const k = S.tab; body = `${canEdit(k) ? `<p><button class="btn pri" data-act="add"><i class="fa-solid fa-plus"></i> Thêm</button></p>` : ''}<table><tr>${COLS[k].map(c => `<th>${c[1]}</th>`).join('')}${k === 'degrees' || k === 'certificates' ? '<th>File</th>' : ''}<th></th></tr>
    ${d[k].map(r => `<tr>${COLS[k].map(c => `<td>${esc(r[c[0]])}</td>`).join('')}${k === 'degrees' || k === 'certificates' ? `<td>${r.fileId ? `<a href="/api/files/${r.fileId}" target="_blank">Xem</a>` : '—'}</td>` : ''}<td>${canEdit(k) ? `<button class="btn sm" data-act="editrec" data-rid="${r.id}">Sửa</button> <button class="btn sm dng" data-act="delrec" data-rid="${r.id}">Xóa</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9">Chưa có dữ liệu</td></tr>'}</table>`; }
  const adm = d.canManage && u.id !== S.me.id ? `<span><button class="btn sm" data-act="reset">Đặt lại mật khẩu</button>${S.me.role === 'SUPER_ADMIN' ? (u.status === 'DELETED' ? ' <button class="btn sm" data-act="restore">Khôi phục</button>' : '') + ' <button class="btn sm" data-act="role">Đổi role</button> <button class="btn sm dng" data-act="hard">Xóa vĩnh viễn</button>' : ''}</span>` : '';
  $('#view').innerHTML = `${S.view === 'detail' ? '<p><button class="btn sm" data-go="users">← Danh sách</button></p>' : ''}<div class="head">${av(p.profilePictureFileId, 'lg')}<div><h2>${esc(p.fullName || u.username)}</h2>${ROLE[u.role]} · <span class="badge ${u.status}">${ST[u.status]}</span></div>${adm}</div>
  <div class="tabs">${TABS.map(t => `<div class="tab ${S.tab === t[0] ? 'on' : ''}" data-tab="${t[0]}">${t[1]}</div>`).join('')}</div>${body}`;
}
const ADD = {
  positions: [['position', 'Chức vụ', 1], ['fromDate', 'Từ ngày', 1, 'date']], work: [['company', 'Đơn vị', 1], ['department', 'Phòng ban'], ['position', 'Chức vụ', 1], ['fromDate', 'Từ ngày', 1, 'date'], ['toDate', 'Đến ngày', 0, 'date'], ['description', 'Mô tả']],
  degrees: [['name', 'Tên bằng', 1], ['major', 'Chuyên ngành'], ['school', 'Trường', 1], ['issuedDate', 'Ngày cấp', 0, 'date']], certificates: [['name', 'Tên chứng chỉ', 1], ['issuer', 'Nơi cấp', 1], ['issuedDate', 'Ngày cấp', 0, 'date'], ['expiredDate', 'Hết hạn', 0, 'date'], ['certificateNumber', 'Số chứng chỉ']],
};
const PFF = [['fullName', 'Họ tên', 1], ['gender', 'Giới tính', 1, 0, [['Nam', 'Nam'], ['Nữ', 'Nữ'], ['Khác', 'Khác']]], ['nationality', 'Quốc tịch', 1], ['dateOfBirth', 'Ngày sinh', 1, 'date'], ['citizenID', 'CCCD', 1], ['phone', 'Điện thoại', 1], ['email', 'Email', 1, 'email'], ['address', 'Địa chỉ']];
const LOCKED = ['fullName', 'gender', 'nationality', 'dateOfBirth', 'citizenID']; // EMPLOYEE không được sửa
const pf = (p = {}, lock = false) => PFF.map(f => fld(f[0], f[1], { req: f[2], t: f[3] || 'text', opts: f[4], v: p[f[0]], dis: lock && LOCKED.includes(f[0]) }));
const SUBS = ['positions', 'work', 'degrees', 'certificates'];
document.addEventListener('click', e => {
  const t = e.target.closest('[data-go],[data-tab],[data-act]'); if (!t) return; const D = t.dataset;
  if (D.go) return go(D.go, D.id); if (D.tab) { S.tab = D.tab; return render(); }
  const id = D.id || (S.view === 'profile' ? S.me.id : S.id), after = () => render();
  const A = {
    out: async () => { await run(HrAPI.logout); S.me = null; loginView(); }, pw: changePw,
    new: () => modal('Tạo tài khoản', fld('username', 'Username', { req: 1 }) + fld('password', 'Mật khẩu (≥ 8 ký tự)', { t: 'password', req: 1 }) + fld('role', 'Role', { opts: S.me.role === 'SUPER_ADMIN' ? Object.entries(ROLE) : [['EMPLOYEE', ROLE.EMPLOYEE]] }) + pf().join('') + fld('avatar', 'Ảnh đại diện (≤ 2MB)', { t: 'file', req: 1 })
      + SUBS.map(k => `<div class="full sechead"><b>${TABS.find(t => t[0] === k)[1]}</b><button type="button" class="btn sm" data-act="addrow" data-k="${k}"><i class="fa-solid fa-plus"></i> Thêm</button></div><div class="full" data-rows="${k}"></div>`).join(''),
      async f => {
        const data = formData(f), extra = {};
        SUBS.forEach(k => { data[k] = [...f.querySelectorAll(`[data-rows="${k}"] .rowbox`)].map((row, i) => {
          const fi = row.querySelector('input[type=file]'); if (fi && fi.files[0]) extra[`${k}_${i}`] = fi.files[0];
          return Object.fromEntries([...row.querySelectorAll('[data-f]')].filter(x => x.type !== 'file').map(x => [x.dataset.f, x.value])); }); });
        await HrAPI.createUser(data, f.avatar.files[0], extra); toast('Đã tạo tài khoản'); after(); return true; }),
    addrow: () => { const k = D.k, box = document.querySelector(`[data-rows="${k}"]`), row = document.createElement('div'); row.className = 'rowbox';
      row.innerHTML = ADD[k].map(x => fld(x[0], x[1], { req: x[2], t: x[3] || 'text', area: x[0] === 'description', full: x[0] === 'description' })).join('')
        + (k === 'degrees' || k === 'certificates' ? fld('file', 'File (PDF/ảnh ≤ 5MB)', { t: 'file', full: 1 }) : '')
        + '<button type="button" class="btn sm dng rm" data-act="delrow">Xóa dòng</button>';
      row.innerHTML = row.innerHTML.replace(/ name="/g, ' data-f="'); box.append(row); },
    delrow: () => t.closest('.rowbox').remove(),
    lock: async () => { await run(() => HrAPI.updateAccount(id, { status: D.st })); after(); },
    del: () => confirm('Xóa tài khoản này?') && run(async () => { await HrAPI.deleteUser(id); toast('Đã xóa'); after(); }),
    hard: () => confirm('XÓA VĨNH VIỄN toàn bộ dữ liệu và file của tài khoản này? Không thể hoàn tác.') && run(async () => { await HrAPI.deleteUser(id, true); toast('Đã xóa vĩnh viễn'); go('users'); }),
    reset: () => modal('Đặt lại mật khẩu', fld('n', 'Mật khẩu mới (≥ 8 ký tự)', { t: 'password', req: 1, full: 1 }), async f => { await HrAPI.resetPassword(id, f.n.value); toast('Đã đặt lại mật khẩu'); return true; }),
    role: () => modal('Đổi role', fld('role', 'Role mới', { opts: Object.entries(ROLE), full: 1 }), async f => { await HrAPI.updateAccount(id, { role: f.role.value }); after(); return true; }),
    editp: () => modal('Sửa thông tin cá nhân', (S.me.role === 'EMPLOYEE' ? '<div class="hint">Họ tên, giới tính, quốc tịch, ngày sinh, CCCD do bộ phận nhân sự quản lý.</div>' : '') + pf(S.d.profile, S.me.role === 'EMPLOYEE').join('') + fld('avatar', 'Đổi ảnh đại diện', { t: 'file' }), async f => { await HrAPI.updateProfile(id, formData(f), f.avatar.files[0]); if (id === S.me.id) S.me = await HrAPI.me(); after(); return true; }),
    add: () => { const k = S.tab; modal('Thêm', ADD[k].map(f => fld(f[0], f[1], { req: f[2], t: f[3] || 'text', area: f[0] === 'description' })).join('') + (k === 'degrees' || k === 'certificates' ? fld('file', 'File (PDF/ảnh ≤ 5MB)', { t: 'file', full: 1 }) : ''),
      async f => { await HrAPI.addRec(id, k, formData(f), f.file && f.file.files[0]); after(); return true; }); },
    page: () => { S.page = +D.p; run(() => usersView(true)); },
    restore: () => confirm('Khôi phục tài khoản này?') && run(async () => { await HrAPI.restoreUser(id); toast('Đã khôi phục tài khoản'); after(); }),
    editrec: () => { const k = S.tab, r = S.d[k].find(x => x.id === D.rid), hasFile = k === 'degrees' || k === 'certificates';
      modal('Sửa', ADD[k].map(f => fld(f[0], f[1], { req: f[2], t: f[3] || 'text', area: f[0] === 'description', v: r[f[0]] })).join('') + (hasFile ? fld('file', 'Thay file (bỏ trống = giữ file cũ)', { t: 'file', full: 1 }) : ''),
        async f => { await HrAPI.updateRec(id, k, D.rid, formData(f), f.file && f.file.files[0]); after(); return true; }); },
    delrec: () => confirm('Xóa dòng này?') && run(async () => { await HrAPI.delRec(id, S.tab, D.rid); after(); }),
  };
  A[D.act] && A[D.act]();
});
boot();
