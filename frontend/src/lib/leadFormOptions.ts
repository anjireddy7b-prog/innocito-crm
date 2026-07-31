/**
 * Curated option sets for the Lead Creation / Editing module — mirrors
 * backend/src/utils/leadFormOptions.ts. Kept in one place on each side
 * (frontend can't import from the backend package) so both stay in sync
 * when the list changes.
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

/** Predefined US timezones shown when the lead's Country is USA; any other country switches to free text. */
export const US_TIMEZONE_OPTIONS = ['EST', 'CST', 'MST', 'PST'] as const;

/** Sentinel Select value that reveals the manual/free-text timezone input. */
export const MANUAL_TIMEZONE_OPTION = 'Manual Entry';
