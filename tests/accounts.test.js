const request = require('supertest');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const app = require('../src/app');
const { loginAs } = require('./helpers');

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));

// Réinitialisation par l'école des mots de passe élève/parent (identifiants perdus).
let conn;
let directorA, directorB, teacherA;
let student; // { id, studentEmail, studentPassword, parentId, parentEmail, parentPassword }

const loginStatus = async (email, password) =>
  (await request(app).post('/api/auth/login').send({ email, password })).body.success;

beforeAll(async () => {
  conn = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, port: process.env.DB_PORT,
  });
  directorA = await loginAs(app, 'director.a@test.local', fixtures.password);
  directorB = await loginAs(app, 'director.b@test.local', fixtures.password);
  teacherA = await loginAs(app, 'teacher.a@test.local', fixtures.password);

  const res = await request(app).post('/api/students').set('Authorization', `Bearer ${directorA}`).send({
    first_name: 'Awa', last_name: 'Reset', gender: 'F', class_id: fixtures.classAId,
    parent_data: { first_name: 'Paul', last_name: 'Reset', email: 'paul.reset@test.local', phone: '0102030405' },
  });
  expect(res.status).toBe(201);
  student = {
    id: res.body.id,
    studentEmail: res.body.credentials.student.email,
    studentPassword: res.body.credentials.student.password,
    parentId: res.body.parent_id,
    parentEmail: res.body.credentials.parent.email,
    parentPassword: res.body.credentials.parent.password,
  };
});

afterAll(async () => {
  await conn.execute('DELETE FROM users WHERE student_id = ? OR id = ?', [student.id, student.parentId]);
  await conn.execute('DELETE FROM students WHERE id = ?', [student.id]);
  await conn.end();
});

test("la liste des élèves expose l'identifiant de connexion du compte élève", async () => {
  const res = await request(app).get(`/api/students/${student.id}`).set('Authorization', `Bearer ${directorA}`);
  expect(res.body.data.student_login_email).toBe(student.studentEmail);
  expect(res.body.data.parent_email).toBe(student.parentEmail);
});

test("le directeur réinitialise le compte élève : l'ancien mot de passe ne marche plus", async () => {
  const res = await request(app).post(`/api/students/${student.id}/reset-password`)
    .set('Authorization', `Bearer ${directorA}`).send({ account: 'student' });
  expect(res.status).toBe(200);
  expect(res.body.credentials.email).toBe(student.studentEmail);
  expect(res.body.credentials.password).not.toBe(student.studentPassword);

  expect(await loginStatus(student.studentEmail, student.studentPassword)).toBe(false);
  expect(await loginStatus(student.studentEmail, res.body.credentials.password)).toBe(true);
  const [[u]] = await conn.execute('SELECT must_change_password FROM users WHERE student_id = ?', [student.id]);
  expect(u.must_change_password).toBe(1);
});

test('le compte parent se réinitialise depuis la fiche élève et depuis la page Parents', async () => {
  const fromStudent = await request(app).post(`/api/students/${student.id}/reset-password`)
    .set('Authorization', `Bearer ${directorA}`).send({ account: 'parent' });
  expect(fromStudent.status).toBe(200);
  expect(fromStudent.body.credentials.email).toBe(student.parentEmail);

  const fromParents = await request(app).post(`/api/students/parents/${student.parentId}/reset-password`)
    .set('Authorization', `Bearer ${directorA}`);
  expect(fromParents.status).toBe(200);
  expect(await loginStatus(student.parentEmail, fromStudent.body.credentials.password)).toBe(false);
  expect(await loginStatus(student.parentEmail, fromParents.body.credentials.password)).toBe(true);
});

test("une autre école ne peut pas réinitialiser ces comptes", async () => {
  const a = await request(app).post(`/api/students/${student.id}/reset-password`)
    .set('Authorization', `Bearer ${directorB}`).send({ account: 'student' });
  const b = await request(app).post(`/api/students/parents/${student.parentId}/reset-password`)
    .set('Authorization', `Bearer ${directorB}`);
  expect(a.status).toBe(404);
  expect(b.status).toBe(404);
});

test('un enseignant (sans students.write) ne peut pas réinitialiser', async () => {
  const res = await request(app).post(`/api/students/${student.id}/reset-password`)
    .set('Authorization', `Bearer ${teacherA}`).send({ account: 'student' });
  expect(res.status).toBe(403);
});

test("la route parent refuse les comptes du personnel", async () => {
  const res = await request(app).post(`/api/students/parents/${fixtures.users.teacherA}/reset-password`)
    .set('Authorization', `Bearer ${directorA}`);
  expect(res.status).toBe(404);
  expect(await loginStatus('teacher.a@test.local', fixtures.password)).toBe(true);
});
