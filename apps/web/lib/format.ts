/**
 * Format a price as USD for display only. Prices cross the wire in **minor
 * units (cents)** — the system-wide convention (matches Stripe in S4) — so we
 * divide by 100 before formatting. e.g. 18000 -> "$180".
 */
export function formatPrice(minorUnits: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(minorUnits / 100);
}
