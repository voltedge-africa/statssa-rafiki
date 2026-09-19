import { expect, test } from "vite-plus/test";
import { analyticsWindow } from "../src/index.ts";

test("spans the requested days, ending at tomorrow's UTC midnight", () => {
  const window = analyticsWindow(30, new Date("2026-09-19T13:45:00.000Z"));

  expect(window.to.toISOString()).toBe("2026-09-20T00:00:00.000Z");
  expect(window.from.toISOString()).toBe("2026-08-21T00:00:00.000Z");
  expect(window.dates).toHaveLength(30);
  expect(window.dates[0]).toBe("2026-08-21");
  expect(window.dates.at(-1)).toBe("2026-09-19");
});

test("keeps one date per day across a month boundary", () => {
  const window = analyticsWindow(7, new Date("2026-03-02T00:00:00.000Z"));

  expect(window.dates).toEqual([
    "2026-02-24",
    "2026-02-25",
    "2026-02-26",
    "2026-02-27",
    "2026-02-28",
    "2026-03-01",
    "2026-03-02",
  ]);
});

test("includes the whole of today when the clock is before midnight", () => {
  const window = analyticsWindow(1, new Date("2026-09-19T00:00:01.000Z"));

  expect(window.from.toISOString()).toBe("2026-09-19T00:00:00.000Z");
  expect(window.to.toISOString()).toBe("2026-09-20T00:00:00.000Z");
  expect(window.dates).toEqual(["2026-09-19"]);
});
