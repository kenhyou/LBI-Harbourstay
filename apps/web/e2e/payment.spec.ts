import { expect, test, type FrameLocator, type Page } from '@playwright/test';

/**
 * S4 headline journey: reserve → Pay now → fill the Stripe Payment Element with
 * a test card → confirm → land on the confirmation route → poll until the
 * booking flips to Confirmed.
 *
 * REQUIRES the FULL stack live to pass green:
 *  - Ken's Booking domain + POST /bookings hold and GET /bookings/:id (from S3),
 *  - Ken's Payment domain + saga: POST /bookings/:id/pay returning a real Stripe
 *    (test-mode) PaymentIntent client secret, and the webhook handler that flips
 *    the booking to Confirmed,
 *  - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY set to a real pk_test_… key,
 *  - `stripe listen --forward-to <api>/webhooks/stripe` running so the async
 *    confirmation actually fires,
 *  - at least one seeded listing.
 * Until then this spec LISTS but does not pass — it is the executable spec for
 * the slice, authored complete and red on purpose.
 *
 * Payment Element note: it is a CROSS-ORIGIN iframe. We fill it via Playwright
 * frame locators (below). Stripe occasionally renames the frame title / field
 * placeholders across versions; if the selectors drift, adjust `stripeFrame()`
 * and the field fills — the journey shape stays the same. The confirmation step
 * depends on the webhook, so it is inherently only green with `stripe listen`
 * live.
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

async function pickFirstAvailableRange(page: Page): Promise<void> {
  const available = page.locator('[data-testid^="day-"][data-available="true"]');
  await expect(available.first()).toBeVisible();
  expect(await available.count()).toBeGreaterThan(1);
  await available.nth(0).click();
  await available.nth(1).click();
}

/** Get the Payment Element's combined card iframe. */
function stripeFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe[title="Secure payment input frame"]');
}

/** Fill the Stripe test card (4242…) into the Payment Element. */
async function fillTestCard(page: Page): Promise<void> {
  const frame = stripeFrame(page);
  await frame.getByPlaceholder('1234 1234 1234 1234').fill('4242424242424242');
  await frame.getByPlaceholder('MM / YY').fill('12 / 34');
  await frame.getByPlaceholder('CVC').fill('123');
  // Some Payment Element configs also collect a postal code; fill if present.
  const zip = frame.getByPlaceholder('12345');
  if (await zip.count()) {
    await zip.fill('12345');
  }
}

test('reserve → pay with test card → booking is confirmed', async ({ page }) => {
  await signUp(page);
  await openFirstListing(page);

  await expect(page.getByTestId('calendar-month-label')).toBeVisible();
  await pickFirstAvailableRange(page);
  await page.getByTestId('reserve-button').click();

  // Pending-payment page for the new booking.
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('booking-status')).toHaveText(/pending payment/i);

  // Start payment → the Payment Element mounts.
  await page.getByTestId('pay-button').click();
  await expect(page.getByTestId('payment-form')).toBeVisible();

  await fillTestCard(page);
  await page.getByTestId('confirm-payment-button').click();

  // Stripe redirects back to the confirmation route.
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}\/confirmed/, {
    timeout: 30_000,
  });

  // While the webhook is in flight we show a "confirming…" state; once the saga
  // flips the booking, the success screen appears (polling, cap ~30s).
  await expect(page.getByTestId('confirmation-success')).toBeVisible({
    timeout: 40_000,
  });
  await expect(page.getByTestId('confirmation-status')).toHaveText(/confirmed/i);
  await expect(page.getByTestId('confirmation-total')).toBeVisible();
});

test('pending page exposes a Pay action that mounts the Payment Element', async ({
  page,
}) => {
  await signUp(page);
  await openFirstListing(page);
  await expect(page.getByTestId('calendar-month-label')).toBeVisible();
  await pickFirstAvailableRange(page);
  await page.getByTestId('reserve-button').click();

  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('pay-button')).toBeVisible();
  await page.getByTestId('pay-button').click();

  // The Stripe Payment Element renders inside its cross-origin iframe.
  await expect(page.getByTestId('payment-form')).toBeVisible();
  await expect(
    stripeFrame(page).getByPlaceholder('1234 1234 1234 1234'),
  ).toBeVisible();
});
