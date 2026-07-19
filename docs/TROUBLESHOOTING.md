# Troubleshooting

## "AI explanation" section shows a mock instead of a real answer

You haven't set `ANTHROPIC_API_KEY`. Either:
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```
or accept the mock — the deterministic layer (dependency graph, confidence
scores, next steps) works fully either way. See `README.md`.

## Java files aren't being analyzed / graph looks empty for a Java repo

Confirm `javalang` is installed: `pip install -e .` should pull it in
automatically (see `pyproject.toml`). If a specific `.java` file fails
to parse, `analyze_java_file` in `src/greybox/java_analyzer.py` returns
partial facts with a note rather than crashing — check for a
`"PARSE FAILED"` entry in that file's `todo_comments`.

## It's slow on a large codebase

Each file with `ANTHROPIC_API_KEY` set makes a real network call.
Increase concurrency:
```bash
greybox /path/to/repo --workers 8
```
Higher isn't always better - very high `--workers` on a very large repo
can hit Anthropic API rate limits. Start at 8, adjust from there.

## "No python entrypoint found" when deploying the demo to Vercel

This is a demo-deployment issue, not a CLI issue - see `demo/README.md`.
Short version: don't deploy the main repo directly to Vercel; the demo
site lives in its own separate repo with no Python files in it, on
purpose, so there's nothing for Vercel to misdetect.

## Tests fail after pulling latest changes

```bash
pip install -e ".[dev]" --force-reinstall --no-deps
pytest tests/ -v
```
All 22 tests should pass with zero API calls - if one fails, check
whether `analyzer.py`'s output shape changed without updating the
corresponding test fixture.

## I found a bug not covered here

Open an issue on the repo, or see `SECURITY.md` if it's a
security/privacy concern specifically (handle those privately, not as
a public issue).
