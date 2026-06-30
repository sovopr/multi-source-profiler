import { CanonicalProfile, RawRecord } from './types';
import { generateFingerprint } from './fingerprint';
import { normalizePhone, normalizeEmail, normalizeCountry, canonicalizeSkill, normalizeDate } from './normalize';
import { computeConfidenceScore } from './confidence';

/**
 * Source priority for scalar conflict resolution.
 * Higher number = more trusted in a tiebreak.
 */
const SOURCE_PRIORITY: Record<string, number> = {
  ats: 5,
  github: 4,
  linkedin: 3,
  csv: 2,
  pdf: 1,
};

function bestSource(sources: string[]): string {
  return sources.sort((a, b) => (SOURCE_PRIORITY[b] ?? 0) - (SOURCE_PRIORITY[a] ?? 0))[0];
}

export function mergeRecords(records: RawRecord[]): CanonicalProfile {
  const prov: CanonicalProfile['provenance'] = [];

  const sortedRecords = records.filter(r => r.source_status !== 'failed');

  // ─── Scalar merge with conflict tracking ────────────────────────
  const mergeScalar = <K extends keyof RawRecord['raw']>(field: K, outField: string): any => {
    const valMap = new Map<any, string[]>();
    for (const r of sortedRecords) {
      const val = r.raw[field];
      if (val !== undefined && val !== null && val !== '') {
        const sources = valMap.get(val) || [];
        sources.push(r.source);
        valMap.set(val, sources);
      }
    }

    if (valMap.size === 0) return null;

    // Pick the value with highest confidence, then highest source priority
    let winner: any = null;
    let maxConf = -1;
    for (const [val, sources] of valMap.entries()) {
      const conf = computeConfidenceScore(sources, String(val), outField);
      if (conf > maxConf || (conf === maxConf && (SOURCE_PRIORITY[bestSource(sources)] ?? 0) > (SOURCE_PRIORITY[bestSource(valMap.get(winner) || [])] ?? 0))) {
        maxConf = conf;
        winner = val;
      }
    }

    const winnerSources = valMap.get(winner)!;
    prov.push({
      field: outField,
      source: winnerSources.join(','),
      method: valMap.size > 1 ? 'conflict_resolution' : 'direct',
      raw_value: String(winner)
    });

    // Record losing values in provenance for audit trail
    for (const [val, sources] of valMap.entries()) {
      if (val !== winner) {
        prov.push({
          field: outField,
          source: sources.join(','),
          method: 'discarded_conflict',
          raw_value: String(val)
        });
      }
    }

    return winner;
  };

  const full_name = mergeScalar('full_name', 'full_name');
  const headline = mergeScalar('headline', 'headline');
  const location_raw = mergeScalar('location_raw', 'location.country');

  // ─── Emails ─────────────────────────────────────────────────────
  const allEmails = new Set<string>();
  const emailSources = new Map<string, string[]>();
  for (const r of sortedRecords) {
    if (r.raw.emails) {
      for (const e of r.raw.emails) {
        const norm = normalizeEmail(e);
        if (norm) {
          allEmails.add(norm);
          const s = emailSources.get(norm) || [];
          if (!s.includes(r.source)) s.push(r.source);
          emailSources.set(norm, s);
        }
      }
    }
  }
  for (const [e, s] of emailSources.entries()) {
    prov.push({ field: 'emails', source: s.join(','), method: 'normalized', raw_value: e });
  }

  // ─── Location ───────────────────────────────────────────────────
  let location: CanonicalProfile['location'] = {};
  if (location_raw) {
    const c = normalizeCountry(location_raw);
    if (c) location.country = c;
  }

  // ─── Phones ─────────────────────────────────────────────────────
  const allPhones = new Set<string>();
  const phoneSources = new Map<string, string[]>();
  for (const r of sortedRecords) {
    if (r.raw.phones) {
      for (const p of r.raw.phones) {
        const norm = normalizePhone(p, location.country);
        if (norm) {
          allPhones.add(norm);
          const s = phoneSources.get(norm) || [];
          if (!s.includes(r.source)) s.push(r.source);
          phoneSources.set(norm, s);
        }
      }
    }
  }
  for (const [p, s] of phoneSources.entries()) {
    prov.push({ field: 'phones', source: s.join(','), method: 'normalized', raw_value: p });
  }

  // ─── Skills ─────────────────────────────────────────────────────
  const skillMap = new Map<string, { sources: string[] }>();
  for (const r of sortedRecords) {
    for (const s of r.raw.skills_raw || []) {
      const c = canonicalizeSkill(s);
      if (c) {
        const existing = skillMap.get(c) || { sources: [] };
        if (!existing.sources.includes(r.source)) {
          existing.sources.push(r.source);
        }
        skillMap.set(c, existing);
      }
    }
  }

  const skills: CanonicalProfile['skills'] = [];
  for (const [name, data] of Array.from(skillMap.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const conf = computeConfidenceScore(data.sources, name, 'skills');
    skills.push({ name, confidence: conf, sources: data.sources });
    prov.push({ field: 'skills', source: data.sources.join(','), method: 'union' });
  }

  // ─── Experience ─────────────────────────────────────────────────
  const exp: CanonicalProfile['experience'] = [];
  const expSeen = new Map<string, CanonicalProfile['experience'][number]>();
  const experienceScore = (experience: CanonicalProfile['experience'][number]) =>
    (experience.company ? 2 : 0) +
    (experience.title ? 2 : 0) +
    (experience.start ? 1 : 0) +
    (experience.end ? 1 : 0) +
    Math.min(3, experience.summary.trim().length / 40);

  for (const r of sortedRecords) {
    for (const e of r.raw.experience_raw || []) {
      const start = e.start ? normalizeDate(e.start) : null;
      const end = e.end ? normalizeDate(e.end) : null;
      const normalized = {
        company: e.company || '',
        title: e.title || '',
        start,
        end,
        summary: (e.summary || '').trim()
      };
      const identity = normalized.company || normalized.title
        ? `${normalized.company.toLowerCase()}|${normalized.title.toLowerCase()}`
        : `${start || ''}|${end || ''}|${normalized.summary.toLowerCase()}`;
      const existing = expSeen.get(identity);
      if (!existing || experienceScore(normalized) > experienceScore(existing)) {
        expSeen.set(identity, normalized);
        prov.push({ field: 'experience', source: r.source, method: 'heuristic' });
      }
    }
  }
  exp.push(...expSeen.values());
  if (exp.length > 1) {
    prov.push({ field: 'experience', source: 'engine', method: 'deduplicated' });
  }

  // ─── Projects ───────────────────────────────────────────────────
  const projects: CanonicalProfile['projects'] = [];
  const projSeen = new Map<string, CanonicalProfile['projects'][number]>();
  const projScore = (p: CanonicalProfile['projects'][number]) =>
    (p.name ? 2 : 0) + (p.description ? 2 : 0) + (p.link ? 1 : 0);

  for (const r of sortedRecords) {
    for (const p of r.raw.projects_raw || []) {
      const normalized = {
        name: p.name || '',
        description: p.description || '',
        link: p.link || ''
      };
      if (!normalized.name) continue;
      
      const identity = normalized.name.toLowerCase();
      const existing = projSeen.get(identity);
      
      if (!existing) {
        projSeen.set(identity, normalized);
        prov.push({ field: 'projects', source: r.source, method: 'heuristic' });
      } else {
        if (normalized.description && !existing.description) existing.description = normalized.description;
        if (normalized.link && !existing.link) existing.link = normalized.link;
        if (projScore(normalized) > projScore(existing)) {
           if (normalized.description.length > (existing.description?.length || 0)) {
               existing.description = normalized.description;
           }
        }
      }
    }
  }
  projects.push(...projSeen.values());
  if (projects.length > 1) {
    prov.push({ field: 'projects', source: 'engine', method: 'deduplicated' });
  }

  // ─── Education ──────────────────────────────────────────────────
  const education: CanonicalProfile['education'] = [];
  const educationSeen = new Set<string>();
  for (const r of sortedRecords) {
    for (const edu of r.raw.education_raw || []) {
      const normalized = {
        institution: edu.institution || '',
        degree: edu.degree || '',
        field: edu.field || '',
        end_year: edu.end_year ?? null
      };
      const key = `${normalized.institution.toLowerCase()}|${normalized.degree.toLowerCase()}|${normalized.field.toLowerCase()}|${normalized.end_year || ''}`;
      if (!educationSeen.has(key)) {
        educationSeen.add(key);
        education.push(normalized);
        prov.push({ field: 'education', source: r.source, method: 'heuristic' });
      }
    }
  }

  // ─── Years of Experience ────────────────────────────────────────
  let years_experience: number | null = null;
  if (exp.length > 0) {
    const parseYear = (d: string | null): number | null => {
      if (!d) return null;
      const m = d.match(/^(\d{4})/);
      return m ? parseInt(m[1], 10) : null;
    };
    const parseMonth = (d: string | null): number => {
      if (!d) return 1;
      const m = d.match(/-(\d{2})$/);
      return m ? parseInt(m[1], 10) : 1;
    };

    let earliestMs = Infinity;
    let latestMs = -Infinity;

    for (const e of exp) {
      const sy = parseYear(e.start);
      if (sy !== null) {
        const sm = parseMonth(e.start);
        const ms = new Date(sy, sm - 1).getTime();
        if (ms < earliestMs) earliestMs = ms;
      }

      let ey: number | null;
      let em: number;
      if (e.end === null) {
        // "Present" — use current date
        const now = new Date();
        ey = now.getFullYear();
        em = now.getMonth() + 1;
      } else {
        ey = parseYear(e.end);
        em = parseMonth(e.end);
      }
      if (ey !== null) {
        const ms = new Date(ey, em - 1).getTime();
        if (ms > latestMs) latestMs = ms;
      }
    }

    if (earliestMs !== Infinity && latestMs !== -Infinity) {
      const diffYears = (latestMs - earliestMs) / (1000 * 60 * 60 * 24 * 365.25);
      years_experience = Math.round(diffYears * 10) / 10; // one decimal
      if (years_experience < 0) years_experience = null;
    }
  }

  // ─── Fingerprint ────────────────────────────────────────────────
  const fingerprint = generateFingerprint(Array.from(allEmails), Array.from(allPhones), full_name);
  prov.push({ field: 'candidate_id', source: 'engine', method: fingerprint.method });

  // ─── Links ──────────────────────────────────────────────────────
  const links: CanonicalProfile['links'] = {};
  for (const r of sortedRecords) {
    if (r.source === 'github' && r.raw.github_username) {
      links.github = `https://github.com/${r.raw.github_username}`;
      prov.push({ field: 'links.github', source: 'github', method: 'direct' });
    }
  }

  // ─── Overall Confidence ─────────────────────────────────────────
  let totalScore = 0;
  let weightsSum = 0;

  // Name weight: 2
  if (full_name) {
    const nameSources = prov.find(p => p.field === 'full_name' && p.method !== 'discarded_conflict')?.source.split(',') || [];
    totalScore += computeConfidenceScore(nameSources, full_name, 'full_name') * 2;
    weightsSum += 2;
  }

  // Contact info weight: 2
  if (allEmails.size > 0 || allPhones.size > 0) {
    const contactConf = Math.min(1.0, (allEmails.size * 0.3 + allPhones.size * 0.3) + 0.4);
    totalScore += contactConf * 2;
    weightsSum += 2;
  }

  // Skills weight: 1.5
  if (skills.length > 0) {
    const avgSkillConf = skills.reduce((acc, s) => acc + s.confidence, 0) / skills.length;
    totalScore += avgSkillConf * 1.5;
    weightsSum += 1.5;
  }

  // Experience weight: 2
  if (exp.length > 0) {
    const expSources = prov.filter(p => p.field === 'experience' && p.method === 'heuristic').map(p => p.source);
    totalScore += computeConfidenceScore(expSources, 'experience', 'experience') * 2;
    weightsSum += 2;
  }

  // Education weight: 1
  if (education.length > 0) {
    totalScore += 0.6 * 1;
    weightsSum += 1;
  }

  let overall_confidence = weightsSum > 0 ? totalScore / weightsSum : 0;

  // Hard cap: no contact info → max 0.40 (assignment requirement)
  if (allEmails.size === 0 && allPhones.size === 0) {
    overall_confidence = Math.min(overall_confidence, 0.40);
  }

  overall_confidence = Math.round(overall_confidence * 100) / 100;

  prov.push({ field: 'overall_confidence', source: 'engine', method: 'weighted_aggregate' });

  return {
    candidate_id: fingerprint.id,
    full_name: full_name || '',
    emails: Array.from(allEmails),
    phones: Array.from(allPhones),
    location,
    links,
    headline: headline || null,
    years_experience,
    skills,
    experience: exp,
    projects,
    education,
    provenance: prov,
    overall_confidence
  };
}
