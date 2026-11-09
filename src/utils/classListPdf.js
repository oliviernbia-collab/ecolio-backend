const PDFDocument = require('pdfkit');

// Liste de classe à remplir à la main (format des cahiers d'appel ivoiriens) : en-tête école,
// puis N°, matricule, nom et prénoms, 10 colonnes « interrogations et devoirs », MOY, MOY x Cf., RANG.
const MARGIN = 28;
const COLS = [
  { key: 'no', label: 'N°', width: 22 },
  { key: 'matricule', label: 'MATRICULE', width: 64 },
  { key: 'name', label: 'NOM ET PRENOMS', width: 177 },
  ...Array.from({ length: 10 }, () => ({ key: 'mark', label: '', width: 19.5 })),
  { key: 'moy', label: 'MOY', width: 28 },
  { key: 'moyCoef', label: 'MOY x\nCf.', width: 28 },
  { key: 'rang', label: 'RANG', width: 25 },
];
const MARKS_START = 3; // index de la première colonne « interrogations et devoirs »
const HEADER_HEIGHT = 30;
const ROW_HEIGHT = 16;     // hauteur minimale d'une ligne élève
const MAX_ROW_HEIGHT = 20; // lignes agrandies quand la classe tient sur une page
const GRAY = '#555555';

function cellText(doc, text, x, y, width, height, { align = 'left', font = 'Helvetica', size = 8.5 } = {}) {
  doc.font(font).fontSize(size).fillColor('#222222');
  const lines = String(text).split('\n').length;
  const textY = y + (height - lines * size * 1.15) / 2 + 1;
  const pad = width < 30 ? 1 : 3; // les colonnes étroites (RANG, MOY x Cf.) ont besoin de toute leur largeur
  doc.text(text, x + pad, textY, { width: width - pad * 2, align, lineBreak: lines > 1, ellipsis: true, height });
}

function drawPageHeader(doc, { schoolName, yearName, className }) {
  const pageWidth = doc.page.width - MARGIN * 2;
  doc.font('Helvetica').fontSize(9).fillColor(GRAY)
    .text((schoolName || '').toUpperCase(), MARGIN, MARGIN, { width: pageWidth * 0.7 });
  if (yearName) {
    doc.font('Helvetica').fontSize(8).fillColor(GRAY)
      .text(`Année scolaire ${yearName}`, MARGIN, MARGIN + 14, { width: pageWidth, align: 'right' });
  }
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#333333').text('LISTE DE CLASSE', MARGIN, MARGIN + 18);
  doc.lineWidth(1).strokeColor('#777777').moveTo(MARGIN, MARGIN + 34).lineTo(MARGIN + pageWidth, MARGIN + 34).stroke();
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#333333')
    .text(className, MARGIN, MARGIN + 40, { width: pageWidth, align: 'right' });
  return MARGIN + 62;
}

function drawTableHeader(doc, top) {
  doc.lineWidth(0.6).strokeColor(GRAY);
  let x = MARGIN;
  COLS.forEach((col, i) => {
    if (col.key === 'mark') {
      // Sous-cellules vides sous le bandeau « INTERROGATIONS ET DEVOIRS »
      doc.rect(x, top + HEADER_HEIGHT / 2, col.width, HEADER_HEIGHT / 2).stroke();
      if (i === MARKS_START) {
        const bandWidth = COLS.filter(c => c.key === 'mark').reduce((t, c) => t + c.width, 0);
        doc.rect(x, top, bandWidth, HEADER_HEIGHT / 2).stroke();
        cellText(doc, 'INTERROGATIONS ET DEVOIRS', x, top, bandWidth, HEADER_HEIGHT / 2, { align: 'center', font: 'Helvetica-Bold', size: 7.5 });
      }
    } else {
      doc.rect(x, top, col.width, HEADER_HEIGHT).stroke();
      cellText(doc, col.label, x, top, col.width, HEADER_HEIGHT, { align: 'center', font: 'Helvetica-Bold', size: col.width < 30 ? 6.5 : 7.5 });
    }
    x += col.width;
  });
  return top + HEADER_HEIGHT;
}

function drawRow(doc, top, index, student, rowHeight) {
  doc.lineWidth(0.6).strokeColor(GRAY);
  let x = MARGIN;
  for (const col of COLS) {
    doc.rect(x, top, col.width, rowHeight).stroke();
    if (col.key === 'no') cellText(doc, index, x, top, col.width, rowHeight, { align: 'center' });
    if (col.key === 'matricule') cellText(doc, student.matricule || '', x, top, col.width, rowHeight, { align: 'center' });
    if (col.key === 'name') cellText(doc, `${(student.last_name || '').toUpperCase()} ${student.first_name || ''}`.trim(), x, top, col.width, rowHeight);
    x += col.width;
  }
}

// Écrit le PDF dans la réponse HTTP (téléchargement).
function sendClassListPdf(res, filename, { schoolName, yearName, className, students }) {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  const header = { schoolName, yearName, className };
  let y = drawTableHeader(doc, drawPageHeader(doc, header));
  const bottom = doc.page.height - MARGIN;
  // Une classe qui tient sur une page occupe toute la hauteur (plus de place pour écrire).
  const fitsOnePage = students.length * ROW_HEIGHT <= bottom - y;
  const rowHeight = fitsOnePage && students.length ? Math.min(MAX_ROW_HEIGHT, (bottom - y) / students.length) : ROW_HEIGHT;
  students.forEach((student, i) => {
    if (y + rowHeight > bottom + 0.01) { // tolérance d'arrondi : rowHeight remplit la page au point près
      doc.addPage();
      y = drawTableHeader(doc, drawPageHeader(doc, header));
    }
    drawRow(doc, y, i + 1, student, rowHeight);
    y += rowHeight;
  });
  if (!students.length) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(GRAY).text('Aucun élève inscrit dans cette classe.', MARGIN, y + 10);
  }
  doc.end();
}

module.exports = { sendClassListPdf };
