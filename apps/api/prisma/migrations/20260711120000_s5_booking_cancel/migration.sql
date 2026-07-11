-- S5 (My Bookings + Cancel): record the cancellation outcome on the booking row.
-- Both columns are nullable — NULL until the booking is cancelled. `refundAmount`
-- is in minor units (cents); it is COMPUTED by the CancellationPolicy and stored
-- here for audit/display only (no Stripe refund is issued — out of scope, PRD §2/§6).

-- AlterTable
ALTER TABLE "booking" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "refundAmount" INTEGER;
