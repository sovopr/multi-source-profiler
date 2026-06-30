import fs from 'fs';
import zlib from 'zlib';
const pdfParse = require('pdf-parse');
import os from 'os';
import path from 'path';
import { RawRecord, ExperienceRaw, EducationRaw } from '../core/types';

export const PDF_TRUST = 0.75;

async function extractText(filePath: string): Promise<string> {
  const dataBuffer = await fs.promises.readFile(filePath);
  let text = '';
  try {
    const data = await pdfParse(dataBuffer);
    if (typeof data?.text === 'string' && data.text.trim()) {
      text = data.text;
    }
  } catch (error) {
    console.warn(`[PDF Adapter] pdf-parse failed for ${filePath}; using stream fallback.`);
  }

  if (!text.trim()) {
    text = extractTextFromPdfStreams(dataBuffer);
  }

  return text;
}

function extractTextFromPdfStreams(buffer: Buffer): string {
  const binary = buffer.toString('binary');
  const lines: string[] = [];
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;

  for (const match of binary.matchAll(streamRegex)) {
    let inflated: Buffer;
    try {
      inflated = zlib.inflateSync(Buffer.from(match[1], 'binary'));
    } catch (error) {
      continue;
    }

    const content = inflated.toString('latin1');
    for (const textBlock of content.matchAll(/BT([\s\S]*?)ET/g)) {
      const pieces: string[] = [];
      for (const arrayMatch of textBlock[1].matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
        for (const hexMatch of arrayMatch[1].matchAll(/<([0-9A-Fa-f]+)>/g)) {
          pieces.push(Buffer.from(hexMatch[1], 'hex').toString('latin1'));
        }
      }
      for (const textMatch of textBlock[1].matchAll(/\(([^)]*)\)\s*Tj/g)) {
        pieces.push(textMatch[1].replace(/\\([()\\])/g, '$1'));
      }
      const line = pieces.join('').trim();
      if (line) lines.push(line);
    }
  }

  return lines.join('\n');
}

function splitTitleCompany(line: string): Pick<ExperienceRaw, 'title' | 'company'> {
  // First try to split by standard hyphens or dashes
  let parts = line.split(/\s+[-–—]\s+/);
  
  // If no dashes found, fallback to splitting by comma for cases like "Title, Company" or "Company, Title"
  if (parts.length === 1 && line.includes(',')) {
    // Usually the title is the first part, company the rest, or vice-versa. 
    // We'll split on the first comma.
    const commaIndex = line.indexOf(',');
    parts = [line.slice(0, commaIndex), line.slice(commaIndex + 1)];
  }

  const [title, ...companyParts] = parts;
  return {
    title: title?.trim() || undefined,
    company: companyParts.join(' - ').trim() || undefined
  };
}

export async function processPdf(filePath: string): Promise<RawRecord> {
  try {
    let text = await extractText(filePath);
    
    // Extract emails and phones FIRST before any aggressive kerning replacements mangle them
    const emails: string[] = [];
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
    const emailMatches = text.match(emailRegex);
    if (emailMatches) {
      emails.push(...emailMatches);
    }
    
    const phones: string[] = [];
    const phoneRegex = /\+?\d[\d\s-]{8,20}\d/g;
    const phoneMatches = text.match(phoneRegex);
    if (phoneMatches) {
      for (const p of phoneMatches) {
        if (p.replace(/\D/g, '').length >= 10) {
          phones.push(p.trim());
        }
      }
    }
    
    // Fix parenthesis spacing
    // Lowercase followed by Uppercase (excluding known CamelCase)
    const camelExceptions = ['PySpark', 'GitHub', 'LinkedIn', 'YouTube', 'ReactJS', 'NextJS', 'VueJS', 'NodeJS', 'NumPy', 'PyTorch', 'TensorFlow', 'Streamlit', 'Innomotics'];
  
    // HEURISTIC: If the text has very few newlines relative to its length (e.g. Kaggle Resume.csv format),
    // it was likely flattened and uses multiple spaces (3+) to denote newlines/sections.
    if (text.length > 500 && text.split('\n').length < 15) {
        text = text.replace(/\s{3,}/g, '\n');
    }

    // Pre-process text to fix common kerning/OCR issues
    text = text.replace(/([a-z])([A-Z])/g, (match, p1, p2, offset, string) => {
        for (const ex of camelExceptions) {
            const exTransMatches = [...ex.matchAll(/([a-z])([A-Z])/g)];
            for (const trans of exTransMatches) {
                if (p1 === trans[1] && p2 === trans[2]) {
                    const startIdx = offset - trans.index;
                    if (startIdx >= 0 && string.substring(startIdx, startIdx + ex.length) === ex) {
                        return match; 
                    }
                }
            }
        }
        return `${p1} ${p2}`;
    });
    
    text = text.replace(/(\d\+?)([a-zA-Z])/g, '$1 $2'); 
    text = text.replace(/([a-zA-Z])(\d)/g, '$1 $2'); 
    
    // Month gluing fix (e.g. TAPMIOct 2025 -> TAPMI Oct 2025)
    text = text.replace(/([a-zA-Z]+)(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?=\s*\d{4})/gi, '$1 $2');
    text = text.replace(/\b([A-Z]{2,})([a-z]{2,})\b/g, '$1 $2'); 
    
    // Word boundary on LEFT side prevents mutilating "Informatica", "Android", "Performance"
    text = text.replace(/\b([a-zA-Z]+)(for|to|by|in|per|with|using|and)\b/gi, (match, prefix, prep) => {
      // Only split if the prefix is a real word (3+ chars) and isn't part of a known compound
      if (prefix.length >= 3 && prefix.match(/[a-z]$/) && !match.match(/^(info|perf|andr|sand|infor)/i)) {
        return `${prefix} ${prep}`;
      }
      return match;
    });

    let lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    
    // Cleanup isolated bullets
    for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i] === '•' || lines[i] === '-') {
            lines[i] = lines[i] + ' ' + lines[i+1];
            lines[i+1] = '';
        }
    }
    lines = lines.filter((l: string) => l.length > 0);
    
    let name: string | undefined = undefined;
    if (lines.length > 0) {
      name = lines[0]; // Assuming name is on the first line
    }
    let experience_raw: ExperienceRaw[] | undefined = undefined;
    let education_raw: EducationRaw[] | undefined = undefined;
    let skills_raw: string[] | undefined = undefined;
    let projects_raw: { name: string; description?: string; link?: string; }[] | undefined = undefined;

    let currentSection: 'exp' | 'edu' | 'skills' | 'projects' | null = null;
    let expLines: string[] = [];
    let eduLines: string[] = [];
    let projLines: string[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      // Section headers are usually short (<= 3 words) and capitalized, or specific keywords
      if (lower.match(/^(experience|work experience|work history|employment|professional experience|career history)$/)) {
        currentSection = 'exp';
        experience_raw = experience_raw || [];
        continue;
      } else if (lower.match(/^(education|educational background|academic|university|degree|academics|scholastic|qualifications|academic qualifications)$/)) {
        currentSection = 'edu';
        continue;
      } else if (lower.match(/^(skills|technical skills|technologies|tech stack|core competencies|expertise|skills & expertise|technical expertise)$/)) {
        currentSection = 'skills';
        skills_raw = skills_raw || [];
        continue;
      } else if (lines[i].length < 60 && lines[i].match(/^[A-Z][a-zA-Z\s&\d()]+$/) && lower.match(/^(.*projects.*|personal projects|academic projects)$/)) {
        currentSection = 'projects';
        continue;
      } else if (lines[i].length < 60 && lines[i].match(/^[A-Z][a-zA-Z\s&\d()]+$/) && lower.match(/^(.*patents.*|.*research.*|.*certifications.*|.*publications.*|.*awards.*|.*interests.*|.*hobbies.*|.*activities.*|summary)$/)) {
        // Stop capturing if we hit another known section
        currentSection = null;
        continue;
      }

      // HEADERLESS EXPERIENCE DETECTION
      const dateRegex = /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4}|(?:0[1-9]|1[0-2])\/\d{4})\s*(?:[-–—|]|to)\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4}|(?:0[1-9]|1[0-2])\/\d{4}|Present|Current|Till Date)/i;
      if (currentSection === null && lines[i].match(dateRegex)) {
        currentSection = 'exp';
        experience_raw = experience_raw || [];
        
        // Sliding window lookback: push up to 2 preceding lines into expLines
        if (i - 2 > 0 && !expLines.includes(lines[i - 2])) {
          expLines.push(lines[i - 2]);
        }
        if (i - 1 > 0 && !expLines.includes(lines[i - 1])) {
          expLines.push(lines[i - 1]);
        }
      }

      if (currentSection === 'exp') {
        expLines.push(lines[i]);
      } else if (currentSection === 'edu') {
        eduLines.push(lines[i]);
      } else if (currentSection === 'projects') {
        projLines.push(lines[i]);
      } else if (currentSection === 'skills') {
        if (!skills_raw) skills_raw = [];
        
        // Remove category prefixes (e.g., "Languages & CS:")
        let cleanLine = lines[i].replace(/^[^:]+:\s*/, '');
        
        // Split by commas, semicolons, pipes, or bullets, but ignore those inside parentheses
        const chunks = cleanLine.split(/[,;|•·▪\t](?![^(]*\))/);
        const words = chunks.map(c => c.trim()).filter(c => c.length > 0)
            .map((w: string) => w.replace(/\([^)]*\)/g, '')) // Remove text inside parentheses
            .map((w: string) => w.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9+#. -]+$/g, '').trim()) 
            .filter((w: string) => w.length > 1 && w.length <= 50 && !w.match(/^(and|the|for|with|module|platform|data|an|a|to|by|per)$/i));
        skills_raw.push(...words);
      }
    }
    
    if (expLines.length > 0 && experience_raw) {
      // PRE-PROCESSING: Merge multi-line fragmented dates (e.g., "Oct 2009\n to \nMar 2015")
      for (let i = 0; i < expLines.length - 2; i++) {
         const line1 = expLines[i].trim();
         const line2 = expLines[i+1].trim();
         const line3 = expLines[i+2].trim();
         
         const isMonthYear = (str: string) => /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}$/i.test(str) || /^(0[1-9]|1[0-2])\/\d{4}$/.test(str) || /^\d{4}$/.test(str);
         
         if (isMonthYear(line1) && (line2.toLowerCase() === 'to' || line2 === '-' || line2 === '–') && (isMonthYear(line3) || line3.toLowerCase() === 'present' || line3.toLowerCase() === 'current' || line3.toLowerCase() === 'till date')) {
             expLines[i] = `${line1} to ${line3}`;
             expLines[i+1] = '';
             expLines[i+2] = '';
         }
      }

      const dateRegex = /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4}|(?:0[1-9]|1[0-2])\/\d{4})\s*(?:[-–—|]|to)\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4}|(?:0[1-9]|1[0-2])\/\d{4}|Present|Current|Till Date)/i;
      
      const dateIndices: number[] = [];
      for (let i = 0; i < expLines.length; i++) {
          if (expLines[i].match(dateRegex)) {
              dateIndices.push(i);
          }
      }

      for (let k = 0; k < dateIndices.length; k++) {
          const dIdx = dateIndices[k];
          const match = expLines[dIdx].match(dateRegex)!;
          
          // Determine the boundaries for this job
          const prevDIdx = k > 0 ? dateIndices[k - 1] : -1;
          
          // Scan backwards from dIdx - 1 to find pendingTitleCompany
          let titleLines: string[] = [];
          let summaryEndIdx = dIdx - 1;
          
          for (let i = dIdx - 1; i > prevDIdx; i--) {
              const line = expLines[i];
              // Stop scanning if we hit a bullet, or a line ending in a period/semicolon, or starting with lowercase
              if (line.startsWith('•') || line.startsWith('-') || line.match(/[.;]$/) || line.match(/^[a-z]/)) {
                  break;
              }
              // Stop if we have accumulated 2 lines of title (rarely more than 2)
              if (titleLines.length >= 2) {
                  break;
              }
              titleLines.unshift(line);
              summaryEndIdx = i - 1;
          }
          
          const pendingTitleCompany = titleLines.join(' - ');
          const inlineTitle = expLines[dIdx].replace(dateRegex, '').trim();
          
          let afterTitle = '';
          // If the line AFTER the date doesn't start with a bullet and isn't another date line, it might be the company!
          let nextIdx = dIdx + 1;
          while (nextIdx < expLines.length && !expLines[nextIdx].trim()) nextIdx++;
          if (nextIdx < expLines.length && (k + 1 < dateIndices.length ? nextIdx < dateIndices[k+1] : true)) {
              const nextLine = expLines[nextIdx].trim();
              // Only treat as company/title if it's short and doesn't look like a summary sentence
              const isBullet = nextLine.match(/^[•\-*+]/);
              const isSentence = nextLine.length > 60;
              const startsWithVerb = /^(worked|built|developed|managed|led|designed|implemented|created|maintained|oversaw|architected|engineered)/i.test(nextLine);
              if (nextLine && !isBullet && !isSentence && !startsWithVerb) {
                  afterTitle = nextLine;
              }
          }
          
          const fullTitleStr = [pendingTitleCompany, inlineTitle, afterTitle].filter(Boolean).join(' - ');
          const titleCompany = splitTitleCompany(fullTitleStr || '');
          
          // The summary for the PREVIOUS job is everything from prevDIdx + 1 to summaryEndIdx
          if (k > 0) {
              const prevExp = experience_raw[experience_raw.length - 1];
              // If the previous job had an afterTitle, we start summary at prevDIdx + 2 (or skip empty lines)
              let startSummaryIdx = prevDIdx + 1;
              while (startSummaryIdx < expLines.length && !expLines[startSummaryIdx].trim()) startSummaryIdx++;
              if (startSummaryIdx < expLines.length && !expLines[startSummaryIdx].trim().match(/^[•\-*]/)) {
                  startSummaryIdx++; // Skip the afterTitle line
              }
              for (let i = startSummaryIdx; i <= summaryEndIdx; i++) {
                  if (expLines[i].trim()) prevExp.summary += (prevExp.summary ? '\n' : '') + expLines[i].trim();
              }
          }
          
          experience_raw.push({
              ...titleCompany,
              start: match[1],
              end: match[2].toLowerCase() === 'present' ? null : match[2],
              summary: '',
              _hasAfterTitle: !!afterTitle // store temporarily to skip in final summary
          } as any);
      }
      
      // The summary for the LAST job is everything after the last date index
      if (dateIndices.length > 0) {
          const lastExp = experience_raw[experience_raw.length - 1] as any;
          const lastDIdx = dateIndices[dateIndices.length - 1];
          let startSummaryIdx = lastDIdx + 1;
          while (startSummaryIdx < expLines.length && !expLines[startSummaryIdx].trim()) startSummaryIdx++;
          if (lastExp._hasAfterTitle) startSummaryIdx++; // skip the company line
          for (let i = startSummaryIdx; i < expLines.length; i++) {
              if (expLines[i].trim()) lastExp.summary += (lastExp.summary ? '\n' : '') + expLines[i].trim();
          }
          experience_raw.forEach((e: any) => delete e._hasAfterTitle);
      }
    }

    if (eduLines.length > 0) {
      education_raw = [];
      let currentEdu = '';
      for (const line of eduLines) {
        if (line.match(/\b(university|college|institute|school|academy)\b/i)) {
          if (currentEdu) education_raw.push({ institution: currentEdu });
          currentEdu = line;
        } else if (!line.trim().match(/^[•\-*]/)) {
          currentEdu += (currentEdu ? ' | ' : '') + line;
        }
      }
      if (currentEdu) {
        education_raw.push({ institution: currentEdu });
      }

      education_raw = education_raw.map((entry) => {
        const raw = entry.institution || '';
        // Split on pipe or dash separators
        let parts = raw.split(/\s+\|\s+/);
        if (parts.length === 1) {
          // Try splitting on ' - ' but only if it doesn't look like a date range
          const dashParts = raw.split(/\s+[-–—]\s+/);
          if (dashParts.length > 1 && !dashParts[1].match(/^\d{4}/)) {
            parts = dashParts;
          }
        }
        let institution = parts[0].trim();
        let detail = parts.slice(1).join(' - ').trim();
        
        // Fallback for unstructured datasets without clean pipe delimiters
        if (parts.length === 1 && raw.length > 30) {
          const yearMatch = raw.match(/\b(19|20)\d{2}\b/);
          if (yearMatch && yearMatch.index !== undefined && yearMatch.index > 10) {
             institution = raw.substring(0, yearMatch.index).trim();
             detail = raw.substring(yearMatch.index).trim();
          }
        }
        
        const years = [...raw.matchAll(/\b(19|20)\d{2}\b/g)];
        let end_year = years.length > 0 ? Number(years[years.length - 1][0]) : undefined;
        return {
          institution: institution || raw,
          degree: detail || undefined,
          field: detail.match(/in\s+(.+)$/i)?.[1]?.trim(),
          end_year
        };
      });
    }
    if (projLines.length > 0) {
      projects_raw = [];
      let currentProj: { name: string; description: string } | null = null;
      let hasSeenBullet = false;
      
      for (let i = 0; i < projLines.length; i++) {
        const line = projLines[i].trim();
        if (!line) continue;
        
        if (line.match(/^[•\-*]/)) {
           hasSeenBullet = true;
           if (currentProj) {
               currentProj.description += (currentProj.description ? '\n' : '') + line;
           }
        } else {
           if (!hasSeenBullet && currentProj) {
               currentProj.description += (currentProj.description ? ' | ' : '') + line;
           } else {
               const isLikelyNewProject = line.includes('|') || (line.match(/^[A-Z]/) && line.length < 80 && !line.endsWith('.'));
               
               if (isLikelyNewProject || !currentProj) {
                   currentProj = { name: line, description: '' };
                   if (line.includes('|')) {
                       const parts = line.split(/\s*\|\s*/);
                       currentProj.name = parts[0].trim();
                       currentProj.description = parts.slice(1).join(' | ');
                   }
                   projects_raw.push(currentProj);
                   hasSeenBullet = false;
               } else {
                   currentProj.description += ' ' + line;
               }
           }
        }
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
        skills_raw,
        projects_raw
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
