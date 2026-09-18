import { isTerminalStatus, type MediaRequestStatus } from "@voltedge/media-contract";

const dateFormatter = new Intl.DateTimeFormat("en-ZA", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-ZA", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(value: string | null | undefined): string {
  return value ? dateFormatter.format(new Date(value)) : "—";
}

export function formatDateTime(value: string | null | undefined): string {
  return value ? dateTimeFormatter.format(new Date(value)) : "—";
}

/** A short phrase for the journalist's deadline, once one was supplied. */
export function deadlinePhrase(
  deadline: string | null | undefined,
  status: MediaRequestStatus,
): string {
  if (!deadline) return "No deadline given";
  if (isTerminalStatus(status)) return formatDate(deadline);

  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} past deadline`;
  if (days === 0) return "Deadline today";
  if (days === 1) return "Deadline tomorrow";
  return `Deadline in ${days} days`;
}
