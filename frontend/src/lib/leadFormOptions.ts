import { z } from 'zod';

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

/** 24-hour "HH:MM" — matches the backend's TIME_HHMM regex in leads.validation.ts. */
export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The Company details + Meeting Schedule field groups, and their validation, are shared verbatim
 * between the New Lead form and the Edit Lead form (see CompanyDetailsFields.tsx /
 * MeetingScheduleFields.tsx) — defined once here so both forms' Zod schemas merge in the exact
 * same rules instead of maintaining two copies that could drift apart.
 */
export const companyDetailsSchema = z.object({
  industry: z.string().optional(),
  country: z.string().optional(),
  state: z.string().optional(),
  website: z.string().optional(),
  revenue: z.string().optional(),
});
export type CompanyDetailsFormValues = z.infer<typeof companyDetailsSchema>;

export const meetingScheduleSchema = z.object({
  meetingScheduledDate: z.string().optional(),
  meetingScheduledTime: z.string().optional(),
  meetingTimeZone: z.string().optional(),
});
export type MeetingScheduleFormValues = z.infer<typeof meetingScheduleSchema>;

/**
 * Kept separate from `meetingScheduleSchema` itself so that schema stays a plain ZodObject —
 * `.merge()`-able into either form's base schema. Both the New Lead and Edit Lead schemas apply
 * this exact check via their own top-level `.refine()`, so the "HH:MM, 24-hour" rule can never
 * drift between the two forms.
 */
export function isValidMeetingTime(v: { meetingScheduledTime?: string }): boolean {
  return !v.meetingScheduledTime || TIME_REGEX.test(v.meetingScheduledTime);
}

/** Today's date as a `yyyy-mm-dd` string, for defaulting date-input fields like Lead Received Date. */
export function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}
