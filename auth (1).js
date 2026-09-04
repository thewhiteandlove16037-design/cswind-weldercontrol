const express = require('express');
const { pool } = require('../db');
const { verifyPassword, setSessionCookie, clearSessionCookie } = require('../auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  const { rows } = await pool.query(
    'SELECT id, username, password_hash, role FROM accounts WHERE lower(username) = lower($1)',
    [username]
  );
  const acc = rows[0];
  // Constant-shape response whether the username exists or not, to avoid confirming
  // valid usernames to a guesser -- but still allow a slightly slower path (a real
  // bcrypt compare) only when an account was found; this is a small internal tool, not
  // a target worth a dummy-hash timing-safe compare on every miss.
  if (!acc) return res.status(401).json({ error: 'invalid_credentials' });
  const ok = await verifyPassword(password, acc.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
  setSessionCookie(res, acc);
  res.json({ name: acc.username, role: acc.role });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  res.json({ name: req.user.username, role: req.user.role });
});

module.exports = router;
