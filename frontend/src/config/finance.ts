// Financial model. The backend records what is *real* (declared values,
// payment type, order value, attempts); the rates below turn those into
// revenue, cost and margin. They are deliberately in one place so an
// operator can replace them with their own tariff card. Every finance
// figure in the UI that depends on these is labelled "modelled".

import type { DeliveryType } from "@/types/domain";

export const FINANCE = {
  currency: "BDT",
  /** Base delivery fee charged to the merchant, by service type (BDT). */
  baseFee: { STANDARD: 60, EXPRESS: 110, SAME_DAY: 160, SCHEDULED: 85 } satisfies Record<DeliveryType, number>,
  /** Surcharge per kg above the first kilogram (BDT). */
  weightSurchargePerKg: 12,
  /** COD handling fee as a fraction of the collected amount. */
  codFeeRate: 0.01,
  /** Line-haul cost per parcel-kilometre between origin and destination (BDT). */
  linehaulPerKm: 0.9,
  /** Rider cost per doorstep attempt, successful or not (BDT). */
  riderCostPerAttempt: 35,
  /** Handling cost per hub touch (BDT). */
  hubHandlingPerTouch: 12,
  /** Days after delivery when COD is settled to the merchant. */
  settlementDays: 3,
  /** Fuel share of line-haul cost, used to split the cost breakdown. */
  fuelShareOfLinehaul: 0.55,
};

export function deliveryFee(deliveryType: DeliveryType, weightKg: number): number {
  const base = FINANCE.baseFee[deliveryType] ?? FINANCE.baseFee.STANDARD;
  const extraKg = Math.max(0, weightKg - 1);
  return base + extraKg * FINANCE.weightSurchargePerKg;
}
