// Shared analysis engine for all scan sources (GitHub, ZIP upload, and
// any future adapter — GitLab, Bitbucket, etc). Fetching files is a
// per-source concern; analyzing them is not, so it lives here once.
//
// HONESTY NOTE, carried over from the original scan.js: this is a
// regex-based approximation of the real CLI's AST parsing. Good enough
// for a live demo, not the same accuracy guarantee as the CLI.

const MAX_FILES = 100;
const SKIP_DIRS = ['node_modules', '.git', 'vendor', 'test', 'tests', '__pycache__', 'target', 'build', 'dist'];
const EXT_PATTERN = /\.(py|java|jsx?|vue|cs|cbl|cob|go)$/i;
const LANG_TO_EXT_TEST = {
  python: (p) => /\.py$/i.test(p),
  java: (p) => /\.java$/i.test(p),
  javascript: (p) => /\.jsx?$/i.test(p),
  vue: (p) => /\.vue$/i.test(p),
  csharp: (p) => /\.cs$/i.test(p),
  cobol: (p) => /\.(cbl|cob)$/i.test(p),
  go: (p) => /\.go$/i.test(p),
};
const EXT_TO_LANG = { py: 'python', java: 'java', js: 'javascript', jsx: 'javascript', vue: 'vue', cs: 'csharp', cbl: 'cobol', cob: 'cobol', go: 'go' };

const FUNCTION_PATTERNS = {
  python: /def\s+([a-zA-Z_]\w*)\s*\(/g,
  java: /(?:public|private|protected)\s+[\w<>\[\]]+\s+([a-zA-Z_]\w*)\s*\(/g,
  javascript: /function\s+([a-zA-Z_]\w*)\s*\(|(?:const|let|var)\s+([a-zA-Z_]\w*)\s*=\s*(?:async\s*)?\(?[^)]*\)?\s*=>/g,
  vue: /function\s+([a-zA-Z_]\w*)\s*\(|(?:const|let|var)\s+([a-zA-Z_]\w*)\s*=\s*(?:async\s*)?\(?[^)]*\)?\s*=>/g,
  csharp: /(?:public|private|protected|internal|static)\s+[\w<>\[\],\s]+?\s+([a-zA-Z_]\w*)\s*\([^)]*\)\s*\{/g,
  cobol: /^\s{0,7}([A-Z0-9][A-Z0-9\-]{2,})\s*\.\s*$/gm,
  go: /\bfunc\s+(?:\([^)]*\)\s*)?([a-zA-Z_]\w*)\s*\(/g,
};
const BARE_EXCEPT_PATTERNS = {
  python: /except\s*:/,
  java: /catch\s*\([^)]*\)\s*\{\s*\}/,
  javascript: /catch\s*\([^)]*\)\s*\{\s*\}/,
  vue: /catch\s*\([^)]*\)\s*\{\s*\}/,
  csharp: /catch\s*(\([^)]*\))?\s*\{\s*\}/,
  cobol: null, // COBOL error handling doesn't map cleanly - not scored, same as the CLI
  go: /recover\(\)[^{]*\{\s*\}/,
};

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

function extractImports(src, language) {
  const imports = [];
  if (language === 'python') {
    for (const m of src.matchAll(/^from\s+([\w.]+)\s+import/gm)) imports.push(m[1].split('.').pop());
    for (const m of src.matchAll(/^import\s+([\w.]+)/gm)) imports.push(m[1].split('.').pop());
  } else if (language === 'java') {
    for (const m of src.matchAll(/^import\s+([\w.]+);/gm)) imports.push(m[1].split('.').pop());
  } else if (language === 'javascript' || language === 'vue') {
    for (const m of src.matchAll(/^import\s+.*?from\s+['"]([^'"]+)['"]/gm)) imports.push(m[1].split('/').pop());
    for (const m of src.matchAll(/require\(['"]([^'"]+)['"]\)/g)) imports.push(m[1].split('/').pop());
  } else if (language === 'csharp') {
    for (const m of src.matchAll(/^\s*using\s+([\w.]+)\s*;/gm)) imports.push(m[1].split('.').pop());
  } else if (language === 'cobol') {
    for (const m of src.matchAll(/\bCOPY\s+([A-Z0-9][A-Z0-9\-]*)/gi)) imports.push(m[1]);
  } else if (language === 'go') {
    for (const m of src.matchAll(/^\s*"([\w./\-]+)"/gm)) imports.push(m[1].split('/').pop());
  }
  return [...new Set(imports)];
}

function analyzeSource(name, src, language) {
  const todoMatches = [];
  src.split('\n').forEach((line, i) => {
    if (/TODO|FIXME|DO NOT/i.test(line)) {
      todoMatches.push({ line: i + 1, text: line.trim().slice(0, 200) });
    }
  });

  const branchMatches = src.match(/\b(if|for|while|foreach|PERFORM)\b/gi) || [];
  const magicNumbers = extractMagicNumbers(src);

  const bareExceptPattern = BARE_EXCEPT_PATTERNS[language];
  const hasBareExcept = bareExceptPattern ? bareExceptPattern.test(src) : false;

  const funcPattern = FUNCTION_PATTERNS[language] || FUNCTION_PATTERNS.python;
  const functions = [...src.matchAll(funcPattern)].map(m => m[1] || m[2]).filter(Boolean).slice(0, 15);

  return {
    name,
    functions,
    branch_count: branchMatches.length,
    magic_numbers: magicNumbers,
    has_bare_except: hasBareExcept,
    todo_comments: todoMatches.slice(0, 5),
    imports: extractImports(src, language),
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

// Same redaction discipline as the real CLI (src/greybox/explainer.py) -
// strip obvious hardcoded secrets before anything is sent to Claude.
function redactSecrets(src) {
  let redacted = src;
  redacted = redacted.replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED_API_KEY]');
  redacted = redacted.replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED_AWS_KEY]');
  redacted = redacted.replace(/(mongodb|postgres|mysql|redis):\/\/[^\s"']+/gi, '[REDACTED_CONNECTION_STRING]');
  redacted = redacted.replace(
    /(password|passwd|pwd|secret|token|api_key|apikey)\s*([=:])\s*["']([^"']{4,})["']/gi,
    (_, key, sep) => `${key}${sep}"[REDACTED]"`
  );
  return redacted;
}

async function explainWithClaude(facts, src, apiKey) {
  const safeSrc = redactSecrets(src).slice(0, 6000); // cap length for cost/speed
  const prompt = `You are analyzing an undocumented legacy code module for a modernization assessment. Use ONLY the facts and code below - do not invent behavior. If something is genuinely ambiguous, say so explicitly rather than guessing confidently.

Module: ${facts.name}
Functions found: ${JSON.stringify(facts.functions)}
Magic numbers found (undocumented constants): ${JSON.stringify(facts.magic_numbers)}
Branch/conditional count: ${facts.branch_count}
Bare except/catch (swallows errors silently): ${facts.has_bare_except}
TODO/warning comments found: ${JSON.stringify(facts.todo_comments)}

Source (secrets redacted):
${safeSrc}

Respond in this exact format, tight and concise:
SUMMARY: <2-3 plain English sentences on what this module does>
RISKS: <bullet list of specific ambiguous or risky behaviors, citing evidence>
UNCERTAIN_ABOUT: <what you genuinely cannot determine from this code alone>`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    return { source: 'error', text: `AI explanation failed (${res.status}): ${errBody.slice(0, 200)}` };
  }
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  return { source: 'live_claude_api', text };
}

// Given a flat list of { path, getSource: async () => string } entries
// (source-agnostic — GitHub, a ZIP, anything), run the full pipeline:
// filter -> pick dominant language -> analyze -> score -> dependency
// graph -> AI-explain the top 3 riskiest. Returns the same shape the
// API has always returned, regardless of where the files came from.
async function runAnalysisPipeline(fileEntries, { forceLanguage, apiKey } = {}) {
  const langFilter = (forceLanguage && forceLanguage !== 'auto' && LANG_TO_EXT_TEST[forceLanguage]) || null;

  const allMatchedFiles = fileEntries.filter(f =>
    EXT_PATTERN.test(f.path) && (!langFilter || langFilter(f.path)) &&
    !SKIP_DIRS.some(d => f.path.split('/').includes(d))
  );
  const allFileNames = new Set(allMatchedFiles.map(f => f.path.split('/').pop().replace(EXT_PATTERN, '')));

  if (!allMatchedFiles.length) {
    const langMsg = langFilter ? ` matching "${forceLanguage}"` : '';
    const err = new Error(`No Python, Java, JavaScript, C#, COBOL, or Go files found${langMsg}.`);
    err.statusCode = 404;
    throw err;
  }

  const candidates = allMatchedFiles.slice(0, MAX_FILES);

  const counts = {};
  candidates.forEach(c => {
    const ext = c.path.split('.').pop().toLowerCase();
    const lang = EXT_TO_LANG[ext] || 'python';
    counts[lang] = (counts[lang] || 0) + 1;
  });
  const language = Object.keys(counts).reduce((a, b) => (counts[a] >= counts[b] ? a : b));

  const modules = await Promise.all(candidates.map(async (item) => {
    let src = '';
    try { src = await item.getSource(); } catch (e) { src = ''; }
    const name = item.path.split('/').pop().replace(EXT_PATTERN, '');
    const ext = item.path.split('.').pop().toLowerCase();
    const fileLanguage = EXT_TO_LANG[ext] || language; // this file's actual language, not the batch's dominant one
    const facts = analyzeSource(name, src, fileLanguage);
    const confidence = confidenceScore(facts);
    return {
      module: name,
      path: item.path,
      confidence,
      functions: facts.functions,
      magic_numbers: facts.magic_numbers,
      has_bare_except: facts.has_bare_except,
      flagged_comments: facts.todo_comments,
      depends_on: facts.imports,
      suggested_next_steps: suggestNextSteps(facts),
      _getSource: item.getSource, // kept only for the AI-explanation pass below
    };
  }));

  modules.sort((a, b) => a.confidence - b.confidence);

  const dependencyGraph = {};
  modules.forEach(m => {
    dependencyGraph[m.module] = m.depends_on.filter(d => allFileNames.has(d) && d !== m.module);
  });

  if (apiKey) {
    const toExplain = modules.slice(0, 3);
    await Promise.all(toExplain.map(async (m) => {
      let src = '';
      try { src = await m._getSource(); } catch (e) { src = ''; }
      const facts = { name: m.module, functions: m.functions, magic_numbers: m.magic_numbers,
                       branch_count: 0, has_bare_except: m.has_bare_except, todo_comments: m.flagged_comments };
      m.ai_explanation = await explainWithClaude(facts, src, apiKey);
    }));
  } else {
    modules.slice(0, 3).forEach(m => {
      m.ai_explanation = { source: 'no_api_key_set', text: 'Set ANTHROPIC_API_KEY in Vercel project settings to enable real AI explanations here.' };
    });
  }

  modules.forEach(m => { delete m._getSource; });

  return {
    language,
    languages_breakdown: counts,
    files_scanned: modules.length,
    files_available: allMatchedFiles.length,
    ai_enabled: Boolean(apiKey),
    dependency_graph: dependencyGraph,
    modules,
  };
}

module.exports = {
  MAX_FILES, SKIP_DIRS, EXT_PATTERN, LANG_TO_EXT_TEST, EXT_TO_LANG,
  analyzeSource, confidenceScore, suggestNextSteps, redactSecrets,
  explainWithClaude, runAnalysisPipeline,
};
