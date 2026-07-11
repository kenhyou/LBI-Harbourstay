import { expect, test, type Page } from '@playwright/test';

/**
 * S6a headline journey: a host manages their own listings.
 *
 * SELF-CONTAINED: each run registers a FRESH host account through the real
 * signup flow (role=host), so the test depends on no seed data and is repeatable.
 * From there: land on the (empty) dashboard → create a listing → see it in the
 * dashboard → edit its title → toggle publish/unpublish.
 *
 * Plus a NEGATIVE guard: a signed-in GUEST visiting /host/listings is bounced to
 * the /host/forbidden 403 page (server-side role guard).
 *
 * REQUIRES the FULL stack live to pass green:
 *  - the API with the S6a host-listings endpoints (GET/POST /host/listings,
 *    PATCH /host/listings/:id, POST .../publish|unpublish), all host-role-gated,
 *  - the httpOnly-cookie auth flow from S2 with role=host registration.
 * Until the parallel backend is up these will fail at the create step; the spec
 * is the executable definition of the journey.
 */

const PASSWORD = 'supersecret1';

function uniqueEmail(prefix: string): string {
  return `e2e-${prefix}+${Date.now()}-${Math.floor(Math.random() * 1e6)}@harbourstay.test`;
}

/** Register a brand-new account with the given role via the signup UI. */
async function registerAs(
  page: Page,
  role: 'host' | 'guest',
): Promise<string> {
  const email = uniqueEmail(role);
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  if (role === 'host') {
    await page.getByRole('radio', { name: /host a place/i }).check();
  }
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/account$/);
  return email;
}

test('host: create → see → edit a DRAFT (description survives) → publish/unpublish', async ({
  page,
}) => {
  await registerAs(page, 'host');

  // The header exposes the Host entry for a host account.
  await expect(page.getByTestId('header-host-link')).toBeVisible();

  // Empty dashboard for a fresh host.
  await page.goto('/host/listings');
  await expect(page.getByTestId('host-listings-empty')).toBeVisible();

  // Create a listing. The description is a unique marker so we can later prove it
  // round-trips through a full-replace PATCH untouched.
  const title = `Harbour Loft ${Date.now()}`;
  const description = `A bright loft by the water — marker ${Date.now()}`;
  await page.getByTestId('new-listing-link').click();
  await expect(page).toHaveURL(/\/host\/listings\/new$/);

  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Description').fill(description);
  await page.getByLabel('Type').selectOption('stay');
  await page.getByLabel('Location').fill('Wellington');
  await page.getByLabel('Capacity (guests)').fill('4');
  // Entered in DOLLARS; the form converts to integer cents before POST.
  await page.getByLabel('Base price (USD / night)').fill('180');
  await page.getByTestId('editor-submit').click();

  // Back on the dashboard, the new listing shows as a card.
  await expect(page).toHaveURL(/\/host\/listings$/);
  const card = page.getByTestId('host-listing-card').filter({ hasText: title });
  await expect(card).toBeVisible();
  // Price rendered in dollars, not cents.
  await expect(card).toContainText('$180');

  // Normalise to an Unpublished DRAFT (whatever state the API created it in), so
  // the edit below exercises the draft-prefill path the detail endpoint fixed.
  const badge = card.getByTestId('listing-status');
  if ((await badge.getAttribute('data-status')) === 'Published') {
    await card.getByTestId('publish-toggle').click();
    await expect(badge).toHaveAttribute('data-status', 'Unpublished');
  }

  // Open the editor for the draft — every field must prefill LOSSLESSLY from
  // GET /host/listings/:id, including description + images for an Unpublished
  // listing (the guest read would 404 here).
  const newTitle = `${title} (Renovated)`;
  await card.getByTestId('host-listing-edit').click();
  await expect(page).toHaveURL(/\/host\/listings\/[0-9a-f-]{36}\/edit$/);
  await expect(page.getByLabel('Title')).toHaveValue(title);
  await expect(page.getByLabel('Description')).toHaveValue(description);

  // Change ONLY the title, then save (full-replace PATCH resends the prefilled
  // description).
  await page.getByLabel('Title').fill(newTitle);
  await page.getByTestId('editor-submit').click();
  await expect(page).toHaveURL(/\/host\/listings$/);

  const editedCard = page
    .getByTestId('host-listing-card')
    .filter({ hasText: newTitle });
  await expect(editedCard).toBeVisible();

  // Re-open the editor: the description SURVIVED the edit (the regression this
  // endpoint fixes — a blank prefill would have wiped it on save).
  await editedCard.getByTestId('host-listing-edit').click();
  await expect(page.getByLabel('Title')).toHaveValue(newTitle);
  await expect(page.getByLabel('Description')).toHaveValue(description);
  await page.goto('/host/listings');

  // Publish/unpublish round-trip — the status badge flips both ways.
  const editedBadge = editedCard.getByTestId('listing-status');
  const before = await editedBadge.getAttribute('data-status');
  await editedCard.getByTestId('publish-toggle').click();
  await expect(editedBadge).not.toHaveAttribute('data-status', before ?? '');

  const after = await editedBadge.getAttribute('data-status');
  await editedCard.getByTestId('publish-toggle').click();
  await expect(editedBadge).not.toHaveAttribute('data-status', after ?? '');
});

test('a signed-in guest is forbidden from the host dashboard', async ({
  page,
}) => {
  await registerAs(page, 'guest');

  await page.goto('/host/listings');

  // Server-side role guard bounces the guest to the 403 page — never the
  // dashboard, and not a login loop (they're already authenticated).
  await expect(page).toHaveURL(/\/host\/forbidden$/);
  await expect(page.getByTestId('host-forbidden')).toBeVisible();
});
