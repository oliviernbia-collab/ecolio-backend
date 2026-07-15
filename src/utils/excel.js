const ExcelJS = require('exceljs');

// Génère un classeur Excel à partir de colonnes { header, key, width } et de lignes,
// puis l'envoie directement en réponse HTTP (aucun fichier temporaire sur disque).
async function sendExcel(res, filename, sheetName, columns, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3C5E' } };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  rows.forEach(row => sheet.addRow(row));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { sendExcel };
