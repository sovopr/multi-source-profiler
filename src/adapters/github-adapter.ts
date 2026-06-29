import { RawRecord } from '../core/types';

export const GITHUB_TRUST = 0.85;

export async function processGithub(username: string): Promise<RawRecord> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Candidate-Transformer'
    };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const [userRes, reposRes] = await Promise.all([
      fetch(`https://api.github.com/users/${username}`, { headers }),
      fetch(`https://api.github.com/users/${username}/repos?per_page=100`, { headers })
    ]);

    if (!userRes.ok) {
      throw new Error(`GitHub user fetch failed with status ${userRes.status}`);
    }

    const userData = await userRes.json();
    let reposData: any[] = [];
    if (reposRes.ok) {
      reposData = await reposRes.json();
    }

    const skills = new Set<string>();
    const repos = reposData.map((repo: any) => {
      if (repo.language) skills.add(repo.language);
      return { name: repo.name, languages: repo.language ? [repo.language] : [] };
    });

    return {
      source: 'github',
      source_status: 'ok',
      raw: {
        github_username: username,
        full_name: userData.name || undefined,
        headline: userData.bio || undefined,
        location_raw: userData.location || undefined,
        emails: userData.email ? [userData.email] : undefined,
        skills_raw: Array.from(skills),
        repos: repos
      }
    };

  } catch (error) {
    console.warn(`[GitHub Adapter] Error fetching ${username}:`, error);
    return {
      source: 'github',
      source_status: 'failed',
      raw: {}
    };
  }
}
