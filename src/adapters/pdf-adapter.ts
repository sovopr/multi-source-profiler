import fs from 'fs';
import pdfParse from 'pdf-parse';
import { RawRecord, ExperienceRaw, EducationRaw } from '../core/types';

export const PDF_TRUST = 0.75;

export async function processPdf(filePath: string): Promise<RawRecord> {
  try {
    const dataBuffer = await fs.promises.readFile(filePath);
    const data = await pdfParse(dataBuffer);
    const text = data.text;
    
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let name: string | undefined = undefined;
    if (lines.length > 0) {
      name = lines[0]; // first non-empty line
    }
    
    const emails: string[] = [];
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
    const emailMatches = text.match(emailRegex);
    if (emailMatches) {
      emails.push(...emailMatches);
    }
    
    const phones: string[] = [];
    const phoneRegex = /(\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9})/g;
    const phoneMatches = text.match(phoneRegex);
    if (phoneMatches) {
      for (const p of phoneMatches) {
        if (p.replace(/\D/g, '').length >= 10) {
          phones.push(p.trim());
        }
      }
    }

    let experience_raw: ExperienceRaw[] | undefined = undefined;
    let education_raw: EducationRaw[] | undefined = undefined;
    let skills_raw: string[] | undefined = undefined;

    let currentSection: 'exp' | 'edu' | 'skills' | null = null;
    let expLines: string[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      if (lower.match(/^(experience|work history|employment)$/)) {
        currentSection = 'exp';
        experience_raw = experience_raw || [];
        continue;
      } else if (lower.match(/^(education|academic|university|degree)$/)) {
        currentSection = 'edu';
        education_raw = education_raw || [];
        continue;
      } else if (lower.match(/^(skills|technologies|tech stack)$/)) {
        currentSection = 'skills';
        skills_raw = skills_raw || [];
        continue;
      }

      if (currentSection === 'exp') {
        expLines.push(lines[i]);
      } else if (currentSection === 'edu') {
        if (!education_raw) education_raw = [];
        education_raw.push({ institution: lines[i] });
      } else if (currentSection === 'skills') {
        if (!skills_raw) skills_raw = [];
        skills_raw.push(...lines[i].split(/[\s,]+/).filter(Boolean));
      }
    }
    
    if (expLines.length > 0 && experience_raw) {
      const dateRegex = /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4})\s*-\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4}|Present)/i;
      
      let currentExp: ExperienceRaw | null = null;
      for (const line of expLines) {
        const match = line.match(dateRegex);
        if (match) {
          if (currentExp) experience_raw.push(currentExp);
          currentExp = {
            title: line.replace(dateRegex, '').trim(),
            start: match[1],
            end: match[2].toLowerCase() === 'present' ? null : match[2],
            summary: ''
          };
        } else {
          if (currentExp) {
            currentExp.summary += ' ' + line;
          } else {
            currentExp = { title: line, start: null, end: null, summary: '' };
          }
        }
      }
      if (currentExp) {
        experience_raw.push(currentExp);
      }
    }

    return {
      source: 'pdf',
      source_status: name ? 'ok' : 'partial',
      raw: {
        full_name: name,
        emails,
        phones,
        experience_raw,
        education_raw,
        skills_raw
      }
    };

  } catch (error) {
    console.warn(`[PDF Adapter] Error processing ${filePath}:`, error);
    return {
      source: 'pdf',
      source_status: 'failed',
      raw: {}
    };
  }
}
