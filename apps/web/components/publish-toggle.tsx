// A React PRIMER, written as Ken's teaching material for S6 (he asked to learn
// by reading working code rather than filling this in). This is the smallest
// real client component in the app: one button, one piece of state, one fetch.
// Read it top-to-bottom alongside cancel-booking-dialog.tsx (the fuller example).

// 'use client' marks this a CLIENT component: it ships JS to the browser and may
// use state + event handlers. The dashboard PAGE that renders it is a Server
// Component (it can't do any of that) — a server page is allowed to render a
// client child, and that's exactly the split here: server fetches the listings,
// this client button mutates one of them.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { HostListingSummary } from '@harbourstay/shared';

/**
 * The Publish / Unpublish button for one listing on the host dashboard. Its
 * label and action are derived from the listing's CURRENT status: a Published
 * listing offers "Unpublish", an Unpublished one offers "Publish".
 */
export function PublishToggle({ listing }: { listing: HostListingSummary }) {
  // `useRouter().refresh()` re-runs the SERVER component for this route, so after
  // a successful toggle the dashboard re-fetches from the API and re-renders with
  // the new status + badge — no manual client state juggling of the list.
  const router = useRouter();

  // useState = a value React remembers between renders; calling its setter
  // triggers a re-render. `submitting` guards against double-clicks (a second
  // POST while the first is in flight) and drives the disabled + busy label.
  const [submitting, setSubmitting] = useState(false);
  // `error` is null when all is well, or a message to show inline on failure.
  const [error, setError] = useState<string | null>(null);

  // Derive everything the button needs from the current status. Publishing a
  // currently-Unpublished listing → hit the /publish route; the reverse → /unpublish.
  const isPublished = listing.status === 'Published';
  const action = isPublished ? 'unpublish' : 'publish';
  const label = isPublished ? 'Unpublish' : 'Publish';

  async function handleClick() {
    setSubmitting(true);
    setError(null);
    try {
      // Same-origin call → the httpOnly auth cookie is attached automatically, so
      // the API knows which host is acting without us handling any token here.
      const res = await fetch(`/api/host/listings/${listing.id}/${action}`, {
        method: 'POST',
      });

      if (res.status === 401) {
        // Session expired mid-session → send them to log in, then back here.
        window.location.assign('/login?next=/host/listings');
        return;
      }
      if (!res.ok) {
        // Any other non-2xx (403/404/5xx): surface a message and re-enable.
        setError('Could not update this listing. Please try again.');
        setSubmitting(false);
        return;
      }

      // Success. Re-run the server component so the badge + this button's label
      // flip to reflect the new status (the label derives from the refreshed
      // `listing.status` prop). We DON'T flip the status locally — the server
      // response is the source of truth.
      router.refresh();
      // Reset `submitting` explicitly. KEY LESSON: `router.refresh()` re-renders
      // the server tree and feeds this component new props, but it does NOT
      // remount it — same list key + position means React keeps the SAME
      // instance, so its local state (this `submitting`) survives the refresh.
      // Only an actual unmount/remount clears client state. If we relied on a
      // remount that never happens, the button would stay disabled reading
      // "Working…" forever and the host could toggle only once per page load.
      setSubmitting(false);
    } catch {
      // Network error (fetch rejected) — re-enable so they can retry.
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        data-testid="publish-toggle"
        onClick={handleClick}
        disabled={submitting}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Working…' : label}
      </button>
      {error && (
        <span role="alert" data-testid="publish-error" className="text-xs text-red-600">
          {error}
        </span>
      )}
    </div>
  );
}
