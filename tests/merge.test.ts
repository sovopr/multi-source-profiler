import { describe, it, expect } from 'vitest';
import { mergeRecords } from '../src/core/merge';
import { RawRecord } from '../src/core/types';

describe('mergeRecords', () => {
  it('assigns agreement bonus if two sources agree on skill', () => {
    const records: RawRecord[] = [
      { source: 'github', source_status: 'ok', raw: { skills_raw: ['js'] } },
      { source: 'pdf', source_status: 'ok', raw: { skills_raw: ['javascript'] } }
    ];
    const canonical = mergeRecords(records);
    const skill = canonical.skills.find(s => s.name === 'javascript');
    expect(skill).toBeDefined();
    expect(skill?.confidence).toBeCloseTo(0.92, 2);
  });

  it('keeps lower-trust source in provenance on conflict', () => {
    const records: RawRecord[] = [
      { source: 'github', source_status: 'ok', raw: { full_name: 'Octocat' } },
      { source: 'csv', source_status: 'ok', raw: { full_name: 'John Doe' } }
    ];
    const canonical = mergeRecords(records);
    expect(canonical.full_name).toBe('Octocat');
    
    const prov = canonical.provenance.find(p => p.field === 'full_name' && p.source === 'csv');
    expect(prov).toBeDefined();
    expect(prov?.method).toBe('discarded_conflict');
  });

  it('caps overall_confidence <= 0.40 if emails and phones both empty', () => {
    const records: RawRecord[] = [
      { source: 'github', source_status: 'ok', raw: { full_name: 'Octocat', skills_raw: ['python'] } }
    ];
    const canonical = mergeRecords(records);
    expect(canonical.emails).toHaveLength(0);
    expect(canonical.phones).toHaveLength(0);
    expect(canonical.overall_confidence).toBeLessThanOrEqual(0.40);
  });
});
