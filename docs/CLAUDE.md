# CLAUDE.md

Context for any AI assistant (Claude Code or otherwise) working in
this repository. Read this before making changes.

## What this project is

`greybox` gives a plain-English assessment of an undocumented
codebase — dependency graph, risk flags, and an honest confidence
score per module — as a fast, cheap alternative to the "figure out
what this legacy system does" phase that's currently only sold bundled
inside $150K+ consulting engagements.

Full context: see `README.md` (what/why), `ARCHITECTURE.md` (how and
why it's built this way), `BACKLOG.md` (what's next).

## The one rule that matters most

**Deterministic facts are extracted BEFORE any AI call, and the AI is
only ever allowed to explain facts already found — never to be the
first thing that looks at the code.** If you're adding a feature and
find yourself tempted to just ask Claude to figure something out
directly from raw source with no structural pass first, stop — that's
the exact anti-pattern this project exists to avoid. See
`ARCHITECTURE.md` → "Why this beats pasting a file into Claude/ChatGPT
directly" before adding any AI-touching code.

## Current status (keep this section updated)

- Python-only static analysis. Working, tested, zero AI dependency.
- AI explanation layer is pluggable: real API call if
  `ANTHROPIC_API_KEY` is set, honestly-labeled mock otherwise. Never
  silently fake a real result.
- No UI. CLI only (`greybox <directory>`).
- Not yet validated with any real user or real codebase outside the
  synthetic sample in `samples/legacy_sample`.

## Ground rules when working on this repo

1. **Never claim something works if it wasn't actually run.** This
   project's entire value proposition is honesty about confidence and
   uncertainty — the codebase itself has to model that discipline, not
   just talk about it. If you write a feature, run it and show real
   output before saying it works.
2. **Every deterministic-layer feature needs a test with zero API
   calls.** The whole point of separating the layers is that most of
   this tool should be testable and demoable without spending a cent
   or making a network call.
3. **Don't add scope creep toward migration/rewriting.** This is
   explicitly an assessment tool, not a modernization platform. See
   README "What it doesn't do" before adding anything that rewrites,
   migrates, or generates a full roadmap — that's a different product
   and a different, much harder competitive fight (see market research
   in `BACKLOG.md` context).
4. **Any change to what gets sent to the Claude API needs a privacy
   check.** Legacy code is exactly where hardcoded secrets and
   customer data hide. Don't send raw source anywhere without at least
   flagging what redaction is missing (see `ARCHITECTURE.md` → Data
   handling).
5. **New language support needs a real parser, not regex.** A wrong
   dependency graph is worse than no graph — the whole report builds
   on it being right.
