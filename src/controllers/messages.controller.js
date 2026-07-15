const db = require('../config/database');
const { GROUP_CONDITIONS } = require('../utils/recipientGroups');
const { handleError } = require('../utils/errors');

// Détecte une seule fois si la colonne parent_message_id existe
let _threadingReady = null;

// Auto-migration : ajoute parent_message_id si elle n'existe pas encore
;(async () => {
  try {
    const [cols] = await db.execute(
      "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages' AND COLUMN_NAME = 'parent_message_id'"
    );
    if (!cols.length) {
      await db.execute('ALTER TABLE messages ADD COLUMN parent_message_id INT NULL DEFAULT NULL AFTER content');
      try {
        await db.execute('ALTER TABLE messages ADD CONSTRAINT fk_messages_parent FOREIGN KEY (parent_message_id) REFERENCES messages(id) ON DELETE SET NULL');
      } catch {} // ignore si contrainte déjà en place
      console.log('[Messages] Colonne parent_message_id ajoutée');
      _threadingReady = true;
    }
  } catch (e) {
    console.error('[Messages] Erreur auto-migration:', e.message);
  }
})();

async function hasThreading() {
  if (_threadingReady !== null) return _threadingReady;
  try {
    const [rows] = await db.execute(
      "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages' AND COLUMN_NAME = 'parent_message_id'"
    );
    _threadingReady = rows.length > 0;
  } catch { _threadingReady = false; }
  return _threadingReady;
}

// GET /messages/groups
exports.getGroupCounts = async (req, res) => {
  try {
    const defs = [
      { id: 'all_teachers', label: 'Tous les enseignants' },
      { id: 'all_parents',  label: 'Tous les parents' },
      { id: 'all_students', label: 'Tous les élèves' },
      { id: 'all_staff',    label: 'Tout le personnel' },
      { id: 'all_school',   label: "Toute l'école" },
    ];
    const result = [];
    for (const g of defs) {
      const [rows] = await db.execute(
        `SELECT COUNT(*) as count FROM users WHERE school_id = ? AND is_active = 1 AND ${GROUP_CONDITIONS[g.id]}`,
        [req.user.school_id]
      );
      result.push({ ...g, count: parseInt(rows[0].count) });
    }
    res.json({ success: true, data: result });
  } catch (err) { handleError(res, err); }
};

// GET /messages/recipients?q=
exports.getRecipients = async (req, res) => {
  try {
    const { q } = req.query;
    let query = `SELECT id, first_name, last_name, email, role, avatar_url
                 FROM users WHERE school_id = ? AND id != ? AND is_active = 1`;
    const params = [req.user.school_id, req.user.id];
    if (q) {
      query += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    query += ' ORDER BY role, last_name LIMIT 40';
    const [rows] = await db.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
};

// GET /messages — boîte de réception
exports.getInbox = async (req, res) => {
  try {
    const threading = await hasThreading();

    const replyCountExpr = threading
      ? `(SELECT COUNT(*) FROM messages r WHERE r.parent_message_id = m.id
           AND (r.sender_id = ? OR EXISTS(
             SELECT 1 FROM message_recipients mr2 WHERE mr2.message_id = r.id AND mr2.recipient_id = ?
           ))) as reply_count,`
      : '0 as reply_count,';

    const parentFilter = threading ? 'AND m.parent_message_id IS NULL' : '';

    const params = threading
      ? [req.user.id, req.user.id, req.user.id, req.user.school_id]
      : [req.user.id, req.user.school_id];

    const [rows] = await db.execute(
      `SELECT m.id, m.subject, m.content, m.created_at, mr.read_at,
              CONCAT(u.first_name,' ',u.last_name) as sender_name,
              u.role as sender_role, u.avatar_url as sender_avatar,
              ${replyCountExpr}
              NULL as parent_message_id
       FROM messages m
       JOIN message_recipients mr ON m.id = mr.message_id
       JOIN users u ON m.sender_id = u.id
       WHERE mr.recipient_id = ? AND m.school_id = ? ${parentFilter}
       ORDER BY m.created_at DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
};

// GET /messages/sent
exports.getSent = async (req, res) => {
  try {
    const threading = await hasThreading();
    const parentFilter = threading ? 'AND m.parent_message_id IS NULL' : '';

    const replyCols = threading
      ? `(SELECT COUNT(*) FROM messages r WHERE r.parent_message_id = m.id AND r.school_id = m.school_id) as reply_count,
         (SELECT COUNT(*) FROM messages r
          JOIN message_recipients rr ON r.id = rr.message_id
          WHERE r.parent_message_id = m.id AND r.school_id = m.school_id
            AND rr.recipient_id = ? AND rr.read_at IS NULL) as unread_reply_count,`
      : '0 as reply_count, 0 as unread_reply_count,';

    const params = threading
      ? [req.user.id, req.user.id, req.user.school_id]
      : [req.user.id, req.user.school_id];

    const [rows] = await db.execute(
      `SELECT m.id, m.subject, m.content, m.created_at,
              COUNT(DISTINCT mr.recipient_id) as recipient_count,
              SUM(mr.read_at IS NOT NULL) as read_count,
              ${replyCols}
              CONCAT(u.first_name,' ',u.last_name) as sender_name,
              u.role as sender_role, u.avatar_url as sender_avatar
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       LEFT JOIN message_recipients mr ON m.id = mr.message_id
       WHERE m.sender_id = ? AND m.school_id = ? ${parentFilter}
       GROUP BY m.id
       ORDER BY m.created_at DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
};

// GET /messages/:id — message + fil de réponses
exports.getOne = async (req, res) => {
  try {
    const threading = await hasThreading();

    const [rows] = await db.execute(
      `SELECT m.*, CONCAT(u.first_name,' ',u.last_name) as sender_name,
              u.role as sender_role, u.avatar_url as sender_avatar
       FROM messages m JOIN users u ON m.sender_id = u.id
       WHERE m.id = ? AND m.school_id = ?`,
      [req.params.id, req.user.school_id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Message non trouvé' });

    await db.execute(
      'UPDATE message_recipients SET read_at = NOW() WHERE message_id = ? AND recipient_id = ? AND read_at IS NULL',
      [req.params.id, req.user.id]
    );

    let replies = [];
    if (threading) {
      const [replyRows] = await db.execute(
        `SELECT m.*, CONCAT(u.first_name,' ',u.last_name) as sender_name,
                u.role as sender_role, u.avatar_url as sender_avatar
         FROM messages m JOIN users u ON m.sender_id = u.id
         WHERE m.parent_message_id = ? AND m.school_id = ?
           AND (m.sender_id = ?
                OR EXISTS(SELECT 1 FROM message_recipients mr WHERE mr.message_id = m.id AND mr.recipient_id = ?))
         ORDER BY m.created_at ASC`,
        [req.params.id, req.user.school_id, req.user.id, req.user.id]
      );
      replies = replyRows;
    }

    res.json({ success: true, data: { ...rows[0], replies } });
  } catch (err) { handleError(res, err); }
};

// POST /messages — envoi (directeur / super_admin)
exports.send = async (req, res) => {
  try {
    const { recipient_ids, recipient_group, subject, content } = req.body;
    if (!content?.trim()) return res.status(400).json({ success: false, message: 'Le contenu du message est requis' });

    let finalIds = Array.isArray(recipient_ids) ? [...recipient_ids.map(Number)] : [];

    if (recipient_group && GROUP_CONDITIONS[recipient_group]) {
      const [rows] = await db.execute(
        `SELECT id FROM users WHERE school_id = ? AND is_active = 1 AND ${GROUP_CONDITIONS[recipient_group]}`,
        [req.user.school_id]
      );
      finalIds = rows.map(r => r.id);
    }

    finalIds = [...new Set(finalIds)].filter(id => id !== req.user.id);
    if (!finalIds.length) {
      return res.status(400).json({ success: false, message: 'Aucun destinataire valide trouvé' });
    }

    const [msgRes] = await db.execute(
      'INSERT INTO messages (school_id, sender_id, subject, content) VALUES (?,?,?,?)',
      [req.user.school_id, req.user.id, subject?.trim() || null, content.trim()]
    );
    const msgId = msgRes.insertId;
    for (const rid of finalIds) {
      await db.execute('INSERT INTO message_recipients (message_id, recipient_id) VALUES (?,?)', [msgId, rid]);
    }
    res.status(201).json({ success: true, id: msgId, recipient_count: finalIds.length });
  } catch (err) { handleError(res, err); }
};

// POST /messages/:id/reply — réponse (enseignants uniquement)
exports.reply = async (req, res) => {
  try {
    const { role } = req.user;
    if (!['teacher', 'director', 'super_admin', 'secretary'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Seuls les enseignants peuvent répondre aux messages' });
    }

    const threading = await hasThreading();
    if (!threading) {
      return res.status(503).json({ success: false, message: 'Exécutez migration_v3.sql pour activer les réponses' });
    }

    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ success: false, message: 'La réponse est requise' });

    const parentId = parseInt(req.params.id);
    const [orig] = await db.execute(
      'SELECT * FROM messages WHERE id = ? AND school_id = ?',
      [parentId, req.user.school_id]
    );
    if (!orig.length) return res.status(404).json({ success: false, message: 'Message original non trouvé' });

    const subject = orig[0].subject ? `Re : ${orig[0].subject}` : 'Re :';
    const [msgRes] = await db.execute(
      'INSERT INTO messages (school_id, sender_id, subject, content, parent_message_id) VALUES (?,?,?,?,?)',
      [req.user.school_id, req.user.id, subject, content.trim(), parentId]
    );
    await db.execute(
      'INSERT INTO message_recipients (message_id, recipient_id) VALUES (?,?)',
      [msgRes.insertId, orig[0].sender_id]
    );

    res.status(201).json({ success: true, id: msgRes.insertId });
  } catch (err) { handleError(res, err); }
};

exports.markRead = async (req, res) => {
  try {
    await db.execute(
      'UPDATE message_recipients SET read_at = NOW() WHERE message_id = ? AND recipient_id = ?',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
};
