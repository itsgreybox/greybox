import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from greybox.javascript_analyzer import analyze_js_file

SAMPLE = os.path.join(
    os.path.dirname(__file__), "..", "samples", "legacy_sample_js", "billing.js"
)


def test_analyze_js_finds_functions():
    facts = analyze_js_file(SAMPLE)
    assert "calculateFee" in facts.functions
    assert "legacyHook" in facts.functions


def test_analyze_js_finds_magic_numbers():
    facts = analyze_js_file(SAMPLE)
    assert 12.5 in facts.magic_numbers
    assert 0.0475 in facts.magic_numbers


def test_analyze_js_finds_bare_catch():
    facts = analyze_js_file(SAMPLE)
    assert facts.has_bare_except is True


def test_analyze_js_finds_todo_comment():
    facts = analyze_js_file(SAMPLE)
    assert any("Priya" in c[1] for c in facts.todo_comments)


def test_analyze_js_finds_require_import():
    facts = analyze_js_file(SAMPLE)
    assert "legacy_rates" in facts.imports_from
