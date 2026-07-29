"""
Portfolio mode: point this at a parent directory containing multiple
repos as subdirectories (e.g. a folder where you've cloned an entire
GitHub org), and get a combined roadmap across all of them.

Unlike the web demo's org-scan (which samples a few files per repo to
stay within GitHub API rate limits and serverless timeouts), this runs
the REAL full analyzer on every file in every repo - no sampling,
because it's local and there's no rate limit to worry about.
"""
import os
from .analyzer import build_dependency_graph, confidence_score, estimate_effort, categorize_finding
from .report import _detect_language


def _scan_one_repo(path):
    language = _detect_language(path)
    if language == 'java':
        from .java_analyzer import build_java_dependency_graph
        graph, all_facts = build_java_dependency_graph(path)
    elif language == 'javascript':
        from .javascript_analyzer import build_js_dependency_graph
        graph, all_facts = build_js_dependency_graph(path)
    elif language == 'csharp':
        from .csharp_analyzer import build_csharp_dependency_graph
        graph, all_facts = build_csharp_dependency_graph(path)
    elif language == 'cobol':
        from .cobol_analyzer import build_cobol_dependency_graph
        graph, all_facts = build_cobol_dependency_graph(path)
    elif language == 'go':
        from .go_analyzer import build_go_dependency_graph
        graph, all_facts = build_go_dependency_graph(path)
    else:
        graph, all_facts = build_dependency_graph(path)

    if not all_facts:
        return None

    confidences = [confidence_score(f) for f in all_facts.values()]
    avg_confidence = round(sum(confidences) / len(confidences))
    effort = sum(estimate_effort(f) for f in all_facts.values())

    risk = 100 - avg_confidence
    if risk >= 25 and effort <= 40:
        category = 'quick_win'
    elif risk >= 25 and effort > 40:
        category = 'bigger_effort'
    else:
        category = 'steady'

    return {
        'repo': os.path.basename(path.rstrip('/')),
        'path': path,
        'language': language,
        'file_count': len(all_facts),
        'avg_confidence': avg_confidence,
        'effort_score': round(effort, 1),
        'priority_score': round(risk * (effort ** 0.5), 1),
        'category': category,
    }


def scan_portfolio(parent_directory):
    """Scan every immediate subdirectory of parent_directory as its own
    repo. Returns a dict with results sorted by priority, highest first."""
    subdirs = [
        os.path.join(parent_directory, d) for d in sorted(os.listdir(parent_directory))
        if os.path.isdir(os.path.join(parent_directory, d)) and not d.startswith('.')
    ]

    results = []
    for subdir in subdirs:
        try:
            result = _scan_one_repo(subdir)
            if result:
                results.append(result)
        except Exception as e:
            results.append({
                'repo': os.path.basename(subdir.rstrip('/')),
                'path': subdir,
                'error': str(e),
            })

    valid = [r for r in results if 'error' not in r]
    errored = [r for r in results if 'error' in r]
    valid.sort(key=lambda r: r['priority_score'], reverse=True)

    return {
        'parent_directory': parent_directory,
        'repos_scanned': len(valid),
        'repos_with_errors': len(errored),
        'repos_total': len(subdirs),
        'results': valid,
        'errors': errored,
    }


def generate_portfolio_report(parent_directory, output_path=None):
    data = scan_portfolio(parent_directory)
    lines = ["# greybox Portfolio Report", f"\nScanned: `{parent_directory}`\n"]
    lines.append(f"{data['repos_scanned']} of {data['repos_total']} subdirectories had "
                  f"real Python/Java code (full scan, no sampling - this is the real "
                  f"CLI version, not the web demo's rate-limited triage).\n")

    quick_wins = [r for r in data['results'] if r['category'] == 'quick_win']
    bigger = [r for r in data['results'] if r['category'] == 'bigger_effort']
    steady = [r for r in data['results'] if r['category'] == 'steady']

    lines.append("## What To Do Next\n")
    lines.append(f"### 🟢 Quick wins - start here ({len(quick_wins)})\n")
    for r in quick_wins:
        lines.append(f"- **{r['repo']}** ({r['language']}, {r['file_count']} files, "
                      f"{r['avg_confidence']}/100 confidence)")
    lines.append(f"\n### 🟠 Bigger efforts - plan, don't rush ({len(bigger)})\n")
    for r in bigger:
        lines.append(f"- **{r['repo']}** ({r['language']}, {r['file_count']} files, "
                      f"{r['avg_confidence']}/100 confidence)")
    lines.append(f"\n### ⚪ Lower priority for now ({len(steady)})\n")
    for r in steady:
        lines.append(f"- **{r['repo']}** ({r['language']}, {r['file_count']} files, "
                      f"{r['avg_confidence']}/100 confidence)")

    if data['errors']:
        lines.append(f"\n### ⚠️ Couldn't scan ({len(data['errors'])})\n")
        for r in data['errors']:
            lines.append(f"- **{r['repo']}**: {r['error']}")

    report = "\n".join(lines)
    if output_path:
        with open(output_path, "w") as f:
            f.write(report)
    return report
