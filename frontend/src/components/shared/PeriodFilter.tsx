import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type PeriodType = 'all' | 'year' | 'quarter' | 'month';

export interface PeriodFilterValue {
  period: PeriodType;
  year?: number;
  quarter?: number;
  month?: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const YEARS_BACK = 6;

function currentYear() {
  return new Date().getFullYear();
}

function currentQuarter() {
  return Math.floor(new Date().getMonth() / 3) + 1;
}

function currentMonth() {
  return new Date().getMonth() + 1;
}

function yearOptions() {
  const y = currentYear();
  return Array.from({ length: YEARS_BACK + 1 }, (_, i) => y - i);
}

/** Yearly / Quarterly / Monthly filter for the Dashboard & Reports pages. Defaults each sub-select
 * to the current year/quarter/month the first time its period type is selected. */
export function PeriodFilter({ value, onChange }: { value: PeriodFilterValue; onChange: (v: PeriodFilterValue) => void }) {
  function handlePeriodChange(period: PeriodType) {
    if (period === 'all') {
      onChange({ period: 'all' });
      return;
    }
    if (period === 'year') {
      onChange({ period, year: value.year ?? currentYear() });
      return;
    }
    if (period === 'quarter') {
      onChange({ period, year: value.year ?? currentYear(), quarter: value.quarter ?? currentQuarter() });
      return;
    }
    onChange({ period, year: value.year ?? currentYear(), month: value.month ?? currentMonth() });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value.period} onValueChange={(v) => handlePeriodChange(v as PeriodType)}>
        <SelectTrigger className="w-36"><SelectValue placeholder="Period" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Time</SelectItem>
          <SelectItem value="year">Yearly</SelectItem>
          <SelectItem value="quarter">Quarterly</SelectItem>
          <SelectItem value="month">Monthly</SelectItem>
        </SelectContent>
      </Select>

      {(value.period === 'year' || value.period === 'quarter' || value.period === 'month') && (
        <Select value={String(value.year ?? currentYear())} onValueChange={(v) => onChange({ ...value, year: Number(v) })}>
          <SelectTrigger className="w-24"><SelectValue placeholder="Year" /></SelectTrigger>
          <SelectContent>
            {yearOptions().map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {value.period === 'quarter' && (
        <Select value={String(value.quarter ?? currentQuarter())} onValueChange={(v) => onChange({ ...value, quarter: Number(v) })}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Quarter" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Q1 (Jan-Mar)</SelectItem>
            <SelectItem value="2">Q2 (Apr-Jun)</SelectItem>
            <SelectItem value="3">Q3 (Jul-Sep)</SelectItem>
            <SelectItem value="4">Q4 (Oct-Dec)</SelectItem>
          </SelectContent>
        </Select>
      )}

      {value.period === 'month' && (
        <Select value={String(value.month ?? currentMonth())} onValueChange={(v) => onChange({ ...value, month: Number(v) })}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent>
            {MONTH_NAMES.map((m, i) => (
              <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
