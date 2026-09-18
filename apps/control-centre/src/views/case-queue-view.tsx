import { useCallback, useEffect, useState, type FormEvent } from "react";

import {
  POPIA_REQUEST_STATUSES,
  POPIA_REQUEST_STATUS_LABELS,
  POPIA_REQUEST_TYPE_LABELS,
  POPIA_REQUEST_TYPES,
  type PopiaRequestStaff,
  type PopiaRequestStatus,
} from "@voltedge/popia-contract";
import { Alert, AlertDescription, AlertTitle, Button, Input, Spinner } from "@voltedge/ui";
import { ApiError, StatusBadge, duePhrase, listCaseRequests } from "@voltedge/popia-ui";

import { Select } from "../components/select.tsx";

export function CaseQueueView() {
  const [status, setStatus] = useState<PopiaRequestStatus | "">("");
  const [type, setType] = useState("");
  const [assigned, setAssigned] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const [list, setList] = useState<PopiaRequestStaff[] | null>(null);
  const [total, setTotal] = useState(0);
  const [listError, setListError] = useState<string | null>(null);

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
    void loadList();
  }, [loadList]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(search.trim());
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
            POPIA desk
          </span>
          <h1 className="font-heading text-2xl font-medium">Case queue</h1>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
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
      </div>

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
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value as PopiaRequestStatus | "")}
        >
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
            <a
              key={request.reference}
              href={`/cases/${request.reference}`}
              className="flex w-full flex-col gap-1.5 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {request.reference}
                </span>
                <StatusBadge status={request.status} />
              </div>
              <span className="line-clamp-2 text-sm leading-relaxed font-medium">
                {POPIA_REQUEST_TYPE_LABELS[request.type]}
              </span>
              <span className="text-xs text-muted-foreground">{request.requesterName}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {duePhrase(request.dueAt, request.status)}
              </span>
            </a>
          ))
        )}
      </div>
    </section>
  );
}
