import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";

import {
  POPIA_REQUEST_STATUSES,
  POPIA_REQUEST_STATUS_LABELS,
  isTerminalStatus,
  type PopiaEventVisibility,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@voltedge/ui";
import {
  ApiError,
  RequestFile,
  RequestTimeline,
  addCaseNote,
  getCaseRequest,
  updateCaseRequest,
} from "@voltedge/popia-ui";

import { Select } from "../components/select.tsx";
import { useSession } from "../lib/session.tsx";

export function CaseRequestView({ reference }: { reference: string }) {
  const { session } = useSession();

  const [detail, setDetail] = useState<PopiaRequestStaffDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<PopiaRequestStatus>("submitted");
  const [resolution, setResolution] = useState("");
  const [note, setNote] = useState("");
  const [caseNote, setCaseNote] = useState("");
  const [visibility, setVisibility] = useState<PopiaEventVisibility>("internal");

  const load = useCallback(async () => {
    setDetailError(null);
    try {
      const result = await getCaseRequest(reference);
      setDetail(result.request);
    } catch (caught) {
      setDetailError(caught instanceof ApiError ? caught.message : "Could not load the case.");
    }
  }, [reference]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const caseFile = detail ? (
    <RequestFile
      request={detail}
      email={detail.requesterEmail}
      phone={detail.requesterPhone}
      assignedToEmail={detail.assignedToEmail}
    />
  ) : null;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button variant="ghost" size="sm" nativeButton={false} render={<a href="/" />}>
          <ArrowLeft />
          Case queue
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void load()}
          aria-label="Refresh case"
        >
          <RefreshCw />
          Refresh
        </Button>
      </div>

      {detailError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not open the case</AlertTitle>
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
              {caseFile}
              <RequestTimeline events={detail.events} />
            </div>
          ) : (
            <Tabs defaultValue="case">
              <TabsList className="w-full">
                <TabsTrigger value="case">Case file</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="manage">Manage</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
              </TabsList>

              <TabsContent value="case">{caseFile}</TabsContent>

              <TabsContent value="timeline">
                <RequestTimeline events={detail.events} />
              </TabsContent>

              <TabsContent value="manage">
                <Card>
                  <CardHeader>
                    <CardTitle>Update the case</CardTitle>
                    <CardDescription>
                      Move the request through its lifecycle and record the outcome.
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
                      variant="outline"
                      className="self-start"
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
              </TabsContent>

              <TabsContent value="notes">
                <Card>
                  <CardHeader>
                    <CardTitle>Add a case note</CardTitle>
                    <CardDescription>
                      Internal notes stay in the case file. Messages are shown to the requester on
                      the tracking page.
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
    </section>
  );
}
