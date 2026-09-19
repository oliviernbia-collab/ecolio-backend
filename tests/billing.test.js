const request = require('supertest');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const app = require('../src/app');
const { loginAs } = require('./helpers');

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));

// PNG 1x1 minimal valide, utilisé comme fausse capture d'écran de paiement.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

let conn;
let superAdminToken;

beforeAll(async () => {
  conn = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, port: process.env.DB_PORT,
  });
  const hash = await bcrypt.hash(fixtures.password, 10);
  const [res] = await conn.execute(
    "INSERT INTO users (school_id, first_name, last_name, email, password, role) VALUES (NULL, 'Super', 'Admin', 'superadmin.billing@test.local', ?, 'super_admin')",
    [hash]
  );
  await conn.execute("INSERT IGNORE INTO permissions (code, label, module) VALUES ('subscription.manage', 'x', 'subscription')");
  superAdminToken = await loginAs(app, 'superadmin.billing@test.local', fixtures.password);
  global.__billingSuperAdminId = res.insertId;
});

afterAll(async () => {
  await conn.execute('DELETE FROM users WHERE id = ?', [global.__billingSuperAdminId]);
  await conn.end();
});

async function resetSchoolBSubscription() {
  await conn.execute(
    'UPDATE schools SET trial_ends_at = DATE_ADD(NOW(), INTERVAL 365 DAY), subscription_paid_until = NULL WHERE id = ?',
    [fixtures.schoolBId]
  );
}

describe('Abonnement / essai gratuit / paiement Wave', () => {
  afterEach(resetSchoolBSubscription);

  test('GET /subscription/status reflète un essai en cours', async () => {
    const token = await loginAs(app, 'director.b@test.local', fixtures.password);
    const res = await request(app).get('/api/subscription/status').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.subscription.status).toBe('trial');
    expect(res.body.subscription.active).toBe(true);
  });

  test('essai expiré et aucun paiement validé → routes normales bloquées (402)', async () => {
    const token = await loginAs(app, 'director.b@test.local', fixtures.password);
    await conn.execute('UPDATE schools SET trial_ends_at = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ?', [fixtures.schoolBId]);

    const res = await request(app).get('/api/students').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('SUBSCRIPTION_EXPIRED');
  });

  test('même expiré, /auth/me et /subscription/status restent accessibles', async () => {
    const token = await loginAs(app, 'director.b@test.local', fixtures.password);
    await conn.execute('UPDATE schools SET trial_ends_at = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ?', [fixtures.schoolBId]);

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);

    const status = await request(app).get('/api/subscription/status').set('Authorization', `Bearer ${token}`);
    expect(status.status).toBe(200);
    expect(status.body.subscription.active).toBe(false);
    expect(status.body.subscription.status).toBe('expired');
  });

  test('soumission d\'une preuve de paiement, puis validation par le super-admin débloque l\'école', async () => {
    const token = await loginAs(app, 'director.b@test.local', fixtures.password);
    await conn.execute('UPDATE schools SET trial_ends_at = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ?', [fixtures.schoolBId]);

    const submit = await request(app)
      .post('/api/subscription/payments')
      .set('Authorization', `Bearer ${token}`)
      .field('reference', 'TX-TEST-123')
      .attach('proof', TINY_PNG, 'proof.png');
    expect(submit.status).toBe(201);
    const paymentId = submit.body.id;

    // Toujours bloqué tant que non validé
    const stillBlocked = await request(app).get('/api/students').set('Authorization', `Bearer ${token}`);
    expect(stillBlocked.status).toBe(402);

    const list = await request(app)
      .get('/api/admin/subscription-payments?status=pending')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.some(p => p.id === paymentId)).toBe(true);

    const approve = await request(app)
      .put(`/api/admin/subscription-payments/${paymentId}/approve`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(approve.status).toBe(200);

    const unlocked = await request(app).get('/api/students').set('Authorization', `Bearer ${token}`);
    expect(unlocked.status).toBe(200);
  });

  test('un directeur ne peut pas valider lui-même un paiement (réservé au super-admin)', async () => {
    const token = await loginAs(app, 'director.b@test.local', fixtures.password);
    const res = await request(app)
      .put('/api/admin/subscription-payments/1/approve')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
