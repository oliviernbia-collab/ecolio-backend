const db = require('../config/database');

/**
 * Crée une notification pour un utilisateur.
 * @param {object} opts
 * @param {number}  opts.user_id
 * @param {number}  opts.school_id
 * @param {string}  opts.title
 * @param {string}  [opts.content]
 * @param {'info'|'warning'|'success'|'absence'|'grade'|'finance'|'message'} [opts.type]
 */
async function createNotification({ user_id, school_id, title, content = '', type = 'info' }) {
  try {
    await db.execute(
      'INSERT INTO notifications (user_id, school_id, title, content, type) VALUES (?, ?, ?, ?, ?)',
      [user_id, school_id, title, content, type]
    );
  } catch (err) {
    console.error('[notifications]', err.message);
  }
}

/**
 * Notifie le parent d'un élève.
 */
async function notifyParent(studentId, school_id, title, content, type) {
  const [rows] = await db.execute(
    'SELECT parent_id FROM students WHERE id = ? AND parent_id IS NOT NULL',
    [studentId]
  );
  if (rows.length && rows[0].parent_id) {
    await createNotification({ user_id: rows[0].parent_id, school_id, title, content, type });
  }
}

module.exports = { createNotification, notifyParent };
