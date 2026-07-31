import { z } from 'zod';

/**
 * Curated option sets for the Lead Creation / Editing module.
 *
 * Shared between validation (leads.validation.ts, companies.validation.ts)
 * and anything else that needs to render or check these lists, so the
 * allowed values live in exactly one place instead of drifting between the
 * frontend and backend over time.
 *
 * Industry/Country are enforced going forward via Zod (new writes must pick
 * from the list) but the underlying `companies.industry` / `companies.country`
 * columns stay plain varchar — existing free-text data written before this
 * module existed keeps displaying correctly instead of being invalidated by
 * a retroactive DB constraint.
 */
export const INDUSTRY_OPTIONS = [
  'ISV',
  'Healthcare',
  'BFSI',
  'Retail',
  'Energy & Utilities (E&U)',
  'Hospitality',
  'Business Services',
  'Marketing & Advertisement',
  'Logistics & Supply Chain',
  'Real Estate & Construction',
  'Consumer Goods',
  'Others',
] as const;

export const COUNTRY_OPTIONS = ['USA', 'UK', 'Europe', 'Australia', 'Singapore', 'India', 'Others'] as const;

/**
 * Predefined US timezones offered in the Meeting Time Zone picker when the lead's country is USA.
 * For any other country the frontend swaps the picker for a free-text field instead — whatever the
 * user types (or one of these four codes) is what ends up stored in `meetings.timeZone`.
 */
export const US_TIMEZONE_OPTIONS = ['EST', 'CST', 'MST', 'PST'] as const;

/** Loose website validator: tolerates a bare domain (acme.com) as well as a full URL, and stays optional/nullable. */
export const websiteSchema = z
  .string()
  .max(255)
  .optional()
  .nullable()
  .refine((v) => !v || /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v), { message: 'Enter a valid website URL' });

/** Normalizes a validated website string for storage — adds https:// when no protocol was typed. */
export function normalizeWebsite(value: string | null | undefined): string | null | undefined {
  if (!value) return value;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/**
 * The 5 campaigns added by the Lead Creation module enhancement (migration
 * `0003_seed_new_campaigns.sql`). Re-exported here so the test fixtures
 * (tests/setup.ts) can seed the same rows — the test DB is truncated and
 * reseeded per run, which would otherwise wipe out what the migration
 * inserted before `seedMinimal()` runs.
 */
export const NEW_CAMPAIGN_SEEDS = [
  { name: 'Staffing', code: 'STAFFING', description: 'Staffing services campaign' },
  { name: 'Pen Testing', code: 'PENTEST', description: 'Penetration testing services campaign' },
  { name: 'AI-Led Quality Engineering', code: 'AI_LED_QE', description: 'AI-Led Quality Engineering (AI-Led QE) campaign' },
  { name: 'AI-Led Digital Engineering', code: 'AI_LED_DE', description: 'AI-Led Digital Engineering (AI-Led DE) campaign' },
  { name: 'Generic', code: 'GENERIC', description: 'Generic / uncategorized campaign' },
] as const;
