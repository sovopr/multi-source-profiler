import { z } from 'zod';
import { CanonicalProfile, OutputConfig } from './types';

const CanonicalProfileSchema = z.object({
  candidate_id: z.string().regex(/^cand_[a-f0-9]{16}$/),
  full_name: z.string(),
  emails: z.array(z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  phones: z.array(z.string().regex(/^\+[1-9]\d{1,14}$/)),
  location: z.object({
    city: z.string().optional(),
    region: z.string().optional(),
    country: z.string().regex(/^[A-Z]{2}$/).optional()
  }),
  links: z.object({
    linkedin: z.string().optional(),
    github: z.string().optional(),
    portfolio: z.string().optional(),
    other: z.array(z.string()).optional()
  }),
  headline: z.string().nullable(),
  years_experience: z.number().nullable(),
  skills: z.array(z.object({
    name: z.string(),
    confidence: z.number(),
    sources: z.array(z.string())
  })),
  experience: z.array(z.object({
    company: z.string(),
    title: z.string(),
    start: z.string().nullable(),
    end: z.string().nullable(),
    summary: z.string()
  })),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string(),
    field: z.string(),
    end_year: z.number().nullable()
  })),
  provenance: z.array(z.object({
    field: z.string(),
    source: z.string(),
    method: z.string(),
    raw_value: z.string().optional()
  })),
  overall_confidence: z.number().min(0).max(1)
});

export function validateCanonical(profile: unknown): 
  { valid: true; data: CanonicalProfile } | { valid: false; errors: string[] } {
  const result = CanonicalProfileSchema.safeParse(profile);
  if (result.success) {
    return { valid: true, data: result.data as CanonicalProfile };
  } else {
    return { valid: false, errors: result.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`) };
  }
}

export function validateProjected(projected: unknown, config: OutputConfig):
  { valid: true; data: Record<string, unknown> } | { valid: false; errors: string[] } {
  
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const spec of config.fields) {
    let typeSchema: z.ZodTypeAny;
    switch(spec.type) {
      case 'string': typeSchema = z.string(); break;
      case 'string[]': typeSchema = z.array(z.string()); break;
      case 'number': typeSchema = z.number(); break;
      case 'boolean': typeSchema = z.boolean(); break;
      default: typeSchema = z.any();
    }
    if (!spec.required && config.on_missing !== 'error') {
      typeSchema = typeSchema.nullable().optional();
    }
    shape[spec.path] = typeSchema;
  }
  
  if (config.include_confidence) {
    shape['overall_confidence'] = z.number();
  }

  const ProjectedSchema = z.object(shape);
  const result = ProjectedSchema.safeParse(projected);
  if (result.success) {
    return { valid: true, data: result.data as Record<string, unknown> };
  } else {
    return { valid: false, errors: result.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`) };
  }
}
