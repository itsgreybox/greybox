# Backlog

Last updated after real outreach (sent July 19, 8 people) and a real,
substantive back-and-forth with one respondent (Ron). Ordered by what
actually needs to happen next, not what's most fun to build.

## Status check — be honest about this

- 8 people contacted. 1 real, thoughtful response (Ron) — genuine
  intellectual engagement across multiple rounds, not customer
  validation. He agreed the core problem (understanding undocumented,
  bespoke logic) is real and unsolved by tools he knows well.
- **This is progress, not proof of a market.** Nobody has said "I'd
  use or pay for this" yet. Don't blur that line.
- The build-to-validation ratio has been lopsided all week: one real
  conversation vs. a CLI, live scanner, org-scan, portfolio mode,
  pricing page, and an idea-board site. The product is well-built.
  That doesn't substitute for more real conversations.

## Phase 0.5 — Get a real "would you pay" signal (do this before anything else)

- [ ] Send 3-5 NEW people a sharper question than the first round:
      not "is this useful" but "would you pay $X/month for this,
      yes or no." Uncomfortable to send, far more informative.
- [ ] Follow up with Ron once more if he responds again, but don't
      chase him further - he's busy and has already given real value.
- [ ] Test the Formspree contact form end-to-end yourself (submit a
      real message, confirm it lands in your inbox) before relying
      on it for a public launch.

## Phase 1 — Public launch prep

- [ ] Decide launch venue: Show HN, a relevant subreddit
      (r/programming, r/ExperiencedDevs), or a public LinkedIn post -
      each has a different crowd, pick deliberately, not all at once.
- [ ] Core loop (single-repo scanner) should be the thing strangers
      try first - it's the most hardened; org-scan is real but
      shallower, don't lead with it publicly.
- [ ] Have the honest "why not just Claude / Swimm / OpenRewrite"
      page ready - it's now genuinely strong, sharpened by real
      pushback, not just written defensively.

## Known, honest limitations (say these out loud if asked, don't hide them)

- Doesn't recover context that was never written down anywhere
  (Ron's point, agreed with directly) - tells you where you still
  need a human who remembers, doesn't replace them.
- Risk-flagging rules (magic numbers, bare-except detection) are
  hand-written heuristics, not AI-judged - could get brittle as
  coverage expands to more patterns/languages (Ron's regex-to-AI
  story is a real parallel worth taking seriously).
- Live web demo's org-scan is a shallow triage (a few files sampled
  per repo), not a full report - the CLI's --portfolio mode is the
  real, unsampled version, but only works locally.
- Thin technical moat - the parsing techniques aren't novel. Swimm
  (funded, Gartner-recognized) is a real, closer competitor than
  earlier research found.

## v2 ideas — don't build yet, revisit after real usage signal

- [ ] Replace hand-written risk heuristics with AI making the risk
      judgment directly, given accurate AST-derived structure as
      context - Ron's regex-to-AI-prompt story suggests this may
      generalize better than expanding hardcoded rules forever.
- [ ] Accounts, saved scan history, billing - needs a database and
      auth, genuinely multi-session work. Don't build until real
      users ask for something specific enough to build the right
      version, not a guess.
- [ ] Opt-in anonymized benchmarking dataset across scans (a real
      data-network-effect moat, mentioned in the builder-lens
      analysis) - only makes sense once there's real scan volume.

## Backup idea, if greybox stalls

Vendor/third-party risk management (mid-market) - see the
`idea-board` repo for the full, separately vetted comparison. Don't
start researching this further until greybox's Phase 0.5 concludes.
