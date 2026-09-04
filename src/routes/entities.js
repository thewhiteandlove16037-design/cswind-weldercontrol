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

// Deleting an entity is superadmin-only, same as creating one -- and deliberately guarded
// against two ways it could destroy real welder data by mistake:
//  1. refuse if any welder still belongs to this entity (move or delete them first) --
//     otherwise their certificate records would be orphaned (entity column would point at a
//     code that no longer exists in the entities table).
//  2. refuse if this is the last remaining entity -- the app always needs at least one for
//     new/existing welders to belong to.
router.delete('/:code', requireRole('superadmin'), async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const { rows: welderRows } = await pool.query('SELECT count(*)::int AS n FROM welders WHERE entity = $1', [code]);
  if (welderRows[0].n > 0) {
    return res.status(409).json({ error: 'entity_in_use', count: welderRows[0].n });
  }
  const { rows: totalRows } = await pool.query('SELECT count(*)::int AS n FROM entities');
  if (totalRows[0].n <= 1) {
    return res.status(400).json({ error: 'last_entity' });
  }
  const result = await pool.query('DELETE FROM entities WHERE code = $1', [code]);
  if (!result.rowCount) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

module.exports = router;
