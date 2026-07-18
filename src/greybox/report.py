import os
from .analyzer import build_dependency_graph, confidence_score
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


def generate_report(directory, output_path=None, language=None):
    language = language or _detect_language(directory)
    if language == 'java':
        from .java_analyzer import build_java_dependency_graph
        graph, all_facts = build_java_dependency_graph(directory)
    else:
        graph, all_facts = build_dependency_graph(directory)
    lines = ["# greybox Assessment Report", f"\nDirectory analyzed: `{directory}`\n"]

    lines.append("## Dependency Graph (real, extracted from imports)\n")
    lines.append("```mermaid\ngraph TD")
    for mod, deps in graph.items():
        for d in deps:
            if d in all_facts:
                lines.append(f"    {mod} --> {d}")
    lines.append("```\n")

    lines.append("## Module-by-Module Findings\n")
    for name, facts in all_facts.items():
        conf = confidence_score(facts)
        with open(facts.path) as f:
            src = f.read()
        explanation = explain_module(facts, src)

        ext = '.java' if language == 'java' else '.py'
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
        lines.append(f"\n**AI explanation** _(source: {explanation['source']})_:")
        lines.append(f"```\n{explanation['text']}\n```\n")

    report = "\n".join(lines)
    if output_path:
        with open(output_path, "w") as f:
            f.write(report)
    return report
