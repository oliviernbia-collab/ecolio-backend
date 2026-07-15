const db = require('../config/database');
const { handleError } = require('../utils/errors');
const { createNotification } = require('../utils/notifications');

exports.getAll = async (req, res) => {
  try {
    const { student_id, from, to } = req.query;
    let query = `
      SELECT hv.*, CONCAT(s.first_name,' ',s.last_name) as student_name, s.matricule, c.name as class_name
      FROM health_visits hv
      JOIN students s ON hv.student_id=s.id
      LEFT JOIN classes c ON s.class_id=c.id
      WHERE hv.school_id=?`;
    const params = [req.user.school_id];
    if (student_id) { query += ' AND hv.student_id=?'; params.push(student_id); }
    if (from) { query += ' AND hv.visit_date>=?'; params.push(from); }
    if (to)   { query += ' AND hv.visit_date<=?'; params.push(to); }
    query += ' ORDER BY hv.visit_date DESC';
    const [rows] = await db.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
};

exports.create = async (req, res) => {
  try {
    const { student_id, reason, treatment, temperature, sent_home, notes } = req.body;
    if (!student_id || !reason) {
      return res.status(400).json({ success: false, message: 'Élève et motif sont requis' });
    }
    const [student] = await db.execute('SELECT id, parent_id, first_name, last_name FROM students WHERE id=? AND school_id=?', [student_id, req.user.school_id]);
    if (!student.length) return res.status(404).json({ success: false, message: 'Élève non trouvé' });

    const [result] = await db.execute(
      'INSERT INTO health_visits (school_id, student_id, reason, treatment, temperature, sent_home, notes, recorded_by) VALUES (?,?,?,?,?,?,?,?)',
      [req.user.school_id, student_id, reason, treatment || null, temperature || null, sent_home ? 1 : 0, notes || null, req.user.id]
    );

    if (student[0].parent_id) {
      await createNotification({
        user_id: student[0].parent_id,
        school_id: req.user.school_id,
        title: 'Passage à l\'infirmerie',
        content: `${student[0].first_name} ${student[0].last_name} est passé(e) à l'infirmerie : ${reason}${sent_home ? ' (renvoyé à la maison)' : ''}.`,
        type: 'info',
      });
    }

    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) { handleError(res, err); }
};

exports.update = async (req, res) => {
  try {
    const { reason, treatment, temperature, sent_home, notes } = req.body;
    const [owned] = await db.execute('SELECT id FROM health_visits WHERE id=? AND school_id=?', [req.params.id, req.user.school_id]);
    if (!owned.length) return res.status(404).json({ success: false, message: 'Visite non trouvée' });
    await db.execute(
      'UPDATE health_visits SET reason=?, treatment=?, temperature=?, sent_home=?, notes=? WHERE id=?',
      [reason, treatment || null, temperature || null, sent_home ? 1 : 0, notes || null, req.params.id]
    );
    res.json({ success: true, message: 'Visite mise à jour' });
  } catch (err) { handleError(res, err); }
};

exports.remove = async (req, res) => {
  try {
    await db.execute('DELETE FROM health_visits WHERE id=? AND school_id=?', [req.params.id, req.user.school_id]);
    res.json({ success: true, message: 'Visite supprimée' });
  } catch (err) { handleError(res, err); }
};
