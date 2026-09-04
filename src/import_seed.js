// One-time data migration: loads the real 260 welders + 315 certificates (extracted from
// the live ADMIN Claude Artifact's embedded WELDERS/SETTINGS JSON) into the new Postgres
// schema. Safe to re-run: it upserts welders/settings and fully replaces each welder's
// certificate rows, so running it twice does not duplicate data.
//
// Usage:
//   node src/import_seed.js /path/to/welders_extracted.json
//
// The input file is the output of the extraction step (see MIGRATION.md) -- a JSON object
// shaped { welders: [...], settings: {...}, accounts: [...] }. `accounts` is read only for
// a printed summary; it is NOT imported, because the two existing real accounts
// ("CSW-admin", "admin") only have salted-SHA-256 hashes from the old client-side PIN
// system, not bcrypt, and the plaintext PINs are not known to this script -- they cannot
// become working logins in the new app. Use the seeded admin/csw2026 account (created
// automatically on first server boot) to log in, then create real accounts for staff
// through the new Accounts UI.
const fs = require('fs');
const { pool, initSchema } = require('./db');

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node src/import_seed.js /path/to/welders_extracted.json');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  const welders = raw.welders || [];
  const settings = raw.settings || {};
  const accounts = raw.accounts || [];

  await initSchema();

  console.log(`Importing ${welders.length} welders...`);
  let certCount = 0;
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
        [
          w.idWelder,
          w.name,
          w.idEmployee || null,
          w.company || null,
          w.photo || null,
          w.lastModified || null,
        ]
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
            w.idWelder,
            c.process || null,
            c.type || null,
            c.baseMaterial || null,
            c.fillerMaterial || null,
            c.thickness || null,
            c.position || null,
            c.testDate || null,
            c.validDate || null,
            c.standard || null,
            c.joint || null,
            c.remark || null,
            c.originalCertImage || null,
            i++,
          ]
        );
        certCount++;
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      failed++;
      console.error(`  FAILED ${w.idWelder} (${w.name}):`, e.message);
    } finally {
      client.release();
    }
  }

  // Settings: carry over warnDays/emails/dataAsOf, but never the old baseUrl -- it pointed
  // at the Claude Artifact URL, which is meaningless for the new standalone app. Leave it
  // blank so the superadmin sets the real deployed URL once via the Settings tab.
  await pool.query(
    `UPDATE settings SET warn_days = $1, emails = $2, data_as_of = $3, updated_at = now() WHERE id = 1`,
    [
      parseInt(settings.warnDays, 10) || 45,
      settings.emails || '',
      settings.dataAsOf || null,
    ]
  );

  console.log(`\nDone. Welders imported: ${welders.length - failed}/${welders.length}, certificates: ${certCount}.`);
  if (failed) console.log(`${failed} welder(s) FAILED -- see errors above.`);
  console.log(`\nOld accounts found in source data (NOT imported -- incompatible hash format):`);
  for (const a of accounts) console.log(`  - ${a.name} (${a.role})`);
  console.log(`\nLog in with the seeded account (admin / csw2026), then recreate real staff accounts via Settings > Accounts.`);
  console.log(`Remember to set Settings > Base URL to the app's real deployed URL once it's live on Render.`);

  await pool.end();
}

main().catch((e) => {
  console.error('Import failed:', e);
  process.exit(1);
});
