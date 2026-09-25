// Weekly "certificates expiring/expired" reminder email.
//
// Two ways the email actually gets sent (update7):
//
//  1. RECOMMENDED on Render's Free plan -- Gmail via Google Apps Script.
//     Render Free web services block outbound SMTP (ports 25/465/587) since Sept 2025, so
//     the app cannot talk to smtp.gmail.com itself. Instead a small Apps Script living in
//     the sender's own Gmail account runs on a timer (Mon + Fri 08:00), fetches the ready-
//     made email from GET /api/reminders/payload (HTTPS, allowed on Free), sends it with
//     Gmail, then calls POST /api/reminders/ack so the admin UI can show "last sent".
//     Only needs REMINDER_SECRET set on Render. Script: google-apps-script/GuiMailNhacNho.gs
//
//  2. Direct SMTP from the app (only works on a PAID Render instance). Needs:
//       SMTP_USER, SMTP_PASS (an App Password, not the normal login password)
//     Optional: SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 465), MAIL_FROM.
//     Do NOT set these while using option 1, or recipients get the email twice.
//
// Credentials only ever come from Render environment variables -- never hardcoded, never
// returned by any API response.
const nodemailer = require('nodemailer');
const { pool } = require('./db');

function isMailerConfigured() {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}
function isAppsScriptConfigured() {
  return !!process.env.REMINDER_SECRET;
}

function buildTransport() {
  const port = parseInt(process.env.SMTP_PORT, 10) || 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465, // implicit TLS on 465; STARTTLS on 587
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
}
// "Today" in Vietnam time regardless of the server's own timezone (Render runs in UTC, and
// the Mon/Fri 08:00 send happens at 01:00 UTC -- the local date is what readers expect).
function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
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
function daysLeft(validDate) {
  return Math.round((new Date(validDate) - new Date(todayISO())) / 86400000);
}
const STATUS_LABEL = { ok: 'Còn hạn / Valid', warn: 'Sắp hết hạn / Expiring soon', bad: 'Hết hạn / Expired' };

// Pulls the same "expiring or expired" set the in-app report shows, straight from the
// database (not from a client's in-memory WELDERS array -- this runs with no browser open).
async function fetchExpiringList(warnDays) {
  const { rows } = await pool.query(
    `SELECT w.id_welder, w.name, w.entity, c.process, c.valid_date
     FROM certificates c JOIN welders w ON w.id_welder = c.welder_id
     WHERE c.valid_date IS NOT NULL
     ORDER BY c.valid_date ASC`
  );
  const out = [];
  for (const r of rows) {
    const validIso = r.valid_date ? r.valid_date.toISOString().slice(0, 10) : null;
    const st = certStatus(validIso, warnDays);
    if (st === 'warn' || st === 'bad') {
      out.push({ idWelder: r.id_welder, name: r.name, entity: r.entity, process: r.process, validDate: validIso, status: st });
    }
  }
  return out;
}

function profileLink(baseUrl, idWelder) {
  return baseUrl ? `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(idWelder.toLowerCase())}` : '';
}

const TXT = {
  intro: 'Dear Sir/ Madam: please check the list of welders/ welding operator that need extend valid date or re-qualification.',
  listHeading: 'Danh sách / List:',
  closing: 'Đề nghị gia hạn hoặc tái đánh giá tay nghề trước ngày hết hạn. / Please renew or re-qualify before the expiry date.',
  signOff: 'Trân trọng / Regards,',
  signName: 'CSWIND Việt Nam — QR-ID Thợ hàn (email tự động thứ 2 & thứ 6 / automated Monday & Friday reminder)',
  none: '(Không có chứng chỉ nào sắp/đã hết hạn. / None currently expiring or expired.)',
};

function buildEmailText(list, baseUrl) {
  const listBlock = list.length
    ? list.map((x, i) => {
        const link = profileLink(baseUrl, x.idWelder);
        return `${i + 1}. ${x.idWelder} · ${x.name} · ${x.entity || '—'} · ${x.process || '—'} · ${fmtDate(x.validDate)} · ${STATUS_LABEL[x.status]}${link ? ' — ' + link : ''}`;
      }).join('\n')
    : TXT.none;
  return [TXT.intro, '', TXT.listHeading, listBlock, '', TXT.closing, '', TXT.signOff, TXT.signName].join('\n');
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildEmailHtml(list, baseUrl) {
  const th = 'style="text-align:left;padding:8px 10px;background:#0B3D91;color:#fff;font-size:13px;white-space:nowrap"';
  const td = 'style="padding:7px 10px;border-bottom:1px solid #e3e8ef;font-size:13px;vertical-align:top"';
  const tdn = 'style="padding:7px 10px;border-bottom:1px solid #e3e8ef;font-size:13px;vertical-align:top;white-space:nowrap"';
  const badge = (st) => {
    const c = st === 'bad' ? ['#FDECEC', '#B42318'] : ['#FFF6DB', '#8A5A00'];
    return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${c[0]};color:${c[1]};font-size:12px;font-weight:bold;white-space:nowrap">${esc(STATUS_LABEL[st])}</span>`;
  };
  const rows = list.map((x, i) => {
    const link = profileLink(baseUrl, x.idWelder);
    const id = link ? `<a href="${esc(link)}" style="color:#1558C7">${esc(x.idWelder)}</a>` : esc(x.idWelder);
    const left = daysLeft(x.validDate);
    const remain = left < 0 ? `Quá hạn / Overdue ${-left} ngày/days` : `${left} ngày/days`;
    return `<tr><td ${td}>${i + 1}</td><td ${tdn}>${id}</td><td ${td}>${esc(x.name)}</td><td ${tdn}>${esc(x.entity || '—')}</td><td ${td}>${esc(x.process || '—')}</td><td ${tdn}>${fmtDate(x.validDate)}</td><td ${td}>${remain}</td><td ${td}>${badge(x.status)}</td></tr>`;
  }).join('');
  const table = list.length
    ? `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:900px;border:1px solid #e3e8ef">
<tr><th ${th}>#</th><th ${th}>Mã / ID</th><th ${th}>Họ tên / Name</th><th ${th}>Entity</th><th ${th}>Quy trình / Process</th><th ${th}>Hết hạn / Valid until</th><th ${th}>Còn lại / Remaining</th><th ${th}>Trạng thái / Status</th></tr>
${rows}</table>`
    : `<p style="color:#5b6b7d">${esc(TXT.none)}</p>`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1c2733;font-size:14px;line-height:1.5">
<p>${esc(TXT.intro)}</p>
<p style="font-weight:bold;margin:16px 0 8px">${esc(TXT.listHeading)} ${list.length}</p>
${table}
<p style="margin-top:16px">${esc(TXT.closing)}</p>
<p style="margin-top:16px">${esc(TXT.signOff)}<br><span style="color:#5b6b7d;font-size:12px">${esc(TXT.signName)}</span></p>
</div>`;
}

// Builds the complete email (recipients from Settings + today's expiring list) without
// sending it. Used by both the direct-SMTP path and the Gmail/Apps Script payload endpoint.
async function composeReminder() {
  const { rows } = await pool.query('SELECT warn_days, emails, base_url FROM settings WHERE id = 1');
  const s = rows[0] || {};
  const warnDays = s.warn_days || 45;
  const to = (s.emails || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  const list = await fetchExpiringList(warnDays);
  return {
    to,
    subject: `[CSWIND] Danh sách thợ hàn cần gia hạn / tái đánh giá — ${fmtDate(todayISO())}`,
    text: buildEmailText(list, s.base_url),
    html: buildEmailHtml(list, s.base_url),
    count: list.length,
  };
}

async function recordReminderSent({ count, to, via }) {
  await pool.query(
    `UPDATE settings SET last_reminder_at = now(), last_reminder_count = $1, last_reminder_to = $2, last_reminder_via = $3 WHERE id = 1`,
    [Number.isFinite(count) ? count : null, (to || []).join(', ').slice(0, 1000), String(via || '').slice(0, 20)]
  );
}

async function getLastReminder() {
  const { rows } = await pool.query('SELECT last_reminder_at, last_reminder_count, last_reminder_to, last_reminder_via FROM settings WHERE id = 1');
  const r = rows[0] || {};
  return r.last_reminder_at
    ? { at: r.last_reminder_at, count: r.last_reminder_count, to: r.last_reminder_to, via: r.last_reminder_via }
    : null;
}

// Sends the reminder now via direct SMTP (paid Render plan only). Throws if SMTP isn't
// configured or the send fails -- callers are responsible for reporting that.
async function sendReminderEmailNow() {
  if (!isMailerConfigured()) {
    throw new Error('SMTP chưa được cấu hình (thiếu biến môi trường SMTP_USER / SMTP_PASS).');
  }
  const mail = await composeReminder();
  if (!mail.to.length) {
    throw new Error('Chưa có email người nhận nào trong Cài đặt (Settings > emails).');
  }
  const transport = buildTransport();
  await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: mail.to.join(','),
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  await recordReminderSent({ count: mail.count, to: mail.to, via: 'smtp' });
  return { sentTo: mail.to, count: mail.count };
}

module.exports = {
  isMailerConfigured, isAppsScriptConfigured, sendReminderEmailNow, fetchExpiringList,
  composeReminder, recordReminderSent, getLastReminder,
};
