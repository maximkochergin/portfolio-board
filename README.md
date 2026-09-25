# archive

[visit the live site](https://maximkochergin.github.io/portfolio-board/)

A small personal archive for work, notes, and quiet progress. The page is intentionally minimal: visitors can browse published posts, search, open direct links, and use external contact links. The owner can write posts, keep private drafts, and edit contacts through a protected interface.

The frontend is plain HTML, CSS, and JavaScript on GitHub Pages. Supabase stores content and enforces owner access through row-level security. There is no production server or build step.

## connect Supabase

1. In Supabase, enable Email authentication and create the owner in Authentication → Users. The site's sign-in form deliberately cannot create new users.
2. Open the SQL Editor and run [supabase/schema.sql](./supabase/schema.sql).
3. In Authentication → Users, copy that user's UUID. Then run this once in the SQL Editor:

       insert into public.site_settings (singleton, owner_id)
       values (true, 'paste-the-auth-user-uuid-here')
       on conflict (singleton) do update set owner_id = excluded.owner_id;

4. Fill in config.js with the project URL and the public publishable key. The publishable key is safe to use in a browser because the database policies above enforce access. If you use a different Supabase project, also update the exact `connect-src` origin in `index.html` and `serve.mjs`; otherwise CSP will block the connection. The current client accepts `https://*.supabase.co` project URLs, not custom domains.
5. In Authentication → URL Configuration, add the final site URL to Redirect URLs. For local testing, add http://localhost:4174 and http://127.0.0.1:4174.

If the project was connected before the draft feature, run [supabase/migrations/20260923143253_add_post_status_and_search.sql](./supabase/migrations/20260923143253_add_post_status_and_search.sql) once in the SQL Editor instead. It preserves existing posts, marks them as published, and restricts public reads to published posts.

Do not put the service role key in this project or in the browser.

## publish

The project has no build step. Upload these files to any static host, then keep config.js alongside index.html.

    npm run dev
    npm run check
    npm test

The public board has no sign-in button. To manage it locally, open `http://127.0.0.1:4174/?manage=1`, enter the owner's email, and use the sign-in link. Once the session belongs to the owner UUID stored in Supabase, the small plus appears. The composer offers `save draft` and `publish`; drafts stay private even when somebody knows their direct URL. After deployment, replace this address with the final HTTPS site URL and add it to Supabase Redirect URLs.

The owner can also use `edit links` at the bottom of the board to change the public contact icons. Empty fields hide a profile; no edit requires a new deployment. For an existing Supabase project, apply [the external links migration](./supabase/migrations/20260925100043_add_external_links.sql) once before deploying this version. Visitors can read only filled-in links; only the owner can change them.

Post bodies can use a small text-only formatting subset: `##` and `###` headings, `-` or numbered lists, `**bold**`, `*emphasis*`, backtick inline code, and triple-backtick code blocks. Raw HTML is always shown as text, not executed. Existing plain-text posts remain readable.

Opening a published post updates the browser tab title. Its `copy link` action copies the canonical public URL without an owner-only `?manage=1` query string. Drafts do not show the share action because visitors cannot read them.

For GitHub Pages, the included `deploy-pages.yml` workflow copies only the static site into the deployment artifact. On GitHub Free, the repository must be public. After enabling Pages with GitHub Actions as its source, the site will be available at `https://maximkochergin.github.io/portfolio-board/` and normal pushes to `main` will publish updates.

The `keep-supabase-awake.yml` workflow makes three small, anonymous, read-only database requests per day, using the same public URL and publishable key as `config.js`. It does not use Auth, send email, or modify database rows. GitHub can delay or drop scheduled runs, and Supabase does not guarantee that any fixed amount of activity prevents Free Plan pausing. Since GitHub disables schedules in inactive public repositories after 60 days, the workflow also creates one empty commit on `main` each month. This does not change the site or trigger the Pages workflow. Failed runs are visible in the repository's Actions tab; `workflow_dispatch` allows a one-off manual test.

## structure

    index.html              the page
    404.html                fallback page for missing routes
    robots.txt              crawler rules and sitemap link
    sitemap.xml             canonical public URL
    styles.css              visual system
    site.js                 UI, auth, and Supabase calls
    assets/ambient.js       arrival animation and visitor-local clock
    assets/post-format.js   safe text-only post formatting
    config.js               project connection settings
    supabase/schema.sql     database and access rules for a new project
    supabase/migrations/    safe upgrades for a connected project

No production server, local database, or framework is required.

The dated [technical review](./REVIEW.md) and [UI/UX review](./UI_UX_AUDIT.md) are historical snapshots, not a list of currently open issues.

The arrival lettering uses Pencerio by Indian Type Foundry, supplied under the included [ITF Free Font License](./assets/fonts/FFL.txt). The clock uses a system sans-serif font. It reads the browser's local time zone without requesting location and saves only the hide/show preference in that browser.

## security

The page uses a restrictive content security policy, a pinned and integrity-checked Supabase browser client, safe rendering for post text, and database-enforced owner access. `npm run check` validates the site scripts, and `npm test` checks that the local preview does not serve repository files or break the metadata policy. Both run before GitHub Pages deployment.

The browser never contains a Supabase service-role key. Do not add one later. GitHub Pages forces HTTPS and the page includes a CSP meta tag, but Pages does not let this project set every response security header or custom cache policy. The `robots.txt` file is at the project subpath rather than the host root, so submit the sitemap URL directly to a search engine if indexing matters. A host with configurable response headers and a custom domain would close those hosting-level gaps; add its exact HTTPS URL to Supabase Authentication → URL Configuration.
