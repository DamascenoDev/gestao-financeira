import { MeiSettingsForm } from '@/components/mei-settings-form'
import { toYearOrCurrent } from '@/lib/month'
import { createClient } from '@/lib/supabase/server'

/**
 * /mei/configuracoes (RSC) — the small settings surface for the fields the
 * applicable-limit math + DASN need: mei_start_date (single value) and the per-year
 * has_employee flag for ?ano. Reads the user's mei_settings row + the mei_year_flags
 * row for the selected year (RLS-scoped; both may be null on first run) and seeds the
 * form. First run renders an empty start date + funcionário=Não. The disclaimer +
 * YearSelector come from the /mei segment layout — not re-rendered here. (MEI-03)
 */
export default async function MeiConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string }>
}) {
  const { ano: anoParam } = await searchParams
  const ano = toYearOrCurrent(anoParam)

  const supabase = await createClient()

  const [{ data: settings, error: settingsError }, { data: flag }] =
    await Promise.all([
      supabase.from('mei_settings').select('mei_start_date').maybeSingle(),
      supabase
        .from('mei_year_flags')
        .select('has_employee')
        .eq('year', ano)
        .maybeSingle(),
    ])

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Configurações MEI</h1>

      {settingsError ? (
        <p className="text-sm text-destructive">
          Não foi possível salvar as configurações. Tente novamente.
        </p>
      ) : (
        <MeiSettingsForm
          ano={ano}
          meiStartDate={settings?.mei_start_date ?? ''}
          hasEmployee={flag?.has_employee ?? false}
        />
      )}
    </section>
  )
}
