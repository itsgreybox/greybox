import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from greybox.portfolio import scan_portfolio

SAMPLES_DIR = os.path.join(os.path.dirname(__file__), "..", "samples")


def test_scan_portfolio_finds_all_sample_repos():
    data = scan_portfolio(SAMPLES_DIR)
    assert data['repos_scanned'] == 6
    repo_names = {r['repo'] for r in data['results']}
    assert 'legacy_sample' in repo_names
    assert 'legacy_sample_java' in repo_names
    assert 'legacy_sample_js' in repo_names
    assert 'legacy_sample_csharp' in repo_names
    assert 'legacy_sample_cobol' in repo_names
    assert 'legacy_sample_go' in repo_names


def test_scan_portfolio_results_have_priority_ranking():
    data = scan_portfolio(SAMPLES_DIR)
    scores = [r['priority_score'] for r in data['results']]
    assert scores == sorted(scores, reverse=True)
