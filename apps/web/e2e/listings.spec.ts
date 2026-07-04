import { expect, test } from '@playwright/test';

/**
 * S1 headline journey: search → results → open a listing detail.
 *
 * Deterministic-friendly: if a seeded id is exposed via PLAYWRIGHT_SEED_LISTING_ID
 * we assert that specific listing; otherwise we click the first card and assert
 * the detail title matches the card's title (no hardcoded fixtures).
 *
 * Requires the API running/seeded and the web server up (see playwright.config.ts).
 */

test('search page renders published listings', async ({ page }) => {
  await page.goto('/listings');

  await expect(
    page.getByRole('heading', { name: /find your stay/i }),
  ).toBeVisible();

  // Either results or an explicit empty state — never a silent blank screen.
  const cards = page.getByTestId('listing-card');
  const empty = page.getByTestId('listings-empty');
  await expect(cards.first().or(empty)).toBeVisible();
});

test('clicking a listing card lands on its detail page with the same title', async ({
  page,
}) => {
  await page.goto('/listings');

  const cards = page.getByTestId('listing-card');
  await expect(
    cards.first(),
    'expected at least one seeded published listing',
  ).toBeVisible();

  const firstCard = cards.first();
  const cardTitle = (
    await firstCard.getByTestId('listing-card-title').innerText()
  ).trim();

  await firstCard.click();

  await expect(page).toHaveURL(/\/listings\/[^/]+$/);

  const detailTitle = page.getByTestId('listing-detail-title');
  await expect(detailTitle).toBeVisible();
  await expect(detailTitle).toHaveText(cardTitle);
});

test('optionally verifies a deterministic seeded listing id', async ({
  page,
}) => {
  const seededId = process.env.PLAYWRIGHT_SEED_LISTING_ID;
  test.skip(!seededId, 'no PLAYWRIGHT_SEED_LISTING_ID provided');

  await page.goto(`/listings/${seededId}`);
  await expect(page.getByTestId('listing-detail-title')).toBeVisible();
});

test('filling only Location and submitting filters the grid via the URL', async ({
  page,
}) => {
  // Regression for the S1 form bug: untouched optional from/to/guests fields
  // must NOT block submit. Filling only Location and clicking Search should
  // navigate and re-render the filtered grid.
  await page.goto('/listings');

  await page.getByLabel('Location').fill('Wellington');
  await page.getByRole('button', { name: /search/i }).click();

  // URL carries the location filter (case-insensitive on the value).
  await expect(page).toHaveURL(/[?&]location=Wellington/i);

  // No untouched-field validation errors blocked the submit. Scope to the form
  // (accessible name "Search listings") so Next's persistent route-announcer
  // (a page-level role="alert") is excluded.
  await expect(
    page.getByRole('form', { name: /search listings/i }).getByRole('alert'),
  ).toHaveCount(0);

  // Wellington has 2 seeded Published listings (Harbour Loft + Lighthouse Walk).
  const cards = page.getByTestId('listing-card');
  await expect(cards).toHaveCount(2);
});

test('submitting with every field empty browses all listings', async ({
  page,
}) => {
  await page.goto('/listings');

  await page.getByRole('button', { name: /search/i }).click();

  // Empty submit → no query params, all 6 seeded Published cards. Scope the
  // no-error check to the form so Next's route-announcer alert is excluded.
  await expect(page).toHaveURL(/\/listings\/?$/);
  await expect(
    page.getByRole('form', { name: /search listings/i }).getByRole('alert'),
  ).toHaveCount(0);
  await expect(page.getByTestId('listing-card')).toHaveCount(6);
});

test('an unknown listing id renders the not-found page', async ({ page }) => {
  // A well-formed but non-existent uuid should surface Next.js notFound().
  await page.goto('/listings/00000000-0000-0000-0000-000000000000');
  await expect(page.getByTestId('listing-not-found')).toBeVisible();
});
