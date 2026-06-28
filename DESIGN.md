# DevDeck — Design Brief

This file is how I (the human) tell Claude how to act as DevDeck's **product
designer**. Claude reads it before any visual/UI work. Plain words are fine —
describe taste and intent; Claude turns it into tokens and code.

> Pointer to add in `CLAUDE.md`: *"For any UI/visual work in DevDeck, act as a
> senior product designer and follow `DESIGN.md`."*

---

## North star

Ease of use first, calm over clever. DevDeck is a terminal-first cockpit you
live in for hours — it should feel quiet, legible, and fast to scan, never busy.

## The five dials (vocabulary)

A "style" is more than color. When I ask for a look, these are the knobs:

1. **Corner radius** — hard edges (0) ↔ soft cards (12px)
2. **Border weight** — hairline ↔ bold drawn-in lines
3. **Depth** — flat · soft shadow · neon glow
4. **Typography** — geometric caps · rounded sans · all-mono · humanist
5. **Density & color** — calm restrained neutrals ↔ punchy primaries

## Current direction

- **Design styles (selectable, Settings → Appearance):**
  - **Wabi-sabi** (default) — warm, soft, generous; hairline borders, soft depth.
  - **Modern Minimal** — crisp small radii, flat surfaces, tighter spacing/type.
  - **Neon** — glassy panels, glowing accents, scanlines (glow uses the accent;
    best on a dark theme with a cyan accent).
- **Color themes within any style:** sumi (dark), washi (light), zen (dark).
- Style × theme are independent (e.g. "Modern Minimal + zen dark").

## Do

- One accent color carrying the eye; semantic colors (ok/warn/danger) are
  separate from the accent.
- Generous line-height in the terminal; tabular numerals where digits align.
- State shown in *form* as well as color (a dot/pill/stripe), not color alone.
- Match the existing system in `themes.ts` and `styles.css` before inventing new
  tokens.

## Don't

- No gratuitous gradients, no emoji as section markers, no everything-centered.
- Don't let decoration fight legibility. If a flourish costs scan-speed, cut it.
- Don't change spacing/shape ad hoc — change the token, let the cascade apply it.

## References I like

- _(add screenshots / product names here — e.g. "Linear settings", "Warp")_

## How styles are implemented (for Claude)

Extend the existing theme system rather than replacing it: a **Design Style**
sets shape/type/depth tokens (radius, border width, shadow, font stack, density,
letter-spacing); the three **color themes** still switch *within* the active
style. Style + theme are independent dropdowns in Settings → Appearance.
