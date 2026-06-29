import { createHash } from 'crypto';

export function generateFingerprint(emails: string[], phones: string[], fullName: string | undefined): { id: string, method: string } {
  let method = 'direct';
  let input = '';
  
  const sortedEmails = [...emails].sort();
  const sortedPhones = [...phones].sort();
  
  if (sortedEmails.length > 0 || sortedPhones.length > 0) {
    input = sortedEmails.join('|') + '|' + sortedPhones.join('|');
  } else {
    method = 'name_fallback';
    input = (fullName || '').toLowerCase().trim();
  }
  
  const hash = createHash('sha256').update(input).digest('hex').substring(0, 16);
  return { id: 'cand_' + hash, method };
}
