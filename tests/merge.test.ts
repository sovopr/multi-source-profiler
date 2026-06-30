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
    expect(skill?.confidence).toBeGreaterThan(0.50);
    expect(skill?.sources).toContain('github');
    expect(skill?.sources).toContain('pdf');
  });

  it('keeps lower-trust source in provenance on conflict via discarded_conflict', () => {
    const records: RawRecord[] = [
      { source: 'github', source_status: 'ok', raw: { full_name: 'Octocat' } },
      { source: 'csv', source_status: 'ok', raw: { full_name: 'John Doe' } }
    ];
    const canonical = mergeRecords(records);
    // Winner should be from the higher-trust source
    expect(canonical.full_name).toBeTruthy();
    
    // The losing value should have a discarded_conflict provenance entry
    const discarded = canonical.provenance.find(p => p.field === 'full_name' && p.method === 'discarded_conflict');
    expect(discarded).toBeDefined();
    expect(discarded?.raw_value).toBeTruthy();
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

  it('computes years_experience from experience dates', () => {
    const records: RawRecord[] = [
      { source: 'pdf', source_status: 'ok', raw: {
        experience_raw: [
          { company: 'Acme', title: 'Engineer', start: '2020-01', end: '2023-01' }
        ]
      }}
    ];
    const canonical = mergeRecords(records);
    expect(canonical.years_experience).toBeGreaterThanOrEqual(2.5);
    expect(canonical.years_experience).toBeLessThanOrEqual(3.5);
  });

  it('sets years_experience null when no dates available', () => {
    const records: RawRecord[] = [
      { source: 'csv', source_status: 'ok', raw: {
        experience_raw: [{ company: 'Acme', title: 'Engineer' }]
      }}
    ];
    const canonical = mergeRecords(records);
    expect(canonical.years_experience).toBeNull();
  });
});
