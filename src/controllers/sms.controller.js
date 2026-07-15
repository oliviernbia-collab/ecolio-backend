const db = require('../config/database');
const { GROUP_CONDITIONS, GROUP_LABELS } = require('../utils/recipientGroups');
const { smsProvider } = require('../services/sms/smsProvider');
const { handleError } = require('../utils/errors');

// GET /sms/groups — comptage des destinataires par groupe (uniquement ceux avec un téléphone renseigné)
exports.getGroupCounts = async (req, res) => {
  try {
    const result = [];
    for (const [id, condition] of Object.entries(GROUP_CONDITIONS)) {
      const [rows] = await db.execute(
        `SELECT COUNT(*) as count FROM users
         WHERE school_id = ? AND is_active = 1 AND phone IS NOT NULL AND phone != '' AND ${condition}`,
        [req.user.school_id]
      );
      result.push({ id, label: GROUP_LABELS[id], count: parseInt(rows[0].count) });
    }
    res.json({ success: true, data: result });
  } catch (err) { handleError(res, err); }
};

// GET /sms/recipients?q= — recherche de destinataires individuels (avec téléphone)
exports.getRecipients = async (req, res) => {
  try {
    const { q } = req.query;
    let query = `SELECT id, first_name, last_name, email, role, phone, avatar_url
                 FROM users WHERE school_id = ? AND is_active = 1 AND phone IS NOT NULL AND phone != ''`;
    const params = [req.user.school_id];
    if (q) {
      query += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    query += ' ORDER BY role, last_name LIMIT 40';
    const [rows] = await db.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
};

// GET /sms — historique des envois
exports.getHistory = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT sl.*, CONCAT(u.first_name,' ',u.last_name) as sender_name
       FROM sms_logs sl LEFT JOIN users u ON sl.sender_id = u.id
       WHERE sl.school_id = ? ORDER BY sl.created_at DESC LIMIT 100`,
      [req.user.school_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
};

// GET /sms/:id — détail d'un envoi + destinataires
exports.getOne = async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM sms_logs WHERE id=? AND school_id=?', [req.params.id, req.user.school_id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Envoi non trouvé' });
    const [recipients] = await db.execute(
      `SELECT sr.*, CONCAT(u.first_name,' ',u.last_name) as recipient_name
       FROM sms_recipients sr LEFT JOIN users u ON sr.user_id = u.id
       WHERE sr.sms_log_id = ?`,
      [req.params.id]
    );
    res.json({ success: true, data: { ...rows[0], recipients } });
  } catch (err) { handleError(res, err); }
};

/**
 * Envoie un SMS à un ensemble de destinataires et journalise le résultat.
 * Réutilisable par les déclencheurs automatiques (absence, facture).
 */
async function sendSms({ schoolId, senderId, content, users, recipientGroup, triggerType }) {
  const targets = users.filter(u => u.phone && u.phone.trim() !== '');
  const [logRes] = await db.execute(
    `INSERT INTO sms_logs (school_id, sender_id, recipient_group, trigger_type, content, recipient_count, status)
     VALUES (?,?,?,?,?,?,'pending')`,
    [schoolId, senderId || null, recipientGroup || null, triggerType || 'manuel', content, targets.length]
  );
  const logId = logRes.insertId;

  let sent = 0, failed = 0;
  for (const u of targets) {
    const result = await smsProvider.send(u.phone, content);
    if (result.success) sent++; else failed++;
    await db.execute(
      'INSERT INTO sms_recipients (sms_log_id, user_id, phone, status, error) VALUES (?,?,?,?,?)',
      [logId, u.id || null, u.phone, result.success ? 'sent' : 'failed', result.error || null]
    );
  }
  const status = failed === 0 ? 'sent' : (sent === 0 ? 'failed' : 'partial');
  await db.execute('UPDATE sms_logs SET sent_count=?, failed_count=?, status=? WHERE id=?', [sent, failed, status, logId]);

  return { logId, sent, failed, total: targets.length };
}

// POST /sms — composition manuelle
exports.send = async (req, res) => {
  try {
    const { recipient_ids, recipient_group, content } = req.body;
    if (!content?.trim()) return res.status(400).json({ success: false, message: 'Le contenu du SMS est requis' });

    let users = [];
    if (recipient_group && GROUP_CONDITIONS[recipient_group]) {
      const [rows] = await db.execute(
        `SELECT id, phone FROM users WHERE school_id = ? AND is_active = 1 AND phone IS NOT NULL AND phone != '' AND ${GROUP_CONDITIONS[recipient_group]}`,
        [req.user.school_id]
      );
      users = rows;
    } else if (Array.isArray(recipient_ids) && recipient_ids.length) {
      const placeholders = recipient_ids.map(() => '?').join(',');
      const [rows] = await db.execute(
        `SELECT id, phone FROM users WHERE school_id = ? AND id IN (${placeholders})`,
        [req.user.school_id, ...recipient_ids]
      );
      users = rows;
    }

    if (!users.length) {
      return res.status(400).json({ success: false, message: 'Aucun destinataire avec un numéro de téléphone valide' });
    }

    const result = await sendSms({
      schoolId: req.user.school_id,
      senderId: req.user.id,
      content: content.trim(),
      users,
      recipientGroup: recipient_group || null,
      triggerType: 'manuel',
    });

    res.status(201).json({ success: true, ...result });
  } catch (err) { handleError(res, err); }
};

exports.sendSms = sendSms;
