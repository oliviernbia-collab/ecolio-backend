const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const db = require('../src/config/database');
const { detectKind, uploadBuffer } = require('../src/services/cloudinaryUpload');

const PASSWORD = 'Secur1tyTest!';
const sessionCookie = (res) => (res.headers['set-cookie'] || []).find(c => c.startsWith('ecolio_session='));

async function createUser(email, { role = 'director', phone = null } = {}) {
  const [[school]] = await db.query("SELECT id FROM schools WHERE name = 'École Test A'");
  const hash = await bcrypt.hash(PASSWORD, 10);
  const [r] = await db.execute(
    'INSERT INTO users (school_id, first_name, last_name, email, password, role, phone) VALUES (?,?,?,?,?,?,?)',
    [role === 'super_admin' ? null : school.id, 'Sec', 'Test', email, hash, role, phone]
  );
  return r.insertId;
}

const login = (email, password = PASSWORD) => request(app).post('/api/auth/login').send({ email, password });

describe('Sécurité des sessions', () => {
  beforeAll(async () => {
    await createUser('session@test.local');
    await createUser('pwchange@test.local');
    await createUser('reset@test.local', { phone: '+225 07 01 02 03 04' });
    await createUser('limited@test.local', { phone: '0700000000' });
    await createUser('root@test.local', { role: 'super_admin', phone: '0711111111' });
  });

  test('la connexion pose un cookie httpOnly SameSite=Lax', async () => {
    const res = await login('session@test.local');
    expect(res.status).toBe(200);
    const cookie = sessionCookie(res);
    expect(cookie).toBeTruthy();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  test('le cookie suffit pour les lectures, mais les écritures exigent X-Requested-With (CSRF)', async () => {
    const cookie = sessionCookie(await login('session@test.local')).split(';')[0];

    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('session@test.local');

    const noHeader = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(noHeader.status).toBe(403);

    const withHeader = await request(app).post('/api/auth/logout').set('Cookie', cookie).set('X-Requested-With', 'XMLHttpRequest');
    expect(withHeader.status).toBe(200);
  });

  test('après déconnexion, le jeton est révoqué', async () => {
    const { token } = (await login('session@test.local')).body;
    const auth = { Authorization: `Bearer ${token}` };
    expect((await request(app).get('/api/auth/me').set(auth)).status).toBe(200);
    expect((await request(app).post('/api/auth/logout').set(auth)).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth)).status).toBe(401);
  });

  test('changer son mot de passe ferme les autres sessions et garde la session courante', async () => {
    const a = (await login('pwchange@test.local')).body.token;
    const b = (await login('pwchange@test.local')).body.token;
    const res = await request(app).put('/api/auth/change-password')
      .set('Authorization', `Bearer ${a}`)
      .send({ current_password: PASSWORD, new_password: 'NouveauMdp2026!' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();

    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${b}`)).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${a}`)).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`)).status).toBe(200);
  });
});

describe('Mot de passe oublié', () => {
  test('le compte super admin ne peut pas être réinitialisé par téléphone', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'root@test.local', phone: '0711111111' });
    expect(res.status).toBe(400);
    expect(res.body.temp_password).toBeUndefined();
  });

  test('limite de 5 demandes par compte et par jour', async () => {
    const [[user]] = await db.query("SELECT id FROM users WHERE email = 'limited@test.local'");
    for (let i = 0; i < 5; i++) {
      await db.execute(
        "INSERT INTO activity_logs (user_id, action, entity_type, description) VALUES (?, 'password_reset_failed', 'auth', 'test')",
        [user.id]
      );
    }
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'limited@test.local', phone: '0700000000' });
    expect(res.status).toBe(429);
  });

  test('une réinitialisation réussie ferme les sessions existantes', async () => {
    const { token } = (await login('reset@test.local')).body;
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'reset@test.local', phone: '0701020304' });
    expect(res.status).toBe(200);
    expect(res.body.temp_password).toHaveLength(10);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    expect((await login('reset@test.local', res.body.temp_password)).status).toBe(200);
  });
});

describe('Vérification du contenu des fichiers envoyés', () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(8)]);
  const fakeJpg = Buffer.from('<script>alert(1)</script> renommé en photo.jpg');

  test('reconnaît les vrais formats et rejette un faux fichier image', () => {
    expect(detectKind(png)).toBe('image');
    expect(detectKind(mp4)).toBe('video');
    expect(detectKind(fakeJpg)).toBeNull();
  });

  test("uploadBuffer refuse un fichier dont le contenu n'est pas une image (400)", async () => {
    await expect(uploadBuffer(fakeJpg, { folder: 'test' })).rejects.toMatchObject({ status: 400, expose: true });
    await expect(uploadBuffer(mp4, { folder: 'test', resourceType: 'image' })).rejects.toMatchObject({ status: 400 });
  });
});
