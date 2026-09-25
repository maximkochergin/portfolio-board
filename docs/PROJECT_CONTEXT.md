# Project context

## Purpose

A minimalist, English-language personal portfolio and notes board. Visitors can browse published work, notes, and about entries; one owner can manage posts and private drafts.

## Stack and architecture

- Static HTML, CSS, and browser JavaScript; no application framework or production server.
- `index.html` is the page structure; `styles.css` holds the visual system; `site.js` handles tabs, search, post display, Supabase reads, and owner actions.
- `assets/ambient.js` runs the visitor-local clock and animated greeting.
- `config.js` contains the Supabase URL and publishable key. The key is public by design; database permissions must remain enforced by RLS.
- Supabase Auth uses email sign-in links. PostgreSQL tables and owner checks are defined in `supabase/schema.sql`; upgrades go in `supabase/migrations/`.
- `serve.mjs` is a loopback-only local preview server. GitHub Actions checks the scripts/tests and deploys an explicit static-file allowlist to GitHub Pages.

## Important decisions and boundaries

- Keep the frontend static and dependency-light. Do not add a server or framework for features that fit the current model.
- RLS is the security boundary for public reads, private drafts, and owner writes. UI checks only control what the owner sees.
- Never place Supabase service-role credentials in the repository or browser. Do not expose additional tables or APIs without an explicit access policy.
- GitHub Pages hosts the project under `/portfolio-board/`; it forces HTTPS but does not let this project configure every response security header or cache policy. The page uses a CSP meta policy.
- Public identity beyond the site title is not established in project files. Do not invent a name or personal links for structured data.

## Current state

The site is published at `https://maximkochergin.github.io/portfolio-board/`. The owner-only editor, published posts, drafts, search, external contact links, text-only post formatting, local clock, greeting, and 404 page are implemented. `history/REVIEW.md` records the 2026-09-25 audit; its historical findings should be checked against current code before treating them as open bugs.

For a new session, the user only needs to describe the task. `AGENTS.md` carries the repository workflow automatically; Codex Memory may retain user preferences, but Git and the working tree remain authoritative for code and in-progress changes. When resuming a particular unfinished task in a new thread, state its intended outcome briefly; do not paste the project history.

## Known limitations

- GitHub Pages cannot set all response-level security headers or a custom static cache policy; consider a host change only if those controls are needed.
- `robots.txt` lives at the GitHub Pages project subpath, not the host root.
- The editor compares post `updated_at` values before updating. Contact saves send only changed platforms, so unrelated fields are not overwritten across tabs; concurrent changes to the same platform remain last-write-wins until a database-backed version check is warranted.
