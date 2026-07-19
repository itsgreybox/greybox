import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from greybox.analyzer import analyze_file, suggest_next_steps

SAMPLE_DIR = os.path.join(os.path.dirname(__file__), "..", "samples", "legacy_sample")


def test_suggests_extracting_magic_numbers():
    facts = analyze_file(os.path.join(SAMPLE_DIR, "billing_engine.py"))
    steps = suggest_next_steps(facts)
    assert any("Extract" in s and "constant" in s for s in steps)


def test_suggests_following_up_on_todo_comment():
    facts = analyze_file(os.path.join(SAMPLE_DIR, "billing_engine.py"))
    steps = suggest_next_steps(facts)
    assert any("Priya" in s for s in steps)


def test_clean_module_gets_low_risk_suggestion():
    facts = analyze_file(os.path.join(SAMPLE_DIR, "main.py"))
    steps = suggest_next_steps(facts)
    assert any("reasonable candidate" in s for s in steps)
