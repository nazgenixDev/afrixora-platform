import { query } from '../utils/database';
import PDFDocument from 'pdfkit';
import { format } from 'date-fns';
import logger from '../utils/logger';

/**
 * Generate a CSV report for a building's energy consumption
 */
export const generateCSV = async (
  tenantId: string,
  buildingId: string,
  from: Date,
  to: Date
): Promise<string> => {
  try {
    const sql = `
      SELECT sr.time, sr.device_id, sr.metric, sr.value, sr.unit, d.name as device_name
      FROM sensor_readings sr
      JOIN "Device" d ON sr.device_id = d.id::uuid
      WHERE sr.tenant_id = $1::uuid
        AND sr.time BETWEEN $2::timestamptz AND $3::timestamptz
        AND d."buildingId" = $4
      ORDER BY sr.time ASC
    `;
    const result = await query(sql, [tenantId, from.toISOString(), to.toISOString(), buildingId]);

    let csv = 'Timestamp,Device Name,Metric,Value,Unit\n';
    for (const row of result.rows) {
      const timestamp = format(new Date(row.time), 'yyyy-MM-dd HH:mm:ss');
      csv += `${timestamp},"${row.device_name}",${row.metric},${row.value},${row.unit || ''}\n`;
    }
    logger.info('CSV report generated successfully', { tenantId, buildingId, rowCount: result.rows.length });
    return csv;
  } catch (error: any) {
    logger.error('Error generating CSV report', { error: error.message, tenantId, buildingId });
    throw new Error('Failed to generate CSV report');
  }
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
    const from = new Date();
    if (period === 'day') from.setDate(from.getDate() - 1);
    else if (period === 'week') from.setDate(from.getDate() - 7);
    else from.setMonth(from.getMonth() - 1);

    // 1. Get building info
    const bSql = `SELECT name, address, city FROM "Building" WHERE id = $1 AND "tenantId" = $2`;
    const bRes = await query(bSql, [buildingId, tenantId]);
    if (bRes.rows.length === 0) throw new Error('Building not found');
    const building = bRes.rows[0];

    // 2. Get KPIs
    const kpiSql = `
      SELECT 
        COALESCE(SUM(CASE WHEN sr.metric = 'energy_kwh' THEN sr.value ELSE 0 END), 0) as total_kwh,
        COALESCE(MAX(CASE WHEN sr.metric = 'power_w' THEN sr.value ELSE NULL END), 0) as peak_w,
        COALESCE(AVG(CASE WHEN sr.metric = 'power_w' THEN sr.value ELSE NULL END), 0) as avg_w
      FROM sensor_readings sr
      JOIN "Device" d ON sr.device_id = d.id::uuid
      WHERE sr.tenant_id = $1::uuid
        AND sr.time BETWEEN $2::timestamptz AND $3::timestamptz
        AND d."buildingId" = $4
    `;
    const kpiRes = await query(kpiSql, [tenantId, from.toISOString(), to.toISOString(), buildingId]);
    const kpis = kpiRes.rows[0];

    // 3. Get device breakdown
    const devSql = `
      SELECT d.name as device_name, d.type as device_type,
             COALESCE(SUM(sr.value), 0) as total_consumption
      FROM sensor_readings sr
      JOIN "Device" d ON sr.device_id = d.id::uuid
      WHERE sr.tenant_id = $1::uuid
        AND sr.time BETWEEN $2::timestamptz AND $3::timestamptz
        AND d."buildingId" = $4
        AND sr.metric = 'energy_kwh'
      GROUP BY d.id, d.name, d.type
      ORDER BY total_consumption DESC
      LIMIT 10
    `;
    const devRes = await query(devSql, [tenantId, from.toISOString(), to.toISOString(), buildingId]);

    // 4. Build PDF
    const doc = new PDFDocument({ margin: 50 });
    const buffers: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => buffers.push(chunk));

    // Header
    doc.fontSize(25).text('AFRIXORA™', { align: 'center' });
    doc.fontSize(18).text('Rapport de consommation énergétique', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Bâtiment : ${building.name}`);
    doc.fontSize(12).text(`Adresse : ${building.address}, ${building.city}`);
    doc.fontSize(12).text(`Période : ${format(from, 'dd/MM/yyyy')} — ${format(to, 'dd/MM/yyyy')}`);
    doc.fontSize(12).text(`Généré le : ${format(new Date(), 'dd/MM/yyyy à HH:mm')}`);
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
      '© 2026 NAZGENIX SAS — AFRIXORA™ Intelligent Connected Systems — afrixora.cd',
      { align: 'center' }
    );

    doc.end();

    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(buffers)));
    });

    logger.info('PDF report generated successfully', { tenantId, buildingId });
    return pdfBuffer;
  } catch (error: any) {
    logger.error('Error generating PDF report', { error: error.message, tenantId, buildingId });
    throw new Error('Failed to generate PDF report');
  }
};

export default { generateCSV, generatePDF };
