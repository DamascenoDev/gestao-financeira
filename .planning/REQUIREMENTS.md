# Requirements: Gestão Financeira Pessoal — Milestone v1.5 "Classificação determinística"

**Defined:** 2026-06-19
**Core Value:** Subir uma fatura e ver os gastos classificados automaticamente (memória + regras determinísticas + IA) junto com a aderência às metas. Se tudo mais falhar, classificação inteligente com memória + visão de metas tem que funcionar.

## Milestone v1.5 Requirements

Requirements for this milestone. Each maps to exactly one roadmap phase.

### Regras de palavra-chave (KW)

- [ ] **KW-01**: O usuário adiciona/remove palavras-chave numa categoria, na tela `/categorias` (cadastro manual, editável).
- [ ] **KW-02**: No upload, um descritor que CONTÉM uma palavra-chave cadastrada é auto-classificado para aquela categoria (linha pré-preenchida, `source = "palavra-chave"`), sem clique — espelhando o comportamento de pré-preenchimento da memória.
- [ ] **KW-03**: A classificação roda na ordem **memória → palavra-chave → IA**: um hit de memória prevalece; a palavra-chave roda antes do pass de IA; a IA só é chamada para os descritores que sobraram (reduz chamadas de IA).
- [ ] **KW-04**: Quando um descritor casa palavras-chave de MAIS de uma categoria, a **palavra-chave mais longa vence** (match mais específico).
- [ ] **KW-05**: Uma linha classificada por palavra-chave é sobrescrevível na grid de revisão; nada persiste até o confirm; o confirm aprende o padrão merchant→categoria na memória como hoje (sem auto-commit em `transactions`/`merchant_patterns` antes do confirm).
- [ ] **KW-06**: As regras de palavra-chave são escopadas por `user_id` + RLS (multi-user-ready, como toda tabela de domínio).

### Ajuste do prompt da IA (CLSAI)

- [x] **CLSAI-09**: O prompt de classificação por IA é *kind-aware* — cada categoria é enviada com seu `kind` (consumo/alocação) e o modelo é instruído a NÃO atribuir categorias de alocação (ex.: Investimentos, Reserva) a compras/gastos. Corrige a classe de erro "AliExpress/Mercado Livre → Investimentos".

### Categoria Marketplace em produção (MKT)

- [ ] **MKT-01**: A categoria default "Marketplace" (migration `0035`) está aplicada em PROD (`supabase db push`) e presente na conta — dando à IA e às regras um bucket de compras de marketplace.

## Future Requirements

Deferred — acknowledged but not in this milestone's roadmap.

### Regras avançadas (KW-future)

- **KW-F1**: Sugerir palavras-chave automaticamente a partir de padrões confirmados (semi-automático) — v1.5 é cadastro manual.
- **KW-F2**: Match por regex/wildcard além de substring.

### PDF avançado

- **PDF-F1**: Parser por banco / OCR para PDFs image-only — só se um banco real falhar no `getText`.

## Out of Scope

Explicitly excluded for v1.5. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Auto-aprendizado de palavras-chave | v1.5 é cadastro manual explícito; aprender keywords é fuzzy e fica para o futuro (KW-F1) |
| Match por regex/wildcard | Substring no `descriptor_norm` cobre o caso de uso; regex adiciona complexidade/erro (KW-F2) |
| Regras de palavra-chave para carro/reserva | v1.5 escopa regras só para CATEGORIAS (a etiquetagem de carro/reserva continua manual) |
| Trocar/abandonar a camada de IA | A IA continua como fallback para o que memória + palavra-chave não cobrem |
| OCR de PDF image-only | Fora de escopo desde o v1 (steer para OFX/CSV) |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| KW-01 | Phase 19 | Pending |
| KW-02 | Phase 20 | Pending |
| KW-03 | Phase 20 | Pending |
| KW-04 | Phase 20 | Pending |
| KW-05 | Phase 20 | Pending |
| KW-06 | Phase 19 | Pending |
| CLSAI-09 | Phase 18 | Complete |
| MKT-01 | Phase 18 | Pending |

**Coverage:**

- v1.5 requirements: 8 total
- Mapped to phases: 8 ✓ (Phase 18: MKT-01, CLSAI-09 · Phase 19: KW-01, KW-06 · Phase 20: KW-02, KW-03, KW-04, KW-05)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-19*
*Last updated: 2026-06-19 after roadmap creation — 8/8 v1.5 requirements mapped to phases 18–20.*
