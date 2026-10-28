const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const db = require('../src/config/database');
const { loginAs } = require('./helpers');

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));

describe('SMS individuel aux élèves (parent en maternelle/primaire, élève au secondaire)', () => {
  let token, ids;
  const as = req => req.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    token = await loginAs(app, 'secretary.a@test.local', fixtures.password);
    const school = fixtures.schoolAId;
    await db.execute("UPDATE users SET phone = '+225 01 00 00 01' WHERE id = ?", [fixtures.users.parentA]);
    const [sec] = await db.execute(
      "INSERT INTO classes (school_id, academic_year_id, name, level, cycle, capacity) VALUES (?, NULL, 'Tle-SMS', 'Tle', 'secondaire', 30)", [school]);
    const mk = async (first, classId, phone) => {
      const [r] = await db.execute(
        "INSERT INTO students (school_id, matricule, first_name, last_name, gender, phone, class_id, parent_id, status) VALUES (?,?,?,'Sms','M',?,?,?,'inscrit')",
        [school, `SMS-${first}`, first, phone, classId, fixtures.users.parentA]);
      return r.insertId;
    };
    ids = {
      primaire: await mk('Primaire', fixtures.classAId, '+225 09 99 99 99'),     // numéro ignoré : primaire → parent
      lyceen: await mk('Lyceen', sec.insertId, '+225 05 55 55 55'),
      lyceenSansNumero: await mk('LyceenSansNum', sec.insertId, null),
    };
  });

  test('la recherche « Élèves » indique à qui part le SMS selon le cycle', async () => {
    const res = await as(request(app).get('/api/sms/recipients')).query({ type: 'student', q: 'Sms' });
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.data.map(s => [s.id, s]));
    expect(byId[ids.primaire]).toMatchObject({ target: 'parent', phone: '+225 01 00 00 01' });
    expect(byId[ids.lyceen]).toMatchObject({ target: 'student', phone: '+225 05 55 55 55' });
    expect(byId[ids.lyceenSansNumero]).toMatchObject({ target: 'parent', own_phone_missing: true });
  });

  test('l\'envoi part au bon numéro et le parent de plusieurs élèves ne reçoit qu\'un SMS', async () => {
    const res = await as(request(app).post('/api/sms')).send({
      student_ids: [ids.primaire, ids.lyceen, ids.lyceenSansNumero],
      recipient_ids: [fixtures.users.parentA],
      content: 'Test cycle',
    });
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(2);
    const [rows] = await db.execute('SELECT phone FROM sms_recipients WHERE sms_log_id = ? ORDER BY phone', [res.body.logId]);
    expect(rows.map(r => r.phone)).toEqual(['+225 01 00 00 01', '+225 05 55 55 55']);
  });

  test('le filtre « Personnel » ne renvoie pas de parents', async () => {
    const res = await as(request(app).get('/api/sms/recipients')).query({ type: 'staff' });
    expect(res.status).toBe(200);
    expect(res.body.data.some(u => u.role === 'parent' || u.role === 'student')).toBe(false);
  });
});
