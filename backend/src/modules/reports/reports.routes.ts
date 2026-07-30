import { Router } from 'express';
import ExcelJS from 'exceljs';
import { stringify } from 'csv-stringify/sync';
import PDFDocument from 'pdfkit';
import { desc, eq } from 'drizzle-orm';
import { authenticate, requirePermission } from '@/middleware/auth';
import { asyncHandler } from '@/utils/asyncHandler';
import { PERMISSIONS } from '@/utils/permissions';
import { db } from '@/config/db';
import { leads } from '@/db/schema';
import { formatLeadNumber } from '@/utils/leadNumber';
import { recordAudit } from '@/utils/auditLogger';

export const reportsRouter = Router();
reportsRouter.use(authenticate, requirePermission(PERMISSIONS.REPORTS_EXPORT));

async function fetchLeadsForExport() {
  return db.query.leads.findMany({
    where: eq(leads.isActive, true),
    orderBy: desc(leads.createdAt),
    with: {
      company: { columns: { name: true, country: true } },
      contact: { columns: { firstName: true, lastName: true, email: true, phone: true, designation: true } },
      campaign: { columns: { name: true, code: true } },
      assignedTo: { columns: { firstName: true, lastName: true } },
      currentOwner: { columns: { firstName: true, lastName: true } },
    },
  });
}

function toRow(l: Awaited<ReturnType<typeof fetchLeadsForExport>>[number]) {
  return {
    'Lead ID': formatLeadNumber(l.leadNumber),
    'Company': l.company?.name ?? '',
    'Contact': [l.contact?.firstName, l.contact?.lastName].filter(Boolean).join(' '),
    'Designation': l.contact?.designation ?? '',
    'Email': l.contact?.email ?? '',
    'Phone': l.contact?.phone ?? '',
    'Country': l.company?.country ?? '',
    'Source': l.source,
    'Campaign': l.campaign?.name ?? '',
    'Status': l.status,
    'Priority': l.priority,
    'Deal Value': l.dealValue ? Number(l.dealValue) : '',
    'Assigned To': l.assignedTo ? `${l.assignedTo.firstName} ${l.assignedTo.lastName}` : '',
    'Current Owner': l.currentOwner ? `${l.currentOwner.firstName} ${l.currentOwner.lastName}` : '',
    'Next Steps': l.nextSteps ?? '',
    'Created At': l.createdAt.toISOString().slice(0, 10),
  };
}

reportsRouter.get(
  '/leads/export.csv',
  asyncHandler(async (req, res) => {
    const leadRows = await fetchLeadsForExport();
    const csv = stringify(leadRows.map(toRow), { header: true });
    await recordAudit({ req, action: 'EXPORT', entityType: 'Lead', newValues: { format: 'csv', count: leadRows.length } });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads-export.csv"');
    res.send(csv);
  })
);

reportsRouter.get(
  '/leads/export.xlsx',
  asyncHandler(async (req, res) => {
    const leadRows = await fetchLeadsForExport();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Leads');
    const rows = leadRows.map(toRow);
    if (rows.length) {
      sheet.columns = Object.keys(rows[0]).map((key) => ({ header: key, key, width: 20 }));
      sheet.addRows(rows);
      sheet.getRow(1).font = { bold: true };
    }
    await recordAudit({ req, action: 'EXPORT', entityType: 'Lead', newValues: { format: 'xlsx', count: leadRows.length } });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="leads-export.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  })
);

reportsRouter.get(
  '/leads/export.pdf',
  asyncHandler(async (req, res) => {
    const leadRows = await fetchLeadsForExport();
    await recordAudit({ req, action: 'EXPORT', entityType: 'Lead', newValues: { format: 'pdf', count: leadRows.length } });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="leads-export.pdf"');

    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    doc.pipe(res);
    doc.fontSize(16).text('Innocito CRM — Leads Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(9);
    leadRows.forEach((l) => {
      const row = toRow(l);
      doc.text(Object.values(row).join('  |  '));
      doc.moveDown(0.3);
    });
    doc.end();
  })
);
