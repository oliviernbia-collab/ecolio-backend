const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const { loginAs } = require('./helpers');

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));

// Liste de classe imprimable (PDF) : GET /classes/:id/list/pdf
describe('Liste de classe PDF', () => {
  let directorA, teacherA, directorB, parentA;

  beforeAll(async () => {
    directorA = await loginAs(app, 'director.a@test.local', fixtures.password);
    teacherA = await loginAs(app, 'teacher.a@test.local', fixtures.password);
    directorB = await loginAs(app, 'director.b@test.local', fixtures.password);
    parentA = await loginAs(app, 'parent.a@test.local', fixtures.password);
  });

  const get = (token, classId) => request(app).get(`/api/classes/${classId}/list/pdf`)
    .set('Authorization', `Bearer ${token}`).buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

  test('le directeur et les enseignants de l\'école téléchargent le PDF', async () => {
    for (const token of [directorA, teacherA]) {
      const res = await get(token, fixtures.classAId);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/liste-de-classe-CP-A\.pdf/);
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    }
  });

  test('une autre école ne peut pas obtenir la liste', async () => {
    const res = await get(directorB, fixtures.classAId);
    expect(res.status).toBe(404);
  });

  test('un parent (sans students.read) est refusé', async () => {
    const res = await get(parentA, fixtures.classAId);
    expect(res.status).toBe(403);
  });
});
