import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { AuthUser } from "@voltedge/auth-contract";
import type { AnalysisBriefContent } from "@voltedge/brief-contract";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { GovernanceService } from "../admin/governance.service.ts";
import { listIndexedDocuments } from "../agent/rag/document.ts";
import type { AnalysisDraftResult, AnalysisDraftService } from "./analysis-draft.service.ts";
import type { AnalysisBriefRecord, AnalysisRepository } from "./analysis.repository.ts";
import { AnalysisService, defaultTitle } from "./analysis.service.ts";

vi.mock("../agent/rag/document.ts", () => ({
  listIndexedDocuments: vi.fn(),
  retrieveDocument: vi.fn(),
}));

const listDocumentsMock = vi.mocked(listIndexedDocuments);

const content: AnalysisBriefContent = {
  summary: "Services improved [ghs-2025-statistical-release.md#4].",
  keyFindings: [
    { title: "Sanitation", detail: "Rose to 84.0% [ghs-2025-statistical-release.md#4]." },
  ],
  statistics: [{ label: "Sanitation", value: "84.0%" }],
  trends: [],
  insights: [],
  context: [],
};

const documents = [
  {
    source: "ghs-2025-statistical-release.md",
    title: "General Household Survey 2025",
    characters: 293970,
    chunks: 393,
  },
  {
    source: "ghs-2025-media-release.md",
    title: "GHS 2025 media release",
    characters: 4441,
    chunks: 6,
  },
];

const staff: AuthUser = { id: "staff-1", role: "Staff" };

function makeService() {
  const repo = {
    insert: vi.fn(async (record: AnalysisBriefRecord) => ({
      ...record,
      createdAt: new Date("2026-09-19T10:00:00.000Z"),
    })),
    list: vi.fn(),
    get: vi.fn(),
    findUserById: vi.fn().mockResolvedValue({ id: "staff-1", email: "staff@statssa.gov.za" }),
  };
  const draft: AnalysisDraftResult = {
    content,
    references: [
      {
        chunkId: 4,
        table: null,
        source: "ghs-2025-statistical-release.md",
        title: "General Household Survey 2025",
        snippet: "84.0%",
      },
    ],
    verification: { status: "verified", unverified: [] },
    model: "test/model",
    gap: null,
  };
  const drafts = { generate: vi.fn().mockResolvedValue(draft) };
  const governance = {
    settings: vi.fn().mockResolvedValue({ generationEnabled: true, confidenceMin: 0.85 }),
  };
  const service = new AnalysisService(
    repo as unknown as AnalysisRepository,
    drafts as unknown as AnalysisDraftService,
    governance as unknown as GovernanceService,
  );
  return { repo, drafts, governance, service };
}

describe("defaultTitle", () => {
  it("uses the document title and counts the rest of the scope", () => {
    expect(defaultTitle(["ghs-2025-media-release.md"], documents)).toBe(
      "Analysis: GHS 2025 media release",
    );
    expect(
      defaultTitle(["ghs-2025-statistical-release.md", "ghs-2025-media-release.md"], documents),
    ).toBe("Analysis: General Household Survey 2025 +1 more");
  });
});

describe("AnalysisService", () => {
  beforeEach(() => {
    listDocumentsMock.mockReset();
    listDocumentsMock.mockResolvedValue(documents);
  });

  it("lists the indexed documents for the picker", async () => {
    const { service } = makeService();
    await expect(service.documents()).resolves.toEqual({ documents });
  });

  it("rejects a scope with documents that are not indexed", async () => {
    const { drafts, service } = makeService();

    await expect(
      service.create({ sources: ["ghs-2025-statistical-release.md", "missing.md"] }, staff),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(drafts.generate).not.toHaveBeenCalled();
  });

  it("generates, verifies and persists a brief with a derived title", async () => {
    const { repo, drafts, service } = makeService();

    const brief = await service.create({ sources: ["ghs-2025-statistical-release.md"] }, staff);

    expect(drafts.generate).toHaveBeenCalledWith({
      sources: ["ghs-2025-statistical-release.md"],
      focus: null,
      confidenceMin: 0.85,
    });
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Analysis: General Household Survey 2025",
        verificationStatus: "verified",
        unverifiedNumbers: [],
        createdBy: "staff-1",
        createdByLabel: "staff@statssa.gov.za",
      }),
    );
    expect(brief.title).toBe("Analysis: General Household Survey 2025");
    expect(brief.createdAt).toBe("2026-09-19T10:00:00.000Z");
    expect(brief.content.keyFindings).toHaveLength(1);
  });

  it("keeps an explicit title and focus", async () => {
    const { repo, drafts, service } = makeService();

    await service.create(
      {
        sources: ["ghs-2025-media-release.md"],
        title: "  GHS angles  ",
        focus: "  media  ",
      },
      staff,
    );

    expect(drafts.generate).toHaveBeenCalledWith(expect.objectContaining({ focus: "media" }));
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ title: "GHS angles" }));
  });

  it("refuses to generate while the kill switch is on", async () => {
    const { drafts, governance, service } = makeService();
    governance.settings.mockResolvedValue({ generationEnabled: false, confidenceMin: 0.85 });

    await expect(service.create({ sources: ["a.md"] }, staff)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(drafts.generate).not.toHaveBeenCalled();
  });

  it("surfaces a draft gap as an unprocessable request", async () => {
    const { drafts, service } = makeService();
    drafts.generate.mockResolvedValue({
      content: null,
      references: [],
      verification: { status: "skipped", unverified: [] },
      model: null,
      gap: "No indexed source covers this.",
    });

    await expect(
      service.create({ sources: ["ghs-2025-statistical-release.md"] }, staff),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("404s on an unknown brief and maps list summaries", async () => {
    const { repo, service } = makeService();
    repo.get.mockResolvedValue(undefined);
    await expect(service.get("nope")).rejects.toBeInstanceOf(NotFoundException);

    repo.list.mockResolvedValue({
      briefs: [
        {
          id: "brief-1",
          title: "GHS angles",
          sources: ["ghs-2025-statistical-release.md"],
          focus: null,
          content,
          references: [],
          verificationStatus: "verified",
          unverifiedNumbers: [],
          aiModel: "test/model",
          createdBy: "staff-1",
          createdByLabel: "staff@statssa.gov.za",
          createdAt: new Date("2026-09-19T10:00:00.000Z"),
        },
      ],
      total: 1,
    });

    const page = await service.list({ limit: 25, offset: 0 });
    expect(page.total).toBe(1);
    expect(page.briefs[0]).toMatchObject({ id: "brief-1", highlights: 2 });
  });
});
