const path = require('path');
const dotenv = require('dotenv');

// Charge .env.test AVANT tout autre module (notamment config/database.js) pour
// que les tests tournent contre une base isolée (ecolio_test), jamais la base réelle.
dotenv.config({ path: path.join(__dirname, '../.env.test'), override: true });
