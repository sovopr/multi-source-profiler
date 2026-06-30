/**
 * Deterministic, explainable confidence scoring engine.
 * 
 * Replaces the ML-based system with transparent heuristics where every
 * point of confidence can be traced back to a specific signal.
 * 
 * Design principles:
 * - Same inputs → same output (no randomness)
 * - Every score component is explainable in plain English
 * - Corroboration across sources is the strongest signal
 * - Source trustworthiness is ranked by authentication level
 */

/** How much we trust each source type (0.0 – 1.0). */
const SOURCE_TRUST: Record<string, number> = {
  ats:      1.0,   // System of record, authenticated
  csv:      1.0,   // Manual export, designated as highest trust in this domain
  github:   0.85,  // Authenticated API, user-curated
  linkedin: 0.80,  // Semi-structured, user-curated
  pdf:      0.75,  // Unstructured, OCR-prone
};

export interface ConfidenceBreakdown {
  score: number;
  components: { signal: string; delta: number }[];
}

/**
 * Computes a deterministic confidence score for a single extracted value.
 *
 * @param sources  - Array of source identifiers that produced this value
 * @param rawValue - The raw string value being scored
 * @returns        - A score in [0.01, 0.99] and an explainable breakdown
 */
export function computeConfidence(sources: string[], rawValue: string, fieldName: string = ''): ConfidenceBreakdown {
  const components: { signal: string; delta: number }[] = [];

  // ── 1. Base: Best source trust ──────────────────────────────────
  const bestTrust = Math.max(...sources.map(s => SOURCE_TRUST[s] ?? 0.50));
  const base = bestTrust * 0.65; // Scale so base alone never exceeds ~0.59
  components.push({ signal: 'source_trust', delta: base });

  // ── 2. Corroboration bonus ──────────────────────────────────────
  const uniqueSources = new Set(sources);
  if (uniqueSources.size >= 3) {
    components.push({ signal: 'corroborated_3+_sources', delta: 0.20 });
  } else if (uniqueSources.size === 2) {
    components.push({ signal: 'corroborated_2_sources', delta: 0.12 });
  }

  // ── 3. Value quality signals ────────────────────────────────────
  const len = rawValue.length;

  // Penalize suspiciously short values (single char, initials)
  if (len <= 1) {
    components.push({ signal: 'too_short', delta: -0.25 });
  } else if (len <= 2) {
    components.push({ signal: 'very_short', delta: -0.10 });
  }

  // Penalize suspiciously long values (likely OCR garbage or full sentences)
  if (len > 80) {
    components.push({ signal: 'too_long', delta: -0.15 });
  } else if (len > 50) {
    components.push({ signal: 'long_string', delta: -0.05 });
  }

  // Penalize strings that look like OCR artifacts
  const ocrSignals = (rawValue.match(/[^a-zA-Z0-9\s.,@+\-()/#&:]/g) || []).length;
  if (ocrSignals > 3) {
    components.push({ signal: 'ocr_artifacts', delta: -0.15 });
  } else if (ocrSignals > 0) {
    components.push({ signal: 'minor_noise', delta: -0.05 });
  }

  // Bonus for values that pass basic format checks
  if (rawValue.match(/^[a-zA-Z][a-zA-Z0-9\s.,\-+#()&/]+$/)) {
    components.push({ signal: 'clean_format', delta: 0.05 });
  }

  // ── 4. Format Adherence & Dictionary Matrix ────────────────────
  if (fieldName === 'emails' || fieldName === 'primary_email') {
    if (rawValue.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      components.push({ signal: 'rfc_email_format', delta: 0.25 });
    }
  } else if (fieldName === 'phones' || fieldName === 'phone') {
    if (rawValue.match(/^\+?[0-9\-\s()]{7,}$/)) {
      components.push({ signal: 'e164_phone_format', delta: 0.20 });
    }
  } else if (fieldName === 'skills' || fieldName === 'skill') {
    if (len < 15) {
      components.push({ signal: 'canonical_skill_length', delta: 0.15 });
    }
  } else if (fieldName === 'full_name') {
    if (rawValue.split(' ').length >= 2) {
      components.push({ signal: 'valid_name_format', delta: 0.15 });
    }
  } else if (fieldName === 'experience') {
    // We pass the stringified experience block if it's the whole array, 
    // or we just trust the heuristic score from merge.ts.
    components.push({ signal: 'heuristic_experience', delta: 0.15 });
  }

  // ── 4. Aggregate ───────────────────────────────────────────────
  let score = components.reduce((sum, c) => sum + c.delta, 0);
  score = Math.max(0.01, Math.min(0.99, Math.round(score * 100) / 100));

  return { score, components };
}

/**
 * Convenience wrapper that returns just the numeric score.
 */
export function computeConfidenceScore(sources: string[], rawValue: string, fieldName: string = ''): number {
  return computeConfidence(sources, rawValue, fieldName).score;
}
