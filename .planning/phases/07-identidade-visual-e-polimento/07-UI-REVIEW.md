# Phase 7 — UI Review

**Audited:** 2026-06-17
**Baseline:** 07-UI-SPEC.md (Navy + Gold private-banking re-skin design contract)
**Screenshots:** Not captured — dev server is up on :3000, but Playwright browser binaries are not installed (`npx playwright install` never run), so CLI capture failed silently. Code-only audit. Live contrast + flip-integrity were **human-verified ("aprovado")** at the 07-07 checkpoint; pillars whose final word needs rendered output are noted as such.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | All new pt-BR strings match the Copywriting Contract verbatim; no generic labels. |
| 2. Visuals | 4/4 | Clear focal hierarchy (mono hero, gold active-nav indicator); icon-only controls all `aria-label`led. |
| 3. Color | 4/4 | globals.css matches the OKLCH token table coordinate-for-coordinate; gold fenced to brand/action; zero stray hardcoded color outside the two sanctioned exceptions. |
| 4. Typography | 3/4 | 3-size + mono and 2-weight rules largely held, but two hero figures use arbitrary `text-[28px]` instead of the `text-3xl` scale token. |
| 5. Spacing | 4/4 | 8-pt scale respected; arbitrary values are all sanctioned (chart `min-h-[240px]`, hit-area, hero). |
| 6. Experience Design | 2/4 | ThemeToggle drawer-footer mirror missing; route-level skeletons exist for only 3 of ~20 routes despite the "consistent across all routes" contract. |

**Overall: 21/24**

---

## Top 3 Priority Fixes

1. **ThemeToggle (and logout) absent from the mobile drawer footer** (WARNING) — UI-SPEC §Dark Mode explicitly states "Mirror it into the mobile drawer footer," and §App-shell says "drawer holds the full nav + theme toggle + logout." `grep ThemeToggle` finds it only in `user-menu.tsx`. On mobile the sidebar collapses to the `sheet` drawer (`ui/sidebar.tsx`), which carries nav only — theme + logout live solely in the top-bar `UserMenu` dropdown. Reachable, but the contracted drawer-footer mirror is unbuilt. — Fix: render `<ThemeToggle />` + a Sair action in the `SidebarFooter` of the mobile sheet.

2. **Route-level loading grammar is incomplete** (WARNING) — UI-SPEC §Polish: "Consistent grammar across all ~20 routes … skeletons, never spinners … keep page chrome visible while body streams." Only `dashboard/`, `extrato/`, and `mei/` have a `loading.tsx`; receitas, categorias, importar, reservas, conta and the MEI/reserva sub-routes have none, so they fall back to no streamed skeleton. — Fix: add `loading.tsx` per remaining route using the existing `TableSkeleton`/`CardSkeleton`/`ChartSkeleton` primitives.

3. **Hero money figures bypass the type scale with `text-[28px]`** (WARNING) — Typography §Display/hero declares the 28px hero as `text-3xl` mono. `adherence-summary-strip.tsx:33` and `dasn-report-view.tsx:49` hardcode `text-[28px]` instead. Same rendered size, but it sidesteps the locked scale token and will drift if `--text-3xl` is re-tuned. — Fix: replace `text-[28px]` with `text-3xl`.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)
- New strings match the contract exactly: auth value prop ("Sua gestão financeira pessoal — privada, precisa e sob seu controle.") in `auth-shell.tsx:40`; theme labels "Claro/Escuro/Sistema" in `theme-toggle.tsx:24-26`; chart empty states "Sem dados para o gráfico" (`receita-gasto-chart.tsx:48`) and "Nenhum gasto neste mês" (`category-distribution-chart.tsx:63`) verbatim with the contracted body copy; chart aria-labels match ("Evolução de receita e gasto por mês", "Distribuição de gastos por categoria em {mês}").
- Generic-label grep returned only `onSubmit`/`<form onSubmit>` handler names — no UI string is "Submit/OK/Click Here". No exclamation, second-person, calm tone preserved. No defects.

### Pillar 2: Visuals (4/4)
- Clear focal hierarchy: gold active-nav with a 2px gold left-indicator (`app-sidebar.tsx:60`, `before:bg-primary`), mono hero figures as the loudest element, BrandMark navy tile + gold bar-trio (`brand-mark.tsx`).
- Icon-only controls carry accessible names: `UserMenu` trigger `aria-label="Menu da conta"`, BrandMark `aria-label="Gestão Financeira"`, BottomNav links carry `aria-current` + visible labels, ThemeToggle buttons have visible text + `aria-pressed`.
- Charts ship labeled totals/legends so no number is sole-carried by the graphic (`receita-gasto-chart.tsx:55-76`, `category-distribution-chart.tsx:97-125`). Full rendered visual hierarchy was human-approved at 07-07.

### Pillar 3: Color (4/4)
- `globals.css` `:root`/`.dark` reproduce the UI-SPEC OKLCH table coordinate-for-coordinate: navy chrome (hue 255–258), gold `--primary` `0.76 0.13 88` / `0.82 0.13 88`, money semantics re-tuned (income 152, expense=foreground, allocation 250, consumption 70, destructive 27/25), navy+gold chart ramp, deeper-than-canvas dark sidebar.
- Gold fenced correctly: `text-primary`/`bg-primary` appears on active nav, primary CTA, focus ring, checked controls, chart-1, and the auth "Financeira" wordmark only (allowed there per §Brand). No gold on income, categories, or card backgrounds.
- Hardcoded-color grep across `src/components` returned **zero** hits outside the two sanctioned exceptions: the fixed swatch palette in `category-badge.tsx` (incl. the legacy `teal` swatch at :21 — a category swatch, not chrome) and the recharts `#hex` selector internals in `ui/chart.tsx`. Teal hue `195` survives only as that one category swatch, not as chrome. Light/dark flip-integrity human-verified.

### Pillar 4: Typography (3/4)
- Sizes in use reduce to `text-xs / text-sm / text-base / text-xl / text-2xl / text-3xl` + mono — within the 3-prose-sizes + display + mono budget (`text-base`/`text-2xl` confined to the auth hero panel, `auth-shell.tsx:39`, which is the sanctioned hero exception).
- Weights reduce to `font-normal / font-medium / font-semibold` — `font-medium` is used for active-nav emphasis; the 2-weight intent (400 body / 600 heading-money-active) is substantially held, with `font-medium` as a mild third weight on nav/labels (acceptable, borderline).
- `--font-heading` correctly wired to Inter Tight 600 and applied on headings/wordmark (`app-sidebar.tsx:43`, `auth-shell.tsx:33,39`).
- Defect: hero figures hardcode `text-[28px]` (`adherence-summary-strip.tsx:33`, `dasn-report-view.tsx:49`) rather than the `text-3xl` scale token the contract names — off-scale, the only real divergence here.

### Pillar 5: Spacing (4/4)
- 8-pt scale respected; arbitrary `[...px]/[...rem]` values are all sanctioned: chart `min-h-[240px]`/`max-h-[260px]` (the contract's "fixed aspect/height for charts" exception), vendored shadcn primitive internals (switch/checkbox/tooltip/badge), and the hero `text-[22px]`/`text-[28px]` (size, not spacing).
- BottomNav touch targets `min-h-12` (48px) per the mobile ≥48px rule (`bottom-nav.tsx:49`); main content `pb-20 md:pb-6` clears the fixed nav. No arbitrary margin/padding spacing literals found.

### Pillar 6: Experience Design (2/4)
- Strong where built: charts degrade to the contracted empty states; skeletons (not spinners) via `TableSkeleton`/`CardSkeleton`/`ChartSkeleton` with `motion-reduce:animate-none`; ThemeToggle is mount-guarded against hydration flash; `disableTransitionOnChange` on the provider; `next-themes` persistence wired; destructive flows inherited intact.
- BLOCKER-adjacent gaps against the contract:
  - **Drawer-footer ThemeToggle + logout mirror missing** — only the top-bar `UserMenu` has them; the mobile `sheet` drawer carries nav only. Contract breached, though function is still reachable, so WARNING not BLOCKER.
  - **Loading coverage is 3/~20 routes** — `find` shows `loading.tsx` only for dashboard, extrato, mei. The "consistent across all ~20 routes" loading grammar is not met for the majority of routes.
  - **BottomNav first-paint**: `useIsMobile()` returns `undefined`→false on SSR/first paint, so the nav pops in post-mount (mitigated by the redundant `md:hidden`, but a brief flash on mobile is possible). Minor.
- These are real, contract-level gaps in the "polish/experience" pillar — score held at 2 rather than averaged up; the implemented states are good but the coverage promise is unmet.

---

## Registry Audit

`components.json` present with `registries: {}`; UI-SPEC §Registry Safety declares **no third-party registries** (only shadcn official: `chart`, `breadcrumb`). Per the audit gate, third-party block vetting is not applicable. Recharts is an npm dep (with the `react-is` 19.x override), not a registry block. **0 third-party blocks checked, no flags.** SEC-01 bundle-secret audit was re-confirmed exit 0 at 07-07 with the recharts client component shipping.

---

## Files Audited
- src/app/globals.css
- src/app/layout.tsx (via summary), src/app/(app)/layout.tsx
- src/components/brand-mark.tsx
- src/components/bottom-nav.tsx
- src/components/auth-shell.tsx
- src/components/theme-toggle.tsx
- src/components/user-menu.tsx
- src/components/app-sidebar.tsx
- src/components/receita-gasto-chart.tsx
- src/components/category-distribution-chart.tsx
- src/components/table-skeleton.tsx
- src/components/chart-skeleton.tsx
- src/hooks/use-mobile.ts
- 07-01-SUMMARY.md, 07-07-SUMMARY.md, 07-UI-SPEC.md, 07-CONTEXT.md
- Grep audits across src/**/*.tsx (color, typography, spacing, copy, state coverage)
