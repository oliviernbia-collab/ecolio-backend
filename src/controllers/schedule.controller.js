const db = require('../config/database');
const { handleError } = require('../utils/errors');

const DAYS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];

exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT sc.*, c.name as class_name, sub.name as subject_name, sub.coefficient,
              CONCAT(u.first_name,' ',u.last_name) as teacher_name, r.name as room_name
       FROM schedule sc
       JOIN classes c ON sc.class_id=c.id
       JOIN subjects sub ON sc.subject_id=sub.id
       LEFT JOIN users u ON sc.teacher_id=u.id
       LEFT JOIN rooms r ON sc.room_id=r.id
       WHERE sc.school_id=?
       ORDER BY sc.class_id, sc.day_of_week, sc.start_time`,
      [req.user.school_id]
    );
    res.json({ success: true, data: rows.map(r => ({ ...r, day_name: DAYS[r.day_of_week] })) });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getByClass = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT sc.*, sub.name as subject_name, CONCAT(u.first_name,' ',u.last_name) as teacher_name, r.name as room_name
       FROM schedule sc
       JOIN subjects sub ON sc.subject_id=sub.id
       LEFT JOIN users u ON sc.teacher_id=u.id
       LEFT JOIN rooms r ON sc.room_id=r.id
       WHERE sc.class_id=? AND sc.school_id=?
       ORDER BY sc.day_of_week, sc.start_time`,
      [req.params.classId, req.user.school_id]
    );
    res.json({ success: true, data: rows.map(r => ({ ...r, day_name: DAYS[r.day_of_week] })) });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getByTeacher = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT sc.*, c.name as class_name, sub.name as subject_name, r.name as room_name
       FROM schedule sc
       JOIN classes c ON sc.class_id=c.id
       JOIN subjects sub ON sc.subject_id=sub.id
       LEFT JOIN rooms r ON sc.room_id=r.id
       WHERE sc.teacher_id=? AND sc.school_id=?
       ORDER BY sc.day_of_week, sc.start_time`,
      [req.params.teacherId, req.user.school_id]
    );
    res.json({ success: true, data: rows.map(r => ({ ...r, day_name: DAYS[r.day_of_week] })) });
  } catch (err) {
    handleError(res, err);
  }
};

async function assertFksInSchool({ class_id, subject_id, teacher_id, room_id }, schoolId) {
  const checks = [
    class_id   && ['classes', class_id],
    subject_id && ['subjects', subject_id],
    room_id    && ['rooms', room_id],
  ].filter(Boolean);
  for (const [table, id] of checks) {
    const [[row]] = await db.execute(`SELECT id FROM ${table} WHERE id=? AND school_id=?`, [id, schoolId]);
    if (!row) return false;
  }
  if (teacher_id) {
    const [[t]] = await db.execute('SELECT id FROM users WHERE id=? AND school_id=?', [teacher_id, schoolId]);
    if (!t) return false;
  }
  return true;
}

exports.create = async (req, res) => {
  try {
    const { class_id, subject_id, teacher_id, room_id, day_of_week, start_time, end_time } = req.body;
    if (!(await assertFksInSchool({ class_id, subject_id, teacher_id, room_id }, req.user.school_id))) {
      return res.status(400).json({ success: false, message: 'Classe, matière, enseignant ou salle introuvable' });
    }
    // Conflict check
    const [conflicts] = await db.execute(
      `SELECT id FROM schedule WHERE school_id=? AND day_of_week=? AND class_id=?
       AND ((start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?) OR (start_time >= ? AND end_time <= ?))`,
      [req.user.school_id, day_of_week, class_id, end_time, start_time, end_time, start_time, start_time, end_time]
    );
    if (conflicts.length) {
      return res.status(400).json({ success: false, message: 'Conflit détecté dans l\'emploi du temps' });
    }
    const [result] = await db.execute(
      'INSERT INTO schedule (school_id, class_id, subject_id, teacher_id, room_id, day_of_week, start_time, end_time) VALUES (?,?,?,?,?,?,?,?)',
      [req.user.school_id, class_id, subject_id, teacher_id || null, room_id || null, day_of_week, start_time, end_time]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    handleError(res, err);
  }
};

exports.update = async (req, res) => {
  try {
    const { class_id, subject_id, teacher_id, room_id, day_of_week, start_time, end_time } = req.body;
    if (!(await assertFksInSchool({ class_id, subject_id, teacher_id, room_id }, req.user.school_id))) {
      return res.status(400).json({ success: false, message: 'Classe, matière, enseignant ou salle introuvable' });
    }
    await db.execute(
      'UPDATE schedule SET class_id=?,subject_id=?,teacher_id=?,room_id=?,day_of_week=?,start_time=?,end_time=? WHERE id=? AND school_id=?',
      [class_id, subject_id, teacher_id || null, room_id || null, day_of_week, start_time, end_time, req.params.id, req.user.school_id]
    );
    res.json({ success: true, message: 'Créneau mis à jour' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.delete = async (req, res) => {
  try {
    await db.execute('DELETE FROM schedule WHERE id=? AND school_id=?', [req.params.id, req.user.school_id]);
    res.json({ success: true, message: 'Créneau supprimé' });
  } catch (err) {
    handleError(res, err);
  }
};
