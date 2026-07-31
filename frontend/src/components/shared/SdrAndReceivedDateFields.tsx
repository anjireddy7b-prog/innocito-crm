import { Controller } from 'react-hook-form';
import type { Control, UseFormRegister, FieldErrors, FieldValues, Path } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPicker } from '@/components/shared/UserPicker';

/**
 * SDR Name + Lead Received Date — identical in the New Lead and Edit Lead forms. SDR always
 * reflects the live set of active Inside Sales users (via UserPicker → /users/assignable), never
 * a hardcoded list. Lead Received Date defaults to today on creation (see todayDateInputValue in
 * leadFormOptions.ts) and stays freely editable afterward for authorized users.
 */
export function SdrAndReceivedDateFields<T extends FieldValues & { sdrId?: string | null; leadReceivedDate?: string }>({
  control,
  register,
  errors,
  required = false,
}: {
  control: Control<T>;
  register: UseFormRegister<T>;
  errors?: FieldErrors<T>;
  required?: boolean;
}) {
  const dateError = errors?.leadReceivedDate?.message as string | undefined;
  return (
    <>
      <div className="space-y-1.5">
        <Label>SDR Name</Label>
        <Controller
          control={control}
          name={'sdrId' as Path<T>}
          render={({ field }) => (
            <UserPicker value={field.value as string | null} onChange={field.onChange} roles={['INSIDE_SALES']} placeholder="Select SDR…" />
          )}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Lead Received Date{required ? ' *' : ''}</Label>
        <Input type="date" {...register('leadReceivedDate' as Path<T>)} />
        {dateError && <p className="text-xs text-destructive">{dateError}</p>}
      </div>
    </>
  );
}
