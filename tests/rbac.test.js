const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const { loginAs } = require('./helpers');

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));

describe('RBAC réel (table role_permissions)', () => {
  let directorToken, accountantToken, secretaryToken, teacherToken, counselorToken;

  beforeAll(async () => {
    directorToken   = await loginAs(app, 'director.a@test.local', fixtures.password);
    accountantToken = await loginAs(app, 'accountant.a@test.local', fixtures.password);
    secretaryToken  = await loginAs(app, 'secretary.a@test.local', fixtures.password);
    teacherToken    = await loginAs(app, 'teacher.a@test.local', fixtures.password);
    counselorToken  = await loginAs(app, 'counselor.a@test.local', fixtures.password);
  });

  test('un comptable a la permission finance.read (liste des factures)', async () => {
    const res = await request(app).get('/api/finance').set('Authorization', `Bearer ${accountantToken}`);
    expect(res.status).toBe(200);
  });

  test('un enseignant n\'a pas la permission finance.read', async () => {
    const res = await request(app).get('/api/finance').set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(403);
  });

  test('un secrétariat a la permission students.write (création élève)', async () => {
    const res = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${secretaryToken}`)
      .send({ first_name: 'Nouveau', last_name: 'Eleve', gender: 'M' });
    expect(res.status).toBe(201);
  });

  test('un secrétariat n\'a pas la permission students.delete', async () => {
    const res = await request(app)
      .delete(`/api/students/${fixtures.studentAId}`)
      .set('Authorization', `Bearer ${secretaryToken}`);
    expect(res.status).toBe(403);
  });

  test('un directeur a la permission students.delete', async () => {
    const res = await request(app)
      .delete(`/api/students/${fixtures.studentAId}`)
      .set('Authorization', `Bearer ${directorToken}`);
    expect(res.status).toBe(200);
  });

  test('un conseiller d\'éducation a la permission attendance.write (réconciliée dans le RBAC réel)', async () => {
    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${counselorToken}`)
      .send({ student_id: fixtures.studentAId, class_id: fixtures.classAId, date: '2026-01-15', status: 'present' });
    expect(res.status).not.toBe(403);
  });

  test('un comptable a la permission staff.read (réconciliation RBAC)', async () => {
    const res = await request(app).get('/api/staff').set('Authorization', `Bearer ${accountantToken}`);
    expect(res.status).toBe(200);
  });
});
