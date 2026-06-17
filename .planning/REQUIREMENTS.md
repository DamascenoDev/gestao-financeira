# Requirements: Gestão Financeira Pessoal

**Defined:** 2026-06-16
**Core Value:** Subir uma fatura e ver os gastos classificados automaticamente (memória que aprende com cada confirmação) junto com a aderência às metas.

## v1 Requirements

Requisitos do release inicial. Cada um mapeia para fases do roadmap.

### Autenticação & Conta

- [x] **AUTH-01**: Usuário faz login com email/senha no Supabase pessoal (single-user no v1)
- [x] **AUTH-02**: Sessão persiste entre refreshes do browser (SSR + middleware)
- [x] **AUTH-03**: Todos os dados escopados por `user_id` com RLS em todas as tabelas e no Storage (multi-user-ready, sem migração futura)
- [x] **AUTH-04**: Usuário faz logout de qualquer página

### Receitas

- [x] **INC-01**: Usuário cadastra receita recorrente fixa (salário, pensão) que repete todo mês
- [x] **INC-02**: Usuário ajusta o valor de uma recorrente em um mês específico (quando varia)
- [x] **INC-03**: Usuário lança receita avulsa (não recorrente)
- [x] **INC-04**: Usuário vê a receita líquida recebida do mês (base de cálculo das metas %)

### Categorias

- [x] **CAT-01**: Sistema já vem com conjunto padrão BR de categorias de gasto
- [x] **CAT-02**: Usuário cria, renomeia e remove categorias
- [x] **CAT-03**: Categoria é marcada como consumo (gasto) ou alocação (investimento/poupança) — afeta como entra nas metas

### Transações / Lançamentos

- [x] **TXN-01**: Usuário lança transação manual (data, valor, descrição, categoria)
- [x] **TXN-02**: Usuário edita e exclui transações próprias
- [x] **TXN-03**: Usuário vê extrato/lista de transações com filtro por mês e categoria
- [x] **TXN-04**: Usuário reclassifica a categoria de várias transações de uma vez (bulk re-classify)

### Importação de Faturas

- [x] **IMP-01**: Usuário faz upload de arquivo OFX direto para o Supabase Storage (bucket privado)
- [x] **IMP-02**: Usuário faz upload de arquivo CSV
- [x] **IMP-03**: Sistema faz parse de OFX/CSV em transações normalizadas (centavos inteiros, data, descritor)
- [x] **IMP-04**: Sistema deduplica de forma idempotente (hash do arquivo + unique de transação) — re-upload não duplica
- [x] **IMP-05**: Usuário revisa as transações importadas antes de persistir (tela de revisão)

### Classificação Inteligente

- [x] **CLS-01**: Na importação, sistema classifica por memória primeiro (padrão merchant→categoria já aprendido)
- [ ] **CLS-02**: Para estabelecimento nunca visto, IA sugere a categoria (saída restrita ao enum de categorias do usuário)
- [x] **CLS-03**: Usuário confirma ou corrige a sugestão; só então o padrão merchant→categoria é salvo na memória
- [x] **CLS-04**: Próximas faturas com aquele descritor são auto-classificadas pela memória
- [x] **CLS-05**: A categoria gravada na transação é point-in-time (renomear categoria não reescreve o histórico)
- [x] **CLS-06**: Sistema detecta gastos recorrentes (assinaturas etc.) automaticamente

### Metas & Aderência

- [x] **BUD-01**: Usuário define meta por categoria em % da receita líquida, com direção configurável: teto (consumo, não exceder) ou alvo (investimento/poupança, atingir)
- [x] **BUD-02**: Dashboard de aderência mensal: gasto/alocado X% vs meta Y% por categoria
- [x] **BUD-03**: Visão acumulada do ano vs metas anuais
- [x] **BUD-04**: Usuário recebe alerta ao se aproximar ou estourar a meta de uma categoria

### Reservas de Oportunidade

- [x] **RSV-01**: Usuário cria reserva nomeada (ex: Apê, Carro) com valor-alvo opcional
- [x] **RSV-02**: Transação classificada como "Reserva" dispara a sub-pergunta "qual reserva?" e cria uma entrada no ledger daquela reserva
- [x] **RSV-03**: Aporte em reserva conta como alocação de investimento (entra na meta de Investimentos), não como gasto de consumo
- [x] **RSV-04**: Usuário registra saída (retirada) de uma reserva, com histórico de entradas/saídas por reserva
- [x] **RSV-05**: Saldo da reserva é sempre derivado (entradas − saídas) e mostra barra de progresso vs alvo quando houver
- [x] **RSV-06**: Sistema aprende o padrão merchant→reserva e auto-sugere a reserva nas próximas

### MEI

- [ ] **MEI-01**: Usuário registra NF de serviço emitida (data, valor, tomador, descrição)
- [x] **MEI-02**: Sistema acompanha o faturamento anual vs limite R$81k, com cap proporcional no 1º ano e banda de tolerância de 20%
- [ ] **MEI-03**: Sistema modela a receita por tipo (comércio/indústria vs serviços) e flag de funcionário (campos exigidos pela DASN)
- [ ] **MEI-04**: Sistema gera relatório anual consolidado para facilitar a declaração DASN-SIMEI
- [x] **MEI-05**: Usuário recebe alerta ao se aproximar do limite R$81k
- [x] **MEI-06**: Interface deixa claro que o módulo é informativo, não consultoria fiscal

### Dados & Privacidade

- [ ] **DATA-01**: Usuário exporta transações e relatório MEI em CSV
- [ ] **DATA-02**: Usuário exporta e apaga todos os seus dados (LGPD)

### Segurança

- [ ] **SEC-01**: RLS isola dados por usuário em tabelas e Storage, validado com teste de 2 usuários
- [x] **SEC-02**: Chaves de serviço ficam só no servidor, nunca no bundle do cliente
- [x] **SEC-03**: Na classificação via IA, só o descritor normalizado é enviado (sem PII) e a saída é validada contra o enum de categorias

## v2 Requirements

Adiados para release futuro. Rastreados, fora do roadmap atual.

### Importação

- **IMP-06**: Parse de PDF de fatura por banco (frágil — requer spike sobre amostras reais dos bancos do usuário)

### Multi-usuário

- **MUL-01**: UI de conta compartilhada/família para a esposa usar junto (modelo de dados já preparado no v1)
- **MUL-02**: Modelagem explícita de múltiplas contas bancárias

## Out of Scope

Explicitamente excluído. Documentado para evitar scope creep.

| Feature | Reason |
|---------|--------|
| E-filing automático da DASN-SIMEI | Sem API oficial, frágil e legalmente sensível — record-and-report apenas |
| Integração bancária automática (Open Finance / scraping) | Ingestão é por upload manual de faturas no v1 |
| App mobile nativo | Web app responsivo cobre o uso; nativo adiciona complexidade sem ganho no v1 |
| SaaS público / multi-tenant | Uso pessoal, não será exposto publicamente |
| Consultoria/cálculo de impostos além do MEI/DASN | Escopo fiscal limitado ao MEI; módulo é informativo |

## Traceability

Quais fases cobrem quais requisitos. Preenchido na criação do roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Complete |
| CAT-01 | Phase 1 | Complete |
| SEC-02 | Phase 1 | Complete |
| INC-01 | Phase 2 | Complete |
| INC-02 | Phase 2 | Complete |
| INC-03 | Phase 2 | Complete |
| INC-04 | Phase 2 | Complete |
| CAT-02 | Phase 2 | Complete |
| CAT-03 | Phase 2 | Complete |
| TXN-01 | Phase 2 | Complete |
| TXN-02 | Phase 2 | Complete |
| TXN-03 | Phase 2 | Complete |
| TXN-04 | Phase 2 | Complete |
| BUD-01 | Phase 3 | Complete (03-03) |
| BUD-02 | Phase 3 | Complete (03-03) |
| BUD-03 | Phase 3 | Complete (03-03) |
| BUD-04 | Phase 3 | Complete (03-03) |
| RSV-01 | Phase 3 | Complete (03-04) |
| RSV-02 | Phase 3 | Complete (03-05) |
| RSV-03 | Phase 3 | Complete (03-05) |
| RSV-04 | Phase 3 | Complete (03-04) |
| RSV-05 | Phase 3 | Complete (03-04) |
| IMP-01 | Phase 4 | Complete (04-02) |
| IMP-02 | Phase 4 | Complete (04-02) |
| IMP-03 | Phase 4 | Complete (04-02) |
| IMP-04 | Phase 4 | Complete (04-02) |
| IMP-05 | Phase 4 | Complete (04-03) |
| CLS-01 | Phase 4 | Complete (04-02) |
| CLS-02 | Phase 4 | Deferred (AI seam only — 04-01; LLM post-v1) |
| CLS-03 | Phase 4 | Complete (04-03) |
| CLS-04 | Phase 4 | Complete (04-03) |
| CLS-05 | Phase 4 | Complete (04-03) |
| CLS-06 | Phase 4 | Complete (04-03) |
| RSV-06 | Phase 4 | Complete (04-03) |
| SEC-03 | Phase 4 | Complete (04-03 — seam + enum wrapper; LLM call deferred per CLS-02) |
| MEI-01 | Phase 5 | Pending |
| MEI-02 | Phase 5 | Complete (05-02) |
| MEI-03 | Phase 5 | Pending |
| MEI-04 | Phase 5 | Pending |
| MEI-05 | Phase 5 | Complete (05-02) |
| MEI-06 | Phase 5 | Complete (05-02) |
| DATA-01 | Phase 6 | Pending |
| DATA-02 | Phase 6 | Pending |
| SEC-01 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 47 total
- Mapped to phases: 47 ✓
- Unmapped: 0 ✓

**Por fase:**
- Phase 1 (Fundação): 6 — AUTH-01/02/03/04, CAT-01, SEC-02
- Phase 2 (Receitas/categorias/lançamentos): 10 — INC-01/02/03/04, CAT-02/03, TXN-01/02/03/04
- Phase 3 (Metas/aderência/reservas): 9 — BUD-01/02/03/04, RSV-01/02/03/04/05
- Phase 4 (Upload + classificação): 13 — IMP-01/02/03/04/05, CLS-01/02/03/04/05/06, RSV-06, SEC-03
- Phase 5 (MEI/DASN): 6 — MEI-01/02/03/04/05/06
- Phase 6 (Endurecimento): 3 — DATA-01/02, SEC-01

---
*Requirements defined: 2026-06-16*
*Last updated: 2026-06-16 after roadmap creation (traceability mapped, 47/47 covered)*
