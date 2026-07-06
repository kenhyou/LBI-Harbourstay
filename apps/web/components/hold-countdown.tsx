'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export interface HoldCountdownProps {
  /** ISO-8601 timestamp when the hold expires (`bookingSummary.holdExpiresAt`). */
  holdExpiresAt: string;
  /** Where to send the guest to re-pick dates once the hold has lapsed. */
  listingHref: string;
}

function remainingMs(expiresAt: string): number {
  return Math.max(0, new Date(expiresAt).getTime() - Date.now());
}

function format(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Live TTL countdown for a pending-payment hold. Ticks once a second from the
 * server-provided `holdExpiresAt`; when it reaches zero the hold is shown as
 * expired with a link back to re-pick dates. Seeds from the timestamp (not a
 * fixed duration) so a page reload resumes at the correct remaining time.
 */
export function HoldCountdown({ holdExpiresAt, listingHref }: HoldCountdownProps) {
  const [ms, setMs] = useState(() => remainingMs(holdExpiresAt));

  useEffect(() => {
    setMs(remainingMs(holdExpiresAt));
    const id = setInterval(() => {
      setMs(remainingMs(holdExpiresAt));
    }, 1000);
    return () => clearInterval(id);
  }, [holdExpiresAt]);

  if (ms <= 0) {
    return (
      <div
        role="alert"
        data-testid="hold-expired"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        <p className="font-medium">This hold has expired.</p>
        <p className="mt-1">
          The dates were released.{' '}
          <Link href={listingHref} className="underline hover:no-underline">
            Pick your dates again
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-amber-200 bg-amber-50 p-4"
      data-testid="hold-countdown"
      role="timer"
      aria-live="polite"
    >
      <p className="text-sm text-amber-800">
        Dates held — complete payment within{' '}
        <span className="font-mono font-semibold tabular-nums">
          {format(ms)}
        </span>
      </p>
    </div>
  );
}
