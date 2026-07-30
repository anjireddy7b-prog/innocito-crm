/**
 * Validated chart palette (see the dataviz skill's references/palette.md).
 * Categorical hues are assigned in FIXED order per entity — never cycled or
 * re-ordered by a filter — and status colors are reserved for outcome state
 * (won/lost/in-progress), never reused for a generic "series".
 */

export const CHART_INK = {
  primary: '#0b0b0b',
  secondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  surface: '#fcfcfb',
};

export const CHART_INK_DARK = {
  primary: '#ffffff',
  secondary: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  axis: '#383835',
  surface: '#1a1a19',
};

/** Fixed categorical order — do not reorder or cycle. */
export const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

/** Sequential single-hue ramp (blue), light -> dark, for magnitude/ordinal encodings. */
export const SEQUENTIAL_BLUE = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#2a78d6', '#1c5cab', '#104281'];

export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
};

/** Fixed mapping for LeadSource — order matches the categorical palette. */
export const LEAD_SOURCE_COLORS: Record<string, string> = {
  EMAIL: CATEGORICAL[0],
  LINKEDIN: CATEGORICAL[1],
  COLD_CALLING: CATEGORICAL[2],
  REFERRAL: CATEGORICAL[3],
  WEBSITE: CATEGORICAL[4],
  EVENT: CATEGORICAL[5],
  PARTNER: CATEGORICAL[6],
  OTHER: CATEGORICAL[7],
};

/** Ordinal ramp for the lead pipeline (stage progress -> darker blue), never lighter than step 250 equivalent. */
export const PIPELINE_ORDER = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'MEETING_SCHEDULED', 'MEETING_DONE',
  'DEMO_SCHEDULED', 'DEMO_DONE', 'PROPOSAL_SENT', 'NEGOTIATION', 'ON_HOLD',
];
export function pipelineColor(status: string): string {
  const idx = PIPELINE_ORDER.indexOf(status);
  if (idx === -1) return status === 'WON' ? STATUS.good : status === 'LOST' ? STATUS.critical : CHART_INK.muted;
  const rampIdx = Math.min(SEQUENTIAL_BLUE.length - 1, Math.floor((idx / PIPELINE_ORDER.length) * SEQUENTIAL_BLUE.length) + 2);
  return SEQUENTIAL_BLUE[rampIdx];
}
