# Business Model

Being upfront about this before open-sourcing, not hiding it.

## What's free, forever

- This entire CLI — full-repo scans, no file cap, all 6 languages
  (Python/Java/JavaScript with real AST parsing; C#/COBOL/Go with
  disclosed heuristics)
- Portfolio mode (`--portfolio`) — scan every repo in a local folder
- JSON/Markdown export, dependency graphs, confidence scoring,
  suggested next steps
- The live web demo's single-repo and org-triage scanners

None of this is a trial or a limited tier. It's the real thing,
Apache 2.0 licensed, and it stays that way.

## What's paid (planned, not fully built yet)

- **Full-depth org scanning** — every file in every repo across an
  org, real confidence scores, not the free triage's sampled
  estimate. This is the one concretely planned paid feature.
- **Private/hosted deployment** for regulated companies who want this
  run by someone else on infrastructure that meets their compliance
  requirements, instead of running the CLI themselves.
- **AI explanations at scale** — the free web demo caps AI-generated
  explanations to the top 3 riskiest files per scan to control cost
  on a public page. A paid tier removes that cap.
- **Priority support** turning a scan into an actual sequenced
  roadmap - see `docs/BACKLOG.md` for what's built vs. planned here.

## Why this split

The free CLI is the actual product and the trust-building mechanism -
same logic as Swimm's free tier, but the CLI itself never becomes
limited or nagged-at as a way to push upgrades. The paid tier exists
specifically for the moment a free user hits a real wall: needing this
run at real depth across a whole org, or needing it run somewhere they
can't run it themselves. That's a natural upgrade trigger, not an
artificial one.

## Current status

No paid tier exists yet. Pricing is genuinely TBD - see `pricing.html`
in the demo repo. This document exists so anyone reading the source
knows the intent up front, not to advertise a product that isn't real
yet.
