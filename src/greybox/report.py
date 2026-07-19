import os
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from .analyzer import (
    build_dependency_graph, confidence_score, suggest_next_steps,
    estimate_effort, categorize_finding,
)
from .explainer import explain_module


def _detect_language(directory):
    """Pick the analyzer based on what's actually in the folder, rather
    than asking the user to specify - most real legacy repos are one
    dominant language, so a simple file-extension majority is enough."""
    py_count = java_count = 0
    for root, _, files in os.walk(directory):
        for f in files:
            if f.endswith('.py'):
                py_count += 1
            elif f.endswith('.java'):
                java_count += 1
    return 'java' if java_count > py_count else 'python'


def generate_report(directory, output_path=None, language=None, workers=8):
    language = language or _detect_language(directory)
    if language == 'java':
        from .java_analyzer import build_java_dependency_graph
        graph, all_facts = build_java_dependency_graph(directory)
    else:
        graph, all_facts = build_dependency_graph(directory)
    lines = ["# greybox Assessment Report", f"\nDirectory analyzed: `{directory}`\n"]

    lines.append("## What To Do Next — Easiest Wins First\n")
    lines.append("_Your highest-risk modules, ordered easy-to-hard within that risk "
                  "pool - quick, low-effort fixes first, so you build momentum before "
                  "tackling anything bigger. Not a full roadmap - see BACKLOG.md if "
                  "you want one built._\n")
    top_risk_placeholder_index = len(lines)
    lines.append("")  # filled in after facts are computed, see below

    lines.append("## Findings Breakdown\n")
    findings_placeholder_index = len(lines)
    lines.append("")  # filled in below
    lines.append("_Not a security vulnerability scan (no CVE checks, no exploit "
                  "pattern matching) - this is a tally of the deterministic risk "
                  "signals this tool actually looks for._\n")

    lines.append("## Dependency Graph (real, extracted from imports)\n")
    lines.append("```mermaid\ngraph TD")
    for mod, deps in graph.items():
        for d in deps:
            if d in all_facts:
                lines.append(f"    {mod} --> {d}")
    lines.append("```\n")

    lines.append("## Module-by-Module Findings\n")
    total = len(all_facts)

    def _explain_one(name_facts):
        name, facts = name_facts
        with open(facts.path) as f:
            src = f.read()
        return name, facts, explain_module(facts, src)

    # explain_module calls are network-bound waits (Claude API), not CPU
    # work - a thread pool is the correct fix here, not more raw compute.
    # Kept modest (default 8) to avoid hammering API rate limits.
    results = {}
    done = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_explain_one, item): item[0] for item in all_facts.items()}
        for future in as_completed(futures):
            name, facts, explanation = future.result()
            results[name] = (facts, explanation)
            done += 1
            print(f"[{done}/{total}] analyzed {name}", flush=True)

    ext = '.java' if language == 'java' else '.py'
    ranked = sorted(
        ((name, confidence_score(facts)) for name, facts in all_facts.items()),
        key=lambda x: x[1],
    )
    # Take the highest-risk pool, then present THOSE easy-to-hard (lowest
    # effort first) - a quick win is a better place to start than the
    # single hardest problem, even among your riskiest files. Same logic
    # as the web demo (shared.js renderPriorityBanner), kept in sync.
    risk_pool = ranked[:8]
    easy_to_hard = sorted(risk_pool, key=lambda x: estimate_effort(all_facts[x[0]]))[:5]
    risk_lines = []
    for i, (name, conf) in enumerate(easy_to_hard):
        facts = all_facts[name]
        steps = suggest_next_steps(facts)
        risk_lines.append(
            f"{i+1}. `{name}{ext}` — {conf}/100 confidence, {len(steps)} step(s) to fix. "
            f"**First action:** {steps[0]}"
        )
    lines[top_risk_placeholder_index] = "\n".join(risk_lines) + "\n"

    findings_tally = {"flagged_comment": 0, "silent_failure": 0, "undocumented_constants": 0, "clean": 0}
    for facts in all_facts.values():
        findings_tally[categorize_finding(facts)] += 1
    tally_labels = {
        "flagged_comment": "Flagged risky comments",
        "silent_failure": "Silent failure handling",
        "undocumented_constants": "Undocumented constants",
        "clean": "No red flags found",
    }
    tally_lines = [
        f"- **{count}** {tally_labels[key]}"
        for key, count in findings_tally.items() if count
    ]
    lines[findings_placeholder_index] = "\n".join(tally_lines) + "\n"

    for name, facts in all_facts.items():
        stored_facts, explanation = results[name]
        conf = confidence_score(stored_facts)

        lines.append(f"### `{name}{ext}`")
        lines.append(f"- **Confidence this is fully understood: {conf}/100**")
        lines.append(f"- Functions: {', '.join(facts.functions) or 'none'}")
        lines.append(f"- Depends on: {', '.join(facts.imports_from) or 'nothing internal'}")
        lines.append(f"- Undocumented constants found: {facts.magic_numbers or 'none'}")
        if facts.has_bare_except:
            lines.append("- ⚠️ **Silently swallows errors** (bare except found)")
        if facts.todo_comments:
            lines.append("- ⚠️ **Flagged risk in comments:**")
            for ln, comment in facts.todo_comments:
                lines.append(f"  - line {ln}: `{comment}`")

        lines.append("\n**Suggested next step(s):**")
        for step in suggest_next_steps(facts):
            lines.append(f"- {step}")

        lines.append(f"\n**AI explanation** _(source: {explanation['source']})_:")
        lines.append(f"```\n{explanation['text']}\n```\n")

    report = "\n".join(lines)
    if output_path:
        with open(output_path, "w") as f:
            f.write(report)
    return report


def generate_json(directory, output_path=None, language=None):
    """Structured, machine-usable output - the thing a chat conversation
    can never give you. Every module gets the same fields, so you can
    sort by confidence, diff two runs over time, or feed this straight
    into a dashboard/CI check. A chat transcript can't be sorted,
    filtered, or diffed - this can."""
    language = language or _detect_language(directory)
    if language == 'java':
        from .java_analyzer import build_java_dependency_graph
        graph, all_facts = build_java_dependency_graph(directory)
    else:
        graph, all_facts = build_dependency_graph(directory)

    modules = []
    for name, facts in all_facts.items():
        modules.append({
            "module": name,
            "confidence": confidence_score(facts),
            "functions": facts.functions,
            "depends_on": facts.imports_from,
            "magic_numbers": facts.magic_numbers,
            "has_bare_except": facts.has_bare_except,
            "flagged_comments": [{"line": ln, "text": c} for ln, c in facts.todo_comments],
            "suggested_next_steps": suggest_next_steps(facts),
        })

    result = {
        "directory": directory,
        "language": language,
        "dependency_graph": graph,
        "modules": sorted(modules, key=lambda m: m["confidence"]),
    }

    if output_path:
        with open(output_path, "w") as f:
            json.dump(result, f, indent=2)
    return result
