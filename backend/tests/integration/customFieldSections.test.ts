import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN } from '../setup';

const app = createApp();

// Phase 6: dynamic forms/layouts, scoped to the custom-fields layer shared by leads and custom
// objects — an optional, free-text `section` on a custom field definition groups it under a named
// heading on its form (see db/schema.ts's `section` column comment and
// frontend/src/components/shared/CustomFieldsSection.tsx's grouping logic). Deliberately additive:
// every field that existed before this column has `section: null` and renders exactly as before
// (one flat, unlabeled group) — nothing about the built-in Lead form itself changes this phase.

let adminToken: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  adminToken = admin.body.data.accessToken;
});

describe('Custom field sections', () => {
  it('a field created with no section defaults to null (today\'s exact behavior)', async () => {
    const res = await request(app)
      .post('/api/custom-fields')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'no_section_field', label: 'No Section', fieldType: 'TEXT' });
    expect(res.status).toBe(201);
    expect(res.body.data.section).toBeNull();
  });

  it('a field can be created with a named section, and it round-trips on read', async () => {
    const res = await request(app)
      .post('/api/custom-fields')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'preferred_channel', label: 'Preferred Channel', fieldType: 'TEXT', section: 'Contact Preferences' });
    expect(res.status).toBe(201);
    expect(res.body.data.section).toBe('Contact Preferences');

    const list = await request(app).get('/api/custom-fields?entityType=LEAD').set('Authorization', `Bearer ${adminToken}`);
    const found = list.body.data.find((f: any) => f.key === 'preferred_channel');
    expect(found.section).toBe('Contact Preferences');
  });

  it('rejects an empty-string section (use null to mean ungrouped)', async () => {
    const res = await request(app)
      .post('/api/custom-fields')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'bad_section_field', label: 'Bad Section', fieldType: 'TEXT', section: '' });
    expect(res.status).toBe(400);
  });

  it('multiple fields can share the same section string', async () => {
    const second = await request(app)
      .post('/api/custom-fields')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'best_time_to_call', label: 'Best Time to Call', fieldType: 'TEXT', section: 'Contact Preferences' });
    expect(second.status).toBe(201);

    const list = await request(app).get('/api/custom-fields?entityType=LEAD').set('Authorization', `Bearer ${adminToken}`);
    const sectioned = list.body.data.filter((f: any) => f.section === 'Contact Preferences');
    expect(sectioned.map((f: any) => f.key).sort()).toEqual(['best_time_to_call', 'preferred_channel']);
  });

  it('an existing field\'s section can be set, changed, and cleared back to null', async () => {
    const create = await request(app)
      .post('/api/custom-fields')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'movable_field', label: 'Movable', fieldType: 'TEXT' });
    const id = create.body.data.id;
    expect(create.body.data.section).toBeNull();

    const setSection = await request(app)
      .patch(`/api/custom-fields/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ section: 'Deal Details' });
    expect(setSection.status).toBe(200);
    expect(setSection.body.data.section).toBe('Deal Details');

    // Omitting `section` entirely on an update leaves it as-is.
    const unrelatedUpdate = await request(app)
      .patch(`/api/custom-fields/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Movable (Renamed)' });
    expect(unrelatedUpdate.status).toBe(200);
    expect(unrelatedUpdate.body.data.section).toBe('Deal Details');

    const clearSection = await request(app)
      .patch(`/api/custom-fields/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ section: null });
    expect(clearSection.status).toBe(200);
    expect(clearSection.body.data.section).toBeNull();
  });
});
