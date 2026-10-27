const cloudinary = require('../config/cloudinary');

// Identifie le vrai format d'un fichier d'après ses premiers octets (« signature »). Le type
// MIME vérifié par multer est déclaré par le navigateur et peut être falsifié : un script ou un
// document renommé en .jpg passerait ce premier filtre, mais pas celui-ci.
function detectKind(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const ascii = (start, end) => buffer.toString('latin1', start, end);
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image';                   // JPEG
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image'; // PNG
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'image';                            // GIF
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image';                               // WebP
  if (ascii(4, 8) === 'ftyp') return 'video';                                                          // MP4 / MOV
  if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'video';             // WebM
  return null;
}

class InvalidFileError extends Error {
  constructor(message) { super(message); this.status = 400; this.expose = true; }
}

// Envoie un buffer (issu de multer memoryStorage) vers Cloudinary. `folder` et
// `resourceType` sont toujours fixés côté serveur par l'appelant — jamais dérivés
// d'une entrée utilisateur — pour rester à l'abri de toute injection de paramètre.
function uploadBuffer(buffer, { folder, resourceType = 'image' }) {
  const kind = detectKind(buffer);
  if (kind !== resourceType) {
    return Promise.reject(new InvalidFileError(resourceType === 'video'
      ? 'Le fichier envoyé n\'est pas une vidéo valide (MP4, WebM ou MOV).'
      : 'Le fichier envoyé n\'est pas une image valide (JPEG, PNG, WebP ou GIF).'));
  }
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

module.exports = { uploadBuffer, destroyAsset, extractPublicId, detectKind };
