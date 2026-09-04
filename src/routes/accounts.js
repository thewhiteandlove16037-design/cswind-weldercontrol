const express = require('express');
const { pool } = require('../db');
const { hashPassword, requireRole } = require('../auth');

const router = express.Router();

// Every route here is superadmin-only: creating/resetting/deleting accounts and changing
// roles is exactly the boundary the user asked editors to stay out of.
router.use(requireRole('superadmin'));

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, username, role, created_at FROM accounts ORDER BY created_at'
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password || !role) return res.status(400).json({ error: 'missing_fields' });
  if (!['superadmin', 'editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'invalid_role' });
  }
  if (password.length < 4) return res.status(400).json({ error: 'password_too_short' });
  const dup = await pool.query('SELECT 1 FROM accounts WHERE lower(username) = lower($1)', [username]);
  if (dup.rowCount) return res.status(409).json({ error: 'already_exists' });
  const hash = await hashPassword(password);
  const { rows } = await pool.query(
    'INSERT INTO accounts (username, password_hash, role) VALUES ($1,$2,$3) RETURNING id, username, role, created_at',
    [username, hash, role]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id/password', async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 4) return res.status(400).json({ error: 'password_too_short' });
  const hash = await hashPassword(password);
  const result = await pool.query('UPDATE accounts SET password_hash = $2 WHERE id = $1', [
    req.params.id,
    hash,
  ]);
  if (!result.rowCount) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

router.put('/:id/role', async (req, res) => {
  const { role } = req.body || {};
  if (!['superadmin', 'editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'invalid_role' });
  }
  const result = await pool.query('UPDATE accounts SET role = $2 WHERE id = $1', [req.params.id, role]);
  if (!result.rowCount) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  // Guard against locking everyone out: refuse to delete the last remaining superadmin.
  const target = await pool.query('SELECT role FROM accounts WHERE id = $1', [req.params.id]);
  if (!target.rowCount) return res.status(404).json({ error: 'not_found' });
  if (target.rows[0].role === 'superadmin') {
    const count = await pool.query("SELECT count(*)::int AS n FROM accounts WHERE role = 'superadmin'");
    if (count.rows[0].n <= 1) {
      return res.status(400).json({ error: 'last_superadmin' });
    }
  }
  await pool.query('DELETE FROM accounts WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
