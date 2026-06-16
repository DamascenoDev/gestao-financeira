'use client'

import { useTransition } from 'react'

import { signOut } from '@/actions/auth'
import { Button } from '@/components/ui/button'

export function LogoutButton() {
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(() => signOut())}
    >
      {isPending ? 'Saindo…' : 'Sair'}
    </Button>
  )
}
