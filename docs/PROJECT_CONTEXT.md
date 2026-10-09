# Project context

## Purpose

A minimalist, English-language personal portfolio and notes board. Visitors can browse published work, notes, and about entries; one owner can manage posts and private drafts.

## Stack and architecture

- Static HTML, CSS, and browser JavaScript; no application framework or production server.
- `index.html` is the page structure; `styles.css` holds the visual system; `site.js` handles tabs, search, post display, Supabase reads, and owner actions.
- `assets/navigation.js` keeps tab orientation in sync with the responsive layout.
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

The site is published at `https://maximkochergin.github.io/portfolio-board/`. The October 2026 rebuild follows the dark version of git-scm.com: charcoal backgrounds, muted orange headings and links, the same serif font stack, and compact proportions. The user requested a faithful, minimal adaptation, no design plugin, no decorative dividers, and no clock or greeting. Projects / Notes / About use simple text navigation, single-column previews, and an optional filter for sections with six or more entries. Contacts are near the introduction. The portfolio has no Git attribution text. The concise Git credit belongs only in the repository README, which contains no stack description or launch instructions. Owner editing controls are hidden from visitors; a discreet Owner sign in link in the footer opens owner sign-in, and `?manage=1` remains a direct route. The owner can edit the title/introduction through Edit intro; no personal identity is filled automatically. Sign out ends only the current browser session. `history/REVIEW.md` records the 2026-09-25 audit; its historical findings should be checked against current code before treating them as open bugs.

For a new session, the user only needs to describe the task. `AGENTS.md` carries the repository workflow automatically; Codex Memory may retain user preferences, but Git and the working tree remain authoritative for code and in-progress changes. When resuming a particular unfinished task in a new thread, state its intended outcome briefly; do not paste the project history.

The October 2026 frontend fixes preserve pending post links through loading failures, protect unsaved posts and contact edits, prevent duplicate sign-in requests, and check post versions on deletion as well as editing. Lists render on demand and reuse unchanged DOM; auth events coalesce reloads. Saving and deleting respect navigation that happens while follow-up reads are pending. The regression suite covers these flows with mocked requests; browser checks use an isolated memory fixture for owner writes.

The October 9 simplification adds bounded SDK/transport/UI waits, preserves retry guards across pages, resets filters between sections, and prevents duplicate inserts after uncertain saves. Site profile updates use the existing UUID owner boundary and version checks. Production Auth quotas and residual limitations are documented in SETUP.md; a browser cooldown or hidden button never replaces server protection.

## Known limitations

- GitHub Pages cannot set all response-level security headers or a custom static cache policy; consider a host change only if those controls are needed.
- `robots.txt` lives at the GitHub Pages project subpath, not the host root.
- Editing and deleting compare post `updated_at` values. Contact saves send only changed platforms, so unrelated fields are not overwritten across tabs; concurrent changes to the same platform remain last-write-wins until a database-backed version check is warranted.
