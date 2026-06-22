---
phase: 27-registro-r-pido-abastecimento-parcelado
verified: 2026-06-22T14:10:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 4/4
  gaps_closed:
    - "O usuário consegue chegar ao histórico de abastecimentos (e à ação Editar) de um carro a partir da lista /carros (discoverability gap — UAT test 2/4)."
  gaps_remaining: []
  regressions: []
---

# Phase 27: Registro rápido + abastecimento parcelado — Verification Report

**Phase Goal:** O usuário lança um abastecimento na hora, sem depender da fatura nem da página de detalhe do carro. Um botão "Novo abastecimento" por carro na lista `/carros` abre o `AbastecimentoForm` já existente (reaproveitado do `/carros/[id]`), permitindo registrar à vista/manual durante o mês. E no próprio form o usuário pode marcar o abastecimento como parcelado, informando nº de parcelas + valor total — gravados nas colunas criadas na Phase 26.
**Verified:** 2026-06-22T14:10:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (plan 27-05 closed the UAT discoverability gap)

## Re-verification Summary

The initial verification passed 4/4 ROADMAP success criteria. UAT then surfaced one **major** gap (test 2/4): a *discoverability* gap — the abastecimento history + the Editar action (CR-01) live only in the detail `/carros/[id]`, and the list `/carros` had no clear affordance to reach it (only the nickname with `hover:underline`). After registering via the list, especially a parcelado (which creates no transaction and so moves no `v_carro_resumo` KPI), the user perceived "nada aconteceu" and couldn't find a link to the detail.

Gap-closure plan **27-05** closed it with an idiomatic navigation affordance: a "Ver detalhes" `DropdownMenuItem` rendering `<Link href={`/carros/${carro.id}`}>` as the first item of the CarroCard ⋯ menu, mirroring ReservaCard's "Ver extrato". This was human-verified live by the owner ("aprovado"): discoverable, navigates to the detail, history + Editar reachable, existing card interactivity intact.

The closed gap is promoted to a 5th observable truth (truth #5 below). All 5 truths now verify.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Na lista `/carros`, cada carro expõe um botão "Novo abastecimento" que abre o `AbastecimentoForm` (o mesmo do detalhe) e registra sem navegar para `/carros/[id]` (CAR-07) | ✓ VERIFIED | `carro-card.tsx:184-200` hosts `<AbastecimentoForm carroId combustivelPadrao transacoes={[]} manualOnly trigger={Button "Novo abastecimento"}/>` on the card face (CardContent, not DropdownMenu). Form imported `:10`. Live-approved in 27-04 blocking human-verify (2026-06-22). |
| 2 | Pelo botão da lista, o usuário registra um abastecimento manual/à vista (litros + odômetro + valor) e ele aparece no histórico do carro (CAR-07) | ✓ VERIFIED | Same `createAbastecimento` action; `revalidatePath('/carros')` + `revalidatePath('/carros/{id}')` at `abastecimentos.ts:168-169`. Manual write proven by `abastecimentos.test.ts` (manual describe → amount_cents set + transaction_id null). "Appears in history" confirmed live in 27-04 + reconfirmed via the new affordance in 27-05 (2026-06-22). |
| 3 | No form, o usuário marca como parcelado e informa nº parcelas + valor total; salvo com esses dados validados; o à-vista continua inalterado (CAR-08) | ✓ VERIFIED | Schema 3-state superRefine `abastecimento.ts:83-124` (parcelado requires valorTotalCents + parcelasTotal∈[2,24], tx/amount absent). Form "Parcelado" tab + buildInput emits valorTotalCents/parcelasTotal. Action writes `parcelas_total + valor_total_cents` `abastecimentos.ts:85-86`. 46 phase tests pass (schema 3-state bounds + à-vista non-regression). Live-approved 27-03 checkpoint (2026-06-21). |
| 4 | O registro respeita posse (IDOR-safe via `assertOwnedCarro`) e não double-conta: parcelado manual sem transação vinculada (CAR-08) | ✓ VERIFIED | `assertOwnedCarro` re-derives ownership before write `abastecimentos.ts:108`; parcelado write sets `transaction_id: null` + `amount_cents: null` `:86-87` (cost counted once via valor_total_cents). Test `abastecimentos.test.ts`: forged carroId → 'Carro inválido.' with no write; parcelado write asserts both cost columns null. |
| 5 | A partir de um card em `/carros`, o usuário descobre e clica numa affordance visível que o leva ao detalhe `/carros/[id]` (onde vivem o histórico de abastecimentos + Editar/CR-01), sem quebrar a interatividade existente do card (CAR-07/CAR-08) | ✓ VERIFIED | `carro-card.tsx:138-140` — "Ver detalhes" `DropdownMenuItem render={<Link href={`/carros/${carro.id}`}>Ver detalhes</Link>}` as the FIRST menu item, mirroring ReservaCard's "Ver extrato" (`reserva-card.tsx:101`). Destination hosts `AbastecimentoHistory` (`carros/[id]/page.tsx:8,378`) + Editar/CR-01. Existing interactivity preserved (nickname Link `:104`, Novo abastecimento `:184-200`, Editar `:141`, Arquivar `:144` all intact). JSDoc updated `:74-75`. Code review clean (0 critical/warning). Live-approved 27-05 ("aprovado"). |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/lib/schemas/abastecimento.ts` | superRefine 3-state + valorTotalCents/parcelasTotal | ✓ VERIFIED | Fields `:69-82`, 3-state superRefine `:83-124`. Mirrors 0039 cost_xor CHECK. |
| `src/actions/abastecimentos.ts` | abastecimentoWriteFields parcelado-aware + IDOR gate + revalidate | ✓ VERIFIED | writeFields maps parcelas_total/valor_total_cents by cost state `:85-87`; `assertOwnedCarro` `:108`; revalidate `/carros` + `/carros/[id]` `:168-169`. |
| `src/components/abastecimento-form.tsx` | Parcelado tab + manualOnly + 3-state onSourceChange + preview + buildInput | ✓ VERIFIED | Verified in initial pass (unchanged by 27-05). |
| `src/components/carro-card.tsx` | Novo abastecimento button on card face + "Ver detalhes" affordance | ✓ VERIFIED | Manual-only form hosted `:184-200`; "Ver detalhes" Link affordance as first ⋯ menu item `:138-140`; JSDoc `:74-75`. Anti-pattern clean. tsc clean. |
| `src/app/(app)/carros/[id]/page.tsx` | Detail hosts AbastecimentoHistory (nav target) | ✓ VERIFIED | `AbastecimentoHistory` imported `:8`, mounted `:378`; selects parcelas_total/valor_total_cents `:89`; parcelado cost-of-record from valor_total_cents `:226-236`. |
| `src/app/(app)/carros/page.tsx` | No transacoes fetch (D-01) | ✓ VERIFIED | List stays light; 0 transacoes references (unchanged by 27-05). |

### Key Link Verification

| From | To | Via | Status |
| --- | --- | --- | --- |
| carro-card.tsx | abastecimento-form.tsx | renders manualOnly form + carroId + combustivelPadrao; transacoes=[] | ✓ WIRED (`:184-200`) |
| carro-card.tsx | carros/[id]/page.tsx | "Ver detalhes" `DropdownMenuItem render={<Link href={`/carros/${carro.id}`}>}` → detail hosts AbastecimentoHistory + Editar/CR-01 | ✓ WIRED (`:138-140`) |
| abastecimentos.ts | abastecimento.ts | writeFields consumes valorTotalCents/parcelasTotal | ✓ WIRED |
| abastecimento-form.tsx | abastecimento.ts | buildInput emits validated valorTotalCents/parcelasTotal | ✓ WIRED |
| abastecimento.ts | 0039 cost_xor CHECK | superRefine mirrors truth table (defense-in-depth) | ✓ WIRED |
| carros/page.tsx | carro-card.tsx | passes CarroCardData (id + combustivelPadrao); no transacoes | ✓ WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| "Ver detalhes" affordance present (JSDoc + menu item) | `grep -c 'Ver detalhes' carro-card.tsx` | 2 | ✓ PASS |
| Affordance renders Link to detail route | `grep 'render={<Link href={`/carros/${carro.id}`}>Ver detalhes</Link>}'` | match | ✓ PASS |
| Type safety project-wide incl. carro-card.tsx | `tsc --noEmit` | exit 0, no carro-card errors | ✓ PASS |
| Schema validates 3 cost states + bounds | `vitest run abastecimento.test.ts` (prior pass) | 26 passed | ✓ PASS |
| Action writes parcelado (tx/amount null) + IDOR + à-vista non-regression | `vitest run abastecimentos.test.ts` (prior pass) | 20 passed | ✓ PASS |

Note (test environment): DB-dependent vitest suites require a local Supabase stack intentionally not running on this machine (memory-livelock risk); they error at setup (`could not read supabase status`) — environmental, not regressions attributable to phase 27. 692 non-DB tests pass; `npx tsc --noEmit` clean project-wide.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| CAR-07 | 27-03, 27-04, 27-05 | Registro de abastecimento direto da lista `/carros` (botão por carro), sem abrir detalhe — + caminho descobrível ao histórico | ✓ SATISFIED | carro-card.tsx face button + manualOnly form; "Ver detalhes" affordance closes the discoverability gap. REQUIREMENTS.md L13 `[x]`, L60 "Complete". Live-approved 27-04 + 27-05. |
| CAR-08 | 27-01, 27-02, 27-03, 27-05 | Marcar abastecimento manual como parcelado (nº parcelas + valor total) | ✓ SATISFIED | Schema 3-state + action write + form Parcelado tab; parcelado reachable in history via the new affordance. REQUIREMENTS.md L14 `[x]`, L61 "Complete". 46 tests pass; live-approved 27-03 + 27-05. |

No orphaned requirements: REQUIREMENTS.md maps exactly CAR-07/CAR-08 to Phase 27 (L73), both claimed across the plans and both now checked `[x]` / "Complete" (the prior verification's noted CAR-07 bookkeeping lag is resolved).

### Anti-Patterns Found

None. `src/components/carro-card.tsx` (the 27-05 artifact) scanned for TBD/FIXME/XXX/HACK/PLACEHOLDER/TODO/stub markers — clean. Code review of the 27-05 diff (commit `a4b9259`) reports 0 critical / 0 warning / 1 info (two intentional nav surfaces to the same route — by design, matches ReservaCard).

### Human Verification Required

None outstanding. All three blocking human-verify checkpoints were live-approved by the owner:
- 27-03 (Parcelado tab + live preview + bounds 2–24 + manual-only mode) — approved 2026-06-21.
- 27-04 (face button + manual-only form + end-to-end registration via list) — approved 2026-06-22.
- 27-05 ("Ver detalhes" affordance → detail discoverable, history + Editar reachable, card interactivity intact) — approved 2026-06-22.

### Gaps Summary

No gaps. The one major UAT discoverability gap is closed and live-verified. All 5 observable truths are achieved in the codebase: the list-page quick-register button (CAR-07), end-to-end manual registration appearing in history, the parcelado cost state (CAR-08) validated and persisted, IDOR-safe / no-double-count writes, and a discoverable navigation affordance ("Ver detalhes") that makes the history + Editar/CR-01 reachable from the list. Schema and action behaviors are test-proven (46 phase-targeted tests); UI-runtime behaviors are live-approved across three blocking human-verify checkpoints. Phase goal holds end-to-end.

---

_Verified: 2026-06-22T14:10:00Z_
_Verifier: Claude (gsd-verifier)_
