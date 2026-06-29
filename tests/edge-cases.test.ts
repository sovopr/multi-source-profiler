import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { processCsv } from '../src/adapters/csv-adapter';
import { processGithub } from '../src/adapters/github-adapter';
import { normalizePhone } from '../src/core/normalize';

describe('Edge Cases', () => {
  it('CSV with all malformed rows returns empty valid records', async () => {
    const csvPath = path.resolve(__dirname, 'malformed.csv');
    await fs.promises.writeFile(csvPath, 'name,email,phone,current_company,title\n"",malformed_email,notaphone,,');
    
    const records = await processCsv(csvPath);
    const valid = records.filter(r => r.source_status !== 'failed');
    
    expect(valid).toHaveLength(0);
    
    await fs.promises.unlink(csvPath);
  });

  it('GitHub 404 returns failed status', async () => {
    const record = await processGithub('this_user_definitely_does_not_exist_123456789');
    expect(record.source_status).toBe('failed');
  });

  it('Phone with location hint normalizes correctly', () => {
    expect(normalizePhone('9876543210', 'IN')).toBe('+919876543210');
  });
});
