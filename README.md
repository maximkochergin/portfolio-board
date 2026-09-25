# archive

![An illustration of the live archive: a warm paper board with three sections and a small row of line-drawn contact icons.](./assets/images/readme-board.svg)

[visit the live archive](https://maximkochergin.github.io/portfolio-board/)

`archive` is a personal portfolio and notebook. Work belongs beside the notes behind it, with a little room for context in **about**. The board is deliberately quiet: a visitor sees titles first, then opens a piece to read it. It gives a potential employer a direct route from a title to the work behind it, without pretending that a growing portfolio is already finished.

The three sections are **work**, **notes**, and **about**. Published entries have their own URLs and a plain-text copy-link action; the search looks through titles and post text. Contact links sit outside the post list as a small set of monochrome, hand-drawn SVG icons. They lead straight to the external profile, and the owner can change them without redeploying the site.

## quiet on the surface, deliberate underneath

The frontend is static HTML, CSS, and vanilla JavaScript. There is no framework, build step, or production server. The paper-like square stays the center of the interface; the local-time clock and letter-by-letter greeting live around it. Keyboard focus, screen-reader status messages, reduced-motion preferences, and a styled 404 page are part of the same design rather than separate add-ons.

Supabase holds the posts and external links. Email-link sign-in exposes the editor only to the owner, while database row-level security is the actual boundary: visitors can read published posts, not drafts, and cannot write. Post text is rendered as text and a small safe formatting subset, never as arbitrary saved HTML. The client uses a public publishable key, a restrictive CSP, and a pinned, integrity-checked Supabase script; no privileged database key belongs in the browser.

The editing flow accounts for ordinary failures. A temporary access-check error does not erase unsaved writing; a stale tab cannot silently overwrite a newer post; and a failed refresh keeps the last known content visible. Contact edits send only fields that changed. These are small safeguards for a site meant to be updated over time, not claims that every network or browser failure is impossible.

## made to live on a small budget

GitHub Pages serves an explicit set of static files. GitHub Actions runs the syntax checks and tests before each deployment. A separate scheduled action makes three small, anonymous, read-only Supabase requests per day in an attempt to reduce free-tier inactivity pauses. GitHub schedules can be delayed or disabled, and [Supabase does not guarantee](https://supabase.com/docs/guides/platform/free-project-pausing) that a fixed number of requests prevents a pause; this is a best-effort measure, not an uptime promise.

To inspect the site locally:

```text
npm run dev
npm run check
npm test
```

The local preview opens at `http://127.0.0.1:4174/`. Database setup, owner access, migrations, and deployment details are in [the setup notes](./docs/SETUP.md). The [technical review](./REVIEW.md) and [UI/UX review](./UI_UX_AUDIT.md) record earlier snapshots of the project, not a current list of unresolved issues.

The greeting uses [Pencerio by Indian Type Foundry](./assets/fonts/FFL.txt); the clock uses a system sans-serif face. The cover above is a line-drawn interpretation of the deployed board, including its honest empty state, rather than a mock portfolio entry.
