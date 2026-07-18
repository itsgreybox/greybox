# greybox

**Point it at an undocumented codebase. Get a plain-English assessment
of what it does, a real dependency graph, and an honest confidence
score per module — before you spend $150K+ on a modernization
consultant to tell you the same thing.**

Legacy modernization projects spend 10-15% of their total budget just
figuring out what the existing system actually does, before any real
work starts. That phase is currently only sold bundled inside large
consulting engagements. `greybox` is the fast, cheap, self-serve first
look — not a replacement for a full migration, a way to walk into one
informed.

## What it does today (real, working)

- Parses a Python codebase and builds a **real cross-file dependency
  graph** from actual imports — not a guess from one pasted-in file.
- Flags **undocumented magic numbers**, **bare exception handlers**
  (silent failure risk), and any **TODO / DO NOT / FIXME comments** —
  these are usually the only human trace of real risk in old code.
- Computes a **deterministic confidence score per module**, before any
  AI is involved, from real structural signals (branch complexity,
  undocumented constants, error handling). This score is not a vibe —
  it's arithmetic over real facts.
- Passes those facts to Claude to generate a **plain-English
  explanation**, explicitly instructed to cite evidence and say
  "uncertain" rather than guess.

## What it doesn't do (on purpose)

No code rewriting. No migration execution. No full roadmap generation.
Those are real, valuable, and better done by people and firms who
specialize in execution. `greybox` is the assessment layer only.

## Quickstart

```bash
pip install -e .
export ANTHROPIC_API_KEY="sk-ant-..."   # optional - runs with an honest mock without it
greybox path/to/codebase --output report.md
```

Try it on the included synthetic example (deliberately undocumented,
to prove the tool works on real ambiguity):

```bash
greybox samples/legacy_sample --output demo_report.md
```

## Running tests

```bash
pip install -e ".[dev]"
pytest tests/ -v
```

All tests run with zero API calls and zero network access — the
deterministic layer is fully tested independently of the AI layer.

## Architecture

```
codebase directory
        │
        ▼
 analyzer.py       (AST parsing, dependency graph, structural facts —
        │           no AI, fully deterministic, fully tested)
        ▼
 confidence_score  (arithmetic over real signals, computed BEFORE
        │           any AI runs)
        ▼
 explainer.py       (Claude explains ONLY the evidence found above —
        │           never invents behavior; honestly mocked if no
        │           API key is present)
        ▼
 report.py          (Markdown report: dependency graph + per-module
                      findings + confidence + AI explanation)
```

## Status

Early proof of concept. Currently supports Python only. Java support
(the highest-value next target given enterprise legacy prevalence) is
the next planned step.

## License

Apache 2.0 — see `LICENSE`.
