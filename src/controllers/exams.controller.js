const db = require('../config/database');
const { handleError } = require('../utils/errors');

exports.getAll = async (req, res) => {
  try {
    const { class_id, subject_id, period, status } = req.query;
    let query = `
      SELECT e.*, c.name as class_name, sub.name as subject_name, r.name as room_name,
             CONCAT(u.first_name,' ',u.last_name) as created_by_name
      FROM exams e
      JOIN classes c ON e.class_id=c.id
      JOIN subjects sub ON e.subject_id=sub.id
      LEFT JOIN rooms r ON e.room_id=r.id
      LEFT JOIN users u ON e.created_by=u.id
      WHERE e.school_id=?`;
    const params = [req.user.school_id];
    if (class_id)   { query += ' AND e.class_id=?';   params.push(class_id); }
    if (subject_id) { query += ' AND e.subject_id=?'; params.push(subject_id); }
    if (period)     { query += ' AND e.period=?';     params.push(period); }
    if (status)     { query += ' AND e.status=?';     params.push(status); }
    query += ' ORDER BY e.exam_date DESC, e.start_time';
    const [rows] = await db.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getOne = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT e.*, c.name as class_name, sub.name as subject_name, r.name as room_name
       FROM exams e
       JOIN classes c ON e.class_id=c.id
       JOIN subjects sub ON e.subject_id=sub.id
       LEFT JOIN rooms r ON e.room_id=r.id
       WHERE e.id=? AND e.school_id=?`,
      [req.params.id, req.user.school_id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Examen non trouvé' });

    const [supervisors] = await db.execute(
      `SELECT u.id, CONCAT(u.first_name,' ',u.last_name) as name
       FROM exam_supervisors es JOIN users u ON es.teacher_id=u.id
       WHERE es.exam_id=?`,
      [req.params.id]
    );
    const [grades] = await db.execute(
      `SELECT g.*, CONCAT(s.first_name,' ',s.last_name) as student_name, s.matricule
       FROM grades g JOIN students s ON g.student_id=s.id
       WHERE g.exam_id=? ORDER BY s.last_name`,
      [req.params.id]
    );
    res.json({ success: true, data: { ...rows[0], supervisors, grades } });
  } catch (err) {
    handleError(res, err);
  }
};

async function checkConflict(schoolId, roomId, examDate, startTime, endTime, excludeId) {
  if (!roomId) return false;
  let query = `SELECT id FROM exams WHERE school_id=? AND room_id=? AND exam_date=? AND status!='annule'
     AND ((start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?) OR (start_time >= ? AND end_time <= ?))`;
  const params = [schoolId, roomId, examDate, endTime, startTime, endTime, startTime, startTime, endTime];
  if (excludeId) { query += ' AND id != ?'; params.push(excludeId); }
  const [rows] = await db.execute(query, params);
  return rows.length > 0;
}

exports.create = async (req, res) => {
  try {
    const { class_id, subject_id, title, exam_date, start_time, end_time, room_id, period, max_value, academic_year_id } = req.body;
    if (!class_id || !subject_id || !title || !exam_date || !start_time || !end_time) {
      return res.status(400).json({ success: false, message: 'Classe, matière, titre, date et horaires sont requis' });
    }
    if (await checkConflict(req.user.school_id, room_id, exam_date, start_time, end_time)) {
      return res.status(400).json({ success: false, message: 'Cette salle est déjà réservée sur ce créneau' });
    }
    const [result] = await db.execute(
      `INSERT INTO exams (school_id, academic_year_id, class_id, subject_id, title, exam_date, start_time, end_time, room_id, period, max_value, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.school_id, academic_year_id || null, class_id, subject_id, title, exam_date, start_time, end_time, room_id || null, period || 'trimestre1', max_value || 20, req.user.id]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    handleError(res, err);
  }
};

exports.update = async (req, res) => {
  try {
    const { class_id, subject_id, title, exam_date, start_time, end_time, room_id, period, max_value, status } = req.body;
    if (await checkConflict(req.user.school_id, room_id, exam_date, start_time, end_time, req.params.id)) {
      return res.status(400).json({ success: false, message: 'Cette salle est déjà réservée sur ce créneau' });
    }
    await db.execute(
      `UPDATE exams SET class_id=?,subject_id=?,title=?,exam_date=?,start_time=?,end_time=?,room_id=?,period=?,max_value=?,status=?
       WHERE id=? AND school_id=?`,
      [class_id, subject_id, title, exam_date, start_time, end_time, room_id || null, period, max_value || 20, status || 'planifie', req.params.id, req.user.school_id]
    );
    res.json({ success: true, message: 'Examen mis à jour' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.remove = async (req, res) => {
  try {
    await db.execute('DELETE FROM exams WHERE id=? AND school_id=?', [req.params.id, req.user.school_id]);
    res.json({ success: true, message: 'Examen supprimé' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.addSupervisor = async (req, res) => {
  try {
    const { teacher_id } = req.body;
    await db.execute('INSERT IGNORE INTO exam_supervisors (exam_id, teacher_id) VALUES (?,?)', [req.params.id, teacher_id]);
    res.status(201).json({ success: true, message: 'Surveillant ajouté' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.removeSupervisor = async (req, res) => {
  try {
    await db.execute('DELETE FROM exam_supervisors WHERE exam_id=? AND teacher_id=?', [req.params.id, req.params.teacherId]);
    res.json({ success: true, message: 'Surveillant retiré' });
  } catch (err) {
    handleError(res, err);
  }
};

// POST /exams/:id/grades — saisie groupée des notes d'examen
exports.recordGrades = async (req, res) => {
  try {
    const [examRows] = await db.execute('SELECT * FROM exams WHERE id=? AND school_id=?', [req.params.id, req.user.school_id]);
    if (!examRows.length) return res.status(404).json({ success: false, message: 'Examen non trouvé' });
    const exam = examRows[0];

    const { grades } = req.body;
    if (!Array.isArray(grades) || !grades.length) {
      return res.status(400).json({ success: false, message: 'Aucune note fournie' });
    }
    for (const g of grades) {
      if (g.value === undefined || g.value === '' || g.value === null) continue;
      await db.execute(
        `INSERT INTO grades (student_id, subject_id, exam_id, value, max_value, period, grade_type, created_by)
         VALUES (?,?,?,?,?,?, 'composition', ?)`,
        [g.student_id, exam.subject_id, exam.id, g.value, exam.max_value, exam.period, req.user.id]
      );
    }
    await db.execute("UPDATE exams SET status='termine' WHERE id=?", [exam.id]);
    res.json({ success: true, message: 'Notes enregistrées' });
  } catch (err) {
    handleError(res, err);
  }
};
