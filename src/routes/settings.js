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

router.put('/', requireRole('superadmin'), async (req, res) => {
  const { baseUrl, warnDays, emails } = req.body || {};
  await pool.query(
    `UPDATE settings SET base_url = $1, warn_days = $2, emails = $3, updated_at = now() WHERE id = 1`,
    [baseUrl || '', parseInt(warnDays, 10) || 45, emails || '']
  );
  res.json({ ok: true });
});

module.exports = router;
