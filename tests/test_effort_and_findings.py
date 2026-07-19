import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from greybox.analyzer import analyze_file, estimate_effort, categorize_finding

SAMPLE_DIR = os.path.join(os.path.dirname(__file__), "..", "samples", "legacy_sample")


def test_clean_module_has_lower_effort_than_messy_one():
    billing = analyze_file(os.path.join(SAMPLE_DIR, "billing_engine.py"))
    main = analyze_file(os.path.join(SAMPLE_DIR, "main.py"))
    assert estimate_effort(main) < estimate_effort(billing)


def test_categorize_finding_flags_todo_first():
    billing = analyze_file(os.path.join(SAMPLE_DIR, "billing_engine.py"))
    assert categorize_finding(billing) == "flagged_comment"


def test_categorize_finding_clean_module():
    main = analyze_file(os.path.join(SAMPLE_DIR, "main.py"))
    assert categorize_finding(main) == "clean"


def test_categorize_finding_undocumented_constants_only():
    utils = analyze_file(os.path.join(SAMPLE_DIR, "legacy_utils.py"))
    assert categorize_finding(utils) == "undocumented_constants"
