const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { handleError } = require('../utils/errors');
const { generateTempPassword } = require('../utils/password');

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

exports.create = async (req, res) => {
  try {
    const { first_name, last_name, email, phone, role, position, contract_type, hire_date, salary, password } = req.body;
    const generatedPassword = password?.trim() ? null : generateTempPassword();
    const hash = await bcrypt.hash(password?.trim() || generatedPassword, 10);
    const [userRes] = await db.execute(
      'INSERT INTO users (school_id, first_name, last_name, email, password, role, phone, must_change_password) VALUES (?,?,?,?,?,?,?,1)',
      [req.user.school_id, first_name, last_name, email, hash, role || 'teacher', phone]
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

const VALID_STAFF_ROLES = ['director','teacher','accountant','counselor','librarian','nurse','maintenance','secretary'];

exports.update = async (req, res) => {
  try {
    const { first_name, last_name, phone, role, position, contract_type, hire_date, salary, is_active } = req.body;
    const [rows] = await db.execute('SELECT user_id FROM staff WHERE id=? AND school_id=?', [req.params.id, req.user.school_id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Personnel non trouvé' });
    const safeRole = VALID_STAFF_ROLES.includes(role) ? role : undefined;
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
      'SELECT user_id FROM staff WHERE id=? AND school_id=?',
      [req.params.id, req.user.school_id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Personnel non trouvé' });
    await db.execute('UPDATE staff SET is_active=0 WHERE id=?', [req.params.id]);
    await db.execute('UPDATE users SET is_active=0 WHERE id=?', [rows[0].user_id]);
    res.json({ success: true, message: 'Membre archivé avec succès' });
  } catch (err) {
    handleError(res, err);
  }
};
