/**
 * CSWIND QR-ID Thợ hàn — Gửi email nhắc nhở chứng chỉ sắp/đã hết hạn qua Gmail cá nhân
 * ------------------------------------------------------------------------------------
 * PHIÊN BẢN 2 (update9): GỬI RIÊNG TỪNG ENTITY.
 * Script này chạy trong CHÍNH tài khoản Gmail của Quản trị viên cấp cao (script.google.com),
 * miễn phí. Vào thứ 2 và thứ 6 (khoảng 8:00 giờ Việt Nam), script sẽ:
 *   1. Hỏi app CSWIND: với TỪNG entity (CSW-VN, CSW-HQ, ...) — danh sách chứng chỉ sắp/đã
 *      hết hạn của entity đó + danh sách email nhận do Admin của entity đó điền trong app
 *      (tab Quản trị > "Cài đặt entity").
 *   2. Gửi cho mỗi entity MỘT email riêng (chỉ chứa thợ hàn của entity đó) từ Gmail này.
 *      Entity không có gì cần nhắc, hoặc chưa có email nhận, sẽ được bỏ qua.
 *   3. Báo lại cho app (tab Quản trị hiện "Lần gửi gần nhất" của từng entity).
 *   4. Gửi 1 email TỔNG HỢP về chính Gmail này: entity nào đã gửi, entity nào bị bỏ qua và vì sao.
 *
 * Cách cài đặt: xem file DEPLOY.md, mục "Gửi email nhắc nhở tự động qua Gmail".
 *   - Mã bí mật (REMINDER_SECRET) KHÔNG dán vào code này — lưu trong
 *     Project Settings (Cài đặt dự án) > Script properties (Thuộc tính tập lệnh).
 *
 * Các hàm bạn có thể chọn và bấm "Run" (Chạy):
 *   kiemTraKetNoi   — chỉ kiểm tra kết nối + xem trước sẽ gửi gì cho từng entity, KHÔNG gửi.
 *   guiMailNhacNho  — gửi email nhắc nhở ngay bây giờ (dùng để gửi thử).
 *   caiDatLichGui   — bật lịch tự động thứ 2 & thứ 6 (chỉ cần chạy 1 lần).
 *   xemLichGui      — xem lịch đang bật.
 *   huyLichGui      — tắt lịch tự động.
 */

var CAU_HINH = {
  APP_URL: 'https://cswind-weldercontrol.onrender.com', // địa chỉ app, không có dấu / ở cuối
  GIO_GUI: 8,                        // giờ gửi (0–23), theo giờ Việt Nam
  MUI_GIO: 'Asia/Ho_Chi_Minh',
  TEN_NGUOI_GUI: 'CS Wind Welder Certification Control', // tên hiển thị ở ô "Người gửi"
  GUI_TONG_HOP: true,                // true = sau mỗi lần chạy gửi 1 email tổng hợp về Gmail này
  SO_LAN_THU: 3,                     // app trên Render gói Free có thể đang "ngủ" — thử lại vài lần
  CHO_GIUA_CAC_LAN_THU_GIAY: 20,
};

/* =============================== HÀM CHÍNH =============================== */

function guiMailNhacNho() {
  var plan;
  try {
    plan = goiApp_('get', '/api/reminders/payload-v2');
  } catch (e) {
    baoLoiChoChuTaiKhoan_(e);
    throw e; // để lỗi hiện đỏ trong mục "Executions" (Lần thực thi)
  }
  var daGui = [];
  var loi = [];
  (plan.mails || []).forEach(function (m) {
    try {
      MailApp.sendEmail({
        to: m.to.join(','),
        subject: m.subject,
        body: m.text,
        htmlBody: m.html,
        name: CAU_HINH.TEN_NGUOI_GUI + ' — ' + m.entity,
      });
      daGui.push({ entity: m.entity, label: m.label, count: m.count, sentTo: m.to });
      Logger.log('✓ ' + m.entity + ': đã gửi tới ' + m.to.join(', ') + ' — ' + m.count + ' chứng chỉ.');
    } catch (e) {
      loi.push({ entity: m.entity, label: m.label, count: m.count, error: e.message });
      Logger.log('✗ ' + m.entity + ': gửi lỗi — ' + e.message);
    }
  });
  (plan.skipped || []).forEach(function (k) {
    Logger.log('– ' + k.entity + ': bỏ qua (' + (k.reason === 'no_recipients' ? 'CHƯA có email nhận, có ' + k.count + ' chứng chỉ cần nhắc' : 'không có chứng chỉ cần nhắc') + ').');
  });
  if (daGui.length) {
    try {
      goiApp_('post', '/api/reminders/ack', { results: daGui });
    } catch (ackErr) {
      // Email đã gửi thành công; chỉ là app chưa ghi nhận được "Lần gửi gần nhất".
      Logger.log('Đã gửi email nhưng không báo lại được cho app: ' + ackErr.message);
    }
  }
  if (CAU_HINH.GUI_TONG_HOP) guiTongHop_(plan, daGui, loi);
  if (loi.length) {
    throw new Error('Có ' + loi.length + ' entity gửi lỗi: ' + loi.map(function (x) { return x.entity; }).join(', '));
  }
}

function kiemTraKetNoi() {
  var plan = goiApp_('get', '/api/reminders/payload-v2');
  Logger.log('✓ Kết nối app thành công. Nếu chạy gửi bây giờ:');
  (plan.mails || []).forEach(function (m) {
    Logger.log('  • ' + m.entity + ' (' + m.label + '): SẼ GỬI ' + m.count + ' chứng chỉ tới ' + m.to.join(', '));
  });
  (plan.skipped || []).forEach(function (k) {
    Logger.log('  • ' + k.entity + ' (' + k.label + '): bỏ qua — ' +
      (k.reason === 'no_recipients' ? '⚠ có ' + k.count + ' chứng chỉ cần nhắc nhưng CHƯA có email nhận' : 'không có chứng chỉ cần nhắc'));
  });
  Logger.log('Hạn mức gửi mail còn lại hôm nay của Gmail này: ' + MailApp.getRemainingDailyQuota() + ' người nhận.');
}

function guiTongHop_(plan, daGui, loi) {
  try {
    var me = Session.getEffectiveUser().getEmail();
    if (!me) return;
    var ngay = Utilities.formatDate(new Date(), CAU_HINH.MUI_GIO, 'dd/MM/yyyy HH:mm');
    var chuaCoEmail = (plan.skipped || []).filter(function (k) { return k.reason === 'no_recipients'; });
    var rows = [];
    daGui.forEach(function (x) { rows.push([x.entity, '✓ Đã gửi', x.count, x.sentTo.join(', '), '#1a8f5e']); });
    loi.forEach(function (x) { rows.push([x.entity, '✗ Gửi lỗi: ' + x.error, x.count, '', '#c2410c']); });
    (plan.skipped || []).forEach(function (k) {
      if (k.reason === 'no_recipients') rows.push([k.entity, '⚠ Chưa có email nhận — Admin entity cần điền trong app', k.count, '', '#c2410c']);
      else rows.push([k.entity, 'Không có chứng chỉ cần nhắc — không gửi', 0, '', '#5b6b7d']);
    });
    var esc = function (t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var td = 'style="padding:6px 10px;border-bottom:1px solid #e3e8ef;font-size:13px;vertical-align:top"';
    var html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#1c2733;font-size:14px">' +
      '<p><b>Tổng hợp gửi email nhắc nhở chứng chỉ — ' + esc(ngay) + '</b></p>' +
      '<p>Đã gửi: <b>' + daGui.length + '</b> entity · Bỏ qua: <b>' + (plan.skipped || []).length + '</b> · Lỗi: <b>' + loi.length + '</b></p>' +
      '<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e3e8ef">' +
      '<tr><th ' + td + '>Entity</th><th ' + td + '>Kết quả</th><th ' + td + '>Số chứng chỉ</th><th ' + td + '>Người nhận</th></tr>' +
      rows.map(function (r) {
        return '<tr><td ' + td + '><b>' + esc(r[0]) + '</b></td><td ' + td + '><span style="color:' + r[4] + '">' + esc(r[1]) + '</span></td><td ' + td + '>' + esc(r[2]) + '</td><td ' + td + '>' + esc(r[3]) + '</td></tr>';
      }).join('') + '</table>' +
      (chuaCoEmail.length ? '<p style="color:#c2410c">⚠ ' + chuaCoEmail.length + ' entity có chứng chỉ cần nhắc nhưng chưa có email nhận: ' + esc(chuaCoEmail.map(function (k) { return k.entity; }).join(', ')) + '.</p>' : '') +
      '<p style="color:#5b6b7d;font-size:12px">Email tự động từ script "CSWIND - Gui mail nhac nho".</p></div>';
    var text = 'Tổng hợp gửi email nhắc nhở — ' + ngay + '\n' +
      rows.map(function (r) { return '- ' + r[0] + ': ' + r[1] + ' (' + r[2] + ' chứng chỉ)' + (r[3] ? ' → ' + r[3] : ''); }).join('\n');
    MailApp.sendEmail({
      to: me,
      subject: '[CSWIND] Tổng hợp nhắc nhở ' + ngay + ' — đã gửi ' + daGui.length + ' entity' + (loi.length ? ', ' + loi.length + ' lỗi' : '') + (chuaCoEmail.length ? ', ' + chuaCoEmail.length + ' chưa có email' : ''),
      body: text,
      htmlBody: html,
      name: CAU_HINH.TEN_NGUOI_GUI,
    });
  } catch (e) {
    Logger.log('Không gửi được email tổng hợp: ' + e.message);
  }
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
      if (code === 410) {
        throw new Error('App báo script này đã cũ (410) — hãy dán lại toàn bộ code GuiMailNhacNho.gs bản mới nhất.');
      }
      if (code === 404) {
        throw new Error('App chưa có chức năng này (404) — hãy chắc chắn đã upload bản cswind-app-update9 (hoặc mới hơn) lên GitHub và Render đã deploy xong.');
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
