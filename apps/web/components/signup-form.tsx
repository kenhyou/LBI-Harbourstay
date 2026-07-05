'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { registerRequest, type RegisterRequest } from '@harbourstay/shared';

const labelClass = 'text-sm font-medium text-gray-700';
const inputClass =
  'rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900';

/**
 * Signup form. Validates against the shared `registerRequest` schema (incl. the
 * password min-8 rule and the guest/host role), posts to the same-origin
 * /api/auth/register cookie bridge, then navigates on success. 409 (email in
 * use) is shown inline.
 */
export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/account';
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterRequest>({
    resolver: zodResolver(registerRequest),
    defaultValues: { email: '', password: '', role: 'guest' },
  });

  async function onSubmit(values: RegisterRequest) {
    setFormError(null);
    let res: Response;
    try {
      res = await fetch('/api/auth/register', {
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
      setFormError(body?.error ?? 'Unable to create your account.');
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      aria-label="Create account"
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
          autoComplete="new-password"
          className={inputClass}
          aria-invalid={errors.password ? 'true' : undefined}
          {...register('password')}
        />
        {errors.password ? (
          <span role="alert" className="text-xs text-red-600">
            {errors.password.message}
          </span>
        ) : (
          <span className="text-xs text-gray-400">At least 8 characters.</span>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className={labelClass}>I want to</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              value="guest"
              className="h-4 w-4"
              {...register('role')}
            />
            Book stays (guest)
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              value="host"
              className="h-4 w-4"
              {...register('role')}
            />
            Host a place (host)
          </label>
        </div>
        {errors.role && (
          <span role="alert" className="text-xs text-red-600">
            {errors.role.message}
          </span>
        )}
      </fieldset>

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-gray-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}
