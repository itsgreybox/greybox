"""
Go support for greybox - REGEX-BASED, same honesty tier as C# and
COBOL (not a real AST parser like Python/Java/JavaScript get). No
lightweight pure-Python Go parser exists, so this is a first pass -
say so wherever results are shown, don't imply AST-grade rigor.
"""
import os
import re
from .analyzer import ModuleFacts


def analyze_go_file(path):
    with open(path, encoding='utf-8', errors='ignore') as f:
        src = f.read()

    name = os.path.splitext(os.path.basename(path))[0]
    facts = ModuleFacts(name=name, path=path)

    for i, line in enumerate(src.splitlines(), 1):
        if 'TODO' in line or 'FIXME' in line or 'DO NOT' in line.upper():
            facts.todo_comments.append((i, line.strip()))

    facts.functions = re.findall(r'\bfunc\s+(?:\([^)]*\)\s*)?([a-zA-Z_]\w*)\s*\(', src)
    facts.branch_count = len(re.findall(r'\b(if|for)\s', src))
    # Go doesn't have try/catch - an empty recover() block is the closest
    # analog to a silently-swallowed error, same spirit as bare except.
    facts.has_bare_except = bool(re.search(r'recover\(\)[^{]*\{\s*\}', src))
    facts.imports_from = list(set(re.findall(r'"([\w./\-]+)"', re.search(r'import\s*\((.*?)\)', src, re.DOTALL).group(1))
                                   if re.search(r'import\s*\((.*?)\)', src, re.DOTALL) else
                                   re.findall(r'^import\s+"([\w./\-]+)"', src, re.MULTILINE)))
    facts.imports_from = [i.split('/')[-1] for i in facts.imports_from]

    for m in re.finditer(r'(?<![\w.])(\d+\.\d+|\d{2,})(?![\w])', src):
        val = float(m.group(1))
        if val not in (0, 1, -1):
            facts.magic_numbers.append(val)

    return facts


def build_go_dependency_graph(directory):
    graph = {}
    all_facts = {}
    for root, _, files in os.walk(directory):
        for fname in sorted(files):
            if fname.endswith('.go'):
                path = os.path.join(root, fname)
                facts = analyze_go_file(path)
                all_facts[facts.name] = facts
                graph[facts.name] = facts.imports_from
    return graph, all_facts
