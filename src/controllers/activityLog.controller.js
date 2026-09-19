const db = require('../config/database');
const { handleError } = require('../utils/errors');

const MAX_ROWS = 500;

function buildFilters({ action, entity_type, from, to, search }, params) {
  let where = '';
  if (action)      { where += ' AND action = ?';      params.push(action); }
  if (entity_type) { where += ' AND entity_type = ?';  params.push(entity_type); }
  if (from)        { where += ' AND created_at >= ?';  params.push(from); }
  if (to)          { where += ' AND created_at <= ?';  params.push(`${to} 23:59:59`); }
  if (search)       {
    where += ' AND (user_name LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  return where;
}

// GET /activity-logs — journal de l'école du directeur connecté uniquement
exports.getSchoolLog = async (req, res) => {
  try {
    const params = [req.user.school_id];
    const where = buildFilters(req.query, params);
    const [rows] = await db.execute(
      `SELECT * FROM activity_logs WHERE school_id = ? ${where} ORDER BY created_at DESC LIMIT ${MAX_ROWS}`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
};

// GET /admin/activity-logs — journal transversal plateforme (super_admin), toutes écoles
exports.getPlatformLog = async (req, res) => {
  try {
    const params = [];
    let where = buildFilters(req.query, params);
    if (req.query.school_id) { where += ' AND school_id = ?'; params.push(req.query.school_id); }
    const [rows] = await db.execute(
      `SELECT al.*, s.name as school_name
       FROM activity_logs al LEFT JOIN schools s ON al.school_id = s.id
       WHERE 1=1 ${where} ORDER BY al.created_at DESC LIMIT ${MAX_ROWS}`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
};
