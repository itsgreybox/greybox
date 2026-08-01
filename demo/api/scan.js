// /api/scan - live GitHub repo scanner for the demo page.
//
// HONESTY NOTE, on purpose: the actual greybox CLI uses real AST
// parsers (Python's `ast`, Java's `javalang`) for accurate structural
// analysis. Running a real Python/Java parser inside a Vercel Node
// serverless function isn't practical, so this endpoint is a
// regex-based approximation of the same signals. See api/_lib/analyze.js
// for the actual analysis logic, shared with every other scan source.

const { MAX_FILES, runAnalysisPipeline } = require('./_lib/analyze');

const SKIP_DIRS = ['node_modules', '.git', 'vendor', 'test', 'tests', '__pycache__', 'target', 'build', 'dist'];

function parseRepoUrl(url) {
  const m = url.trim().match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
}

async function githubFetch(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'greybox-demo', 'Accept': 'application/vnd.github+json' },
  });
  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
    const resetAt = new Date(parseInt(res.headers.get('x-ratelimit-reset') || '0', 10) * 1000);
    throw new Error(`GitHub API rate limit hit. Resets at ${resetAt.toLocaleTimeString()}.`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
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

  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) {
    const bareOwner = repoUrl.trim().match(/github\.com\/([^\/\s]+)\/?$/);
    if (bareOwner) {
      return res.status(400).json({
        error: `"${bareOwner[1]}" looks like a GitHub user or org, not a specific repo — there's no single repo to scan at that URL. ` +
               `Switch the dropdown above to "Full GitHub org" and enter "${bareOwner[1]}" there to scan every repo in it, or use a full repo URL like https://github.com/${bareOwner[1]}/some-repo.`,
      });
    }
    return res.status(400).json({ error: 'Could not parse a GitHub repo URL. Use a URL like https://github.com/owner/repo' });
  }

  try {
    let repoInfo;
    try {
      repoInfo = await githubFetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`);
    } catch (e) {
      return res.status(404).json({
        error: `Couldn't find ${parsed.owner}/${parsed.repo}. Either it doesn't exist, or it's private ` +
               `(this demo only reads public GitHub repos — private code, or code hosted elsewhere, works with ZIP upload instead).`,
      });
    }
    const branch = repoInfo.default_branch || 'main';

    const treeData = await githubFetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${branch}?recursive=1`
    );

    if (!treeData.tree) {
      return res.status(404).json({ error: 'Could not read repo file tree. Is it public?' });
    }

    const blobs = treeData.tree.filter(t =>
      t.type === 'blob' && !SKIP_DIRS.some(d => t.path.split('/').includes(d))
    );
    const submoduleCount = treeData.tree.filter(t => t.type === 'commit').length;

    if (!blobs.length) {
      if (submoduleCount > 0) {
        return res.status(404).json({
          error: `This repo's tree contains ${submoduleCount} git submodule(s) and no direct files outside of skipped ` +
                 `directories (${SKIP_DIRS.join(', ')}). If the actual source lives in a submodule, scan that submodule's own repo URL directly instead.`,
        });
      }
      return res.status(404).json({ error: 'Could not read any files from this repo tree. Is it public and non-empty?' });
    }

    const fileEntries = blobs.map(item => ({
      path: item.path,
      getSource: async () => {
        const rawUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${branch}/${item.path}`;
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
          error: `Found ${blobs.length} file(s) in this repo's tree${submoduleCount ? ` (plus ${submoduleCount} git submodule(s), not scannable)` : ''}, ` +
                 `but none matched a supported language (Python, Java, JavaScript, Vue, C#, COBOL, Go). If this repo's real source lives elsewhere (a submodule, or a monorepo subpackage published from a different repo), scan that repo directly instead.`,
        });
      }
      throw e;
    }

    return res.status(200).json({
      repo: `${parsed.owner}/${parsed.repo}`,
      ...result,
      note: `This live demo analyzes up to ${MAX_FILES} files per scan (kept modest to stay fast on a public page) using a simplified regex-based analyzer. For full-repo coverage with accurate AST parsing, use the CLI tool - see github.com/itsgreybox/greybox.`,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: String(err.message || err) });
  }
}

// Raised from Vercel's short default timeout — a 100-file scan with
// parallel fetches needs more than the default 5-10s window.
module.exports.config = { maxDuration: 60 };
