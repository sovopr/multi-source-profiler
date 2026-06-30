import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { RawRecord } from '../core/types';
import { normalizeEmail } from '../core/normalize';


/**
 * Fuzzy header mapping: the assignment states CSV field names "do NOT match ours."
 * We map common variations to canonical field names.
 */
const HEADER_ALIASES: Record<string, string[]> = {
  name:             ['name', 'full_name', 'fullname', 'candidate_name', 'candidate', 'applicant_name', 'applicant'],
  email:            ['email', 'e-mail', 'contact_email', 'email_address', 'candidate_email'],
  phone:            ['phone', 'phone_number', 'cell', 'cell_phone', 'mobile', 'telephone', 'contact_phone'],
  current_company:  ['current_company', 'company', 'employer', 'organization', 'org', 'company_name'],
  title:            ['title', 'job_title', 'position', 'role', 'designation', 'current_title'],
};

function resolveHeader(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const lowerHeaders = headers.map(h => h.toLowerCase().trim().replace(/\s+/g, '_'));

  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      const idx = lowerHeaders.indexOf(alias);
      if (idx !== -1) {
        mapping[canonical] = headers[idx];
        break;
      }
    }
  }
  return mapping;
}

export async function processCsv(filePath: string): Promise<RawRecord[]> {
  const records: RawRecord[] = [];
  try {
    const fileContent = await fs.promises.readFile(filePath, 'utf-8');
    const parsed: any[] = parse(fileContent, { columns: true, skip_empty_lines: true });

    if (parsed.length === 0) return records;

    // Resolve headers from first row
    const csvHeaders = Object.keys(parsed[0]);
    const headerMap = resolveHeader(csvHeaders);
    
    for (const row of parsed) {
      const name = (row[headerMap.name] || '').trim();
      const rawEmail = (row[headerMap.email] || '').trim();
      const email = normalizeEmail(rawEmail) ? rawEmail : '';
      const phone = (row[headerMap.phone] || '').trim();
      
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
          experience_raw: (row[headerMap.current_company] || row[headerMap.title]) ? [{
            company: (row[headerMap.current_company] || '').trim() || undefined,
            title: (row[headerMap.title] || '').trim() || undefined
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
