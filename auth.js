const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Must be set in production (Render env var) -- a real random secret, not this fallback.
// The fallback exists only so local dev works without extra setup; server.js warns loudly
// if it's still in use once NODE_ENV=production.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me';
const TOKEN_TTL = '12h'; // matches the old app's 12h session convenience window

const ROLE_RANK = { viewer: 1, editor: 2, superadmin: 3 };

function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}
function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}
function signToken(account) {
  return jwt.sign({ sub: account.id, username: account.username, role: account.role }, JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
}
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

const COOKIE_NAME = 'cswind_session';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  // Render terminates TLS in front of the app, so req is plain HTTP internally but the
  // browser sees HTTPS -- trust the proxy header rather than req.secure directly (set in
  // server.js via app.set('trust proxy', 1)) so this still marks the cookie Secure in prod.
  secure: process.env.NODE_ENV === 'production',
  maxAge: 12 * 60 * 60 * 1000,
};

function setSessionCookie(res, account) {
  res.cookie(COOKIE_NAME, signToken(account), COOKIE_OPTS);
}
function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: COOKIE_OPTS.secure });
}

// Attaches req.user = {id, username, role} when a valid session cookie is present;
// otherwise req.user stays undefined. Never rejects by itself -- routes decide what auth
// they need via requireRole().
function readSession(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  const payload = token ? verifyToken(token) : null;
  if (payload) {
    req.user = { id: payload.sub, username: payload.username, role: payload.role };
  }
  next();
}

// Route guard: requireRole('editor') passes for role editor OR superadmin (rank >=).
// requireRole('superadmin') passes only for superadmin. Always checked server-side --
// this is the real access-control boundary the previous Claude-Artifact version could
// never actually have.
function requireRole(minRole) {
  const minRank = ROLE_RANK[minRole];
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
    if ((ROLE_RANK[req.user.role] || 0) < minRank) {
      return res.status(403).json({ error: 'forbidden', message: 'Bạn không có quyền thực hiện thao tác này.' });
    }
    next();
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
  readSession,
  requireRole,
  JWT_SECRET,
};
