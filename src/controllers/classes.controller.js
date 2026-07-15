const db = require('../config/database');
const { handleError } = require('../utils/errors');

exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT c.*, CONCAT(u.first_name, ' ', u.last_name) as teacher_name,
              COUNT(s.id) as student_count
       FROM classes c
       LEFT JOIN users u ON c.teacher_id = u.id
       LEFT JOIN students s ON s.class_id = c.id AND s.status != 'archive'
       WHERE c.school_id = ?
       GROUP BY c.id
       ORDER BY c.cycle, c.level, c.name`,
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
      `SELECT c.*, CONCAT(u.first_name, ' ', u.last_name) as teacher_name
       FROM classes c LEFT JOIN users u ON c.teacher_id = u.id
       WHERE c.id=? AND c.school_id=?`,
      [req.params.id, req.user.school_id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Classe non trouvée' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getStudents = async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM students WHERE class_id=? AND school_id=? AND status!='archive' ORDER BY last_name",
      [req.params.id, req.user.school_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    handleError(res, err);
  }
};

exports.create = async (req, res) => {
  try {
    const { name, level, cycle, teacher_id, capacity } = req.body;
    const [result] = await db.execute(
      'INSERT INTO classes (school_id, name, level, cycle, teacher_id, capacity) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.school_id, name, level, cycle, teacher_id || null, capacity || 30]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    handleError(res, err);
  }
};

exports.update = async (req, res) => {
  try {
    const { name, level, cycle, teacher_id, capacity } = req.body;
    await db.execute(
      'UPDATE classes SET name=?, level=?, cycle=?, teacher_id=?, capacity=? WHERE id=? AND school_id=?',
      [name, level, cycle, teacher_id || null, capacity, req.params.id, req.user.school_id]
    );
    res.json({ success: true, message: 'Classe mise à jour' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.delete = async (req, res) => {
  try {
    await db.execute('DELETE FROM classes WHERE id=? AND school_id=?', [req.params.id, req.user.school_id]);
    res.json({ success: true, message: 'Classe supprimée' });
  } catch (err) {
    handleError(res, err);
  }
};
