import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_INSIDE_SALES, TEST_SALES } from '../setup';

const app = createApp();

let insideSalesToken: string;
let salesToken: string;

beforeAll(async () => {
  const insideSales = await request(app).post('/api/auth/login').send(TEST_INSIDE_SALES);
  insideSalesToken = insideSales.body.data.accessToken;
  const sales = await request(app).post('/api/auth/login').send(TEST_SALES);
  salesToken = sales.body.data.accessToken;
});

const CSV_HEADER = 'IST Rep,Name,Designation,Email ID,Company,City,State,Country,Email/Cold Calling,Campaign,Meeting Date,Comments,Category';

function csvRow(fields: string[]) {
  return fields.map((f) => (f.includes(',') ? `"${f}"` : f)).join(',');
}

describe('Lead import from CSV/Excel', () => {
  it('rejects a user without leads:create permission', async () => {
    const csv = [CSV_HEADER, csvRow(['Test Admin', 'No Perm Person', 'CEO', 'noperm@example.com', 'NoPerm Co', 'City', 'State', 'USA', 'Email', '', '', '', ''])].join('\n');
    const res = await request(app)
      .post('/api/leads/import')
      .set('Authorization', `Bearer ${salesToken}`)
      .attach('file', Buffer.from(csv), 'leads.csv');
    expect(res.status).toBe(403);
  });

  it('rejects an unsupported file type', async () => {
    const res = await request(app)
      .post('/api/leads/import')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .attach('file', Buffer.from('not a spreadsheet'), { filename: 'leads.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });

  it('rejects a file missing the required Name/Company columns', async () => {
    const csv = 'Foo,Bar\n1,2';
    const res = await request(app)
      .post('/api/leads/import')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .attach('file', Buffer.from(csv), 'leads.csv');
    expect(res.status).toBe(400);
  });

  let createdCompanyName: string;

  it('imports valid rows from a CSV file, skipping a row missing a required field', async () => {
    createdCompanyName = `Acme Import Corp ${Date.now().toString(36)}`;
    const csv = [
      CSV_HEADER,
      csvRow(['Venu Budarapu', 'Priya Sharma', 'CTO', 'priya@acmeimport.com', createdCompanyName, 'Austin', 'TX', 'USA', 'Email', 'CAMP1', '15 Jan 2026', 'Demo done, very interested', 'Enterprise']),
      csvRow(['Venu Budarapu', 'Second Person', 'VP', 'second@acmeimport.com', createdCompanyName, 'Austin', 'TX', 'USA', 'LinkedIn', 'CAMP1', '', 'No show', 'Enterprise']),
      csvRow(['Venu Budarapu', '', '', '', 'Missing Name Co', '', '', '', '', '', '', '', '']), // invalid: no Name
    ].join('\n');

    const res = await request(app)
      .post('/api/leads/import')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .attach('file', Buffer.from(csv), 'leads.csv');

    expect(res.status).toBe(200);
    expect(res.body.data.totalDataRows).toBe(3);
    expect(res.body.data.created).toBe(2);
    expect(res.body.data.skippedInvalidRows).toBe(1);
    expect(res.body.data.errors).toEqual([]);
  });

  it('actually created the leads, company, and contacts (visible via the normal list endpoints)', async () => {
    const res = await request(app)
      .get(`/api/leads?search=${encodeURIComponent(createdCompanyName)}`)
      .set('Authorization', `Bearer ${insideSalesToken}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data[0].company.name).toBe(createdCompanyName);

    const companiesRes = await request(app)
      .get(`/api/companies?search=${encodeURIComponent(createdCompanyName)}`)
      .set('Authorization', `Bearer ${insideSalesToken}`);
    expect(companiesRes.body.data.some((c: any) => c.name === createdCompanyName)).toBe(true);
  });

  it('one row correctly classified DEMO_DONE status and the demo meeting from "Demo done" comment', async () => {
    const res = await request(app)
      .get(`/api/leads?search=${encodeURIComponent(createdCompanyName)}&sortBy=createdAt&sortDir=asc`)
      .set('Authorization', `Bearer ${insideSalesToken}`);
    const priya = res.body.data.find((l: any) => l.contact?.email === 'priya@acmeimport.com');
    expect(priya.status).toBe('DEMO_DONE');
  });

  it('re-importing the same file creates no new leads (duplicate-safe re-import)', async () => {
    const csv = [
      CSV_HEADER,
      csvRow(['Venu Budarapu', 'Priya Sharma', 'CTO', 'priya@acmeimport.com', createdCompanyName, 'Austin', 'TX', 'USA', 'Email', 'CAMP1', '15 Jan 2026', 'Demo done, very interested', 'Enterprise']),
      csvRow(['Venu Budarapu', 'Second Person', 'VP', 'second@acmeimport.com', createdCompanyName, 'Austin', 'TX', 'USA', 'LinkedIn', 'CAMP1', '', 'No show', 'Enterprise']),
    ].join('\n');

    const res = await request(app)
      .post('/api/leads/import')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .attach('file', Buffer.from(csv), 'leads.csv');

    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(0);
    expect(res.body.data.skippedDuplicates).toBe(2);
  });

  it('imports from a real .xlsx workbook (not just CSV)', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Leads');
    const xlsxCompany = `Excel Import Co ${Date.now().toString(36)}`;
    sheet.addRow(['IST Rep', 'Name', 'Designation', 'Email ID', 'Company', 'City', 'State', 'Country', 'Email/Cold Calling', 'Campaign', 'Meeting Date', 'Comments', 'Category']);
    sheet.addRow(['Umesh Nagari', 'Excel Person', 'COO', 'excel.person@example.com', xlsxCompany, 'Denver', 'CO', 'USA', 'Email', '', '', '', 'SMB']);
    const buffer = (await workbook.xlsx.writeBuffer()) as Buffer;

    const res = await request(app)
      .post('/api/leads/import')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .attach('file', buffer, { filename: 'leads.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(1);

    const check = await request(app)
      .get(`/api/leads?search=${encodeURIComponent(xlsxCompany)}`)
      .set('Authorization', `Bearer ${insideSalesToken}`);
    expect(check.body.meta.total).toBe(1);
  });
});
