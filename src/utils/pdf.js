const PDFDocument = require('pdfkit');

// Démarre un PDF A4 avec l'en-tête école (nom + coordonnées), renvoie le doc prêt à recevoir le contenu.
function createSchoolPdf(res, filename, school) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  doc.fontSize(16).fillColor('#1A3C5E').text(school?.name || 'Écolio', { align: 'left' });
  doc.fontSize(9).fillColor('#666').text(
    [school?.address, school?.phone, school?.email].filter(Boolean).join(' · ')
  );
  doc.moveDown(1);
  doc.strokeColor('#1A3C5E').lineWidth(1.5).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(1);
  doc.fillColor('#000');

  return doc;
}

// Number.toLocaleString('fr-FR') sépare les milliers avec une espace insécable/étroite
// (U+00A0 / U+202F) que les polices standard de PDFKit (WinAnsi) n'affichent pas
// correctement — on la remplace par une espace ASCII normale avant de l'écrire dans le PDF.
function formatFCFA(amount) {
  const withoutSeparatorIssue = Number(amount)
    .toLocaleString('fr-FR')
    .replace(/[  ]/g, ' ');
  return `${withoutSeparatorIssue} FCFA`;
}

module.exports = { createSchoolPdf, formatFCFA };
