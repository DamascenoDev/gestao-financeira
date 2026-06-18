'use client'

import * as React from 'react'
import { useTransition } from 'react'
import { toast } from 'sonner'

import { upsertMeiSettings, upsertMeiYearFlag } from '@/actions/mei'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { BrDateField } from '@/components/br-date-field'
import { Switch } from '@/components/ui/switch'
import { meiSettingsSchema } from '@/lib/schemas/mei'

type MeiSettingsFormProps = {
  /** The selected year (?ano) — has_employee is scoped to it (a DASN field). */
  ano: number
  /** Existing mei_start_date ('yyyy-MM-dd') or '' on first run. */
  meiStartDate: string
  /** Existing has_employee for ?ano (default false on first run). */
  hasEmployee: boolean
}

/**
 * MeiSettingsForm (UI-SPEC §3) — a small single-column form for the two fields the
 * applicable-limit math + DASN need: mei_start_date (drives the 1º-ano proportional
 * cap, a single value across years → upsertMeiSettings) and "Tinha funcionário em
 * {ano}?" (a per-year DASN flag scoped to ?ano → upsertMeiYearFlag). Mirrors the
 * transacao-form manual-state + useTransition + toast pattern; client + server Zod.
 * Save → "Configurações salvas". Saving the start date recomputes the applicable
 * limit shown on the dashboard/report. (MEI-03)
 */
export function MeiSettingsForm({
  ano,
  meiStartDate,
  hasEmployee,
}: MeiSettingsFormProps) {
  const [isPending, startTransition] = useTransition()
  const [startDate, setStartDate] = React.useState(meiStartDate)
  const [employee, setEmployee] = React.useState(hasEmployee)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    const parsed = meiSettingsSchema.safeParse({ meiStartDate: startDate })
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (key === 'meiStartDate') next.meiStartDate = issue.message
      }
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return

    startTransition(async () => {
      const fd = new FormData()
      fd.set('meiStartDate', startDate)
      const settingsResult = await upsertMeiSettings(fd)
      if ('error' in settingsResult) {
        toast.error(settingsResult.error)
        return
      }
      const flagResult = await upsertMeiYearFlag(ano, employee)
      if ('error' in flagResult) {
        toast.error(flagResult.error)
        return
      }
      toast.success('Configurações salvas')
    })
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md">
      <FieldGroup>
        <Field data-invalid={!!errors.meiStartDate}>
          <FieldLabel htmlFor="mei-start">Data de início do MEI</FieldLabel>
          <BrDateField
            id="mei-start"
            value={startDate}
            onChange={setStartDate}
            invalid={!!errors.meiStartDate}
            aria-invalid={!!errors.meiStartDate}
            aria-describedby="mei-start-help"
          />
          <p id="mei-start-help" className="text-xs text-muted-foreground">
            Usamos esta data para calcular seu limite proporcional no primeiro ano.
          </p>
          <FieldError
            errors={
              errors.meiStartDate ? [{ message: errors.meiStartDate }] : undefined
            }
          />
        </Field>

        <Field>
          <div className="flex items-center justify-between gap-4">
            <FieldLabel htmlFor="mei-employee">
              Tinha funcionário em {ano}?
            </FieldLabel>
            <Switch
              id="mei-employee"
              checked={employee}
              onCheckedChange={(v) => setEmployee(!!v)}
              aria-describedby="mei-employee-help"
            />
          </div>
          <p id="mei-employee-help" className="text-xs text-muted-foreground">
            Campo exigido pela declaração DASN-SIMEI.
          </p>
        </Field>
      </FieldGroup>

      <div className="mt-6">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
    </form>
  )
}
