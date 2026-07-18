# Launch Checklist

This is about readiness to show/share the project, at each stage —
not about code features (see `FEATURE_CHECKLIST.md` for that).
Stages build on each other; don't skip to a later stage because it
feels more exciting than the current one.

## Stage 1 — Share privately with your network (do this first)

- [ ] Repo pushed to GitHub as **private** (already done)
- [ ] Real LICENSE file in place (done — Apache 2.0)
- [ ] README clearly states what it does AND what it explicitly
      doesn't do (done — keep this honest as scope changes)
- [ ] Run the tool on at least one codebase that ISN'T the synthetic
      sample, so you have a second real report to point to
- [ ] Draft and send the validation message to 5-10 named people (see
      `BACKLOG.md` Phase 0) — this is the actual launch, more than any
      code milestone
- [ ] Have honest answers ready for: "why not just paste this into
      Claude/ChatGPT" and "what happens to our code if we run this"
      (see ARCHITECTURE.md and the redaction gap noted in
      FEATURE_CHECKLIST.md — be upfront about what's not built yet)

## Stage 2 — Open the repo to a wider but still controlled audience

Do not proceed here until Stage 1 produced at least a few real,
positive "yes, this is a real problem for us" responses.

- [ ] Redaction of secrets/credentials implemented (currently missing
      — do not run this on anyone's real proprietary code before this
      exists)
- [ ] Explicit opt-in `--explain` flag implemented (AI calls should
      never be silent/automatic before wider use)
- [ ] Tested against at least 3-5 real or realistically messy
      codebases, not just the clean synthetic sample
- [ ] A short (2-minute) demo video or walkthrough, so people can see
      it work without installing anything themselves first

## Stage 3 — Public (GitHub public, Show HN, LinkedIn post, etc.)

Do not proceed here until Stage 2 has real users who've said the
report was useful in an actual decision, not just "looks cool."

- [ ] CI actually green on GitHub (not just written — verified running)
- [ ] CONTRIBUTING guidelines exist if you want outside contributions
- [ ] Clear positioning statement ready: what this is, what it isn't,
      who it's for — see README "one-sentence version" pattern from
      the original project story doc
- [ ] A specific, concrete distribution plan for this launch — which
      subreddit, which post, which 10 people share it first — not
      "post it and see." (This is the step that killed your last 4
      projects — do not repeat it here.)
- [ ] Decide and document pricing/monetization approach, even if it's
      "free for now" — have the answer ready when someone asks

## Never skip

- [ ] At every stage, be honest in public-facing text about what's
      real vs. planned. `FEATURE_CHECKLIST.md` should always reflect
      the true state, since the entire pitch of this tool is honesty
      about confidence and uncertainty — the project itself has to
      model that, not just the code.
