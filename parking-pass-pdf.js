'use strict';

/**
 * Generador de PDF real para el pase Rodando Parking.
 * Se ejecuta exclusivamente en el servidor con los datos ya autorizados.
 */
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const GREEN_900 = '#0f4028';
const GREEN_700 = '#1e7b46';
const GREEN_100 = '#eaf7ec';
const INK = '#173126';
const MUTED = '#5d7563';
const LINE = '#cfe4d4';

function safe(value, fallback = 'No registrado') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Mexico_City'
  }).format(date);
}

function statusLabel(status) {
  if (status === 'cancelado') return 'CANCELADO';
  if (status === 'vencido') return 'VENCIDO';
  return 'VIGENTE';
}

function statusColor(status) {
  if (status === 'cancelado') return '#a23b3b';
  if (status === 'vencido') return '#8a6518';
  return GREEN_700;
}

function sectionTitle(doc, text, x, y, width) {
  doc.font('Helvetica-Bold').fontSize(10).fillColor(GREEN_700)
    .text(text.toUpperCase(), x, y, { width, characterSpacing: 1.2 });
  doc.moveTo(x, y + 16).lineTo(x + width, y + 16).strokeColor(LINE).lineWidth(1).stroke();
  return y + 26;
}

function labeledValue(doc, x, y, width, label, value) {
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(label.toUpperCase(), x, y, { width });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(safe(value), x, y + 13, { width, ellipsis: true });
}

function roundedPanel(doc, x, y, width, height, fill = '#f6fbf6') {
  doc.save();
  doc.roundedRect(x, y, width, height, 12).fillAndStroke(fill, LINE);
  doc.restore();
}

async function buildParkingPassPdf(pass) {
  const qrUrl = pass.verificationUrl;
  const qrBuffer = await QRCode.toBuffer(qrUrl, {
    type: 'png', width: 760, margin: 1, errorCorrectionLevel: 'M',
    color: { dark: '#122c1d', light: '#ffffff' }
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, compress: true });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const margin = 42;
    const contentW = pageW - margin * 2;
    const passengers = Array.isArray(pass.passengers) ? pass.passengers : [];

    // Encabezado institucional
    doc.rect(0, 0, pageW, 126).fill(GREEN_900);
    doc.roundedRect(margin, 25, 54, 54, 15).fill('#dff7a1');
    doc.font('Helvetica-Bold').fontSize(27).fillColor(GREEN_900).text('R', margin + 17, 39);
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#ffffff').text('Rodando UTP', margin + 70, 30);
    doc.font('Helvetica').fontSize(11).fillColor('#cdebd5').text('GreenShare', margin + 70, 54);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#dff7a1')
      .text('PASE RODANDO PARKING', margin, 88, { width: contentW, characterSpacing: 1.8 });
    doc.font('Helvetica').fontSize(9).fillColor('#cdebd5')
      .text('Movilidad colaborativa universitaria', margin, 103);

    // Estado y folio
    const status = pass.status || 'vigente';
    doc.roundedRect(pageW - margin - 124, 84, 124, 26, 13).fill(statusColor(status));
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff')
      .text(statusLabel(status), pageW - margin - 124, 91, { width: 124, align: 'center' });

    let y = 152;
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('FOLIO ÚNICO', margin, y);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(safe(pass.code), margin, y + 12, { width: 360 });
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
      .text(`Emitido: ${formatDate(pass.generatedAt)}`, margin + 370, y, { width: contentW - 370, align: 'right' });
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
      .text(`Consulta pública: /verificar-pase.html`, margin + 370, y + 14, { width: contentW - 370, align: 'right' });

    // Ocupantes del vehículo
    y = 202;
    roundedPanel(doc, margin, y, contentW, 94, GREEN_100);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(GREEN_700)
      .text('OCUPANTES DEL VEHÍCULO', margin + 20, y + 17, { characterSpacing: 1.2 });
    doc.font('Helvetica-Bold').fontSize(52).fillColor(GREEN_900).text(String(pass.occupantCount ?? 1), margin + 20, y + 30);
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text('conductor incluido', margin + 20, y + 74);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(INK)
      .text(`${pass.passengers.length} pasajero${pass.passengers.length === 1 ? '' : 's'} registrado${pass.passengers.length === 1 ? '' : 's'}`, margin + 180, y + 28, { width: contentW - 210 });
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED)
      .text(`${pass.seatsConfirmed || 0} plaza${pass.seatsConfirmed === 1 ? '' : 's'} de pasajero confirmada${pass.seatsConfirmed === 1 ? '' : 's'} + 1 conductor`, margin + 180, y + 50, { width: contentW - 210 });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(GREEN_700)
      .text(`Estado del pase: ${statusLabel(status)}`, margin + 180, y + 72, { width: contentW - 210 });

    // Ruta
    y = 314;
    const colW = (contentW - 18) / 2;
    roundedPanel(doc, margin, y, colW, 92);
    y = sectionTitle(doc, 'Ruta del viaje', margin + 14, y + 14, colW - 28);
    labeledValue(doc, margin + 14, y - 4, colW - 28, 'Origen', pass.origin);
    labeledValue(doc, margin + 14, y + 27, colW - 28, 'Destino', pass.destination);
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
      .text(formatDate(pass.departureAt), margin + 14, y + 54, { width: colW - 28 });

    // Vehículo
    const vx = margin + colW + 18;
    roundedPanel(doc, vx, 314, colW, 92);
    sectionTitle(doc, 'Vehículo y conductor', vx + 14, 328, colW - 28);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(INK)
      .text(safe(pass.driver?.name), vx + 14, 348, { width: colW - 28, ellipsis: true });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text(`Matrícula: ${safe(pass.driver?.studentId)}`, vx + 14, 365, { width: colW - 28 });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text(`${safe(pass.vehicle)} · ${safe(pass.color)}`, vx + 14, 381, { width: colW - 28, ellipsis: true });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(GREEN_900)
      .text(`Placas: ${safe(pass.plate, 'Solo últimos 4')}`, vx + 14, 396, { width: colW - 28 });

    // Ocupantes
    y = 428;
    const qrSize = 174;
    const listW = contentW - qrSize - 22;
    sectionTitle(doc, 'Ocupantes autorizados', margin, y, listW);
    let rowY = y + 34;
    const rows = [
      { role: 'CONDUCTOR', name: pass.driver?.name, studentId: pass.driver?.studentId },
      ...passengers.map(p => ({ role: 'PASAJERO', name: p.name, studentId: p.studentId, seats: p.seats }))
    ];
    for (const row of rows) {
      doc.roundedRect(margin, rowY - 4, listW, 26, 7).fill(row.role === 'CONDUCTOR' ? '#edf8ee' : '#ffffff');
      doc.font('Helvetica-Bold').fontSize(7.4).fillColor(row.role === 'CONDUCTOR' ? GREEN_700 : MUTED)
        .text(row.role, margin + 9, rowY + 3, { width: 64 });
      doc.font('Helvetica-Bold').fontSize(9.4).fillColor(INK)
        .text(safe(row.name), margin + 78, rowY + 2, { width: listW - 166, ellipsis: true });
      doc.font('Helvetica').fontSize(8.6).fillColor(MUTED)
        .text(safe(row.studentId), margin + listW - 86, rowY + 3, { width: 76, align: 'right' });
      rowY += 29;
    }

    // QR grande
    const qrX = pageW - margin - qrSize;
    const qrY = 426;
    doc.roundedRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 12).fillAndStroke('#ffffff', LINE);
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(GREEN_700)
      .text('ESCANEA PARA VERIFICAR', qrX - 6, qrY + qrSize + 13, { width: qrSize + 12, align: 'center' });

    // Pie
    doc.moveTo(margin, pageH - 96).lineTo(pageW - margin, pageH - 96).strokeColor(LINE).lineWidth(1).stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GREEN_900)
      .text('Pase personal e intransferible', margin, pageH - 84);
    doc.font('Helvetica').fontSize(8.2).fillColor(MUTED)
      .text('La página pública de verificación muestra únicamente datos mínimos. Los nombres completos, matrículas y placas se reservan para los participantes autorizados y la administración.', margin, pageH - 70, { width: contentW - 180, lineGap: 2 });
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text('Rodando UTP GreenShare', pageW - margin - 150, pageH - 84, { width: 150, align: 'right' });
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text(formatDate(pass.generatedAt), pageW - margin - 150, pageH - 72, { width: 150, align: 'right' });

    doc.end();
  });
}

module.exports = { buildParkingPassPdf };
