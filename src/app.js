const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error('\x1b[31m[FATAL] JWT_SECRET manquant dans .env — arrêt du serveur\x1b[0m');
  process.exit(1);
}

const app = express();
const isProd = process.env.NODE_ENV === 'production';

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { success: false, message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/login', loginLimiter);

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Trop de créations de compte depuis cette adresse. Réessayez dans 1 heure.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/register', registerLimiter);

const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Trop de tentatives. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/change-password', changePasswordLimiter);

// Limite les uploads (avatars, photos, logos, preuves de paiement) : évite qu'un compte
// compromis ou un script abusif épuise le quota Cloudinary via des envois en rafale.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Trop de fichiers envoyés. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/uploads', uploadLimiter);
app.use('/api/subscription/payments', uploadLimiter);
app.use('/api/publications', (req, res, next) => (req.method === 'POST' ? uploadLimiter(req, res, next) : next()));

// Limite l'envoi de SMS : coûteux (facturé au fournisseur) et exploitable comme vecteur
// de spam vers les numéros des parents/personnel en cas de compte compromis.
const smsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Trop de SMS envoyés. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/sms', (req, res, next) => (req.method === 'POST' && req.path === '/' ? smsLimiter(req, res, next) : next()));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(isProd ? morgan('combined') : morgan('dev'));

// Fichiers uploadés — Cross-Origin-Resource-Policy requis car frontend et backend sont sur des ports différents
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, '../uploads')));

const routes = require('./routes');
app.use('/api', routes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'Écolio API', version: '1.0.0', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: isProd ? 'Erreur interne du serveur' : (err.message || 'Erreur interne du serveur')
  });
});

module.exports = app;
