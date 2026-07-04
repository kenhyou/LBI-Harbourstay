-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('stay', 'tour');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('Published', 'Unpublished');

-- CreateTable
CREATE TABLE "listing" (
    "id" UUID NOT NULL,
    "hostId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "ListingType" NOT NULL DEFAULT 'stay',
    "location" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "basePrice" INTEGER NOT NULL,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ListingStatus" NOT NULL DEFAULT 'Published',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_block" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "price" INTEGER,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "availability_block_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_status_location_idx" ON "listing"("status", "location");

-- CreateIndex
CREATE INDEX "availability_block_listingId_checkIn_checkOut_idx" ON "availability_block"("listingId", "checkIn", "checkOut");

-- AddForeignKey
ALTER TABLE "availability_block" ADD CONSTRAINT "availability_block_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
