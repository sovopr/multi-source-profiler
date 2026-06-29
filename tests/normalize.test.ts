import { describe, it, expect } from 'vitest';
import { normalizePhone, normalizeDate, normalizeCountry, canonicalizeSkill } from '../src/core/normalize';

describe('normalizePhone', () => {
  it('normalizes valid phone with country hint', () => {
    expect(normalizePhone('9876543210', 'IN')).toBe('+919876543210');
  });
  it('normalizes valid international phone', () => {
    expect(normalizePhone('+1-415-555-0123')).toBe('+14155550123');
  });
  it('returns null for invalid phone', () => {
    expect(normalizePhone('notaphone')).toBeNull();
  });
});

describe('normalizeDate', () => {
  it('normalizes month year strings', () => {
    expect(normalizeDate('Jan 2023')).toBe('2023-01');
    expect(normalizeDate('January 2023')).toBe('2023-01');
  });
  it('returns null for Present', () => {
    expect(normalizeDate('Present')).toBeNull();
  });
  it('normalizes YYYY-MM strings', () => {
    expect(normalizeDate('2021-06')).toBe('2021-06');
  });
  it('normalizes MM/YYYY strings', () => {
    expect(normalizeDate('01/2023')).toBe('2023-01');
  });
  it('returns just year if only year provided', () => {
    expect(normalizeDate('2023')).toBe('2023');
  });
});

describe('normalizeCountry', () => {
  it('normalizes country names', () => {
    expect(normalizeCountry('India')).toBe('IN');
    expect(normalizeCountry('United States')).toBe('US');
  });
  it('handles already normalized codes', () => {
    expect(normalizeCountry('US')).toBe('US');
  });
  it('returns null for gibberish', () => {
    expect(normalizeCountry('gibberish')).toBeNull();
  });
});

describe('canonicalizeSkill', () => {
  it('canonicalizes known skills', () => {
    expect(canonicalizeSkill('JS')).toBe('javascript');
    expect(canonicalizeSkill('Machine Learning')).toBe('machine-learning');
  });
  it('lowercases unknown skills', () => {
    expect(canonicalizeSkill('SomeUnknownThing')).toBe('someunknownthing');
  });
});
