import fs from 'fs';
import path from 'path';
import { Request } from 'express';
import { and, desc, eq, SQL } from 'drizzle-orm';
import { db } from '@/config/db';
import { documents } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { recordActivity } from '@/utils/activityLogger';
import { env } from '@/config/env';

export async function listDocuments(query: { leadId?: string; companyId?: string }) {
  const conditions: SQL[] = [];
  if (query.leadId) conditions.push(eq(documents.leadId, query.leadId));
  if (query.companyId) conditions.push(eq(documents.companyId, query.companyId));

  return db.query.documents.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: desc(documents.createdAt),
    with: { uploadedBy: { columns: { id: true, firstName: true, lastName: true } } },
  });
}

export async function uploadDocument(
  req: Request,
  file: Express.Multer.File,
  input: { leadId?: string; companyId?: string; documentType?: string }
) {
  if (!input.leadId && !input.companyId) throw ApiError.badRequest('A document must be linked to a lead or company');

  const [document] = await db
    .insert(documents)
    .values({
      leadId: input.leadId,
      companyId: input.companyId,
      fileName: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storagePath: `/uploads/${file.filename}`,
      documentType: (input.documentType as any) ?? 'OTHER',
      uploadedById: req.user!.sub,
    })
    .returning();

  if (input.leadId) {
    await recordActivity({
      type: 'DOCUMENT_UPLOADED',
      description: `Document "${file.originalname}" uploaded`,
      leadId: input.leadId,
      userId: req.user!.sub,
    });
  }
  await recordAudit({ req, action: 'CREATE', entityType: 'Document', entityId: document.id, newValues: document });
  return document;
}

export async function deleteDocument(req: Request, id: string) {
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, id) });
  if (!doc) throw ApiError.notFound('Document not found');

  const filePath = path.join(path.resolve(env.UPLOAD_DIR), doc.fileName);
  await fs.promises.unlink(filePath).catch(() => undefined);

  await db.delete(documents).where(eq(documents.id, id));
  await recordAudit({ req, action: 'DELETE', entityType: 'Document', entityId: id, oldValues: doc });
}
