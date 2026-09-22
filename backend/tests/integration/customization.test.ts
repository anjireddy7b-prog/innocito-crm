import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_INSIDE_SALES, TEST_ORG_B_ADMIN, primaryPipelineStageIds, secondaryPipelineStageIds } from '../setup';

const app = createApp();

// Phase 4: the customization engine — tenant-scoped custom field definitions layered on top of
// leads.customFields (JSONB), and admin-editable pipeline-stage metadata mirroring the hardcoded
// lead_status enum. See db/schema.ts's customFieldDefinitions/pipelineStages tables and the
// Architecture Report's Phase 4 completion section.

let adminToken: string;
let insideSalesToken: string;
let orgBToken: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  adminToken = admin.body.data.accessToken;
  const insideSales = await request(app).post('/api/auth/login').send(TEST_INSIDE_SALES);
  insideSalesToken = insideSales.body.data.accessToken;
  const orgB = await request(app).post('/api/auth/login').send(TEST_ORG_B_ADMIN);
  orgBToken = orgB.body.data.accessToken;
});

describe('Custom field definitions', () => {
  let textFieldId: string;
  let selectFieldId: string;

  it('starts empty for a fresh organization', async () => {
    const res = await request(app).get('/api/custom-fields?entityType=LEAD').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('a caller without CUSTOM_FIELDS_MANAGE cannot create a definition (but can still view the list)', async () => {
    const view = await request(app).get('/api/custom-fields?entityType=LEAD').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(view.status).toBe(200);

    const create = await request(app)
      .post('/api/custom-fields')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ key: 'should_not_exist', label: 'Nope', fieldType: 'TEXT' });
    expect(create.status).toBe(403);
  });

  it('rejects a SELECT field with no options', async () => {
    const res = await request(app)
      .post('/api/custom-fields')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'bad_select', label: 'Bad Select', fieldType: 'SELECT', options: [] });
    expect(res.status).toBe(400);
  });

  it('an Admin can create a plain TEXT field and a required SELECT field', async () => {
    const text = await request(app)
      .post('/api/custom-fields')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'priority_note', label: 'Priority Note', fieldType: 'TEXT' });
    expect(text.status).toBe(201);
    expect(text.body.data.required).toBe(false);
    textFieldId = text.body.data.id;

    const select = await request(app)
      .post('/api/custom-fields')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'deal_size', label: 'Deal Size', fieldType: 'SELECT', options: ['Small', 'Medium', 'Large'], required: true });
    expect(select.status).toBe(201);
    selectFieldId = select.body.data.id;
  });

  it('rejects a second field with the same key for the same entity type', async () => {
    const res = await request(app)
      .post('/api/custom-fields')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'priority_note', label: 'Duplicate', fieldType: 'TEXT' });
    expect(res.status).toBe(409);
  });

  it('lists both fields, ordered by sortOrder then createdAt', async () => {
    const res = await request(app).get('/api/custom-fields?entityType=LEAD').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((f: any) => f.key)).toEqual(['priority_note', 'deal_size']);
  });

  it("org B never sees org A's custom field definitions", async () => {
    const res = await request(app).get('/api/custom-fields?entityType=LEAD').set('Authorization', `Bearer ${orgBToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('an Admin can rename a field and change its options', async () => {
    const res = await request(app)
      .patch(`/api/custom-fields/${selectFieldId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Deal Size (Renamed)', options: ['Small', 'Medium', 'Large', 'XL'] });
    expect(res.status).toBe(200);
    expect(res.body.data.label).toBe('Deal Size (Renamed)');
    expect(res.body.data.options).toEqual(['Small', 'Medium', 'Large', 'XL']);
  });

  it('rejects clearing the options on a SELECT field down to zero', async () => {
    const res = await request(app)
      .patch(`/api/custom-fields/${selectFieldId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ options: [] });
    expect(res.status).toBe(400);
  });

  describe('leads.customFields wiring', () => {
    it('rejects creating a lead that is missing the required deal_size field', async () => {
      const res = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${insideSalesToken}`)
        .send({ companyName: 'Custom Fields Test Co', customFields: { priority_note: 'Call back Monday' } });
      expect(res.status).toBe(400);
    });

    it('rejects an unknown custom field key', async () => {
      const res = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${insideSalesToken}`)
        .send({ companyName: 'Custom Fields Test Co', customFields: { deal_size: 'Medium', not_a_field: 'x' } });
      expect(res.status).toBe(400);
    });

    it('rejects a SELECT value outside the defined options', async () => {
      const res = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${insideSalesToken}`)
        .send({ companyName: 'Custom Fields Test Co', customFields: { deal_size: 'Gigantic' } });
      expect(res.status).toBe(400);
    });

    it('creates a lead with valid custom field values, and they round-trip on read', async () => {
      const created = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${insideSalesToken}`)
        .send({
          companyName: 'Custom Fields Test Co',
          customFields: { deal_size: 'Medium', priority_note: 'Call back Monday' },
        });
      expect(created.status).toBe(201);
      expect(created.body.data.customFields).toEqual({ deal_size: 'Medium', priority_note: 'Call back Monday' });

      const fetched = await request(app).get(`/api/leads/${created.body.data.id}`).set('Authorization', `Bearer ${insideSalesToken}`);
      expect(fetched.body.data.customFields).toEqual({ deal_size: 'Medium', priority_note: 'Call back Monday' });

      // Full-replace on update, same as `tags` — omitting customFields entirely leaves it as-is;
      // providing it replaces the whole bag.
      const unrelatedPatch = await request(app)
        .patch(`/api/leads/${created.body.data.id}`)
        .set('Authorization', `Bearer ${insideSalesToken}`)
        .send({ category: 'Enterprise' });
      expect(unrelatedPatch.status).toBe(200);
      expect(unrelatedPatch.body.data.customFields).toEqual({ deal_size: 'Medium', priority_note: 'Call back Monday' });

      const replaced = await request(app)
        .patch(`/api/leads/${created.body.data.id}`)
        .set('Authorization', `Bearer ${insideSalesToken}`)
        .send({ customFields: { deal_size: 'Large' } });
      expect(replaced.status).toBe(200);
      expect(replaced.body.data.customFields).toEqual({ deal_size: 'Large' });
    });
  });

  it('deletion is permission-gated and removes the definition', async () => {
    const forbidden = await request(app).delete(`/api/custom-fields/${textFieldId}`).set('Authorization', `Bearer ${insideSalesToken}`);
    expect(forbidden.status).toBe(403);

    const del = await request(app).delete(`/api/custom-fields/${textFieldId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/custom-fields?entityType=LEAD').set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.data.map((f: any) => f.key)).not.toContain('priority_note');
  });
});

describe('Pipeline stages', () => {
  it("seeds exactly today's 13 lead_status values per organization, with won/lost/terminal flags matching existing dashboard/leads business logic", async () => {
    const res = await request(app).get('/api/pipeline-stages').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(13);

    const byKey = Object.fromEntries(res.body.data.map((s: any) => [s.key, s]));
    expect(byKey.WON.isWon).toBe(true);
    expect(byKey.WON.isTerminal).toBe(true);
    expect(byKey.LOST.isLost).toBe(true);
    expect(byKey.LOST.isTerminal).toBe(true);
    expect(byKey.DISQUALIFIED.isTerminal).toBe(true);
    expect(byKey.DISQUALIFIED.isWon).toBe(false);
    expect(byKey.DISQUALIFIED.isLost).toBe(false);
    expect(byKey.NEW.isTerminal).toBe(false);
    expect(byKey.NEW.label).toBe('New');
    expect(byKey.MEETING_SCHEDULED.label).toBe('Meeting Scheduled');
  });

  it("org B has its own independent set of 13 stages, distinct row ids from org A's", async () => {
    const res = await request(app).get('/api/pipeline-stages').set('Authorization', `Bearer ${orgBToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(13);
    const ids = res.body.data.map((s: any) => s.id);
    expect(ids).not.toContain(primaryPipelineStageIds.WON);
    expect(ids).toContain(secondaryPipelineStageIds.WON);
  });

  it('a caller without PIPELINE_STAGES_MANAGE cannot edit a stage (but can still view the list)', async () => {
    const res = await request(app)
      .patch(`/api/pipeline-stages/${primaryPipelineStageIds.ON_HOLD}`)
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ label: 'Should Not Apply' });
    expect(res.status).toBe(403);
  });

  it('an Admin can rename a stage and reorder it', async () => {
    const res = await request(app)
      .patch(`/api/pipeline-stages/${primaryPipelineStageIds.ON_HOLD}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Paused', sortOrder: 99 });
    expect(res.status).toBe(200);
    expect(res.body.data.label).toBe('Paused');
    expect(res.body.data.sortOrder).toBe(99);
    expect(res.body.data.key).toBe('ON_HOLD'); // key is immutable
  });

  it('rejects marking the same stage both won and lost', async () => {
    const res = await request(app)
      .patch(`/api/pipeline-stages/${primaryPipelineStageIds.NEGOTIATION}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isWon: true, isLost: true });
    expect(res.status).toBe(400);
  });

  it('flipping isWon on also forces isTerminal on, even if not explicitly set', async () => {
    const res = await request(app)
      .patch(`/api/pipeline-stages/${primaryPipelineStageIds.NEGOTIATION}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isWon: true });
    expect(res.status).toBe(200);
    expect(res.body.data.isWon).toBe(true);
    expect(res.body.data.isTerminal).toBe(true);

    // Restore, so this doesn't leak into any other test relying on the default 13-stage shape.
    await request(app)
      .patch(`/api/pipeline-stages/${primaryPipelineStageIds.NEGOTIATION}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isWon: false, isTerminal: false });
  });

  it("a stage id from another organization is invisible (404, not a cross-tenant leak)", async () => {
    const res = await request(app)
      .patch(`/api/pipeline-stages/${secondaryPipelineStageIds.WON}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Should 404' });
    expect(res.status).toBe(404);
  });
});
