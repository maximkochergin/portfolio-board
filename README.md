# portfolio board

![a small outlined square on warm paper](./assets/images/portfolio-cover.png)

> a small personal archive for work, notes, and quiet progress.

This is deliberately a small static site. The public page reads from Supabase. Publishing, editing, and deleting are limited to one authenticated owner by row-level security.

## connect Supabase

1. In Supabase, enable Email authentication and create a user by signing in once with the email you want to own the site.
2. Open the SQL Editor and run [supabase/schema.sql](./supabase/schema.sql).
3. In Authentication → Users, copy that user's UUID. Then run this once in the SQL Editor:

       insert into public.site_settings (singleton, owner_id)
       values (true, 'paste-the-auth-user-uuid-here')
       on conflict (singleton) do update set owner_id = excluded.owner_id;

4. Fill in config.js with the project URL, the public anon key, and your owner email. The anon key is safe to use in a browser because the database policies above enforce access.
5. In Authentication → URL Configuration, add the final site URL to Redirect URLs. For local testing, add http://localhost:4173.

Do not put the service role key in this project or in the browser.

## publish

The project has no build step. Upload these files to any static host, then keep config.js alongside index.html.

    npm run dev
    npm run check

Use the quiet owner access link in the lower-left corner to receive a sign-in link. Once the session belongs to the configured owner UUID, the small plus appears and can publish to Supabase.

## structure

    index.html              the page
    styles.css              visual system
    site.js                 UI, auth, and Supabase calls
    config.js               project connection settings
    supabase/schema.sql     database and access rules

No server, local database, or framework is required.
