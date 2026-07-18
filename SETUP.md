# Setup

## Requirements

- Python 3.10+
- (Optional) an Anthropic API key, to run the real AI explanation
  layer instead of the honest mock

## Install

```bash
git clone https://github.com/ArunMishra1/greybox.git
cd greybox
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

## Run the test suite

```bash
pytest tests/ -v
```

Should show 6 passed. No API key needed — tests only exercise the
deterministic layer and the mock fallback path.

## Try it on the included sample

```bash
greybox samples/legacy_sample --output demo_report.md
cat demo_report.md
```

## Run it with real AI explanations

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
greybox samples/legacy_sample --output demo_report.md
```

## Try it on your own codebase

```bash
greybox /path/to/some/python/project --output report.md
```

Currently Python-only (see `ARCHITECTURE.md` for why Java support
needs a real parser, not a quick regex hack).

## Project layout

```
greybox/
├── src/greybox/         # the actual package
│   ├── analyzer.py       # deterministic layer - AST parsing, graph, facts
│   ├── explainer.py       # AI layer - pluggable, real or honest mock
│   ├── report.py          # combines both into a markdown report
│   └── cli.py             # command-line entry point
├── tests/                 # tests for the deterministic layer + mock path
├── samples/legacy_sample/ # synthetic undocumented codebase for demos
├── ARCHITECTURE.md        # how and why it's built this way
├── BACKLOG.md             # prioritized next steps
├── CLAUDE.md              # context for AI-assisted work on this repo
└── README.md              # what it is and why
```
