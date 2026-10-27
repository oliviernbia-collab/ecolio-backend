// Réglages globaux de la plateforme, modifiables par le super admin depuis Paramètres :
// prix de l'abonnement mensuel et message défilant affiché en haut des pages publiques.
// Stockés en clé/valeur dans platform_settings ; les tables de la migration v18 sont créées
// au démarrage si elles n'existent pas encore (services/schema.js).
const db = require('../config/database');
const { SUBSCRIPTION_PRICE } = require('./subscription');
const { ready } = require('./schema');

const DEFAULTS = {
  subscription_price: String(SUBSCRIPTION_PRICE),
  announcement_text: '',
  announcement_active: '0',
};

async function getSettings() {
  await ready;
  const [rows] = await db.execute('SELECT setting_key, setting_value FROM platform_settings');
  const out = { ...DEFAULTS };
  for (const r of rows) out[r.setting_key] = r.setting_value ?? '';
  return {
    subscription_price: Number(out.subscription_price) || SUBSCRIPTION_PRICE,
    announcement_text: out.announcement_text,
    announcement_active: out.announcement_active === '1',
  };
}

async function setSetting(key, value) {
  await ready;
  await db.execute(
    'INSERT INTO platform_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
    [key, String(value)]
  );
}

async function getSubscriptionPrice() {
  return (await getSettings()).subscription_price;
}

module.exports = { ready, getSettings, setSetting, getSubscriptionPrice };
