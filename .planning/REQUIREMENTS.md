# Requirements: Gestão Financeira Pessoal — Milestone v1.4 "IA de Classificação (BYOK)"

**Defined:** 2026-06-18
**Core Value:** Subir uma fatura e ver os gastos classificados automaticamente — o sistema aprende cada padrão merchant→categoria a partir das confirmações — junto com a aderência às metas. Se tudo mais falhar, classificação inteligente com memória + visão de metas tem que funcionar.

> **Escopo deste milestone:** wire da IA nos seams já prontos (`suggestCategory()` / `validateSuggestion` / `SuggestionSlot`) — memory-first, IA só no cache-miss, confirmação humana antes de virar padrão — com BYOK multi-provedor (Gemini + Claude no lançamento; chave criptografada no Supabase Vault); mais a quitação da dívida carregada do v1.3. Tudo aditivo: o pipeline ingest→review→confirm→learn do v1.3 não muda.

## v1.4 Requirements

Requisitos deste milestone. Cada um mapeia para uma fase do roadmap.

### BYOK — Configuração de IA (provedor + chave)

- [ ] **BYOK-01**: Usuário pode escolher o provedor de IA (Gemini ou Claude) numa tela de Settings de IA
- [ ] **BYOK-02**: Usuário pode colar/atualizar a própria chave API; a chave é gravada **criptografada at-rest** (Supabase Vault) e nunca é exibida de volta (form write-only — a tela mostra "chave configurada ✓", não a chave)
- [ ] **BYOK-03**: Usuário pode **testar a conexão** (ping barato que valida chave + provedor) antes de confiar na configuração
- [ ] **BYOK-04**: A chave é escopada por `user_id` + RLS e **nunca alcança o client** — só `has_key` + `provider` são expostos; decrypt acontece server-only
- [ ] **BYOK-05**: Usuário pode remover/trocar a chave; sem chave o app volta ao estado pré-IA (pick manual) sem quebrar

### CLSAI — Classificação assistida por IA

- [ ] **CLSAI-01**: Para descritor novo (cache-miss da memória), o sistema sugere automaticamente uma categoria via IA, pré-preenchida no `SuggestionSlot` da review grid
- [ ] **CLSAI-02**: A IA roda **só no cache-miss** — descritor já conhecido pela memória de padrões NÃO dispara chamada de IA (memory-first)
- [ ] **CLSAI-03**: Os descritores não-vistos de um upload são **deduplicados e agrupados numa única chamada de IA por upload** (custo/latência)
- [ ] **CLSAI-04**: A sugestão é **restrita às categorias atuais do usuário** (enum vivo, lido no momento da chamada); quando "nenhuma se encaixa" o slot fica vazio em vez de chutar
- [ ] **CLSAI-05**: **Nenhuma sugestão é auto-commitada** — só vira padrão salvo na memória quando o usuário confirma; o loop de confirm/learn do v1.3 permanece intacto
- [ ] **CLSAI-06**: Sem chave / erro de provedor / rate-limit / saída malformada **degrada graciosamente** para o pick manual — o upload nunca falha por causa da IA
- [ ] **CLSAI-07**: Usuário vê a **procedência** de cada sugestão (memória vs IA) na review grid
- [ ] **CLSAI-08**: Usuário vê uma **dica de confiança** por linha e as linhas de baixa confiança **ordenam primeiro** na review grid

### DEBT — Limpeza de dívida v1.3 (fase isolada)

- [ ] **DEBT-03**: Os fixes cosméticos G-07/G-08 (sentinel do grid de importação + toast "0 importadas") estão no **bundle de produção** (redeploy do commit `2ae93fb`)
- [ ] **DEBT-04**: Walkthrough hands-on em **produção** do MEI (12-06: downloads CSV/JSON) confirma os reqs MEI-* ao vivo
- [x] **DEBT-05**: Walkthrough hands-on em **produção** do LGPD (12-07: export de dados + delete de conta throwaway) confirma DATA-*/SEC-01 ao vivo — executado com **backup do DB + `user_id` throwaway confirmado + double-confirm do delete, nunca via dev server** (que aponta para PROD)
- [x] **DEBT-06**: `VALIDATION.md` de Nyquist gerado/preenchido para as Phases 12 e 13 (12 ausente, 13 draft)

## Future Requirements

Reconhecidos, deferidos — não neste roadmap.

### IA — Provedores e tuning

- **CLSAI-F1**: DeepSeek como 3º provedor BYOK (aditivo — factory já provider-agnostic). Bloqueado por: DeepSeek não suporta `json_schema` (só `json_object`, exige adapter por-provedor) + churn do model-id (`deepseek-chat` deprecia 2026-07-24 → `deepseek-v4-flash`)
- **CLSAI-F2**: Seleção de model por provedor na UI (por ora: cheap default hard-coded — `gemini-2.5-flash-lite` / `claude-haiku-4-5`)
- **CLSAI-F3**: A/B entre provedores / auto-fallback quando o ativo erra
- **CLSAI-F4**: BYOK multi-usuário (esposa) — modelo de dados já está pronto, falta só a superfície

## Out of Scope

Excluídos explicitamente (anti-features da pesquisa) — documentados p/ evitar scope creep.

| Feature | Reason |
|---------|--------|
| Auto-commit de sugestões da IA | Viola o human-in-the-loop / core value (confirmação antes de memorizar) |
| Streaming por-transação da classificação | Desnecessário p/ um confirm-loop em lote; over-engineering |
| Fine-tuning / modelo próprio | Over-engineering p/ app single-user; provedores cheap bastam |
| Multi-model voting | Custo + latência sem ganho de precisão no caso pessoal |
| Geração de categoria livre pela IA (fora do enum) | Quebra a contabilidade e a memória de padrões; saída tem que ser enum-constrained |
| Armazenar a chave em env da Vercel ou app-side em plaintext | A chave é BYOK criptografada no Vault, escopada por usuário; env-var não é multi-user nem rotacionável pelo usuário |
| Reclassificar merchants já memorizados | Desperdício de custo — memory-first é a regra |
| AI Gateway (Vercel) como transporte | Escolhidos pacotes `@ai-sdk` diretos p/ BYOK-por-provedor-pessoal (chave colada no app, não no dashboard Vercel) |

## Traceability

Mapa requisito→fase. Preenchido na criação do roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BYOK-01 | Phase 14 | Pending |
| BYOK-02 | Phase 14 | Pending |
| BYOK-03 | Phase 14 | Pending |
| BYOK-04 | Phase 14 | Pending |
| BYOK-05 | Phase 14 | Pending |
| CLSAI-01 | Phase 15 | Pending |
| CLSAI-02 | Phase 15 | Pending |
| CLSAI-03 | Phase 15 | Pending |
| CLSAI-04 | Phase 15 | Pending |
| CLSAI-05 | Phase 15 | Pending |
| CLSAI-06 | Phase 15 | Pending |
| CLSAI-07 | Phase 16 | Pending |
| CLSAI-08 | Phase 16 | Pending |
| DEBT-03 | Phase 17 | Pending |
| DEBT-04 | Phase 17 | Pending |
| DEBT-05 | Phase 17 | Complete |
| DEBT-06 | Phase 17 | Complete |

**Coverage:**

- v1.4 requirements: 17 total
- Mapped to phases: 17 ✓ (BYOK-01..05 → P14 · CLSAI-01..06 → P15 · CLSAI-07/08 → P16 · DEBT-03..06 → P17)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-18*
*Last updated: 2026-06-18 — roadmap criado, traceability preenchida (Phases 14–17, 17/17 mapeados).*
