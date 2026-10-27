// Panneau plateforme réservé au rôle super_admin : vue transversale sur TOUTES les
// écoles (pas de filtre school_id, volontairement — c'est la seule vue de l'app qui
// traverse les tenants). Toutes les routes de ce contrôleur exigent authorize('super_admin').
const db = require('../config/database');
const { handleError } = require('../utils/errors');
const { logActivity } = require('../services/activityLog');
const { RENEWAL_DAYS, getSubscriptionState } = require('../services/subscription');
const platform = require('../services/platform');
const { createNotification } = require('../utils/notifications');

exports.getSchools = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT s.id, s.name, s.city, s.email, s.phone, s.is_public, s.is_active, s.created_at,
             s.trial_ends_at, s.subscription_paid_until,
             (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id AND st.status != 'archive') as student_count,
             (SELECT COUNT(*) FROM users u WHERE u.school_id = s.id AND u.is_active = 1) as user_count,
             (SELECT COUNT(*) FROM staff sf WHERE sf.school_id = s.id AND sf.is_active = 1) as staff_count
      FROM schools s
      ORDER BY s.created_at DESC
    `);
    res.json({ success: true, data: rows.map(r => ({ ...r, subscription: getSubscriptionState(r) })) });
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
              CONCAT(u.first_name, ' ', u.last_name) as submitted_by_name,
              CONCAT(r.first_name, ' ', r.last_name) as reviewed_by_name
       FROM subscription_payments sp
       JOIN schools s ON sp.school_id = s.id
       LEFT JOIN users u ON sp.submitted_by = u.id
       LEFT JOIN users r ON sp.reviewed_by = r.id
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

const actor = (req) => ({
  userId: req.user.id, userName: `${req.user.first_name} ${req.user.last_name}`, userRole: req.user.role, ip: req.ip,
});

// ── Réglages de la plateforme (Paramètres > Plateforme) ────────────────────────

// GET /admin/settings
exports.getSettings = async (req, res) => {
  try {
    res.json({ success: true, data: await platform.getSettings() });
  } catch (err) { handleError(res, err); }
};

// PUT /admin/settings — { subscription_price?, announcement_text?, announcement_active? }
exports.updateSettings = async (req, res) => {
  try {
    const { subscription_price, announcement_text, announcement_active } = req.body;
    const changes = [];
    if (subscription_price !== undefined) {
      const price = Math.round(Number(subscription_price));
      if (!Number.isFinite(price) || price < 100 || price > 10000000) {
        return res.status(400).json({ success: false, message: "Montant d'abonnement invalide (minimum 100 FCFA)" });
      }
      await platform.setSetting('subscription_price', price);
      changes.push(`prix de l'abonnement : ${price.toLocaleString('fr-FR')} FCFA`);
    }
    if (announcement_text !== undefined) {
      const text = String(announcement_text).trim();
      if (text.length > 500) return res.status(400).json({ success: false, message: 'Message trop long (500 caractères max.)' });
      await platform.setSetting('announcement_text', text);
      changes.push('message défilant modifié');
    }
    if (announcement_active !== undefined) {
      await platform.setSetting('announcement_active', announcement_active ? 1 : 0);
      changes.push(`message défilant ${announcement_active ? 'activé' : 'désactivé'}`);
    }
    logActivity({ ...actor(req), action: 'update', entityType: 'platform_settings', description: `Réglages plateforme — ${changes.join(', ') || 'aucun changement'}` });
    res.json({ success: true, message: 'Réglages enregistrés', data: await platform.getSettings() });
  } catch (err) { handleError(res, err); }
};

// ── Cadeaux aux clients fidèles (Paramètres > Cadeaux) ──────────────────────────

// GET /admin/loyalty — écoles avec leur ancienneté et leur historique de paiement, pour repérer les plus fidèles
exports.getLoyalty = async (req, res) => {
  try {
    await platform.ready;
    const [rows] = await db.execute(`
      SELECT s.id, s.name, s.city, s.created_at, s.is_active, s.trial_ends_at, s.subscription_paid_until,
             (SELECT COUNT(*) FROM subscription_payments sp WHERE sp.school_id = s.id AND sp.status = 'approved') as paid_months,
             (SELECT COALESCE(SUM(sp.amount), 0) FROM subscription_payments sp WHERE sp.school_id = s.id AND sp.status = 'approved') as total_paid,
             (SELECT COALESCE(SUM(g.days), 0) FROM subscription_gifts g WHERE g.school_id = s.id) as gifted_days
      FROM schools s
      ORDER BY paid_months DESC, s.created_at ASC
    `);
    res.json({
      success: true,
      data: rows.map(r => ({ ...r, total_paid: Number(r.total_paid), gifted_days: Number(r.gifted_days), subscription: getSubscriptionState(r) })),
    });
  } catch (err) { handleError(res, err); }
};

// GET /admin/gifts — historique des cadeaux offerts
exports.getGifts = async (req, res) => {
  try {
    await platform.ready;
    const [rows] = await db.execute(`
      SELECT g.*, s.name as school_name, CONCAT(u.first_name, ' ', u.last_name) as granted_by_name
      FROM subscription_gifts g
      JOIN schools s ON g.school_id = s.id
      LEFT JOIN users u ON g.granted_by = u.id
      ORDER BY g.created_at DESC LIMIT 200
    `);
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
};

// POST /admin/schools/:id/gift — { days, message } : offre des jours d'abonnement gratuits à une école
exports.giftSubscription = async (req, res) => {
  try {
    await platform.ready;
    const days = parseInt(req.body.days, 10);
    const message = String(req.body.message || '').trim().slice(0, 1000);
    if (!Number.isInteger(days) || days < 1 || days > 366) {
      return res.status(400).json({ success: false, message: 'Nombre de jours invalide (entre 1 et 366)' });
    }
    // Même logique que la validation d'un paiement : on prolonge à partir de la date la plus
    // tardive (abonnement en cours, fin d'essai ou maintenant) pour ne rien faire perdre à l'école.
    const [result] = await db.execute(
      `UPDATE schools
       SET subscription_paid_until = DATE_ADD(GREATEST(COALESCE(subscription_paid_until, trial_ends_at, NOW()), NOW()), INTERVAL ? DAY)
       WHERE id = ?`,
      [days, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'École non trouvée' });
    const [[school]] = await db.execute('SELECT name, subscription_paid_until FROM schools WHERE id = ?', [req.params.id]);
    await db.execute(
      'INSERT INTO subscription_gifts (school_id, days, message, granted_by, paid_until_after) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, days, message || null, req.user.id, school.subscription_paid_until]
    );

    const until = new Date(school.subscription_paid_until).toLocaleDateString('fr-FR');
    const [directors] = await db.execute(
      "SELECT id FROM users WHERE school_id = ? AND role = 'director' AND is_active = 1", [req.params.id]
    );
    for (const d of directors) {
      await createNotification({
        user_id: d.id, school_id: Number(req.params.id), type: 'success',
        title: `🎁 Écolio vous offre ${days} jour${days > 1 ? 's' : ''} d'abonnement`,
        content: `${message ? `${message}\n\n` : ''}Votre abonnement est maintenant actif jusqu'au ${until}.`,
      });
    }

    logActivity({
      ...actor(req), schoolId: req.params.id, action: 'gift', entityType: 'subscription_gift',
      description: `Cadeau de ${days} jour(s) d'abonnement offert à ${school.name} — actif jusqu'au ${until}`,
    });
    res.json({ success: true, message: `${days} jour(s) offert(s) à ${school.name}`, paid_until: school.subscription_paid_until });
  } catch (err) { handleError(res, err); }
};

// ── Messages de contact (Paramètres > Messages) ─────────────────────────────────

// GET /admin/contact-messages?status=
exports.getContactMessages = async (req, res) => {
  try {
    await platform.ready;
    const { status } = req.query;
    const params = [];
    let where = '';
    if (status && status !== 'all') { where = 'WHERE c.status = ?'; params.push(status); }
    const [rows] = await db.execute(
      `SELECT c.*, s.name as school_name, CONCAT(r.first_name, ' ', r.last_name) as replied_by_name
       FROM contact_messages c
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN schools s ON u.school_id = s.id
       LEFT JOIN users r ON c.replied_by = r.id
       ${where}
       ORDER BY c.created_at DESC LIMIT 300`,
      params
    );
    const [[{ unread }]] = await db.execute("SELECT COUNT(*) as unread FROM contact_messages WHERE status = 'new'");
    res.json({ success: true, data: rows, unread });
  } catch (err) { handleError(res, err); }
};

// PUT /admin/contact-messages/:id/read
exports.markContactMessageRead = async (req, res) => {
  try {
    await db.execute("UPDATE contact_messages SET status = 'read' WHERE id = ? AND status = 'new'", [req.params.id]);
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
};

// PUT /admin/contact-messages/:id/reply — { reply }
exports.replyContactMessage = async (req, res) => {
  try {
    const reply = String(req.body.reply || '').trim();
    if (!reply) return res.status(400).json({ success: false, message: 'La réponse ne peut pas être vide' });
    if (reply.length > 5000) return res.status(400).json({ success: false, message: 'Réponse trop longue (5000 caractères max.)' });
    const [[msg]] = await db.execute('SELECT * FROM contact_messages WHERE id = ?', [req.params.id]);
    if (!msg) return res.status(404).json({ success: false, message: 'Message non trouvé' });

    await db.execute(
      "UPDATE contact_messages SET reply = ?, replied_by = ?, replied_at = NOW(), status = 'replied' WHERE id = ?",
      [reply, req.user.id, msg.id]
    );
    // L'expéditeur a un compte : il est prévenu par une notification dans l'application.
    // Sinon il consulte la réponse sur la page Contact avec son email et sa référence.
    if (msg.user_id) {
      const [[sender]] = await db.execute('SELECT school_id FROM users WHERE id = ?', [msg.user_id]);
      if (sender) {
        await createNotification({
          user_id: msg.user_id, school_id: sender.school_id, type: 'message',
          title: `Réponse d'Écolio à votre message ${msg.reference}`,
          content: reply.slice(0, 500),
        });
      }
    }
    logActivity({ ...actor(req), action: 'reply', entityType: 'contact_message', entityId: msg.id, description: `Réponse au message de contact ${msg.reference} (${msg.email})` });
    res.json({ success: true, message: 'Réponse envoyée' });
  } catch (err) { handleError(res, err); }
};
