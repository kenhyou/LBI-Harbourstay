import { expect, test, type Page } from '@playwright/test';

/**
 * S6b headline journey: a host manages availability + views bookings.
 *
 * SELF-CONTAINED: each run registers a FRESH host account through the real signup
 * flow (role=host), creates a listing, then opens that listing's availability
 * page → adds a blocked range (asserts it appears) → removes it (asserts it's
 * gone). Finally visits /host/bookings; a fresh host has none, so the empty state
 * is the assertion.
 *
 * REQUIRES the FULL stack live to pass green:
 *  - the API with the S6b host-blocks endpoints (GET/POST /host/listings/:id/blocks,
 *    DELETE /host/listings/:id/blocks/:blockId) and GET /host/bookings, host-role-gated,
 *  - the S2 httpOnly-cookie auth flow with role=host registration,
 *  - the S6a host-listings endpoints (to create the listing under test).
 * Until the parallel backend is up these fail at the add-block step; the spec is
 * the executable definition of the journey.
 */

const PASSWORD = 'supersecret1';

function uniqueEmail(prefix: string): string {
  return `e2e-${prefix}+${Date.now()}-${Math.floor(Math.random() * 1e6)}@harbourstay.test`;
}

/** Register a brand-new host via the signup UI and land on /account. */
async function registerHost(page: Page): Promise<string> {
  const email = uniqueEmail('host');
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('radio', { name: /host a place/i }).check();
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/account$/);
  return email;
}

/** Create a listing through the editor and return to the dashboard. */
async function createListing(page: Page, title: string): Promise<void> {
  await page.goto('/host/listings/new');
  await page.getByLabel('Title').fill(title);
  await page
    .getByLabel('Description')
    .fill('A calm room by the harbour, ideal for a short stay.');
  await page.getByLabel('Type').selectOption('stay');
  await page.getByLabel('Location').fill('Wellington');
  await page.getByLabel('Capacity (guests)').fill('2');
  await page.getByLabel('Base price (USD / night)').fill('120');
  await page.getByTestId('editor-submit').click();
  await expect(page).toHaveURL(/\/host\/listings$/);
}

test('host: block a range → see it → remove it', async ({ page }) => {
  await registerHost(page);

  const title = `Harbour Room ${Date.now()}`;
  await createListing(page, title);

  // Open the availability page from the listing card.
  const card = page.getByTestId('host-listing-card').filter({ hasText: title });
  await expect(card).toBeVisible();
  await card.getByTestId('host-listing-availability').click();
  await expect(page).toHaveURL(/\/host\/listings\/[0-9a-f-]{36}\/availability$/);

  // Fresh listing → no blocks yet.
  await expect(page.getByTestId('blocks-empty')).toBeVisible();

  // Add a future range (well clear of "today" so it never overlaps anything).
  const checkIn = '2030-01-10';
  const checkOut = '2030-01-15';
  await page.getByTestId('block-check-in').fill(checkIn);
  await page.getByTestId('block-check-out').fill(checkOut);
  await page.getByTestId('block-submit').click();

  // The new block shows as a row; the empty state is gone.
  const row = page.getByTestId('block-row');
  await expect(row).toHaveCount(1);
  await expect(page.getByTestId('blocks-list')).toContainText('January 10, 2030');
  await expect(page.getByTestId('blocks-list')).toContainText('January 15, 2030');
  await expect(page.getByTestId('blocks-empty')).toBeHidden();

  // Remove it → back to the empty state.
  await row.getByTestId('block-remove').click();
  await expect(page.getByTestId('block-row')).toHaveCount(0);
  await expect(page.getByTestId('blocks-empty')).toBeVisible();
});

test('host: an out-of-order range keeps the block button disabled', async ({
  page,
}) => {
  await registerHost(page);

  const title = `Order Test ${Date.now()}`;
  await createListing(page, title);

  const card = page.getByTestId('host-listing-card').filter({ hasText: title });
  await card.getByTestId('host-listing-availability').click();

  // check-out before check-in → client validation disables submit + shows a hint.
  await page.getByTestId('block-check-in').fill('2030-02-10');
  await page.getByTestId('block-check-out').fill('2030-02-05');
  await expect(page.getByTestId('block-range-hint')).toBeVisible();
  await expect(page.getByTestId('block-submit')).toBeDisabled();
});

test('host: the bookings page shows an empty state for a fresh host', async ({
  page,
}) => {
  await registerHost(page);

  // Reachable from the header.
  await expect(page.getByTestId('header-host-bookings-link')).toBeVisible();
  await page.getByTestId('header-host-bookings-link').click();
  await expect(page).toHaveURL(/\/host\/bookings$/);

  await expect(page.getByTestId('host-bookings-empty')).toBeVisible();
});
