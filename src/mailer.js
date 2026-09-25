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
// database (no browser involved). Each certificate is judged with ITS entity's own warning
// window (entities.warn_days, falling back to the global one).
async function fetchExpiringList() {
  const { rows } = await pool.query(
    `SELECT w.id_welder, w.name, w.entity, c.process, c.valid_date,
            COALESCE(e.warn_days, s.warn_days, 45) AS warn_days
     FROM certificates c
     JOIN welders w ON w.id_welder = c.welder_id
     LEFT JOIN entities e ON e.code = w.entity
     CROSS JOIN (SELECT warn_days FROM settings WHERE id = 1) s
     WHERE c.valid_date IS NOT NULL
     ORDER BY c.valid_date ASC`
  );
  const out = [];
  for (const r of rows) {
    const validIso = r.valid_date ? r.valid_date.toISOString().slice(0, 10) : null;
    const st = certStatus(validIso, r.warn_days);
    if (st === 'warn' || st === 'bad') {
      out.push({ idWelder: r.id_welder, name: r.name, entity: r.entity || 'CSW-VN', process: r.process, validDate: validIso, status: st });
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
  signName: 'CSWIND — QR-ID Thợ hàn (email tự động thứ 2 & thứ 6 / automated Monday & Friday reminder)',
  none: '(Không có chứng chỉ nào sắp/đã hết hạn. / None currently expiring or expired.)',
};

// Same counts as the in-app "Sắp (a) / đã hết hạn (b) — cần gia hạn (t)" heading.
function countsFor(list) {
  const warn = list.filter((x) => x.status === 'warn');
  return {
    warn: warn.length,
    bad: list.filter((x) => x.status === 'bad').length,
    total: list.length,
    people: new Set(list.map((x) => x.idWelder)).size,
    peopleWarn: new Set(warn.map((x) => x.idWelder)).size,
  };
}
function summaryLines(c) {
  return [
    `Sắp hết hạn (${c.warn}) / đã hết hạn (${c.bad}) — cần gia hạn (${c.total})`,
    `Expiring soon (${c.warn}) / already expired (${c.bad}) — needs renewal (${c.total})`,
    `Tổng số người có chứng chỉ cần gia hạn / People needing renewal: ${c.people} · Sắp hết hạn / Expiring soon: ${c.peopleWarn}`,
  ];
}

function buildEmailText(list, baseUrl, entityLabelText) {
  const c = countsFor(list);
  const listBlock = list.length
    ? list.map((x, i) => {
        const link = profileLink(baseUrl, x.idWelder);
        return `${i + 1}. ${x.name} · ${x.idWelder} · ${x.process || '—'} · ${fmtDate(x.validDate)} · ${STATUS_LABEL[x.status]}${link ? ' — ' + link : ''}`;
      }).join('\n')
    : TXT.none;
  return [
    `Entity: ${entityLabelText}`, '', TXT.intro, '', ...summaryLines(c), '',
    TXT.listHeading, listBlock, '', TXT.closing, '', TXT.signOff, TXT.signName,
  ].join('\n');
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildEmailHtml(list, baseUrl, entityLabelText) {
  const c = countsFor(list);
  const th = 'style="text-align:left;padding:8px 10px;background:#0B3D91;color:#fff;font-size:13px;white-space:nowrap"';
  const td = 'style="padding:7px 10px;border-bottom:1px solid #e3e8ef;font-size:13px;vertical-align:top"';
  const tdn = 'style="padding:7px 10px;border-bottom:1px solid #e3e8ef;font-size:13px;vertical-align:top;white-space:nowrap"';
  const badge = (st) => {
    const col = st === 'bad' ? ['#FDECEC', '#B42318'] : ['#FFF6DB', '#8A5A00'];
    return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${col[0]};color:${col[1]};font-size:12px;font-weight:bold;white-space:nowrap">${esc(STATUS_LABEL[st])}</span>`;
  };
  const box = (n, label, color) => `<td style="padding:10px 14px;border:1px solid #e3e8ef;border-radius:8px;vertical-align:top;width:33%"><div style="font-size:22px;font-weight:bold;color:${color}">${n}</div><div style="font-size:12px;color:#5b6b7d">${label}</div></td>`;
  const rows = list.map((x, i) => {
    const link = profileLink(baseUrl, x.idWelder);
    const id = link ? `<a href="${esc(link)}" style="color:#1558C7">${esc(x.idWelder)}</a>` : esc(x.idWelder);
    const left = daysLeft(x.validDate);
    const remain = left < 0 ? `Quá hạn / Overdue ${-left} ngày/days` : `${left} ngày/days`;
    return `<tr><td ${td}>${i + 1}</td><td ${tdn}>${esc(x.name)}</td><td ${tdn}>${id}</td><td ${td}>${esc(x.process || '—')}</td><td ${tdn}>${fmtDate(x.validDate)}</td><td ${td}>${remain}</td><td ${td}>${badge(x.status)}</td></tr>`;
  }).join('');
  const table = list.length
    ? `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:900px;border:1px solid #e3e8ef">
<tr><th ${th}>No.</th><th ${th}>Họ tên / Name</th><th ${th}>Mã / ID</th><th ${th}>Quy trình / Process</th><th ${th}>Hết hạn / Valid until</th><th ${th}>Còn lại / Remaining</th><th ${th}>Trạng thái / Status</th></tr>
${rows}</table>`
    : `<p style="color:#5b6b7d">${esc(TXT.none)}</p>`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1c2733;font-size:14px;line-height:1.5">
<p style="margin:0 0 4px;color:#5b6b7d;font-size:12px">ENTITY</p>
<p style="margin:0 0 14px;font-size:18px;font-weight:bold;color:#0B3D91">${esc(entityLabelText)}</p>
<p>${esc(TXT.intro)}</p>
<p style="font-weight:bold;margin:16px 0 8px">Sắp (${c.warn}) / đã hết hạn (${c.bad}) — cần gia hạn (${c.total})<br><span style="font-weight:normal;color:#5b6b7d">Expiring (${c.warn}) / already expired (${c.bad}) — needs renewal (${c.total})</span></p>
<table cellspacing="6" cellpadding="0" style="border-collapse:separate;width:100%;max-width:900px;margin-bottom:10px"><tr>
${box(c.total, 'Tổng số chứng chỉ nhắc nhở / Certificates in reminder', '#1c2733')}
${box(c.people, 'Tổng số người có chứng chỉ cần gia hạn / People needing renewal', '#c2410c')}
${box(c.peopleWarn, 'Tổng số người có chứng chỉ sắp hết hạn / People expiring soon', '#ca8a04')}
</tr></table>
${table}
<p style="margin-top:16px">${esc(TXT.closing)}</p>
<p style="margin-top:16px">${esc(TXT.signOff)}<br><span style="color:#5b6b7d;font-size:12px">${esc(TXT.signName)}</span></p>
</div>`;
}

const splitEmails = (s) => String(s || '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

// Builds one email PER ENTITY (recipients = that entity's own list, content = only that
// entity's certificates) without sending anything. Entities with nothing due or without
// recipients are reported in `skipped` instead. Used by both the Gmail/Apps Script payload
// endpoint and the direct-SMTP path.
async function composeEntityReminders() {
  const { rows: srows } = await pool.query('SELECT base_url FROM settings WHERE id = 1');
  const baseUrl = (srows[0] && srows[0].base_url) || '';
  const { rows: ents } = await pool.query('SELECT code, label, emails FROM entities ORDER BY sort_order, code');
  const all = await fetchExpiringList();
  const today = fmtDate(todayISO());
  const mails = [];
  const skipped = [];
  for (const e of ents) {
    const list = all.filter((x) => x.entity === e.code);
    const to = splitEmails(e.emails);
    const labelText = `${e.label} (${e.code})`;
    if (!list.length) { skipped.push({ entity: e.code, label: e.label, reason: 'nothing_due', count: 0, to }); continue; }
    if (!to.length) { skipped.push({ entity: e.code, label: e.label, reason: 'no_recipients', count: list.length, to }); continue; }
    const c = countsFor(list);
    mails.push({
      entity: e.code,
      label: e.label,
      to,
      subject: `[CSWIND][${e.code}] Danh sách thợ hàn cần gia hạn / tái đánh giá (${c.total}) — ${today}`,
      text: buildEmailText(list, baseUrl, labelText),
      html: buildEmailHtml(list, baseUrl, labelText),
      count: c.total,
      counts: c,
    });
  }
  return { mails, skipped, date: today };
}

// Records a completed send for one entity (and the global "last sent" line).
async function recordReminderSent({ entity, count, to, via }) {
  const n = Number.isFinite(count) ? count : null;
  const toText = (to || []).join(', ').slice(0, 1000);
  if (entity) {
    await pool.query(
      'UPDATE entities SET last_reminder_at = now(), last_reminder_count = $2, last_reminder_to = $3 WHERE code = $1',
      [String(entity).toUpperCase(), n, toText]
    );
  }
  await pool.query(
    `UPDATE settings SET last_reminder_at = now(), last_reminder_count = $1, last_reminder_to = $2, last_reminder_via = $3 WHERE id = 1`,
    [n, (entity ? `[${entity}] ` : '') + toText, String(via || '').slice(0, 20)]
  );
}

async function getLastReminder() {
  const { rows } = await pool.query('SELECT last_reminder_at, last_reminder_count, last_reminder_to, last_reminder_via FROM settings WHERE id = 1');
  const r = rows[0] || {};
  return r.last_reminder_at
    ? { at: r.last_reminder_at, count: r.last_reminder_count, to: r.last_reminder_to, via: r.last_reminder_via }
    : null;
}

// Direct SMTP (paid Render plan only): sends every entity's email. Throws if SMTP isn't
// configured; per-entity failures are collected and reported, not thrown.
async function sendReminderEmailNow() {
  if (!isMailerConfigured()) {
    throw new Error('SMTP chưa được cấu hình (thiếu biến môi trường SMTP_USER / SMTP_PASS).');
  }
  const plan = await composeEntityReminders();
  const transport = buildTransport();
  const sent = [];
  const failed = [];
  for (const m of plan.mails) {
    try {
      await transport.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to: m.to.join(','), subject: m.subject, text: m.text, html: m.html });
      await recordReminderSent({ entity: m.entity, count: m.count, to: m.to, via: 'smtp' });
      sent.push({ entity: m.entity, count: m.count, sentTo: m.to });
    } catch (e) {
      failed.push({ entity: m.entity, error: e.message });
    }
  }
  return { sent, failed, skipped: plan.skipped, count: sent.reduce((a, x) => a + x.count, 0) };
}

module.exports = {
  isMailerConfigured, isAppsScriptConfigured, sendReminderEmailNow, fetchExpiringList,
  composeEntityReminders, recordReminderSent, getLastReminder,
};
