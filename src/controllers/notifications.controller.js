const db = require('../config/database');
const { handleError } = require('../utils/errors');

exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    const unread = rows.filter(r => !r.is_read).length;
    res.json({ success: true, data: rows, unread });
  } catch (err) {
    handleError(res, err);
  }
};

exports.markRead = async (req, res) => {
  try {
    await db.execute('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await db.execute('UPDATE notifications SET is_read=1 WHERE user_id=?', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
};
