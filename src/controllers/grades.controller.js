const db = require('../config/database');
const { notifyParent } = require('../utils/notifications');
const { handleError } = require('../utils/errors');
const { createSchoolPdf } = require('../utils/pdf');

const PERIOD_LABELS = { trimestre1: '1er trimestre', trimestre2: '2ème trimestre', trimestre3: '3ème trimestre', semestre1: '1er semestre', semestre2: '2ème semestre' };

// Moyenne d'une matière pour un élève à partir de ses notes groupées par période :
// moyenne de chaque période, puis moyenne de ces moyennes (identique à l'algorithme historique).
function averageFromPeriods(periods) {
  const values = Object.values(periods);
  if (!values.length) return 0;
  const sum = values.reduce((acc, d) => acc + (d.count > 0 ? d.total / d.count : 0), 0);
  return sum / values.length;
}

async function computeBulletin(studentId, schoolId, period) {
  const [studentRows] = await db.execute(
    `SELECT s.*, c.name as class_name, c.cycle, c.level
     FROM students s LEFT JOIN classes c ON s.class_id=c.id
     WHERE s.id=? AND s.school_id=?`,
    [studentId, schoolId]
  );
  if (!studentRows.length) return null;
  const student = studentRows[0];

  // Notes de toute la classe (pour classement matière et classement général) — à défaut de
  // classe assignée, on se limite aux notes du seul élève (pas de classement possible).
  const classFilterSql = student.class_id ? 'AND st.class_id = ?' : 'AND st.id = ?';
  const classFilterParam = student.class_id || studentId;

  const [gradeRows] = await db.execute(
    `SELECT g.student_id, g.subject_id, g.value, g.period,
            sub.name as subject_name, sub.coefficient,
            CONCAT(u.first_name,' ',u.last_name) as teacher_name
     FROM grades g
     JOIN subjects sub ON g.subject_id = sub.id
     JOIN students st  ON g.student_id = st.id
     LEFT JOIN users u ON sub.teacher_id = u.id
     WHERE st.school_id = ? ${classFilterSql} ${period ? 'AND g.period=?' : ''}`,
    period ? [schoolId, classFilterParam, period] : [schoolId, classFilterParam]
  );

  let effectif = 1;
  if (student.class_id) {
    const [[{ cnt }]] = await db.execute(
      `SELECT COUNT(*) as cnt FROM students WHERE class_id=? AND school_id=? AND status != 'archive'`,
      [student.class_id, schoolId]
    );
    effectif = cnt;
  }

  // bySubject[subjectId] = { name, coefficient, teacher_name, byStudent: { studentId: { period: {total,count} } } }
  const bySubject = {};
  for (const g of gradeRows) {
    if (!bySubject[g.subject_id]) {
      bySubject[g.subject_id] = { name: g.subject_name, coefficient: g.coefficient, teacher_name: g.teacher_name, byStudent: {} };
    }
    const byStudent = bySubject[g.subject_id].byStudent;
    if (!byStudent[g.student_id]) byStudent[g.student_id] = {};
    if (!byStudent[g.student_id][g.period]) byStudent[g.student_id][g.period] = { total: 0, count: 0 };
    byStudent[g.student_id][g.period].total += parseFloat(g.value);
    byStudent[g.student_id][g.period].count++;
  }

  // Moyenne par (matière, élève)
  const subjectStudentAvg = {};
  for (const [subId, subj] of Object.entries(bySubject)) {
    subjectStudentAvg[subId] = {};
    for (const [stId, periods] of Object.entries(subj.byStudent)) {
      subjectStudentAvg[subId][stId] = averageFromPeriods(periods);
    }
  }

  // Moyenne générale pondérée par élève (pour le classement de classe)
  const studentIds = new Set();
  Object.values(subjectStudentAvg).forEach(m => Object.keys(m).forEach(id => studentIds.add(id)));
  const generalByStudent = {};
  for (const stId of studentIds) {
    let totalWeighted = 0, totalCoeff = 0;
    for (const [subId, subj] of Object.entries(bySubject)) {
      const avg = subjectStudentAvg[subId][stId];
      if (avg === undefined) continue;
      totalWeighted += avg * subj.coefficient;
      totalCoeff += parseFloat(subj.coefficient);
    }
    generalByStudent[stId] = totalCoeff > 0 ? totalWeighted / totalCoeff : 0;
  }

  const targetKey = String(studentId);

  const subjects = Object.entries(bySubject).map(([subId, subj]) => {
    const periodsForTarget = subj.byStudent[targetKey] || {};
    const periodAvgs = {};
    for (const [p, data] of Object.entries(periodsForTarget)) {
      periodAvgs[p] = parseFloat((data.count > 0 ? data.total / data.count : 0).toFixed(2));
    }
    const targetAvg = subjectStudentAvg[subId][targetKey] ?? 0;

    const ranked = Object.entries(subjectStudentAvg[subId]).sort((a, b) => b[1] - a[1]);
    const rank = ranked.findIndex(([id]) => id === targetKey) + 1;

    return {
      id: subId, name: subj.name, coefficient: subj.coefficient, teacher_name: subj.teacher_name || '—',
      periods: periodAvgs, average: parseFloat(targetAvg.toFixed(2)),
      rank: rank || null, rankTotal: ranked.length,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const generalAverage = parseFloat((generalByStudent[targetKey] || 0).toFixed(2));

  const classRanked = Object.entries(generalByStudent).sort((a, b) => b[1] - a[1]);
  const classRank = classRanked.findIndex(([id]) => id === targetKey) + 1;
  const classAverages = classRanked.map(([, v]) => v);
  const classStats = {
    effectif,
    rank: classRank || null,
    rankTotal: classRanked.length,
    highest: classAverages.length ? parseFloat(Math.max(...classAverages).toFixed(2)) : null,
    lowest:  classAverages.length ? parseFloat(Math.min(...classAverages).toFixed(2)) : null,
    classAverage: classAverages.length ? parseFloat((classAverages.reduce((a, b) => a + b, 0) / classAverages.length).toFixed(2)) : null,
  };

  return { student, subjects, generalAverage, classStats };
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
    const { student, subjects, generalAverage, classStats } = bulletin;
    const periodLabel = PERIOD_LABELS[req.query.period] || 'Année en cours';

    const doc = createSchoolPdf(res, `bulletin-${student.matricule}.pdf`, school);
    doc.fontSize(8).fillColor('#888').text('RÉPUBLIQUE DE CÔTE D\'IVOIRE — Union - Discipline - Travail', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(13).fillColor('#1A3C5E').text('BULLETIN DE NOTES', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#000').text(`Élève : ${student.first_name} ${student.last_name}  (${student.matricule})`);
    doc.text(`Classe : ${student.class_name || '—'}   ·   Effectif : ${classStats.effectif}`);
    doc.text(`Période : ${periodLabel}`);
    doc.moveDown(1);

    const colX = [40, 235, 285, 335, 395, 455];
    const colW = { subject: 195, coef: 50, avg: 50, rang: 60, prof: 130 };
    const rowHeight = 20;
    let rowY = doc.y;

    doc.rect(40, rowY, 515, rowHeight).fill('#1A3C5E');
    doc.fontSize(8).fillColor('#fff');
    doc.text('Matière',     colX[0] + 5, rowY + 6, { lineBreak: false });
    doc.text('Coef.',       colX[1] + 5, rowY + 6, { lineBreak: false });
    doc.text('Moy.',        colX[2] + 5, rowY + 6, { lineBreak: false });
    doc.text('Rang',        colX[3] + 5, rowY + 6, { lineBreak: false });
    doc.text('Professeur',  colX[4] + 5, rowY + 6, { lineBreak: false });
    rowY += rowHeight;

    doc.fillColor('#000');
    for (const s of subjects) {
      doc.fontSize(8);
      doc.text(s.name, colX[0] + 5, rowY + 5, { width: colW.subject, lineBreak: false });
      doc.text(String(s.coefficient), colX[1] + 5, rowY + 5, { lineBreak: false });
      doc.text(s.average.toFixed(2), colX[2] + 5, rowY + 5, { lineBreak: false });
      doc.text(s.rank ? `${s.rank}${s.rank === 1 ? 'er' : 'ème'}/${s.rankTotal}` : '—', colX[3] + 5, rowY + 5, { lineBreak: false });
      doc.text(s.teacher_name, colX[4] + 5, rowY + 5, { width: colW.prof, lineBreak: false });
      rowY += rowHeight;
    }

    doc.x = 40;
    doc.y = rowY + 10;
    doc.strokeColor('#e0e0e0').moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.8);

    doc.fontSize(12).fillColor('#1A3C5E').text(`Moyenne générale : ${generalAverage.toFixed(2)}/20`, 40, doc.y, { width: 515, align: 'right' });
    doc.moveDown(0.4);
    doc.fontSize(9).fillColor('#555').text(
      `Rang : ${classStats.rank ? `${classStats.rank}${classStats.rank === 1 ? 'er' : 'ème'}/${classStats.rankTotal}` : '—'}   ·   ` +
      `Plus forte moyenne : ${classStats.highest ?? '—'}   ·   Plus faible moyenne : ${classStats.lowest ?? '—'}   ·   Moyenne de classe : ${classStats.classAverage ?? '—'}`,
      40, doc.y, { width: 515, align: 'right' }
    );

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
