const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env.test'), override: true });

module.exports = async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
  });
  await conn.query(`DROP DATABASE IF EXISTS \`${process.env.DB_NAME}\``);
  await conn.end();

  const fixturesPath = path.join(__dirname, 'fixtures.json');
  if (fs.existsSync(fixturesPath)) fs.unlinkSync(fixturesPath);
};
