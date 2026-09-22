-- Phase 4, data migration (no destructive schema changes — see 0014 and the Architecture
-- Report's Phase 4 completion section). Gives every existing organization (the original seeded
-- org, and any organization created since via self-service signup) its own copy of the 13
-- pipeline stages that exactly reproduce today's hardcoded `lead_status` enum — same keys, same
-- order, and won/lost/terminal flags matching the exact semantics already load-bearing in
-- dashboard.service.ts (WON/LOST counts) and leads.service.ts (the isTerminal set used to gate
-- lossReason and close-date handling on status change):
--   isWon   -> WON only
--   isLost  -> LOST only
--   isTerminal -> WON, LOST, DISQUALIFIED
--
-- This does NOT change `leads.status` or any business logic — it only seeds new, independent
-- metadata rows an org admin can rename/reorder/toggle from here on. Any organization created
-- after this migration runs gets the same 13 rows via the app-code helper
-- utils/defaultPipelineStages.ts (seedDefaultPipelineStagesForOrganization), called from both
-- db/seed.ts and organizations.service.ts's signup() — mirroring how seedDefaultRolesForOrganization
-- covers roles in Phase 3.
--
-- Idempotent — safe to re-run: ON CONFLICT on the (organization_id, key) unique index means an
-- organization that already has its 13 rows is left untouched.

INSERT INTO "pipeline_stages" ("id", "organization_id", "key", "label", "sort_order", "is_won", "is_lost", "is_terminal", "created_at", "updated_at")
SELECT gen_random_uuid(), o."id", v.key, v.label, v.sort_order, v.is_won, v.is_lost, v.is_terminal, now(), now()
FROM "organizations" o
CROSS JOIN (
  VALUES
    ('NEW',                 'New',                 0,  false, false, false),
    ('CONTACTED',           'Contacted',           1,  false, false, false),
    ('QUALIFIED',           'Qualified',           2,  false, false, false),
    ('MEETING_SCHEDULED',   'Meeting Scheduled',   3,  false, false, false),
    ('MEETING_DONE',        'Meeting Done',        4,  false, false, false),
    ('DEMO_SCHEDULED',      'Demo Scheduled',      5,  false, false, false),
    ('DEMO_DONE',           'Demo Done',           6,  false, false, false),
    ('PROPOSAL_SENT',       'Proposal Sent',       7,  false, false, false),
    ('NEGOTIATION',         'Negotiation',         8,  false, false, false),
    ('ON_HOLD',             'On Hold',             9,  false, false, false),
    ('WON',                 'Won',                 10, true,  false, true),
    ('LOST',                'Lost',                11, false, true,  true),
    ('DISQUALIFIED',        'Disqualified',        12, false, false, true)
) AS v("key", "label", "sort_order", "is_won", "is_lost", "is_terminal")
ON CONFLICT ("organization_id", "key") DO NOTHING;
