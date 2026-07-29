import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from greybox.go_analyzer import analyze_go_file

GO_SAMPLE = os.path.join(os.path.dirname(__file__), "..", "samples", "legacy_sample_go", "billing.go")


def test_analyze_go_finds_functions():
    facts = analyze_go_file(GO_SAMPLE)
    assert "calculateFee" in facts.functions
    assert "legacyHook" in facts.functions


def test_analyze_go_finds_empty_recover():
    facts = analyze_go_file(GO_SAMPLE)
    assert facts.has_bare_except is True


def test_analyze_go_finds_imports():
    facts = analyze_go_file(GO_SAMPLE)
    assert "legacyrates" in facts.imports_from
