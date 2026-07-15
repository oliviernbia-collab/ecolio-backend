const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ecolio',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

pool.getConnection()
  .then(conn => {
    console.log('\x1b[32m✅ Connexion MySQL établie\x1b[0m');
    conn.release();
  })
  .catch(err => {
    console.error('\x1b[31m❌ Erreur connexion MySQL:', err.message, '\x1b[0m');
    console.error('Vérifiez que MySQL est démarré et que la base "ecolio" existe.');
    console.error('Exécutez: node src/database/init.js');
  });

module.exports = pool;
