const db = require('../config/database');
const { notifyParent } = require('../utils/notifications');
const { handleError } = require('../utils/errors');
const { createSchoolPdf } = require('../utils/pdf');

const PERIOD_LABELS = { trimestre1: '1er trimestre', trimestre2: '2ème trimestre', trimestre3: '3ème trimestre', semestre1: '1er semestre', semestre2: '2ème semestre' };

async function computeBulletin(studentId, schoolId, period) {
  const [student] = await db.execute(
    `SELECT s.*, c.name as class_name, c.cycle, c.level
     FROM students s LEFT JOIN classes c ON s.class_id=c.id
     WHERE s.id=? AND s.school_id=?`,
    [studentId, schoolId]
  );
  if (!student.length) return null;

  const [grades] = await db.execute(
    `SELECT g.*, sub.name as subject_name, sub.coefficient
     FROM grades g JOIN subjects sub ON g.subject_id=sub.id
     WHERE g.student_id=? ${period ? 'AND g.period=?' : ''}
     ORDER BY sub.name`,
    period ? [studentId, period] : [studentId]
  );

  const subjectMap = {};
  for (const g of grades) {
    if (!subjectMap[g.subject_id]) {
      subjectMap[g.subject_id] = { name: g.subject_name, coefficient: g.coefficient, periods: {} };
    }
    if (!subjectMap[g.subject_id].periods[g.period]) {
      subjectMap[g.subject_id].periods[g.period] = { total: 0, count: 0 };
    }
    subjectMap[g.subject_id].periods[g.period].total += parseFloat(g.value);
    subjectMap[g.subject_id].periods[g.period].count++;
  }

  let totalWeighted = 0, totalCoeff = 0;
  const subjects = Object.entries(subjectMap).map(([id, s]) => {
    const periodAvgs = {};
    let subAvg = 0, subCount = 0;
    for (const [p, data] of Object.entries(s.periods)) {
      const avg = data.count > 0 ? data.total / data.count : 0;
      periodAvgs[p] = parseFloat(avg.toFixed(2));
      subAvg += avg; subCount++;
    }
    const avg = subCount > 0 ? subAvg / subCount : 0;
    totalWeighted += avg * s.coefficient;
    totalCoeff += parseFloat(s.coefficient);
    return { id, name: s.name, coefficient: s.coefficient, periods: periodAvgs, average: parseFloat(avg.toFixed(2)) };
  });

  const generalAverage = totalCoeff > 0 ? parseFloat((totalWeighted / totalCoeff).toFixed(2)) : 0;
  return { student: student[0], subjects, generalAverage };
}

exports.getAll = async (req, res) => {
  try {
    const { class_id, subject_id, period } = req.query;
    let query = `
      SELECT g.*, CONCAT(s.first_name,' ',s.last_name) as student_name, s.matricule,
             sub.name as subject_name, sub.coefficient, c.name as class_name
      FROM grades g
      JOIN students s ON g.student_id=s.id
      JOIN subjects sub ON g.subject_id=sub.id
      LEFT JOIN classes c ON s.class_id=c.id
      WHERE s.school_id=?`;
    const params = [req.user.school_id];
    if (class_id)   { query += ' AND s.class_id=?';    params.push(class_id); }
    if (subject_id) { query += ' AND g.subject_id=?';  params.push(subject_id); }
    if (period)     { query += ' AND g.period=?';      params.push(period); }
    query += ' ORDER BY s.last_name, sub.name';
    const [rows] = await db.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getByStudent = async (req, res) => {
  try {
    const { period } = req.query;
    const [student] = await db.execute(
      'SELECT id FROM students WHERE id=? AND school_id=?',
      [req.params.studentId, req.user.school_id]
    );
    if (!student.length) return res.status(404).json({ success: false, message: 'Élève non trouvé' });

    let query = `
      SELECT g.*, sub.name as subject_name, sub.coefficient
      FROM grades g JOIN subjects sub ON g.subject_id=sub.id
      WHERE g.student_id=?`;
    const params = [req.params.studentId];
    if (period) { query += ' AND g.period=?'; params.push(period); }
    query += ' ORDER BY sub.name, g.period';
    const [rows] = await db.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getBulletin = async (req, res) => {
  try {
    const bulletin = await computeBulletin(req.params.studentId, req.user.school_id, req.query.period);
    if (!bulletin) return res.status(404).json({ success: false, message: 'Élève non trouvé' });
    res.json({ success: true, data: bulletin });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getBulletinPdf = async (req, res) => {
  try {
    const bulletin = await computeBulletin(req.params.studentId, req.user.school_id, req.query.period);
    if (!bulletin) return res.status(404).json({ success: false, message: 'Élève non trouvé' });

    const [[school]] = await db.execute('SELECT name, address, phone, email FROM schools WHERE id=?', [req.user.school_id]);
    const { student, subjects, generalAverage } = bulletin;
    const periodLabel = PERIOD_LABELS[req.query.period] || 'Année en cours';

    const doc = createSchoolPdf(res, `bulletin-${student.matricule}.pdf`, school);
    doc.fontSize(13).fillColor('#1A3C5E').text('BULLETIN DE NOTES', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#000').text(`Élève : ${student.first_name} ${student.last_name}  (${student.matricule})`);
    doc.text(`Classe : ${student.class_name || '—'}`);
    doc.text(`Période : ${periodLabel}`);
    doc.moveDown(1);

    const colX = [40, 260, 340, 420, 500];
    const rowHeight = 20;
    let rowY = doc.y;

    doc.rect(40, rowY, 515, rowHeight).fill('#1A3C5E');
    doc.fontSize(9).fillColor('#fff');
    doc.text('Matière', colX[0] + 5, rowY + 6, { lineBreak: false });
    doc.text('Coeff.', colX[1] + 5, rowY + 6, { lineBreak: false });
    doc.text('Moyenne', colX[2] + 5, rowY + 6, { lineBreak: false });
    doc.text('/20', colX[3] + 5, rowY + 6, { lineBreak: false });
    rowY += rowHeight;

    doc.fillColor('#000');
    for (const s of subjects) {
      doc.fontSize(9);
      doc.text(s.name, colX[0] + 5, rowY + 5, { width: 210, lineBreak: false });
      doc.text(String(s.coefficient), colX[1] + 5, rowY + 5, { lineBreak: false });
      doc.text(s.average.toFixed(2), colX[2] + 5, rowY + 5, { lineBreak: false });
      doc.text(s.average >= 10 ? 'Acquis' : 'À travailler', colX[3] + 5, rowY + 5, { lineBreak: false });
      rowY += rowHeight;
    }

    doc.x = 40;
    doc.y = rowY + 10;
    doc.strokeColor('#e0e0e0').moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.8);
    doc.fontSize(12).fillColor('#1A3C5E').text(`Moyenne générale : ${generalAverage.toFixed(2)}/20`, 40, doc.y, { width: 515, align: 'right' });

    doc.end();
  } catch (err) {
    handleError(res, err);
  }
};

exports.create = async (req, res) => {
  try {
    const { student_id, subject_id, value, max_value, period, grade_type, comment } = req.body;
    if (!student_id || !subject_id || value === undefined || value === '') {
      return res.status(400).json({ success: false, message: 'Élève, matière et note sont requis' });
    }

    const [student] = await db.execute('SELECT id FROM students WHERE id=? AND school_id=?', [student_id, req.user.school_id]);
    if (!student.length) return res.status(404).json({ success: false, message: 'Élève non trouvé' });
    const [subject] = await db.execute('SELECT id FROM subjects WHERE id=? AND school_id=?', [subject_id, req.user.school_id]);
    if (!subject.length) return res.status(404).json({ success: false, message: 'Matière non trouvée' });

    const numValue = parseFloat(value);
    const numMax = parseFloat(max_value) || 20;
    if (isNaN(numValue) || numValue < 0 || numValue > numMax) {
      return res.status(400).json({ success: false, message: `La note doit être comprise entre 0 et ${numMax}` });
    }

    const [result] = await db.execute(
      'INSERT INTO grades (student_id, subject_id, value, max_value, period, grade_type, comment, created_by) VALUES (?,?,?,?,?,?,?,?)',
      [student_id, subject_id, numValue, numMax, period || null, grade_type || 'devoir', comment || null, req.user.id]
    );

    // Notification automatique au parent
    const [subjectRow] = await db.execute('SELECT name FROM subjects WHERE id = ?', [subject_id]);
    const subjectName = subjectRow[0]?.name || 'Matière';
    const periodLabel = PERIOD_LABELS[period] || period;
    await notifyParent(
      student_id,
      req.user.school_id,
      `Nouvelle note — ${subjectName}`,
      `${numValue}/${numMax} en ${subjectName} (${periodLabel})`,
      'grade'
    );

    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    handleError(res, err);
  }
};

exports.update = async (req, res) => {
  try {
    const { value, max_value, period, grade_type, comment } = req.body;

    const [owned] = await db.execute(
      `SELECT g.id FROM grades g JOIN students s ON g.student_id=s.id WHERE g.id=? AND s.school_id=?`,
      [req.params.id, req.user.school_id]
    );
    if (!owned.length) return res.status(404).json({ success: false, message: 'Note non trouvée' });

    const numValue = parseFloat(value);
    const numMax = parseFloat(max_value) || 20;
    if (isNaN(numValue) || numValue < 0 || numValue > numMax) {
      return res.status(400).json({ success: false, message: `La note doit être comprise entre 0 et ${numMax}` });
    }

    await db.execute(
      'UPDATE grades SET value=?, max_value=?, period=?, grade_type=?, comment=? WHERE id=?',
      [numValue, numMax, period, grade_type, comment, req.params.id]
    );
    res.json({ success: true, message: 'Note mise à jour' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.delete = async (req, res) => {
  try {
    const [owned] = await db.execute(
      `SELECT g.id FROM grades g JOIN students s ON g.student_id=s.id WHERE g.id=? AND s.school_id=?`,
      [req.params.id, req.user.school_id]
    );
    if (!owned.length) return res.status(404).json({ success: false, message: 'Note non trouvée' });

    await db.execute('DELETE FROM grades WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'Note supprimée' });
  } catch (err) {
    handleError(res, err);
  }
};
