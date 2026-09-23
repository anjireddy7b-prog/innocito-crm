import { z } from 'zod';

// Phase 9 ("advanced CRM" slice — see duplicates.service.ts's own comment for the scope decision):
// duplicate detection & merge, scoped to Companies and Contacts only. Leads are deliberately
// excluded — a Lead carries pipeline/status state (and its own meetings/tasks/documents/comments)
// that doesn't merge cleanly the way an address-book-style record does; two leads that look like
// duplicates are better resolved by a rep manually closing one, not an automated merge.
export const duplicateEntityTypeSchema = z.enum(['COMPANY', 'CONTACT']);
export type DuplicateEntityType = z.infer<typeof duplicateEntityTypeSchema>;

export const listDuplicatesQuerySchema = z.object({
  entityType: duplicateEntityTypeSchema,
});

export const mergeDuplicatesSchema = z
  .object({
    entityType: duplicateEntityTypeSchema,
    // The record that survives the merge — keeps its id, gains the duplicate's children.
    survivorId: z.string().uuid(),
    // The record that gets deleted once its children are reassigned to survivorId.
    duplicateId: z.string().uuid(),
  })
  .refine((v) => v.survivorId !== v.duplicateId, {
    message: 'survivorId and duplicateId must be different records',
    path: ['duplicateId'],
  });
