"""
JavaScript support for greybox, using esprima (a real JS parser, not
regex). Honest scope: this handles standard ES5/ES6 JavaScript. It does
NOT parse TypeScript-specific syntax (types, interfaces, generics) or
JSX - a .ts/.tsx file with those constructs will fail to parse cleanly.
That's a real, stated limitation, not silently ignored - see the
PARSE FAILED handling below, same discipline as java_analyzer.py.
"""
import os
import esprima
from .analyzer import ModuleFacts


def analyze_js_file(path):
    with open(path, encoding='utf-8', errors='ignore') as f:
        src = f.read()

    name = os.path.splitext(os.path.basename(path))[0]
    facts = ModuleFacts(name=name, path=path)

    for i, line in enumerate(src.splitlines(), 1):
        if 'TODO' in line or 'FIXME' in line or 'DO NOT' in line.upper():
            facts.todo_comments.append((i, line.strip()))

    try:
        tree = esprima.parseScript(src, options={'tolerant': True})
    except Exception:
        try:
            tree = esprima.parseModule(src, options={'tolerant': True})
        except Exception:
            facts.todo_comments.append((0, "PARSE FAILED - likely TypeScript/JSX syntax not supported, facts below are incomplete"))
            return facts

    def walk(node, parent_func=None):
        if node is None or not hasattr(node, 'type'):
            return
        node_type = node.type

        if node_type in ('FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'):
            fname = getattr(node.id, 'name', None) if getattr(node, 'id', None) else '<anonymous>'
            if fname and fname != '<anonymous>':
                facts.functions.append(fname)
            parent_func = fname

        if node_type in ('IfStatement', 'ForStatement', 'WhileStatement', 'ForInStatement', 'ForOfStatement'):
            facts.branch_count += 1

        if node_type == 'CatchClause':
            body = getattr(node.body, 'body', None)
            if body == []:
                facts.has_bare_except = True

        if node_type == 'Literal' and isinstance(getattr(node, 'value', None), (int, float)) and not isinstance(node.value, bool):
            if node.value not in (0, 1, -1):
                facts.magic_numbers.append(node.value)

        if node_type in ('ImportDeclaration',):
            source = getattr(node, 'source', None)
            if source and getattr(source, 'value', None):
                facts.imports_from.append(str(source.value).split('/')[-1])
        if node_type == 'CallExpression':
            callee = getattr(node, 'callee', None)
            if callee and getattr(callee, 'name', None) == 'require':
                args = getattr(node, 'arguments', [])
                if args and getattr(args[0], 'value', None):
                    facts.imports_from.append(str(args[0].value).split('/')[-1])

        # walk all child nodes generically
        for key in dir(node):
            if key.startswith('_') or key in ('type', 'range', 'loc'):
                continue
            try:
                val = getattr(node, key)
            except Exception:
                continue
            if isinstance(val, list):
                for item in val:
                    walk(item, parent_func)
            elif hasattr(val, 'type'):
                walk(val, parent_func)

    walk(tree)
    return facts


def build_js_dependency_graph(directory):
    graph = {}
    all_facts = {}
    for root, _, files in os.walk(directory):
        for fname in sorted(files):
            if fname.endswith(('.js', '.jsx')):  # .ts/.tsx deliberately excluded - not reliably parseable here
                path = os.path.join(root, fname)
                facts = analyze_js_file(path)
                all_facts[facts.name] = facts
                graph[facts.name] = facts.imports_from
    return graph, all_facts
