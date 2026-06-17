'use client'

import { TriangleAlert } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { signOut } from '@/actions/auth'
import { deleteMyAccount } from '@/actions/delete-account'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** The exact phrase the user must type to enable the destructive confirm. */
const CONFIRM_PHRASE = 'APAGAR'

/** The five irreversibility consequences (UI-SPEC §2 Copywriting Contract). */
const CONSEQUENCES = [
  'Todas as transações, receitas, categorias, metas e reservas',
  'Todos os dados do MEI (notas, configurações e relatórios)',
  'Os padrões de classificação que o sistema aprendeu',
  'Todas as faturas enviadas, no armazenamento',
  'Sua conta de acesso (login e senha)',
] as const

/**
 * AccountDeleteZone (UI-SPEC §1 Section B + §2) — the heaviest destructive surface in
 * the app. A persistent `border-destructive` region (never behind a toggle) with a
 * `triangle-alert` glyph and a destructive trigger that opens the type-to-confirm
 * AccountDeleteDialog. Extends the Phase-2 destructive `alert-dialog` grammar; the
 * escalation is layout + friction (bordered zone, bulleted irreversibility list,
 * type-to-confirm APAGAR), never a second/brighter red.
 *
 * The dialog: title + an `AlertDialogDescription` lead + the bulleted `<ul>` of
 * exactly-what-is-deleted (in the a11y description so a screen reader hears it before
 * the input), a type-to-confirm input (confirm disabled until value.trim() ===
 * 'APAGAR', exact + case-sensitive), `AlertDialogCancel` always enabled, INITIAL
 * FOCUS on Cancelar (a stray Enter cancels, never deletes), Escape cancels. On
 * confirm: "Apagando…" → deleteMyAccount → on success signOut() + redirect to
 * /auth/login; on failure the dialog stays open, the input is cleared, sonner error.
 * Never silently partial-succeeds.
 */
export function AccountDeleteZone() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)

  const confirmed = value.trim() === CONFIRM_PHRASE

  function reset() {
    setValue('')
    setBusy(false)
  }

  async function onConfirm() {
    if (!confirmed || busy) return
    setBusy(true)
    try {
      const result = await deleteMyAccount({ confirm: value.trim() })
      if (!result.ok) {
        // Never silently partial-succeed — keep the dialog open, clear the input.
        setValue('')
        setBusy(false)
        toast.error('Não foi possível apagar sua conta. Tente novamente.')
        return
      }
      // Success: the account is gone. Sign out + redirect to the login screen.
      await signOut()
    } catch {
      setValue('')
      setBusy(false)
      toast.error('Não foi possível apagar sua conta. Tente novamente.')
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-destructive p-4">
      <div className="flex items-center gap-2">
        <TriangleAlert className="size-4 text-destructive" aria-hidden />
        <h2 className="text-sm font-semibold text-destructive">
          Apagar conta e dados
        </h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Esta ação apaga{' '}
        <span className="font-semibold text-foreground">permanentemente</span> todos
        os seus dados e encerra sua conta.{' '}
        <span className="font-semibold text-foreground">Não há como desfazer.</span>
      </p>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          // Block closing mid-delete; reset the input whenever the dialog closes.
          if (busy) return
          setOpen(next)
          if (!next) reset()
        }}
      >
        <AlertDialogTrigger
          render={
            <Button type="button" variant="destructive" className="self-start">
              Apagar conta
            </Button>
          }
        />
        <AlertDialogContent initialFocus={cancelRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar conta e todos os dados</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. Tudo abaixo será apagado para sempre:
            </AlertDialogDescription>
          </AlertDialogHeader>

          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
            {CONSEQUENCES.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p className="text-sm font-semibold text-foreground">
            Não será possível recuperar nada depois.
          </p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-apagar" className="text-xs text-muted-foreground">
              Para confirmar, digite{' '}
              <span className="font-mono font-semibold text-foreground">APAGAR</span>
            </Label>
            <Input
              id="confirm-apagar"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              disabled={busy}
              aria-describedby="confirm-apagar-help"
            />
            <span id="confirm-apagar-help" className="sr-only">
              Digite a palavra APAGAR em maiúsculas para habilitar o botão de apagar a
              conta.
            </span>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef} disabled={busy}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!confirmed || busy}
              aria-disabled={!confirmed || busy}
              onClick={(e) => {
                // Keep the dialog open while the async delete runs / on failure.
                e.preventDefault()
                void onConfirm()
              }}
            >
              {busy ? 'Apagando…' : 'Apagar conta'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
