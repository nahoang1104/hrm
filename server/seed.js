const bcrypt = require('bcryptjs');
let argon2;
try { argon2 = require('argon2'); } catch {}

const hashPassword = async password =>
  argon2
    ? argon2.hash(password, { type: argon2.argon2id })
    : bcrypt.hash(password, 12);

const USERS = [
  ['sa01', 'Nguyễn Hoàng Anh', 'Nam', '1990-03-12', '001090001234', '0901000001', 'nguyen.hoanganh@example.com', 'SUPER_ADMIN'],
  ['sa02', 'Trần Minh Quân', 'Nam', '1988-07-25', '001088002345', '0901000002', 'tran.minhquan@example.com', 'SUPER_ADMIN'],
  ['sa03', 'Lê Thu Hà', 'Nữ', '1992-11-08', '001092003456', '0901000003', 'le.thuha@example.com', 'SUPER_ADMIN'],
  ['manager01', 'Phạm Thị Lan', 'Nữ', '1987-02-14', '001087004567', '0902000001', 'pham.thilan@example.com', 'HR_MANAGER'],
  ['manager02', 'Nguyễn Văn Hùng', 'Nam', '1989-05-21', '001089005678', '0902000002', 'nguyen.vanhung@example.com', 'HR_MANAGER'],
  ['manager03', 'Đỗ Ngọc Mai', 'Nữ', '1991-09-03', '001091006789', '0902000003', 'do.ngocmai@example.com', 'HR_MANAGER'],
  ['manager04', 'Vũ Thành Nam', 'Nam', '1986-12-17', '001086007890', '0902000004', 'vu.thanhnam@example.com', 'HR_MANAGER'],
  ['manager05', 'Hoàng Thị Hương', 'Nữ', '1990-04-29', '001090008901', '0902000005', 'hoang.thihuong@example.com', 'HR_MANAGER'],
  ['manager06', 'Bùi Minh Đức', 'Nam', '1988-08-11', '001088009012', '0902000006', 'bui.minhduc@example.com', 'HR_MANAGER'],
];

const EMPLOYEE_NAMES = [
  ['Nguyễn Thị Ngọc','Nữ','1995-01-15'],['Trần Văn Long','Nam','1994-03-27'],['Lê Thị Phương','Nữ','1996-06-09'],
  ['Phạm Minh Khoa','Nam','1993-10-18'],['Võ Thị Kim Anh','Nữ','1997-02-22'],['Đặng Quốc Bảo','Nam','1992-07-06'],
  ['Nguyễn Thị Thanh','Nữ','1995-09-14'],['Trần Minh Tâm','Nam','1994-11-30'],['Hoàng Thị Yến','Nữ','1996-04-12'],
  ['Bùi Văn Khánh','Nam','1993-08-24'],['Đỗ Thị Hạnh','Nữ','1998-01-07'],['Phan Anh Tuấn','Nam','1995-05-19'],
  ['Lê Hoài Nam','Nam','1992-09-28'],['Nguyễn Thùy Linh','Nữ','1997-12-03'],['Phạm Đức Thắng','Nam','1991-06-16'],
  ['Trần Thị Vân','Nữ','1996-10-05'],['Vũ Minh Hoàng','Nam','1994-02-13'],['Hoàng Ngọc Anh','Nữ','1998-07-20'],
  ['Nguyễn Quốc Duy','Nam','1993-03-04'],['Lê Thị Mai','Nữ','1995-11-17'],['Phạm Thanh Bình','Nam','1992-05-26'],
  ['Đặng Thị Huyền','Nữ','1997-08-08'],['Nguyễn Thành Đạt','Nam','1994-12-22'],['Trần Ngọc Bích','Nữ','1996-01-31'],
  ['Bùi Quốc Việt','Nam','1991-09-09'],['Võ Thị Mỹ Duyên','Nữ','1998-04-23'],['Phan Minh Châu','Nữ','1995-06-30'],
  ['Lê Văn Tùng','Nam','1993-10-10'],['Nguyễn Khánh Ly','Nữ','1997-02-05'],['Trần Đức Anh','Nam','1994-08-18']
];

EMPLOYEE_NAMES.forEach((x, i) => {
  const n = String(i + 1).padStart(2, '0');
  USERS.push([`employee${n}`, x[0], x[1], x[2], `00109${String(400000 + i)}`, `090300${String(i + 1).padStart(4,'0')}`, `employee${n}@example.com`, 'EMPLOYEE']);
});

const POSITIONS = ['Giám đốc nhân sự','Trưởng phòng nhân sự','Phó phòng nhân sự','Chuyên viên nhân sự','Chuyên viên tuyển dụng','Chuyên viên C&B','Chuyên viên đào tạo','Chuyên viên hành chính','Nhân viên nhân sự','Nhân viên hành chính'];
const DEPARTMENTS = ['Nhân sự','Hành chính','Tuyển dụng','Đào tạo','C&B'];
const DEGREES = [
  ['Cử nhân Quản trị nhân lực','Quản trị nhân lực','Đại học Kinh tế Quốc dân'],
  ['Cử nhân Quản trị kinh doanh','Quản trị kinh doanh','Đại học Kinh tế TP.HCM'],
  ['Cử nhân Luật','Luật kinh tế','Đại học Luật TP.HCM'],
  ['Cử nhân Kinh tế','Kinh tế','Đại học Ngoại thương'],
  ['Thạc sĩ Quản trị kinh doanh','Quản trị kinh doanh','Đại học Quốc gia TP.HCM']
];
const CERTS = [
  ['Chứng chỉ Tin học văn phòng','IIG Việt Nam'],
  ['Chứng chỉ Tiếng Anh B2','Cambridge Assessment'],
  ['Chứng chỉ Quản trị nhân sự','VietnamWorks Academy'],
  ['Chứng chỉ Luật lao động','Trường Đại học Luật TP.HCM']
];
const uid = (prefix, n) => `${prefix}_${String(n).padStart(3, '0')}`;
const date = (y, m, d) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

async function seedDemo(db, id, now) {
  if ((await db.list('users')).length) return { seeded: false, count: 0 };

  const password = process.env.SEED_DEMO_PASSWORD || 'Seed@2026!';
  const passwordHash = await hashPassword(password);
  const users = [], profiles = [], positions = [], work = [], degrees = [], certificates = [];

  USERS.forEach((x, i) => {
    const [username, fullName, gender, dateOfBirth, citizenID, phone, email, role] = x;
    const userId = uid('user', i + 1);
    const createdAt = now();
    users.push({ id:userId, username, passwordHash, role, status:'ACTIVE', mustChangePassword:false, createdAt, updatedAt:createdAt, lastLoginAt:null });
    profiles.push({ id:'pf_'+userId, userId, fullName, gender, nationality:'Việt Nam', dateOfBirth, citizenID, phone, email, address:i%3===0 ? `Số ${10+i}, đường Nguyễn Trãi, Quận ${1+(i%5)}, TP.HCM` : '', profilePictureFileId:null });
    positions.push({ id:uid('pos',i+1), userId, position:POSITIONS[i%POSITIONS.length], fromDate:date(2019+(i%6),1+(i%12),1+(i%25)), isCurrent:true });

    if (i % 3 !== 0) work.push({ id:uid('work',i+1), userId, company:i%2 ? 'Công ty TNHH ABC' : 'Công ty Cổ phần XYZ', department:DEPARTMENTS[i%DEPARTMENTS.length], position:POSITIONS[(i+3)%POSITIONS.length], fromDate:date(2017+(i%5),2+(i%10),1+(i%20)), toDate:date(2019+(i%5),3+(i%9),1+(i%20)), description:i%2 ? 'Phụ trách nghiệp vụ nhân sự và hồ sơ lao động.' : 'Thực hiện công tác tuyển dụng, đào tạo và hành chính.' });
    if (i % 4 !== 1) { const d=DEGREES[i%DEGREES.length]; degrees.push({ id:uid('degree',i+1), userId, name:d[0], major:d[1], school:d[2], issuedDate:date(2016+(i%8),6+(i%6),15) }); }
    if (i % 5 === 0 || i % 5 === 2) { const c=CERTS[i%CERTS.length]; certificates.push({ id:uid('cert',i+1), userId, name:c[0], issuer:c[1], issuedDate:date(2020+(i%5),4+(i%8),10), expiredDate:i%2 ? date(2027+(i%3),4,10) : '', certificateNumber:`CERT-${String(i+1).padStart(4,'0')}` }); }
  });

  await db.sync('users', users);
  await db.sync('profiles', profiles);
  await db.sync('current_positions', positions);
  await db.sync('work_history', work);
  await db.sync('degrees', degrees);
  await db.sync('certificates', certificates);
  return { seeded:true, count:users.length, password, breakdown:{ SUPER_ADMIN:3, HR_MANAGER:6, EMPLOYEE:30 }, records:{ profiles:profiles.length, positions:positions.length, work_history:work.length, degrees:degrees.length, certificates:certificates.length } };
}

module.exports = { seedDemo };
