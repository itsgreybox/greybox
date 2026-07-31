// Lightweight GitLab group-wide triage: samples a few files per project
// across a GitLab group, ranks projects by rough risk signal. Same
// pattern and same free/paid framing as api/scan-org.js (GitHub) - this
// is a triage pass, not a full scan. Full-depth org/group scanning is
// the paid feature (see the upsell block rendered client-side).

const MAX_PROJECTS = 25;
const SAMPLE_FILES_PER_REPO = 8;
const EXT_PATTERN = /\.(py|java|jsx?|vue|cs|cbl|cob|go)$/i;
const EXT_TO_LABEL = { py: 'Python', java: 'Java', js: 'JavaScript', jsx: 'JavaScript', vue: 'Vue', cs: 'C#', cbl: 'COBOL', cob: 'COBOL', go: 'Go' };

async function gitlabFetch(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'greybox-demo' } });
  if (res.status === 429) {
    throw new Error('GitLab API rate limit hit for unauthenticated requests. Try a smaller group or wait a bit.');
  }
  if (!res.ok) throw new Error(`GitLab API ${res.status} for ${url}`);
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
  const groupList = (orgs && Array.isArray(orgs) ? orgs : (org || '').split(','))
    .map(o => o.trim()).filter(Boolean);
  if (!groupList.length) return res.status(400).json({ error: 'org or orgs (GitLab group name(s)) is required' });

  try {
    let allProjects = [];
    const failedGroups = [];
    for (const groupName of groupList) {
      try {
        const groupId = encodeURIComponent(groupName);
        const projects = await gitlabFetch(
          `https://gitlab.com/api/v4/groups/${groupId}/projects?per_page=${MAX_PROJECTS}&order_by=last_activity_at&include_subgroups=true&archived=false`
        );
        if (Array.isArray(projects)) allProjects = allProjects.concat(projects.map(p => ({ ...p, __group: groupName })));
      } catch (e) {
        failedGroups.push(groupName); // one bad group name in a multi-group request shouldn't fail the whole thing
      }
    }
    if (!allProjects.length) {
      const msg = failedGroups.length
        ? `Couldn't find or read: ${failedGroups.join(', ')}. Check the group name(s) are correct and public.`
        : 'No groups found or no public projects in any of them';
      return res.status(404).json({ error: msg });
    }

    const results = await Promise.all(allProjects.map(async (project) => {
      try {
        const groupName = project.__group;
        const projectId = project.id; // numeric ID from the list call — simpler than re-encoding the path
        const branch = project.default_branch || 'main';
        const treeData = await gitlabFetch(
          `https://gitlab.com/api/v4/projects/${projectId}/repository/tree?recursive=true&per_page=100&ref=${encodeURIComponent(branch)}`
        );
        if (!Array.isArray(treeData)) return null;

        const candidates = treeData.filter(t => t.type === 'blob' && EXT_PATTERN.test(t.path));
        if (!candidates.length) return null;

        // Spread the sample across the whole file list, not just the
        // first N in tree order - same reasoning as the GitHub version.
        const step = Math.max(1, Math.floor(candidates.length / SAMPLE_FILES_PER_REPO));
        const sample = [];
        for (let i = 0; i < candidates.length && sample.length < SAMPLE_FILES_PER_REPO; i += step) {
          sample.push(candidates[i]);
        }
        const scores = await Promise.all(sample.map(async (f) => {
          try {
            const rawUrl = `https://gitlab.com/api/v4/projects/${projectId}/repository/files/${encodeURIComponent(f.path)}/raw?ref=${encodeURIComponent(branch)}`;
            const raw = await fetch(rawUrl);
            const src = raw.ok ? await raw.text() : '';
            return quickSignal(src);
          } catch (e) {
            return 100; // a single file's network hiccup shouldn't tank a whole project's score - default neutral
          }
        }));
        const avgConfidence = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        const extCounts = {};
        candidates.forEach(c => {
          const ext = c.path.split('.').pop().toLowerCase();
          extCounts[ext] = (extCounts[ext] || 0) + 1;
        });
        const topExt = Object.keys(extCounts).reduce((a, b) => (extCounts[a] >= extCounts[b] ? a : b));
        const detectedLanguage = EXT_TO_LABEL[topExt] || 'Python';

        return {
          org: groupName,
          repo: project.path,
          language: detectedLanguage,
          total_files_matched: candidates.length,
          sampled: sample.length,
          avg_confidence: avgConfidence,
          stars: project.star_count,
          updated_at: project.last_activity_at,
          url: project.web_url,
        };
      } catch (e) {
        return null;
      }
    }));

    const valid = results.filter(Boolean);
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
      orgs: groupList,
      repos_scanned: valid.length,
      repos_total: allProjects.length, // includes non-matching-language projects that were skipped entirely
      note: "Lightweight triage - samples a few files per project across all GitLab groups listed, not a full scan. This is a portfolio priority map, not a cross-project dependency graph. Deep-scan any single project via the single-repo GitLab scanner for a real report.",
      ranked_repos: valid,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
};

module.exports.config = { maxDuration: 60 };
