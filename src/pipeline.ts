import { OutputConfig, RawRecord } from './core/types';
import { processCsv } from './adapters/csv-adapter';
import { processGithub } from './adapters/github-adapter';
import { processPdf } from './adapters/pdf-adapter';
import { mergeRecords } from './core/merge';
import { normalizeEmail, normalizePhone } from './core/normalize';
import { project } from './core/project';
import { validateCanonical, validateProjected } from './core/validate';

export interface PipelineInputs {
  csvPath?: string;
  githubUsername?: string;
  resumePdfPath?: string;
}

export interface PipelineResult {
  canonical: unknown;
  projected?: unknown;
  errors?: string[];
}

function recordKeys(record: RawRecord): string[] {
  const keys = new Set<string>();

  for (const email of record.raw.emails || []) {
    const normalized = normalizeEmail(email);
    if (normalized) keys.add(`email:${normalized}`);
  }

  for (const phone of record.raw.phones || []) {
    const normalized = normalizePhone(phone);
    if (normalized) keys.add(`phone:${normalized}`);
  }

  if (keys.size === 0 && record.raw.full_name) {
    keys.add(`name:${record.raw.full_name.trim().toLowerCase()}`);
  }

  if (keys.size === 0 && record.raw.github_username) {
    keys.add(`github:${record.raw.github_username.trim().toLowerCase()}`);
  }

  return Array.from(keys);
}

function groupRecords(records: RawRecord[]): RawRecord[][] {
  const groups: RawRecord[][] = [];
  const keyToGroup = new Map<string, number>();

  for (const record of records) {
    const keys = recordKeys(record);
    const matchedGroups = Array.from(new Set(keys.map(key => keyToGroup.get(key)).filter((idx): idx is number => idx !== undefined)));

    if (matchedGroups.length === 0) {
      const groupIndex = groups.length;
      groups.push([record]);
      for (const key of keys) keyToGroup.set(key, groupIndex);
      continue;
    }

    const primaryIndex = matchedGroups[0];
    groups[primaryIndex].push(record);

    for (const extraIndex of matchedGroups.slice(1).sort((a, b) => b - a)) {
      const extraGroup = groups[extraIndex];
      groups[primaryIndex].push(...extraGroup);
      groups.splice(extraIndex, 1);
      for (const [key, index] of keyToGroup.entries()) {
        if (index === extraIndex) keyToGroup.set(key, primaryIndex);
        else if (index > extraIndex) keyToGroup.set(key, index - 1);
      }
    }

    for (const groupedRecord of groups[primaryIndex]) {
      for (const key of recordKeys(groupedRecord)) keyToGroup.set(key, primaryIndex);
    }
  }

  return groups;
}

export async function run(inputs: PipelineInputs, config?: OutputConfig): Promise<PipelineResult> {
  const promises: Promise<RawRecord | RawRecord[]>[] = [];
  
  if (inputs.csvPath) promises.push(processCsv(inputs.csvPath));
  if (inputs.githubUsername) promises.push(processGithub(inputs.githubUsername));
  if (inputs.resumePdfPath) promises.push(processPdf(inputs.resumePdfPath));

  const results = await Promise.allSettled(promises);
  const records: RawRecord[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (Array.isArray(result.value)) {
        records.push(...result.value);
      } else {
        records.push(result.value);
      }
    } else {
      console.warn(`[Pipeline] Adapter failed unexpectedly:`, result.reason);
    }
  }

  const validRecords = records.filter(r => r.source_status !== 'failed');
  if (validRecords.length === 0) {
    return { canonical: null, errors: ['No valid records produced by any source'] };
  }

  const grouped = groupRecords(validRecords);
  const canonicalProfiles = grouped.map(group => mergeRecords(group));
  const canonical = canonicalProfiles.length === 1 ? canonicalProfiles[0] : canonicalProfiles;
  const errors: string[] = [];
  
  for (const [index, profile] of canonicalProfiles.entries()) {
    const validation = validateCanonical(profile);
    if (!validation.valid) {
      const prefixed = validation.errors.map(error => `canonical[${index}].${error}`);
      errors.push(...prefixed);
      console.warn(`[Pipeline] Canonical profile failed validation:`, prefixed);
    }
  }

  const output: PipelineResult = { canonical };

  if (config) {
    const projectedResults = canonicalProfiles.map(profile => project(profile, config));
    const projectedData = projectedResults.map(result => result.data);
    const projected = projectedData.length === 1 ? projectedData[0] : projectedData;

    for (const [index, result] of projectedResults.entries()) {
      if (result.errors.length > 0) {
        const prefixed = result.errors.map(error => `projected[${index}].${error}`);
        errors.push(...prefixed);
        console.warn(`[Pipeline] Projection warnings:`, prefixed);
      }

      const projValidation = validateProjected(result.data, config);
      if (!projValidation.valid) {
        const prefixed = projValidation.errors.map(error => `projected[${index}].${error}`);
        errors.push(...prefixed);
        console.warn(`[Pipeline] Projected profile failed validation:`, prefixed);
      }
    }

    output.projected = projected;
  }

  if (errors.length > 0) output.errors = errors;

  return output;
}
