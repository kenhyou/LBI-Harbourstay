'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { loginRequest, type LoginRequest } from '@harbourstay/shared';

const labelClass = 'text-sm font-medium text-gray-700';
const inputClass =
  'rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900';

/**
 * Login form. Validates against the shared `loginRequest` schema (never a
 * redefined copy), posts to the same-origin /api/auth/login cookie bridge, then
 * navigates on success. A 401 shows an inline error; router.refresh() re-runs
 * the server components (header, guarded pages) with the new session cookie.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/account';
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequest),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginRequest) {
    setFormError(null);
    let res: Response;
    try {
      res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
    } catch {
      setFormError('Network error — please try again.');
      return;
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setFormError(body?.error ?? 'Unable to sign in.');
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      aria-label="Log in"
      noValidate
      className="flex flex-col gap-4"
    >
      {formError && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          className={inputClass}
          aria-invalid={errors.email ? 'true' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <span role="alert" className="text-xs text-red-600">
            {errors.email.message}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className={labelClass}>
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className={inputClass}
          aria-invalid={errors.password ? 'true' : undefined}
          {...register('password')}
        />
        {errors.password && (
          <span role="alert" className="text-xs text-red-600">
            {errors.password.message}
          </span>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-gray-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {isSubmitting ? 'Signing in…' : 'Log in'}
      </button>
    </form>
  );
}
