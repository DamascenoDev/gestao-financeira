'use client'

import { CheckCircle2 } from 'lucide-react'
import * as React from 'react'
import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  removeAiKey,
  saveAiSettings,
  testConnection,
} from '@/actions/ai-settings'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AI_PROVIDERS, PROVIDER_LABEL, type AiProvider } from '@/lib/ai/settings'
import { aiSettingsSchema } from '@/lib/schemas/ai-settings'

type AiSettingsFormProps = {
  /** Seeded from the RSC's ai_settings.provider (defaults to 'gemini' on first run). */
  provider: AiProvider
  /** Derived RSC boolean — true once a key is in Vault. NEVER the key itself. */
  hasKey: boolean
}

type TestState = { kind: 'ok' } | { kind: 'error'; message: string } | null

/**
 * AiSettingsForm (14-UI-SPEC) — the write-only BYOK settings form. Mirrors
 * MeiSettingsForm (manual React.useState + useTransition + sonner, NOT react-hook-form)
 * and, for the remove affordance, the AccountDeleteZone AlertDialog grammar.
 *
 * SECURITY CONTRACT (BYOK-04 / T-14-11 — the single most important invariant of the
 * phase): the key input is WRITE-ONLY. It never receives a `value` from a stored key
 * and never renders masked dots representing the real secret — the masked chars a user
 * sees are only their own freshly-typed input. The form is seeded from `provider` +
 * `hasKey` ONLY; the stored key is never a prop, never echoed, never reachable here.
 *
 * Gold (--primary) is spent ONLY on Salvar; Testar is outline; Remover is destructive.
 */
export function AiSettingsForm({ provider, hasKey }: AiSettingsFormProps) {
  const [isSaving, startSave] = useTransition()
  const [isTesting, startTest] = useTransition()
  const [isRemoving, startRemove] = useTransition()

  const [selectedProvider, setSelectedProvider] = useState<AiProvider>(provider)
  const [apiKey, setApiKey] = useState('')
  const [keyConfigured, setKeyConfigured] = useState(hasKey)
  const [keyError, setKeyError] = useState<string | undefined>(undefined)
  const [testResult, setTestResult] = useState<TestState>(null)
  const [removeOpen, setRemoveOpen] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // "Testar conexão" is available when a key already exists OR one is typed now.
  const canTest = keyConfigured || apiKey.trim().length > 0

  function onSave(e: React.FormEvent) {
    e.preventDefault()
    const parsed = aiSettingsSchema.safeParse({
      provider: selectedProvider,
      apiKey,
    })
    if (!parsed.success) {
      setKeyError(parsed.error.issues[0]?.message ?? 'Dados inválidos')
      return
    }
    setKeyError(undefined)

    startSave(async () => {
      const fd = new FormData()
      fd.set('provider', parsed.data.provider)
      fd.set('apiKey', parsed.data.apiKey)
      const result = await saveAiSettings(fd)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Configurações de IA salvas')
      // Write-only: clear the input and flip to the key-configured state. The stored
      // key is never read back into the field.
      setApiKey('')
      setKeyConfigured(true)
      setTestResult(null)
    })
  }

  function onTest() {
    setTestResult(null)
    startTest(async () => {
      const result = await testConnection()
      if ('error' in result) {
        setTestResult({ kind: 'error', message: result.error })
        return
      }
      setTestResult({ kind: 'ok' })
    })
  }

  function onConfirmRemove() {
    startRemove(async () => {
      const result = await removeAiKey()
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(
        'Chave removida. A classificação automática fica desativada até você cadastrar uma nova.',
      )
      setKeyConfigured(false)
      setApiKey('')
      setTestResult(null)
      setRemoveOpen(false)
    })
  }

  return (
    <form onSubmit={onSave} className="max-w-md">
      <FieldGroup>
        {/* Status badge — aria-live so screen readers hear the configured-state flip. */}
        <div aria-live="polite">
          {keyConfigured ? (
            <Badge variant="outline">
              <CheckCircle2 aria-hidden />
              Chave configurada ✓
            </Badge>
          ) : (
            <Badge variant="secondary">Nenhuma chave configurada</Badge>
          )}
        </div>

        <Field>
          <FieldLabel htmlFor="ai-provider">Provedor de IA</FieldLabel>
          <Select
            value={selectedProvider}
            onValueChange={(v) =>
              setSelectedProvider((v as AiProvider) ?? 'gemini')
            }
          >
            <SelectTrigger id="ai-provider" className="w-full">
              {/* Base UI Select renders the raw value unless given explicit
                  children — show the friendly label, not "gemini" (G-01 pattern). */}
              <SelectValue>{PROVIDER_LABEL[selectedProvider]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {AI_PROVIDERS.map((p) => (
                <SelectItem key={p} value={p}>
                  {PROVIDER_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field data-invalid={!!keyError}>
          <FieldLabel htmlFor="ai-key">Chave da API</FieldLabel>
          {/* WRITE-ONLY: no `value` from a stored key, no masked dots of the real
              secret. The value is only the user's own freshly-typed input. */}
          <Input
            id="ai-key"
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value)
              if (keyError) setKeyError(undefined)
            }}
            placeholder="Cole sua chave (sk-… ou AIza…)"
            aria-invalid={!!keyError}
            aria-describedby="ai-key-help"
          />
          <p id="ai-key-help" className="text-xs text-muted-foreground">
            {keyConfigured
              ? 'Uma chave já está configurada. Cole uma nova só se quiser trocá-la.'
              : 'Sua chave é guardada criptografada e nunca é exibida de volta.'}
          </p>
          <FieldError errors={keyError ? [{ message: keyError }] : undefined} />
        </Field>
      </FieldGroup>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {/* Gold is spent ONLY here (the single primary CTA). */}
        <Button type="submit" disabled={isSaving}>
          {isSaving ? 'Salvando…' : 'Salvar'}
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={!canTest || isTesting}
          onClick={onTest}
        >
          {isTesting ? 'Testando…' : 'Testar conexão'}
        </Button>
      </div>

      {/* Inline test result — aria-live so the mapped ok/erro is announced. Never a
          raw provider message, stack, or key (the action returns constant strings). */}
      <div aria-live="polite" className="mt-2 min-h-0">
        {testResult?.kind === 'ok' && (
          <p className="text-income text-sm">
            Conexão ok — sua chave está funcionando.
          </p>
        )}
        {testResult?.kind === 'error' && (
          <p className="text-destructive text-sm">{testResult.message}</p>
        )}
      </div>

      {keyConfigured && (
        <div className="mt-6">
          <AlertDialog
            open={removeOpen}
            onOpenChange={(next) => {
              if (isRemoving) return
              setRemoveOpen(next)
            }}
          >
            <AlertDialogTrigger
              render={
                <Button type="button" variant="destructive">
                  Remover chave
                </Button>
              }
            />
            <AlertDialogContent initialFocus={cancelRef}>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover chave de IA?</AlertDialogTitle>
                <AlertDialogDescription>
                  A classificação automática de gastos vai parar de sugerir
                  categorias até você cadastrar uma nova chave. Seus gastos e
                  padrões já salvos não são afetados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel ref={cancelRef} disabled={isRemoving}>
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={isRemoving}
                  aria-disabled={isRemoving}
                  onClick={(e) => {
                    e.preventDefault()
                    onConfirmRemove()
                  }}
                >
                  {isRemoving ? 'Removendo…' : 'Remover'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </form>
  )
}
