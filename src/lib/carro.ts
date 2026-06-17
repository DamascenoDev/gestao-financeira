/**
 * CAR-02 / WR-04: the single source of truth for the carro "Nenhum" (clear) Select
 * sentinel. Radix Select forbids an empty-string item value, so the "Nenhum" option
 * carries this token and every onChange decodes it back to null/'' (none). It is a
 * pure UI sentinel — NEVER persisted; the server only ever receives a uuid or null.
 *
 * Before WR-04 this literal was duplicated and divergent across three components
 * (`__none__` in CarroPicker + SelectionActionBar, `__nenhum__` in ImportReviewTable),
 * a latent footgun where a future shared handler could mismatch the sentinel and
 * silently persist the literal string as a non-UUID carro id. Hoisting it here makes
 * the sentinel impossible to drift.
 */
export const CARRO_NONE = '__none__'
