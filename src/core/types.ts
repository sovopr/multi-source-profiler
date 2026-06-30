export interface ExperienceRaw {
  company?: string;
  title?: string;
  start?: string | null;
  end?: string | null;
  summary?: string;
}

export interface EducationRaw {
  institution?: string;
  degree?: string;
  field?: string;
  end_year?: number | null;
}

export interface RawRecord {
  source: 'csv' | 'github' | 'pdf';
  source_status: 'ok' | 'failed' | 'partial';
  raw: {
    full_name?: string;
    emails?: string[];
    phones?: string[];
    location_raw?: string;
    headline?: string;
    skills_raw?: string[];
    experience_raw?: ExperienceRaw[];
    education_raw?: EducationRaw[];
    github_username?: string;
    projects_raw?: { name: string; description?: string; link?: string; }[];
    bio?: string;
  };
}

export interface CanonicalProfile {
  candidate_id: string;
  full_name: string;
  emails: string[];
  phones: string[];          // E.164
  location: { city?: string; region?: string; country?: string }; // country: ISO-3166-1 alpha-2
  links: { linkedin?: string; github?: string; portfolio?: string; other?: string[] };
  headline: string | null;
  years_experience: number | null;
  skills: { name: string; confidence: number; sources: string[] }[];
  experience: { company: string; title: string; start: string | null; end: string | null; summary: string }[];
  projects: { name: string; description?: string; link?: string; }[];
  education: { institution: string; degree: string; field: string; end_year: number | null }[];
  provenance: { field: string; source: string; method: string; raw_value?: string }[];
  overall_confidence: number;
}

export interface OutputConfig {
  fields: {
    path: string;           // output key name
    from?: string;          // dot-bracket path into CanonicalProfile, e.g. "emails[0]"
    type: string;           // 'string' | 'string[]' | 'number' | 'boolean'
    required?: boolean;
    normalize?: 'E164' | 'canonical' | 'iso3166';
  }[];
  include_confidence?: boolean;
  on_missing?: 'null' | 'omit' | 'error';
}
