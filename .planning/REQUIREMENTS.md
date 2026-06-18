# Requirements: Gestão Financeira Pessoal — v1.3 "Produção & PDF"

**Defined:** 2026-06-18
**Core Value:** Subir uma fatura e ver os gastos classificados automaticamente (memória de padrões + IA só no caso novo, com confirmação) junto com a aderência às metas.

## v1.3 Requirements

Requisitos deste milestone. Cada um mapeia para uma fase do ROADMAP.

### Deploy & Produção

Levar o app (11 fases code-complete no stack local) ao ar de verdade e provar o core value ao vivo. Executa os 6 walkthroughs `autonomous:false` diferidos (01-04, 02-05, 03-06, 04-04, 05-04, 06-05; verificar também 07-07).

- [ ] **DEPLOY-01**: Supabase pessoal remoto provisionado — migrations 0001-0028 aplicadas no projeto remoto, RLS ativo em todas as tabelas, typed client sem drift
- [ ] **DEPLOY-02**: App deployado na Vercel (produção) com env vars/secrets configurados (Supabase URL + anon/service keys, chave do provedor de IA / AI Gateway), `maxDuration` nas rotas de parsing
- [ ] **DEPLOY-03**: Usuário loga em produção com sua conta pessoal; sessão persiste entre refresh; RLS isola os dados (nenhum acesso cross-user)
- [ ] **DEPLOY-04**: Upload de fatura grava no Storage privado por `user_id` em produção (Storage RLS), e o parsing server-side roda no runtime Node da Vercel a partir do buffer
- [ ] **DEPLOY-05**: Core value verificado ao vivo em produção — usuário sobe uma fatura real, vê a classificação (memória + IA no caso novo, com confirmação) e a aderência às metas (mensal **e** anual) funcionando

### PDF de Fatura

Trazer o upload de fatura em PDF, adiado do v1. Tratado como **best-effort com confirmação humana obrigatória** — variância de PDF BR é alta.

- [ ] **PDF-01**: Usuário sobe fatura em PDF pela mesma UI de upload (junto de CSV/OFX); o arquivo persiste no Storage privado por `user_id`
- [ ] **PDF-02**: Sistema extrai as linhas de transação do PDF (`pdf-parse` v2 `getTable`; `unpdf` como fallback de texto) e normaliza para o shape canônico (data, descrição, valor em centavos inteiros)
- [ ] **PDF-03**: Transações extraídas do PDF aparecem no review grid editável **antes** de persistir; nenhuma linha derivada de PDF é auto-commitada — usuário corrige/confirma primeiro
- [ ] **PDF-04**: PDF sem texto extraível (image-only/escaneado) → mensagem clara orientando CSV/OFX daquele banco; nunca produz resultado vazio silencioso
- [ ] **PDF-05**: Após confirmação no grid, as transações do PDF entram no mesmo pipeline de classificação (memória → IA no caso novo) e contam nas metas, idêntico a CSV/OFX

### Tech Debt & Housekeeping

Fechar dívidas aceitas no encerramento do v1.2, de preferência antes de migrar dados para produção.

- [ ] **DEBT-01** (WR-02): migration 0029 corrige o edge same-odometer em `v_abastecimento_consumo` (km/l não subestima / R$/km não superestima quando dois tanques cheios compartilham o mesmo odômetro)
- [ ] **DEBT-02**: frontmatter dos SUMMARY das fases 9/10 inclui `requirements_completed` para CAR-02/03/04 (rastreabilidade correta)

## Future Requirements

Reconhecidos mas fora deste milestone.

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
| DEPLOY-01 | TBD | Pending |
| DEPLOY-02 | TBD | Pending |
| DEPLOY-03 | TBD | Pending |
| DEPLOY-04 | TBD | Pending |
| DEPLOY-05 | TBD | Pending |
| PDF-01 | TBD | Pending |
| PDF-02 | TBD | Pending |
| PDF-03 | TBD | Pending |
| PDF-04 | TBD | Pending |
| PDF-05 | TBD | Pending |
| DEBT-01 | TBD | Pending |
| DEBT-02 | TBD | Pending |

**Coverage:**
- v1.3 requirements: 12 total
- Mapped to phases: 0 (roadmap pendente)
- Unmapped: 12 ⚠️

---
*Requirements defined: 2026-06-18*
*Last updated: 2026-06-18 after milestone v1.3 definition*
