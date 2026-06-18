import { AiSettingsForm } from '@/components/ai-settings-form'
import { createClient } from '@/lib/supabase/server'

/**
 * /conta/configuracoes-ia (RSC) — the BYOK Settings surface. Mirrors
 * mei/configuracoes/page.tsx (RSC + createClient + maybeSingle + form seed). The route
 * lives under (app)/conta/ so it inherits the existing (app)/layout.tsx getClaims auth
 * guard — no extra guard here.
 *
 * SECURITY CONTRACT (BYOK-04, Pitfall 1 / T-14-10 — load-bearing): the App Router
 * serializes EVERY prop into the RSC payload, so this page selects `key_secret_id`
 * ONLY to derive `hasKey = !!key_secret_id`. It passes DOWN exactly two scalars —
 * `provider` + the `hasKey` boolean — and NEVER the key_secret_id or anything
 * key-related. We never select all columns. First run (null row): provider defaults to
 * 'gemini', hasKey false.
 */
export default async function ConfiguracoesIaPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('ai_settings')
    .select('provider, key_secret_id')
    .maybeSingle()

  const provider = data?.provider === 'claude' ? 'claude' : 'gemini'
  const hasKey = !!data?.key_secret_id

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Configurações de IA</h1>
        <p className="text-sm text-muted-foreground">
          Configure seu provedor de IA e a sua própria chave para a classificação
          automática de gastos.
        </p>
      </div>

      <AiSettingsForm provider={provider} hasKey={hasKey} />
    </section>
  )
}
