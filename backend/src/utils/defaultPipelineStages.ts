/**
 * Phase 4 (see migration 0015 and the Architecture Report's Phase 4 completion section): creates
 * one organization's own independent copies of the 13 pipeline stages that exactly reproduce
 * today's hardcoded `lead_status` enum — same keys, same order, same won/lost/terminal
 * semantics already load-bearing in dashboard.service.ts and leads.service.ts.
 *
 * This is the application-code half of pipeline-stage seeding, mirroring
 * utils/defaultRoles.ts's seedDefaultRolesForOrganization() exactly: migration 0015 gave every
 * *existing* organization its 13 rows; this helper is what gives every *new* organization
 * (created via db/seed.ts for a fresh dev DB, or organizations.service.ts's signup() for a
 * self-service org) the same independent set from the moment it's created.
 *
 * Idempotent and safe to call more than once for the same organization: an existing stage
 * (matched by organizationId + key) is left untouched rather than duplicated.
 *
 * `leads.status` itself is NOT driven by this table yet — see the comment on the
 * `pipelineStages` table in db/schema.ts for why that cutover is a deliberate, separate,
 * not-yet-scheped step. Labels are generated with a local title-case helper since this app has
 * no separate lead-status label dictionary — the UI has always humanized the raw enum key at
 * render time (see StatusBadge.tsx / lib/utils.ts's humanizeEnum), and this keeps that in sync.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { pipelineStages } from '@/db/schema';

// Mirrors backend/src/db/schema.ts's `leadStatusEnum` — same 13 values, in the same order — plus
// the exact won/lost/terminal semantics from leads.service.ts's `isTerminal` set
// (['WON', 'LOST', 'DISQUALIFIED']) and dashboard.service.ts's WON/LOST count queries.
export const DEFAULT_LEAD_STAGES: Array<{ key: string; isWon: boolean; isLost: boolean; isTerminal: boolean }> = [
  { key: 'NEW', isWon: false, isLost: false, isTerminal: false },
  { key: 'CONTACTED', isWon: false, isLost: false, isTerminal: false },
  { key: 'QUALIFIED', isWon: false, isLost: false, isTerminal: false },
  { key: 'MEETING_SCHEDULED', isWon: false, isLost: false, isTerminal: false },
  { key: 'MEETING_DONE', isWon: false, isLost: false, isTerminal: false },
  { key: 'DEMO_SCHEDULED', isWon: false, isLost: false, isTerminal: false },
  { key: 'DEMO_DONE', isWon: false, isLost: false, isTerminal: false },
  { key: 'PROPOSAL_SENT', isWon: false, isLost: false, isTerminal: false },
  { key: 'NEGOTIATION', isWon: false, isLost: false, isTerminal: false },
  { key: 'ON_HOLD', isWon: false, isLost: false, isTerminal: false },
  { key: 'WON', isWon: true, isLost: false, isTerminal: true },
  { key: 'LOST', isWon: false, isLost: true, isTerminal: true },
  { key: 'DISQUALIFIED', isWon: false, isLost: false, isTerminal: true },
];

// Same title-casing StatusBadge.tsx / humanizeEnum() apply at render time — "MEETING_SCHEDULED"
// -> "Meeting Scheduled" — kept here as a small local copy rather than importing frontend code.
function humanizeStageKey(key: string): string {
  return key
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

type PipelineStage = typeof pipelineStages.$inferSelect;

export async function seedDefaultPipelineStagesForOrganization(organizationId: string): Promise<PipelineStage[]> {
  const result: PipelineStage[] = [];

  for (let i = 0; i < DEFAULT_LEAD_STAGES.length; i++) {
    const def = DEFAULT_LEAD_STAGES[i];
    let stage = await db.query.pipelineStages.findFirst({
      where: and(eq(pipelineStages.organizationId, organizationId), eq(pipelineStages.key, def.key)),
    });
    if (!stage) {
      const [created] = await db
        .insert(pipelineStages)
        .values({
          organizationId,
          key: def.key,
          label: humanizeStageKey(def.key),
          sortOrder: i,
          isWon: def.isWon,
          isLost: def.isLost,
          isTerminal: def.isTerminal,
        })
        .returning();
      stage = created;
    }
    result.push(stage);
  }

  return result;
}
