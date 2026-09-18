import type { MediaAiDraft } from "@voltedge/media-contract";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@voltedge/ui";

import { formatDateTime } from "../format.ts";
import { SourceReferences } from "./references.tsx";

/**
 * The AI-generated draft, shown only in the review workspace. It is always
 * labelled as unreviewed so it can never be mistaken for an official answer.
 */
export function DraftCard({ draft }: { draft: MediaAiDraft }) {
  if (draft.gap) {
    return (
      <Card className="border-orange-500/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Information gap
            <Badge
              variant="outline"
              className="border-transparent bg-orange-500/15 font-mono text-[10px] tracking-wide text-orange-700 uppercase dark:text-orange-400"
            >
              no draft generated
            </Badge>
          </CardTitle>
          <CardDescription>
            Approved sources did not support a response, so no AI wording was produced.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="max-w-[68ch] text-sm leading-relaxed whitespace-pre-wrap">{draft.gap}</p>
          <p className="text-sm text-muted-foreground">
            Draft the response manually from approved sources, or regenerate after the index is
            updated.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          AI draft
          <Badge
            variant="outline"
            className="border-transparent bg-primary/10 font-mono text-[10px] tracking-wide text-primary uppercase"
          >
            AI-generated · not approved
          </Badge>
        </CardTitle>
        <CardDescription>
          Prepared from approved Stats SA sources
          {draft.model ? ` with ${draft.model}` : ""}
          {draft.generatedAt ? ` on ${formatDateTime(draft.generatedAt)}` : ""}. Edit before
          approving; the requester never sees this draft.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <p className="max-w-[68ch] text-sm leading-relaxed whitespace-pre-wrap">{draft.text}</p>

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <span className="font-mono text-[11px] text-muted-foreground">
            sources ({draft.sources.length})
          </span>
          <SourceReferences sources={draft.sources} />
        </div>
      </CardContent>
    </Card>
  );
}
