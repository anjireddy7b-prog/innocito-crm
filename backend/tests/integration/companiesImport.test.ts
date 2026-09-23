import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { createApp } from '@/app';
import { TEST_INSIDE_SALES, TEST_SALES } from '../setup';

const app = createApp();

let insideSalesToken: string;
let salesToken: string;

beforeAll(async () => {
  const insideSales = await request(app).post('/api/auth/login').send(TEST_INSIDE_SALES);
  insideSalesToken = insideSales.body.data.accessToken;
  const sales = await request(app).post('/api/auth/login').send(TEST_SALES);
  salesToken = sales.body.data.accessToken;
});

const CSV_HEADER = 'Company,Industry,Website,Country,Contact Name,Designation,Email,Phone';

function csvRow(fields: string[]) {
  return fields.map((f) => (f.includes(',') ? `"${f}"` : f)).join(',');
}

describe('Company/contact import from CSV/Excel', () => {
  it('rejects a user without companies:manage permission', async () => {
    const csv = [CSV_HEADER, csvRow(['NoPerm Co', 'Software', '', 'USA', 'No Perm Person', 'CEO', 'noperm@example.com', ''])].join('\n');
    const res = await request(app)
      .post('/api/companies/import')
      .set('Authorization', `Bearer ${salesToken}`)
      .attach('file', Buffer.from(csv), 'companies.csv');
    expect(res.status).toBe(403);
  });

  it('rejects an unsupported file type', async () => {
    const res = await request(app)
      .post('/api/companies/import')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .attach('file', Buffer.from('not a spreadsheet'), { filename: 'companies.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });

  it('rejects a file missing the required Company column', async () => {
    const csv = 'Foo,Bar\n1,2';
    const res = await request(app)
      .post('/api/companies/import')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .attach('file', Buffer.from(csv), 'companies.csv');
    expect(res.status).toBe(400);
  });

  let createdCompanyName: string;

  it('imports valid rows from a CSV file, skipping a row missing the required Company', async () => {
    createdCompanyName = `Acme Import Corp ${Date.now().toString(36)}`;
    const csv = [
      CSV_HEADER,
      csvRow([createdCompanyName, 'Software', 'https://acmeimport.com', 'USA', 'Priya Sharma', 'CTO', 'priya@acmeimport.com', '555-0100']),
      csvRow([createdCompanyName, 'Software', 'https://acmeimport.com', 'USA', 'Second Person', 'VP', 'second@acmeimport.com', '555-0101']),
      csvRow(['', '', '', '', 'Orphan Contact', '', '', '']), // invalid: no Company
    ].join('\n');

    const res = await request(app)
      .post('/api/companies/import')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .attach('file', Buffer.from(csv), 'companies.csv');

    expect(res.status).toBe(200);
    expect(res.body.data.totalDataRows).toBe(3);
    // Same company name on both valid rows — created once, reused on the second row.
    expect(res.body.data.companiesCreated).toBe(1);
    expect(res.body.data.contactsCreated).toBe(2);
    expect(res.body.data.skippedInvalidRows).toBe(1);
    expect(res.body.data.errors).toEqual([]);
  });

  it('actually created the company and contacts (visible via the normal list endpoints)', async () => {
    const companiesRes = await request(app)
      .get(`/api/companies?search=${encodeURIComponent(createdCompanyName)}`)
      .set('Authorization', `Bearer ${insideSalesToken}`);
    expect(companiesRes.body.data.some((c: any) => c.name === createdCompanyName)).toBe(true);

    const contactsRes = await request(app)
      .get(`/api/contacts?search=${encodeURIComponent('priya@acmeimport.com')}`)
      .set('Authorization', `Bearer ${insideSalesToken}`);
    expect(contactsRes.body.meta.total).toBe(1);
    expect(contactsRes.body.data[0].email).toBe('priya@acmeimport.com');
  });

  it('a company-only row with no Contact Name creates the company but no contact', async () => {
    const companyOnlyName = `Company Only Corp ${Date.now().toString(36)}`;
    const csv = [CSV_HEADER, csvRow([companyOnlyName, 'Retail', '', 'USA', '', '', '', ''])].join('\n');

    const res = await request(app)
      .post('/api/companies/import')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .attach('file', Buffer.from(csv), 'companies.csv');

    expect(res.status).toBe(200);
    expect(res.body.data.companiesCreated).toBe(1);
    expect(res.body.data.contactsCreated).toBe(0);

    const companiesRes = await request(app)
      .get(`/api/companies?search=${encodeURIComponent(companyOnlyName)}`)
      .set('Authorization', `Bearer ${insideSalesToken}`);
    expect(companiesRes.body.data.some((c: any) => c.name === companyOnlyName)).toBe(true);
  });

  it('re-importing the same file creates no new companies or contacts (duplicate-safe re-import)', async () => {
    const csv = [
      CSV_HEADER,
      csvRow([createdCompanyName, 'Software', 'https://acmeimport.com', 'USA', 'Priya Sharma', 'CTO', 'priya@acmeimport.com', '555-0100']),
      csvRow([createdCompanyName, 'Software', 'https://acmeimport.com', 'USA', 'Second Person', 'VP', 'second@acmeimport.com', '555-0101']),
    ].join('\n');

    const res = await request(app)
      .post('/api/companies/import')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .attach('file', Buffer.from(csv), 'companies.csv');

    expect(res.status).toBe(200);
    expect(res.body.data.companiesCreated).toBe(0);
    expect(res.body.data.contactsCreated).toBe(0);
    expect(res.body.data.skippedDuplicateContacts).toBe(2);
  });

  it('imports from a real .xlsx workbook (not just CSV)', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Companies');
    const xlsxCompany = `Excel Import Co ${Date.now().toString(36)}`;
    sheet.addRow(['Company', 'Industry', 'Website', 'Country', 'Contact Name', 'Designation', 'Email', 'Phone']);
    sheet.addRow([xlsxCompany, 'Manufacturing', '', 'USA', 'Excel Person', 'COO', 'excel.person@example.com', '']);
    const buffer = (await workbook.xlsx.writeBuffer()) as Buffer;

    const res = await request(app)
      .post('/api/companies/import')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .attach('file', buffer, { filename: 'companies.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    expect(res.status).toBe(200);
    expect(res.body.data.companiesCreated).toBe(1);
    expect(res.body.data.contactsCreated).toBe(1);

    const check = await request(app)
      .get(`/api/companies?search=${encodeURIComponent(xlsxCompany)}`)
      .set('Authorization', `Bearer ${insideSalesToken}`);
    expect(check.body.meta.total).toBe(1);
  });
});
