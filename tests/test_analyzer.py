import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from greybox.analyzer import analyze_file, build_dependency_graph, confidence_score

SAMPLE_DIR = os.path.join(os.path.dirname(__file__), "..", "samples", "legacy_sample")


def test_analyze_file_finds_functions():
    facts = analyze_file(os.path.join(SAMPLE_DIR, "billing_engine.py"))
    assert "proc" in facts.functions
    assert "batch" in facts.functions
    assert "legacy_hook" in facts.functions


def test_analyze_file_finds_todo_comments():
    facts = analyze_file(os.path.join(SAMPLE_DIR, "billing_engine.py"))
    assert len(facts.todo_comments) == 1
    assert "Priya" in facts.todo_comments[0][1]


def test_analyze_file_finds_magic_numbers():
    facts = analyze_file(os.path.join(SAMPLE_DIR, "legacy_utils.py"))
    assert 1000 in facts.magic_numbers


def test_dependency_graph_links_modules():
    graph, all_facts = build_dependency_graph(SAMPLE_DIR)
    assert "legacy_utils" in graph["billing_engine"]
    assert "billing_engine" in graph["main"]


def test_confidence_score_lower_for_complex_undocumented_module():
    graph, all_facts = build_dependency_graph(SAMPLE_DIR)
    billing_conf = confidence_score(all_facts["billing_engine"])
    main_conf = confidence_score(all_facts["main"])
    # billing_engine has more branches, magic numbers, and TODOs than main
    assert billing_conf < main_conf
