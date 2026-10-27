// Codes à usage unique basés sur le temps (TOTP, RFC 6238) : HMAC-SHA1, pas de 30 s, 6 chiffres,
// compatibles avec Google Authenticator, Microsoft Authenticator, Authy, etc.
// Le secret est chiffré en base (AES-256-GCM) avec une clé dérivée de TOTP_ENCRYPTION_KEY,
// ou à défaut de JWT_SECRET : une fuite de la base seule ne suffit pas à générer des codes.
const crypto = require('crypto');

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = str.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error('Secret base32 invalide');
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secretBuf, counter, digits = DIGITS) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuf).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

// Vérifie un code en tolérant ±1 pas (décalage d'horloge du téléphone). Renvoie le pas accepté,
// ou null. `lastStep` empêche de rejouer un code déjà utilisé.
function verifyCode(secretBase32, code, { lastStep = null, now = Date.now() } = {}) {
  const clean = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const secret = base32Decode(secretBase32);
  const step = currentStep(now);
  for (const s of [step - 1, step, step + 1]) {
    if (lastStep !== null && s <= lastStep) continue;
    const expected = hotp(secret, s);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return s;
  }
  return null;
}

function otpauthUri(secretBase32, accountName, issuer = 'Écolio') {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// ── Chiffrement du secret en base ─────────────────────────────────────────────

const encryptionKey = () =>
  crypto.createHash('sha256').update(`ecolio-totp:${process.env.TOTP_ENCRYPTION_KEY || process.env.JWT_SECRET}`).digest();

function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

function decryptSecret(stored) {
  const [version, iv, tag, data] = String(stored).split(':');
  if (version !== 'v1') throw new Error('Format de secret 2FA inconnu');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

// ── Codes de secours ───────────────────────────────────────────────────────────

const RECOVERY_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RECOVERY_LENGTH = 10;

// Codes au format XXXXX-XXXXX (10 caractères sans ambiguïté 0/O/1/I/L)
function generateRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const bytes = crypto.randomBytes(RECOVERY_LENGTH);
    const raw = Array.from(bytes, b => RECOVERY_CHARS[b % RECOVERY_CHARS.length]).join('');
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

const normalizeRecoveryCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const hashRecoveryCode = (code) => crypto.createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');

module.exports = {
  RECOVERY_LENGTH, generateSecret, verifyCode, otpauthUri, hotp, base32Encode, base32Decode, currentStep,
  encryptSecret, decryptSecret, generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode,
};
