-- CreateEnum
CREATE TYPE "HoldStatus" AS ENUM ('active', 'committed', 'released', 'expired');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PendingPayment', 'Confirmed', 'Completed', 'Cancelled', 'Expired', 'NoShow');

-- CreateTable
CREATE TABLE "hold" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "status" "HoldStatus" NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking" (
    "id" UUID NOT NULL,
    "guestId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "holdId" UUID NOT NULL,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "partySize" INTEGER NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PendingPayment',
    "priceSnapshot" INTEGER NOT NULL,
    "holdExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hold_listingId_status_idx" ON "hold"("listingId", "status");

-- CreateIndex
CREATE INDEX "booking_guestId_idx" ON "booking"("guestId");

-- ============================================================================
-- THE OVERBOOKING GUARANTEE (hand-added; Prisma cannot express an EXCLUDE).
-- This is the single most important line in the system (DESIGN.md BC-2).
--
-- The invariant "no two overlapping active/committed holds on the same listing"
-- spans multiple Hold rows, so no single aggregate can enforce it. Postgres does,
-- atomically, via a GiST exclusion constraint over a half-open `[checkIn, checkOut)`
-- daterange. Two concurrent overlapping INSERTs: one commits, the other fails with
-- SQLSTATE 23P01 (exclusion_violation) — caught in HoldRepository →
-- OverlappingHoldException → HTTP 409. Only 'active'/'committed' rows participate,
-- so released/expired holds free the dates back up. See ADR-0007.
-- ============================================================================

-- GiST needs btree_gist to combine the `=` on listingId (a UUID/btree type) with
-- the `&&` overlap on the daterange in one index.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "hold"
  ADD CONSTRAINT no_overlapping_holds
  EXCLUDE USING gist (
    "listingId" WITH =,
    daterange("checkIn", "checkOut", '[)') WITH &&
  )
  WHERE (status IN ('active', 'committed'));
