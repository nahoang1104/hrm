# Quản lý nhân sự (HRM)

Frontend JS thuần + backend Node.js/Express. Dữ liệu lưu trên KIO qua `KioStore`.

```
UI (js/app.js) → js/api/hr-api.js → /api (server/index.js) → server/kio.js → KioStore (vendor/kio-api.js, KHÔNG sửa) → kio.dvqt.vn
```
`kio-api.js` chỉ chạy được trong trình duyệt, nên `server/kio.js` nạp nguyên văn file đó vào Node và thay `list.js`/`krud.js`
bằng shim gọi cùng endpoint (`/list.php`, `/krud.php`).

## Chạy
```
npm install
cp .env.example .env    # sửa SEED_ADMIN_PASSWORD
npm start               # http://localhost:3000
```
- `KIO_MODE=mem` (mặc định): KIO giả trong bộ nhớ, **không ghi lên KIO**, mất dữ liệu khi tắt server.
- `KIO_MODE=kio`: ghi lên KIO thật. Bảng `hrm_users, hrm_profiles, hrm_current_positions, hrm_work_history, hrm_degrees, hrm_certificates, hrm_files, hrm_audit_logs` (đổi prefix bằng `KIO_PREFIX`).
- Lần đầu chưa có user: tạo SUPER_ADMIN từ `SEED_ADMIN_USER/PASSWORD` (bắt đổi mật khẩu ở lần đăng nhập đầu).
- Chạy sau HTTPS thì đặt `COOKIE_SECURE=1`.

## Phân quyền
| | SUPER_ADMIN | HR_MANAGER | EMPLOYEE |
|---|---|---|---|
| Xem/tạo/sửa/khóa/reset MK | tất cả | chỉ EMPLOYEE (xem được HR khác, không thấy SUPER_ADMIN) | – |
| Đổi role, xóa cứng | ✔ | – | – |
| Xóa mềm | ✔ | EMPLOYEE | – |
| Chức vụ hiện tại, công tác | sửa | sửa EMPLOYEE | chỉ xem |
| Hồ sơ, bằng cấp, chứng chỉ | sửa | sửa EMPLOYEE | sửa của mình |
| Nhật ký | ✔ | – | – |
Chặn: tự xóa/khóa mình, xóa/khóa/hạ quyền SUPER_ADMIN cuối cùng.

## Bảo mật đã làm
Argon2id (fallback bcrypt) · cookie httpOnly+SameSite=Strict · khóa 15 phút sau 5 lần sai · file kiểm MIME + đuôi + magic bytes + dung lượng, tên lưu ngẫu nhiên, backend quyết định đường dẫn · `/uploads` không public, mọi file qua `GET /api/files/:id` · rollback bù khi tạo user lỗi · audit log append-only.
Lưu ý: session nằm trong bộ nhớ (restart server là đăng nhập lại), chưa có CSRF token riêng ngoài SameSite.
