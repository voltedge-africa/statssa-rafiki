import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";

import {
  MEDIA_REQUEST_STATUSES,
  MEDIA_REQUEST_STATUS_LABELS,
  isTerminalStatus,
  type MediaEventVisibility,
  type MediaRequestStaffDetail,
  type MediaRequestStatus,
  type UpdateMediaRequestInput,
} from "@voltedge/media-contract";
import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@voltedge/ui";
import {
  ApiError,
  DocumentPreview,
  RequestFile,
  RequestTimeline,
  addMediaNote,
  approveMediaRequest,
  getMediaRequest,
  regenerateMediaRequest,
  rejectMediaRequest,
  updateMediaRequest,
} from "@voltedge/media-ui";

import { Select } from "../components/select.tsx";
import { useSession } from "../lib/session.tsx";

const UPDATABLE_STATUSES = MEDIA_REQUEST_STATUSES.filter(
  (status) => status !== "approved" && status !== "rejected",
);

export function MediaRequestView({ reference }: { reference: string }) {
  const { session } = useSession();

  const [detail, setDetail] = useState<MediaRequestStaffDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<MediaRequestStatus>("awaiting_review");
  const [response, setResponse] = useState("");
  const [note, setNote] = useState("");
  const [guidance, setGuidance] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [caseNote, setCaseNote] = useState("");
  const [visibility, setVisibility] = useState<MediaEventVisibility>("internal");
  const [previewSource, setPreviewSource] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDetailError(null);
    try {
      const result = await getMediaRequest(reference);
      setDetail(result.request);
    } catch (caught) {
      setDetailError(caught instanceof ApiError ? caught.message : "Could not load the request.");
    }
  }, [reference]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!detail) return;
    setNextStatus(detail.status);
    setResponse(detail.approvedResponse ?? detail.draft?.text ?? "");
    setNote("");
    setGuidance(detail.reviewerGuidance ?? "");
    setRejectReason("");
    setCaseNote("");
    setActionError(null);
  }, [detail]);

  async function applyUpdate(patch: UpdateMediaRequestInput) {
    if (!detail) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await updateMediaRequest(detail.reference, patch);
      setDetail(result.request);
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : "Could not update the request.");
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    if (!detail) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await approveMediaRequest(detail.reference, {
        response,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setDetail(result.request);
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : "Could not approve the response.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    if (!detail) return;
    if (!window.confirm("Decline this request and send the reason to the requester?")) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await rejectMediaRequest(detail.reference, { reason: rejectReason });
      setDetail(result.request);
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : "Could not reject the request.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerate() {
    if (!detail) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await regenerateMediaRequest(detail.reference, { guidance });
      setDetail(result.request);
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : "Could not regenerate the draft.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleAddNote() {
    if (!detail || !caseNote.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await addMediaNote(detail.reference, { message: caseNote, visibility });
      setDetail(result.request);
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : "Could not add the note.");
    } finally {
      setBusy(false);
    }
  }

  const caseFile = detail ? (
    <RequestFile
      request={detail}
      email={detail.requesterEmail}
      assignedToEmail={detail.assignedToEmail}
      draft={detail.draft}
      onOpenSource={setPreviewSource}
    />
  ) : null;

  const guidanceBlock = detail?.reviewerGuidance ? (
    <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
      <span className="font-mono text-[11px] text-muted-foreground">guidance for Rafiki</span>
      <p className="mt-1 max-w-[68ch] text-sm leading-relaxed whitespace-pre-wrap">
        {detail.reviewerGuidance}
      </p>
    </div>
  ) : null;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button variant="ghost" size="sm" nativeButton={false} render={<a href="/media" />}>
          <ArrowLeft />
          Media desk
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void load()}
          aria-label="Refresh request"
        >
          <RefreshCw />
          Refresh
        </Button>
      </div>

      {detailError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not open the request</AlertTitle>
          <AlertDescription>{detailError}</AlertDescription>
        </Alert>
      ) : null}

      {!detail && !detailError ? (
        <div className="grid place-items-center py-20">
          <Spinner className="size-5" />
        </div>
      ) : null}

      {detail ? (
        <>
          {actionError ? (
            <Alert variant="destructive">
              <AlertTitle>Update failed</AlertTitle>
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          ) : null}

          {isTerminalStatus(detail.status) ? (
            <div className="flex flex-col gap-6">
              {guidanceBlock}
              {caseFile}
              <RequestTimeline events={detail.events} />
            </div>
          ) : (
            <Tabs defaultValue="case">
              <TabsList className="w-full">
                <TabsTrigger value="case">Case file</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="response">Response</TabsTrigger>
                <TabsTrigger value="manage">Manage</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
              </TabsList>

              <TabsContent value="case" className="flex flex-col gap-4">
                {guidanceBlock}
                {caseFile}
              </TabsContent>

              <TabsContent value="timeline">
                <RequestTimeline events={detail.events} />
              </TabsContent>

              <TabsContent value="response">
                <Card>
                  <CardHeader>
                    <CardTitle>Review and approve</CardTitle>
                    <CardDescription>
                      Edit the draft, check every reference, then approve the wording that will be
                      released to the requester.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-5">
                    <Field
                      data-invalid={
                        response.length > 0 && response.trim().length < 10 ? true : undefined
                      }
                    >
                      <FieldLabel htmlFor="response">Response for the requester</FieldLabel>
                      <Textarea
                        id="response"
                        rows={10}
                        value={response}
                        placeholder="Draft the approved response. Keep the [source#chunk] citations."
                        onChange={(event) => setResponse(event.target.value)}
                      />
                      <FieldDescription>
                        At least 10 characters. References cited here are attached to the approved
                        response; the AI draft itself is never released.
                      </FieldDescription>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="approval-note">
                        Note with the approval (optional)
                      </FieldLabel>
                      <Input
                        id="approval-note"
                        value={note}
                        placeholder="Shown to the requester when the response is released"
                        onChange={(event) => setNote(event.target.value)}
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="guidance">Guidance for Rafiki</FieldLabel>
                      <Textarea
                        id="guidance"
                        rows={3}
                        value={guidance}
                        placeholder="e.g. Also cover core inflation, and keep it to two short paragraphs."
                        onChange={(event) => setGuidance(event.target.value)}
                      />
                      <FieldDescription>
                        Reused every time the draft is regenerated. Facts not covered by approved
                        sources are ignored.
                      </FieldDescription>
                    </Field>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={busy || response.trim().length < 10}
                        onClick={() => void handleApprove()}
                      >
                        {busy ? "Saving…" : "Approve and release"}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy || detail.status === "analysing"}
                        onClick={() => void handleRegenerate()}
                      >
                        <RefreshCw />
                        Regenerate with guidance
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy || guidance.trim() === (detail.reviewerGuidance ?? "")}
                        onClick={() => void applyUpdate({ guidance })}
                      >
                        Save guidance
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="manage" className="flex flex-col gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Lifecycle and assignment</CardTitle>
                    <CardDescription>
                      Move the request between review stages and assign a reviewer.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-5">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="next-status">Status</FieldLabel>
                        <Select
                          id="next-status"
                          value={nextStatus}
                          onChange={(event) =>
                            setNextStatus(event.target.value as MediaRequestStatus)
                          }
                        >
                          {UPDATABLE_STATUSES.map((value) => (
                            <option key={value} value={value}>
                              {MEDIA_REQUEST_STATUS_LABELS[value]}
                            </option>
                          ))}
                        </Select>
                        <FieldDescription>
                          Approval and rejection use the Response tab.
                        </FieldDescription>
                      </Field>

                      <Field>
                        <FieldLabel>Assignment</FieldLabel>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            disabled={busy || detail.assignedTo === session?.id}
                            onClick={() => void applyUpdate({ assignedTo: "me" })}
                          >
                            Assign to me
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={busy || !detail.assignedTo}
                            onClick={() => void applyUpdate({ assignedTo: null })}
                          >
                            Unassign
                          </Button>
                        </div>
                      </Field>
                    </div>

                    <Button
                      variant="outline"
                      className="self-start"
                      disabled={busy || nextStatus === detail.status}
                      onClick={() => void applyUpdate({ status: nextStatus })}
                    >
                      Save status
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Decline the request</CardTitle>
                    <CardDescription>
                      The reason is shown to the requester. Use this when Stats SA will not respond.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-5">
                    <Field
                      data-invalid={
                        rejectReason.length > 0 && rejectReason.trim().length < 5 ? true : undefined
                      }
                    >
                      <FieldLabel htmlFor="reject-reason">Reason</FieldLabel>
                      <Textarea
                        id="reject-reason"
                        rows={3}
                        value={rejectReason}
                        onChange={(event) => setRejectReason(event.target.value)}
                      />
                    </Field>
                    <Button
                      variant="outline"
                      className="self-start"
                      disabled={busy || rejectReason.trim().length < 5}
                      onClick={() => void handleReject()}
                    >
                      Decline request
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="notes">
                <Card>
                  <CardHeader>
                    <CardTitle>Add a case note</CardTitle>
                    <CardDescription>
                      Internal notes stay in the case file. Messages are shown to the requester.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-5">
                    <Field>
                      <FieldLabel htmlFor="case-note">Note</FieldLabel>
                      <Textarea
                        id="case-note"
                        rows={3}
                        value={caseNote}
                        onChange={(event) => setCaseNote(event.target.value)}
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="visibility">Visibility</FieldLabel>
                      <Select
                        id="visibility"
                        value={visibility}
                        onChange={(event) =>
                          setVisibility(event.target.value as MediaEventVisibility)
                        }
                      >
                        <option value="internal">Internal</option>
                        <option value="requester">Visible to requester</option>
                      </Select>
                    </Field>

                    <Button
                      variant="outline"
                      className="self-start"
                      disabled={busy || !caseNote.trim()}
                      onClick={() => void handleAddNote()}
                    >
                      Add note
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </>
      ) : null}

      <DocumentPreview
        source={previewSource}
        open={previewSource !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewSource(null);
        }}
      />
    </section>
  );
}
