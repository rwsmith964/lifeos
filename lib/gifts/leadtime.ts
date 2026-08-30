// Order-by date math (Section 7.4) — "the highest-value piece of logic in
// the product." Deliberately pure: no DB access, no AI call, just dates in
// and dates out, so it's exhaustively unit-testable and reusable from a
// cron job, an API route, or eventually a mobile client (Section 3).
//
// order_by_date = occasion_date
//                 - shipping_window_days(category)   [resolved by the caller,
//                                                      not this module — see
//                                                      lib/db/repositories/gifts.ts
//                                                      getShippingWindows()]
//                 - handling_buffer_days (default 2)
//                 - personal_buffer_days (default 2, configurable)
//
// last_safe_date = order_by_date + handling_buffer_days — the true
// drop-dead date, per the spec's literal formula. Note this is NOT simply
// `occasion_date - shipping_window_days`; it still nets out the personal
// buffer. That's the spec's exact wording ("order-by date plus handling
// buffer") and is implemented literally rather than reinterpreted.
import { addDays, differenceInCalendarDays, startOfDay, subDays } from "date-fns";

export const DEFAULT_HANDLING_BUFFER_DAYS = 2;
export const DEFAULT_PERSONAL_BUFFER_DAYS = 2;

export interface LeadTimeInput {
  occasionDate: Date;
  shippingWindowDays: number;
  handlingBufferDays?: number;
  personalBufferDays?: number;
}

export interface LeadTimeResult {
  orderByDate: Date;
  lastSafeDate: Date;
}

export function computeOrderByDate({
  occasionDate,
  shippingWindowDays,
  handlingBufferDays = DEFAULT_HANDLING_BUFFER_DAYS,
  personalBufferDays = DEFAULT_PERSONAL_BUFFER_DAYS,
}: LeadTimeInput): LeadTimeResult {
  if (shippingWindowDays < 0) {
    throw new Error("shippingWindowDays must be >= 0");
  }
  const totalBufferDays = shippingWindowDays + handlingBufferDays + personalBufferDays;
  const orderByDate = subDays(occasionDate, totalBufferDays);
  const lastSafeDate = addDays(orderByDate, handlingBufferDays);
  return { orderByDate, lastSafeDate };
}

/**
 * Section 7.2: don't prompt at a fixed "X days before" — surface the prompt
 * `promptBufferDays` before the order-by date, so it appears when action is
 * actually needed.
 */
export function computeGiftPromptDate(orderByDate: Date, promptBufferDays: number): Date {
  return subDays(orderByDate, promptBufferDays);
}

export function isPastPromptDate(orderByDate: Date, promptBufferDays: number, today: Date): boolean {
  const promptDate = computeGiftPromptDate(orderByDate, promptBufferDays);
  return today.getTime() >= promptDate.getTime();
}

export interface OrderByStatus {
  label: string;
  isPastDue: boolean;
}

/**
 * P1-10: the gifts list previously rendered the raw order_by_date (e.g.
 * "Order by 2026-08-20") even once that date had slipped into the past,
 * which read as a stale/broken suggestion. Never render a past-tense
 * order-by date — once today is at or past it, the actionable message is
 * "Needed now"; before that, show days-remaining rather than a calendar
 * date, so the user never has to do date math themselves.
 */
export function orderByStatusLabel(orderByDate: Date, today: Date): OrderByStatus {
  const daysRemaining = differenceInCalendarDays(startOfDay(orderByDate), startOfDay(today));
  if (daysRemaining <= 0) {
    return { label: "Needed now", isPastDue: true };
  }
  if (daysRemaining === 1) {
    return { label: "1 day left to order", isPastDue: false };
  }
  return { label: `${daysRemaining} days left to order`, isPastDue: false };
}
