const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const { loginAs } = require('./helpers');

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));

describe('Grades — isolation multi-tenant et validation', () => {
  let teacherAToken, directorBToken, parentAToken;

  beforeAll(async () => {
    teacherAToken = await loginAs(app, 'teacher.a@test.local', fixtures.password);
    directorBToken = await loginAs(app, 'director.b@test.local', fixtures.password);
    parentAToken = await loginAs(app, 'parent.a@test.local', fixtures.password);
  });

  test('un enseignant de l\'école A ne peut pas lire les notes d\'un élève de l\'école B (IDOR)', async () => {
    const res = await request(app)
      .get(`/api/grades/student/${fixtures.studentBId}`)
      .set('Authorization', `Bearer ${teacherAToken}`);
    expect(res.status).toBe(404);
  });

  test('un directeur de l\'école B ne peut pas modifier une note de l\'école A (IDOR)', async () => {
    const res = await request(app)
      .put(`/api/grades/${fixtures.gradeAId}`)
      .set('Authorization', `Bearer ${directorBToken}`)
      .send({ value: 20, max_value: 20, period: 'trimestre1', grade_type: 'devoir' });
    expect(res.status).toBe(404);
  });

  test('un directeur de l\'école B ne peut pas supprimer une note de l\'école A (IDOR)', async () => {
    const res = await request(app)
      .delete(`/api/grades/${fixtures.gradeAId}`)
      .set('Authorization', `Bearer ${directorBToken}`);
    expect(res.status).toBe(404);
  });

  test('un parent (rôle sans permission grades.read côté staff) ne peut pas lister les notes via la route staff', async () => {
    const res = await request(app)
      .get('/api/grades')
      .set('Authorization', `Bearer ${parentAToken}`);
    expect(res.status).toBe(403);
  });

  test('une note hors intervalle [0, barème] est rejetée', async () => {
    const res = await request(app)
      .post('/api/grades')
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ student_id: fixtures.studentAId, subject_id: fixtures.subjectAId, value: 99, max_value: 20, period: 'trimestre1' });
    expect(res.status).toBe(400);
  });

  test('un enseignant de l\'école A peut créer une note valide pour un élève de son école', async () => {
    const res = await request(app)
      .post('/api/grades')
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ student_id: fixtures.studentAId, subject_id: fixtures.subjectAId, value: 14.5, max_value: 20, period: 'trimestre2' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('créer une note pour un élève d\'une autre école est refusé', async () => {
    const res = await request(app)
      .post('/api/grades')
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ student_id: fixtures.studentBId, subject_id: fixtures.subjectAId, value: 10, max_value: 20, period: 'trimestre1' });
    expect(res.status).toBe(404);
  });
});
