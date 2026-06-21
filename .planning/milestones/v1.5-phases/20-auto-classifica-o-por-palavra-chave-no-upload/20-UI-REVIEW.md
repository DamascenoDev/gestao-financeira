# Phase 20 — UI Review

**Status:** resolved — 23/24, 3 warnings all accepted (no code change; contract-faithful, no current bug)

> **Resolution (2026-06-19):** all three warnings are advisory, not defects on the shipped code:
> - **#1 origin fallback (`else → 'memória'`)** — ACCEPTED. At the parsed-row stage a classified row's `classification_source` is only ever `'memória'` or `'palavra-chave'` (the memory + keyword passes are the only binders; AI is a non-binding suggestion). The fallback is correct for the actual value set; the concern is a hypothetical future binding source. Revisit only if such a source is added.
> - **#2 tooltip** — ACCEPTED as-is (the auditor confirmed no-tooltip is contract-compliant; adding one would have to be symmetric with memória to preserve the locked mirror).
> - **#3 duplicated `não classificada` override** — ACCEPTED (cosmetic DRY; out of scope for KW-02..05). Optional future `originVariantFor(row)` helper extraction.
> No BLOCKERs; the badge is a high-fidelity mirror of the memória treatment.

**Audited:** 2026-06-19
**Baseline:** 20-UI-SPEC.md (approved design contract — INTENTIONALLY TINY, additive)
**Screenshots:** not captured (no Playwright MCP — code-level audit per orchestrator instruction; dev server was live at :3000 but visual capture was out of scope)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | Both labels match the locked per-surface casing exactly: `palavra-chave` (lowercase) + `Palavra-chave` (Title Case). |
| 2. Visuals | 4/4 | Distinct `Tags` icon in OriginBadge keeps palavra-chave distinguishable from memória's `Brain`; both pills reuse exact existing geometry. |
| 3. Color | 4/4 | Neutral-only treatment honored on both surfaces (`bg-secondary` / `bg-muted`); zero gold-IA or amber leakage, zero new/hardcoded colors. |
| 4. Typography | 4/4 | No new type — reuses `text-xs font-medium` pill label verbatim. |
| 5. Spacing | 4/4 | No new spacing — both surfaces reuse the `h-5 px-2 py-0.5 gap-1 rounded-4xl` pill, no reflow. |
| 6. Experience Design | 3/4 | Mutual-exclusivity gate is correct and overwrite path drops the pill as specified; one robustness note on the origin-derivation fallback (WARNING). |

**Overall: 23/24**

---

## Top 3 Priority Fixes

1. **Origin-derivation fallback collapses any unknown classified source to `'memória'`** (WARNING) — `page.tsx:208-213` derives origin as `category_id === null ? 'não classificada' : source === 'palavra-chave' ? 'palavra-chave' : 'memória'`. Today only `'memória'`/`'palavra-chave'` reach a classified parsed row, so it is correct, but the `else → 'memória'` branch silently mislabels any future `classification_source` (e.g. a persisted `'manual'`/`'sugerida'`) as memória — *user impact:* a wrong provenance pill on a classified row, defeating the whole point of the badge. *Fix:* map `'manual'`/`'sugerida'` explicitly (or fall to `'manual'`), and reserve `'memória'` only for `source === 'memória'`.
2. **No `title`/tooltip on either pill to disambiguate `palavra-chave` vs `memória`** (WARNING, minor) — the two neutral pills share the same ground; on the ProvenanceBadge surface they differ only by label text (no icon). *User impact:* at a glance in a dense grid the lowercase `palavra-chave` reads as "another neutral chip." *Fix (optional, consistency-preserving):* leave as-is to match the locked memória treatment, OR add the same `title` to both memória and palavra-chave so the change stays symmetric (do NOT add to only one).
3. **OriginBadge `não classificada` override is duplicated at two call sites** (WARNING, maintainability) — `import-review-table.tsx:538-543` (desktop) and `:823-825` (mobile) both inline `category_id === null ? 'não classificada' : row.origin`. *User impact:* none today (both agree). *Fix:* extract a tiny `originVariantFor(row)` helper so the keyword/memória/manual mapping cannot drift between the two surfaces in a future edit.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)
Contract requires per-surface casing. Verified:
- `ProvenanceBadge` (`import-review-table.tsx:142-148`): literal `palavra-chave` (lowercase) — matches the lowercase `memória` sibling at `:135-140`. PASS.
- `OriginBadge.VARIANT['palavra-chave'].label` (`origin-badge.tsx:36`): `'Palavra-chave'` (Title Case) — matches the Title-Case `'Memória'` at `:28`. PASS.
- No third casing introduced; no generic/placeholder strings. No new CTA, empty, or error copy (correctly N/A per contract — the matcher is pure in-memory, no new error surface).

### Pillar 2: Visuals (4/4)
- Distinct iconography: keyword OriginBadge uses `Tags` (`origin-badge.tsx:1,38`) while `Brain` stays reserved for memória (`:30`) — satisfies the SPEC a11y rule that the two neutral states differ beyond hue.
- ProvenanceBadge correctly has NO icon (mirrors memória) at `:142-148`.
- Both pills are non-interactive `<span>`s — no new focus/tab-order surface, matching the contract.
- Icon carries `aria-hidden` and `size-3 shrink-0` (`origin-badge.tsx:73`); the text label is always rendered, so color/icon is never the sole signal.

### Pillar 3: Color (4/4)
- ProvenanceBadge keyword branch: `bg-secondary text-secondary-foreground` (`:144`) — exact match to memória (`:137`). PASS.
- OriginBadge keyword variant: `bg-muted text-muted-foreground` (`:37`) — exact match to memória (`:29`). PASS.
- Zero gold (`bg-primary/10 text-primary` stays only on the IA/`sugerida` paths at `:153` and `origin-badge.tsx:52`), zero `--consumption` amber leakage onto the keyword state.
- All four referenced tokens (`--secondary`, `--muted`, `--primary`, `--consumption`) confirmed present in `globals.css` (light `:67-78`, dark `:112-125`) — no invented tokens.
- No hardcoded hex/rgb introduced.

### Pillar 4: Typography (4/4)
Both pills inherit the shared `inline-flex h-5 … text-xs font-medium` class string (`AffordancePill` `import-review-table.tsx:114`; `OriginBadge` `:68`). No new size or weight. PASS.

### Pillar 5: Spacing (4/4)
Pill geometry reused verbatim: `h-5 w-fit px-2 py-0.5 gap-1 rounded-4xl` on both surfaces. The Categoria affordance row (`:977 flex flex-wrap items-center gap-1`) and the Origem cell are unchanged — no reflow, no new spacing token. PASS.

### Pillar 6: Experience Design (3/4)
- **Mutual exclusivity correct:** the `row.category_id !== null` gate in `ProvenanceBadge` (`:134`) guarantees a keyword row (category set) can never co-render the IA/`não classificada` states. PASS.
- **Overwrite path correct (KW-05):** `classifyRow` (`:344-360`) sets `origin: 'manual'`, so picking a new category drops the keyword pill and flips Origem to "Manual" exactly like a memória overwrite. No new dialog/chip/button. PASS.
- **No auto-commit:** confirm payload (`:625-635`) is unchanged; nothing persists before `confirmImport`. PASS.
- **Both surfaces wired:** desktop OriginBadge (`:537`) and mobile card OriginBadge (`:823`) both read `row.origin`, so the new variant appears in both with no extra work — matches the contract's "no extra work beyond the variant-map entry."
- **WARNING (the −1):** the origin-derivation fallback in `page.tsx:208-213` is `else → 'memória'`. Correct for today's inputs but not future-proof: a classified row whose `classification_source` is anything other than `'palavra-chave'` is labeled memória, including a hypothetical persisted `'manual'`/`'sugerida'`. See Priority Fix #1. The duplicated `não classificada` override across two call sites (Fix #3) is a related maintainability risk.

---

## Registry Safety
`components.json` present with `registries: {}` — no third-party registries declared. SPEC Registry Safety table confirms no new blocks installed (`AffordancePill`/`OriginBadge`/`CategoryBadge` are in-repo; `lucide-react` `Tags` already vendored). Registry audit: 0 third-party blocks checked, no flags. Not applicable.

---

## Files Audited
- `.planning/phases/20-auto-classifica-o-por-palavra-chave-no-upload/20-UI-SPEC.md` (baseline)
- `.planning/phases/20-auto-classifica-o-por-palavra-chave-no-upload/20-CONTEXT.md` (locked decisions)
- `src/components/origin-badge.tsx` (new `'palavra-chave'` OriginVariant + VARIANT entry)
- `src/components/import-review-table.tsx` (new `ProvenanceBadge` branch; `ReviewRow.origin` union; both OriginBadge call sites)
- `src/app/(app)/importar/[statementId]/page.tsx` (origin derivation ~204-213)
- `src/app/globals.css` (token existence verification)
- `components.json` (registry check)
