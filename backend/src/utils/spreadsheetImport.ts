/**
 * Shared helpers for turning a spreadsheet (CSV or Excel) into CRM rows.
 * Used by both the one-time database seed (db/seed.ts, which imports the
 * original "Leads and Next Steps" spreadsheet on first boot) and the
 * in-app lead import feature (modules/leads/leads.import.service.ts, which
 * lets an Admin/Inside-Sales user re-run the same kind of import later from
 * the Leads page). Keeping this logic in one place means both stay in sync
 * instead of silently drifting apart.
 */
import { Readable } from 'stream';
import ExcelJS from 'exceljs';

export function parseFlexibleDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    // Excel serial date
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + value * 86400000);
  }
  if (typeof value === 'string') {
    const cleaned = value
      .replace(/(\d+)(st|nd|rd|th)/gi, '$1')
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const parsed = new Date(cleaned);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const direct = new Date(value);
    return Number.isNaN(direct.getTime()) ? null : direct;
  }
  return null;
}

export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '(Unknown)' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function classifyOutcome(comment: string): { leadStatus: string; meetingStatus: string; meetingType: string } {
  const c = comment.toLowerCase();
  if (c.includes('no show')) return { leadStatus: 'CONTACTED', meetingStatus: 'NO_SHOW', meetingType: 'DISCOVERY' };
  if (c.includes('demo')) return { leadStatus: 'DEMO_DONE', meetingStatus: 'COMPLETED', meetingType: 'DEMO' };
  if (c.includes('not responding')) return { leadStatus: 'ON_HOLD', meetingStatus: 'COMPLETED', meetingType: 'DISCOVERY' };
  if (c.includes('looking for job') || c.includes('network') || c.includes('partner')) {
    return { leadStatus: 'DISQUALIFIED', meetingStatus: 'COMPLETED', meetingType: 'DISCOVERY' };
  }
  if (!comment) return { leadStatus: 'MEETING_SCHEDULED', meetingStatus: 'SCHEDULED', meetingType: 'DISCOVERY' };
  return { leadStatus: 'MEETING_DONE', meetingStatus: 'COMPLETED', meetingType: 'DISCOVERY' };
}

export type SpreadsheetCell = string | number | boolean | Date | null;

/**
 * Reads an uploaded CSV or Excel file (as a Buffer) into a plain header row
 * + data rows shape, regardless of which format it came in. ExcelJS handles
 * both natively (`workbook.xlsx.load` / `workbook.csv.read`), so this is the
 * one place format-detection happens — everything downstream just deals
 * with rows of cells.
 */
export async function readSpreadsheetRows(
  buffer: Buffer,
  originalName: string,
  mimetype: string
): Promise<{ headers: string[]; rows: SpreadsheetCell[][] }> {
  const isCsv =
    mimetype.includes('csv') ||
    mimetype === 'text/plain' ||
    /\.csv$/i.test(originalName);

  const workbook = new ExcelJS.Workbook();
  let sheet: ExcelJS.Worksheet;

  if (isCsv) {
    sheet = await workbook.csv.read(Readable.from(buffer));
  } else {
    await workbook.xlsx.load(buffer as any);
    const first = workbook.worksheets[0];
    if (!first) throw new Error('The uploaded file has no worksheets.');
    sheet = first;
  }

  const headerRow = sheet.getRow(1).values as unknown[];
  // ExcelJS row.values is 1-indexed with a hole at index 0 — normalize to a
  // plain 0-indexed array of trimmed header strings.
  const headers = headerRow
    .slice(1)
    .map((h) => (typeof h === 'string' ? h.trim() : h == null ? '' : String(h).trim()));

  const rows: SpreadsheetCell[][] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const values: SpreadsheetCell[] = [];
    for (let col = 1; col <= headers.length; col++) {
      const cell = row.getCell(col).value;
      if (cell == null) {
        values.push(null);
      } else if (cell instanceof Date || typeof cell === 'number' || typeof cell === 'boolean') {
        values.push(cell);
      } else if (typeof cell === 'object' && 'text' in (cell as any)) {
        // ExcelJS rich-text / hyperlink cell shape
        values.push(String((cell as any).text ?? ''));
      } else {
        values.push(String(cell));
      }
    }
    // Skip fully-blank rows (common trailing rows in exported spreadsheets).
    if (values.every((v) => v === null || v === '')) continue;
    rows.push(values);
  }

  return { headers, rows };
}

/** Case/whitespace-insensitive header lookup, checking a list of accepted aliases in order. */
export function findColumn(headers: string[], aliases: string[]): number {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias.trim().toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}
