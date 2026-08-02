"""
greybox - deterministic structural analysis layer.

Walks Python source, builds a real dependency graph, and extracts
structural facts (branches, magic numbers, undocumented flags,
cross-module calls) WITHOUT any AI involved. This layer is what a
tool can do that a one-off chat prompt cannot: consistent, graph-aware,
and repeatable across hundreds of files.
"""
import ast
import os
from dataclasses import dataclass, field


@dataclass
class ModuleFacts:
    name: str
    path: str
    functions: list = field(default_factory=list)
    imports_from: list = field(default_factory=list)
    magic_numbers: list = field(default_factory=list)
    branch_count: int = 0
    has_bare_except: bool = False
    todo_comments: list = field(default_factory=list)
    calls_out: dict = field(default_factory=dict)


def _extract_magic_numbers(node):
    nums = []
    for n in ast.walk(node):
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            if n.value not in (0, 1, -1) and not isinstance(n.value, bool):
                nums.append(n.value)
    return nums


def analyze_file(path):
    with open(path) as f:
        src = f.read()
    tree = ast.parse(src, filename=path)
    name = os.path.splitext(os.path.basename(path))[0]
    facts = ModuleFacts(name=name, path=path)

    for i, line in enumerate(src.splitlines(), 1):
        if 'TODO' in line or 'FIXME' in line or 'DO NOT' in line.upper():
            facts.todo_comments.append((i, line.strip()))

    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            if node.module:
                facts.imports_from.append(node.module)
            # Also capture the actual imported names, not just the package
            # path - "from api import handler" needs to match a file
            # named handler.py, and node.module alone ("api") never will.
            for alias in node.names:
                if alias.name != '*':
                    facts.imports_from.append(alias.name)
        if isinstance(node, ast.Import):
            for alias in node.names:
                # "import pkg.sub.mod" - keep both the full dotted path
                # and the last segment, since either might match a file.
                facts.imports_from.append(alias.name)
                facts.imports_from.append(alias.name.split('.')[-1])
        if isinstance(node, ast.FunctionDef):
            facts.functions.append(node.name)
            branches = sum(
                1 for n in ast.walk(node) if isinstance(n, (ast.If, ast.For, ast.While))
            )
            facts.branch_count += branches
            facts.magic_numbers.extend(_extract_magic_numbers(node))
            for n in ast.walk(node):
                if isinstance(n, ast.ExceptHandler) and n.type is None:
                    facts.has_bare_except = True
                if isinstance(n, ast.Call) and isinstance(n.func, ast.Name):
                    facts.calls_out.setdefault(node.name, []).append(n.func.id)

    return facts


def build_dependency_graph(directory):
    """Real cross-file dependency graph - the thing a single pasted-in
    file can never give you, because the AI never sees the other files.

    BUG FIX (see CHANGELOG / commit history): this used to call
    os.listdir(directory), which only sees files directly in that one
    folder and silently misses everything in subdirectories. Nearly
    every real Python project uses subdirectories (src/, a package with
    submodules, etc.), so this was silently under-scanning almost every
    real codebase down to just its top-level loose files. Every other
    language analyzer in this repo (Java/JS/C#/COBOL/Go) already used
    os.walk correctly - this brings Python in line with that, since
    Python is supposed to be the flagship, most-accurate language here."""
    graph = {}
    all_facts = {}
    for root, _, files in os.walk(directory):
        for fname in sorted(files):
            if fname.endswith('.py'):
                path = os.path.join(root, fname)
                facts = analyze_file(path)
                all_facts[facts.name] = facts
                graph[facts.name] = facts.imports_from
    return graph, all_facts


def build_folder_architecture_graph(graph, all_facts, directory):
    """Higher-level view than the file-by-file dependency graph: groups
    files by their folder (relative to the scanned root) and shows how
    those folders connect, not individual files. Built purely from data
    the file-level graph already has - no new parsing required.

    A file directly in the scanned root folder is grouped under
    "(root)" rather than an empty string, so it reads clearly in the
    output instead of looking like a blank/broken label."""
    folder_of = {}
    for name, facts in all_facts.items():
        rel_dir = os.path.relpath(os.path.dirname(facts.path), directory)
        folder_of[name] = "(root)" if rel_dir == "." else rel_dir.replace(os.sep, "/")

    folder_graph = {}
    for mod, deps in graph.items():
        src_folder = folder_of.get(mod)
        if src_folder is None:
            continue
        folder_graph.setdefault(src_folder, set())
        for dep in deps:
            dst_folder = folder_of.get(dep)
            if dst_folder and dst_folder != src_folder:
                folder_graph[src_folder].add(dst_folder)

    return {folder: sorted(deps) for folder, deps in folder_graph.items()}


def build_entry_point_flow(graph, all_facts):
    """Reachability from likely entry points, based on the static import
    graph.

    HONESTY NOTE, stated plainly because this is easy to overclaim:
    this is NOT a traced runtime call sequence. It cannot know what
    actually executes first, in what order, or under what conditions -
    that requires either running the code or a much deeper
    interprocedural call-graph analysis, neither of which this tool
    does. What it CAN honestly say: "these files are the ones nothing
    else in this scan imports" (a reasonable proxy for an entry point -
    a script or main module usually isn't imported by anything else in
    the same codebase), and "here is what becomes reachable if you
    start reading from there, based on imports." That's a real, useful,
    honestly-scoped signal - not a data-flow diagram.
    """
    imported = set()
    for deps in graph.values():
        imported.update(deps)

    entry_points = sorted(name for name in all_facts if name not in imported)

    reachable_from = {}
    for entry in entry_points:
        seen = set()
        stack = [entry]
        while stack:
            cur = stack.pop()
            if cur in seen:
                continue
            seen.add(cur)
            for dep in graph.get(cur, []):
                if dep in all_facts and dep not in seen:
                    stack.append(dep)
        seen.discard(entry)
        reachable_from[entry] = sorted(seen)

    all_reachable = {n for reached in reachable_from.values() for n in reached}
    unreached = sorted(
        name for name in all_facts
        if name not in entry_points and name not in all_reachable
    )

    return {
        "entry_points": entry_points,
        "reachable_from": reachable_from,
        "unreached": unreached,  # not an entry point AND nothing traces to it - worth a human look
    }


def confidence_score(facts):
    """Deterministic confidence, not a vibe. High branch count + magic
    numbers + no comments + bare excepts = genuinely hard to be sure
    about. Computed BEFORE any AI explanation runs - same discipline as
    wherefore: admit uncertainty from real signals, don't let the AI
    decide how sure it is."""
    risk = 0
    risk += min(facts.branch_count * 5, 40)
    risk += min(len(facts.magic_numbers) * 4, 30)
    risk += 15 if facts.has_bare_except else 0
    risk += 10 if not facts.todo_comments else -5
    return max(0, 100 - risk)


def suggest_next_steps(facts):
    """Deterministic, rule-based suggestions tied directly to what was
    actually found - NOT a roadmap, NOT effort estimates, NOT
    sequencing. This answers "what do I do with this finding" one
    finding at a time. Full roadmap generation (timelines, sequencing,
    resourcing) is explicitly out of scope - see BACKLOG.md and
    README.md "What it doesn't do". That's the agencies' job; this is
    a direct, honest answer to a direct, honest finding."""
    steps = []

    if facts.magic_numbers:
        steps.append(
            f"Extract the {len(facts.magic_numbers)} undocumented constant(s) into "
            f"named variables and confirm their meaning with whoever owns this "
            f"business logic before changing anything else in this file."
        )

    if facts.has_bare_except:
        steps.append(
            "Add logging to the silent exception handler before touching this "
            "file - right now, failures here are invisible, which makes it "
            "unsafe to refactor until you can see what's actually failing."
        )

    if facts.todo_comments:
        for _, comment in facts.todo_comments:
            steps.append(
                f"Track down the person or incident referenced in this comment "
                f"before removing or changing the code it's attached to: "
                f"\"{comment}\""
            )

    if not steps:
        steps.append(
            "No specific red flags found - this module is a reasonable "
            "candidate to modernize first, since the risk of breaking "
            "something hidden is lower here than elsewhere."
        )

    return steps


def estimate_effort(facts):
    """Heuristic effort score - same logic as the web demo (shared.js
    _estimateEffort), kept in sync deliberately: more distinct issues to
    fix = more effort. A file with one magic number and nothing else is
    a quick win; a file with magic numbers AND a silent exception AND a
    flagged comment is not. Lower score = easier/quicker to tackle."""
    steps = suggest_next_steps(facts)
    effort = len(steps) * 2
    effort += min(len(facts.magic_numbers), 6) * 0.5
    effort += 2 if facts.has_bare_except else 0
    return effort


def categorize_finding(facts):
    """Mutually-exclusive category for a findings-breakdown tally - same
    categories as the web demo's findings chart (shared.js
    renderFindingsChart), kept in sync deliberately. Deliberately NOT
    called "vulnerabilities" - this isn't a security scanner."""
    if facts.todo_comments:
        return "flagged_comment"
    if facts.has_bare_except:
        return "silent_failure"
    if facts.magic_numbers:
        return "undocumented_constants"
    return "clean"
