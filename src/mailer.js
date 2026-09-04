// Sends the weekly "certificates expiring/expired" reminder email via a real SMTP mailbox
// (Outlook/Office 365 by default). All credentials come from environment variables set in
// Render's dashboard -- never hardcoded, never exposed through any API response.
//
// Required env vars to activate sending:
//   SMTP_USER        the mailbox to send from, e.g. noreply@cswind.com.vn
//   SMTP_PASS        an App Password for that mailbox (NOT the normal login password --
//                     see DEPLOY.md "Gửi email nhắc nhở tự động" for how to create one)
// Optional:
//   SMTP_HOST        default 'smtp.office365.com' (Outlook/O365). Use your provider's host
//                     if not Office 365 (e.g. 'smtp.gmail.com').
//   SMTP_PORT        default 587 (STARTTLS)
//   MAIL_FROM        display "From" address; defaults to SMTP_USER
//   REMINDER_SECRET  shared secret an external scheduler (e.g. cron-job.org) must send as
//                     the X-Reminder-Secret header to trigger a send without a login session
const nodemailer = require('nodemailer');
const { pool } = require('./db');

function isMailerConfigured() {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function buildTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.office365.com',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: false, // STARTTLS on 587, matching Office 365's standard submission port
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
}
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function certStatus(validDate, warnDays) {
  if (!validDate) return 'none';
  const today = new Date(todayISO());
  const vd = new Date(validDate);
  const diffDays = Math.round((vd - today) / 86400000);
  if (diffDays < 0) return 'bad';
  if (diffDays <= warnDays) return 'warn';
  return 'ok';
}
const STATUS_LABEL = { ok: 'Còn hạn / Valid', warn: 'Sắp hết hạn / Expiring soon', bad: 'Hết hạn / Expired' };

// Pulls the same "expiring or expired" set the in-app report shows, straight from the
// database (not from a client's in-memory WELDERS array -- this runs with no browser open).
async function fetchExpiringList(warnDays) {
  const { rows } = await pool.query(
    `SELECT w.id_welder, w.name, c.process, c.valid_date
     FROM certificates c JOIN welders w ON w.id_welder = c.welder_id
     WHERE c.valid_date IS NOT NULL
     ORDER BY c.valid_date ASC`
  );
  const out = [];
  for (const r of rows) {
    const validIso = r.valid_date ? r.valid_date.toISOString().slice(0, 10) : null;
    const st = certStatus(validIso, warnDays);
    if (st === 'warn' || st === 'bad') {
      out.push({ idWelder: r.id_welder, name: r.name, process: r.process, validDate: validIso, status: st });
    }
  }
  return out;
}

function buildEmailBody(list, baseUrl) {
  const introLine = 'Dear Sir/ Madam: please check the list of welders/ welding operator that need extend valid date or re-qualification.';
  const listHeading = 'Danh sách / List:';
  const closingLine = 'Đề nghị gia hạn hoặc tái đánh giá tay nghề trước ngày hết hạn. / Please renew or re-qualify before the expiry date.';
  const signOff = 'Trân trọng / Regards,\nCSWIND Việt Nam (tự động gửi hàng tuần / automated weekly reminder)';
  const noDataLine = '(Không có chứng chỉ nào sắp/đã hết hạn. / None currently expiring or expired.)';
  const listBlock = list.length
    ? list.map((x, i) => {
        const link = baseUrl ? ` — ${baseUrl.replace(/\/$/, '')}/w/${encodeURIComponent(x.idWelder)}` : '';
        return `${i + 1}. ${x.idWelder} · ${x.name} · ${x.process || '—'} · ${fmtDate(x.validDate)} · ${STATUS_LABEL[x.status]}${link}`;
      }).join('\n')
    : noDataLine;
  return [introLine, '', listHeading, listBlock, '', closingLine, '', signOff].join('\n');
}

// Sends the reminder now. Throws if SMTP isn't configured or the send fails -- callers
// (the HTTP route, or the in-process weekly scheduler) are responsible for reporting that.
async function sendReminderEmailNow() {
  if (!isMailerConfigured()) {
    throw new Error('SMTP chưa được cấu hình (thiếu biến môi trường SMTP_USER / SMTP_PASS).');
  }
  const { rows } = await pool.query('SELECT warn_days, emails, base_url FROM settings WHERE id = 1');
  const s = rows[0] || {};
  const warnDays = s.warn_days || 45;
  const emails = (s.emails || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!emails.length) {
    throw new Error('Chưa có email người nhận nào trong Cài đặt (Settings > emails).');
  }
  const list = await fetchExpiringList(warnDays);
  const subject = `[CSWIND] Danh sách thợ hàn cần gia hạn / tái đánh giá — ${fmtDate(todayISO())}`;
  const text = buildEmailBody(list, s.base_url);
  const transport = buildTransport();
  await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: emails.join(','),
    subject,
    text,
  });
  return { sentTo: emails, count: list.length };
}

module.exports = { isMailerConfigured, sendReminderEmailNow, fetchExpiringList };
