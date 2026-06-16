import Link from 'next/link'

import { signIn } from '@/actions/auth'
import { AuthForm } from '@/components/auth-form'

export default function LoginPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-6">
      <AuthForm
        title="Entrar"
        description="Acesse sua gestão financeira."
        submitLabel="Entrar"
        action={signIn}
        footer={
          <>
            Não tem conta?{' '}
            <Link
              href="/auth/signup"
              className="font-medium text-primary underline underline-offset-4"
            >
              Criar conta
            </Link>
          </>
        }
      />
    </main>
  )
}
