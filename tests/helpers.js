const request = require('supertest');

async function loginAs(app, email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (!res.body.success) throw new Error(`Login failed for ${email}: ${res.body.message}`);
  return res.body.token;
}

module.exports = { loginAs };
