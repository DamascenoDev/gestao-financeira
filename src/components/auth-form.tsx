'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'

import { authSchema, type AuthInput } from '@/lib/auth-schema'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'

type AuthAction = (formData: FormData) => Promise<{ error: string } | void>

interface AuthFormProps {
  title: string
  description: string
  submitLabel: string
  action: AuthAction
  footer: React.ReactNode
}

export function AuthForm({
  title,
  description,
  submitLabel,
  action,
  footer,
}: AuthFormProps) {
  const [isPending, startTransition] = useTransition()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AuthInput>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: '', password: '' },
  })

  function onSubmit(values: AuthInput) {
    const formData = new FormData()
    formData.set('email', values.email)
    formData.set('password', values.password)
    startTransition(async () => {
      // On success the action redirects (it never returns); only the error
      // branch resolves with a value to surface as a toast.
      const result = await action(formData)
      if (result?.error) {
        toast.error(result.error)
      }
    })
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={!!errors.email}
                {...register('email')}
              />
              <FieldError errors={errors.email ? [errors.email] : undefined} />
            </Field>
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="password">Senha</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                {...register('password')}
              />
              <FieldError
                errors={errors.password ? [errors.password] : undefined}
              />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="mt-6 flex flex-col items-stretch gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Aguarde…' : submitLabel}
          </Button>
          <p className="text-center text-sm text-muted-foreground">{footer}</p>
        </CardFooter>
      </form>
    </Card>
  )
}

export { Link }
