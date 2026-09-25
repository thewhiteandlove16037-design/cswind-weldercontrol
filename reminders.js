const express = require('express');
const crypto = require('crypto');
const {
  sendReminderEmailNow, isMailerConfigured, isAppsScriptConfigured,
  composeEntityReminders, recordReminderSent, getLastReminder,
} = require('../mailer');

const router = express.Router();

function secretMatches(provided) {
  const expected = process.env.REMINDER_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Two ways in: a signed-in superadmin (buttons in the app), or the scheduler -- the Gmail
// Google Apps Script (or any external cron) presenting the shared secret as the
// X-Reminder-Secret header. Reject anything else so a stranger can't read the list or
// spam-trigger sends.
function authorizeReminderTrigger(req, res, next) {
  if (req.user && req.user.role === 'superadmin') return next();
  if (secretMatches(req.get('X-Reminder-Secret'))) return next();
  return res.status(401).json({ error: 'not_authenticated' });
}

router.get('/status', async (req, res) => {
  // Lets the admin UI show how (and whether) automatic sending is set up, without exposing
  // any credential. "Last sent" details are for signed-in staff only.
  let last = null;
  try { last = await getLastReminder(); } catch (e) { /* column missing on a very old DB -- ignore */ }
  res.json({
    configured: isMailerConfigured(),          // direct SMTP from the app (paid plan)
    gmailReady: isAppsScriptConfigured(),      // Gmail via Google Apps Script
    last: req.user ? last : null,
  });
});

// Old (update7) single-email endpoint. Replaced by /payload-v2 (one email per entity) --
// answer clearly so an old copy of the Apps Script fails with an explanation instead of
// silently sending one combined email to the old global list.
router.get('/payload', authorizeReminderTrigger, (req, res) => {
  res.status(410).json({
    error: 'script_outdated',
    message: 'Script Google Apps Script đã cũ — hãy thay bằng bản GuiMailNhacNho.gs mới (update9: gửi riêng từng entity).',
  });
});

// Gmail / Apps Script path, step 1: hand over the ready-to-send emails, one per entity
// that has something due AND has recipients. Sends nothing, changes nothing.
router.get('/payload-v2', authorizeReminderTrigger, async (req, res) => {
  try {
    const plan = await composeEntityReminders();
    res.json({ ok: true, ...plan });
  } catch (e) {
    console.error('Reminder payload failed:', e.message);
    res.status(500).json({ error: 'payload_failed', message: e.message });
  }
});

// Gmail / Apps Script path, step 2: the script reports what it actually sent.
// Body: {results: [{entity, count, sentTo: [...]}, ...]}
router.post('/ack', authorizeReminderTrigger, async (req, res) => {
  const results = Array.isArray((req.body || {}).results) ? req.body.results : [];
  try {
    for (const r of results) {
      if (!r || !r.entity) continue;
      await recordReminderSent({
        entity: String(r.entity),
        count: parseInt(r.count, 10),
        to: Array.isArray(r.sentTo) ? r.sentTo.map(String) : [],
        via: 'gmail',
      });
    }
    console.log(`Reminder emails sent via Gmail/Apps Script: ${results.map((r) => r.entity + ':' + r.count).join(', ') || 'none'}.`);
    res.json({ ok: true, recorded: results.length });
  } catch (e) {
    console.error('Reminder ack failed:', e.message);
    res.status(500).json({ error: 'ack_failed' });
  }
});

// Direct SMTP send (only works on a paid Render instance -- Free blocks SMTP ports).
router.post('/send', authorizeReminderTrigger, async (req, res) => {
  try {
    const result = await sendReminderEmailNow();
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('Reminder send failed:', e.message);
    res.status(500).json({ error: 'send_failed', message: e.message });
  }
});

module.exports = router;
