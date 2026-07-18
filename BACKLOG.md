# Backlog

Ordered by what actually needs to happen next, not by what's most fun
to build. Validation comes before more engineering — see "Phase 0"
below, and don't skip it just because code is more comfortable than
outreach.

## Phase 0 — Validate (do this before anything else below)

- [ ] Send `demo_report.md` (or a report run against a real, anonymized
      codebase if you can get one) to 5-10 people in your network:
      CTOs, VPs Engineering, architects.
- [ ] Ask one question: "Does this look like something you'd have
      wanted before your last modernization project?" Not "would you
      buy this" — too early for that question.
- [ ] Track responses honestly. If most say no or shrug, that's real
      information — don't rationalize it away.

## Phase 1 — POC hardening (only after Phase 0 gives a real signal)

- [ ] Add an explicit `--explain` flag so sending code to the Claude
      API is opt-in, never automatic (currently it runs automatically
      whenever `ANTHROPIC_API_KEY` is set — fix before using on any
      real codebase, see `ARCHITECTURE.md` → Data handling).
- [ ] Add basic redaction for anything that looks like a credential,
      API key, or connection string before it's sent to the API.
- [ ] Validate explanation quality against 3-5 real (or realistically
      messy synthetic) codebases, not just the one clean sample.
- [ ] Add Java support — highest-value next language given enterprise
      legacy prevalence. Needs a real parser (`javalang` or
      tree-sitter), not regex (see `ARCHITECTURE.md`).
- [ ] Add a `--fuzzy` or whole-directory batch mode for scanning many
      services/modules at once, not just one folder at a time.

## Phase 2 — First real users (4-8 weeks out)

- [ ] Self-serve free tier for the CTOs contacted in Phase 0.
- [ ] Track one metric only: did they take a real action after reading
      the report (forwarded it, used it in a decision, asked for
      more) — not signups, not stars.
- [ ] Basic web UI or hosted version, only if CLI friction is the
      actual thing stopping people, not before.

## Phase 3 — Monetize (only after Phase 2 shows real signal)

- [ ] Paid tier for larger codebases / team seats.
- [ ] Private/self-hosted deployment option — required for regulated
      customers who won't send code to a SaaS (banks, healthcare).
- [ ] Explore partnering WITH modernization agencies (First Line
      Software and similar) as their fast front-end, rather than only
      positioning as their competitor.

## Explicitly not on this backlog (and why)

- Code rewriting / automated migration — different, much harder
  competitive fight already dominated by IBM Consulting, Accenture,
  Deloitte. Stay in the assessment lane.
- Full roadmap generation — same reason. First Line Software already
  does this as a bespoke offering; don't try to out-build an agency's
  core service with a side project.
- Multi-language support beyond Java in the near term — better to be
  excellent at Python + Java than mediocre at five languages.
