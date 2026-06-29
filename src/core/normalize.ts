import { parsePhoneNumber } from 'libphonenumber-js';
import * as countries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';

countries.registerLocale(enLocale);

export function normalizePhone(raw: string, countryHint?: string): string | null {
  try {
    const phoneNumber = parsePhoneNumber(raw, countryHint as any);
    if (phoneNumber && phoneNumber.isValid()) {
      return phoneNumber.format('E.164');
    }
  } catch (e) {
    // catch all errors (never throw)
  }
  return null;
}

export function normalizeDate(raw: string): string | null {
  if (!raw || raw.toLowerCase().includes('present')) return null;
  
  const regex = /(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4}))|(?:(\d{1,2})\/(\d{4}))|(?:(\d{4})-(\d{1,2}))|(?:(?:^|\s)(\d{4})(?:$|\s))/i;
  const match = raw.match(regex);
  if (!match) return null;

  const year = match[2] || match[4] || match[5] || match[7];
  const month = match[1] || match[3] || match[6];

  if (!year) return null;

  if (month) {
    let m = 1;
    if (match[1]) { // text month
      const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
      m = months.indexOf(match[1].toLowerCase()) + 1;
    } else { // numeric month
      m = parseInt(month, 10);
    }
    if (m >= 1 && m <= 12) {
      return `${year}-${m.toString().padStart(2, '0')}`;
    }
  }
  
  return year;
}

export function normalizeCountry(raw: string): string | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  if (upper.length === 2) {
    if (countries.isValid(upper)) return upper;
    return null;
  }
  const code = countries.getAlpha2Code(raw.trim(), 'en');
  return code || null;
}

const SKILL_MAP: Record<string, string> = {
  'js': 'javascript',
  'javascript': 'javascript',
  'ts': 'typescript',
  'typescript': 'typescript',
  'py': 'python',
  'python': 'python',
  'react': 'reactjs',
  'reactjs': 'reactjs',
  'react.js': 'reactjs',
  'node': 'nodejs',
  'nodejs': 'nodejs',
  'node.js': 'nodejs',
  'ml': 'machine-learning',
  'machine learning': 'machine-learning',
  'machine-learning': 'machine-learning',
  'ai': 'artificial-intelligence',
  'artificial intelligence': 'artificial-intelligence',
  'artificial-intelligence': 'artificial-intelligence',
  'dl': 'deep-learning',
  'deep learning': 'deep-learning',
  'deep-learning': 'deep-learning',
  'sql': 'sql',
  'postgresql': 'postgresql',
  'postgres': 'postgresql',
  'mysql': 'mysql'
};

export function canonicalizeSkill(raw: string): string {
  if (!raw) return '';
  const lower = raw.toLowerCase().trim();
  return SKILL_MAP[lower] || lower;
}

export function normalizeEmail(raw: string): string | null {
  if (!raw) return null;
  const email = raw.toLowerCase().trim();
  const basicRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (basicRegex.test(email)) return email;
  return null;
}
