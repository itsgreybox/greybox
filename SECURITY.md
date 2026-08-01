# Security & Data Handling

## Table of contents

- [What actually happens to your code today](#what-actually-happens-to-your-code-today)
- [What's still a real gap](#whats-still-a-real-gap)
- [What's safe today, with no API key set](#whats-safe-today-with-no-api-key-set)
- [The hosted web demo is different](#the-hosted-web-demo-is-different)
- [Reporting a security concern](#reporting-a-security-concern)

## What actually happens to your code today

If `ANTHROPIC_API_KEY` is set in your environment, `greybox`
automatically sends a redacted snippet of each analyzed file's source
to the Claude API — there's no separate confirmation step per file.
Redaction is real and already implemented
(`src/greybox/explainer.py::redact_secrets`), not a planned feature:

- API keys matching common patterns (`sk-...`, AWS `AKIA...`)
- Database/connection strings (`mongodb://`, `postgres://`, `mysql://`, `redis://`)
- Any `password = "..."`, `token = "..."`, `api_key = "..."`-style
  hardcoded assignment, regardless of the exact variable name

This is **best-effort pattern matching, not a guarantee.** It won't
catch a secret that doesn't match one of these shapes — a bespoke
internal token format, for instance. Don't treat redaction as a reason
to stop being careful about what you point this at.

## What's still a real gap

There is **no explicit opt-in flag** (e.g. `--explain`) gating the AI
call. If `ANTHROPIC_API_KEY` is present in your environment, every run
sends redacted snippets automatically — there's no dry-run or
confirmation step that shows you what would be sent before it's sent.
Tracked in `docs/BACKLOG.md` and `docs/FEATURE_CHECKLIST.md`. Until
that exists, know that setting the key means every run calls the API,
not just runs where you meant to.

## What's safe today, with no API key set

The entire deterministic layer (`analyzer.py`) makes zero network
calls and sends your code nowhere. You can safely run `greybox` on any
codebase, including sensitive ones, as long as `ANTHROPIC_API_KEY` is
not set — you'll get the dependency graph, risk flags, and confidence
scores with the AI explanation section clearly marked as a mock.

## The hosted web demo is different

Everything above describes the CLI. The separate hosted demo at
`/demo` (see `demo/README.md`) reads code you explicitly give it — a
public repo URL it fetches, or a ZIP you upload — for the duration of
that one scan. It uses the same redaction logic before any AI call.
Nothing is persisted after the response is returned, but this is a
different trust model than the CLI's "never leaves your machine"
guarantee. Don't conflate the two when explaining this project to
someone evaluating it for a regulated environment — point them at the
CLI, not the demo.

## Reporting a security concern

This repo is now public
([github.com/itsgreybox/greybox](https://github.com/itsgreybox/greybox)).
Please **do not open a public issue** for a security vulnerability.
Use GitHub's private reporting instead: go to the repo's **Security**
tab → **Report a vulnerability**, which opens a private advisory
visible only to maintainers until it's resolved. This is standard
practice for public repos and keeps an unpatched issue from being
publicly disclosed before there's a fix.
