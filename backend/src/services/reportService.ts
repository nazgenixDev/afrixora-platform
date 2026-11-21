import { query } from '../utils/database';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { format } from 'date-fns';
import { avgPowerSql, buildingDevicesSql, energySamplesSql, totalEnergySql } from './energyQueries';
import logger from '../utils/logger';
import { AppError, NotFoundError } from '../utils/errors';

const maxCsvRows = 50_000;
const reportLogo = join(__dirname, '../assets/afrixora-logo.png');
const periodDays = { day: 1, week: 7, month: 30 };

function csvText(value: string | null) {
  const text = value ?? '';
  const safe = /^[\t\r\n]|^\s*[=+\-@＝＋－＠]/u.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}

/**
 * Generate a CSV report for a building's energy consumption
 */
export const generateCSV = async (
  tenantId: string,
  buildingId: string,
  from: Date,
  to: Date
): Promise<string> => {
  const sql = `
    WITH devices AS MATERIALIZED (${buildingDevicesSql})
    SELECT sr.time, sr.metric, sr.value, sr.unit, d.name as device_name
    FROM sensor_readings sr
    JOIN devices d ON sr.device_id = d.device_id
    WHERE sr.tenant_id = $1::uuid
      AND sr.time BETWEEN $3::timestamptz AND $4::timestamptz
    ORDER BY sr.time ASC
    LIMIT $5
  `;
  const result = await query(sql, [tenantId, buildingId, from.toISOString(), to.toISOString(), maxCsvRows + 1]);
  if (result.rows.length > maxCsvRows) {
    throw new AppError('Export trop volumineux. Réduisez la période.', 413, 'CSV_LIMIT_EXCEEDED');
  }

  const rows = result.rows.map((row) => {
    const timestamp = format(new Date(row.time), 'yyyy-MM-dd HH:mm:ss');
    return [timestamp, csvText(row.device_name), csvText(row.metric), String(row.value), csvText(row.unit)].join(',');
  });
  logger.info('csv_report_generated', { tenantId, buildingId, rowCount: result.rows.length });
  return ['Timestamp,Device Name,Metric,Value,Unit', ...rows, ''].join('\r\n');
};

/**
 * Generate a PDF report for a building's energy consumption
 */
export const generatePDF = async (
  tenantId: string,
  buildingId: string,
  period: 'day' | 'week' | 'month'
): Promise<Buffer> => {
  try {
    const to = new Date();
    const from = new Date(to.getTime() - periodDays[period] * 24 * 60 * 60 * 1000);

    // 1. Get building info
    const bSql = `SELECT name, address, city FROM "Building" WHERE id = $1 AND "tenantId" = $2 AND "isActive"`;
    const bRes = await query(bSql, [buildingId, tenantId]);
    if (bRes.rows.length === 0) throw new NotFoundError('Bâtiment introuvable');
    const building = bRes.rows[0];

    const params = [tenantId, buildingId, from.toISOString(), to.toISOString()];
    const samples = energySamplesSql('$3::timestamptz', '$4::timestamptz', period !== 'day');

    const [kpiRes, devRes] = await Promise.all([
      query(
        `WITH ${samples}
         SELECT ${totalEnergySql} AS total_kwh,
                MAX(maximum) FILTER (WHERE metric = 'power_w') AS peak_w,
                ${avgPowerSql} AS avg_w
         FROM samples`,
        params
      ),
      query(
        `WITH ${samples}
         SELECT d.name AS device_name, d.type AS device_type,
                ${totalEnergySql} AS total_consumption
         FROM samples s
         JOIN devices d ON d.device_id = s.device_id
         WHERE s.metric = 'energy_kwh'
         GROUP BY d.id, d.name, d.type
         ORDER BY total_consumption DESC
         LIMIT 10`,
        params
      ),
    ]);
    const kpis = kpiRes.rows[0];

    // 4. Build PDF
    const doc = new PDFDocument({ margin: 50 });
    const buffers: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => buffers.push(chunk));

    // Le fichier source garde une marge transparente importante autour du lettrage.
    const logoWidth = 180;
    doc.image(reportLogo, (doc.page.width - logoWidth) / 2, doc.page.margins.top - 40, { width: logoWidth });
    doc.y += 44;
    doc.fontSize(18).text('Rapport de consommation énergétique', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Bâtiment : ${building.name}`);
    doc.fontSize(12).text(`Adresse : ${building.address}, ${building.city}`);
    doc.fontSize(12).text(`Période : ${format(from, 'dd/MM/yyyy HH:mm')} — ${format(to, 'dd/MM/yyyy HH:mm')}`);
    doc.fontSize(12).text(`Généré le : ${format(to, "dd/MM/yyyy 'à' HH:mm")}`);
    doc.moveDown();

    // KPIs
    doc.fontSize(16).text('Indicateurs clés', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(12).text(`Consommation totale : ${Number(kpis.total_kwh).toFixed(2)} kWh`);
    doc.fontSize(12).text(`Puissance maximale : ${Number(kpis.peak_w).toFixed(2)} W`);
    doc.fontSize(12).text(`Puissance moyenne : ${Number(kpis.avg_w).toFixed(2)} W`);
    doc.moveDown();

    // Device table
    doc.fontSize(16).text('Top 10 — Consommation par appareil', { underline: true });
    doc.moveDown(0.3);
    const tableTop = doc.y;
    const colX = [50, 300, 420];
    doc.fontSize(11).text('Appareil', colX[0], tableTop);
    doc.text('Type', colX[1], tableTop);
    doc.text('Conso (kWh)', colX[2], tableTop);
    doc.moveTo(colX[0], tableTop + 18).lineTo(520, tableTop + 18).stroke();

    let rowY = tableTop + 25;
    for (const dev of devRes.rows) {
      if (rowY > doc.page.height - 80) {
        doc.addPage();
        rowY = 50;
        doc.fontSize(11).text('Appareil', colX[0], rowY);
        doc.text('Type', colX[1], rowY);
        doc.text('Conso (kWh)', colX[2], rowY);
        doc.moveTo(colX[0], rowY + 18).lineTo(520, rowY + 18).stroke();
        rowY += 25;
      }
      doc.fontSize(10).text(dev.device_name || '—', colX[0], rowY);
      doc.text(dev.device_type || '—', colX[1], rowY);
      doc.text(Number(dev.total_consumption).toFixed(2), colX[2], rowY);
      rowY += 18;
    }

    // Footer
    doc.fontSize(9).text(
      '© 2026 NAZGENIX SAS — AFRIXORA Intelligent Connected Systems — afrixora.cd',
      doc.page.margins.left,
      rowY + 12,
      { align: 'center' }
    );

    const result = new Promise<Buffer>((resolve, reject) => {
      doc.once('end', () => resolve(Buffer.concat(buffers)));
      doc.once('error', reject);
    });
    doc.end();
    const pdfBuffer = await result;

    logger.info('PDF report generated successfully', { tenantId, buildingId });
    return pdfBuffer;
  } catch (error) {
    logger.error('Échec de la génération du rapport PDF', { tenantId, buildingId });
    throw error;
  }
};

export default { generateCSV, generatePDF };
