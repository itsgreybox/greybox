// Shared across pages: graph rendering (with pan/zoom + open-in-new-tab),
// escaping helpers, and the full Markdown report generator.

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function sanitizeId(name) {
  return String(name).replace(/[^a-zA-Z0-9_]/g, '_');
}

function buildMermaidSource(dependencyGraph) {
  const lines = ["%%{init: {'flowchart': {'nodeSpacing': 45, 'rankSpacing': 70, 'curve': 'basis'}}}%%", 'graph LR'];
  const declared = new Set();
  const declare = (mod) => {
    if (declared.has(mod)) return;
    lines.push(`    ${sanitizeId(mod)}["${mod}"]`);
    declared.add(mod);
  };
  for (const [mod, deps] of Object.entries(dependencyGraph)) {
    declare(mod); // every scanned file shows up as a node, even with zero connections
    (deps || []).forEach(d => {
      declare(d);
      lines.push(`    ${sanitizeId(mod)} --> ${sanitizeId(d)}`);
    });
  }
  return lines.join('\n');
}

// Real repos often have too many cross-cutting files to show all at once
// readably. Keep the most-connected nodes (the ones that actually explain
// the shape of the system) plus anything already in the risk pool, drop
// the rest, and say so honestly rather than rendering an unreadable web.
function computeGraphSubset(dependencyGraph, riskyModuleNames, maxNodes) {
  maxNodes = maxNodes || 12;
  const degree = {};
  for (const [mod, deps] of Object.entries(dependencyGraph)) {
    degree[mod] = (degree[mod] || 0) + deps.length;
    deps.forEach(d => { degree[d] = (degree[d] || 0) + 1; });
  }
  const allNodes = Object.keys(degree);
  if (allNodes.length <= maxNodes) {
    return { graph: dependencyGraph, kept: allNodes.length, total: allNodes.length };
  }

  const priority = new Set(riskyModuleNames || []);
  const ranked = allNodes.sort((a, b) => {
    const aPri = priority.has(a) ? 1 : 0, bPri = priority.has(b) ? 1 : 0;
    if (aPri !== bPri) return bPri - aPri;
    return (degree[b] || 0) - (degree[a] || 0);
  });
  const keep = new Set(ranked.slice(0, maxNodes));

  const filtered = {};
  for (const [mod, deps] of Object.entries(dependencyGraph)) {
    if (!keep.has(mod)) continue;
    filtered[mod] = deps.filter(d => keep.has(d));
  }
  return { graph: filtered, kept: keep.size, total: allNodes.length };
}

// Renders a graph into a bounded, pannable/zoomable frame (manual CSS
// transform pan/zoom - not relying on svg-pan-zoom's fit/viewBox
// assumptions against Mermaid's generated SVGs, which proved unreliable)
// and wires up drag-to-pan, scroll-to-zoom, and the toolbar buttons.
async function renderZoomableGraph(frameEl, mermaidSrc, title) {
  const containerId = 'g' + Math.random().toString(36).slice(2, 9);
  frameEl.innerHTML = `<div class="mermaid" id="${containerId}" style="display:inline-block; transform-origin:0 0;">${mermaidSrc}</div>`;

  try {
    await mermaid.run({ querySelector: `#${containerId}` });
  } catch (e) {
    frameEl.innerHTML = '<div style="padding:20px; color:var(--muted); font-size:13px;">Graph failed to render.</div>';
    return;
  }

  frameEl.__inner = document.getElementById(containerId);
  frameEl.__zoom = 1;
  frameEl.__panX = 20;
  frameEl.__panY = 20;
  frameEl.__mermaidSrc = mermaidSrc;
  frameEl.__title = title || 'Dependency Graph';
  _applyGraphTransform(frameEl);
  _wireGraphDragAndWheel(frameEl);
}

function _applyGraphTransform(frameEl) {
  const inner = frameEl.__inner;
  if (!inner) return;
  inner.style.transform = `translate(${frameEl.__panX}px, ${frameEl.__panY}px) scale(${frameEl.__zoom})`;
}

function _wireGraphDragAndWheel(frameEl) {
  if (frameEl.__wired) return; // don't double-bind if re-rendered into the same frame
  frameEl.__wired = true;
  frameEl.style.cursor = 'grab';

  let dragging = false, startX = 0, startY = 0, startPanX = 0, startPanY = 0;
  frameEl.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    startPanX = frameEl.__panX; startPanY = frameEl.__panY;
    frameEl.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    frameEl.__panX = startPanX + (e.clientX - startX);
    frameEl.__panY = startPanY + (e.clientY - startY);
    _applyGraphTransform(frameEl);
  });
  window.addEventListener('mouseup', () => {
    dragging = false;
    frameEl.style.cursor = 'grab';
  });
  frameEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    frameEl.__zoom = Math.min(Math.max((frameEl.__zoom || 1) * factor, 0.2), 6);
    _applyGraphTransform(frameEl);
  }, { passive: false });
}

// Findings breakdown - deliberately NOT called "vulnerabilities": this
// tool doesn't do security scanning (no CVE checks, no exploit pattern
// matching). This is a category breakdown of the deterministic risk
// signals it actually looks for, honestly labeled.
function renderConfidenceExplainer() {
  return `<div class="graph-box" style="font-size:13.5px; color:var(--muted); line-height:1.7; display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap;">
    <div><b style="color:var(--text);">How confidence is calculated:</b> a fixed point score based on real code signals — branching, undocumented values, silent error handling, and missing risk comments — computed before any AI runs. Not a vibe, not an AI's opinion of itself.</div>
    <button class="tech-toggle" onclick="_toggleDetail(this, 'confidenceFormula')"><span>Exact formula</span><span class="chev">▾</span></button>
    <div class="module-detail" id="confidenceFormula" style="flex-basis:100%; margin-top:0;">
      <ul style="margin:0; padding-left:20px;">
        <li>Starts at 100</li>
        <li>−5 per branch/conditional (if/for/while), capped at −40</li>
        <li>−4 per undocumented constant found, capped at −30</li>
        <li>−15 if a silent exception handler is found</li>
        <li>−10 if there are zero comments flagging risk (having none is worse than having some — it means no human ever flagged the danger)</li>
      </ul>
    </div>
  </div>`;
}

// Generic collapse/expand toggle used by module cards and inline detail
// panels — technical detail stays a click away instead of disappearing
// into a download or cluttering the page by default.
function _toggleDetail(btn, id) {
  const panel = document.getElementById(id);
  if (!panel) return;
  const isOpen = panel.classList.toggle('open');
  btn.classList.toggle('open', isOpen);
}

function renderStatCards(stats) {
  return `<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px; margin-bottom:8px;">
    ${stats.map(s => `
      <div class="graph-box" style="text-align:center; padding:22px 14px;">
        <div style="font-family:'Space Grotesk',sans-serif; font-size:28px; font-weight:700; color:var(--cyan); line-height:1.2;">${s.big}</div>
        <div style="font-size:12.5px; color:var(--text); margin-top:6px; line-height:1.4;">${s.label}</div>
        <div style="font-family:'IBM Plex Mono',monospace; font-size:10.5px; color:var(--muted); margin-top:8px;">${s.source}</div>
      </div>`).join('')}
  </div>`;
}

// approx USD equivalents noted explicitly - for visual comparison only, not exact
function renderIncidentChart() {
  const incidents = [
    { name: 'Queensland Health (AU$1.25B)', usd: 820, year: '2010s', detail: 'AU$6M payroll upgrade became a AU$1.25B disaster' },
    { name: 'Southwest Airlines', usd: 800, year: '2022', detail: '16,700 flights cancelled - 1990s scheduling system couldn\'t handle a winter storm' },
    { name: 'Knight Capital', usd: 460, year: '2012', detail: 'Dormant legacy code accidentally triggered - lost in 45 minutes, nearly bankrupted the firm' },
    { name: 'TSB Bank (£330M)', usd: 415, year: '2018', detail: 'Botched core banking migration - cost the CEO his job' },
  ];
  const max = Math.max(...incidents.map(i => i.usd));
  const rows = incidents.map(i => {
    const pct = (i.usd / max) * 100;
    return `<div style="margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:5px;">
        <span style="color:var(--text); font-weight:500;">${i.name}</span>
        <span style="color:var(--muted); font-family:'IBM Plex Mono',monospace;">~$${i.usd}M · ${i.year}</span>
      </div>
      <div style="background:var(--surface-2); border-radius:4px; height:10px; overflow:hidden;">
        <div style="background:var(--amber); height:100%; width:${pct}%; border-radius:4px;"></div>
      </div>
      <div style="font-size:12px; color:var(--muted); margin-top:5px;">${i.detail}</div>
    </div>`;
  }).join('');
  return `<div class="graph-box">${rows}<div style="font-size:11px; color:var(--muted); margin-top:4px;">Non-USD figures converted approximately, for visual comparison only.</div></div>`;
}

function renderFindingsChart(data) {
  const categories = { flagged_comment: 0, silent_failure: 0, undocumented_constants: 0, clean: 0 };
  data.modules.forEach(m => {
    if ((m.flagged_comments || []).length) categories.flagged_comment++;
    else if (m.has_bare_except) categories.silent_failure++;
    else if ((m.magic_numbers || []).length) categories.undocumented_constants++;
    else categories.clean++;
  });

  const total = data.modules.length || 1;
  const colors = { flagged_comment: '#F0A63A', silent_failure: '#F3766B', undocumented_constants: '#4FD1E8', clean: '#7FD98A' };
  const labels = { flagged_comment: 'Flagged risky comments', silent_failure: 'Silent failure handling', undocumented_constants: 'Undocumented constants', clean: 'No red flags found' };

  let cumulative = 0;
  const R = 60, CX = 70, CY = 70, STROKE = 26;
  const circumference = 2 * Math.PI * R;
  let segments = '';
  for (const key of Object.keys(categories)) {
    const count = categories[key];
    if (!count) continue;
    const frac = count / total;
    const dash = frac * circumference;
    const gap = circumference - dash;
    const offset = circumference * 0.25 - cumulative; // start at top
    segments += `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${colors[key]}" stroke-width="${STROKE}"
      stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${offset}" transform="rotate(-90 ${CX} ${CY})" />`;
    cumulative += dash;
  }

  const legendHtml = Object.keys(categories).filter(k => categories[k]).map(key =>
    `<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; font-size:13.5px;">
      <span style="width:11px; height:11px; border-radius:3px; background:${colors[key]}; display:inline-block;"></span>
      <span style="color:var(--text);">${categories[key]}</span>
      <span style="color:var(--muted);">${escapeHtml(labels[key])}</span>
    </div>`
  ).join('');

  return `
    <div class="graph-box" style="display:flex; gap:28px; align-items:center; flex-wrap:wrap;">
      <svg width="140" height="140" viewBox="0 0 140 140">${segments}
        <circle cx="${CX}" cy="${CY}" r="${R - STROKE / 2 - 2}" fill="var(--surface-2)" />
        <text x="${CX}" y="${CY - 4}" text-anchor="middle" fill="var(--text)" font-size="20" font-weight="600" font-family="Space Grotesk">${total}</text>
        <text x="${CX}" y="${CY + 14}" text-anchor="middle" fill="var(--muted)" font-size="10" font-family="IBM Plex Mono">files</text>
      </svg>
      <div>
        <div style="font-family:'IBM Plex Mono', monospace; font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:10px;">Findings breakdown <span style="color:var(--muted); text-transform:none; letter-spacing:0;">(not a security scan — see "why not just Claude")</span></div>
        ${legendHtml}
      </div>
    </div>`;
}

function graphZoomIn(frameEl) {
  frameEl.__zoom = Math.min((frameEl.__zoom || 1) * 1.25, 6);
  _applyGraphTransform(frameEl);
}
function graphZoomOut(frameEl) {
  frameEl.__zoom = Math.max((frameEl.__zoom || 1) / 1.25, 0.2);
  _applyGraphTransform(frameEl);
}
function graphReset(frameEl) {
  frameEl.__zoom = 1;
  frameEl.__panX = 20;
  frameEl.__panY = 20;
  _applyGraphTransform(frameEl);
}

function openGraphFullSize(frameEl) {
  const src = frameEl.__mermaidSrc;
  const title = frameEl.__title || 'Dependency Graph';
  if (!src) return;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <meta charset="UTF-8">
    <style>
      body { margin:0; background:#0B1220; height:100vh; overflow:hidden; cursor:grab; }
      #inner { display:inline-block; transform-origin:0 0; }
      .toolbar { position:fixed; bottom:16px; right:16px; display:flex; gap:8px; z-index:10; }
      .toolbar button { font-family:monospace; font-size:14px; background:#17233B; border:1px solid #26334D; color:#E5EAF2; padding:8px 14px; border-radius:4px; cursor:pointer; }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.0/mermaid.min.js"></script>
    </head><body>
    <div id="inner"><div class="mermaid" id="fg">${src}</div></div>
    <div class="toolbar">
      <button onclick="z(0.8)">−</button>
      <button onclick="z(1.25)">+</button>
      <button onclick="reset()">Reset</button>
    </div>
    <script>
      mermaid.initialize({ theme: 'dark' });
      let zoom = 1, panX = 40, panY = 40;
      function apply() { document.getElementById('inner').style.transform = 'translate('+panX+'px,'+panY+'px) scale('+zoom+')'; }
      function z(f) { zoom = Math.min(Math.max(zoom * f, 0.15), 8); apply(); }
      function reset() { zoom = 1; panX = 40; panY = 40; apply(); }
      mermaid.run({ querySelector: '#fg' }).then(apply);

      let dragging = false, sx = 0, sy = 0, spx = 0, spy = 0;
      document.body.addEventListener('mousedown', e => { dragging = true; sx = e.clientX; sy = e.clientY; spx = panX; spy = panY; document.body.style.cursor = 'grabbing'; });
      window.addEventListener('mousemove', e => { if (!dragging) return; panX = spx + (e.clientX - sx); panY = spy + (e.clientY - sy); apply(); });
      window.addEventListener('mouseup', () => { dragging = false; document.body.style.cursor = 'grab'; });
      document.body.addEventListener('wheel', e => { e.preventDefault(); z(e.deltaY < 0 ? 1.12 : 0.89); }, { passive: false });
    </script>
    </body></html>`);
  w.document.close();
}

// The actual deliverable for the "Yes, help me build one" paid CTA.
// Combines pieces that already exist (quick-win/bigger-effort grouping,
// the cost/timeline formula) into one phased document - this is real,
// not a placeholder, so there's something to actually send once someone
// reaches out, not a blank page under time pressure.
function generateFullRoadmap(data, teamSize, dayRate) {
  teamSize = teamSize || 2;
  dayRate = dayRate || 800;
  const DAYS_PER_EFFORT_POINT = 1.5;

  const isOrgScan = Array.isArray(data.ranked_repos);
  const items = isOrgScan ? data.ranked_repos : data.modules;
  const nameOf = (x) => isOrgScan ? `${x.org}/${x.repo}` : x.path;
  const effortOf = (x) => isOrgScan
    ? Math.log2(x.total_files_matched + 2)
    : Math.log2((x.functions.length || 1) + 2);
  const confOf = (x) => isOrgScan ? x.avg_confidence : x.confidence;

  const withEffort = items.map(x => ({
    name: nameOf(x), confidence: confOf(x), effort: effortOf(x),
    risk: 100 - confOf(x),
  }));

  const quickWins = withEffort.filter(x => x.risk >= 25 && x.effort <= 5).sort((a,b) => a.effort - b.effort);
  const biggerEfforts = withEffort.filter(x => x.risk >= 25 && x.effort > 5).sort((a,b) => b.risk - a.risk);
  const steady = withEffort.filter(x => x.risk < 25);

  const phaseDays = (arr) => Math.round(arr.reduce((s, x) => s + x.effort, 0) * DAYS_PER_EFFORT_POINT) || 0;
  const phaseCost = (days) => days * dayRate;
  const phaseWeeks = (days) => Math.round(days / teamSize / 5 * 10) / 10;

  const p1Days = phaseDays(quickWins), p2Days = phaseDays(biggerEfforts);
  const lines = [];
  lines.push(`# Modernization Roadmap`);
  lines.push(`\nBased on: ${isOrgScan ? data.orgs.join(', ') : data.repo}`);
  lines.push(`Assumptions: ${teamSize} developers, $${dayRate}/day per developer. Effort is a rough proxy from file/function counts, not real complexity - use this to start a planning conversation, not as a committed estimate.\n`);

  lines.push(`## Phase 1 — Quick Wins (${quickWins.length} items)`);
  lines.push(`Estimated ${p1Days} developer-days (~${phaseWeeks(p1Days)} weeks with ${teamSize} devs, ~$${phaseCost(p1Days).toLocaleString()})\n`);
  quickWins.forEach((x, i) => lines.push(`${i+1}. **${x.name}** — ${x.confidence}/100 confidence`));

  lines.push(`\n## Phase 2 — Bigger Efforts (${biggerEfforts.length} items)`);
  lines.push(`Estimated ${p2Days} developer-days (~${phaseWeeks(p2Days)} weeks with ${teamSize} devs, ~$${phaseCost(p2Days).toLocaleString()})\n`);
  biggerEfforts.forEach((x, i) => lines.push(`${i+1}. **${x.name}** — ${x.confidence}/100 confidence`));

  lines.push(`\n## Monitor, Don't Prioritize (${steady.length} items)`);
  lines.push(`Confidence looks fine for now - revisit on your next quarterly scan, not urgent.\n`);
  steady.slice(0, 10).forEach(x => lines.push(`- ${x.name} (${x.confidence}/100)`));
  if (steady.length > 10) lines.push(`- ...and ${steady.length - 10} more`);

  lines.push(`\n## Total`);
  lines.push(`~${p1Days + p2Days} developer-days across Phase 1 + 2, ~$${phaseCost(p1Days + p2Days).toLocaleString()} at your inputs above.`);
  lines.push(`\n---\n_Generated by greybox. This is a starting sequence based on file-level signals - a real roadmap conversation should validate this against actual code complexity and business priority._`);

  return lines.join('\n');
}

function generateMarkdownReport(data) {
  const lines = [];
  lines.push(`# greybox Assessment Report`);
  lines.push(`\nRepo scanned: ${data.repo} (${data.language}, ${data.files_scanned} of ${data.files_available} files)\n`);

  const avgConf = Math.round(data.modules.reduce((s, m) => s + m.confidence, 0) / data.modules.length);
  const highRisk = data.modules.filter(m => m.confidence < 50).length;
  const repoEffort = data.modules.reduce((s, m) => s + Math.log2((m.functions.length || 1) + 2), 0);
  const estDays = Math.round(repoEffort * 1.5) || 1;

  lines.push(`## Executive Summary\n`);
  lines.push(`- **Average confidence:** ${avgConf}/100`);
  lines.push(`- **High-risk files (below 50/100):** ${highRisk} of ${data.modules.length}`);
  lines.push(`- **Rough estimate:** ~${estDays} developer-days total (napkin estimate based on file/function `
              + `counts, not real complexity — 1 developer-day ≈ 1 "effort point" × 1.5, adjust for your `
              + `team: divide by team size for calendar days, multiply by daily rate for cost)\n`);

  lines.push(`## What To Do Next\n`);
  lines.push(`_The riskiest files, ranked lowest-confidence-first, each with a direct first action._\n`);
  data.modules.slice(0, 5).forEach((m, i) => {
    lines.push(`${i + 1}. \`${m.path}\` — ${m.confidence}/100 confidence. **First action:** ${m.suggested_next_steps[0]}`);
  });

  lines.push(`\n## Dependency Graph\n`);
  lines.push('```mermaid');
  lines.push(buildMermaidSource(data.dependency_graph));
  lines.push('```\n');

  lines.push(`## Module-by-Module Findings\n`);
  data.modules.forEach((m) => {
    lines.push(`### \`${m.path}\``);
    lines.push(`- **Confidence: ${m.confidence}/100**`);
    lines.push(`- Functions: ${m.functions.join(', ') || 'none detected'}`);
    lines.push(`- Depends on: ${(data.dependency_graph[m.module] || []).join(', ') || 'none found in this repo'}`);
    lines.push(`- Undocumented constants found: ${m.magic_numbers.join(', ') || 'none'}`);
    if (m.has_bare_except) lines.push(`- ⚠️ Silently swallows errors (bare except/catch found)`);
    (m.flagged_comments || []).forEach(c => lines.push(`- ⚠️ Flagged comment, line ${c.line}: \`${c.text}\``));
    lines.push(`\n**Suggested next step(s):**`);
    m.suggested_next_steps.forEach(s => lines.push(`- ${s}`));
    if (m.ai_explanation) {
      lines.push(`\n**AI explanation** _(source: ${m.ai_explanation.source})_:`);
      lines.push('```\n' + m.ai_explanation.text + '\n```');
    }
    lines.push('');
  });

  lines.push(`---\n_Generated by greybox — see github.com/itsgreybox/greybox for the full CLI tool with accurate AST-based parsing._`);
  return lines.join('\n');
}

function _estimateEffort(m) {
  // Heuristic: more distinct issues to fix = more effort. A file with
  // one magic number and nothing else is a quick win; a file with
  // magic numbers AND a silent exception AND a flagged comment is not.
  let effort = m.suggested_next_steps.length * 2;
  effort += Math.min(m.magic_numbers.length, 6) * 0.5;
  effort += m.has_bare_except ? 2 : 0;
  return effort;
}

// Turns the raw "SUMMARY: ... RISKS: ... UNCERTAIN_ABOUT: ..." text block
// into actual structured HTML - labeled sections, real bullet lists, real
// bold - instead of dumping one hard-to-read wall of text in a <pre>.
function renderAiExplanation(explanation) {
  if (!explanation) return '';
  const text = explanation.text || '';
  const source = explanation.source || '';

  const sectionNames = ['SUMMARY', 'RISKS', 'UNCERTAIN_ABOUT'];
  const sections = {};
  let current = null;
  text.split('\n').forEach(line => {
    const match = sectionNames.find(name => line.trim().startsWith(name + ':'));
    if (match) {
      current = match;
      sections[current] = [line.trim().slice(match.length + 1).trim()];
    } else if (current) {
      sections[current].push(line);
    }
  });

  // fallback: if parsing found nothing structured, just show the raw text safely
  if (!Object.keys(sections).length) {
    return `<div class="ai-box"><div class="ai-source">AI explanation (source: ${escapeHtml(source)})</div>
      <div class="ai-body">${escapeHtml(text)}</div></div>`;
  }

  const mdBoldToHtml = (s) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code class="inline">$1</code>');

  const renderBlock = (label, colorClass, lines) => {
    const joined = (lines || []).join('\n').trim();
    if (!joined) return '';
    const bulletLines = joined.split('\n').map(l => l.trim()).filter(Boolean);
    const isBulletList = bulletLines.some(l => l.startsWith('-'));
    let body;
    if (isBulletList) {
      body = '<ul class="ai-list">' + bulletLines.map(l =>
        `<li>${mdBoldToHtml(l.replace(/^-\s*/, ''))}</li>`
      ).join('') + '</ul>';
    } else {
      body = `<div class="ai-para">${mdBoldToHtml(joined)}</div>`;
    }
    return `<div class="ai-section"><div class="ai-label ${colorClass}">${label}</div>${body}</div>`;
  };

  return `<div class="ai-box">
    <div class="ai-source">AI explanation <span>(source: ${escapeHtml(source)})</span></div>
    ${renderBlock('What it does', 'ai-summary', sections.SUMMARY)}
    ${renderBlock('Risks', 'ai-risks', sections.RISKS)}
    ${renderBlock("What's genuinely uncertain", 'ai-uncertain', sections.UNCERTAIN_ABOUT)}
  </div>`;
}

function renderExecutiveSummary(data) {
  const mods = data.modules;
  const total = mods.length;
  const high = mods.filter(m => m.confidence < 45).length;
  const moderate = mods.filter(m => m.confidence >= 45 && m.confidence < 70).length;
  const low = total - high - moderate;
  const avgConf = Math.round(mods.reduce((s, m) => s + m.confidence, 0) / total);
  let verdict;
  if (high === 0) verdict = `Overall, this codebase is in reasonable shape — nothing here needs urgent attention.`;
  else if (high <= 2) verdict = `Overall, this codebase is mostly fine, with a small number of files that need attention before you touch them.`;
  else verdict = `Overall, a meaningful share of this codebase is risky to change without care — worth budgeting real time before any major work here.`;
  return `<div class="graph-box" style="margin-bottom:16px;">
    <div style="display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
      <h2 style="margin:0;">Executive summary</h2>
      <span style="font-family:'IBM Plex Mono', monospace; font-size:13px; color:var(--muted);">${total} files scanned · ${avgConf}/100 average confidence</span>
    </div>
    <p style="font-size:14.5px; margin:0 0 16px;">${verdict}</p>
    <div style="display:flex; gap:10px; flex-wrap:wrap;">
      <div onclick="filterModulesByRisk('high')" style="cursor:pointer; flex:1; min-width:140px; background:rgba(243,118,107,0.08); border-left:3px solid #F3766B; border-radius:0 8px 8px 0; padding:12px 14px; transition:background 0.15s ease;" onmouseover="this.style.background='rgba(243,118,107,0.16)'" onmouseout="this.style.background='rgba(243,118,107,0.08)'">
        <div style="font-family:'Space Grotesk', sans-serif; font-size:22px; font-weight:700; color:#F3766B;">${high}</div>
        <div style="font-size:12.5px; color:var(--muted);">High risk — handle with care ${high ? '→' : ''}</div>
      </div>
      <div onclick="filterModulesByRisk('moderate')" style="cursor:pointer; flex:1; min-width:140px; background:var(--amber-dim); border-left:3px solid var(--amber); border-radius:0 8px 8px 0; padding:12px 14px; transition:background 0.15s ease;" onmouseover="this.style.background='rgba(240,166,58,0.22)'" onmouseout="this.style.background='var(--amber-dim)'">
        <div style="font-family:'Space Grotesk', sans-serif; font-size:22px; font-weight:700; color:var(--amber);">${moderate}</div>
        <div style="font-size:12.5px; color:var(--muted);">Moderate risk ${moderate ? '→' : ''}</div>
      </div>
      <div onclick="filterModulesByRisk('low')" style="cursor:pointer; flex:1; min-width:140px; background:rgba(111,224,160,0.08); border-left:3px solid var(--good); border-radius:0 8px 8px 0; padding:12px 14px; transition:background 0.15s ease;" onmouseover="this.style.background='rgba(111,224,160,0.16)'" onmouseout="this.style.background='rgba(111,224,160,0.08)'">
        <div style="font-family:'Space Grotesk', sans-serif; font-size:22px; font-weight:700; color:var(--good);">${low}</div>
        <div style="font-size:12.5px; color:var(--muted);">Low risk — safe to leave alone ${low ? '→' : ''}</div>
      </div>
    </div>
  </div>`;
}

function renderPriorityBanner(data) {
  // Take the highest-risk files (lowest confidence), then present THOSE
  // in easy-to-hard order - quick wins first, bigger multi-issue files
  // later - rather than just riskiest-first, since "here's your hardest
  // problem first" is a worse place to start than a real quick win.
  const riskPool = data.modules.slice(0, 8);
  const top3 = [...riskPool].sort((a, b) => _estimateEffort(a) - _estimateEffort(b)).slice(0, 3);
  const order = top3.map(m => m.path.split('/').pop()).join(' → ');
  const repoLabel = data.repo || 'this codebase';
  const talkToUsMsg = encodeURIComponent(
    `I ran greybox on ${repoLabel} and would like help sequencing this into a full roadmap - quick wins first, then bigger effort items.`
  );

  let html = `<div class="priority-banner">
    <div class="label">What to do next — easiest wins first</div>
    <div class="headline">Start with <b>${escapeHtml(order)}</b> — quick, low-effort fixes among your highest-risk files, ordered so you build momentum before tackling anything bigger.</div>`;
  top3.forEach((m, i) => {
    html += `<div class="step-row"><b>${i + 1}. ${escapeHtml(m.path)}</b> (${m.confidence}/100 confidence, ${m.suggested_next_steps.length} step${m.suggested_next_steps.length !== 1 ? 's' : ''} to fix) — ${escapeHtml(m.suggested_next_steps[0])}</div>`;
  });
  html += `
    <div class="roadmap-cta">
      <p>This ranks individual files. Want it turned into a <b>full roadmap</b> — sequenced from quick wins to bigger-effort items, with rough effort sizing?</p>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button class="cta filled" style="cursor:pointer; border:none; font-family:inherit;" onclick="openExecutiveRoadmapPDF()">Get executive summary (PDF) →</button>
        <button class="cta" style="cursor:pointer; border:1px solid var(--line); background:none; font-family:inherit; color:var(--muted);" onclick="downloadFullRoadmap()">Technical version (Markdown)</button>
        <a class="cta" href="contact.html?prefill=${talkToUsMsg}">Want it customized? Talk to us →</a>
      </div>
    </div>
  </div>`;
  return html;
}

// Executive-ready PDF via browser print (no external library dependency -
// more reliable than loading a PDF-generation library in this environment).
// Business language, not engineering jargon - a CTO/CFO reading this
// doesn't need "confidence score," they need "risk level" and "investment."
// Real .docx export - a .docx file is just a ZIP of XML files, so this
// builds the minimum valid structure using JSZip (loaded via CDN) rather
// than a heavier library that would need a build step.
function _docxEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _buildDocxXml(title, subtitle, sections) {
  let body = `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${_docxEscape(title)}</w:t></w:r></w:p>`;
  body += `<w:p><w:r><w:rPr><w:i/><w:color w:val="666666"/></w:rPr><w:t>${_docxEscape(subtitle)}</w:t></w:r></w:p>`;
  sections.forEach(sec => {
    body += `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${_docxEscape(sec.heading)}</w:t></w:r></w:p>`;
    (sec.lines || []).forEach(line => {
      body += `<w:p><w:r><w:t>${_docxEscape(line)}</w:t></w:r></w:p>`;
    });
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}<w:sectPr/></w:body></w:document>`;
}

async function downloadFullRoadmapDocx() {
  const data = window.__lastScanData || window.__lastOrgData;
  if (!data) return;
  const teamInput = document.getElementById('repoTeamSizeInput') || document.getElementById('teamSizeInput');
  const rateInput = document.getElementById('repoDayRateInput') || document.getElementById('dayRateInput');
  const teamSize = Math.max(1, parseInt(teamInput && teamInput.value) || 2);
  const dayRate = Math.max(0, parseInt(rateInput && rateInput.value) || 800);

  const md = generateFullRoadmap(data, teamSize, dayRate);
  // Reuse the already-generated markdown, split into sections by ## headers
  const blocks = md.split(/\n(?=## )/);
  const title = blocks[0].split('\n')[0].replace(/^#\s*/, '');
  const subtitle = blocks[0].split('\n').slice(1).join(' ').trim();
  const sections = blocks.slice(1).map(b => {
    const lines = b.split('\n').filter(l => l.trim());
    return { heading: lines[0].replace(/^##\s*/, ''), lines: lines.slice(1) };
  });

  const xml = _buildDocxXml(title, subtitle, sections);
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.folder('_rels').file('.rels', rootRels);
  zip.folder('word').file('document.xml', xml);
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const name = (data.repo || (data.orgs || ['roadmap']).join('-')).replace(/\//g, '-');
  triggerDownload(blob, `greybox-roadmap-${name}.docx`);
}

function downloadFullRoadmap() {
  const data = window.__lastScanData || window.__lastOrgData;
  if (!data) return;
  const teamInput = document.getElementById('repoTeamSizeInput') || document.getElementById('teamSizeInput');
  const rateInput = document.getElementById('repoDayRateInput') || document.getElementById('dayRateInput');
  const teamSize = Math.max(1, parseInt(teamInput && teamInput.value) || 2);
  const dayRate = Math.max(0, parseInt(rateInput && rateInput.value) || 800);
  const md = generateFullRoadmap(data, teamSize, dayRate);
  const name = (data.repo || (data.orgs || ['roadmap']).join('-')).replace(/\//g, '-');
  triggerDownload(new Blob([md], { type: 'text/markdown' }), `greybox-roadmap-${name}.md`);
}

function openExecutiveRoadmapPDF() {
  const data = window.__lastScanData || window.__lastOrgData;
  if (!data) return;
  const teamInput = document.getElementById('repoTeamSizeInput') || document.getElementById('teamSizeInput');
  const rateInput = document.getElementById('repoDayRateInput') || document.getElementById('dayRateInput');
  const teamSize = Math.max(1, parseInt(teamInput && teamInput.value) || 2);
  const dayRate = Math.max(0, parseInt(rateInput && rateInput.value) || 800);
  const DAYS_PER_EFFORT_POINT = 1.5;

  const isOrgScan = Array.isArray(data.ranked_repos);
  const items = isOrgScan ? data.ranked_repos : data.modules;
  const nameOf = (x) => isOrgScan ? `${x.org}/${x.repo}` : x.path;
  const effortOf = (x) => isOrgScan ? Math.log2(x.total_files_matched + 2) : Math.log2((x.functions.length || 1) + 2);
  const confOf = (x) => isOrgScan ? x.avg_confidence : x.confidence;

  const withEffort = items.map(x => ({ name: nameOf(x), confidence: confOf(x), effort: effortOf(x), risk: 100 - confOf(x) }));
  const quickWins = withEffort.filter(x => x.risk >= 25 && x.effort <= 5);
  const biggerEfforts = withEffort.filter(x => x.risk >= 25 && x.effort > 5);
  const steady = withEffort.filter(x => x.risk < 25);

  const phaseDays = (arr) => Math.round(arr.reduce((s, x) => s + x.effort, 0) * DAYS_PER_EFFORT_POINT) || 0;
  const p1Days = phaseDays(quickWins), p2Days = phaseDays(biggerEfforts);
  const totalDays = p1Days + p2Days;
  const totalCost = totalDays * dayRate;
  const totalWeeks = Math.round(totalDays / teamSize / 5 * 10) / 10;
  const avgConf = Math.round(withEffort.reduce((s, x) => s + x.confidence, 0) / withEffort.length);
  const riskLevel = avgConf >= 70 ? 'Low' : avgConf >= 45 ? 'Moderate' : 'High';
  const riskColor = avgConf >= 70 ? '#2E8B57' : avgConf >= 45 ? '#C77800' : '#B3261E';
  const subject = isOrgScan ? data.orgs.join(', ') : data.repo;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Modernization Assessment — ${subject}</title>
  <meta charset="UTF-8">
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; color: #1A1A1A; max-width: 800px; margin: 0 auto; padding: 60px 50px; line-height: 1.6; }
    h1 { font-family: Arial, sans-serif; font-size: 26px; margin-bottom: 4px; }
    .subtitle { font-family: Arial, sans-serif; color: #666; font-size: 13px; margin-bottom: 40px; }
    h2 { font-family: Arial, sans-serif; font-size: 16px; text-transform: uppercase; letter-spacing: 0.05em; color: #333; border-bottom: 2px solid #1A1A1A; padding-bottom: 6px; margin-top: 40px; }
    .metrics { display: flex; gap: 30px; margin: 24px 0 32px; }
    .metric { flex: 1; text-align: center; padding: 20px 10px; border: 1px solid #ddd; border-radius: 4px; }
    .metric .value { font-family: Arial, sans-serif; font-size: 30px; font-weight: bold; }
    .metric .label { font-family: Arial, sans-serif; font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 6px; }
    .phase-summary { background: #F7F7F5; border-left: 4px solid #1A1A1A; padding: 16px 20px; margin: 16px 0; }
    .phase-summary b { display: block; font-family: Arial, sans-serif; font-size: 14px; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th { font-family: Arial, sans-serif; text-align: left; font-size: 11px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ccc; padding: 8px 6px; }
    td { padding: 8px 6px; border-bottom: 1px solid #eee; }
    .footer-note { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 11px; color: #888; font-family: Arial, sans-serif; }
    .print-btn { font-family: Arial, sans-serif; position: fixed; top: 20px; right: 30px; background: #1A1A1A; color: white; border: none; padding: 10px 18px; border-radius: 4px; cursor: pointer; font-size: 13px; }
    @media print { .print-btn { display: none; } body { padding: 20px 40px; } }
  </style>
  </head><body>
  <button class="print-btn" onclick="window.print()">Save as PDF →</button>
  <h1>Legacy System Modernization Assessment</h1>
  <div class="subtitle">${subject} &nbsp;•&nbsp; Prepared ${today} &nbsp;•&nbsp; Generated by greybox</div>

  <h2>Summary</h2>
  <div class="metrics">
    <div class="metric"><div class="value" style="color:${riskColor};">${riskLevel}</div><div class="label">Overall Risk Level</div></div>
    <div class="metric"><div class="value">$${totalCost.toLocaleString()}</div><div class="label">Estimated Investment</div></div>
    <div class="metric"><div class="value">${totalWeeks} wks</div><div class="label">Estimated Timeline${isOrgScan ? '' : ''}<br>(${teamSize} engineers)</div></div>
  </div>
  <p>This assessment reviewed ${withEffort.length} ${isOrgScan ? 'repositories' : 'modules'} and found an average system health score of ${avgConf}/100. ${biggerEfforts.length + quickWins.length} items require attention before further investment in this system; ${steady.length} are in acceptable condition and do not need immediate action.</p>

  <h2>Recommended Approach</h2>
  <div class="phase-summary">
    <b>Phase 1 — Immediate, Low-Effort Fixes (${quickWins.length} items)</b>
    Estimated ${p1Days} person-days, ~$${(p1Days*dayRate).toLocaleString()}. These are fast to address and reduce risk quickly, building momentum before larger work begins.
  </div>
  <div class="phase-summary">
    <b>Phase 2 — Larger Remediation Effort (${biggerEfforts.length} items)</b>
    Estimated ${p2Days} person-days, ~$${(p2Days*dayRate).toLocaleString()}. These require dedicated planning and should be scheduled as a resourced initiative, not handled ad hoc.
  </div>
  <div class="phase-summary">
    <b>Ongoing — Monitor (${steady.length} items)</b>
    No immediate investment needed. Recommend re-assessment on a quarterly basis to catch degradation early.
  </div>

  <h2>What This Assessment Does Not Cover</h2>
  <p>This is a structural, file-level assessment, not a full code audit. Effort estimates are based on codebase size and structure, not a detailed review of business logic complexity. Some risk may depend on institutional knowledge that only current or former team members hold — this assessment identifies where that knowledge gap likely exists, but cannot recover information that was never documented.</p>

  <div class="footer-note">Prepared using greybox (greybox — legacy assessment tool). This is a starting point for planning discussions, not a committed engineering estimate. Figures should be validated with your engineering team before budget commitments are made.</div>
  </body></html>`);
  win.document.close();
}

function riskBadge(confidence) {
  const level = confidence >= 70 ? 'Low' : confidence >= 45 ? 'Moderate' : 'High';
  const color = confidence >= 70 ? 'var(--good)' : confidence >= 45 ? 'var(--amber)' : '#F3766B';
  return `<span style="font-family:'IBM Plex Mono',monospace; font-size:10.5px; font-weight:600; color:${color}; border:1px solid ${color}; border-radius:10px; padding:2px 8px; margin-left:8px;">${level} Risk</span>`;
}

// One plain-English line summarizing the module's condition, for the
// part of the card that's always visible — a leadership reader shouldn't
// have to parse function lists or magic-number counts to know if a file
// is fine or not.
function _moduleSummaryLine(m) {
  const issues = [];
  if (m.has_bare_except) issues.push('swallows errors silently');
  if ((m.flagged_comments || []).length) issues.push('has a risk flagged directly in its own comments');
  if ((m.magic_numbers || []).length) issues.push(`has ${m.magic_numbers.length} undocumented value${m.magic_numbers.length !== 1 ? 's' : ''}`);
  if (!issues.length) return 'No structural red flags found — this file looks safe to leave alone.';
  const list = issues.length > 1 ? issues.slice(0, -1).join(', ') + ' and ' + issues[issues.length - 1] : issues[0];
  return `This file ${list}.`;
}

// Wraps the module card list in a container the executive summary's
// risk-count boxes can filter/scroll to. Shared by sample.html and any
// live scan (GitHub/GitLab/Bitbucket/ZIP) so clicking "3 high risk"
// actually goes somewhere, instead of being a static, unclickable number.
function renderModuleCardsSection(modules) {
  const cards = modules.map((m, i) => renderModuleCard(m, i)).join('');
  return `
    <div class="graph-box" style="margin-top:8px;">
      <div style="display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:10px; margin-bottom:4px;">
        <h2 style="margin:0;">File-by-file findings</h2>
        <span id="moduleFilterStatus" style="font-size:13px; color:var(--muted);"></span>
      </div>
    </div>
    <div id="moduleCardsSection">${cards}</div>`;
}

// Called from the executive summary's risk-count boxes. tier is
// 'high' | 'moderate' | 'low' | 'all'.
function filterModulesByRisk(tier) {
  const section = document.getElementById('moduleCardsSection');
  if (!section) return; // nothing rendered yet (shouldn't happen, but don't crash the page)
  const cards = section.querySelectorAll('.module[data-risk]');
  let shown = 0;
  cards.forEach(card => {
    const match = tier === 'all' || card.getAttribute('data-risk') === tier;
    card.style.display = match ? '' : 'none';
    if (match) shown++;
  });
  const statusEl = document.getElementById('moduleFilterStatus');
  if (statusEl) {
    const tierLabel = { high: 'high-risk', moderate: 'moderate-risk', low: 'low-risk', all: '' }[tier] || '';
    statusEl.innerHTML = tier === 'all'
      ? ''
      : `Showing ${shown} ${tierLabel} file(s) — <a href="javascript:void(0)" onclick="filterModulesByRisk('all')" style="color:var(--cyan);">clear filter</a>`;
  }
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function riskTier(confidence) {
  if (confidence < 45) return 'high';
  if (confidence < 70) return 'moderate';
  return 'low';
}

function renderModuleCard(m, idx) {
  const uid = 'modDetail_' + (idx != null ? idx : Math.random().toString(36).slice(2, 8)) + '_' + sanitizeId(m.path);
  const stepsHtml = m.suggested_next_steps.map(s => `<div class="next-step-row"><b>Do this:</b> ${escapeHtml(s)}</div>`).join('');
  const magicHtml = m.magic_numbers.length
    ? m.magic_numbers.slice(0, 8).join(', ') + (m.magic_numbers.length > 8 ? `, and ${m.magic_numbers.length - 8} more` : '')
    : 'none';
  const commentsHtml = (m.flagged_comments || []).length
    ? `<div class="risk">⚠️ Flagged risk in comments — line ${m.flagged_comments[0].line}: <code class="inline">${escapeHtml(m.flagged_comments[0].text)}</code></div>`
    : '';
  const aiHtml = renderAiExplanation(m.ai_explanation);
  return `
    <div class="module" data-risk="${riskTier(m.confidence)}">
      <div class="module-head">
        <span class="module-name">${escapeHtml(m.path)}</span>${riskBadge(m.confidence)}
        <span class="conf-label">${m.confidence} / 100 ${glossaryTerm('confidence', 'How safe this file is to leave alone or change, based on real code signals — not an AI guess. 100 = looks clean. Below 50 = handle with care.')}</span>
      </div>
      <div class="conf-bar"><div class="conf-fill" style="width:${m.confidence}%"></div></div>
      <div class="module-summary">${escapeHtml(_moduleSummaryLine(m))}</div>
      ${stepsHtml}
      <div style="margin-top:14px;">
        <button class="tech-toggle" onclick="_toggleModuleDetail(this, '${uid}')"><span>View technical detail</span><span class="chev">▾</span></button>
      </div>
      <div class="module-detail" id="${uid}">
        <div class="fact-row"><b>Functions:</b> ${m.functions.length ? escapeHtml(m.functions.join(', ')) : 'none detected'}</div>
        <div class="fact-row"><b>${glossaryTerm('Undocumented constants', "Numbers or values hard-coded in the file with no comment explaining what they mean or why that value was chosen — a common source of bugs when someone changes them without knowing why they were set that way.")} found:</b> ${escapeHtml(String(magicHtml))}</div>
        ${m.has_bare_except ? `<div class="fact-row">⚠️ <b>${glossaryTerm('Silently swallows errors', 'The code catches an error but does nothing with it — no log, no alert. If something breaks here, nobody finds out until a customer complains.')}</b> (bare except/catch found)</div>` : ''}
        ${commentsHtml}
        ${aiHtml}
      </div>
    </div>`;
}

function _toggleTip(el, evt) {
  if (evt) evt.stopPropagation();
  const wasOpen = el.classList.contains('tip-open');
  document.querySelectorAll('.term.tip-open').forEach(t => t.classList.remove('tip-open'));
  if (!wasOpen) el.classList.add('tip-open');
}
document.addEventListener('click', () => document.querySelectorAll('.term.tip-open').forEach(t => t.classList.remove('tip-open')));

function glossaryTerm(label, definition) {
  return `<span class="term" onclick="_toggleTip(this, event)">${escapeHtml(label)}<span class="tip">${escapeHtml(definition)}</span></span>`;
}

// Describes the actual per-language mix in a scan, e.g. "java (12) + vue (8)"
// instead of just naming the dominant language when a repo is genuinely mixed.
function describeLanguages(data) {
  const breakdown = data.languages_breakdown;
  if (!breakdown) return data.language;
  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  if (entries.length <= 1) return data.language;
  return entries.map(([lang, count]) => `${lang} (${count})`).join(' + ');
}

function _toggleModuleDetail(btn, id) {
  const panel = document.getElementById(id);
  if (!panel) return;
  const isOpen = panel.classList.toggle('open');
  btn.classList.toggle('open', isOpen);
  btn.querySelector('span').textContent = isOpen ? 'Hide technical detail' : 'View technical detail';
}

function renderNavHtml(active) {
  const links = [
    ['index.html', 'Home'],
    ['why.html', 'Why greybox'],
    ['pricing.html', 'Pricing'],
    ['contact.html', 'Contact'],
  ];
  const linkHtml = links.map(([href, label]) => {
    const cls = href === active ? 'active' : '';
    return `<a class="${cls}" href="${href}">${label}</a>`;
  }).join('');
  const liveCls = active === 'live.html' ? 'nav-cta active' : 'nav-cta';
  return `<nav class="topnav"><div class="topnav-inner">
    <a class="topnav-brand" href="index.html"><img src="assets/favicon.png" alt="" width="30" height="30" style="border-radius:6px;">greybox</a>
    <div class="topnav-links">${linkHtml}<a class="${liveCls}" href="live.html">Try it live →</a></div>
  </div></nav>`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
