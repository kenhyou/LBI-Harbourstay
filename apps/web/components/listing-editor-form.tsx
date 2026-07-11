// The create + edit form for a host's listing. Written as working teaching
// material for S6 (Ken is learning React by reading real components). Read it
// alongside signup-form.tsx (the simplest form) — this one adds three things
// worth understanding: a form schema DERIVED from the shared wire contract, a
// dollars↔cents conversion at the display edge, and one component serving both
// "create" and "edit" via a `mode` prop.

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  hostListingUpsert,
  listingType,
  type HostListingUpsert,
  type ListingType,
} from '@harbourstay/shared';

const labelClass = 'text-sm font-medium text-gray-700';
const inputClass =
  'rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900';

/**
 * The form's own schema. We DERIVE it from the shared `hostListingUpsert` rather
 * than redefine it (the contract stays the single source of truth):
 *  - `.omit` drops the two fields whose *form representation* differs from the
 *    wire representation — `basePrice` (cents on the wire, but the host types
 *    DOLLARS) and `images` (a string[] on the wire, but one-URL-per-line in a
 *    textarea here).
 *  - `.extend` adds those two display-edge fields back in their form shape.
 * Every other rule (title length, description max, capacity ≥ 1, type enum) is
 * inherited unchanged, so the client validation genuinely mirrors the contract.
 * The REAL gate is still the server: on submit we re-parse the assembled body
 * with the untouched `hostListingUpsert` before sending.
 */
const editorFormSchema = hostListingUpsert
  .omit({ basePrice: true, images: true })
  .extend({
    // The host types dollars (e.g. "120" or "120.50"); coerce the input string
    // to a number and forbid negatives. Converted to integer cents on submit.
    priceDollars: z.coerce
      .number({ invalid_type_error: 'Enter a price in dollars' })
      .nonnegative('Price cannot be negative'),
    // One image URL per line. Optional; split into string[] on submit.
    imagesText: z.string().default(''),
  });

type EditorFormValues = z.infer<typeof editorFormSchema>;

/**
 * What the parent RSC page hands us to seed the form. For "create" it's blanks;
 * for "edit" it's the stored listing (with `basePrice` still in CENTS — we do the
 * cents→dollars conversion here so the page stays a dumb data-passer).
 */
export interface ListingEditorInitial {
  title: string;
  description: string;
  type: ListingType;
  location: string;
  capacity: number;
  basePrice: number; // minor units (cents), as stored
  images: string[];
}

export interface ListingEditorFormProps {
  mode: 'create' | 'edit';
  /** Required when mode === 'edit' — the listing being updated. */
  listingId?: string;
  initial: ListingEditorInitial;
}

export function ListingEditorForm({
  mode,
  listingId,
  initial,
}: ListingEditorFormProps) {
  const router = useRouter();
  // A single form-level error line for server refusals / network faults, shown
  // above the fields. Field-level messages come from RHF's `errors` below.
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditorFormValues>({
    resolver: zodResolver(editorFormSchema),
    // Seed the controlled inputs. Note the two conversions AT THE DISPLAY EDGE:
    //   cents → dollars  (basePrice / 100)         for the price field
    //   string[] → text  (images.join('\n'))       for the textarea
    defaultValues: {
      title: initial.title,
      description: initial.description,
      type: initial.type,
      location: initial.location,
      capacity: initial.capacity,
      priceDollars: initial.basePrice / 100,
      imagesText: initial.images.join('\n'),
    },
  });

  async function onSubmit(values: EditorFormValues) {
    setFormError(null);

    // Assemble the WIRE body from the form values, converting back at the edge:
    //   dollars → cents:  Math.round(priceDollars * 100) — round (not floor/trunc)
    //     so 19.99 → 1999 exactly and float dust like 120.005 doesn't drop a cent.
    //   textarea → string[]:  split on newlines, trim, drop blank lines.
    const images = values.imagesText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // Re-parse with the UNTOUCHED shared schema — the same contract the server
    // enforces. If our form logic ever produces something off-contract (a
    // non-integer price, say), this throws here instead of sending a bad body.
    let body: HostListingUpsert;
    try {
      body = hostListingUpsert.parse({
        title: values.title,
        description: values.description,
        type: values.type,
        location: values.location,
        capacity: values.capacity,
        basePrice: Math.round(values.priceDollars * 100),
        images,
      });
    } catch {
      setFormError('Please check the form and try again.');
      return;
    }

    // create → POST /api/host/listings ; edit → PATCH /api/host/listings/:id.
    // Both are same-origin bridges that forward the httpOnly cookie to the API.
    const url =
      mode === 'edit'
        ? `/api/host/listings/${listingId}`
        : '/api/host/listings';
    const method = mode === 'edit' ? 'PATCH' : 'POST';

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      setFormError('Network error — please try again.');
      return;
    }

    if (res.status === 401) {
      // Session expired → log in, then return to the dashboard.
      window.location.assign('/login?next=/host/listings');
      return;
    }
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setFormError(detail?.error ?? 'Could not save this listing.');
      return;
    }

    // Success → back to the dashboard, and refresh so the server re-fetches the
    // list and the new/updated card is there.
    router.push('/host/listings');
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      aria-label={mode === 'edit' ? 'Edit listing' : 'Create listing'}
      noValidate
      className="flex flex-col gap-5"
    >
      {formError && (
        <p
          role="alert"
          data-testid="editor-error"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="title" className={labelClass}>
          Title
        </label>
        <input
          id="title"
          type="text"
          className={inputClass}
          aria-invalid={errors.title ? 'true' : undefined}
          {...register('title')}
        />
        {errors.title && (
          <span role="alert" className="text-xs text-red-600">
            {errors.title.message}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="description" className={labelClass}>
          Description
        </label>
        <textarea
          id="description"
          rows={4}
          className={inputClass}
          aria-invalid={errors.description ? 'true' : undefined}
          {...register('description')}
        />
        {errors.description && (
          <span role="alert" className="text-xs text-red-600">
            {errors.description.message}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="type" className={labelClass}>
            Type
          </label>
          {/* A plain select over the shared `listingType` enum options — `stay`
              is the default (set via defaultValues). */}
          <select
            id="type"
            className={inputClass}
            aria-invalid={errors.type ? 'true' : undefined}
            {...register('type')}
          >
            {listingType.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt === 'stay' ? 'Stay' : 'Tour'}
              </option>
            ))}
          </select>
          {errors.type && (
            <span role="alert" className="text-xs text-red-600">
              {errors.type.message}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="location" className={labelClass}>
            Location
          </label>
          <input
            id="location"
            type="text"
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
          <label htmlFor="capacity" className={labelClass}>
            Capacity (guests)
          </label>
          {/* valueAsNumber makes RHF hand zod a number, not the input's string,
              so the inherited `capacity: int ≥ 1` rule validates correctly. */}
          <input
            id="capacity"
            type="number"
            min={1}
            step={1}
            className={inputClass}
            aria-invalid={errors.capacity ? 'true' : undefined}
            {...register('capacity', { valueAsNumber: true })}
          />
          {errors.capacity && (
            <span role="alert" className="text-xs text-red-600">
              {errors.capacity.message}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="priceDollars" className={labelClass}>
            Base price (USD / night)
          </label>
          {/* Entered in DOLLARS; converted to integer cents on submit (ADR-0005:
              money crosses the wire in minor units, formatted at the edge). */}
          <input
            id="priceDollars"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            className={inputClass}
            aria-invalid={errors.priceDollars ? 'true' : undefined}
            {...register('priceDollars')}
          />
          {errors.priceDollars && (
            <span role="alert" className="text-xs text-red-600">
              {errors.priceDollars.message}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="imagesText" className={labelClass}>
          Image URLs
        </label>
        <textarea
          id="imagesText"
          rows={3}
          placeholder="One URL per line"
          className={inputClass}
          {...register('imagesText')}
        />
        <span className="text-xs text-gray-400">
          One image URL per line. Leave blank for none.
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          data-testid="editor-submit"
          className="rounded-md bg-gray-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {isSubmitting
            ? 'Saving…'
            : mode === 'edit'
              ? 'Save changes'
              : 'Create listing'}
        </button>
      </div>
    </form>
  );
}
