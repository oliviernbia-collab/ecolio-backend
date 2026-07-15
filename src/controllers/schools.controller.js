const db = require('../config/database');
const { handleError } = require('../utils/errors');

exports.getSchool = async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM schools WHERE id = ?', [req.user.school_id]);
    res.json({ success: true, school: rows[0] || null });
  } catch (err) {
    handleError(res, err);
  }
};

exports.updateSchool = async (req, res) => {
  try {
    const { name, address, city, phone, email, primary_color, secondary_color, is_public } = req.body;
    await db.execute(
      'UPDATE schools SET name=?, address=?, city=?, phone=?, email=?, primary_color=?, secondary_color=?, is_public=? WHERE id=?',
      [name, address, city || null, phone, email, primary_color, secondary_color, is_public ? 1 : 0, req.user.school_id]
    );
    res.json({ success: true, message: 'École mise à jour' });
  } catch (err) {
    handleError(res, err);
  }
};
