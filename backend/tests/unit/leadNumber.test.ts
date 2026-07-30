import { describe, it, expect } from 'vitest';
import { formatLeadNumber, parseLeadNumber } from '@/utils/leadNumber';

describe('leadNumber utils', () => {
  it('formats a sequence number with the LD- prefix and zero-padding', () => {
    expect(formatLeadNumber(1)).toBe('LD-000001');
    expect(formatLeadNumber(123)).toBe('LD-000123');
    expect(formatLeadNumber(999999)).toBe('LD-999999');
  });

  it('parses a formatted lead number back into its numeric sequence', () => {
    expect(parseLeadNumber('LD-000123')).toBe(123);
    expect(parseLeadNumber('ld000123')).toBe(123);
    expect(parseLeadNumber('123')).toBe(123);
  });

  it('returns null for input with no digits', () => {
    expect(parseLeadNumber('LD-')).toBeNull();
    expect(parseLeadNumber('abc')).toBeNull();
  });
});
