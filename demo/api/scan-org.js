// Lightweight org-wide triage: samples a few files per repo across an
// entire GitHub org, ranks repos by rough risk signal, so you know
// which repo to actually deep-scan first (via /api/scan on that one
// repo). This does NOT deep-scan every file in every repo - that would
// blow past GitHub rate limits and serverless timeouts. It's a triage
// pass, not a full report.

const MAX_REPOS = 25;
const SAMPLE_FILES_PER_REPO = 8;

async function githubFetch(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'greybox-demo', 'Accept': 'application/vnd.github+json' },
  });
  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
    const resetAt = new Date(parseInt(res.headers.get('x-ratelimit-reset') || '0', 10) * 1000);
    throw new Error(`GitHub API rate limit hit. Resets at ${resetAt.toLocaleTimeString()}. Try a smaller org or wait a bit.`);
  }
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}`);
  return res.json();
}

function quickSignal(src) {
  const magicNumbers = (src.match(/(?<![\w.])\d{2,}(?![\w])/g) || []).length;
  const bareExcept = /except\s*:|catch\s*\([^)]*\)\s*\{\s*\}/.test(src);
  const todo = /TODO|FIXME|DO NOT/i.test(src);
  let risk = Math.min(magicNumbers * 3, 40) + (bareExcept ? 20 : 0) + (todo ? 10 : 0);
  return Math.max(0, 100 - risk);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { org, orgs } = req.body || {};
  const orgList = (orgs && Array.isArray(orgs) ? orgs : (org || '').split(','))
    .map(o => o.trim()).filter(Boolean);
  if (!orgList.length) return res.status(400).json({ error: 'org or orgs is required' });

  try {
    let allRepos = [];
    const failedOrgs = [];
    for (const orgName of orgList) {
      try {
        const repos = await githubFetch(`https://api.github.com/orgs/${orgName}/repos?per_page=${MAX_REPOS}&sort=updated`);
        if (Array.isArray(repos)) allRepos = allRepos.concat(repos.map(r => ({ ...r, __org: orgName })));
      } catch (e) {
        failedOrgs.push(orgName); // one bad org name in a multi-org request shouldn't fail the whole thing
      }
    }
    if (!allRepos.length) {
      const msg = failedOrgs.length
        ? `Couldn't find or read: ${failedOrgs.join(', ')}. Check the org name(s) are correct and public.`
        : 'No orgs found or no public repos in any of them';
      return res.status(404).json({ error: msg });
    }

    const results = await Promise.all(allRepos.map(async (repo) => {
      try {
        const orgName = repo.__org;
        const branch = repo.default_branch || 'main';
        const tree = await githubFetch(`https://api.github.com/repos/${orgName}/${repo.name}/git/trees/${branch}?recursive=1`);
        if (!tree.tree) return null;

        // Check actual files, not GitHub's single "primary language" field -
        // that field is byte-count-based and misses real Python/Java code
        // sitting in a repo where something else (XML, config, docs) is
        // technically bigger by byte count.
        const candidates = tree.tree.filter(t => t.type === 'blob' && /\.(py|java|jsx?|cs|cbl|cob|go)$/i.test(t.path));
        if (!candidates.length) return null;

        // Spread the sample across the whole file list instead of just
        // taking the first N (alphabetical/tree order) - on a 1000+ file
        // repo, the first 5 files are almost never representative, and
        // real risk gets missed by chance, not because it isn't there.
        const step = Math.max(1, Math.floor(candidates.length / SAMPLE_FILES_PER_REPO));
        const sample = [];
        for (let i = 0; i < candidates.length && sample.length < SAMPLE_FILES_PER_REPO; i += step) {
          sample.push(candidates[i]);
        }
        const scores = await Promise.all(sample.map(async (f) => {
          try {
            const raw = await fetch(`https://raw.githubusercontent.com/${orgName}/${repo.name}/${branch}/${f.path}`);
            const src = raw.ok ? await raw.text() : '';
            return quickSignal(src);
          } catch (e) {
            return 100; // a single file's network hiccup shouldn't tank a whole repo's score - default neutral
          }
        }));
        const avgConfidence = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        const extCounts = {};
        candidates.forEach(c => {
          const ext = c.path.split('.').pop().toLowerCase();
          extCounts[ext] = (extCounts[ext] || 0) + 1;
        });
        const extToLabel = { py: 'Python', java: 'Java', js: 'JavaScript', jsx: 'JavaScript', cs: 'C#', cbl: 'COBOL', cob: 'COBOL', go: 'Go' };
        const topExt = Object.keys(extCounts).reduce((a, b) => (extCounts[a] >= extCounts[b] ? a : b));
        const detectedLanguage = extToLabel[topExt] || 'Python';

        return {
          org: orgName,
          repo: repo.name,
          language: detectedLanguage,
          total_files_matched: candidates.length,
          sampled: sample.length,
          avg_confidence: avgConfidence,
          stars: repo.stargazers_count,
          updated_at: repo.updated_at,
          url: repo.html_url,
        };
      } catch (e) {
        return null;
      }
    }));

    const valid = results.filter(Boolean);
    // Effort proxy: log2(file count) - more files, more effort to modernize.
    // Risk proxy: 100 - sampled confidence.
    valid.forEach(r => {
      const risk = 100 - r.avg_confidence;
      const effort = Math.log2(r.total_files_matched + 2);
      r.priority_score = Math.round(risk * effort);
      r.risk_score = risk;
      r.effort_score = Math.round(effort * 10) / 10;

      if (risk >= 25 && effort <= 5) r.category = 'quick_win';
      else if (risk >= 25 && effort > 5) r.category = 'bigger_effort';
      else r.category = 'steady';
    });
    valid.sort((a, b) => b.priority_score - a.priority_score);

    return res.status(200).json({
      orgs: orgList,
      repos_scanned: valid.length,
      repos_total: allRepos.length, // includes non-Python/Java repos that were skipped entirely
      note: "Lightweight triage - samples a few files per repo across all orgs listed, not a full scan. This is a portfolio priority map, not a cross-repo dependency graph (repos don't share a file-level import graph the way files within one repo do). Deep-scan any single repo via the single-repo scanner for a real report.",
      ranked_repos: valid,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
};

module.exports.config = { maxDuration: 60 };
