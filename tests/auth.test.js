const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));

describe('Auth', () => {
  test('login refuse un email invalide (validation)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email', password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('login refuse un mauvais mot de passe', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'director.a@test.local', password: 'wrongpass' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('login réussit avec les bons identifiants et renvoie un token', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'director.a@test.local', password: fixtures.password });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.password).toBeUndefined();
  });

  test('register refuse un mot de passe trop court (validation)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      school: { name: 'École Courte' },
      admin: { email: 'short@test.local', password: 'short', first_name: 'A', last_name: 'B' },
    });
    expect(res.status).toBe(400);
  });

  test('une route protégée refuse une requête sans token', async () => {
    const res = await request(app).get('/api/students');
    expect(res.status).toBe(401);
  });
});
