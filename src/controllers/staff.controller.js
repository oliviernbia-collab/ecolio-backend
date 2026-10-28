const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { handleError } = require('../utils/errors');
const { generateTempPassword } = require('../utils/password');
const { loadPermissions } = require('../services/permissions');

exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT st.*, u.first_name, u.last_name, u.email, u.phone, u.role, u.avatar_url, u.last_login
       FROM staff st JOIN users u ON st.user_id=u.id
       WHERE st.school_id=? AND st.is_active=1
       ORDER BY u.last_name`,
      [req.user.school_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getOne = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT st.*, u.first_name, u.last_name, u.email, u.phone, u.role
       FROM staff st JOIN users u ON st.user_id=u.id
       WHERE st.id=? AND st.school_id=?`,
      [req.params.id, req.user.school_id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Personnel non trouvé' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    handleError(res, err);
  }
};

const VALID_STAFF_ROLES = ['director','teacher','accountant','counselor','librarian','nurse','maintenance','secretary'];

// staff.write peut être accordé individuellement par le directeur : seul un directeur peut
// pour autant nommer un directeur, sinon ce serait un moyen de s'octroyer tous les droits.
function roleError(req, role) {
  if (!VALID_STAFF_ROLES.includes(role)) return 'Rôle invalide';
  if (role === 'director' && req.user.role !== 'director') return 'Seul un directeur peut nommer un directeur';
  return null;
}

exports.create = async (req, res) => {
  try {
    const { first_name, last_name, email, contract_type, salary, password } = req.body;
    const phone = req.body.phone ?? null;
    const position = req.body.position ?? null;
    const hire_date = req.body.hire_date || null;
    const role = req.body.role || 'teacher';
    const invalidRole = roleError(req, role);
    if (invalidRole) return res.status(invalidRole === 'Rôle invalide' ? 400 : 403).json({ success: false, message: invalidRole });
    const generatedPassword = password?.trim() ? null : generateTempPassword();
    const hash = await bcrypt.hash(password?.trim() || generatedPassword, 10);
    const [userRes] = await db.execute(
      'INSERT INTO users (school_id, first_name, last_name, email, password, role, phone, must_change_password) VALUES (?,?,?,?,?,?,?,1)',
      [req.user.school_id, first_name, last_name, email, hash, role, phone]
    );
    const [staffRes] = await db.execute(
      'INSERT INTO staff (school_id, user_id, position, contract_type, hire_date, salary) VALUES (?,?,?,?,?,?)',
      [req.user.school_id, userRes.insertId, position, contract_type || 'CDI', hire_date, salary || null]
    );
    res.status(201).json({
      success: true, id: staffRes.insertId, user_id: userRes.insertId,
      credentials: generatedPassword ? { email, password: generatedPassword } : null,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'Email déjà utilisé' });
    handleError(res, err);
  }
};

exports.update = async (req, res) => {
  try {
    const { first_name, last_name, phone, role, position, contract_type, hire_date, salary, is_active } = req.body;
    const [rows] = await db.execute(
      'SELECT st.user_id, u.role FROM staff st JOIN users u ON st.user_id=u.id WHERE st.id=? AND st.school_id=?',
      [req.params.id, req.user.school_id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Personnel non trouvé' });
    if (rows[0].role === 'director' && req.user.role !== 'director') {
      return res.status(403).json({ success: false, message: 'Seul un directeur peut modifier un directeur' });
    }
    const safeRole = VALID_STAFF_ROLES.includes(role) ? role : undefined;
    if (safeRole === 'director' && req.user.role !== 'director') {
      return res.status(403).json({ success: false, message: 'Seul un directeur peut nommer un directeur' });
    }
    // Les permissions individuelles étaient des écarts par rapport à l'ancien rôle : elles n'ont plus de sens.
    if (safeRole && safeRole !== rows[0].role) {
      await db.execute('DELETE FROM user_permissions WHERE user_id=?', [rows[0].user_id]);
      await loadPermissions();
    }
    const userUpdate = safeRole
      ? 'UPDATE users SET first_name=?,last_name=?,phone=?,role=? WHERE id=?'
      : 'UPDATE users SET first_name=?,last_name=?,phone=? WHERE id=?';
    const userParams = safeRole
      ? [first_name, last_name, phone, safeRole, rows[0].user_id]
      : [first_name, last_name, phone, rows[0].user_id];
    await db.execute(userUpdate, userParams);
    await db.execute('UPDATE staff SET position=?,contract_type=?,hire_date=?,salary=?,is_active=? WHERE id=?',
      [position, contract_type, hire_date, salary, is_active !== undefined ? is_active : 1, req.params.id]);
    res.json({ success: true, message: 'Personnel mis à jour' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.remove = async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT st.user_id, u.role FROM staff st JOIN users u ON st.user_id=u.id WHERE st.id=? AND st.school_id=?',
      [req.params.id, req.user.school_id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Personnel non trouvé' });
    if (rows[0].role === 'director' && req.user.role !== 'director') {
      return res.status(403).json({ success: false, message: 'Seul un directeur peut archiver un directeur' });
    }
    await db.execute('UPDATE staff SET is_active=0 WHERE id=?', [req.params.id]);
    await db.execute('UPDATE users SET is_active=0 WHERE id=?', [rows[0].user_id]);
    res.json({ success: true, message: 'Membre archivé avec succès' });
  } catch (err) {
    handleError(res, err);
  }
};

// Permissions individuelles : le directeur ajuste, pour chaque membre de son personnel, les
// permissions par défaut de son rôle. Un autre directeur (et soi-même) n'est pas modifiable.
async function findEditableStaffUser(req) {
  const [rows] = await db.execute(
    `SELECT u.id, u.first_name, u.last_name, u.role
     FROM staff st JOIN users u ON st.user_id=u.id
     WHERE st.id=? AND st.school_id=? AND st.is_active=1`,
    [req.params.id, req.user.school_id]
  );
  return rows[0];
}

exports.getPermissions = async (req, res) => {
  try {
    const member = await findEditableStaffUser(req);
    if (!member) return res.status(404).json({ success: false, message: 'Personnel non trouvé' });
    // Trois lectures assemblées en JS plutôt qu'une jointure sur les codes : en production,
    // user_permissions (créée par migration) n'a pas la collation des tables importées, et
    // MariaDB refuse la comparaison (« Illegal mix of collations »).
    const [[catalog], [roleRows], [overrideRows]] = await Promise.all([
      db.execute('SELECT code, label, module FROM permissions ORDER BY module, code'),
      db.execute('SELECT permission_code FROM role_permissions WHERE role_code=?', [member.role]),
      db.execute('SELECT permission_code, granted FROM user_permissions WHERE user_id=?', [member.id]),
    ]);
    const roleSet = new Set(roleRows.map(r => r.permission_code));
    const overrides = new Map(overrideRows.map(r => [r.permission_code, !!r.granted]));
    const permissions = catalog.map(p => ({
      code: p.code, label: p.label, module: p.module,
      role_default: roleSet.has(p.code),
      granted: overrides.has(p.code) ? overrides.get(p.code) : roleSet.has(p.code),
    }));
    res.json({ success: true, data: { user: member, editable: member.role !== 'director', permissions } });
  } catch (err) {
    handleError(res, err);
  }
};

// PUT /staff/:id/permissions — { permissions: [codes] } : l'ensemble voulu. Seuls les écarts
// avec le rôle sont enregistrés, pour que le membre suive ensuite les évolutions de son rôle.
exports.updatePermissions = async (req, res) => {
  const wanted = req.body.permissions;
  if (!Array.isArray(wanted) || wanted.some(c => typeof c !== 'string')) {
    return res.status(400).json({ success: false, message: 'Liste de permissions invalide' });
  }
  let conn;
  try {
    const member = await findEditableStaffUser(req);
    if (!member) return res.status(404).json({ success: false, message: 'Personnel non trouvé' });
    if (member.role === 'director') {
      return res.status(403).json({ success: false, message: "Les permissions d'un directeur ne sont pas modifiables" });
    }
    const [catalog] = await db.execute('SELECT code FROM permissions');
    const known = new Set(catalog.map(p => p.code));
    const unknown = wanted.filter(c => !known.has(c));
    if (unknown.length) {
      return res.status(400).json({ success: false, message: `Permission inconnue : ${unknown.join(', ')}` });
    }
    const [roleRows] = await db.execute('SELECT permission_code FROM role_permissions WHERE role_code=?', [member.role]);
    const roleSet = new Set(roleRows.map(r => r.permission_code));
    const wantedSet = new Set(wanted);
    const overrides = [...known].filter(c => roleSet.has(c) !== wantedSet.has(c)).map(c => [member.id, c, wantedSet.has(c) ? 1 : 0, req.user.id]);

    conn = await db.getConnection();
    await conn.beginTransaction();
    await conn.execute('DELETE FROM user_permissions WHERE user_id=?', [member.id]);
    if (overrides.length) {
      await conn.query('INSERT INTO user_permissions (user_id, permission_code, granted, updated_by) VALUES ?', [overrides]);
    }
    await conn.commit();
    await loadPermissions();
    res.json({
      success: true, id: Number(req.params.id),
      name: `${member.first_name} ${member.last_name}`, overrides: overrides.length,
      message: 'Permissions mises à jour',
    });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    handleError(res, err);
  } finally {
    if (conn) conn.release();
  }
};
