# Demo deployment

This is a real, hosted, live version of a subset of what the CLI does —
not a static snapshot. It's a Vercel project: static pages in `site/`,
serverless functions in `api/`.

**Important distinction from the CLI:** the CLI never sends your code
anywhere. This demo does read code you point it at — a public repo it
fetches over that provider's API, or a ZIP file you upload — to run the
scan. Nothing is stored after the response is returned, but "your code
never leaves your network" (the CLI's promise) does not apply here.
Say so if anyone asks; don't let this page's existence contradict the
CLI's privacy claim in the root README.

## What it can scan

- A single public GitHub, GitLab, or Bitbucket repo (`api/scan.js`,
  `api/scan-gitlab.js`, `api/scan-bitbucket.js`)
- A ZIP upload of any codebase, public or private (`api/scan-zip.js`,
  capped at 4.5MB — a Vercel serverless request-body limit, not a
  choice)
- A full GitHub org or GitLab group, as a lightweight triage sample
  across many repos, not a full scan (`api/scan-org.js`,
  `api/scan-gitlab-org.js`)

All four converge on one shared analysis engine (`api/_lib/analyze.js`)
so results are consistent regardless of source. Bitbucket has no
single "list every file" API, so that adapter walks the folder tree
itself with explicit caps — see the comment at the top of
`scan-bitbucket.js` before touching it.

**Honesty note, on purpose:** this web version is a regex-based
approximation, not the CLI's real AST parsing, and it's capped at 100
files per scan. The CLI has no cap and does real AST parsing for
Python/Java/JavaScript. The site says this explicitly in multiple
places — don't remove those disclaimers to make the demo look more
capable than it is.

## Deploy to Vercel

**Root directory matters:** when importing this repo into Vercel, set
the project's root directory to `demo`, not the repo root. The
`api/` folder must stay at that root (not nested under `site/`) for
Vercel to detect it as serverless functions.

```bash
npm install -g vercel
cd demo
vercel --prod
```

Or via the Vercel dashboard: "Add New" → "Project" → import this repo
→ set root directory to `demo` → Framework preset "Other" → Deploy.

### Environment variable

Set `ANTHROPIC_API_KEY` in the Vercel project's environment variables
to enable real AI explanations on the top 3 riskiest files per scan.
Without it, the demo still runs and says so honestly in the response
(`ai_enabled: false`) rather than silently faking an explanation.

## Before sending the link to anyone

- [ ] Run a real scan against a public repo yourself — GitHub, GitLab,
      and Bitbucket each have their own failure modes (rate limits,
      auth, tree-walk quirks) worth seeing once live
- [ ] Try a ZIP upload with a real small codebase
- [ ] Confirm the dependency graph renders (loads Mermaid from a CDN —
      needs internet access, which is fine for a public link)
- [ ] Check both desktop and phone widths

## What this demo is not

It's not the CLI, and it's not a replacement for it. It exists to let
someone evaluate the idea in under a minute with zero setup. Anyone
who wants a real full-repo scan, real AST parsing, or to keep private
code entirely off any third-party server should be pointed at the CLI
instead — the site does this at every "free tier" cap it hits.
