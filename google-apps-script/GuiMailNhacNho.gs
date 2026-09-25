/**
 * CSWIND QR-ID Thợ hàn — Gửi email nhắc nhở chứng chỉ sắp/đã hết hạn qua Gmail cá nhân
 * ------------------------------------------------------------------------------------
 * Script này chạy trong CHÍNH tài khoản Gmail của bạn (script.google.com), miễn phí.
 * Vào thứ 2 và thứ 6 (khoảng 8:00 giờ Việt Nam), script sẽ:
 *   1. Hỏi app CSWIND danh sách chứng chỉ sắp/đã hết hạn + danh sách người nhận (lấy từ
 *      mục "Cài đặt" trong tab Quản trị của app).
 *   2. Gửi email từ Gmail của bạn tới những người nhận đó.
 *   3. Báo lại cho app để tab Quản trị hiện "Lần gửi gần nhất".
 *
 * Cách cài đặt: xem file DEPLOY.md, mục "Gửi email nhắc nhở tự động qua Gmail".
 *   - Mã bí mật (REMINDER_SECRET) KHÔNG dán vào code này — lưu trong
 *     Project Settings (Cài đặt dự án) > Script properties (Thuộc tính tập lệnh).
 *
 * Các hàm bạn có thể chọn và bấm "Run" (Chạy):
 *   kiemTraKetNoi   — chỉ kiểm tra kết nối tới app, KHÔNG gửi email.
 *   guiMailNhacNho  — gửi email nhắc nhở ngay bây giờ (dùng để gửi thử).
 *   caiDatLichGui   — bật lịch tự động thứ 2 & thứ 6 (chỉ cần chạy 1 lần).
 *   xemLichGui      — xem lịch đang bật.
 *   huyLichGui      — tắt lịch tự động.
 */

var CAU_HINH = {
  APP_URL: 'https://cswind-weldercontrol.onrender.com', // địa chỉ app, không có dấu / ở cuối
  GIO_GUI: 8,                        // giờ gửi (0–23), theo giờ Việt Nam
  MUI_GIO: 'Asia/Ho_Chi_Minh',
  TEN_NGUOI_GUI: 'CSWIND QR-ID Thợ hàn', // tên hiển thị ở ô "Người gửi"
  GUI_KHI_DANH_SACH_TRONG: true,     // true = vẫn gửi email "không có chứng chỉ nào" khi danh sách trống
  SO_LAN_THU: 3,                     // app trên Render gói Free có thể đang "ngủ" — thử lại vài lần
  CHO_GIUA_CAC_LAN_THU_GIAY: 20,
};

/* =============================== HÀM CHÍNH =============================== */

function guiMailNhacNho() {
  try {
    var mail = goiApp_('get', '/api/reminders/payload');
    if (!mail.to || !mail.to.length) {
      throw new Error('App chưa có email người nhận nào. Vào tab Quản trị > Cài đặt > "Danh sách email nhận nhắc nhở", thêm email rồi bấm "Lưu cài đặt".');
    }
    if (mail.count === 0 && !CAU_HINH.GUI_KHI_DANH_SACH_TRONG) {
      Logger.log('Không có chứng chỉ nào sắp/đã hết hạn — bỏ qua, không gửi.');
      return;
    }
    MailApp.sendEmail({
      to: mail.to.join(','),
      subject: mail.subject,
      body: mail.text,
      htmlBody: mail.html,
      name: CAU_HINH.TEN_NGUOI_GUI,
    });
    Logger.log('Đã gửi tới: ' + mail.to.join(', ') + ' — ' + mail.count + ' chứng chỉ.');
    try {
      goiApp_('post', '/api/reminders/ack', { count: mail.count, sentTo: mail.to });
    } catch (ackErr) {
      // Email đã gửi thành công; chỉ là app chưa ghi nhận được "Lần gửi gần nhất".
      Logger.log('Đã gửi email nhưng không báo lại được cho app: ' + ackErr.message);
    }
  } catch (e) {
    baoLoiChoChuTaiKhoan_(e);
    throw e; // để lỗi hiện đỏ trong mục "Executions" (Lần thực thi)
  }
}

function kiemTraKetNoi() {
  var mail = goiApp_('get', '/api/reminders/payload');
  Logger.log('✓ Kết nối app thành công.');
  Logger.log('Người nhận (từ Cài đặt của app): ' + (mail.to.length ? mail.to.join(', ') : '(chưa có — cần thêm trong app)'));
  Logger.log('Số chứng chỉ sắp/đã hết hạn: ' + mail.count);
  Logger.log('Tiêu đề email: ' + mail.subject);
}

/* =============================== LỊCH GỬI =============================== */

function caiDatLichGui() {
  layMaBiMat_(); // báo lỗi sớm nếu chưa lưu mã bí mật
  huyLichGui();
  var chinhXacPhut = true;
  [ScriptApp.WeekDay.MONDAY, ScriptApp.WeekDay.FRIDAY].forEach(function (thu) {
    try {
      // Google chạy lịch trong khoảng ±15 phút quanh 8:00
      ScriptApp.newTrigger('guiMailNhacNho').timeBased()
        .everyWeeks(1).onWeekDay(thu).atHour(CAU_HINH.GIO_GUI).nearMinute(0)
        .inTimezone(CAU_HINH.MUI_GIO).create();
    } catch (e) {
      // Dự phòng: nếu Google không cho chọn phút, lịch sẽ chạy trong khung 8:00–9:00
      chinhXacPhut = false;
      ScriptApp.newTrigger('guiMailNhacNho').timeBased()
        .everyWeeks(1).onWeekDay(thu).atHour(CAU_HINH.GIO_GUI)
        .inTimezone(CAU_HINH.MUI_GIO).create();
    }
  });
  Logger.log('✓ Đã bật lịch gửi: thứ 2 và thứ 6, ' +
    (chinhXacPhut ? 'khoảng ' + CAU_HINH.GIO_GUI + ':00 (±15 phút)' : 'trong khung ' + CAU_HINH.GIO_GUI + ':00–' + (CAU_HINH.GIO_GUI + 1) + ':00') +
    ' giờ Việt Nam.');
  xemLichGui();
}

function xemLichGui() {
  var ds = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'guiMailNhacNho'; });
  if (!ds.length) { Logger.log('Chưa có lịch gửi nào đang bật.'); return; }
  Logger.log('Đang có ' + ds.length + ' lịch gửi tự động cho hàm guiMailNhacNho (mong đợi: 2 — thứ 2 và thứ 6).');
}

function huyLichGui() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'guiMailNhacNho') { ScriptApp.deleteTrigger(t); n++; }
  });
  if (n) Logger.log('Đã tắt ' + n + ' lịch gửi cũ.');
}

/* =============================== HÀM PHỤ =============================== */

function layMaBiMat_() {
  var s = PropertiesService.getScriptProperties().getProperty('REMINDER_SECRET');
  if (!s) {
    throw new Error('Chưa lưu mã bí mật. Vào ⚙ Project Settings (Cài đặt dự án) > Script properties > Add script property: Property = REMINDER_SECRET, Value = đúng chuỗi REMINDER_SECRET đã đặt trên Render.');
  }
  return s.trim();
}

function goiApp_(method, path, payload) {
  var secret = layMaBiMat_();
  var options = {
    method: method,
    headers: { 'X-Reminder-Secret': secret },
    muteHttpExceptions: true,
    followRedirects: true,
  };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  var loiCuoi = '';
  for (var lan = 1; lan <= CAU_HINH.SO_LAN_THU; lan++) {
    var res;
    try {
      res = UrlFetchApp.fetch(CAU_HINH.APP_URL + path, options);
    } catch (netErr) {
      loiCuoi = netErr.message;
      res = null;
    }
    if (res) {
      var code = res.getResponseCode();
      if (code === 200) return JSON.parse(res.getContentText());
      if (code === 401) {
        throw new Error('App từ chối mã bí mật (401). Kiểm tra lại: giá trị REMINDER_SECRET trong Script properties phải GIỐNG HỆT biến REMINDER_SECRET trên Render (không thừa dấu cách).');
      }
      if (code === 404) {
        throw new Error('App chưa có chức năng này (404) — hãy chắc chắn đã upload bản cswind-app-update7 lên GitHub và Render đã deploy xong.');
      }
      loiCuoi = 'HTTP ' + code;
    }
    Logger.log('Lần thử ' + lan + ' chưa được (' + loiCuoi + ') — app có thể đang khởi động lại, chờ rồi thử tiếp…');
    if (lan < CAU_HINH.SO_LAN_THU) Utilities.sleep(CAU_HINH.CHO_GIUA_CAC_LAN_THU_GIAY * 1000);
  }
  throw new Error('Không kết nối được app sau ' + CAU_HINH.SO_LAN_THU + ' lần thử (' + loiCuoi + ').');
}

function baoLoiChoChuTaiKhoan_(e) {
  try {
    var me = Session.getEffectiveUser().getEmail();
    if (!me) return;
    MailApp.sendEmail({
      to: me,
      subject: '[CSWIND] ⚠ Chưa gửi được email nhắc nhở chứng chỉ',
      body: 'Script gửi email nhắc nhở (Google Apps Script) gặp lỗi lúc ' +
        Utilities.formatDate(new Date(), CAU_HINH.MUI_GIO, 'dd/MM/yyyy HH:mm') + ':\n\n' + e.message +
        '\n\nBạn có thể mở script và chạy lại hàm guiMailNhacNho để gửi thủ công.',
      name: CAU_HINH.TEN_NGUOI_GUI,
    });
  } catch (ignore) { /* không để lỗi báo lỗi che mất lỗi gốc */ }
}
