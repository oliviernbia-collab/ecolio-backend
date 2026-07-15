const app = require('./app');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`\x1b[32m🚀 Écolio API démarrée sur le port ${PORT}\x1b[0m`);
});
