// THE S6b READING CENTREPIECE — written by Claude at Ken's request (S6 fill-file
// opt-out: learn by reading working code). It's a step up from publish-toggle.tsx:
// that had ONE button + ONE piece of state; this has a LIST, an ADD-FORM, and a
// per-row REMOVE — so several async actions and several pieces of state coexist.
// Read it alongside publish-toggle.tsx (the one-button warm-up) and
// cancel-booking-dialog.tsx (modal + focus). Its executable spec is
// apps/web/e2e/host-availability.spec.ts.

// 'use client' marks this a CLIENT component: it ships JS to the browser and may
// use state + event handlers. The availability PAGE that renders it is a Server
// Component — it fetches the initial blocks on the server and passes them in as a
// prop; from there this component owns the live list in client state.
'use client';

import { useState } from 'react';
import {
  listingBlocksResponse,
  type AvailabilityBlock,
} from '@harbourstay/shared';
import { longDateLabel } from '@/lib/dates';

export interface AvailabilityManagerProps {
  /** The listing whose calendar we're editing (id → the URL we POST/DELETE to). */
  listingId: string;
  /** The blocks the SERVER fetched for the initial render — our starting state. */
  initialBlocks: AvailabilityBlock[];
}

export function AvailabilityManager({
  listingId,
  initialBlocks,
}: AvailabilityManagerProps) {
  // The live list of blocks. Seeded from the server-fetched prop, then kept in
  // sync from each write's RESPONSE: the POST/DELETE endpoints return the FULL
  // refreshed ListingBlocksResponse, so after a successful mutation we just
  // replace this array with the server's authoritative list — no separate
  // re-fetch, and the server (not our optimistic guess) stays the source of truth.
  //
  // ASIDE — the S6a alternative was `router.refresh()`, which re-runs the server
  // component and feeds fresh props down. We don't need it here because the write
  // response already carries the new list; using it in local state gives snappier
  // UX with no full server round-trip. Either is fine; the lesson below applies
  // to BOTH.
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>(initialBlocks);

  // The two controlled date inputs of the add-form. Controlled = React owns the
  // value; the input shows exactly what's in state and every keystroke updates it.
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');

  // Which async action is in flight. `adding` guards the add-form; `removingId`
  // holds the id of the block currently being deleted (so only THAT row's button
  // shows a busy/disabled state, not every row). Both also block double-submits.
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Inline error message, or null when all is well. One shared slot for both
  // actions — whichever failed most recently.
  const [error, setError] = useState<string | null>(null);

  // Client-side validation is UX only (instant feedback, disable the button); the
  // SERVER is authoritative and also rejects overlaps with holds/bookings/blocks.
  // String comparison is correct for `YYYY-MM-DD` (lexicographic == chronological).
  const rangeValid = checkIn !== '' && checkOut !== '' && checkIn < checkOut;

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault(); // don't let the browser do a full-page form GET/POST
    if (!rangeValid || adding) return;

    setAdding(true);
    setError(null);
    try {
      // Same-origin call → the httpOnly auth cookie is attached automatically, so
      // the API knows which host is acting (and that they own this listing).
      const res = await fetch(`/api/host/listings/${listingId}/blocks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ checkIn, checkOut }),
      });

      if (res.status === 401) {
        // Session expired mid-session → log in, then come back to this page.
        window.location.assign(
          `/login?next=/host/listings/${listingId}/availability`,
        );
        return;
      }
      if (res.status === 400) {
        // The server refused the range (inverted, or overlaps an existing
        // hold/booking/block). It is authoritative — surface its complaint.
        setError(
          'That range can’t be blocked — it may overlap an existing booking or block.',
        );
        setAdding(false);
        return;
      }
      if (!res.ok) {
        setError('Could not block that range. Please try again.');
        setAdding(false);
        return;
      }

      // Success. Re-parse the response with the shared schema (contract check at
      // the boundary), then swap in the server's full list and clear the inputs.
      const next = listingBlocksResponse.parse(await res.json());
      setBlocks(next);
      setCheckIn('');
      setCheckOut('');
      // KEY LESSON (carried from the S6a stuck-button bug): reset `adding` HERE,
      // on the success path. This component never remounts across a mutation —
      // updating state (or router.refresh()) re-RENDERS the same instance, it
      // does not recreate it — so its local state, this `adding` flag included,
      // survives. If we forgot this line, the button would stay disabled reading
      // "Blocking…" forever and the host could add exactly one range per page load.
      setAdding(false);
    } catch {
      // Network error (fetch rejected) — re-enable so they can retry.
      setError('Network error. Please try again.');
      setAdding(false);
    }
  }

  async function handleRemove(blockId: string) {
    if (removingId) return; // one removal at a time
    setRemovingId(blockId);
    setError(null);
    try {
      const res = await fetch(
        `/api/host/listings/${listingId}/blocks/${blockId}`,
        { method: 'DELETE' },
      );

      if (res.status === 401) {
        window.location.assign(
          `/login?next=/host/listings/${listingId}/availability`,
        );
        return;
      }
      if (!res.ok) {
        setError('Could not unblock that range. Please try again.');
        setRemovingId(null);
        return;
      }

      const next = listingBlocksResponse.parse(await res.json());
      setBlocks(next);
      // Same lesson as above: clear the in-flight flag on the success path. No
      // remount happens, so nothing else would.
      setRemovingId(null);
    } catch {
      setError('Network error. Please try again.');
      setRemovingId(null);
    }
  }

  return (
    <section className="flex flex-col gap-6" data-testid="availability-manager">
      {/* ---- Add-range form -------------------------------------------------- */}
      <form
        onSubmit={handleAdd}
        data-testid="block-add-form"
        className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-lg font-semibold">Block a date range</h2>
        <p className="text-sm text-gray-600">
          Guests can’t book nights you block. The range is half-open — the
          check-out day itself stays bookable.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="block-check-in" className="text-sm font-medium">
              From (check-in)
            </label>
            <input
              id="block-check-in"
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              data-testid="block-check-in"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="block-check-out" className="text-sm font-medium">
              To (check-out)
            </label>
            <input
              id="block-check-out"
              type="date"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              data-testid="block-check-out"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
            />
          </div>
        </div>

        {/* Inline hint when both dates are set but out of order — pure UX. */}
        {checkIn !== '' && checkOut !== '' && checkIn >= checkOut && (
          <p className="text-sm text-amber-700" data-testid="block-range-hint">
            Check-out must be after check-in.
          </p>
        )}

        {error && (
          <p
            role="alert"
            data-testid="block-error"
            className="rounded-md bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          data-testid="block-submit"
          // Disabled until the range is valid and while a POST is in flight.
          disabled={!rangeValid || adding}
          className="w-fit rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {adding ? 'Blocking…' : 'Block range'}
        </button>
      </form>

      {/* ---- Current blocks -------------------------------------------------- */}
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Blocked ranges</h2>

        {blocks.length === 0 ? (
          <p
            data-testid="blocks-empty"
            className="rounded-xl border border-dashed border-gray-300 p-6 text-sm text-gray-600"
          >
            No blocked ranges yet. Every open night is bookable.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="blocks-list">
            {blocks.map((block) => (
              <li
                key={block.id}
                data-testid="block-row"
                data-block-id={block.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm"
              >
                <span className="text-sm text-gray-800">
                  <span className="font-medium">
                    {longDateLabel(block.checkIn)}
                  </span>{' '}
                  →{' '}
                  <span className="font-medium">
                    {longDateLabel(block.checkOut)}
                  </span>
                </span>
                <button
                  type="button"
                  data-testid="block-remove"
                  onClick={() => handleRemove(block.id)}
                  // Disable this row's button while ANY removal is in flight, so a
                  // host can't fire two deletes at once and race the re-sync.
                  disabled={removingId !== null}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {removingId === block.id ? 'Removing…' : 'Remove'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
