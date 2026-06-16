# Phase 1: Fundação (auth, RLS, dinheiro, schema) - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — all 3 grey areas accepted as recommended

<domain>
## Phase Boundary

Entrega a fundação onde tudo o mais assenta: o usuário entra na própria conta (login/logout, sessão persistente) e o sistema garante, desde o primeiro byte gravado, isolamento por `user_id` via RLS e dinheiro exato em centavos inteiros. Front-loading dos dois erros irreversíveis (float em dinheiro, vazamento RLS).

Inclui: scaffold Next.js (App Router) + TypeScript estrito, Supabase (Auth + Postgres + Storage) com `@supabase/ssr`, schema fundacional (`profiles`, `categories`), padrão de RLS reutilizável, seed de categorias padrão BR por usuário, e o app rodando localmente + na Vercel.

NÃO inclui: receitas, transações, metas, reservas, importação, IA, MEI (fases seguintes). Só as tabelas fundacionais entram agora; tabelas de feature entram na fase de cada uma.

Cobre: AUTH-01, AUTH-02, AUTH-03, AUTH-04, CAT-01, SEC-02.

</domain>

<decisions>
## Implementation Decisions

### Autenticação & Onboarding
- Login com email/senha via Supabase Auth (AUTH-01)
- Cadastro: signup padrão do Supabase; RLS é a fronteira de isolamento (seguro mesmo com signup aberto)
- UI de auth: formulários custom minimalistas com shadcn/ui (controle total em TS estrito) — não usar `@supabase/auth-ui-react`
- Confirmação de email desabilitada no v1 (uso pessoal, sem fricção); religar quando a esposa entrar como segundo titular
- Sessão persistente via `@supabase/ssr` + middleware de refresh (AUTH-02); logout disponível em qualquer página (AUTH-04)

### Schema, dinheiro & migrações
- Dinheiro em `bigint` representando centavos (nunca float/`real`/`double`); helpers de parse/format pt-BR (`Intl.NumberFormat('pt-BR',{currency:'BRL'})`) (SEC-02 mindset: exatidão)
- Escopo do schema na Fase 1: apenas tabelas fundacionais — `profiles` (1:1 com `auth.users`) e `categories`. Padrão de RLS + trigger de seed reutilizável para as próximas fases
- Migrações versionadas via Supabase CLI em `supabase/migrations/`
- Identidade: PK uuid em todas as tabelas; `user_id` uuid FK → `auth.users(id)`, com índice em `user_id` (padrão de performance RLS)

### Categorias padrão BR & RLS
- Seed de categorias padrão: Moradia, Alimentação, Transporte, Saúde, Educação, Lazer, Vestuário, Assinaturas, Investimentos, Reserva, Outros (CAT-01)
- Cada categoria marcada como `consumo` ou `alocação`; Investimentos e Reserva = `alocação` (preparando CAT-03 e a contabilidade de reserva da Fase 3)
- Seed por cópia por-usuário no signup (trigger em `auth.users`), de modo que cada usuário edita as suas (multi-user-ready, AUTH-03)
- Política RLS uniforme: `(select auth.uid()) = user_id` com `USING` **e** `WITH CHECK` em toda tabela; bucket de Storage privado por pasta `{user_id}/` (preparando AUTH-03/SEC-01)

### Claude's Discretion
- Estrutura de pastas do projeto (app/ vs src/), nomes de componentes, organização de libs
- Versões exatas das deps (usar as atuais verificadas na pesquisa: Next 16, React 19, Tailwind v4, `@supabase/ssr`)
- Detalhes do middleware e dos route handlers/server actions de auth
- Forma exata do trigger de seed e das funções SQL auxiliares

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Projeto greenfield — sem código a reaproveitar. Subagentes copiados do GIO em `agents/` (code-reviewer, researcher, security, ui-ux, writer) disponíveis para apoio.

### Established Patterns
- Pesquisa em `.planning/research/` definiu os padrões: `@supabase/ssr` com `getAll`/`setAll` + middleware; RLS `(select auth.uid()) = user_id` + índice em `user_id`; dinheiro em centavos; shadcn/ui + Tailwind v4.

### Integration Points
- Supabase pessoal do usuário (Auth + Postgres + Storage) — credenciais via env (`.env.local`, nunca no bundle)
- Deploy na Vercel; repo já em github.com/DamascenoDev/gestao-financeira (privado)

</code_context>

<specifics>
## Specific Ideas

- TypeScript ESTRITO, sem JavaScript — preferência dura do usuário
- Service-role key só no servidor, nunca no bundle do cliente (SEC-02)
- Tudo escopado por `user_id` desde já, mesmo sendo single-user no v1 (esposa entra depois sem migração)

</specifics>

<deferred>
## Deferred Ideas

- UI de conta compartilhada/família e religar confirmação de email → quando a esposa entrar (v2, MUL-01)
- Tabelas de feature (income, transactions, budgets, reservas, mei, imports) → fases 2–5

</deferred>
