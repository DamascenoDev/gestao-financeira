# Phase 8 — UI Review

**Audited:** 2026-06-17
**Baseline:** 08-UI-SPEC.md (lean reuse-spec over locked Phase-7 design system)
**Screenshots:** not captured — dev server on :3000 returns 404 for `/carros` (route behind auth guard + not served by the running instance). Code-only audit.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | Every contract string matches verbatim (titles, CTAs, toasts, empty, error, validation). |
| 2. Visuals | 4/4 | Clear apelido focal point, icon-only dropdown has `aria-label`, Car-icon Empty, single h1 per screen. |
| 3. Color | 4/4 | Gold reserved for CTA/active-nav/focus only; archived badge neutral `secondary`; zero hardcoded colors. |
| 4. Typography | 3/4 | Spec says card title `text-sm` weight 600; card renders `font-medium` (500), a one-step deviation. |
| 5. Spacing | 3/4 | 8-pt scale honored, but list page caps at `max-w-5xl` while `loading.tsx` also uses `max-w-5xl` — detail uses `max-w-3xl`; minor inconsistency vs reservas grid container. |
| 6. Experience Design | 4/4 | Loading skeleton, inline error, empty state, pending-disabled actions, soft reversible archive with toast — full coverage. |

**Overall: 22/24**

---

## Top 3 Priority Fixes

1. **Card title weight diverges from contract (WARNING)** — `carro-card.tsx:82` uses `text-sm font-medium` (weight 500). Typography contract (08-UI-SPEC §Typography, line 76 + §2 line 114) specifies card primary line `text-sm weight 600`. Impact: subtle hierarchy drift from the locked card-title convention. Fix: change `font-medium` → `font-semibold` on the card `<h2>` to match the spec'd 600.
2. **Combustível label inconsistency across surfaces (WARNING)** — list/detail show the raw enum value (`Flex`), while the form label reads "Combustível padrão (opcional)". Copy contract field label is "Combustível padrão". This is consistent, but the form appends "(opcional)" to every optional field label ("Modelo (opcional)", "Placa (opcional)", "Ano (opcional)") which the Copywriting Contract table does NOT specify (it lists bare labels: Apelido · Modelo · Placa · Ano · Combustível padrão). Impact: label verbosity beyond contract. Fix: either accept as an intentional affordance (recommended — it aids the optionality UX) or strip "(opcional)" to match the literal contract.
3. **Container width drift between list and skeleton vs grid intent (WARNING)** — `page.tsx:56` and `loading.tsx:9` wrap in `max-w-5xl`, detail in `max-w-3xl` (`[id]/page.tsx:61`). The grid is `lg:grid-cols-3` which at `max-w-5xl` is fine, but the reservas grammar this cloned should be verified to use the same container token. Impact: cosmetic; no break. Fix: confirm `max-w-5xl` matches `reservas/page.tsx`; align if reservas uses a different cap.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)
Verbatim match against the Copywriting Contract table:
- Page title "Carros" — `page.tsx:58`, `loading.tsx:11`.
- Primary CTA "Novo carro" — `carro-form.tsx:153` (default trigger).
- Dialog titles "Novo carro" / "Editar carro" — `carro-form.tsx:158`.
- Submit "Salvar" / pending "Salvando…" / "Cancelar" — `carro-form.tsx:240,242,238`.
- Validation "Informe o apelido" / "Ano inválido" — owned by `carroSchema` (per summary), surfaced via `FieldError`.
- Toasts "Carro adicionado/atualizado/arquivado/desarquivado" — `carro-form.tsx:144`, `carro-card.tsx:73`, `carro-detail-actions.tsx:31`.
- Empty heading "Nenhum carro ainda" + body verbatim — `page.tsx:75-79`.
- Error "Não foi possível carregar os carros. Tente recarregar a página." — `page.tsx:66-67`.
- Filter "Mostrar arquivados" — `carros-archive-filter.tsx:39`.
- Archived badge "Arquivado", actions "Arquivar"/"Desarquivar" — `carro-card.tsx:98,121`, `carro-detail-actions.tsx:48`.
No generic labels. Form `DialogDescription` ("Dê um apelido…") is an additive helper not in the contract but tone-consistent (pt-BR, calm, no exclamation). PASS.

### Pillar 2: Visuals (4/4)
- Clear focal point: apelido as linked `<h2>` is the card's strongest element; secondary identity line is `text-muted-foreground`.
- Icon-only dropdown trigger carries `aria-label={`Ações do carro ${carro.apelido}`}` — `carro-card.tsx:110`. Detail actions are labelled text+icon buttons (`carro-detail-actions.tsx:37-49`), matching §5 "header action area".
- Hierarchy via size/weight/color differentiation present; badges use neutral `outline`/`secondary` variants.
- Exactly one `text-xl` h1 per screen (`page.tsx:58`, `[id]/page.tsx:64`). Empty uses the spec'd `Car` lucide icon in `EmptyMedia`. PASS.

### Pillar 3: Color (3→4/4)
- `primary` (gold) appears only on the default CTA button and the active-nav grammar (`app-sidebar.tsx:61` `data-active:text-primary` + gold left-indicator; `bottom-nav.tsx:53` `text-primary`). Grep for `primary` in carro components returned zero hits — gold lives only in the inherited Button default + nav, exactly per §Color.
- Archived state is neutral: `Badge variant="secondary"` (`carro-card.tsx:97`, `[id]/page.tsx:69`) — never red, never gold. Matches "archived is visual-neutral, not alarming".
- Combustível badge `variant="outline"` (`carro-card.tsx:92`) — neutral, correct.
- Zero hardcoded hex/rgb, zero arbitrary color values. PASS at 4/4.

### Pillar 4: Typography (3/4)
Distinct sizes in carro files: `text-xl` (h1 ×3), `text-sm` (body/labels), `text-xs` (meta) — exactly the 3 prose roles in §Typography. Weights: `font-semibold` (headings) + `font-medium` (card title) + default 400.
- **Deviation:** §Typography line 76 and §2 line 114 spec the card primary line at `text-sm weight 600`. `carro-card.tsx:82` renders `text-sm font-medium` (500). The detail h1 correctly uses `font-semibold`. One-step weight drift on the card title — the only typography miss, hence 3/4 not 4/4.
- Weight 600 is otherwise correctly reserved for headings (page h1, detail h1). No `text-3xl` mono hero (KPIs correctly deferred). 

### Pillar 5: Spacing (3/4)
- 8-pt scale honored throughout: `gap-6` (lg/24px, list grid + section), `gap-4`, `gap-3`, `gap-2`, `gap-1`, `gap-1.5`, `pt-6`, `mt-6`, `mt-1` — all multiples of 4. `gap-6` list grid matches §2 / inherited reservas grid verbatim (`page.tsx:86`).
- Bottom-nav `min-h-12` (48px) touch target preserved (`bottom-nav.tsx:50`), icon-button hit area via `size-icon-sm` Button. 
- **Minor:** `gap-0.5` (2px) on the detail definition rows (`[id]/page.tsx:81`) is below the 4px xs token — a sub-grid micro-gap, acceptable for dt/dd pairing but technically off-scale. Container caps (`max-w-5xl` list, `max-w-3xl` detail) are reasonable but not enumerated in the spec; verify alignment with `reservas/page.tsx`. Hence 3/4.

### Pillar 6: Experience Design (4/4)
- **Loading:** `loading.tsx` streams `CardSkeleton count={3}` with page chrome visible — never a spinner (§2). 
- **Error:** inline `text-destructive` recovery block (`page.tsx:65-68`).
- **Empty:** shadcn `Empty` primitive with Car icon + CTA (`page.tsx:70-84`); the CTA reuses `CarroForm` so the user can act immediately.
- **Pending states:** `disabled={isPending}` on submit (`carro-form.tsx:240`), archive dropdown item (`carro-card.tsx:120`), detail archive button (`carro-detail-actions.tsx:45`), and the filter Switch (`carros-archive-filter.tsx:35`).
- **Destructive handling:** correct — archive is a soft reversible toggle with toast, no AlertDialog, no destructive styling, exactly per §4. `notFound()` on foreign/missing id (`[id]/page.tsx:31`).
- All write paths route through Plan-02 server actions returning `{ ok } | { error }`, surfaced as `toast.error`/`toast.success`. Full state coverage. PASS.

Registry audit: `components.json` present, `registries: {}`, shadcn official only — 0 third-party blocks, no flags. Section omitted per spec.

---

## Files Audited
- src/app/(app)/carros/page.tsx
- src/app/(app)/carros/[id]/page.tsx
- src/app/(app)/carros/loading.tsx
- src/components/carro-card.tsx
- src/components/carro-form.tsx
- src/components/carro-detail-actions.tsx
- src/components/carros-archive-filter.tsx
- src/components/app-sidebar.tsx
- src/components/bottom-nav.tsx
