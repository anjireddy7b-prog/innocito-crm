import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges Tailwind class lists safely (later classes win over conflicting earlier ones). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(firstName?: string | null, lastName?: string | null): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

export function formatCurrency(value: number | string | null | undefined, currency = 'USD'): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(num)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(num);
}

export function formatDate(value: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', opts ?? { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatRelativeTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const divisions: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60],
  ];
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, secondsInUnit] of divisions) {
    if (Math.abs(seconds) >= secondsInUnit) return rtf.format(Math.round(seconds / secondsInUnit), unit);
  }
  return rtf.format(seconds, 'second');
}

export function humanizeEnum(value?: string | null): string {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}
