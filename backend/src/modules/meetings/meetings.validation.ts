import { z } from 'zod';

const MEETING_TYPES = ['DISCOVERY', 'DEMO', 'FOLLOW_UP', 'TECHNICAL', 'NEGOTIATION', 'CLOSING', 'OTHER'] as const;
const MEETING_STATUSES = ['SCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED', 'RESCHEDULED'] as const;

export const createMeetingSchema = z.object({
  leadId: z.string().uuid(),
  title: z.string().min(1).max(255),
  type: z.enum(MEETING_TYPES).default('DISCOVERY'),
  scheduledAt: z.coerce.date(),
  durationMins: z.coerce.number().min(5).max(480).default(30),
  location: z.string().max(500).optional().nullable(),
  attendees: z.array(z.string()).optional(),
});

export const updateMeetingSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  type: z.enum(MEETING_TYPES).optional(),
  status: z.enum(MEETING_STATUSES).optional(),
  scheduledAt: z.coerce.date().optional(),
  durationMins: z.coerce.number().min(5).max(480).optional(),
  location: z.string().max(500).optional().nullable(),
  attendees: z.array(z.string()).optional(),
  mom: z.string().max(10000).optional().nullable(),
  outcome: z.string().max(2000).optional().nullable(),
});

export const listMeetingsQuerySchema = z.object({
  leadId: z.string().uuid().optional(),
  upcoming: z.coerce.boolean().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
