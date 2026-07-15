const db = require('../config/database');
const { handleError } = require('../utils/errors');

exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM rooms WHERE school_id=? ORDER BY name', [req.user.school_id]);
    res.json({ success: true, data: rows });
  } catch (err) {
    handleError(res, err);
  }
};
