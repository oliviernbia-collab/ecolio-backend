const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const { loginAs } = require('./helpers');

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));

describe('Panneau plateforme (super_admin)', () => {
  test('un directeur ne peut pas accéder au panneau plateforme', async () => {
    const token = await loginAs(app, 'director.a@test.local', fixtures.password);
    const res = await request(app).get('/api/admin/schools').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('suspendre une école bloque immédiatement la connexion de ses utilisateurs', async () => {
    // On suspend directement en base (aucun compte super_admin n'existe dans les fixtures)
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME, port: process.env.DB_PORT,
    });
    await conn.execute('UPDATE schools SET is_active=0 WHERE id=?', [fixtures.schoolBId]);

    const res = await request(app).post('/api/auth/login').send({ email: 'director.b@test.local', password: fixtures.password });
    expect(res.status).toBe(403);

    await conn.execute('UPDATE schools SET is_active=1 WHERE id=?', [fixtures.schoolBId]);
    await conn.end();
  });

  test('un token déjà émis est aussi rejeté après suspension de l\'école (pas seulement le login)', async () => {
    const token = await loginAs(app, 'director.b@test.local', fixtures.password);

    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME, port: process.env.DB_PORT,
    });
    await conn.execute('UPDATE schools SET is_active=0 WHERE id=?', [fixtures.schoolBId]);

    const res = await request(app).get('/api/students').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);

    await conn.execute('UPDATE schools SET is_active=1 WHERE id=?', [fixtures.schoolBId]);
    await conn.end();
  });
});
