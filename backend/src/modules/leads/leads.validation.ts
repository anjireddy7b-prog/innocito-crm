import { z } from 'zod';
import { paginationSchema } from '@/utils/pagination';

const LEAD_SOURCES = ['EMAIL', 'LINKEDIN', 'COLD_CALLING', 'REFERRAL', 'WEBSITE', 'EVENT', 'PARTNER', 'OTHER'] as const;
const LEAD_STATUSES = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'MEETING_SCHEDULED', 'MEETING_DONE', 'DEMO_SCHEDULED',
  'DEMO_DONE', 'PROPOSAL_SENT', 'NEGOTIATION', 'ON_HOLD', 'WON', 'LOST', 'DISQUALIFIED',
] as const;
const LEAD_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export const createLeadSchema = z.object({
  companyId: z.string().uuid().optional().nullable(),
  companyName: z.string().max(255).optional(), // convenience: create-or-link company by name
  contactId: z.string().uuid().optional().nullable(),
  contact: z
    .object({
      firstName: z.string().min(1).max(150),
      lastName: z.string().min(1).max(150),
      designation: z.string().max(200).optional().nullable(),
      email: z.string().email().optional().nullable().or(z.literal('')),
      phone: z.string().max(30).optional().nullable(),
      city: z.string().max(120).optional().nullable(),
      state: z.string().max(120).optional().nullable(),
      country: z.string().max(120).optional().nullable(),
    })
    .optional(), // convenience: create contact inline

  campaignId: z.string().uuid().optional().nullable(),
  source: z.enum(LEAD_SOURCES).default('OTHER'),
  status: z.enum(LEAD_STATUSES).default('NEW'),
  priority: z.enum(LEAD_PRIORITIES).default('MEDIUM'),
  category: z.string().max(120).optional().nullable(),
  dealValue: z.coerce.number().optional().nullable(),
  currency: z.string().max(10).optional(),
  probability: z.coerce.number().min(0).max(100).optional().nullable(),
  expectedCloseDate: z.coerce.date().optional().nullable(),
  tags: z.array(z.string()).optional(),

  assignedToId: z.string().uuid().optional().nullable(),
  currentOwnerId: z.string().uuid().optional().nullable(),

  meetingDetails: z.string().max(5000).optional().nullable(),
  comments: z.string().max(5000).optional().nullable(),
  mom: z.string().max(10000).optional().nullable(),
  nextSteps: z.string().max(2000).optional().nullable(),
});

export const updateLeadSchema = createLeadSchema.partial().extend({
  lossReason: z.string().max(1000).optional().nullable(),
  actualCloseDate: z.coerce.date().optional().nullable(),
});

export const assignLeadSchema = z.object({
  assignedToId: z.string().uuid().optional().nullable(),
  currentOwnerId: z.string().uuid().optional().nullable(),
  note: z.string().max(1000).optional(),
});

export const changeStatusSchema = z.object({
  status: z.enum(LEAD_STATUSES),
  lossReason: z.string().max(1000).optional().nullable(),
  note: z.string().max(1000).optional(),
});

export const listLeadsQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  status: z.string().optional(), // comma-separated
  source: z.string().optional(),
  priority: z.string().optional(),
  campaignId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  currentOwnerId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  country: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const bulkAssignSchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1),
  assignedToId: z.string().uuid().optional().nullable(),
  currentOwnerId: z.string().uuid().optional().nullable(),
});
