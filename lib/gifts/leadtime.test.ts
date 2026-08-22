import { describe, expect, it } from "vitest";
import {
  computeGiftPromptDate,
  computeOrderByDate,
  isPastPromptDate,
} from "./leadtime";

describe("computeOrderByDate", () => {
  it("subtracts shipping window + default buffers (2+2) from the occasion date", () => {
    const { orderByDate } = computeOrderByDate({
      occasionDate: new Date(2026, 8, 15), // Sept 15, 2026 (month is 0-indexed)
      shippingWindowDays: 5, // standard retail
    });
    // 15 - 5 - 2 - 2 = 6
    expect(orderByDate).toEqual(new Date(2026, 8, 6));
  });

  it("uses custom handling/personal buffers when provided", () => {
    const { orderByDate } = computeOrderByDate({
      occasionDate: new Date(2026, 8, 30),
      shippingWindowDays: 14, // custom/engraved
      handlingBufferDays: 3,
      personalBufferDays: 5,
    });
    // 30 - 14 - 3 - 5 = 8
    expect(orderByDate).toEqual(new Date(2026, 8, 8));
  });

  it("handles a 0-day shipping window (digital/gift card/experience)", () => {
    const { orderByDate } = computeOrderByDate({
      occasionDate: new Date(2026, 8, 15),
      shippingWindowDays: 0,
    });
    // 15 - 0 - 2 - 2 = 11
    expect(orderByDate).toEqual(new Date(2026, 8, 11));
  });

  it("crosses a month boundary correctly", () => {
    const { orderByDate } = computeOrderByDate({
      occasionDate: new Date(2026, 8, 3), // Sept 3
      shippingWindowDays: 5,
    });
    // Sept 3 minus (5+2+2)=9 days -> Aug 25
    expect(orderByDate).toEqual(new Date(2026, 7, 25));
  });

  it("crosses a year boundary correctly (Christmas)", () => {
    const { orderByDate } = computeOrderByDate({
      occasionDate: new Date(2026, 0, 2), // Jan 2, 2026
      shippingWindowDays: 5,
    });
    // Jan 2 minus 9 days -> Dec 24, 2025
    expect(orderByDate).toEqual(new Date(2025, 11, 24));
  });

  it("computes last_safe_date as order-by date plus the handling buffer (spec's literal formula)", () => {
    const { orderByDate, lastSafeDate } = computeOrderByDate({
      occasionDate: new Date(2026, 8, 15),
      shippingWindowDays: 5,
      handlingBufferDays: 2,
      personalBufferDays: 2,
    });
    expect(lastSafeDate).toEqual(new Date(2026, 8, orderByDate.getDate() + 2));
  });

  it("rejects a negative shipping window", () => {
    expect(() =>
      computeOrderByDate({ occasionDate: new Date(2026, 8, 15), shippingWindowDays: -1 })
    ).toThrow();
  });
});

describe("computeGiftPromptDate", () => {
  it("subtracts the prompt buffer from the order-by date", () => {
    const orderByDate = new Date(2026, 8, 6);
    const promptDate = computeGiftPromptDate(orderByDate, 7);
    expect(promptDate).toEqual(new Date(2026, 7, 30));
  });
});

describe("isPastPromptDate", () => {
  const orderByDate = new Date(2026, 8, 6);

  it("is false before the prompt window opens", () => {
    expect(isPastPromptDate(orderByDate, 7, new Date(2026, 7, 20))).toBe(false);
  });

  it("is true once the prompt window opens", () => {
    expect(isPastPromptDate(orderByDate, 7, new Date(2026, 7, 30))).toBe(true);
  });

  it("is true on the order-by date itself", () => {
    expect(isPastPromptDate(orderByDate, 7, orderByDate)).toBe(true);
  });
});
