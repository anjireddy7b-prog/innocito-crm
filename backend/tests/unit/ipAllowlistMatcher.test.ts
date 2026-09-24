import { describe, it, expect } from 'vitest';
import { ipMatchesCidr, isValidCidr } from '@/utils/ipAllowlist';

// Phase 15 (security hardening) — pure-function tests for the IPv4 CIDR matcher, no DB/cache
// involved (see ipAllowlist.test.ts for the CRUD + enforcement integration tests, which exercise
// isIpAllowed itself against the real test database).

describe('isValidCidr', () => {
  it('accepts a plain IPv4 address (implicit /32)', () => {
    expect(isValidCidr('203.0.113.5')).toBe(true);
  });

  it('accepts a CIDR range', () => {
    expect(isValidCidr('203.0.113.0/24')).toBe(true);
  });

  it('accepts the /0 and /32 boundaries', () => {
    expect(isValidCidr('0.0.0.0/0')).toBe(true);
    expect(isValidCidr('203.0.113.5/32')).toBe(true);
  });

  it('rejects a malformed address', () => {
    expect(isValidCidr('not-an-ip')).toBe(false);
    expect(isValidCidr('999.0.0.1')).toBe(false);
    expect(isValidCidr('1.2.3')).toBe(false);
    expect(isValidCidr('1.2.3.4.5')).toBe(false);
    expect(isValidCidr('')).toBe(false);
  });

  it('rejects an out-of-range or non-numeric prefix', () => {
    expect(isValidCidr('203.0.113.0/33')).toBe(false);
    expect(isValidCidr('203.0.113.0/-1')).toBe(false);
    expect(isValidCidr('203.0.113.0/abc')).toBe(false);
  });
});

describe('ipMatchesCidr', () => {
  it('matches an exact single-host entry (no /prefix)', () => {
    expect(ipMatchesCidr('203.0.113.5', '203.0.113.5')).toBe(true);
    expect(ipMatchesCidr('203.0.113.6', '203.0.113.5')).toBe(false);
  });

  it('matches within a /24 and excludes outside it', () => {
    expect(ipMatchesCidr('203.0.113.200', '203.0.113.0/24')).toBe(true);
    expect(ipMatchesCidr('203.0.114.1', '203.0.113.0/24')).toBe(false);
  });

  it('/0 matches everything', () => {
    expect(ipMatchesCidr('1.2.3.4', '0.0.0.0/0')).toBe(true);
    expect(ipMatchesCidr('255.255.255.255', '0.0.0.0/0')).toBe(true);
  });

  it('/32 matches only the exact address', () => {
    expect(ipMatchesCidr('203.0.113.5', '203.0.113.5/32')).toBe(true);
    expect(ipMatchesCidr('203.0.113.6', '203.0.113.5/32')).toBe(false);
  });

  it('strips an IPv4-mapped-IPv6 prefix off the incoming ip before matching', () => {
    expect(ipMatchesCidr('::ffff:203.0.113.5', '203.0.113.0/24')).toBe(true);
    expect(ipMatchesCidr('::ffff:203.0.114.1', '203.0.113.0/24')).toBe(false);
  });

  it('fails closed (false) on a malformed cidr or ip rather than throwing', () => {
    expect(ipMatchesCidr('203.0.113.5', 'garbage')).toBe(false);
    expect(ipMatchesCidr('not-an-ip', '203.0.113.0/24')).toBe(false);
  });
});
