import { Injectable } from '@nestjs/common';
import { DateRange } from '@/inventory/domain/vo/date-range.vo';
import { Money } from '@/inventory/domain/vo/money.vo';

/** The listing facts pricing needs. Kept tiny — no full Listing load required. */
export interface PricingInput {
  /** Per-night base rate (minor units), from the Listing's RatePlan. */
  basePrice: Money;
}

/**
 * BC-2 Pricing domain service (folded into Availability & Inventory for MVP).
 * Computes the all-in quoted total that Booking freezes as its `priceSnapshot`.
 *
 * MVP formula (real, but deliberately simple): `subtotal = basePrice × nights`,
 * plus a flat platform service fee of {@link PricingService.SERVICE_FEE_RATE}
 * rounded to whole minor units. Documented seam (DESIGN.md): when rate rules
 * grow (weekend uplift, LOS discounts), extract Pricing as its own BC — this
 * service + Rate/Fee/RatePlan move out wholesale.
 */
@Injectable()
export class PricingService {
  /** Platform service fee as a fraction of the room subtotal. */
  static readonly SERVICE_FEE_RATE = 0.1;

  quote(input: PricingInput, dateRange: DateRange): Money {
    const nights = dateRange.nights();
    const subtotal = input.basePrice.times(nights);
    const serviceFee = Money.create(
      Math.round(subtotal.amount * PricingService.SERVICE_FEE_RATE),
      input.basePrice.currency,
    );
    return subtotal.add(serviceFee);
  }
}
