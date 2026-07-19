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
        if isinstance(node, ast.ImportFrom) and node.module:
            facts.imports_from.append(node.module)
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
    file can never give you, because the AI never sees the other files."""
    graph = {}
    all_facts = {}
    for fname in sorted(os.listdir(directory)):
        if fname.endswith('.py'):
            path = os.path.join(directory, fname)
            facts = analyze_file(path)
            all_facts[facts.name] = facts
            graph[facts.name] = facts.imports_from
    return graph, all_facts


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
