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
- The owner supplied the public identity: Maxim Kochergin, Software Engineer - DevOps. The role is displayed with a neutral arrows-left-right mask instead of a text dash. Do not invent personal links.

## Current state

The site is published at `https://quipmug.github.io/portfolio-board/`. The October 15 redesign uses neutral monochrome light and dark themes selected by `prefers-color-scheme`, local Geist and Fragment Mono fonts, a larger quiet site title, and three supporting text sizes. Preserve the text-first layout, no cards, noise textures or heavy motion, and no clock or greeting. Projects / Notes / About use vertical desktop tabs, horizontal mobile tabs, a moving active dot with a static CSS fallback, single-column previews, and an optional filter for sections with six or more entries. Motion is limited to opacity and transform; reduced motion disables it. `assets/motion.js` adds progressive enhancement around the existing entry navigation without changing data loading or owner operations. Fonts and the pinned Supabase browser bundle load locally; `assets/THIRD_PARTY.txt` records their sources and licenses. CSP permits only local scripts, styles, fonts and images, with the exact Supabase connection origin. The obsolete inline JSON-LD was removed in the final visual update. Contacts are near the introduction. Neither the portfolio nor the README contains inspiration credits; the README contains no stack description or launch instructions. Owner editing controls are hidden from visitors; a discreet Owner sign in link in the footer opens owner sign-in, and `?manage=1` remains a direct route. The owner can edit the title/introduction through Edit intro; no personal identity is filled automatically. Sign out ends only the current browser session. `history/REVIEW.md` records the 2026-09-25 audit; its historical findings should be checked against current code before treating them as open bugs.

For a new session, the user only needs to describe the task. `AGENTS.md` carries the repository workflow automatically; Codex Memory may retain user preferences, but Git and the working tree remain authoritative for code and in-progress changes. When resuming a particular unfinished task in a new thread, state its intended outcome briefly; do not paste the project history.

The October 2026 frontend fixes preserve pending post links through loading failures, protect unsaved posts and contact edits, prevent duplicate sign-in requests, and check post versions on deletion as well as editing. Lists render on demand and reuse unchanged DOM; auth events coalesce reloads. Saving and deleting respect navigation that happens while follow-up reads are pending. The regression suite covers these flows with mocked requests; browser checks use an isolated memory fixture for owner writes.

The October 9 simplification adds bounded SDK/transport/UI waits, preserves retry guards across pages, resets filters between sections, and prevents duplicate inserts after uncertain saves. Site profile updates use the existing UUID owner boundary and version checks. Production Auth quotas and residual limitations are documented in SETUP.md; a browser cooldown or hidden button never replaces server protection.

## Interaction update

The October 16 interaction update keeps Geist on all controls and links, with Fragment Mono reserved for entry dates, metadata and captions. Local Phosphor Light masks provide persistent link indicators and touch row arrows. Layout starts at 320px; tabs become vertical at 768px. Owner dialogs become scrollable bottom sheets below that breakpoint. `assets/fx.js` adds guarded scroll reveals and optional fine-pointer cursor, magnetic links and list spotlight effects; reduced motion disables them. CSSOM property writes are explicitly authorized for effect coordinates, while inline style markup and `setAttribute('style')` remain prohibited. Do not add new client origins or change the data/owner routing for visual work.

## Known limitations

- GitHub Pages cannot set all response-level security headers or a custom static cache policy; consider a host change only if those controls are needed.
- `robots.txt` lives at the GitHub Pages project subpath, not the host root.
- Editing and deleting compare post `updated_at` values. Contact saves send only changed platforms through `save_external_links`; the server compares the URLs the owner reviewed and rejects the entire batch on a conflict. The October 12 regression checks also cover early sign-in, delayed editors, keyboard navigation, focus restoration, and URL expansion beyond the database length limit.

## Contact and dialog refinement

Header contacts are wrapping 44px pills with Phosphor Light masks selected by href in CSS. A bottom-up neutral fill inverts focused, pressed, or hovered pills; touch gets only press feedback. The cursor ring stays at 40px over contacts, and magnetic movement is preserved. External-link arrows have been removed; entry row arrows remain. Owner sign-in uses a small lock mask. All owner dialogs share 16px corners, neutral blurred backdrops, 48px fields and full-width primary actions, with bottom-sheet geometry on phones. Busy indicators follow existing aria-busy states; alert masks reuse existing error nodes. No data or auth behavior changes.

Fragment Mono Latin 400 replaces Geist Mono after a temporary local comparison against Martian Mono and Sometype Mono at 12–13px in both themes. Fragment was chosen for its compact width and small-size clarity next to Geist. Only the selected WOFF2 and its upstream OFL-1.1 license are shipped. Eyebrows, previews and operational labels use Geist.

## Final visual update

The interface uses a 15.2px root scale and rem/em layout units; touch targets remain at least 44px, mobile fields remain 16px, and metadata stays at least 12px. The 65ch reading column is unchanged. Fixed pixel pointer geometry and hairlines are deliberate exceptions.

`assets/theme-init.js` is an external blocking head script that applies a valid persisted theme before CSS paints. `assets/theme.js` cycles system/light/dark, stores only explicit choices under `theme`, syncs storage events, follows live system preferences, and updates browser metadata. Storage failures fall back to a working in-page choice. No runtime CDN or inline scripts are used.

Contact pills use a single background-size fill and inset outline, not a transformed overlay or active scale. Magnetic offsets are quantized to half pixels and applied with translate3d without a transform transition on pills. Icons use rounded whole-pixel em dimensions. This removes the separate curved layers and fractional interpolation that produced edge artifacts.

The static brand and profile fallback are quipmug. The legacy Supabase title archive is mapped to quipmug for display only. Other custom titles and the editable source value stay intact. No production data is changed for this redesign. The supplied identity is displayed under the brand in the top header, with a Phosphor connector between the two role labels. The footer has returned to its original discreet Owner sign in link, with no large signature, divider, or Back to top link.

The root favicon.svg is theme-aware; assets/brand/q-mark.svg is its reusable geometric source. favicon-32.png and apple-touch-icon.png are local raster fallbacks. assets/brand/cover.html and cover.css are the source for the 1672x941 sharing image, rendered with local Geist; a Phosphor arrows-left-right mask connects the two role labels. Root icon files are explicitly allowed by the preview server and included in the Pages artifact. Only the inert SVG favicon response permits its exact embedded theme stylesheet by hash; HTML pages retain self-only external styles and scripts.

The owner approved updating only the preview test's two old archive title expectations and replacing its obsolete inline JSON-LD expectation with local-script/CSP and brand metadata checks. The remaining test contracts are unchanged.

## Identity placement correction

The owner clarified that the identity belongs at the top, replacing the archive block entirely. The bottom returns to its earlier minimal footer. Use the refined 15.2px root scale (a 5% reduction from the original 16px), retain the working theme controls and stable pill surfaces, and keep Projects / Notes / About, Supabase operations and editable intro intact. Display-only title mapping is shared by the header, entry titles and unavailable-entry titles; no production database changes or manual rename are needed.
