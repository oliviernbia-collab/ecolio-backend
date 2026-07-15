const db = require('../config/database');
const { handleError } = require('../utils/errors');

async function getStaffId(userId) {
  const [rows] = await db.execute('SELECT id FROM staff WHERE user_id=? AND is_active=1', [userId]);
  return rows.length ? rows[0].id : null;
}

// GET /staff-attendance?date=YYYY-MM-DD — grille de tout le personnel actif
exports.getByDate = async (req, res) => {
  try {
    const { date } = req.query;
    const d = date || new Date().toISOString().split('T')[0];
    const [staff] = await db.execute(
      `SELECT st.id, st.position, u.first_name, u.last_name, u.avatar_url
       FROM staff st JOIN users u ON st.user_id=u.id
       WHERE st.school_id=? AND st.is_active=1 ORDER BY u.last_name`,
      [req.user.school_id]
    );
    const [records] = await db.execute(
      'SELECT * FROM staff_attendance WHERE school_id=? AND date=?',
      [req.user.school_id, d]
    );
    const recordMap = {};
    for (const r of records) recordMap[r.staff_id] = r;
    const result = staff.map(s => ({ ...s, attendance: recordMap[s.id] || null }));
    res.json({ success: true, data: result, date: d });
  } catch (err) {
    handleError(res, err);
  }
};

// GET /staff-attendance/mine?date= — statut du jour pour l'utilisateur connecté
exports.getMine = async (req, res) => {
  try {
    const d = req.query.date || new Date().toISOString().split('T')[0];
    const staffId = await getStaffId(req.user.id);
    if (!staffId) return res.json({ success: true, data: null });
    const [rows] = await db.execute('SELECT * FROM staff_attendance WHERE staff_id=? AND date=?', [staffId, d]);
    res.json({ success: true, data: rows[0] || null });
  } catch (err) {
    handleError(res, err);
  }
};

// POST /staff-attendance/checkin — pointage d'arrivée (self-service)
exports.checkIn = async (req, res) => {
  try {
    const staffId = await getStaffId(req.user.id);
    if (!staffId) return res.status(400).json({ success: false, message: "Aucune fiche personnel associée à ce compte" });
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toTimeString().split(' ')[0];
    await db.execute(
      `INSERT INTO staff_attendance (school_id, staff_id, date, check_in_time, status, source, recorded_by)
       VALUES (?,?,?,?, 'present', 'manuel', ?)
       ON DUPLICATE KEY UPDATE check_in_time=VALUES(check_in_time), status='present'`,
      [req.user.school_id, staffId, today, now, req.user.id]
    );
    res.json({ success: true, message: 'Arrivée pointée', time: now });
  } catch (err) {
    handleError(res, err);
  }
};

// PUT /staff-attendance/checkout — pointage de départ (self-service)
exports.checkOut = async (req, res) => {
  try {
    const staffId = await getStaffId(req.user.id);
    if (!staffId) return res.status(400).json({ success: false, message: "Aucune fiche personnel associée à ce compte" });
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toTimeString().split(' ')[0];
    const [rows] = await db.execute('SELECT id FROM staff_attendance WHERE staff_id=? AND date=?', [staffId, today]);
    if (!rows.length) {
      return res.status(400).json({ success: false, message: "Pointez d'abord votre arrivée" });
    }
    await db.execute('UPDATE staff_attendance SET check_out_time=? WHERE staff_id=? AND date=?', [now, staffId, today]);
    res.json({ success: true, message: 'Départ pointé', time: now });
  } catch (err) {
    handleError(res, err);
  }
};

// POST /staff-attendance/bulk — correction manuelle par un admin pour une journée
exports.bulkRecord = async (req, res) => {
  try {
    const { date, records } = req.body;
    for (const r of records) {
      await db.execute(
        `INSERT INTO staff_attendance (school_id, staff_id, date, status, check_in_time, check_out_time, notes, recorded_by)
         VALUES (?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE status=VALUES(status), check_in_time=VALUES(check_in_time), check_out_time=VALUES(check_out_time), notes=VALUES(notes)`,
        [req.user.school_id, r.staff_id, date, r.status, r.check_in_time || null, r.check_out_time || null, r.notes || null, req.user.id]
      );
    }
    res.json({ success: true, message: `${records.length} pointages enregistrés` });
  } catch (err) {
    handleError(res, err);
  }
};

// GET /staff-attendance/stats — résumé du jour + tendance 7 jours
exports.getStats = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [[todayStats]] = await db.execute(
      `SELECT COUNT(*) as total,
         COALESCE(SUM(CASE WHEN status='present' THEN 1 ELSE 0 END),0) as present,
         COALESCE(SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END),0) as absent,
         COALESCE(SUM(CASE WHEN status='retard' THEN 1 ELSE 0 END),0) as retard
       FROM staff_attendance WHERE school_id=? AND date=?`, [req.user.school_id, today]);
    const [[totalStaff]] = await db.execute(
      "SELECT COUNT(*) as total FROM staff WHERE school_id=? AND is_active=1", [req.user.school_id]);
    const [trend] = await db.execute(
      `SELECT date, COUNT(*) as total,
         SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) as present,
         SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END) as absent
       FROM staff_attendance WHERE school_id=? AND date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       GROUP BY date ORDER BY date`, [req.user.school_id]);
    res.json({ success: true, data: { today: todayStats, total_staff: totalStaff.total, trend } });
  } catch (err) {
    handleError(res, err);
  }
};
