const { Pool } = require('pg');

// Render (and most hosts) inject a DATABASE_URL env var; Render's managed Postgres also
// requires SSL for external connections. Locally (no DATABASE_URL) fall back to discrete
// PG* env vars / defaults so this same code runs unmodified in dev and in production.
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
      }
    : {
        host: process.env.PGHOST || 'localhost',
        port: process.env.PGPORT || 5432,
        user: process.env.PGUSER || 'cswind',
        password: process.env.PGPASSWORD || 'localdevpass',
        database: process.env.PGDATABASE || 'cswind_app',
      }
);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('superadmin','editor','viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entities (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS welders (
  id_welder TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  id_employee TEXT,
  company TEXT,
  photo TEXT,
  entity TEXT NOT NULL DEFAULT 'CSW-VN',
  last_modified TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- NOTE: the entity index is created further down in initSchema(), AFTER the
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS migration -- not here. On a brand
-- new database CREATE TABLE already includes the column so it wouldn't
-- matter, but on any database that already has a "welders" table from an
-- earlier deploy (e.g. the live production DB), CREATE TABLE IF NOT EXISTS
-- is a no-op and the column doesn't exist yet at this point in the script.
-- An index statement here would crash on boot with "column entity does not
-- exist" on every pre-existing deployment.

CREATE TABLE IF NOT EXISTS certificates (
  id SERIAL PRIMARY KEY,
  welder_id TEXT NOT NULL REFERENCES welders(id_welder) ON DELETE CASCADE,
  process TEXT,
  type TEXT,
  base_material TEXT,
  filler_material TEXT,
  thickness TEXT,
  position TEXT,
  test_date DATE,
  valid_date DATE,
  standard TEXT,
  joint TEXT,
  remark TEXT,
  original_cert_image TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_certificates_welder_id ON certificates(welder_id);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  base_url TEXT NOT NULL DEFAULT '',
  warn_days INTEGER NOT NULL DEFAULT 45,
  emails TEXT NOT NULL DEFAULT '',
  data_as_of DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT settings_single_row CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  account_name TEXT NOT NULL,
  action TEXT NOT NULL,
  welder_id TEXT,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

// Default entities: CSW Vietnam (where the existing 260 welders live) plus CS Wind's other
// production sites. Superadmins can add more later via POST /api/entities -- this seed only
// ever inserts, never overwrites, so a renamed/reordered entity stays as the user left it.
const DEFAULT_ENTITIES = [
  ['CSW-VN', 'CSW Việt Nam', 1],
  ['CSW-HQ', 'CSW HQ', 2],
  ['CSW-TR', 'CSW Turkey', 3],
  ['CSW-AM', 'CSW America', 4],
  ['CSW-CN', 'CSW China', 5],
  ['CSW-TW', 'CSW Taiwan', 6],
  ['CSW-PT', 'CSW Portugal', 7],
];

async function initSchema() {
  await pool.query(SCHEMA);
  // Migration for databases created before the "entity" column existed (CREATE TABLE IF
  // NOT EXISTS above only affects brand-new tables) -- idempotent, safe to run every boot.
  await pool.query(`ALTER TABLE welders ADD COLUMN IF NOT EXISTS entity TEXT NOT NULL DEFAULT 'CSW-VN'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_welders_entity ON welders(entity)`);
  // Seed a single settings row if none exists yet.
  await pool.query(
    `INSERT INTO settings (id, base_url, warn_days, emails)
     VALUES (1, '', 45, '')
     ON CONFLICT (id) DO NOTHING`
  );
  for (const [code, label, sortOrder] of DEFAULT_ENTITIES) {
    await pool.query(
      `INSERT INTO entities (code, label, sort_order) VALUES ($1,$2,$3) ON CONFLICT (code) DO NOTHING`,
      [code, label, sortOrder]
    );
  }
}

module.exports = { pool, initSchema };
