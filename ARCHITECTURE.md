# Architecture

## Design principle

**Deterministic first, AI second — never the reverse.**

The single most important rule in this codebase: the AI layer is only
ever allowed to explain facts that the deterministic layer already
found. It is never allowed to be the first thing that looks at the
code. This is the same discipline the `wherefore` project uses, and
it exists for a concrete reason: if the AI free-associates over raw
code with no structural facts in front of it, you get plausible-
sounding guesses with no way to check them. If it explains facts a
separate deterministic pass already extracted, every claim is
checkable against real evidence.

## Pipeline

```
codebase directory
        │
        ▼
┌─────────────────────┐
│   analyzer.py        │  Deterministic. No AI. No network calls.
│                      │  - Parses Python AST
│  - dependency graph  │  - Builds real cross-file import graph
│  - magic numbers     │  - Flags undocumented constants
│  - bare excepts       │  - Flags silent error handling
│  - TODO/FIXME/DO NOT │  - Extracts the only human trace of risk
│  - branch complexity │    that usually exists in legacy code
└──────────┬───────────┘
           │
           ▼
┌─────────────────────┐
│  confidence_score()  │  Deterministic arithmetic over the facts
│                      │  above. Computed BEFORE the AI runs, so the
│                      │  AI cannot influence how confident the tool
│                      │  claims to be. High branch count + many
│                      │  magic numbers + bare except + no comments
│                      │  = low confidence, by formula, not by asking
│                      │  the AI how sure it feels.
└──────────┬───────────┘
           │
           ▼
┌─────────────────────┐
│   explainer.py        │  AI layer. Receives ONLY the facts above,
│                      │  plus the raw source, and is explicitly
│  - pluggable         │  instructed to cite evidence and say
│    provider          │  "uncertain" rather than guess. Pluggable:
│  - real Claude call  │  real API call if a key is present, an
│    if key present    │  honestly-labeled mock otherwise. Never
│  - honest mock       │  silently fakes a result as if it were real.
│    otherwise         │
└──────────┬───────────┘
           │
           ▼
┌─────────────────────┐
│    report.py         │  Combines dependency graph (mermaid),
│                      │  per-module facts, confidence score, and
│                      │  AI explanation into one markdown report.
└──────────────────────┘
```

## Why this beats pasting a file into Claude/ChatGPT directly

This is the question every version of this idea has to answer, and
it's worth stating plainly rather than assuming it:

1. **Scale.** A real legacy system is thousands of files. No one pastes
   thousands of files into a chat window one at a time. The pipeline
   automates traversal and cross-referencing systematically.
2. **Consistency.** Every module gets the same output schema, every
   time — same categories, same confidence formula, same risk-flag
   taxonomy — so results are comparable across hundreds of modules and
   can be handed to a CTO as one coherent report, not 200 separate
   ad-hoc chat answers.
3. **Cross-file reasoning.** Understanding what a system does requires
   knowing that Module A calls Module B which reads a config three
   files away. A single pasted-in file has no visibility into that. A
   dependency graph, built first, gives the AI a map to reason over.
4. **The confidence discipline.** Raw prompting tends to produce
   confident-sounding guesses on ambiguous code. This pipeline computes
   uncertainty from real structural signals before the AI is even
   invoked, so the tool can't be talked into overclaiming.

If a future feature can be done just as well by pasting one file into
Claude, it doesn't belong in this tool. Every feature added here should
require the graph, the aggregation, or the consistency layer to be
worth building at all.

## Language support

Python only today, via the `ast` module (exact structural parsing,
zero false positives on syntax it doesn't understand). Java is the
planned next target, given its prevalence in real enterprise legacy
stacks. Java support requires a real parser (e.g. `javalang` or a
tree-sitter grammar), not a regex approximation — regex-based parsing
of Java would silently produce wrong dependency graphs, and a wrong
graph is worse than no graph, since the entire report builds on it.

## Data handling / privacy

Currently the tool sends raw source code to the Claude API when
`--explain`-equivalent behavior runs (this happens automatically today
if `ANTHROPIC_API_KEY` is set; a future version should make this an
explicit opt-in flag, matching `wherefore`'s pattern, rather than
automatic). Before this tool is used on any real proprietary codebase:

- Add an explicit `--explain` flag so sending code to the API is never
  silent or automatic.
- Add redaction for anything that looks like a credential, connection
  string, or API key before it leaves the machine — legacy code is
  exactly the kind of place hardcoded secrets hide.
- Document clearly that self-hosted / private deployment will be a
  requirement for regulated customers (see `BACKLOG.md`).
