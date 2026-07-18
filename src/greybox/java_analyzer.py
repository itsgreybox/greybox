"""
Java support for greybox. Uses javalang (a real Java parser) rather
than regex - a wrong dependency graph is worse than no graph, since
the whole report builds on it (see ARCHITECTURE.md).
"""
import os
import re
import javalang

from .analyzer import ModuleFacts


def analyze_java_file(path):
    with open(path) as f:
        src = f.read()

    name = os.path.splitext(os.path.basename(path))[0]
    facts = ModuleFacts(name=name, path=path)

    for i, line in enumerate(src.splitlines(), 1):
        if 'TODO' in line or 'FIXME' in line or 'DO NOT' in line.upper():
            facts.todo_comments.append((i, line.strip()))

    try:
        tree = javalang.parse.parse(src)
    except (javalang.parser.JavaSyntaxError, Exception):
        # Real parse failures happen on real legacy Java (odd encodings,
        # partial files, old language features). Fail honestly rather
        # than silently returning empty/wrong facts.
        facts.todo_comments.append((0, "PARSE FAILED - facts below are incomplete"))
        return facts

    # imports -> our "depends on" signal, same role as Python's imports_from
    for imp in tree.imports:
        facts.imports_from.append(imp.path)

    for _, node in tree.filter(javalang.tree.MethodDeclaration):
        facts.functions.append(node.name)
        branches = 0
        for _, sub in node.filter((javalang.tree.IfStatement,
                                   javalang.tree.ForStatement,
                                   javalang.tree.WhileStatement)):
            branches += 1
        facts.branch_count += branches

        for _, sub in node.filter(javalang.tree.MethodInvocation):
            facts.calls_out.setdefault(node.name, []).append(sub.member)

        # javalang doesn't give a clean "constant" node the way Python's
        # ast does - approximate via literal numeric tokens inside the
        # method body, excluding 0/1/-1 same as the Python analyzer.
        for _, sub in node.filter(javalang.tree.Literal):
            val = sub.value
            if re.match(r'^-?\d+(\.\d+)?[fFdDlL]?$', str(val)):
                num = str(val).rstrip('fFdDlL')
                try:
                    num_val = float(num) if '.' in num else int(num)
                    if num_val not in (0, 1, -1):
                        facts.magic_numbers.append(num_val)
                except ValueError:
                    pass

        for _, sub in node.filter(javalang.tree.CatchClause):
            # A catch with no real handling logic (empty block) is Java's
            # version of Python's bare `except:` - silent failure risk.
            if sub.block == []:
                facts.has_bare_except = True

    return facts


def build_java_dependency_graph(directory):
    graph = {}
    all_facts = {}
    for root, _, files in os.walk(directory):
        for fname in sorted(files):
            if fname.endswith('.java'):
                path = os.path.join(root, fname)
                facts = analyze_java_file(path)
                all_facts[facts.name] = facts
                # Java imports are package paths, not local module names -
                # keep only the last segment so it can match another class
                # name in this same scan (best-effort local dependency link)
                graph[facts.name] = [imp.split('.')[-1] for imp in facts.imports_from]
    return graph, all_facts
