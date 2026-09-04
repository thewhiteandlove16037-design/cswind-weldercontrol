const express = require('express');
const { pool } = require('../db');
const { requireRole } = require('../auth');

const router = express.Router();

// Public read: the entity switcher shows on the Lookup tab too, which unauthenticated
// customers use (scanning a QR code, no login) -- they need the list to know which
// entity's data they're looking at, even though they can't add to it.
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT code, label, sort_order FROM entities ORDER BY sort_order, code');
  res.json(rows.map((r) => ({ code: r.code, label: r.label })));
});

// Creating a new entity is a structural change (like Accounts/Settings), not a data edit --
// restricted to superadmin so a public visitor or a plain editor can't spawn new segments.
router.post('/', requireRole('superadmin'), async (req, res) => {
  const { code, label } = req.body || {};
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanCode) return res.status(400).json({ error: 'missing_fields' });
  if (!/^[A-Z0-9][A-Z0-9-]{0,19}$/.test(cleanCode)) {
    return res.status(400).json({ error: 'invalid_code' });
  }
  const dup = await pool.query('SELECT 1 FROM entities WHERE code = $1', [cleanCode]);
  if (dup.rowCount) return res.status(409).json({ error: 'already_exists' });
  const { rows: maxRows } = await pool.query('SELECT COALESCE(MAX(sort_order),0)::int AS m FROM entities');
  const sortOrder = maxRows[0].m + 1;
  await pool.query('INSERT INTO entities (code, label, sort_order) VALUES ($1,$2,$3)', [
    cleanCode,
    (label || cleanCode).trim() || cleanCode,
    sortOrder,
  ]);
  res.status(201).json({ code: cleanCode, label: (label || cleanCode).trim() || cleanCode });
});

module.exports = router;
