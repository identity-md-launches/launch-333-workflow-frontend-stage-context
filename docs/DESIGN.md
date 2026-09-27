# Heartbeat — implemented design

## Overview

Heartbeat is a one-page Sepolia test interface for depositors and beneficiaries. The visual direction uses a warm off-white canvas, forest-colored text, flat white control surfaces, and a serif italic line in the main heading. The switches and their eligibility are the primary task; creation sits beside them on desktop. Explanations, swaps, and advanced token/deployment details follow in document order.

This is an inferred design for the approved brief, not a pre-existing brand system. The source of truth is `web/src/styles.css`, with page composition in `web/src/App.tsx`. This document is under `docs/` because the overriding assignment scope prohibits creating root `DESIGN.md`.

## Colors

All components use semantic variables mapped to hex primitives in `styles.css:1`.

| Semantic token | Value | Role |
| --- | --- | --- |
| `--bg` | `#f6f5ef` | Page canvas |
| `--surface` | `#ffffff` | Cards and enabled fields |
| `--surface-soft` | `#eeeee5` | Quiet panels, disabled controls |
| `--text` | `#22372d` | Primary text, brand mark |
| `--muted` | `#58645d` | Instructions, captions, units |
| `--border` | `#d9ddd3` | Structural boundaries |
| `--control-border` | `#89938b` | Fields and neutral buttons |
| `--accent` / `--accent-hover` | `#2e5b43` / `#234934` | Primary action, links / hover |
| `--on-accent` | `#ffffff` | Primary button text |
| `--status-bg` / `--status-text` | `#e4ede2` / `#234934` | Active status, with an explicit label |
| `--warning-bg` / `--warning-text` | `#f4ebd5` / `#6d4919` | Test banner, lapsed and wrong-chain states |
| `--error-bg` / `--error-text` | `#fff0eb` / `#8c352a` | Persistent actionable errors |

Native browser focus rings are retained with a 4px outline offset; there is no custom focus-color token. Status is always expressed in text as well as color. The connect button is filled when disconnected; after connecting, the create button carries primary emphasis. Other actions use neutral bordered controls. Only a light theme is implemented.

Measured from rendered Chromium colors: text/page 11.64:1, muted/page 5.66:1, muted/white 6.18:1, white/accent 7.80:1. See `docs/evidence/contrast.json`. These are identified pairs, not an assertion about every possible browser state.

## Typography

The UI stack is `'Helvetica Neue', Arial, sans-serif`. The italic display line and token disc use `Georgia, 'Times New Roman', serif`; addresses use `ui-monospace, monospace`. There are no downloaded fonts. Actual available faces vary by operating system; `font-synthesis: none` avoids synthetic faces. Source weights use 400, 500, and 600.

`--text-display` is `clamp(2.5rem, 4.4vw, 3.9rem)`; h1 uses 1.09 line-height and −.06em tracking, with −.065em on the italic line. h2 uses 1.625rem, h3 1.125rem, body 1rem, controls/supporting copy .875rem, and metadata .75rem. Eyebrows and the footer identifier use .6875rem with positive tracking; they are supplementary, not action labels. Headings use balanced wrapping. Intro copy is capped at 49ch and uses 1.65 line-height; general body line-height is 1.55.

Form inputs remain 1rem on mobile. Amounts and timers use tabular numerals. Full precision amounts and full addresses remain available in document text; amount spans and address details wrap rather than relying on ellipses. The header shortens the wallet address, with the full address in the loaded wallet summary. User-entered address fields retain native horizontal text navigation.

## Layout

The seven spacing variables are .5, .75, 1, 1.5, 2, 3, and 4rem. The shell has a 1220px maximum width and centered margins, initially with 3rem inline padding. Forms use 1rem vertical gaps; cards have 2rem padding. The main grid is `minmax(0, 1.5fr) minmax(0, 1fr)`, with a 2rem gap. Lower content uses the same proportions and a 4rem gap.

At 60rem, shell padding becomes 2rem, cards use 1.5rem padding, and grids use 1.2:1 proportions with 1.5rem gaps. At 46rem, shell padding becomes 1rem and all major grids become one column. Wallet controls can wrap, the redundant network pill hides, and the test-network notice remains visible. Content follows its DOM order: switches, creation, explanation, swap, advanced details. There are no fixed-position transaction controls, clipped panes, or horizontal carousels.

Rendered checks covered 1440, 768, 390, and 320 CSS-pixel widths and 200% root text enlargement with no horizontal overflow. Enlargement is not a browser-native zoom test. Many switches make the normal document longer; controls are not trapped in an internal scroller.

## Elevation & Depth

The interface is flat. White cards distinguish working areas from the warm page. Thin borders define structure; the disconnected empty state has a dashed boundary. No box shadows, overlays, dialogs, gradients, background images, or backdrop effects are used.

## Shapes

Cards use 16px radii; switch cards and network notices use 12px; inputs/buttons use 8px; small badges use 5px. The brand mark, numbered steps, and token marker are circles. The network label is a pill. Structural borders are 1px. Cards have generous padding rather than tightly nested concentric shapes.

## Components

- `Pulse`, `Field`, `Form`, `Amount`, and `External` in `web/src/components.tsx`: the local decorative SVG, labeled input with optional described hint, native disabled fieldset and form-level error focus, exact amount with unit, and external link with new-tab indication. Native form constraints handle required/range errors; cross-field/contract errors are persistent form or transaction alerts. No custom composite widgets or modal focus traps are needed.
- `CreateSwitch` and `Switches`/`SwitchCard` in `web/src/Switches.tsx`: a period preset picker with a disclosed exact-seconds control, wallet-role filters, event-loading/empty states, active/lapsed/closed labels, timer/balance facts, and progressively disclosed management controls. Closing a switch is described immediately before its explicit claim/reclaim button and the wallet confirmation.
- `Swap` in `web/src/Swap.tsx`: direction, amount, slippage, quote, minimum output, exchange rate, expiration, and separate approval steps. A quote disappears when its inputs change and its submit button disables after expiry. The panel stays secondary to switch management.
- `TokenTools` in `web/src/TokenTools.tsx`: disclosed ERC-20 transfer, allowance/revocation, and delegated transfer controls with live balance/allowance prerequisites.
- `App` and `useHeartbeat`: persistent test notice, wallet/network controls, deployment verification, transaction status/explorer links, and fresh-state gating. Missing wallet, rejected request, wrong chain, invalid ABI, missing code, or RPC failure each has a visible state.

Buttons/fields have a 44px minimum height. Native `<details>` supplies disclosure keyboard behavior. The skip link precedes navigation. Tested keyboard focus is visible on the primary action. Hover is gated by `hover: hover`; button background and .96 press-scale transitions are 120ms, only under `prefers-reduced-motion: no-preference`. No entrance or continuous decorative animation exists.

## Do's and Don'ts

Reuse the semantic tokens, native field/form pattern, explicit action verbs, and eligibility gates. Put exact amounts and consequences beside a transaction control. Keep test ETH and BEAT units distinct, and retain the persistent Sepolia test-toy notice. Reserve the filled button for the current main task.

Do not replace native controls with clickable generic elements, introduce a second runtime address map, collapse failures into an empty switch list, or rely on color or hover alone for eligibility or precision. A future section should use existing headings, card/grid primitives and disclosure patterns, without introducing another font or surface style.

Guidance attribution: Jakub Krehel's Better Interface, MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`; documentation method adapted from Paul Bakaus's Impeccable, Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. See `web/README.md` for the pinned upstream links. Native screen-reader behavior, physical mobile devices, browser-native 200% zoom, RTL/localization, and alternate browsers are not claimed as verified.
