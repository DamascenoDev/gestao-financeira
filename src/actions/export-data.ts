'use server'

import { buildExportBundle, type ExportBundle } from '@/lib/export/bundle'
import { createClient } from '@/lib/supabase/server'

/**
 * exportMyData (DATA-02) — the LGPD "Baixar meus dados" Server Action.
 *
 * Reads via the RLS-scoped server client (src/lib/supabase/server) so "only my rows"
 * is STRUCTURAL — it NEVER imports the service-role admin.ts (that would bypass RLS
 * and defeat the guarantee). userId comes from the SESSION (getClaims), never from
 * client input. Returns the assembled single-JSON bundle of all 14 owned tables +
 * embedded pt-BR transactions/MEI CSVs; the client triggers the download as
 * `meus-dados-{yyyy-MM-dd}.json`.
 */
export async function exportMyData(): Promise<
  | { ok: true; bundle: ExportBundle }
  | { ok: false; error: 'nao_autenticado' | 'falha_export' }
> {
  const supabase = await createClient()

  // userId from the session claims — never from input.
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { ok: false, error: 'nao_autenticado' }

  try {
    const bundle = await buildExportBundle(supabase, userId)
    return { ok: true, bundle }
  } catch {
    // Never leak the raw error to the client; the UI shows a generic retry message.
    return { ok: false, error: 'falha_export' }
  }
}
