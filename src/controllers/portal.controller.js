const db = require('../config/database');
const { handleError } = require('../utils/errors');

// ── Portail Parent ──────────────────────────────────────────────────────────

exports.getChildren = async (req, res) => {
  try {
    const [children] = await db.execute(
      `SELECT s.id, s.matricule, s.first_name, s.last_name, s.gender, s.photo_url,
              s.birth_date, s.status, c.id as class_id, c.name as class_name, c.cycle
       FROM students s
       LEFT JOIN classes c ON s.class_id = c.id
       WHERE s.parent_id = ? AND s.school_id = ?
       ORDER BY s.last_name, s.first_name`,
      [req.user.id, req.user.school_id]
    );
    res.json({ success: true, data: children });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getChildGrades = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { period } = req.query;

    // Vérifier que cet élève appartient bien au parent
    const [check] = await db.execute(
      'SELECT id FROM students WHERE id = ? AND parent_id = ? AND school_id = ?',
      [studentId, req.user.id, req.user.school_id]
    );
    if (!check.length) return res.status(403).json({ success: false, message: 'Accès non autorisé' });

    let query = `
      SELECT g.*, sub.name as subject_name, sub.coefficient
      FROM grades g JOIN subjects sub ON g.subject_id = sub.id
      WHERE g.student_id = ?`;
    const params = [studentId];
    if (period) { query += ' AND g.period = ?'; params.push(period); }
    query += ' ORDER BY sub.name, g.period';

    const [rows] = await db.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getChildAttendance = async (req, res) => {
  try {
    const { studentId } = req.params;

    const [check] = await db.execute(
      'SELECT id FROM students WHERE id = ? AND parent_id = ? AND school_id = ?',
      [studentId, req.user.id, req.user.school_id]
    );
    if (!check.length) return res.status(403).json({ success: false, message: 'Accès non autorisé' });

    const [rows] = await db.execute(
      `SELECT a.*, c.name as class_name
       FROM attendance a LEFT JOIN classes c ON a.class_id = c.id
       WHERE a.student_id = ?
       ORDER BY a.date DESC
       LIMIT 60`,
      [studentId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getChildSchedule = async (req, res) => {
  try {
    const { studentId } = req.params;

    const [student] = await db.execute(
      'SELECT class_id FROM students WHERE id = ? AND parent_id = ? AND school_id = ?',
      [studentId, req.user.id, req.user.school_id]
    );
    if (!student.length) return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    if (!student[0].class_id) return res.json({ success: true, data: [] });

    const [rows] = await db.execute(
      `SELECT sch.*, sub.name as subject_name, CONCAT(u.first_name,' ',u.last_name) as teacher_name
       FROM schedule sch
       LEFT JOIN subjects sub ON sch.subject_id = sub.id
       LEFT JOIN users u ON sch.teacher_id = u.id
       WHERE sch.class_id = ?
       ORDER BY sch.day_of_week, sch.start_time`,
      [student[0].class_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getChildInvoices = async (req, res) => {
  try {
    const { studentId } = req.params;

    const [check] = await db.execute(
      'SELECT id FROM students WHERE id = ? AND parent_id = ? AND school_id = ?',
      [studentId, req.user.id, req.user.school_id]
    );
    if (!check.length) return res.status(403).json({ success: false, message: 'Accès non autorisé' });

    const [rows] = await db.execute(
      `SELECT * FROM invoices WHERE student_id = ? ORDER BY created_at DESC`,
      [studentId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    handleError(res, err);
  }
};

// ── Portail Élève ───────────────────────────────────────────────────────────

async function getStudentId(userId) {
  const [rows] = await db.execute('SELECT student_id FROM users WHERE id = ?', [userId]);
  return rows[0]?.student_id ?? null;
}

exports.getStudentMe = async (req, res) => {
  try {
    const studentId = await getStudentId(req.user.id);
    if (!studentId) {
      return res.status(404).json({ success: false, message: 'Aucun dossier élève associé à ce compte' });
    }
    const [rows] = await db.execute(
      `SELECT s.*, c.name as class_name, c.cycle, c.level,
              CONCAT(u.first_name,' ',u.last_name) as teacher_name
       FROM students s
       LEFT JOIN classes c ON s.class_id = c.id
       LEFT JOIN users u ON c.teacher_id = u.id
       WHERE s.id = ? AND s.school_id = ?`,
      [studentId, req.user.school_id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Élève non trouvé' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getStudentGrades = async (req, res) => {
  try {
    const studentId = await getStudentId(req.user.id);
    if (!studentId) return res.status(404).json({ success: false, message: 'Aucun dossier élève' });
    const { period } = req.query;
    let query = `
      SELECT g.*, sub.name as subject_name, sub.coefficient
      FROM grades g JOIN subjects sub ON g.subject_id = sub.id
      WHERE g.student_id = ?`;
    const params = [studentId];
    if (period) { query += ' AND g.period = ?'; params.push(period); }
    query += ' ORDER BY sub.name, g.period';
    const [rows] = await db.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getStudentAttendance = async (req, res) => {
  try {
    const studentId = await getStudentId(req.user.id);
    if (!studentId) return res.status(404).json({ success: false, message: 'Aucun dossier élève' });
    const [rows] = await db.execute(
      `SELECT a.*, c.name as class_name
       FROM attendance a LEFT JOIN classes c ON a.class_id = c.id
       WHERE a.student_id = ?
       ORDER BY a.date DESC
       LIMIT 60`,
      [studentId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getStudentSchedule = async (req, res) => {
  try {
    const studentId = await getStudentId(req.user.id);
    if (!studentId) return res.status(404).json({ success: false, message: 'Aucun dossier élève' });
    const [student] = await db.execute('SELECT class_id FROM students WHERE id = ?', [studentId]);
    if (!student.length || !student[0].class_id) return res.json({ success: true, data: [] });

    const [rows] = await db.execute(
      `SELECT sch.*, sub.name as subject_name, CONCAT(u.first_name,' ',u.last_name) as teacher_name
       FROM schedule sch
       LEFT JOIN subjects sub ON sch.subject_id = sub.id
       LEFT JOIN users u ON sch.teacher_id = u.id
       WHERE sch.class_id = ?
       ORDER BY sch.day_of_week, sch.start_time`,
      [student[0].class_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    handleError(res, err);
  }
};
