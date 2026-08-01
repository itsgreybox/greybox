# Contributing

This repo is now public
([github.com/itsgreybox/greybox](https://github.com/itsgreybox/greybox)),
but it's still early-stage and pre-validation — see `docs/BACKLOG.md`,
"Phase 0.5: get a real 'would you pay' signal," which explicitly says
not to expand scope until that concludes. The code being public means
you're welcome to read it, fork it, and run it — it doesn't yet mean
this is actively seeking outside PRs. If you want to contribute
something substantial, open an issue to discuss it first rather than
sending a large PR cold.

## Before adding any feature

Read `docs/CLAUDE.md` and `docs/ARCHITECTURE.md` first. The short version:

1. Deterministic facts before AI, always. Never let the AI be the
   first thing that looks at raw code.
2. Every deterministic-layer change needs a test that runs with zero
   API calls.
3. Don't expand scope toward migration/rewriting — this is an
   assessment tool, not a modernization platform.
4. Anything that changes what gets sent to the Claude API needs a
   privacy/redaction review first (see `SECURITY.md`).

## Development setup

See `docs/SETUP.md`.

## Running tests before submitting anything

```bash
pytest tests/ -v
```

All tests must pass with zero API calls. If your change requires an
API call to test, it needs a mocked test path too (see
`tests/test_explainer.py` for the pattern).

## Honesty standard

`docs/FEATURE_CHECKLIST.md` must always reflect what's actually verified
working versus what's implemented-but-unverified versus what's not
started. Don't mark something as done unless you've actually run it
and seen real output — this project's entire value proposition is
honesty about confidence and uncertainty, and that has to be true of
the project's own documentation, not just its code output.
