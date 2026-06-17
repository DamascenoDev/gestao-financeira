# Phase 6: Endurecimento (LGPD, isolamento, auditoria) - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — all 3 grey areas accepted as recommended

<domain>
## Phase Boundary

Fase final de endurecimento: transforma "parece pronto" em "está pronto" antes de a esposa entrar como segundo titular. Entrega os direitos LGPD do titular (exportar + apagar tudo), o export CSV de transações, e prova com testes o isolamento por usuário (4 verbos, todas as tabelas + Storage) e o tratamento mínimo de dados sensíveis (segredos fora do bundle, faturas só por signed URL, nenhuma PII enviada a IA). Contra o Supabase LOCAL.

Inclui: export bundle completo (LGPD), delete de conta+dados (server-only), export CSV de transações, teste abrangente de isolamento 2-usuários, auditoria de segredos/Storage/PII. NÃO inclui novas features de produto.

Cobre: DATA-01, DATA-02, SEC-01.

</domain>

<decisions>
## Implementation Decisions

### LGPD export/delete
- "Baixar meus dados": bundle (JSON + CSVs) de TODAS as linhas do usuário — incomes (templates+occurrences), transactions, categories, budget_targets, reservas, reserva_ledger, mei (settings/year_flags/invoices), merchant_patterns, statements (metadados) — DATA-02
- Apagar: Server Action SERVER-ONLY que apaga todas as minhas linhas + arquivos no Storage (`{user_id}/`) + o usuário em auth.users — usa o admin/service-role client (NUNCA exposto ao cliente; service-role só no servidor) — DATA-02
- Confirmação: type-to-confirm (digitar "APAGAR") com aviso forte de irreversibilidade; após apagar, sign out
- Escopo do delete: tudo — DB + Storage + auth

### CSV export (DATA-01)
- Export CSV das transações (filtrável por período) reusando o padrão `ExportCsvButton` + um `transactionsToCsv` (espelha o `meiReportToCsv` da Fase 5)
- Relatório MEI: reusar o export já entregue na Fase 5 (não refazer)
- Formato pt-BR consistente: BOM + separador `;` + vírgula decimal (mesmo de `src/lib/mei/csv.ts`)

### Auditoria & isolamento (SEC-01)
- Teste abrangente de isolamento 2-usuários: o usuário B não consegue SELECT/INSERT/UPDATE/DELETE nenhuma linha do usuário A — nos 4 verbos, em TODAS as tabelas E no Storage (estende o harness `tests/helpers/local-supabase.ts` + `rls-isolation.test.ts` para cobrir o conjunto completo de tabelas, idealmente data-driven sobre a lista de tabelas)
- Auditoria de segredos: teste que faz grep no bundle client buildado por marcadores de service-role/secret (estende `scripts/check-bundle-secrets.sh` + `bundle-secret-grep.test.ts`)
- Auditoria de Storage: teste que confirma que faturas só são acessíveis por signed URL (sem `getPublicUrl`, bucket privado)
- Auditoria PII→IA: guard test — não há dependência `@ai-sdk`/`ai`, `suggestCategory` retorna null (sem chamada externa), zero egress de PII (a IA está deferida; o guard garante que isso continue verdade)

### Claude's Discretion
- Forma exata do bundle de export (zip vs JSON único com CSVs embutidos)
- Layout da tela de Privacidade/Conta (export + delete)
- Como o admin/service-role client é instanciado server-only (env var, server-only import)
- Estrutura do teste data-driven de isolamento (lista de tabelas central)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/mei/csv.ts` (`meiReportToCsv`, BOM+;+pt-BR) + `ExportCsvButton` (Fase 5) — o padrão de export CSV; estender para transações e para o bundle
- `tests/helpers/local-supabase.ts` + `tests/rls-isolation.test.ts` + `category-idor.test.ts` + os vários `*-rls`/`view-leak` — base do teste de isolamento abrangente
- `scripts/check-bundle-secrets.sh` + `tests/bundle-secret-grep.test.ts` (Fase 1) — base da auditoria de segredos
- `src/lib/ownership.ts`, padrão Server Action Zod + getClaims; bucket privado `statements` por pasta `{user_id}/` (signed URL no upload, Fase 4)
- `src/lib/supabase/server.ts` (clients) — o admin/service-role client é uma adição server-only

### Established Patterns
- TS estrito, dinheiro bigint centavos, pt-BR. Migrations versionadas aplicadas no LOCAL, types regenerados. TDD contra stack local. Lições: validar ownership (IDOR); test-first pega bugs reais; RLS é a fronteira; segredos server-only.
- Service-role/secret key NUNCA no bundle client (SEC-02 da Fase 1) — o delete LGPD é o primeiro uso legítimo do service-role, e DEVE ficar server-only.

### Integration Points
- Tela "Privacidade"/"Conta" no shell `(app)`; export de transações pode entrar no extrato ou na tela de conta
- O teste de isolamento valida o invariante multi-user que sustenta a entrada futura da esposa (MUL-01, v2)

</code_context>

<specifics>
## Specific Ideas

- O delete LGPD é a operação mais perigosa do app — server-only, service-role, type-to-confirm, irreversível, apaga DB+Storage+auth. Tratar com o máximo de cuidado e teste (incluindo: apagar o usuário A não toca dados do usuário B).
- O teste de isolamento abrangente é o entregável-chave da fase: é a prova de que o multi-user-ready realmente isola, antes de a esposa entrar.
- Segredo service-role: garantir por teste que NÃO vaza para o bundle (é o primeiro uso dele no projeto).

</specifics>

<deferred>
## Deferred Ideas

- UI de conta compartilhada/família para a esposa (MUL-01) → v2 (este teste de isolamento é o pré-requisito)
- Chamada LLM real (CLS-02) + provider/key → pós-v1 (o guard PII garante que nada vaza enquanto isso)
- Deploy remoto + wiring de credenciais (01-04) → fim do milestone, quando o usuário tiver as credenciais
