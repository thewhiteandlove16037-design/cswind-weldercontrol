const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const { pool, initSchema } = require('./db');
const { readSession, JWT_SECRET, hashPassword } = require('./auth');

const authRoutes = require('./routes/auth');
const welderRoutes = require('./routes/welders');
const accountRoutes = require('./routes/accounts');
const settingsRoutes = require('./routes/settings');

const app = express();

// Render (and most PaaS hosts) sit behind a reverse proxy that terminates TLS -- without
// this, express-session-style "secure" cookies and req.secure would never look correct.
app.set('trust proxy', 1);

app.use(express.json({ limit: '15mb' })); // certificate scan images ride along as base64
app.use(cookieParser());
app.use(readSession);

app.use('/api/auth', authRoutes);
app.use('/api/welders', welderRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/settings', settingsRoutes);

// Static frontend (plain HTML/CSS/JS, no build step) + SPA fallback so a deep link like
// /welder/CS006 still serves index.html and lets the client-side router take over.
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

// First-boot convenience: a brand-new deployment has an empty accounts table and no way
// to sign in to create one (accounts creation itself requires a superadmin session). Seed
// a single default superadmin so staff can log in immediately after the first deploy and
// then change the password / add real accounts from the Accounts tab. Only fires when the
// table is completely empty, so it never resets or overwrites accounts on a later restart.
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'csw2026';
async function seedDefaultAdminIfEmpty() {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM accounts');
  if (rows[0].n > 0) return;
  const hash = await hashPassword(DEFAULT_ADMIN_PASSWORD);
  await pool.query(
    'INSERT INTO accounts (username, password_hash, role) VALUES ($1,$2,$3)',
    [DEFAULT_ADMIN_USERNAME, hash, 'superadmin']
  );
  console.log(
    `Seeded default superadmin account "${DEFAULT_ADMIN_USERNAME}" (accounts table was empty). ` +
      'Change this password from the Accounts tab as soon as you sign in.'
  );
}

// First-boot convenience #2: if the welders table is still empty and a bundled seed file
// is present at seed_data/welders_extracted.json (the real 260-welder export), import it
// automatically. This exists so a non-technical deploy (upload to GitHub -> connect on
// Render, no local Node/command line needed) ends up with real data with zero manual
// steps. Safe to leave the file in the repo across restarts: this only ever fires once,
// when welders is empty -- it never re-runs or overwrites data after that.
async function autoImportSeedIfEmpty() {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM welders');
  if (rows[0].n > 0) return;
  const seedPath = path.join(__dirname, '..', 'seed_data', 'welders_extracted.json');
  if (!fs.existsSync(seedPath)) return;
  console.log('welders table is empty and a seed file is present -- importing...');
  // Reuses the same logic as src/import_seed.js, inlined so it can run at boot without a
  // separate manual `node src/import_seed.js` invocation.
  const raw = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
  const welders = raw.welders || [];
  let ok = 0;
  let failed = 0;
  for (const w of welders) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO welders (id_welder, name, id_employee, company, photo, last_modified)
         VALUES ($1,$2,$3,$4,$5, COALESCE($6, now()))
         ON CONFLICT (id_welder) DO UPDATE SET
           name = EXCLUDED.name, id_employee = EXCLUDED.id_employee,
           company = EXCLUDED.company, photo = EXCLUDED.photo,
           last_modified = EXCLUDED.last_modified`,
        [w.idWelder, w.name, w.idEmployee || null, w.company || null, w.photo || null, w.lastModified || null]
      );
      await client.query('DELETE FROM certificates WHERE welder_id = $1', [w.idWelder]);
      let i = 0;
      for (const c of w.certificates || []) {
        await client.query(
          `INSERT INTO certificates
            (welder_id, process, type, base_material, filler_material, thickness, position,
             test_date, valid_date, standard, joint, remark, original_cert_image, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            w.idWelder, c.process || null, c.type || null, c.baseMaterial || null,
            c.fillerMaterial || null, c.thickness || null, c.position || null,
            c.testDate || null, c.validDate || null, c.standard || null, c.joint || null,
            c.remark || null, c.originalCertImage || null, i++,
          ]
        );
      }
      await client.query('COMMIT');
      ok++;
    } catch (e) {
      await client.query('ROLLBACK');
      failed++;
      console.error(`  seed import failed for ${w.idWelder}:`, e.message);
    } finally {
      client.release();
    }
  }
  const raw2 = raw.settings || {};
  await pool.query(
    `UPDATE settings SET warn_days = $1, emails = $2, data_as_of = $3, updated_at = now() WHERE id = 1`,
    [parseInt(raw2.warnDays, 10) || 45, raw2.emails || '', raw2.dataAsOf || null]
  );
  console.log(`Seed import done: ${ok}/${welders.length} welders imported${failed ? `, ${failed} failed` : ''}.`);
}

async function main() {
  if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'dev-only-insecure-secret-change-me') {
    // Fail loudly rather than silently issue session tokens signable by anyone who reads
    // this file on GitHub -- Render's env var UI is exactly where JWT_SECRET belongs.
    console.error('FATAL: set a real JWT_SECRET env var before running in production.');
    process.exit(1);
  }
  await initSchema();
  await seedDefaultAdminIfEmpty();
  await autoImportSeedIfEmpty();
  app.listen(PORT, () => console.log(`CSWIND app listening on :${PORT}`));
}

main().catch((e) => {
  console.error('Failed to start:', e);
  process.exit(1);
});
