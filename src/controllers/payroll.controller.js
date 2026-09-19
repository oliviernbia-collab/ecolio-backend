const db = require('../config/database');
const { createNotification } = require('../utils/notifications');
const { handleError } = require('../utils/errors');
const { createSchoolPdf, formatFCFA } = require('../utils/pdf');

exports.getAll = async (req, res) => {
  try {
    const { period_month } = req.query;
    let query = `
      SELECT p.*, u.first_name, u.last_name, st.position
      FROM payslips p
      JOIN staff st ON p.staff_id=st.id
      JOIN users u ON st.user_id=u.id
      WHERE p.school_id=?`;
    const params = [req.user.school_id];
    if (period_month) { query += ' AND p.period_month=?'; params.push(period_month); }
    query += ' ORDER BY p.period_month DESC, u.last_name';
    const [rows] = await db.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getOne = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT p.*, u.first_name, u.last_name, u.email, st.position
       FROM payslips p JOIN staff st ON p.staff_id=st.id JOIN users u ON st.user_id=u.id
       WHERE p.id=? AND p.school_id=?`,
      [req.params.id, req.user.school_id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Bulletin non trouvé' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getPdf = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT p.*, u.first_name, u.last_name, u.email, st.position
       FROM payslips p JOIN staff st ON p.staff_id=st.id JOIN users u ON st.user_id=u.id
       WHERE p.id=? AND p.school_id=?`,
      [req.params.id, req.user.school_id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Bulletin non trouvé' });
    const slip = rows[0];
    const [[school]] = await db.execute('SELECT name, address, phone, email FROM schools WHERE id=?', [req.user.school_id]);

    const doc = createSchoolPdf(res, `bulletin-paie-${slip.reference}.pdf`, school);
    doc.fontSize(13).fillColor('#1A3C5E').text('BULLETIN DE PAIE', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#000');
    doc.text(`Employé : ${slip.first_name} ${slip.last_name}`);
    doc.text(`Poste : ${slip.position || '—'}`);
    doc.text(`Période : ${slip.period_month}`);
    doc.text(`Référence : ${slip.reference}`);
    doc.moveDown(1);

    const line = (label, value, bold = false) => {
      doc.fontSize(bold ? 11 : 10).fillColor(bold ? '#1A3C5E' : '#000');
      doc.text(label, 40, doc.y, { continued: true, width: 350 });
      doc.text(value, { align: 'right' });
    };
    line('Salaire de base', formatFCFA(slip.base_salary));
    if (slip.bonuses > 0) line(`Primes${slip.bonuses_detail ? ' (' + slip.bonuses_detail + ')' : ''}`, `+ ${formatFCFA(slip.bonuses)}`);
    if (slip.deductions > 0) line(`Retenues${slip.deductions_detail ? ' (' + slip.deductions_detail + ')' : ''}`, `- ${formatFCFA(slip.deductions)}`);
    doc.moveDown(0.5);
    doc.strokeColor('#e0e0e0').moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.5);
    line('NET À PAYER', formatFCFA(slip.net_amount), true);
    doc.moveDown(1);
    doc.fontSize(9).fillColor('#666').text(`Statut : ${slip.status === 'paid' ? 'Payé' : 'Brouillon'}${slip.paid_at ? ' le ' + new Date(slip.paid_at).toLocaleDateString('fr-FR') : ''}`);

    doc.end();
  } catch (err) {
    handleError(res, err);
  }
};

// POST /payroll/generate — crée les bulletins brouillon du mois pour tout le personnel actif
exports.generate = async (req, res) => {
  try {
    const { period_month } = req.body;
    if (!period_month || !/^\d{4}-\d{2}$/.test(period_month)) {
      return res.status(400).json({ success: false, message: 'period_month au format YYYY-MM requis' });
    }
    const [staffList] = await db.execute(
      'SELECT id, salary FROM staff WHERE school_id=? AND is_active=1',
      [req.user.school_id]
    );
    let created = 0;
    for (const s of staffList) {
      const base = s.salary || 0;
      const reference = `BUL-${period_month.replace('-', '')}-${String(s.id).padStart(4, '0')}`;
      const [result] = await db.execute(
        `INSERT IGNORE INTO payslips (school_id, staff_id, period_month, reference, base_salary, net_amount, generated_by)
         VALUES (?,?,?,?,?,?,?)`,
        [req.user.school_id, s.id, period_month, reference, base, base, req.user.id]
      );
      if (result.affectedRows) created++;
    }
    res.status(201).json({ success: true, message: `${created} bulletin(s) généré(s)`, created });
  } catch (err) {
    handleError(res, err);
  }
};

exports.update = async (req, res) => {
  try {
    const { base_salary, bonuses, bonuses_detail, deductions, deductions_detail } = req.body;
    const [rows] = await db.execute('SELECT status FROM payslips WHERE id=? AND school_id=?', [req.params.id, req.user.school_id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Bulletin non trouvé' });
    if (rows[0].status === 'paid') {
      return res.status(400).json({ success: false, message: 'Impossible de modifier un bulletin déjà payé' });
    }
    const base = parseFloat(base_salary) || 0;
    const bonus = parseFloat(bonuses) || 0;
    const deduc = parseFloat(deductions) || 0;
    const net = base + bonus - deduc;
    await db.execute(
      `UPDATE payslips SET base_salary=?, bonuses=?, bonuses_detail=?, deductions=?, deductions_detail=?, net_amount=?
       WHERE id=? AND school_id=?`,
      [base, bonus, bonuses_detail || null, deduc, deductions_detail || null, net, req.params.id, req.user.school_id]
    );
    res.json({ success: true, message: 'Bulletin mis à jour' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.markPaid = async (req, res) => {
  try {
    const { payment_method } = req.body;
    const [result] = await db.execute(
      "UPDATE payslips SET status='paid', payment_method=?, paid_at=NOW() WHERE id=? AND school_id=?",
      [payment_method || 'Espèces', req.params.id, req.user.school_id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Fiche de paie introuvable' });
    const [rows] = await db.execute(
      `SELECT p.net_amount, p.period_month, st.user_id
       FROM payslips p JOIN staff st ON p.staff_id=st.id WHERE p.id=? AND p.school_id=?`,
      [req.params.id, req.user.school_id]
    );
    if (rows.length) {
      await createNotification({
        user_id: rows[0].user_id,
        school_id: req.user.school_id,
        title: 'Salaire versé',
        content: `${Number(rows[0].net_amount).toLocaleString('fr-FR')} FCFA pour ${rows[0].period_month} via ${payment_method || 'Espèces'}`,
        type: 'finance',
      });
    }
    res.json({ success: true, message: 'Bulletin marqué payé' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.remove = async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT status FROM payslips WHERE id=? AND school_id=?', [req.params.id, req.user.school_id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Bulletin non trouvé' });
    if (rows[0].status === 'paid') {
      return res.status(400).json({ success: false, message: 'Impossible de supprimer un bulletin déjà payé' });
    }
    await db.execute('DELETE FROM payslips WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'Bulletin supprimé' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getStats = async (req, res) => {
  try {
    const { period_month } = req.query;
    const month = period_month || new Date().toISOString().slice(0, 7);
    const [[stats]] = await db.execute(
      `SELECT COALESCE(SUM(net_amount),0) as total_net, COALESCE(SUM(base_salary+bonuses),0) as total_gross,
              COUNT(*) as total_count,
              SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) as paid_count,
              SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) as draft_count
       FROM payslips WHERE school_id=? AND period_month=?`,
      [req.user.school_id, month]
    );
    res.json({ success: true, data: { ...stats, period_month: month } });
  } catch (err) {
    handleError(res, err);
  }
};
