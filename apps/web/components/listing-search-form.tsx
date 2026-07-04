'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  listingSearchQuery,
  type ListingSearchQuery,
} from '@harbourstay/shared';

/**
 * Form-level schema — deliberately DECOUPLED from the wire contract
 * (`listingSearchQuery`). HTML inputs always yield raw strings, and an empty
 * string means "unset" here. The wire contract validates `undefined`-or-valid,
 * so validating raw strings against it would reject untouched optional fields
 * (`z.string().date()` rejects '', `z.coerce.number().positive()` turns '' → 0
 * and fails). Every field is a plain string; a `.superRefine` re-adds real
 * errors for genuinely-bad NON-empty input, so good UX survives.
 *
 * The wire-contract validation/coercion still happens — in `toQuery()` on
 * submit — before we navigate.
 */
const searchFormSchema = z
  .object({
    location: z.string(),
    from: z.string(),
    to: z.string(),
    guests: z.string(),
  })
  .superRefine((values, ctx) => {
    // Dates: validate only when provided.
    const fromValid = values.from === '' || isIsoDate(values.from);
    const toValid = values.to === '' || isIsoDate(values.to);
    if (!fromValid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['from'],
        message: 'Enter a valid date',
      });
    }
    if (!toValid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'Enter a valid date',
      });
    }
    // Range order: only when both are present and individually valid.
    if (fromValid && toValid && values.from !== '' && values.to !== '') {
      if (values.from >= values.to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['to'],
          message: 'To must be after From',
        });
      }
    }
    // Guests: positive integer, only when provided.
    if (values.guests !== '') {
      const n = Number(values.guests);
      if (!Number.isInteger(n) || n < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['guests'],
          message: 'Enter a whole number of guests (1 or more)',
        });
      }
    }
  });

type FormValues = z.infer<typeof searchFormSchema>;

/** True only for a strict `YYYY-MM-DD` calendar date. */
function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime());
}

/**
 * Coerce raw string inputs into the shared ListingSearchQuery, dropping empties
 * so optional filters stay optional. This is where the WIRE contract runs — the
 * form resolver only guards raw-string UX; the real coercion/validation happens
 * here before we build the URL.
 */
function toQuery(values: FormValues): ListingSearchQuery {
  return listingSearchQuery.parse({
    location: values.location.trim() || undefined,
    from: values.from || undefined,
    to: values.to || undefined,
    guests: values.guests.trim() || undefined,
  });
}

const labelClass = 'text-xs font-medium text-gray-600';
const inputClass =
  'rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900';

/**
 * Client-side search form. Validates against the shared schema, then writes the
 * (non-empty) filters into the URL searchParams — which drives the RSC page to
 * re-fetch on the server. The form itself never fetches.
 */
export function ListingSearchForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(searchFormSchema),
    // Seed from the current URL so the form reflects the active search.
    defaultValues: {
      location: searchParams.get('location') ?? '',
      from: searchParams.get('from') ?? '',
      to: searchParams.get('to') ?? '',
      guests: searchParams.get('guests') ?? '',
    },
  });

  function onSubmit(values: FormValues) {
    const query = toQuery(values);
    const params = new URLSearchParams();
    if (query.location) params.set('location', query.location);
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    if (query.guests !== undefined) params.set('guests', String(query.guests));
    const qs = params.toString();
    router.push(qs ? `/listings?${qs}` : '/listings');
  }

  function onClear() {
    reset({ location: '', from: '', to: '', guests: '' });
    router.push('/listings');
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      aria-label="Search listings"
      className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5"
    >
      <div className="flex flex-col gap-1 lg:col-span-2">
        <label htmlFor="location" className={labelClass}>
          Location
        </label>
        <input
          id="location"
          type="text"
          placeholder="Anywhere"
          autoComplete="off"
          className={inputClass}
          aria-invalid={errors.location ? 'true' : undefined}
          {...register('location')}
        />
        {errors.location && (
          <span role="alert" className="text-xs text-red-600">
            {errors.location.message}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="from" className={labelClass}>
          From
        </label>
        <input
          id="from"
          type="date"
          className={inputClass}
          aria-invalid={errors.from ? 'true' : undefined}
          {...register('from')}
        />
        {errors.from && (
          <span role="alert" className="text-xs text-red-600">
            {errors.from.message}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="to" className={labelClass}>
          To
        </label>
        <input
          id="to"
          type="date"
          className={inputClass}
          aria-invalid={errors.to ? 'true' : undefined}
          {...register('to')}
        />
        {errors.to && (
          <span role="alert" className="text-xs text-red-600">
            {errors.to.message}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="guests" className={labelClass}>
          Guests
        </label>
        <input
          id="guests"
          type="number"
          min={1}
          placeholder="Any"
          className={inputClass}
          aria-invalid={errors.guests ? 'true' : undefined}
          {...register('guests')}
        />
        {errors.guests && (
          <span role="alert" className="text-xs text-red-600">
            {errors.guests.message}
          </span>
        )}
      </div>

      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
        <button
          type="submit"
          className="rounded-md bg-gray-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
        >
          Search
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
        >
          Clear
        </button>
      </div>
    </form>
  );
}
