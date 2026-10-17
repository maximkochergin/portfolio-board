# Project context

## Purpose and architecture

A minimalist English-language personal portfolio and notes board, published at https://quipmug.github.io/portfolio-board/. Visitors browse Projects, Notes and About; one owner manages entries, private drafts, contacts and the introduction through Supabase.

- Static HTML, CSS and vanilla browser JavaScript; no application framework or production server.
- index.html contains the stable application and owner-dialog hooks. styles.css defines the visual system.
- site.js owns data loading, routes, filters, authentication and owner operations. Its original metadata formatter has a small presentation wrapper to show the existing published date in all three sections; date format and Draft text are preserved.
- config.js holds the public Supabase URL and publishable key. RLS and the UUID owner check remain the security boundary; hidden controls never grant permissions.
- serve.mjs is a loopback preview server with an explicit public-file boundary. GitHub Actions checks the code and deploys the static allowlist on pushes to main.

## Current visual system

The October 17 revision uses a centered reading column of approximately 530px, 23px mobile gutters and a 13.5px root size. Local Inter is the only shipped font. The interface remains neutral monochrome, with system/light/dark modes, readable secondary text, 44px touch controls and 16px mobile form fields. Dates, counters and the Kyiv clock use tabular numerals.

The header contains a small quipmug home/top link and theme control. The existing editable introduction appears as prose above wrapping, underlined text links without icons, pills or animated fills. Projects / Notes / About remain horizontal at every breakpoint, with a six-pixel active dot below the label. Compact lists show titles and dates with subtle separators; entry bodies retain formatting and native history navigation. Owner dialogs remain scrollable bottom sheets on phones.

The footer has a compact signature: Maxim Kochergin above quipmug, then Software Engineer and DevOps joined by an interactive infinity mark, followed by small crypto, AI, tech and trading interests. Kyiv time and the small Tabler ghost sit below. There is no divider, full-width rail or Back to top control. The header brand remains the top shortcut. The introduction remains owner-controlled; no production content was overwritten.

## Time and character

- assets/local-time.js exports pure browser/CommonJS helpers. TIME_ZONE, its legacy fallback and LOCATION_LABEL live here. Intl resolves Europe/Kyiv (fallback Europe/Kiev) with daylight-saving changes. Display uses a 12-hour clock, for example 3:25 PM in Kyiv, Ukraine; internal hours and datetime remain 24-hour values.
- assets/footer-init.js runs synchronously before CSS to select the initial ghost face and expose the direct manage route. Without JavaScript the clock stays hidden and the daytime face remains visible.
- assets/footer.js updates the clock, face and English ARIA label together at minute boundaries, pauses while hidden and resynchronizes on return. The character gives one short greeting per click and cancels long presses on movement or scrolling. It has no idle animation timers.
- Ghost scenes follow Kyiv time: night 23:00–05:59, morning 06:00–10:59, day 11:00–17:59, evening 18:00–22:59. The original body stays the same; waking, cheerful, relaxed and sleeping faces fade between states.
- A strict 24-hour ?time=HH:MM query previews both the clock and face. It composes with ?manage=1 and hash routes. A preview datetime is a valid time of day; the real clock uses a full timestamp with its Kyiv offset.
- Reduced motion disables the greeting while preserving long-press access.

The unchanged 581-byte Tabler ghost-2 SVG and three face adaptations are served locally as currentColor CSS masks. Their MIT license and pinned source are recorded in assets/THIRD_PARTY.txt. Only transforms and opacity animate, with theme color transitions as the existing exception.

## Owner access and data boundary

Owner sign-in is hidden from ordinary visitor display, accessibility and keyboard navigation by CSS. The original #owner-access element stays in the DOM. The ?manage=1 route and recognized owner state expose it. Holding the small ghost for 800ms invokes its existing click handler; it does not duplicate authentication logic or bypass access checks. README describes both entry paths.

Public reads, private drafts, all five dialogs and existing write/conflict guards remain intact. Production data/settings are not changed for visual work. Never ship a service-role or secret key. Sign-out ends only the current browser session. Owner writes use RLS, version comparisons and the existing save_external_links conflict check.

SDK/transport/UI waits are bounded. New-entry retries reuse a UUID after uncertain writes. Unsaved entry/contact/profile changes retain unload/discard guards. Regression tests cover failures, late replies, cooldowns, conflicts, deep links and focus restoration; interactive owner QA uses an isolated browser-memory fixture without production writes or email sends.

## Progressive enhancement and assets

assets/theme-init.js applies persisted preferences before paint. assets/theme.js preserves live system mode, storage synchronization and theme metadata. All storage access is guarded.

assets/navigation.js maintains horizontal keyboard tabs and a concise Back presentation. assets/motion.js measures the dot on selection, font/viewport changes and orientation changes while preserving View Transitions. assets/fx.js retains optional pointer code behind a single effects object: cursor, magnet and spotlight default false; reveal defaults true. Default pointer effects create no nodes/listeners; content and footer reveal remain guarded and fail open. The real cursor and reduced-motion behavior stay native.

Fonts, icons and the pinned Supabase bundle are local; assets/THIRD_PARTY.txt records their provenance. CSP permits only local scripts/styles/fonts/images, with the exact existing Supabase connect origin. No inline script/style blocks or style attributes are introduced. Only the inert favicon has a separately hashed embedded theme stylesheet in the preview response.

## Checks and limits

Run npm run check and npm test. Pure tests cover AM/PM at midnight and noon, daylight-saving transitions, strict overrides, the zone fallback, all scene boundaries and shared early initialization. Preview tests request the Inter asset and expect the visible project date.

Browser QA covers both themes, 320/360/390/430/768/1280/1920 and phone landscape, touch long press, owner flows and route restoration. Physical mobile Safari/Android hardware remains a separate manual check.

GitHub Pages provides HTTPS but cannot configure every response-level security header or cache policy. robots.txt lives at the project subpath. Server Auth quotas and operational setup remain documented in SETUP.md; browser cooldowns and hidden entry points do not replace server protections. Historical audits under docs/history describe earlier versions and are not current design instructions.
