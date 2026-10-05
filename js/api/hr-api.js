/* API layer phía frontend: chỉ gọi backend /api (backend mới là nơi gọi KioStore). */
const HrAPI = (() => {
  const call = async (m, u, b) => {
    const o = { method: m, credentials: 'same-origin', headers: {} };
    if (b instanceof FormData) o.body = b; else if (b) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(b); }
    const r = await fetch('/api' + u, o), j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'Lỗi ' + r.status), { status: r.status });
    return j;
  };
  const fd = (data, files = {}) => { const f = new FormData(); f.append('data', JSON.stringify(data)); for (const k in files) if (files[k]) f.append(k, files[k]); return f; };
  return {
    login: (u, p) => call('POST', '/auth/login', { username: u, password: p }), logout: () => call('POST', '/auth/logout'), me: () => call('GET', '/auth/me'),
    changePassword: (o, n) => call('POST', '/auth/change-password', { oldPassword: o, newPassword: n }),
    users: (p = {}) => call('GET', '/users?' + new URLSearchParams(p)), restoreUser: id => call('POST', `/users/${id}/restore`),
    updateRec: (id, k, rid, d, file) => call('PUT', `/users/${id}/${k}/${rid}`, fd(d, { file })), user: id => call('GET', '/users/' + id),
    createUser: (d, avatar, extra = {}) => call('POST', '/users', fd(d, { avatar, ...extra })), updateProfile: (id, d, avatar) => call('PUT', `/users/${id}/profile`, fd(d, { avatar })),
    updateAccount: (id, d) => call('PUT', '/users/' + id, d), resetPassword: (id, p) => call('POST', `/users/${id}/reset-password`, { newPassword: p }),
    deleteUser: (id, hard) => call('DELETE', `/users/${id}${hard ? '?hard=1' : ''}`),
    addRec: (id, k, d, file) => call('POST', `/users/${id}/${k}`, fd(d, { file })), delRec: (id, k, rid) => call('DELETE', `/users/${id}/${k}/${rid}`),
    audit: () => call('GET', '/audit'),
  };
})();
