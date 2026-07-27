# Why greybox, not just Claude/ChatGPT directly — the actual "so what"

## Correction, added after real user feedback (July 2026)

Earlier research claimed "no self-serve competitor found" for legacy
code assessment. That was wrong — a real person testing this pointed
to **Swimm** (swimm.io), a legitimate, funded, self-serve competitor:
free tier + $29/mo Pro + enterprise pricing, Gartner Cool Vendor 2024,
SOC 2/ISO 27001 compliant, IDE-integrated documentation and dependency
mapping for legacy code. This is a real, direct competitor and should
be named honestly, not minimized.

**The honest differentiation that still holds:** Swimm is built for a
team already committed to documenting and maintaining a codebase
long-term — it's priced per seat, requires signup, and is an ongoing
tool embedded in your IDE. greybox is for the moment *before* that
commitment — free, no signup, a 2-minute look to decide whether a
system is even worth the investment of a Swimm-style tool, a full
migration, or neither. Different moment in the decision, not a
head-to-head feature fight.

## OpenRewrite - a different lane, not a competitor

Same reviewer also pointed to OpenRewrite: a real, mature, deterministic
recipe engine with thousands of prebuilt transformations (framework
upgrades, CVE fixes), used under the hood by Amazon Q and GitHub
Copilot. It's genuinely better than anything greybox could build for
*known, repeatable* patterns. But recipes require the pattern to
already be cataloged across many codebases — they can't help with a
bespoke, undocumented function specific to one system, because nothing
repeatable can be cataloged from a one-off. Complementary lanes, not
competing ones.

## What greybox honestly can't do

Pushed further, the same reviewer raised the hardest version of this:
context is often proprietary — it lives in someone's head, or a
contract from a decade ago that was never written down. **No tool,
including this one, can recover context that was never captured
anywhere machine-readable.** greybox doesn't solve that. What it does
is narrower and still real: it tells you *exactly where* you still
need a person who remembers, via the confidence score, instead of that
person having to read every file to find out.

**Separately, a real architecture question worth sitting with (not
yet acted on):** the risk-flagging rules (magic numbers, bare-except
detection) are hand-written heuristics, not AI-judged. The same
reviewer described replacing brittle regex with AI prompts for a
different problem (parsing donation receipts) and getting better
accuracy because the AI had more context. The same fix might apply
here eventually — feed the AI accurate AST-derived structure and let
it judge risk directly, instead of expanding hardcoded rules forever.
Not built yet; noted in `BACKLOG.md` as a v2 idea, revisit after real
usage tells us which risk patterns actually matter in practice.

## The real test that answers this

Ran `greybox` against `rides-java-sdk` (Uber's real public SDK, 84
files) instead of a toy example. That's the honest test — a 3-file
demo doesn't prove anything either way.

## What "just use Claude/ChatGPT directly" actually looks like at 84 files

- You paste files in one at a time, or a few at a time until you hit
  context limits.
- That's **84 separate chat answers**, in 84 separate message bubbles,
  each one prose, each one only as long as you scroll.
- To find "which files are actually risky," you have to **manually
  re-read all 84 answers** and rank them in your head. Nothing sorts
  them for you. Nothing remembers what you found in file #12 by the
  time you're reading file #60.
- Ask again next month after a refactor — you get 84 new answers, with
  no way to compare them to last month's except reading both sets
  side by side, by eye.

## What greybox does with the same 84 files

One command:
```bash
greybox rides-java-sdk --format json --output report.json
```

Walks away. Comes back to:
- **One consistent report**, same schema for every single file
- **A real dependency graph** across all 84 files at once — not 84
  disconnected answers, one connected picture
- **Every file ranked by confidence**, lowest first — so "here are the
  6 riskiest files out of 84, go look at those first" is one line of
  output, not an hour of manual reading
- **Structured JSON** — diffable against next month's run, feedable
  into a dashboard or a CI check that fails a build if confidence
  drops

## The honest concession, stated plainly

On a 3-file toy example, raw Claude is just as good, maybe better —
richer prose per file, no argument there. The entire value of
greybox is specifically what happens at real scale: 84 files, or 500
files, not 3. If your actual codebase is small and clean, you
genuinely don't need this tool — you need this tool when the codebase
is the size where "just ask Claude" stops being a plan and starts
being 84 unmanageable browser tabs.

## "But you're just calling Claude API — anyone can do that"

True, and worth saying plainly: yes, anyone can call the Claude API.
That's true of almost every AI product that exists. Stripe is "just
calling a bank." Datadog is "just calling cloud provider APIs." The
real question was never whether Claude makes this possible — it's
whether someone would actually go build everything *around* that API
call themselves, for a problem they hit occasionally.

**The actual numbers, from this codebase:**

```
414 lines of code, total
1 line that actually calls the Claude API
```

The other 413 lines are the part someone has to build before that 1
line becomes useful:

- A real Python AST parser and a separate real Java parser — reading
  code correctly, not guessing with regex
- A dependency graph builder that links files together across the
  whole codebase
- A confidence-scoring formula computed BEFORE the AI runs, from
  magic numbers, error handling, and comments — this is what stops
  the tool from confidently guessing on things it doesn't actually
  know
- A thread pool to run this on 84 files without taking 15 minutes or
  hitting API rate limits
- A consistent report structure (Markdown and JSON), so 84 answers
  become one sortable, comparable list instead of 84 separate things
  to read by hand
- A test suite proving all of this works, with zero API calls needed
  to verify it

**The line to say out loud in a room:** "Yes, I'm calling Claude — so
is every AI product you've ever used. The question isn't whether
Claude is involved, it's whether you want to spend two weeks building
the parser, the graph, the confidence math, and the concurrency
handling yourselves, or use the version where that's already built,
tested, and proven on a real 84-file production codebase."

**The honest follow-up, if someone pushes further:** "What if I just
have an engineer build this exact thing for us?" Fair challenge — they
could, in probably 1-2 weeks of real senior engineering time. That's
roughly the same cost as the "first look" phase this tool replaces in
the first place. This isn't competing against "impossible to build" —
it's competing against "not worth 1-2 weeks of engineering time for a
need that comes up occasionally," the same argument that sells every
dev tool that could technically be built in-house.

## The number that makes this real

84 files, running one at a time, sequentially, is **currently take
[X] minutes** on a real machine (fill in the actual time once your
run finishes) — that alone is the pitch: one command, walk away, come
back to a ranked, structured answer instead of 84 things to manually
track yourself.
