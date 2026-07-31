import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { US_TIMEZONE_OPTIONS, MANUAL_TIMEZONE_OPTION } from '@/lib/leadFormOptions';

/**
 * Meeting Time Zone picker. Business rule: USA leads get the predefined US timezone
 * dropdown (EST/CST/MST/PST, plus a "Manual Entry" escape hatch); any other Country
 * automatically switches straight to a free-text field, since the app doesn't maintain
 * a curated timezone list for the rest of the world.
 */
export function MeetingTimeZoneField({
  country,
  value,
  onChange,
}: {
  country?: string | null;
  value: string;
  onChange: (v: string) => void;
}) {
  const isUsa = country === 'USA';
  const isPredefined = (US_TIMEZONE_OPTIONS as readonly string[]).includes(value);
  const [manualMode, setManualMode] = useState(!isUsa || (!!value && !isPredefined));

  // Country changed after the field was already touched — re-derive the mode instead of
  // leaving a stale US timezone code selected for a lead that's no longer US-based.
  useEffect(() => {
    if (!isUsa) {
      setManualMode(true);
    } else if (!value) {
      setManualMode(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUsa]);

  if (!isUsa) {
    return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. IST, GMT+2, AEST…" />;
  }

  return (
    <div className="space-y-1.5">
      <Select
        value={manualMode ? MANUAL_TIMEZONE_OPTION : value || undefined}
        onValueChange={(v) => {
          if (v === MANUAL_TIMEZONE_OPTION) {
            setManualMode(true);
            onChange('');
          } else {
            setManualMode(false);
            onChange(v);
          }
        }}
      >
        <SelectTrigger><SelectValue placeholder="Select time zone…" /></SelectTrigger>
        <SelectContent>
          {US_TIMEZONE_OPTIONS.map((tz) => (
            <SelectItem key={tz} value={tz}>{tz}</SelectItem>
          ))}
          <SelectItem value={MANUAL_TIMEZONE_OPTION}>{MANUAL_TIMEZONE_OPTION}</SelectItem>
        </SelectContent>
      </Select>
      {manualMode && (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Type the time zone…" />
      )}
    </div>
  );
}
