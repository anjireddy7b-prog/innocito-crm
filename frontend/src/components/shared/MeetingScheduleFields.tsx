import { Controller } from 'react-hook-form';
import type { Control, UseFormRegister, FieldErrors, FieldValues, Path } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MeetingTimeZoneField } from '@/components/shared/MeetingTimeZoneField';
import type { MeetingScheduleFormValues } from '@/lib/leadFormOptions';

/**
 * Meeting Scheduled Date / Time / Time Zone — identical in the New Lead and Edit Lead forms.
 * On creation this optionally creates the lead's "Initial Meeting"; on edit it reschedules that
 * same meeting (or creates it if the lead never got one) — see leads.service.ts's updateLead().
 * The Time Zone field's country-dependent behavior (predefined US list vs. free text) comes from
 * MeetingTimeZoneField, reused as-is.
 */
export function MeetingScheduleFields<T extends FieldValues & MeetingScheduleFormValues>({
  control,
  register,
  errors,
  country,
}: {
  control: Control<T>;
  register: UseFormRegister<T>;
  errors?: FieldErrors<T>;
  country?: string | null;
}) {
  const timeError = errors?.meetingScheduledTime?.message as string | undefined;
  return (
    <div className="sm:col-span-2 space-y-4 rounded-md border border-border p-3">
      <p className="text-sm font-medium text-muted-foreground">Meeting schedule</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Meeting Scheduled Date</Label>
          <Input type="date" {...register('meetingScheduledDate' as Path<T>)} />
        </div>
        <div className="space-y-1.5">
          <Label>Meeting Scheduled Time</Label>
          <Input type="time" {...register('meetingScheduledTime' as Path<T>)} />
          {timeError && <p className="text-xs text-destructive">{timeError}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Meeting Time Zone</Label>
          <Controller
            control={control}
            name={'meetingTimeZone' as Path<T>}
            render={({ field }) => (
              <MeetingTimeZoneField country={country} value={(field.value as string) ?? ''} onChange={field.onChange} />
            )}
          />
        </div>
      </div>
    </div>
  );
}
