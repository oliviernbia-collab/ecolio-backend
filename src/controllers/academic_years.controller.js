const db = require('../config/database');
const { handleError } = require('../utils/errors');

exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT ay.*,
              (SELECT COUNT(*) FROM classes c WHERE c.academic_year_id = ay.id AND c.school_id = ay.school_id) as class_count,
              (SELECT COUNT(*) FROM students s WHERE s.academic_year_id = ay.id AND s.school_id = ay.school_id) as student_count
       FROM academic_years ay
       WHERE ay.school_id = ?
       ORDER BY ay.start_date DESC`,
      [req.user.school_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getOne = async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM academic_years WHERE id = ? AND school_id = ?',
      [req.params.id, req.user.school_id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Année scolaire non trouvée' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    handleError(res, err);
  }
};

exports.create = async (req, res) => {
  try {
    const { name, start_date, end_date, is_current } = req.body;
    if (!name || !start_date || !end_date) {
      return res.status(400).json({ success: false, message: 'Nom, date de début et date de fin sont requis' });
    }
    if (is_current) {
      await db.execute(
        'UPDATE academic_years SET is_current = 0 WHERE school_id = ?',
        [req.user.school_id]
      );
    }
    const [result] = await db.execute(
      'INSERT INTO academic_years (school_id, name, start_date, end_date, is_current) VALUES (?, ?, ?, ?, ?)',
      [req.user.school_id, name, start_date, end_date, is_current ? 1 : 0]
    );
    res.status(201).json({ success: true, id: result.insertId, message: 'Année scolaire créée' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.update = async (req, res) => {
  try {
    const { name, start_date, end_date, is_current } = req.body;
    if (is_current) {
      await db.execute(
        'UPDATE academic_years SET is_current = 0 WHERE school_id = ? AND id != ?',
        [req.user.school_id, req.params.id]
      );
    }
    await db.execute(
      'UPDATE academic_years SET name = ?, start_date = ?, end_date = ?, is_current = ? WHERE id = ? AND school_id = ?',
      [name, start_date, end_date, is_current ? 1 : 0, req.params.id, req.user.school_id]
    );
    res.json({ success: true, message: 'Année scolaire mise à jour' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.setCurrent = async (req, res) => {
  try {
    await db.execute(
      'UPDATE academic_years SET is_current = 0 WHERE school_id = ?',
      [req.user.school_id]
    );
    await db.execute(
      'UPDATE academic_years SET is_current = 1 WHERE id = ? AND school_id = ?',
      [req.params.id, req.user.school_id]
    );
    res.json({ success: true, message: 'Année active définie' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.close = async (req, res) => {
  try {
    await db.execute(
      "UPDATE academic_years SET is_current = 0 WHERE id = ? AND school_id = ?",
      [req.params.id, req.user.school_id]
    );
    res.json({ success: true, message: 'Année scolaire clôturée' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.remove = async (req, res) => {
  try {
    const [year] = await db.execute(
      'SELECT is_current FROM academic_years WHERE id = ? AND school_id = ?',
      [req.params.id, req.user.school_id]
    );
    if (!year.length) return res.status(404).json({ success: false, message: 'Année non trouvée' });
    if (year[0].is_current) return res.status(400).json({ success: false, message: 'Impossible de supprimer l\'année active' });
    await db.execute('DELETE FROM academic_years WHERE id = ? AND school_id = ?', [req.params.id, req.user.school_id]);
    res.json({ success: true, message: 'Année scolaire supprimée' });
  } catch (err) {
    handleError(res, err);
  }
};
