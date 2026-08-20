# Design — AI 工具站 (ai-tool-station)

A locked design system for this app. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

Reference: clean / professional utility-SaaS aesthetic (storyboard-video.com).
Goal: modern, calm, obviously-not-AI-generated. No gradients, no glow, no heavy
shadows, no emoji icons in chrome, no decorative blobs.

## Genre

modern-minimal

## Macrostructure family

- App pages: **Workbench** — left rail (180px, light) + top bar (hairline) +
  white content column. Variation knobs: hero (dashboard) vs header+form (tool).
- Marketing pages: untouched by this system (marketing.css owns them).

## Theme

- `--color-paper`   #ffffff
- `--color-paper-2` #f7f8fa   (sidebar / subtle fills)
- `--color-ink`     #111827
- `--color-ink-2`   #4b5563
- `--color-rule`    #e5e7eb   (1px hairline)
- `--color-accent`  #2563eb   (used ≤ 5 % of any viewport)
- `--color-focus`   #2563eb

The accent is a point accent, never a wash: active nav state, primary CTA,
icon glyphs, small tags. Cards are white-on-white, delineated by hairline
borders — not shadows, not tinted panels.

## Typography

- Display / Body: system-ui stack (`-apple-system`, Segoe UI, Roboto, PingFang SC, …)
- Mono: ui-monospace stack — reserved for route bar, SRT/pre output, small labels
- Body size: 13.5px / 1.6 line-height
- Weights: 500/600 for emphasis, 700+ only for page-level titles
- No italic headings anywhere

## Spacing

4-point scale in `tokens.css`. Pages use named tokens (`var(--space-md)`),
never raw values. Content column is left-aligned, not centered, with generous
horizontal padding (32px) and vertical rhythm (24–32px between blocks).

## Motion

- Easings: `cubic-bezier(0.16, 1, 0.3, 1)` (out)
- Reveal pattern: none — no scroll-triggered animation
- Interactions: 150ms color / border-color transitions only. No `translateY`
  hover lifts, no scale. Reduced-motion: transitions collapse automatically
  (they are already non-layout).

## Microinteractions stance

- Silent success. Errors render as an inline bordered alert, not a toast.
- Focus ring: 2px accent outline + soft ring on inputs; instant, never animated.
- Button hover: darken the fill (primary) or strengthen the border (default).

## CTA voice

- Primary CTA: accent fill, white text, 8px radius, ~32px tall, label = verb.
- Secondary CTA: hairline border, transparent fill, ink text.
- Buttons are compact; no giant gradient call-to-action blocks in the app area.

## Per-page allowances

- App pages MUST NOT use enrichment or imagery — function carries the page.
- The dashboard hero is typographic only: kicker + display headline + lede + CTA.

## What pages MUST share

- The sidebar wordmark and its light-rail treatment.
- The accent colour `#2563eb` and its placement (active, CTA, icons).
- The hairline-border card language (1px `#e5e7eb`, 10px radius, no shadow).
- System fonts and the type scale below.
- No shadows on cards. Hover = border-colour shift, nothing else.

## What pages MAY differ on

- Section layout within the Workbench family (dashboard grid vs. single-column
  form).
- Hero headline copy per page.

## Exports

### tokens.css

```css
:root {
  --color-paper:      #ffffff;
  --color-paper-2:    #f7f8fa;
  --color-ink:        #111827;
  --color-ink-2:      #4b5563;
  --color-ink-3:      #9aa1ab;
  --color-rule:       #e5e7eb;
  --color-rule-2:     #d4d7dd;
  --color-accent:     #2563eb;
  --color-accent-2:   #1d4ed8;
  --color-accent-3:   #eff6ff;
  --color-focus:      #2563eb;

  --font-display: system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;

  --space-3xs: 0.25rem;  --space-2xs: 0.5rem;  --space-xs: 0.75rem;
  --space-sm:  1rem;     --space-md:  1.5rem;  --space-lg: 2rem;
  --space-xl:  3rem;     --space-2xl: 4rem;    --space-3xl: 6rem;

  --text-xs: 0.75rem;  --text-sm: 0.875rem;  --text-md: 1rem;
  --text-lg: 1.25rem;  --text-xl: 1.75rem;   --text-2xl: 2.25rem;

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --dur-short: 150ms;
  --radius-card: 10px; --radius-ctl: 8px; --radius-pill: 999px;
}
```
