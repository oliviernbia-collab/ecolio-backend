const db = require('../config/database');
const { handleError } = require('../utils/errors');

exports.getAll = async (req, res) => {
  try {
    const { class_id } = req.query;
    let query = `SELECT sub.*, c.name as class_name, CONCAT(u.first_name,' ',u.last_name) as teacher_name
                 FROM subjects sub LEFT JOIN classes c ON sub.class_id=c.id LEFT JOIN users u ON sub.teacher_id=u.id
                 WHERE sub.school_id=?`;
    const params = [req.user.school_id];
    if (class_id) { query += ' AND sub.class_id=?'; params.push(class_id); }
    query += ' ORDER BY c.name, sub.name';
    const [rows] = await db.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    handleError(res, err);
  }
};

exports.create = async (req, res) => {
  try {
    const { name, code, coefficient, class_id, teacher_id } = req.body;
    const [result] = await db.execute(
      'INSERT INTO subjects (school_id, name, code, coefficient, class_id, teacher_id) VALUES (?,?,?,?,?,?)',
      [req.user.school_id, name, code, coefficient || 1, class_id || null, teacher_id || null]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    handleError(res, err);
  }
};

exports.update = async (req, res) => {
  try {
    const { name, code, coefficient, class_id, teacher_id } = req.body;
    await db.execute(
      'UPDATE subjects SET name=?,code=?,coefficient=?,class_id=?,teacher_id=? WHERE id=? AND school_id=?',
      [name, code, coefficient, class_id || null, teacher_id || null, req.params.id, req.user.school_id]
    );
    res.json({ success: true, message: 'Matière mise à jour' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.delete = async (req, res) => {
  try {
    await db.execute('DELETE FROM subjects WHERE id=? AND school_id=?', [req.params.id, req.user.school_id]);
    res.json({ success: true, message: 'Matière supprimée' });
  } catch (err) {
    handleError(res, err);
  }
};
