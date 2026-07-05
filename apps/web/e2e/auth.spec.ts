import { expect, test } from '@playwright/test';

/**
 * S2 headline journey: register → land authed → reload stays authed → visit the
 * protected route → logout. Also covers the two guard edges (anonymous hitting
 * /account, and a bad-password login error).
 *
 * REQUIRES the API running with the auth domain implemented (Ken's fill) and the
 * httpOnly-cookie flow live. Until then this spec LISTS but does not pass — it is
 * the executable spec for the slice, authored complete and red on purpose.
 *
 * Each run registers a fresh unique email so the journey is self-contained and
 * repeatable (no shared fixture state).
 */

function uniqueEmail(): string {
  return `e2e+${Date.now()}-${Math.floor(Math.random() * 1e6)}@harbourstay.test`;
}

const PASSWORD = 'supersecret1';

test('anonymous visit to /account redirects to /login', async ({ page }) => {
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login(\?|$)/);
});

test('sign up → authed → reload persists → protected route → logout', async ({
  page,
}) => {
  const email = uniqueEmail();

  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  // Role defaults to guest; submit.
  await page.getByRole('button', { name: /create account/i }).click();

  // Landed on the protected account page, showing the new user.
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByTestId('account-email')).toHaveText(email);
  await expect(page.getByTestId('account-role')).toHaveText(/guest/i);

  // Header reflects the session (server-side read).
  await expect(page.getByTestId('header-user-email')).toHaveText(email);

  // Reload: the httpOnly cookie keeps the session across a full page load.
  await page.reload();
  await expect(page.getByTestId('account-email')).toHaveText(email);

  // Logout clears the cookie and returns to a signed-out header.
  await page.getByRole('button', { name: /log out/i }).click();
  await expect(page.getByRole('link', { name: /log in/i })).toBeVisible();

  // The guard now rejects the protected route again.
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login(\?|$)/);
});

test('login with an unknown account shows an inline error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByLabel('Password', { exact: true }).fill('wrongpassword');
  await page.getByRole('button', { name: /log in/i }).click();

  // 401 from the API surfaces as a form-level alert, no navigation.
  await expect(
    page.getByRole('form', { name: /log in/i }).getByRole('alert'),
  ).toContainText(/invalid/i);
  await expect(page).toHaveURL(/\/login(\?|$)/);
});

test('signup rejects a too-short password client-side', async ({ page }) => {
  // Shared registerRequest enforces min-8; zodResolver blocks submit with no
  // network call, proving the form validates against the shared schema.
  await page.goto('/signup');
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(
    page.getByRole('form', { name: /create account/i }).getByRole('alert'),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/signup(\?|$)/);
});
