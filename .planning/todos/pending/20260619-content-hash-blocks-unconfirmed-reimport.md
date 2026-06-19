---
created: 2026-06-19
title: content_hash idempotency wrongly blocks re-import of UNCONFIRMED statements
area: import / ingest
severity: bug (UX)
found_by: quick-task 260619-d68 (PROD live smoke)
files:
  - src/actions/import.ts
  - src/lib/dedupe.ts
---

# content_hash blocks re-import of an unconfirmed statement

## Problem

`ingestStatement` (import.ts ~276–316) inserts the statement with a unique
`(user_id, content_hash)` and `ON CONFLICT DO NOTHING`. On a hash hit it returns
early — `{ rows: [], alreadyImported: true }`, toast "Este arquivo já foi importado
— 0 novas transações" — **before** the parse / memory / classify pass ever runs.

But the hit fires even when the prior upload was **never confirmed** (no rows landed
in `transactions`). So a user who uploads a file, opens the review grid, but does NOT
click "Confirmar importação" can never re-upload that exact file to try again — it
short-circuits to "0 novas" with an empty extrato. (User's words: "se aquele hash foi
importado mas não foi confirmado, não deveria considerar já importado.")

Confirmed live during the 260619-d68 smoke: re-uploading the same OFX returned
"0 novas / já importado" while the extrato was empty in every month. Worked around by
appending a byte to change the content_hash.

## Solution (sketch)

On a `content_hash` conflict, only treat the file as already-imported if its prior
statement was actually **confirmed**. Determine "confirmed" via transactions that
reference the statement (statement_id FK) or a `confirmed_at`/status column on
`statements`. If the existing statement is unconfirmed:
- allow re-parse — either delete+replace the stale unconfirmed statement row (+ its
  parsed_rows), or reuse it and refresh `parsed_rows` — and return the review rows,
- keep the "0 novas" short-circuit ONLY for confirmed re-imports.

Add/extend tests in `src/actions/import.test.ts` (it already covers the content_hash
"0 novas" path) to cover the unconfirmed-re-import case.
