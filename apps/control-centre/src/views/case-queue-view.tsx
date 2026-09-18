import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  POPIA_REQUEST_STATUSES,
  POPIA_REQUEST_STATUS_LABELS,
  POPIA_REQUEST_TYPE_LABELS,
  POPIA_REQUEST_TYPES,
  type PopiaEventVisibility,
  type PopiaRequestStaff,
  type PopiaRequestStaffDetail,
  type PopiaRequestStatus,
  type UpdatePopiaRequestInput,
} from "@voltedge/popia-contract";
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
  addCaseNote,
  duePhrase,
  getCaseRequest,
  listCaseRequests,
  updateCaseRequest,
} from "@voltedge/popia-ui";

import { signInUrl, useSession } from "../lib/session.tsx";

const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

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

export function CaseQueueView() {
  const { session, loading } = useSession();

  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [assigned, setAssigned] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const [list, setList] = useState<PopiaRequestStaff[] | null>(null);
  const [total, setTotal] = useState(0);
  const [listError, setListError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<PopiaRequestStaffDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<PopiaRequestStatus>("submitted");
  const [resolution, setResolution] = useState("");
  const [note, setNote] = useState("");
  const [caseNote, setCaseNote] = useState("");
  const [visibility, setVisibility] = useState<PopiaEventVisibility>("internal");

  const staff = Boolean(session && session.role !== "Press");

  const loadList = useCallback(async () => {
    setListError(null);
    try {
      const result = await listCaseRequests({ status, type, assigned, q: query });
      setList(result.requests);
      setTotal(result.total);
    } catch (caught) {
      setListError(caught instanceof ApiError ? caught.message : "Could not load the queue.");
    }
  }, [status, type, assigned, query]);

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
    void getCaseRequest(selected)
      .then((result) => {
        if (!cancelled) setDetail(result.request);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setDetailError(caught instanceof ApiError ? caught.message : "Could not load the case.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    if (!detail) return;
    setNextStatus(detail.status);
    setResolution(detail.resolution ?? "");
    setNote("");
    setCaseNote("");
    setActionError(null);
  }, [detail]);

  async function applyUpdate(patch: UpdatePopiaRequestInput) {
    if (!detail) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await updateCaseRequest(detail.reference, patch);
      setDetail(result.request);
      await loadList();
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : "Could not update the request.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddNote() {
    if (!detail || !caseNote.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await addCaseNote(detail.reference, { message: caseNote, visibility });
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
            <CardTitle>Case queue is for Stats SA staff</CardTitle>
            <CardDescription>
              {session
                ? `You are signed in as ${session.role}. This area is for Staff and Admin users.`
                : "Sign in with a Staff or Admin account to work requests."}
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
              placeholder="Reference, name or email"
              aria-label="Search requests"
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>

          <div className="grid grid-cols-3 gap-2">
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Any status</option>
              {POPIA_REQUEST_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {POPIA_REQUEST_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
            <Select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="">Any right</option>
              {POPIA_REQUEST_TYPES.map((value) => (
                <option key={value} value={value}>
                  {POPIA_REQUEST_TYPE_LABELS[value]}
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
                  <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
                    <span>{POPIA_REQUEST_TYPE_LABELS[request.type]}</span>
                    <span>{duePhrase(request.dueAt, request.status)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {detailError ? (
            <Alert variant="destructive">
              <AlertTitle>Could not open the case</AlertTitle>
              <AlertDescription>{detailError}</AlertDescription>
            </Alert>
          ) : null}

          {!detail && !detailError ? (
            <div className="grid place-items-center rounded-lg border border-dashed border-border px-6 py-24 text-center">
              <p className="max-w-[36ch] text-sm leading-relaxed text-muted-foreground">
                Select a request to open its case file, change its status and record notes.
              </p>
            </div>
          ) : null}

          {detail ? (
            <>
              <RequestFile
                request={detail}
                events={detail.events}
                email={detail.requesterEmail}
                phone={detail.requesterPhone}
                assignedToEmail={detail.assignedToEmail}
              />

              <Card>
                <CardHeader>
                  <CardTitle>Case actions</CardTitle>
                  <CardDescription>
                    Move the request through its lifecycle and record the outcome.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  {actionError ? (
                    <Alert variant="destructive">
                      <AlertTitle>Update failed</AlertTitle>
                      <AlertDescription>{actionError}</AlertDescription>
                    </Alert>
                  ) : null}

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="next-status">Status</FieldLabel>
                      <Select
                        id="next-status"
                        value={nextStatus}
                        onChange={(event) =>
                          setNextStatus(event.target.value as PopiaRequestStatus)
                        }
                      >
                        {POPIA_REQUEST_STATUSES.map((value) => (
                          <option key={value} value={value}>
                            {POPIA_REQUEST_STATUS_LABELS[value]}
                          </option>
                        ))}
                      </Select>
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

                  <Field>
                    <FieldLabel htmlFor="resolution">Resolution</FieldLabel>
                    <Textarea
                      id="resolution"
                      rows={3}
                      value={resolution}
                      placeholder="What was decided and communicated to the requester?"
                      onChange={(event) => setResolution(event.target.value)}
                    />
                    <FieldDescription>
                      Required before a request can be completed or rejected.
                    </FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="note">Note with this update (optional)</FieldLabel>
                    <Input
                      id="note"
                      value={note}
                      placeholder="Shown to the requester with the status change"
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </Field>

                  <Button
                    disabled={busy}
                    onClick={() =>
                      void applyUpdate({
                        status: nextStatus,
                        resolution,
                        note: note.trim() || undefined,
                      })
                    }
                  >
                    {busy ? "Saving…" : "Save update"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Add a case note</CardTitle>
                  <CardDescription>
                    Internal notes stay in the case file. Messages are shown to the requester on the
                    tracking page.
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
                        setVisibility(event.target.value as PopiaEventVisibility)
                      }
                    >
                      <option value="internal">Internal</option>
                      <option value="requester">Visible to requester</option>
                    </Select>
                  </Field>

                  <Button
                    variant="outline"
                    disabled={busy || !caseNote.trim()}
                    onClick={() => void handleAddNote()}
                  >
                    Add note
                  </Button>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
