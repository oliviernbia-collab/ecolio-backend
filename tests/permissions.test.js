const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const { loginAs } = require('./helpers');

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));

describe('Permissions individuelles du personnel (gérées par le directeur)', () => {
  const email = 'perm.teacher.a@test.local';
  let directorToken, directorBToken, secretaryToken, staffId;

  const asDirector = (req) => req.set('Authorization', `Bearer ${directorToken}`);
  const getPerms = () => asDirector(request(app).get(`/api/staff/${staffId}/permissions`));
  const putPerms = (permissions, token = directorToken) =>
    request(app).put(`/api/staff/${staffId}/permissions`).set('Authorization', `Bearer ${token}`).send({ permissions });
  const grantedCodes = (res) => res.body.data.permissions.filter(p => p.granted).map(p => p.code);

  beforeAll(async () => {
    directorToken  = await loginAs(app, 'director.a@test.local', fixtures.password);
    directorBToken = await loginAs(app, 'director.b@test.local', fixtures.password);
    secretaryToken = await loginAs(app, 'secretary.a@test.local', fixtures.password);
    const res = await asDirector(request(app).post('/api/staff')).send({
      first_name: 'Perm', last_name: 'Teacher', email, role: 'teacher', password: fixtures.password, position: 'Enseignant',
    });
    expect(res.status).toBe(201);
    staffId = res.body.id;
  });

  test('sans écart, le membre a exactement les permissions de son rôle', async () => {
    const res = await getPerms();
    expect(res.status).toBe(200);
    expect(res.body.data.editable).toBe(true);
    for (const p of res.body.data.permissions) expect(p.granted).toBe(p.role_default);
    const teacherToken = await loginAs(app, email, fixtures.password);
    expect((await request(app).get('/api/finance').set('Authorization', `Bearer ${teacherToken}`)).status).toBe(403);
  });

  test('le directeur accorde finance.read et retire grades.read : appliqué immédiatement', async () => {
    const current = grantedCodes(await getPerms());
    const res = await putPerms([...current.filter(c => c !== 'grades.read'), 'finance.read']);
    expect(res.status).toBe(200);
    expect(res.body.overrides).toBe(2);

    const login = await request(app).post('/api/auth/login').send({ email, password: fixtures.password });
    expect(login.body.user.permissions).toContain('finance.read');
    expect(login.body.user.permissions).not.toContain('grades.read');
    expect(login.body.user.permissions_granted).toEqual(['finance.read']);
    expect(login.body.user.permissions_revoked).toEqual(['grades.read']);

    const token = login.body.token;
    expect((await request(app).get('/api/finance').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    expect((await request(app).get('/api/grades').set('Authorization', `Bearer ${token}`)).status).toBe(403);
  });

  test('un membre du personnel (même avec staff.write) ne peut pas gérer les permissions', async () => {
    expect((await putPerms(['finance.read'], secretaryToken)).status).toBe(403);
  });

  test("le directeur d'une autre école ne voit pas ce membre", async () => {
    expect((await putPerms([], directorBToken)).status).toBe(404);
  });

  test('une permission inconnue est refusée', async () => {
    expect((await putPerms(['root.everything'])).status).toBe(400);
  });

  test("staff.write accordé ne permet pas de nommer un directeur ni un super administrateur", async () => {
    const current = grantedCodes(await getPerms());
    expect((await putPerms([...current, 'staff.write'])).status).toBe(200);
    const token = await loginAs(app, email, fixtures.password);
    const base = { first_name: 'X', last_name: 'Y', password: fixtures.password };
    const asDirectorRole = await request(app).post('/api/staff').set('Authorization', `Bearer ${token}`)
      .send({ ...base, email: 'perm.escalade1@test.local', role: 'director' });
    expect(asDirectorRole.status).toBe(403);
    const asSuperAdmin = await request(app).post('/api/staff').set('Authorization', `Bearer ${token}`)
      .send({ ...base, email: 'perm.escalade2@test.local', role: 'super_admin' });
    expect(asSuperAdmin.status).toBe(400);
    const promoteSelf = await request(app).put(`/api/staff/${staffId}`).set('Authorization', `Bearer ${token}`)
      .send({ first_name: 'Perm', last_name: 'Teacher', role: 'director' });
    expect(promoteSelf.status).toBe(403);
  });

  test('un changement de rôle efface les écarts individuels', async () => {
    const res = await asDirector(request(app).put(`/api/staff/${staffId}`))
      .send({ first_name: 'Perm', last_name: 'Teacher', phone: null, role: 'accountant', position: 'Comptable', contract_type: 'CDI', hire_date: null, salary: null });
    expect(res.status).toBe(200);
    const perms = await getPerms();
    for (const p of perms.body.data.permissions) expect(p.granted).toBe(p.role_default);
  });
});
