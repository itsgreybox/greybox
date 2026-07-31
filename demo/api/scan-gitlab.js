// /api/scan-gitlab - live GitLab repo scanner. Same analysis pipeline
// as GitHub, Bitbucket, and ZIP (see api/_lib/analyze.js) — public
// repos only, no auth token, same honesty pattern as scan.js.

const { runAnalysisPipeline, MAX_FILES } = require('./_lib/analyze');

const SKIP_DIRS = ['node_modules', '.git', 'vendor', 'test', 'tests', '__pycache__', 'target', 'build', 'dist'];
const TREE_PAGE_SIZE = 100;
const MAX_TREE_PAGES = 5; // caps at 500 tree entries — plenty for a demo scan, bounds worst-case latency

function parseGitlabUrl(url) {
  const m = url.trim().match(/gitlab\.com\/(.+?)(?:\.git)?\/?$/);
  if (!m || !m[1]) return null;
  return m[1]; // full namespace path, e.g. "group/subgroup/project" — GitLab allows nested groups
}

async function gitlabFetch(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'greybox-demo' } });
  if (res.status === 429) {
    throw new Error('GitLab API rate limit hit for unauthenticated requests. Try again in a minute.');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitLab API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { repoUrl, forceLanguage } = req.body || {};
  if (!repoUrl) {
    return res.status(400).json({ error: 'repoUrl is required' });
  }

  const projectPath = parseGitlabUrl(repoUrl);
  if (!projectPath) {
    return res.status(400).json({ error: 'Could not parse a GitLab repo URL. Use a URL like https://gitlab.com/group/project' });
  }
  if (!projectPath.includes('/')) {
    return res.status(400).json({
      error: `"${projectPath}" looks like a GitLab user or group, not a specific project — there's no repo to scan directly at that URL. ` +
             `Switch the dropdown above to "Full GitLab group" and enter "${projectPath}" there to scan every project in it, or use a full project URL like https://gitlab.com/${projectPath}/some-project.`,
    });
  }
  const projectId = encodeURIComponent(projectPath);

  try {
    let projectInfo;
    try {
      projectInfo = await gitlabFetch(`https://gitlab.com/api/v4/projects/${projectId}`);
    } catch (e) {
      return res.status(404).json({
        error: `Couldn't find ${projectPath} on GitLab. Either it doesn't exist, or it's private ` +
               `(this demo only reads public GitLab repos — private code works via ZIP upload instead).`,
      });
    }
    const branch = projectInfo.default_branch || 'main';

    let tree = [];
    for (let page = 1; page <= MAX_TREE_PAGES; page++) {
      const pageData = await gitlabFetch(
        `https://gitlab.com/api/v4/projects/${projectId}/repository/tree?recursive=true&per_page=${TREE_PAGE_SIZE}&page=${page}&ref=${encodeURIComponent(branch)}`
      );
      if (!Array.isArray(pageData) || !pageData.length) break;
      tree = tree.concat(pageData);
      if (pageData.length < TREE_PAGE_SIZE) break; // last page reached
    }

    const blobs = tree.filter(t => t.type === 'blob' && !SKIP_DIRS.some(d => t.path.split('/').includes(d)));
    const submoduleCount = tree.filter(t => t.type === 'commit').length;

    if (!blobs.length) {
      if (submoduleCount > 0) {
        return res.status(404).json({
          error: `This repo's tree contains ${submoduleCount} git submodule(s) and no direct files outside of skipped ` +
                 `directories (${SKIP_DIRS.join(', ')}). If the actual source lives in a submodule, scan that submodule's own repo URL directly instead.`,
        });
      }
      return res.status(404).json({ error: 'Could not read any files from this repo tree. Is it public and non-empty?' });
    }

    const nonSourceBlobCount = blobs.length;

    const fileEntries = blobs.map(item => ({
      path: item.path,
      getSource: async () => {
        const rawUrl = `https://gitlab.com/api/v4/projects/${projectId}/repository/files/${encodeURIComponent(item.path)}/raw?ref=${encodeURIComponent(branch)}`;
        const srcRes = await fetch(rawUrl);
        return srcRes.ok ? await srcRes.text() : '';
      },
    }));

    const apiKey = process.env.ANTHROPIC_API_KEY;
    let result;
    try {
      result = await runAnalysisPipeline(fileEntries, { forceLanguage, apiKey });
    } catch (e) {
      if (e.statusCode === 404) {
        return res.status(404).json({
          error: `Found ${nonSourceBlobCount} file(s) in this repo's tree${submoduleCount ? ` (plus ${submoduleCount} git submodule(s), not scannable)` : ''}, ` +
                 `but none matched a supported language (Python, Java, JavaScript, Vue, C#, COBOL, Go). If this repo's real source lives elsewhere (a submodule, or a monorepo subpackage published from a different repo), scan that repo directly instead.`,
        });
      }
      throw e;
    }

    return res.status(200).json({
      repo: projectPath,
      source_type: 'gitlab',
      ...result,
      note: `This live demo analyzes up to ${MAX_FILES} files per repo (checked up to ${MAX_TREE_PAGES * TREE_PAGE_SIZE} tree entries) using a simplified regex-based analyzer. Public GitLab repos only — private code works via ZIP upload instead.`,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: String(err.message || err) });
  }
};

module.exports.config = { maxDuration: 60 };
