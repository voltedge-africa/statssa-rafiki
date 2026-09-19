import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { AgentService } from "../agent/agent.service.ts";
import type { GovernanceService } from "../admin/governance.service.ts";
import { GapsLabellingService, cleanCategoryLabel } from "./gaps.labelling.service.ts";
import type { GapsService } from "./gaps.service.ts";

describe("cleanCategoryLabel", () => {
  it("takes the first non-empty line and strips quotes and trailing punctuation", () => {
    expect(cleanCategoryLabel('  "GBV death statistics".\nIgnore me')).toBe("GBV death statistics");
  });

  it("rejects empty or too-short labels", () => {
    expect(cleanCategoryLabel("  \n ")).toBeNull();
    expect(cleanCategoryLabel('""')).toBeNull();
    expect(cleanCategoryLabel("ab")).toBeNull();
  });

  it("caps the label length", () => {
    const label = cleanCategoryLabel("x".repeat(300));
    expect(label).toHaveLength(80);
  });
});

function makeService() {
  const gaps = {
    pendingCategories: vi.fn().mockResolvedValue([]),
    applyLabel: vi.fn(),
  };
  const agent = { complete: vi.fn() };
  const governance = { isGenerationEnabled: vi.fn().mockResolvedValue(true) };
  const service = new GapsLabellingService(
    gaps as unknown as GapsService,
    agent as unknown as AgentService,
    governance as unknown as GovernanceService,
  );
  return { gaps, agent, governance, service };
}

describe("GapsLabellingService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upgrades an auto label with the model's answer", async () => {
    const { gaps, agent, service } = makeService();
    gaps.pendingCategories.mockResolvedValue([{ id: "cat-1", label: "Gbv death toll" }]);
    agent.complete.mockResolvedValue({ text: "GBV death statistics", model: "test/model" });

    const labelled = await service.labelPending();

    expect(labelled).toBe(1);
    expect(gaps.applyLabel).toHaveBeenCalledWith("cat-1", "GBV death statistics");
    const input = agent.complete.mock.calls[0]?.[0] as { feature: string; user: string };
    expect(input.feature).toBe("gap_label");
    expect(input.user).toContain("Gbv death toll");
  });

  it("does nothing while generation is disabled", async () => {
    const { gaps, governance, service } = makeService();
    gaps.pendingCategories.mockResolvedValue([{ id: "cat-1", label: "Anything" }]);
    governance.isGenerationEnabled.mockResolvedValue(false);

    expect(await service.labelPending()).toBe(0);
    expect(gaps.applyLabel).not.toHaveBeenCalled();
  });

  it("keeps the auto label when the model output is unusable", async () => {
    const { gaps, agent, service } = makeService();
    gaps.pendingCategories.mockResolvedValue([{ id: "cat-1", label: "Gbv death toll" }]);
    agent.complete.mockResolvedValue({ text: "", model: "test/model", error: "provider down" });

    expect(await service.labelPending()).toBe(0);
    expect(gaps.applyLabel).not.toHaveBeenCalled();
  });
});
