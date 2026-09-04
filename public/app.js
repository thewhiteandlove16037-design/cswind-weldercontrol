if(typeof qrcode !== 'undefined' && qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']){
  /* qrcode-generator's default byte encoder does charCodeAt(i)&0xff per UTF-16 code
     unit, which silently corrupts Vietnamese diacritics (any code point above 0xFF).
     Switch to the library's own UTF-8 encoder before any QR is ever generated, so
     Vietnamese text round-trips correctly on a real phone scan. */
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
}

/* ================= DATA (loaded from the real backend, not embedded) ================= */
let WELDERS = [];
let SETTINGS = { baseUrl:'', warnDays:45, emails:'', dataAsOf:null, updatedAt:null };
let ACCOUNTS = [];
let session = null; // {name, role} -- restored from the httpOnly session cookie via GET /api/auth/me
let readOnlyMode = false; // flipped true only if a write unexpectedly comes back 403 (defense in depth)

const ACTIVE_TAB_KEY = 'cswind_active_tab';
function saveActiveTab(tab){
  try{ localStorage.setItem(ACTIVE_TAB_KEY, tab); }catch(e){}
}
function loadActiveTab(){
  try{ return localStorage.getItem(ACTIVE_TAB_KEY) || 'lookup'; }catch(e){ return 'lookup'; }
}

let lkStatus = '', lkProcess = '', lkJoint = ''; // Lookup tab filter state
let adminSelectedIds = new Set(); // Master List: checked rows, keyed by idWelder
let adminSortKey = 'idWelder', adminSortDir = 'asc'; // Master List: current sort column/direction

/* ================= API ================= */
async function apiFetch(method, url, body){
  const opts = { method, credentials:'include', headers:{} };
  if(body !== undefined){
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  let data = null;
  try{ data = await res.json(); }catch(e){ /* empty/non-JSON body */ }
  if(!res.ok){
    const err = new Error((data && data.error) || ('http_'+res.status));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
/* Shared handling for 401/403 on write actions: 401 means the session is gone (expired
   cookie, logged out elsewhere) -- drop back to the login screen. 403 means the signed-in
   role genuinely isn't allowed to do this (server-enforced, not just a hidden button) --
   toast the Vietnamese message the server sent and leave the data untouched. Returns true
   if it handled the error (caller should stop), false if the caller should handle it. */
function handleWriteError(err){
  if(err && err.status === 401){
    session = null;
    toast(L.sessionExpired);
    renderAdmin();
    return true;
  }
  if(err && err.status === 403){
    toast((err.data && err.data.message) || L.forbiddenGeneric);
    readOnlyMode = true;
    applyReadOnlyUi();
    return true;
  }
  return false;
}

/* ================= LANGUAGE ================= */
const L_VI = {
  appTitle: 'CSWIND QR-ID Thợ hàn',
  tabLookup: 'Tra cứu', tabAdmin: 'Quản trị',
  searchPlaceholder: 'Tìm theo mã thợ hàn, mã nhân viên hoặc họ tên…',
  filterAll: 'Tất cả trạng thái',
  statusOk: 'Còn hạn', statusWarn: 'Sắp hết hạn', statusBad: 'Hết hạn', statusNone: 'Chưa có chứng chỉ',
  statTotal: 'Tổng số thợ hàn', statOk: 'Còn hạn', statWarn: 'Sắp hết hạn', statBad: 'Hết hạn',
  certsSuffix: 'chứng chỉ',
  noResults: 'Không tìm thấy thợ hàn phù hợp.',
  qrScanHint: 'Quét mã QR để xem thông tin này trực tiếp trên điện thoại — không cần mạng.',
  colProcess: 'Quy trình', colValidUntil: 'Hết hạn', colStatus: 'Trạng thái', colOriginalFile: 'File gốc',
  noOriginalFile: 'Chưa có file gốc', viewOriginalCert: 'Xem chứng chỉ gốc', noCertsRecorded: 'Chưa có chứng chỉ được ghi nhận.',
  certOriginalTitle: 'Chứng chỉ gốc', qrTitle: 'Mã QR',
  certOriginalHint: 'Nhấn giữ (điện thoại) hoặc chuột phải → Lưu ảnh để tải về.',
  qrHint: 'Mã QR này chứa trực tiếp thông tin thợ hàn — quét ra là thấy ngay, không cần mạng. Đây là ảnh chụp tại thời điểm tạo; nếu hồ sơ thay đổi, hãy mở lại và in mã QR mới.',
  seeFullProfile: 'Xem đầy đủ',
  loginTitle: 'Đăng nhập quản trị', loginUsername: 'Tên đăng nhập', loginPassword: 'Mật khẩu',
  loginBtn: 'Đăng nhập', loginError: 'Sai tên đăng nhập hoặc mật khẩu.', logoutBtn: 'Đăng xuất',
  loginChecking: 'Đang kiểm tra…',
  sessionExpired: 'Phiên đăng nhập đã hết hạn — vui lòng đăng nhập lại.',
  forbiddenGeneric: 'Bạn không có quyền thực hiện thao tác này.',
  loadError: 'Không tải được dữ liệu — kiểm tra kết nối mạng và thử lại.',
  settingsTitle: 'Cài đặt', settingsBaseUrl: 'Base URL (đường link đầy đủ của app này, để hiện trong QR/hồ sơ)',
  settingsWarnDays: 'Số ngày cảnh báo sắp hết hạn', settingsEmails: 'Danh sách email nhận nhắc nhở (phân cách bằng dấu phẩy)',
  settingsSave: 'Lưu cài đặt', settingsSaved: 'Đã lưu cài đặt.',
  reminderTitle: 'Soạn email nhắc nhở chứng chỉ sắp/đã hết hạn',
  reminderWillSendTo: 'Sẽ gửi tới:', reminderNoEmails: 'Chưa có email nào trong Cài đặt — thêm email trước khi soạn.',
  reminderPreviewCount: n=>`${n} chứng chỉ sắp/đã hết hạn sẽ được đưa vào email.`,
  reminderPreviewNone: 'Hiện không có chứng chỉ nào sắp hoặc đã hết hạn.',
  reminderComposeBtn: 'Soạn email nhắc nhở', reminderSentToast: 'Đã mở email nhắc nhở — kiểm tra ứng dụng email của bạn.',
  reminderSubjectLabel: 'Tiêu đề', reminderBodyLabel: 'Nội dung',
  reminderNoEmailsToast: 'Chưa có email người nhận — thêm trong Cài đặt.',
  masterListTitle: n=>`Danh sách tổng (${n} thợ hàn)`,
  masterSearchPlaceholder: 'Tìm theo mã hoặc tên…',
  filterProcessAll: 'Tất cả quy trình',
  addWelderBtn: '+ Thêm thợ hàn', importExcelBtn: '⭱ Nhập từ Excel',
  exportTemplateBtn: '⭳ Xuất file mẫu Excel',
  colCode: 'Mã', colName: 'Họ tên', colEmployeeId: 'Mã NV', colCertCount: 'Số CC', colStatusShort: 'Trạng thái',
  viewBtn: 'Xem', editBtn: 'Sửa', qrBtn: 'QR', deleteBtn: 'Xoá',
  confirmDelete: idw=>`Xoá thợ hàn ${idw}? Hành động này không thể hoàn tác.`,
  welderAddedToast: idw=>`Đã thêm ${idw} — mã QR tương ứng đã sẵn sàng.`,
  welderUpdatedToast: idw=>`Đã lưu ${idw}.`,
  welderDeletedToast: idw=>`Đã xoá ${idw}.`,
  readOnlyBanner: 'Bạn đang xem ở chế độ chỉ đọc — thay đổi sẽ không được lưu lại. Liên hệ quản trị viên để được cấp quyền chỉnh sửa.',
  footerNote: (date,n)=>`CSWIND Việt Nam · Dữ liệu thợ hàn cập nhật đến ${date} · ${n} thợ hàn`,
  welderFormTitleAdd: 'Thêm thợ hàn mới', welderFormTitleEdit: idw=>`Sửa hồ sơ — ${idw}`,
  fieldCode: 'Mã thợ hàn', fieldName: 'Họ và tên', fieldEmployeeId: 'Mã nhân viên', fieldCompany: 'Công ty',
  certsSectionTitle: 'Chứng chỉ', addCertBtn: '+ Thêm chứng chỉ', removeCertBtn: 'Xoá',
  fieldProcess: 'Quy trình hàn', fieldType: 'Loại', fieldTestDate: 'Ngày kiểm tra', fieldValidDate: 'Ngày hết hạn', fieldStandard: 'Tiêu chuẩn',
  saveBtn: 'Lưu', cancelBtn: 'Huỷ',
  codeExistsError: 'Mã thợ hàn này đã tồn tại.', codeRequiredError: 'Vui lòng nhập mã thợ hàn.', nameRequiredError: 'Vui lòng nhập họ tên.',
  importTitle: 'Nhập dữ liệu từ file Excel',
  importIntro: 'Chọn file Excel theo đúng định dạng "Danh sách đăng ký thợ hàn" (có các cột ID Welder, WELDER NAME, ID Employee, WELDING PROCESS, Valid Date…). Thợ hàn đã có sẽ được cập nhật; thợ hàn mới sẽ được thêm vào — dữ liệu hiện có không bị xoá. Chưa có file đúng định dạng? Dùng nút "Xuất file mẫu Excel" ở màn hình quản lý để tải file mẫu.',
  importChoose: 'Chọn file…', importBtn: 'Nhập dữ liệu', importClose: 'Đóng',
  importResult: (added,updated)=>`Đã thêm ${added} thợ hàn mới, cập nhật ${updated} thợ hàn đã có.`,
  importNoRows: 'Không đọc được dòng dữ liệu nào phù hợp trong file — kiểm tra lại định dạng cột.',
  importParsing: 'Đang đọc file…',
  qrInfoHeader: 'CSWIND — QR-ID Thợ hàn', qrInfoNameLabel: 'Họ tên', qrInfoCodeLabel: 'Mã', qrInfoEmpIdLabel: 'Mã NV',
  qrInfoCompanyLabel: 'Công ty', qrInfoStatusLabel: 'Trạng thái', qrInfoCertsHeading: 'Chứng chỉ:',
  qrInfoValidDateLabel: 'Ngày hết hạn', qrInfoMoreLabel: 'Xem đầy đủ', qrInfoNoCerts: 'Chưa có chứng chỉ được ghi nhận.',
  qrInfoUpdatedLabel: 'Cập nhật hồ sơ', profileUpdatedLabel: 'Cập nhật hồ sơ',
  filterSegmentAll: 'Tất cả công đoạn SX', filterAllShort: 'Tất cả',
  publicInfoBanner: 'Trang tra cứu công khai của CSWIND Việt Nam — ai có link cũng xem được, không cần tài khoản. Nhân viên có tài khoản đăng nhập ở tab Quản trị để thêm/sửa dữ liệu, xem báo cáo sắp hết hạn và in mã QR.',
  accountsTitle: 'Quản lý tài khoản quản trị', accountsSuperOnlyNote: 'Chỉ Quản trị cấp cao mới thấy mục này',
  accountsGrantTitle: 'Cấp tài khoản quản trị mới', accountsDisplayName: 'Tên đăng nhập', accountsTempPin: 'Mật khẩu tạm thời',
  accountsRole: 'Cấp quyền', accountsRoleEditorHint: 'thêm/sửa dữ liệu', accountsCreateBtn: 'Tạo tài khoản', accountsResetPin: 'Đặt lại mật khẩu',
  accountsResetPinPrompt: name=>`Nhập mật khẩu mới cho ${name} (tối thiểu 4 ký tự):`,
  accountsNameRequired: 'Vui lòng nhập tên đăng nhập.', accountsPinTooShort: 'Mật khẩu cần tối thiểu 4 ký tự.', accountsNameExists: 'Tên đăng nhập này đã tồn tại.',
  accountsCreatedToast: name=>`Đã tạo tài khoản ${name}.`, accountsPinResetToast: name=>`Đã đặt lại mật khẩu cho ${name}.`,
  accountsRoleChangedToast: name=>`Đã đổi cấp quyền của ${name}.`,
  accountsDeleteBtn: 'Xoá', accountsDeletedToast: name=>`Đã xoá tài khoản ${name}.`,
  accountsConfirmDelete: name=>`Xoá tài khoản ${name}? Hành động này không thể hoàn tác.`,
  accountsLastSuperadmin: 'Không thể xoá — đây là Quản trị cấp cao duy nhất còn lại.',
  roleSuperadmin: 'Quản trị cấp cao', roleEditor: 'Quản trị viên', roleViewer: 'Chỉ xem',
  fieldPhoto: 'Ảnh thợ hàn', removePhotoBtn: 'Xoá ảnh', fieldOriginalCert: 'Chứng chỉ gốc',
  photoReadError: 'Không đọc được ảnh này — vui lòng chọn file ảnh khác.',
  uploadPhotoBtn: 'Chọn ảnh…', deleteTitle: idw=>`Xoá thợ hàn ${idw}`,
  reminderExpiringTitle: 'Sắp / đã hết hạn — cần gia hạn', colRemaining: 'Còn lại',
  daysRemaining: n=>`${n} ngày`, daysOverdue: n=>`Quá hạn ${n} ngày`,
  themeLight: 'Trắng', themeDark: 'Đen', themeSystem: 'Hệ thống',
  selectedCount: n=>`Đã chọn ${n}`, deleteSelectedBtn: 'Xoá mục đã chọn', refreshBtn: 'Làm mới',
  confirmDeleteSelected: n=>`Xoá ${n} thợ hàn đã chọn? Hành động này không thể hoàn tác.`,
  deleteSelectedTitle: n=>`Xoá ${n} thợ hàn`, selectedDeletedToast: n=>`Đã xoá ${n} thợ hàn.`,
};
const L_EN = {
  appTitle: 'CSWIND QR-ID Welder',
  tabLookup: 'Lookup', tabAdmin: 'Admin',
  searchPlaceholder: 'Search by welder ID, employee ID or name…',
  filterAll: 'All statuses',
  statusOk: 'Valid', statusWarn: 'Expiring soon', statusBad: 'Expired', statusNone: 'No certificates',
  statTotal: 'Total welders', statOk: 'Valid', statWarn: 'Expiring soon', statBad: 'Expired',
  certsSuffix: 'certificates',
  noResults: 'No matching welders found.',
  qrScanHint: 'Scan the QR code to see this information directly on a phone — no network needed.',
  colProcess: 'Process', colValidUntil: 'Valid until', colStatus: 'Status', colOriginalFile: 'Original file',
  noOriginalFile: 'No original file', viewOriginalCert: 'View original certificate', noCertsRecorded: 'No certificates recorded.',
  certOriginalTitle: 'Original certificate', qrTitle: 'QR code',
  certOriginalHint: 'Press and hold (phone) or right-click → Save image to download.',
  qrHint: 'This QR code contains the welder\'s information directly — scanning it shows the details immediately, no network needed. This is a snapshot taken when generated; if the record changes, reopen and print a new QR code.',
  seeFullProfile: 'Full profile',
  loginTitle: 'Admin sign-in', loginUsername: 'Username', loginPassword: 'Password',
  loginBtn: 'Sign in', loginError: 'Incorrect username or password.', logoutBtn: 'Sign out',
  loginChecking: 'Checking…',
  sessionExpired: 'Your session has expired — please sign in again.',
  forbiddenGeneric: 'You do not have permission to do this.',
  loadError: 'Could not load data — check your connection and try again.',
  settingsTitle: 'Settings', settingsBaseUrl: 'Base URL (this app\'s full link, shown in QR/profile)',
  settingsWarnDays: 'Days before expiry to warn', settingsEmails: 'Reminder recipient emails (comma-separated)',
  settingsSave: 'Save settings', settingsSaved: 'Settings saved.',
  reminderTitle: 'Compose reminder email for expiring/expired certificates',
  reminderWillSendTo: 'Will send to:', reminderNoEmails: 'No email set in Settings yet — add one before composing.',
  reminderPreviewCount: n=>`${n} expiring/expired certificate(s) will be included.`,
  reminderPreviewNone: 'No certificates are currently expiring or expired.',
  reminderComposeBtn: 'Compose reminder email', reminderSentToast: 'Reminder email opened — check your email app.',
  reminderSubjectLabel: 'Subject', reminderBodyLabel: 'Body',
  reminderNoEmailsToast: 'No recipient email — add one in Settings.',
  masterListTitle: n=>`Master list (${n} welders)`,
  masterSearchPlaceholder: 'Search by ID or name…',
  filterProcessAll: 'All processes',
  addWelderBtn: '+ Add welder', importExcelBtn: '⭱ Import from Excel',
  exportTemplateBtn: '⭳ Export Excel template',
  colCode: 'ID', colName: 'Name', colEmployeeId: 'Employee ID', colCertCount: '# Certs', colStatusShort: 'Status',
  viewBtn: 'View', editBtn: 'Edit', qrBtn: 'QR', deleteBtn: 'Delete',
  confirmDelete: idw=>`Delete welder ${idw}? This cannot be undone.`,
  welderAddedToast: idw=>`${idw} added — its QR code is ready.`,
  welderUpdatedToast: idw=>`${idw} saved.`,
  welderDeletedToast: idw=>`${idw} deleted.`,
  readOnlyBanner: 'You are viewing in read-only mode — changes will not be saved. Contact an admin for edit access.',
  footerNote: (date,n)=>`CSWIND Vietnam · Welder data current as of ${date} · ${n} welders`,
  welderFormTitleAdd: 'Add new welder', welderFormTitleEdit: idw=>`Edit profile — ${idw}`,
  fieldCode: 'Welder ID', fieldName: 'Full name', fieldEmployeeId: 'Employee ID', fieldCompany: 'Company',
  certsSectionTitle: 'Certificates', addCertBtn: '+ Add certificate', removeCertBtn: 'Remove',
  fieldProcess: 'Welding process', fieldType: 'Type', fieldTestDate: 'Test date', fieldValidDate: 'Valid until', fieldStandard: 'Standard',
  saveBtn: 'Save', cancelBtn: 'Cancel',
  codeExistsError: 'This welder ID already exists.', codeRequiredError: 'Please enter a welder ID.', nameRequiredError: 'Please enter a name.',
  importTitle: 'Import data from Excel',
  importIntro: 'Choose an Excel file in the same format as the "Welder register" (columns ID Welder, WELDER NAME, ID Employee, WELDING PROCESS, Valid Date…). Existing welders are updated; new ones are added — nothing existing is deleted. Don\'t have a file in that format yet? Use the "Export Excel template" button on the admin screen to download one.',
  importChoose: 'Choose file…', importBtn: 'Import', importClose: 'Close',
  importResult: (added,updated)=>`Added ${added} new welder(s), updated ${updated} existing welder(s).`,
  importNoRows: 'No matching data rows could be read from this file — check the column format.',
  importParsing: 'Reading file…',
  qrInfoHeader: 'CSWIND — QR-ID Welder', qrInfoNameLabel: 'Name', qrInfoCodeLabel: 'ID', qrInfoEmpIdLabel: 'Employee ID',
  qrInfoCompanyLabel: 'Company', qrInfoStatusLabel: 'Status', qrInfoCertsHeading: 'Certificates:',
  qrInfoValidDateLabel: 'Valid until', qrInfoMoreLabel: 'Full profile', qrInfoNoCerts: 'No certificates recorded.',
  qrInfoUpdatedLabel: 'Record updated', profileUpdatedLabel: 'Record updated',
  filterSegmentAll: 'All production stages', filterAllShort: 'All',
  publicInfoBanner: 'CSWIND Vietnam public welder lookup — anyone with the link can view it, no account needed. Staff with an account sign in on the Admin tab to add/edit data, view the expiring report and print QR codes.',
  accountsTitle: 'Manage admin accounts', accountsSuperOnlyNote: 'Only super admins see this section',
  accountsGrantTitle: 'Grant a new admin account', accountsDisplayName: 'Username', accountsTempPin: 'Temporary password',
  accountsRole: 'Permission level', accountsRoleEditorHint: 'add/edit data', accountsCreateBtn: 'Create account', accountsResetPin: 'Reset password',
  accountsResetPinPrompt: name=>`Enter a new password for ${name} (at least 4 characters):`,
  accountsNameRequired: 'Please enter a username.', accountsPinTooShort: 'The password must be at least 4 characters.', accountsNameExists: 'This login name already exists.',
  accountsCreatedToast: name=>`Account ${name} created.`, accountsPinResetToast: name=>`Password reset for ${name}.`,
  accountsRoleChangedToast: name=>`Role changed for ${name}.`,
  accountsDeleteBtn: 'Delete', accountsDeletedToast: name=>`Account ${name} deleted.`,
  accountsConfirmDelete: name=>`Delete account ${name}? This cannot be undone.`,
  accountsLastSuperadmin: 'Cannot delete — this is the last remaining super admin.',
  roleSuperadmin: 'Super admin', roleEditor: 'Admin', roleViewer: 'View only',
  fieldPhoto: 'Welder photo', removePhotoBtn: 'Remove photo', fieldOriginalCert: 'Original certificate',
  photoReadError: 'Could not read this image — please choose another file.',
  uploadPhotoBtn: 'Choose photo…', deleteTitle: idw=>`Delete welder ${idw}`,
  reminderExpiringTitle: 'Expiring / already expired — needs renewal', colRemaining: 'Remaining',
  daysRemaining: n=>`${n} day(s)`, daysOverdue: n=>`${n} day(s) overdue`,
  themeLight: 'Light', themeDark: 'Dark', themeSystem: 'System',
  selectedCount: n=>`${n} selected`, deleteSelectedBtn: 'Delete selected', refreshBtn: 'Refresh',
  confirmDeleteSelected: n=>`Delete ${n} selected welder(s)? This cannot be undone.`,
  deleteSelectedTitle: n=>`Delete ${n} welder(s)`, selectedDeletedToast: n=>`${n} welder(s) deleted.`,
};
let currentLang = 'vi';
let L = L_VI;
function setLang(lang){
  currentLang = lang;
  L = lang==='en' ? L_EN : L_VI;
  $all('.lang-btn').forEach(b=> b.classList.toggle('active', b.dataset.lang===lang));
  document.title = L.appTitle;
  renderStaticText();
  renderAll();
}
function renderStaticText(){
  $('#app-title').textContent = L.appTitle;
  $('#tabbtn-lookup').textContent = L.tabLookup;
  $('#tabbtn-admin').textContent = L.tabAdmin;
  $('#search-box').placeholder = L.searchPlaceholder;
  $('#readonly-banner').textContent = L.readOnlyBanner;
  $('#public-info-banner').textContent = L.publicInfoBanner;
  $('.theme-btn[data-theme-choice="light"]').textContent = L.themeLight;
  $('.theme-btn[data-theme-choice="dark"]').textContent = L.themeDark;
  $('.theme-btn[data-theme-choice="system"]').textContent = L.themeSystem;
  renderSessionBadge();
}

/* ================= UTIL ================= */
function $(sel){ return document.querySelector(sel); }
function $all(sel){ return Array.from(document.querySelectorAll(sel)); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtDate(iso){ if(!iso) return '—'; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
function fmtDateTime(d){ const pad=n=>String(n).padStart(2,'0'); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function todayISO(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function initialsFor(name){
  const parts = String(name||'').trim().split(/\s+/).filter(Boolean);
  const last = parts[parts.length-1] || '';
  return last.charAt(0).toUpperCase();
}

/* ================= THEME (Trắng / Đen / Hệ thống) ================= */
let themePref = 'system';
function loadThemePref(){
  try{
    const v = localStorage.getItem('cswind_theme');
    if(v==='light' || v==='dark' || v==='system') themePref = v;
  }catch(e){}
}
function saveThemePref(v){
  try{ localStorage.setItem('cswind_theme', v); }catch(e){}
}
function applyTheme(){
  const root = document.documentElement;
  if(themePref==='light'){ root.setAttribute('data-theme','light'); }
  else if(themePref==='dark'){ root.setAttribute('data-theme','dark'); }
  else{ root.removeAttribute('data-theme'); }
  $all('.theme-btn').forEach(b=> b.classList.toggle('active', b.dataset.themeChoice===themePref));
}
function setTheme(v){
  themePref = v;
  saveThemePref(v);
  applyTheme();
}
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toast._h); toast._h=setTimeout(()=>t.classList.remove('show'), 2600); }

/* ================= IN-APP CONFIRM/PROMPT MODAL ================= */
let _confirmResolve = null;
function openConfirmModal({title, message, showInput=false, inputPlaceholder='', confirmLabel, cancelLabel, danger=false}){
  return new Promise(resolve=>{
    _confirmResolve = resolve;
    $('#confirm-title').textContent = title || '';
    $('#confirm-message').textContent = message || '';
    $('#confirm-err').textContent = '';
    $('#confirm-input-wrap').style.display = showInput ? 'block' : 'none';
    $('#confirm-input').value = '';
    $('#confirm-input').placeholder = inputPlaceholder || '';
    $('#confirm-cancel-btn').textContent = cancelLabel || L.cancelBtn;
    $('#confirm-ok-btn').textContent = confirmLabel || L.saveBtn;
    $('#confirm-ok-btn').className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
    $('#confirm-overlay').classList.add('open');
    if(showInput) setTimeout(()=>$('#confirm-input').focus(), 30);
  });
}
function closeConfirmModal(result){
  $('#confirm-overlay').classList.remove('open');
  if(_confirmResolve){ const r = _confirmResolve; _confirmResolve = null; r(result); }
}

/* ================= IMAGE UPLOAD (welder photo / original cert scan) =================
   Client-side resize+compress via canvas before storing as a data: URL, so uploaded
   photos don't bloat the record the way raw phone photos would. */
function readImageCompressed(file, maxDim, quality){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = ()=> reject(reader.error || new Error('read error'));
    reader.onload = ()=>{
      const img = new Image();
      img.onerror = ()=> reject(new Error('bad image'));
      img.onload = ()=>{
        let w = img.width, h = img.height;
        if(w > maxDim || h > maxDim){
          if(w >= h){ h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function certStatus(validDate){
  if(!validDate) return 'none';
  const warnDays = SETTINGS.warnDays || 45;
  const today = new Date(todayISO());
  const vd = new Date(validDate);
  const diffDays = Math.round((vd - today) / 86400000);
  if(diffDays < 0) return 'bad';
  if(diffDays <= warnDays) return 'warn';
  return 'ok';
}
function welderOverallStatus(w){
  if(!w.certificates || !w.certificates.length) return 'none';
  const statuses = w.certificates.map(c=>certStatus(c.validDate));
  if(statuses.includes('bad')) return 'bad';
  if(statuses.includes('warn')) return 'warn';
  return 'ok';
}
function statusLabel(st){
  return {ok:L.statusOk, warn:L.statusWarn, bad:L.statusBad, none:L.statusNone}[st] || st;
}
function statusBadge(st){
  const cls = {ok:'badge-ok', warn:'badge-warn', bad:'badge-bad', none:'badge-none'}[st] || 'badge-none';
  return `<span class="badge ${cls}">${statusLabel(st)}</span>`;
}

/* ================= LIVE CLOCK ================= */
function renderClock(){
  const el = $('#live-clock');
  if(!el) return;
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  const dateStr = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  el.textContent = `${dateStr} · ${timeStr}`;
}
setInterval(renderClock, 1000);

/* ================= SESSION BADGE (top-of-page role indicator) =================
   Visible on every tab, not just Admin, so staff always know at a glance whether they're
   signed in and at what access level -- editors can add/edit/delete welders directly now
   (real API writes, no more "proposal" workaround); only superadmin can touch Accounts and
   Settings, enforced by the server regardless of what this badge shows. */
function renderSessionBadge(){
  const el = $('#session-badge');
  if(!el) return;
  if(!session){ el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'flex';
  el.innerHTML = `${esc(session.name)} <span class="role-pill r-${esc(session.role)}">${esc(roleLabel(session.role))}</span>`;
}

/* ================= QR ================= */
function buildQrInfoText(idWelder){
  const w = WELDERS.find(x=>x.idWelder===idWelder);
  if(!w) return idWelder;
  const st = welderOverallStatus(w);
  const lines = [
    L.qrInfoHeader,
    `${L.qrInfoNameLabel}: ${w.name}`,
    `${L.qrInfoCodeLabel}: ${w.idWelder}${w.idEmployee ? ' | '+L.qrInfoEmpIdLabel+': '+w.idEmployee : ''}`,
  ];
  if(w.company) lines.push(`${L.qrInfoCompanyLabel}: ${w.company}`);
  lines.push(`${L.qrInfoStatusLabel}: ${statusLabel(st)}`);
  if(w.lastModified) lines.push(`${L.qrInfoUpdatedLabel}: ${fmtDateTime(new Date(w.lastModified))}`);
  lines.push('');
  lines.push(L.qrInfoCertsHeading);
  if(w.certificates.length){
    w.certificates.forEach(c=>{
      const cs = certStatus(c.validDate);
      lines.push(`- ${c.process||'—'}${c.type ? ' · '+c.type : ''} · ${L.qrInfoValidDateLabel}: ${fmtDate(c.validDate)} (${statusLabel(cs)})`);
    });
  }else{
    lines.push(L.qrInfoNoCerts);
  }
  if((SETTINGS.baseUrl||'').trim()){
    lines.push('');
    // Deliberately no "https://" scheme here -- aggressive QR scanners (Zalo, e-wallet
    // apps, common in VN) detect a URI scheme and jump straight to opening it, skipping
    // the info text entirely. Dropping the scheme keeps this line plain text for those
    // scanners while smarter scanners (iOS Camera, Google Lens) still offer it as a
    // tappable suggestion. The on-page profile link (pm-link-line) is unaffected.
    const bareLink = SETTINGS.baseUrl.trim().replace(/^https?:\/\//i, '');
    lines.push(`${L.qrInfoMoreLabel}: ${bareLink}`);
  }
  return lines.join('\n');
}
function renderQrDataUrl(text, size){
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const cellSize = Math.max(2, Math.floor((size||220) / qr.getModuleCount()));
  return qr.createDataURL(cellSize, 4);
}

/* ================= AUTH ================= */
function roleLabel(role){
  return {superadmin:L.roleSuperadmin, editor:L.roleEditor, viewer:L.roleViewer}[role] || role;
}
function isReadOnlyNow(){
  return readOnlyMode || (session && session.role === 'viewer');
}
function canEditWelderData(){
  return !!session && (session.role === 'editor' || session.role === 'superadmin');
}
function applyReadOnlyUi(){
  const banner = $('#readonly-banner');
  const show = !!(session && isReadOnlyNow());
  banner.style.display = show ? 'block' : 'none';
  banner.textContent = L.readOnlyBanner;
  $all('.write-action').forEach(el=>{ el.disabled = !!isReadOnlyNow(); });
}
async function tryLogin(username, password){
  return apiFetch('POST', '/api/auth/login', { username, password }); // {name, role}
}
async function refreshSession(){
  try{ session = await apiFetch('GET', '/api/auth/me'); }
  catch(e){ session = null; }
}
function enterAdmin(acc){
  session = acc;
  readOnlyMode = false;
  renderAll();
}
async function logoutAdmin(){
  try{ await apiFetch('POST', '/api/auth/logout'); }catch(e){ /* cookie may already be gone */ }
  session = null;
  ACCOUNTS = [];
  renderAll();
}

/* ================= RENDER: PUBLIC LOOKUP ================= */
function computeStats(){
  let ok=0, warn=0, bad=0;
  WELDERS.forEach(w=>{
    const st = welderOverallStatus(w);
    if(st==='ok') ok++; else if(st==='warn') warn++; else if(st==='bad') bad++;
  });
  return {total: WELDERS.length, ok, warn, bad};
}
function renderStats(){
  const s = computeStats();
  $('#stat-row').innerHTML = `
    <div class="box"><div class="n">${s.total}</div><div class="l">${L.statTotal}</div></div>
    <div class="box"><div class="n" style="color:var(--ok)">${s.ok}</div><div class="l">${L.statOk}</div></div>
    <div class="box"><div class="n" style="color:var(--warn)">${s.warn}</div><div class="l">${L.statWarn} (≤ ${SETTINGS.warnDays||45})</div></div>
    <div class="box"><div class="n" style="color:var(--bad)">${s.bad}</div><div class="l">${L.statBad}</div></div>
  `;
}
function distinctJoints(){
  const set = new Set();
  WELDERS.forEach(w=> w.certificates.forEach(c=>{
    const j = (c.joint||'').trim();
    if(j && j!=='#N/A') set.add(j);
  }));
  return Array.from(set).sort();
}
function renderLookupFilterBar(){
  $('#filter-process').innerHTML = `<option value="">${L.filterProcessAll}</option>` +
    distinctProcesses().map(p=>`<option value="${esc(p)}" ${lkProcess===p?'selected':''}>${esc(p)}</option>`).join('');
  $('#filter-joint').innerHTML = `<option value="">${L.filterSegmentAll}</option>` +
    distinctJoints().map(j=>`<option value="${esc(j)}" ${lkJoint===j?'selected':''}>${esc(j)}</option>`).join('');
  $('#status-chip-row').innerHTML = `
    <button type="button" class="status-chip ${lkStatus===''?'active':''}" data-status="">${L.filterAllShort}</button>
    <button type="button" class="status-chip st-ok ${lkStatus==='ok'?'active':''}" data-status="ok"><span class="dot"></span>${L.statusOk}</button>
    <button type="button" class="status-chip st-warn ${lkStatus==='warn'?'active':''}" data-status="warn"><span class="dot"></span>${L.statusWarn}</button>
    <button type="button" class="status-chip st-bad ${lkStatus==='bad'?'active':''}" data-status="bad"><span class="dot"></span>${L.statusBad}</button>
  `;
  $('#filter-process').onchange = ()=>{ lkProcess = $('#filter-process').value; renderPublicGrid(); };
  $('#filter-joint').onchange = ()=>{ lkJoint = $('#filter-joint').value; renderPublicGrid(); };
  $all('#status-chip-row .status-chip').forEach(btn=>{
    btn.onclick = ()=>{ lkStatus = btn.dataset.status; renderLookupFilterBar(); renderPublicGrid(); };
  });
}
function renderPublicGrid(){
  const q = ($('#search-box').value||'').trim().toLowerCase();
  const grid = $('#public-grid');
  const list = WELDERS.filter(w=>{
    const st = welderOverallStatus(w);
    if(lkStatus && st !== lkStatus) return false;
    if(lkProcess && !w.certificates.some(c=>(c.process||'').trim()===lkProcess)) return false;
    if(lkJoint && !w.certificates.some(c=>(c.joint||'').trim()===lkJoint)) return false;
    if(!q) return true;
    return w.idWelder.toLowerCase().includes(q) || (w.idEmployee||'').toLowerCase().includes(q) || w.name.toLowerCase().includes(q);
  });
  if(!list.length){
    grid.innerHTML = `<div class="muted" style="padding:20px">${L.noResults}</div>`;
    return;
  }
  grid.innerHTML = list.map(w=>{
    const st = welderOverallStatus(w);
    const avatar = w.photo
      ? `<img class="wcard-avatar" src="${w.photo}" alt="">`
      : `<div class="wcard-avatar-fallback av-${st}">${esc(initialsFor(w.name))}</div>`;
    return `<div class="wcard st-${st}" data-open-profile="${esc(w.idWelder)}">
      ${avatar}
      <div class="wcard-body">
        <div class="idw">${esc(w.idWelder)}</div>
        <div class="nm">${esc(w.name)}</div>
        ${statusBadge(st)}
        <div class="small muted" style="margin-top:6px">${w.certificates.length} ${L.certsSuffix}</div>
      </div>
    </div>`;
  }).join('');
}

/* ================= PROFILE MODAL ================= */
function openProfile(idWelder){
  const w = WELDERS.find(x=>x.idWelder===idWelder);
  if(!w) return;
  $('#pm-name').textContent = w.name;
  $('#pm-sub').textContent = `${w.idWelder}${w.idEmployee ? ' · '+L.colEmployeeId+' '+w.idEmployee : ''}${w.company ? ' · '+w.company : ''}`;
  const pmPhoto = $('#pm-photo');
  if(w.photo){ pmPhoto.src = w.photo; pmPhoto.style.display = ''; } else { pmPhoto.src = ''; pmPhoto.style.display = 'none'; }
  $('#pm-updated').textContent = w.lastModified ? `${L.profileUpdatedLabel}: ${fmtDateTime(new Date(w.lastModified))}` : '';
  $('#pm-qr-img').src = renderQrDataUrl(buildQrInfoText(idWelder), 220);
  $('#pm-qr-hint').textContent = L.qrScanHint;
  $('#pm-certs').innerHTML = renderCertsTable(w);
  const link = (SETTINGS.baseUrl||'').trim();
  $('#pm-link-line').innerHTML = link ? `${L.seeFullProfile}: <a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a>` : '';
  $('#profile-overlay').classList.add('open');
}
function renderCertsTable(w){
  if(!w.certificates.length) return `<div class="muted small">${L.noCertsRecorded}</div>`;
  const rows = w.certificates.map((c,i)=>{
    const st = certStatus(c.validDate);
    const viewBtn = c.originalCertImage
      ? `<button class="btn btn-sm" data-view-cert="${esc(w.idWelder)}" data-cert-idx="${i}">${L.viewOriginalCert}</button>`
      : `<span class="muted small">${L.noOriginalFile}</span>`;
    return `<tr>
      <td>${esc(c.process||'—')}${c.type ? ' · '+esc(c.type) : ''}</td>
      <td>${fmtDate(c.validDate)}</td>
      <td>${statusBadge(st)}</td>
      <td>${viewBtn}</td>
    </tr>`;
  }).join('');
  return `<table><thead><tr><th>${L.colProcess}</th><th>${L.colValidUntil}</th><th>${L.colStatus}</th><th>${L.colOriginalFile}</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function viewCertImage(idWelder, certIdx){
  const w = WELDERS.find(x=>x.idWelder===idWelder);
  if(!w) return;
  const c = w.certificates[certIdx];
  if(!c || !c.originalCertImage) return;
  $('#media-title').textContent = `${L.certOriginalTitle} — ${w.name} (${w.idWelder})`;
  $('#media-body').innerHTML = `<img class="cert-photo" src="${c.originalCertImage}" alt="${esc(L.certOriginalTitle)}">`;
  $('#media-hint').textContent = L.certOriginalHint;
  $('#media-overlay').classList.add('open');
}
function viewQr(idWelder){
  const w = WELDERS.find(x=>x.idWelder===idWelder);
  if(!w) return;
  const dataUrl = renderQrDataUrl(buildQrInfoText(idWelder), 260);
  $('#media-title').textContent = `${L.qrTitle} — ${w.name} (${w.idWelder})`;
  $('#media-body').innerHTML = `<div class="qr-box"><img src="${dataUrl}" alt="QR" style="width:260px;height:260px"><div style="margin-top:8px;font-weight:700;font-size:15px">${esc(w.idWelder)}</div><div class="muted small">${esc(w.name)}</div></div>`;
  $('#media-hint').textContent = L.qrHint;
  $('#media-overlay').classList.add('open');
}

/* ================= ADMIN ================= */
function renderAdmin(){
  renderSessionBadge();
  if(!session){
    $('#admin-login-view').style.display = 'block';
    $('#admin-panel-view').style.display = 'none';
    $('#admin-login-view').innerHTML = `
      <div class="card login-box">
        <h2>${L.loginTitle}</h2>
        <div class="row" style="flex-direction:column;align-items:stretch;gap:10px">
          <input type="text" id="login-user" placeholder="${L.loginUsername}" autocomplete="username">
          <input type="password" id="login-pass" placeholder="${L.loginPassword}" autocomplete="current-password">
          <button class="btn btn-primary" id="btn-login">${L.loginBtn}</button>
          <div class="small muted" id="login-err"></div>
        </div>
      </div>`;
    const doLogin = async ()=>{
      const btn = $('#btn-login');
      const u = $('#login-user').value, p = $('#login-pass').value;
      $('#login-err').textContent = '';
      btn.disabled = true;
      const originalLabel = btn.textContent;
      btn.textContent = L.loginChecking;
      try{
        const acc = await tryLogin(u, p);
        enterAdmin(acc);
      }catch(e){
        $('#login-err').textContent = L.loginError;
      }finally{
        btn.disabled = false; btn.textContent = originalLabel;
      }
    };
    $('#btn-login').onclick = doLogin;
    $('#login-pass').onkeydown = (e)=>{ if(e.key==='Enter') doLogin(); };
    applyReadOnlyUi();
    return;
  }
  $('#admin-login-view').style.display = 'none';
  $('#admin-panel-view').style.display = 'block';
  applyReadOnlyUi();
  const processOptions = distinctProcesses();
  $('#admin-panel-view').innerHTML = `
    <div class="card row" style="justify-content:space-between">
      <div><b>${esc(session.name)}</b> <span class="badge badge-${session.role==='superadmin'?'warn':session.role==='editor'?'ok':'none'}" style="margin-left:6px">${esc(roleLabel(session.role))}</span></div>
      <button class="btn btn-sm" id="btn-logout">${L.logoutBtn}</button>
    </div>

    ${session.role==='superadmin' ? `
    <div class="card">
      <h2>${L.settingsTitle}</h2>
      <div class="row" style="flex-direction:column;align-items:stretch;gap:10px">
        <label class="small muted">${L.settingsBaseUrl}
          <input type="text" id="set-baseurl" value="${esc(SETTINGS.baseUrl||'')}" placeholder="https://cswind.example.com">
        </label>
        <label class="small muted">${L.settingsWarnDays}
          <input type="number" id="set-warndays" value="${SETTINGS.warnDays||45}" min="1" style="max-width:120px">
        </label>
        <label class="small muted">${L.settingsEmails}
          <input type="text" id="set-emails" value="${esc(SETTINGS.emails||'')}" placeholder="a@cswind.vn, b@cswind.vn">
        </label>
        <button class="btn btn-primary write-action" id="btn-save-settings" style="align-self:flex-start">${L.settingsSave}</button>
      </div>
    </div>` : ''}

    ${session.role==='superadmin' ? renderAccountsCardHtml() : ''}

    <div class="card">
      <h2>${L.reminderExpiringTitle}</h2>
      <div id="expiring-table-wrap"></div>
      <h2 style="margin-top:18px">${L.reminderTitle}</h2>
      <div id="reminder-recipients-line" class="small muted" style="margin-bottom:8px"></div>
      <div id="reminder-preview" class="small" style="margin-bottom:8px"></div>
      <button class="btn btn-primary" id="btn-compose-email">${L.reminderComposeBtn}</button>
    </div>

    <div class="card">
      <h2>${L.masterListTitle(WELDERS.length)}</h2>
      <div class="row" style="margin-bottom:10px">
        <input type="text" id="admin-search" placeholder="${L.masterSearchPlaceholder}" style="max-width:240px">
        <select id="admin-filter-status" style="max-width:180px">
          <option value="">${L.filterAll}</option>
          <option value="ok">${L.statusOk}</option>
          <option value="warn">${L.statusWarn}</option>
          <option value="bad">${L.statusBad}</option>
        </select>
        <select id="admin-filter-process" style="max-width:200px">
          <option value="">${L.filterProcessAll}</option>
          ${processOptions.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}
        </select>
        ${canEditWelderData() ? `<button class="btn btn-primary write-action" id="btn-add-welder">${L.addWelderBtn}</button>` : ''}
        ${canEditWelderData() ? `
        <button class="btn write-action" id="btn-import-excel">${L.importExcelBtn}</button>
        <button class="btn" id="btn-export-template">${L.exportTemplateBtn}</button>` : ''}
      </div>
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <div class="small muted" id="admin-toolbar-count"></div>
        <div class="row">
          ${canEditWelderData() ? `<button class="btn btn-sm btn-danger write-action" id="btn-delete-selected">${L.deleteSelectedBtn}</button>` : ''}
          <button class="btn btn-sm" id="btn-admin-refresh">${L.refreshBtn}</button>
        </div>
      </div>
      <div style="overflow-x:auto"><table id="admin-table"></table></div>
    </div>
  `;
  $('#btn-logout').onclick = logoutAdmin;
  if(session.role==='superadmin'){
    loadAccountsAndRender();
    $('#btn-create-account').onclick = createAccount;
  }
  if($('#btn-save-settings')) $('#btn-save-settings').onclick = async ()=>{
    const payload = {
      baseUrl: $('#set-baseurl').value.trim(),
      warnDays: parseInt($('#set-warndays').value,10) || 45,
      emails: $('#set-emails').value.trim(),
    };
    try{
      await apiFetch('PUT', '/api/settings', payload);
      SETTINGS = Object.assign({}, SETTINGS, payload);
      toast(L.settingsSaved);
      renderAll();
    }catch(e){ if(!handleWriteError(e)) toast(L.loadError); }
  };
  renderReminderPanel();
  renderExpiringTable();
  $('#btn-compose-email').onclick = composeReminderEmail;
  $('#admin-search').oninput = renderAdminTable;
  $('#admin-filter-status').onchange = renderAdminTable;
  $('#admin-filter-process').onchange = renderAdminTable;
  if($('#btn-add-welder')) $('#btn-add-welder').onclick = ()=>openWelderForm(null);
  if($('#btn-import-excel')) $('#btn-import-excel').onclick = openImportModal;
  if($('#btn-export-template')) $('#btn-export-template').onclick = exportImportTemplate;
  if($('#btn-delete-selected')) $('#btn-delete-selected').onclick = ()=>{
    const ids = Array.from(adminSelectedIds);
    if(!ids.length) return;
    openConfirmModal({
      title: L.deleteSelectedTitle(ids.length),
      message: L.confirmDeleteSelected(ids.length),
      confirmLabel: L.deleteBtn,
      cancelLabel: L.cancelBtn,
      danger: true,
    }).then(async ok=>{
      if(!ok) return;
      let n = 0;
      for(const idw of ids){
        try{ await apiFetch('DELETE', '/api/welders/'+encodeURIComponent(idw)); n++; }
        catch(e){ if(handleWriteError(e)) return; }
      }
      adminSelectedIds.clear();
      await loadWelders();
      toast(L.selectedDeletedToast(n));
      renderAll();
    });
  };
  $('#btn-admin-refresh').onclick = async ()=>{
    $('#admin-search').value = '';
    $('#admin-filter-status').value = '';
    $('#admin-filter-process').value = '';
    adminSelectedIds.clear();
    try{ await loadWelders(); }catch(e){ toast(L.loadError); }
    renderAll();
  };
  renderAdminTable();
}
function distinctProcesses(){
  const set = new Set();
  WELDERS.forEach(w=> w.certificates.forEach(c=>{ if(c.process) set.add(c.process.trim()); }));
  return Array.from(set).sort();
}

/* ================= ADMIN ACCOUNT MANAGEMENT (superadmin only) =================
   Server-enforced (requireRole('superadmin') on every /api/accounts route) -- this UI is
   only ever rendered for a superadmin session, but the server would refuse it anyway. */
function renderAccountsCardHtml(){
  return `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <h2>${L.accountsTitle}</h2>
        <span class="small muted">${L.accountsSuperOnlyNote}</span>
      </div>
      <div id="accounts-list" class="small muted">…</div>
      <div class="subtle-card">
        <h3 style="margin-bottom:10px">${L.accountsGrantTitle}</h3>
        <div class="cert-edit-grid">
          <div class="field"><label>${L.accountsDisplayName}</label><input type="text" id="acc-new-name"></div>
          <div class="field"><label>${L.accountsTempPin}</label><input type="text" id="acc-new-pin"></div>
        </div>
        <div class="field"><label>${L.accountsRole}</label>
          <select id="acc-new-role">
            <option value="editor" selected>${L.roleEditor} (${L.accountsRoleEditorHint})</option>
            <option value="viewer">${L.roleViewer}</option>
            <option value="superadmin">${L.roleSuperadmin}</option>
          </select>
        </div>
        <button class="btn btn-primary write-action" id="btn-create-account">${L.accountsCreateBtn}</button>
        <div class="small muted" id="acc-err" style="margin-top:8px;color:var(--bad)"></div>
      </div>
    </div>`;
}
async function loadAccountsAndRender(){
  try{
    ACCOUNTS = await apiFetch('GET', '/api/accounts');
  }catch(e){
    if(handleWriteError(e)) return;
    ACCOUNTS = [];
  }
  renderAccountsList();
}
function renderAccountsList(){
  const el = $('#accounts-list');
  if(!el) return;
  el.innerHTML = ACCOUNTS.map(a=>`
    <div class="acc-row">
      <div>${esc(a.username)} <span class="badge badge-none" style="margin-left:6px">${esc(roleLabel(a.role))}</span></div>
      <div class="row">
        <select class="btn-sm" data-role-select="${a.id}" style="width:auto">
          <option value="viewer" ${a.role==='viewer'?'selected':''}>${L.roleViewer}</option>
          <option value="editor" ${a.role==='editor'?'selected':''}>${L.roleEditor}</option>
          <option value="superadmin" ${a.role==='superadmin'?'selected':''}>${L.roleSuperadmin}</option>
        </select>
        <button class="btn btn-sm write-action" data-reset-pin="${a.id}" data-reset-name="${esc(a.username)}">${L.accountsResetPin}</button>
        <button class="btn btn-sm btn-danger write-action" data-del-account="${a.id}" data-del-name="${esc(a.username)}">${L.accountsDeleteBtn}</button>
      </div>
    </div>
  `).join('');
  $all('[data-role-select]').forEach(sel=>{
    sel.onchange = async ()=>{
      const id = sel.dataset.roleSelect;
      try{
        await apiFetch('PUT', '/api/accounts/'+id+'/role', { role: sel.value });
        const acc = ACCOUNTS.find(a=>String(a.id)===String(id));
        toast(L.accountsRoleChangedToast(acc ? acc.username : ''));
        await loadAccountsAndRender();
      }catch(e){ if(!handleWriteError(e)) toast(L.loadError); }
    };
  });
  $all('[data-reset-pin]').forEach(btn=>{
    btn.onclick = ()=> resetAccountPassword(btn.dataset.resetPin, btn.dataset.resetName);
  });
  $all('[data-del-account]').forEach(btn=>{
    btn.onclick = ()=> deleteAccount(btn.dataset.delAccount, btn.dataset.delName);
  });
  applyReadOnlyUi();
}
async function createAccount(){
  const name = $('#acc-new-name').value.trim();
  const pin = $('#acc-new-pin').value.trim();
  const role = $('#acc-new-role').value;
  const errEl = $('#acc-err');
  errEl.textContent = '';
  if(!name){ errEl.textContent = L.accountsNameRequired; return; }
  if(!pin || pin.length < 4){ errEl.textContent = L.accountsPinTooShort; return; }
  try{
    await apiFetch('POST', '/api/accounts', { username: name, password: pin, role });
    $('#acc-new-name').value = ''; $('#acc-new-pin').value = '';
    toast(L.accountsCreatedToast(name));
    await loadAccountsAndRender();
  }catch(e){
    if(handleWriteError(e)) return;
    if(e.status===409 || (e.data && e.data.error==='already_exists')) errEl.textContent = L.accountsNameExists;
    else if(e.data && e.data.error==='password_too_short') errEl.textContent = L.accountsPinTooShort;
    else errEl.textContent = L.loadError;
  }
}
async function resetAccountPassword(id, name){
  const newPin = await openConfirmModal({
    title: L.accountsResetPin,
    message: L.accountsResetPinPrompt(name),
    showInput: true,
    inputPlaceholder: L.accountsTempPin,
    confirmLabel: L.accountsResetPin,
    cancelLabel: L.cancelBtn,
  });
  if(newPin==null) return;
  const trimmed = newPin.trim();
  if(trimmed.length < 4){ toast(L.accountsPinTooShort); return; }
  try{
    await apiFetch('PUT', '/api/accounts/'+id+'/password', { password: trimmed });
    toast(L.accountsPinResetToast(name));
  }catch(e){ if(!handleWriteError(e)) toast(L.loadError); }
}
async function deleteAccount(id, name){
  const ok = await openConfirmModal({
    title: L.accountsDeleteBtn,
    message: L.accountsConfirmDelete(name),
    confirmLabel: L.accountsDeleteBtn,
    cancelLabel: L.cancelBtn,
    danger: true,
  });
  if(!ok) return;
  try{
    await apiFetch('DELETE', '/api/accounts/'+id);
    toast(L.accountsDeletedToast(name));
    await loadAccountsAndRender();
  }catch(e){
    if(handleWriteError(e)) return;
    if(e.data && e.data.error==='last_superadmin') toast(L.accountsLastSuperadmin);
    else toast(L.loadError);
  }
}

/* ================= REMINDER EMAIL / EXPIRING REPORT ================= */
function renderReminderPanel(){
  const emails = (SETTINGS.emails||'').split(',').map(s=>s.trim()).filter(Boolean);
  $('#reminder-recipients-line').innerHTML = emails.length
    ? L.reminderWillSendTo + ' ' + emails.map(e=>`<span class="chip">${esc(e)}</span>`).join('')
    : L.reminderNoEmails;
  const list = expiringList();
  $('#reminder-preview').innerHTML = list.length
    ? L.reminderPreviewCount(list.length)
    : `<span class="muted">${L.reminderPreviewNone}</span>`;
}
function expiringList(){
  const out = [];
  WELDERS.forEach(w=>{
    w.certificates.forEach(c=>{
      const st = certStatus(c.validDate);
      if(st==='warn' || st==='bad'){
        out.push({idWelder:w.idWelder, name:w.name, process:c.process, validDate:c.validDate, status:st});
      }
    });
  });
  out.sort((a,b)=> (a.validDate||'').localeCompare(b.validDate||''));
  return out;
}
function renderExpiringTable(){
  const el = $('#expiring-table-wrap');
  if(!el) return;
  const list = expiringList();
  if(!list.length){
    el.innerHTML = `<div class="muted small" style="padding:6px 0 12px">${L.reminderPreviewNone}</div>`;
    return;
  }
  const today = new Date(todayISO());
  const rows = list.map(x=>{
    const vd = new Date(x.validDate);
    const diffDays = Math.round((vd - today) / 86400000);
    const remain = diffDays >= 0 ? L.daysRemaining(diffDays) : L.daysOverdue(Math.abs(diffDays));
    return `<tr>
      <td>${esc(x.name)}</td>
      <td>${esc(x.idWelder)}</td>
      <td>${esc(x.process||'—')}</td>
      <td>${fmtDate(x.validDate)}</td>
      <td>${esc(remain)}</td>
      <td>${statusBadge(x.status)}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `<div style="overflow-x:auto"><table>
    <thead><tr><th>${L.colName}</th><th>${L.colCode}</th><th>${L.colProcess}</th><th>${L.colValidUntil}</th><th>${L.colRemaining}</th><th>${L.colStatusShort}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}
function openMailto(mailtoHref){
  const a = document.createElement('a');
  a.href = mailtoHref;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
function composeReminderEmail(){
  const emails = (SETTINGS.emails||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(!emails.length){ toast(L.reminderNoEmailsToast); return; }
  const fullList = expiringList(); // already sorted soonest-expiry first
  const subject = `[CSWIND] Danh sách thợ hàn cần gia hạn / tái đánh giá — ${fmtDate(todayISO())}`;
  const introLine = "Dear Sir/ Madam: please check the list of welders/ welding operator that need extend valid date or re-qualification.";
  const listHeading = "Danh sách / List:";
  const closingLine = "Đề nghị gia hạn hoặc tái đánh giá tay nghề trước ngày hết hạn. / Please renew or re-qualify before the expiry date.";
  const signOff = "Trân trọng / Regards,\nCSWIND Việt Nam";
  const noDataLine = "(Không có chứng chỉ nào sắp/đã hết hạn. / None currently expiring or expired.)";
  function bodyFor(shownCount){
    const items = fullList.slice(0, shownCount);
    const hidden = fullList.length - shownCount;
    const listBlock = items.length
      ? items.map((x,i)=>`${i+1}. ${x.idWelder} · ${x.name} · ${x.process||'—'} · ${fmtDate(x.validDate)} · ${statusLabel(x.status)}`).join('\n')
      : noDataLine;
    const parts = [introLine, '', listHeading, listBlock];
    if(hidden > 0) parts.push('', `... +${hidden} nữa — xem đầy đủ trong app / more — see full list in the app`);
    parts.push('', closingLine, '', signOff);
    return parts.join('\n');
  }
  // Real browser, not a sandboxed iframe -- a plain mailto: navigation works directly.
  const MAILTO_SAFE_LEN = 1900; // conservative cross-client mailto: length budget
  let shownCount = fullList.length;
  let body = bodyFor(shownCount);
  let mailto = `mailto:${emails.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  while(mailto.length > MAILTO_SAFE_LEN && shownCount > 0){
    shownCount--;
    body = bodyFor(shownCount);
    mailto = `mailto:${emails.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  openMailto(mailto);
  toast(L.reminderSentToast);
}

/* ================= MASTER LIST TABLE ================= */
function sortArrow(key){
  if(adminSortKey!==key) return '';
  return adminSortDir==='asc' ? ' ▲' : ' ▼';
}
function updateAdminToolbar(){
  const countEl = $('#admin-toolbar-count');
  if(countEl) countEl.textContent = L.selectedCount(adminSelectedIds.size);
  const delBtn = $('#btn-delete-selected');
  if(delBtn) delBtn.disabled = adminSelectedIds.size===0 || isReadOnlyNow();
}
function renderAdminTable(){
  const q = ($('#admin-search') && $('#admin-search').value || '').trim().toLowerCase();
  const filterSt = ($('#admin-filter-status') && $('#admin-filter-status').value) || '';
  const filterProc = ($('#admin-filter-process') && $('#admin-filter-process').value) || '';
  const list = WELDERS.filter(w=>{
    if(filterSt && welderOverallStatus(w) !== filterSt) return false;
    if(filterProc && !w.certificates.some(c=>(c.process||'').trim()===filterProc)) return false;
    if(!q) return true;
    return w.idWelder.toLowerCase().includes(q) || w.name.toLowerCase().includes(q);
  });
  const statusRank = {ok:0, warn:1, bad:2, none:3};
  list.sort((a,b)=>{
    let cmp;
    switch(adminSortKey){
      case 'name': cmp = a.name.localeCompare(b.name, 'vi', {numeric:true, sensitivity:'base'}); break;
      case 'certCount': cmp = a.certificates.length - b.certificates.length; break;
      case 'status': cmp = statusRank[welderOverallStatus(a)] - statusRank[welderOverallStatus(b)]; break;
      default: cmp = a.idWelder.localeCompare(b.idWelder, 'vi', {numeric:true, sensitivity:'base'});
    }
    return adminSortDir==='asc' ? cmp : -cmp;
  });
  const rows = list.map(w=>{
    const st = welderOverallStatus(w);
    const checked = adminSelectedIds.has(w.idWelder) ? 'checked' : '';
    return `<tr>
      <td><input type="checkbox" class="row-check" data-idw="${esc(w.idWelder)}" ${checked}></td>
      <td>${esc(w.idWelder)}</td>
      <td>${esc(w.name)}</td>
      <td>${esc(w.idEmployee||'—')}</td>
      <td>${w.certificates.length}</td>
      <td>${statusBadge(st)}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-sm" data-admin-view="${esc(w.idWelder)}">${L.viewBtn}</button>
        ${canEditWelderData() ? `<button class="btn btn-sm write-action" data-admin-edit="${esc(w.idWelder)}">${L.editBtn}</button>` : ''}
        <button class="btn btn-sm" data-admin-qr="${esc(w.idWelder)}">${L.qrBtn}</button>
        ${canEditWelderData() ? `<button class="btn btn-sm btn-danger write-action" data-admin-del="${esc(w.idWelder)}">${L.deleteBtn}</button>` : ''}
      </td>
    </tr>`;
  }).join('');
  const idsInView = new Set(list.map(w=>w.idWelder));
  const allChecked = idsInView.size>0 && Array.from(idsInView).every(id=>adminSelectedIds.has(id));
  $('#admin-table').innerHTML = `<thead><tr>
    <th><input type="checkbox" id="admin-select-all" ${allChecked?'checked':''}></th>
    <th data-sort="idWelder">${L.colCode}${sortArrow('idWelder')}</th>
    <th data-sort="name">${L.colName}${sortArrow('name')}</th>
    <th>${L.colEmployeeId}</th>
    <th data-sort="certCount">${L.colCertCount}${sortArrow('certCount')}</th>
    <th data-sort="status">${L.colStatusShort}${sortArrow('status')}</th>
    <th></th>
  </tr></thead><tbody>${rows}</tbody>`;
  $all('#admin-table th[data-sort]').forEach(th=>{
    th.onclick = ()=>{
      const key = th.dataset.sort;
      if(adminSortKey===key){ adminSortDir = adminSortDir==='asc' ? 'desc' : 'asc'; }
      else { adminSortKey = key; adminSortDir = 'asc'; }
      renderAdminTable();
    };
  });
  $all('.row-check').forEach(cb=>{
    cb.onchange = ()=>{
      if(cb.checked) adminSelectedIds.add(cb.dataset.idw); else adminSelectedIds.delete(cb.dataset.idw);
      const selAll = $('#admin-select-all');
      if(selAll){
        const allNowChecked = Array.from(idsInView).every(id=>adminSelectedIds.has(id));
        selAll.checked = allNowChecked;
      }
      updateAdminToolbar();
    };
  });
  const selAllBox = $('#admin-select-all');
  if(selAllBox){
    selAllBox.onchange = ()=>{
      const checked = selAllBox.checked;
      list.forEach(w=>{ if(checked) adminSelectedIds.add(w.idWelder); else adminSelectedIds.delete(w.idWelder); });
      renderAdminTable();
    };
  }
  applyReadOnlyUi();
  updateAdminToolbar();
}

/* ================= WELDER ADD/EDIT FORM ================= */
let wfCerts = []; // working copy of certificates while the form is open
let wfEditingId = null;
let wfPhoto = ''; // working copy of the welder's photo (data URL) while the form is open
function blankCert(){ return {process:'', type:'', testDate:'', validDate:'', standard:''}; }
function openWelderForm(idWelder){
  wfEditingId = idWelder;
  const w = idWelder ? WELDERS.find(x=>x.idWelder===idWelder) : null;
  wfCerts = w ? w.certificates.map(c=>({...c})) : [];
  wfPhoto = w ? (w.photo || '') : '';
  $('#wf-title').textContent = w ? L.welderFormTitleEdit(w.idWelder) : L.welderFormTitleAdd;
  $('#wf-body').innerHTML = `
    <div class="field"><label>${L.fieldCode}</label><input type="text" id="wf-code" value="${esc(w?w.idWelder:'')}" ${w?'disabled':''} placeholder="CS4000"></div>
    <div class="field"><label>${L.fieldName}</label><input type="text" id="wf-name" value="${esc(w?w.name:'')}"></div>
    <div class="field"><label>${L.fieldEmployeeId}</label><input type="text" id="wf-empid" value="${esc(w?w.idEmployee||'':'')}"></div>
    <div class="field"><label>${L.fieldCompany}</label><input type="text" id="wf-company" value="${esc(w?w.company||'CSWIND Việt Nam':'CSWIND Việt Nam')}"></div>
    <div class="field">
      <label>${L.fieldPhoto}</label>
      <div class="row" style="align-items:center;gap:10px">
        <img id="wf-photo-preview" class="thumb-md" style="${wfPhoto?'':'display:none'}" src="${wfPhoto||''}" alt="">
        <label class="btn btn-sm" style="margin:0">${L.uploadPhotoBtn}<input type="file" id="wf-photo-file" accept="image/*" style="display:none"></label>
        <button type="button" class="btn btn-sm btn-danger" id="wf-photo-remove" style="${wfPhoto?'':'display:none'}">${L.removePhotoBtn}</button>
      </div>
    </div>
    <h2 style="margin-top:14px">${L.certsSectionTitle}</h2>
    <div id="wf-certs-list"></div>
    <button type="button" class="btn btn-sm" id="wf-add-cert">${L.addCertBtn}</button>
    <div class="modal-foot">
      <button type="button" class="btn" id="wf-cancel">${L.cancelBtn}</button>
      <button type="button" class="btn btn-primary" id="wf-save">${L.saveBtn}</button>
    </div>
    <div class="small muted" id="wf-err" style="margin-top:8px;color:var(--bad)"></div>
  `;
  renderWfCerts();
  $('#wf-add-cert').onclick = ()=>{ wfCerts.push(blankCert()); renderWfCerts(); };
  $('#wf-photo-file').onchange = async (e)=>{
    const f = e.target.files[0];
    if(!f) return;
    try{
      wfPhoto = await readImageCompressed(f, 400, 0.72);
      $('#wf-photo-preview').src = wfPhoto;
      $('#wf-photo-preview').style.display = '';
      $('#wf-photo-remove').style.display = '';
    }catch(err){ toast(L.photoReadError); }
  };
  $('#wf-photo-remove').onclick = ()=>{
    wfPhoto = '';
    $('#wf-photo-preview').style.display = 'none';
    $('#wf-photo-preview').src = '';
    $('#wf-photo-remove').style.display = 'none';
    $('#wf-photo-file').value = '';
  };
  $('#wf-cancel').onclick = ()=> $('#welder-form-overlay').classList.remove('open');
  $('#wf-save').onclick = saveWelderForm;
  $('#welder-form-overlay').classList.add('open');
}
function renderWfCerts(){
  const el = $('#wf-certs-list');
  if(!wfCerts.length){ el.innerHTML = `<div class="muted small" style="margin-bottom:8px">${L.noCertsRecorded}</div>`; return; }
  el.innerHTML = wfCerts.map((c,i)=>`
    <div class="cert-edit-row">
      <div class="cert-edit-grid">
        <div class="field"><label>${L.fieldProcess}</label><input type="text" data-cf="process" data-i="${i}" value="${esc(c.process)}" placeholder="121 (SAW)"></div>
        <div class="field"><label>${L.fieldType}</label><input type="text" data-cf="type" data-i="${i}" value="${esc(c.type)}" placeholder="BW"></div>
        <div class="field"><label>${L.fieldTestDate}</label><input type="date" data-cf="testDate" data-i="${i}" value="${esc(c.testDate||'')}"></div>
        <div class="field"><label>${L.fieldValidDate}</label><input type="date" data-cf="validDate" data-i="${i}" value="${esc(c.validDate||'')}"></div>
        <div class="field"><label>${L.fieldStandard}</label><input type="text" data-cf="standard" data-i="${i}" value="${esc(c.standard||'')}"></div>
      </div>
      <div class="row" style="align-items:center;gap:8px;margin-top:2px">
        <span class="small muted">${L.fieldOriginalCert}:</span>
        ${c.originalCertImage ? `<img src="${c.originalCertImage}" class="thumb-sm" alt="">` : `<span class="small muted">${L.noOriginalFile}</span>`}
        <label class="btn btn-sm" style="margin:0">${L.uploadPhotoBtn}<input type="file" accept="image/*" data-cert-img="${i}" style="display:none"></label>
        ${c.originalCertImage ? `<button type="button" class="btn btn-sm btn-danger" data-cert-img-remove="${i}">${L.removePhotoBtn}</button>` : ''}
      </div>
      <button type="button" class="btn btn-sm btn-danger" data-cert-remove="${i}" style="margin-top:8px">${L.removeCertBtn}</button>
    </div>
  `).join('');
  el.querySelectorAll('[data-cf]').forEach(inp=>{
    inp.oninput = ()=>{ wfCerts[parseInt(inp.dataset.i,10)][inp.dataset.cf] = inp.value; };
  });
  el.querySelectorAll('[data-cert-remove]').forEach(btn=>{
    btn.onclick = ()=>{ wfCerts.splice(parseInt(btn.dataset.certRemove,10),1); renderWfCerts(); };
  });
  el.querySelectorAll('[data-cert-img]').forEach(inp=>{
    inp.onchange = async ()=>{
      const f = inp.files[0];
      if(!f) return;
      try{
        const dataUrl = await readImageCompressed(f, 900, 0.62);
        wfCerts[parseInt(inp.dataset.certImg,10)].originalCertImage = dataUrl;
        renderWfCerts();
      }catch(err){ toast(L.photoReadError); }
    };
  });
  el.querySelectorAll('[data-cert-img-remove]').forEach(btn=>{
    btn.onclick = ()=>{
      delete wfCerts[parseInt(btn.dataset.certImgRemove,10)].originalCertImage;
      renderWfCerts();
    };
  });
}
async function saveWelderForm(){
  const code = $('#wf-code').value.trim();
  const name = $('#wf-name').value.trim();
  const empid = $('#wf-empid').value.trim();
  const company = $('#wf-company').value.trim();
  if(!code){ $('#wf-err').textContent = L.codeRequiredError; return; }
  if(!name){ $('#wf-err').textContent = L.nameRequiredError; return; }
  if(!wfEditingId && WELDERS.some(w=>w.idWelder===code)){ $('#wf-err').textContent = L.codeExistsError; return; }
  const certs = wfCerts.filter(c=>c.process || c.validDate).map(c=>({...c}));
  // carry forward original-cert-image attachments that already existed for a matching cert
  if(wfEditingId){
    const old = WELDERS.find(w=>w.idWelder===wfEditingId);
    if(old){
      certs.forEach(c=>{
        const match = old.certificates.find(oc=> oc.process===c.process && oc.validDate===c.validDate);
        if(match && match.originalCertImage) c.originalCertImage = match.originalCertImage;
      });
    }
  }
  const payload = { idWelder: code, name, idEmployee: empid, company, photo: wfPhoto || '', certificates: certs };
  const saveBtn = $('#wf-save');
  saveBtn.disabled = true;
  try{
    if(wfEditingId){
      await apiFetch('PUT', '/api/welders/'+encodeURIComponent(wfEditingId), payload);
      toast(L.welderUpdatedToast(wfEditingId));
    }else{
      await apiFetch('POST', '/api/welders', payload);
      toast(L.welderAddedToast(code));
    }
    await loadWelders();
    $('#welder-form-overlay').classList.remove('open');
    renderAll();
  }catch(e){
    if(handleWriteError(e)) return;
    if(e.status===409 || (e.data && e.data.error==='already_exists')) $('#wf-err').textContent = L.codeExistsError;
    else $('#wf-err').textContent = L.loadError;
  }finally{
    saveBtn.disabled = false;
  }
}

/* ================= EXCEL IMPORT / EXPORT =================
   Runs in a real, unsandboxed browser now -- template export and any future full-export
   use a plain Blob + temporary <a download> link instead of the old artifact "downloads"
   capability workaround. */
function openImportModal(){
  $('#import-title').textContent = L.importTitle;
  $('#import-body').innerHTML = `
    <p class="small muted">${L.importIntro}</p>
    <div class="dropzone">
      <input type="file" id="import-file" accept=".xlsx,.xls,.xlsm,.csv">
    </div>
    <div id="import-status" class="small" style="margin-top:10px"></div>
    <div class="modal-foot">
      <button type="button" class="btn" data-close="import-overlay">${L.importClose}</button>
      <button type="button" class="btn btn-primary" id="import-run">${L.importBtn}</button>
    </div>
  `;
  $('#import-run').onclick = runImport;
  $('#import-overlay').classList.add('open');
}
function downloadBlob(filename, data, mime){
  const blob = new Blob([data], { type: mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=> URL.revokeObjectURL(url), 4000);
}
function csvEscape(v){
  const s = v==null ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}
function exportImportTemplate(){
  const headers = ['ID Welder','Welder Name','ID Employee','Welding Process','Qualified Type','Test Date','Valid Date','Standard'];
  const sample = [
    ['CS9001','Nguyễn Văn A','1001','111 (SMAW)','FW','2025-01-10','2027-01-10','ISO 9606-1'],
    ['CS9001','Nguyễn Văn A','1001','135 (GMAW)','BW','2025-03-05','2027-03-05','ISO 9606-1'],
    ['CS9002','Trần Thị B','1002','111 (SMAW)','FW','2025-02-20','2027-02-20','ISO 9606-1'],
  ];
  const csv = [headers, ...sample].map(row => row.map(csvEscape).join(',')).join('\r\n');
  // Leading BOM so Excel (Windows) opens the Vietnamese diacritics correctly on double-click.
  downloadBlob('CSWIND_file_mau_nhap_thoi_han.csv', '﻿' + csv, 'text/csv;charset=utf-8');
}
function excelSerialToISO(v){
  if(v==null || v==='') return '';
  if(typeof v === 'string'){
    const d = new Date(v);
    if(!isNaN(d)) return d.toISOString().slice(0,10);
    return '';
  }
  const ms = Math.round((v - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if(isNaN(d)) return '';
  return d.toISOString().slice(0,10);
}
async function runImport(){
  const fileInput = $('#import-file');
  const statusEl = $('#import-status');
  if(!fileInput.files || !fileInput.files[0]){ statusEl.textContent = L.importNoRows; return; }
  if(typeof XLSX === 'undefined'){ statusEl.textContent = 'XLSX library not loaded.'; return; }
  statusEl.textContent = L.importParsing;
  const file = fileInput.files[0];
  let wb;
  if(/\.csv$/i.test(file.name)){
    const text = (await file.text()).replace(/^﻿/, '');
    wb = XLSX.read(text, {type:'string', raw:true});
  }else{
    const buf = await file.arrayBuffer();
    wb = XLSX.read(buf, {type:'array', cellDates:false});
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:null});

  let headerRowIdx = -1, colIdx = {};
  const wantHeaders = {
    idWelder: /^id\s*welder$/i,
    name: /welder\s*name/i,
    idEmployee: /id\s*employee/i,
    process: /welding\s*process/i,
    type: /qualified\s*type/i,
    testDate: /^test\s*date$/i,
    validDate: /^valid\s*date$/i,
    standard: /^standard$/i,
  };
  for(let r=0; r<Math.min(rows.length, 30); r++){
    const row = rows[r] || [];
    const found = {};
    row.forEach((cell,ci)=>{
      if(typeof cell !== 'string') return;
      Object.keys(wantHeaders).forEach(key=>{
        if(wantHeaders[key].test(cell.trim())) found[key] = ci;
      });
    });
    if(found.idWelder!=null && found.name!=null){
      headerRowIdx = r; colIdx = found; break;
    }
  }
  if(headerRowIdx === -1){ statusEl.textContent = L.importNoRows; return; }

  const byId = {};
  for(let r=headerRowIdx+1; r<rows.length; r++){
    const row = rows[r] || [];
    const idw = row[colIdx.idWelder];
    if(!idw || typeof idw !== 'string' || !idw.trim()) continue;
    const idWelder = idw.trim();
    if(!byId[idWelder]){
      byId[idWelder] = {
        idWelder,
        name: (row[colIdx.name]||'').toString().trim(),
        idEmployee: colIdx.idEmployee!=null && row[colIdx.idEmployee]!=null ? String(row[colIdx.idEmployee]).trim() : '',
        company: 'CSWIND Việt Nam',
        certificates: [],
      };
    }
    byId[idWelder].certificates.push({
      process: colIdx.process!=null ? (row[colIdx.process]||'').toString().trim() : '',
      type: colIdx.type!=null ? (row[colIdx.type]||'').toString().trim() : '',
      testDate: colIdx.testDate!=null ? excelSerialToISO(row[colIdx.testDate]) : '',
      validDate: colIdx.validDate!=null ? excelSerialToISO(row[colIdx.validDate]) : '',
      standard: colIdx.standard!=null ? (row[colIdx.standard]||'').toString().trim() : '',
    });
  }

  const importedIds = Object.keys(byId);
  if(!importedIds.length){ statusEl.textContent = L.importNoRows; return; }

  let added = 0, updated = 0, failed = 0;
  for(const idWelder of importedIds){
    const incoming = byId[idWelder];
    const existing = WELDERS.find(w=>w.idWelder===idWelder);
    // preserve original-cert-image attachments where process+validDate still match
    if(existing){
      incoming.certificates.forEach(c=>{
        const match = existing.certificates.find(oc=> oc.process===c.process && oc.validDate===c.validDate);
        if(match && match.originalCertImage) c.originalCertImage = match.originalCertImage;
      });
    }
    const payload = {
      idWelder,
      name: incoming.name || (existing ? existing.name : ''),
      idEmployee: incoming.idEmployee || (existing ? existing.idEmployee : ''),
      company: existing ? existing.company : incoming.company,
      photo: existing ? (existing.photo || '') : '',
      certificates: incoming.certificates,
    };
    try{
      if(existing){
        await apiFetch('PUT', '/api/welders/'+encodeURIComponent(idWelder), payload);
        updated++;
      }else{
        await apiFetch('POST', '/api/welders', payload);
        added++;
      }
    }catch(e){
      if(handleWriteError(e)){ statusEl.textContent = L.loadError; return; }
      failed++;
    }
  }

  await loadWelders();
  statusEl.textContent = L.importResult(added, updated) + (failed ? ` (${failed} lỗi/failed)` : '');
  toast(L.importResult(added, updated));
  renderAll();
}

/* ================= EVENTS ================= */
function bindStaticEvents(){
  $all('.tab-btn').forEach(btn=>{
    btn.onclick = ()=>{
      activateTab(btn.dataset.tab);
      saveActiveTab(btn.dataset.tab);
    };
  });
  $('#search-box').oninput = renderPublicGrid;
  $all('.lang-btn').forEach(btn=>{
    btn.onclick = ()=> setLang(btn.dataset.lang);
  });
  $all('.theme-btn').forEach(btn=>{
    btn.onclick = ()=> setTheme(btn.dataset.themeChoice);
  });
  $all('[data-close]').forEach(btn=>{
    btn.onclick = ()=> $('#'+btn.dataset.close).classList.remove('open');
  });
  $all('.overlay').forEach(ov=>{
    ov.addEventListener('click', e=>{ if(e.target===ov) ov.classList.remove('open'); });
  });
  $('#confirm-cancel-btn').onclick = ()=> closeConfirmModal(null);
  $('#confirm-close-x').onclick = ()=> closeConfirmModal(null);
  $('#confirm-ok-btn').onclick = ()=>{
    if($('#confirm-input-wrap').style.display !== 'none'){
      closeConfirmModal($('#confirm-input').value);
    }else{
      closeConfirmModal(true);
    }
  };
  document.body.addEventListener('click', e=>{
    const openBtn = e.target.closest('[data-open-profile]');
    if(openBtn){ openProfile(openBtn.dataset.openProfile); return; }
    const viewCert = e.target.closest('[data-view-cert]');
    if(viewCert){ viewCertImage(viewCert.dataset.viewCert, parseInt(viewCert.dataset.certIdx,10)); return; }
    const adminView = e.target.closest('[data-admin-view]');
    if(adminView){ openProfile(adminView.dataset.adminView); return; }
    const adminEdit = e.target.closest('[data-admin-edit]');
    if(adminEdit){ openWelderForm(adminEdit.dataset.adminEdit); return; }
    const adminQr = e.target.closest('[data-admin-qr]');
    if(adminQr){ viewQr(adminQr.dataset.adminQr); return; }
    const adminDel = e.target.closest('[data-admin-del]');
    if(adminDel){
      const idw = adminDel.dataset.adminDel;
      openConfirmModal({
        title: L.deleteTitle(idw),
        message: L.confirmDelete(idw),
        confirmLabel: L.deleteBtn,
        cancelLabel: L.cancelBtn,
        danger: true,
      }).then(async ok=>{
        if(!ok) return;
        try{
          await apiFetch('DELETE', '/api/welders/'+encodeURIComponent(idw));
          adminSelectedIds.delete(idw);
          await loadWelders();
          toast(L.welderDeletedToast(idw));
          renderAll();
        }catch(e){ if(!handleWriteError(e)) toast(L.loadError); }
      });
      return;
    }
  });
}

/* ================= DATA LOADING ================= */
async function loadWelders(){
  WELDERS = await apiFetch('GET', '/api/welders');
}
async function loadSettings(){
  SETTINGS = await apiFetch('GET', '/api/settings');
}

/* ================= INIT ================= */
function activateTab(tab){
  $all('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  $('#tab-lookup').style.display = tab==='lookup' ? 'block' : 'none';
  $('#tab-admin').style.display = tab==='admin' ? 'block' : 'none';
}
function renderAll(){
  renderStats();
  renderLookupFilterBar();
  renderPublicGrid();
  renderAdmin();
  $('#footer-note').textContent = L.footerNote(fmtDate(SETTINGS.dataAsOf||todayISO()), WELDERS.length);
}
async function init(){
  loadThemePref();
  applyTheme();
  bindStaticEvents();
  renderStaticText();
  renderClock();
  try{
    await Promise.all([ loadWelders(), loadSettings() ]);
  }catch(e){
    toast(L.loadError);
  }
  await refreshSession();
  renderAll();
  activateTab(loadActiveTab());
}
if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }
