const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const { loginAs } = require('./helpers');

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));

describe('Messagerie école-famille', () => {
  let directorToken, parentToken, teacherToken, toParentsId, toTeacherId;
  const as = (token, req) => req.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    directorToken = await loginAs(app, 'director.a@test.local', fixtures.password);
    parentToken   = await loginAs(app, 'parent.a@test.local', fixtures.password);
    teacherToken  = await loginAs(app, 'teacher.a@test.local', fixtures.password);

    const toParents = await as(directorToken, request(app).post('/api/messages'))
      .send({ recipient_group: 'all_parents', subject: 'Réunion parents', content: 'Réunion vendredi à 17h.' });
    expect(toParents.status).toBe(201);
    toParentsId = toParents.body.id;

    const toTeacher = await as(directorToken, request(app).post('/api/messages'))
      .send({ recipient_ids: [fixtures.users.teacherA], subject: 'Conseil de classe', content: 'Interne au personnel.' });
    expect(toTeacher.status).toBe(201);
    toTeacherId = toTeacher.body.id;
  });

  test('le parent reçoit le message de l\'école et peut le lire', async () => {
    const inbox = await as(parentToken, request(app).get('/api/messages'));
    expect(inbox.status).toBe(200);
    expect(inbox.body.data.map(m => m.id)).toContain(toParentsId);
    const one = await as(parentToken, request(app).get(`/api/messages/${toParentsId}`));
    expect(one.status).toBe(200);
    expect(one.body.data.content).toBe('Réunion vendredi à 17h.');
  });

  test('un message ne peut pas être lu par quelqu\'un qui n\'en est pas destinataire', async () => {
    expect((await as(parentToken, request(app).get(`/api/messages/${toTeacherId}`))).status).toBe(404);
    expect((await as(teacherToken, request(app).get(`/api/messages/${toParentsId}`))).status).toBe(404);
  });

  test('le parent répond, la réponse arrive à l\'expéditeur', async () => {
    const reply = await as(parentToken, request(app).post(`/api/messages/${toParentsId}/reply`))
      .send({ content: 'Je serai présent.' });
    expect(reply.status).toBe(201);
    const thread = await as(directorToken, request(app).get(`/api/messages/${toParentsId}`));
    expect(thread.body.data.replies.map(r => r.content)).toContain('Je serai présent.');
  });

  test('le parent ne peut pas répondre à un message qu\'il n\'a pas reçu', async () => {
    const reply = await as(parentToken, request(app).post(`/api/messages/${toTeacherId}/reply`))
      .send({ content: 'Intrusion' });
    expect(reply.status).toBe(404);
  });

  test('le parent n\'a accès ni à l\'annuaire des destinataires ni à l\'envoi groupé', async () => {
    expect((await as(parentToken, request(app).get('/api/messages/recipients'))).status).toBe(403);
    expect((await as(parentToken, request(app).get('/api/messages/groups'))).status).toBe(403);
    const send = await as(parentToken, request(app).post('/api/messages'))
      .send({ recipient_group: 'all_parents', content: 'Spam' });
    expect(send.status).toBe(403);
  });
});
