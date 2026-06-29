import { CanonicalProfile, OutputConfig } from './types';
import { normalizePhone, canonicalizeSkill, normalizeCountry } from './normalize';

function safeGet(obj: any, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').replace(/\[\]/g, '').split('.');
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (current === undefined || current === null) return undefined;
    if (Array.isArray(current) && isNaN(Number(part))) {
       const remainingPath = parts.slice(i).join('.');
       return current.map(item => safeGet(item, remainingPath));
    }
    current = current[part];
  }
  return current;
}

export function project(canonical: CanonicalProfile, config: OutputConfig): { data: Record<string, unknown>, errors: string[] } {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const spec of config.fields) {
    const resolvePath = spec.from || spec.path;
    let val = safeGet(canonical, resolvePath);

    if (val !== undefined && val !== null) {
      if (spec.normalize === 'E164') {
        if (Array.isArray(val)) val = val.map(v => normalizePhone(String(v)) || v);
        else val = normalizePhone(String(val)) || val;
      } else if (spec.normalize === 'canonical') {
        if (Array.isArray(val)) val = val.map(v => canonicalizeSkill(String(v)));
        else val = canonicalizeSkill(String(val));
      } else if (spec.normalize === 'iso3166') {
        if (Array.isArray(val)) val = val.map(v => normalizeCountry(String(v)) || v);
        else val = normalizeCountry(String(val)) || val;
      }
    }

    const isMissing = val === undefined || val === null || (Array.isArray(val) && val.length === 0 && val.length === 0);
    
    if (isMissing) {
      const onMissing = config.on_missing || 'null';
      if (onMissing === 'omit') {
        continue;
      } else if (onMissing === 'error') {
        errors.push(`Missing required field: ${spec.path}`);
        continue;
      } else {
        val = null;
      }
    }

    data[spec.path] = val;
  }

  if (config.include_confidence) {
    data['overall_confidence'] = canonical.overall_confidence;
  }

  return { data, errors };
}
