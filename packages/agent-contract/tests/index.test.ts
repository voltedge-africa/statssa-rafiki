import { expect, test } from "vite-plus/test";
import { isUiBlock, isUiComponent, UI_COMPONENTS } from "../src/index.ts";

test("exposes the four UI block components", () => {
  expect(UI_COMPONENTS).toEqual(["table", "chart", "sources", "document"]);
});

test("isUiComponent narrows known components only", () => {
  expect(isUiComponent("chart")).toBe(true);
  expect(isUiComponent("iframe")).toBe(false);
  expect(isUiComponent(undefined)).toBe(false);
});

test("isUiBlock accepts known shapes and rejects unknown ones", () => {
  expect(isUiBlock({ component: "sources", items: [] })).toBe(true);
  expect(isUiBlock({ component: "html" })).toBe(false);
  expect(isUiBlock(null)).toBe(false);
  expect(isUiBlock("table")).toBe(false);
});
