const express = require('express');
const crypto = require('crypto');
const {
  sendReminderEmailNow, isMailerConfigured, isAppsScriptConfigured,
  composeReminder, recordReminderSent, getLastReminder,
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

// Gmail / Apps Script path, step 1: hand over the ready-to-send email. Does not send
// anything and does not change any data.
router.get('/payload', authorizeReminderTrigger, async (req, res) => {
  try {
    const mail = await composeReminder();
    res.json({ ok: true, ...mail });
  } catch (e) {
    console.error('Reminder payload failed:', e.message);
    res.status(500).json({ error: 'payload_failed', message: e.message });
  }
});

// Gmail / Apps Script path, step 2: the script reports it has sent the email.
router.post('/ack', authorizeReminderTrigger, async (req, res) => {
  const { count, sentTo } = req.body || {};
  try {
    await recordReminderSent({
      count: parseInt(count, 10),
      to: Array.isArray(sentTo) ? sentTo.map(String) : [],
      via: 'gmail',
    });
    console.log(`Reminder email sent via Gmail/Apps Script to ${(sentTo || []).join(', ')} (${count} cert(s)).`);
    res.json({ ok: true });
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
