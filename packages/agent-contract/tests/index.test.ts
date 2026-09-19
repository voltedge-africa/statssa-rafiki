import { expect, test } from "vite-plus/test";
import { safeParse } from "valibot";
import {
  governanceSettingsUpdateSchema,
  isUiBlock,
  isUiComponent,
  UI_COMPONENTS,
} from "../src/index.ts";

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

test("governance update accepts a partial patch and bounds the threshold", () => {
  expect(safeParse(governanceSettingsUpdateSchema, {}).success).toBe(true);
  const full = safeParse(governanceSettingsUpdateSchema, {
    confidenceMin: 0.9,
    generationEnabled: false,
    enabledTools: ["search_statssa"],
    policies: [{ area: "Grounding", rule: "Cite sources.", enforcement: "Gate blocks release." }],
    incidentResponse: ["Rotate the key."],
  });
  expect(full.success).toBe(true);
  if (full.success) expect(full.output.confidenceMin).toBe(0.9);

  expect(safeParse(governanceSettingsUpdateSchema, { confidenceMin: 1.5 }).success).toBe(false);
  expect(safeParse(governanceSettingsUpdateSchema, { confidenceMin: -0.1 }).success).toBe(false);
  expect(
    safeParse(governanceSettingsUpdateSchema, {
      policies: [{ area: "", rule: "x", enforcement: "y" }],
    }).success,
  ).toBe(false);
});
