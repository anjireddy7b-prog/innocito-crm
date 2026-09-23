export type RoleName = 'ADMIN' | 'INSIDE_SALES' | 'SALES' | 'DELIVERY' | 'MANAGEMENT';

export type LeadSource = 'EMAIL' | 'LINKEDIN' | 'COLD_CALLING' | 'REFERRAL' | 'WEBSITE' | 'EVENT' | 'PARTNER' | 'OTHER';

export type LeadStatus =
  | 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'MEETING_SCHEDULED' | 'MEETING_DONE' | 'DEMO_SCHEDULED'
  | 'DEMO_DONE' | 'PROPOSAL_SENT' | 'NEGOTIATION' | 'ON_HOLD' | 'WON' | 'LOST' | 'DISQUALIFIED';

export type LeadPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type MeetingType = 'DISCOVERY' | 'DEMO' | 'FOLLOW_UP' | 'TECHNICAL' | 'NEGOTIATION' | 'CLOSING' | 'OTHER';
export type MeetingStatus = 'SCHEDULED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED' | 'RESCHEDULED';

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type DocumentType = 'PROPOSAL' | 'MOM' | 'PRESENTATION' | 'CONTRACT' | 'BROCHURE' | 'OTHER';

// Phase 9 ("advanced CRM" slice) — case management. Its own status/priority vocabulary, not
// reused from LeadStatus/LeadPriority — see backend/src/db/schema.ts's caseStatusEnum/
// casePriorityEnum comment for why.
export type CaseStatus = 'NEW' | 'OPEN' | 'PENDING' | 'ON_HOLD' | 'RESOLVED' | 'CLOSED';
export type CasePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

// Phase 9 ("advanced CRM" slice) — knowledge base.
export type ArticleStatus = 'DRAFT' | 'PUBLISHED';

export const LEAD_STATUSES: LeadStatus[] = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'MEETING_SCHEDULED', 'MEETING_DONE', 'DEMO_SCHEDULED',
  'DEMO_DONE', 'PROPOSAL_SENT', 'NEGOTIATION', 'ON_HOLD', 'WON', 'LOST', 'DISQUALIFIED',
];
export const LEAD_SOURCES: LeadSource[] = ['EMAIL', 'LINKEDIN', 'COLD_CALLING', 'REFERRAL', 'WEBSITE', 'EVENT', 'PARTNER', 'OTHER'];
export const LEAD_PRIORITIES: LeadPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const ROLE_NAMES: RoleName[] = ['ADMIN', 'INSIDE_SALES', 'SALES', 'DELIVERY', 'MANAGEMENT'];

export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role?: { name: RoleName } | RoleName;
}

export interface CompanySummary {
  id: string;
  name: string;
  domain?: string | null;
  industry?: string | null;
  country?: string | null;
  state?: string | null;
  website?: string | null;
  annualRevenue?: string | null;
}

export interface ContactSummary {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  designation?: string | null;
}

export interface CampaignSummary {
  id: string;
  name: string;
  code?: string | null;
}

export interface Lead {
  id: string;
  leadNumber: number;
  displayId: string;
  companyId: string | null;
  contactId: string | null;
  campaignId: string | null;
  source: LeadSource;
  status: LeadStatus;
  priority: LeadPriority;
  category: string | null;
  dealValue: string | null;
  currency: string;
  probability: number | null;
  expectedCloseDate: string | null;
  actualCloseDate: string | null;
  lossReason: string | null;
  tags: string[];
  // Phase 4: admin-defined extra fields (see api/customFields.ts). Always present (defaults to
  // {} at the DB layer), but typed loosely since its actual shape is org-defined data, not a
  // fixed schema.
  customFields: Record<string, unknown>;
  assignedToId: string | null;
  currentOwnerId: string | null;
  createdById: string | null;
  sdrId: string | null;
  createdBySdrId: string | null;
  leadReceivedDate: string;
  meetingDetails: string | null;
  emailResponse: string | null;
  mom: string | null;
  nextSteps: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  company: CompanySummary | null;
  contact: ContactSummary | null;
  campaign: CampaignSummary | null;
  assignedTo: UserSummary | null;
  currentOwner: UserSummary | null;
  createdBy: UserSummary | null;
  sdr: UserSummary | null;
  createdBySdr: UserSummary | null;
  _count?: { meetings: number; tasks: number; documents: number; leadComments: number };
  meetings?: Meeting[];
  tasks?: Task[];
  documents?: Document[];
  leadComments?: Comment[];
  activities?: Activity[];
}

// Phase 9 ("advanced CRM" slice) — sequences/email-calendar integration, Stage 3.
export type CalendarSyncStatus = 'NOT_CONNECTED' | 'SYNCED' | 'FAILED';

export interface Meeting {
  id: string;
  leadId: string;
  title: string;
  type: MeetingType;
  status: MeetingStatus;
  scheduledAt: string;
  durationMins: number;
  location: string | null;
  attendees: string[];
  mom: string | null;
  outcome: string | null;
  timeZone: string | null;
  createdAt: string;
  // Stage 3: calendar sync to the meeting's creator's own connected Google/Microsoft calendar
  // (one-way, CRM → calendar). See lib/permissions.ts's SEQUENCES_MANAGE-adjacent comments and
  // backend/src/utils/calendarSync.ts for the full design.
  externalCalendarProvider: 'GOOGLE' | 'MICROSOFT' | null;
  externalEventId: string | null;
  calendarSyncStatus: CalendarSyncStatus;
  calendarSyncError: string | null;
}

export interface Task {
  id: string;
  leadId: string | null;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignedToId: string | null;
  assignedTo?: UserSummary | null;
  completedAt: string | null;
  createdAt: string;
}

export interface Document {
  id: string;
  leadId: string | null;
  companyId: string | null;
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  documentType: DocumentType;
  uploadedBy?: UserSummary | null;
  createdAt: string;
}

export interface Comment {
  id: string;
  leadId: string;
  userId: string;
  body: string;
  editedAt: string | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; avatarUrl?: string | null };
}

export interface Activity {
  id: string;
  type: string;
  description: string;
  metadata: Record<string, unknown> | null;
  leadId: string | null;
  userId: string | null;
  user?: { id: string; firstName: string; lastName: string; avatarUrl?: string | null } | null;
  createdAt: string;
}

export interface Company {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  companySize: string | null;
  annualRevenue: string | null;
  phone: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  linkedinUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { leads: number; contacts: number; documents?: number };
  contacts?: ContactSummary[];
  leads?: Lead[];
}

export interface Contact {
  id: string;
  companyId: string | null;
  firstName: string;
  lastName: string;
  designation: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  isPrimary: boolean;
  notes: string | null;
  createdAt: string;
  company?: CompanySummary | null;
  leads?: Lead[];
}

export interface CaseComment {
  id: string;
  caseId: string;
  userId: string;
  body: string;
  editedAt: string | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; avatarUrl?: string | null };
}

export interface Case {
  id: string;
  displayId: string;
  caseNumber: number;
  subject: string;
  description: string | null;
  status: CaseStatus;
  priority: CasePriority;
  companyId: string | null;
  contactId: string | null;
  assignedToId: string | null;
  createdById: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  company?: CompanySummary | null;
  contact?: ContactSummary | null;
  assignedTo?: UserSummary | null;
  createdBy?: UserSummary | null;
  comments?: CaseComment[];
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  category: string | null;
  tags: string[];
  content: string;
  status: ArticleStatus;
  createdById: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: UserSummary | null;
}

// Phase 9 ("advanced CRM" slice) — sequences, Stage 2 (built on Stage 1's OAuth connection
// infrastructure — see api/integrations.ts). SEQUENCES_MANAGE gates the whole module including
// viewing (no "anyone can view" carve-out like Cases/Knowledge Base) — see that permission's own
// comment in lib/permissions.ts.
export type SequenceStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type SequenceEnrollmentStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'EXITED';

export interface SequenceStep {
  id: string;
  sequenceId: string;
  stepOrder: number;
  // Business days after the previous step was sent (or after enrollment, for the first step). 0
  // is valid — see backend/src/utils/sequenceScheduling.ts.
  delayDays: number;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface Sequence {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  status: SequenceStatus;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
  // Present only on the list endpoint (GET /sequences) — see sequences.service.ts's listSequences.
  stepCount?: number;
  // Present on both the list endpoint and a single sequence's detail.
  activeEnrollmentCount?: number;
  // Present only on a single sequence's detail — GET/POST/PATCH /sequences/:id and every steps
  // mutation all return the full sequence via getSequenceById.
  steps?: SequenceStep[];
}

export interface SequenceEnrollment {
  id: string;
  organizationId: string;
  sequenceId: string;
  leadId: string;
  enrolledById: string | null;
  status: SequenceEnrollmentStatus;
  currentStepId: string | null;
  nextSendAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  exitedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Present only on the list endpoint (GET /sequences/:id/enrollments) — see
  // sequences.service.ts's listEnrollments/serializeEnrollment.
  lead?: { id: string; leadNumber: number; displayId: string; contact: ContactSummary | null } | null;
  enrolledBy?: UserSummary | null;
  currentStep?: { id: string; stepOrder: number; subject: string } | null;
}

export interface Campaign {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  budget: string | null;
  createdAt: string;
  _count?: { leads: number };
  leads?: Lead[];
}

export interface AppUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  jobTitle: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  // Phase 3: roles are tenant-scoped, admin-editable data — an organization can rename or create
  // roles freely, so this can no longer be the fixed RoleName union (see api/roles.ts's Role type,
  // updated the same way, and UserFormDialog.tsx, which now drives its role picker off the org's
  // actual /roles list rather than the hardcoded ROLE_NAMES array below). RoleName/ROLE_NAMES stay
  // as they are for the handful of other call sites that key business rules off specific default
  // role names (e.g. lead-creation's SDR/rep pickers) — a deliberate, documented scope limit for
  // this phase; those are unaffected by a custom role and keep working exactly as before.
  role: { id: string; name: string };
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  leadId: string | null;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValues: unknown;
  newValues: unknown;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string } | null;
}

export interface DashboardSummary {
  kpis: {
    totalLeads: number;
    qualifiedLeads: number;
    meetingsCount: number;
    opportunities: number;
    wins: number;
    losses: number;
    conversionRate: number;
  };
  pipelineByStatus: { status: string; count: number }[];
  leadSourceAnalytics: { source: string; count: number }[];
  countryDistribution: { country: string | null; count: number }[];
  campaignPerformance: { id: string; name: string; code: string | null; totalLeads: number; won: number; lost: number }[];
  representativePerformance: { userId: string; name: string; role: string; totalLeads: number; won: number; lost: number; inProgress: number }[];
  monthlyTrends: { month: string; count: number }[];
  appliedPeriod?: { period: 'all' | 'year' | 'quarter' | 'month'; year?: number; quarter?: number; month?: number; label: string };
}
