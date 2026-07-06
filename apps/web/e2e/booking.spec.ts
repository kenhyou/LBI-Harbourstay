import { expect, test, type Page } from '@playwright/test';

/**
 * S3 headline journey: sign in → open a listing → pick an available date range →
 * reserve → land on the pending-payment page showing the hold + a live TTL
 * countdown. Also covers the signed-out reserve guard.
 *
 * REQUIRES the full stack live: the API with Ken's Booking domain filled (the
 * availability read model + POST /bookings hold, plus GET /bookings/:id) AND at
 * least one seeded listing. Until then this spec LISTS but does not pass — it is
 * the executable spec for the slice, authored complete and red on purpose.
 *
 * Each run registers a fresh unique email so the journey is self-contained.
 */

function uniqueEmail(): string {
  return `e2e+${Date.now()}-${Math.floor(Math.random() * 1e6)}@harbourstay.test`;
}

const PASSWORD = 'supersecret1';

async function signUp(page: Page): Promise<void> {
  await page.goto('/signup');
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function openFirstListing(page: Page): Promise<void> {
  await page.goto('/listings');
  await page.getByTestId('listing-card').first().click();
  await expect(page.getByTestId('listing-detail-title')).toBeVisible();
}

/** Click the first two available (non-disabled) days as check-in/check-out. */
async function pickFirstAvailableRange(page: Page): Promise<void> {
  const available = page.locator('[data-testid^="day-"][data-available="true"]');
  await expect(available.first()).toBeVisible();
  const count = await available.count();
  expect(count).toBeGreaterThan(1);
  await available.nth(0).click();
  await available.nth(1).click();
  // Both endpoints reflected in the selection summary.
  await expect(page.getByTestId('selection-summary')).not.toContainText(
    'Select a date',
  );
}

test('signed-out reserve redirects to login with a next param', async ({
  page,
}) => {
  await openFirstListing(page);
  await expect(page.getByTestId('reserve-button')).toHaveText(/log in to reserve/i);
  await page.getByTestId('reserve-button').click();
  await expect(page).toHaveURL(/\/login\?next=/);
});

test('sign in → pick dates → reserve → pending page with live countdown', async ({
  page,
}) => {
  await signUp(page);
  await openFirstListing(page);

  // The calendar renders with at least some bookable days.
  await expect(page.getByTestId('calendar-month-label')).toBeVisible();
  await pickFirstAvailableRange(page);

  await page.getByTestId('reserve-button').click();

  // Landed on the pending-payment page for the new booking.
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('booking-status')).toHaveText(/pending payment/i);

  // The hold shows a live TTL countdown (mm:ss) derived from holdExpiresAt.
  await expect(page.getByTestId('hold-countdown')).toBeVisible();
  await expect(page.getByTestId('hold-countdown')).toContainText(/\d+:\d{2}/);

  // Reload keeps the session and the hold (server-first render + httpOnly cookie).
  await page.reload();
  await expect(page.getByTestId('booking-status')).toHaveText(/pending payment/i);
  await expect(page.getByTestId('booking-total')).toBeVisible();
});

test('reserving disabled dates is not possible from the calendar', async ({
  page,
}) => {
  await signUp(page);
  await openFirstListing(page);
  await expect(page.getByTestId('calendar-month-label')).toBeVisible();

  // Any day marked unavailable must be a disabled control (no data-available).
  const takenDays = page.locator(
    '[data-testid^="day-"]:not([data-available="true"])',
  );
  const count = await takenDays.count();
  for (let i = 0; i < count; i += 1) {
    await expect(takenDays.nth(i)).toBeDisabled();
  }
});
