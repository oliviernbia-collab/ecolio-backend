// Panneau plateforme réservé au rôle super_admin : vue transversale sur TOUTES les
// écoles (pas de filtre school_id, volontairement — c'est la seule vue de l'app qui
// traverse les tenants). Toutes les routes de ce contrôleur exigent authorize('super_admin').
const db = require('../config/database');
const { handleError } = require('../utils/errors');
const { logActivity } = require('../services/activityLog');
const { RENEWAL_DAYS } = require('../services/subscription');

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
        (SELECT COUNT(*) FROM users WHERE is_active = 1) as total_users,
        (SELECT COUNT(*) FROM subscription_payments WHERE status = 'pending') as pending_payments
    `);
    res.json({ success: true, data: stats });
  } catch (err) { handleError(res, err); }
};

exports.setSchoolStatus = async (req, res) => {
  try {
    const { is_active } = req.body;
    const [result] = await db.execute('UPDATE schools SET is_active=? WHERE id=?', [is_active ? 1 : 0, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'École non trouvée' });
    const [[school]] = await db.execute('SELECT name FROM schools WHERE id = ?', [req.params.id]);
    logActivity({
      schoolId: req.params.id, userId: req.user.id, userName: `${req.user.first_name} ${req.user.last_name}`, userRole: req.user.role,
      action: 'status_change', entityType: 'school', entityId: req.params.id,
      description: `${is_active ? 'Réactivation' : 'Suspension'} de l'école ${school?.name || ''} par la plateforme`, ip: req.ip,
    });
    res.json({ success: true, message: is_active ? 'École réactivée' : 'École suspendue' });
  } catch (err) { handleError(res, err); }
};

// GET /admin/subscription-payments — file des preuves de paiement à vérifier (toutes écoles)
exports.getSubscriptionPayments = async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const params = [];
    let where = '';
    if (status !== 'all') { where = 'WHERE sp.status = ?'; params.push(status); }
    const [rows] = await db.execute(
      `SELECT sp.*, s.name as school_name,
              CONCAT(u.first_name, ' ', u.last_name) as submitted_by_name
       FROM subscription_payments sp
       JOIN schools s ON sp.school_id = s.id
       LEFT JOIN users u ON sp.submitted_by = u.id
       ${where}
       ORDER BY sp.submitted_at DESC LIMIT 200`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
};

// PUT /admin/subscription-payments/:id/approve — valide le paiement et prolonge l'abonnement de l'école
exports.approveSubscriptionPayment = async (req, res) => {
  try {
    const [[payment]] = await db.execute('SELECT * FROM subscription_payments WHERE id = ?', [req.params.id]);
    if (!payment) return res.status(404).json({ success: false, message: 'Paiement non trouvé' });
    if (payment.status !== 'pending') return res.status(400).json({ success: false, message: 'Ce paiement a déjà été traité' });

    await db.execute(
      "UPDATE subscription_payments SET status='approved', reviewed_by=?, reviewed_at=NOW() WHERE id=?",
      [req.user.id, req.params.id]
    );
    // Prolonge à partir de la date la plus tardive entre l'abonnement payé en cours, la fin d'essai, ou maintenant —
    // pour ne jamais faire perdre de temps déjà acquis en cas de renouvellement anticipé.
    await db.execute(
      `UPDATE schools
       SET subscription_paid_until = DATE_ADD(GREATEST(COALESCE(subscription_paid_until, trial_ends_at, NOW()), NOW()), INTERVAL ? DAY)
       WHERE id = ?`,
      [RENEWAL_DAYS, payment.school_id]
    );
    const [[school]] = await db.execute('SELECT name, subscription_paid_until FROM schools WHERE id = ?', [payment.school_id]);

    logActivity({
      schoolId: payment.school_id, userId: req.user.id, userName: `${req.user.first_name} ${req.user.last_name}`, userRole: req.user.role,
      action: 'approve', entityType: 'subscription_payment', entityId: payment.id,
      description: `Paiement validé pour ${school?.name || ''} — abonnement actif jusqu'au ${school?.subscription_paid_until ? new Date(school.subscription_paid_until).toLocaleDateString('fr-FR') : '—'}`,
      ip: req.ip,
    });
    res.json({ success: true, message: 'Paiement validé, abonnement activé', paid_until: school?.subscription_paid_until });
  } catch (err) { handleError(res, err); }
};

// GET /admin/users?from=&to=&role=&school_id=&search= — tous les utilisateurs, toutes écoles confondues
exports.getUsers = async (req, res) => {
  try {
    const { from, to, role, school_id, search } = req.query;
    const params = [];
    let where = 'WHERE 1=1';
    if (from)      { where += ' AND u.created_at >= ?'; params.push(from); }
    if (to)        { where += ' AND u.created_at <= ?'; params.push(`${to} 23:59:59`); }
    if (role)      { where += ' AND u.role = ?'; params.push(role); }
    if (school_id) { where += ' AND u.school_id = ?'; params.push(school_id); }
    if (search)    {
      where += ' AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const [rows] = await db.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.phone, u.is_active,
              u.last_login, u.created_at, s.id as school_id, s.name as school_name
       FROM users u
       LEFT JOIN schools s ON u.school_id = s.id
       ${where}
       ORDER BY u.created_at DESC
       LIMIT 500`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
};

// PUT /admin/subscription-payments/:id/reject
exports.rejectSubscriptionPayment = async (req, res) => {
  try {
    const { note } = req.body;
    const [result] = await db.execute(
      "UPDATE subscription_payments SET status='rejected', reviewed_by=?, reviewed_at=NOW(), review_note=? WHERE id=? AND status='pending'",
      [req.user.id, note || null, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Paiement non trouvé ou déjà traité' });
    const [[payment]] = await db.execute('SELECT school_id FROM subscription_payments WHERE id = ?', [req.params.id]);
    logActivity({
      schoolId: payment?.school_id, userId: req.user.id, userName: `${req.user.first_name} ${req.user.last_name}`, userRole: req.user.role,
      action: 'reject', entityType: 'subscription_payment', entityId: req.params.id,
      description: `Paiement rejeté${note ? ` : ${note}` : ''}`, ip: req.ip,
    });
    res.json({ success: true, message: 'Paiement rejeté' });
  } catch (err) { handleError(res, err); }
};
