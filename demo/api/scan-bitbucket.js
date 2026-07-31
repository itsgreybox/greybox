// /api/scan-bitbucket - live Bitbucket repo scanner. Same analysis
// pipeline as GitHub, GitLab, and ZIP (see api/_lib/analyze.js).
//
// HONESTY NOTE, on purpose: Bitbucket's API has no single "recursive
// tree" endpoint like GitHub/GitLab do — directory contents are listed
// one level at a time. This endpoint walks the tree breadth-first,
// capped in both total directory fetches and depth, so a very large or
// deeply nested repo gets a partial-but-fast scan instead of a timeout.
// The response says so explicitly — same honesty pattern as everywhere
// else in this tool.

const { runAnalysisPipeline, MAX_FILES, EXT_PATTERN } = require('./_lib/analyze');

const SKIP_DIRS = ['node_modules', '.git', 'vendor', 'test', 'tests', '__pycache__', 'target', 'build', 'dist'];
const MAX_DIR_FETCHES = 80; // caps total API calls during the tree walk
const MAX_DEPTH = 8;

function parseBitbucketUrl(url) {
  const m = url.trim().match(/bitbucket\.org\/([^\/]+)\/([^\/\s]+)/);
  if (!m) return null;
  return { workspace: m[1], repo: m[2].replace(/\.git$/, '') };
}

async function bbFetch(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'greybox-demo' } });
  if (res.status === 429) {
    throw new Error('Bitbucket API rate limit hit for unauthenticated requests. Try again shortly.');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bitbucket API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Breadth-first walk: Bitbucket's /src/{branch}/{path} endpoint lists
// one directory level at a time (paginated via a `next` link), so we
// fan out level by level rather than making one recursive call.
async function walkTree(workspace, repo, branch) {
  const files = [];
  let queue = [''];
  let dirFetches = 0;
  let depth = 0;
  let truncated = false;

  while (queue.length && depth < MAX_DEPTH) {
    const nextQueue = [];
    for (const dirPath of queue) {
      if (dirFetches >= MAX_DIR_FETCHES) { truncated = true; break; }
      let url = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/src/${encodeURIComponent(branch)}/${dirPath}${dirPath ? '/' : ''}?pagelen=100`;
      while (url) {
        dirFetches++;
        const data = await bbFetch(url);
        for (const entry of (data.values || [])) {
          if (entry.type === 'commit_directory') {
            const dirName = entry.path.split('/').pop();
            if (!SKIP_DIRS.includes(dirName)) nextQueue.push(entry.path);
          } else if (entry.type === 'commit_file') {
            files.push(entry.path);
          }
        }
        url = data.next || null;
        if (dirFetches >= MAX_DIR_FETCHES) { truncated = true; break; }
      }
      if (dirFetches >= MAX_DIR_FETCHES) { truncated = true; break; }
    }
    queue = nextQueue;
    depth++;
  }
  if (queue.length) truncated = true; // hit MAX_DEPTH with directories still unvisited
  return { files, truncated };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { repoUrl, forceLanguage } = req.body || {};
  if (!repoUrl) {
    return res.status(400).json({ error: 'repoUrl is required' });
  }

  const parsed = parseBitbucketUrl(repoUrl);
  if (!parsed) {
    const bareWorkspace = repoUrl.trim().match(/bitbucket\.org\/([^\/\s]+)\/?$/);
    if (bareWorkspace) {
      return res.status(400).json({
        error: `"${bareWorkspace[1]}" looks like a Bitbucket workspace, not a specific repo — there's no single repo to scan at that URL. ` +
               `Use a full repo URL like https://bitbucket.org/${bareWorkspace[1]}/some-repo. (Workspace-wide scanning isn't built yet for Bitbucket — GitHub and GitLab have it, Bitbucket doesn't.)`,
      });
    }
    return res.status(400).json({ error: 'Could not parse a Bitbucket repo URL. Use a URL like https://bitbucket.org/workspace/repo' });
  }

  try {
    let repoInfo;
    try {
      repoInfo = await bbFetch(`https://api.bitbucket.org/2.0/repositories/${parsed.workspace}/${parsed.repo}`);
    } catch (e) {
      return res.status(404).json({
        error: `Couldn't find ${parsed.workspace}/${parsed.repo} on Bitbucket. Either it doesn't exist, or it's private ` +
               `(this demo only reads public Bitbucket repos — private code works via ZIP upload instead).`,
      });
    }
    const branch = (repoInfo.mainbranch && repoInfo.mainbranch.name) || 'main';

    const { files: allPaths, truncated } = await walkTree(parsed.workspace, parsed.repo, branch);
    const matchedPaths = allPaths.filter(p => EXT_PATTERN.test(p) && !SKIP_DIRS.some(d => p.split('/').includes(d)));

    if (!matchedPaths.length) {
      return res.status(404).json({ error: 'No Python, Java, JavaScript, Vue, C#, COBOL, or Go files found in the part of the tree this demo was able to walk. Try the CLI for guaranteed full coverage.' });
    }

    const fileEntries = matchedPaths.map(path => ({
      path,
      getSource: async () => {
        const rawUrl = `https://api.bitbucket.org/2.0/repositories/${parsed.workspace}/${parsed.repo}/src/${encodeURIComponent(branch)}/${path}`;
        const srcRes = await fetch(rawUrl);
        return srcRes.ok ? await srcRes.text() : '';
      },
    }));

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const result = await runAnalysisPipeline(fileEntries, { forceLanguage, apiKey });

    return res.status(200).json({
      repo: `${parsed.workspace}/${parsed.repo}`,
      source_type: 'bitbucket',
      ...result,
      note: `Bitbucket has no single "list every file" API like GitHub/GitLab, so this walks the folder tree directly (capped at ${MAX_DIR_FETCHES} directory fetches, depth ${MAX_DEPTH}) — this keeps it fast, but ${truncated ? 'this repo is large/deep enough that the walk was cut short, so some files were not seen at all.' : 'every folder in this repo was reached.'} Analyzed up to ${MAX_FILES} of the matching files found using a simplified regex-based analyzer.`,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: String(err.message || err) });
  }
};

module.exports.config = { maxDuration: 60 };
