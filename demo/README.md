# Demo deployment

This folder is a single static HTML file — no build step, no backend,
no framework. That's deliberate: the demo's job is to be a link you
can send someone, not a product.

## Deploy to Vercel (2 minutes)

**Option A — via the Vercel website (no CLI needed):**
1. Go to vercel.com, sign in (GitHub login is easiest)
2. "Add New" → "Project" → "Import" your `greybox` repo
3. When it asks for the root directory, set it to `demo`
4. Framework preset: "Other" (it's plain HTML, no framework)
5. Deploy — you'll get a URL like `greybox-demo.vercel.app`

**Option B — via CLI, if you have Node installed:**
```bash
npm install -g vercel
cd demo
vercel --prod
```

Either way, you get a real public URL in under 2 minutes, with nothing
running server-side — it's just a static page.

## Before sending the link to anyone

- [ ] Open the deployed URL yourself first, on both desktop and phone
- [ ] Check the mermaid diagram actually renders (it loads from a CDN,
      so it needs internet access, which is fine for a public link)
- [ ] Decide: is this report content (the sample codebase) something
      you're comfortable being public? It's synthetic, so yes — just
      confirm before you swap in anything real later.

## What this demo is NOT

It's not connected to the actual `greybox` CLI tool — it's a static
snapshot of what one real run looked like, hand-placed into the page.
If you want a live "paste your code, get a report" web tool, that's a
real product decision (backend, hosting, security review for
uploaded code) — don't build that before Phase 0 validation in
`BACKLOG.md` is done.
