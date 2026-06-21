# Phase 25: Fix de scroll na criação de palavra-chave - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Criar uma palavra-chave inline ("+ palavra-chave") numa linha da grid de revisão de
importação (`/importar/[id]`) deixa de jogar o scroll da página pro topo, mantendo a
keyword persistida e o refresh legítimo de `/categorias` intacto.

**Causa-raiz confirmada (scout):** o controle inline `KeywordInlineSuggest`
(`src/components/import-review-table.tsx`) **não** chama `router.refresh()`. O único
gatilho do scroll jump é `revalidatePath('/categorias')` dentro de `addKeyword`
(`src/actions/category-keywords.ts:94`): num Server Action, `revalidatePath` invalida
o client Router Cache e re-renderiza a rota ativa (`/importar/[id]`), resetando a
posição de scroll.

**⚠ Expansão de escopo decidida nesta discussão:** o usuário (founder) optou por
incluir **re-classificação ao vivo da grid** no P25. Isso vai ALÉM do requisito UX-01
(que cobre só scroll + persistência). Ver D-04/D-05 e a nota em Canonical References —
ROADMAP/REQUIREMENTS precisam refletir o comportamento novo (novo requisito ou SC
adicional) antes/durante o planejamento.

</domain>

<decisions>
## Implementation Decisions

### Mecanismo do fix (escopar o revalidate)
- **D-01:** Criar uma **action inline separada** (nome a definir pelo planner, ex.
  `addKeywordInline`) em vez de adicionar parâmetro a `addKeyword`. Motivo do usuário:
  não tocar o contrato compartilhado nem o path `/categorias`.
- **D-02:** Evitar duplicação via **helper privado compartilhado** (não-exportado) em
  `src/actions/category-keywords.ts`. O helper contém o core idêntico ao `addKeyword`
  atual: as 4 guards (`idSchema` uuid → `keywordSchema` → `normalizeKeyword`==''  →
  literal-count-0 `*`/`**`) + dup pre-check (`maybeSingle`) + insert + backstop 23505.
  - `addKeyword` = helper **+** `revalidatePath('/categorias')` (path `/categorias`
    inalterado → SC3 protegido).
  - `addKeywordInline` = helper **sem** revalidate (path inline → SC1).
- **D-03:** A action inline retorna a **mesma union `AddKeywordResult`**
  (`{ok}` | `{duplicate}` | `{error}`) para o branching atual do popover
  (`'error' in r` / `'duplicate' in r`) seguir inalterado. O caller inline
  (`import-review-table.tsx:1162`) troca `addKeyword` → `addKeywordInline`.

### Re-classificação ao vivo da grid (escopo expandido)
- **D-04:** Após o sucesso de `addKeywordInline`, re-rodar o matcher **puro**
  (`compileRule`/`matchKeyword` de `src/lib/classifier/keywords.ts`) **client-side**
  sobre as outras linhas da grid (estado do componente). Sem server round-trip, sem
  `revalidate` → não reintroduz o scroll jump.
- **D-05 (política de sobrescrita):** aplicar a nova keyword em linhas
  **não-classificadas (`category_id === null`) E sobrescrever as auto-classificadas
  (memória/IA)** que casam. **NUNCA** tocar linha `origin === 'manual'` (intenção
  explícita do usuário). Linhas recém-casadas recebem provenance **`'palavra-chave'`**.
- **D-06 (verificação):** vitest **+** UAT vivo no browser (Chrome MCP), padrão do repo.
  Unit cobre: (a) path inline NÃO revalida; (b) re-classify aplica em null+auto e
  **preserva manual**; (c) provenance vira `'palavra-chave'`. UAT vivo: criar keyword
  inline numa linha de baixo → confirmar que o scroll NÃO pula e as outras linhas
  atualizam.

### Claude's Discretion
- Nome exato da action inline e a assinatura do helper privado (D-01/D-02) — desde que
  o comportamento das guards fique **bit-idêntico** ao `addKeyword` atual.
- Confidence/score atribuído às linhas re-classificadas pela keyword (alinhar com como
  matches de keyword já são pontuados no pipeline de classificação).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisito + roadmap (⚠ escopo expandido)
- `.planning/REQUIREMENTS.md` — **UX-01** (scroll preservado). NÃO cobre a
  re-classificação ao vivo (D-04/D-05). Considerar novo requisito / SC adicional para
  o comportamento expandido.
- `.planning/ROADMAP.md` § "Phase 25" — Goal + Success Criteria 1–3 (scroll,
  persistência, ambos os paths). Idem: SC atual não menciona re-classify.

### Código a alterar / reusar
- `src/actions/category-keywords.ts` — `addKeyword` (def L44, `revalidatePath` L94) +
  as 4 guards/dup-check a extrair no helper privado (D-02). `removeKeyword` (L269) e
  `approveKeywordSuggestions` (L202) também revalidam `/categorias` — referência do
  padrão, **fora de escopo** (não alterar).
- `src/components/import-review-table.tsx` — `KeywordInlineSuggest` (popover inline,
  caller em ~L1162); gate de render `row.origin === 'manual' && category_id !== null`;
  shape `ReviewRow` (`origin`, `category_id`, `descriptor_norm`); `ProvenanceBadge` /
  `ConfidenceTag` (estado visual a atualizar no re-classify).
- `src/components/category-keywords-dialog.tsx` — caller `/categorias` (`addKeyword` em
  ~L97) onde o revalidate É desejado (SC3 — deve continuar via `addKeyword`).
- `src/lib/classifier/keywords.ts` — `compileRule` / `matchKeyword` / `KeywordRule`
  (matcher PURO, seguro pra rodar client-side no re-classify).
- `src/lib/normalize.ts` — `normalizeKeyword` (KW-09: preserva o glob `*`).

### Ponto de pesquisa pro researcher
- **Inversão de precedência:** o pipeline normal classifica na ordem
  **memória → palavra-chave → IA**. D-05 manda sobrescrever linha de *memória* com um
  match de keyword no re-classify ao vivo — isso inverte a precedência só na grid.
  Researcher: confirmar a semântica desejada e se a memória deve mesmo ceder pra
  keyword nesse contexto (UX da grid) sem afetar o pipeline de upload.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Matcher puro** (`compileRule`/`matchKeyword`): roda client-side, sem deps de
  servidor — viabiliza o re-classify ao vivo (D-04) sem revalidate.
- **`KeywordInlineSuggest`** + union `AddKeywordResult`: o popover e seu branching já
  existem; só o action chamado muda (D-03).
- **`ReviewRow` em estado de componente**: já tem `descriptor_norm`, `origin`,
  `category_id` — tudo que o re-classify precisa pra decidir alvo e sobrescrita.

### Established Patterns
- 4-guard validation + dup-no-op + backstop 23505 em `addKeyword` (extrair no helper,
  não reescrever).
- `revalidatePath('/categorias')` como side-effect padrão das mutations de keyword.
- Provenance/confidence das linhas dirigidos por estado da row (badges).
- Precedência de classificação memória→palavra-chave→IA (ver ponto de pesquisa).

### Integration Points
- Swap do caller inline `addKeyword` → `addKeywordInline` em `import-review-table.tsx`.
- Hook do re-classify após sucesso do inline create: atualizar `category_id` +
  provenance das linhas-alvo no estado da grid (sem refresh).

</code_context>

<specifics>
## Specific Ideas

- O fix do scroll e o re-classify ao vivo devem ambos ser **sem refresh / sem
  revalidate na rota de importação** — é justamente o refresh que causa o sintoma.
- Trava firme repetida pelo usuário: **`origin === 'manual'` é intocável** no
  re-classify.

</specifics>

<deferred>
## Deferred Ideas

None — a re-classificação ao vivo da grid (que seria candidata a fase própria) foi
**explicitamente puxada pro escopo do P25** pelo founder (D-04/D-05). Discussão
permaneceu dentro da fase resultante.

</deferred>

---

*Phase: 25-fix-de-scroll-na-cria-o-de-palavra-chave*
*Context gathered: 2026-06-21*
