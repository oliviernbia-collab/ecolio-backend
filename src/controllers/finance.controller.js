const db = require('../config/database');
const { createNotification } = require('../utils/notifications');
const { sendSms } = require('./sms.controller');
const { handleError } = require('../utils/errors');
const { sendExcel } = require('../utils/excel');

function buildInvoiceQuery(schoolId, { status, class_id, search }) {
  let query = `
    SELECT i.*, CONCAT(s.first_name,' ',s.last_name) as student_name, s.matricule, c.name as class_name
    FROM invoices i JOIN students s ON i.student_id=s.id
    LEFT JOIN classes c ON s.class_id=c.id
    WHERE i.school_id=?`;
  const params = [schoolId];
  if (status)   { query += ' AND i.status=?';    params.push(status); }
  if (class_id) { query += ' AND s.class_id=?';  params.push(class_id); }
  if (search)   { query += ' AND (s.first_name LIKE ? OR s.last_name LIKE ? OR i.invoice_number LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  query += ' ORDER BY i.created_at DESC';
  return { query, params };
}

const STATUS_LABELS = { pending: 'En attente', paid: 'Payée', overdue: 'En retard', cancelled: 'Annulée' };
const TYPE_LABELS_XLS = { scolarite: 'Scolarité', transport: 'Transport', cantine: 'Cantine', uniforme: 'Uniforme', activite: 'Activité', autre: 'Autre' };

async function smsNotifyInvoice(parentId, schoolId, content) {
  try {
    const [rows] = await db.execute(
      "SELECT id, phone FROM users WHERE id = ? AND phone IS NOT NULL AND phone != ''",
      [parentId]
    );
    if (rows.length) await sendSms({ schoolId, senderId: null, content, users: rows, triggerType: 'facture' });
  } catch (e) { console.error('[SMS facture]', e.message); }
}

const VALID_TYPES = ['scolarite', 'transport', 'cantine', 'uniforme', 'activite', 'autre'];

// Auto-migration : ajoute la colonne type si elle n'existe pas encore
;(async () => {
  try {
    const [cols] = await db.execute(
      "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'type'"
    );
    if (!cols.length) {
      await db.execute(
        "ALTER TABLE invoices ADD COLUMN type ENUM('scolarite','transport','cantine','uniforme','activite','autre') NOT NULL DEFAULT 'scolarite' AFTER student_id"
      );
      console.log('[Finance] Colonne type ajoutée à invoices');
    }
  } catch (e) {
    console.error('[Finance] Erreur auto-migration:', e.message);
  }
})();

exports.getAll = async (req, res) => {
  try {
    // Auto-marquer les factures en retard avant de les retourner
    await db.execute(
      "UPDATE invoices SET status='overdue' WHERE status='pending' AND due_date < CURDATE() AND school_id=?",
      [req.user.school_id]
    );

    const { query, params } = buildInvoiceQuery(req.user.school_id, req.query);
    const [rows] = await db.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    handleError(res, err);
  }
};

exports.exportExcel = async (req, res) => {
  try {
    const { query, params } = buildInvoiceQuery(req.user.school_id, req.query);
    const [rows] = await db.execute(query, params);

    await sendExcel(res, 'factures.xlsx', 'Factures', [
      { header: 'N° Facture', key: 'invoice_number', width: 18 },
      { header: 'Élève', key: 'student_name', width: 25 },
      { header: 'Matricule', key: 'matricule', width: 14 },
      { header: 'Classe', key: 'class_name', width: 12 },
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Montant (FCFA)', key: 'amount', width: 16 },
      { header: 'Échéance', key: 'due_date', width: 14 },
      { header: 'Statut', key: 'status', width: 14 },
      { header: 'Payée le', key: 'paid_at', width: 18 },
    ], rows.map(r => ({
      invoice_number: r.invoice_number,
      student_name: r.student_name,
      matricule: r.matricule,
      class_name: r.class_name || '—',
      type: TYPE_LABELS_XLS[r.type] || r.type,
      amount: parseFloat(r.amount),
      due_date: r.due_date ? new Date(r.due_date).toLocaleDateString('fr-FR') : '—',
      status: STATUS_LABELS[r.status] || r.status,
      paid_at: r.paid_at ? new Date(r.paid_at).toLocaleDateString('fr-FR') : '—',
    })));
  } catch (err) {
    handleError(res, err);
  }
};

exports.getStats = async (req, res) => {
  try {
    const [stats] = await db.execute(
      `SELECT
         SUM(amount) as total,
         SUM(CASE WHEN status='paid' THEN amount ELSE 0 END) as paid,
         SUM(CASE WHEN status='pending' THEN amount ELSE 0 END) as pending,
         SUM(CASE WHEN status='overdue' THEN amount ELSE 0 END) as overdue,
         COUNT(*) as total_invoices,
         SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) as paid_count,
         SUM(CASE WHEN status='pending' OR status='overdue' THEN 1 ELSE 0 END) as unpaid_count
       FROM invoices WHERE school_id=?`,
      [req.user.school_id]
    );
    const [monthly] = await db.execute(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') as month,
              SUM(CASE WHEN status='paid' THEN amount ELSE 0 END) as paid
       FROM invoices WHERE school_id=? AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
       GROUP BY month ORDER BY month`,
      [req.user.school_id]
    );
    res.json({ success: true, data: { ...stats[0], monthly } });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getOne = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT i.*, CONCAT(s.first_name,' ',s.last_name) as student_name, s.matricule, c.name as class_name
       FROM invoices i JOIN students s ON i.student_id=s.id
       LEFT JOIN classes c ON s.class_id=c.id
       WHERE i.id=? AND i.school_id=?`,
      [req.params.id, req.user.school_id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Facture non trouvée' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    handleError(res, err);
  }
};

exports.create = async (req, res) => {
  try {
    const { student_id, amount, description, due_date, type } = req.body;
    if (!student_id || !amount) {
      return res.status(400).json({ success: false, message: 'Élève et montant sont requis' });
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Montant invalide' });
    }
    const [studentCheck] = await db.execute('SELECT id FROM students WHERE id=? AND school_id=?', [student_id, req.user.school_id]);
    if (!studentCheck.length) return res.status(404).json({ success: false, message: 'Élève non trouvé' });
    const invoiceType = VALID_TYPES.includes(type) ? type : 'autre';

    const [last] = await db.execute(
      'SELECT invoice_number FROM invoices WHERE school_id=? ORDER BY id DESC LIMIT 1',
      [req.user.school_id]
    );
    const year = new Date().getFullYear();
    let nextNum = 1;
    if (last.length && last[0].invoice_number) {
      const parts = last[0].invoice_number.split('-');
      nextNum = parseInt(parts[parts.length - 1]) + 1;
    }
    const invNum = `ECO-${year}-${String(nextNum).padStart(4, '0')}`;

    const [result] = await db.execute(
      'INSERT INTO invoices (school_id, student_id, invoice_number, amount, description, due_date, type, created_by) VALUES (?,?,?,?,?,?,?,?)',
      [req.user.school_id, student_id, invNum, numAmount, description, due_date || null, invoiceType, req.user.id]
    );

    // Notification au parent
    const [studentRow] = await db.execute(
      'SELECT parent_id, CONCAT(first_name," ",last_name) as name FROM students WHERE id=?',
      [student_id]
    );
    if (studentRow[0]?.parent_id) {
      const typeLabel = { scolarite: 'Scolarité', transport: 'Transport', cantine: 'Cantine', uniforme: 'Uniforme', activite: 'Activité', autre: 'Autre' }[invoiceType];
      await createNotification({
        user_id: studentRow[0].parent_id,
        school_id: req.user.school_id,
        title: `Nouvelle facture — ${typeLabel}`,
        content: `Montant : ${Number(amount).toLocaleString('fr-FR')} FCFA${due_date ? ` · Échéance : ${new Date(due_date).toLocaleDateString('fr-FR')}` : ''}`,
        type: 'finance',
      });
      await smsNotifyInvoice(
        studentRow[0].parent_id,
        req.user.school_id,
        `Écolio: nouvelle facture ${typeLabel} de ${Number(amount).toLocaleString('fr-FR')} FCFA pour ${studentRow[0].name}.`
      );
    }

    res.status(201).json({ success: true, id: result.insertId, invoice_number: invNum });
  } catch (err) {
    handleError(res, err);
  }
};

exports.markPaid = async (req, res) => {
  try {
    const { payment_method } = req.body;
    await db.execute(
      "UPDATE invoices SET status='paid', payment_method=?, paid_at=NOW() WHERE id=? AND school_id=?",
      [payment_method || 'Espèces', req.params.id, req.user.school_id]
    );

    // Notification au parent
    const [inv] = await db.execute(
      `SELECT i.amount, i.type, s.parent_id, CONCAT(s.first_name,' ',s.last_name) as student_name
       FROM invoices i JOIN students s ON i.student_id=s.id
       WHERE i.id=?`,
      [req.params.id]
    );
    if (inv[0]?.parent_id) {
      await createNotification({
        user_id: inv[0].parent_id,
        school_id: req.user.school_id,
        title: 'Paiement confirmé',
        content: `${Number(inv[0].amount).toLocaleString('fr-FR')} FCFA reçu via ${payment_method || 'Espèces'}`,
        type: 'success',
      });
    }

    res.json({ success: true, message: 'Paiement enregistré' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.update = async (req, res) => {
  try {
    const { amount, description, due_date, status, type } = req.body;
    const invoiceType = VALID_TYPES.includes(type) ? type : 'autre';
    await db.execute(
      'UPDATE invoices SET amount=?,description=?,due_date=?,status=?,type=? WHERE id=? AND school_id=?',
      [amount, description, due_date, status, invoiceType, req.params.id, req.user.school_id]
    );
    res.json({ success: true, message: 'Facture mise à jour' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.cancel = async (req, res) => {
  try {
    await db.execute(
      "UPDATE invoices SET status='cancelled' WHERE id=? AND school_id=?",
      [req.params.id, req.user.school_id]
    );
    res.json({ success: true, message: 'Facture annulée' });
  } catch (err) {
    handleError(res, err);
  }
};
