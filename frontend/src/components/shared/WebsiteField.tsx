import type { UseFormRegister, FieldErrors, FieldValues, Path } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Positioned directly below Company Name in both the New Lead and Edit Lead forms (see
 * leadFormOptions.ts's websiteSchema-backed validation on the backend, mirrored loosely here).
 * Kept as its own component — separate from CompanyDetailsFields — specifically so its position
 * in the layout can't drift between the two forms.
 */
export function WebsiteField<T extends FieldValues & { website?: string }>({
  register,
  errors,
}: {
  register: UseFormRegister<T>;
  errors?: FieldErrors<T>;
}) {
  const message = errors?.website?.message as string | undefined;
  return (
    <div className="space-y-1.5 sm:col-span-2">
      <Label>Website</Label>
      <Input {...register('website' as Path<T>)} placeholder="acme.com" />
      {message && <p className="text-xs text-destructive">{message}</p>}
    </div>
  );
}
