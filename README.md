# portfolio board

![a small outlined square on warm paper](./assets/images/portfolio-cover.png)

> a small personal archive for work, notes, and quiet progress.

This is deliberately a small static site. The public page reads from Supabase. Publishing, editing, and deleting are limited to one authenticated owner by row-level security. The owner can save private drafts; visitors only receive published posts.

## connect Supabase

1. In Supabase, enable Email authentication and create the owner in Authentication → Users. The site's sign-in form deliberately cannot create new users.
2. Open the SQL Editor and run [supabase/schema.sql](./supabase/schema.sql).
3. In Authentication → Users, copy that user's UUID. Then run this once in the SQL Editor:

       insert into public.site_settings (singleton, owner_id)
       values (true, 'paste-the-auth-user-uuid-here')
       on conflict (singleton) do update set owner_id = excluded.owner_id;

4. Fill in config.js with the project URL and the public publishable key. The publishable key is safe to use in a browser because the database policies above enforce access.
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

For GitHub Pages, the included `deploy-pages.yml` workflow copies only the static site into the deployment artifact. On GitHub Free, the repository must be public. After enabling Pages with GitHub Actions as its source, the site will be available at `https://maximkochergin.github.io/portfolio-board/` and every push to `main` will publish an update.

## structure

    index.html              the page
    404.html                fallback page for missing routes
    robots.txt              crawler rules and sitemap link
    sitemap.xml             canonical public URL
    styles.css              visual system
    site.js                 UI, auth, and Supabase calls
    assets/ambient.js       arrival animation and visitor-local clock
    config.js               project connection settings
    supabase/schema.sql     database and access rules for a new project
    supabase/migrations/    safe upgrades for a connected project

No production server, local database, or framework is required.

The arrival lettering uses Pencerio by Indian Type Foundry, supplied under the included [ITF Free Font License](./assets/fonts/FFL.txt). The clock uses a system sans-serif font. It reads the browser's local time zone without requesting location and saves only the hide/show preference in that browser.

## security

The page uses a restrictive content security policy, a pinned and integrity-checked Supabase browser client, safe rendering for post text, and database-enforced owner access. `npm run check` validates the site scripts, and `npm test` checks that the local preview does not serve repository files or break the metadata policy. Both run before GitHub Pages deployment.

The browser never contains a Supabase service-role key. Do not add one later. GitHub Pages forces HTTPS and the page includes a CSP meta tag, but Pages does not let this project set every response security header or custom cache policy. The `robots.txt` file is at the project subpath rather than the host root, so submit the sitemap URL directly to a search engine if indexing matters. A host with configurable response headers and a custom domain would close those hosting-level gaps; add its exact HTTPS URL to Supabase Authentication → URL Configuration.
