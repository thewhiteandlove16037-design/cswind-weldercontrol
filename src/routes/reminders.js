const express = require('express');
const { sendReminderEmailNow, isMailerConfigured } = require('../mailer');

const router = express.Router();

// Two ways in: a signed-in superadmin (the "Send test email now" button in the app), or an
// external scheduler (e.g. cron-job.org hitting this weekly) presenting the shared secret
// as X-Reminder-Secret. Neither requires the app to stay awake by itself on the Free plan --
// the external ping wakes it. Reject anything else so a stranger can't spam-trigger sends.
function authorizeReminderTrigger(req, res, next) {
  if (req.user && req.user.role === 'superadmin') return next();
  const provided = req.get('X-Reminder-Secret');
  const expected = process.env.REMINDER_SECRET;
  if (expected && provided && provided === expected) return next();
  return res.status(401).json({ error: 'not_authenticated' });
}

router.get('/status', (req, res) => {
  // Lets the admin UI show whether SMTP is even configured, without exposing credentials.
  res.json({ configured: isMailerConfigured() });
});

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
