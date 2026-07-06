'use client';

import {
  addDays,
  dayOfMonth,
  isSameMonth,
  longDateLabel,
  monthGridDays,
  monthLabel,
  nightsInStay,
  todayISO,
} from '@/lib/dates';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export interface AvailabilityCalendarProps {
  /** First day (`YYYY-MM-DD`) of the month currently shown. */
  monthStart: string;
  /** Nights that are taken and cannot be part of a stay. */
  takenNights: ReadonlySet<string>;
  /** Currently selected check-in / check-out (`YYYY-MM-DD`), or null. */
  checkIn: string | null;
  checkOut: string | null;
  /** A day was clicked (already known to be a valid, non-disabled day). */
  onSelectDay: (iso: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** Can't page earlier than the current month. */
  canGoPrev: boolean;
  /** Availability for this month is still loading — disable everything. */
  loading?: boolean;
}

/**
 * Hand-rolled, dependency-free month calendar for picking a stay range.
 *
 * Half-open semantics: a day is disabled only when ITS OWN NIGHT is taken
 * (`takenNights`), so the checkout day of an existing range stays selectable.
 * Past days and days outside the visible month are disabled too. Each day is a
 * native <button> so it is keyboard-operable and focusable for free; disabled
 * days carry an aria-label announcing they are unavailable.
 */
export function AvailabilityCalendar({
  monthStart,
  takenNights,
  checkIn,
  checkOut,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
  canGoPrev,
  loading = false,
}: AvailabilityCalendarProps) {
  const today = todayISO();
  const days = monthGridDays(monthStart);
  const stayNights =
    checkIn && checkOut ? new Set(nightsInStay(checkIn, checkOut)) : null;

  function stateFor(iso: string): {
    disabled: boolean;
    selectable: boolean;
    label: string;
  } {
    const inMonth = isSameMonth(iso, monthStart);
    const isPast = iso < today;
    // A day whose night is taken can't be a check-in, but it CAN be a checkout
    // (half-open) — allow it as a checkout candidate only when a check-in is set
    // and this day closes the stay with no taken night in between.
    const nightTaken = takenNights.has(iso);
    const asCheckoutOnly =
      checkIn !== null && !checkOut && iso > checkIn && nightTaken;
    const selectable =
      inMonth && !isPast && (!nightTaken || asCheckoutOnly) && !loading;
    const disabled = !selectable;
    const reason = isPast
      ? 'in the past'
      : nightTaken && !asCheckoutOnly
        ? 'unavailable'
        : '';
    const label = reason
      ? `${longDateLabel(iso)}, ${reason}`
      : longDateLabel(iso);
    return { disabled, selectable, label };
  }

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onPrevMonth}
          disabled={!canGoPrev}
          aria-label="Previous month"
          className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-30"
        >
          ‹
        </button>
        <span
          className="text-sm font-semibold"
          aria-live="polite"
          data-testid="calendar-month-label"
        >
          {monthLabel(monthStart)}
        </span>
        <button
          type="button"
          onClick={onNextMonth}
          aria-label="Next month"
          className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
        >
          ›
        </button>
      </div>

      <div
        className="grid grid-cols-7 gap-1"
        role="grid"
        aria-label={`Availability for ${monthLabel(monthStart)}`}
      >
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            role="columnheader"
            className="py-1 text-center text-[0.65rem] font-medium uppercase text-gray-400"
          >
            {w}
          </div>
        ))}

        {days.map((iso) => {
          const inMonth = isSameMonth(iso, monthStart);
          const { disabled, label } = stateFor(iso);
          const isCheckIn = iso === checkIn;
          const isCheckOut = iso === checkOut;
          const inStay = stayNights?.has(iso) ?? false;
          const isEndpoint = isCheckIn || isCheckOut;

          return (
            <button
              key={iso}
              type="button"
              role="gridcell"
              disabled={disabled}
              aria-disabled={disabled || undefined}
              aria-pressed={isEndpoint || undefined}
              aria-label={label}
              data-testid={`day-${iso}`}
              data-available={!disabled || undefined}
              onClick={() => onSelectDay(iso)}
              className={[
                'aspect-square rounded-md text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900',
                !inMonth ? 'text-gray-300' : '',
                disabled
                  ? 'cursor-not-allowed text-gray-300 line-through'
                  : 'hover:bg-gray-100',
                isEndpoint ? 'bg-gray-900 font-semibold text-white hover:bg-gray-900' : '',
                inStay && !isEndpoint ? 'bg-gray-200' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {dayOfMonth(iso)}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[0.7rem] text-gray-400">
        Crossed-out dates are unavailable. Availability is confirmed at checkout.
      </p>
    </div>
  );
}

/** Exposed for the widget's range-validation logic. */
export { addDays };
