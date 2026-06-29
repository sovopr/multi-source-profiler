import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { RawRecord } from '../core/types';
import { normalizeEmail } from '../core/normalize';

export const CSV_TRUST = 0.70;

export async function processCsv(filePath: string): Promise<RawRecord[]> {
  const records: RawRecord[] = [];
  try {
    const fileContent = await fs.promises.readFile(filePath, 'utf-8');
    const parsed: any[] = parse(fileContent, { columns: true, skip_empty_lines: true });
    
    for (const row of parsed) {
      const name = row.name?.trim();
      const rawEmail = row.email?.trim() || '';
      const email = normalizeEmail(rawEmail) ? rawEmail : '';
      const phone = row.phone?.trim();
      
      if (!name && !email) {
        console.warn(`[CSV Adapter] Skipping malformed row: missing name and valid email`);
        continue;
      }
      
      const record: RawRecord = {
        source: 'csv',
        source_status: (name && email && phone) ? 'ok' : 'partial',
        raw: {
          full_name: name || undefined,
          emails: email ? [email] : undefined,
          phones: phone ? [phone] : undefined,
          experience_raw: row.current_company || row.title ? [{
            company: row.current_company?.trim(),
            title: row.title?.trim()
          }] : undefined
        }
      };
      records.push(record);
    }
  } catch (error) {
    console.error(`[CSV Adapter] Error processing ${filePath}:`, error);
  }
  return records;
}
