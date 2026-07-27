"""
C#/.NET support for greybox - REGEX-BASED, not a real AST parser like
Python (ast), Java (javalang), or JavaScript (esprima). No mature
pure-Python C# parser exists that's simple to depend on, so this is an
honest, lower-confidence first pass: real risk of false positives/
negatives compared to the other three languages. Say so out loud
whenever this analyzer's results are shown, don't quietly imply the
same rigor as the AST-based languages.
"""
import os
import re
from .analyzer import ModuleFacts


def analyze_csharp_file(path):
    with open(path, encoding='utf-8', errors='ignore') as f:
        src = f.read()

    name = os.path.splitext(os.path.basename(path))[0]
    facts = ModuleFacts(name=name, path=path)

    for i, line in enumerate(src.splitlines(), 1):
        if 'TODO' in line or 'FIXME' in line or 'DO NOT' in line.upper():
            facts.todo_comments.append((i, line.strip()))

    facts.functions = re.findall(
        r'(?:public|private|protected|internal|static)\s+[\w<>\[\],\s]+?\s+(\w+)\s*\([^)]*\)\s*\{',
        src
    )
    facts.branch_count = len(re.findall(r'\b(if|for|foreach|while)\s*\(', src))
    facts.has_bare_except = bool(re.search(r'catch\s*(\([^)]*\))?\s*\{\s*\}', src))
    facts.imports_from = list(set(re.findall(r'^\s*using\s+([\w.]+)\s*;', src, re.MULTILINE)))

    for m in re.finditer(r'(?<![\w.])(\d+\.\d+|\d{2,})(?![\w])', src):
        val = float(m.group(1))
        if val not in (0, 1, -1):
            facts.magic_numbers.append(val)

    return facts


def build_csharp_dependency_graph(directory):
    graph = {}
    all_facts = {}
    for root, _, files in os.walk(directory):
        for fname in sorted(files):
            if fname.endswith('.cs'):
                path = os.path.join(root, fname)
                facts = analyze_csharp_file(path)
                all_facts[facts.name] = facts
                graph[facts.name] = [i.split('.')[-1] for i in facts.imports_from]
    return graph, all_facts
