# Feature Checklist

Status as of initial commit. "Verified" means actually run and
observed working, not just written.

## Deterministic layer (analyzer.py)

- [x] Parse Python source via `ast` — verified
- [x] Build real cross-file dependency graph from imports — verified
      (`main → billing_engine → legacy_utils` correctly detected)
- [x] Detect undocumented magic numbers — verified
- [x] Detect bare `except:` (silent failure risk) — implemented, not
      yet exercised by a test fixture that actually has one
- [x] Detect TODO/FIXME/DO NOT comments — verified (found the real
      "ask Priya" comment in the sample)
- [x] Branch/conditional complexity count — verified
- [x] Deterministic confidence score, computed before any AI call —
      verified (billing_engine scored 40/100, main.py scored 80/100,
      correctly ranking undocumented complexity)

## AI layer (explainer.py)

- [x] Pluggable provider: real Anthropic call if key present —
      implemented, not yet run against the real API (no key in build
      environment)
- [x] Honest mock fallback when no key present — verified
- [x] Prompt explicitly instructs "cite evidence, say uncertain rather
      than guess" — implemented, quality not yet validated against
      real API output
- [ ] Redaction of secrets/credentials before sending code to the API
      — NOT implemented yet. Do not run this on real proprietary code
      until this exists (see BACKLOG.md Phase 1)
- [ ] Explicit opt-in flag for AI calls (currently automatic if key is
      set) — NOT implemented yet

## Reporting (report.py)

- [x] Markdown report with mermaid dependency graph — verified
- [x] Per-module findings with confidence score — verified
- [x] Risk flags surfaced clearly (⚠️ markers) — verified

## CLI / packaging

- [x] Installable package (`pip install -e .`) — verified
- [x] Working CLI entry point (`greybox <dir> --output <file>`) —
      verified
- [x] Test suite runs with zero API calls — verified (6/6 passing)
- [x] CI workflow (GitHub Actions) — written, not yet verified on
      actual GitHub (repo not yet pushed as of this checklist)

## Not started

- [ ] Java support
- [ ] Any UI beyond CLI
- [ ] Batch/whole-directory-tree scanning across many services
- [ ] Real user validation (see BACKLOG.md Phase 0 — do this first)
- [ ] Pricing/monetization anything
