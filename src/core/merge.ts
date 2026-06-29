import { CanonicalProfile, RawRecord, ExperienceRaw } from './types';
import { generateFingerprint } from './fingerprint';
import { normalizePhone, normalizeEmail, normalizeCountry, canonicalizeSkill, normalizeDate } from './normalize';

const SOURCE_TRUST: Record<string, number> = {
  github: 0.85,
  pdf: 0.75,
  csv: 0.70,
};

export function mergeRecords(records: RawRecord[]): CanonicalProfile {
  const prov: CanonicalProfile['provenance'] = [];
  
  const sortedRecords = records.filter(r => r.source_status !== 'failed').sort((a, b) => SOURCE_TRUST[b.source] - SOURCE_TRUST[a.source]);

  const mergeScalar = <K extends keyof RawRecord['raw']>(field: K, outField: string): any => {
    let winner: any = null;
    
    for (const r of sortedRecords) {
      const val = r.raw[field];
      if (val !== undefined && val !== null && val !== '') {
        if (winner === null) {
          winner = val;
          prov.push({ field: outField, source: r.source, method: 'direct', raw_value: String(val) });
        } else if (winner !== val) {
          prov.push({ field: outField, source: r.source, method: 'discarded_conflict', raw_value: String(val) });
        }
      }
    }
    return winner;
  };

  const full_name = mergeScalar('full_name', 'full_name');
  const headline = mergeScalar('headline', 'headline');
  const location_raw = mergeScalar('location_raw', 'location.country');
  
  const allEmails = new Set<string>();
  for (const r of sortedRecords) {
    if (r.raw.emails) {
      for (const e of r.raw.emails) {
        const norm = normalizeEmail(e);
        if (norm) {
          if (!allEmails.has(norm)) {
            allEmails.add(norm);
            prov.push({ field: 'emails', source: r.source, method: 'normalized', raw_value: e });
          }
        }
      }
    }
  }

  let location: CanonicalProfile['location'] = {};
  if (location_raw) {
    const c = normalizeCountry(location_raw);
    if (c) location.country = c;
  }

  const allPhones = new Set<string>();
  for (const r of sortedRecords) {
    if (r.raw.phones) {
      for (const p of r.raw.phones) {
        const norm = normalizePhone(p, location.country);
        if (norm) {
          if (!allPhones.has(norm)) {
            allPhones.add(norm);
            prov.push({ field: 'phones', source: r.source, method: 'normalized', raw_value: p });
          }
        }
      }
    }
  }

  const skillMap = new Map<string, { count: number, totalTrust: number, sources: string[] }>();
  for (const r of sortedRecords) {
    const s_raw = r.raw.skills_raw || [];
    for (const s of s_raw) {
      const c = canonicalizeSkill(s);
      if (c) {
        const existing = skillMap.get(c) || { count: 0, totalTrust: 0, sources: [] };
        if (!existing.sources.includes(r.source)) {
          existing.count++;
          existing.totalTrust += SOURCE_TRUST[r.source];
          existing.sources.push(r.source);
        }
        skillMap.set(c, existing);
      }
    }
  }

  const skills: CanonicalProfile['skills'] = [];
  for (const [name, data] of skillMap.entries()) {
    let conf = data.totalTrust / data.count;
    if (data.count >= 2) conf = Math.min(0.99, conf * 1.15);
    skills.push({ name, confidence: conf, sources: data.sources });
    prov.push({ field: 'skills', source: data.sources.join(','), method: 'union' });
  }

  const exp: CanonicalProfile['experience'] = [];
  let expSource = '';
  const pdfRec = sortedRecords.find(r => r.source === 'pdf');
  const csvRec = sortedRecords.find(r => r.source === 'csv');

  let rawExpToUse: ExperienceRaw[] | undefined = pdfRec?.raw.experience_raw;
  if (rawExpToUse && rawExpToUse.length > 0) {
    expSource = 'pdf';
  } else if (csvRec?.raw.experience_raw && csvRec.raw.experience_raw.length > 0) {
    rawExpToUse = csvRec.raw.experience_raw;
    expSource = 'csv';
  }

  if (rawExpToUse) {
    for (const e of rawExpToUse) {
      const start = e.start ? normalizeDate(e.start) : null;
      const end = e.end ? normalizeDate(e.end) : null;
      exp.push({
        company: e.company || '',
        title: e.title || '',
        start,
        end,
        summary: e.summary || ''
      });
      prov.push({ field: 'experience', source: expSource, method: 'heuristic' });
    }
    if (exp.length > 1) {
      prov.push({ field: 'experience', source: 'engine', method: 'inferred' });
    }
  }

  const fingerprint = generateFingerprint(Array.from(allEmails), Array.from(allPhones), full_name);
  prov.push({ field: 'candidate_id', source: 'engine', method: fingerprint.method });

  const links: CanonicalProfile['links'] = {};
  for (const r of sortedRecords) {
    if (r.source === 'github' && r.raw.github_username) {
      links.github = `https://github.com/${r.raw.github_username}`;
      prov.push({ field: 'links.github', source: 'github', method: 'direct' });
    }
  }

  let totalScore = 0;
  let totalWeight = 0;
  const addScore = (fieldScore: number, weight: number) => {
    totalScore += fieldScore * weight;
    totalWeight += weight;
  };
  const getSourceTrust = (source: string) => SOURCE_TRUST[source] || 0.7;

  if (full_name) {
    const trust = getSourceTrust(prov.find(p => p.field === 'full_name')?.source || '');
    addScore(trust * 1.0, 2);
  }
  if (allEmails.size > 0 || allPhones.size > 0) {
    const sources = Array.from(new Set(prov.filter(p => p.field === 'emails' || p.field === 'phones').map(p => p.source)));
    const maxTrust = Math.max(...sources.map(getSourceTrust), 0.7);
    const agreement = sources.length > 1 ? 1.15 : 1.0;
    addScore(Math.min(0.99, maxTrust * 1.0 * agreement), 2);
  }
  if (exp.length > 0) {
    addScore(getSourceTrust(expSource) * 0.6, 2);
  }
  
  let overall_confidence = totalWeight > 0 ? totalScore / totalWeight : 0;
  if (allEmails.size === 0 && allPhones.size === 0) {
    overall_confidence = Math.min(overall_confidence, 0.40);
  }
  overall_confidence = Math.max(0, Math.min(1, overall_confidence));
  prov.push({ field: 'overall_confidence', source: 'engine', method: 'inferred' });

  return {
    candidate_id: fingerprint.id,
    full_name: full_name || '',
    emails: Array.from(allEmails),
    phones: Array.from(allPhones),
    location,
    links,
    headline: headline || null,
    years_experience: null,
    skills,
    experience: exp,
    education: [],
    provenance: prov,
    overall_confidence
  };
}
