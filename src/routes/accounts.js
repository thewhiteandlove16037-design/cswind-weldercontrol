const express = require('express');
const { pool } = require('../db');
const { hashPassword, forbidden, ROLES } = require('../auth');

const router = express.Router();

// Who may manage accounts:
//  - superadmin: every account, every role, any entity scope.
//  - entityadmin ("Admin CSW VN"...): only "Quản trị viên" (editor) and "Chỉ xem" (viewer)
//    accounts scoped to their OWN entity. They can never see/touch superadmins, other
//    entity admins, global accounts, or accounts of other entities -- and can't create them.
router.use((req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  if (req.user.role === 'superadmin') return next();
  if (req.user.role === 'entityadmin' && req.user.entity) return next();
  return forbidden(res);
});

const isSuper = (req) => req.user.role === 'superadmin';
const SCOPED_ROLES_FOR_ENTITY_ADMIN = ['editor', 'viewer'];

async function entityExists(code) {
  const { rowCount } = await pool.query('SELECT 1 FROM entities WHERE code = $1', [code]);
  return rowCount > 0;
}

// Validates a (role, entity) pair for the CALLER. Returns {role, entity} normalized, or an
// {error} to send back as 400/403.
async function normalizeRoleEntity(req, role, entity) {
  if (!ROLES.includes(role)) return { status: 400, error: 'invalid_role' };
  let ent = entity ? String(entity).trim().toUpperCase() : null;
  if (!isSuper(req)) {
    if (!SCOPED_ROLES_FOR_ENTITY_ADMIN.includes(role)) return { status: 403, error: 'forbidden' };
    ent = req.user.entity; // always forced to the entity admin's own entity
  }
  if (role === 'superadmin') ent = null; // superadmin is always global
  if (role === 'entityadmin' && !ent) return { status: 400, error: 'entity_required' };
  if (ent && !(await entityExists(ent))) return { status: 400, error: 'invalid_entity' };
  return { role, entity: ent };
}

// Is the target account inside the caller's management scope?
function inScope(req, target) {
  if (isSuper(req)) return true;
  return target.entity === req.user.entity && SCOPED_ROLES_FOR_ENTITY_ADMIN.includes(target.role);
}

async function loadTarget(id) {
  const { rows } = await pool.query('SELECT id, username, role, entity FROM accounts WHERE id = $1', [id]);
  return rows[0] || null;
}

router.get('/', async (req, res) => {
  const { rows } = isSuper(req)
    ? await pool.query('SELECT id, username, role, entity, created_at FROM accounts ORDER BY created_at')
    : await pool.query(
        `SELECT id, username, role, entity, created_at FROM accounts
         WHERE entity = $1 AND role IN ('editor','viewer') ORDER BY created_at`,
        [req.user.entity]
      );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { username, password, role, entity } = req.body || {};
  if (!username || !password || !role) return res.status(400).json({ error: 'missing_fields' });
  if (password.length < 4) return res.status(400).json({ error: 'password_too_short' });
  const norm = await normalizeRoleEntity(req, role, entity);
  if (norm.error) return res.status(norm.status).json({ error: norm.error });
  const dup = await pool.query('SELECT 1 FROM accounts WHERE lower(username) = lower($1)', [username]);
  if (dup.rowCount) return res.status(409).json({ error: 'already_exists' });
  const hash = await hashPassword(password);
  const { rows } = await pool.query(
    'INSERT INTO accounts (username, password_hash, role, entity) VALUES ($1,$2,$3,$4) RETURNING id, username, role, entity, created_at',
    [username, hash, norm.role, norm.entity]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id/password', async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 4) return res.status(400).json({ error: 'password_too_short' });
  const target = await loadTarget(req.params.id);
  if (!target) return res.status(404).json({ error: 'not_found' });
  if (!inScope(req, target)) return forbidden(res);
  const hash = await hashPassword(password);
  await pool.query('UPDATE accounts SET password_hash = $2 WHERE id = $1', [target.id, hash]);
  res.json({ ok: true });
});

// Change role and/or entity scope. Body: {role, entity}. `entity` omitted = keep current.
router.put('/:id/role', async (req, res) => {
  const { role } = req.body || {};
  const target = await loadTarget(req.params.id);
  if (!target) return res.status(404).json({ error: 'not_found' });
  if (!inScope(req, target)) return forbidden(res);
  const wantedEntity = Object.prototype.hasOwnProperty.call(req.body || {}, 'entity') ? req.body.entity : target.entity;
  const norm = await normalizeRoleEntity(req, role, wantedEntity);
  if (norm.error) return res.status(norm.status).json({ error: norm.error });
  // Never demote the last remaining superadmin (would lock everyone out of Accounts/Settings).
  if (target.role === 'superadmin' && norm.role !== 'superadmin') {
    const count = await pool.query("SELECT count(*)::int AS n FROM accounts WHERE role = 'superadmin'");
    if (count.rows[0].n <= 1) return res.status(400).json({ error: 'last_superadmin' });
  }
  await pool.query('UPDATE accounts SET role = $2, entity = $3 WHERE id = $1', [target.id, norm.role, norm.entity]);
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  const target = await loadTarget(req.params.id);
  if (!target) return res.status(404).json({ error: 'not_found' });
  if (!inScope(req, target)) return forbidden(res);
  // Guard against locking everyone out: refuse to delete the last remaining superadmin.
  if (target.role === 'superadmin') {
    const count = await pool.query("SELECT count(*)::int AS n FROM accounts WHERE role = 'superadmin'");
    if (count.rows[0].n <= 1) return res.status(400).json({ error: 'last_superadmin' });
  }
  await pool.query('DELETE FROM accounts WHERE id = $1', [target.id]);
  res.json({ ok: true });
});

module.exports = router;
