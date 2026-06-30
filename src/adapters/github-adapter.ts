import { RawRecord } from '../core/types';


const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function fetchWithBackoff(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, options);
    if ((res.status === 403 || res.status === 429) && attempt < maxRetries) {
      const resetStr = res.headers.get('x-ratelimit-reset');
      let waitMs = 1000 * Math.pow(2, attempt); 
      if (resetStr) {
        const resetMs = parseInt(resetStr, 10) * 1000;
        const now = Date.now();
        if (resetMs > now && (resetMs - now) < 60000) {
            waitMs = resetMs - now + 1000;
        }
      }
      console.warn(`[GitHub Adapter] Rate limited (${res.status}) on ${url}. Retrying in ${waitMs}ms...`);
      await delay(waitMs);
      attempt++;
      continue;
    }
    return res;
  }
}

export async function processGithub(username: string): Promise<RawRecord> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Candidate-Transformer'
    };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    let [userRes, reposRes] = await Promise.all([
      fetchWithBackoff(`https://api.github.com/users/${username}`, { headers }),
      fetchWithBackoff(`https://api.github.com/users/${username}/repos?per_page=100`, { headers })
    ]);

    if (userRes.status === 401 && headers['Authorization']) {
      console.warn(`[GitHub Adapter] 401 Unauthorized with token, retrying unauthenticated...`);
      delete headers['Authorization'];
      [userRes, reposRes] = await Promise.all([
        fetchWithBackoff(`https://api.github.com/users/${username}`, { headers }),
        fetchWithBackoff(`https://api.github.com/users/${username}/repos?per_page=100`, { headers })
      ]);
    }

    if (!userRes.ok) {
      throw new Error(`GitHub user fetch failed with status ${userRes.status}`);
    }

    const userData = await userRes.json();
    let reposData: any[] = [];
    if (reposRes.ok) {
      reposData = await reposRes.json();
    }

    const skills = new Set<string>();
    const projects_raw = reposData.map((repo: any) => {
      if (repo.language) skills.add(repo.language);
      return { 
        name: repo.name, 
        description: repo.description || undefined,
        link: repo.html_url || undefined
      };
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
        projects_raw: projects_raw
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
