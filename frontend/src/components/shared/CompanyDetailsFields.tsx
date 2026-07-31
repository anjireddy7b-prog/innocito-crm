import { Controller } from 'react-hook-form';
import type { Control, UseFormRegister, FieldErrors, FieldValues, Path } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { INDUSTRY_OPTIONS, COUNTRY_OPTIONS, type CompanyDetailsFormValues } from '@/lib/leadFormOptions';

/**
 * Industry / Revenue / Country / State — shared verbatim between the New Lead form and the Edit
 * Lead form (see leadFormOptions.ts's companyDetailsSchema) so both stay in lockstep as the
 * curated option lists evolve. Website is deliberately NOT part of this group — it's positioned
 * directly under Company Name via <WebsiteField /> in both forms instead.
 */
export function CompanyDetailsFields<T extends FieldValues & CompanyDetailsFormValues>({
  control,
  register,
  title = 'Company details',
}: {
  control: Control<T>;
  register: UseFormRegister<T>;
  errors?: FieldErrors<T>;
  title?: string;
}) {
  return (
    <div className="sm:col-span-2 space-y-4 rounded-md border border-border p-3">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Industry</Label>
          <Controller
            control={control}
            name={'industry' as Path<T>}
            render={({ field }) => (
              <Select
                value={(field.value as string) || '__none__'}
                onValueChange={(v) => field.onChange(v === '__none__' ? undefined : v)}
              >
                <SelectTrigger><SelectValue placeholder="Select industry…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {field.value && !(INDUSTRY_OPTIONS as readonly string[]).includes(field.value as string) && (
                    <SelectItem value={field.value as string}>{field.value as string}</SelectItem>
                  )}
                  {INDUSTRY_OPTIONS.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Revenue</Label>
          <Input type="number" min={0} {...register('revenue' as Path<T>)} placeholder="5000000" />
        </div>
        <div className="space-y-1.5">
          <Label>Country</Label>
          <Controller
            control={control}
            name={'country' as Path<T>}
            render={({ field }) => (
              <Select
                value={(field.value as string) || '__none__'}
                onValueChange={(v) => field.onChange(v === '__none__' ? undefined : v)}
              >
                <SelectTrigger><SelectValue placeholder="Select country…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {field.value && !(COUNTRY_OPTIONS as readonly string[]).includes(field.value as string) && (
                    <SelectItem value={field.value as string}>{field.value as string}</SelectItem>
                  )}
                  {COUNTRY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label>State</Label>
          <Input {...register('state' as Path<T>)} placeholder="Texas" />
        </div>
      </div>
    </div>
  );
}
