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

// Filtre « type » de la recherche individuelle → groupe de destinataires correspondant
const RECIPIENT_TYPES = { parent: 'all_parents', staff: 'all_staff' };

// Élèves joignables par SMS : maternelle et primaire → numéro du parent ; secondaire → numéro
// de l'élève s'il est renseigné, sinon celui du parent. Sans aucun numéro, l'élève n'est pas proposé.
const STUDENT_TARGET_QUERY = `
  SELECT s.id, s.first_name, s.last_name, s.matricule, s.phone AS student_phone,
         c.name AS class_name, c.cycle,
         p.id AS parent_user_id, CONCAT(p.first_name, ' ', p.last_name) AS parent_name, p.phone AS parent_phone
  FROM students s
  LEFT JOIN classes c ON c.id = s.class_id
  LEFT JOIN users p ON p.id = s.parent_id AND p.is_active = 1
  WHERE s.school_id = ? AND s.status != 'archive'`;

function resolveStudentTarget(s) {
  const has = v => v && v.trim() !== '';
  if (s.cycle === 'secondaire' && has(s.student_phone)) {
    return { target: 'student', phone: s.student_phone.trim(), user_id: null };
  }
  if (has(s.parent_phone)) return { target: 'parent', phone: s.parent_phone.trim(), user_id: s.parent_user_id };
  return null;
}

async function searchStudents(schoolId, q) {
  let query = STUDENT_TARGET_QUERY;
  const params = [schoolId];
  if (q) {
    query += ' AND (s.first_name LIKE ? OR s.last_name LIKE ? OR s.matricule LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  query += ' ORDER BY s.last_name, s.first_name LIMIT 60';
  const [rows] = await db.execute(query, params);
  return rows.map(s => ({ s, t: resolveStudentTarget(s) })).filter(x => x.t).slice(0, 40).map(({ s, t }) => ({
    id: s.id, kind: 'student', first_name: s.first_name, last_name: s.last_name, matricule: s.matricule,
    class_name: s.class_name, cycle: s.cycle, target: t.target, phone: t.phone,
    parent_name: t.target === 'parent' ? s.parent_name : null,
    // Élève du secondaire sans numéro : le SMS part au parent, à signaler dans la liste
    own_phone_missing: s.cycle === 'secondaire' && t.target === 'parent',
  }));
}

// GET /sms/recipients?q=&type=student|parent|staff — recherche de destinataires individuels (avec téléphone)
exports.getRecipients = async (req, res) => {
  try {
    const { q, type } = req.query;
    if (type === 'student') return res.json({ success: true, data: await searchStudents(req.user.school_id, q) });
    let query = `SELECT id, first_name, last_name, email, role, phone, avatar_url
                 FROM users WHERE school_id = ? AND is_active = 1 AND phone IS NOT NULL AND phone != ''`;
    const params = [req.user.school_id];
    if (type) {
      if (!RECIPIENT_TYPES[type]) return res.status(400).json({ success: false, message: 'Type de destinataire invalide' });
      query += ` AND ${GROUP_CONDITIONS[RECIPIENT_TYPES[type]]}`;
    }
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
    const { recipient_ids, student_ids, recipient_group, content } = req.body;
    if (!content?.trim()) return res.status(400).json({ success: false, message: 'Le contenu du SMS est requis' });

    let users = [];
    if (recipient_group && GROUP_CONDITIONS[recipient_group]) {
      const [rows] = await db.execute(
        `SELECT id, phone FROM users WHERE school_id = ? AND is_active = 1 AND phone IS NOT NULL AND phone != '' AND ${GROUP_CONDITIONS[recipient_group]}`,
        [req.user.school_id]
      );
      users = rows;
    } else {
      if (Array.isArray(recipient_ids) && recipient_ids.length) {
        const placeholders = recipient_ids.map(() => '?').join(',');
        const [rows] = await db.execute(
          `SELECT id, phone FROM users WHERE school_id = ? AND id IN (${placeholders})`,
          [req.user.school_id, ...recipient_ids]
        );
        users = rows;
      }
      // Élèves choisis : SMS à l'élève (secondaire avec numéro) ou à son parent
      if (Array.isArray(student_ids) && student_ids.length) {
        const placeholders = student_ids.map(() => '?').join(',');
        const [rows] = await db.execute(`${STUDENT_TARGET_QUERY} AND s.id IN (${placeholders})`, [req.user.school_id, ...student_ids]);
        for (const s of rows) {
          const t = resolveStudentTarget(s);
          if (t) users.push({ id: t.user_id, phone: t.phone });
        }
      }
      // Un même numéro (parent de plusieurs élèves choisis, ou choisi aussi comme parent) ne reçoit qu'un SMS
      const seen = new Set();
      users = users.filter(u => {
        const key = (u.phone || '').replace(/\s+/g, '');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
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
