import { z } from 'zod';

// Lowercase letters, digits, and single hyphens, matching what generateSlug() below produces —
// enforced on explicit user input too so a hand-typed slug can never end up in a shape the app
// wouldn't otherwise generate (leading/trailing hyphen, double hyphen, uppercase, etc.).
const slugSchema = z
  .string()
  .min(2, 'Slug must be at least 2 characters')
  .max(63, 'Slug must be at most 63 characters')
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug can only contain lowercase letters, numbers, and hyphens');

export const signupSchema = z.object({
  organizationName: z.string().trim().min(2, 'Organization name must be at least 2 characters').max(200),
  // Optional — the service derives one from organizationName when omitted. Accepting it lets a
  // signer pick their own subdomain-style handle instead of whatever auto-slugify produces.
  slug: slugSchema.optional(),
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'Organization name must be at least 2 characters').max(200).optional(),
  slug: slugSchema.optional(),
}).refine((data) => data.name !== undefined || data.slug !== undefined, {
  message: 'Provide at least one field to update',
});
