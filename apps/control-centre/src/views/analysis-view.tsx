import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSearch, Sparkles } from "lucide-react";

import type { AnalysisBriefSummary, IndexedDocumentSummary } from "@voltedge/brief-contract";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Spinner,
  Textarea,
} from "@voltedge/ui";

import {
  ApiError,
  createAnalysisBrief,
  listAnalysisBriefs,
  listIndexedDocuments,
} from "../lib/briefs-api.ts";
import { formatInt, formatTime } from "../lib/format.ts";
import { navigate } from "../lib/router.ts";

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

/**
 * The analysis builder: choose indexed official content, optionally steer the
 * brief with a focus, then generate a persisted, cited analysis. Saved briefs
 * sit alongside so the comms team can reuse earlier work.
 */
export function AnalysisView() {
  const [documents, setDocuments] = useState<IndexedDocumentSummary[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const [title, setTitle] = useState("");
  const [focus, setFocus] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [briefs, setBriefs] = useState<AnalysisBriefSummary[]>([]);
  const [briefsLoading, setBriefsLoading] = useState(true);

  const loadDocuments = useCallback(async () => {
    setDocumentsLoading(true);
    setDocumentsError(null);
    try {
      const { documents: indexed } = await listIndexedDocuments();
      setDocuments(indexed);
    } catch (cause) {
      setDocumentsError(errorMessage(cause, "Could not load the indexed documents."));
    } finally {
      setDocumentsLoading(false);
    }
  }, []);

  const loadBriefs = useCallback(async () => {
    setBriefsLoading(true);
    try {
      const { briefs: saved } = await listAnalysisBriefs({ limit: 10 });
      setBriefs(saved);
    } catch {
      setBriefs([]);
    } finally {
      setBriefsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
    void loadBriefs();
  }, [loadDocuments, loadBriefs]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return documents;
    return documents.filter((document) =>
      `${document.title ?? ""} ${document.source}`.toLowerCase().includes(term),
    );
  }, [documents, search]);

  function toggle(source: string) {
    setSelected((current) =>
      current.includes(source) ? current.filter((item) => item !== source) : [...current, source],
    );
  }

  async function generate() {
    if (selected.length === 0 || generating) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const { brief } = await createAnalysisBrief({
        sources: selected,
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(focus.trim() ? { focus: focus.trim() } : {}),
      });
      navigate(`/analysis/${brief.id}`);
    } catch (cause) {
      setGenerateError(errorMessage(cause, "The brief could not be generated."));
      setGenerating(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_1fr]">
      <Card className="self-start">
        <CardHeader>
          <CardTitle>Official content</CardTitle>
          <CardDescription>
            {selected.length === 0
              ? "Select the reports, releases or publications to analyse."
              : `${formatInt(selected.length)} document${selected.length === 1 ? "" : "s"} selected.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Input
            placeholder="Search indexed documents…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {documentsError ? (
            <Alert variant="destructive">
              <AlertTitle>Index unavailable</AlertTitle>
              <AlertDescription>{documentsError}</AlertDescription>
            </Alert>
          ) : documentsLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Spinner className="size-4" /> Loading indexed documents…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              {documents.length === 0
                ? "No documents are indexed. Run `vp run rag:ingest` to load the corpus."
                : "No documents match that search."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {filtered.map((document) => {
                const checked = selected.includes(document.source);
                return (
                  <li key={document.source}>
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                        checked
                          ? "border-primary/50 bg-accent/40"
                          : "border-border hover:bg-accent/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-4 accent-primary"
                        checked={checked}
                        onChange={() => toggle(document.source)}
                      />
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="text-sm font-medium">
                          {document.title ?? document.source}
                        </span>
                        <span className="truncate font-mono text-[11px] text-muted-foreground">
                          {document.source}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatInt(document.characters)} characters · {formatInt(document.chunks)}{" "}
                          indexed chunks
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Generate a brief</CardTitle>
            <CardDescription>
              Key findings, statistics, trends, insights and context — every claim cited.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Field>
              <FieldLabel htmlFor="brief-title">Title (optional)</FieldLabel>
              <Input
                id="brief-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Derived from the selected documents"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="brief-focus">Focus (optional)</FieldLabel>
              <Textarea
                id="brief-focus"
                rows={3}
                value={focus}
                onChange={(event) => setFocus(event.target.value)}
                placeholder="e.g. angles for the sanitation and service-delivery media cycle"
              />
              <FieldDescription>
                Steers emphasis and coverage; it cannot add facts the documents do not contain.
              </FieldDescription>
            </Field>

            {generateError ? (
              <Alert variant="destructive">
                <AlertTitle>Brief not generated</AlertTitle>
                <AlertDescription>{generateError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex items-center gap-3">
              <Button
                onClick={() => void generate()}
                disabled={selected.length === 0 || generating}
              >
                {generating ? <Spinner className="size-4" /> : <Sparkles />}
                {generating ? "Analysing documents…" : "Generate brief"}
              </Button>
              {generating ? (
                <span className="text-xs text-muted-foreground">
                  This can take up to a minute for a large release.
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saved briefs</CardTitle>
            <CardDescription>The latest analyses, newest first.</CardDescription>
          </CardHeader>
          <CardContent>
            {briefsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="size-4" /> Loading…
              </div>
            ) : briefs.length === 0 ? (
              <div className="flex flex-col items-start gap-2 py-4 text-sm text-muted-foreground">
                <FileSearch className="size-5" />
                No briefs yet. Generate one from the documents on the left.
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {briefs.map((brief) => (
                  <li key={brief.id}>
                    <a
                      href={`/analysis/${brief.id}`}
                      className="flex flex-col gap-1 py-3 transition-colors hover:text-primary"
                    >
                      <span className="text-sm font-medium">{brief.title}</span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {brief.highlights} highlights
                        </Badge>
                        <span>
                          {brief.sources.length} document{brief.sources.length === 1 ? "" : "s"}
                        </span>
                        <span>{brief.createdByLabel}</span>
                        <span>{formatTime(brief.createdAt)}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
