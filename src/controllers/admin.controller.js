// Panneau plateforme réservé au rôle super_admin : vue transversale sur TOUTES les
// écoles (pas de filtre school_id, volontairement — c'est la seule vue de l'app qui
// traverse les tenants). Toutes les routes de ce contrôleur exigent authorize('super_admin').
const db = require('../config/database');
const { handleError } = require('../utils/errors');

exports.getSchools = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT s.id, s.name, s.city, s.email, s.phone, s.is_public, s.is_active, s.created_at,
             (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id AND st.status != 'archive') as student_count,
             (SELECT COUNT(*) FROM users u WHERE u.school_id = s.id AND u.is_active = 1) as user_count,
             (SELECT COUNT(*) FROM staff sf WHERE sf.school_id = s.id AND sf.is_active = 1) as staff_count
      FROM schools s
      ORDER BY s.created_at DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
};

exports.getStats = async (req, res) => {
  try {
    const [[stats]] = await db.execute(`
      SELECT
        (SELECT COUNT(*) FROM schools) as total_schools,
        (SELECT COUNT(*) FROM schools WHERE is_active = 1) as active_schools,
        (SELECT COUNT(*) FROM students WHERE status != 'archive') as total_students,
        (SELECT COUNT(*) FROM users WHERE is_active = 1) as total_users
    `);
    res.json({ success: true, data: stats });
  } catch (err) { handleError(res, err); }
};

exports.setSchoolStatus = async (req, res) => {
  try {
    const { is_active } = req.body;
    const [result] = await db.execute('UPDATE schools SET is_active=? WHERE id=?', [is_active ? 1 : 0, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'École non trouvée' });
    res.json({ success: true, message: is_active ? 'École réactivée' : 'École suspendue' });
  } catch (err) { handleError(res, err); }
};
