# Repository guidance

- This file is loaded for work in this repository; the user does not need to repeat these rules in each prompt. For a narrow change, inspect only the relevant files. Read `PROJECT_CONTEXT.md` for broad or architectural work, `README.md` for setup/deployment, and the SQL schema/migrations when changing Supabase.
- Before editing, inspect `git status` and the relevant diff. Preserve staged, untracked, and modified work that predates the current task. Stage only files changed for the requested task; never use `git add -A` as a shortcut.
- Keep changes focused and follow the static HTML/CSS/vanilla JS architecture and Supabase RLS boundary. Avoid new dependencies or abstractions unless needed.
- The user prefers finished implementation work to be checked, committed, and pushed to the configured GitHub branch. Apply this to requested code changes, except advice/review-only tasks or when the user limits the scope. Keep commits task-scoped, never force-push, and do not include unrelated existing changes. A push to `main` deploys GitHub Pages; verify its workflow before saying deployment finished.
- Never put Supabase service-role or secret keys in client files. Treat live Supabase data/settings as production: change them only when the task explicitly asks for that change; get confirmation before destructive data changes.
- After relevant code changes, run `npm run check` and `npm test`. There is no build, lint, or typecheck script currently defined.
