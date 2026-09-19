const db = require('../config/database');
const { handleError } = require('../utils/errors');
const { logActivity } = require('../services/activityLog');

// GET /top-students?academic_year_id=&period=
exports.getAll = async (req, res) => {
  try {
    const { academic_year_id, period } = req.query;
    const params = [req.user.school_id];
    let where = '';
    if (academic_year_id) { where += ' AND ts.academic_year_id = ?'; params.push(academic_year_id); }
    if (period) { where += ' AND ts.period = ?'; params.push(period); }

    const [rows] = await db.execute(
      `SELECT ts.*, CONCAT(s.first_name, ' ', s.last_name) as student_name, s.matricule,
              c.name as class_name, ay.name as academic_year_name
       FROM top_students ts
       JOIN students s ON ts.student_id = s.id
       LEFT JOIN classes c ON ts.class_id = c.id
       JOIN academic_years ay ON ts.academic_year_id = ay.id
       WHERE ts.school_id = ? ${where}
       ORDER BY ts.cycle, ts.level`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
};

// POST /top-students — enregistre (ou remplace) le/la major d'un niveau pour un trimestre donné.
// level/cycle/academic_year_id sont dérivés côté serveur depuis la classe choisie, jamais du client.
exports.upsert = async (req, res) => {
  try {
    const { class_id, student_id, period, average, mention } = req.body;
    if (!class_id || !student_id || !period) {
      return res.status(400).json({ success: false, message: 'Classe, élève et trimestre sont requis' });
    }

    const [[cls]] = await db.execute(
      'SELECT id, level, cycle, academic_year_id, name FROM classes WHERE id = ? AND school_id = ?',
      [class_id, req.user.school_id]
    );
    if (!cls) return res.status(404).json({ success: false, message: 'Classe non trouvée' });
    if (!cls.level) return res.status(400).json({ success: false, message: "Cette classe n'a pas de niveau renseigné" });
    if (!cls.academic_year_id) return res.status(400).json({ success: false, message: "Cette classe n'est rattachée à aucune année scolaire" });

    const [[student]] = await db.execute(
      'SELECT id FROM students WHERE id = ? AND school_id = ? AND class_id = ?',
      [student_id, req.user.school_id, class_id]
    );
    if (!student) return res.status(400).json({ success: false, message: "Cet élève n'appartient pas à la classe sélectionnée" });

    await db.execute(
      `INSERT INTO top_students (school_id, academic_year_id, period, level, cycle, class_id, student_id, average, mention, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE class_id=VALUES(class_id), student_id=VALUES(student_id),
         average=VALUES(average), mention=VALUES(mention), created_by=VALUES(created_by)`,
      [req.user.school_id, cls.academic_year_id, period, cls.level, cls.cycle, class_id, student_id, average || null, mention || null, req.user.id]
    );

    logActivity({
      schoolId: req.user.school_id, userId: req.user.id, userName: `${req.user.first_name} ${req.user.last_name}`, userRole: req.user.role,
      action: 'create', entityType: 'top_student', entityId: student_id,
      description: `Major désigné(e) pour le niveau ${cls.level} (${period})`, ip: req.ip,
    });

    res.status(201).json({ success: true, message: 'Enregistré' });
  } catch (err) { handleError(res, err); }
};

// DELETE /top-students/:id
exports.remove = async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM top_students WHERE id = ? AND school_id = ?', [req.params.id, req.user.school_id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Introuvable' });
    logActivity({
      schoolId: req.user.school_id, userId: req.user.id, userName: `${req.user.first_name} ${req.user.last_name}`, userRole: req.user.role,
      action: 'delete', entityType: 'top_student', entityId: req.params.id,
      description: 'Retrait du tableau d\'honneur', ip: req.ip,
    });
    res.json({ success: true, message: 'Retiré du tableau d\'honneur' });
  } catch (err) { handleError(res, err); }
};
