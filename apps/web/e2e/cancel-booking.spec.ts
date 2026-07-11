import { expect, test, type Page } from '@playwright/test';

/**
 * S5 headline journey: sign in → open My Bookings → open a CANCELLABLE booking →
 * open the cancel dialog → confirm → the booking shows Cancelled with the
 * refunded amount. Plus the negative path: a NON-cancellable booking either can't
 * be confirmed client-side (the dialog shows "can no longer be cancelled" with a
 * disabled confirm) or the confirm surfaces the server's 409 message.
 *
 * RED ON PURPOSE. The interactive cancel dialog
 * (apps/web/components/cancel-booking-dialog.tsx) is Ken's fill file and ships as
 * a compiling stub, so the `cancel-booking-trigger` / dialog / `cancel-confirm`
 * hooks these tests drive do not exist yet. This spec is the executable spec that
 * defines them; it goes green once the dialog is implemented against a live stack.
 *
 * REQUIRES the FULL stack live to pass green:
 *  - the API with Ken's S5 read + cancel handlers: GET /me/bookings,
 *    GET /bookings/:id (BookingDetail), POST /bookings/:id/cancel enforcing the
 *    cancellation policy (409 InvalidBookingStateException when too late / wrong
 *    state),
 *  - the httpOnly-cookie auth flow from S2.
 *
 * SEED ASSUMPTIONS (this journey can't create paid bookings through the UI — that
 * needs Stripe + the webhook — so it relies on pre-seeded data for a known guest):
 *  - E2E_SEED_GUEST_EMAIL / E2E_SEED_GUEST_PASSWORD — a guest account that already
 *    owns bookings (defaults below).
 *  - At least one CANCELLABLE booking for that guest: status Confirmed (or
 *    PendingPayment) with check-in >= 7 days out so the 100%/50% refund tier
 *    applies and the dialog offers a refund. The happy path picks the first
 *    Confirmed card from the list, or navigates straight to
 *    E2E_CANCELLABLE_BOOKING_ID when provided.
 *  - At least one NON-cancellable booking: status Confirmed with check-in < 48h
 *    (policy refuses). Provide its id via E2E_NONCANCELLABLE_BOOKING_ID; the
 *    negative path is skipped with a note if it is unset.
 */

const SEED_GUEST_EMAIL =
  process.env.E2E_SEED_GUEST_EMAIL ?? 'guest@harbourstay.test';
const SEED_GUEST_PASSWORD =
  process.env.E2E_SEED_GUEST_PASSWORD ?? 'supersecret1';
const CANCELLABLE_BOOKING_ID = process.env.E2E_CANCELLABLE_BOOKING_ID;
const NON_CANCELLABLE_BOOKING_ID = process.env.E2E_NONCANCELLABLE_BOOKING_ID;

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(SEED_GUEST_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(SEED_GUEST_PASSWORD);
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/account$/);
}

/** Open the manage-booking detail page for a cancellable booking. */
async function openCancellableBooking(page: Page): Promise<void> {
  if (CANCELLABLE_BOOKING_ID) {
    await page.goto(`/account/bookings/${CANCELLABLE_BOOKING_ID}`);
  } else {
    await page.goto('/account/bookings');
    // Newest-first list; pick the first Confirmed booking (cancellable status).
    const confirmed = page
      .getByTestId('booking-card')
      .filter({ has: page.locator('[data-status="Confirmed"]') })
      .first();
    await expect(confirmed).toBeVisible();
    await confirmed.click();
  }
  await expect(page.getByTestId('booking-detail-title')).toBeVisible();
}

test('the my-bookings list links through to a booking detail', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/account/bookings');

  const firstCard = page.getByTestId('booking-card').first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();

  await expect(page).toHaveURL(/\/account\/bookings\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('booking-detail-title')).toBeVisible();
  await expect(page.getByTestId('booking-total')).toBeVisible();
});

test('cancel a booking → it shows Cancelled with the refunded amount', async ({
  page,
}) => {
  await signIn(page);
  await openCancellableBooking(page);

  // Open the confirm dialog (no cancel fires until the user confirms).
  await page.getByTestId('cancel-booking-trigger').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // The dialog previews the refund the guest would get (client-side estimate).
  await expect(dialog.getByTestId('cancel-refund-preview')).toBeVisible();

  // Confirm → POST /api/bookings/:id/cancel; the server's response is authoritative.
  await dialog.getByTestId('cancel-confirm').click();

  // The page refreshes to the cancelled state with the server's refund amount.
  await expect(page.getByTestId('booking-status')).toHaveAttribute(
    'data-status',
    'Cancelled',
  );
  await expect(page.getByTestId('booking-cancelled-notice')).toBeVisible();
  await expect(page.getByTestId('booking-refund')).toBeVisible();
});

test('a non-cancellable booking cannot be confirmed', async ({ page }) => {
  test.skip(
    !NON_CANCELLABLE_BOOKING_ID,
    'Set E2E_NONCANCELLABLE_BOOKING_ID to a seeded booking within 48h of check-in.',
  );

  await signIn(page);
  await page.goto(`/account/bookings/${NON_CANCELLABLE_BOOKING_ID}`);
  await expect(page.getByTestId('booking-detail-title')).toBeVisible();

  await page.getByTestId('cancel-booking-trigger').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // The client-side preview says the booking can no longer be cancelled, and the
  // confirm button is disabled so no POST is fired. (If the preview is optimistic
  // and lets the POST through, the server's 409 message surfaces in cancel-error
  // instead — either outcome proves the guest cannot cancel too late.)
  const notAllowed = dialog.getByTestId('cancel-not-allowed');
  const confirm = dialog.getByTestId('cancel-confirm');
  const serverError = dialog.getByTestId('cancel-error');

  if (await notAllowed.count()) {
    await expect(notAllowed).toBeVisible();
    await expect(confirm).toBeDisabled();
  } else {
    await confirm.click();
    await expect(serverError).toBeVisible();
    await expect(serverError).toContainText(/cancel/i);
  }

  // Either way the booking is NOT cancelled.
  await expect(page.getByTestId('booking-status')).not.toHaveAttribute(
    'data-status',
    'Cancelled',
  );
});
