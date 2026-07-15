const db = require('../config/database');
const { notifyParent } = require('../utils/notifications');
const { sendSms } = require('./sms.controller');
const { handleError } = require('../utils/errors');

async function smsNotifyParent(studentId, schoolId, content) {
  try {
    const [rows] = await db.execute(
      `SELECT u.id, u.phone FROM students s JOIN users u ON s.parent_id = u.id
       WHERE s.id = ? AND u.phone IS NOT NULL AND u.phone != ''`,
      [studentId]
    );
    if (rows.length) {
      await sendSms({ schoolId, senderId: null, content, users: rows, triggerType: 'absence' });
    }
  } catch (e) { console.error('[SMS absence]', e.message); }
}

exports.getAll = async (req, res) => {
  try {
    const { class_id, date, start_date, end_date } = req.query;
    let query = `
      SELECT a.*, CONCAT(s.first_name,' ',s.last_name) as student_name, s.matricule, c.name as class_name
      FROM attendance a
      JOIN students s ON a.student_id=s.id
      JOIN classes c ON a.class_id=c.id
      WHERE s.school_id=?`;
    const params = [req.user.school_id];
    if (class_id)   { query += ' AND a.class_id=?';    params.push(class_id); }
    if (date)       { query += ' AND a.date=?';        params.push(date); }
    if (start_date) { query += ' AND a.date >= ?';     params.push(start_date); }
    if (end_date)   { query += ' AND a.date <= ?';     params.push(end_date); }
    query += ' ORDER BY a.date DESC, s.last_name';
    const [rows] = await db.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getByClass = async (req, res) => {
  try {
    const { date } = req.query;
    const d = date || new Date().toISOString().split('T')[0];
    const [students] = await db.execute(
      "SELECT s.id, s.first_name, s.last_name, s.matricule, s.photo_url FROM students s WHERE s.class_id=? AND s.status!='archive' ORDER BY s.last_name",
      [req.params.classId]
    );
    const [records] = await db.execute(
      'SELECT * FROM attendance WHERE class_id=? AND date=?',
      [req.params.classId, d]
    );
    const recordMap = {};
    for (const r of records) recordMap[r.student_id] = r;
    const result = students.map(s => ({
      ...s,
      attendance: recordMap[s.id] || { status: 'present', justified: false }
    }));
    res.json({ success: true, data: result, date: d });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getByStudent = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let query = 'SELECT * FROM attendance WHERE student_id=?';
    const params = [req.params.studentId];
    if (start_date) { query += ' AND date >= ?'; params.push(start_date); }
    if (end_date)   { query += ' AND date <= ?'; params.push(end_date); }
    query += ' ORDER BY date DESC';
    const [rows] = await db.execute(query, params);
    const total    = rows.length;
    const absences = rows.filter(r => r.status === 'absent').length;
    const retards  = rows.filter(r => r.status === 'retard').length;
    res.json({ success: true, data: rows, stats: { total, absences, retards, presents: total - absences } });
  } catch (err) {
    handleError(res, err);
  }
};

exports.record = async (req, res) => {
  try {
    const { student_id, class_id, date, status, justification } = req.body;
    await db.execute(
      `INSERT INTO attendance (student_id, class_id, date, status, justified, justification, recorded_by)
       VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE status=VALUES(status), justified=VALUES(justified), justification=VALUES(justification)`,
      [student_id, class_id, date, status, !!justification, justification || null, req.user.id]
    );

    // Notification automatique en cas d'absence ou de retard
    if (status === 'absent' || status === 'retard') {
      const dateFormatted = new Date(date).toLocaleDateString('fr-FR');
      const statusLabel = status === 'absent' ? 'Absence' : 'Retard';
      await notifyParent(
        student_id,
        req.user.school_id,
        `${statusLabel} signalé(e) le ${dateFormatted}`,
        justification ? `Justification : ${justification}` : 'Aucune justification fournie.',
        'absence'
      );
      await smsNotifyParent(student_id, req.user.school_id, `Écolio: ${statusLabel} de votre enfant signalé(e) le ${dateFormatted}.`);
    }

    res.json({ success: true, message: 'Présence enregistrée' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.bulkRecord = async (req, res) => {
  try {
    const { class_id, date, records } = req.body;
    for (const r of records) {
      await db.execute(
        `INSERT INTO attendance (student_id, class_id, date, status, recorded_by)
         VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE status=VALUES(status)`,
        [r.student_id, class_id, date, r.status, req.user.id]
      );
      if (r.status === 'absent' || r.status === 'retard') {
        const dateFormatted = new Date(date).toLocaleDateString('fr-FR');
        const statusLabel = r.status === 'absent' ? 'Absence' : 'Retard';
        await notifyParent(
          r.student_id,
          req.user.school_id,
          `${statusLabel} signalé(e) le ${dateFormatted}`,
          '',
          'absence'
        );
        await smsNotifyParent(r.student_id, req.user.school_id, `Écolio: ${statusLabel} de votre enfant signalé(e) le ${dateFormatted}.`);
      }
    }
    res.json({ success: true, message: `${records.length} présences enregistrées` });
  } catch (err) {
    handleError(res, err);
  }
};

exports.justify = async (req, res) => {
  try {
    const { justification } = req.body;
    await db.execute(
      'UPDATE attendance SET justified=1, justification=? WHERE id=?',
      [justification, req.params.id]
    );
    res.json({ success: true, message: 'Absence justifiée' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getStats = async (req, res) => {
  try {
    const { class_id, start_date, end_date } = req.query;
    let baseWhere = 'WHERE s.school_id=?';
    const params = [req.user.school_id];
    if (class_id)   { baseWhere += ' AND a.class_id=?';   params.push(class_id); }
    if (start_date) { baseWhere += ' AND a.date >= ?';     params.push(start_date); }
    if (end_date)   { baseWhere += ' AND a.date <= ?';     params.push(end_date); }

    const [rows] = await db.execute(
      `SELECT a.status, COUNT(*) as count
       FROM attendance a JOIN students s ON a.student_id=s.id
       ${baseWhere} GROUP BY a.status`,
      params
    );
    const stats = { present: 0, absent: 0, retard: 0, sortie_anticipee: 0 };
    for (const r of rows) stats[r.status] = r.count;
    res.json({ success: true, data: stats });
  } catch (err) {
    handleError(res, err);
  }
};
