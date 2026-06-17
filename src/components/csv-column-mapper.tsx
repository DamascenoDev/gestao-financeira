'use client'

import * as React from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCents } from '@/lib/money'
import { parseBRLToCents } from '@/lib/money'
import { brDateToCivil } from '@/lib/parsers/csv'
import type { CsvMapping } from '@/lib/schemas/import'

/**
 * CsvColumnMapper (UI-SPEC §2) — the dialog shown only when a CSV's headers can't be
 * auto-mapped (or no saved profile matches). Three Selects map detected headers →
 * Data / Descritor / Valor (each previews the column's first sample value). A live
 * preview table (≤5 rows) renders as-parsed (dd/MM, formatCents valor, descritor) so
 * the user verifies before committing. A "Salvar como perfil" switch (default on) +
 * optional name persists a reusable layout. Validates the three roles map to DISTINCT
 * columns + that the valor column parses as money.
 */

type Role = 'dateCol' | 'descCol' | 'valorCol'

function previewDate(raw: string): string {
  try {
    const civil = brDateToCivil(raw.trim())
    const [, mm, dd] = civil.split('-')
    return `${dd}/${mm}`
  } catch {
    return raw
  }
}

function previewValor(raw: string): string {
  try {
    return formatCents(parseBRLToCents(raw.trim()))
  } catch {
    return raw
  }
}

export function CsvColumnMapper({
  open,
  onOpenChange,
  headers,
  sample,
  saving = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Detected CSV header names. */
  headers: string[]
  /** First few raw header-keyed rows (read client-side from the File). */
  sample: Record<string, string>[]
  /** True while the parent runs saveCsvProfile + ingestStatement. */
  saving?: boolean
  /** Confirm with the chosen mapping + whether to save it as a reusable profile. */
  onConfirm: (mapping: CsvMapping, saveProfile: { name: string } | null) => void
}) {
  const [dateCol, setDateCol] = React.useState('')
  const [descCol, setDescCol] = React.useState('')
  const [valorCol, setValorCol] = React.useState('')
  const [saveProfile, setSaveProfile] = React.useState(true)
  const [profileName, setProfileName] = React.useState('')
  const [errors, setErrors] = React.useState<Partial<Record<Role | 'form', string>>>({})

  // Re-seed when the dialog opens (no useEffect — mirrors the ReservaForm pattern).
  function handleOpenChange(next: boolean) {
    if (next) {
      setDateCol('')
      setDescCol('')
      setValorCol('')
      setSaveProfile(true)
      setProfileName('')
      setErrors({})
    }
    onOpenChange(next)
  }

  const allChosen = dateCol && descCol && valorCol
  const distinct = new Set([dateCol, descCol, valorCol]).size === 3

  const firstSample = sample[0]
  const sampleFor = (col: string) => (col && firstSample ? firstSample[col] : undefined)

  function validate(): CsvMapping | null {
    const next: Partial<Record<Role | 'form', string>> = {}
    if (!dateCol) next.dateCol = 'Selecione a coluna de data'
    if (!descCol) next.descCol = 'Selecione a coluna de descritor'
    if (!valorCol) next.valorCol = 'Selecione a coluna de valor'
    if (dateCol && descCol && valorCol && !distinct) {
      next.form = 'Cada campo (data, descritor, valor) precisa de uma coluna diferente.'
    }
    // The valor column must look monetary on the first non-empty sample value.
    if (valorCol && distinct && firstSample) {
      const raw = (firstSample[valorCol] ?? '').trim()
      if (raw) {
        try {
          parseBRLToCents(raw)
        } catch {
          next.valorCol = 'Esta coluna não parece conter valores monetários.'
        }
      }
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return null
    return { dateCol, descCol, valorCol }
  }

  function handleConfirm() {
    const mapping = validate()
    if (!mapping) return
    onConfirm(mapping, saveProfile ? { name: profileName.trim() } : null)
  }

  const previewRows = sample.slice(0, 5)
  const hasPreview = allChosen && distinct && previewRows.length > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mapear colunas do CSV</DialogTitle>
          <DialogDescription>
            Indique qual coluna é a data, a descrição e o valor. Salvamos esse
            mapeamento para os próximos arquivos do mesmo layout.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          {(
            [
              ['dateCol', 'Data', dateCol, setDateCol],
              ['descCol', 'Descritor', descCol, setDescCol],
              ['valorCol', 'Valor', valorCol, setValorCol],
            ] as const
          ).map(([role, label, value, setValue]) => (
            <Field key={role} data-invalid={!!errors[role]}>
              <FieldLabel htmlFor={`map-${role}`}>{label}</FieldLabel>
              <Select value={value || null} onValueChange={(v) => setValue(v ?? '')}>
                <SelectTrigger id={`map-${role}`} className="w-full">
                  <SelectValue placeholder="Selecione a coluna" />
                </SelectTrigger>
                <SelectContent>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sampleFor(value) ? (
                <p className="text-muted-foreground text-xs">
                  Ex.: {sampleFor(value)}
                </p>
              ) : null}
              <FieldError
                errors={errors[role] ? [{ message: errors[role]! }] : undefined}
              />
            </Field>
          ))}

          {errors.form ? (
            <p className="text-destructive text-sm" role="alert">
              {errors.form}
            </p>
          ) : null}

          {/* Live preview as-parsed. */}
          {hasPreview ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descritor</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono tabular-nums">
                      {previewDate(r[dateCol] ?? '')}
                    </TableCell>
                    <TableCell className="max-w-48 truncate">
                      {r[descCol] ?? ''}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {previewValor(r[valorCol] ?? '')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : allChosen && distinct ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma linha foi reconhecida com este mapeamento. Verifique as colunas.
            </p>
          ) : null}

          <Field orientation="horizontal">
            <Switch
              id="map-save-profile"
              checked={saveProfile}
              onCheckedChange={(v) => setSaveProfile(v === true)}
            />
            <FieldLabel htmlFor="map-save-profile">Salvar como perfil</FieldLabel>
          </Field>
          {saveProfile ? (
            <Field>
              <FieldLabel htmlFor="map-profile-name">Nome do perfil (opcional)</FieldLabel>
              <Input
                id="map-profile-name"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Banco X"
              />
            </Field>
          ) : null}
        </FieldGroup>

        <DialogFooter className="mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={saving} onClick={handleConfirm}>
            {saving ? 'Salvando…' : 'Salvar mapeamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
