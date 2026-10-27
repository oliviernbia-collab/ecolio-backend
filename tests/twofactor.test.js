const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const db = require('../src/config/database');
const totp = require('../src/utils/totp');

const EMAIL = '2fa@test.local';
const PASSWORD = 'DeuxFacteurs2026!';
const codeAt = (secret, offset = 0) => totp.hotp(totp.base32Decode(secret), totp.currentStep() + offset);

describe('Double authentification (TOTP)', () => {
  let session;       // en-tête d'une session ouverte avant l'activation
  let secret;
  let recoveryCodes;

  beforeAll(async () => {
    await db.execute(
      'INSERT INTO users (school_id, first_name, last_name, email, password, role) VALUES (NULL, ?, ?, ?, ?, ?)',
      ['Deux', 'Facteurs', EMAIL, await bcrypt.hash(PASSWORD, 10), 'super_admin']
    );
    const res = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });
    session = { Authorization: `Bearer ${res.body.token}` };
  });

  test("respecte le vecteur de test officiel RFC 6238", () => {
    expect(totp.hotp(Buffer.from('12345678901234567890'), 1, 8)).toBe('94287082');
  });

  test("l'activation exige un premier code valide, puis fournit 10 codes de secours", async () => {
    const setup = await request(app).post('/api/auth/2fa/setup').set(session);
    expect(setup.status).toBe(200);
    expect(setup.body.qr).toMatch(/^data:image\/png;base64,/);
    expect(setup.body.otpauth_uri).toContain('otpauth://totp/');
    secret = setup.body.secret;

    const [[stored]] = await db.query('SELECT totp_secret FROM users WHERE email = ?', [EMAIL]);
    expect(stored.totp_secret).not.toContain(secret); // chiffré en base

    expect((await request(app).post('/api/auth/2fa/enable').set(session).send({ code: '000000' })).status).toBe(400);
    const enable = await request(app).post('/api/auth/2fa/enable').set(session).send({ code: codeAt(secret) });
    expect(enable.status).toBe(200);
    recoveryCodes = enable.body.recovery_codes;
    expect(recoveryCodes).toHaveLength(10);

    const status = await request(app).get('/api/auth/2fa').set(session);
    expect(status.body).toMatchObject({ enabled: true, recovery_codes_remaining: 10 });
  });

  test('le mot de passe seul ne donne plus de session', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.two_factor_required).toBe(true);
    expect(res.body.token).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();

    // Le jeton d'étape ne peut pas servir de session
    const asSession = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.challenge_token}`);
    expect(asSession.status).toBe(401);

    const wrong = await request(app).post('/api/auth/login/2fa').send({ challenge_token: res.body.challenge_token, code: '123456' });
    expect(wrong.status).toBe(401);
  });

  test("la connexion réussit avec le code de l'application, qui ne peut pas être réutilisé", async () => {
    const code = codeAt(secret, 1); // le pas courant a déjà servi à l'activation
    const first = (await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD })).body.challenge_token;
    const ok = await request(app).post('/api/auth/login/2fa').send({ challenge_token: first, code });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    expect(ok.body.user.totp_secret).toBeUndefined();

    const second = (await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD })).body.challenge_token;
    const replay = await request(app).post('/api/auth/login/2fa').send({ challenge_token: second, code });
    expect(replay.status).toBe(401);
  });

  test('un code de secours fonctionne une seule fois', async () => {
    const challenge = () => request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD }).then(r => r.body.challenge_token);
    const code = recoveryCodes[0].toLowerCase(); // casse et tiret indifférents
    expect((await request(app).post('/api/auth/login/2fa').send({ challenge_token: await challenge(), code })).status).toBe(200);
    expect((await request(app).post('/api/auth/login/2fa').send({ challenge_token: await challenge(), code })).status).toBe(401);
  });

  test('la désactivation exige le mot de passe et un code', async () => {
    const noCode = await request(app).post('/api/auth/2fa/disable').set(session).send({ password: PASSWORD, code: '' });
    expect(noCode.status).toBe(400);
    const badPwd = await request(app).post('/api/auth/2fa/disable').set(session).send({ password: 'mauvais', code: recoveryCodes[1] });
    expect(badPwd.status).toBe(400);
    const ok = await request(app).post('/api/auth/2fa/disable').set(session).send({ password: PASSWORD, code: recoveryCodes[1] });
    expect(ok.status).toBe(200);

    const res = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });
    expect(res.body.token).toBeTruthy();
  });
});
