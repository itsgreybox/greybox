import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from greybox.java_analyzer import analyze_java_file

SAMPLE = os.path.join(
    os.path.dirname(__file__), "..", "samples", "legacy_sample_java", "BillingEngine.java"
)


def test_analyze_java_file_finds_methods():
    facts = analyze_java_file(SAMPLE)
    assert "proc" in facts.functions
    assert "legacyHook" in facts.functions


def test_analyze_java_file_finds_todo_comment():
    facts = analyze_java_file(SAMPLE)
    assert any("Priya" in c[1] for c in facts.todo_comments)


def test_analyze_java_file_finds_magic_numbers():
    facts = analyze_java_file(SAMPLE)
    assert 12.5 in facts.magic_numbers


def test_analyze_java_file_finds_silent_catch():
    facts = analyze_java_file(SAMPLE)
    assert facts.has_bare_except is True
