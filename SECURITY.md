# Security & Data Handling

## Current state — read before running this on real code

As of this version, if `ANTHROPIC_API_KEY` is set in your environment,
`greybox` **automatically** sends the full source of every analyzed
file to the Claude API, with no redaction and no opt-in flag. This is
a known gap, tracked in `BACKLOG.md` Phase 1 and `FEATURE_CHECKLIST.md`.

**Do not run this against real proprietary or customer codebases until:**
1. An explicit `--explain` opt-in flag exists (no silent API calls), and
2. Basic redaction of credentials, API keys, and connection strings is
   implemented (legacy code is exactly where these hide as hardcoded
   values).

Until then, only run this with an API key set against code you're
comfortable sending to Anthropic's API under their standard terms —
the synthetic sample in `samples/legacy_sample`, your own non-sensitive
projects, or fully mocked (no key set).

## What's safe today, with no API key set

The entire deterministic layer (`analyzer.py`) makes zero network
calls and sends your code nowhere. You can safely run `greybox` on any
codebase, including sensitive ones, as long as `ANTHROPIC_API_KEY` is
not set — you'll get the dependency graph, risk flags, and confidence
scores with the AI explanation section clearly marked as a mock.

## Reporting a security concern

This is currently a private, early-stage project with a single
maintainer. If you find a security issue, contact the maintainer
directly rather than opening a public issue.
