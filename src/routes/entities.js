const express = require('express');
const { pool } = require('../db');
const { requireRole, canManageEntitySettings, forbidden } = require('../auth');

const router = express.Router();

// Public read: the entity switcher shows on the Lookup tab too, which unauthenticated
// customers use (scanning a QR code, no login) -- they need the list to know which
// entity's data they're looking at, even though they can't add to it.
// warnDays is public (it decides the Valid/Expiring badge customers see); reminder
// recipients and "last reminder sent" are staff-only.
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT code, label, sort_order, warn_days, emails, last_reminder_at, last_reminder_count, last_reminder_to
     FROM entities ORDER BY sort_order, code`
  );
  res.json(rows.map((r) => {
    const out = { code: r.code, label: r.label, warnDays: r.warn_days || null };
    if (req.user) {
      out.emails = r.emails || '';
      out.lastReminder = r.last_reminder_at
        ? { at: r.last_reminder_at, count: r.last_reminder_count, to: r.last_reminder_to }
        : null;
    }
    return out;
  }));
});

// Per-entity settings: warning window + reminder recipients. Superadmin for any entity;
// an entity admin only for their own entity. (Base URL stays global, superadmin-only.)
router.put('/:code/settings', async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  if (!canManageEntitySettings(req.user, code)) return forbidden(res);
  const { warnDays, emails } = req.body || {};
  const wd = parseInt(warnDays, 10);
  if (!Number.isFinite(wd) || wd < 1 || wd > 3650) return res.status(400).json({ error: 'invalid_warn_days' });
  const cleanEmails = String(emails || '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  const bad = cleanEmails.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (bad.length) return res.status(400).json({ error: 'invalid_email', emails: bad });
  const result = await pool.query('UPDATE entities SET warn_days = $2, emails = $3 WHERE code = $1', [
    code, wd, cleanEmails.join(', '),
  ]);
  if (!result.rowCount) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, warnDays: wd, emails: cleanEmails.join(', ') });
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
  await pool.query(
    `INSERT INTO entities (code, label, sort_order, warn_days)
     VALUES ($1,$2,$3,(SELECT warn_days FROM settings WHERE id = 1))`,
    [cleanCode, (label || cleanCode).trim() || cleanCode, sortOrder]
  );
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
  // Also refuse while accounts are still scoped to it (Admin CSW xx etc.) -- delete or
  // re-scope those accounts first, otherwise they'd be tied to an entity that no longer exists.
  const { rows: accRows } = await pool.query('SELECT count(*)::int AS n FROM accounts WHERE entity = $1', [code]);
  if (accRows[0].n > 0) {
    return res.status(409).json({ error: 'entity_has_accounts', count: accRows[0].n });
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
