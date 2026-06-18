# Requirements: Gestão Financeira Pessoal — v1.3 "Produção & PDF"

**Defined:** 2026-06-18
**Core Value:** Subir uma fatura e ver os gastos classificados automaticamente (memória de padrões + IA só no caso novo, com confirmação) junto com a aderência às metas.

## v1.3 Requirements

Requisitos deste milestone. Cada um mapeia para uma fase do ROADMAP.

### Deploy & Produção

Levar o app (11 fases code-complete no stack local) ao ar de verdade e provar o core value ao vivo. Executa os 6 walkthroughs `autonomous:false` diferidos (01-04, 02-05, 03-06, 04-04, 05-04, 06-05; verificar também 07-07).

- [x] **DEPLOY-01**: Supabase pessoal remoto provisionado (região São Paulo `sa-east-1`) — migrations 0001-0029 aplicadas no projeto remoto (inclui a 0029 do WR-02), RLS ativo em todas as tabelas, typed client sem drift
- [x] **DEPLOY-02**: App deployado na Vercel (produção, região `gru1`) com env vars configuradas (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_SECRET_KEY` se usado), `maxDuration` nas rotas de parsing. (Sem chave de IA — classificação por IA deferida, ver Future.)
- [x] **DEPLOY-03**: Usuário loga em produção com sua conta pessoal; sessão persiste entre refresh; RLS isola os dados (nenhum acesso cross-user)
- [ ] **DEPLOY-04**: Upload de fatura grava no Storage privado por `user_id` em produção (Storage RLS), e o parsing server-side roda no runtime Node da Vercel a partir do buffer
- [ ] **DEPLOY-05**: Core value verificado ao vivo em produção — usuário sobe uma fatura real (OFX/CSV), vê a classificação por **memória** (estabelecimento conhecido auto-classifica; novo = pick manual que vira padrão aprendido — **IA deferida, ver Future**) e a aderência às metas (mensal **e** anual) funcionando

### PDF de Fatura

Trazer o upload de fatura em PDF, adiado do v1. Tratado como **best-effort com confirmação humana obrigatória** — variância de PDF BR é alta.

- [x] **PDF-01**: Usuário sobe fatura em PDF pela mesma UI de upload (junto de CSV/OFX); o arquivo persiste no Storage privado por `user_id`
- [x] **PDF-02**: Sistema extrai as linhas de transação do PDF (`pdf-parse` v2 `getTable`; `unpdf` como fallback de texto) e normaliza para o shape canônico (data, descrição, valor em centavos inteiros)
- [x] **PDF-03**: Transações extraídas do PDF aparecem no review grid editável **antes** de persistir; nenhuma linha derivada de PDF é auto-commitada — usuário corrige/confirma primeiro
- [x] **PDF-04**: PDF sem texto extraível (image-only/escaneado) → mensagem clara orientando CSV/OFX daquele banco; nunca produz resultado vazio silencioso
- [x] **PDF-05**: Após confirmação no grid, as transações do PDF entram no mesmo pipeline de classificação (memória; IA deferida) e contam nas metas, idêntico a CSV/OFX

### Tech Debt & Housekeeping

Fechar dívidas aceitas no encerramento do v1.2, de preferência antes de migrar dados para produção.

- [x] **DEBT-01** (WR-02): migration 0029 corrige o edge same-odometer em `v_abastecimento_consumo` (km/l não subestima / R$/km não superestima quando dois tanques cheios compartilham o mesmo odômetro)
- [x] **DEBT-02**: frontmatter dos SUMMARY das fases 9/10 inclui `requirements_completed` para CAR-02/03/04 (rastreabilidade correta)

## Future Requirements

Reconhecidos mas fora deste milestone.

### Classificação por IA (deferida para v1.4)

- **CLS-AI**: Classificação assistida por IA no caso de estabelecimento novo — wire AI SDK + Gemini 2.5 Flash-Lite via AI Gateway no seam `suggestCategory()` já existente (memory-first, IA só no miss, confirmação humana antes de virar padrão). O seam, o `validateSuggestion` enum wrapper e o `SuggestionSlot` já estão prontos → additivo. NÃO construída no v1 (CLS-02 deferido); descoberta na discuss da Phase 12 — o "core value" do v1.3 é memory-only.

### PDF avançado

- **PDF-F1**: OCR para faturas image-only (fora de escopo — problema de OCR, não de extração de texto)
- **PDF-F2**: Parsers específicos por banco para layouts de PDF problemáticos (só se um banco real do usuário falhar no getTable/unpdf)

## Out of Scope

| Feature | Reason |
|---------|--------|
| OCR de PDF escaneado/image-only | Problema de OCR, fora do escopo do v1.x; orientar CSV/OFX daquele banco |
| Auto-commit de linhas extraídas de PDF | Variância de PDF BR → revisão humana obrigatória antes de persistir |
| Integração bancária automática (Open Finance) | Já fora de escopo do produto — ingestão é upload manual |
| Conta compartilhada / esposa (UI) | Só o modelo de dados fica pronto; UI compartilhada é milestone futuro |

## Traceability

Quais fases cobrem quais requisitos. Preenchido na criação do roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEPLOY-01 | Phase 12 | Complete |
| DEPLOY-02 | Phase 12 | Complete |
| DEPLOY-03 | Phase 12 | Complete |
| DEPLOY-04 | Phase 12 | Pending |
| DEPLOY-05 | Phase 12 | Pending |
| PDF-01 | Phase 13 | Complete |
| PDF-02 | Phase 13 | Complete |
| PDF-03 | Phase 13 | Complete |
| PDF-04 | Phase 13 | Complete |
| PDF-05 | Phase 13 | Complete |
| DEBT-01 | Phase 12 | Complete |
| DEBT-02 | Phase 12 | Complete |

**Coverage:**

- v1.3 requirements: 12 total
- Mapped to phases: 12 (Phase 12: DEPLOY-01..05 + DEBT-01 + DEBT-02; Phase 13: PDF-01..05) ✓
- Unmapped: 0

---
*Requirements defined: 2026-06-18*
*Last updated: 2026-06-18 after v1.3 roadmap — 12/12 requirements mapped (Phase 12 deploy+debt, Phase 13 PDF)*
