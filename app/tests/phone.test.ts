import { describe, expect, it } from 'vitest';
import { formatArPhone, normalizeArPhone, normalizeEmail } from '@/lib/domain/phone';

describe('normalizeArPhone', () => {
  it.each([
    ['2392 555 101', '+5492392555101'],
    ['02392 15 555101', '+5492392555101'],
    ['+54 9 11 5555-1234', '+5491155551234'],
    ['011 15 5555 1234', '+5491155551234'],
    ['54 11 5555 1234', '+5491155551234'],
    ['0054 9 2926 555220', '+5492926555220'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeArPhone(raw)).toBe(expected);
  });

  it.each(['', '123', 'abc', '11 5555 12345678'])('rechaza %j', (raw) => {
    expect(normalizeArPhone(raw)).toBeUndefined();
  });

  it('formatea para mostrar', () => {
    expect(formatArPhone('+5492392555101')).toBe('+54 9 2392 555-101');
    expect(formatArPhone(undefined)).toBe('—');
  });
});

describe('normalizeEmail', () => {
  it('normaliza y valida', () => {
    expect(normalizeEmail('  Maria@Mail.COM ')).toBe('maria@mail.com');
    expect(normalizeEmail('no-es-mail')).toBeUndefined();
  });
});
