import { parsePhoneNumber } from 'libphonenumber-js';
import * as countries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';

countries.registerLocale(enLocale);

export function normalizePhone(raw: string, countryHint?: string): string | null {
  const cleaned = raw?.trim();
  if (!cleaned) return null;

  // Build ordered candidate list: explicit hint first, then env var, then common fallbacks
  const countryCandidates = [
    countryHint,
    process.env.DEFAULT_PHONE_COUNTRY,
    cleaned.startsWith('+') ? undefined : 'US',
    cleaned.startsWith('+') ? undefined : 'IN'
  ].filter((country, index, all): country is string => Boolean(country) && all.indexOf(country) === index);

  for (const country of countryCandidates.length > 0 ? countryCandidates : [undefined]) {
    try {
      const phoneNumber = parsePhoneNumber(cleaned, country as any);
      if (phoneNumber && phoneNumber.isValid()) {
        return phoneNumber.format('E.164');
      }
    } catch (e) {
      // Try the next hint
    }
  }

  // Fallback: if it starts with + and has enough digits, preserve it
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length >= 10 && cleaned.startsWith('+')) return '+' + digits;
  return null;
}

export function normalizeDate(raw: string): string | null {
  if (!raw || raw.toLowerCase().includes('present')) return null;
  
  const regex = /(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4}))|(?:(\d{1,2})\/(\d{4}))|(?:(\d{4})-(\d{1,2}))|(?:(?:^|\s)(\d{4})(?:$|\s))/i;
  const match = raw.match(regex);
  if (!match) return null;

  const year = match[2] || match[4] || match[5] || match[7];
  const month = match[1] || match[3] || match[6];

  if (!year) return null;

  if (month) {
    let m = 1;
    if (match[1]) { // text month
      const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
      m = months.indexOf(match[1].toLowerCase()) + 1;
    } else { // numeric month
      m = parseInt(month, 10);
    }
    if (m >= 1 && m <= 12) {
      return `${year}-${m.toString().padStart(2, '0')}`;
    }
  }
  
  return year;
}

export function normalizeCountry(raw: string): string | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  if (upper.length === 2) {
    if (countries.isValid(upper)) return upper;
    return null;
  }
  const code = countries.getAlpha2Code(raw.trim(), 'en');
  return code || null;
}

const SKILL_MAP: Record<string, string> = {
  // Languages
  'js': 'javascript', 'javascript': 'javascript', 'java script': 'javascript',
  'ts': 'typescript', 'typescript': 'typescript', 'type script': 'typescript',
  'py': 'python', 'python': 'python',
  'c++': 'cpp', 'cpp': 'cpp', 'c plus plus': 'cpp',
  'c#': 'csharp', 'csharp': 'csharp', 'c sharp': 'csharp',
  'golang': 'go', 'go': 'go',
  'rb': 'ruby', 'ruby': 'ruby',
  'swift': 'swift', 'java': 'java', 'kotlin': 'kotlin',
  'r': 'r',

  // Frontend
  'react': 'reactjs', 'reactjs': 'reactjs', 'react.js': 'reactjs', 'react js': 'reactjs',
  'react native': 'react-native', 'reactnative': 'react-native',
  'vue': 'vuejs', 'vuejs': 'vuejs', 'vue.js': 'vuejs',
  'angular': 'angular', 'angularjs': 'angular',
  'next': 'nextjs', 'nextjs': 'nextjs', 'next.js': 'nextjs',
  'svelte': 'svelte', 'html': 'html', 'css': 'css',
  'html/css': 'html-css', 'html css': 'html-css',

  // Backend / Runtime
  'node': 'nodejs', 'nodejs': 'nodejs', 'node.js': 'nodejs', 'node js': 'nodejs',
  'express': 'expressjs', 'expressjs': 'expressjs', 'express.js': 'expressjs',
  'django': 'django', 'flask': 'flask', 'fastapi': 'fastapi',
  'spring': 'spring', 'spring boot': 'spring-boot',

  // AI/ML
  'ml': 'machine-learning', 'machine learning': 'machine-learning', 'machine-learning': 'machine-learning',
  'ai': 'artificial-intelligence', 'artificial intelligence': 'artificial-intelligence', 'artificial-intelligence': 'artificial-intelligence',
  'dl': 'deep-learning', 'deep learning': 'deep-learning', 'deep-learning': 'deep-learning',
  'nlp': 'nlp', 'natural language processing': 'nlp',
  'cv': 'computer-vision', 'computer vision': 'computer-vision',
  'tensorflow': 'tensorflow', 'tf': 'tensorflow', 'tensor flow': 'tensorflow',
  'pytorch': 'pytorch', 'py torch': 'pytorch', 'torch': 'pytorch',
  'scikit-learn': 'scikit-learn', 'sklearn': 'scikit-learn', 'scikit learn': 'scikit-learn',
  'keras': 'keras', 'transformers': 'transformers', 'huggingface': 'huggingface',
  'rag': 'rag', 'llm': 'llm', 'llms': 'llm',

  // Data
  'sql': 'sql', 'nosql': 'nosql',
  'postgresql': 'postgresql', 'postgres': 'postgresql',
  'mysql': 'mysql', 'mongodb': 'mongodb', 'mongo': 'mongodb',
  'redis': 'redis', 'elasticsearch': 'elasticsearch',
  'pandas': 'pandas', 'numpy': 'numpy', 'num py': 'numpy',
  'matplotlib': 'matplotlib', 'scipy': 'scipy',
  'spark': 'apache-spark', 'pyspark': 'apache-spark', 'apache spark': 'apache-spark', 'py spark': 'apache-spark',
  'kafka': 'kafka', 'airflow': 'airflow',
  'snowflake': 'snowflake', 'databricks': 'databricks',

  // Cloud & DevOps
  'aws': 'aws', 'amazon web services': 'aws',
  'gcp': 'gcp', 'google cloud': 'gcp', 'google cloud platform': 'gcp',
  'azure': 'azure', 'microsoft azure': 'azure',
  'docker': 'docker', 'kubernetes': 'kubernetes', 'k8s': 'kubernetes',
  'ci/cd': 'ci-cd', 'ci cd': 'ci-cd',
  'terraform': 'terraform', 'ansible': 'ansible',
  'linux': 'linux', 'linux/bash': 'linux', 'bash': 'bash',
  'git': 'git', 'github': 'github',

  // Tools
  'figma': 'figma', 'tableau': 'tableau', 'power bi': 'power-bi', 'powerbi': 'power-bi',
  'streamlit': 'streamlit', 'jupyter': 'jupyter',
  'd3.js': 'd3js', 'd3': 'd3js', 'd 3.js': 'd3js',
  'lambda': 'aws-lambda', 'rds': 'aws-rds',
  'ec2': 'aws-ec2', 'ec 2': 'aws-ec2', 's3': 'aws-s3', 's 3': 'aws-s3',
};

export function canonicalizeSkill(raw: string): string {
  if (!raw) return '';
  const lower = raw.toLowerCase().trim();
  return SKILL_MAP[lower] || lower;
}

export function normalizeEmail(raw: string): string | null {
  if (!raw) return null;
  const email = raw.toLowerCase().trim();
  const basicRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (basicRegex.test(email)) return email;
  return null;
}
