import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_INSIDE_SALES, TEST_ORG_B_ADMIN } from '../setup';

const app = createApp();

// Phase 5: tenant-defined custom objects — entities with their own schema-lite definition that
// reuse the exact custom-field-definition engine built in Phase 4 (see customFields.service.ts's
// entityType generalization and customObjects.service.ts's deleteCustomObjectDefinition explicit
// cleanup, since custom_field_definitions has no FK to custom_object_definitions).

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

describe('Custom object definitions', () => {
  let projectDefinitionId: string;

  it('starts empty for a fresh organization', async () => {
    const res = await request(app).get('/api/custom-objects').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('a caller without CUSTOM_OBJECTS_MANAGE cannot view or create', async () => {
    const view = await request(app).get('/api/custom-objects').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(view.status).toBe(403);

    const create = await request(app)
      .post('/api/custom-objects')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ key: 'project', singularLabel: 'Project', pluralLabel: 'Projects' });
    expect(create.status).toBe(403);
  });

  it('rejects a key that is not lowercase/snake_case', async () => {
    const res = await request(app)
      .post('/api/custom-objects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'Project', singularLabel: 'Project', pluralLabel: 'Projects' });
    expect(res.status).toBe(400);
  });

  it('rejects the reserved "lead" key', async () => {
    const res = await request(app)
      .post('/api/custom-objects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'lead', singularLabel: 'Lead', pluralLabel: 'Leads' });
    expect(res.status).toBe(400);
  });

  it('an Admin can create a custom object definition', async () => {
    const res = await request(app)
      .post('/api/custom-objects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'project', singularLabel: 'Project', pluralLabel: 'Projects', description: 'Delivery projects' });
    expect(res.status).toBe(201);
    expect(res.body.data.key).toBe('project');
    projectDefinitionId = res.body.data.id;
  });

  it('rejects a second definition with the same key for the same org', async () => {
    const res = await request(app)
      .post('/api/custom-objects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'project', singularLabel: 'Duplicate', pluralLabel: 'Duplicates' });
    expect(res.status).toBe(409);
  });

  it("org B never sees org A's custom object definitions, and can reuse the same key", async () => {
    const list = await request(app).get('/api/custom-objects').set('Authorization', `Bearer ${orgBToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual([]);

    const create = await request(app)
      .post('/api/custom-objects')
      .set('Authorization', `Bearer ${orgBToken}`)
      .send({ key: 'project', singularLabel: 'Project', pluralLabel: 'Projects' });
    expect(create.status).toBe(201);
  });

  it('an Admin can rename a definition; key stays immutable', async () => {
    const res = await request(app)
      .patch(`/api/custom-objects/${projectDefinitionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ singularLabel: 'Engagement', pluralLabel: 'Engagements' });
    expect(res.status).toBe(200);
    expect(res.body.data.singularLabel).toBe('Engagement');
    expect(res.body.data.key).toBe('project');
  });

  describe('custom fields on a custom object', () => {
    let statusFieldId: string;

    it('rejects a custom field pointed at a non-existent custom object key', async () => {
      const res = await request(app)
        .post('/api/custom-fields')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ entityType: 'not_a_real_object', key: 'status', label: 'Status', fieldType: 'TEXT' });
      expect(res.status).toBe(404);
    });

    it('an Admin can define a field on the "project" custom object', async () => {
      const res = await request(app)
        .post('/api/custom-fields')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          entityType: 'project',
          key: 'status',
          label: 'Status',
          fieldType: 'SELECT',
          options: ['Planned', 'Active', 'Done'],
          required: true,
        });
      expect(res.status).toBe(201);
      expect(res.body.data.entityType).toBe('project');
      statusFieldId = res.body.data.id;
    });

    it("a LEAD field and a 'project' field with the same key coexist independently", async () => {
      const leadField = await request(app)
        .post('/api/custom-fields')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ entityType: 'LEAD', key: 'status', label: 'Lead Status Note', fieldType: 'TEXT' });
      expect(leadField.status).toBe(201);

      const list = await request(app).get('/api/custom-fields?entityType=project').set('Authorization', `Bearer ${adminToken}`);
      expect(list.body.data.map((f: any) => f.key)).toEqual(['status']);
      expect(list.body.data[0].id).toBe(statusFieldId);
    });

    it('creating a record rejects a missing required field and an out-of-range SELECT value', async () => {
      const missing = await request(app)
        .post(`/api/custom-objects/${projectDefinitionId}/records`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ data: {} });
      expect(missing.status).toBe(400);

      const badValue = await request(app)
        .post(`/api/custom-objects/${projectDefinitionId}/records`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ data: { status: 'Cancelled' } });
      expect(badValue.status).toBe(400);
    });

    let recordId: string;

    it('creates a valid record and round-trips it on read', async () => {
      const created = await request(app)
        .post(`/api/custom-objects/${projectDefinitionId}/records`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ data: { status: 'Active' } });
      expect(created.status).toBe(201);
      expect(created.body.data.data).toEqual({ status: 'Active' });
      recordId = created.body.data.id;

      const fetched = await request(app)
        .get(`/api/custom-objects/${projectDefinitionId}/records/${recordId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(fetched.status).toBe(200);
      expect(fetched.body.data.data).toEqual({ status: 'Active' });
    });

    it('lists records for the definition with pagination metadata', async () => {
      const res = await request(app)
        .get(`/api/custom-objects/${projectDefinitionId}/records`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.total).toBe(1);
    });

    it('updates a record with full-replace semantics', async () => {
      const res = await request(app)
        .patch(`/api/custom-objects/${projectDefinitionId}/records/${recordId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ data: { status: 'Done' } });
      expect(res.status).toBe(200);
      expect(res.body.data.data).toEqual({ status: 'Done' });
    });

    it("a record id under org B's definition space is invisible (404, not a cross-tenant leak)", async () => {
      const orgBDefs = await request(app).get('/api/custom-objects').set('Authorization', `Bearer ${orgBToken}`);
      const orgBProjectId = orgBDefs.body.data[0].id;

      const res = await request(app)
        .get(`/api/custom-objects/${orgBProjectId}/records/${recordId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    it('deletes a record', async () => {
      const del = await request(app)
        .delete(`/api/custom-objects/${projectDefinitionId}/records/${recordId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(del.status).toBe(204);

      const list = await request(app)
        .get(`/api/custom-objects/${projectDefinitionId}/records`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(list.body.data).toHaveLength(0);
    });

    it('deleting the definition cascades its records and cleans up its field definitions', async () => {
      const secondRecord = await request(app)
        .post(`/api/custom-objects/${projectDefinitionId}/records`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ data: { status: 'Planned' } });
      expect(secondRecord.status).toBe(201);

      const del = await request(app).delete(`/api/custom-objects/${projectDefinitionId}`).set('Authorization', `Bearer ${adminToken}`);
      expect(del.status).toBe(204);

      const getGone = await request(app).get(`/api/custom-objects/${projectDefinitionId}`).set('Authorization', `Bearer ${adminToken}`);
      expect(getGone.status).toBe(404);

      // Its field definitions (entityType = 'project') must be gone too, since nothing FK-cascades
      // them (entityType is a plain string match, not a foreign key) — this is the explicit
      // cleanup deleteCustomObjectDefinition performs.
      const fields = await request(app).get('/api/custom-fields?entityType=project').set('Authorization', `Bearer ${adminToken}`);
      expect(fields.body.data).toEqual([]);

      // The LEAD field with the same key ('status') must be untouched.
      const leadFields = await request(app).get('/api/custom-fields?entityType=LEAD').set('Authorization', `Bearer ${adminToken}`);
      expect(leadFields.body.data.map((f: any) => f.key)).toContain('status');

      // A new custom object can now reuse the 'project' key, since it was fully freed.
      const recreated = await request(app)
        .post('/api/custom-objects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ key: 'project', singularLabel: 'Project', pluralLabel: 'Projects' });
      expect(recreated.status).toBe(201);
    });
  });
});
