const express = require('express');
const { pool } = require('../db');
const { requireRole } = require('../auth');

const router = express.Router();

function certRowToJson(c) {
  return {
    process: c.process || '',
    type: c.type || '',
    baseMaterial: c.base_material || '',
    fillerMaterial: c.filler_material || '',
    thickness: c.thickness || '',
    position: c.position || '',
    testDate: c.test_date ? c.test_date.toISOString().slice(0, 10) : '',
    validDate: c.valid_date ? c.valid_date.toISOString().slice(0, 10) : '',
    standard: c.standard || '',
    joint: c.joint || '',
    remark: c.remark || '',
    originalCertImage: c.original_cert_image || undefined,
  };
}

async function fetchAllWelders() {
  const { rows: welders } = await pool.query(
    'SELECT id_welder, name, id_employee, company, photo, last_modified FROM welders ORDER BY id_welder'
  );
  const { rows: certs } = await pool.query(
    'SELECT * FROM certificates ORDER BY welder_id, sort_order, id'
  );
  const certsByWelder = new Map();
  for (const c of certs) {
    if (!certsByWelder.has(c.welder_id)) certsByWelder.set(c.welder_id, []);
    certsByWelder.get(c.welder_id).push(certRowToJson(c));
  }
  return welders.map((w) => ({
    idWelder: w.id_welder,
    name: w.name,
    idEmployee: w.id_employee || '',
    company: w.company || '',
    photo: w.photo || undefined,
    lastModified: w.last_modified,
    certificates: certsByWelder.get(w.id_welder) || [],
  }));
}

// Public: anyone who can load the page (customers scanning a QR code included) can read
// the full lookup list. This matches the old app's public-mirror behavior -- certificate
// records are meant to be checkable by anyone with the welder's code, not secret.
router.get('/', async (req, res) => {
  try {
    const data = await fetchAllWelders();
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

async function writeCertificates(client, idWelder, certs) {
  await client.query('DELETE FROM certificates WHERE welder_id = $1', [idWelder]);
  let i = 0;
  for (const c of certs || []) {
    await client.query(
      `INSERT INTO certificates
        (welder_id, process, type, base_material, filler_material, thickness, position,
         test_date, valid_date, standard, joint, remark, original_cert_image, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        idWelder,
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
  }
}

async function logAudit(client, accountName, action, welderId, detail) {
  await client.query(
    'INSERT INTO audit_log (account_name, action, welder_id, detail) VALUES ($1,$2,$3,$4)',
    [accountName, action, welderId, detail || null]
  );
}

// Create -- editor or superadmin.
router.post('/', requireRole('editor'), async (req, res) => {
  const { idWelder, name, idEmployee, company, photo, certificates } = req.body || {};
  if (!idWelder || !name) return res.status(400).json({ error: 'missing_fields' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query('SELECT 1 FROM welders WHERE id_welder = $1', [idWelder]);
    if (exists.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'already_exists' });
    }
    await client.query(
      'INSERT INTO welders (id_welder, name, id_employee, company, photo) VALUES ($1,$2,$3,$4,$5)',
      [idWelder, name, idEmployee || null, company || null, photo || null]
    );
    await writeCertificates(client, idWelder, certificates);
    await logAudit(client, req.user.username, 'create', idWelder, name);
    await client.query('COMMIT');
    res.status(201).json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  } finally {
    client.release();
  }
});

// Update -- editor or superadmin.
router.put('/:idWelder', requireRole('editor'), async (req, res) => {
  const idWelder = req.params.idWelder;
  const { name, idEmployee, company, photo, certificates } = req.body || {};
  if (!name) return res.status(400).json({ error: 'missing_fields' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE welders SET name=$2, id_employee=$3, company=$4, photo=$5, last_modified=now()
       WHERE id_welder=$1`,
      [idWelder, name, idEmployee || null, company || null, photo || null]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'not_found' });
    }
    await writeCertificates(client, idWelder, certificates);
    await logAudit(client, req.user.username, 'update', idWelder, name);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  } finally {
    client.release();
  }
});

// Delete -- editor or superadmin (matches what the user asked for: editors may delete).
router.delete('/:idWelder', requireRole('editor'), async (req, res) => {
  const idWelder = req.params.idWelder;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('DELETE FROM welders WHERE id_welder = $1', [idWelder]);
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'not_found' });
    }
    await logAudit(client, req.user.username, 'delete', idWelder, null);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  } finally {
    client.release();
  }
});

module.exports = router;
