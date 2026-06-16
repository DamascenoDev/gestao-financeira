import Link from 'next/link'

import { signUp } from '@/actions/auth'
import { AuthForm } from '@/components/auth-form'

export default function SignupPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-6">
      <AuthForm
        title="Criar conta"
        description="Crie sua conta para começar."
        submitLabel="Criar conta"
        action={signUp}
        footer={
          <>
            Já tem conta?{' '}
            <Link
              href="/auth/login"
              className="font-medium text-primary underline underline-offset-4"
            >
              Entrar
            </Link>
          </>
        }
      />
    </main>
  )
}
