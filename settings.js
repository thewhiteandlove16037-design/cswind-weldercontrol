const express = require('express');
const { pool } = require('../db');
const { requireRole } = require('../auth');

const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM settings WHERE id = 1');
  const s = rows[0];
  res.json({
    baseUrl: s.base_url,
    warnDays: s.warn_days,
    // Recipient emails are operational contact info, not a secret -- but only show them
    // to signed-in staff, not anonymous QR-scanning customers.
    emails: req.user ? s.emails : undefined,
    dataAsOf: s.data_as_of ? s.data_as_of.toISOString().slice(0, 10) : null,
    updatedAt: s.updated_at,
  });
});

// Global settings are superadmin-only. Since update9 only Base URL is edited here (warning
// days + recipients moved to each entity: PUT /api/entities/:code/settings). Fields that are
// not sent are left untouched, so an older page can't wipe them by accident.
router.put('/', requireRole('superadmin'), async (req, res) => {
  const body = req.body || {};
  const sets = [];
  const vals = [];
  if (Object.prototype.hasOwnProperty.call(body, 'baseUrl')) { vals.push(String(body.baseUrl || '').trim()); sets.push(`base_url = $${vals.length}`); }
  if (Object.prototype.hasOwnProperty.call(body, 'warnDays')) { vals.push(parseInt(body.warnDays, 10) || 45); sets.push(`warn_days = $${vals.length}`); }
  if (!sets.length) return res.json({ ok: true });
  await pool.query(`UPDATE settings SET ${sets.join(', ')}, updated_at = now() WHERE id = 1`, vals);
  res.json({ ok: true });
});

module.exports = router;
