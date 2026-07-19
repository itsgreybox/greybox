// /api/scan - live GitHub repo scanner for the demo page.
//
// HONESTY NOTE, on purpose: the actual greybox CLI uses real AST
// parsers (Python's `ast`, Java's `javalang`) for accurate structural
// analysis. Running a real Python/Java parser inside a Vercel Node
// serverless function isn't practical, so this endpoint is a
// regex-based approximation of the same signals (magic numbers, bare
// except/catch, TODO comments, branch counts). It's good enough for a
// live demo, but is explicitly NOT the same accuracy guarantee as the
// CLI - the response says so, and the demo page should too.

const MAX_FILES = 20;
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
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function extractMagicNumbers(src) {
  const nums = [];
  const re = /(?<![\w.])(\d+\.\d+|\d{2,})(?![\w])/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const val = parseFloat(m[1]);
    if (![0, 1, -1].includes(val)) nums.push(val);
  }
  return nums.slice(0, 20);
}

function analyzeSource(name, src, language) {
  const todoMatches = [];
  src.split('\n').forEach((line, i) => {
    if (/TODO|FIXME|DO NOT/i.test(line)) {
      todoMatches.push({ line: i + 1, text: line.trim().slice(0, 200) });
    }
  });

  const branchMatches = src.match(/\b(if|for|while)\b/g) || [];
  const magicNumbers = extractMagicNumbers(src);

  const hasBareExcept = language === 'python'
    ? /except\s*:/.test(src)
    : /catch\s*\([^)]*\)\s*\{\s*\}/.test(src);

  return {
    module: name,
    functions: [...src.matchAll(language === 'python'
      ? /def\s+([a-zA-Z_]\w*)\s*\(/g
      : /(?:public|private|protected)\s+[\w<>\[\]]+\s+([a-zA-Z_]\w*)\s*\(/g)]
      .map(m => m[1]).slice(0, 15),
    branch_count: branchMatches.length,
    magic_numbers: magicNumbers,
    has_bare_except: hasBareExcept,
    todo_comments: todoMatches.slice(0, 5),
  };
}

function confidenceScore(facts) {
  let risk = 0;
  risk += Math.min(facts.branch_count * 5, 40);
  risk += Math.min(facts.magic_numbers.length * 4, 30);
  risk += facts.has_bare_except ? 15 : 0;
  risk += facts.todo_comments.length ? -5 : 10;
  return Math.max(0, 100 - risk);
}

function suggestNextSteps(facts) {
  const steps = [];
  if (facts.magic_numbers.length) {
    steps.push(`Extract the ${facts.magic_numbers.length} undocumented constant(s) into named variables and confirm their meaning with whoever owns this business logic.`);
  }
  if (facts.has_bare_except) {
    steps.push('Add logging to the silent exception handler before touching this file - failures here are currently invisible.');
  }
  for (const t of facts.todo_comments) {
    steps.push(`Track down the person or incident referenced in this comment before changing the code it's attached to: "${t.text}"`);
  }
  if (!steps.length) {
    steps.push('No specific red flags found - reasonable candidate to modernize first, lower risk of breaking something hidden.');
  }
  return steps;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { repoUrl } = req.body || {};
  if (!repoUrl) {
    return res.status(400).json({ error: 'repoUrl is required' });
  }

  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) {
    return res.status(400).json({ error: 'Could not parse a GitHub repo URL. Use a URL like https://github.com/owner/repo' });
  }

  try {
    const repoInfo = await githubFetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`);
    const branch = repoInfo.default_branch || 'main';

    const treeData = await githubFetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${branch}?recursive=1`
    );

    if (!treeData.tree) {
      return res.status(404).json({ error: 'Could not read repo file tree. Is it public?' });
    }

    const candidates = treeData.tree.filter(item => {
      if (item.type !== 'blob') return false;
      if (!/\.(py|java)$/.test(item.path)) return false;
      if (SKIP_DIRS.some(d => item.path.split('/').includes(d))) return false;
      return true;
    }).slice(0, MAX_FILES);

    if (!candidates.length) {
      return res.status(404).json({ error: 'No Python or Java files found in this repo (checked up to the repo size GitHub returns).' });
    }

    const pyCount = candidates.filter(c => c.path.endsWith('.py')).length;
    const javaCount = candidates.filter(c => c.path.endsWith('.java')).length;
    const language = javaCount > pyCount ? 'java' : 'python';

    const modules = await Promise.all(candidates.map(async (item) => {
      const rawUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${branch}/${item.path}`;
      const srcRes = await fetch(rawUrl);
      const src = srcRes.ok ? await srcRes.text() : '';
      const name = item.path.split('/').pop().replace(/\.(py|java)$/, '');
      const facts = analyzeSource(name, src, language);
      const confidence = confidenceScore(facts);
      return {
        module: name,
        path: item.path,
        confidence,
        functions: facts.functions,
        magic_numbers: facts.magic_numbers,
        has_bare_except: facts.has_bare_except,
        flagged_comments: facts.todo_comments,
        suggested_next_steps: suggestNextSteps(facts),
      };
    }));

    modules.sort((a, b) => a.confidence - b.confidence);

    return res.status(200).json({
      repo: `${parsed.owner}/${parsed.repo}`,
      language,
      files_scanned: modules.length,
      files_available: treeData.tree.filter(t => t.type === 'blob' && /\.(py|java)$/.test(t.path)).length,
      note: "This live demo uses a simplified regex-based analyzer for speed. The real CLI tool uses full AST parsing (Python's ast, Java's javalang) for accurate results - see github.com/ArunMishra1/greybox.",
      modules,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
}
