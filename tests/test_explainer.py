import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from greybox.analyzer import analyze_file
from greybox.explainer import explain_module

SAMPLE_DIR = os.path.join(os.path.dirname(__file__), "..", "samples", "legacy_sample")


def test_explain_module_falls_back_to_mock_without_key():
    facts = analyze_file(os.path.join(SAMPLE_DIR, "billing_engine.py"))
    with open(facts.path) as f:
        src = f.read()
    result = explain_module(facts, src, api_key=None)
    assert "MOCK" in result["source"]
    assert "SUMMARY" in result["text"]
