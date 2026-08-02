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


def test_dependency_graph_recurses_into_subdirectories(tmp_path):
    # Regression test: build_dependency_graph used to call os.listdir(),
    # which only sees files directly in the given folder and silently
    # skips everything in subdirectories. Nearly every real Python
    # project has subdirectories, so this was a severe silent
    # under-scan bug. This test fails loudly if it ever regresses.
    (tmp_path / "pkg" / "sub").mkdir(parents=True)
    (tmp_path / "top.py").write_text("def top_func():\n    pass\n")
    (tmp_path / "pkg" / "mid.py").write_text("def mid_func():\n    pass\n")
    (tmp_path / "pkg" / "sub" / "deep.py").write_text("def deep_func():\n    pass\n")

    graph, all_facts = build_dependency_graph(str(tmp_path))

    assert "top" in all_facts, "top-level file missing"
    assert "mid" in all_facts, "one level deep - not recursing into subdirectories"
    assert "deep" in all_facts, "two levels deep - not recursing into subdirectories"


def _make_layered_project(tmp_path):
    (tmp_path / "api").mkdir()
    (tmp_path / "models").mkdir()
    (tmp_path / "utils").mkdir()
    (tmp_path / "main.py").write_text("from api import handler\n\ndef run():\n    pass\n")
    (tmp_path / "api" / "handler.py").write_text(
        "from models import user\nfrom utils import helpers\n\ndef handle():\n    pass\n"
    )
    (tmp_path / "models" / "user.py").write_text("from utils import helpers\n\ndef load():\n    pass\n")
    (tmp_path / "utils" / "helpers.py").write_text("def helper():\n    pass\n")
    (tmp_path / "orphan.py").write_text("# nothing imports this, and this imports nothing\ndef dead():\n    pass\n")
    return build_dependency_graph(str(tmp_path))


def test_folder_architecture_groups_by_directory(tmp_path):
    from greybox.analyzer import build_folder_architecture_graph
    graph, all_facts = _make_layered_project(tmp_path)
    arch = build_folder_architecture_graph(graph, all_facts, str(tmp_path))

    assert "api" in arch["(root)"]
    assert set(arch["api"]) == {"models", "utils"}
    assert arch["models"] == ["utils"]
    assert "api" not in arch["api"]  # never a self-edge


def test_entry_point_flow_finds_entries_and_reachability(tmp_path):
    from greybox.analyzer import build_entry_point_flow
    graph, all_facts = _make_layered_project(tmp_path)
    flow = build_entry_point_flow(graph, all_facts)

    assert set(flow["entry_points"]) == {"main", "orphan"}
    assert set(flow["reachable_from"]["main"]) == {"handler", "user", "helpers"}
    assert flow["reachable_from"]["orphan"] == []
    assert flow["unreached"] == []  # orphan is correctly an entry point, not "unreached"


def test_confidence_score_lower_for_complex_undocumented_module():
    graph, all_facts = build_dependency_graph(SAMPLE_DIR)
    billing_conf = confidence_score(all_facts["billing_engine"])
    main_conf = confidence_score(all_facts["main"])
    # billing_engine has more branches, magic numbers, and TODOs than main
    assert billing_conf < main_conf
