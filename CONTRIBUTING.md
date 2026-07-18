# Contributing

This is currently a private, early-stage, single-maintainer project.
It's not yet open for outside contributions while the core idea is
still being validated (see `BACKLOG.md` Phase 0) — but these are the
ground rules for when that changes, and for any collaborators brought
in before then.

## Before adding any feature

Read `CLAUDE.md` and `ARCHITECTURE.md` first. The short version:

1. Deterministic facts before AI, always. Never let the AI be the
   first thing that looks at raw code.
2. Every deterministic-layer change needs a test that runs with zero
   API calls.
3. Don't expand scope toward migration/rewriting — this is an
   assessment tool, not a modernization platform.
4. Anything that changes what gets sent to the Claude API needs a
   privacy/redaction review first (see `SECURITY.md`).

## Development setup

See `SETUP.md`.

## Running tests before submitting anything

```bash
pytest tests/ -v
```

All tests must pass with zero API calls. If your change requires an
API call to test, it needs a mocked test path too (see
`tests/test_explainer.py` for the pattern).

## Honesty standard

`FEATURE_CHECKLIST.md` must always reflect what's actually verified
working versus what's implemented-but-unverified versus what's not
started. Don't mark something as done unless you've actually run it
and seen real output — this project's entire value proposition is
honesty about confidence and uncertainty, and that has to be true of
the project's own documentation, not just its code output.
