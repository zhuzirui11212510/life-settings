# Life Settings 3.1 — interface refresh

## Direction

Reviewed the UI UX Pro Max source at https://github.com/nextlevelbuilder/ui-ux-pro-max-skill on 2026-11-12. Its education/classroom design-system search recommended Minimalism & Swiss Style. Applied its hierarchy, interaction, accessibility and responsive guidance; retained this project's warm ivory/terracotta identity rather than adopting its generic pink palette. No skill executables, external font/CDN requests or runtime dependencies were added to the app.

- Ivory canvas, charcoal headings, terracotta actions and selected states.
- Shared spacing, corner radius, typography and semantic color tokens.
- Local SVG settings mark and matching favicon.
- Responsive form, cards, presenter console and projection layout, with 374/767/1024/1440 CSS breakpoints.
- Audience shortcuts to all four settings, with explicit EDIT/LOCKED labels and a four-segment unlock indicator.
- Sticky presenter invite panel on desktop; regular document flow on phones.
- Fixed presenter refresh/resume: a stored host key now reopens the console instead of falling through to the audience entry form.
- Keyboard skip link, visible focus and restoration of button focus through autosave/poll renders.
- Primary actions and options use at least 44px heights; text inputs use 16px text; safe areas and reduced motion are respected.
- Existing locked defaults, save-on-tap behavior, statistics, host authority and number-only lottery remain in place.

## Validation

Passed:

- `npm run check` and `git diff --check`.
- `npm test` after installing development dependencies (`npm ci`); the regression suite uses mocked API responses and does not start a server.
- DOM integration checks with jsdom: locked options absent, four anchor destinations, unlock indicators, autosave, focus restoration, confirmation, presenter and projection rendering; no DOM runtime errors.
- Main text/ivory contrast: 13.18:1; muted/card: 5.83:1; white/action: 5.94:1; selected text/surface: 7.64:1.

Not yet verified:

- Real-browser rendering, overflow at each viewport, mobile Safari/WeChat, actual image download and end-to-end network behavior. The execution environment denied browser-process launch and the shared browser disallowed local-file navigation. DOM checks do not establish visual correctness.

Before classroom use, review 320, 375, 390, 768, 1024 and 1440px widths plus landscape and increased text size, then test joining, unlock, tap-to-save, predictions, image generation and lottery in a disposable room.

## Apply to the existing BaoTa server

This release changes front-end files only. Back up and replace these files under `/www/wwwroot/life-settings/public/`:

- `life.html`
- `life.css`
- `life.js`
- `favicon.svg`

The HTML asset URLs use `v=3.1` to refresh previous browser caches. No database migration or Node process restart is needed for this front-end-only update. Keep runtime data and host-key exports private. GitHub source changes do not automatically update the RainYun server.
