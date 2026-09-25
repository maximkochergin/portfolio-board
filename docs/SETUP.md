# working on archive

This is the practical companion to the [project introduction](../README.md). The production site is static; Supabase stores posts and contacts, and RLS controls who can read or write them.

## local preview and checks

```text
npm run dev
npm run check
npm test
```

The preview server listens on `http://127.0.0.1:4174/` and serves only the public site files. There is no build step. `npm run check` checks JavaScript syntax; `npm test` covers formatting, editor-state scenarios, preview-server boundaries, metadata policy, and the Supabase keepalive request.

## connect a Supabase project

1. Enable Email authentication in Supabase and create the owner in **Authentication → Users**. The sign-in form does not create new users.
2. For a new database, run [`supabase/schema.sql`](../supabase/schema.sql) in the SQL Editor. For an existing database created before drafts or external links, apply the corresponding files in [`supabase/migrations/`](../supabase/migrations/) in order. Do not re-run the new-project seed against an existing project just to add a feature.
3. Copy the owner's UUID from **Authentication → Users** and set it in the singleton row:

   ```sql
   insert into public.site_settings (singleton, owner_id)
   values (true, 'paste-the-auth-user-uuid-here')
   on conflict (singleton) do update set owner_id = excluded.owner_id;
   ```

4. Set the project URL and its **publishable** key in [`config.js`](../config.js). That key is intentionally public; RLS must protect the database. Never put a `service_role` or other secret key in this repository or the browser.
5. If the Supabase project URL changes, update the exact `connect-src` origin in both [`index.html`](../index.html) and [`serve.mjs`](../serve.mjs). The browser client currently accepts `https://*.supabase.co` project URLs, not a custom domain.
6. Add the final HTTPS site URL to **Authentication → URL Configuration → Redirect URLs**. For local owner sign-in, add `http://localhost:4174` and `http://127.0.0.1:4174` too.

The public board has no sign-in button. Open `http://127.0.0.1:4174/?manage=1` to request an owner sign-in link; on the deployed site use its HTTPS URL with the same `?manage=1` query. The small plus appears only after the session is recognized as the owner. Drafts remain private even when someone knows their direct URL.

The owner can publish or save a draft, edit existing posts, and change the external links through **edit links** at the bottom of the board. Leaving a contact field empty hides its icon. Posts can use `##`/`###` headings, lists, `**strong**`, `*emphasis*`, inline backticks, and fenced code blocks. Raw HTML is displayed as text.

## publish and operate

The [`deploy-pages.yml`](../.github/workflows/deploy-pages.yml) workflow checks the scripts and tests, copies only the public site files, and publishes to GitHub Pages on pushes to `main`. [GitHub Free supports Pages in public repositories](https://docs.github.com/en/pages/getting-started-with-github-pages). The canonical site URL is [`https://maximkochergin.github.io/portfolio-board/`](https://maximkochergin.github.io/portfolio-board/); changing the repository slug also changes Pages, canonical/OG URLs, sitemap, and Auth redirects.

The [`keep-supabase-awake.yml`](../.github/workflows/keep-supabase-awake.yml) workflow uses the same public URL and publishable key as the site to make three read-only database requests per day. It does not use Auth, send email, or write rows. It also schedules a monthly empty commit because [GitHub disables schedules after 60 days of inactivity in public repositories](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule); this adds history noise. Neither GitHub's schedule timing nor [Supabase's free-tier pause policy](https://supabase.com/docs/guides/platform/free-project-pausing) is an uptime guarantee. Check the Actions tab if the database appears paused, and use `workflow_dispatch` for a manual read test.

GitHub Pages forces HTTPS but does not give this repository control over every response security header or cache policy. The page therefore uses a CSP meta policy, while the local preview server can set additional headers. `robots.txt` lives under the project path rather than the host root; submit the sitemap URL directly if indexing matters.
