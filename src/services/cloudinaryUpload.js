const cloudinary = require('../config/cloudinary');

// Envoie un buffer (issu de multer memoryStorage) vers Cloudinary. `folder` et
// `resourceType` sont toujours fixés côté serveur par l'appelant — jamais dérivés
// d'une entrée utilisateur — pour rester à l'abri de toute injection de paramètre.
function uploadBuffer(buffer, { folder, resourceType = 'image' }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

async function destroyAsset(publicId, resourceType = 'image') {
  if (!publicId) return;
  try { await cloudinary.uploader.destroy(publicId, { resource_type: resourceType }); } catch (_) {}
}

// Extrait le public_id Cloudinary d'une secure_url (ex: .../upload/v123/ecolio/avatars/abc.jpg -> ecolio/avatars/abc)
function extractPublicId(url) {
  if (!url || !url.includes('res.cloudinary.com')) return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
  return match ? match[1] : null;
}

module.exports = { uploadBuffer, destroyAsset, extractPublicId };
