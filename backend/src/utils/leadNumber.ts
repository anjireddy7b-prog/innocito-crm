export function formatLeadNumber(seq: number): string {
  return `LD-${String(seq).padStart(6, '0')}`;
}

/** Parses "LD-000123", "ld000123" or a bare "123" back into the numeric sequence, or null if unparseable. */
export function parseLeadNumber(input: string): number | null {
  const digits = input.replace(/\D/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}
