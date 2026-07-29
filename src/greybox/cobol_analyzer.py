"""
COBOL support for greybox - heuristic, NOT a real parser. COBOL's
format variability (fixed-column vs free-format, dialect differences)
makes this the least reliable analyzer in greybox. Treat any COBOL
result as a rough first pass, not a confident finding - this is
stated explicitly wherever COBOL results are shown, not buried.

Approach: paragraph names (the closest COBOL analog to functions) are
lines ending in a period, following COBOL's naming convention
(words/hyphens, no reserved verbs at the start). PERFORM statements
referencing those paragraph names are the closest analog to a
dependency/call graph.
"""
import os
import re
from .analyzer import ModuleFacts

_PARAGRAPH_PATTERN = re.compile(r'^\s{0,7}([A-Z0-9][A-Z0-9\-]{2,})\s*\.\s*$', re.MULTILINE)
_COPY_PATTERN = re.compile(r'\bCOPY\s+([A-Z0-9][A-Z0-9\-]*)', re.IGNORECASE)
_RESERVED_START = {'IF', 'ELSE', 'END-IF', 'MOVE', 'PERFORM', 'DISPLAY', 'STOP', 'GOBACK'}


def analyze_cobol_file(path):
    with open(path, encoding='utf-8', errors='ignore') as f:
        src = f.read()

    name = os.path.splitext(os.path.basename(path))[0]
    facts = ModuleFacts(name=name, path=path)

    for i, line in enumerate(src.splitlines(), 1):
        stripped = line.strip()
        if stripped.startswith('*') or 'TODO' in line or 'FIXME' in line or 'DO NOT' in line.upper():
            facts.todo_comments.append((i, stripped[:200]))

    paragraphs = [
        m.group(1) for m in _PARAGRAPH_PATTERN.finditer(src)
        if m.group(1).upper() not in _RESERVED_START
    ]
    facts.functions = paragraphs
    # COPY is COBOL's real cross-file dependency (copybooks) - PERFORM only
    # calls a paragraph within the SAME file, so it was wrongly used here
    # before and produced an always-empty dependency graph.
    facts.imports_from = list(set(_COPY_PATTERN.findall(src)))
    facts.branch_count = len(re.findall(r'\bIF\b', src, re.IGNORECASE))
    facts.has_bare_except = False  # COBOL's error handling doesn't map cleanly - not scored

    for m in re.finditer(r'(?<![\w.])(\d+\.\d+|\d{2,})(?![\w])', src):
        val = float(m.group(1))
        if val not in (0, 1, -1):
            facts.magic_numbers.append(val)

    return facts


def build_cobol_dependency_graph(directory):
    graph = {}
    all_facts = {}
    for root, _, files in os.walk(directory):
        for fname in sorted(files):
            if fname.upper().endswith(('.CBL', '.COB', '.CPY')):
                path = os.path.join(root, fname)
                facts = analyze_cobol_file(path)
                all_facts[facts.name] = facts
                graph[facts.name] = facts.imports_from
    return graph, all_facts
