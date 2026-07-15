const db = require('../config/database');
const { handleError } = require('../utils/errors');

// GET /public/schools?city= — écoles ayant activé la visibilité publique
exports.getSchools = async (req, res) => {
  try {
    const { city } = req.query;
    let query = 'SELECT id, name, city, logo_url, primary_color FROM schools WHERE is_public=1';
    const params = [];
    if (city) { query += ' AND city=?'; params.push(city); }
    query += ' ORDER BY name';
    const [rows] = await db.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    handleError(res, err);
  }
};

// GET /public/cities — villes distinctes des écoles publiques (pour le filtre)
exports.getCities = async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT DISTINCT city FROM schools WHERE is_public=1 AND city IS NOT NULL AND city != '' ORDER BY city"
    );
    res.json({ success: true, data: rows.map(r => r.city) });
  } catch (err) {
    handleError(res, err);
  }
};
