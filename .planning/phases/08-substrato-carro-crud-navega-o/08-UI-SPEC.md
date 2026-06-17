---
phase: 8
slug: substrato-carro-crud-navega-o
status: draft
shadcn_initialized: true
preset: base-nova
created: 2026-06-17
---

# Phase 8 — UI Design Contract (Carro: lista, CRUD, navegação)

> **LEAN spec — reuse, do not re-derive.** The complete design system (navy+gold OKLCH tokens light+dark, Inter Tight headings, Geist/Geist Mono, shadcn `base-nova`, money/status semantics, empty/loading/error grammar, mobile table→card + BottomNav) is **already locked and shipped in Phase 7**. See `.planning/phases/07-identidade-visual-e-polimento/07-UI-SPEC.md` for every token, scale, and micro-interaction. This phase introduces **zero new visual primitives** and **no new design tokens**.
>
> This document specs ONLY the **new Carro surfaces for this phase**: (1) the `/carros` list page, (2) the carro create/edit Dialog, (3) the archive/unarchive toggle + "mostrar arquivados" filter, (4) the minimal `/carros/[id]` detail, and (5) the "Carros" nav entry in sidebar + bottom-nav.
>
> **Deferred to later phases (do NOT build UI here):** spend-per-category, abastecimento history, consumo chart, and list KPIs (gasto total, km/l médio) → Phases 9–11. The list shows car **identity only** this phase.
>
> Stack locked (inherited): Next.js 16 App Router, TS strict, Tailwind v4, shadcn `base-nova` (`registries: {}`), lucide, pt-BR. Money only via `src/lib/money.ts`. No money is displayed in this phase (KPIs come later) — but when it arrives it MUST go through `formatCents` / `Intl.NumberFormat('pt-BR')`, mono `tabular-nums`, cents-as-bigint internally.

---

## Inheritance (read first — what this phase REUSES verbatim)

| Concern | Inherited from Phase 7 — reference, do not redefine |
|---------|------------------------------------------------------|
| Color tokens (navy chrome + gold accent + semantic money/status, light+dark) | 07-UI-SPEC §Color System. No new tokens. |
| Typography (3 prose sizes + mono, 2 weights, Inter Tight heading) | 07-UI-SPEC §Typography |
| Spacing (8-pt scale + table-row/touch exceptions) | 07-UI-SPEC §Spacing Scale |
| Empty / loading / error grammar (shadcn `empty`, `TableSkeleton`/`CardSkeleton`, `text-destructive` inline) | 07-UI-SPEC §Polish |
| Dialog + Zod + react-hook-form (manual-state, `useTransition`, `sonner` toast, `{ ok } \| { error }`) | `reserva-form.tsx` / `nf-form.tsx` |
| List grid (`grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3`) | `reservas/page.tsx` |
| Mobile table→card + BottomNav + active-gold nav | 07-UI-SPEC §Responsive, `app-sidebar.tsx`, `bottom-nav.tsx` |
| Badge, Select, Card, Dialog primitives | already vendored `ui/*` |

Where this doc is silent, the Phase 7 contract governs. This phase adds **a new module surface**, not a new look.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (already initialized — `components.json` present, `style: base-nova`, `baseColor: neutral`, `registries: {}`) |
| Preset | `base-nova` (inherited, unchanged) |
| Component library | Radix / base-ui (vendored) |
| Icon library | lucide (`Car` icon for the Carros nav + page header; `Archive` / `ArchiveRestore` for the toggle) |
| Font | `--font-sans` Geist (body/UI) · `--font-heading` Inter Tight 600 (headings/brand) · `--font-mono` Geist Mono (numeric) — all inherited |

---

## Spacing Scale

Inherited unchanged from Phase 7 (8-pt, multiples of 4). No new values.

| Token | Value | Usage this phase |
|-------|-------|------------------|
| xs | 4px | Icon-to-label gap, badge padding, nav indicator |
| sm | 8px | Card field row gap, badge inset |
| md | 16px | Dialog field gaps (`FieldGroup`), card padding |
| lg | 24px | Page section gaps, dialog padding, **list grid gap** (`gap-6`) |
| xl | 32px | Page header → content block gap |
| 2xl | 48px | Empty-state vertical centering |

Exceptions (inherited): icon-only controls keep a **44px** hit area; **bottom-nav** items stay **≥48px** (`min-h-12`); dense list rows (if any table view added later) stay 40px desktop. No new exceptions this phase.

---

## Typography

Inherited unchanged. Roles touched this phase:

| Role | Size | Weight | Line Height | Used by |
|------|------|--------|-------------|---------|
| Heading (h1) | 20px (`text-xl`) | 600 (Inter Tight) | 1.2 | `/carros` page title "Carros", `/carros/[id]` car apelido, Dialog titles |
| Body / card line | 14px (`text-sm`) | 400 | 1.5 | Car identity fields (modelo, placa, ano), form inputs |
| Label / meta | 12px (`text-xs`) | 400 | 1.4 | Field labels, "Arquivado" badge, helper text, secondary identity line |

Exactly one `text-xl` h1 per screen (page title on `/carros`; car apelido on `/carros/[id]`). No money/display figures this phase (no `text-3xl` mono hero — KPIs deferred to Phase 11). Weight 600 reserved for headings only here.

---

## Color

Inherited verbatim from Phase 7 (60/30/10 under navy+gold). This phase introduces no new color and reads only existing tokens.

| Role | Token | Usage this phase |
|------|-------|------------------|
| Dominant (60%) | `--background` | Page + list canvas |
| Secondary (30%) | `--card` / `--muted` | Car identity cards, dialog surface, "Arquivado" badge background (`secondary`/`muted` variant) |
| Accent (10%) | `--primary` (gold) | The single primary CTA "Novo carro", active "Carros" nav item + left-indicator, focus ring, form submit button |
| Destructive | `--destructive` | Not used this phase (archive is a soft, reversible toggle — NOT destructive; no delete UI). Reserved for inline error text only. |

**Accent (gold) reserved for:** the one "Novo carro" primary button per surface, the active "Carros" nav item (sidebar text+indicator and bottom-nav icon+label), focus rings, and the Dialog submit button. **Never** for the "Arquivado" badge (that uses a neutral `secondary`/`muted` badge), never for car identity text, never as a card background.

**Archived state is visual-neutral, not alarming:** archived cars (when "mostrar arquivados" is on) render with a muted/neutral "Arquivado" badge and slightly reduced emphasis (e.g. `text-muted-foreground` on secondary lines) — never red, never gold.

---

## Screen Contracts (new surfaces only)

### 1. Navigation — "Carros" entry (CAR-06)

- **Sidebar (`app-sidebar.tsx` `NAV_ITEMS`):** add `{ href: '/carros', label: 'Carros', icon: Car }` positioned **immediately after `/reservas`** (i.e. `...PiggyBank(Reservas)`, **Carros**, `FileText(MEI)`...). Active detection reuses the existing `pathname === href || pathname.startsWith(href + '/')`; active = gold text + subtle accent bg + 2px gold left-indicator (frozen Phase 7 grammar).
- **Bottom-nav (`bottom-nav.tsx` `NAV_ITEMS`):** add the same `{ href: '/carros', label: 'Carros', icon: Car }`, taking the bar **from 5 to 6 items** (required by success criterion #2). Items stay `flex-1`, `min-h-12` (≥48px touch target), active = `text-primary` (gold) per the frozen pattern. Verify the 6-item row stays legible at 360px width (label `text-xs`; icon `size-5`).
- Both routes (`/carros`, `/carros/[id]`) sit inside the `(app)` segment and inherit the existing auth guard + layout chrome.

### 2. `/carros` list page (CAR-01)

- **Header:** `text-xl` h1 "Carros" (Inter Tight 600) on the left; the single gold primary CTA **"Novo carro"** on the right (opens the create Dialog). Same header rhythm as `/reservas`.
- **Filter control:** a "Mostrar arquivados" toggle (shadcn `Switch` or a `Checkbox`+label, whichever the project already uses for boolean filters; default OFF). When OFF the list shows only `is_archived = false` cars. When ON, archived cars also render, each carrying the neutral "Arquivado" badge. Filter state may be a client toggle or `?arquivados=1` URL param — match the project's established filter convention (Extrato uses URL params; a pure client toggle is acceptable here since there's no shareable deep-link need).
- **List layout:** responsive card grid reusing the `/reservas` pattern — `grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3`. One **car identity card** per car (this IS the Phase-7 mobile card pattern — cards all the way down, no dense table this phase).
- **Car identity card contents (identity ONLY — no KPIs):**
  - Primary line: **apelido** (the friendly name), `text-sm` weight 600 (or `text-base` per card-title convention), links to `/carros/[id]`.
  - Secondary line: **modelo · placa · ano** joined with a middot, `text-xs text-muted-foreground`; omit any field that is null (e.g. show just "Gol · 2018" if placa is empty; show nothing on this line if all three are null).
  - Optional tertiary: combustível-padrão as a small neutral `Badge` if set.
  - **"Arquivado"** neutral `Badge` (variant `secondary`/`outline`, `text-xs`) when `is_archived`.
  - Per-card actions: an **Editar** affordance (opens edit Dialog) and an **Arquivar/Desarquivar** affordance (the toggle). Place as an icon-button row or a small `DropdownMenu` (`MoreHorizontal`) — match whichever the project's existing cards (`ReservaCard`) use for per-item actions.
  - **No gasto total, no km/l** — those KPIs are deferred to Phases 9–11. Do not render placeholder zeros.
- **Empty state (no cars, filter OFF):** shadcn `Empty` primitive (the Phase-7 grammar, same as `reservas/page.tsx`): lucide `Car` icon in `--muted-foreground`, `EmptyTitle` + `EmptyDescription` + one gold "Novo carro" CTA. Copy in the table below.
- **Empty state (filter ON but zero archived):** the normal list of active cars renders; no special empty needed unless there are zero cars total.
- **Loading:** `CardSkeleton` grid (Phase-7 component) — never a spinner. Page chrome stays visible while the list streams.
- **Error:** inline `text-destructive` block with recovery copy (Phase-7 generic error string).

### 3. Carro create/edit Dialog (CAR-01)

Mirrors `reserva-form.tsx` / `nf-form.tsx` exactly: shadcn `Dialog` + Zod + react-hook-form, manual-state + `useTransition`, `sonner` toast on success, result shape `{ ok: true } | { error }` (never throw), re-seed from server truth on open (no `useEffect`).

- **Trigger:** "Novo carro" (gold primary button) for create; an "Editar" affordance on each card for edit. Exportable/self-contained like `ReservaForm` (accepts optional controlled `open`/`onOpenChange` + custom `trigger`).
- **Title:** "Novo carro" (create) / "Editar carro" (edit), `text-xl` Inter Tight.
- **Fields** (shadcn `Field`/`FieldGroup`/`FieldLabel`/`FieldError` grammar):
  | Field | Control | Required | Notes |
  |-------|---------|----------|-------|
  | Apelido | `Input` text | **Required** | The friendly name shown in lists/selectors. Validation: non-empty trimmed → error "Informe o apelido". |
  | Modelo | `Input` text | Optional | e.g. "Gol 1.6" |
  | Placa | `Input` text | Optional | Free text; no mask required this phase |
  | Ano | `Input` (numeric) | Optional | Integer; if present, sane bound (e.g. 1900–current+1) → error "Ano inválido" |
  | Combustível-padrão | `Select` | Optional | Fixed options: **Flex · Gasolina · Etanol · Diesel · GNV**. Includes a "—" / no-selection state since it's optional. |
- **Footer:** `DialogClose` "Cancelar" (secondary) + gold primary submit "Salvar" (or "Adicionar carro" on create — match the project's existing create/edit verb convention; `reserva-form` uses a single submit). Disabled + pending state during `useTransition`.
- **Success:** `sonner` toast ("Carro adicionado" / "Carro atualizado"), close dialog, `revalidatePath('/carros')`.
- **Mobile:** dialog goes full-width sheet-style single-column (inherited Phase-7 dialog behavior).

### 4. Archive / Unarchive toggle (CAR-01)

- **Soft, reversible** — sets `is_archived` boolean; **not** a destructive delete (no `AlertDialog`, no red zone, no type-to-confirm).
- Trigger: per-card "Arquivar" (lucide `Archive`) → on success `sonner` toast "Carro arquivado", card leaves the default list (filter OFF) or gains the "Arquivado" badge (filter ON). "Desarquivar" (lucide `ArchiveRestore`) is available on archived cards when the filter is ON → toast "Carro desarquivado".
- No confirmation modal required (it's reversible); a direct action + toast is the contract.
- `revalidatePath('/carros')` after toggle.

### 5. `/carros/[id]` minimal detail (CAR-06)

This phase ships a **minimal** detail — identity + actions only. Spend-per-category, abastecimento history, and the consumo chart are explicitly deferred (Phases 9–11); do NOT scaffold empty sections or "coming soon" placeholders for them.

- **Header:** car **apelido** as the `text-xl` h1 (Inter Tight 600); secondary line **modelo · placa · ano** (`text-sm text-muted-foreground`, null fields omitted); "Arquivado" badge if archived.
- **Actions:** "Editar" (opens the same edit Dialog) and "Arquivar/Desarquivar" toggle — same controls as the list card, placed in the header action area.
- **Body:** a single `Card` listing the car's fields (apelido, modelo, placa, ano, combustível-padrão) as a simple definition list (`text-sm`, labels `text-xs text-muted-foreground`). Null optional fields show "—" or are omitted consistently.
- **Loading:** `CardSkeleton`. **Error / not-found:** inline `text-destructive` recovery block (or Next `not-found` for a non-owned/missing id — RLS returns empty, so a missing car → not-found is acceptable).
- **No money, no charts, no tables** this phase.

---

## Component Inventory

**Reuse (re-skinned/frozen — do NOT rewrite):** all `ui/*` primitives (`Dialog`, `Select`, `Input`, `Button`, `Badge`, `Card`, `Field*`, `Switch`/`Checkbox`, `DropdownMenu`, `Empty*`, `Skeleton`), `CardSkeleton`, `app-sidebar`, `bottom-nav`, the `reserva-form`/`nf-form` dialog grammar, the `reservas/page.tsx` grid + empty-state grammar, `sonner` toasts.

**New custom composites (vendored, this phase):**

| Composite | Purpose |
|-----------|---------|
| `CarroForm` | Create/edit Dialog (Zod + react-hook-form), mirrors `ReservaForm`; exportable + controllable. |
| `CarroCard` | Identity card for the `/carros` grid (apelido + modelo/placa/ano + combustível badge + archived badge + edit/archive actions). Identity only — no KPIs. |
| (route files) | `src/app/(app)/carros/page.tsx` (list), `src/app/(app)/carros/[id]/page.tsx` (minimal detail), optional `loading.tsx` reusing `CardSkeleton`. |

No new shadcn registry blocks. No new npm dependencies. `registries: {}` unchanged. lucide `Car` / `Archive` / `ArchiveRestore` are already available in the installed `lucide-react`.

---

## Copywriting Contract

All copy pt-BR, calm/direct/second-person, no exclamation (inherited tone). New strings this phase:

| Element | Copy |
|---------|------|
| Primary CTA (list + dialog trigger) | **Novo carro** |
| Page title | **Carros** |
| Nav label | **Carros** |
| Filter toggle | **Mostrar arquivados** |
| Dialog title (create) | **Novo carro** |
| Dialog title (edit) | **Editar carro** |
| Field labels | Apelido · Modelo · Placa · Ano · Combustível padrão |
| Combustível options | Flex · Gasolina · Etanol · Diesel · GNV |
| Submit button | **Salvar** |
| Cancel button | **Cancelar** |
| Validation — apelido empty | "Informe o apelido" |
| Validation — ano invalid | "Ano inválido" |
| Archived badge | **Arquivado** |
| Archive action | **Arquivar** |
| Unarchive action | **Desarquivar** |
| Toast — created | "Carro adicionado" |
| Toast — updated | "Carro atualizado" |
| Toast — archived | "Carro arquivado" |
| Toast — unarchived | "Carro desarquivado" |
| Empty (no cars) — heading | **Nenhum carro ainda** |
| Empty (no cars) — body | "Cadastre um carro para começar a acompanhar seus gastos e abastecimentos." |
| Error (generic, inherited) | "Não foi possível carregar os carros. Tente recarregar a página." |

**Destructive actions:** none this phase. Archive is a reversible soft toggle, not a delete — no destructive-confirmation copy is needed.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | Only previously-vendored primitives (Dialog, Select, Input, Button, Badge, Card, Field, Switch/Checkbox, DropdownMenu, Empty, Skeleton) — no new block added | not required (official registry) |

No third-party registries declared. `registries: {}` in `components.json` (verified). Registry vetting gate: not applicable. No new npm dependency this phase.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** inline-verified 2026-06-17 (formal gsd-ui-checker skipped — transient API 529 overload during this run; lean reuse-spec validated against the locked Phase-7 design system).
