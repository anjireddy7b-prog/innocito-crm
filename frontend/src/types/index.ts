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
  assignedToId: string | null;
  currentOwnerId: string | null;
  createdById: string | null;
  meetingDetails: string | null;
  comments: string | null;
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
  _count?: { meetings: number; tasks: number; documents: number; leadComments: number };
  meetings?: Meeting[];
  tasks?: Task[];
  documents?: Document[];
  leadComments?: Comment[];
  activities?: Activity[];
}

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
  createdAt: string;
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
  role: { id: string; name: RoleName };
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
