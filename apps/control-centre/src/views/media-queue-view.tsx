import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { RefreshCw } from "lucide-react";

import {
  MEDIA_REQUEST_STATUSES,
  MEDIA_REQUEST_STATUS_LABELS,
  isTerminalStatus,
  type MediaEventVisibility,
  type MediaRequestStaff,
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
  Textarea,
  cn,
} from "@voltedge/ui";
import {
  ApiError,
  RequestFile,
  StatusBadge,
  addMediaNote,
  approveMediaRequest,
  deadlinePhrase,
  getMediaRequest,
  listMediaRequests,
  regenerateMediaRequest,
  rejectMediaRequest,
  updateMediaRequest,
} from "@voltedge/media-ui";

import { SourcePreview } from "../components/source-preview.tsx";
import { signInUrl, useSession } from "../lib/session.tsx";

const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const UPDATABLE_STATUSES = MEDIA_REQUEST_STATUSES.filter(
  (status) => status !== "approved" && status !== "rejected",
);

function Select({
  id,
  value,
  onChange,
  children,
}: {
  id?: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
}) {
  return (
    <select id={id} value={value} onChange={onChange} className={SELECT_CLASS}>
      {children}
    </select>
  );
}

export function MediaQueueView() {
  const { session, loading } = useSession();

  const [status, setStatus] = useState<MediaRequestStatus | "">("");
  const [assigned, setAssigned] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const [list, setList] = useState<MediaRequestStaff[] | null>(null);
  const [total, setTotal] = useState(0);
  const [listError, setListError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<MediaRequestStaffDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<MediaRequestStatus>("awaiting_review");
  const [response, setResponse] = useState("");
  const [note, setNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [caseNote, setCaseNote] = useState("");
  const [visibility, setVisibility] = useState<MediaEventVisibility>("internal");
  const [previewSource, setPreviewSource] = useState<string | null>(null);

  const staff = Boolean(session && session.role !== "Press");

  const loadList = useCallback(async () => {
    setListError(null);
    try {
      const result = await listMediaRequests({ status: status || undefined, assigned, q: query });
      setList(result.requests);
      setTotal(result.total);
    } catch (caught) {
      setListError(caught instanceof ApiError ? caught.message : "Could not load the media queue.");
    }
  }, [status, assigned, query]);

  useEffect(() => {
    if (staff) void loadList();
  }, [staff, loadList]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setDetailError(null);
    void getMediaRequest(selected)
      .then((result) => {
        if (!cancelled) setDetail(result.request);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setDetailError(
            caught instanceof ApiError ? caught.message : "Could not load the request.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    if (!detail) return;
    setNextStatus(detail.status);
    setResponse(detail.approvedResponse ?? detail.draft?.text ?? "");
    setNote("");
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
      await loadList();
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
      await loadList();
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
      await loadList();
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
      const result = await regenerateMediaRequest(detail.reference);
      setDetail(result.request);
      await loadList();
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

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(search.trim());
  }

  if (loading) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!staff) {
    return (
      <section className="grid min-h-[60vh] place-items-center px-6 py-16">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>The media desk is for Stats SA staff</CardTitle>
            <CardDescription>
              {session
                ? `You are signed in as ${session.role}. This area is for Staff and Admin users.`
                : "Sign in with a Staff or Admin account to review media requests."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {session ? (
              <Button variant="outline" nativeButton={false} render={<a href="/" />}>
                Back to the control centre
              </Button>
            ) : (
              <Button nativeButton={false} render={<a href={signInUrl} />}>
                Sign in
              </Button>
            )}
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[360px_1fr] lg:items-start">
        <div className="flex flex-col gap-3">
          <form className="flex gap-2" onSubmit={handleSearch}>
            <Input
              value={search}
              placeholder="Reference, name, email or claim"
              aria-label="Search requests"
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>

          <div className="grid grid-cols-2 gap-2">
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value as MediaRequestStatus | "")}
            >
              <option value="">Any status</option>
              {MEDIA_REQUEST_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {MEDIA_REQUEST_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
            <Select value={assigned} onChange={(event) => setAssigned(event.target.value)}>
              <option value="">Anyone</option>
              <option value="me">Mine</option>
              <option value="unassigned">Unassigned</option>
            </Select>
          </div>

          <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
            <span>
              {total} request{total === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              className="underline-offset-4 hover:underline"
              onClick={() => void loadList()}
            >
              refresh
            </button>
          </div>

          {listError ? (
            <Alert variant="destructive">
              <AlertTitle>Could not load the queue</AlertTitle>
              <AlertDescription>{listError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="overflow-hidden rounded-lg border border-border">
            {list === null ? (
              <div className="grid place-items-center py-16">
                <Spinner className="size-5" />
              </div>
            ) : list.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                No requests match these filters.
              </p>
            ) : (
              list.map((request) => (
                <button
                  key={request.reference}
                  type="button"
                  onClick={() => setSelected(request.reference)}
                  className={cn(
                    "flex w-full flex-col gap-1.5 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0",
                    selected === request.reference ? "bg-secondary" : "hover:bg-muted",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {request.reference}
                    </span>
                    <StatusBadge status={request.status} />
                  </div>
                  <span className="text-sm font-medium">{request.requesterName}</span>
                  <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {request.claim}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {deadlinePhrase(request.deadline, request.status)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {detailError ? (
            <Alert variant="destructive">
              <AlertTitle>Could not open the request</AlertTitle>
              <AlertDescription>{detailError}</AlertDescription>
            </Alert>
          ) : null}

          {!detail && !detailError ? (
            <div className="grid place-items-center rounded-lg border border-dashed border-border px-6 py-24 text-center">
              <p className="max-w-[36ch] text-sm leading-relaxed text-muted-foreground">
                Select a media request to read the AI draft, edit the response and approve or
                decline it.
              </p>
            </div>
          ) : null}

          {detail ? (
            <>
              <RequestFile
                request={detail}
                events={detail.events}
                email={detail.requesterEmail}
                assignedToEmail={detail.assignedToEmail}
                draft={detail.draft}
                onOpenSource={setPreviewSource}
              />

              {isTerminalStatus(detail.status) ? null : (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Review and approve</CardTitle>
                      <CardDescription>
                        Edit the draft, check every reference, then approve the wording that will be
                        released to the requester.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-5">
                      {actionError ? (
                        <Alert variant="destructive">
                          <AlertTitle>Update failed</AlertTitle>
                          <AlertDescription>{actionError}</AlertDescription>
                        </Alert>
                      ) : null}

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
                          Regenerate draft
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

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
                            Approval and rejection use the buttons above.
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
                        The reason is shown to the requester. Use this when Stats SA will not
                        respond.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-5">
                      <Field
                        data-invalid={
                          rejectReason.length > 0 && rejectReason.trim().length < 5
                            ? true
                            : undefined
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
                </>
              )}
            </>
          ) : null}
        </div>
      </div>

      <SourcePreview
        source={previewSource}
        open={previewSource !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewSource(null);
        }}
      />
    </section>
  );
}
