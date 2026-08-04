---
name: devdeck-design
description: Act as senior product designer on DevDeck's UI — the token-first workflow, the multi-skin constraints that make DevDeck's design system unusual, and the review rubric a UI change has to pass. Use before writing or reviewing any renderer CSS/component work, changing a theme or style, adding a color/size, or judging whether a visual change is on-system.
---

# Designing in DevDeck

DevDeck is a terminal-first cockpit someone lives in for hours. The north star is
**calm over clever** — quiet, legible, fast to scan, never busy. Most UI mistakes
here are *additive*: one more badge, one more color, one more row of chrome. The
job is usually to say no.

## 1. Read the system before touching it

**Always read these first** — in this order — and don't propose a change until you
have:

1. `DESIGN.md` — the contract. Machine-readable tokens in frontmatter, canonical
   rationale in the body. **This is the source of truth**, including the
   active-state grammar and badge-tier tables.
2. `src/renderer/src/themes.ts` — the 7 color themes. Each is a `*_VARS` map that
   re-binds the same token names.
3. `src/renderer/src/styles.css` — `:root` tokens (lines ~7–64), then the
   `[data-style="…"]` blocks, one per style.

## 2. The constraint that makes DevDeck different

DevDeck is **multi-skin by design**: a *theme* (color) and a *style*
(shape/depth/type) are independent, swappable axes, and both re-bind the same
tokens. That means **7 themes × 12 styles = 84 combinations**, and a change that
looks right in Slate + Modern Pro can be invisible or broken in Washi + Bauhaus.

Practical consequences, all of which are easy to get wrong:

- **A hard-coded color or size is a bug**, not a shortcut — it survives the theme
  switch and becomes the one element that doesn't change.
- **Never encode state in color alone.** Themes recolor everything; only *form*
  (dot, pill, stripe, underline, glyph, icon) survives all 84 combinations. See
  DESIGN.md's active-state grammar for which form axis belongs to which kind of
  active — they're deliberately not interchangeable.
- **There is no warning/attention color token, on purpose.** The default accent is
  amber, so "attention amber" would collide with brand/active/focus. If you find
  yourself wanting a warning color, you want a *form* marker instead. DESIGN.md's
  Colors section explains this; don't relitigate it.
- **One accent on screen.** The accent means *you can act here*. Spending it on
  non-interactive decoration (a quote border, a divider, a static label) dilutes
  the only signal that tells the eye where to go.
- **Check the style overrides before editing a base rule.** Grep for the selector
  across `[data-style=...]` blocks first — several styles override active tabs,
  cards, and panes with their own idiom, and a base change may be dead code in
  half of them (or double up).

## 3. Change the token, not the element

The workflow, in order:

1. Find the token that already governs the thing (`--accent`, `--border-strong`,
   `--row-py`, `--radius`, `--elev-2`, `--dur`, …).
2. If a token exists, change *it* and let the cascade apply — never tweak spacing
   or shape on one element.
3. If no token exists, **look for an existing idiom before inventing one.** e.g.
   `inset 0 -2px 0 var(--accent)` was already the underline idiom in three styles
   before it became the base rule; promoting an existing pattern beats adding a
   token.
4. Only then add a token — and add it to `:root` plus every theme that needs to
   differ, not just the one you're looking at.

Spacing is a fixed scale — **xs 4 · sm 8 · md 12 · lg 16 · xl 24 · 2xl 32**. Radii
step **sm 6 · md 8 · lg 12**. No values in between.

Type: **Inter for chrome, Geist Mono for content.** Within a row, sans for names
and mono for machine-readable values (branch, path, token count, percentage).
Don't set chrome in mono — it costs 15–20% label width, which is the wrong trade
on a Windows-density cockpit.

## 4. Review rubric

A UI change ships only if all of these hold:

- [ ] No hard-coded hex, px size off-scale, or one-off radius — tokens only.
- [ ] State is shown in **form**, not color alone; the form axis matches
      DESIGN.md's grammar (stripe = container, underline = document tab,
      tint = segment, border+dot = focused pane).
- [ ] Exactly **one accent** in the frame, and it marks something actionable.
- [ ] Checked against the `[data-style=...]` overrides for the same selector.
- [ ] Motion (if any) uses `--ease`/`--dur*` and is disabled under
      `prefers-reduced-motion`.
- [ ] Icons come from `components/Icon.tsx` (24 grid, 1.75 stroke,
      `currentColor`). **No Unicode glyphs or emoji in chrome.**
- [ ] `npm run typecheck` is at **zero errors** — the build does not typecheck, so
      nothing else catches this.
- [ ] `npm test` passes.
- [ ] Verified in the real app via the **`run-app` skill** in at least a dark and a
      light theme (Slate + Washi), because there is no headless renderer. A React
      render loop is invisible to both build and typecheck — only running catches
      it.
- [ ] `DESIGN.md` updated if the change alters the contract — and it must describe
      what the code *actually does*. A DESIGN.md claim the code doesn't honor is
      worse than no claim, because it gets cited as precedent.

## 5. Additive pressure — the default answer is no

Before adding a badge, pill, counter, ring, or chrome row, ask what it *replaces*.
A deck key already carries a status dot, an agent badge, and an attention glyph;
a fourth signal on a ~24px row makes all four harder to read, not the new one
easier. Density has a ceiling and DevDeck is near it in the places that matter.

If a competitor or reference does something DevDeck doesn't, the useful question
is never "how do we match it" — it's "does this survive 84 skins, and what does
it cost the calm". Frequently the honest answer is that their version works
because their accent is blue, or because they set everything in mono, and the
pattern doesn't port.
