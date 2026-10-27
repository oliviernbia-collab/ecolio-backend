// Réponse d'erreur uniforme : masque le détail technique en production pour éviter
// toute fuite d'information (schéma SQL, chemins internes, etc.) au client.
function handleError(res, err, status = 500) {
  // Erreur métier explicitement destinée à l'utilisateur (ex. fichier invalide) : message conservé
  if (err?.expose && err.status) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  console.error(err);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(status).json({
    success: false,
    message: isProd ? 'Erreur interne du serveur' : (err.message || 'Erreur interne du serveur'),
  });
}

module.exports = { handleError };
