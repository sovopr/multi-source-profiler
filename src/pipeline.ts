import { OutputConfig, RawRecord } from './core/types';
import { processCsv } from './adapters/csv-adapter';
import { processGithub } from './adapters/github-adapter';
import { processPdf } from './adapters/pdf-adapter';
import { mergeRecords } from './core/merge';
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

  const canonical = mergeRecords(validRecords);
  
  const validation = validateCanonical(canonical);
  if (!validation.valid) {
    console.warn(`[Pipeline] Canonical profile failed validation:`, validation.errors);
  }

  const output: PipelineResult = { canonical };

  if (config) {
    const projected = project(canonical, config);
    if (projected.errors.length > 0) {
      console.warn(`[Pipeline] Projection warnings:`, projected.errors);
    }
    const projValidation = validateProjected(projected.data, config);
    if (!projValidation.valid) {
      console.warn(`[Pipeline] Projected profile failed validation:`, projValidation.errors);
    }
    output.projected = projected.data;
  }

  return output;
}
