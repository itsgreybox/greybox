import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from greybox.csharp_analyzer import analyze_csharp_file
from greybox.cobol_analyzer import analyze_cobol_file

CS_SAMPLE = os.path.join(os.path.dirname(__file__), "..", "samples", "legacy_sample_csharp", "BillingEngine.cs")
COBOL_SAMPLE = os.path.join(os.path.dirname(__file__), "..", "samples", "legacy_sample_cobol", "BILLING.CBL")


def test_analyze_csharp_finds_methods():
    facts = analyze_csharp_file(CS_SAMPLE)
    assert "CalculateFee" in facts.functions
    assert "LegacyHook" in facts.functions


def test_analyze_csharp_finds_bare_catch():
    facts = analyze_csharp_file(CS_SAMPLE)
    assert facts.has_bare_except is True


def test_analyze_csharp_finds_using_imports():
    facts = analyze_csharp_file(CS_SAMPLE)
    assert "System" in facts.imports_from
    assert "LegacyUtils" in facts.imports_from


def test_analyze_cobol_finds_paragraphs():
    facts = analyze_cobol_file(COBOL_SAMPLE)
    assert "CALCULATE-FEE" in facts.functions
    assert "LEGACY-HOOK" in facts.functions


def test_analyze_cobol_finds_perform_dependencies():
    facts = analyze_cobol_file(COBOL_SAMPLE)
    assert "CALCULATE-FEE" in facts.imports_from
